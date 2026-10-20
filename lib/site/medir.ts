/* =============================================================================
   A MEDIÇÃO DOS SITES · 19/10/2026

   Até aqui os dois sites não mediam nada: nenhum Analytics, nenhum Pixel. Com
   a campanha de visitantes (Follow e Celebração) chegando, o anúncio não
   tinha como aprender quem avisou que vem, e ninguém sabia qual botão
   funciona. O Arthur pediu "medir e converter" e escolheu pedir o aceite
   antes de ligar o Pixel.

   Duas camadas, cada uma com a sua regra:

   · VERCEL WEB ANALYTICS conta as visitas das páginas públicas, sem cookie e
     sem identificar ninguém (a Vercel agrega). Funciona sempre. Os eventos
     próprios (track) só aparecem no painel da Vercel em plano pago; ficam
     atrás de NEXT_PUBLIC_VERCEL_EVENTOS=1 até lá.
   · PIXEL DA META mede o que importa para o anúncio (avisou que vai, abriu o
     mapa, fez o cadastro para servir). Só existe com NEXT_PUBLIC_META_PIXEL_ID
     no build, e só carrega depois do "Aceitar" da faixa de cookies.

   Este arquivo é a parte sem navegador (testada em scripts/medir.test.mjs):
   quais páginas podem ser medidas, qual evento um link dispara e quanto vale
   a escolha da faixa. Quem liga e dispara é components/site/Medidor.tsx.
   ============================================================================= */

export type Evento = 'avisou_que_vai' | 'whatsapp' | 'mapa' | 'quero_servir' | 'cadastro_servir' | 'pix_copiado';

/** Como cada evento chega na Meta. Evento padrão quando existe um que diz a
 *  mesma coisa (a Meta otimiza por eles); próprio quando não existe. "Copiou
 *  o Pix" não é "Donate": copiar não é doar, e o anúncio aprenderia errado. */
export const NA_META: Record<Evento, { padrao: boolean; nome: string }> = {
  avisou_que_vai: { padrao: true, nome: 'Schedule' },
  whatsapp: { padrao: true, nome: 'Contact' },
  mapa: { padrao: true, nome: 'FindLocation' },
  quero_servir: { padrao: false, nome: 'QueroServir' },
  cadastro_servir: { padrao: true, nome: 'SubmitApplication' },
  pix_copiado: { padrao: false, nome: 'PixCopiado' },
};

/** Como cada evento aparece no painel da Vercel */
export const NA_VERCEL: Record<Evento, string> = {
  avisou_que_vai: 'Avisou que vai',
  whatsapp: 'Abriu o WhatsApp',
  mapa: 'Abriu o mapa',
  quero_servir: 'Foi para o Servir',
  cadastro_servir: 'Cadastro no Servir',
  pix_copiado: 'Copiou o Pix',
};

export const ehEvento = (s: string | null | undefined): s is Evento => !!s && Object.prototype.hasOwnProperty.call(NA_META, s);

/* AS PÁGINAS QUE PODEM SER MEDIDAS. Lista do que entra, não do que sai: o
   sistema tem link pessoal em quase todo endereço (/eu/<código>,
   /confirmar, /candidatura/<código>, /cronograma/<código>, /demandas), e um
   código desses no painel da Vercel ou na Meta seria a credencial de alguém
   fora de casa. Página nova do site entra aqui de propósito, ou não é medida.
   '/' e '/servir' são a mesma LP (o guiaservir.com reescreve a raiz), e
   '/follow' é a raiz do guiafollow.com, pelo mesmo caminho. */
const PUBLICAS = /^\/(?:|sobre|cultos|como-chegar|eventos|pequena-guia|ofertar|privacidade|acessar|servir|servir\/onde-me-encaixo|servir\/[a-z0-9-]+|servir\/[a-z0-9-]+\/cadastro|followcamp|follow)\/?$/;

export function paginaPublica(caminho: string): boolean {
  return PUBLICAS.test(caminho);
}

/** O endereço que pode ir para a medição: página pública, sem a query
 *  (nenhuma página pública leva dado na query, e assim nunca levará). As
 *  marcações de campanha (utm_*) ficam, porque é por elas que se sabe de
 *  qual anúncio a visita veio. */
export function enderecoMedivel(url: string): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (!paginaPublica(u.pathname)) return null;
  const fica = new URLSearchParams();
  u.searchParams.forEach((v, k) => { if (/^utm_[a-z]+$/.test(k)) fica.set(k, v); });
  const q = fica.toString();
  return `${u.origin}${u.pathname}${q ? '?' + q : ''}`;
}

/** O evento de um clique, pelo link. `explicito` é o data-medir do elemento
 *  (vale mais que a regra); `aqui` é o host da página onde o clique foi. */
export function eventoDoLink(href: string, explicito: string | null, aqui: string): Evento | null {
  if (ehEvento(explicito)) return explicito;
  let u: URL;
  try { u = new URL(href, `https://${aqui}`); } catch { return null; }
  const h = u.hostname.replace(/^www\./, '');
  if (h === 'wa.me' || h === 'api.whatsapp.com') return 'whatsapp';
  if (h === 'waze.com' || h === 'maps.app.goo.gl' || (/^google\.[a-z.]+$/.test(h) && u.pathname.startsWith('/maps'))) return 'mapa';
  /* "Quero servir" do Guia Church: o salto para a LP ou para uma área. O
     /eu e o /acessar também moram lá, mas são de quem já serve. */
  if (h === 'guiaservir.com' && aqui.replace(/^www\./, '') !== 'guiaservir.com' && (u.pathname === '/' || u.pathname.startsWith('/servir'))) return 'quero_servir';
  return null;
}

/* A ESCOLHA DA FAIXA DE COOKIES. Guardada no navegador (localStorage, não
   cookie). "Agora não" vale seis meses e depois a faixa pergunta de novo;
   "Aceitar" vale um ano. Escolha estragada ou de outro formato = sem escolha. */
export const CHAVE_ESCOLHA = 'guia.cookies';
export type Escolha = { escolha: 'sim' | 'nao'; em: number };
const DIA = 24 * 3600 * 1000;
export const VALIDADE = { sim: 365 * DIA, nao: 182 * DIA };

export function escolhaValida(e: unknown, agora: number): 'sim' | 'nao' | null {
  if (!e || typeof e !== 'object') return null;
  const { escolha, em } = e as Partial<Escolha>;
  if ((escolha !== 'sim' && escolha !== 'nao') || typeof em !== 'number' || !isFinite(em) || em > agora + DIA) return null;
  return agora - em > VALIDADE[escolha] ? null : escolha;
}

/** O ID do Pixel só vale se for número (o da Meta tem 15 ou 16 dígitos):
 *  qualquer outra coisa no build deixa a medição da Meta desligada. */
export function pixelValido(id: string | undefined | null): string | null {
  const t = (id || '').trim();
  return /^\d{10,20}$/.test(t) ? t : null;
}
