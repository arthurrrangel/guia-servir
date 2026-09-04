'use client';
import { useEffect } from 'react';

/* =============================================================================
   MOVIMENTO — a coreografia das páginas públicas, num lugar só

   O que separa um site que a pessoa acha "bonito" de um que ela acha "de
   outro nível" quase nunca é forma: é TEMPO e RESPOSTA. As coisas entram em
   ordem, o que está embaixo do dedo reage, e nada disso é necessário para
   ler. Este componente é a única fonte desse comportamento nas páginas que
   usam o casco Site. A home tem a própria revelação (mais antiga e com
   parallax); aqui ela só liga o que não tem lá.

   AS QUATRO REGRAS, e todas vêm do CSS que já existia:
   1. Nada escondido sem JS. O CSS só esconde dentro de `.js-rev`, que é esta
      função que põe. Se este arquivo nunca rodar, a página nasce inteira.
   2. prefers-reduced-motion mata tudo: revelação vira instantânea, o
      letreiro para, o ímã e o foco de luz nem ligam.
   3. Ponteiro fino só. Ímã e foco de luz são para mouse; no toque não
      existem, e não existem também no trackpad grosseiro.
   4. Um listener por tipo, no documento, dentro de requestAnimationFrame.
      Dez botões com dez listeners brigando pelo mesmo quadro é o que faz a
      rolagem engasgar no celular.
   ============================================================================= */

const RAIZ_SEL = '[data-movimento]';

export default function Movimento({ semRevelar = false }: { semRevelar?: boolean }) {
  useEffect(() => {
    const raiz = document.querySelector<HTMLElement>(RAIZ_SEL) ?? document.body;
    const parado = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fino = window.matchMedia('(pointer: fine)').matches;
    const desligar: Array<() => void> = [];

    /* ------------------------------------------------------ 1. revelação
       Igual à da home, e é de propósito: mesma classe, mesma curva, mesmo
       atraso por palavra. Quem aprendeu o ritmo numa página não reaprende
       na outra. A rede de segurança de 1,2s revela o que já deveria estar
       na tela e não está — porque conteúdo invisível é pior que conteúdo
       sem animação, e nenhum efeito vale um bloco vazio. */
    if (!semRevelar) {
      raiz.classList.add('js-rev');
      const revelaTudo = () =>
        raiz.querySelectorAll('.rev:not(.visto)').forEach(e => e.classList.add('visto'));
      if (parado) {
        raiz.classList.add('nao-anima');
        revelaTudo();
      } else {
        const obs = new IntersectionObserver(
          es => es.forEach(e => {
            if (e.isIntersecting) { e.target.classList.add('visto'); obs.unobserve(e.target); }
          }),
          { rootMargin: '0px 0px -10% 0px' },
        );
        raiz.querySelectorAll('.rev:not(.visto)').forEach(e => obs.observe(e));
        const rede = setInterval(() => {
          const limite = window.scrollY + window.innerHeight;
          let sobrou = 0;
          raiz.querySelectorAll<HTMLElement>('.rev:not(.visto)').forEach(e => {
            if (e.getBoundingClientRect().top + window.scrollY < limite) {
              e.style.transition = 'none'; e.classList.add('visto');
            } else sobrou++;
          });
          if (!sobrou) clearInterval(rede);
        }, 1200);
        desligar.push(() => { obs.disconnect(); clearInterval(rede); });
      }
    }

    if (parado || !fino) return () => desligar.forEach(f => f());

    /* --------------------------------------- 2. o foco de luz no bloco preto
       Um círculo de luz cor de areia que acompanha o ponteiro sobre as faixas
       escuras. É a microinteração mais reconhecível dos sites de produto
       (Linear, Vercel) — e aqui ela é monocromática e da cor da marca, então
       entra sem trazer vocabulário de fora. O CSS desenha; o JS só diz onde. */
    const escuros = Array.from(raiz.querySelectorAll<HTMLElement>('.casa-escuro, .casa-foto'));
    let ultimo: MouseEvent | null = null;
    let pedindo = false;
    const pinta = () => {
      pedindo = false;
      const ev = ultimo; if (!ev) return;
      for (const s of escuros) {
        const r = s.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) continue;
        s.style.setProperty('--mx', ((ev.clientX - r.left) / r.width * 100).toFixed(1) + '%');
        s.style.setProperty('--my', ((ev.clientY - r.top) / r.height * 100).toFixed(1) + '%');
      }
    };
    const aoMover = (ev: MouseEvent) => {
      ultimo = ev;
      if (!pedindo) { pedindo = true; requestAnimationFrame(pinta); }
    };
    if (escuros.length) {
      document.addEventListener('mousemove', aoMover, { passive: true });
      desligar.push(() => document.removeEventListener('mousemove', aoMover));
    }

    /* ------------------------------------------------------ 3. o ímã do botão
       O botão principal se inclina 6px na direção do ponteiro quando ele
       chega perto, e volta ao centro quando sai. Seis, não vinte: o efeito
       tem que ser sentido, não visto. Só nos `.acao.cheia` — a ação principal
       de cada faixa — para que ele diga "este é o botão", não "olha o que eu
       sei fazer". */
    const imas = Array.from(raiz.querySelectorAll<HTMLElement>('.acao.cheia'));
    const RAIO = 90, FORCA = 6;
    const aoImantar = (ev: MouseEvent) => {
      for (const b of imas) {
        const r = b.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const dx = ev.clientX - cx, dy = ev.clientY - cy;
        const d = Math.hypot(dx, dy);
        if (d < RAIO + Math.max(r.width, r.height) / 2) {
          const k = Math.max(0, 1 - d / (RAIO + r.width / 2));
          b.style.setProperty('--ix', (dx / r.width * FORCA * 2 * k).toFixed(2) + 'px');
          b.style.setProperty('--iy', (dy / r.height * FORCA * k).toFixed(2) + 'px');
        } else if (b.style.getPropertyValue('--ix')) {
          b.style.removeProperty('--ix'); b.style.removeProperty('--iy');
        }
      }
    };
    if (imas.length) {
      document.addEventListener('mousemove', aoImantar, { passive: true });
      desligar.push(() => document.removeEventListener('mousemove', aoImantar));
    }

    return () => desligar.forEach(f => f());
  }, [semRevelar]);

  return null;
}
