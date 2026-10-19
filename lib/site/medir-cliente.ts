import { track } from '@vercel/analytics';
import { CHAVE_ESCOLHA, NA_META, NA_VERCEL, escolhaValida, pixelValido, type Evento } from './medir';

/* =============================================================================
   A MEDIÇÃO NO NAVEGADOR · 19/10/2026 (a regra está em lib/site/medir.ts)

   `medir()` é a única porta: um evento sai para a Vercel (se os eventos
   próprios estiverem ligados) e para a Meta (se o Pixel existir e a pessoa
   tiver aceitado). Sem os dois, não faz nada, e nunca quebra a página.
   ============================================================================= */

export const PIXEL = pixelValido(process.env.NEXT_PUBLIC_META_PIXEL_ID);
const VERCEL_EVENTOS = process.env.NEXT_PUBLIC_VERCEL_EVENTOS === '1';

type Fbq = ((...a: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue?: unknown[]; push?: unknown; loaded?: boolean; version?: string };
type JanelaComPixel = Window & { fbq?: Fbq; _fbq?: Fbq; __guiaPixel?: boolean };

export function lerEscolha(): 'sim' | 'nao' | null {
  try { return escolhaValida(JSON.parse(localStorage.getItem(CHAVE_ESCOLHA) || 'null'), Date.now()); }
  catch { return null; }
}

export function gravarEscolha(escolha: 'sim' | 'nao') {
  try { localStorage.setItem(CHAVE_ESCOLHA, JSON.stringify({ escolha, em: Date.now() })); } catch {}
}

export function apagarEscolha() {
  try { localStorage.removeItem(CHAVE_ESCOLHA); } catch {}
}

export const pixelLigado = () => typeof window !== 'undefined' && !!(window as JanelaComPixel).__guiaPixel;

/** O código padrão da Meta, escrito em TypeScript, com duas travas: a
 *  configuração automática desligada (sem ela o Pixel lê botões e campos da
 *  página por conta própria, e o cadastro do Servir tem nome e telefone) e
 *  carregamento só uma vez por página. */
export function ligarPixel() {
  if (!PIXEL || typeof window === 'undefined') return;
  const w = window as JanelaComPixel;
  if (w.__guiaPixel) return;
  if (!w.fbq) {
    const n: Fbq = function (...a: unknown[]) {
      if (n.callMethod) n.callMethod(...a); else n.queue!.push(a);
    } as Fbq;
    n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
    w.fbq = n; if (!w._fbq) w._fbq = n;
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(s);
  }
  w.fbq!('set', 'autoConfig', false, PIXEL);
  w.fbq!('init', PIXEL);
  w.__guiaPixel = true;
  w.fbq!('track', 'PageView');
}

export function visitaNoPixel() {
  if (!pixelLigado()) return;
  try { (window as JanelaComPixel).fbq!('track', 'PageView'); } catch {}
}

export function medir(evento: Evento, dados: Record<string, string> = {}) {
  if (typeof window === 'undefined') return;
  if (VERCEL_EVENTOS) { try { track(NA_VERCEL[evento], dados); } catch {} }
  if (pixelLigado()) {
    const m = NA_META[evento];
    try { (window as JanelaComPixel).fbq!(m.padrao ? 'track' : 'trackCustom', m.nome, dados); } catch {}
  }
}

/** Para o clique que troca de página na mesma aba (o cadastro do Servir leva
 *  ao /eu ou à candidatura): dá ao Pixel um instante para sair antes. */
export async function medirAntesDeSair(evento: Evento, dados: Record<string, string> = {}) {
  medir(evento, dados);
  if (pixelLigado()) await new Promise(r => setTimeout(r, 300));
}
