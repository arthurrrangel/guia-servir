import type { Metadata } from 'next';
import Link from 'next/link';
import { cartao } from '@/lib/meta';
import { Site } from '@/components/Site';
import { Tit, Schema } from '@/components/Texto';
import { Cabecalho, Fecho } from '@/components/Pagina';
import ProximoCulto from '@/components/ProximoCulto';
import { IcSeta } from '@/components/Icones';
import { IGREJA, SITE, canalDeConversa } from '@/lib/igreja';

/* =============================================================================
   /cultos — A PÁGINA QUE TIRA ALGUÉM DE CASA

   Responde QUANDO e O QUE ESPERAR. O ONDE tem página própria (/como-chegar).

   V3 (08/09/2026): cabeçalho da casa (sem foto obrigatória), a ordem do
   culto em quatro passos de tipo (eram quatro fotos), a ficha do domingo, o
   FOLLOW com âncora própria (#follow: a home aponta para cá quando o
   próximo evento é o sábado), e o fecho.

   A ORDEM diz o que a pessoa vai ver, com as palavras que as próprias áreas
   escreveram no banco (recepção e setores do salão; vocal, banda, som e
   palco; projeção e transmissão; a livraria que fecha depois). Nada aqui
   inventa horário nem função.

   AS PERGUNTAS são palavra por palavra as da igreja. Três, não cinco: é o
   que cabe numa tela sem virar parede de texto.
   ============================================================================= */

/* A FICHA DO DOMINGO: os fatos de quem nunca foi, em rótulo + valor + uma
   linha. É a mesma informação das antigas "cinco perguntas", sem a prosa. */
const PERGUNTAS = [
  { q: 'Como eu me visto?', r: 'Do jeito que você já está. Tem gente de terno e gente de chinelo na mesma fileira.' },
  { q: 'Vou ter que falar alguma coisa?', r: 'Não. Tem um momento de acolhida no meio do culto, e ficar sentado é uma resposta perfeitamente boa.' },
  { q: 'E o meu filho?', r: 'Tem o GUIA Kids, com sala e equipe próprias, dividido por faixa etária. Check-in na entrada.' },
];
const FICHA = [
  { r: 'Quando', v: 'Domingo, 10h', d: 'Toda semana, no mesmo horário.' },
  { r: 'Onde', v: IGREJA.rua, d: `${IGREJA.bairro}, ${IGREJA.cidade}.`, href: '/como-chegar' },
  { r: 'Crianças', v: 'GUIA Kids', d: 'Sala e equipe próprias, por faixa etária. Check-in na entrada.' },
  { r: 'Roupa', v: 'A que você já usa', d: 'Tem gente de terno e gente de chinelo na mesma fileira.' },
  { r: 'Participação', v: 'Nenhuma obrigatória', d: 'Ficar sentado é uma resposta perfeitamente boa.' },
  { r: 'Estacionamento', v: 'Com equipe', d: 'Chegue com dez minutos de folga se vier dirigindo.' },
];

const ORDEM = [
  { n: '01', t: 'Acolhida', d: 'Alguém recebe você na porta e indica o lugar.' },
  { n: '02', t: 'Louvor', d: 'Vocal, banda, som e palco conduzem a igreja na adoração.' },
  { n: '03', t: 'Palavra', d: 'A mensagem do domingo, no telão e na transmissão.' },
  { n: '04', t: 'Oração e saída', d: 'A livraria fica aberta depois do culto.' },
];

/* o horário do Follow não está confirmado (ver lib/igreja.ts): enquanto for
   null, a página diz o dia e oferece a conversa para a hora */
const FOLLOW_HORA = IGREJA.followHora as string | null;
const PERGUNTAR_FOLLOW = canalDeConversa('Oi! Vi o site da GUIA e quero saber o horário do Follow, o culto de jovens. ');

export const metadata: Metadata = {
  title: 'Cultos',
  description:
    'Culto aos domingos, às 10h, na Barra da Tijuca. O que esperar antes de você sair de casa.',
  alternates: { canonical: '/cultos' },
  ...cartao({ titulo: 'Cultos', descricao: 'Domingo, 10h, Barra da Tijuca. O que esperar antes de sair de casa.', caminho: '/cultos', imagem: 'cultos' }),
};

export default function Cultos() {
  return (
    <Site atual="/cultos" escuro>
      <Schema dados={{
        '@context': 'https://schema.org', '@type': 'FAQPage',
        mainEntity: PERGUNTAS.map(p => ({ '@type': 'Question', name: p.q, acceptedAnswer: { '@type': 'Answer', text: p.r } })),
      }} />
      <Schema dados={{
        '@context': 'https://schema.org', '@type': 'Event',
        name: `Culto de domingo · ${IGREJA.nome}`, description: 'Culto público semanal, aberto a visitantes.',
        eventSchedule: { '@type': 'Schedule', byDay: 'https://schema.org/Sunday', startTime: '10:00', scheduleTimezone: 'America/Sao_Paulo' },
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', isAccessibleForFree: true,
        organizer: { '@type': 'Church', name: IGREJA.nome, url: SITE },
        location: { '@type': 'Place', name: IGREJA.nome, address: { '@type': 'PostalAddress', streetAddress: IGREJA.rua, addressLocality: `${IGREJA.bairro}, ${IGREJA.cidade}`, addressRegion: IGREJA.uf, postalCode: IGREJA.cep, addressCountry: 'BR' } },
      }} />

      {/* ------------------------------------------------------------ herói */}
      <Cabecalho criativo="cultos" rot={<ProximoCulto />} titulo="Culto de domingo"
        ed={<>Toda semana, às {IGREJA.cultoHora}, na {IGREJA.bairro}.</>}
        acoes={<>
          <Link href="/como-chegar" className="acao cheia">Como chegar <IcSeta /></Link>
          <Link href="/#semana" className="g-link claro">Ver a semana inteira</Link>
        </>} />

      {/* ------------------------------------------------- a ordem do culto */}
      <section className="casa-papel rev">
        <div className="g g-secao">
          <div className="g-cab">
            <div className="g-cab-txt">
              <p className="g-rot">Na prática</p>
              <Tit className="g-h2">Como é um domingo aqui</Tit>
              <p className="g-ed">Na mesma ordem, toda semana.</p>
            </div>
          </div>
          <ol className="ordem c-bloco grande" aria-label="A ordem do culto">
            {ORDEM.map(p => (
              <li key={p.n} className="ordem-i">
                <span className="ordem-n" aria-hidden="true">{p.n}</span>
                <div>
                  <h3 className="ordem-t">{p.t}</h3>
                  <p className="ordem-d">{p.d}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------- a ficha do domingo */}
      <section className="casa-areia rev">
        <div className="g g-secao">
          <div className="g-cab">
            <div className="g-cab-txt">
              <p className="g-rot">Primeira vez</p>
              <Tit className="g-h2">O que você precisa saber</Tit>
              <p className="g-ed">Seis coisas, nenhuma sobre doutrina.</p>
            </div>
          </div>
          <div className="ficha c-bloco grande">
            {FICHA.map(f => (
              <div key={f.r}>
                <p className="ficha-r">{f.r}</p>
                {f.href
                  ? <Link href={f.href} className="ficha-v">{f.v} <IcSeta /></Link>
                  : <p className="ficha-v">{f.v}</p>}
                <p className="ficha-d">{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ follow */}
      <section id="follow" className="casa-papel rev" aria-labelledby="follow-t">
        <div className="g g-secao">
          <div className="g-cab">
            <div className="g-cab-txt">
              <p className="g-rot">Sábado</p>
              <Tit className="g-h2" id="follow-t">Follow</Tit>
              <p className="g-ed">O culto de jovens da GUIA. {FOLLOW_HORA ? `Sábado, ${FOLLOW_HORA}, menos o primeiro do mês.` : 'Todo sábado, menos o primeiro do mês.'}</p>
            </div>
            <div className="g-acoes">
              {FOLLOW_HORA
                ? <Link href="/como-chegar" className="acao cheia">Como chegar <IcSeta /></Link>
                : <a href={PERGUNTAR_FOLLOW.href} target="_blank" rel="noreferrer" className="g-link">Perguntar o horário no Instagram</a>}
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ fecho */}
      <Fecho rot="Te esperamos" titulo="A porta é a mesma para todo mundo."
        acoes={<>
          <Link href="/como-chegar" className="acao cheia">Traçar rota <IcSeta /></Link>
          <Link href="/pequena-guia" className="g-link claro">Ou começar pela semana</Link>
        </>} />
    </Site>
  );
}
