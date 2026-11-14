"use strict";
/* Gestão Lucros — Organize. Gerencie. Lucre. */

const $ = (s, r = document) => r.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const brl = n => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = d => d ? d.split("-").reverse().join("/") : "";
const iso = d => d.toISOString().slice(0, 10);
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

/* ---------- Armazenamento ---------- */
const KEY = "gestaolucros.v1";
const addDays = (d, n) => { const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() + n); return iso(x); };
const today = () => iso(new Date());
const diffDays = (a, b) => Math.round((new Date(a + "T12:00:00") - new Date(b + "T12:00:00")) / 864e5);
function defaultSettings() {
  return {
    empresa: "Gestão Lucros", pix: "", lembreteDias: 1, cobrancaAntes: 2, cobrancaApos: 1, reenvioDias: 7,
    templates: {
      lembrete: "Olá, {cliente}! 👋 Lembrando do seu agendamento de {servico} em {data}. Responda *CONFIRMO* ou nos avise se precisar remarcar. — {empresa}",
      cobrancaAviso: "Olá, {cliente}! Passando para lembrar que a OS #{os} ({servico}) no valor de {valor} vence em {vencimento}. {pix}Qualquer dúvida, é só chamar. — {empresa}",
      cobrancaVencida: "Olá, {cliente}. Identificamos que a OS #{os} ({servico}), de {valor}, venceu em {vencimento} e consta em aberto. {pix}Se já pagou, desconsidere e nos envie o comprovante. — {empresa}",
      agradecimento: "Olá, {cliente}! Recebemos seu pagamento da OS #{os}. Obrigado pela confiança! — {empresa}"
    }
  };
}
let db;
function seed() {
  const rnd = (a, b) => Math.round(a + Math.random() * (b - a));
  const clients = ["Mercado Bom Preço", "Clínica Vida", "Escritório Alfa", "Padaria Estrela", "Loja Central", "Hotel Horizonte"]
    .map((nome, i) => ({ id: i + 1, nome, telefone: `(11) 9${rnd(1000, 9999)}-${rnd(1000, 9999)}`, email: `contato@${nome.split(" ")[0].toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")}.com.br` }));
  const teams = [{ id: 1, nome: "Equipe Alpha", membros: "Carlos, Ana", funcao: "Instalação" }, { id: 2, nome: "Equipe Beta", membros: "Marcos, Julia", funcao: "Manutenção" }];
  const svc = ["Instalação", "Manutenção preventiva", "Reparo", "Consultoria", "Vistoria"];
  const stOrd = ["Concluído", "Concluído", "Concluído", "Em Andamento", "Pendente", "Recusado"];
  const appointments = [], orders = [], transactions = [];
  for (let i = 0; i < 120; i++) {
    const data = daysAgo(rnd(-6, 175));
    appointments.push({ id: i + 1, cliente: rnd(1, 6), servico: svc[rnd(0, 4)], data, equipe: rnd(1, 2), status: data > iso(new Date()) ? "Agendado" : (Math.random() > .1 ? "Realizado" : "Cancelado") });
  }
  for (let i = 0; i < 110; i++) {
    const status = stOrd[rnd(0, 5)];
    const valor = rnd(300, 2800), data = daysAgo(rnd(0, 175));
    const venc = addDays(data, rnd(7, 30)), pago = status === "Concluído" && (venc < daysAgo(-3) ? Math.random() > .35 : Math.random() > .8);
    orders.push({ id: i + 1, cliente: rnd(1, 6), descricao: svc[rnd(0, 4)], valor, data, vencimento: venc, pago, status });
    if (pago) transactions.push({ id: transactions.length + 1, descricao: `OS #${i + 1}`, tipo: "Receita", valor, data });
  }
  ["Combustível", "Salários", "Materiais", "Aluguel", "Ferramentas"].forEach((d, k) => {
    for (let m = 0; m < 6; m++) transactions.push({ id: transactions.length + 1, descricao: d, tipo: "Despesa", valor: rnd(500, 2200) / (k === 1 ? 1 : 2), data: daysAgo(m * 30 + rnd(0, 20)) });
  });
  [1, 2, 3].forEach(k => appointments.push({ id: 500 + k, cliente: rnd(1, 6), servico: svc[rnd(0, 4)], data: daysAgo(-1), equipe: rnd(1, 2), status: "Agendado" }));
  return { clients, teams, appointments, orders, transactions, messages: [], settings: defaultSettings(), seq: 1000 };
}
function load() {
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch { db = null; }
  if (!db) { db = seed(); save(); }
  // migração de dados salvos por versões anteriores
  db.messages ||= []; db.settings ||= defaultSettings();
  db.settings.templates = { ...defaultSettings().templates, ...db.settings.templates };
  db.settings = { ...defaultSettings(), ...db.settings };
  db.orders.forEach(o => { if (o.vencimento == null) o.vencimento = addDays(o.data, 15); if (o.pago == null) o.pago = o.status === "Concluído"; });
  save();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* armazenamento indisponível */ } }
const nextId = () => ++db.seq;
const clientName = id => (db.clients.find(c => c.id == id) || {}).nome || "—";
const teamName = id => (db.teams.find(t => t.id == id) || {}).nome || "—";

/* ---------- Entidades (CRUD genérico) ---------- */
const tagClass = s => ({ "Concluído": "ok", "Realizado": "ok", "Receita": "ok", "Em Andamento": "run", "Agendado": "run", "Pendente": "wait", "Pago": "ok", "Confirmado": "ok", "Recusado": "bad", "Cancelado": "bad", "Despesa": "bad" }[s] || "");
const tag = s => `<span class="tag ${tagClass(s)}">${esc(s)}</span>`;
const payTag = o => {
  if (o.pago) return tag("Pago");
  if (o.status !== "Concluído") return `<span class="tag">—</span>`;
  const d = diffDays(o.vencimento, today());
  return d < 0 ? `<span class="tag bad">Vencida há ${-d}d</span>` : `<span class="tag wait">Vence ${d === 0 ? "hoje" : "em " + d + "d"}</span>`;
};
const clientOpts = () => db.clients.map(c => [c.id, c.nome]);
const teamOpts = () => db.teams.map(t => [t.id, t.nome]);

const ENTITIES = {
  agendamentos: { store: "appointments", title: "Agendamentos", sub: "Agenda de serviços", novo: "Novo agendamento",
    fields: [{ k: "cliente", l: "Cliente", t: "select", o: clientOpts, num: 1 }, { k: "servico", l: "Serviço" }, { k: "data", l: "Data", t: "date" }, { k: "equipe", l: "Equipe", t: "select", o: teamOpts, num: 1 }, { k: "status", l: "Status", t: "select", o: () => ["Agendado", "Confirmado", "Realizado", "Cancelado"].map(s => [s, s]) }],
    cols: [["Data", r => fmtDate(r.data)], ["Cliente", r => esc(clientName(r.cliente))], ["Serviço", r => esc(r.servico)], ["Equipe", r => esc(teamName(r.equipe))], ["Status", r => tag(r.status)]], sort: r => r.data, desc: true },
  ordens: { store: "orders", title: "Ordens de Serviço", sub: "Acompanhe cada serviço e orçamento", novo: "Nova ordem",
    fields: [{ k: "cliente", l: "Cliente", t: "select", o: clientOpts, num: 1 }, { k: "descricao", l: "Descrição" }, { k: "valor", l: "Valor (R$)", t: "number" }, { k: "data", l: "Data", t: "date" }, { k: "vencimento", l: "Vencimento", t: "date" }, { k: "status", l: "Status", t: "select", o: () => ["Pendente", "Em Andamento", "Concluído", "Recusado"].map(s => [s, s]) }, { k: "pago", l: "Pagamento", t: "select", bool: 1, o: () => [["false", "Em aberto"], ["true", "Pago"]] }],
    cols: [["Nº", r => "#" + r.id], ["Data", r => fmtDate(r.data)], ["Cliente", r => esc(clientName(r.cliente))], ["Descrição", r => esc(r.descricao)], ["Valor", r => brl(r.valor)], ["Status", r => tag(r.status)], ["Pagamento", r => payTag(r)]], extra: r => r.status === "Concluído" && !r.pago ? `<button data-pay="${r.id}">Receber</button>` : "", sort: r => r.data, desc: true },
  clientes: { store: "clients", title: "Clientes", sub: "Sua base de clientes", novo: "Novo cliente",
    fields: [{ k: "nome", l: "Nome" }, { k: "telefone", l: "Telefone" }, { k: "email", l: "E-mail", t: "email" }],
    cols: [["Nome", r => esc(r.nome)], ["Telefone", r => esc(r.telefone)], ["E-mail", r => esc(r.email)]], sort: r => r.nome },
  equipes: { store: "teams", title: "Equipes", sub: "Organize quem faz cada serviço", novo: "Nova equipe",
    fields: [{ k: "nome", l: "Nome da equipe" }, { k: "membros", l: "Membros" }, { k: "funcao", l: "Função" }],
    cols: [["Equipe", r => esc(r.nome)], ["Membros", r => esc(r.membros)], ["Função", r => esc(r.funcao)]], sort: r => r.nome },
  financeiro: { store: "transactions", title: "Financeiro", sub: "Receitas e despesas", novo: "Novo lançamento", summary: true,
    fields: [{ k: "descricao", l: "Descrição" }, { k: "tipo", l: "Tipo", t: "select", o: () => [["Receita", "Receita"], ["Despesa", "Despesa"]] }, { k: "valor", l: "Valor (R$)", t: "number" }, { k: "data", l: "Data", t: "date" }],
    cols: [["Data", r => fmtDate(r.data)], ["Descrição", r => esc(r.descricao)], ["Tipo", r => tag(r.tipo)], ["Valor", r => brl(r.valor)]], sort: r => r.data, desc: true },
};

/* ---------- Gráficos SVG ---------- */
function monthsBack(n) {
  const out = [], now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "") });
  }
  return out;
}
function monthlyTotals(n) {
  const ms = monthsBack(n);
  return ms.map(m => {
    const t = db.transactions.filter(x => x.data.startsWith(m.key));
    return { label: m.label, rec: sum(t.filter(x => x.tipo === "Receita")), des: sum(t.filter(x => x.tipo === "Despesa")) };
  });
}
const sum = a => a.reduce((s, x) => s + Number(x.valor), 0);

function lineChart(data) {
  const W = 560, H = 230, pl = 44, pb = 26, pt = 10, pr = 10;
  const max = Math.max(1000, ...data.flatMap(d => [d.rec, d.des]));
  const top = Math.ceil(max / 5000) * 5000 || 5000;
  const x = i => pl + i * (W - pl - pr) / Math.max(1, data.length - 1);
  const y = v => pt + (H - pt - pb) * (1 - v / top);
  const path = k => data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d[k]).toFixed(1)}`).join(" ");
  let g = "";
  for (let i = 0; i <= 4; i++) {
    const v = top * i / 4;
    g += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="#E2E8F0"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="#64748B">${v >= 1000 ? v / 1000 + "k" : v}</text>`;
  }
  const labels = data.map((d, i) => `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="#64748B">${esc(d.label)}</text>`).join("");
  const dots = (k, c) => data.map((d, i) => `<circle cx="${x(i)}" cy="${y(d[k])}" r="3.5" fill="${c}"><title>${esc(d.label)}: ${brl(d[k])}</title></circle>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolução financeira">${g}${labels}
    <path d="${path("rec")}" fill="none" stroke="#2563EB" stroke-width="2.5"/><path d="${path("des")}" fill="none" stroke="#10B981" stroke-width="2.5"/>${dots("rec", "#2563EB")}${dots("des", "#10B981")}</svg>`;
}
function donut(parts) {
  const total = parts.reduce((s, p) => s + p.v, 0) || 1, R = 52, C = 2 * Math.PI * R;
  let off = 0;
  const arcs = parts.map(p => {
    const len = C * p.v / total, el = `<circle r="${R}" cx="70" cy="70" fill="none" stroke="${p.c}" stroke-width="22" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"><title>${esc(p.l)}: ${p.v}</title></circle>`;
    off += len; return el;
  }).join("");
  const legend = parts.map(p => `<div><span class="dot" style="background:${p.c}"></span>${esc(p.l)} <b>${Math.round(100 * p.v / total)}%</b></div>`).join("");
  return `<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap"><svg viewBox="0 0 140 140" width="140" role="img" aria-label="Serviços por status">${arcs}</svg><div class="legend" style="flex-direction:column;gap:8px;font-size:13px">${legend}</div></div>`;
}

/* ---------- Views ---------- */
let period = 30;
const inRange = (d, from, to) => d >= from && d < to;

function delta(cur, prev) {
  if (!prev) return cur ? `<em class="up">↑ novo</em>` : `<em>—</em>`;
  const p = Math.round(100 * (cur - prev) / prev);
  return `<em class="${p >= 0 ? "up" : "down"}">${p >= 0 ? "↑" : "↓"} ${Math.abs(p)}%</em>`;
}
function kpiSet(from, to) {
  const ap = db.appointments.filter(a => inRange(a.data, from, to));
  const os = db.orders.filter(o => inRange(o.data, from, to));
  const done = os.filter(o => o.status === "Concluído");
  const fat = sum(db.transactions.filter(t => t.tipo === "Receita" && inRange(t.data, from, to)));
  const aceite = os.length ? Math.round(100 * os.filter(o => o.status !== "Recusado").length / os.length) : 0;
  return { ag: ap.length, rea: done.length, fat, aceite, os };
}
function dashboard() {
  const now = daysAgo(-1), from = daysAgo(period), prevFrom = daysAgo(period * 2);
  const c = kpiSet(from, now), p = kpiSet(prevFrom, from);
  const st = ["Concluído", "Em Andamento", "Pendente"].map((l, i) => ({ l, c: ["#2563EB", "#38BDF8", "#10B981"][i], v: c.os.filter(o => o.status === l).length }));
  return `
  <header class="top"><div><h1>Dashboard</h1><p>Visão geral do seu negócio</p></div>
    <select id="period" aria-label="Período">${[[30, "Últimos 30 dias"], [90, "Últimos 90 dias"], [365, "Últimos 12 meses"]].map(([v, l]) => `<option value="${v}" ${v == period ? "selected" : ""}>${l}</option>`).join("")}</select></header>
  <section class="grid kpis">
    <div class="card kpi"><div class="ic">📅</div><b>${c.ag}</b><span>Agendamentos</span>${delta(c.ag, p.ag)}</div>
    <div class="card kpi"><div class="ic">✅</div><b>${c.rea}</b><span>Serviços Realizados</span>${delta(c.rea, p.rea)}</div>
    <div class="card kpi"><div class="ic">💲</div><b>${brl(c.fat)}</b><span>Faturamento</span>${delta(c.fat, p.fat)}</div>
    <div class="card kpi"><div class="ic">📈</div><b>${c.aceite}%</b><span>Taxa de Aceite</span>${delta(c.aceite, p.aceite)}</div>
    <a class="card kpi" href="#whatsapp" style="text-decoration:none;color:inherit"><div class="ic">⏰</div><b class="down">${brl(overdue().total)}</b><span>Em atraso (${overdue().n} OS)</span><em class="up">Cobrar no WhatsApp →</em></a>
  </section>
  <section class="grid charts">
    <div class="card"><h3>Evolução Financeira <span class="legend"><span><i class="dot" style="background:#2563EB"></i>Receitas</span><span><i class="dot" style="background:#10B981"></i>Despesas</span></span></h3>${lineChart(monthlyTotals(6))}</div>
    <div class="card"><h3>Serviços por Status</h3>${donut(st)}</div>
  </section>`;
}

function crud(name) {
  const e = ENTITIES[name];
  const rows = [...db[e.store]].sort((a, b) => e.desc ? (e.sort(b) > e.sort(a) ? 1 : -1) : (e.sort(a) > e.sort(b) ? 1 : -1));
  let summary = "";
  if (e.summary) {
    const r = sum(db.transactions.filter(t => t.tipo === "Receita")), d = sum(db.transactions.filter(t => t.tipo === "Despesa"));
    summary = `<section class="grid kpis"><div class="card kpi"><span>Receitas</span><b class="up">${brl(r)}</b></div><div class="card kpi"><span>Despesas</span><b class="down">${brl(d)}</b></div><div class="card kpi"><span>Lucro</span><b>${brl(r - d)}</b></div></section>`;
  }
  const body = rows.length ? rows.map(r => `<tr>${e.cols.map(c => `<td>${c[1](r)}</td>`).join("")}<td class="row-actions">${e.extra ? e.extra(r) : ""}<button data-edit="${r.id}">Editar</button><button class="del" data-del="${r.id}">Excluir</button></td></tr>`).join("") : `<tr><td class="empty" colspan="${e.cols.length + 1}">Nenhum registro ainda.</td></tr>`;
  return `<header class="top"><div><h1>${e.title}</h1><p>${e.sub}</p></div><button class="btn" data-new>${e.novo}</button></header>${summary}
  <div class="card table-wrap"><table><thead><tr>${e.cols.map(c => `<th>${c[0]}</th>`).join("")}<th></th></tr></thead><tbody>${body}</tbody></table></div>`;
}

function relatorios() {
  const m = monthlyTotals(6);
  const rec = sum(db.transactions.filter(t => t.tipo === "Receita")), des = sum(db.transactions.filter(t => t.tipo === "Despesa"));
  const byClient = db.clients.map(c => ({ n: c.nome, v: sum(db.transactions.filter(t => t.tipo === "Receita" && /^OS #/.test(t.descricao) && (db.orders.find(o => "OS #" + o.id === t.descricao) || {}).cliente == c.id)) })).sort((a, b) => b.v - a.v);
  return `<header class="top"><div><h1>Relatórios</h1><p>Resultados consolidados</p></div><button class="btn" id="csv">Exportar CSV</button></header>
  <section class="grid kpis"><div class="card kpi"><span>Receita total</span><b class="up">${brl(rec)}</b></div><div class="card kpi"><span>Despesa total</span><b class="down">${brl(des)}</b></div><div class="card kpi"><span>Lucro</span><b>${brl(rec - des)}</b></div><div class="card kpi"><span>Margem</span><b>${rec ? Math.round(100 * (rec - des) / rec) : 0}%</b></div></section>
  <section class="grid charts"><div class="card"><h3>Resultado mensal</h3><div class="table-wrap"><table><thead><tr><th>Mês</th><th>Receitas</th><th>Despesas</th><th>Lucro</th></tr></thead><tbody>${m.map(x => `<tr><td>${esc(x.label)}</td><td>${brl(x.rec)}</td><td>${brl(x.des)}</td><td class="${x.rec - x.des >= 0 ? "up" : "down"}">${brl(x.rec - x.des)}</td></tr>`).join("")}</tbody></table></div></div>
  <div class="card"><h3>Faturamento por cliente</h3><table><tbody>${byClient.map(x => `<tr><td>${esc(x.n)}</td><td>${brl(x.v)}</td></tr>`).join("")}</tbody></table></div></section>`;
}

function configuracoes() {
  const c = db.settings, t = c.templates;
  const num = (k, l) => `<label>${l}<input type="number" min="0" name="${k}" value="${c[k]}"></label>`;
  const ta = (k, l) => `<label>${l}<textarea name="t_${k}" rows="3">${esc(t[k])}</textarea></label>`;
  return `<header class="top"><div><h1>Configurações</h1><p>Regras de cobrança, lembretes e dados do aplicativo</p></div></header>
  <form id="cfg" class="card cfg"><h3>Regras automáticas (WhatsApp)</h3>
    <label>Nome da empresa<input name="empresa" value="${esc(c.empresa)}"></label>
    <label>Chave PIX (opcional, incluída nas cobranças)<input name="pix" value="${esc(c.pix)}" placeholder="CNPJ, e-mail, telefone ou chave aleatória"></label>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
      ${num("lembreteDias", "Lembrar agendamento com até X dias de antecedência")}${num("cobrancaAntes", "Avisar vencimento com até X dias de antecedência")}
      ${num("cobrancaApos", "Cobrar após X dias de atraso")}${num("reenvioDias", "Reenviar cobrança a cada X dias")}</div>
    <h3>Modelos de mensagem</h3><p class="hint">Variáveis: {cliente} {servico} {data} {os} {valor} {vencimento} {pix} {empresa}</p>
    ${ta("lembrete", "Lembrete de agendamento")}${ta("cobrancaAviso", "Aviso de vencimento")}${ta("cobrancaVencida", "Cobrança de fatura vencida")}${ta("agradecimento", "Agradecimento por pagamento")}
    <div><button class="btn">Salvar regras</button></div></form>
  <div class="card" style="max-width:520px;display:grid;gap:12px;margin-top:16px"><p>Os dados ficam salvos neste navegador. Você pode exportar um backup ou restaurar os dados de exemplo.</p>
  <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="backup">Exportar backup (JSON)</button><button class="btn ghost" id="reset">Restaurar dados de exemplo</button></div></div>`;
}

/* ---------- WhatsApp: regras, fila e chat ---------- */
const TIPOS = { lembrete: "Lembrete", cobrancaAviso: "Vencimento", cobrancaVencida: "Cobrança", agradecimento: "Agradecimento", manual: "Manual" };
const phoneOf = c => { const d = String((c || {}).telefone || "").replace(/\D/g, ""); return d.length > 11 ? d : d ? "55" + d : ""; };
const waLink = (c, txt) => `https://wa.me/${phoneOf(c)}?text=${encodeURIComponent(txt)}`;
function fill(tpl, vars) {
  const out = tpl.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return out.replace(/ {2,}/g, " ").trim();
}
function overdue() {
  const l = db.orders.filter(o => o.status === "Concluído" && !o.pago && o.vencimento < today());
  return { n: l.length, total: sum(l) };
}
function orderVars(o) {
  const s = db.settings;
  return { cliente: clientName(o.cliente), servico: o.descricao, os: o.id, valor: brl(o.valor), vencimento: fmtDate(o.vencimento), data: fmtDate(o.data), empresa: s.empresa, pix: s.pix ? `Chave PIX: ${s.pix}. ` : "" };
}
const lastSent = (ref, tipo) => db.messages.filter(m => m.ref === ref && m.tipo === tipo).map(m => m.em.slice(0, 10)).sort().pop();
function suggestions() {
  const s = db.settings, t = today(), out = [];
  db.appointments.filter(a => a.status === "Agendado").forEach(a => {
    const d = diffDays(a.data, t), ref = "A" + a.id;
    if (d >= 0 && d <= s.lembreteDias && !lastSent(ref, "lembrete"))
      out.push({ ref, tipo: "lembrete", cliente: a.cliente, txt: fill(s.templates.lembrete, { cliente: clientName(a.cliente), servico: a.servico, data: d === 0 ? "hoje" : d === 1 ? "amanhã (" + fmtDate(a.data) + ")" : fmtDate(a.data), empresa: s.empresa }) });
  });
  db.orders.filter(o => o.status === "Concluído" && !o.pago).forEach(o => {
    const d = diffDays(o.vencimento, t), ref = "O" + o.id;
    let tipo = null;
    if (d < 0 && -d >= s.cobrancaApos) tipo = "cobrancaVencida"; else if (d >= 0 && d <= s.cobrancaAntes) tipo = "cobrancaAviso";
    if (!tipo) return;
    const last = lastSent(ref, tipo);
    if (last && (tipo === "cobrancaAviso" || diffDays(t, last) < s.reenvioDias)) return;
    out.push({ ref, tipo, cliente: o.cliente, txt: fill(s.templates[tipo], orderVars(o)) });
  });
  return out.filter(x => phoneOf(db.clients.find(c => c.id == x.cliente)));
}
const TOKEN_KEY = "gestaolucros.token";
const getToken = () => { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; } };
const hasServer = location.protocol.startsWith("http");
const wa = { configured: false, state: "", error: "", at: 0 };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function apiCall(path, opt = {}) {
  const r = await fetch(path, { ...opt, headers: { "Content-Type": "application/json", "x-app-token": getToken() } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Erro " + r.status);
  return j;
}
async function refreshStatus() {
  if (!hasServer) return;
  wa.at = Date.now();
  try { const st = await apiCall("/api/status"); wa.configured = st.configured; wa.state = st.state || ""; wa.error = ""; }
  catch (e) { wa.configured = false; wa.state = ""; wa.error = e.message; }
}
const waReady = () => wa.configured && wa.state === "open";
// Envia pela Evolution API (se conectada) ou abre o wa.me (modo manual). Retorna true se enviou/abriu.
async function logSend(cliente, tipo, ref, txt) {
  const c = db.clients.find(x => x.id == cliente);
  const entry = { id: nextId(), cliente: +cliente, tipo, ref, txt, em: new Date().toISOString(), dir: "out" };
  if (!waReady()) { window.open(waLink(c, txt), "_blank", "noopener"); db.messages.push(entry); save(); return true; }
  try {
    await apiCall("/api/send", { method: "POST", body: JSON.stringify({ number: phoneOf(c), text: txt }) });
    entry.via = "api"; db.messages.push(entry); save(); return true;
  } catch (e) { alert("Não foi possível enviar para " + (c ? c.nome : "cliente") + ": " + e.message); return false; }
}
// Respostas recebidas pelo webhook da Evolution
async function pollInbox() {
  if (!waReady()) return;
  try {
    const { messages } = await apiCall("/api/inbox?since=" + (db.inboxSeq || 0));
    if (!messages.length) return;
    messages.forEach(m => {
      db.inboxSeq = Math.max(db.inboxSeq || 0, m.seq);
      const tail = m.phone.slice(-9), c = db.clients.find(x => String(x.telefone).replace(/\D/g, "").slice(-9) === tail);
      if (!c || db.messages.some(x => x.ref === "I" + m.id)) return;
      const msg = { id: nextId(), cliente: c.id, tipo: "resposta", ref: "I" + m.id, txt: m.text, em: m.at, dir: "in" };
      if (/\b(confirm\w*|ok|sim)\b/i.test(m.text)) {
        const ap = db.appointments.filter(a => a.cliente == c.id && a.status === "Agendado" && a.data >= today()).sort((x, y) => x.data > y.data ? 1 : -1)[0];
        if (ap) { ap.status = "Confirmado"; msg.auto = "Agendamento de " + fmtDate(ap.data) + " confirmado"; }
      }
      db.messages.push(msg);
    });
    save();
    if (!($("#msg") || {}).value) render(); else { const n = $(".badge"); if (n) n.remove(); }
  } catch { /* tenta de novo no próximo ciclo */ }
}
let chatClient = null, showAll = false;
function whatsapp() {
  const sug = suggestions();
  if (!chatClient || !db.clients.some(c => c.id == chatClient)) chatClient = (db.clients[0] || {}).id;
  const lastMsg = id => db.messages.filter(m => m.cliente == id).sort((a, b) => a.em < b.em ? 1 : -1)[0];
  const list = [...db.clients].sort((a, b) => ((lastMsg(b.id) || {}).em || "").localeCompare((lastMsg(a.id) || {}).em || "")).map(c => {
    const m = lastMsg(c.id);
    return `<button class="conv ${c.id == chatClient ? "on" : ""}" data-chat="${c.id}"><b>${esc(c.nome)}</b><small>${m ? esc(m.txt.slice(0, 44)) + "…" : "Sem mensagens"}</small></button>`;
  }).join("");
  const cl = db.clients.find(c => c.id == chatClient) || {};
  const thread = db.messages.filter(m => m.cliente == chatClient).sort((a, b) => a.em > b.em ? 1 : -1)
    .map(m => `<div class="bubble ${m.dir === "in" ? "in" : ""}"><small>${m.dir === "in" ? "Resposta do cliente" : esc(TIPOS[m.tipo] || m.tipo)}${m.via ? " · API" : ""}</small>${esc(m.txt)}${m.auto ? `<small class="auto">✔ ${esc(m.auto)}</small>` : ""}<time>${new Date(m.em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}${m.dir === "in" ? "" : " ✓"}</time></div>`).join("") || `<p class="empty">Nenhuma mensagem enviada a este cliente ainda.</p>`;
  const quick = ["lembrete", "cobrancaAviso", "cobrancaVencida", "agradecimento"].map(k => `<button type="button" class="chip" data-tpl="${k}">${TIPOS[k]}</button>`).join("");
  const shown = showAll ? sug : sug.slice(0, 6);
  const queue = sug.length ? shown.map((x, i) => `<div class="sug"><div><span class="tag ${x.tipo === "cobrancaVencida" ? "bad" : x.tipo === "lembrete" ? "run" : "wait"}">${TIPOS[x.tipo]}</span> <b>${esc(clientName(x.cliente))}</b><p>${esc(x.txt)}</p></div><button class="btn" data-send="${i}">Enviar</button></div>`).join("") + (sug.length > 6 ? `<p style="margin-top:10px"><button class="btn ghost" id="more">${showAll ? "Mostrar menos" : `Ver todas (${sug.length})`}</button></p>` : "") : `<p class="empty">Nada pendente. 🎉 Nenhum lembrete ou cobrança a enviar pelas regras atuais.</p>`;
  window.__sug = sug;
  const stateTxt = !hasServer ? `Modo manual: o botão abre o WhatsApp Web/app com a mensagem pronta. Para envio e respostas automáticas, rode <code>npm start</code> e configure a Evolution API (veja o README).`
    : wa.error ? `⚠️ ${esc(wa.error)}` : !wa.configured ? `Servidor ativo, mas a Evolution API não está configurada (.env). Usando modo manual.`
    : waReady() ? `<span class="tag ok">Conectado</span> Evolution API — envio e recebimento automáticos.` : `<span class="tag wait">${esc(wa.state || "desconectado")}</span> Escaneie o QR Code para conectar o número.`;
  const apiBtns = hasServer ? `<div class="chips"><input id="tok" type="password" placeholder="Token de acesso (APP_TOKEN)" value="${esc(getToken())}" style="max-width:240px">
    ${wa.configured ? `<button class="chip" id="qr">Conectar (QR Code)</button><button class="chip" id="hook">Configurar webhook</button>` : ""}<button class="chip" id="recheck">Verificar conexão</button></div>` : "";
  const bulk = waReady() && sug.length > 1 ? `<button class="btn ghost" id="bulk">Enviar todas (${sug.length}) com intervalo</button>` : "";
  return `<header class="top"><div><h1>WhatsApp</h1><p>Lembretes e cobranças com um clique</p></div><a class="btn ghost" href="#configuracoes" style="text-decoration:none">Editar regras</a></header>
  <div class="card" style="margin-bottom:16px"><h3>Conexão</h3><p style="font-size:13px">${stateTxt}</p>${apiBtns}</div>
  <div class="card"><h3>Fila das regras ${bulk} <span class="tag wait">${sug.length} pendente(s)</span></h3>${queue}
    <p class="hint">${waReady() ? "Envio direto pela Evolution API. O envio em lote usa intervalo aleatório de 4–9 s para reduzir risco de bloqueio." : "Modo manual: o botão abre o WhatsApp com a mensagem pronta; você confirma o envio lá."}</p></div>
  <div class="card chat" style="margin-top:16px"><aside>${list}</aside>
    <section><div class="chat-head"><b>${esc(cl.nome || "")}</b><small>${esc(cl.telefone || "sem telefone")}</small></div>
      <div class="thread">${thread}</div>
      <form id="composer"><div class="chips">${quick}</div><div class="row"><textarea id="msg" rows="2" placeholder="Escreva uma mensagem…" required></textarea><button class="btn wa">Enviar no WhatsApp</button></div></form></section></div>`;
}
function whatsappVarsFor(tipo) {
  const c = db.clients.find(x => x.id == chatClient), s = db.settings;
  const o = db.orders.filter(x => x.cliente == chatClient && x.status === "Concluído").sort((a, b) => (a.pago - b.pago) || (a.vencimento > b.vencimento ? 1 : -1))[0];
  const a = db.appointments.filter(x => x.cliente == chatClient && x.status === "Agendado").sort((x, y) => x.data > y.data ? 1 : -1)[0];
  return fill(s.templates[tipo], { ...(o ? orderVars(o) : { valor: "R$ 0,00", vencimento: "", os: "", pix: s.pix ? `Chave PIX: ${s.pix}. ` : "" }), cliente: c.nome, empresa: s.empresa, servico: a ? a.servico : (o ? o.descricao : ""), data: a ? fmtDate(a.data) : "" });
}
function settle(o) {
  if (o.pago && o.status === "Concluído" && !db.transactions.some(t => t.descricao === `OS #${o.id}`))
    db.transactions.push({ id: nextId(), descricao: `OS #${o.id}`, tipo: "Receita", valor: o.valor, data: today() });
}

/* ---------- Roteamento ---------- */
const ROUTES = [["dashboard", "Dashboard", "🏠"], ["agendamentos", "Agendamentos", "📅"], ["ordens", "Ordens de Serviço", "📋"], ["clientes", "Clientes", "👤"], ["equipes", "Equipes", "👥"], ["financeiro", "Financeiro", "📊"], ["whatsapp", "WhatsApp", "💬"], ["relatorios", "Relatórios", "📄"], ["configuracoes", "Configurações", "⚙️"]];
function render() {
  const r = (location.hash.slice(1) || "dashboard");
  const route = ROUTES.some(x => x[0] === r) ? r : "dashboard";
  const pend = suggestions().length;
  $("#nav").innerHTML = ROUTES.map(([k, l, i]) => `<a href="#${k}" class="${k === route ? "active" : ""}"><span>${i}</span>${l}${k === "whatsapp" && pend ? `<em class="badge">${pend}</em>` : ""}</a>`).join("");
  $("#app").innerHTML = route === "dashboard" ? dashboard() : route === "relatorios" ? relatorios() : route === "configuracoes" ? configuracoes() : route === "whatsapp" ? whatsapp() : crud(route);
  $("#sidebar").classList.remove("open");
  bind(route);
}
function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
function bind(route) {
  const app = $("#app");
  if (route === "dashboard") $("#period").onchange = e => { period = +e.target.value; render(); };
  if (ENTITIES[route]) {
    const e = ENTITIES[route];
    app.querySelector("[data-new]").onclick = () => openForm(route);
    app.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => openForm(route, +b.dataset.edit));
    app.querySelectorAll("[data-del]").forEach(b => b.onclick = () => {
      if (!confirm("Excluir este registro?")) return;
      db[e.store] = db[e.store].filter(r => r.id !== +b.dataset.del); save(); render();
    });
  }
  if (route === "relatorios") $("#csv").onclick = () => {
    const lines = ["data;descricao;tipo;valor", ...db.transactions.map(t => [t.data, `"${String(t.descricao).replace(/"/g, '""')}"`, t.tipo, String(t.valor).replace(".", ",")].join(";"))];
    download("financeiro.csv", "﻿" + lines.join("\n"), "text/csv");
  };
  if (route === "whatsapp") {
    const more = $("#more"); if (more) more.onclick = () => { showAll = !showAll; render(); };
    app.querySelectorAll("[data-chat]").forEach(b => b.onclick = () => { chatClient = +b.dataset.chat; render(); });
    app.querySelectorAll("[data-send]").forEach(b => b.onclick = async () => { b.disabled = true; const x = window.__sug[+b.dataset.send]; await logSend(x.cliente, x.tipo, x.ref, x.txt); render(); });
    const q = id => $(id);
    if (q("#tok")) q("#tok").onchange = e => { try { localStorage.setItem(TOKEN_KEY, e.target.value.trim()); } catch { /* ignore */ } refreshStatus().then(render); };
    if (q("#recheck")) q("#recheck").onclick = () => refreshStatus().then(render);
    if (q("#qr")) q("#qr").onclick = async () => {
      try {
        const j = await apiCall("/api/qrcode"), img = String(j.base64 || "");
        $("#modalForm").innerHTML = `<h2>Conectar WhatsApp</h2>${img.startsWith("data:image/") ? `<img src="${esc(img)}" alt="QR Code" style="width:100%;max-width:300px;margin:auto">` : "<p>QR Code indisponível (a instância pode já estar conectada).</p>"}
          ${j.pairingCode ? `<p>Código de pareamento: <b>${esc(j.pairingCode)}</b></p>` : ""}<p class="hint">WhatsApp → Aparelhos conectados → Conectar um aparelho.</p><div class="actions"><button type="button" class="btn" id="cancel">Fechar</button></div>`;
        $("#modal").hidden = false; $("#cancel").onclick = () => { $("#modal").hidden = true; refreshStatus().then(render); };
      } catch (e) { alert(e.message); }
    };
    if (q("#hook")) q("#hook").onclick = async () => {
      const pub = prompt("Endereço público deste servidor (a Evolution precisa alcançá-lo):", location.origin); if (!pub) return;
      try { await apiCall("/api/webhook/setup", { method: "POST", body: JSON.stringify({ publicUrl: pub }) }); alert("Webhook configurado."); } catch (e) { alert(e.message); }
    };
    if (q("#bulk")) q("#bulk").onclick = async () => {
      const list = [...window.__sug]; if (!confirm(`Enviar ${list.length} mensagens com intervalo entre elas?`)) return;
      const btn = q("#bulk"); btn.disabled = true;
      for (let i = 0; i < list.length; i++) {
        btn.textContent = `Enviando ${i + 1}/${list.length}…`;
        if (!(await logSend(list[i].cliente, list[i].tipo, list[i].ref, list[i].txt))) break;
        if (i < list.length - 1) await sleep(4000 + Math.random() * 5000);
      }
      render();
    };
    const th = $(".thread"); if (th) th.scrollTop = th.scrollHeight;
    if (hasServer && Date.now() - wa.at > 15000) refreshStatus().then(() => { if (location.hash === "#whatsapp" && !($("#msg") || {}).value) render(); });
    app.querySelectorAll("[data-tpl]").forEach(b => b.onclick = () => { $("#msg").value = whatsappVarsFor(b.dataset.tpl); $("#msg").focus(); });
    $("#composer").onsubmit = async ev => { ev.preventDefault(); const t = $("#msg").value.trim(); if (t && (await logSend(chatClient, "manual", "M", t))) render(); };
  }
  if (route === "ordens") app.querySelectorAll("[data-pay]").forEach(b => b.onclick = () => {
    const o = db.orders.find(x => x.id === +b.dataset.pay); o.pago = true; settle(o); save(); render();
    if (confirm("Pagamento registrado! Enviar agradecimento por WhatsApp?")) logSend(o.cliente, "agradecimento", "O" + o.id, fill(db.settings.templates.agradecimento, orderVars(o))).then(render);
  });
  if (route === "configuracoes") {
    $("#cfg").onsubmit = ev => {
      ev.preventDefault(); const f = Object.fromEntries(new FormData(ev.target)), c = db.settings;
      c.empresa = f.empresa; c.pix = f.pix; ["lembreteDias", "cobrancaAntes", "cobrancaApos", "reenvioDias"].forEach(k => (c[k] = Math.max(0, Number(f[k]) || 0)));
      Object.keys(c.templates).forEach(k => (c.templates[k] = f["t_" + k]));
      save(); alert("Regras salvas."); render();
    };
    $("#backup").onclick = () => download("gestaolucros-backup.json", JSON.stringify(db, null, 2), "application/json");
    $("#reset").onclick = () => { if (confirm("Substituir todos os dados pelos dados de exemplo?")) { db = seed(); save(); render(); } };
  }
}

/* ---------- Modal ---------- */
function openForm(route, id) {
  const e = ENTITIES[route], rec = id ? db[e.store].find(r => r.id === id) : {};
  const input = f => {
    const v = rec[f.k] ?? (f.t === "date" ? iso(new Date()) : "");
    if (f.t === "select") return `<select name="${f.k}" required>${f.o().map(([val, lab]) => `<option value="${esc(val)}" ${String(val) === String(v) ? "selected" : ""}>${esc(lab)}</option>`).join("")}</select>`;
    return `<input name="${f.k}" type="${f.t || "text"}" value="${esc(v)}" ${f.t === "number" ? 'step="0.01" min="0"' : ""} required>`;
  };
  const form = $("#modalForm");
  form.innerHTML = `<h2>${id ? "Editar" : e.novo}</h2>${e.fields.map(f => `<label>${f.l}${input(f)}</label>`).join("")}
    <div class="actions"><button type="button" class="btn ghost" id="cancel">Cancelar</button><button class="btn">Salvar</button></div>`;
  $("#modal").hidden = false;
  form.querySelector("input,select").focus();
  $("#cancel").onclick = () => ($("#modal").hidden = true);
  form.onsubmit = ev => {
    ev.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    e.fields.forEach(f => { if (f.num || f.t === "number") data[f.k] = Number(data[f.k]); if (f.bool) data[f.k] = data[f.k] === "true"; });
    let saved = rec;
    if (id) Object.assign(rec, data); else { saved = { id: nextId(), ...data }; db[e.store].push(saved); }
    if (route === "ordens") settle(saved);
    save(); $("#modal").hidden = true; render();
  };
}
$("#modal").addEventListener("click", ev => { if (ev.target.id === "modal") ev.target.hidden = true; });
document.addEventListener("keydown", ev => { if (ev.key === "Escape") $("#modal").hidden = true; });
$("#menuBtn").onclick = () => $("#sidebar").classList.toggle("open");

load();
window.addEventListener("hashchange", render);
render();
if (hasServer) { refreshStatus().then(() => { pollInbox(); render(); }); setInterval(async () => { if (Date.now() - wa.at > 60000) await refreshStatus(); pollInbox(); }, 8000); }
