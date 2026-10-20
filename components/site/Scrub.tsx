'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/* =============================================================================
   O HERÓI QUE ANDA COM O SCROLL, EM FOTOS DE VERDADE · 20/10/2026

   A peça do site que a skill site-de-10k pede (references/pipeline-scrub.md),
   na língua da casa (app/site.css, "O HERÓI QUE ANDA COM O SCROLL"). Nasceu
   para o Guia Follow (components/follow/HeroFotos.tsx, 20/10 de manhã, hoje só no git) e
   veio para cá quando o Follow entrou na identidade dos outros dois sites;
   serve a qualquer herói da GUIA que queira andar sobre fotos.

   O Arthur reprovou vídeo gerado por IA ("não quero vídeo de IA"): aqui só
   entram fotos de verdade (as do fotógrafo da igreja, scripts/follow-fotos.py).

   · as fotos ficam empilhadas na ordem do DOM; cada uma entra com fusão
     numa janela de progresso (--a → --b) e cresce devagar (--za → --z)
     enquanto é a foto da vez. A de baixo nunca apaga: fica coberta. Tudo
     isso é CSS puro a partir de um só número, `--p`, que o JS escreve no
     palco só quando muda;
   · o progresso exibido é interpolado num loop rAF normalizado por dt, que
     descansa quando converge e quando o herói sai da tela;
   · as faixas de legenda vivem em progresso de scroll, com smoothstep nas
     bordas, e o DOM só é tocado quando o valor muda. Cada frase é um título
     em duas vozes (a grotesca pesada e a última palavra em serifa itálica
     com o ponto), palavra por palavra;
   · <picture> escolhe o corte 16:9 ou 9:16 pela orientação, ao vivo;
   · a primeira foto é o pôster: vem no HTML, com prioridade alta (LCP);
     as outras chegam atrás de um anel de progresso;
   · "menos movimento" vira o herói estático (uma tela, a última foto, só o
     pouso visível). Sem JS, a mesma tela. Nada depende de JS para existir.

   O texto de cada faixa vem da página; aqui só a mecânica.
   ============================================================================= */

/** uma legenda: a frase (sem o ponto final), a palavra em itálico, a janela.
 *  `vozes: false` é um pedaço de frase (sem itálico e sem ponto): a frase
 *  inteira se desenrola por várias faixas, uma foto por vez. */
export type Faixa = { texto: string; it?: string; a: number; b: number; sobe?: boolean; vozes?: boolean; /** no computador, a faixa desce para o terço de baixo (rostos no meio da foto) */ baixo?: boolean };
/** o pouso: o título em duas vozes, a linha de apoio (opcional) e onde começa */
export type Pouso = { titulo: string; it?: string; sub?: string; a: number };
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
 *  leitura, e as últimas palavras (`it`) na segunda voz, em serifa itálica
 *  com o ponto. As palavras são texto de verdade, com espaço entre elas: o
 *  leitor de tela e o Google leem a frase inteira, uma vez só (a versão de
 *  19/10 duplicava a frase num span escondido, e o h1 saía em dobro). */
function Palavras({ texto, it, espalha = 0.45, vozes = true }: { texto: string; it?: string; espalha?: number; vozes?: boolean }) {
  const limpo = vozes ? texto.trim().replace(/\.$/, '') : texto.trim();
  const r = rng(limpo.length * 7919 + limpo.charCodeAt(0));
  const palavras = limpo.split(' ');
  const th = (i: number) => ((i / palavras.length) * espalha + r() * 0.05).toFixed(3);
  const w = (p: string, i: number) => <span key={i} className="w" style={{ '--th': th(i) } as React.CSSProperties}>{p}</span>;
  /* um pedaço de frase: todas as palavras na primeira voz, como estão */
  if (!vozes) return <>{palavras.map((p, i) => <span key={i}>{w(p, i)}{i < palavras.length - 1 ? ' ' : ''}</span>)}</>;
  /* quantas palavras do fim vão em itálico: as de `it`, se a frase termina
     nelas; senão só a última */
  const itL = (it || '').trim().replace(/\.$/, '');
  const nIt = itL && limpo.endsWith(itL) ? itL.split(' ').length : 1;
  const corte = palavras.length - nIt;
  return (
    <>
      {palavras.slice(0, corte).map((p, i) => <span key={i}>{w(p, i)} </span>)}
      <span className="s-it sem-ponto">
        {palavras.slice(corte).map((p, j) => {
          const i = corte + j;
          const ultima = i === palavras.length - 1;
          return <span key={i}>{w(ultima ? p + '.' : p, i)}{ultima ? '' : ' '}</span>;
        })}
      </span>
    </>
  );
}

const suave = (p: number, e0: number, e1: number) => {
  const t = Math.min(1, Math.max(0, (p - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export default function Scrub({ fotos, faixas, pouso, chapeu, micro, rotulo, children }:
  { fotos: Foto[]; faixas: Faixa[]; pouso: Pouso; chapeu?: ReactNode; micro?: ReactNode; rotulo: string; children: ReactNode }) {
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    const raiz = hero.closest<HTMLElement>('.s');
    const palco = hero.querySelector<HTMLElement>('.s-scrub-palco');
    const anel = hero.querySelector<SVGCircleElement>('.s-scrub-anel circle');
    const imgs = Array.from(hero.querySelectorAll<HTMLImageElement>('.s-scrub-foto'));
    const els = Array.from(hero.querySelectorAll<HTMLElement>('.s-scrub-faixa'));
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
    <section ref={heroRef} className="s-scrub" aria-label={rotulo}>
      <div className="s-scrub-palco">
        <div className="s-scrub-fotos">
          {fotos.map((f, i) => {
            const prox = fotos[i + 1];
            const vars = {
              '--a': i === 0 ? -2 : f.a, '--b': i === 0 ? -1 : f.b,
              '--za': i === 0 ? 0 : f.a, '--z': prox ? prox.b : 1,
            } as React.CSSProperties;
            return (
              <picture key={f.l} style={vars} className="s-scrub-quadro">
                <source media="(orientation: portrait)" srcSet={f.p} type="image/webp" />
                <img className="s-scrub-foto" src={f.l} alt={f.alt} width={1920} height={1080} decoding="async" loading="eager"
                  fetchPriority={i === 0 ? 'high' : 'low'} draggable={false} />
              </picture>
            );
          })}
        </div>
        <div className="s-scrub-scrim" aria-hidden="true" />
        {faixas.map((f, i) => (
          <div key={i} className={`s-scrub-faixa${f.sobe ? ' sobe' : ''}${f.baixo ? ' baixo' : ''}`} data-faixa={i}>
            <p className="s-h2 s-scrub-frase"><Palavras texto={f.texto} it={f.it} vozes={f.vozes} /></p>
          </div>
        ))}
        <div className="s-scrub-faixa pouso" data-faixa={faixas.length}>
          {chapeu}
          <h1 className="s-h1 s-scrub-frase"><Palavras texto={pouso.titulo} it={pouso.it} espalha={0.4} /></h1>
          {pouso.sub && <p className="s-lead grande s-scrub-sub">{pouso.sub}</p>}
          <div className="s-acoes centro s-scrub-acoes">{children}</div>
          {micro}
        </div>
        <svg className="s-scrub-anel" viewBox="0 0 48 48" aria-hidden="true">
          <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray={ANEL} strokeLinecap="round" transform="rotate(-90 24 24)" style={{ strokeDashoffset: ANEL }} />
        </svg>
        <svg className="s-scrub-seta" viewBox="0 0 26 30" aria-hidden="true">
          <path d="M3 4l10 10L23 4" />
          <path d="M3 15l10 10 10-10" />
        </svg>
      </div>
    </section>
  );
}
