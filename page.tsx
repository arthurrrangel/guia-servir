import type { Metadata } from 'next';
import Link from 'next/link';
import { cartao } from '@/lib/meta';
import { Site } from '@/components/Site';
import { Tit, Schema } from '@/components/Texto';
import ProximoCulto from '@/components/ProximoCulto';
import { IcSeta } from '@/components/Icones';
import { IGREJA, SITE, canalDeConversa } from '@/lib/igreja';
import { src as cria, alt as criaAlt } from '@/lib/criativos';

/* =============================================================================
   /cultos — A PÁGINA QUE TIRA ALGUÉM DE CASA

   Responde QUANDO e O QUE ESPERAR. O ONDE tem página própria (/como-chegar).

   08/09/2026: os textos são os do Arthur, palavra por palavra, na ordem que
   ele pediu — "Um domingo para pertencer", "É a sua primeira vez?", "O que
   você precisa saber", "Escolha seu próximo passo". O que ele não citou e
   decidiu manter: as quatro fotos da ordem do culto e a seção do Follow (a
   pílula da home aponta para #follow quando a próxima coisa é o sábado).

   Como o texto é mais longo que o de antes, ele é diagramado em blocos
   curtos: a primeira vez em três fichas (chegar / culto / crianças), o que
   precisa saber em cinco linhas, o próximo passo em duas portas de foto.
   Nenhuma parede de texto.

   10/09/2026: o parágrafo de abertura estava PARTIDO — a primeira frase no
   herói, a segunda ("Cada momento é preparado...") como linha da faixa das
   fotos. No texto do Arthur as duas são UM parágrafo só, logo abaixo do
   título. Elas voltaram a ficar juntas no herói, e a faixa das fotos ficou
   com rótulo e título, sem linha de apoio — repetir a frase nos dois lugares
   seria escrever o que ele não escreveu. A seção não saiu.
   ============================================================================= */

/* É A SUA PRIMEIRA VEZ? — três momentos, os três parágrafos do Arthur */
const PRIMEIRA_VEZ = [
  { r: 'Ao chegar', v: 'A equipe Connect recebe você',
    d: 'Ao chegar, nossa equipe de Connect estará disponível para orientar você, apresentar os espaços da igreja e responder às suas dúvidas.' },
  { r: 'Durante o culto', v: 'Louvor, mensagem e comunidade',
    d: 'Durante o culto, você poderá participar de um momento de louvor, ouvir uma mensagem baseada na Bíblia e conhecer uma comunidade que valoriza relacionamento, generosidade e serviço.' },
  { r: 'Com crianças', v: 'GUIA Kids',
    d: 'Se vier com crianças, a GUIA Kids oferece um ambiente preparado para recebê-las com segurança, cuidado e uma linguagem adequada para cada faixa etária.' },
];

/* O QUE VOCÊ PRECISA SABER — cinco linhas, as cinco do Arthur */
const PRECISA_SABER: Array<{ r: string; v: string; href?: string }> = [
  { r: 'Quando', v: 'Culto aos domingos, às 10h' },
  { r: 'Endereço', v: `${IGREJA.rua}, ${IGREJA.bairro}`, href: '/como-chegar' },
  { r: 'Recepção', v: 'Nossa equipe estará pronta para receber você' },
  { r: 'Crianças', v: 'Temos um espaço preparado para as crianças' },
  { r: 'Chegada', v: 'Você pode chegar alguns minutos antes para conhecer o ambiente com calma' },
];

/* O FOLLOW, com âncora própria (#follow): a home aponta para cá quando a
   próxima coisa da semana é o sábado. O horário não está confirmado (ver
   lib/igreja.ts): enquanto for null, a seção diz o dia e oferece a conversa
   para a hora. */
const FOLLOW_HORA = IGREJA.followHora as string | null;
const PERGUNTAR_FOLLOW = canalDeConversa('Oi! Vi o site da GUIA e quero saber o horário do Follow, o culto de jovens. ');

const PASSOS = [
  { n: '01', t: 'Acolhida', foto: 'cultos-acolhida' },
  { n: '02', t: 'Louvor', foto: 'cultos-louvor' },
  { n: '03', t: 'Palavra', foto: 'cultos-palavra' },
  { n: '04', t: 'Oração e saída', foto: 'cultos-saida' },
] as const;

export const metadata: Metadata = {
  title: 'Cultos',
  description:
    'Um domingo para pertencer: culto aos domingos, às 10h, na Barra da Tijuca. O que esperar na sua primeira vez.',
  alternates: { canonical: '/cultos' },
  ...cartao({ titulo: 'Cultos', descricao: 'Um domingo para pertencer. Domingo, 10h, Barra da Tijuca.', caminho: '/cultos', imagem: 'cultos' }),
};

export default function Cultos() {
  return (
    <Site atual="/cultos" escuro>
      <Schema dados={{
        '@context': 'https://schema.org', '@type': 'FAQPage',
        mainEntity: [
          { '@type': 'Question', name: 'É a sua primeira vez na GUIA Church?', acceptedAnswer: { '@type': 'Answer', text: 'Você será recebido por uma equipe preparada para ajudar em cada etapa da sua experiência. ' + PRIMEIRA_VEZ.map(p => p.d).join(' ') } },
          { '@type': 'Question', name: 'Que horas é o culto?', acceptedAnswer: { '@type': 'Answer', text: `Culto aos domingos, às 10h, na ${IGREJA.rua}, ${IGREJA.bairro}. Você pode chegar alguns minutos antes para conhecer o ambiente com calma.` } },
          { '@type': 'Question', name: 'Tem espaço para crianças?', acceptedAnswer: { '@type': 'Answer', text: PRIMEIRA_VEZ[2].d } },
        ],
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
      <section className="g-cheio alta centro rev">
        <img src={cria('cultos')} alt={criaAlt('cultos')} fetchPriority="high" />
        <div className="g">
          <p className="g-rot"><ProximoCulto /></p>
          <Tit as="h1" className="g-h1">Um domingo para pertencer</Tit>
          <p className="g-ed">Aos domingos, nos reunimos para adorar a Deus, ouvir a Palavra e viver a comunhão com outras pessoas. Cada momento é preparado para que você e sua família se sintam acolhidos, participem da celebração e encontrem um lugar para pertencer.</p>
          <div className="g-acoes">
            <Link href="/como-chegar" className="acao cheia">Como chegar <IcSeta /></Link>
            <Link href="/sobre" className="g-link claro">Quem somos</Link>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------- a ordem do culto */}
      <section className="casa-escuro retic rev">
        <div className="g g-secao">
          <div className="g-cab">
            <div className="g-cab-txt">
              <p className="g-rot">Na prática</p>
              <Tit className="g-h2">Como é um domingo aqui</Tit>
            </div>
          </div>
          <div className="g-passos centro c-bloco grande">
            {PASSOS.map(p => (
              <div key={p.n} className="g-passo">
                <img src={cria(p.foto)} alt="" loading="lazy" decoding="async" />
                <span className="g-passo-n">{p.n}</span>
                <span className="g-passo-t">{p.t}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------- a primeira vez */}
      <section className="casa-papel rev" aria-labelledby="primeira-t">
        <div className="g g-secao">
          <div className="g-cab">
            <div className="g-cab-txt">
              <p className="g-rot">Primeira vez</p>
              <Tit className="g-h2" id="primeira-t">É a sua primeira vez?</Tit>
              <p className="g-ed">Você será recebido por uma equipe preparada para ajudar em cada etapa da sua experiência.</p>
            </div>
          </div>
          <div className="ficha c-bloco grande">
            {PRIMEIRA_VEZ.map(f => (
              <div key={f.r}>
                <p className="ficha-r">{f.r}</p>
                <p className="ficha-v">{f.v}</p>
                <p className="ficha-d">{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------- o que precisa saber */}
      <section className="casa-areia rev" aria-labelledby="saber-t">
        <div className="g g-secao">
          <div className="g-cab">
            <div className="g-cab-txt">
              <p className="g-rot">Antes de sair de casa</p>
              <Tit className="g-h2" id="saber-t">O que você precisa saber</Tit>
            </div>
          </div>
          <ul className="g-linhas c-bloco grande">
            {PRECISA_SABER.map(l => (
              <li key={l.r}>
                <span className="g-linhas-r">{l.r}</span>
                {l.href
                  ? <Link href={l.href} className="g-linhas-v">{l.v} <IcSeta /></Link>
                  : <span className="g-linhas-v">{l.v}</span>}
              </li>
            ))}
          </ul>
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

      {/* ------------------------------------------------ o próximo passo
          Duas portas de foto, o mesmo componente da home: participar de um
          culto (o caminho é o endereço) ou conhecer uma Pequena Guia. */}
      <section className="casa-escuro rev" aria-labelledby="passo-t">
        <div className="g g-secao">
          <div className="c">
            <p className="g-rot">Próximo passo</p>
            <Tit className="g-h2" id="passo-t">Escolha seu próximo passo</Tit>
          </div>
          <div className="casa-areas centro duas c-bloco">
            <Link href="/como-chegar" className="casa-area corte">
              <img src={cria('cultos-fecho')} alt="" loading="lazy" decoding="async" />
              <span className="casa-area-nome">Participe de um culto</span>
              <p className="casa-area-desc">Venha conhecer a GUIA, celebrar com a gente e viver uma experiência de domingo em comunidade.</p>
              <span className="casa-area-cta">Quero participar de um culto <IcSeta /></span>
            </Link>
            <Link href="/pequena-guia" className="casa-area corte">
              <img src={cria('grupos')} alt="" loading="lazy" decoding="async" />
              <span className="casa-area-nome">Conheça uma Pequena Guia</span>
              <p className="casa-area-desc">Se você deseja construir relacionamentos mais próximos e continuar sua caminhada durante a semana, encontre uma Pequena Guia perto de você.</p>
              <span className="casa-area-cta">Quero conhecer uma Pequena Guia <IcSeta /></span>
            </Link>
          </div>
        </div>
      </section>
    </Site>
  );
}
