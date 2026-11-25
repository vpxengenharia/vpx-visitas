// "npm test": sobe o wrangler dev em modo de teste numa porta própria (8788), com banco e KV novos numa pasta temporária,
// roda o teste de ponta a ponta (test/ponta-a-ponta.mjs) e desliga o servidor.
import { spawn, execSync } from "node:child_process";
import { existsSync, copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
if (!existsSync(join(raiz, ".dev.vars"))) copyFileSync(join(raiz, ".dev.vars.exemplo"), join(raiz, ".dev.vars"));
const PORTA = 8788, BASE = `http://localhost:${PORTA}`;
const estado = mkdtempSync(join(tmpdir(), "vpx-assinatura-teste-"));
const wr = spawn(`npx wrangler dev --port ${PORTA} --local --persist-to "${estado}" --var URL_PUBLICA:${BASE} --show-interactive-dev-session=false`,
  { cwd: raiz, shell: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });
let log = "";
wr.stdout.on("data", d => log += d); wr.stderr.on("data", d => log += d);
function parar() {
  try { if (process.platform === "win32") execSync(`taskkill /pid ${wr.pid} /T /F`, { stdio: "ignore" }); else wr.kill("SIGTERM"); } catch {}
  try { rmSync(estado, { recursive: true, force: true }); } catch {}
}
let codigo = 1;
try {
  let pronto = false;
  for (let i = 0; i < 90 && !pronto; i++) {
    await new Promise(r => setTimeout(r, 1000));
    try { pronto = (await fetch(BASE + "/v")).ok; } catch {}
  }
  if (!pronto) { console.error("O wrangler dev não subiu:\n" + log.slice(-3000)); throw new Error("sem servidor"); }
  const t = spawn(process.execPath, [join(raiz, "test", "ponta-a-ponta.mjs")], { stdio: "inherit", env: { ...process.env, BASE } });
  codigo = await new Promise(ok => t.on("exit", ok));
  if (codigo) console.error("\n--- final do registro do wrangler ---\n" + log.split("\n").filter(l => /error|exception|✘/i.test(l)).slice(-20).join("\n"));
} finally { parar(); }
process.exit(codigo);
