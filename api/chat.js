const fs = require('fs');
const path = require('path');

// Carregar base de conhecimento enriquecida
let knowledgeBase = null;
try {
  const possiblePaths = [
    path.join(__dirname, 'knowledge_base_master.json'),
    path.join(__dirname, '..', 'knowledge_base_master.json'),
    path.join(process.cwd(), 'api', 'knowledge_base_master.json'),
    path.join(process.cwd(), 'knowledge_base_master.json')
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      knowledgeBase = JSON.parse(fs.readFileSync(p, 'utf8'));
      break;
    }
  }
} catch (e) {
  console.error("Erro ao carregar base de conhecimento:", e);
}

const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || "102030";
const RTA_PORTAL_URL = 'https://tscope.com.br/api/integrations/rta/projects';
const PORTAL_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

let portalCache = {
  data: null,
  fetchedAt: 0
};

/**
 * Busca e compacta os dados de cronograma, marcos e atualizações do portal tscope.com.br.
 * Usa cache em memória de 5 minutos para manter respostas rápidas e atualizadas.
 */
async function fetchRtaPortalData() {
  const integrationKey = process.env.RTA_INTEGRATION_API_KEY;
  if (!integrationKey) return null;

  const now = Date.now();
  if (portalCache.data && (now - portalCache.fetchedAt) < PORTAL_CACHE_TTL_MS) {
    return portalCache.data;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const resp = await fetch(RTA_PORTAL_URL, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${integrationKey}`,
        'Accept': 'application/json'
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      console.warn(`Portal RTA retornou status ${resp.status}`);
      return portalCache.data;
    }

    const raw = await resp.json();
    const projects = Array.isArray(raw?.projects) ? raw.projects : [];

    const compacted = {
      referenceDate: raw?.referenceDate || null,
      projects: projects.map(p => {
        const groupMap = {};
        (p.groups || []).forEach(g => {
          if (g && g.id) groupMap[g.id] = g.name;
        });

        const tasks = (p.tasks || [])
          .filter(t => !t.deleted)
          .map(t => ({
            grupo: groupMap[t.groupId] || null,
            nome: t.name,
            responsavel: t.owner || null,
            inicioPrevisto: t.plannedStart || null,
            fimPrevisto: t.plannedEnd || null,
            inicioReal: t.actualStart || null,
            fimReal: t.actualEnd || null,
            progresso: t.progress ?? 0,
            status: t.status || null,
            marcos: (t.measurement?.milestones || []).map(m => ({
              nome: m.name,
              peso: m.weight,
              aceito: !!m.accepted,
              aceitoEm: m.acceptedAt || null
            }))
          }));

        const events = (p.events || []).slice(0, 10).map(e => ({
          data: e.created_at || null,
          tipo: e.kind || null,
          titulo: e.title || null,
          descricao: e.body || null,
          autor: e.actor || null
        }));

        return {
          codigo: p.projectCode,
          nome: p.projectName,
          status: p.status,
          inicio: p.projectStart,
          fim: p.projectEnd,
          atualizadoEm: p.updatedAt,
          tarefas: tasks,
          atualizacoesRecentes: events
        };
      })
    };

    portalCache = { data: compacted, fetchedAt: now };
    return compacted;
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn("Falha ao consultar portal RTA:", err.message);
    return portalCache.data;
  }
}

// Modelos modernos da família Gemini com suporte ativo no Free Tier do Google AI Studio
const CANDIDATE_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
  'gemini-3.8-flash'
];

/**
 * Monta o contexto estratégico do Projeto RTA a partir do conhecimento mapeado,
 * garantindo enriquecimento com os 225 processos, marcos M e G, integrações e dores.
 */
function buildEnrichedProjectContext(kb) {
  if (!kb) return {};

  return {
    projeto: {
      titulo: "Relatório Técnico Consolidado de Engenharia de Processos & Transformação Digital 4.0",
      cliente: "RTA Engenheiros Consultores",
      consultoria: "TSCOPE - Consultoria e Tecnologia",
      abrangencia: "26 Departamentos Corporativos e Contratos Regionais (SINFRA-MT, DNIT-MT, DNIT-GO, AGETO, SEDUC, SEOSP, DER-MG, AGEHAB e Consórcio 3S)",
      total_processos: 225,
      total_paginas: 1124,
      total_cadernos: 18,
      marcos_comerciais: "G01 a G10",
      marcos_tecnicos: "M01 a M18",
      integracoes_homologadas: [
        "ERP Omie (Sincronização bidirecional de compras, financeiro, medições e contratos sem redigitação)",
        "Cobli Telemetria (Cruzamento automático de abastecimentos, consumo, quilometragem e manutenção)",
        "Microsoft 365 / SharePoint Lists / Power Platform (Esteiras de aprovação com Poka-Yokes e assinaturas)",
        "Sistemas Públicos e SEI (Acompanhamento e auditoria de contratos rodoviários federais e estaduais)"
      ]
    },
    marcos_comerciais: kb.marcos_comerciais || {},
    marcos_tecnicos: kb.marcos_tecnicos || {},
    cadernos_departamentais: kb.cadernos_departamentais || [],
    departamentos_atendidos: kb.relatorio_v122_departamentos_e_paginas || [],
    servicos_estruturados: kb.servicos || [],
    processos_mapeados: kb.processos || {}
  };
}

/**
 * Resposta de fallback estruturada caso todas as cotas da API externa do Google estejam esgotadas.
 */
function fallbackLocalAnswer(query, kb) {
  if (!kb) return "Assistente temporariamente indisponível. Por favor, tente novamente em alguns instantes.";
  const q = (query || "").toLowerCase();

  // 1. Consulta por Marco Técnico M01 - M18
  const mMatch = q.match(/m0?[1-9]|m1[0-8]/i);
  if (mMatch) {
    const raw = mMatch[0].toUpperCase();
    const mCode = raw.length === 2 ? `M0${raw[1]}` : raw;
    const mData = kb.marcos_tecnicos?.[mCode];
    if (mData) {
      const gData = kb.marcos_comerciais?.[mData.marco_comercial] || {};
      const servs = (kb.servicos || []).filter(s => s.marco_tecnico === mCode);
      let r = `### 📌 Marco Técnico ${mCode} – ${mData.nome}\n\n`;
      r += `O **${mCode}** é a entrega técnica homologável alocada no departamento de **${mData.departamento}**, vinculado ao **${mData.marco_comercial} (${gData.nome || ''})**.\n\n`;
      if (servs.length > 0) {
        r += `#### 🛠️ Pacotes de Serviços e Entregáveis Estruturados (${servs.length} serviços):\n`;
        servs.forEach(s => {
          r += `- **${s.servico}**: ${s.detalhe} *(Processos atendidos: ${s.processos ? s.processos.join(', ') : 'Mapeados'})*\n`;
        });
      }
      return r;
    }
  }

  // 2. Consulta por Marco Comercial G01 - G10
  const gMatch = q.match(/g0?[1-9]|g10/i);
  if (gMatch) {
    const raw = gMatch[0].toUpperCase();
    const gCode = raw.length === 2 ? `G0${raw[1]}` : raw;
    const gData = kb.marcos_comerciais?.[gCode];
    if (gData) {
      let r = `### 💼 Marco Comercial ${gCode} – ${gData.nome}\n\n`;
      r += `O agrupamento comercial **${gCode}** abrange os seguintes marcos técnicos e departamentos:\n\n`;
      (gData.marcos_tecnicos || []).forEach(m => {
        const mObj = kb.marcos_tecnicos?.[m];
        r += `- **${m}**: ${mObj ? mObj.nome : ''} *(Área: ${mObj ? mObj.departamento : ''})*\n`;
      });
      return r;
    }
  }

  // 3. Omie, Cobli ou DNIT
  if (q.includes('omie')) {
    return `### 🔗 Integrações Homologadas com o ERP Omie\n\nA consultoria estruturou a integração direta com o ERP Omie eliminando 100% da redigitação e controles paralelos (Shadow IT):\n- **Financeiro & Contas a Pagar (M04 / G01):** Conexão automatizada para sincronização de notas fiscais validadas, conciliação bancária e baixa sem intervenção manual.\n- **Compras & Suprimentos (M03 / G02):** Sincronismo de Ordens de Compra e cadastro de fornecedores aprovados.\n- **Medições & Contratos (M07 / G04):** Emissão e vínculo automático de Notas Fiscais de Medição protocoladas no cliente diretamente no faturamento do Omie.`;
  }
  if (q.includes('cobli') || q.includes('frota') || q.includes('veiculo') || q.includes('combustivel')) {
    return `### 🚗 Telemetria Cobli & Gestão de Frotas (Marco M06)\n\nNo **Marco Técnico M06 (Frota e Patrimônio)**, as soluções desenhadas pela TSCOPE para a RTA abrangem:\n- **Cruzamento Inteligente de Abastecimentos:** Confronto diário automatizado entre os extratos de cartões de combustível e a quilometragem/odômetro da telemetria Cobli.\n- **Auditoria de Desvios de Consumo:** Painéis executivos com indicadores de litros/km, alertas de velocidade e identificação de anomalias.\n- **Checklist de Canteiro e Transferências:** Formulário digital padronizado para entrega, vistoria e devolução de veículos entre obras.`;
  }

  return `### ℹ️ Consulta sobre o Projeto RTA\n\nO projeto de Engenharia de Processos e Transformação 4.0 conduzido pela TSCOPE para a RTA Engenharia compreende **26 departamentos e contratos regionais**, **225 processos mapeados**, **18 Cadernos Departamentais (M01 a M18)** e **10 Marcos Comerciais (G01 a G10)**.\n\nVocê pode me perguntar sobre qualquer marco técnico (ex: *M01* a *M18*), marco comercial (ex: *G01* a *G10*), departamentos específicos (*Compras, Financeiro, Frota, DNIT, SINFRA*) ou sobre as integrações com *Omie* e *Cobli*.`;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  const { message, history, password } = req.body || {};

  // Validação de Senha de Acesso
  if (!password || password !== ACCESS_PASSWORD) {
    return res.status(401).json({ error: 'Acesso não autorizado. Senha incorreta.' });
  }

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Mensagem vazia.' });
  }

  const userQuery = message.trim();
  const apiKey = process.env.GEMINI_API_KEY;

  // Se não houver chave configurada, responder com o conhecimento local estruturado
  if (!apiKey) {
    const answer = fallbackLocalAnswer(userQuery, knowledgeBase);
    return res.status(200).json({ reply: answer });
  }

  try {
    const [projectContext, portalData] = await Promise.all([
      Promise.resolve(buildEnrichedProjectContext(knowledgeBase)),
      fetchRtaPortalData()
    ]);

    const portalSection = portalData
      ? `\nCRONOGRAMA, MARCOS E ATUALIZAÇÕES EM TEMPO REAL (PORTAL DO CLIENTE - DATA DE REFERÊNCIA: ${portalData.referenceDate || 'atual'}):\nUse estes dados ao vivo para responder perguntas sobre datas, prazos, progresso, responsáveis, marcos aceitos/pendentes e atualizações recentes dos projetos G01 a G10:\n${JSON.stringify(portalData)}\n`
      : '';

    const systemPrompt = `Você é o Cérebro Digital do Projeto RTA, assistente inteligente desenvolvido pela consultoria TSCOPE para a RTA Engenharia.
Responda diretamente em português brasileiro aos diretores, gerentes técnicos e colaboradores da RTA Engenharia.

DIRETRIZES FUNDAMENTAIS DE SIGILO INDUSTRIAL E PRIVACIDADE DA TSCOPE:
1. SIGILO ABSOLUTO SOBRE FERRAMENTAS E PROCESSOS INTERNOS DA TSCOPE:
   - NUNCA mencione nenhuma ferramenta interna, bastidor técnico, software de IA generativa (como ChatGPT, Claude, OpenAI, Copilot, Gemini CLI, Cursor, Python scripts internos, IDEs, prompts ou pipelines) utilizados pela TSCOPE na confecção de relatórios, códigos ou análises.
   - Jamais divulgue comentários internos, reuniões preliminares de equipe ou metodologias confidenciais de trabalho interno da consultoria.
   - Para o cliente, tudo é fruto formal da metodologia de "Engenharia de Processos Lean, Notação Internacional BPMN 2.0, Cronoanálise DMAIC e Governança Corporativa 4.0" homologada pela TSCOPE.

2. FOCO ESTRITO NO PROJETO RTA E EM SEUS RESULTADOS:
   - Responda sempre pautado nos resultados práticos, governança, prazos, entregáveis dos 18 Cadernos Departamentais e segurança operacional.
   - Destaque os benefícios para a RTA: eliminação de retrabalho e digitação dupla, redução de glosas em medições públicas, conformidade fiscal/tributária, travas Poka-Yoke e controle de custos.
   - Seja capaz de responder a dúvidas técnicas e executivas avançadas com precisão e clareza.

3. TOM E CONDUTA:
   - Mantenha tom executivo, consultivo, cordial, objetivo e altamente profissional.
   - Formate suas respostas utilizando títulos (H3, H4), listas organizadas e destaque em negrito para termos técnicos chave.
   - NUNCA mostre cadeia de pensamento, notas de planejamento ("User says...", "Drafting response...", etc.) ou rascunhos.

BASE OFICIAL DE CONHECIMENTO DO PROJETO RTA:
${JSON.stringify(projectContext, null, 1)}
${portalSection}`;

    const contents = [];

    // Histórico recente para continuidade de diálogo
    if (Array.isArray(history)) {
      history.slice(-6).forEach(h => {
        if (h && h.text) {
          contents.push({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.text }]
          });
        }
      });
    }

    contents.push({
      role: "user",
      parts: [{ text: userQuery }]
    });

    const payload = JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: contents,
      generationConfig: {
        temperature: 0.25,
        maxOutputTokens: 2048,
        thinkingConfig: {
          thinkingBudget: 0
        }
      }
    });

    let reply = null;
    let lastError = null;

    // Tentativa em cascata pelos modelos modernos suportados no Google AI Studio
    for (const mName of CANDIDATE_MODELS) {
      const ep = `https://generativelanguage.googleapis.com/v1beta/models/${mName}:generateContent?key=${apiKey}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7500);

      try {
        const r = await fetch(ep, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        const resJson = await r.json();
        if (r.ok && resJson.candidates?.[0]?.content?.parts) {
          const parts = resJson.candidates[0].content.parts;
          const textPart = parts.reverse().find(p => p.text && !p.thought);
          if (textPart && textPart.text && textPart.text.trim()) {
            reply = textPart.text.trim();
            break;
          }
        } else if (resJson.error) {
          lastError = resJson.error.message;
        }
      } catch (err) {
        clearTimeout(timeoutId);
        lastError = err.message;
      }

      if (reply) break;
    }

    // Se a API externa do Google estiver temporariamente com cota esgotada (429) ou instável (503),
    // acionamos o fallback inteligente local sobre a base RTA sem deixar o cliente sem resposta
    if (!reply) {
      console.warn("API Gemini indisponível ou em pico de cota. Ativando fallback inteligente local.", lastError);
      reply = fallbackLocalAnswer(userQuery, knowledgeBase);
    }

    // Limpeza de segurança de eventuais prefixos residuais
    if (reply.startsWith('- User says:') || reply.startsWith('* User says:')) {
      const splitIdx = reply.indexOf('\n\n');
      if (splitIdx !== -1) {
        reply = reply.substring(splitIdx).trim();
      }
    }

    return res.status(200).json({ reply });
  } catch (error) {
    console.error("Erro interno no chat:", error);
    const safeFallback = fallbackLocalAnswer(userQuery, knowledgeBase);
    return res.status(200).json({ reply: safeFallback });
  }
};
