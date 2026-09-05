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
    /* O CSS de revelação por palavra sempre exigiu `html.js` para valer — e
       ninguém nunca pôs a classe. Resultado: os títulos nunca montaram
       palavra por palavra em lugar nenhum, e a regra de fallback (`html:not(.js)
       .pal`, !important) vencia calada. Aqui a classe entra, e o desenho
       original passa a acontecer. Sem JS a classe não entra e tudo nasce
       visível, que é o contrato. */
    document.documentElement.classList.add('js');
    const parado = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fino = window.matchMedia('(pointer: fine)').matches;
    const desligar: Array<() => void> = [];

    /* ------------------------------------------------------ 1. revelação
       Igual à da home, e é de propósito: mesma classe, mesma curva, mesmo
       atraso por palavra. Quem aprendeu o ritmo numa página não reaprende
       na outra. A rede de segurança de 1,2s revela o que já deveria estar
       na tela e não está — porque conteúdo invisível é pior que conteúdo
       sem animação, e nenhum efeito vale um bloco vazio.

       rootMargin POSITIVO: a seção começa a entrar 6% ANTES de aparecer.
       Com margem negativa, quem rola rápido via a seção chegar vazia e o
       conteúdo correr atrás — foi visto na produção. Agora ele já está
       chegando quando a seção chega. */
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
          { rootMargin: '0px 0px 25% 0px' },
        );
        const pendentes = Array.from(raiz.querySelectorAll<HTMLElement>('.rev:not(.visto)'));
        pendentes.forEach(e => obs.observe(e));
        /* A ROLAGEM TAMBÉM REVELA. O observador dispara quando a seção cruza
           a tela, mas uma rolagem rápida pode saltar uma seção inteira entre
           dois quadros — e ela ficava vazia até a rede de 1,2s. Agora todo
           evento de rolagem (num rAF) revela o que já está na tela ou acima
           dela: determinístico, barato, e o observador vira só o primeiro
           gatilho. */
        let pedindo = false;
        const varre = () => {
          pedindo = false;
          const limite = window.innerHeight * 1.25;
          for (let i = pendentes.length - 1; i >= 0; i--) {
            const e = pendentes[i];
            if (e.classList.contains('visto')) { pendentes.splice(i, 1); continue; }
            const r = e.getBoundingClientRect();
            if (r.top < limite) {
              if (r.bottom < 0) e.style.transition = 'none';
              e.classList.add('visto'); obs.unobserve(e); pendentes.splice(i, 1);
            }
          }
          if (!pendentes.length) window.removeEventListener('scroll', aoRolar);
        };
        const aoRolar = () => { if (!pedindo) { pedindo = true; requestAnimationFrame(varre); } };
        window.addEventListener('scroll', aoRolar, { passive: true });
        const rede = setTimeout(varre, 1200);
        desligar.push(() => { obs.disconnect(); clearTimeout(rede); window.removeEventListener('scroll', aoRolar); });
      }
    }

    if (parado || !fino) return () => desligar.forEach(f => f());

    /* ------------------------------------------- 1b. profundidade na rolagem
       As fotos de ponta a ponta (.g-cheio) e os blocos de foto (.g-foto)
       andam devagar contra a rolagem: uns 40px de curso, num rAF só. É o que
       dá a sensação de camadas. Só com ponteiro fino: no toque o custo não
       compensa. */
    const fotos = Array.from(raiz.querySelectorAll<HTMLElement>('.g-cheio > img, .g-foto > img'));
    let rolando = false;
    const profundidade = () => {
      rolando = false;
      const h = window.innerHeight;
      for (const img of fotos) {
        const r = (img.parentElement as HTMLElement).getBoundingClientRect();
        if (r.bottom < -100 || r.top > h + 100) continue;
        const k = (r.top + r.height / 2 - h / 2) / h;
        img.style.setProperty('--prof', (k * -40).toFixed(1) + 'px');
      }
    };
    const aoRolarProf = () => { if (!rolando) { rolando = true; requestAnimationFrame(profundidade); } };
    if (fotos.length) {
      profundidade();
      window.addEventListener('scroll', aoRolarProf, { passive: true });
      desligar.push(() => window.removeEventListener('scroll', aoRolarProf));
    }

    /* ------------------------------------------------- 1c. o anel do cursor
       Um anel fino cor de areia segue o ponteiro com um atraso curto e
       cresce sobre links e botões. O cursor do sistema continua lá — o anel
       é acompanhamento, não substituto. */
    const anel = document.createElement('div');
    anel.className = 'anel'; anel.setAttribute('aria-hidden', 'true');
    document.body.appendChild(anel);
    let ax = -100, ay = -100, mx = -100, my = -100, vivo = true;
    const segue = () => {
      if (!vivo) return;
      ax += (mx - ax) * 0.18; ay += (my - ay) * 0.18;
      anel.style.transform = `translate(${ax.toFixed(1)}px,${ay.toFixed(1)}px)`;
      requestAnimationFrame(segue);
    };
    const aoMoverAnel = (ev: MouseEvent) => {
      mx = ev.clientX; my = ev.clientY;
      const alvo = (ev.target as HTMLElement | null)?.closest('a,button,summary,[role=button]');
      anel.classList.toggle('sobre', !!alvo);
      anel.classList.add('ver');
    };
    const aoSair = () => anel.classList.remove('ver');
    document.addEventListener('mousemove', aoMoverAnel, { passive: true });
    document.addEventListener('mouseleave', aoSair);
    requestAnimationFrame(segue);
    desligar.push(() => { vivo = false; document.removeEventListener('mousemove', aoMoverAnel); document.removeEventListener('mouseleave', aoSair); anel.remove(); });

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
