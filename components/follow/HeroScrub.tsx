'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/* =============================================================================
   O HERO DE SCROLL EM VÍDEO · 19/10/2026

   Desde 20/10 o Guia Follow não usa este componente: o Arthur reprovou o
   vídeo gerado por IA e o hero passou a ser a pilha de fotos de verdade
   (HeroFotos.tsx). Este motor fica para o hero da home do Guia Church, que
   vai andar com o scroll sobre os clipes reais que já estão no site.

   O padrão de engenharia da skill site-de-10k (references/pipeline-scrub.md),
   escrito como componente do app:

   · o vídeo é buscado inteiro como Blob (a Vercel serve Range, mas o Blob
     funciona em qualquer lugar e deixa o seek instantâneo), transmitido
     atrás de um anel de progresso; o pôster é pintado antes e ganha a
     corrida de banda;
   · o tempo exibido é interpolado num loop rAF normalizado por dt, que
     descansa quando converge e quando o hero sai da tela;
   · cada seek espera o anterior (um seguimento por `seeked`, e o `error`
     solta a trava para nunca travar de vez);
   · as faixas de legenda vivem em progresso de scroll, com smoothstep nas
     bordas, e o DOM só é tocado quando o valor muda;
   · os portões são decididos ao vivo: "menos movimento" vira o hero
     estático (uma tela, o quadro de repouso, só o pouso visível); a
     orientação escolhe o arquivo 16:9 ou 9:16. O Arthur pediu o scrub no
     celular também (o público do Follow chega pelo Instagram), e esse é o
     desvio declarado da skill, que daria ao celular só a imagem;
   · a página fica completa sem o vídeo: se ele falhar, o quadro final vira
     o fundo e o pouso aparece montado.

   O texto de cada faixa vem da página (o pacote de design manda as linhas
   ao pé da letra); aqui só a mecânica.
   ============================================================================= */

export type Faixa = { texto: string; a: number; b: number; sobe?: boolean };
export type Pouso = { titulo: string; sub: string; a: number };
type Arquivos = { l: string; p: string };

const REDUZ = '(prefers-reduced-motion: reduce)';
const EM_PE = '(orientation: portrait)';
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

export default function HeroScrub({ videos, posters, fins, bytes, faixas, pouso, children }:
  { videos: Arquivos; posters: Arquivos; fins: Arquivos; bytes: { l: number; p: number }; faixas: Faixa[]; pouso: Pouso; children: ReactNode }) {
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    const raiz = hero.closest<HTMLElement>('.f');
    const palco = hero.querySelector<HTMLElement>('.f-palco');
    const video = hero.querySelector<HTMLVideoElement>('video');
    const poster = hero.querySelector<HTMLElement>('.f-poster');
    const anel = hero.querySelector<SVGCircleElement>('.f-anel circle');
    const els = Array.from(hero.querySelectorAll<HTMLElement>('.f-faixa'));
    if (!raiz || !palco || !video || !poster || !anel) return;
    raiz.classList.add('js');

    /* a configuração das faixas, na ordem do DOM: as legendas e, por último, o pouso */
    const cfg = [...faixas.map(f => ({ a: f.a, b: f.b, ultima: false })), { a: pouso.a, b: 1, ultima: true }];
    /* `ativa` começa indefinida para a primeira passada marcar o `inert` do
       pouso: no topo ele está apagado e não pode receber clique nem foco */
    const estado = cfg.map(() => ({ op: -1, k: -1, ativa: null as boolean | null }));

    let alvo = 0, mostrado = 0, raf: number | null = null, ultimoTick = 0;
    let seekOcupado = false, pendente: number | null = null;
    let naTela = true, ligado = false, pronto = false;
    let cargaK = 0, cargaT0 = 0;
    let setaAtual = -1;
    let orientAtual: 'l' | 'p' | null = null;
    let ctrl: AbortController | null = null;
    let urlBlob: string | null = null;

    const mqReduz = window.matchMedia(REDUZ);
    const mqPe = window.matchMedia(EM_PE);
    const orient = (): 'l' | 'p' => (mqPe.matches ? 'p' : 'l');

    const progresso = () => {
      const total = hero.offsetHeight - window.innerHeight;
      if (total <= 0) return 1;
      return clamp(-hero.getBoundingClientRect().top / total, 0, 1);
    };

    /* ----------------------------------------------------- os seeks travados */
    function pedirSeek(t: number) {
      if (!pronto || !video || !isFinite(video.duration) || video.duration <= 0) return;
      if (seekOcupado) { pendente = t; return; }
      seekOcupado = true;
      video.currentTime = t;
    }
    const aoBuscar = () => {
      seekOcupado = false;
      if (pendente !== null) { const t = pendente; pendente = null; pedirSeek(t); }
    };
    const aoErrar = () => { seekOcupado = false; pendente = null; if (ligado) falhar(); };
    video.addEventListener('seeked', aoBuscar);
    video.addEventListener('error', aoErrar);

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

    /* ------------------------------------------------- o loop que descansa */
    function tick(agora: number) {
      const dt = Math.min(100, agora - (ultimoTick || agora));
      ultimoTick = agora;
      if (cargaT0 && cargaK < 1) cargaK = Math.min(1, (agora - cargaT0) / RAMPA_DE_CARGA);
      mostrado += (alvo - mostrado) * (1 - Math.pow(1 - SUAVIZACAO, dt / 16.667));
      const convergiu = Math.abs(alvo - mostrado) < 0.0005 && cargaK >= 1;
      if (convergiu) { mostrado = alvo; raf = null; ultimoTick = 0; }
      else raf = requestAnimationFrame(tick);
      if (pronto && video && isFinite(video.duration)) pedirSeek(mostrado * Math.max(0, video.duration - 0.05));
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
      setaAtual = -1;
      cargaT0 = performance.now(); cargaK = 0;
      alvo = progresso(); mostrado = alvo;
      legendas(mostrado);
      acordar();
    }
    function desligar() {
      ligado = false;
      window.removeEventListener('scroll', aoRolar);
      window.removeEventListener('resize', aoRolar);
      if (raf !== null) { cancelAnimationFrame(raf); raf = null; ultimoTick = 0; }
    }
    function cancelar() {
      if (ctrl) { ctrl.abort(); ctrl = null; }
      if (urlBlob) { URL.revokeObjectURL(urlBlob); urlBlob = null; }
      pronto = false;
      palco!.classList.remove('pronto');
      video!.removeAttribute('src');
    }
    function falhar() {
      cancelar();
      palco!.classList.add('falhou');
      poster!.style.backgroundImage = `url("${fins[orient()]}")`;
      hero!.classList.add('estatico');
      desligar();
      els.forEach(el => el.removeAttribute('inert'));
    }

    /* --------------------------------- o pôster primeiro, depois o Blob do vídeo */
    async function carregar(o: 'l' | 'p') {
      cancelar();
      palco!.classList.remove('falhou');
      poster!.style.backgroundImage = `url("${posters[o]}")`;
      anel!.style.strokeDashoffset = String(ANEL);
      await new Promise<void>(res => {
        let feito = false;
        const ok = () => { if (!feito) { feito = true; res(); } };
        const im = new Image();
        im.onload = ok; im.onerror = ok; im.src = posters[o];
        setTimeout(ok, 4000);                      /* um pôster travado nunca segura o vídeo para sempre */
      });
      if (!ligado || orientAtual !== o) return;
      /* o arquivo que este navegador decodifica: o MP4 (H.264) em todos os
         de verdade; o WebM (VP9) no Chromium de código aberto e em algum
         Firefox sem H.264. Sem nenhum dos dois, a página fica estática. */
      const mp4 = video!.canPlayType('video/mp4; codecs="avc1.42E01E"');
      const webm = video!.canPlayType('video/webm; codecs="vp9"');
      const tipo = mp4 ? 'video/mp4' : webm ? 'video/webm' : null;
      if (!tipo) { falhar(); return; }
      const arquivo = tipo === 'video/mp4' ? videos[o] : videos[o].replace(/\.mp4$/, '.webm');
      const c = new AbortController();
      ctrl = c;
      let cao = setTimeout(() => c.abort(), 20000);
      try {
        const res = await fetch(arquivo, { signal: c.signal, priority: 'low' } as RequestInit);
        if (!res.ok || !res.body) throw new Error(`http ${res.status}`);
        const total = Number(res.headers.get('Content-Length')) || (tipo === 'video/mp4' ? bytes[o] : 0);
        const leitor = res.body.getReader();
        const partes: Uint8Array[] = [];
        let got = 0, ultimoAnel = 0;
        for (;;) {
          const { done, value } = await leitor.read();
          if (done) break;
          clearTimeout(cao);
          cao = setTimeout(() => c.abort(), 20000);  /* 20 s sem progresso: desiste e cai no estático */
          partes.push(value);
          got += value.length;
          const frac = total ? Math.min(1, got / total) : 0.5;
          const agora = performance.now();
          if (agora - ultimoAnel > 100 || frac === 1) { ultimoAnel = agora; anel!.style.strokeDashoffset = String(Math.round(ANEL * (1 - frac))); }
        }
        clearTimeout(cao);
        if (c.signal.aborted || ctrl !== c) return;
        anel!.style.strokeDashoffset = '0';
        const url = URL.createObjectURL(new Blob(partes as BlobPart[], { type: tipo }));
        urlBlob = url;
        video!.preload = 'auto';
        video!.src = url;
        video!.load();
        await new Promise<void>((res, rej) => {
          const ok = () => { limpa(); res(); };
          const mal = () => { limpa(); rej(new Error('video')); };
          const limpa = () => { video!.removeEventListener('loadeddata', ok); video!.removeEventListener('canplay', ok); video!.removeEventListener('error', mal); };
          video!.addEventListener('loadeddata', ok, { once: true });
          video!.addEventListener('canplay', ok, { once: true });
          video!.addEventListener('error', mal, { once: true });
          /* o iOS só decodifica depois de um play; mudo e inline, ele é permitido sem toque */
          const p = video!.play();
          if (p && typeof p.then === 'function') p.then(() => video!.pause()).catch(() => {});
        });
        if (c.signal.aborted || ctrl !== c) return;
        try { video!.pause(); } catch {}
        pronto = true;
        palco!.classList.add('pronto');
        alvo = progresso(); mostrado = alvo;
        pedirSeek(mostrado * Math.max(0, video!.duration - 0.05));
        acordar();
      } catch {
        clearTimeout(cao);
        if (!c.signal.aborted) falhar();
      }
    }

    /* -------------------------------------------- os portões, decididos ao vivo */
    function aplicarModo() {
      if (mqReduz.matches) {
        cancelar();
        desligar();
        hero!.classList.add('estatico');
        poster!.style.backgroundImage = `url("${fins[orient()]}")`;
        els.forEach(el => el.removeAttribute('inert'));
        return;
      }
      if (palco!.classList.contains('falhou')) { hero!.classList.add('estatico'); return; }
      hero!.classList.remove('estatico');
      ligar();
      const o = orient();
      if (o !== orientAtual || !pronto) { orientAtual = o; void carregar(o); }
      aoRolar();
    }
    mqReduz.addEventListener('change', aplicarModo);
    mqPe.addEventListener('change', aplicarModo);

    const obs = new IntersectionObserver(es => {
      naTela = es.some(e => e.isIntersecting);
      if (naTela) acordar();
    }, { rootMargin: '10% 0px' });
    obs.observe(hero);

    aplicarModo();

    return () => {
      mqReduz.removeEventListener('change', aplicarModo);
      mqPe.removeEventListener('change', aplicarModo);
      obs.disconnect();
      desligar();
      cancelar();
      video.removeEventListener('seeked', aoBuscar);
      video.removeEventListener('error', aoErrar);
    };
  }, [videos, posters, fins, bytes, faixas, pouso]);

  return (
    <section ref={heroRef} className="f-hero" aria-label="Follow">
      <div className="f-palco">
        <div className="f-poster" aria-hidden="true" />
        <video className="f-video" preload="none" muted playsInline aria-hidden="true" tabIndex={-1} />
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
