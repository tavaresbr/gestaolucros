# Gestão Lucros — Plano SaaS

> Organize. Gerencie. Lucre. — plataforma multiempresa para prestadores de serviço (agenda, ordens de serviço, equipes, financeiro, WhatsApp).

Status: **proposta para validação**. Valores de planos e prazos são hipóteses a testar com clientes reais.

## 1. O que muda de "app" para "SaaS"

| Hoje (protótipo) | SaaS |
|---|---|
| Dados no `localStorage` do navegador | Banco central (Postgres), isolado por empresa (tenant) |
| Sem login | Cadastro, login, papéis e convites de equipe |
| 1 servidor, 1 número de WhatsApp (`.env`) | 1 instância Evolution por empresa, conectada pelo QR Code dela |
| Regras rodam quando o usuário abre a tela | Agendador no servidor roda as regras 24h |
| Sem cobrança | Assinatura recorrente, trial, limites por plano, bloqueio por inadimplência |

## 2. Arquitetura alvo

```
Navegador (app atual, trocando localStorage por API)
      │ HTTPS + JWT
      ▼
Supabase: Auth + Postgres (RLS por tenant) + Storage
      ▲                         ▲
      │                         │ webhooks
Servidor Node (worker) ─────────┴── Gateway de pagamento
  • agendador de regras (cron)
  • fila de envio (outbox) com limites e intervalo
  • webhook Evolution → identifica a empresa pela instância
  • webhook de cobrança → atualiza assinatura
      │
      ▼
Evolution API (instância `t_<tenant_id>` por empresa)
```

Decisões-chave:
- **Multi-tenant por coluna** `tenant_id` em todas as tabelas + **Row Level Security**: mesmo com bug no app, uma empresa nunca lê dados de outra.
- **`apikey` da Evolution só no servidor.** O cliente nunca a vê; o servidor cria/consulta a instância da empresa.
- **Automação no servidor**, não no navegador: a regra "cobrar após 1 dia de atraso" funciona mesmo com o app fechado.
- **Fila (`outbox`)** com status (pendente, enviada, falhou), limite diário por empresa, horário comercial (ex.: 8h–19h) e intervalo aleatório entre envios.

## 3. Modelo de dados (resumo)

- `tenants` (id, nome, plano, status, trial_ate, evolution_instance, criado_em)
- `memberships` (user_id, tenant_id, papel: `owner | admin | equipe | financeiro`)
- `clients`, `teams`, `appointments`, `orders` (com `vencimento`, `pago`), `transactions` — como hoje, mais `tenant_id`
- `message_templates` e `automation_rules` (por tenant; hoje em `settings`)
- `outbox` (tenant_id, cliente, tipo, ref, texto, status, agendada_para, enviada_em, erro)
- `messages` (histórico entrada/saída, canal)
- `opt_outs` (tenant_id, telefone) — cliente que respondeu PARAR não recebe mais
- `subscriptions` (tenant_id, gateway_id, plano, status, próxima_cobrança)
- `usage_counters` (tenant_id, mês, mensagens_enviadas, usuários)
- `audit_log` (quem, o quê, quando)

## 4. Planos e limites (hipótese inicial)

| | **Start** | **Pro** | **Business** |
|---|---|---|---|
| Preço sugerido/mês | R$ 49 | R$ 99 | R$ 199 |
| Usuários | 1 | 5 | 15 |
| WhatsApp (mensagens/mês) | 150 | 1.000 | 4.000 |
| Lembretes e cobrança automáticos | — (manual) | ✔ | ✔ |
| Equipes e agenda por equipe | 1 equipe | ✔ | ✔ |
| Relatórios e exportação | básico | completo | completo + API |
| Confirmação automática ("CONFIRMO") | — | ✔ | ✔ |
| Suporte | e-mail | e-mail + chat | prioritário |

- Trial de 14 dias do Pro, sem cartão.
- Mensagens extras vendidas em pacotes (ex.: +500 por R$ 29).
- Teto de mensagens protege a margem e reduz risco de spam/bloqueio.
- Ao exceder o limite: avisar em 80% e 100%; bloquear só o envio, nunca o acesso aos dados.
- Inadimplência: aviso → 7 dias → modo somente leitura → exportação garantida (LGPD).

## 5. Roadmap

**Fase 0 — Decisões (1 semana):** stack, gateway de pagamento, nome/domínio, política de WhatsApp (ver §7).

**Fase 1 — Fundação SaaS (3–4 semanas):**
Supabase com Auth e RLS; cadastro de empresa + primeiro usuário; convite de equipe e papéis; migrar os CRUDs de `localStorage` para o banco; migração dos dados de teste. *Pronto quando:* duas empresas de teste não enxergam os dados uma da outra (teste automatizado de isolamento).

**Fase 2 — WhatsApp por empresa + automação (3 semanas):**
Criar instância Evolution por empresa; QR Code no onboarding; webhook que resolve a empresa pela instância; agendador de regras + `outbox` com horário comercial, limites e opt-out; confirmação automática. *Pronto quando:* lembrete e cobrança saem sozinhos com o app fechado.

**Fase 3 — Planos e cobrança (2–3 semanas):**
Checkout e assinatura recorrente; webhooks do gateway; trial; limites e contadores de uso; tela "Meu plano"; bloqueios e avisos. *Pronto quando:* upgrade, downgrade, cancelamento e inadimplência funcionam ponta a ponta no ambiente de teste do gateway.

**Fase 4 — Pronto para o público (2 semanas):**
Landing page e preços; onboarding guiado (empresa → número → primeiro cliente); termos de uso, privacidade e consentimento (LGPD); e-mails transacionais; backups; monitoramento de erros.

**Fase 5 — Beta e lançamento (4+ semanas):**
5–10 empresas piloto; ajustar regras e mensagens com dados reais; medir ativação, MRR e churn; só depois abrir cadastro público.

## 6. Métricas

Ativação (cadastrou → conectou WhatsApp → enviou 1ª cobrança, em 7 dias) · MRR · churn mensal · mensagens por empresa · taxa de confirmação de agendamentos · valor cobrado/recuperado pelo sistema (argumento de venda: "o app se paga").

## 7. Riscos

1. **Bloqueio de números (alto).** A Evolution (WhatsApp não oficial) pode ter o número banido, e num SaaS isso vira problema do cliente e do seu suporte. Mitigar: limites e intervalos, só mensagens a clientes existentes, opt-out, aviso claro nos termos. Para clientes que exigem estabilidade, oferecer a **WhatsApp Cloud API oficial** como plano superior.
2. **LGPD.** Dados de clientes finais das empresas: o SaaS é operador; precisa de contrato, política, exportação e exclusão de dados.
3. **Custo de infraestrutura** por instância Evolution (RAM): dimensionar antes de vender muito.
4. **Dependência de um gateway** de pagamento: isolar atrás de uma camada simples para poder trocar.

## 8. Decisões pendentes

1. Stack: **Supabase + servidor Node** (recomendado: já existe Auth/RLS/Postgres pronto) ou Postgres próprio.
2. Gateway: **Asaas** (PIX, boleto e cartão, recorrência, foco Brasil — recomendado), Stripe ou Mercado Pago.
3. Quem hospeda a Evolution: você (um servidor central, mais simples) ou cada cliente traz a sua (mais complexo).
4. Preços: validar a tabela do §4 com 5–10 potenciais clientes antes da Fase 3.
