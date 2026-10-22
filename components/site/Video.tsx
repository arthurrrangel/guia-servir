'use client';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

/* =============================================================================
   O VÍDEO DO SITE · 12/10/2026 (herói) → 13/10/2026 (todas as páginas)

   Um loop curto, sem som, por cima do próprio pôster (o primeiro quadro do
   trecho, em public/site/v/<id>-<formato>.webp: é o que aparece enquanto o
   vídeo carrega e o que fica quando ele não toca). Os trechos saem de
   scripts/site-videos.py, a partir dos três vídeos que o Arthur mandou.

   - herói e faixa de fundo: `largo` (computador) e `retrato` (celular em
     pé); a escolha segue a orientação da tela e troca se ela girar.
   - quadro dentro da seção: `src` único (4:5 ou círculo).
   - um arquivo por vez: MP4 (H.264) quando o navegador toca, porque iPhone
     e Chrome decodificam no chip; senão WebM (VP9, o Chromium de Linux).
     O nome passado é sem extensão: "/site/v/inicio-l".
   - `perto`: só baixa quando chega a 300 px da tela (as seções). O herói
     baixa logo depois de montar (não disputa com o pôster, que é o maior
     elemento da primeira tela).
   - não toca com "reduzir movimento" ligado nem com economia de dados.
   - pausa fora da tela e com a aba escondida: bateria do celular.
   - aparece com um fade quando o primeiro quadro está pronto.
   - `aoTempo`: o relógio do vídeo para quem acompanha (os capítulos do
     domingo).
   - 22/10/2026, PAUSAR (WCAG 2.2.2): o que se mexe sozinho por mais de cinco
     segundos, ao lado de texto, precisa de um jeito de parar. Cada vídeo que
     toca ganha um botão redondo no canto ("Pausar os vídeos", de alternar):
     ele para TODOS os vídeos da página e a escolha vale até fechar a aba
     (sessionStorage), em todas as páginas. Parado, fica o pôster. Sem vídeo
     (reduzir movimento, economia de dados), não há botão: nada se mexe.
     `controle={false}` tira o botão de um vídeo que divide a cena com outro
     (os dois círculos do Guia Servir: o botão fica no de cima).
   ============================================================================= */

const CHAVE = 's-videos-parados';
const EVENTO = 's-videos';
const lerParados = () => { try { return sessionStorage.getItem(CHAVE) === '1'; } catch { return false; } };
const gravarParados = (v: boolean) => { try { if (v) sessionStorage.setItem(CHAVE, '1'); else sessionStorage.removeItem(CHAVE); } catch { /* sem armazenamento: vale só nesta página */ } };

export function podeTocar() {
  if (typeof window === 'undefined') return false;
  const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const economia = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  return !quieto && !economia;
}

type Props = {
  largo?: string;
  retrato?: string;
  src?: string;
  className?: string;
  perto?: boolean;
  aoTempo?: (t: number, duracao: number) => void;
  aoTocar?: () => void;
  /** o botão de pausar (padrão: sim) */
  controle?: boolean;
};

export const Video = forwardRef<HTMLVideoElement | null, Props>(function Video(
  { largo, retrato, src, className = '', perto, aoTempo, aoTocar, controle = true }, fora,
) {
  const ref = useRef<HTMLVideoElement>(null);
  useImperativeHandle(fora, () => ref.current as HTMLVideoElement, []);
  const [url, setUrl] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);
  /* parado por quem visita (o botão): lido antes de escolher o arquivo, para o
     vídeo nem começar a tocar quando a pessoa já parou em outra página */
  const [parado, setParado] = useState(false);
  const paradoRef = useRef(false);

  /* 1. qual arquivo, e quando */
  useEffect(() => {
    const v = ref.current;
    if (!v || !podeTocar()) return;
    paradoRef.current = lerParados(); setParado(paradoRef.current);
    const ext = v.canPlayType('video/mp4; codecs="avc1.640028"') ? 'mp4'
      : v.canPlayType('video/webm; codecs="vp9"') ? 'webm' : null;
    if (!ext) return;
    const emPe = window.matchMedia('(orientation: portrait)');
    const escolher = () => {
      const base = src ?? (emPe.matches ? (retrato ?? largo) : (largo ?? retrato));
      return base ? `${base}.${ext}` : null;
    };
    let longe = !!perto;
    const aplicar = () => { if (!longe) setUrl(escolher()); };
    const girou = () => aplicar();
    emPe.addEventListener('change', girou);
    let obs: IntersectionObserver | null = null;
    if (perto) {
      obs = new IntersectionObserver(es => {
        if (es.some(e => e.isIntersecting)) { longe = false; aplicar(); obs?.disconnect(); obs = null; }
      }, { rootMargin: '300px 0px' });
      obs.observe(v);
    } else aplicar();
    return () => { emPe.removeEventListener('change', girou); obs?.disconnect(); };
  }, [largo, retrato, src, perto]);

  /* 2. toca só na tela e com a aba à vista */
  useEffect(() => {
    const v = ref.current;
    if (!v || !url) return;
    /* o atributo muted (não só a propriedade) é o que o Safari do iPhone confere para deixar tocar sozinho */
    v.muted = true; v.setAttribute('muted', '');
    const tocar = () => { v.play().catch(() => {}); };
    const visivel = { tela: true, aba: !document.hidden };
    const decidir = () => (!paradoRef.current && visivel.tela && visivel.aba ? tocar() : v.pause());
    const obs = new IntersectionObserver(es => { visivel.tela = es.some(e => e.isIntersecting); decidir(); }, { threshold: 0.05 });
    obs.observe(v);
    const aba = () => { visivel.aba = !document.hidden; decidir(); };
    document.addEventListener('visibilitychange', aba);
    /* o botão de qualquer vídeo da página para (ou solta) todos */
    const mudou = (e: Event) => { paradoRef.current = !!(e as CustomEvent<boolean>).detail; setParado(paradoRef.current); decidir(); };
    window.addEventListener(EVENTO, mudou);
    decidir();
    return () => { obs.disconnect(); document.removeEventListener('visibilitychange', aba); window.removeEventListener(EVENTO, mudou); };
  }, [url]);

  const alternar = () => {
    const novo = !paradoRef.current;
    gravarParados(novo);
    window.dispatchEvent(new CustomEvent(EVENTO, { detail: novo }));
  };

  return (
    <>
      <video
        ref={ref}
        className={(className + (pronto ? ' pronto' : '')).trim()}
        src={url ?? undefined}
        muted
        loop
        playsInline
        autoPlay={!!url && !parado}
        preload={url ? 'auto' : 'none'}
        aria-hidden="true"
        tabIndex={-1}
        disablePictureInPicture
        onPlaying={() => { setPronto(true); aoTocar?.(); }}
        onTimeUpdate={aoTempo ? e => aoTempo(e.currentTarget.currentTime, e.currentTarget.duration) : undefined}
      />
      {url && controle && (
        <button type="button" className="s-video-pausa" aria-label="Pausar os vídeos" aria-pressed={parado} onClick={alternar}>
          {parado
            ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" /></svg>
            : <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5.5" width="3.6" height="13" rx="1" fill="currentColor" /><rect x="13.9" y="5.5" width="3.6" height="13" rx="1" fill="currentColor" /></svg>}
        </button>
      )}
    </>
  );
});
