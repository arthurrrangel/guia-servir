import type { Metadata } from 'next';
import Link from 'next/link';
import { Site } from '@/components/Site';
import { Tit, Schema } from '@/components/Texto';
import { IcSeta } from '@/components/Icones';
import { IGREJA, ENDERECO_LINHA, MAPA, ROTA_WAZE, SITE } from '@/lib/igreja';

/* =============================================================================
   /como-chegar — A PÁGINA DE MAIOR INTENÇÃO DO SITE

   Quem abre esta página já decidiu ir. É a única que não precisa convencer de
   nada, e por isso é a que menos precisa de texto: mapa, botão de rota, onde
   deixar o carro, e a foto da fachada.

   A FOTO DA FACHADA NÃO É ENFEITE. Chegar num lugar que você já reconhece é
   menos assustador, e é ela que evita a pessoa passar direto — a igreja não
   tem placa de shopping. Ela já existe no repositório (predio.webp) e é usada
   na home dentro de O DOMINGO; aqui ela é o conteúdo, não a ilustração.

   O CTA LEVA PARA FORA, e está certo. É a única página do site em que a
   conversão é a pessoa fechar o navegador e sair de casa.
   ============================================================================= */

export const metadata: Metadata = {
  title: 'Como chegar',
  description:
    `${IGREJA.nome} fica na ${IGREJA.rua}, ${IGREJA.bairro}, ${IGREJA.cidade}. Rota no Maps e no Waze, estacionamento, transporte e a foto da fachada para você reconhecer a porta.`,
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
      {/* Place com hasMap e o mesmo NAP da home. Nome, endereço e telefone
          escritos IDÊNTICOS aqui, na home e no Google Empresa — divergência de
          NAP é o erro de SEO local mais comum e o mais caro, e é por isso que
          nada nesta página é escrito à mão: tudo vem de lib/igreja.ts. */}
      <Schema dados={{
        '@context': 'https://schema.org',
        '@type': 'Place',
        name: IGREJA.nome,
        hasMap: MAPA,
        url: `${SITE}/como-chegar`,
        address: {
          '@type': 'PostalAddress',
          streetAddress: IGREJA.rua,
          addressLocality: `${IGREJA.bairro}, ${IGREJA.cidade}`,
          addressRegion: IGREJA.uf,
          postalCode: IGREJA.cep,
          addressCountry: 'BR',
        },
        openingHoursSpecification: [{
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: 'https://schema.org/Sunday',
          opens: '10:00', closes: '11:30',
        }],
      }} />

      <section className="faixa casa-papel">
        <div className="casa-col">
          <p className="indice">Onde fica</p>
          <Tit as="h1" className="tit">Como chegar na GUIA Church</Tit>
          <span className="chapeu">Barra da Tijuca · Rio de Janeiro</span>
          <p className="corpo" style={{ marginTop: 40 }}>{ENDERECO_LINHA}</p>
          <div className="acoes">
            <a href={MAPA} target="_blank" rel="noreferrer" className="acao cheia">
              Traçar rota no Maps <IcSeta />
            </a>
            <a href={ROTA_WAZE} target="_blank" rel="noreferrer" className="acao">
              Abrir no Waze
            </a>
          </div>
        </div>

        {/* a fachada em tamanho de reconhecer, não de ilustrar */}
        <div className="casa-col larga" style={{ marginTop: 64 }}>
          <div className="casa-local chegada">
            <div className="casa-local-foto">
              <img src="/fotos/predio.webp"
                   alt={`Fachada da ${IGREJA.nome} na ${IGREJA.rua}, ${IGREJA.bairro}`} />
            </div>
            <dl className="casa-dados">
              <div>
                <dt>Endereço</dt>
                <dd>
                  <a href={MAPA} target="_blank" rel="noreferrer">
                    {IGREJA.rua}<br />{IGREJA.bairro}, {IGREJA.cidade}, {IGREJA.uf}<br />{IGREJA.cep}
                  </a>
                </dd>
              </div>
              <div>
                <dt>Culto</dt>
                <dd>{IGREJA.cultoDia}, {IGREJA.cultoHora} · {IGREJA.cultoDuracao} minutos</dd>
              </div>
              <div>
                <dt>No Instagram</dt>
                <dd><a href={IGREJA.instagram} target="_blank" rel="noreferrer">{IGREJA.instagramArroba}</a></dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ logística */}
      <section className="faixa casa-escuro">
        <div className="casa-col">
          <p className="indice">Chegando</p>
          <Tit>De carro, de aplicativo, a pé</Tit>
        </div>
        <dl className="casa-perguntas">
          <div>
            <dt>Onde eu deixo o carro?</dt>
            <dd>
              Tem equipe de estacionamento no domingo de manhã. Chegue com dez
              minutos de folga se vier dirigindo — é o tempo de manobrar sem
              pressa.
            </dd>
          </div>
          <div>
            <dt>Vou de aplicativo. Qual é o endereço de destino?</dt>
            <dd>
              {IGREJA.rua}, {IGREJA.bairro}. A porta é na própria Pedra de
              Itaúna — o carro para em frente.
            </dd>
          </div>
          <div>
            <dt>É a primeira vez. Como eu sei que cheguei?</dt>
            <dd>
              Pela fachada acima, e por alguém na porta: tem equipe de acolhida
              antes do horário. Pode dizer que é a primeira vez — é a frase que
              eles mais ouvem.
            </dd>
          </div>
        </dl>
      </section>

      <section className="faixa casa-papel">
        <div className="casa-col">
          <Tit>Antes de vir, se quiser</Tit>
          <p className="corpo">
            A página do domingo responde as cinco perguntas de quem nunca foi —
            roupa, duração, crianças, e se você vai ser chamado na frente.
          </p>
          <div className="acoes">
            <Link href="/cultos" className="acao cheia">Ver o domingo <IcSeta /></Link>
          </div>
        </div>
      </section>
    </Site>
  );
}
