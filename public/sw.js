/* O SERVICE WORKER DA GUIA · 16/09/2026

   Faz duas coisas, e só duas:
   1. páginas: rede primeiro. Se a rede falhar, a última cópia que passou por
      aqui. A escala em si vem do banco pelo JavaScript da página, então
      offline a pessoa vê a tela e o aviso "sem conexão", não dados velhos.
   2. arquivos do site: cache primeiro — MAS DEPENDE DE QUEM.

   IMUTÁVEL POR NOME NÃO É O MESMO QUE ESTÁTICO — 19/09/2026.

   A versão anterior tratava `_next/static/`, `fotos/`, `tipos/`, `icone-` e
   `criativos/` do mesmo jeito: cache primeiro, sem revalidar, para sempre.
   Só que `_next/static/` tem hash no nome e os outros quatro NÃO TÊM. Arquivo
   sem hash trocado no lugar é o mesmo endereço com outro conteúdo — e o
   service worker intercepta ANTES do cache do navegador, então nem o
   `must-revalidate` da Vercel é consultado.

   O efeito prático é que o procedimento escrito em `lib/criativos.ts` deixa
   de funcionar para quem instalou o app: trocar a arte da campanha continua
   entregando a arte velha, indefinidamente. As fotos de `public/fotos/` já
   foram trocadas uma vez em 16/09 — no mesmo dia em que este arquivo nasceu,
   e nenhum dos dois sabia do outro.

   Agora são dois regimes:
     · IMUTAVEL (`_next/static/`): cache primeiro, sem revalidar. O hash no
       nome garante que conteúdo novo é endereço novo.
     · REVALIDA (fotos, tipos, ícones, criativos): devolve o cache NA HORA —
       a segunda abertura continua instantânea, que é o motivo de o service
       worker existir — e busca a versão nova em segundo plano, gravando para
       a próxima abertura. Uma abertura de atraso em vez de nunca.

   Nada de API, nada de outra origem, nada de POST: o Supabase nunca passa por
   aqui. Se um dia isto der problema, `CACHE` com nome novo apaga o antigo. */
const CACHE = 'guia-v2';
const IMUTAVEL = /^\/_next\/static\//;
const REVALIDA = /^\/(fotos\/|tipos\/|icone-|criativos\/|grao\.png|manifest\.webmanifest)/;

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

  /* imutável por nome: o hash muda quando o conteúdo muda */
  if (IMUTAVEL.test(url.pathname)) {
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

  /* sem hash no nome: devolve o que tem e vai buscar o que veio */
  if (REVALIDA.test(url.pathname)) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(req);
      const rede = fetch(req).then(res => {
        if (res.ok) c.put(req, res.clone());
        return res;
      }).catch(() => null);
      /* sem cópia guardada, espera a rede; com cópia, a rede corre por fora
         e o `waitUntil` segura o worker vivo até ela gravar */
      if (!hit) return (await rede) || Response.error();
      e.waitUntil(rede);
      return hit;
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
