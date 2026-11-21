import type { Metadata } from 'next';
import { og } from '@/lib/site/meta';
import { IGREJA, SITE_IGREJA } from '@/lib/igreja';
import { VIRADA, MAX_POR_RESERVA, whatsDuvida } from '@/lib/virada';
import { Chapeu, Pil, Img, Heroi, Fecho, Vozes, Sede, SerifaCab, FaixaPerguntas, Visto, ligaTexto, liga } from '@/components/site/Blocos';
import { Schema } from '@/components/site/Schema';
import ReservaVirada from '@/components/site/ReservaVirada';

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
  { h: '22h', t: 'Culto da virada', d: 'Louvor, palavra do Pr. Altomir e ceia, se houver.' },
  { h: '23h35', t: 'Oração da virada', d: 'Luzes apagadas, só a cortina de luz. A igreja ora em pé por saúde, famílias, propósito e portas abertas.' },
  { h: '23h50', t: 'Cortejo de luzes', d: 'Você recebe uma vela de LED e caminha até o campo com a igreja inteira.' },
  { h: '0h', t: 'Fogos e declaração de 2027', d: 'Todos juntos leem a declaração:',
    declaracao: 'Viveremos a Sua bondade. Cresceremos para alcançar mais vidas. Avançaremos para o Seu propósito. Daremos a Ele toda a glória. Soli Deo Gloria!' },
  { h: '0h15', t: 'Brinde, abraços e sobremesa', d: 'Brinde sem álcool e tempo para celebrar com a família e os irmãos.' },
];

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

      <Heroi id="t-vr" lugar="virada-heroi" longa
             chapeu={<Chapeu forte={VIRADA.nome} resto={`31 de dezembro, ${VIRADA.chegada}`} />}
             titulo="Um novo ano para ser transformado pela presença de Deus" it="transformado pela presença de Deus"
             lead={ligaTexto('Entre em 2027 na presença de Deus.')}
             micro={<>{VIRADA.local}, {VIRADA.bairro}<span className="vr-sep" aria-hidden="true"> · </span><span className="vr-quebra">Vagas limitadas. Reserva para membros, famílias e convidados.</span></>}>
        <Pil href="#reserva">Quero reservar meu lugar</Pil>
        <Pil href="#programacao" tom="vidro">Veja como será a noite</Pil>
      </Heroi>

      <section className="s-faixa papel" aria-labelledby="t-vr-2027">
        <div className="s-in">
          <Sede className="topo" />
          <div className="s-cab centro s-rev vr-abre">
            <Vozes id="t-vr-2027" className="s-h2 media" it="para 2027?">Você já sabe o que quer para 2027?</Vozes>
            <p className="s-lead">{ligaTexto('Todo fim de ano a gente faz planos, promessas e pedidos. Mas e se desta vez a virada começasse diante de Deus, e não só diante das metas?')}</p>
            <p className="s-lead">{ligaTexto('Moisés pediu para ver a glória de Deus, e em Cristo nós a vemos. Esta noite é para parar, olhar e entrar em 2027 com o coração em oração.')}</p>
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
            <Vozes id="t-vr-reserva" className="s-h2 media" it="reserva">Faça sua reserva</Vozes>
            <p className="s-lead">{ligaTexto('Reserve seu lugar nesta noite incrível na presença de Deus. A reserva é gratuita, mas temos vagas limitadas para que possamos receber você com mais conforto e segurança.')}</p>
          </div>
          <div className="s-rev d1"><ReservaVirada /></div>
        </div>
      </section>

      <FaixaPerguntas tid="t-vr-faq" titulo="Perguntas frequentes" itens={PERGUNTAS} tom="areia" />

      <Fecho titulo="Entre em 2027 com o coração em oração" it="em oração"
             lead="Você não precisa ter tudo resolvido para vir. Basta ir com o coração aberto para ver a glória de Deus transformar a sua vida."
             micro={<>Vagas limitadas a {VIRADA.capacidade} pessoas. Dúvidas? <a href={whatsDuvida()} target="_blank" rel="noreferrer" data-medir="whatsapp">Fale no WhatsApp</a>.</>}>
        <Pil href="#reserva">Quero reservar meu lugar</Pil>
      </Fecho>
    </>
  );
}
