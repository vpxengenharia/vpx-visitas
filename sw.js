// VPX Engenharia (app VPX Visitas) — cópia do app no celular, para abrir mesmo sem internet (obra, subsolo, casa de máquinas).
// A página (index.html) vem sempre da internet quando há sinal, e da cópia quando não há.
// Logos, ícones, fontes e as bibliotecas de login, de PDF, do visualizador de PDF e de planilha vêm da cópia. Se trocar logo/ícone/nome do app, mude o número de CACHE.
// Login e envio para a Microsoft (login.microsoftonline.com, graph.microsoft.com, upload) nunca passam por aqui.
const CACHE = "vpx-visitas-v5";
const ESCOPO = self.registration.scope;               // ex.: https://vpxengenharia.github.io/vpx-visitas/
const PRE = [
  ESCOPO, "manifest.webmanifest", "logo.png", "logo-branco.png",
  "icone-180.png?v=3", "icone-192.png?v=3", "icone-512.png?v=3",
  "https://cdn.jsdelivr.net/npm/@azure/msal-browser@2.38.3/lib/msal-browser.min.js",
  "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js",
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js",
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js",
  "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.mini.min.js",
  "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js"
];

self.addEventListener("install", e => {
  // só o que ainda não está guardado (uma troca do sw.js não baixa de novo as bibliotecas; trocar o CACHE baixa tudo)
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(PRE.map(u => c.match(u).then(g => g || c.add(u)).catch(() => {})))));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  // apaga só as cópias antigas do app; "vpx-arquivos" (arquivos de clientes baixados para usar sem internet) fica
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== "vpx-arquivos" && k !== "vpx-normas").map(k => caches.delete(k))))
    // cópias da conferência de versão guardadas pelo sw.js anterior (ele guardava todo GET do site)
    .then(() => caches.open(CACHE)).then(c => c.keys().then(rs => Promise.all(rs.filter(r => new URL(r.url).searchParams.has("versao")).map(r => c.delete(r)))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const doApp = url.origin === location.origin;
  const externo = /^(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(url.hostname);
  if (!doApp && !externo) return;
  if (doApp && url.pathname.includes("/it/")) return;   // ITs do CBM-BA: o próprio app guarda no cache "vpx-normas" (sem duplicar aqui)
  if (doApp && url.searchParams.has("versao")) return;  // conferência de versão nova do app: sempre da internet, sem guardar cópia
  if (req.mode === "navigate") e.respondWith(paginaRedePrimeiro(req));
  else e.respondWith(copiaPrimeiro(req));
});

// página: tenta a internet (até 5 s); se não houver, abre a cópia guardada
async function paginaRedePrimeiro(req) {
  const cache = await caches.open(CACHE);
  const rede = fetch(req).then(r => { if (r.ok) cache.put(ESCOPO, r.clone()); return r; });
  try {
    return await Promise.race([rede, new Promise((_, falha) => setTimeout(() => falha(new Error("lento")), 5000))]);
  } catch {
    return (await cache.match(ESCOPO)) || rede.catch(() => Response.error());
  }
}

// demais arquivos: usa a cópia; se não tiver, busca na internet e guarda
async function copiaPrimeiro(req) {
  const cache = await caches.open(CACHE);
  const guardado = await cache.match(req);
  if (guardado) return guardado;
  try {
    const r = await fetch(req);
    if (r.ok || r.type === "opaque") cache.put(req, r.clone());
    return r;
  } catch {
    return Response.error();
  }
}
