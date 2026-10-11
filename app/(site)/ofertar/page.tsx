import type { Metadata } from 'next';
import { IGREJA, SITE_IGREJA as SITE } from '@/lib/igreja';
import { Ofertar } from '@/components/Ofertar';
import { TEM_CHECKOUT } from '@/lib/checkout';
import { Vozes, Sede, Chapeu, Pil, Img } from '@/components/site/Blocos';
import { Schema } from '@/components/site/Schema';

/* =============================================================================
   /ofertar — DÍZIMOS E OFERTAS · 11/10/2026

   herói · o formulário (components/Ofertar.tsx, a lógica de Pix e cartão
   de sempre, no desenho daqui) · por que ofertamos (em passos) · o fecho.
   Nada aqui é cobrança: visitante vem pra receber.
   ============================================================================= */

export const metadata: Metadata = {
  title: 'Ofertar',
  description: 'Dízimos e ofertas da GUIA Church: Pix, cartão, Apple Pay ou Google Pay. Leva menos de um minuto, e você decide o valor.',
  alternates: { canonical: '/ofertar' },
  openGraph: { title: 'Ofertar · GUIA Church', description: 'Leva menos de um minuto, e você decide o valor.', url: `${SITE}/ofertar`, images: [{ url: '/og.jpg', width: 1200, height: 630 }] },
};

const PORQUE = [
  { n: '01', t: 'Generosidade', d: 'É um dos três pilares da casa. Tudo o que temos vem de Deus, e devolver uma parte é reconhecer isso em voz alta.' },
  { n: '02', t: 'Transparência', d: 'A oferta sustenta o trabalho da igreja: o prédio, as equipes, a GUIA Kids, a transmissão, o que chega a quem precisa.' },
  { n: '03', t: 'Liberdade', d: 'Ninguém é cobrado. Você decide o valor, o jeito e a frequência. Visitante vem pra receber, não pra dar.' },
];

export default function Pagina() {
  return (
    <>
      <Schema dados={{ '@context': 'https://schema.org', '@type': 'DonateAction', name: 'Ofertar para a GUIA Church', recipient: { '@type': 'Church', name: IGREJA.nome, url: SITE }, url: `${SITE}/ofertar` }} />

      <section className="s-heroi curto" aria-labelledby="t-of">
        <Img lugar="ofertar-heroi" prioridade />
        <div className="s-in s-heroi-in">
          <Chapeu forte="Doação" resto="Dízimos e ofertas" />
          <Vozes as="h1" id="t-of" className="s-h1" it="adorar">Ofertar é adorar</Vozes>
          <p className="s-lead grande">Leva menos de um minuto, e você decide o valor. Pix, cartão, Apple Pay ou Google Pay.</p>
          <div className="s-acoes">
            <Pil href="#ofertar">Ofertar agora</Pil>
            <Pil href="#porque">Por que ofertamos</Pil>
          </div>
        </div>
      </section>

      <section id="ofertar" className="s-faixa papel" aria-labelledby="t-form">
        <div className="s-in">
          <Sede className="topo" />
          <div className="s-cab centro s-rev">
            <Vozes id="t-form" className="s-h2 media" it="entregando">O que você está entregando</Vozes>
          </div>
          <div className="s-rev d1"><Ofertar temCartao={TEM_CHECKOUT} /></div>
        </div>
      </section>

      <section id="porque" className="s-faixa areia" aria-labelledby="t-porque">
        <div className="s-in">
          <div className="s-passos-cab s-rev">
            <h2 id="t-porque" className="s-serifa">Por que ofertamos?</h2>
            <p className="s-serifa it">três razões, nenhuma cobrança:</p>
          </div>
          <ol className="s-passos s-rev d1">
            {PORQUE.map(p => <li key={p.n}><b>{p.n} - {p.t}</b><p>{p.d}</p></li>)}
          </ol>
          <Sede className="base" />
        </div>
      </section>

      <section className="s-fecho s-rev" aria-labelledby="t-fim">
        <Img lugar="fecho" />
        <div className="s-in">
          <Vozes id="t-fim" className="s-h2 media" it="semeou">Que Deus multiplique o que você semeou</Vozes>
          <div className="s-acoes centro">
            <Pil href="/cultos">Ver os cultos</Pil>
            <Pil href="/servir">Quero servir</Pil>
          </div>
        </div>
      </section>
    </>
  );
}
