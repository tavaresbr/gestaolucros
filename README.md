# Gestão Lucros — Organize. Gerencie. Lucre.

Plataforma para gerenciar serviços, equipes, ordens de serviço e resultados financeiros.

Módulos: Dashboard, Agendamentos, Ordens de Serviço, Clientes, Equipes, Financeiro, Relatórios (export CSV) e Configurações (backup JSON).

## Como usar
Abra `index.html` no navegador (sem build nem dependências). Os dados ficam no `localStorage`; começam com dados de exemplo.

Marca: Azul `#2563EB`, Verde `#10B981`, Azul escuro `#0B1F44`, Cinza claro `#F8FAFC` — fonte Montserrat.

## WhatsApp, cobrança e lembretes
- **Regras** (Configurações): antecedência do lembrete de agendamento, aviso de vencimento, cobrança após X dias de atraso e intervalo de reenvio; modelos de mensagem editáveis com variáveis (`{cliente} {servico} {data} {os} {valor} {vencimento} {pix} {empresa}`).
- **Fila** (aba WhatsApp): mensagens geradas pelas regras; o botão abre o WhatsApp (`wa.me`) com o texto pronto e registra o envio no histórico.
- **Chat**: histórico por cliente e modelos rápidos. Respostas dos clientes ficam no WhatsApp; chat bidirecional e envio automático exigem a API oficial do WhatsApp Business + backend.
- Ordens de serviço têm vencimento e pagamento; "Receber" lança a receita e oferece agradecimento.
