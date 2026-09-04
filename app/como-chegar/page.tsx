import type { Metadata } from 'next';
import Link from 'next/link';
import { Site } from '@/components/Site';
import { Tit, Schema } from '@/components/Texto';
import { IcSeta } from '@/components/Icones';
import { IGREJA, MAPA, MAPA_EMBED, ROTA_WAZE, SITE } from '@/lib/igreja';

/* =============================================================================
   /como-chegar — A PÁGINA DE MAIOR INTENÇÃO DO SITE

   Quem abre esta página já decidiu ir. Ela abre com a FACHADA de ponta a
   ponta — a foto que faz a pessoa reconhecer o lugar e não passar direto — e
   o endereço em cima dela. Mapa e Waze são dois azulejos grandes, não dois
   links. O resto é a logística de quem chega: carro, aplicativo, a pé.

   O CTA leva para fora, e está certo: a conversão aqui é a pessoa fechar o
   navegador e sair de casa.
   ============================================================================= */

export const metadata: Metadata = {
  title: 'Como chegar',
  description:
    `${IGREJA.nome} fica na ${IGREJA.rua}, ${IGREJA.bairro}, ${IGREJA.cidade}. Rota no Maps e no Waze, estacionamento, transporte e a fachada para você reconhecer a porta.`,
  alternates: { canonical: '/como-chegar' },
  openGraph: {
    title: 'Como chegar · GUIA Church',
    description: `${IGREJA.rua}, ${IGREJA.bairro}. Rota, estacionamento e a porta certa.`,
    url: `${SITE}/como-chegar`, type: 'website', locale: 'pt_BR',
  },
};

export default function ComoChegar() {
  return (
    <Site atual="/como-chegar">
      <Schema dados={{
        '@context': 'https://schema.org', '@type': 'Place', name: IGREJA.nome, hasMap: MAPA, url: `${SITE}/como-chegar`,
        address: { '@type': 'PostalAddress', streetAddress: IGREJA.rua, addressLocality: `${IGREJA.bairro}, ${IGREJA.cidade}`, addressRegion: IGREJA.uf, postalCode: IGREJA.cep, addressCountry: 'BR' },
        openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: 'https://schema.org/Sunday', opens: '10:00', closes: '11:30' }],
      }} />

      {/* ------------------------------------------------- a fachada, inteira */}
      <section className="g-cheio alta rev">
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
          Google Maps de ponta a ponta, tratado para a paleta do site (ver
          .mapa em globals.css). Carrega só quando chega perto da tela. O
          cartão de areia é o que a pessoa precisa: endereço e as duas rotas. */}
      <section className="mapa rev" aria-label="Mapa de como chegar">
        <iframe
          src={MAPA_EMBED}
          title={`Mapa: ${IGREJA.nome}, ${IGREJA.rua}, ${IGREJA.bairro}`}
          loading="lazy"
          allowFullScreen={false}
          referrerPolicy="no-referrer-when-downgrade"
        />
        <div className="mapa-mira" aria-hidden="true"><i /></div>
        <div className="mapa-hud" aria-hidden="true">
          <span><b>{IGREJA.bairro}</b>{IGREJA.cidade} · {IGREJA.uf}</span>
          <span><b>{IGREJA.cultoDia} · {IGREJA.cultoHora}</b>{IGREJA.cultoDuracao} min</span>
        </div>
        <div className="mapa-cartao">
          <p className="g-rot">Onde fica</p>
          <p className="g-h3">{IGREJA.rua}</p>
          <p>{IGREJA.bairro}, {IGREJA.cidade}, {IGREJA.uf} · {IGREJA.cep}</p>
          <p style={{ marginTop: 10 }}><b>{IGREJA.cultoDia}, {IGREJA.cultoHora}</b> · {IGREJA.cultoDuracao} minutos, e termina em ponto</p>
          <div className="g-acoes">
            <a href={MAPA} target="_blank" rel="noreferrer" className="acao cheia">Maps <IcSeta /></a>
            <a href={ROTA_WAZE} target="_blank" rel="noreferrer" className="acao">Waze</a>
            <a href={IGREJA.instagram} target="_blank" rel="noreferrer" className="acao">{IGREJA.instagramArroba}</a>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ chegando */}
      <section className="casa-escuro rev">
        <div className="g g-secao">
          <div className="g-grade">
            <div className="g-c5">
              <div className="g-fixa">
                <p className="g-rot">Chegando</p>
                <Tit className="g-h2">De carro, de aplicativo, a pé</Tit>
                <p className="g-ed">Tem alguém na porta.</p>
                <div className="g-foto meia leva" style={{ marginTop: 'clamp(28px,4vw,48px)' }}>
                  <img src="/fotos/recepcao.webp" alt="Equipe de acolhida recebendo na entrada" loading="lazy" decoding="async" />
                </div>
              </div>
            </div>
            <div className="g-c6 g-d7">
              <ol className="g-perg">
                <li>
                  <span className="g-perg-n">01</span>
                  <div><h3 className="g-perg-q">Onde eu deixo o carro?</h3>
                  <p className="g-perg-r">Tem equipe de estacionamento no domingo de manhã. Chegue com dez minutos de folga se vier dirigindo — é o tempo de manobrar sem pressa.</p></div>
                </li>
                <li>
                  <span className="g-perg-n">02</span>
                  <div><h3 className="g-perg-q">Vou de aplicativo. Qual é o destino?</h3>
                  <p className="g-perg-r">{IGREJA.rua}, {IGREJA.bairro}. A porta é na própria Pedra de Itaúna — o carro para em frente.</p></div>
                </li>
                <li>
                  <span className="g-perg-n">03</span>
                  <div><h3 className="g-perg-q">É a primeira vez. Como eu sei que cheguei?</h3>
                  <p className="g-perg-r">Pela fachada lá em cima, e por alguém na porta: tem equipe de acolhida antes do horário. Pode dizer que é a primeira vez — é a frase que eles mais ouvem.</p></div>
                </li>
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- fecho */}
      <section className="casa-papel rev">
        <div className="g g-secao">
          <div className="g-grade meio">
            <div className="g-c6">
              <p className="g-rot">Antes de vir, se quiser</p>
              <Tit className="g-h2">O que esperar de um domingo</Tit>
              <p className="g-corpo">
                A página do domingo responde as cinco perguntas de quem nunca foi —
                roupa, duração, crianças, e se você vai ser chamado na frente.
              </p>
              <div className="g-acoes">
                <Link href="/cultos" className="acao cheia">Ver o domingo <IcSeta /></Link>
                <a href={MAPA} target="_blank" rel="noreferrer" className="acao">Traçar rota</a>
              </div>
            </div>
            <div className="g-c5 g-d8">
              <div className="g-foto alta leva">
                <img src="/fotos/teclado.webp" alt="" loading="lazy" decoding="async" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </Site>
  );
}
