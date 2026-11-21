'use client';
/* =============================================================================
   AS FAÍSCAS DA VIRADA · 21/11/2026 ("mais comercial", "chamativo")

   O elemento vivo do herói e do fecho: faíscas douradas subindo devagar, como
   as velas de LED do cortejo e os fogos da meia-noite (a skill site-de-10k:
   "partículas derivando", "um elemento vivo por seção"). Mais fortes depois do
   "quero mais chamativo", sempre embaixo do texto.
   Na cor da casa (o laranja do acento e um branco quente), sobre a foto e
   embaixo do texto, nunca por cima dele.

   · no computador, o herói tem o texto à esquerda: as faíscas nascem na
     metade da foto (regiao="foto"); no celular a foto mora no alto, e elas
     também;
   · uma imagem de brilho pronta por cor (desenhada uma vez), e cada quadro só
     carimba: ~30 drawImage por quadro;
   · começa depois de a página assentar (não disputa o primeiro desenho),
     dorme fora da tela e com a aba escondida;
   · "menos movimento": nada é desenhado.
   ============================================================================= */
import { useEffect, useRef } from 'react';

type Faisca = { x: number; y: number; vx: number; vy: number; r: number; fase: number; vel: number; ouro: boolean; vida: number };

const CORES = { ouro: '233,148,47', luz: '255,228,190' };

function brilho(cor: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, `rgba(${cor},1)`);
  r.addColorStop(0.18, `rgba(${cor},.85)`);
  r.addColorStop(0.45, `rgba(${cor},.22)`);
  r.addColorStop(1, `rgba(${cor},0)`);
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return c;
}

export default function Faiscas({ regiao = 'tudo', densidade = 1 }: { regiao?: 'foto' | 'tudo'; densidade?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv || typeof window.matchMedia !== 'function') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const celular = window.matchMedia('(max-width: 759px)');
    const sprites = { ouro: brilho(CORES.ouro), luz: brilho(CORES.luz) };
    let w = 0, h = 0, raf = 0, ultimo = 0, visivel = false, comecou = false;
    let lista: Faisca[] = [];

    /* onde nascem: x0..1 da largura e o teto de altura (frações) */
    const area = () => {
      const cel = celular.matches;
      if (regiao === 'foto') return cel ? { x0: 0, y1: 0.62 } : { x0: 0.46, y1: 1 };
      return { x0: 0, y1: 1 };
    };
    const nova = (espalhada: boolean): Faisca => {
      const a = area();
      return {
        x: (a.x0 + Math.random() * (1 - a.x0)) * w,
        y: espalhada ? Math.random() * h * a.y1 : h * a.y1 * (0.78 + Math.random() * 0.22),
        vx: (Math.random() - 0.5) * 0.14,
        vy: -(0.16 + Math.random() * 0.38),
        r: 1.8 + Math.random() * 3.8,
        fase: Math.random() * Math.PI * 2,
        vel: 0.7 + Math.random() * 2,
        ouro: Math.random() < 0.72,
        vida: 0,
      };
    };
    const quantas = () => Math.round((celular.matches ? 20 : 42) * densidade);

    const medir = () => {
      const b = cv.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = b.width; h = b.height;
      cv.width = Math.max(1, Math.round(w * dpr));
      cv.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = quantas();
      lista = lista.slice(0, n);
      while (lista.length < n) lista.push(nova(true));
    };

    const quadro = (t: number) => {
      raf = 0;
      if (!visivel || document.hidden) { ultimo = 0; return; }
      const dt = ultimo ? Math.min(3, (t - ultimo) / 16.67) : 1;
      ultimo = t;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      const teto = h * 0.06;
      for (let i = 0; i < lista.length; i++) {
        const f = lista[i];
        f.x += (f.vx + Math.sin(t / 1400 + f.fase) * 0.08) * dt;
        f.y += f.vy * dt;
        f.vida += dt;
        const pisca = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin((t / 1000) * f.vel + f.fase));
        const entra = Math.min(1, f.vida / 50);
        const sai = Math.max(0, Math.min(1, (f.y - teto) / (h * 0.22)));
        const alfa = 0.88 * pisca * entra * sai;
        if (f.y < teto || f.x < -20 || f.x > w + 20) { lista[i] = nova(false); continue; }
        if (alfa < 0.01) continue;
        const s = f.r * 4;
        ctx.globalAlpha = alfa;
        ctx.drawImage(f.ouro ? sprites.ouro : sprites.luz, f.x - s / 2, f.y - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(quadro);
    };
    const anda = () => { if (comecou && visivel && !document.hidden && !raf) raf = requestAnimationFrame(quadro); };

    const io = new IntersectionObserver(es => { visivel = es.some(e => e.isIntersecting); anda(); }, { rootMargin: '80px' });
    io.observe(cv);
    const ro = new ResizeObserver(() => medir());
    ro.observe(cv);
    const aba = () => anda();
    document.addEventListener('visibilitychange', aba);
    celular.addEventListener?.('change', medir);

    /* depois de a página assentar: o primeiro desenho é da foto e do título */
    medir();
    const inicio = window.setTimeout(() => { comecou = true; cv.classList.add('vivo'); anda(); }, 900);

    return () => {
      window.clearTimeout(inicio);
      if (raf) cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', aba);
      celular.removeEventListener?.('change', medir);
    };
  }, [regiao, densidade]);

  return <canvas ref={ref} className="vr-faiscas" aria-hidden="true" />;
}
