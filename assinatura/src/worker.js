// Servidor de assinatura eletrônica de contratos da VPX Engenharia (Cloudflare Worker + D1 + KV).
// Referência completa (rotas, banco, regras): docs/assinatura-contratos.md. Nada de segredo neste arquivo:
// RESEND_KEY e CHAVE_LINKS vêm de "wrangler secret put" (ou do .dev.vars no modo de teste).
// Limite do plano grátis: 10 ms de CPU por pedido. Por isso o servidor nunca abre nem calcula o hash de PDFs:
// o PDF entra e sai como fluxo (KV) e o hash SHA-256 é calculado no navegador.
import PAGINA_ASSINAR from "./pagina-assinar.html";
import PAGINA_VERIFICAR from "./pagina-verificar.html";
import SCHEMA from "../schema.sql";

const LOGO = "https://vpxengenharia.github.io/vpx-visitas/logo.png";
const B32 = "abcdefghijklmnopqrstuvwxyz234567";
const B32_COD = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // sem I, O, 0, 1
const MAX_PDF = 20 * 1048576, MAX_FINAL = 25 * 1048576, MAX_IMAGEM = 280000;   // imagem: ~200 KB em base64
const PAPEL = { contratante: "Contratante", contratada: "Contratada", testemunha: "Testemunha" };
const STATUS_ENV = { rascunho: "rascunho", aguardando: "aguardando assinaturas", concluido: "assinado por todos", recusado: "recusado", cancelado: "cancelado", expirado: "com o prazo vencido" };
const DOMINIO = "@vpxengenharia.com.br";
const MAX_ENV_DIA = 40;                                // contratos criados por pessoa em 24 h (protege a cota de e-mails)
const MAX_IMG_W = 2000, MAX_IMG_H = 1000;               // assinatura: o app e a página mandam até 600 px de largura
// texto do aceite (o que a pessoa marca antes de assinar): a versão e o SHA-256 do texto vão no evento "assinou"
const ACEITES = { "aceite-v1": "Li e concordo com o documento e com a assinatura eletrônica (MP 2.200-2/2001, art. 10, § 2º)." };
// colunas de signatarios sem a imagem da assinatura (até 280 KB cada): a imagem só é lida no detalhe de um contrato
const SIG_COLS = "id, envelope_id, ordem, nome, email, telefone, cpf, papel, modo, token_cifrado, status, visto_em, identificado_em, assinado_em, metodo, nome_assinado, cpf_assinado, ip, aparelho, local, geo, recusa_motivo, notificado_em, lembrado_em";
const LISTA_PAGINA = 150;                              // envelopes por página na lista do app

/* ---------- utilidades ---------- */
const agora = () => new Date().toISOString();
const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
const sha256 = async txt => hex(await crypto.subtle.digest("SHA-256", typeof txt === "string" ? enc.encode(txt) : txt));
const aleatorio = n => crypto.getRandomValues(new Uint8Array(n));
const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const deB64 = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const textoAleatorio = (n, abc) => Array.from(aleatorio(n), b => abc[b % 32]).join("");   // 256 % 32 = 0: sem viés
const novoId = () => textoAleatorio(16, B32);
const novoCodigo = () => { const s = textoAleatorio(12, B32_COD); return s.slice(0, 4) + "-" + s.slice(4, 8) + "-" + s.slice(8); };
const normCodigo = c => { const s = String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); return s.length === 12 ? s.slice(0, 4) + "-" + s.slice(4, 8) + "-" + s.slice(8) : ""; };
function codigo6() { const b = new Uint32Array(1); do crypto.getRandomValues(b); while (b[0] >= 4294000000); return String(b[0] % 1000000).padStart(6, "0"); }
const digitos = s => String(s || "").replace(/\D/g, "");
function cpfValido(c) {
  c = digitos(c); if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  const dv = n => { let s = 0; for (let i = 0; i < n; i++) s += +c[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === +c[9] && dv(10) === +c[10];
}
const emailValido = e => /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(String(e || ""));
const mascararEmail = e => { const [u, d] = String(e || "").split("@"); return d ? (u[0] || "") + "***@" + d : ""; };
const fmtCpf = c => { c = digitos(c); return c.length === 11 ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : c; };
const esc = s => String(s ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const hojeBrasilia = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const dataBR = iso => iso ? iso.slice(0, 10).split("-").reverse().join("/") : "";
const dataHoraBR = iso => iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "";
const limitar = (s, n) => String(s ?? "").trim().slice(0, n);
const somaDias = (iso, d) => new Date(Date.parse(iso) + d * 864e5).toISOString();
const listaEmails = s => String(s || "").toLowerCase().split(/[\s,;]+/).filter(Boolean);
const mascararCpf = c => { c = digitos(c); return c.length === 11 ? `***.${c.slice(3, 6)}.${c.slice(6, 9)}-**` : ""; };
// a folha de assinaturas usa a fonte padrão do PDF (só Latin-1): nome com outras letras sairia diferente do registrado
const nomeImprimivel = n => !/[^\x20-\x7e -ÿ]/.test(String(n || "").normalize("NFC"));
const esperar = ms => new Promise(r => setTimeout(r, ms));

class ErroHttp extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const falha = (status, msg) => new ErroHttp(status, msg);

/* ---------- respostas ---------- */
function origemPermitida(env, origem) {
  if (!origem) return false;
  const lista = String(env.APP_ORIGENS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (env.MODO_TESTE === "1") lista.push("http://localhost:5510", "http://127.0.0.1:5510");
  return lista.includes(origem);
}
function cabecalhosCors(env, req) {
  const o = req.headers.get("Origin");
  if (!origemPermitida(env, o)) return {};
  return { "Access-Control-Allow-Origin": o, "Vary": "Origin", "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Hash-Final",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS", "Access-Control-Max-Age": "86400" };
}
const json = (o, status = 200, extra = {}) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra } });
// CSP: sem 'unsafe-inline' nos scripts — o script de dentro da página vale pelo SHA-256 dele (calculado uma vez por página) e, de fora,
// só o pdf.js 3.11.174 (a página o carrega com integrity). A pasta do pdf.js também vale para o worker dele.
const PDFJS_DIR = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/";
const cspCache = new Map();
async function cspDe(html) {
  if (cspCache.has(html)) return cspCache.get(html);
  const hs = [];
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g))
    hs.push("'sha256-" + btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(m[1]))))) + "'");
  const csp = `default-src 'self'; script-src ${hs.join(" ")} ${PDFJS_DIR}; worker-src blob: ${PDFJS_DIR}; img-src 'self' data: blob: https://vpxengenharia.github.io; ` +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'";
  cspCache.set(html, csp);
  return csp;
}
// A página sai sempre com quebras de linha LF: o navegador troca CRLF por LF antes de calcular o SHA-256 do script, e uma cópia
// do arquivo com CRLF (o git do Windows faz isso ao baixar) dava um hash diferente — a CSP bloqueava o script e a página ficava
// em "Carregando o documento…" (aconteceu na publicação de 25/11/2026).
const lf = s => String(s).replace(/\r\n?/g, "\n");
const pagina = async html0 => { const html = lf(html0); return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": await cspDe(html), "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff", "Cache-Control": "no-cache" } }); };

/* ---------- banco ---------- */
let bancoPronto = false;
async function prepararBanco(env) {
  if (bancoPronto) return;
  const t = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='envelopes'").first();
  if (!t) {
    // por linha (\r\n também: com o git do Windows o schema.sql vem com CRLF e o "--" do comentário não era tirado, e um ";" dentro dele cortava o comando)
    const comandos = SCHEMA.split(/\r?\n/).map(l => l.replace(/--.*$/, "")).join("\n").split(";").map(s => s.trim()).filter(Boolean);
    await env.DB.batch(comandos.map(c => env.DB.prepare(c)));
  } else {
    // banco criado antes destas colunas/tabelas (o schema.sql já as tem): acrescenta o que falta
    const cols = ((await env.DB.prepare("PRAGMA table_info(eventos)").all()).results || []).map(c => c.name);
    const cmds = [];
    if (!cols.includes("anterior")) cmds.push("ALTER TABLE eventos ADD COLUMN anterior TEXT");
    if (!cols.includes("local")) cmds.push("ALTER TABLE eventos ADD COLUMN local TEXT");
    cmds.push("CREATE TABLE IF NOT EXISTS gestores (email TEXT PRIMARY KEY, desde TEXT NOT NULL)", "CREATE UNIQUE INDEX IF NOT EXISTS idx_evt_anterior ON eventos (envelope_id, anterior)",
      // contratos excluídos pelo administrador (25/11/2026): a lápide e os links que deixaram de valer
      "CREATE TABLE IF NOT EXISTS excluidos (id TEXT PRIMARY KEY, codigo TEXT NOT NULL, titulo TEXT, status_antes TEXT, excluido_em TEXT NOT NULL, excluido_por TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS excluidos_tokens (hash TEXT PRIMARY KEY, envelope_id TEXT NOT NULL)",
      "CREATE INDEX IF NOT EXISTS idx_exc_codigo ON excluidos (codigo)", "CREATE INDEX IF NOT EXISTS idx_exc_quando ON excluidos (excluido_em)");
    await env.DB.batch(cmds.map(c => env.DB.prepare(c)));
  }
  bancoPronto = true;
}
const lerEnv = (env, id) => env.DB.prepare("SELECT * FROM envelopes WHERE id = ?").bind(id).first();
// contrato excluído pelo administrador (a lápide): as rotas respondem 410 com uma mensagem clara, nunca um erro genérico
const lapide = (env, id) => env.DB.prepare("SELECT * FROM excluidos WHERE id = ?").bind(id).first();
const MSG_EXCLUIDO = "Este contrato foi excluído pelo administrador e não está mais disponível.";
const MSG_EXCLUIDO_PUB = "Este documento não está mais disponível: ele foi excluído pela VPX Engenharia.";
// 404 do contrato que não existe, ou 410 do que foi excluído
async function semEnvelope(env, id) { return (await lapide(env, id)) ? falha(410, MSG_EXCLUIDO) : falha(404, "Contrato não encontrado."); }
// uma gravação condicional não pegou: se o contrato foi excluído no meio, 410; senão, o 409 de sempre
async function falhaMudou(env, id, msg) { return (await lapide(env, id)) ? falha(410, MSG_EXCLUIDO) : falha(409, msg); }
const lerSigs = (env, id) => env.DB.prepare(`SELECT ${SIG_COLS} FROM signatarios WHERE envelope_id = ? ORDER BY ordem, rowid`).bind(id).all().then(r => r.results || []);
function pubSig(s, comImagem) {
  let geo = null; try { geo = s.geo ? JSON.parse(s.geo) : null; } catch {}
  const o = { id: s.id, ordem: s.ordem, nome: s.nome, email: s.email, telefone: s.telefone, cpf: s.cpf, papel: s.papel, modo: s.modo, status: s.status,
    visto_em: s.visto_em, identificado_em: s.identificado_em, assinado_em: s.assinado_em, metodo: s.metodo, nome_assinado: s.nome_assinado, cpf_assinado: s.cpf_assinado,
    ip: s.ip, aparelho: s.aparelho, local: s.local, geo, recusa_motivo: s.recusa_motivo, notificado_em: s.notificado_em };
  if (comImagem) o.imagem = s.imagem;
  return o;
}
// na lista (que todo aparelho guarda): sem CPF, IP, aparelho, local e localização (ficam só no detalhe, para quem cuida dos contratos)
const sigLista = (s, gestor) => ({ id: s.id, ordem: s.ordem, nome: s.nome, email: s.email, ...(gestor ? { telefone: s.telefone } : {}), papel: s.papel, modo: s.modo, status: s.status,
  visto_em: s.visto_em, identificado_em: s.identificado_em, assinado_em: s.assinado_em, metodo: s.metodo, recusa_motivo: s.recusa_motivo, notificado_em: s.notificado_em });
const urlVerificacao = (env, codigo) => String(env.URL_PUBLICA || "").replace(/\/+$/, "") + "/v/" + codigo;
function pubEnv(env, e, sigs, comImagem, lista, gestor) {
  let meta = {}; try { meta = e.meta ? JSON.parse(e.meta) : {}; } catch {}
  return { id: e.id, codigo: e.codigo, titulo: e.titulo, cliente: e.cliente, criador_email: e.criador_email, criador_nome: e.criador_nome, mensagem: e.mensagem,
    em_ordem: e.em_ordem, prazo: e.prazo, lembretes: e.lembretes, status: e.status, hash_original: e.hash_original, paginas: e.paginas, tamanho: e.tamanho,
    pdf_ok: e.pdf_ok, hash_final: e.hash_final, criado_em: e.criado_em, atualizado_em: e.atualizado_em, enviado_em: e.enviado_em, concluido_em: e.concluido_em,
    arquivado_em: e.arquivado_em, pdfs_apagados_em: e.pdfs_apagados_em, motivo: e.motivo, meta, url_verificacao: urlVerificacao(env, e.codigo),
    signatarios: sigs.map(s => lista ? sigLista(s, gestor) : pubSig(s, comImagem)) };
}
async function envelopeCompleto(env, id, comImagem = false, comEventos = false) {
  const e = await lerEnv(env, id); if (!e) throw await semEnvelope(env, id);
  const sigs = await lerSigs(env, id);
  if (comImagem) {                                   // as imagens das assinaturas, só deste contrato
    const ims = (await env.DB.prepare("SELECT id, imagem FROM signatarios WHERE envelope_id = ? AND imagem IS NOT NULL").bind(id).all()).results || [];
    for (const s of sigs) s.imagem = ims.find(x => x.id === s.id)?.imagem || null;
  }
  const o = pubEnv(env, e, sigs, comImagem);
  if (comEventos) {
    o.eventos = (await env.DB.prepare("SELECT seq, signatario_id, tipo, quando, ip, aparelho, local, detalhe, anterior, hash FROM eventos WHERE envelope_id = ? ORDER BY seq").bind(id).all()).results || [];
    o.cadeia = { versao: 2, base: await baseCadeia(e), formula: FORMULA_CADEIA };
  }
  return o;
}
// trilha encadeada (versão 2): cada evento guarda o hash do anterior ("anterior"); o 1º usa a base, que liga a trilha a este contrato e ao
// documento original. hash = SHA-256( anterior + "|" + JSON.stringify([envelope_id, tipo, quando, signatario_id, ip, aparelho, local, detalhe]) )
// (campos vazios = ""). A gravação só entra se o anterior ainda for o último evento do contrato (dois pedidos ao mesmo tempo não bifurcam a
// cadeia: o 2º lê de novo e tenta outra vez); o índice único (envelope_id, anterior) garante isso também no banco.
const FORMULA_CADEIA = 'base = SHA-256("vpx-assinatura-v2|" + id do contrato + "|" + código + "|" + SHA-256 do original); hash = SHA-256(anterior + "|" + JSON.stringify([id do contrato, tipo, quando, id do signatário, ip, aparelho, local, detalhe])), com "" nos campos vazios';
const baseCadeia = e => sha256(`vpx-assinatura-v2|${e.id}|${e.codigo}|${e.hash_original}`);
async function evento(env, envId, tipo, op = {}) {
  const quando = op.quando || agora(), sid = op.sid || null, detalhe = limitar(op.detalhe || "", 900), ip = op.ip || null, aparelho = op.aparelho || null, local = op.local || null;
  const canon = JSON.stringify([envId, tipo, quando, sid || "", ip || "", aparelho || "", local || "", detalhe]);
  for (let tentativa = 0; tentativa < 8; tentativa++) {
    const r = await env.DB.prepare("SELECT id, codigo, hash_original, (SELECT hash FROM eventos WHERE envelope_id = envelopes.id ORDER BY seq DESC LIMIT 1) AS ult FROM envelopes WHERE id = ?").bind(envId).first();
    if (!r) return "";
    const anterior = r.ult || await baseCadeia(r), hash = await sha256(anterior + "|" + canon);
    try {
      const [ins] = await env.DB.batch([
        env.DB.prepare(`INSERT INTO eventos (envelope_id, signatario_id, tipo, quando, ip, aparelho, local, detalhe, anterior, hash)
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE COALESCE((SELECT hash FROM eventos WHERE envelope_id = ? ORDER BY seq DESC LIMIT 1), '') = ?
            AND EXISTS (SELECT 1 FROM envelopes WHERE id = ?)`)   // contrato excluído no meio: nenhum evento solto fica no banco (a volta seguinte devolve "")
          .bind(envId, sid, tipo, quando, ip, aparelho, local, detalhe, anterior, hash, envId, r.ult || "", envId),
        env.DB.prepare("UPDATE envelopes SET atualizado_em = ? WHERE id = ?").bind(agora(), envId)
      ]);
      if (ins.meta?.changes) return hash;
    } catch (x) { if (!/UNIQUE|constraint/i.test(String(x?.message))) throw x; }
    await esperar(5 + Math.random() * 40);           // outro evento entrou antes: lê o último de novo
  }
  throw new Error("trilha: não foi possível gravar o evento " + tipo);
}
const quemPede = req => ({
  ip: req.headers.get("CF-Connecting-IP") || (req.headers.get("X-Forwarded-For") || "").split(",")[0].trim() || "127.0.0.1",
  aparelho: limitar(req.headers.get("User-Agent") || "", 300),
  local: [req.cf?.city, req.cf?.region, req.cf?.country].filter(Boolean).join(", ") || null
});
// a vez: todos juntos, ou (em ordem) o pendente com a menor ordem
const naVez = (e, sigs, s) => e.status === "aguardando" && s.status === "pendente" && (!e.em_ordem || !sigs.some(o => o.status === "pendente" && o.ordem < s.ordem));

/* ---------- cifra dos links (AES-GCM com CHAVE_LINKS) ---------- */
let chaveCache = null;
async function chaveLinks(env) {
  if (!env.CHAVE_LINKS) throw falha(500, "O servidor está sem a CHAVE_LINKS.");
  return chaveCache ||= crypto.subtle.importKey("raw", deB64(env.CHAVE_LINKS.trim()), "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function cifrar(env, txt) {
  const iv = aleatorio(12), c = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await chaveLinks(env), enc.encode(txt)));
  const t = new Uint8Array(12 + c.length); t.set(iv); t.set(c, 12); return b64url(t);
}
async function decifrar(env, s) {
  const b = deB64(s);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: b.slice(0, 12) }, await chaveLinks(env), b.slice(12)));
}
const urlPublica = (env, req) => String(env.URL_PUBLICA || new URL(req.url).origin).replace(/\/+$/, "");
async function linkDe(env, req, s) { return s.token_cifrado ? urlPublica(env, req) + "/assinar#t=" + await decifrar(env, s.token_cifrado) : ""; }

/* ---------- login do app (id_token da Microsoft) ---------- */
let jwksCache = { chaves: null, quando: 0, buscouDesconhecida: 0 };
async function chavesMicrosoft(env, forcar) {
  if (!forcar && jwksCache.chaves && Date.now() - jwksCache.quando < 6 * 3600000) return jwksCache.chaves;
  const r = await fetch(`https://login.microsoftonline.com/${env.TENANT_ID}/discovery/v2.0/keys`);
  if (!r.ok) throw falha(503, "Não foi possível conferir o login com a Microsoft agora. Tente de novo.");
  jwksCache = { chaves: (await r.json()).keys || [], quando: Date.now(), buscouDesconhecida: jwksCache.buscouDesconhecida };
  return jwksCache.chaves;
}
async function conferirJwt(env, tok) {
  const partes = tok.split(".");
  if (partes.length !== 3) throw falha(401, "Login inválido. Entre de novo na sua conta da VPX.");
  let cab, corpo;
  try { cab = JSON.parse(new TextDecoder().decode(deB64(partes[0]))); corpo = JSON.parse(new TextDecoder().decode(deB64(partes[1]))); }
  catch { throw falha(401, "Login inválido. Entre de novo na sua conta da VPX."); }
  if (cab.alg !== "RS256") throw falha(401, "Login inválido (tipo de assinatura).");
  let chaves = [];
  if (env.MODO_TESTE === "1" && env.JWKS_TESTE) { try { chaves = JSON.parse(env.JWKS_TESTE).keys || []; } catch {} }
  let jwk = chaves.find(k => k.kid === cab.kid);
  if (!jwk) {
    jwk = (await chavesMicrosoft(env, false)).find(k => k.kid === cab.kid);
    if (!jwk && Date.now() - jwksCache.buscouDesconhecida > 5 * 60000) { jwksCache.buscouDesconhecida = Date.now(); jwk = (await chavesMicrosoft(env, true)).find(k => k.kid === cab.kid); }
  }
  if (!jwk) throw falha(401, "Login inválido (chave desconhecida). Entre de novo na sua conta da VPX.");
  const chave = await crypto.subtle.importKey("jwk", { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", chave, deB64(partes[2]), enc.encode(partes[0] + "." + partes[1]));
  if (!ok) throw falha(401, "Login inválido (assinatura). Entre de novo na sua conta da VPX.");
  const t = Date.now() / 1000;
  if (corpo.aud !== env.CLIENT_ID || corpo.tid !== env.TENANT_ID || corpo.iss !== `https://login.microsoftonline.com/${env.TENANT_ID}/v2.0`)
    throw falha(401, "Este login não é da VPX Engenharia.");
  if (!(corpo.exp > t - 300)) throw falha(401, "O login venceu. Entre de novo.");
  if (corpo.nbf && corpo.nbf > t + 300) throw falha(401, "Login ainda não vale. Confira o relógio do aparelho.");
  const email = String(corpo.preferred_username || corpo.email || corpo.upn || "").toLowerCase();
  if (!email) throw falha(401, "O login não trouxe o e-mail.");
  return { email, nome: corpo.name || email, convidado: !!corpo.idp };   // "idp" só vem nos convidados (contas de fora do Microsoft 365 da VPX)
}
// Só contas da própria VPX (o fluxo de cadastro da equipe de campo deixa qualquer pessoa virar convidada do Microsoft 365 da VPX):
// convidado (claim "idp") e e-mail de fora do domínio são recusados. O que cada um pode fazer vem depois (gestores, criador, signatário).
async function autenticar(env, req) {
  const h = req.headers.get("Authorization") || "";
  if (!h.startsWith("Bearer ")) throw falha(401, "Entre na sua conta da VPX para usar os contratos.");
  const tok = h.slice(7).trim();
  let quem;
  if (tok.startsWith("teste:")) {               // atalho só do modo de teste: "teste:<email>|<nome>"
    if (env.MODO_TESTE !== "1") throw falha(401, "Login inválido.");
    const [email, nome] = tok.slice(6).split("|");
    if (!emailValido(email)) throw falha(401, "Login de teste inválido.");
    quem = { email: email.toLowerCase(), nome: nome || email, convidado: false };
  } else quem = await conferirJwt(env, tok);
  if (quem.convidado || !quem.email.endsWith(DOMINIO)) throw falha(403, "Os contratos são só para as contas da VPX Engenharia.");
  quem.admin = listaEmails(env.ADMINS).includes(quem.email);
  quem.gestor = quem.admin || !!(await env.DB.prepare("SELECT 1 AS x FROM gestores WHERE email = ?").bind(quem.email).first());
  return quem;
}

/* ---------- e-mails (Resend; no modo de teste ficam numa lista) ---------- */
function htmlEmail({ titulo, paragrafos = [], botao, url, rodape }) {
  const ps = paragrafos.filter(Boolean).map(p => `<p style="margin:0 0 14px;font-size:15px;line-height:1.5;color:#1d2733">${p}</p>`).join("");
  const b = botao && url ? `<p style="margin:22px 0"><a href="${esc(url)}" style="background:#EB9D2B;color:#1C3C61;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:10px;display:inline-block;font-size:16px">${esc(botao)}</a></p>` : "";
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#EDF0F4;font-family:Barlow,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EDF0F4;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:14px;border:1px solid #d9dee6">
<tr><td style="padding:22px 26px 6px"><img src="${LOGO}" alt="VPX Engenharia" height="40" style="height:40px"></td></tr>
<tr><td style="padding:10px 26px 22px"><h1 style="font-size:20px;color:#1C3C61;margin:0 0 16px">${esc(titulo)}</h1>${ps}${b}
${rodape ? `<p style="margin:18px 0 0;font-size:12.5px;color:#5b6675;line-height:1.5">${rodape}</p>` : ""}</td></tr></table>
<p style="font-size:12px;color:#7a8594;margin:14px 0 0">VPX Engenharia · assinatura eletrônica de documentos</p></td></tr></table></body></html>`;
}
// devolve { ok, id, erro }: quem chama só registra "e-mail enviado" quando deu certo (e grava "email_falhou" quando não)
let ultimoEnvio = 0;
async function mandarEmail(env, { para, assunto, html, texto, responder }) {
  if (!para) return { ok: false, erro: "sem destinatário" };
  if (env.MODO_TESTE === "1") {                    // só no modo de teste: o e-mail fica numa lista (GET /api/teste/emails)
    if (/^falha[@+]/.test(String(para))) return { ok: false, erro: "falha simulada" };   // para testar a falha no envio
    const l = (await env.PDFS.get("teste:emails", "json")) || [];
    l.push({ para, assunto, texto, html, quando: agora() }); while (l.length > 300) l.shift();
    await env.PDFS.put("teste:emails", JSON.stringify(l));
    return { ok: true, id: "teste-" + l.length };
  }
  if (!env.RESEND_KEY) { console.error("e-mail não enviado: o servidor está sem a RESEND_KEY"); return { ok: false, erro: "serviço de e-mail não configurado" }; }
  const falta = ultimoEnvio + 550 - Date.now();       // a Resend aceita uns 2 pedidos por segundo: vários e-mails seguidos esperam um pouco
  if (falta > 0) await esperar(falta);
  ultimoEnvio = Date.now();
  try {
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + env.RESEND_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.REMETENTE, to: [para], subject: assunto, html, text: texto, ...(responder ? { reply_to: responder } : {}) }) });
    if (r.ok) { let id = ""; try { id = (await r.json()).id || ""; } catch {} return { ok: true, id }; }
    const corpo = await r.text().catch(() => "");
    console.error("resend", r.status, corpo);
    return { ok: false, erro: `Resend ${r.status}` + (corpo ? ": " + limitar(corpo, 120) : "") };
  } catch (x) { console.error("resend", x); return { ok: false, erro: "sem conexão com a Resend" }; }
}
// evento de e-mail: "enviado" com o id da Resend, ou "email_falhou" com o motivo (a trilha nunca diz que saiu o que não saiu)
async function eventoEmail(env, envId, tipoOk, r, op = {}) {
  await evento(env, envId, r.ok ? tipoOk : "email_falhou", { ...op, detalhe: [op.detalhe, r.ok ? (r.id ? "id " + r.id : "") : (op.oque ? op.oque + " não enviado: " : "não enviado: ") + r.erro].filter(Boolean).join(" · ") });
}
const assinaturaTexto = "\n\nVPX Engenharia";
function emailPedido(env, e, s, url, lembrete) {
  const prazo = e.prazo ? `Prazo para assinar: ${dataBR(e.prazo)}.` : "";
  const quem = e.criador_nome || "A VPX Engenharia";
  if (s.modo === "app") {
    const app = env.APP_URL || "https://vpxengenharia.github.io/vpx-visitas/";
    return { para: s.email, responder: e.criador_email, assunto: (lembrete ? "Lembrete: " : "") + "Contrato para você assinar no app: " + e.titulo,
      html: htmlEmail({ titulo: "Contrato esperando a sua assinatura", paragrafos: [`${esc(quem)} enviou o documento <b>${esc(e.titulo)}</b>${e.cliente ? " (" + esc(e.cliente) + ")" : ""} para você assinar como ${esc((PAPEL[s.papel] || "signatário").toLowerCase())}.`, "Abra o app VPX Visitas, vá em Contratos e toque em <b>Assinar agora</b>.", prazo], botao: "Abrir o app", url: app }),
      texto: `${quem} enviou o documento "${e.titulo}" para você assinar como ${(PAPEL[s.papel] || "signatário").toLowerCase()}.\nAbra o app VPX Visitas > Contratos > Assinar agora: ${app}\n${prazo}${assinaturaTexto}` };
  }
  const msg = e.mensagem ? `Mensagem de ${esc(quem)}: <i>${esc(e.mensagem).replace(/\n/g, "<br>")}</i>` : "";
  return { para: s.email, responder: e.criador_email, assunto: (lembrete ? "Lembrete: " : "") + "Documento para assinar: " + e.titulo,
    html: htmlEmail({ titulo: lembrete ? "Lembrete: documento esperando a sua assinatura" : "Documento para você assinar",
      paragrafos: [`Olá, ${esc(s.nome.split(" ")[0])}.`, `${esc(quem)}, da VPX Engenharia, enviou o documento <b>${esc(e.titulo)}</b> para você assinar eletronicamente, como ${esc((PAPEL[s.papel] || "signatário").toLowerCase())}.`, msg, prazo,
        "Para assinar, toque no botão abaixo. Vamos mandar um código para este e-mail para confirmar que é você."], botao: "Ler e assinar o documento", url,
      rodape: "Se você não esperava este e-mail, pode ignorá-lo. Não repasse este link: ele é pessoal." }),
    texto: `Olá, ${s.nome.split(" ")[0]}.\n${quem}, da VPX Engenharia, enviou o documento "${e.titulo}" para você assinar eletronicamente.\n${e.mensagem ? "Mensagem: " + e.mensagem + "\n" : ""}${prazo}\nPara ler e assinar: ${url}\nNão repasse este link: ele é pessoal.${assinaturaTexto}` };
}
async function avisarCriador(env, e, assunto, titulo, frase) {
  await mandarEmail(env, { para: e.criador_email, assunto, html: htmlEmail({ titulo, paragrafos: [frase], botao: "Abrir o app", url: env.APP_URL || "https://vpxengenharia.github.io/vpx-visitas/" }),
    texto: frase.replace(/<[^>]+>/g, "") + assinaturaTexto });
}

/* ---------- regras comuns ---------- */
// prazo vencido (sem esperar a tarefa diária): o contrato passa a "expirado"
async function conferirPrazo(env, e) {
  if (e.status === "aguardando" && e.prazo && e.prazo < hojeBrasilia()) {
    const r = await env.DB.prepare("UPDATE envelopes SET status = 'expirado', atualizado_em = ? WHERE id = ? AND status = 'aguardando'").bind(agora(), e.id).run();
    if (r.meta?.changes) {
      e.status = "expirado"; await evento(env, e.id, "expirado", { detalhe: "prazo " + dataBR(e.prazo) });
      await avisarCriador(env, e, "Prazo vencido: " + e.titulo, "Prazo vencido", `O prazo para assinar <b>${esc(e.titulo)}</b> venceu em ${dataBR(e.prazo)} sem todas as assinaturas.`);
    }
  }
  return e;
}
// chama quem está na vez e ainda não foi chamado
async function chamarQuemEstaNaVez(env, req, e, sigs) {
  for (const s of sigs) {
    if (!naVez(e, sigs, s) || s.notificado_em) continue;
    const url = s.modo === "link" ? await linkDe(env, req, s) : "";
    const r = await mandarEmail(env, emailPedido(env, e, s, url));
    if (r.ok) { const q = agora(); await env.DB.prepare("UPDATE signatarios SET notificado_em = ? WHERE id = ?").bind(q, s.id).run(); s.notificado_em = q; }
    // sem sucesso, notificado_em fica vazio: a tarefa diária (ou "Reenviar e-mail" no app) tenta de novo
    await eventoEmail(env, e.id, "email_enviado", r, { sid: s.id, oque: "pedido de assinatura", detalhe: s.modo === "app" ? "aviso para assinar pelo app" : mascararEmail(s.email) });
  }
}
// depois de uma assinatura: conclui ou chama o próximo. Devolve true quando todos assinaram.
async function depoisDeAssinar(env, req, envId, s) {
  const e = await lerEnv(env, envId), sigs = await lerSigs(env, envId);
  if (!e) return false;                              // excluído pelo administrador no mesmo instante
  if (sigs.every(x => x.status === "assinado")) {
    const q = agora();
    const r = await env.DB.prepare("UPDATE envelopes SET status = 'concluido', concluido_em = ?, atualizado_em = ? WHERE id = ? AND status = 'aguardando'").bind(q, q, envId).run();
    if (r.meta?.changes) {
      await evento(env, envId, "concluido", { quando: q });   // a mesma hora do concluido_em (folha e trilha mostram a mesma)
      await avisarCriador(env, e, "Assinado por todos: " + e.titulo, "Documento assinado por todos",
        `Todos assinaram <b>${esc(e.titulo)}</b>. O app monta a via final e guarda no OneDrive na próxima vez que alguém da VPX com a função Contratos abrir o app.`);
    }
    return true;
  }
  if ((s.email || "").toLowerCase() !== e.criador_email) await avisarCriador(env, e, `${s.nome} assinou: ${e.titulo}`, "Nova assinatura", `<b>${esc(s.nome)}</b> (${esc((PAPEL[s.papel] || "").toLowerCase())}) assinou <b>${esc(e.titulo)}</b>. Faltam ${sigs.filter(x => x.status !== "assinado").length} assinatura(s).`);
  if (e.em_ordem) await chamarQuemEstaNaVez(env, req, e, sigs);
  return false;
}
// recibo da assinatura (vai para quem assinou logo depois): o hash do evento "assinou" e o do documento ficam também fora do servidor,
// com a própria pessoa — a trilha não pode ser refeita depois sem contradizer os recibos que já estão com terceiros
async function mandarRecibo(env, e, s, hashEv, quando) {
  const verif = urlVerificacao(env, e.codigo);
  const r = await mandarEmail(env, { para: s.email, responder: e.criador_email, assunto: "Recibo da sua assinatura: " + e.titulo,
    html: htmlEmail({ titulo: "Recibo da sua assinatura", paragrafos: [`Sua assinatura em <b>${esc(e.titulo)}</b> foi registrada em ${esc(dataHoraBR(quando))} (horário de Brasília).`,
      `Código do documento: <b>${esc(e.codigo)}</b><br>SHA-256 do documento assinado por você:<br><span style="font-family:monospace;font-size:12px;word-break:break-all">${e.hash_original}</span><br>Registro da sua assinatura na trilha (SHA-256):<br><span style="font-family:monospace;font-size:12px;word-break:break-all">${hashEv}</span>`,
      `Guarde este e-mail. Para conferir o documento a qualquer momento: <a href="${esc(verif)}">${esc(verif)}</a>`] }),
    texto: `Sua assinatura em "${e.titulo}" foi registrada em ${dataHoraBR(quando)} (horário de Brasília).\nCódigo do documento: ${e.codigo}\nSHA-256 do documento: ${e.hash_original}\nRegistro da sua assinatura (SHA-256): ${hashEv}\nConferir: ${verif}${assinaturaTexto}` });
  await eventoEmail(env, e.id, "recibo_enviado", r, { sid: s.id, oque: "recibo", detalhe: mascararEmail(s.email) + " · registro " + hashEv });
}
// a imagem da assinatura: PNG ou JPEG em data URL, até ~200 KB e no máximo 2000 x 1000 pixels (a largura e a altura vêm do cabeçalho;
// uma imagem pequena no arquivo mas enorme em pixels travaria o aparelho que monta a via final)
function dimensoesImagem(img) {
  const b64 = img.slice(img.indexOf(",") + 1);
  if (/^data:image\/png/.test(img)) {
    if (b64.length < 44) return null;
    let b; try { b = deB64(b64.slice(0, 44)); } catch { return null; }
    if (b.length < 24 || b[12] !== 0x49 || b[13] !== 0x48 || b[14] !== 0x44 || b[15] !== 0x52) return null;   // "IHDR"
    const u32 = i => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
    return { w: u32(16), h: u32(20) };
  }
  let b; try { b = deB64(b64.slice(0, 10920)); } catch { return null; }   // os primeiros ~8 KB
  for (let i = 2; i + 9 < b.length;) {             // JPEG: procura o marcador SOF (C0–CF, menos C4, C8 e CC)
    if (b[i] !== 0xff) return null;
    const mk = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
    if (mk >= 0xc0 && mk <= 0xcf && mk !== 0xc4 && mk !== 0xc8 && mk !== 0xcc) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
    i += 2 + len;
  }
  return null;
}
function conferirImagem(img) {
  if (typeof img !== "string" || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(img)) throw falha(400, "Faça a sua assinatura no quadro.");
  if (img.length > MAX_IMAGEM) throw falha(400, "A imagem da assinatura é grande demais.");
  const d = dimensoesImagem(img);
  if (!d || !d.w || !d.h || d.w > MAX_IMG_W || d.h > MAX_IMG_H) throw falha(400, "A imagem da assinatura tem um tamanho inválido. Faça a assinatura de novo no quadro.");
}
// o aceite marcado antes de assinar: a versão do texto (o texto fica aqui, no código do servidor)
function conferirAceite(c) {
  if (c.aceite !== true) throw falha(400, "Marque que leu e concorda com o documento.");
  const v = c.aceite_versao || "aceite-v1";
  if (!ACEITES[v]) throw falha(400, "Versão do aceite desconhecida. Recarregue a página.");
  return v;
}
// o que o evento "assinou" registra (e a cadeia protege): nome e CPF informados, documento visto, imagem da assinatura, aceite e localização
async function detalheAssinou(metodo, nome, cpf, hashVisto, imagem, versaoAceite, geo) {
  return [metodo, "nome: " + nome, "CPF " + mascararCpf(cpf), "documento visto (SHA-256): " + hashVisto, "imagem da assinatura (SHA-256): " + await sha256(imagem),
    `aceite: ${versaoAceite} (SHA-256 do texto ${(await sha256(ACEITES[versaoAceite])).slice(0, 16)})`, geo ? "localização informada: " + geo : ""].filter(Boolean).join(" · ");
}
function conferirGeo(g) {
  if (!g || typeof g !== "object") return null;
  const lat = +g.lat, lon = +g.lon, precisao = Math.round(+g.precisao || 0);
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return JSON.stringify({ lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6, precisao });
}
async function lerJson(req) { try { return await req.json(); } catch { throw falha(400, "Pedido inválido."); } }

/* ---------- rotas do app (com login) ---------- */
async function rotaApp(env, req, url, quem) {
  const m = req.method, p = url.pathname;
  let mm;
  // gestores = quem tem a função Contratos no app (o administrador manda a lista: PUT /api/gestores) + os ADMINS do wrangler.toml
  const soGestor = () => { if (!quem.gestor) throw falha(403, "Só quem cuida dos contratos (função Contratos) pode fazer isso. Se você acabou de receber a função, peça ao administrador para abrir o app com internet."); };
  if (p === "/api/gestores") {
    if (!quem.admin) throw falha(403, "Só o administrador muda quem cuida dos contratos.");
    if (m === "GET") return json({ gestores: ((await env.DB.prepare("SELECT email FROM gestores ORDER BY email").all()).results || []).map(r => r.email) });
    if (m !== "PUT") throw falha(405, "Método não permitido.");
    const c = await lerJson(req), emails = [...new Set((Array.isArray(c.emails) ? c.emails : []).map(x => String(x || "").trim().toLowerCase()))];
    if (emails.length > 200) throw falha(400, "Lista grande demais.");
    for (const x of emails) if (!emailValido(x) || !x.endsWith(DOMINIO)) throw falha(400, `Só contas da VPX podem cuidar dos contratos: ${x}.`);
    const h = agora();
    await env.DB.batch([env.DB.prepare("DELETE FROM gestores"), ...emails.map(x => env.DB.prepare("INSERT INTO gestores (email, desde) VALUES (?, ?)").bind(x, h))]);
    return json({ gestores: emails });
  }
  if (p === "/api/envelopes" && m === "POST") { soGestor(); return criarEnvelope(env, req, quem); }
  if (p === "/api/envelopes" && m === "GET") {
    // por páginas (atualizado_em, id), dos últimos 3 anos; quem não cuida dos contratos recebe só os que criou ou em que assina pelo app.
    // "agora" = hora do servidor no começo (o app pede de novo com uma folga: uma gravação pode terminar depois desta leitura)
    const hora = agora(), desde = url.searchParams.get("desde") || "", apos = url.searchParams.get("apos") || "";
    let sql = "SELECT * FROM envelopes WHERE criado_em > ?"; const args = [somaDias(hora, -3 * 365)];
    if (desde && apos) { sql += " AND (atualizado_em > ? OR (atualizado_em = ? AND id > ?))"; args.push(desde, desde, apos); }
    else if (desde) { sql += " AND atualizado_em >= ?"; args.push(desde); }
    if (!quem.gestor) { sql += " AND (criador_email = ? OR id IN (SELECT envelope_id FROM signatarios WHERE email = ? AND modo = 'app'))"; args.push(quem.email, quem.email); }
    const lidos = (await env.DB.prepare(sql + ` ORDER BY atualizado_em, id LIMIT ${LISTA_PAGINA + 1}`).bind(...args).all()).results || [];
    const envs = lidos.slice(0, LISTA_PAGINA), ult = envs[envs.length - 1], ids = envs.map(e => e.id), porEnv = {};
    for (let i = 0; i < ids.length; i += 50) {
      const lote = ids.slice(i, i + 50);
      const ss = (await env.DB.prepare(`SELECT id, envelope_id, ordem, nome, email, telefone, papel, modo, status, visto_em, identificado_em, assinado_em, metodo, recusa_motivo, notificado_em
        FROM signatarios WHERE envelope_id IN (${lote.map(() => "?").join(",")}) ORDER BY ordem, rowid`).bind(...lote).all()).results || [];
      for (const s of ss) (porEnv[s.envelope_id] ||= []).push(s);
    }
    // os contratos excluídos pelo administrador desde a última leitura (na 1ª página; sem "desde", todos): os aparelhos tiram da lista.
    // Vão para todos (gestor ou não): são só os ids aleatórios, sem título nem dado nenhum, e o aparelho só apaga o que já tinha.
    const excluidos = apos ? [] : ((await env.DB.prepare("SELECT id FROM excluidos WHERE excluido_em >= ? ORDER BY excluido_em DESC LIMIT 5000").bind(desde).all()).results || []).map(r => r.id);
    return json({ envelopes: envs.map(e => pubEnv(env, e, porEnv[e.id] || [], false, true, quem.gestor)), agora: hora, excluidos,
      mais: lidos.length > LISTA_PAGINA ? { desde: ult.atualizado_em, apos: ult.id } : null });
  }
  if (!(mm = p.match(/^\/api\/envelopes\/([a-z2-7]{16})(\/.*)?$/))) throw falha(404, "Rota desconhecida.");
  const id = mm[1], resto = mm[2] || "";
  // excluir: só o administrador (ADMINS do wrangler.toml), em qualquer situação — antes de qualquer outra conferência
  if (resto === "/excluir" && m === "POST") {
    if (!quem.admin) throw falha(403, "Só o administrador pode excluir contratos.");
    return excluirEnvelope(env, id, quem);
  }
  let e = await lerEnv(env, id); if (!e) throw await semEnvelope(env, id);
  const meu = await env.DB.prepare("SELECT id, status FROM signatarios WHERE envelope_id = ? AND email = ? AND modo = 'app'").bind(id, quem.email).first();
  const criador = e.criador_email === quem.email;
  if (!quem.gestor && !criador && !meu) throw falha(404, "Contrato não encontrado.");
  e = await conferirPrazo(env, e);
  const q = quemPede(req);

  if (resto === "" && m === "GET") {
    const o = await envelopeCompleto(env, id, true, true);
    if (!quem.gestor) {                              // quem só assina: sem os dados pessoais dos outros
      for (const s of o.signatarios) if ((s.email || "").toLowerCase() !== quem.email) for (const k of ["telefone", "cpf", "cpf_assinado", "ip", "aparelho", "local", "geo", "imagem"]) s[k] = null;
      for (const v of o.eventos) v.ip = v.aparelho = v.local = null;
    }
    return json({ envelope: o });
  }

  if (resto === "/pdf" && m === "PUT") {
    if (!criador) throw falha(403, "Só quem criou o contrato pode enviar o PDF.");
    if (e.status !== "rascunho") throw falha(409, "O PDF só pode ser trocado antes do envio.");
    const tam = +req.headers.get("Content-Length");
    if (!req.body || tam !== e.tamanho) throw falha(400, "O tamanho do PDF não confere com o informado.");
    await env.PDFS.put("orig:" + id, req.body);
    const r = await env.DB.prepare("UPDATE envelopes SET pdf_ok = 1, atualizado_em = ? WHERE id = ?").bind(agora(), id).run();
    if (!r.meta?.changes) { await env.PDFS.delete("orig:" + id); throw await semEnvelope(env, id); }   // excluído enquanto o PDF subia: não fica PDF solto
    return json({ envelope: await envelopeCompleto(env, id) });
  }

  if ((resto === "/pdf" || resto === "/final") && m === "GET") {
    const obj = await env.PDFS.get((resto === "/pdf" ? "orig:" : "final:") + id, "stream");
    if (!obj) throw falha(404, resto === "/pdf" ? "O PDF original não está mais no serviço." : "O documento final ainda não existe.");
    if (resto === "/pdf" && meu?.status === "pendente" && e.status === "aguardando") {   // quem assina pelo app baixou o documento: fica na trilha
      const h = agora();
      await env.DB.prepare("UPDATE signatarios SET visto_em = COALESCE(visto_em, ?) WHERE id = ?").bind(h, meu.id).run();
      await evento(env, id, "abriu_documento", { sid: meu.id, quando: h, ip: q.ip, aparelho: q.aparelho, local: q.local, detalhe: "documento entregue no app (SHA-256 " + e.hash_original + ")" });
    }
    return new Response(obj, { headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store" } });
  }

  if (resto === "/enviar" && m === "POST") {
    if (!criador) throw falha(403, "Só quem criou o contrato pode enviá-lo.");
    if (e.status !== "rascunho") throw falha(409, "Este contrato já foi enviado.");
    if (!e.pdf_ok) throw falha(409, "O PDF ainda não chegou ao serviço. Tente de novo.");
    const sigs = await lerSigs(env, id), links = {}, base = urlPublica(env, req), cmds = [];
    for (const s of sigs) {
      if (s.modo !== "link") continue;
      const tok = b64url(aleatorio(32));
      s.token_cifrado = await cifrar(env, tok);
      links[s.id] = base + "/assinar#t=" + tok;
      cmds.push(env.DB.prepare("UPDATE signatarios SET token_hash = ?, token_cifrado = ? WHERE id = ? AND (SELECT status FROM envelopes WHERE id = ?) = 'rascunho'").bind(await sha256(tok), s.token_cifrado, s.id, id));
    }
    const h = agora();
    cmds.push(env.DB.prepare("UPDATE envelopes SET status = 'aguardando', enviado_em = ?, atualizado_em = ? WHERE id = ? AND status = 'rascunho'").bind(h, h, id));
    const res = await env.DB.batch(cmds);
    if (!res[res.length - 1].meta?.changes) throw await falhaMudou(env, id, "Este contrato já foi enviado.");
    e.status = "aguardando"; e.enviado_em = h;
    await evento(env, id, "enviado", { quando: h, ip: q.ip, aparelho: q.aparelho, local: q.local, detalhe: quem.email });
    await chamarQuemEstaNaVez(env, req, e, sigs);
    return json({ envelope: await envelopeCompleto(env, id), links });
  }

  if ((mm = resto.match(/^\/link\/([a-z2-7]{16})$/)) && m === "GET") {
    soGestor();
    const s = (await lerSigs(env, id)).find(x => x.id === mm[1]);
    if (!s || s.modo !== "link") throw falha(404, "Este signatário não assina por link.");
    if (e.status !== "aguardando" || s.status !== "pendente") throw falha(409, "Este link não vale mais: o contrato não espera a assinatura desta pessoa.");
    return json({ url: await linkDe(env, req, s) });
  }

  if (resto === "/lembrar" && m === "POST") {
    soGestor();
    const c = await lerJson(req);
    if (e.status !== "aguardando") throw falha(409, "Só dá para lembrar contratos que estão aguardando assinaturas.");
    const sigs = await lerSigs(env, id), limite = somaDias(agora(), -10 / 1440);
    const alvo = sigs.filter(s => naVez(e, sigs, s) && (!c.sid || s.id === c.sid));
    if (!alvo.length) throw falha(409, c.sid ? "Esta pessoa não está na vez de assinar." : "Ninguém está esperando para assinar.");
    const podem = alvo.filter(s => !s.lembrado_em || s.lembrado_em < limite);
    if (!podem.length) throw falha(429, "Já foi enviado um e-mail há menos de 10 minutos. Espere um pouco para mandar de novo.");
    let enviados = 0, erro = "";
    for (const s of podem) {
      const r = await mandarEmail(env, emailPedido(env, e, s, s.modo === "link" ? await linkDe(env, req, s) : "", true));
      if (r.ok) { enviados++; const h = agora(); await env.DB.prepare("UPDATE signatarios SET lembrado_em = ?, notificado_em = COALESCE(notificado_em, ?) WHERE id = ?").bind(h, h, s.id).run(); }
      else erro = r.erro;
      await eventoEmail(env, id, "lembrete", r, { sid: s.id, ip: q.ip, aparelho: q.aparelho, local: q.local, oque: "lembrete", detalhe: quem.email });
    }
    if (!enviados) throw falha(503, "O e-mail não saiu (" + erro + "). Tente de novo daqui a pouco.");
    return json({ ok: true, enviados, falharam: podem.length - enviados });
  }

  if (resto === "/assinar-app" && m === "POST") {
    const c = await lerJson(req);
    const sigs = await lerSigs(env, id), s = sigs.find(x => x.id === c.sid);
    if (!s || s.modo !== "app") throw falha(400, "Este signatário não assina pelo app.");
    if ((s.email || "").toLowerCase() !== quem.email) throw falha(403, "Esta assinatura é de outra pessoa: entre com a conta " + s.email + ".");
    if (s.status === "assinado") throw falha(409, "Você já assinou este contrato.");
    if (e.status !== "aguardando") throw falha(409, "Este contrato não está mais aguardando assinaturas (" + (STATUS_ENV[e.status] || e.status) + ").");
    if (!naVez(e, sigs, s)) throw falha(409, "Ainda não é a sua vez de assinar: o contrato é assinado em ordem.");
    if (c.hash_visto !== e.hash_original) throw falha(409, "O documento que você viu é diferente do original. Abra o contrato de novo.");
    const versaoAceite = conferirAceite(c);
    const nome = limitar(c.nome, 120).replace(/\s+/g, " ");
    if (nome.split(" ").length < 2) throw falha(400, "Escreva o nome completo.");
    if (!nomeImprimivel(nome)) throw falha(400, "O nome tem letras que o documento assinado não consegue mostrar. Escreva o nome sem elas (ex.: L no lugar de Ł).");
    if (!cpfValido(c.cpf)) throw falha(400, "CPF inválido. Confira os números.");
    if (s.cpf && digitos(s.cpf) !== digitos(c.cpf)) throw falha(400, "Este CPF é diferente do informado para este signatário no contrato.");
    conferirImagem(c.imagem);
    const h = agora(), geo = conferirGeo(c.geo);
    // só grava se o contrato ainda espera assinaturas (um cancelamento no mesmo instante não fica com uma assinatura dentro)
    const r = await env.DB.prepare(`UPDATE signatarios SET status = 'assinado', assinado_em = ?, visto_em = COALESCE(visto_em, ?), identificado_em = COALESCE(identificado_em, ?), metodo = 'microsoft',
      nome_assinado = ?, cpf_assinado = ?, ip = ?, aparelho = ?, local = ?, geo = ?, imagem = ? WHERE id = ? AND status = 'pendente' AND (SELECT status FROM envelopes WHERE id = ?) = 'aguardando'`)
      .bind(h, h, h, nome, digitos(c.cpf), q.ip, q.aparelho, q.local, geo, c.imagem, s.id, id).run();
    if (!r.meta?.changes) throw await falhaMudou(env, id, "Este contrato não está mais aguardando a sua assinatura (outra pessoa mudou agora). Abra o contrato de novo.");
    const hashEv = await evento(env, id, "assinou", { sid: s.id, quando: h, ip: q.ip, aparelho: q.aparelho, local: q.local,
      detalhe: await detalheAssinou("conta Microsoft " + quem.email, nome, c.cpf, c.hash_visto, c.imagem, versaoAceite, geo) });
    if (!hashEv) throw falha(410, MSG_EXCLUIDO);       // excluído pelo administrador no mesmo instante: sem recibo nem e-mails
    await mandarRecibo(env, e, s, hashEv, h);
    await depoisDeAssinar(env, req, id, s);
    return json({ envelope: await envelopeCompleto(env, id) });
  }

  if (resto === "/cancelar" && m === "POST") {
    soGestor();
    if (!criador && !quem.admin) throw falha(403, "Só quem criou o contrato (ou o administrador) pode cancelá-lo.");
    const c = await lerJson(req), motivo = limitar(c.motivo, 500);
    // soRascunho: o app desfaz um envio que não terminou — se o contrato já foi enviado (a resposta se perdeu no caminho), não cancela
    const pode = c.soRascunho ? ["rascunho"] : ["rascunho", "aguardando"];
    if (!pode.includes(e.status)) throw falha(409, c.soRascunho && e.status !== "cancelado" ? "Este contrato já foi enviado." : "Este contrato não pode mais ser cancelado (" + (STATUS_ENV[e.status] || e.status) + ").");
    const h = agora();
    const r = await env.DB.prepare(`UPDATE envelopes SET status = 'cancelado', motivo = ?, atualizado_em = ? WHERE id = ? AND status IN (${pode.map(() => "?").join(",")})`).bind(motivo || null, h, id, ...pode).run();
    if (!r.meta?.changes) throw await falhaMudou(env, id, "O contrato mudou agora (outra pessoa assinou ou mexeu nele). Abra de novo.");
    await evento(env, id, "cancelado", { quando: h, ip: q.ip, aparelho: q.aparelho, local: q.local, detalhe: [quem.email, motivo].filter(Boolean).join(" · ") });
    if (e.status === "aguardando") for (const s of await lerSigs(env, id)) {
      if (!s.notificado_em || s.status !== "pendente") continue;
      const re = await mandarEmail(env, { para: s.email, responder: e.criador_email, assunto: "Cancelado: " + e.titulo,
        html: htmlEmail({ titulo: "Documento cancelado", paragrafos: [`O documento <b>${esc(e.titulo)}</b> foi cancelado pela VPX Engenharia e não precisa mais ser assinado.`, motivo ? "Motivo: " + esc(motivo) : ""] }),
        texto: `O documento "${e.titulo}" foi cancelado pela VPX Engenharia e não precisa mais ser assinado.${motivo ? "\nMotivo: " + motivo : ""}${assinaturaTexto}` });
      await eventoEmail(env, id, "aviso_cancelamento", re, { sid: s.id, oque: "aviso de cancelamento", detalhe: mascararEmail(s.email) });
    }
    return json({ envelope: await envelopeCompleto(env, id) });
  }

  if (resto === "/final" && m === "PUT") {
    soGestor();
    if (e.status !== "concluido") throw falha(409, "O contrato ainda não foi assinado por todos.");
    if (e.hash_final) throw falha(409, "O documento final já foi gravado por outro aparelho.");
    const hf = String(req.headers.get("X-Hash-Final") || "").toLowerCase(), tam = +req.headers.get("Content-Length");
    if (!/^[0-9a-f]{64}$/.test(hf)) throw falha(400, "Falta o hash do documento final.");
    if (!req.body || !(tam > 0) || tam > MAX_FINAL) throw falha(400, "O documento final está vazio ou passa de 25 MB.");
    const tok = b64url(aleatorio(32)), th = await sha256(tok);
    const r = await env.DB.prepare("UPDATE envelopes SET hash_final = ?, final_dl = ?, atualizado_em = ? WHERE id = ? AND hash_final IS NULL").bind(hf, th, agora(), id).run();
    if (!r.meta?.changes) throw await falhaMudou(env, id, "O documento final já foi gravado por outro aparelho.");
    try { await env.PDFS.put("final:" + id, req.body); }
    catch (x) { await env.DB.prepare("UPDATE envelopes SET hash_final = NULL, final_dl = NULL WHERE id = ?").bind(id).run(); throw x; }
    // excluído enquanto a via subia: apaga a via (nada fica solto no serviço) e não manda os e-mails
    if (!(await lerEnv(env, id))) { await env.PDFS.delete("final:" + id); throw falha(410, MSG_EXCLUIDO); }
    if (!(await evento(env, id, "final_gravado", { ip: q.ip, aparelho: q.aparelho, local: q.local, detalhe: `${hf} · por ${quem.email}` }))) { await env.PDFS.delete("final:" + id); throw falha(410, MSG_EXCLUIDO); }
    const base = urlPublica(env, req), link = base + "/api/f/" + tok, verif = urlVerificacao(env, e.codigo);
    const para = new Set((await lerSigs(env, id)).map(s => (s.email || "").toLowerCase()).filter(Boolean)); para.add(e.criador_email);
    for (const pa of para) {
      const re = await mandarEmail(env, { para: pa, responder: e.criador_email, assunto: "Documento assinado por todos: " + e.titulo,
        html: htmlEmail({ titulo: "Documento assinado por todos", paragrafos: [`Todos assinaram <b>${esc(e.titulo)}</b>. Guarde a via assinada: o link para baixar vale 30 dias.`,
          `Código do documento: <b>${esc(e.codigo)}</b><br>Hash SHA-256 da via assinada:<br><span style="font-family:monospace;font-size:12px;word-break:break-all">${hf}</span>`,
          `Para conferir a autenticidade a qualquer momento: <a href="${esc(verif)}">${esc(verif)}</a>`], botao: "Baixar o documento assinado", url: link }),
        texto: `Todos assinaram "${e.titulo}".\nBaixar a via assinada (vale 30 dias): ${link}\nCódigo: ${e.codigo}\nHash SHA-256: ${hf}\nConferir: ${verif}${assinaturaTexto}` });
      await eventoEmail(env, id, "email_final", re, { oque: "via final", detalhe: mascararEmail(pa) });   // um registro por pessoa: quem recebeu a via e quem não
    }
    return json({ envelope: await envelopeCompleto(env, id) });
  }

  if (resto === "/arquivado" && m === "POST") {
    soGestor();
    const c = await lerJson(req);
    if (e.status !== "concluido") throw falha(409, "O contrato ainda não foi assinado por todos.");
    if (!e.hash_final) throw falha(409, "O documento final ainda não foi gravado no serviço.");
    if (!e.arquivado_em) {
      const h = agora();
      const r = await env.DB.prepare("UPDATE envelopes SET arquivado_em = ?, atualizado_em = ? WHERE id = ? AND arquivado_em IS NULL").bind(h, h, id).run();
      if (r.meta?.changes) await evento(env, id, "arquivado", { quando: h, ip: q.ip, aparelho: q.aparelho, local: q.local, detalhe: [limitar(c.caminho, 280), "por " + quem.email].join(" · ") });
    }
    return json({ envelope: await envelopeCompleto(env, id) });
  }
  throw falha(404, "Rota desconhecida.");
}

async function criarEnvelope(env, req, quem) {
  const c = await lerJson(req);
  const titulo = limitar(c.titulo, 200);
  if (!titulo) throw falha(400, "Falta o título do contrato.");
  const ss = Array.isArray(c.signatarios) ? c.signatarios : [];
  if (ss.length < 1 || ss.length > 10) throw falha(400, "O contrato precisa ter de 1 a 10 pessoas para assinar.");
  if (!/^[0-9a-f]{64}$/.test(String(c.hash_original || ""))) throw falha(400, "O código (hash) do documento é inválido.");
  const tamanho = Math.round(+c.tamanho || 0);
  if (!(tamanho > 0)) throw falha(400, "Falta o tamanho do PDF.");
  if (tamanho > MAX_PDF) throw falha(400, "O PDF passa de 20 MB.");
  if (c.prazo && !/^\d{4}-\d{2}-\d{2}$/.test(c.prazo)) throw falha(400, "Prazo inválido.");
  if (c.prazo && c.prazo < hojeBrasilia()) throw falha(400, "O prazo já passou.");
  const dia = await env.DB.prepare("SELECT COUNT(*) AS n FROM envelopes WHERE criador_email = ? AND criado_em > ?").bind(quem.email, somaDias(agora(), -1)).first();
  if ((dia?.n || 0) >= MAX_ENV_DIA) throw falha(429, `Limite de ${MAX_ENV_DIA} contratos por dia atingido. Tente de novo amanhã.`);
  const emails = new Set(), sigs = [];
  ss.forEach((s, i) => {
    const nome = limitar(s.nome, 120), email = limitar(s.email, 200).toLowerCase(), modo = s.modo === "app" ? "app" : s.modo === "link" ? "link" : "";
    if (!nome) throw falha(400, `Falta o nome da pessoa ${i + 1}.`);
    if (!PAPEL[s.papel]) throw falha(400, `Papel inválido para ${nome}.`);
    if (!modo) throw falha(400, `Forma de assinar inválida para ${nome}.`);
    if (modo === "link" && !emailValido(email)) throw falha(400, `E-mail inválido para ${nome}: ${email || "(vazio)"}.`);
    if (modo === "app" && !email.endsWith(DOMINIO)) throw falha(400, `${nome} assina pelo app e precisa ter e-mail da VPX.`);
    if (s.cpf && !cpfValido(s.cpf)) throw falha(400, `CPF inválido para ${nome}.`);
    if (emails.has(email)) throw falha(400, `O e-mail ${email} aparece duas vezes.`);
    emails.add(email);
    sigs.push({ id: novoId(), ordem: Math.round(+s.ordem) || i + 1, nome, email, telefone: limitar(s.telefone, 40), cpf: digitos(s.cpf) || null, papel: s.papel, modo });
  });
  const id = novoId(), h = agora();
  let meta = "{}"; try { meta = JSON.stringify(c.meta && typeof c.meta === "object" ? c.meta : {}); } catch {}
  if (meta.length > 4000) throw falha(400, "Dados extras grandes demais.");
  for (let tentativa = 0; ; tentativa++) {
    const codigo = novoCodigo();
    try {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO envelopes (id, codigo, titulo, cliente, criador_email, criador_nome, mensagem, em_ordem, prazo, lembretes, status, hash_original, paginas, tamanho, pdf_ok, criado_em, atualizado_em, meta)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'rascunho', ?, ?, ?, 0, ?, ?, ?)`)
          .bind(id, codigo, titulo, limitar(c.cliente, 200) || null, quem.email, quem.nome, limitar(c.mensagem, 2000) || null, c.em_ordem ? 1 : 0, c.prazo || null, c.lembretes === false || c.lembretes === 0 ? 0 : 1,
            c.hash_original, Math.round(+c.paginas) || null, tamanho, h, h, meta),
        ...sigs.map(s => env.DB.prepare("INSERT INTO signatarios (id, envelope_id, ordem, nome, email, telefone, cpf, papel, modo, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente')")
          .bind(s.id, id, s.ordem, s.nome, s.email, s.telefone || null, s.cpf, s.papel, s.modo))
      ]);
      break;
    } catch (x) { if (tentativa > 3 || !/UNIQUE/i.test(String(x.message))) throw x; }
  }
  const q = quemPede(req);
  await evento(env, id, "criado", { quando: h, ip: q.ip, aparelho: q.aparelho, local: q.local, detalhe: quem.email });
  return json({ envelope: await envelopeCompleto(env, id) });
}

// Excluir um contrato (só o administrador; pedido do Gustavo em 25/11/2026: "eu fiz o teste de um, assinei e agora não consigo deletar").
// Qualquer situação. Num comando só (D1 batch = uma transação): grava a lápide (id, código, título, situação de antes, quando, quem; sem
// dados pessoais) e os SHA-256 dos links do contrato (para responderem "não está mais disponível") e apaga o envelope, os signatários, os
// eventos, os códigos e as sessões. Depois apaga os PDFs do KV. Excluir de novo (dois cliques, dois aparelhos) responde a mesma lápide.
async function excluirEnvelope(env, id, quem) {
  const h = agora();
  const res = await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO excluidos (id, codigo, titulo, status_antes, excluido_em, excluido_por) SELECT id, codigo, titulo, status, ?, ? FROM envelopes WHERE id = ?").bind(h, quem.email, id),
    env.DB.prepare("INSERT OR IGNORE INTO excluidos_tokens (hash, envelope_id) SELECT token_hash, envelope_id FROM signatarios WHERE envelope_id = ? AND token_hash IS NOT NULL").bind(id),
    env.DB.prepare("INSERT OR IGNORE INTO excluidos_tokens (hash, envelope_id) SELECT final_dl, id FROM envelopes WHERE id = ? AND final_dl IS NOT NULL").bind(id),
    env.DB.prepare("DELETE FROM codigos WHERE signatario_id IN (SELECT id FROM signatarios WHERE envelope_id = ?)").bind(id),
    env.DB.prepare("DELETE FROM sessoes WHERE signatario_id IN (SELECT id FROM signatarios WHERE envelope_id = ?)").bind(id),
    env.DB.prepare("DELETE FROM eventos WHERE envelope_id = ?").bind(id),
    env.DB.prepare("DELETE FROM signatarios WHERE envelope_id = ?").bind(id),
    env.DB.prepare("DELETE FROM envelopes WHERE id = ?").bind(id)
  ]);
  const lap = await lapide(env, id);
  if (!res[res.length - 1].meta?.changes && !lap) throw falha(404, "Contrato não encontrado.");
  // Também quando já tinha sido excluído (uma 2ª tentativa limpa o que sobrou). Uma falha do KV aqui não muda a resposta: o contrato já
  // foi excluído no banco, e a tarefa diária apaga de novo os PDFs das lápides dos últimos 7 dias.
  for (const k of ["orig:" + id, "final:" + id]) { try { await env.PDFS.delete(k); } catch (e) { console.log("KV: não apagou", k, String(e?.message || e)); } }
  console.log("contrato excluído", id, lap?.codigo, "por", quem.email);
  return json({ ok: true, excluido: { id, codigo: lap?.codigo, status_antes: lap?.status_antes, excluido_em: lap?.excluido_em, excluido_por: lap?.excluido_por } });
}

/* ---------- rotas públicas: página de assinatura ---------- */
async function porToken(env, t) {
  if (typeof t !== "string" || !/^[A-Za-z0-9_-]{30,60}$/.test(t)) throw falha(404, "Este link não é válido. Confira se copiou o endereço inteiro do e-mail.");
  const th = await sha256(t);
  const s = await env.DB.prepare(`SELECT ${SIG_COLS} FROM signatarios WHERE token_hash = ?`).bind(th).first();
  if (!s) {
    if (await env.DB.prepare("SELECT 1 AS x FROM excluidos_tokens WHERE hash = ?").bind(th).first()) throw falha(410, MSG_EXCLUIDO_PUB);
    throw falha(404, "Este link não é válido. Confira se copiou o endereço inteiro do e-mail.");
  }
  const e0 = await lerEnv(env, s.envelope_id);
  if (!e0) throw falha(410, MSG_EXCLUIDO_PUB);         // excluído entre as duas leituras
  const e = await conferirPrazo(env, e0);
  return { s, e };
}
function situacaoLink(e, sigs, s) {
  if (s.status === "assinado") return ["ja_assinou", "Você já assinou este documento. Quando todos assinarem, você recebe a via assinada por e-mail."];
  if (s.status === "recusado") return ["recusou", "Você recusou este documento."];
  if (e.status === "cancelado") return ["cancelado", "Este documento foi cancelado pela VPX Engenharia e não precisa mais ser assinado."];
  if (e.status === "expirado") return ["expirado", "O prazo para assinar este documento venceu. Fale com a VPX Engenharia para receber um novo link."];
  if (e.status === "recusado") return ["recusado", "Este documento foi recusado por um dos signatários e não está mais aberto para assinatura."];
  if (e.status === "concluido") return ["concluido", "Este documento já foi assinado por todos."];
  if (e.status !== "aguardando") return ["indisponivel", "Este documento não está disponível para assinatura."];
  if (!naVez(e, sigs, s)) return ["fora_da_vez", "Ainda não é a sua vez: este documento é assinado em ordem. Você recebe um e-mail quando chegar a sua vez."];
  return ["assinar", ""];
}
async function conferirSessao(env, s, sessao) {
  if (typeof sessao !== "string" || sessao.length < 30) throw falha(401, "Confirme que é você com o código enviado por e-mail.");
  const r = await env.DB.prepare("SELECT * FROM sessoes WHERE sessao_hash = ?").bind(await sha256(sessao)).first();
  if (!r || r.signatario_id !== s.id || r.expira < agora()) throw falha(401, "A confirmação venceu. Peça um novo código para continuar.");
}
async function rotaPublica(env, req, url) {
  const p = url.pathname, q = quemPede(req);
  if (req.method !== "POST") throw falha(405, "Método não permitido.");
  const c = await lerJson(req);
  const { s, e } = await porToken(env, c.t);
  const sigs = await lerSigs(env, e.id), [estado, msgEstado] = situacaoLink(e, sigs, s);
  const onde = { ip: q.ip, aparelho: q.aparelho, local: q.local };

  if (p === "/api/s/info") {
    if (!s.visto_em) {
      const h = agora();
      const r = await env.DB.prepare("UPDATE signatarios SET visto_em = ? WHERE id = ? AND visto_em IS NULL").bind(h, s.id).run();
      if (r.meta?.changes) await evento(env, e.id, "visualizou", { sid: s.id, quando: h, ...onde });
    }
    return json({ titulo: e.titulo, codigo: e.codigo, remetente: e.criador_nome || "VPX Engenharia", remetente_email: e.criador_email, mensagem: e.mensagem || "", prazo: e.prazo,
      situacao: e.status, estado, mensagem_estado: msgEstado, paginas: e.paginas, tamanho: e.tamanho, hash: e.hash_original, pdf_disponivel: !e.pdfs_apagados_em,
      eu: { nome: s.nome, papel: s.papel, email: mascararEmail(s.email), cpf_exigido: !!s.cpf, status: s.status, assinado_em: s.assinado_em },
      outros: sigs.filter(x => x.id !== s.id).map(x => ({ nome: x.nome, papel: x.papel, status: x.status })), em_ordem: !!e.em_ordem, aceite: { versao: "aceite-v1", texto: ACEITES["aceite-v1"] } });
  }
  if (estado !== "assinar") throw falha(409, msgEstado);

  if (p === "/api/s/codigo") {
    const h = agora(), umaHora = somaDias(h, -1 / 24), umMinuto = somaDias(h, -1 / 1440), codigo = codigo6();
    const antes = await env.DB.prepare("SELECT codigo_hash, expira, tentativas, ultimo_envio FROM codigos WHERE signatario_id = ?").bind(s.id).first();
    // reserva o envio num comando só (pedidos ao mesmo tempo não passam juntos do limite): 1 por minuto e 5 por hora
    const res = await env.DB.prepare(`INSERT INTO codigos (signatario_id, codigo_hash, expira, tentativas, envios, ultimo_envio, janela_inicio) VALUES (?1, ?2, ?3, 0, 1, ?4, ?4)
      ON CONFLICT(signatario_id) DO UPDATE SET codigo_hash = ?2, expira = ?3, tentativas = 0, ultimo_envio = ?4,
        envios = CASE WHEN janela_inicio IS NULL OR janela_inicio < ?5 THEN 1 ELSE envios + 1 END,
        janela_inicio = CASE WHEN janela_inicio IS NULL OR janela_inicio < ?5 THEN ?4 ELSE janela_inicio END
      WHERE (ultimo_envio IS NULL OR ultimo_envio < ?6) AND (envios < 5 OR janela_inicio IS NULL OR janela_inicio < ?5)
      RETURNING envios`).bind(s.id, await sha256(s.id + ":" + codigo), somaDias(h, 10 / 1440), h, umaHora, umMinuto).first();
    if (!res) {
      const x = await env.DB.prepare("SELECT ultimo_envio FROM codigos WHERE signatario_id = ?").bind(s.id).first();
      throw falha(429, x?.ultimo_envio && x.ultimo_envio >= umMinuto ? "Já mandamos um código há menos de um minuto. Digite o que chegou no seu e-mail ou espere um minuto para pedir outro." : "Muitos códigos pedidos em uma hora. Tente de novo mais tarde.");
    }
    const r = await mandarEmail(env, { para: s.email, assunto: `${codigo} é o seu código para assinar: ${e.titulo}`,
      html: htmlEmail({ titulo: "Seu código de verificação", paragrafos: [`Use este código para confirmar que é você e assinar <b>${esc(e.titulo)}</b>:`,
        `<span style="font-size:30px;letter-spacing:6px;font-weight:700;color:#1C3C61">${codigo}</span>`, "O código vale 10 minutos."], rodape: "Se não foi você quem pediu, ignore este e-mail." }),
      texto: `Seu código para assinar "${e.titulo}": ${codigo}\nVale 10 minutos. Se não foi você quem pediu, ignore este e-mail.${assinaturaTexto}` });
    if (!r.ok) {                                     // não saiu: volta o código anterior (se havia) e libera um novo pedido
      await env.DB.prepare("UPDATE codigos SET codigo_hash = ?, expira = ?, tentativas = ?, ultimo_envio = ? WHERE signatario_id = ? AND ultimo_envio = ?")
        .bind(antes?.codigo_hash || null, antes?.expira || null, antes?.tentativas || 0, antes?.ultimo_envio || null, s.id, h).run();
      await eventoEmail(env, e.id, "codigo_enviado", r, { sid: s.id, ...onde, oque: "código", detalhe: mascararEmail(s.email) });
      throw falha(503, "Não foi possível mandar o e-mail com o código agora. Tente de novo em instantes.");
    }
    await eventoEmail(env, e.id, "codigo_enviado", r, { sid: s.id, quando: h, ...onde, detalhe: mascararEmail(s.email) });
    return json({ ok: true, email: mascararEmail(s.email), ...(env.MODO_TESTE === "1" ? { codigo_teste: codigo } : {}) });
  }

  if (p === "/api/s/verificar") {
    const h = agora(), digitado = digitos(c.codigo);
    // gasta a tentativa antes de comparar, num comando só: pedidos ao mesmo tempo não passam das 5 tentativas
    const cod = await env.DB.prepare("UPDATE codigos SET tentativas = tentativas + 1 WHERE signatario_id = ? AND codigo_hash IS NOT NULL AND tentativas < 5 AND expira > ? RETURNING codigo_hash, tentativas")
      .bind(s.id, h).first();
    if (!cod) {
      const x = await env.DB.prepare("SELECT codigo_hash, tentativas FROM codigos WHERE signatario_id = ?").bind(s.id).first();
      if (!x?.codigo_hash) throw falha(400, "Peça o código primeiro.");
      if (x.tentativas >= 5) throw falha(429, "Muitas tentativas erradas. Peça um novo código.");
      throw falha(400, "O código venceu. Peça um novo.");
    }
    if (digitado.length !== 6 || await sha256(s.id + ":" + digitado) !== cod.codigo_hash) {
      await evento(env, e.id, "codigo_errado", { sid: s.id, quando: h, ...onde });
      const resta = 5 - cod.tentativas;
      throw falha(400, resta > 0 ? `Código errado. ${resta === 1 ? "Resta 1 tentativa" : "Restam " + resta + " tentativas"}.` : "Código errado. Peça um novo código.");
    }
    // acertou: o código vale uma vez só — só cria a sessão o pedido que conseguiu apagá-lo
    const apagou = await env.DB.prepare("UPDATE codigos SET codigo_hash = NULL WHERE signatario_id = ? AND codigo_hash = ?").bind(s.id, cod.codigo_hash).run();
    if (!apagou.meta?.changes) throw falha(409, "Este código já foi usado. Peça um novo.");
    const sessao = b64url(aleatorio(32));
    await env.DB.batch([
      env.DB.prepare("INSERT INTO sessoes (sessao_hash, signatario_id, expira) VALUES (?, ?, ?)").bind(await sha256(sessao), s.id, somaDias(h, 2 / 24)),
      env.DB.prepare("UPDATE signatarios SET identificado_em = ? WHERE id = ?").bind(h, s.id)
    ]);
    await evento(env, e.id, "identificou", { sid: s.id, quando: h, ...onde, detalhe: "código enviado ao e-mail " + mascararEmail(s.email) });
    return json({ sessao, expira: somaDias(h, 2 / 24) });
  }

  await conferirSessao(env, s, c.sessao);

  if (p === "/api/s/pdf") {
    const obj = await env.PDFS.get("orig:" + e.id, "stream");
    if (!obj) throw falha(410, "O documento não está mais disponível no serviço.");
    // a entrega do documento fica na trilha (hora, IP, aparelho e o hash do que foi entregue)
    await evento(env, e.id, "abriu_documento", { sid: s.id, ...onde, detalhe: "documento entregue pelo link (SHA-256 " + e.hash_original + ")" });
    return new Response(obj, { headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store" } });
  }
  if (p === "/api/s/assinar") {
    const versaoAceite = conferirAceite(c);
    if (c.hash_visto !== e.hash_original) throw falha(409, "O documento que você viu é diferente do original. Recarregue a página.");
    const nome = limitar(c.nome, 120).replace(/\s+/g, " ");
    if (nome.split(" ").length < 2) throw falha(400, "Escreva o seu nome completo.");
    if (!nomeImprimivel(nome)) throw falha(400, "O nome tem letras que o documento assinado não consegue mostrar. Escreva o nome sem elas (ex.: L no lugar de Ł).");
    if (!cpfValido(c.cpf)) throw falha(400, "CPF inválido. Confira os números.");
    if (s.cpf && digitos(s.cpf) !== digitos(c.cpf)) throw falha(400, "Este CPF é diferente do informado pela VPX para esta assinatura.");
    conferirImagem(c.imagem);
    const h = agora(), geo = conferirGeo(c.geo);
    // só grava se o contrato ainda espera assinaturas (cancelamento ou recusa no mesmo instante: não assina)
    const r = await env.DB.prepare(`UPDATE signatarios SET status = 'assinado', assinado_em = ?, metodo = 'codigo-email', nome_assinado = ?, cpf_assinado = ?, ip = ?, aparelho = ?, local = ?, geo = ?, imagem = ?
      WHERE id = ? AND status = 'pendente' AND (SELECT status FROM envelopes WHERE id = ?) = 'aguardando'`).bind(h, nome, digitos(c.cpf), q.ip, q.aparelho, q.local, geo, c.imagem, s.id, e.id).run();
    if (!r.meta?.changes) throw (await lapide(env, e.id)) ? falha(410, MSG_EXCLUIDO_PUB) : falha(409, "Este documento não está mais esperando a sua assinatura (ele mudou agora). Recarregue a página.");
    const hashEv = await evento(env, e.id, "assinou", { sid: s.id, quando: h, ...onde,
      detalhe: await detalheAssinou("código enviado ao e-mail " + mascararEmail(s.email), nome, c.cpf, c.hash_visto, c.imagem, versaoAceite, geo) });
    if (!hashEv) throw falha(410, MSG_EXCLUIDO_PUB);   // excluído no mesmo instante: sem recibo nem e-mails
    await mandarRecibo(env, e, s, hashEv, h);
    const todos = await depoisDeAssinar(env, req, e.id, s);
    return json({ ok: true, todos, registro: hashEv });
  }
  if (p === "/api/s/recusar") {
    const motivo = limitar(c.motivo, 500);
    if (!motivo) throw falha(400, "Escreva o motivo da recusa.");
    const h = agora();
    // o signatário e o contrato só mudam se o contrato ainda espera assinaturas (assinar e recusar ao mesmo tempo, ou um cancelamento no meio)
    const [r1] = await env.DB.batch([
      env.DB.prepare("UPDATE signatarios SET status = 'recusado', recusa_motivo = ?, ip = ?, aparelho = ?, local = ? WHERE id = ? AND status = 'pendente' AND (SELECT status FROM envelopes WHERE id = ?) = 'aguardando'")
        .bind(motivo, q.ip, q.aparelho, q.local, s.id, e.id),
      env.DB.prepare("UPDATE envelopes SET status = 'recusado', motivo = ?, atualizado_em = ? WHERE id = ? AND status = 'aguardando' AND (SELECT status FROM signatarios WHERE id = ?) = 'recusado'")
        .bind(`${s.nome}: ${motivo}`, h, e.id, s.id)
    ]);
    if (!r1.meta?.changes) throw (await lapide(env, e.id)) ? falha(410, MSG_EXCLUIDO_PUB) : falha(409, "Este documento não está mais aberto para assinatura (ele mudou agora). Recarregue a página.");
    await evento(env, e.id, "recusou", { sid: s.id, quando: h, ...onde, detalhe: motivo });
    await avisarCriador(env, e, `${s.nome} recusou: ${e.titulo}`, "Documento recusado", `<b>${esc(s.nome)}</b> recusou <b>${esc(e.titulo)}</b>.<br>Motivo: ${esc(motivo)}`);
    return json({ ok: true });
  }
  throw falha(404, "Rota desconhecida.");
}

/* ---------- verificação e download da via final ---------- */
// sem e-mail, CPF, IP nem os detalhes dos eventos: só o necessário para conferir (inclusive o hash do último evento da trilha)
async function rotaVerificar(env, codigo) {
  const cod = normCodigo(codigo);
  const e = cod && await env.DB.prepare("SELECT * FROM envelopes WHERE codigo = ?").bind(cod).first();
  if (!e && cod) {                                   // excluído pelo administrador: só a data (sem título, nomes nem hashes)
    const x = await env.DB.prepare("SELECT excluido_em, status_antes FROM excluidos WHERE codigo = ?").bind(cod).first();
    if (x && x.status_antes !== "rascunho") return json({ erro: `Este documento foi excluído pelo administrador da VPX Engenharia em ${dataBR(new Date(Date.parse(x.excluido_em) - 3 * 3600000).toISOString())} e não pode mais ser conferido por este serviço.`, excluido: true, excluido_em: x.excluido_em }, 410);
  }
  if (!e || e.status === "rascunho") throw falha(404, "Nenhum documento com este código.");
  const sigs = await lerSigs(env, e.id);
  const ult = await env.DB.prepare("SELECT hash, quando, (SELECT COUNT(*) FROM eventos WHERE envelope_id = ?1) AS total FROM eventos WHERE envelope_id = ?1 ORDER BY seq DESC LIMIT 1").bind(e.id).first();
  return json({ codigo: e.codigo, titulo: e.titulo, situacao: e.status, criado_em: e.criado_em, enviado_em: e.enviado_em, concluido_em: e.concluido_em,
    hash_original: e.hash_original, hash_final: e.hash_final, paginas: e.paginas, emissor: "VPX Engenharia",
    trilha: ult ? { eventos: ult.total, ultimo_hash: ult.hash, ultimo_em: ult.quando } : null,
    signatarios: sigs.map(s => ({ nome: s.status === "assinado" ? (s.nome_assinado || s.nome) : s.nome, papel: s.papel, status: s.status, assinado_em: s.assinado_em,
      metodo: s.metodo === "microsoft" ? "conta Microsoft da VPX" : s.metodo === "codigo-email" ? "código enviado ao e-mail" : null })) });
}
async function rotaFinal(env, req, tok) {
  if (!/^[A-Za-z0-9_-]{30,60}$/.test(tok)) throw falha(404, "Link inválido.");
  const th = await sha256(tok);
  const e = await env.DB.prepare("SELECT * FROM envelopes WHERE final_dl = ?").bind(th).first();
  if (!e) {
    if (await env.DB.prepare("SELECT 1 AS x FROM excluidos_tokens WHERE hash = ?").bind(th).first()) throw falha(410, "Esta via assinada não está mais disponível: o documento foi excluído pela VPX Engenharia.");
    throw falha(404, "Link inválido.");
  }
  const ev = await env.DB.prepare("SELECT quando FROM eventos WHERE envelope_id = ? AND tipo = 'final_gravado' ORDER BY seq LIMIT 1").bind(e.id).first();
  if (ev && Date.parse(ev.quando) < Date.now() - 30 * 864e5) throw falha(410, "Este link venceu (vale 30 dias). Peça a via assinada à VPX Engenharia.");
  const obj = await env.PDFS.get("final:" + e.id, "stream");
  if (!obj) throw falha(410, "A via assinada não está mais no serviço. Peça-a à VPX Engenharia.");
  const q = quemPede(req);
  await evento(env, e.id, "baixou_final", { ip: q.ip, aparelho: q.aparelho, local: q.local });
  const nome = `${e.titulo} - assinado.pdf`.replace(/[\\/:*?"<>|]+/g, "-"), ascii = nome.normalize("NFD").replace(/[^\x20-\x7e]/g, "").replace(/"/g, "");
  return new Response(obj, { headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome)}` } });
}

/* ---------- tarefa diária ---------- */
async function tarefaDiaria(env) {
  await prepararBanco(env);
  const req = new Request(String(env.URL_PUBLICA || "https://localhost"));
  const hoje = hojeBrasilia(), h = agora();
  // prazos vencidos
  for (const e of (await env.DB.prepare("SELECT * FROM envelopes WHERE status = 'aguardando' AND prazo IS NOT NULL AND prazo < ?").bind(hoje).all()).results) await conferirPrazo(env, e);
  // pedidos cujo e-mail não saiu (notificado_em vazio): tenta de novo; lembretes a cada 3 dias (no máximo 5 por pessoa)
  const tres = somaDias(h, -3 + 1 / 24);
  let lembretes = 0;
  for (const e of (await env.DB.prepare("SELECT * FROM envelopes WHERE status = 'aguardando'").all()).results) {
    const sigs = await lerSigs(env, e.id);
    await chamarQuemEstaNaVez(env, req, e, sigs);
    if (!e.lembretes) continue;
    for (const s of sigs) {
      if (s.modo !== "link" || !naVez(e, sigs, s)) continue;
      const ultimo = s.lembrado_em || s.notificado_em;
      if (!ultimo || ultimo > tres) continue;
      const n = (await env.DB.prepare("SELECT COUNT(*) AS n FROM eventos WHERE signatario_id = ? AND tipo = 'lembrete'").bind(s.id).first()).n;
      if (n >= 5) continue;
      const r = await mandarEmail(env, emailPedido(env, e, s, await linkDe(env, req, s), true));
      if (r.ok) { lembretes++; await env.DB.prepare("UPDATE signatarios SET lembrado_em = ? WHERE id = ?").bind(agora(), s.id).run(); }
      await eventoEmail(env, e.id, "lembrete", r, { sid: s.id, oque: "lembrete automático", detalhe: "automático" });
    }
  }
  // limpeza: rascunhos com mais de 2 dias, sessões e códigos vencidos
  const rasc = (await env.DB.prepare("SELECT id FROM envelopes WHERE status = 'rascunho' AND criado_em < ?").bind(somaDias(h, -2)).all()).results;
  for (const { id } of rasc) {
    await env.PDFS.delete("orig:" + id);
    await env.DB.batch([env.DB.prepare("DELETE FROM eventos WHERE envelope_id = ?").bind(id), env.DB.prepare("DELETE FROM signatarios WHERE envelope_id = ?").bind(id), env.DB.prepare("DELETE FROM envelopes WHERE id = ?").bind(id)]);
  }
  await env.DB.batch([env.DB.prepare("DELETE FROM sessoes WHERE expira < ?").bind(h), env.DB.prepare("DELETE FROM codigos WHERE expira < ? AND (ultimo_envio IS NULL OR ultimo_envio < ?)").bind(h, somaDias(h, -1 / 24))]);
  // PDFs que já não precisam ficar no serviço (o banco e os hashes ficam, para a verificação)
  const trinta = somaDias(h, -30);
  const velhos = (await env.DB.prepare(`SELECT id FROM envelopes WHERE pdfs_apagados_em IS NULL AND ((arquivado_em IS NOT NULL AND arquivado_em < ?)
    OR (status IN ('cancelado', 'recusado', 'expirado') AND atualizado_em < ?))`).bind(trinta, trinta).all()).results;
  for (const { id } of velhos) {
    await env.PDFS.delete("orig:" + id); await env.PDFS.delete("final:" + id);
    await env.DB.prepare("UPDATE envelopes SET pdfs_apagados_em = ? WHERE id = ?").bind(agora(), id).run();
  }
  // Contratos excluídos nos últimos 7 dias: apaga de novo os PDFs (se o KV falhou na hora da exclusão, não ficam sem dono; apagar uma
  // chave que não existe não dá erro).
  const exc = (await env.DB.prepare("SELECT id FROM excluidos WHERE excluido_em >= ?").bind(somaDias(h, -7)).all()).results || [];
  for (const { id } of exc) for (const k of ["orig:" + id, "final:" + id]) { try { await env.PDFS.delete(k); } catch {} }
  // LGPD: contratos que não valeram (cancelados, recusados, com o prazo vencido) não guardam dados pessoais depois de 90 dias
  // (imagem da assinatura, CPF, telefone, IP, aparelho, local e localização). Ficam nomes, situações e hashes.
  const limpos = await env.DB.prepare(`UPDATE signatarios SET imagem = NULL, cpf = NULL, cpf_assinado = NULL, telefone = NULL, ip = NULL, aparelho = NULL, local = NULL, geo = NULL
    WHERE (imagem IS NOT NULL OR cpf IS NOT NULL OR cpf_assinado IS NOT NULL OR telefone IS NOT NULL OR ip IS NOT NULL OR geo IS NOT NULL)
      AND envelope_id IN (SELECT id FROM envelopes WHERE status IN ('cancelado', 'recusado', 'expirado') AND atualizado_em < ?)`).bind(somaDias(h, -90)).run();
  return { expirados: "ok", lembretes, rascunhosApagados: rasc.length, pdfsApagados: velhos.length, dadosApagados: limpos.meta?.changes || 0 };
}

/* ---------- entrada ---------- */
export default {
  async fetch(req, env) {
    if (!env.URL_PUBLICA) env = { ...env, URL_PUBLICA: new URL(req.url).origin };   // endereço do QR e dos e-mails: sempre o URL_PUBLICA
    const url = new URL(req.url), p = url.pathname, cors = cabecalhosCors(env, req);
    const origem = req.headers.get("Origin");
    try {
      if (p === "/assinar" && req.method === "GET") return await pagina(PAGINA_ASSINAR);
      if ((p === "/v" || p === "/v/" || /^\/v\/[A-Za-z0-9-]{1,20}$/.test(p)) && req.method === "GET") return await pagina(PAGINA_VERIFICAR);
      if (p === "/" && req.method === "GET") return Response.redirect(url.origin + "/v", 302);
      if (p === "/favicon.ico") return Response.redirect("https://vpxengenharia.github.io/vpx-visitas/icone-192.png", 302);
      if (!p.startsWith("/api/")) throw falha(404, "Página não encontrada.");
      await prepararBanco(env);
      // rotas públicas: só a própria página (mesma origem) as chama pelo navegador
      if (/^\/api\/(s|v|f)\//.test(p)) {
        if (origem && origem !== url.origin && origem !== new URL(urlPublica(env, req)).origin) throw falha(403, "Origem não permitida.");
        if (p.startsWith("/api/s/")) return await rotaPublica(env, req, url);
        if (p.startsWith("/api/v/") && req.method === "GET") return await rotaVerificar(env, decodeURIComponent(p.slice(7)));
        if (p.startsWith("/api/f/") && req.method === "GET") return await rotaFinal(env, req, p.slice(7));
        throw falha(404, "Rota desconhecida.");
      }
      if (p === "/api/teste/emails" && env.MODO_TESTE === "1") {
        if (req.method === "DELETE") { await env.PDFS.delete("teste:emails"); return json({ ok: true }, 200, cors); }
        return json((await env.PDFS.get("teste:emails", "json")) || [], 200, cors);
      }
      if (p === "/api/teste/cron" && env.MODO_TESTE === "1" && req.method === "POST") return json(await tarefaDiaria(env), 200, cors);
      // rotas do app: CORS só para as origens do app
      if (origem && !origemPermitida(env, origem)) throw falha(403, "Origem não permitida.");
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
      const quem = await autenticar(env, req);
      const r = await rotaApp(env, req, url, quem);
      for (const [k, v] of Object.entries(cors)) r.headers.set(k, v);
      return r;
    } catch (x) {
      if (x instanceof ErroHttp) return json({ erro: x.message }, x.status, x.status === 403 && /Origem/.test(x.message) ? {} : cors);
      console.error(x?.stack || x);
      return json({ erro: "Erro no serviço de assinatura. Tente de novo daqui a pouco." }, 500, cors);
    }
  },
  async scheduled(evento, env, ctx) { ctx.waitUntil(tarefaDiaria(env)); }
};
