// "npm run configurar": prepara o servidor de assinatura na conta da Cloudflare (uma vez só). Referência: docs/assinatura-contratos.md.
// 1) login na Cloudflare (abre o navegador), 2) cria o banco D1 e o espaço KV e põe os ids no wrangler.toml, 3) cria as tabelas,
// 4) publica, 5) grava os segredos (CHAVE_LINKS gerada aqui; RESEND_KEY se vier na variável de ambiente RESEND_KEY),
// 6) põe o endereço publicado em URL_PUBLICA e publica de novo. Pode ser rodado de novo: o que já existe é mantido.
// Ainda não foi rodado contra uma conta de verdade (sem conta da Cloudflare no teste).
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = dirname(fileURLToPath(import.meta.url)), TOML = join(raiz, "wrangler.toml");
const sh = (cmd, op = {}) => execSync(cmd, { cwd: raiz, encoding: "utf8", stdio: op.mostrar ? "inherit" : ["pipe", "pipe", "pipe"], input: op.entrada });
const toml = () => readFileSync(TOML, "utf8");
const trocar = (re, novo) => writeFileSync(TOML, toml().replace(re, novo));

console.log("1. Login na Cloudflare");
try { if (/not authenticated/i.test(sh("npx wrangler whoami"))) throw 0; }
catch { sh("npx wrangler login", { mostrar: true }); }

console.log("2. Banco D1 e espaço KV");
if (/database_id = "a-definir"/.test(toml())) {
  const out = sh("npx wrangler d1 create vpx-assinatura");
  const id = out.match(/database_id"?\s*[=:]\s*"([0-9a-f-]{36})"/)?.[1];
  if (!id) throw new Error("Não achei o id do banco na resposta:\n" + out);
  trocar(/database_id = "a-definir"/, `database_id = "${id}"`); console.log("   banco:", id);
}
if (/\nid = "a-definir"/.test(toml())) {
  const out = sh("npx wrangler kv namespace create PDFS");
  const id = out.match(/id"?\s*[=:]\s*"([0-9a-f]{32})"/)?.[1];
  if (!id) throw new Error("Não achei o id do KV na resposta:\n" + out);
  trocar(/\nid = "a-definir"/, `\nid = "${id}"`); console.log("   KV:", id);
}

console.log("3. Tabelas");
try { sh("npx wrangler d1 execute vpx-assinatura --remote --command \"SELECT 1 FROM envelopes LIMIT 1\""); console.log("   já existem"); }
catch { sh("npx wrangler d1 execute vpx-assinatura --remote --file schema.sql --yes", { mostrar: true }); }

console.log("4. Publicar");
const pub = sh("npx wrangler deploy");
const url = pub.match(/https:\/\/vpx-assinatura\.[a-z0-9-]+\.workers\.dev/)?.[0];
console.log("   endereço:", url || "(não achei na resposta)");

console.log("5. Segredos");
const segredos = (() => { try { return JSON.parse(sh("npx wrangler secret list --format json")).map(s => s.name); } catch { return []; } })();
if (!segredos.includes("CHAVE_LINKS")) { sh("npx wrangler secret put CHAVE_LINKS", { entrada: randomBytes(32).toString("base64") + "\n" }); console.log("   CHAVE_LINKS criada (não precisa guardar)"); }
if (process.env.RESEND_KEY) { sh("npx wrangler secret put RESEND_KEY", { entrada: process.env.RESEND_KEY.trim() + "\n" }); console.log("   RESEND_KEY gravada"); }
else if (!segredos.includes("RESEND_KEY")) console.log("   Falta a RESEND_KEY: rode de novo com RESEND_KEY=<chave da Resend> (sem ela os e-mails não saem).");

if (url && !toml().includes(`URL_PUBLICA = "${url}"`)) {
  console.log("6. Endereço público no wrangler.toml e nova publicação");
  trocar(/URL_PUBLICA = "[^"]*"/, `URL_PUBLICA = "${url}"`);
  sh("npx wrangler deploy", { mostrar: true });
}
console.log(`\nPronto. No app (index.html), CONFIG.assinaturaUrl = "${url || "<endereço do Worker>"}".`);
