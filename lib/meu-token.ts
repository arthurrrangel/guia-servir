/* =============================================================================
   O APARELHO QUE JÁ SABE QUEM É A PESSOA, POR MINISTÉRIO — 01/10/2026

   Desde 16/09 o aparelho guarda o token de quem abriu o próprio link
   (`escala.meu-token`). Era UM token só: o da última página aberta. Quem
   serve em dois ministérios tinha o aparelho apontando para o último, e o
   link do grupo do Louvor podia abrir a página da Mídia.

   O link que vai na mensagem do grupo (`/confirmar/<ministério>`) precisa
   saber o token DAQUELE ministério. Por isso, ao lado do token de sempre,
   fica o mapa `ministério → token`, preenchido quando a pessoa abre a própria
   página (que diz de qual ministério ela é) ou entra pelo PIN da equipe.

   Nada novo entra no aparelho: é o mesmo token que a pessoa já tinha na
   barra de endereço. E tudo aqui aguenta localStorage bloqueado (aba
   anônima, Safari com bloqueio): sem ele, a porta só pede o PIN.

   OS DOIS ENDEREÇOS. O app responde em guiaservir.com e em
   escalas.guiaservir.com (www.guiaservir.com redireciona para o primeiro,
   308, conferido em 01/10/2026). O localStorage é separado por endereço: a
   cobrança de quinta sai com escalas.guiaservir.com, o link do grupo com
   guiaservir.com. Para a porta saber que a pessoa é conhecida no OUTRO
   endereço sem pular às cegas, fica um bilhete num cookie de
   `.guiaservir.com`, que os dois enxergam: `ministério → endereço`. Só isso:
   nenhum token vai para o cookie.
   ============================================================================= */

export const K_TOKEN = 'escala.meu-token';
const K_VINCULOS = 'escala.meus-vinculos';
const COOKIE = 'escala_onde';

/* os endereços da igreja onde o app roda, por código curto */
export const ORIGENS: Record<string, string> = {
  a: 'https://guiaservir.com',
  e: 'https://escalas.guiaservir.com',
};
export const PRINCIPAL = ORIGENS.a;

/* o token é hexadecimal de 18 letras no banco (gen_random_bytes(9)); no
   harness, letras. Qualquer outra coisa não vira endereço. */
export const tokenValido = (t: unknown): t is string =>
  typeof t === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(t);
const slugValido = (s: unknown): s is string => typeof s === 'string' && /^[a-z0-9-]{1,40}$/.test(s);

/** O código deste endereço ('a', 'e') ou '' fora dos endereços da igreja. */
export function codigoDaOrigem(): string {
  try { return Object.keys(ORIGENS).find(k => ORIGENS[k] === location.origin) || ''; } catch { return ''; }
}
/** O caminho no endereço principal, quando a página está num dos endereços da igreja. */
export function noPrincipal(caminho: string): string {
  return codigoDaOrigem() ? PRINCIPAL + caminho : caminho;
}

function lerVinculos(): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(K_VINCULOS) || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}

/* ---------------------------------------------- o bilhete de endereço --- */
function lerOnde(): Record<string, string> {
  const m: Record<string, string> = {};
  try {
    const c = document.cookie.split('; ').find(x => x.startsWith(COOKIE + '='));
    for (const par of (c ? c.slice(COOKIE.length + 1) : '').split('~')) {
      const [slug, cod] = par.split('.');
      if (slugValido(slug) && ORIGENS[cod]) m[slug] = cod;
    }
  } catch {}
  return m;
}
function gravarOnde(m: Record<string, string>) {
  try {
    if (!/(^|\.)guiaservir\.com$/i.test(location.hostname)) return;
    const v = Object.entries(m).map(([s, c]) => `${s}.${c}`).join('~');
    /* sem nenhum ministério, o bilhete expira em vez de ficar vazio por 400 dias */
    document.cookie = `${COOKIE}=${v}; Domain=.guiaservir.com; Path=/; Max-Age=${v ? 400 * 86400 : 0}; SameSite=Lax; Secure`;
  } catch {}
}
/** Em que endereço este aparelho conhece alguém deste ministério ('' se em nenhum). */
export function ondeConhece(slug: string): string { return lerOnde()[slug] || ''; }
/** O bilhete deste ministério apontava para cá e aqui não há ninguém: sai. */
export function esquecerOnde(slug: string) {
  const o = lerOnde();
  if (o[slug] && o[slug] === codigoDaOrigem()) { delete o[slug]; gravarOnde(o); }
}

/** Guarda o token (e, se souber, de qual ministério ele é). */
export function lembrarVinculo(token: string, slug?: string | null) {
  if (!tokenValido(token)) return;
  try {
    localStorage.setItem(K_TOKEN, token);
    if (slug && slugValido(slug)) {
      const v = lerVinculos();
      v[slug] = token;
      localStorage.setItem(K_VINCULOS, JSON.stringify(v));
      const cod = codigoDaOrigem();
      if (cod) { const o = lerOnde(); o[slug] = cod; gravarOnde(o); }
    }
  } catch {}
}

/** O token que este aparelho tem PARA este ministério ('' se não tem). */
export function tokenDoMinisterio(slug: string): string {
  const t = lerVinculos()[slug];
  return tokenValido(t) ? t : '';
}

/** O último token aberto neste aparelho, de qualquer ministério. */
export function ultimoToken(): string {
  try {
    const t = localStorage.getItem(K_TOKEN);
    return tokenValido(t) ? t : '';
  } catch { return ''; }
}

/** "Não sou eu", ou um link que deixou de valer: o aparelho esquece este token. */
export function esquecerVinculo(token: string) {
  try {
    if (localStorage.getItem(K_TOKEN) === token) localStorage.removeItem(K_TOKEN);
    const v = lerVinculos();
    const o = lerOnde();
    const cod = codigoDaOrigem();
    for (const k of Object.keys(v)) {
      if (v[k] !== token) continue;
      delete v[k];
      if (cod && o[k] === cod) delete o[k];
    }
    localStorage.setItem(K_VINCULOS, JSON.stringify(v));
    gravarOnde(o);
  } catch {}
}

/* ------------------------------------------- o próximo passo da porta ---
   Função pura (não lê `location` nem armazenamento) para dar para testar a
   regra de salto sem os domínios de verdade: scripts/porta.test.mjs.

   `aqui`: código deste endereço ('' fora da igreja). `hash`: o fragmento
   da página (`#h=a.e` diz quem já foi visitado). `onde`: o que o bilhete do
   cookie diz sobre este ministério. Devolve o endereço para onde ir. */
export function proximoPassoDaPorta(aqui: string, hash: string, onde: string,
  slug: string, para: 'confirmar' | 'disponibilidade'): string {
  const daEquipe = `/equipe/${encodeURIComponent(slug)}?ir=${para}`;
  if (!aqui || !ORIGENS[aqui]) return daEquipe;
  const h = /(?:^|[#&])h=([a-z.]*)/.exec(hash || '')?.[1] || '';
  const vistos = new Set(h.split('.').filter(c => ORIGENS[c]));
  vistos.add(aqui);
  if (onde && ORIGENS[onde] && !vistos.has(onde)) {
    /* o destino entra na lista ANTES do salto: se ele redirecionar de volta
       para cá (como o www já faz), o fragmento volta dizendo que já foi */
    vistos.add(onde);
    return `${ORIGENS[onde]}/${para}/${encodeURIComponent(slug)}#h=${[...vistos].join('.')}`;
  }
  return PRINCIPAL + daEquipe;
}

