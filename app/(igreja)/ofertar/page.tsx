import type { Metadata } from 'next';
import { og } from '@/lib/site/meta';
import { IGREJA, SITE_IGREJA as SITE } from '@/lib/igreja';
import { noServir } from '@/lib/site/sites';
import { Ofertar } from '@/components/Ofertar';
import { TEM_CHECKOUT } from '@/lib/checkout';
import { Vozes, Sede, Chapeu, Pil, Heroi, Passos, Fecho } from '@/components/site/Blocos';
import { Schema } from '@/components/site/Schema';

/* =============================================================================
   /ofertar — DÍZIMOS E OFERTAS · 11/10/2026

   herói · o formulário (components/Ofertar.tsx, a lógica de Pix e cartão
   de sempre, no desenho daqui) · por que ofertamos (em passos) · o fecho.
   Nada aqui é cobrança: visitante vem pra receber.
   14/10/2026, no celular: cada razão com a primeira frase.

   19/10/2026: O SITE PROMETIA O QUE NÃO TINHA. Herói, descrição e menu
   diziam "Pix, cartão, Apple Pay ou Google Pay", e em produção o cartão está
   desligado: sem a chave do adquirente, TEM_CHECKOUT é falso e o formulário
   mostra só o Pix (medido no HTML de guiachurch.com/ofertar). A copy final
   também diz "Forma: Pix". O cartão só aparece nas frases quando existe.
   ============================================================================= */

export const metadata: Metadata = {
  title: 'Ofertar',
  description: `Dízimos e ofertas da GUIA Church${TEM_CHECKOUT ? ': Pix, cartão, Apple Pay ou Google Pay' : ' pelo Pix'}. Leva menos de um minuto, e você decide o valor.`,
  alternates: { canonical: '/ofertar' },
  openGraph: og('igreja', '/ofertar', 'Ofertar', 'Leva menos de um minuto, e você decide o valor.', '/og-ofertar.jpg'),
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

      <Heroi id="t-of" lugar="ofertar-heroi" curto chapeu={<Chapeu forte="Doação" resto="Dízimos e ofertas" />} titulo="Ofertar é adorar" it="adorar"
             lead={<>Leva menos de um minuto, e você decide o valor.{TEM_CHECKOUT && <span className="s-resto"> Pix, cartão, Apple Pay ou Google Pay.</span>}</>}>
        <Pil href="#ofertar">Ofertar agora</Pil>
        <Pil href="#porque" tom="vidro">Por que ofertamos</Pil>
      </Heroi>

      <section id="ofertar" className="s-faixa papel" aria-labelledby="t-form">
        <div className="s-in">
          <Sede className="topo" />
          <div className="s-cab centro s-rev">
            <Vozes id="t-form" className="s-h2 media" it="entregando">O que você está entregando</Vozes>
          </div>
          <div className="s-rev d1"><Ofertar temCartao={TEM_CHECKOUT} /></div>
        </div>
      </section>

      <Passos id="porque" tid="t-porque" titulo="Por que ofertamos?" sub="três razões, nenhuma cobrança:" itens={PORQUE} />

      <Fecho titulo="Que Deus multiplique o que você semeou" it="o que você semeou">
        <Pil href="/cultos">Ver os cultos</Pil>
        <Pil href={noServir('/')} tom="vidro">Quero servir</Pil>
      </Fecho>
    </>
  );
}
