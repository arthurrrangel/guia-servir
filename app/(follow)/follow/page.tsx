import { IGREJA, MAPA, SITE_FOLLOW, SITE_IGREJA, canalDeConversa } from '@/lib/igreja';
import { naIgreja } from '@/lib/site/sites';
import { Simbolo } from '@/components/Marca';
import { Schema } from '@/components/site/Schema';
import { Vozes, Sede, Arroba, Chapeu, Pil, Claro, Fecho, UmaLinha, liga, ligaTexto, fim } from '@/components/site/Blocos';
import Scrub, { type Foto } from '@/components/site/Scrub';
import Contagem from '@/components/follow/Contagem';

/* =============================================================================
   GUIA FOLLOW · guiafollow.com · 19 e 20/10/2026

   A página do culto de jovens, construída com a skill site-de-10k do Arthur
   e o pacote de design do projeto (claude/follow-site-10k-pacote-de-design):
   a premissa é casa (quem chega é recebido como família, com Jesus no
   centro), a página é uma chegada, e pousa na frase dele, "Um lugar para
   todos". Cada linha de texto aqui veio do pacote ao pé da letra.

   20/10/2026: NA IDENTIDADE DA CASA. A primeira versão tinha folha própria
   (azul-marinho, creme, outra fonte) e o Arthur reprovou assim que viu no
   ar: "esse do Follow tá sem id visual". A página passou para a mesma
   folha, a mesma barra e o mesmo pé do Guia Church e do Guia Servir, com os
   blocos da apresentação: o cartão claro sobre a noite (tela 6) para a
   primeira vez, os fatos em linha para quando e onde, a faixa de areia do
   Camp e o fecho da noite. O que é só do Follow é o herói que anda com o
   scroll (components/site/Scrub.tsx), e esse fala a mesma língua: Inter
   800 com a última palavra em serifa itálica, o chapéu laranja, as pílulas.

   O HERÓI anda sobre cinco fotos de verdade do Follow (scripts/follow-
   fotos.py: Drive da igreja, 07.02 e 28.02 de 2026, tratamento do
   fotógrafo). Nada gerado por IA: o Arthur reprovou o vídeo gerado em 20/10
   e pediu os materiais reais. Duas faixas de legenda, uma foto em silêncio
   (os braços abertos) e o pouso com a única chamada da página: avisar que
   vai, pelo WhatsApp da igreja (medido como avisou_que_vai). Abaixo, só o
   que quem nunca foi precisa: as quatro dúvidas, quando e onde (com a
   contagem até o próximo sábado), o Follow Camp e o fecho. Sem formulário.

   O FOLLOW CAMP continua em guiachurch.com/followcamp (o pagamento usa
   sessionStorage do domínio); daqui é um link inteiro.
   ============================================================================= */

const CONVERSA = canalDeConversa('Oi! Quero ir no Follow no sábado.');
const CAMP = naIgreja('/followcamp');

/* as cinco fotos, na ordem do scroll: cada uma entra com fusão entre a e b */
const FOTOS: Foto[] = [
  { l: '/follow/f1-l.webp', p: '/follow/f1-p.webp', a: 0, b: 0, alt: 'Jovens conversando nos sofás antes do Follow' },
  { l: '/follow/f2-l.webp', p: '/follow/f2-p.webp', a: 0.18, b: 0.26, alt: 'Três jovens rindo na entrada do Follow' },
  { l: '/follow/f3-l.webp', p: '/follow/f3-p.webp', a: 0.36, b: 0.44, alt: 'Jovens em adoração, de mãos levantadas' },
  { l: '/follow/f4-l.webp', p: '/follow/f4-p.webp', a: 0.60, b: 0.68, alt: 'Ministro de louvor de braços abertos diante do telão' },
  { l: '/follow/f5-l.webp', p: '/follow/f5-p.webp', a: 0.74, b: 0.82, alt: 'A sala do Follow cheia, todo mundo de pé' },
];

/* as quatro dúvidas de quem nunca foi (o pacote, ao pé da letra) */
const DUVIDAS = [
  { q: 'Não sou de igreja.', r: 'Vem assim mesmo. O Follow é pra quem está chegando.' },
  { q: 'Vou sozinho.', r: 'Avisa que vai e a gente te espera na porta.' },
  { q: 'O que eu visto?', r: 'O que você já estava usando.' },
  { q: 'Quanto tempo dura?', r: 'Mais ou menos uma hora e meia.' },
];

export default function Follow() {
  return (
    <>
      <Schema dados={{
        '@context': 'https://schema.org', '@type': 'Event', name: 'Follow',
        description: `O culto de jovens da GUIA Church. Todo sábado, ${IGREJA.followHora}, na ${IGREJA.bairro}.`,
        url: SITE_FOLLOW, eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', isAccessibleForFree: true,
        eventSchedule: { '@type': 'Schedule', byDay: 'https://schema.org/Saturday', startTime: '19:00', scheduleTimezone: 'America/Sao_Paulo' },
        location: { '@type': 'Place', name: IGREJA.nome, address: { '@type': 'PostalAddress', streetAddress: IGREJA.rua, addressLocality: IGREJA.cidade, addressRegion: IGREJA.uf, postalCode: IGREJA.cep, addressCountry: 'BR' } },
        organizer: { '@type': 'Organization', name: IGREJA.nome, url: SITE_IGREJA },
      }} />

      {/* 1 · o herói que anda com o scroll: a chegada */}
      <Scrub
        rotulo="Follow"
        fotos={FOTOS}
        faixas={[
          { texto: 'Vem como você está', it: 'está', a: 0, b: 0.26 },
          { texto: 'Jesus no centro. Uma família em volta', it: 'volta', a: 0.38, b: 0.62, sobe: true },
        ]}
        pouso={{ titulo: 'Um lugar para todos', it: 'todos', sub: `Todo sábado, ${IGREJA.followHora}, na ${IGREJA.nome}, ${IGREJA.bairro}.`, a: 0.76 }}
        chapeu={<Chapeu forte="Follow" resto="O culto de jovens" />}
      >
        <Pil href={CONVERSA.href} fora medir="avisou_que_vai">Avisar que vou</Pil>
        <Pil href={MAPA} fora tom="vidro" medir="mapa">Como chegar</Pil>
      </Scrub>

      {/* 2 · é a sua primeira vez? (o cartão claro sobre a noite, tela 6) */}
      <Claro id="primeira-vez" tid="t-pv" titulo="É a sua primeira vez no Follow?" lead={<UmaLinha semFim texto="Não precisa ser de igreja. Não precisa conhecer ninguém. Vem como você está." />}>
        <div className="s-qa so-largo">
          {DUVIDAS.map(d => <div key={d.q}><b>{liga(d.q)}</b><p>{fim(ligaTexto(d.r))}</p></div>)}
        </div>
        <div className="s-acoes centro">
          <Pil href={CONVERSA.href} fora tom="preta" medir="avisou_que_vai">Avisar que vou</Pil>
        </div>
        {/* no celular: as dúvidas abrem e fecham, embaixo da chamada */}
        <div className="s-abre so-celular">
          {DUVIDAS.map(d => (
            <details key={d.q}><summary>{liga(d.q)}</summary><div><p>{fim(ligaTexto(d.r))}</p></div></details>
          ))}
        </div>
      </Claro>

      {/* 3 · quando e onde (os fatos em linha e a contagem) */}
      <section id="quando" className="s-faixa papel" aria-labelledby="t-quando">
        <Simbolo className="s-canto" />
        <div className="s-in">
          <Arroba className="topo" />
          <div className="s-cab centro s-rev">
            <Chapeu forte="Quando e onde" />
            <Vozes id="t-quando" className="s-h2" it={IGREJA.followHora || undefined}>{`Todo sábado às ${IGREJA.followHora}`}</Vozes>
            <Contagem />
          </div>
          {/* os três fatos (o quando já é o título): onde, quanto tempo, inscrição.
              No celular viram três linhas com fio (.lista), não três caixas */}
          <div className="s-fatos lista s-rev d1">
            <a className="s-fato" href={MAPA} target="_blank" rel="noreferrer" data-medir="mapa"><small>Onde</small><b>{IGREJA.nome}</b><p>{IGREJA.rua}, {IGREJA.bairro}</p></a>
            <div className="s-fato"><small>Quanto tempo</small><b>Uma hora e meia</b><p>Mais ou menos</p></div>
            <div className="s-fato"><small>Inscrição</small><b>Não precisa</b><p>É só chegar</p></div>
          </div>
          <div className="s-acoes centro s-cartoes-acoes s-rev">
            <Pil href={MAPA} fora tom="preta" medir="mapa">Abrir no mapa</Pil>
            <Pil href={CONVERSA.href} fora tom="contorno" medir="avisou_que_vai">Avisar que vou</Pil>
          </div>
          <Sede className="base" />
        </div>
      </section>

      {/* 4 · Follow Camp 2027 (a faixa de areia, como no /eventos) */}
      <section id="camp" className="s-faixa areia" aria-labelledby="t-camp">
        <div className="s-in">
          <div className="s-so-texto s-rev">
            <Chapeu forte="Follow Camp 2027" resto="05 a 10 de fevereiro" />
            <Vozes id="t-camp" className="s-h2 media" it="juntos">Seis dias fora da rotina, juntos</Vozes>
            <p className="s-lead"><UmaLinha semFim texto="O acampamento do Follow. Inscrição, pagamento e as regras estão na página do retiro." /></p>
            <div className="s-acoes">
              <Pil href={CAMP} duro tom="preta">Ir para a página do Camp</Pil>
            </div>
          </div>
        </div>
      </section>

      {/* 5 · o fecho: a sala do Follow cheia, vista pelo chevron da marca, que
          abre com a rolagem até a foto inteira (a assinatura da casa, como na
          home do Guia Church) */}
      <Fecho id="vem" tom="janela" foto={{ l: '/follow/f5-l.webp', p: '/follow/f5-p.webp' }} titulo="E se um culto pudesse mudar toda a sua vida" it="vida" lead="Sábado tem Follow. A gente te espera.">
        <Pil href={CONVERSA.href} fora medir="avisou_que_vai">Avisar que vou</Pil>
        <Pil href={IGREJA.instagram} fora tom="vidro">{IGREJA.instagramArroba}</Pil>
      </Fecho>
    </>
  );
}
