// Teste de ponta a ponta do servidor de assinatura (rodado pelo "npm test", com o wrangler dev em modo de teste).
// Faz o que o app e a página pública fazem, pela API: cria, sobe o PDF, envia, abre o link, pede e confere o código,
// baixa o PDF, assina (link e app), conclui, sobe o final, verifica e baixa; e os casos de erro.
import { createPrivateKey, createSign, createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:8788";
const chave = JSON.parse(readFileSync(new URL("./chave-teste.json", import.meta.url)));
const TENANT = "923857d2-a4ca-4360-a259-69078844e9d2", CLIENT = "76fc51aa-584c-443a-9170-bf123e698cfe";
const GUS = "gustavoponchio@vpxengenharia.com.br", WILL = "williamreis@vpxengenharia.com.br";
let falhas = 0, passos = 0;
const ok = (cond, txt, extra = "") => { passos++; if (cond) console.log("  ok  " + txt); else { falhas++; console.log("  FALHOU  " + txt + (extra ? " → " + extra : "")); } };
const b64u = b => Buffer.from(b).toString("base64url");
const sha = b => createHash("sha256").update(b).digest("hex");
function jwt(claims, op = {}) {
  const t = Math.floor(Date.now() / 1000);
  const corpo = { aud: CLIENT, tid: TENANT, iss: `https://login.microsoftonline.com/${TENANT}/v2.0`, iat: t, nbf: t, exp: t + 3600, ...claims };
  const ini = b64u(JSON.stringify({ alg: "RS256", typ: "JWT", kid: op.kid || chave.kid })) + "." + b64u(JSON.stringify(corpo));
  const s = createSign("RSA-SHA256"); s.update(ini);
  return ini + "." + s.sign(createPrivateKey({ key: chave.privada, format: "jwk" })).toString("base64url");
}
const tokGus = jwt({ preferred_username: GUS, name: "Gustavo Ponchio" }), tokWill = jwt({ preferred_username: WILL, name: "William Reis" });
async function api(caminho, op = {}) {
  const h = { ...(op.tok !== null ? { Authorization: "Bearer " + (op.tok || tokGus) } : {}), ...(op.headers || {}) };
  let body = op.body;
  if (op.json !== undefined) { h["Content-Type"] = "application/json"; body = JSON.stringify(op.json); }
  const r = await fetch(BASE + caminho, { method: op.method || (op.json !== undefined ? "POST" : "GET"), headers: h, body });
  const tipo = r.headers.get("Content-Type") || "";
  const dados = tipo.includes("json") ? await r.json() : new Uint8Array(await r.arrayBuffer());
  return { st: r.status, d: dados, h: r.headers };
}
const pub = (rota, corpo) => api("/api/s/" + rota, { tok: null, json: corpo });
const emails = async () => (await api("/api/teste/emails", { tok: null })).d;
const tokenDe = url => new URL(url).hash.replace("#t=", "");
// um PDF mínimo válido
function pdf(texto) {
  const objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    null, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  const conteudo = `BT /F1 18 Tf 72 760 Td (${texto}) Tj ET`;
  objs[3] = `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`;
  let s = "%PDF-1.4\n", offs = [];
  objs.forEach((o, i) => { offs.push(s.length); s += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = s.length;
  s += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, "0") + " 00000 n \n").join("") + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(s, "latin1"));
}
const IMG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
async function criarEnviado(titulo, sigs, extra = {}) {
  const bytes = pdf(titulo);
  const c = await api("/api/envelopes", { json: { titulo, cliente: "Cliente Teste", mensagem: "Segue para assinatura.", em_ordem: 0, lembretes: 1, hash_original: sha(bytes), paginas: 1, tamanho: bytes.length, meta: { teste: true }, signatarios: sigs, ...extra } });
  if (c.st !== 200) throw new Error("criar: " + JSON.stringify(c.d));
  const id = c.d.envelope.id;
  const u = await api(`/api/envelopes/${id}/pdf`, { method: "PUT", body: bytes, headers: { "Content-Type": "application/pdf" } });
  if (u.st !== 200) throw new Error("pdf: " + JSON.stringify(u.d));
  const en = await api(`/api/envelopes/${id}/enviar`, { json: {} });
  if (en.st !== 200) throw new Error("enviar: " + JSON.stringify(en.d));
  return { id, bytes, env: en.d.envelope, links: en.d.links };
}
// confere a trilha encadeada (versão 2): base ligada ao contrato e ao original; cada evento aponta para o anterior
function cadeiaOk(env) {
  let ant = sha(`vpx-assinatura-v2|${env.id}|${env.codigo}|${env.hash_original}`);
  for (const e of env.eventos) {
    if (e.anterior !== ant) return false;
    const h = sha(ant + "|" + JSON.stringify([env.id, e.tipo, e.quando, e.signatario_id || "", e.ip || "", e.aparelho || "", e.local || "", e.detalhe || ""]));
    if (h !== e.hash) return false;
    ant = h;
  }
  return true;
}
// PNG só com o cabeçalho (largura e altura escolhidas): para testar o limite de pixels da assinatura
function pngCom(w, h) {
  const b = Buffer.alloc(33); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(b); b.writeUInt32BE(13, 8); b.write("IHDR", 12, "latin1"); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); b[24] = 8; b[25] = 6;
  return "data:image/png;base64," + Buffer.concat([b, Buffer.alloc(30)]).toString("base64");
}
async function identificar(t) {
  const c = await pub("codigo", { t });
  const v = await pub("verificar", { t, codigo: c.d.codigo_teste });
  return v.d.sessao;
}

console.log("Servidor:", BASE);
await api("/api/teste/emails", { tok: null, method: "DELETE" });

console.log("\n1. Login e origem");
{
  ok((await api("/api/envelopes", { tok: tokGus })).st === 200, "id_token RS256 de teste aceito");
  ok((await api("/api/envelopes", { tok: "teste:" + GUS + "|Gustavo Ponchio" })).st === 200, "atalho teste:<email>|<nome> aceito no modo de teste");
  ok((await api("/api/envelopes", { tok: jwt({ preferred_username: GUS, exp: Math.floor(Date.now() / 1000) - 3600 }) })).st === 401, "id_token vencido recusado");
  ok((await api("/api/envelopes", { tok: jwt({ preferred_username: GUS, tid: "11111111-2222-3333-4444-555555555555", iss: "https://login.microsoftonline.com/11111111-2222-3333-4444-555555555555/v2.0" }) })).st === 401, "id_token de outro tenant recusado");
  ok((await api("/api/envelopes", { tok: jwt({ preferred_username: GUS, aud: "outro-app" }) })).st === 401, "id_token de outro app recusado");
  const adulterado = tokGus.split("."); adulterado[1] = b64u(JSON.stringify({ ...JSON.parse(Buffer.from(adulterado[1], "base64url")), preferred_username: "intruso@vpxengenharia.com.br" }));
  ok((await api("/api/envelopes", { tok: adulterado.join(".") })).st === 401, "id_token adulterado recusado");
  ok((await api("/api/envelopes", { tok: null })).st === 401, "sem login recusado");
  ok((await api("/api/envelopes", { tok: jwt({ preferred_username: "estranho@gmail.com", name: "Estranho", idp: "mail" }) })).st === 403, "convidado (e-mail de fora, claim idp) recusado");
  ok((await api("/api/envelopes", { tok: jwt({ preferred_username: "tecnico@vpxengenharia.com.br", idp: "https://sts.windows.net/x/" }) })).st === 403, "convidado com e-mail parecido com o da VPX (claim idp) recusado");
  ok((await api("/api/envelopes", { tok: "teste:estranho@gmail.com|Estranho" })).st === 403, "e-mail de fora da VPX recusado");
  ok((await api("/api/envelopes", { headers: { Origin: "https://site-estranho.com" } })).st === 403, "origem não permitida recusada");
  const pre = await fetch(BASE + "/api/envelopes", { method: "OPTIONS", headers: { Origin: "http://localhost:5510", "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "authorization,content-type,x-hash-final" } });
  ok(pre.status === 204 && /X-Hash-Final/i.test(pre.headers.get("Access-Control-Allow-Headers") || "") && pre.headers.get("Access-Control-Allow-Origin") === "http://localhost:5510", "CORS do app local com X-Hash-Final");
}

console.log("\n2. Criar com dados errados");
{
  const b = pdf("x"), base = { titulo: "X", hash_original: sha(b), tamanho: b.length };
  ok((await api("/api/envelopes", { json: { ...base, signatarios: [] } })).st === 400, "sem signatários");
  ok((await api("/api/envelopes", { json: { ...base, signatarios: [{ nome: "A", email: "a@x", papel: "contratante", modo: "link" }] } })).st === 400, "e-mail inválido");
  ok((await api("/api/envelopes", { json: { ...base, signatarios: [{ nome: "A", email: "a@gmail.com", papel: "contratada", modo: "app" }] } })).st === 400, "modo app sem e-mail da VPX");
  ok((await api("/api/envelopes", { json: { ...base, signatarios: [{ nome: "A", email: "a@x.com", cpf: "111.111.111-11", papel: "contratante", modo: "link" }] } })).st === 400, "CPF inválido");
  ok((await api("/api/envelopes", { json: { ...base, hash_original: "abc", signatarios: [{ nome: "A", email: "a@x.com", papel: "contratante", modo: "link" }] } })).st === 400, "hash inválido");
  ok((await api("/api/envelopes", { json: { ...base, tamanho: 30 * 1048576, signatarios: [{ nome: "A", email: "a@x.com", papel: "contratante", modo: "link" }] } })).st === 400, "PDF de mais de 20 MB");
  const c = await api("/api/envelopes", { json: { ...base, signatarios: [{ nome: "A B", email: "a@x.com", papel: "contratante", modo: "link" }] } });
  ok((await api(`/api/envelopes/${c.d.envelope.id}/enviar`, { json: {} })).st === 409, "enviar sem o PDF");
  ok((await api(`/api/envelopes/${c.d.envelope.id}/pdf`, { method: "PUT", body: b, headers: { "Content-Type": "application/pdf" }, tok: tokWill })).st === 404, "PDF por outra pessoa (nem vê o contrato): 404");
}

console.log("\n3. Fluxo completo: contratante pelo link (com CPF exigido), VPX pelo app, testemunha pelo link");
const CPF_CLI = "52998224725";
const F = await criarEnviado("Contrato de teste 1", [
  { nome: "Marcos Lima", email: "marcos@exemplo.com", cpf: CPF_CLI, papel: "contratante", modo: "link", ordem: 1 },
  { nome: "Gustavo Ponchio", email: GUS, papel: "contratada", modo: "app", ordem: 2 },
  { nome: "Rita Nunes", email: "rita@exemplo.com", papel: "testemunha", modo: "link", ordem: 3 }]);
{
  ok(F.env.status === "aguardando" && Object.keys(F.links).length === 2, "enviado com 2 links", JSON.stringify(F.links));
  const em = await emails();
  ok(em.some(e => e.para === "marcos@exemplo.com" && e.texto.includes("/assinar#t=")) && em.some(e => e.para === GUS && /app/.test(e.assunto)) && em.some(e => e.para === "rita@exemplo.com"), "e-mails de pedido para os 3");
  const [sCli, sVpx, sTest] = F.env.signatarios;
  const tCli = tokenDe(F.links[sCli.id]), tTest = tokenDe(F.links[sTest.id]);
  ok((await pub("info", { t: "token-que-nao-existe-aaaaaaaaaaaaaaaaaaaaaa" })).st === 404, "token inválido: 404");
  const i = await pub("info", { t: tCli });
  ok(i.st === 200 && i.d.estado === "assinar" && i.d.eu.email === "m***@exemplo.com" && i.d.eu.cpf_exigido && i.d.outros.length === 2 && i.d.hash === sha(F.bytes), "info do link (e-mail mascarado, CPF exigido)");
  const lk = await api(`/api/envelopes/${F.id}/link/${sCli.id}`);
  ok(lk.st === 200 && lk.d.url === F.links[sCli.id], "app copia o link de novo (token decifrado)");
  ok((await pub("pdf", { t: tCli, sessao: "x".repeat(43) })).st === 401, "PDF sem confirmar o código: 401");
  const c1 = await pub("codigo", { t: tCli });
  ok(c1.st === 200 && /^\d{6}$/.test(c1.d.codigo_teste), "código enviado (codigo_teste no modo de teste)");
  ok((await emails()).some(e => e.para === "marcos@exemplo.com" && e.texto.includes(c1.d.codigo_teste)), "e-mail com o código");
  ok((await pub("codigo", { t: tCli })).st === 429, "outro código em menos de 1 minuto: 429");
  const errado = String((+c1.d.codigo_teste + 1) % 1000000).padStart(6, "0");
  const ve = await pub("verificar", { t: tCli, codigo: errado });
  ok(ve.st === 400 && /Restam 4/.test(ve.d.erro), "código errado conta as tentativas", ve.d.erro);
  const v = await pub("verificar", { t: tCli, codigo: c1.d.codigo_teste });
  ok(v.st === 200 && v.d.sessao, "código certo: sessão");
  const p = await pub("pdf", { t: tCli, sessao: v.d.sessao });
  ok(p.st === 200 && sha(p.d) === sha(F.bytes), "PDF baixado pelo link confere com o hash");
  const base = { t: tCli, sessao: v.d.sessao, nome: "Marcos Lima", cpf: CPF_CLI, imagem: IMG, hash_visto: sha(F.bytes), aceite: true };
  ok((await pub("assinar", { ...base, cpf: "11144477735" })).st === 400, "CPF diferente do exigido: 400");
  ok((await pub("assinar", { ...base, hash_visto: "0".repeat(64) })).st === 409, "hash diferente: 409");
  ok((await pub("assinar", { ...base, aceite: false })).st === 400, "sem o aceite: 400");
  ok((await pub("assinar", { ...base, imagem: "nada" })).st === 400, "sem a imagem: 400");
  const a1 = await pub("assinar", { ...base, geo: { lat: -12.98, lon: -38.47, precisao: 30 } });
  ok(a1.st === 200, "contratante assinou pelo link", JSON.stringify(a1.d));
  ok((await pub("info", { t: tCli })).d.estado === "ja_assinou", "link depois de assinar: já assinou");
  ok((await emails()).some(e => e.para === GUS && /Marcos Lima assinou/.test(e.assunto)), "criador avisado da assinatura");
  // VPX pelo app
  const appBase = { sid: sVpx.id, nome: "Gustavo Ponchio", cpf: "11144477735", imagem: IMG, hash_visto: sha(F.bytes), aceite: true };
  ok((await api(`/api/envelopes/${F.id}/pdf`)).st === 200, "VPX baixa o documento pelo app (fica na trilha)");
  ok((await api(`/api/envelopes/${F.id}/assinar-app`, { json: { ...appBase, aceite: false } })).st === 400, "assinar-app sem o aceite: 400");
  ok((await api(`/api/envelopes/${F.id}/assinar-app`, { json: appBase, tok: tokWill })).st === 404, "assinar-app por outra conta (não participa): 404");
  ok((await api(`/api/envelopes/${F.id}/assinar-app`, { json: { ...appBase, hash_visto: "1".repeat(64) } })).st === 409, "assinar-app com hash diferente: 409");
  const a2 = await api(`/api/envelopes/${F.id}/assinar-app`, { json: appBase });
  ok(a2.st === 200 && a2.d.envelope.signatarios.find(s => s.id === sVpx.id).metodo === "microsoft", "VPX assinou pelo app");
  ok((await api(`/api/envelopes/${F.id}/final`, { method: "PUT", body: pdf("final"), headers: { "Content-Type": "application/pdf", "X-Hash-Final": sha(pdf("final")) } })).st === 409, "final antes de todos assinarem: 409");
  // testemunha pelo link
  const sT = await identificar(tTest);
  const a3 = await pub("assinar", { t: tTest, sessao: sT, nome: "Rita Nunes", cpf: "39053344705", imagem: IMG, hash_visto: sha(F.bytes), aceite: true });
  ok(a3.st === 200, "testemunha assinou");
  const d = await api(`/api/envelopes/${F.id}`);
  ok(d.d.envelope.status === "concluido" && d.d.envelope.concluido_em && d.d.envelope.signatarios.every(s => s.imagem), "concluído, com as imagens no detalhe");
  const evs = d.d.envelope.eventos;
  const encadeada = cadeiaOk(d.d.envelope);
  ok(evs.some(e => e.tipo === "abriu_documento") && evs.some(e => e.tipo === "recibo_enviado") && evs.find(e => e.tipo === "assinou")?.detalhe.includes("aceite: aceite-v1"), "trilha: entrega do documento, recibo e aceite registrados");
  ok(d.d.envelope.signatarios.find(s => s.id === sVpx.id).visto_em < d.d.envelope.signatarios.find(s => s.id === sVpx.id).assinado_em, "assinatura pelo app: visto_em = hora em que baixou o documento");
  ok(d.d.envelope.signatarios.every(s => s.assinado_em === evs.find(e => e.tipo === "assinou" && e.signatario_id === s.id)?.quando), "folha e trilha com a mesma hora da assinatura");
  ok(encadeada &&evs.some(e => e.tipo === "concluido") && evs.some(e => e.tipo === "codigo_errado"), `trilha encadeada confere (${evs.length} eventos)`);
  ok((await emails()).some(e => e.para === GUS && /Assinado por todos/.test(e.assunto)), "criador avisado: todos assinaram");
  ok(d.d.envelope.signatarios[0].geo?.lat === -12.98, "localização guardada");
  // final
  const fin = pdf("Contrato de teste 1 - assinado"), hf = sha(fin);
  const pf = await api(`/api/envelopes/${F.id}/final`, { method: "PUT", body: fin, headers: { "Content-Type": "application/pdf", "X-Hash-Final": hf } });
  ok(pf.st === 200 && pf.d.envelope.hash_final === hf, "PDF final gravado");
  ok((await api(`/api/envelopes/${F.id}/final`, { method: "PUT", body: fin, headers: { "Content-Type": "application/pdf", "X-Hash-Final": hf }, tok: tokWill })).st === 404, "final por quem não cuida dos contratos: 404");
  ok((await api("/api/gestores", { method: "PUT", json: { emails: [WILL] }, tok: tokWill })).st === 403, "só o administrador muda a lista de gestores");
  ok((await api("/api/gestores", { method: "PUT", json: { emails: ["x@gmail.com"] } })).st === 400, "gestor só com e-mail da VPX");
  const gs = await api("/api/gestores", { method: "PUT", json: { emails: [WILL] } });
  ok(gs.st === 200 && gs.d.gestores[0] === WILL, "administrador põe o William na lista de gestores");
  ok((await api(`/api/envelopes/${F.id}/final`, { method: "PUT", body: fin, headers: { "Content-Type": "application/pdf", "X-Hash-Final": hf }, tok: tokWill })).st === 409, "2º aparelho: 409");
  const gf = await api(`/api/envelopes/${F.id}/final`);
  ok(gf.st === 200 && sha(gf.d) === hf, "GET final (quem recebeu 409 baixa)");
  const mailFinal = (await emails()).filter(e => /Documento assinado por todos/.test(e.assunto));
  ok(mailFinal.length === 3 && new Set(mailFinal.map(e => e.para)).size === 3 && mailFinal.every(e => e.texto.includes(hf)), "e-mail final para cada signatário e o criador, sem repetir (com o hash)", mailFinal.map(e => e.para).join(","));
  const dl = mailFinal[0].texto.match(/https?:\/\/\S+\/api\/f\/[A-Za-z0-9_-]+/)[0];
  const bx = await fetch(dl);
  ok(bx.ok && sha(new Uint8Array(await bx.arrayBuffer())) === hf && /attachment/.test(bx.headers.get("Content-Disposition")), "link do e-mail baixa a via final");
  const vr = await api("/api/v/" + d.d.envelope.codigo.replace(/-/g, "").toLowerCase(), { tok: null });
  ok(vr.st === 200 && vr.d.hash_final === hf && vr.d.hash_original === sha(F.bytes) && vr.d.signatarios.length === 3 && !JSON.stringify(vr.d).includes("@") && !JSON.stringify(vr.d).includes(CPF_CLI), "verificação pública (sem e-mail nem CPF)");
  const ar = await api(`/api/envelopes/${F.id}/arquivado`, { json: { caminho: "02 - Clientes/Cliente Teste/01 - Contrato/Contrato de teste 1 - assinado.pdf" } });
  ok(ar.st === 200 && ar.d.envelope.arquivado_em, "arquivado");
  const l = await api("/api/envelopes?desde=" + encodeURIComponent(d.d.envelope.criado_em));
  ok(l.st === 200 && l.d.agora && l.d.envelopes.some(e => e.id === F.id) && l.d.envelopes.every(e => e.signatarios.every(s => !("imagem" in s))), "lista com desde (sem imagens)");
  ok((await api(`/api/envelopes/${F.id}/cancelar`, { json: { motivo: "x" } })).st === 409, "cancelar o concluído: 409");
}

console.log("\n4. Código errado 5 vezes");
{
  const E = await criarEnviado("Contrato de teste 2", [{ nome: "João Alves", email: "joao@exemplo.com", papel: "contratante", modo: "link" }]);
  const t = tokenDe(Object.values(E.links)[0]);
  const c = await pub("codigo", { t }), errado = String((+c.d.codigo_teste + 7) % 1000000).padStart(6, "0");
  for (let i = 0; i < 5; i++) await pub("verificar", { t, codigo: errado });
  const v = await pub("verificar", { t, codigo: c.d.codigo_teste });
  ok(v.st === 429, "6ª tentativa (mesmo com o código certo): 429", JSON.stringify(v.d));
  // lembrete e cancelamento
  const l1 = await api(`/api/envelopes/${E.id}/lembrar`, { json: {} });
  ok(l1.st === 200 && l1.d.enviados === 1, "lembrete");
  ok((await api(`/api/envelopes/${E.id}/lembrar`, { json: {} })).st === 429, "2º lembrete em menos de 10 min: 429");
  const cn = await api(`/api/envelopes/${E.id}/cancelar`, { json: { motivo: "Teste de cancelamento" } });
  ok(cn.st === 200 && cn.d.envelope.status === "cancelado", "cancelado");
  ok((await emails()).some(e => e.para === "joao@exemplo.com" && /Cancelado/.test(e.assunto)), "quem foi chamado recebeu o aviso de cancelamento");
  const i = await pub("info", { t });
  ok(i.d.estado === "cancelado" && (await pub("codigo", { t })).st === 409, "link do cancelado: mensagem clara e sem código");
  ok((await api(`/api/envelopes/${E.id}/link/${Object.keys(E.links)[0]}`)).st === 409, "copiar link do cancelado: 409");
}

console.log("\n5. Em ordem, fora da vez e recusa");
{
  const E = await criarEnviado("Contrato de teste 3", [
    { nome: "Ana Souza", email: "ana@exemplo.com", papel: "contratante", modo: "link", ordem: 1 },
    { nome: "William Reis", email: WILL, papel: "testemunha", modo: "app", ordem: 2 },
    { nome: "Pedro Dias", email: "pedro@exemplo.com", papel: "testemunha", modo: "link", ordem: 3 }], { em_ordem: 1 });
  const [a, w, pd] = E.env.signatarios;
  ok(E.env.signatarios.filter(s => s.notificado_em).length === 1, "em ordem: só o 1º chamado");
  ok((await pub("info", { t: tokenDe(E.links[pd.id]) })).d.estado === "fora_da_vez", "3º: ainda não é a vez");
  ok((await pub("codigo", { t: tokenDe(E.links[pd.id]) })).st === 409, "3º: código recusado fora da vez");
  ok((await api(`/api/envelopes/${E.id}/assinar-app`, { tok: tokWill, json: { sid: w.id, nome: "William Reis", cpf: "39053344705", imagem: IMG, hash_visto: sha(E.bytes), aceite: true } })).st === 409, "app fora da vez: 409");
  const ta = tokenDe(E.links[a.id]), s = await identificar(ta);
  ok((await pub("assinar", { t: ta, sessao: s, nome: "Ana Souza", cpf: "52998224725", imagem: IMG, hash_visto: sha(E.bytes), aceite: true })).st === 200, "1º assinou");
  ok((await emails()).some(e => e.para === WILL && /app/.test(e.assunto)), "2º (app) chamado por e-mail");
  ok((await api(`/api/envelopes/${E.id}/assinar-app`, { tok: tokWill, json: { sid: w.id, nome: "William Reis", cpf: "39053344705", imagem: IMG, hash_visto: sha(E.bytes), aceite: true } })).st === 200, "2º assinou pelo app");
  const tp = tokenDe(E.links[pd.id]), s3 = await identificar(tp);
  ok((await pub("recusar", { t: tp, sessao: s3, motivo: "Não conheço o contrato" })).st === 200, "3º recusou");
  const d = await api(`/api/envelopes/${E.id}`);
  ok(d.d.envelope.status === "recusado" && /Pedro Dias/.test(d.d.envelope.motivo), "contrato recusado com o motivo");
  ok((await emails()).some(e => e.para === GUS && /recusou/.test(e.assunto)), "criador avisado da recusa");
}

console.log("\n6. Prazo vencido e tarefa diária");
{
  ok((await api("/api/envelopes", { json: { titulo: "x", hash_original: "a".repeat(64), tamanho: 10, prazo: "2020-01-01", signatarios: [{ nome: "A B", email: "a@x.com", papel: "contratante", modo: "link" }] } })).st === 400, "prazo no passado recusado");
  const c = await api("/api/teste/cron", { tok: null, method: "POST" });
  ok(c.st === 200, "tarefa diária roda", JSON.stringify(c.d));
  ok((await api("/api/v/AAAA-BBBB-CCCC", { tok: null })).st === 404, "verificação de código que não existe: 404");
  const pg = await fetch(BASE + "/assinar");
  const csp = pg.headers.get("Content-Security-Policy") || "";
  ok(pg.ok && /frame-ancestors 'none'/.test(csp) && /base-uri 'none'/.test(csp) && pg.headers.get("Referrer-Policy") === "no-referrer", "página /assinar com CSP e Referrer-Policy");
  const scriptSrc = (csp.match(/script-src ([^;]+)/) || [])[1] || "";
  const html = await pg.text(), inline = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  ok(!/unsafe-inline/.test(scriptSrc) && scriptSrc.includes("'sha256-" + createHash("sha256").update(inline).digest("base64") + "'") && /pdfjs-dist@3\.11\.174\/build\//.test(scriptSrc) && !/cdn\.jsdelivr\.net[ ;]/.test(scriptSrc + ";"), "CSP: só o script da página (pelo hash) e o pdf.js", scriptSrc);
  ok(/integrity="sha384-/.test(html), "pdf.js carregado com integrity");
  ok((await fetch(BASE + "/v/AAAA-BBBB-CCCC")).ok, "página /v/<código>");
}

console.log("\n7. Quem pode o quê, corridas e e-mails que não saem");
{
  const TEC = "tecnico@vpxengenharia.com.br", tokTec = "teste:" + TEC + "|Técnico de Campo";
  const L = await api("/api/envelopes", { tok: tokTec });
  ok(L.st === 200 && L.d.envelopes.length === 0, "quem não cuida dos contratos só vê os seus (nenhum)");
  ok((await api(`/api/envelopes/${F.id}`, { tok: tokTec })).st === 404 && (await api(`/api/envelopes/${F.id}/pdf`, { tok: tokTec })).st === 404, "contrato de outra pessoa: 404");
  ok((await api("/api/envelopes", { tok: tokTec, json: { titulo: "x", hash_original: "a".repeat(64), tamanho: 10, signatarios: [{ nome: "A B", email: "a@x.com", papel: "contratante", modo: "link" }] } })).st === 403, "criar sem ser gestor: 403");
  const lg = await api("/api/envelopes");
  ok(lg.d.envelopes.every(e => e.signatarios.every(s => !("cpf" in s) && !("ip" in s) && !("geo" in s))), "lista sem CPF, IP nem localização");
  // um contrato com o técnico como testemunha pelo app: ele vê só esse, sem os dados pessoais dos outros
  const T = await criarEnviado("Contrato de teste 4", [{ nome: "Lia Prado", email: "lia@exemplo.com", cpf: "52998224725", papel: "contratante", modo: "link" }, { nome: "Técnico de Campo", email: TEC, papel: "testemunha", modo: "app" }]);
  const lt = await api("/api/envelopes", { tok: tokTec });
  ok(lt.d.envelopes.length === 1 && lt.d.envelopes[0].id === T.id, "signatário pelo app vê o contrato em que assina");
  const dt = await api(`/api/envelopes/${T.id}`, { tok: tokTec });
  ok(dt.st === 200 && dt.d.envelope.signatarios.find(s => s.email === "lia@exemplo.com").cpf === null, "detalhe para quem só assina: sem o CPF dos outros");
  ok((await api(`/api/envelopes/${T.id}/link/${T.env.signatarios[0].id}`, { tok: tokTec })).st === 403 && (await api(`/api/envelopes/${T.id}/cancelar`, { tok: tokTec, json: {} })).st === 403, "quem só assina não pega links nem cancela");
  ok((await api(`/api/envelopes/${T.id}/cancelar`, { json: { soRascunho: true } })).st === 409, "cancelar só rascunho: o enviado não é cancelado");
  ok((await api(`/api/envelopes/${T.id}/arquivado`, { json: {} })).st === 409, "arquivado sem final: 409");
  // corrida do código: 20 tentativas ao mesmo tempo, no máximo 5 avaliadas
  const tl = tokenDe(T.links[T.env.signatarios[0].id]);
  const cc = await pub("codigo", { t: tl }), errado = String((+cc.d.codigo_teste + 3) % 1000000).padStart(6, "0");
  const rs = await Promise.all(Array.from({ length: 20 }, () => pub("verificar", { t: tl, codigo: errado })));
  ok(rs.filter(r => r.st === 400).length === 5 && rs.filter(r => r.st === 429).length === 15, "20 tentativas em paralelo: só 5 avaliadas", rs.map(r => r.st).join(","));
  // pedidos de código ao mesmo tempo: só 1 sai (o limite de 1 por minuto vale também com pedidos juntos)
  const Q = await criarEnviado("Contrato de teste 4b", [{ nome: "Lia Prado", email: "lia2@exemplo.com", papel: "contratante", modo: "link" }]);
  const tq = tokenDe(Object.values(Q.links)[0]);
  const pc = await Promise.all(Array.from({ length: 6 }, () => pub("codigo", { t: tq })));
  const pcOk = pc.filter(r => r.st === 200);
  ok(pcOk.length === 1 && pc.filter(r => r.st === 429).length === 5, "6 pedidos de código em paralelo: só 1 sai", pc.map(r => r.st).join(","));
  // nome que a folha não imprime e imagem com pixels demais
  const sT = pcOk[0] && (await pub("verificar", { t: tq, codigo: pcOk[0].d.codigo_teste })).d.sessao;
  if (sT) {
    const b = { t: tq, sessao: sT, cpf: "52998224725", imagem: IMG, hash_visto: sha(Q.bytes), aceite: true };
    ok((await pub("assinar", { ...b, nome: "Łukasz Nowak" })).st === 400, "nome com letra que o PDF não imprime: 400");
    ok((await pub("assinar", { ...b, nome: "Lia Prado", imagem: pngCom(7000, 7000) })).st === 400, "assinatura com 7000 x 7000 pixels: 400");
    ok((await pub("assinar", { ...b, nome: "Lia Prado", imagem: pngCom(600, 200) })).st === 200, "assinatura com 600 x 200 pixels: aceita");
  } else ok(false, "confirmar o código do pedido que saiu");
  // assinaturas ao mesmo tempo: a trilha não bifurca
  const P = await criarEnviado("Contrato de teste 5", ["a", "b", "c", "d"].map((x, i) => ({ nome: "Pessoa " + x.toUpperCase() + " Silva", email: `p${x}@exemplo.com`, papel: i ? "testemunha" : "contratante", modo: "link" })));
  const ses = await Promise.all(P.env.signatarios.map(async s => [tokenDe(P.links[s.id]), await identificar(tokenDe(P.links[s.id]))]));
  const ass = await Promise.all(ses.map(([t, se], i) => pub("assinar", { t, sessao: se, nome: "Pessoa " + "ABCD"[i] + " Silva", cpf: "52998224725", imagem: IMG, hash_visto: sha(P.bytes), aceite: true })));
  const dp = await api(`/api/envelopes/${P.id}`);
  ok(ass.every(r => r.st === 200) && ass.filter(r => r.d.todos).length >= 1 && dp.d.envelope.status === "concluido", "4 assinaturas ao mesmo tempo: concluído", ass.map(r => r.st).join(","));
  ok(cadeiaOk(dp.d.envelope), `trilha continua encadeada com as assinaturas ao mesmo tempo (${dp.d.envelope.eventos.length} eventos)`);
  const vr = await api("/api/v/" + P.env.codigo, { tok: null });
  ok(vr.d.trilha?.ultimo_hash === dp.d.envelope.eventos.at(-1).hash && !JSON.stringify(vr.d).includes("127.0.0.1"), "verificação mostra o hash do último evento (sem IP)");
  // assinar e recusar ao mesmo tempo: o contrato fica numa situação só
  const R = await criarEnviado("Contrato de teste 6", [{ nome: "Rui Costa", email: "rui@exemplo.com", papel: "contratante", modo: "link" }]);
  const tr = tokenDe(Object.values(R.links)[0]), sr = await identificar(tr);
  const [ra, rr] = await Promise.all([pub("assinar", { t: tr, sessao: sr, nome: "Rui Costa", cpf: "52998224725", imagem: IMG, hash_visto: sha(R.bytes), aceite: true }), pub("recusar", { t: tr, sessao: sr, motivo: "Mudei de ideia" })]);
  const dr = (await api(`/api/envelopes/${R.id}`)).d.envelope;
  ok([ra.st, rr.st].sort().join() === "200,409" && (ra.st === 200 ? dr.status === "concluido" && dr.signatarios[0].status === "assinado" : dr.status === "recusado" && dr.signatarios[0].status === "recusado"), "assinar e recusar juntos: só um vale", [ra.st, rr.st, dr.status, dr.signatarios[0].status].join(","));
  // e-mail que não sai: a trilha registra a falha e o pedido fica para tentar de novo
  const X = await criarEnviado("Contrato de teste 7", [{ nome: "Falha Envio", email: "falha@exemplo.com", papel: "contratante", modo: "link" }]);
  const dx = (await api(`/api/envelopes/${X.id}`)).d.envelope;
  ok(dx.eventos.some(e => e.tipo === "email_falhou") && !dx.eventos.some(e => e.tipo === "email_enviado") && !dx.signatarios[0].notificado_em, "e-mail que não saiu: 'email_falhou' na trilha e sem notificado_em");
  ok((await api(`/api/envelopes/${X.id}/lembrar`, { json: {} })).st === 503, "lembrete que não sai: 503");
  const cx = await pub("codigo", { t: tokenDe(Object.values(X.links)[0]) });
  ok(cx.st === 503, "código que não sai: 503 (e pode pedir de novo)");
  ok((await pub("codigo", { t: tokenDe(Object.values(X.links)[0]) })).st === 503, "depois da falha, novo pedido de código não espera 1 minuto");
}

console.log(`\n${passos - falhas} de ${passos} conferências passaram.`);
process.exit(falhas ? 1 : 0);
