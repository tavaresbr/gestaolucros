"use strict";
/* Gestão Lucros — servidor: arquivos estáticos + ponte segura com a Evolution API.
   A apikey fica apenas aqui (variáveis de ambiente), nunca no navegador. Node 18+, sem dependências. */
const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto");

// carrega .env simples (opcional)
try {
  fs.readFileSync(path.join(__dirname, ".env"), "utf8").split("\n").forEach(l => {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  });
} catch { /* sem .env */ }

const { PORT = 3000, EVOLUTION_URL = "", EVOLUTION_INSTANCE = "", EVOLUTION_APIKEY = "", APP_TOKEN = "", WEBHOOK_TOKEN = "", PUBLIC_URL = "" } = process.env;
const base = EVOLUTION_URL.replace(/\/+$/, "");
const configured = !!(base && EVOLUTION_INSTANCE && EVOLUTION_APIKEY);
const DATA = path.join(__dirname, "data"), INBOX = path.join(DATA, "inbox.json");
let inbox = [];
try { inbox = JSON.parse(fs.readFileSync(INBOX, "utf8")); } catch { /* vazio */ }
const persist = () => { try { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(INBOX, JSON.stringify(inbox.slice(-500))); } catch (e) { console.error("persist:", e.message); } };

const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const json = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); };
const readBody = req => new Promise((ok, no) => { let b = ""; req.on("data", c => { b += c; if (b.length > 1e6) { no(new Error("corpo grande")); req.destroy(); } }); req.on("end", () => { try { ok(b ? JSON.parse(b) : {}); } catch { ok({}); } }); });

async function evo(method, p, body) {
  if (!configured) throw Object.assign(new Error("Evolution API não configurada (veja .env.example)"), { code: 503 });
  const r = await fetch(base + p, { method, headers: { "Content-Type": "application/json", apikey: EVOLUTION_APIKEY }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
  const text = await r.text(); let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!r.ok) throw Object.assign(new Error(`Evolution respondeu ${r.status}`), { code: 502, detail: data });
  return data;
}
const inst = encodeURIComponent(EVOLUTION_INSTANCE);

function incomingText(m = {}) {
  return m.conversation || (m.extendedTextMessage || {}).text || (m.imageMessage || {}).caption || (m.buttonsResponseMessage || {}).selectedDisplayText || "";
}
function onWebhook(ev) {
  const name = String(ev.event || "").toLowerCase().replace(/_/g, ".");
  if (name !== "messages.upsert") return;
  const list = Array.isArray(ev.data) ? ev.data : [ev.data];
  list.filter(Boolean).forEach(d => {
    const key = d.key || {}, jid = String(key.remoteJid || "");
    if (key.fromMe || !jid.endsWith("@s.whatsapp.net")) return;       // ignora próprias e grupos
    const text = incomingText(d.message); if (!text) return;
    if (inbox.some(x => x.id === key.id)) return;
    inbox.push({ id: key.id || crypto.randomUUID(), phone: jid.split("@")[0], name: d.pushName || "", text, at: d.messageTimestamp ? new Date(Number(d.messageTimestamp) * 1000).toISOString() : new Date().toISOString(), seq: (inbox.at(-1)?.seq || 0) + 1 });
  });
  persist();
}

async function api(req, res, url) {
  if (url.pathname === "/webhook/evolution" && req.method === "POST") {
    if (WEBHOOK_TOKEN && !same(url.searchParams.get("token") || "", WEBHOOK_TOKEN)) return json(res, 401, { error: "token inválido" });
    onWebhook(await readBody(req)); return json(res, 200, { ok: true });
  }
  if (!url.pathname.startsWith("/api/")) return false;
  if (APP_TOKEN && !same(req.headers["x-app-token"] || "", APP_TOKEN)) return json(res, 401, { error: "token de acesso inválido" });
  try {
    if (url.pathname === "/api/status") {
      if (!configured) return json(res, 200, { configured: false });
      const s = await evo("GET", `/instance/connectionState/${inst}`);
      return json(res, 200, { configured: true, state: (s.instance || s).state || "unknown" });
    }
    if (url.pathname === "/api/qrcode") return json(res, 200, await evo("GET", `/instance/connect/${inst}`));
    if (url.pathname === "/api/send" && req.method === "POST") {
      const b = await readBody(req), number = String(b.number || "").replace(/\D/g, ""), text = String(b.text || "").trim();
      if (number.length < 10 || !text) return json(res, 400, { error: "número ou texto inválido" });
      return json(res, 200, await evo("POST", `/message/sendText/${inst}`, { number, text }));
    }
    if (url.pathname === "/api/webhook/setup" && req.method === "POST") {
      const pub = (PUBLIC_URL || (await readBody(req)).publicUrl || "").replace(/\/+$/, "");
      if (!pub) return json(res, 400, { error: "defina PUBLIC_URL (endereço público deste servidor)" });
      const hook = `${pub}/webhook/evolution${WEBHOOK_TOKEN ? "?token=" + encodeURIComponent(WEBHOOK_TOKEN) : ""}`;
      return json(res, 200, await evo("POST", `/webhook/set/${inst}`, { webhook: { enabled: true, url: hook, webhookByEvents: false, webhookBase64: false, events: ["MESSAGES_UPSERT"] } }));
    }
    if (url.pathname === "/api/inbox") {
      const since = Number(url.searchParams.get("since") || 0);
      return json(res, 200, { messages: inbox.filter(m => m.seq > since) });
    }
    return json(res, 404, { error: "não encontrado" });
  } catch (e) { return json(res, e.code || 500, { error: e.message, detail: e.detail }); }
}

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png" };
const PUBLIC = /^\/(index\.html|css\/[\w.-]+|js\/[\w.-]+|assets\/[\w.-]+)?$/;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try { if ((await api(req, res, url)) !== false) return; } catch (e) { return json(res, 500, { error: e.message }); }
  if (!PUBLIC.test(url.pathname) || req.method !== "GET") { res.writeHead(404); return res.end("Not found"); }
  const f = path.join(__dirname, url.pathname === "/" ? "index.html" : url.pathname);
  fs.readFile(f, (err, buf) => { if (err) { res.writeHead(404); return res.end("Not found"); } res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" }); res.end(buf); });
});
if (require.main === module) server.listen(PORT, () => console.log(`Gestão Lucros em http://localhost:${PORT} — Evolution API: ${configured ? "configurada" : "NÃO configurada"}${APP_TOKEN ? "" : " — ATENÇÃO: defina APP_TOKEN antes de expor na internet"}`));
module.exports = server;
