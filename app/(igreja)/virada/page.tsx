import type { Metadata } from 'next';
import { og } from '@/lib/site/meta';
import { IGREJA, SITE_IGREJA } from '@/lib/igreja';
import { VIRADA, MAX_POR_RESERVA, whatsDuvida } from '@/lib/virada';
import { Chapeu, Pil, Img, Heroi, Fecho, Vozes, Sede, SerifaCab, FaixaPerguntas, Visto, ligaTexto, liga } from '@/components/site/Blocos';
import { Schema } from '@/components/site/Schema';
import ReservaVirada from '@/components/site/ReservaVirada';
import Faiscas from '@/components/virada/Faiscas';
import BarraReserva from '@/components/virada/BarraReserva';
import { ContagemVirada, VagasVirada } from '@/components/virada/Ingresso';

/* =============================================================================
   /virada — A VIRADA 2027 · 21/11/2026

   A landing page da noite de 31 de dezembro, com a copy do Arthur
   (Virada_2027_landing_page.pdf) na identidade do guiachurch.com, e a
   reserva gratuita, com vagas limitadas a 150 pessoas, gravada pelo site
   (app/api/virada, migração 118). O QR impresso aponta para cá.

   O que a copy deixou entre colchetes não vai ao ar com colchete (a regra
   dele desde 23/10): o endereço completo, a data de fim das reservas e
   "como chego até lá" ficam fora até ele mandar; "quantas pessoas" vale a
   regra de lib/virada.ts (até 6 por reserva, contando quem reserva), que é
   a que o formulário aplica; o contato é o WhatsApp da igreja.

   "MAIS COMERCIAL" E "CHAMATIVO" (21/11/2026, à tarde). Dentro da identidade
   (ele já reprovou página fora dela: "esse do Follow tá sem id visual") e sem
   inventar fato nem número:
     · as faíscas douradas no herói e no fecho (components/virada/Faiscas.tsx);
     · logo depois do herói, o INGRESSO: o cartão claro sobre a noite (tela 6
       do PDF) com a contagem até a noite, o que a noite tem, a reserva grátis
       e a chamada; as vagas só com número verdadeiro do banco;
     · a programação ganha a linha do tempo que se acende ao rolar;
     · as chamadas dizem o que a pessoa ganha ("Garantir meu lugar"), em
       laranja só nesta página (a chamada principal da noite), e no celular a
       barra do pé deixa a reserva a um toque (BarraReserva.tsx);
     · o ingresso conta dias, horas, minutos e segundos, e a faixa de fotos
       mostra o que a noite tem (louvor, oração, as crianças, a gente);
     · depois de reservar, "Convidar alguém".
   "Não terá ceia na virada" (21/11/2026): o culto é louvor e palavra.
   ============================================================================= */

const DESCRICAO = `${VIRADA.dataLonga}, no ${VIRADA.local}, ${VIRADA.bairro}. Entre em 2027 na presença de Deus. Reserva gratuita, com vagas limitadas a ${VIRADA.capacidade} pessoas.`;

export const metadata: Metadata = {
  title: VIRADA.nome,
  description: DESCRICAO,
  alternates: { canonical: '/virada' },
  openGraph: og('igreja', '/virada', `${VIRADA.nome}: entre em 2027 na presença de Deus`, DESCRICAO, '/og-virada.jpg', 'Virada 2027 · GUIA Church'),
};

/* a programação da noite, como está na copy */
const NOITE: ReadonlyArray<{ h: string; t: string; d: string; declaracao?: string }> = [
  { h: '19h30', t: 'Chegada e Momento de Reflexão', d: 'Um tempo para desacelerar e lembrar das bondades que Deus fez em 2026. Ao entrar, você é convidado a parar por alguns instantes, olhar para trás com gratidão e deixar que a presença de Deus acalme o coração antes da noite.' },
  { h: '20h', t: 'Jantar', d: 'Uma mesa farta, com tempo para conversar e se conectar com quem está ao seu lado.' },
  { h: '21h30', t: 'Muro das Bondades', d: 'Em cada mesa, um cartão dourado: “A bondade de Deus na minha vida em 2026 foi…”. Escreva seu testemunho e prenda no muro.' },
  { h: '22h', t: 'Culto da virada', d: 'Louvor e palavra do Pr. Altomir.' },
  { h: '23h35', t: 'Oração da virada', d: 'Luzes apagadas, só a cortina de luz. A igreja ora em pé por saúde, famílias, propósito e portas abertas.' },
  { h: '23h50', t: 'Cortejo de luzes', d: 'Você recebe uma vela de LED e caminha até o campo com a igreja inteira.' },
  { h: '0h', t: 'Fogos e declaração de 2027', d: 'Todos juntos leem a declaração:',
    declaracao: 'Viveremos a Sua bondade. Cresceremos para alcançar mais vidas. Avançaremos para o Seu propósito. Daremos a Ele toda a glória. Soli Deo Gloria!' },
  { h: '0h15', t: 'Brinde, abraços e sobremesa', d: 'Brinde sem álcool e tempo para celebrar com a família e os irmãos.' },
];

/* a faixa de fotos embaixo do "Você já sabe o que quer para 2027?" */
const FAIXA = ['virada-louvor', 'virada-oracao', 'virada-kids', 'virada-gente'] as const;

const PARA_QUEM = [
  'Para quem quer começar 2027 com fé, e não só com metas.',
  'Para quem atravessa um ano difícil e precisa de um lugar de oração.',
  'Para quem já caminha com a igreja e quer viver esse marco em comunidade.',
  'Para famílias: uma noite com atividades para as crianças, jantar juntos e muita adoração em família.',
];

const PERGUNTAS = [
  { q: 'A reserva é gratuita?', r: 'Sim. Basta preencher o cadastro para garantir seu lugar.' },
  { q: 'Onde será o evento?', r: `${VIRADA.local}, ${VIRADA.bairro}.` },
  { q: 'Quais dados preciso informar para reservar?', r: 'Nome completo, CPF, e-mail e telefone para contato.' },
  { q: 'Preciso ser membro da igreja?', r: 'Não. Membros, famílias e visitantes podem reservar. No formulário, você informa se é membro ou visitante.' },
  { q: 'Crianças podem ir?', r: 'Sim. A noite tem atividades para as crianças durante o jantar, com muita adoração em família.' },
  { q: 'Quantas pessoas posso reservar?', r: `Até ${MAX_POR_RESERVA} pessoas numa reserva, contando você. Cada pessoa conta nas ${VIRADA.capacidade} vagas.` },
];

export default function Virada() {
  return (
    <>
      <Schema dados={{
        '@context': 'https://schema.org', '@type': 'Event',
        name: VIRADA.nome, description: DESCRICAO,
        startDate: '2026-12-31T19:30:00-03:00', endDate: '2027-01-01T01:00:00-03:00',
        eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        location: { '@type': 'Place', name: VIRADA.local, address: { '@type': 'PostalAddress', addressLocality: `${VIRADA.bairro}, Rio de Janeiro`, addressRegion: 'RJ', addressCountry: 'BR' } },
        organizer: { '@type': 'Organization', name: IGREJA.nome, url: SITE_IGREJA },
        isAccessibleForFree: true, maximumAttendeeCapacity: VIRADA.capacidade,
        offers: { '@type': 'Offer', price: 0, priceCurrency: 'BRL', url: `${SITE_IGREJA}/virada#reserva`, availability: 'https://schema.org/LimitedAvailability' },
        url: `${SITE_IGREJA}/virada`, image: `${SITE_IGREJA}/og-virada.jpg`,
      }} />

      <Heroi id="t-vr" lugar="virada-heroi" longa enfeite={<Faiscas regiao="foto" />}
             chapeu={<Chapeu forte={VIRADA.nome} resto={`31 de dezembro, ${VIRADA.chegada}`} />}
             titulo="Um novo ano para ser transformado pela presença de Deus" it="transformado pela presença de Deus"
             lead={ligaTexto('Entre em 2027 na presença de Deus.')}
             micro={<>{VIRADA.local}, {VIRADA.bairro}<span className="vr-sep" aria-hidden="true"> · </span><span className="vr-quebra">{`Grátis, só ${VIRADA.capacidade} lugares.`}</span></>}>
        <Pil href="#reserva" className="vr-ouro">Garantir meu lugar</Pil>
        <Pil href="#programacao" tom="vidro">Ver a programação</Pil>
      </Heroi>

      {/* O INGRESSO: o cartão claro sobre a noite, com a contagem, o que a noite
          tem, a reserva grátis e a chamada. As vagas só com número do banco. */}
      <section id="ingresso" className="s-faixa noite s-grao justa" aria-labelledby="t-vr-ingresso">
        <div className="s-in">
          <div className="s-claro s-rev vr-ingresso">
            <Sede />
            <Chapeu forte={VIRADA.nome} resto={`Só ${VIRADA.capacidade} lugares`} />
            <ContagemVirada id="t-vr-ingresso" />
            <p className="s-lead">{ligaTexto(`31 de dezembro, a partir das ${VIRADA.chegada}.`)}</p>
            <div className="s-fatos lista vr-fatos">
              <div className="s-fato"><small>Onde</small><b>{VIRADA.local}</b><p>{VIRADA.bairro}</p></div>
              <div className="s-fato"><small>A noite</small><b>Jantar e fogos</b><p>Com culto, oração e brinde</p></div>
              <div className="s-fato"><small>Reserva</small><b>Grátis</b><p>{`Até ${MAX_POR_RESERVA} pessoas por reserva`}</p></div>
            </div>
            <div className="s-acoes centro"><Pil href="#reserva" className="vr-ouro">Garantir meu lugar</Pil></div>
            <VagasVirada />
          </div>
        </div>
      </section>

      <section className="s-faixa papel" aria-labelledby="t-vr-2027">
        <div className="s-in">
          <Sede className="topo" />
          <div className="s-cab centro s-rev vr-abre">
            <Vozes id="t-vr-2027" className="s-h2 media" it="para 2027?">Você já sabe o que quer para 2027?</Vozes>
            <p className="s-lead">{ligaTexto('Todo fim de ano a gente faz planos, promessas e pedidos. Mas e se desta vez a virada começasse diante de Deus, e não só diante das metas?')}</p>
            <p className="s-lead">{ligaTexto('Moisés pediu para ver a glória de Deus, e em Cristo nós a vemos. Esta noite é para parar, olhar e entrar em 2027 com o coração em oração.')}</p>
          </div>
          {/* o que a noite tem, em fotos da igreja: o louvor, a oração, as crianças, a gente */}
          <div className="vr-fotos s-rev d1">
            {FAIXA.map(l => <div key={l} className="s-foto v"><Img lugar={l} sizes="(max-width: 759px) 46vw, (max-width: 1199px) 23vw, 280px" /></div>)}
          </div>
        </div>
      </section>

      <section id="programacao" className="s-faixa areia" aria-labelledby="t-vr-prog">
        <div className="s-in">
          <SerifaCab id="t-vr-prog" titulo="Programação da noite" sub="Chegue cedo e confira aqui os detalhes da melhor virada da sua vida." />
          <ol className="s-passos vr-noite s-rev d1">
            {NOITE.map(p => (
              <li key={p.h}>
                <b><span className="vr-hora">{p.h}</span> {liga(p.t)}</b>
                <div>
                  <p>{ligaTexto(p.d)}</p>
                  {p.declaracao && <blockquote className="vr-declaracao"><p>“{p.declaracao}”</p></blockquote>}
                </div>
              </li>
            ))}
          </ol>
          <Sede className="base" />
        </div>
      </section>

      <section className="s-faixa noite s-grao" aria-labelledby="t-vr-quem">
        <div className="s-in">
          <div className="s-duas inv">
            <div className="s-foto v s-rev"><Img lugar="virada-noite" sizes="(max-width: 999px) 90vw, 420px" /></div>
            <div className="s-rev d1">
              <Chapeu forte={VIRADA.nome} resto="Para quem é" />
              <Vozes id="t-vr-quem" className="s-h2 media" it="quem é">Para quem é</Vozes>
              <ul className="vr-lista">
                {PARA_QUEM.map(t => <li key={t}><span className="vr-check"><Visto /></span><span>{ligaTexto(t)}</span></li>)}
              </ul>
            </div>
          </div>
          <Sede className="base" />
        </div>
      </section>

      <section id="reserva" className="s-faixa papel vr-reserva" aria-labelledby="t-vr-reserva">
        <div className="s-in">
          <div className="s-cab centro s-rev">
            <Chapeu forte="Reserva gratuita" resto={`${VIRADA.capacidade} vagas`} />
            <Vozes id="t-vr-reserva" className="s-h2 media" it="lugar">Garanta seu lugar</Vozes>
            <p className="s-lead">{ligaTexto('Reserve seu lugar nesta noite incrível na presença de Deus. A reserva é gratuita, mas temos vagas limitadas para que possamos receber você com mais conforto e segurança.')}</p>
          </div>
          <div className="s-rev d1"><ReservaVirada /></div>
        </div>
      </section>

      <FaixaPerguntas tid="t-vr-faq" titulo="Perguntas frequentes" itens={PERGUNTAS} tom="areia" />

      {/* a barra do celular é fixa: antes do fecho no DOM, para o fecho seguir como o último
          filho do main (app/site.css dá a ele o pé mais curto da casa) */}
      <BarraReserva />

      <Fecho titulo="Entre em 2027 com o coração em oração" it="em oração" enfeite={<Faiscas densidade={0.7} />}
             lead="Você não precisa ter tudo resolvido para vir. Basta ir com o coração aberto para ver a glória de Deus transformar a sua vida."
             micro={<>{`Grátis, só ${VIRADA.capacidade} lugares.`} Dúvidas? <a href={whatsDuvida()} target="_blank" rel="noreferrer" data-medir="whatsapp">Fale no WhatsApp</a>.</>}>
        <Pil href="#reserva" className="vr-ouro">Garantir meu lugar</Pil>
      </Fecho>

    </>
  );
}
