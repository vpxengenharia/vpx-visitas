// VPX Visitas — cópia do app no celular, para abrir mesmo sem internet (obra, subsolo, casa de máquinas).
// A página (index.html) vem sempre da internet quando há sinal, e da cópia quando não há.
// Logos, ícones, fontes e as bibliotecas de login e de PDF vêm da cópia. Se trocar logo/ícone, mude o número de CACHE.
// Login e envio para a Microsoft (login.microsoftonline.com, graph.microsoft.com, upload) nunca passam por aqui.
const CACHE = "vpx-visitas-v2";
const ESCOPO = self.registration.scope;               // ex.: https://vpxengenharia.github.io/vpx-visitas/
const PRE = [
  ESCOPO, "manifest.webmanifest", "logo.png", "logo-branco.png",
  "icone-180.png?v=3", "icone-192.png?v=3", "icone-512.png?v=3",
  "https://cdn.jsdelivr.net/npm/@azure/msal-browser@2.38.3/lib/msal-browser.min.js",
  "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(PRE.map(u => c.add(u).catch(() => {})))));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const doApp = url.origin === location.origin;
  const externo = /^(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(url.hostname);
  if (!doApp && !externo) return;
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
