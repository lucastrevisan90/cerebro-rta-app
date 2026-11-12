const fs = require('fs');
const path = require('path');

let knowledgeBase = null;
try {
  const kbPath = path.join(process.cwd(), 'api', 'knowledge_base_master.json');
  const fallbackPath = path.join(process.cwd(), 'knowledge_base_master.json');
  if (fs.existsSync(kbPath)) {
    knowledgeBase = JSON.parse(fs.readFileSync(kbPath, 'utf8'));
  } else if (fs.existsSync(fallbackPath)) {
    knowledgeBase = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
  }
} catch (e) {
  console.error("Erro ao carregar base de conhecimento:", e);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  const { message, history } = req.body || {};
  if (!message) {
    return res.status(400).json({ error: 'Mensagem vazia.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY não configurada nas variáveis de ambiente da Vercel.'
    });
  }

  try {
    const systemPrompt = `Você é o Assistente Especialista Oficial do Projeto RTA, desenvolvido pela consultoria Tscope.
Sua missão é responder com precisão, clareza e tom executivo a diretores, gestores e colaboradores da RTA Engenharia sobre os diagnósticos, dores levantadas, planos de ação, processos operacionais, integrações sistêmicas (Omie, Cobli, SEI) e entregáveis contratuais.

DIRETRIZES DE RESPOSTA:
- Fale com autoridade sobre as soluções da Tscope, melhorias operacionais, automações e benefícios para cada setor.
- NUNCA mencione nomes de arquivos internos como "v122 de 1124 páginas", "v120" a menos que expressamente solicitado.
- Seja objetivo, estruturado (use tópicos e negritos) e forneça respostas práticas para o dia a dia do colaborador.

BASE DE CONHECIMENTO DO PROJETO RTA:
${JSON.stringify({
  marcos_comerciais: knowledgeBase ? knowledgeBase.marcos_comerciais : {},
  marcos_tecnicos: knowledgeBase ? knowledgeBase.marcos_tecnicos : {},
  cadernos: knowledgeBase ? knowledgeBase.cadernos_departamentais : [],
  departamentos: knowledgeBase ? knowledgeBase.relatorio_v122_departamentos_e_paginas : []
}, null, 1)}
`;

    const candidateModels = [
      'gemini-1.5-flash-8b',
      'gemini-1.5-pro',
      'gemini-pro',
      'gemini-1.0-pro'
    ];

    const contents = [
      {
        role: "user",
        parts: [{ text: systemPrompt + "\n\nResponda confirmando que entendeu sua função de forma sucinta." }]
      },
      {
        role: "model",
        parts: [{ text: "Entendido perfeitamente. Sou o assistente especialista do Projeto RTA, pronto para esclarecer dúvidas sobre processos, automações, departamentos e entregas da Tscope." }]
      }
    ];

    if (Array.isArray(history)) {
      history.slice(-6).forEach(h => {
        contents.push({
          role: h.role === 'user' ? 'user' : 'model',
          parts: [{ text: h.text }]
        });
      });
    }

    contents.push({
      role: "user",
      parts: [{ text: message }]
    });

    const payload = JSON.stringify({
      contents: contents,
      generationConfig: { temperature: 0.2, maxOutputTokens: 2048 }
    });

    let reply = null;
    let lastError = null;

    try {
      const listResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      if (listResp.ok) {
        const listData = await listResp.json();
        const available = (listData.models || [])
          .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
          .map(m => m.name.replace('models/', ''));

        for (const mName of available) {
          const ep = `https://generativelanguage.googleapis.com/v1beta/models/${mName}:generateContent?key=${apiKey}`;
          const r = await fetch(ep, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload
          });
          const resJson = await r.json();
          if (r.ok && resJson.candidates?.[0]?.content?.parts?.[0]?.text) {
            reply = resJson.candidates[0].content.parts[0].text;
            break;
          }
        }
      }
    } catch (e) {
      console.error("Erro ao listar modelos:", e);
    }

    if (!reply) {
      for (const m of candidateModels) {
        for (const v of ['v1beta', 'v1']) {
          const ep = `https://generativelanguage.googleapis.com/${v}/models/${m}:generateContent?key=${apiKey}`;
          try {
            const r = await fetch(ep, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: payload
            });
            const resJson = await r.json();
            if (r.ok && resJson.candidates?.[0]?.content?.parts?.[0]?.text) {
              reply = resJson.candidates[0].content.parts[0].text;
              break;
            } else if (resJson.error) {
              lastError = resJson.error.message;
            }
          } catch (err) {
            lastError = err.message;
          }
        }
        if (reply) break;
      }
    }

    if (!reply) {
      return res.status(500).json({
        error: `Não foi possível gerar conteúdo. Verifique se a chave de API tem permissão de generateContent no Google AI Studio. Detalhe: ${lastError}`
      });
    }

    return res.status(200).json({ reply });
  } catch (error) {
    console.error("Erro interno:", error);
    return res.status(500).json({ error: error.message });
  }
};
