/* O SERVICE WORKER DA GUIA · 16/09/2026

   Faz duas coisas, e só duas:
   1. páginas: rede primeiro. Se a rede falhar, a última cópia que passou por
      aqui. A escala em si vem do banco pelo JavaScript da página, então
      offline a pessoa vê a tela e o aviso "sem conexão", não dados velhos.
   2. arquivos estáticos do site (chunks com hash, fotos, tipos): cache
      primeiro. São imutáveis por nome; a segunda abertura do app é instantânea.

   Nada de API, nada de outra origem, nada de POST: o Supabase nunca passa por
   aqui. Se um dia isto der problema, `CACHE` com nome novo apaga o antigo. */
const CACHE = 'guia-v1';
const ESTATICO = /^\/(_next\/static\/|fotos\/|tipos\/|icone-|criativos\/)/;

self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/eu/manifest')) return;

  if (ESTATICO.test(url.pathname)) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    })());
    return;
  }

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      try {
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      } catch {
        return (await c.match(req)) || (await c.match('/eu')) || Response.error();
      }
    })());
  }
});
