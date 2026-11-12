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
    const systemPrompt = `Você é o Cérebro Digital do Projeto RTA, assistente inteligente desenvolvido pela consultoria Tscope para a RTA Engenharia.
Responda diretamente ao usuário em português brasileiro.

REGRAS OBRIGATÓRIAS:
- NUNCA mostre raciocínio em inglês, chain-of-thought, anotações de planejamento ou meta-comentários como "User says...", "Context...", "Goal...".
- Entregue SEMPRE E APENAS a resposta final direta ao colaborador ou diretor.
- Responda em tom executivo, cordial, prestativo e profissional.
- Se o usuário disser apenas uma saudação (como "Boa noite", "Olá", "Tudo bem?"), cumprimente-o cordialmente em português e se coloque à disposição para tirar dúvidas sobre o projeto RTA, processos, automações, Omie, Cobli, etc.
- Baseie suas respostas nas informações do projeto: 26 departamentos/contratos, 225 processos mapeados, 18 cadernos departamentais, Marcos Comerciais G01-G10 e Técnicos M01-M18.

BASE DO PROJETO RTA:
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

    const contents = [];

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
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: contents,
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048
      }
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

        const prioritized = available.sort((a, b) => {
          if (a.includes('flash') && !b.includes('flash')) return -1;
          if (!a.includes('flash') && b.includes('flash')) return 1;
          return 0;
        });

        for (const mName of prioritized) {
          const ep = `https://generativelanguage.googleapis.com/v1beta/models/${mName}:generateContent?key=${apiKey}`;
          const r = await fetch(ep, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload
          });
          const resJson = await r.json();
          if (r.ok && resJson.candidates?.[0]?.content?.parts) {
            const parts = resJson.candidates[0].content.parts;
            const textPart = parts.reverse().find(p => p.text && !p.thought);
            if (textPart && textPart.text) {
              reply = textPart.text.trim();
              break;
            }
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
            if (r.ok && resJson.candidates?.[0]?.content?.parts) {
              const parts = resJson.candidates[0].content.parts;
              const textPart = parts.reverse().find(p => p.text && !p.thought);
              if (textPart && textPart.text) {
                reply = textPart.text.trim();
                break;
              }
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
        error: `Não foi possível gerar conteúdo. Detalhe: ${lastError}`
      });
    }

    if (reply.startsWith('- User says:') || reply.startsWith('* User says:')) {
      const splitIdx = reply.indexOf('\n\n');
      if (splitIdx !== -1) {
        reply = reply.substring(splitIdx).trim();
      }
    }

    return res.status(200).json({ reply });
  } catch (error) {
    console.error("Erro interno:", error);
    return res.status(500).json({ error: error.message });
  }
};
