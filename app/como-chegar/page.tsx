import type { Metadata } from 'next';
import Link from 'next/link';
import { cartao } from '@/lib/meta';
import { Site } from '@/components/Site';
import { Tit, Schema } from '@/components/Texto';
import { Cabecalho, Fecho } from '@/components/Pagina';
import { MapaGuias } from '@/components/MapaGuias';
import { IcSeta } from '@/components/Icones';
import { IGREJA, MAPA, ROTA_WAZE, SITE } from '@/lib/igreja';

/* =============================================================================
   /como-chegar — A PÁGINA DE MAIOR INTENÇÃO DO SITE

   Quem abre esta página já decidiu ir. Ela abre com o cabeçalho da casa e o
   endereço (o criativo `chegar` é o lugar da FACHADA, a foto que faz a
   pessoa reconhecer a porta — ver lib/criativos.ts). Depois o mapa inteiro:
   o mesmo mapa da cidade da home (OpenStreetMap, o pino da marca), fechado
   na rua, com o cartão de endereço e as duas rotas. Os três modos de chegar,
   e o fecho. V3, 08/09/2026: saiu o embed do Google (era um iframe com
   filtro de cor e retícula por cima).

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
  { q: 'É a primeira vez. Como eu sei que cheguei?', r: 'Por alguém na porta: tem equipe de acolhida antes do horário.' },
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
    <Site atual="/como-chegar" escuro>
      <Schema dados={{
        '@context': 'https://schema.org', '@type': 'Place', name: IGREJA.nome, hasMap: MAPA, url: `${SITE}/como-chegar`,
        address: { '@type': 'PostalAddress', streetAddress: IGREJA.rua, addressLocality: `${IGREJA.bairro}, ${IGREJA.cidade}`, addressRegion: IGREJA.uf, postalCode: IGREJA.cep, addressCountry: 'BR' },
        openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: 'https://schema.org/Sunday', opens: '10:00', closes: '12:00' }],
      }} />
      <Schema dados={{
        '@context': 'https://schema.org', '@type': 'FAQPage',
        mainEntity: PERGUNTAS.map(p => ({ '@type': 'Question', name: p.q, acceptedAnswer: { '@type': 'Answer', text: p.r } })),
      }} />

      {/* ------------------------------------------------------------- herói */}
      <Cabecalho criativo="chegar" rot="Onde fica" titulo="Como chegar"
        ed={<><span className="nao-quebra">{IGREJA.rua}</span>, <span className="nao-quebra">{IGREJA.bairro}</span>.</>}
        acoes={<>
          <a href={MAPA} target="_blank" rel="noreferrer" className="acao cheia">Traçar rota no Maps <IcSeta /></a>
          <a href={ROTA_WAZE} target="_blank" rel="noreferrer" className="g-link claro">Abrir no Waze</a>
        </>} />

      {/* ------------------------------------------------------ o mapa, inteiro
          O mapa da casa (components/MapaGuias.tsx), só com o pino da igreja,
          fechado na rua. O cartão de endereço fica por cima. */}
      <section className="mapa limpo rev" aria-label="Mapa de como chegar">
        <MapaGuias grupos={[]} igreja zoomMax={16} />
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
      <section className="casa-papel rev">
        <div className="g g-secao">
          <div className="g-cab">
            <div className="g-cab-txt">
              <p className="g-rot">Chegando</p>
              <Tit className="g-h2">De carro, de aplicativo, a pé</Tit>
              <p className="g-ed">Tem alguém na porta.</p>
            </div>
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
      <Fecho rot="Antes de vir" titulo="O que esperar de um domingo"
        acoes={<>
          <Link href="/cultos" className="acao cheia">Ver o domingo <IcSeta /></Link>
          <a href={MAPA} target="_blank" rel="noreferrer" className="g-link claro">Traçar rota</a>
        </>} />
    </Site>
  );
}
