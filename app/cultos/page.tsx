import type { Metadata } from 'next';
import { Foto } from '@/components/Foto';
import Link from 'next/link';
import { cartao } from '@/lib/meta';
import { Site } from '@/components/Site';
import { Tit, Schema } from '@/components/Texto';
import ProximoCulto from '@/components/ProximoCulto';
import { IcSeta } from '@/components/Icones';
import { IGREJA, SITE, CULTO_QUANDO, MAPA, MAPA_EMBED, ROTA_WAZE, canalDeConversa } from '@/lib/igreja';
import { src as cria, alt as criaAlt, preloadHeroi } from '@/lib/criativos';

/* =============================================================================
   /cultos — A PÁGINA QUE TIRA ALGUÉM DE CASA

   Responde QUANDO, ONDE e O QUE ESPERAR, numa página só.

   11/10/2026: o Arthur pediu "sem muita aba, algo mais direto". Esta página
   absorveu o que estava espalhado: o COMO CHEGAR (mapa, endereço, as três
   formas de chegar) e o AO VIVO (a página da TV, que tinha uma tela só e
   sumiu; /guia-church-tv redireciona para #ao-vivo). /como-chegar continua
   existindo como página própria porque está nos links do WhatsApp da igreja
   e nas respostas rápidas; daqui ela sai do menu, não do ar.

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
  { r: 'Quando', v: `Culto aos ${IGREJA.cultoDia.toLowerCase()}s, às ${IGREJA.cultoHora}` },
  { r: 'Endereço', v: `${IGREJA.rua}, ${IGREJA.bairro}`, href: '#como-chegar' },
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

/* COMO CHEGAR — os três modos, textos do Arthur (08/09/2026), palavra por
   palavra; o endereço sai de lib/igreja.ts para nunca divergir */
const MODOS: Array<{ n: string; t: string; d: string; endereco?: string; d2?: string }> = [
  { n: '01', t: 'De carro',
    d: 'Aos domingos pela manhã, nossa equipe estará no local para orientar sua chegada e indicar o melhor lugar para estacionar. Para chegar com tranquilidade, recomendamos que você venha com pelo menos 10 minutos de antecedência.' },
  { n: '02', t: 'De aplicativo',
    d: 'Insira o endereço abaixo no seu aplicativo:', endereco: `${IGREJA.rua}, ${IGREJA.bairro}`,
    d2: 'O desembarque acontece diretamente na entrada da GUIA Church.' },
  { n: '03', t: 'Chegando na nossa casa',
    d: 'Nossa equipe estará na entrada para receber você antes do início do culto. Se for sua primeira vez, informe à recepção. Será uma alegria ajudar você e apresentar a GUIA Church.' },
];

const PASSOS = [
  { n: '01', t: 'Acolhida', foto: 'cultos-acolhida' },
  { n: '02', t: 'Louvor', foto: 'cultos-louvor' },
  { n: '03', t: 'Palavra', foto: 'cultos-palavra' },
  { n: '04', t: 'Oração e saída', foto: 'cultos-saida' },
] as const;

export const metadata: Metadata = {
  title: 'Cultos',
  description:
    `Um domingo para pertencer: culto aos ${IGREJA.cultoDia.toLowerCase()}s, às ${IGREJA.cultoHora}, na ${IGREJA.rua}, ${IGREJA.bairro}. Como chegar, o que esperar na sua primeira vez e o Follow aos sábados.`,
  alternates: { canonical: '/cultos' },
  ...cartao({ titulo: 'Cultos', descricao: `Um domingo para pertencer. ${CULTO_QUANDO}, ${IGREJA.bairro}.`, caminho: '/cultos', imagem: 'cultos' }),
};

export default function Cultos() {
  preloadHeroi('cultos');
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
      <section className="g-cheio alta centro rev visto">
        <img src={cria('cultos')} alt={criaAlt('cultos')} fetchPriority="high" />
        <div className="g">
          <p className="g-rot"><ProximoCulto /></p>
          <Tit as="h1" className="g-h1">Um domingo para pertencer</Tit>
          <p className="g-ed">Aos domingos, nos reunimos para adorar a Deus, ouvir a Palavra e viver a comunhão com outras pessoas. Cada momento é preparado para que você e sua família se sintam acolhidos, participem da celebração e encontrem um lugar para pertencer.</p>
          <div className="g-acoes">
            <a href="#como-chegar" className="acao cheia">Como chegar <IcSeta /></a>
            <a href="#ao-vivo" className="g-link claro">Assistir ao vivo</a>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------- a ordem do culto */}
      <section className="casa-papel rev">
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
                <Foto src={cria(p.foto)} sizes="(max-width: 759px) 50vw, 25vw" />
                <span className="g-passo-n">{p.n}</span>
                <span className="g-passo-t">{p.t}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------- a primeira vez */}
      <section className="casa-escuro rev" aria-labelledby="primeira-t">
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
                  ? <a href={l.href} className="g-linhas-v">{l.v} <IcSeta /></a>
                  : <span className="g-linhas-v">{l.v}</span>}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ------------------------------------------------------ como chegar
          O endereço, as duas rotas e as três formas de chegar; depois o mapa
          inteiro, tratado para a paleta (ver .mapa em globals.css), com o
          cartão de endereço por cima. Era a /como-chegar; mora aqui desde
          11/10/2026. */}
      <section id="como-chegar" className="casa-papel rev" aria-labelledby="chegar-t">
        <div className="g g-secao">
          <div className="g-cab">
            <div className="g-cab-txt">
              <p className="g-rot">Onde fica</p>
              <Tit className="g-h2" id="chegar-t">Como chegar até a gente</Tit>
              <p className="g-ed"><span className="nao-quebra">{IGREJA.rua}</span>, <span className="nao-quebra">{IGREJA.bairro}</span>, {IGREJA.cidade}. De carro, de aplicativo ou a pé: tem alguém na porta esperando você.</p>
            </div>
            <div className="g-acoes">
              <a href={MAPA} target="_blank" rel="noreferrer" className="acao cheia">Traçar rota no Maps <IcSeta /></a>
              <a href={ROTA_WAZE} target="_blank" rel="noreferrer" className="acao">Abrir no Waze</a>
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

      {/* ------------------------------------------------------------ ao vivo
          Era a /guia-church-tv (uma tela só). O canal do YouTube continua
          desligado (IGREJA.youtube = null, decisão 02 em aberto): enquanto
          for null, o ao vivo aponta para o Instagram, sem prometer acervo. */}
      <section id="ao-vivo" className="g-cheio centro rev" aria-labelledby="vivo-t">
        <Foto src={cria('tv')} sizes="100vw" />
        <div className="g">
          <p className="g-rot">Ao vivo</p>
          <Tit className="g-h2" id="vivo-t">A mensagem de domingo</Tit>
          <p className="g-ed">{IGREJA.youtube ? `Ao vivo todo ${IGREJA.cultoDia.toLowerCase()}, às ${IGREJA.cultoHora}, e para ver de novo.` : `Toda semana, em ${IGREJA.instagramArroba}.`}</p>
          <div className="g-acoes">
            {IGREJA.youtube
              ? <a href={IGREJA.youtube} target="_blank" rel="noreferrer" className="acao cheia">Assistir no canal <IcSeta /></a>
              : <a href={IGREJA.instagram} target="_blank" rel="noreferrer" className="acao cheia">Acompanhar no Instagram <IcSeta /></a>}
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
              <p className="g-ed">O culto de jovens da GUIA. {FOLLOW_HORA ? `Todo sábado, às ${FOLLOW_HORA}.` : 'Todo sábado.'}</p>
            </div>
            <div className="g-acoes">
              {FOLLOW_HORA
                ? <a href="#como-chegar" className="acao cheia">Como chegar <IcSeta /></a>
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
            <a href="#como-chegar" className="casa-area corte">
              <Foto src={cria('cultos-fecho')} sizes="(max-width: 759px) 100vw, 50vw" />
              <span className="casa-area-nome">Participe de um culto</span>
              <p className="casa-area-desc">Venha conhecer a GUIA, celebrar com a gente e viver uma experiência de domingo em comunidade.</p>
              <span className="casa-area-cta">Quero participar de um culto <IcSeta /></span>
            </a>
            <Link href="/pequena-guia" className="casa-area corte">
              <Foto src={cria('grupos-cartao')} sizes="(max-width: 759px) 100vw, 50vw" />
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
