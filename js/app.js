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
    orders.push({ id: i + 1, cliente: rnd(1, 6), descricao: svc[rnd(0, 4)], valor, data, status });
    if (status === "Concluído") transactions.push({ id: transactions.length + 1, descricao: `OS #${i + 1}`, tipo: "Receita", valor, data });
  }
  ["Combustível", "Salários", "Materiais", "Aluguel", "Ferramentas"].forEach((d, k) => {
    for (let m = 0; m < 6; m++) transactions.push({ id: transactions.length + 1, descricao: d, tipo: "Despesa", valor: rnd(500, 2200) / (k === 1 ? 1 : 2), data: daysAgo(m * 30 + rnd(0, 20)) });
  });
  return { clients, teams, appointments, orders, transactions, seq: 1000 };
}
function load() {
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch { db = null; }
  if (!db) { db = seed(); save(); }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* armazenamento indisponível */ } }
const nextId = () => ++db.seq;
const clientName = id => (db.clients.find(c => c.id == id) || {}).nome || "—";
const teamName = id => (db.teams.find(t => t.id == id) || {}).nome || "—";

/* ---------- Entidades (CRUD genérico) ---------- */
const tagClass = s => ({ "Concluído": "ok", "Realizado": "ok", "Receita": "ok", "Em Andamento": "run", "Agendado": "run", "Pendente": "wait", "Recusado": "bad", "Cancelado": "bad", "Despesa": "bad" }[s] || "");
const tag = s => `<span class="tag ${tagClass(s)}">${esc(s)}</span>`;
const clientOpts = () => db.clients.map(c => [c.id, c.nome]);
const teamOpts = () => db.teams.map(t => [t.id, t.nome]);

const ENTITIES = {
  agendamentos: { store: "appointments", title: "Agendamentos", sub: "Agenda de serviços", novo: "Novo agendamento",
    fields: [{ k: "cliente", l: "Cliente", t: "select", o: clientOpts, num: 1 }, { k: "servico", l: "Serviço" }, { k: "data", l: "Data", t: "date" }, { k: "equipe", l: "Equipe", t: "select", o: teamOpts, num: 1 }, { k: "status", l: "Status", t: "select", o: () => ["Agendado", "Realizado", "Cancelado"].map(s => [s, s]) }],
    cols: [["Data", r => fmtDate(r.data)], ["Cliente", r => esc(clientName(r.cliente))], ["Serviço", r => esc(r.servico)], ["Equipe", r => esc(teamName(r.equipe))], ["Status", r => tag(r.status)]], sort: r => r.data, desc: true },
  ordens: { store: "orders", title: "Ordens de Serviço", sub: "Acompanhe cada serviço e orçamento", novo: "Nova ordem",
    fields: [{ k: "cliente", l: "Cliente", t: "select", o: clientOpts, num: 1 }, { k: "descricao", l: "Descrição" }, { k: "valor", l: "Valor (R$)", t: "number" }, { k: "data", l: "Data", t: "date" }, { k: "status", l: "Status", t: "select", o: () => ["Pendente", "Em Andamento", "Concluído", "Recusado"].map(s => [s, s]) }],
    cols: [["Nº", r => "#" + r.id], ["Data", r => fmtDate(r.data)], ["Cliente", r => esc(clientName(r.cliente))], ["Descrição", r => esc(r.descricao)], ["Valor", r => brl(r.valor)], ["Status", r => tag(r.status)]], sort: r => r.data, desc: true },
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
  const body = rows.length ? rows.map(r => `<tr>${e.cols.map(c => `<td>${c[1](r)}</td>`).join("")}<td class="row-actions"><button data-edit="${r.id}">Editar</button><button class="del" data-del="${r.id}">Excluir</button></td></tr>`).join("") : `<tr><td class="empty" colspan="${e.cols.length + 1}">Nenhum registro ainda.</td></tr>`;
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
  return `<header class="top"><div><h1>Configurações</h1><p>Dados do aplicativo</p></div></header>
  <div class="card" style="max-width:520px;display:grid;gap:12px"><p>Os dados ficam salvos neste navegador. Você pode exportar um backup ou restaurar os dados de exemplo.</p>
  <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="backup">Exportar backup (JSON)</button><button class="btn ghost" id="reset">Restaurar dados de exemplo</button></div></div>`;
}

/* ---------- Roteamento ---------- */
const ROUTES = [["dashboard", "Dashboard", "🏠"], ["agendamentos", "Agendamentos", "📅"], ["ordens", "Ordens de Serviço", "📋"], ["clientes", "Clientes", "👤"], ["equipes", "Equipes", "👥"], ["financeiro", "Financeiro", "📊"], ["relatorios", "Relatórios", "📄"], ["configuracoes", "Configurações", "⚙️"]];
function render() {
  const r = (location.hash.slice(1) || "dashboard");
  const route = ROUTES.some(x => x[0] === r) ? r : "dashboard";
  $("#nav").innerHTML = ROUTES.map(([k, l, i]) => `<a href="#${k}" class="${k === route ? "active" : ""}"><span>${i}</span>${l}</a>`).join("");
  $("#app").innerHTML = route === "dashboard" ? dashboard() : route === "relatorios" ? relatorios() : route === "configuracoes" ? configuracoes() : crud(route);
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
  if (route === "configuracoes") {
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
    e.fields.forEach(f => { if (f.num || f.t === "number") data[f.k] = Number(data[f.k]); });
    if (id) Object.assign(rec, data); else db[e.store].push({ id: nextId(), ...data });
    save(); $("#modal").hidden = true; render();
  };
}
$("#modal").addEventListener("click", ev => { if (ev.target.id === "modal") ev.target.hidden = true; });
document.addEventListener("keydown", ev => { if (ev.key === "Escape") $("#modal").hidden = true; });
$("#menuBtn").onclick = () => $("#sidebar").classList.toggle("open");

load();
window.addEventListener("hashchange", render);
render();
