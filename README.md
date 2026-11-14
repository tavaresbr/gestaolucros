# Gestão Lucros — Organize. Gerencie. Lucre.

Plataforma para gerenciar serviços, equipes, ordens de serviço e resultados financeiros.

Módulos: Dashboard, Agendamentos, Ordens de Serviço, Clientes, Equipes, Financeiro, Relatórios (export CSV) e Configurações (backup JSON).

## Como usar
Modo simples: abra `index.html` no navegador (sem build nem dependências). Com a Evolution API: `npm start` (veja abaixo). Os dados ficam no `localStorage`; começam com dados de exemplo.

Marca: Azul `#2563EB`, Verde `#10B981`, Azul escuro `#0B1F44`, Cinza claro `#F8FAFC` — fonte Montserrat.

## WhatsApp, cobrança e lembretes
- **Regras** (Configurações): antecedência do lembrete de agendamento, aviso de vencimento, cobrança após X dias de atraso e intervalo de reenvio; modelos de mensagem editáveis com variáveis (`{cliente} {servico} {data} {os} {valor} {vencimento} {pix} {empresa}`).
- **Fila** (aba WhatsApp): mensagens geradas pelas regras; o botão abre o WhatsApp (`wa.me`) com o texto pronto e registra o envio no histórico.
- **Chat**: histórico por cliente e modelos rápidos. Respostas dos clientes ficam no WhatsApp; chat bidirecional e envio automático exigem a API oficial do WhatsApp Business + backend.
- Ordens de serviço têm vencimento e pagamento; "Receber" lança a receita e oferece agradecimento.

## Integração com a Evolution API (envio e recebimento automáticos)
`server.js` (Node 18+, sem dependências) serve o app e faz a ponte com a Evolution API, mantendo a `apikey` fora do navegador.

1. Copie `.env.example` para `.env` e preencha `EVOLUTION_URL`, `EVOLUTION_INSTANCE`, `EVOLUTION_APIKEY`, `APP_TOKEN`, `WEBHOOK_TOKEN` e `PUBLIC_URL`.
2. `npm start` e abra `http://localhost:3000`.
3. Aba **WhatsApp**: informe o `APP_TOKEN` → **Conectar (QR Code)** → **Configurar webhook**.
4. A fila passa a enviar pela API (botão por item ou **Enviar todas** com intervalo de 4–9 s). Respostas chegam pelo webhook (`/webhook/evolution`) e aparecem no chat; respostas como "CONFIRMO" mudam o próximo agendamento do cliente para **Confirmado**.

Endpoints usados na Evolution (v2): `GET /instance/connectionState/{i}`, `GET /instance/connect/{i}`, `POST /message/sendText/{i}`, `POST /webhook/set/{i}` (evento `MESSAGES_UPSERT`).

Segurança: defina `APP_TOKEN` antes de expor na internet (sem ele, qualquer pessoa com acesso ao endereço poderia enviar mensagens pelo seu número) e use HTTPS. Os dados de clientes e agendamentos continuam no navegador; o servidor guarda apenas a caixa de entrada (`data/inbox.json`).
