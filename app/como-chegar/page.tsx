import type { Metadata } from 'next';
import Link from 'next/link';
import { cartao } from '@/lib/meta';
import { Site } from '@/components/Site';
import { Tit, Schema } from '@/components/Texto';
import { IcSeta } from '@/components/Icones';
import { IGREJA, MAPA, MAPA_EMBED, ROTA_WAZE, SITE } from '@/lib/igreja';
import { src as cria, alt as criaAlt } from '@/lib/criativos';

/* =============================================================================
   /como-chegar — A PÁGINA DE MAIOR INTENÇÃO DO SITE

   Quem abre esta página já decidiu ir. Ela abre com a FACHADA — a foto que
   faz a pessoa reconhecer o lugar — e o endereço em cima dela, centrado.
   Depois o mapa inteiro, tratado para a paleta, com o cartão de endereço e
   as duas rotas. Três perguntas de quem está chegando, e o fecho.

   O CTA leva para fora, e está certo: a conversão aqui é a pessoa fechar o
   navegador e sair de casa.
   ============================================================================= */

/* TRÊS MODOS DE CHEGAR, em cartões iguais. Textos do Arthur (08/09/2026),
   palavra por palavra; só o endereço sai de lib/igreja.ts, como em todo o
   site, para nunca divergir entre páginas. */
const MODOS: Array<{ n: string; t: string; d: string; endereco?: string; d2?: string }> = [
  { n: '01', t: 'De carro',
    d: 'Aos domingos pela manhã, nossa equipe estará no local para orientar sua chegada e indicar o melhor lugar para estacionar. Para chegar com tranquilidade, recomendamos que você venha com pelo menos 10 minutos de antecedência.' },
  /* "o endereço abaixo": o endereço sai numa linha própria, copiável, para a
     frase ser verdade */
  { n: '02', t: 'De aplicativo',
    d: 'Insira o endereço abaixo no seu aplicativo:', endereco: `${IGREJA.rua}, ${IGREJA.bairro}`,
    d2: 'O desembarque acontece diretamente na entrada da GUIA Church.' },
  { n: '03', t: 'Chegando na nossa casa',
    d: 'Nossa equipe estará na entrada para receber você antes do início do culto. Se for sua primeira vez, informe à recepção. Será uma alegria ajudar você e apresentar a GUIA Church.' },
];
const texto = (m: typeof MODOS[number]) => [m.d, m.endereco ? `${m.endereco}.` : '', m.d2 || ''].filter(Boolean).join(' ');
const PERGUNTAS = [
  { q: 'Onde eu deixo o carro?', r: texto(MODOS[0]) },
  { q: 'Vou de aplicativo. Qual é o destino?', r: texto(MODOS[1]) },
  { q: 'É a primeira vez. Como eu sei que cheguei?', r: texto(MODOS[2]) },
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

      {/* ------------------------------------------------- a fachada, inteira */}
      <section className="g-cheio alta centro rev">
        <img src={cria('chegar')} alt={criaAlt('chegar')} fetchPriority="high" />
        <div className="g">
          <p className="g-rot">Onde fica</p>
          <Tit as="h1" className="g-h1">Como chegar</Tit>
          {/* rua e bairro não quebram por dentro: em 390 saía "Rua Pedra de
              Itaúna, / 534, Barra da Tijuca." — o número órfão da rua, na
              única linha da página cujo trabalho é dar o endereço. */}
          <p className="g-ed"><span className="nao-quebra">{IGREJA.rua}</span>, <span className="nao-quebra">{IGREJA.bairro}</span>.</p>
          <div className="g-acoes">
            <a href={MAPA} target="_blank" rel="noreferrer" className="acao cheia">Traçar rota no Maps <IcSeta /></a>
            <a href={ROTA_WAZE} target="_blank" rel="noreferrer" className="g-link claro">Abrir no Waze</a>
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
          <div className="g-cab">
            <div className="g-cab-txt">
              <p className="g-rot">Chegando</p>
              <Tit className="g-h2">Como chegar até a gente</Tit>
              <p className="g-ed">De carro, de aplicativo ou a pé: tem alguém na porta esperando você.</p>
            </div>
          </div>
          <div className="cartoes c-bloco grande">
            {MODOS.map(m => (
              <div key={m.n} className="cartao">
                <span className="cartao-n">{m.n}</span>
                <h3 className="cartao-t">{m.t}</h3>
                <p className="cartao-d">{m.d}</p>
                {m.endereco && <p className="cartao-end">{m.endereco}</p>}
                {m.d2 && <p className="cartao-d">{m.d2}</p>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- fecho */}
      <section className="g-cheio centro fecho rev">
        <img src={cria('chegar-fecho')} alt="" loading="lazy" decoding="async" />
        <div className="g">
          <p className="g-rot">Antes de vir</p>
          <Tit className="g-h2">O que esperar de um domingo</Tit>
          <div className="g-acoes">
            <Link href="/cultos" className="acao cheia">Ver os cultos <IcSeta /></Link>
            <a href={MAPA} target="_blank" rel="noreferrer" className="g-link claro">Traçar rota</a>
          </div>
        </div>
      </section>
    </Site>
  );
}
