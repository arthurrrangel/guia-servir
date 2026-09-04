import type { Metadata } from 'next';
import Link from 'next/link';
import { cartao } from '@/lib/meta';
import { Site } from '@/components/Site';
import { Tit, Schema } from '@/components/Texto';
import { IcSeta } from '@/components/Icones';
import { IGREJA, MAPA, MAPA_EMBED, ROTA_WAZE, SITE } from '@/lib/igreja';

/* =============================================================================
   /como-chegar — A PÁGINA DE MAIOR INTENÇÃO DO SITE

   Quem abre esta página já decidiu ir. Ela abre com a FACHADA — a foto que
   faz a pessoa reconhecer o lugar — e o endereço em cima dela, centrado.
   Depois o mapa inteiro, tratado para a paleta, com o cartão de endereço e
   as duas rotas. Três perguntas de quem está chegando, e o fecho.

   O CTA leva para fora, e está certo: a conversão aqui é a pessoa fechar o
   navegador e sair de casa.
   ============================================================================= */

/* TRÊS MODOS DE CHEGAR, em cartões iguais. A mesma informação das antigas
   perguntas, organizada pelo jeito que a pessoa vem. */
const MODOS = [
  { n: '01', t: 'De carro', d: 'Tem equipe de estacionamento no domingo de manhã. Chegue com dez minutos de folga.' },
  { n: '02', t: 'De aplicativo', d: `Destino: ${IGREJA.rua}, ${IGREJA.bairro}. O carro para em frente à porta.` },
  { n: '03', t: 'Chegando', d: 'Tem equipe de acolhida na porta antes do horário. Pode dizer que é a primeira vez.' },
];
const PERGUNTAS = [
  { q: 'Onde eu deixo o carro?', r: 'Tem equipe de estacionamento no domingo de manhã. Chegue com dez minutos de folga se vier dirigindo.' },
  { q: 'Vou de aplicativo. Qual é o destino?', r: `${IGREJA.rua}, ${IGREJA.bairro}. O carro para em frente à porta.` },
  { q: 'É a primeira vez. Como eu sei que cheguei?', r: 'Pela fachada da foto, e por alguém na porta: tem equipe de acolhida antes do horário.' },
];

export const metadata: Metadata = {
  title: 'Como chegar',
  description:
    `${IGREJA.nome} fica na ${IGREJA.rua}, ${IGREJA.bairro}, ${IGREJA.cidade}. Rota no Maps e no Waze, estacionamento e a fachada para você reconhecer a porta.`,
  alternates: { canonical: '/como-chegar' },
  ...cartao({ titulo: 'Como chegar', descricao: `${IGREJA.rua}, ${IGREJA.bairro}. Rota, estacionamento e a porta certa.`, caminho: '/como-chegar', imagem: 'como-chegar' }),
};

export default function ComoChegar() {
  return (
    <Site atual="/como-chegar">
      <Schema dados={{
        '@context': 'https://schema.org', '@type': 'Place', name: IGREJA.nome, hasMap: MAPA, url: `${SITE}/como-chegar`,
        address: { '@type': 'PostalAddress', streetAddress: IGREJA.rua, addressLocality: `${IGREJA.bairro}, ${IGREJA.cidade}`, addressRegion: IGREJA.uf, postalCode: IGREJA.cep, addressCountry: 'BR' },
        openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: 'https://schema.org/Sunday', opens: '10:00', closes: '12:00' }],
      }} />
      <Schema dados={{
        '@context': 'https://schema.org', '@type': 'FAQPage',
        mainEntity: PERGUNTAS.map(p => ({ '@type': 'Question', name: p.q, acceptedAnswer: { '@type': 'Answer', text: p.r } })),
      }} />

      {/* ------------------------------------------------- a fachada, inteira */}
      <section className="g-cheio alta centro rev">
        <img src="/fotos/predio.webp" alt={`Fachada da ${IGREJA.nome} na ${IGREJA.rua}`} fetchPriority="high" />
        <div className="g">
          <p className="g-rot">Onde fica</p>
          <Tit as="h1" className="g-h1">Como chegar</Tit>
          <p className="g-ed">{IGREJA.rua}, {IGREJA.bairro}.</p>
          <div className="g-acoes">
            <a href={MAPA} target="_blank" rel="noreferrer" className="acao cheia">Traçar rota no Maps <IcSeta /></a>
            <a href={ROTA_WAZE} target="_blank" rel="noreferrer" className="acao">Abrir no Waze</a>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ o mapa, inteiro
          Google Maps de ponta a ponta, tratado para a paleta (ver .mapa em
          globals.css). Carrega só quando chega perto da tela. */}
      <section className="mapa centro rev" aria-label="Mapa de como chegar">
        <iframe
          src={MAPA_EMBED}
          title={`Mapa: ${IGREJA.nome}, ${IGREJA.rua}, ${IGREJA.bairro}`}
          loading="lazy"
          allowFullScreen={false}
          referrerPolicy="no-referrer-when-downgrade"
        />
        <div className="mapa-mira" aria-hidden="true"><i /></div>
        <div className="mapa-cartao">
          <p className="g-rot">{IGREJA.cultoDia}, {IGREJA.cultoHora}</p>
          <p className="g-h3">{IGREJA.rua}</p>
          <p>{IGREJA.bairro}, {IGREJA.cidade} · {IGREJA.cep}</p>
          <div className="g-acoes">
            <a href={MAPA} target="_blank" rel="noreferrer" className="acao cheia">Maps <IcSeta /></a>
            <a href={ROTA_WAZE} target="_blank" rel="noreferrer" className="acao">Waze</a>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ chegando */}
      <section className="casa-escuro retic rev">
        <div className="g g-secao">
          <div className="c">
            <p className="g-rot">Chegando</p>
            <Tit className="g-h2">De carro, de aplicativo, a pé</Tit>
            <p className="g-ed">Tem alguém na porta.</p>
          </div>
          <div className="cartoes c-bloco grande">
            {MODOS.map(m => (
              <div key={m.n} className="cartao">
                <span className="cartao-n">{m.n}</span>
                <h3 className="cartao-t">{m.t}</h3>
                <p className="cartao-d">{m.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- fecho */}
      <section className="g-cheio centro fecho rev">
        <img src="/fotos/recepcao.webp" alt="" loading="lazy" decoding="async" />
        <div className="g">
          <p className="g-rot">Antes de vir</p>
          <Tit className="g-h2">O que esperar de um domingo</Tit>
          <div className="g-acoes">
            <Link href="/cultos" className="acao cheia">Ver o domingo <IcSeta /></Link>
            <a href={MAPA} target="_blank" rel="noreferrer" className="acao">Traçar rota</a>
          </div>
        </div>
      </section>
    </Site>
  );
}
