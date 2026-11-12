const fs = require('fs');
const path = require('path');

// Carregar a base de conhecimento consolidada
let knowledgeBase = null;
try {
  const kbPath = path.join(process.cwd(), 'knowledge_base_master.json');
  if (fs.existsSync(kbPath)) {
    knowledgeBase = JSON.parse(fs.readFileSync(kbPath, 'utf8'));
  }
} catch (e) {
  console.error("Erro ao carregar base de conhecimento:", e);
}

module.exports = async (req, res) => {
  // CORS
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
    // Montar o Prompt de Sistema com todo o contexto do projeto RTA
    const systemPrompt = `Você é o CÉREBRO DIGITAL DO PROJETO RTA, a Inteligência Artificial Oficial da Consultoria Tscope no diagnóstico e transformação operacional da RTA Engenharia.
Sua missão é responder com precisão técnica, clareza, empatia executiva e autoridade a qualquer colaborador ou diretor da RTA sobre:
1. O RELATÓRIO TÉCNICO CONSOLIDADO v122 (1.124 páginas, versão final homologada em Outubro/2026, com diagnóstico integral de 26 departamentos e contratos regionais).
2. O RELATÓRIO INTERATIVO v120 (análise de gargalos, dores operacionais, fluxos e priorização).
3. OS 18 CADERNOS DEPARTAMENTAIS (M01 a M18, com gestores responsáveis, cargos, fatias de páginas e processos específicos).
4. OS 10 MARCOS COMERCIAIS (G01 a G10) e os 225 PROCESSOS OPERACIONAIS MAPEADOS (P01 a P225).
5. INTEGRAÇÕES SISTÊMICAS: ERP Omie (financeiro, compras, medições de contratos), telemetria Cobli (frotas e abastecimentos), sistemas governamentais SEI, SINFRALOG, SGE, além de AGETO, SEDUC e DNIT (MT e GO).

DIRETRIZES DE RESPOSTA:
- Responda sempre em português brasileiro de forma executiva, objetiva, estruturada (use listas com marcadores e negritos).
- Sempre cite explicitamente o Marco Técnico (ex: M04 - Financeiro), o Caderno correspondente, o Gestor da área (se aplicável) e as páginas ou processos relacionados (ex: P01-82, Cobli, Omie).
- Demonstre domínio profundo das dores relatadas nas entrevistas e mostre como a solução da Tscope resolve o problema no dia a dia do colaborador.

DADOS MESTRES DO PROJETO:
${JSON.stringify({
  projeto: knowledgeBase ? knowledgeBase.projeto_info : {},
  marcos_comerciais: knowledgeBase ? knowledgeBase.marcos_comerciais : {},
  marcos_tecnicos: knowledgeBase ? knowledgeBase.marcos_tecnicos : {},
  cadernos: knowledgeBase ? knowledgeBase.cadernos_departamentais : [],
  departamentos_paginas_v122: knowledgeBase ? knowledgeBase.relatorio_v122_departamentos_e_paginas : []
}, null, 1)}
`;

    // Chamada à API REST do Google Gemini 1.5 Flash (sem dependências pesadas, compatível com Vercel Serverless)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    // Construir histórico de mensagens
    const contents = [
      {
        role: "user",
        parts: [{ text: systemPrompt + "\n\nEntendido? Responda confirmando que você é o Cérebro do Projeto RTA." }]
      },
      {
        role: "model",
        parts: [{ text: "Entendido perfeitamente. Sou o Cérebro Digital do Projeto RTA, pronto para tirar dúvidas de todos os colaboradores com base no Relatório Consolidado v122, no Relatório Interativo v120, nos 18 Cadernos Departamentais e nos 225 processos mapeados." }]
      }
    ];

    if (Array.isArray(history)) {
      history.slice(-8).forEach(h => {
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

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: contents,
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2048
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Erro na API do Gemini:", data);
      return res.status(500).json({
        error: data.error?.message || "Erro ao consultar a API do Gemini."
      });
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Desculpe, não consegui formular uma resposta no momento.";

    return res.status(200).json({ reply });
  } catch (error) {
    console.error("Erro interno:", error);
    return res.status(500).json({ error: error.message });
  }
};

