# Cérebro Digital do Projeto RTA (Tscope × RTA Engenharia)

Aplicação Web Serverless com **IA Interativa (Google Gemini 1.5 Flash)** pronta para deploy na **Vercel**.

Permite que diretores, gerentes e colaboradores da **RTA Engenharia** façam perguntas em linguagem natural e recebam respostas precisas e executivas fundamentadas no:
* **Relatório Técnico Consolidado v122** (1.124 páginas, 26 departamentos e contratos regionais);
* **Relatório Interativo v120** (análise profunda de gargalos, dores operacionais e fluxos);
* **18 Cadernos Departamentais** (M01 a M18, com gestores responsáveis e processos vinculados);
* **10 Marcos Comerciais** (G01 a G10) e os **225 Processos Operacionais Mapeados** (P01 a P225);
* **Integrações de Sistemas**: ERP Omie, telemetria Cobli, SEI, SINFRALOG, SGE, AGETO, SEDUC e DNIT.

---

## 🚀 Como Fazer o Deploy na Vercel (Em 2 Minutos)

### Opção 1: Via Linha de Comando (CLI da Vercel)
1. Abra o terminal na pasta `cerebro-rta-app`:
   ```bash
   cd cerebro-rta-app
   ```
2. Instale a CLI da Vercel (caso ainda não tenha) e faça login:
   ```bash
   npx vercel login
   ```
3. Execute o comando de deploy:
   ```bash
   npx vercel
   ```
4. Durante a configuração no terminal, confirme as opções padrão.
5. Quando o projeto for criado, adicione a variável de ambiente da API do Google Gemini:
   ```bash
   npx vercel env add GEMINI_API_KEY
   ```
   *(Cole a sua chave de API do Google AI Studio / Gemini)*
6. Promova para produção:
   ```bash
   npx vercel --prod
   ```

---

### Opção 2: Via Painel Web da Vercel (GitHub)
1. Crie um repositório no seu GitHub (público ou privado) e suba os arquivos desta pasta `cerebro-rta-app`:
   ```bash
   git init
   git add .
   git commit -m "Deploy Cérebro RTA IA"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/cerebro-rta-app.git
   git push -u origin main
   ```
2. Acesse [vercel.com](https://vercel.com) e clique em **"Add New..." ➔ "Project"**.
3. Importe o repositório `cerebro-rta-app`.
4. Em **Environment Variables**, adicione:
   * **Key**: `GEMINI_API_KEY`
   * **Value**: *(Sua chave da API do Gemini)*
5. Clique em **Deploy**! Em cerca de 30 segundos sua URL oficial estará no ar (ex: `https://cerebro-rta.vercel.app`).

