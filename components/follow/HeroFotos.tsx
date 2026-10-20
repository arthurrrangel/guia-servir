'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/* =============================================================================
   O HERO DE SCROLL DO GUIA FOLLOW, EM FOTOS DE VERDADE · 20/10/2026

   O Arthur reprovou o hero gerado por IA ("não quero vídeo de IA") e pediu
   os materiais reais. Este hero anda com o scroll sobre cinco fotos do
   Follow (scripts/follow-fotos.py), na mecânica da skill site-de-10k
   (references/pipeline-scrub.md), trocando o vídeo por uma pilha de fotos:

   · as fotos ficam empilhadas na ordem do DOM; cada uma entra com fusão
     numa janela de progresso (--a → --b) e cresce devagar (--za → --z)
     enquanto é a foto da vez. A de baixo nunca apaga: fica coberta. Tudo
     isso é CSS puro a partir de um só número, `--p`, que o JS escreve no
     palco só quando muda;
   · o progresso exibido é interpolado num loop rAF normalizado por dt, que
     descansa quando converge e quando o hero sai da tela;
   · as faixas de legenda vivem em progresso de scroll, com smoothstep nas
     bordas, e o DOM só é tocado quando o valor muda;
   · <picture> escolhe o corte 16:9 ou 9:16 pela orientação, ao vivo;
   · a primeira foto é o pôster: vem no HTML, com prioridade alta (LCP);
     as outras chegam atrás de um anel de progresso;
   · "menos movimento" vira o hero estático (uma tela, a última foto, só o
     pouso visível). Sem JS, a mesma tela. Nada depende de JS para existir.

   O texto de cada faixa vem da página; aqui só a mecânica.
   ============================================================================= */

export type Faixa = { texto: string; a: number; b: number; sobe?: boolean };
export type Pouso = { titulo: string; sub: string; a: number };
/** uma foto da pilha: os dois cortes e a janela em que entra (a → b) */
export type Foto = { l: string; p: string; a: number; b: number; alt: string };

const REDUZ = '(prefers-reduced-motion: reduce)';
const SUAVIZACAO = 0.16;           /* por quadro de 60 fps; a sensação do scrub */
const RAMPA_DE_CARGA = 900;        /* ms: a faixa 1 abre montada, sem esperar o scroll */
const ANEL = 126;                  /* a circunferência do anel (r=20) */

/* um gerador com semente: os limiares "aleatórios" das palavras são iguais
   em todo carregamento, no servidor e no navegador */
function rng(semente: number) {
  let s = semente >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

/** A frase em spans de palavra, com o limiar de montagem (--th) em ordem de
 *  leitura. A frase inteira fica num span só para o leitor de tela. */
function Palavras({ texto, espalha = 0.45 }: { texto: string; espalha?: number }) {
  const r = rng(texto.length * 7919 + texto.charCodeAt(0));
  const palavras = texto.split(' ');
  return (
    <>
      <span className="f-sr">{texto}</span>
      <span aria-hidden="true">
        {palavras.map((p, i) => (
          <span key={i}>
            <span className="w" style={{ '--th': ((i / palavras.length) * espalha + r() * 0.05).toFixed(3) } as React.CSSProperties}>{p}</span>
            {i < palavras.length - 1 ? ' ' : ''}
          </span>
        ))}
      </span>
    </>
  );
}

const suave = (p: number, e0: number, e1: number) => {
  const t = Math.min(1, Math.max(0, (p - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export default function HeroFotos({ fotos, faixas, pouso, children }:
  { fotos: Foto[]; faixas: Faixa[]; pouso: Pouso; children: ReactNode }) {
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    const raiz = hero.closest<HTMLElement>('.f');
    const palco = hero.querySelector<HTMLElement>('.f-palco');
    const anel = hero.querySelector<SVGCircleElement>('.f-anel circle');
    const imgs = Array.from(hero.querySelectorAll<HTMLImageElement>('.f-foto'));
    const els = Array.from(hero.querySelectorAll<HTMLElement>('.f-faixa'));
    if (!raiz || !palco || !anel || imgs.length === 0) return;
    raiz.classList.add('js');

    /* a configuração das faixas, na ordem do DOM: as legendas e, por último, o pouso */
    const cfg = [...faixas.map(f => ({ a: f.a, b: f.b, ultima: false })), { a: pouso.a, b: 1, ultima: true }];
    /* `ativa` começa indefinida para a primeira passada marcar o `inert` do
       pouso: no topo ele está apagado e não pode receber clique nem foco */
    const estado = cfg.map(() => ({ op: -1, k: -1, ativa: null as boolean | null }));

    let alvo = 0, mostrado = 0, raf: number | null = null, ultimoTick = 0;
    let naTela = true, ligado = false;
    let cargaK = 0, cargaT0 = 0;
    let setaAtual = -1, pAtual = -1;

    const mqReduz = window.matchMedia(REDUZ);

    const progresso = () => {
      const total = hero.offsetHeight - window.innerHeight;
      if (total <= 0) return 1;
      return clamp(-hero.getBoundingClientRect().top / total, 0, 1);
    };

    /* --------------------------------------------- as legendas, só na mudança */
    function legendas(p: number) {
      cfg.forEach((f, i) => {
        const el = els[i], st = estado[i];
        if (!el) return;
        const fr = Math.min(0.02, (f.b - f.a) / 3);
        const entra = i === 0 ? 1 : suave(p, f.a, f.a + fr);
        const sai = f.ultima ? 1 : 1 - suave(p, f.b - fr, f.b);
        const op = entra * sai;
        const rampa = Math.min(0.025, (f.b - f.a) * 0.35);
        let k = clamp((p - f.a) / rampa, 0, 1);
        if (i === 0) k = Math.max(k, cargaK);
        if (Math.abs(op - st.op) > 0.004 || ((op === 0 || op === 1) && op !== st.op)) { st.op = op; el.style.setProperty('--op', op.toFixed(3)); }
        if (Math.abs(k - st.k) > 0.008 || ((k === 0 || k === 1) && k !== st.k)) { st.k = k; el.style.setProperty('--k', k.toFixed(3)); }
        if (f.ultima) {
          const ativa = op > 0.5;
          if (ativa !== st.ativa) { st.ativa = ativa; el.toggleAttribute('inert', !ativa); }
        }
      });
      const seta = p > 0.04 ? 0 : 0.9;
      if (seta !== setaAtual) { setaAtual = seta; palco!.style.setProperty('--seta', String(seta)); }
    }

    /* --------------------------------------- a pilha de fotos: um número só */
    function fotosEm(p: number) {
      if (Math.abs(p - pAtual) > 0.0005 || ((p === 0 || p === 1) && p !== pAtual)) {
        pAtual = p;
        palco!.style.setProperty('--p', p.toFixed(4));
      }
    }

    /* ------------------------------------------------- o loop que descansa */
    function tick(agora: number) {
      const dt = Math.min(100, agora - (ultimoTick || agora));
      ultimoTick = agora;
      if (cargaT0 && cargaK < 1) cargaK = Math.min(1, (agora - cargaT0) / RAMPA_DE_CARGA);
      mostrado += (alvo - mostrado) * (1 - Math.pow(1 - SUAVIZACAO, dt / 16.667));
      const convergiu = Math.abs(alvo - mostrado) < 0.0005 && cargaK >= 1;
      if (convergiu) { mostrado = alvo; raf = null; ultimoTick = 0; }
      else raf = requestAnimationFrame(tick);
      fotosEm(mostrado);
      legendas(mostrado);
    }
    const acordar = () => { if (raf === null && naTela) raf = requestAnimationFrame(tick); };
    const aoRolar = () => { alvo = progresso(); acordar(); };

    /* ----------------------------------------------- ligar e desligar o scrub */
    function ligar() {
      if (ligado) return;
      ligado = true;
      window.addEventListener('scroll', aoRolar, { passive: true });
      window.addEventListener('resize', aoRolar);
      estado.forEach(s => { s.op = -1; s.k = -1; s.ativa = null; });
      setaAtual = -1; pAtual = -1;
      cargaT0 = performance.now(); cargaK = 0;
      alvo = progresso(); mostrado = alvo;
      fotosEm(mostrado);
      legendas(mostrado);
      acordar();
    }
    function desligar() {
      ligado = false;
      window.removeEventListener('scroll', aoRolar);
      window.removeEventListener('resize', aoRolar);
      if (raf !== null) { cancelAnimationFrame(raf); raf = null; ultimoTick = 0; }
    }

    /* --------------------------------- as fotos chegam atrás do anel de progresso */
    let feitas = 0;
    const total = imgs.length;
    const chegou = () => {
      feitas++;
      anel!.style.strokeDashoffset = String(Math.round(ANEL * (1 - feitas / total)));
      if (feitas >= total) palco!.classList.add('pronto');
    };
    const limpezas: (() => void)[] = [];
    imgs.forEach(im => {
      if (im.complete && im.naturalWidth > 0) { chegou(); return; }
      const ok = () => { im.removeEventListener('load', ok); im.removeEventListener('error', ok); chegou(); };
      im.addEventListener('load', ok); im.addEventListener('error', ok);
      limpezas.push(ok);
    });
    /* uma foto travada nunca segura o anel para sempre */
    const cao = setTimeout(() => { while (feitas < total) chegou(); }, 15000);

    /* -------------------------------------------- os portões, decididos ao vivo */
    function aplicarModo() {
      if (mqReduz.matches) {
        desligar();
        hero!.classList.add('estatico');
        els.forEach(el => el.removeAttribute('inert'));
        return;
      }
      hero!.classList.remove('estatico');
      ligar();
      aoRolar();
    }
    mqReduz.addEventListener('change', aplicarModo);

    const obs = new IntersectionObserver(es => {
      naTela = es.some(e => e.isIntersecting);
      if (naTela) acordar();
    }, { rootMargin: '10% 0px' });
    obs.observe(hero);

    aplicarModo();

    return () => {
      mqReduz.removeEventListener('change', aplicarModo);
      obs.disconnect();
      desligar();
      clearTimeout(cao);
      limpezas.forEach(fn => fn());
    };
  }, [fotos, faixas, pouso]);

  return (
    <section ref={heroRef} className="f-hero" aria-label="Follow">
      <div className="f-palco">
        <div className="f-fotos">
          {fotos.map((f, i) => {
            const prox = fotos[i + 1];
            const vars = {
              '--a': i === 0 ? -2 : f.a, '--b': i === 0 ? -1 : f.b,
              '--za': i === 0 ? 0 : f.a, '--z': prox ? prox.b : 1,
            } as React.CSSProperties;
            return (
              <picture key={f.l} style={vars} className="f-quadro">
                <source media="(orientation: portrait)" srcSet={f.p} type="image/webp" />
                <img className="f-foto" src={f.l} alt={f.alt} width={1920} height={1080} decoding="async" loading="eager"
                  fetchPriority={i === 0 ? 'high' : 'low'} draggable={false} />
              </picture>
            );
          })}
        </div>
        <div className="f-scrim" aria-hidden="true" />
        {faixas.map((f, i) => (
          <div key={i} className={`f-faixa${f.sobe ? ' sobe' : ''}`} data-faixa={i}>
            <p className="f-frase"><Palavras texto={f.texto} /></p>
          </div>
        ))}
        <div className="f-faixa pouso" data-faixa={faixas.length}>
          <h1 className="f-frase"><Palavras texto={pouso.titulo} espalha={0.4} /></h1>
          <p className="f-sub">{pouso.sub}</p>
          <div className="f-acoes">{children}</div>
        </div>
        <svg className="f-anel" viewBox="0 0 48 48" aria-hidden="true">
          <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray={ANEL} strokeLinecap="round" transform="rotate(-90 24 24)" style={{ strokeDashoffset: ANEL }} />
        </svg>
        <svg className="f-seta" viewBox="0 0 26 30" aria-hidden="true">
          <path d="M3 4l10 10L23 4" />
          <path d="M3 15l10 10 10-10" />
        </svg>
      </div>
    </section>
  );
}
