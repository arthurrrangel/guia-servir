import { IGREJA, MAPA, canalDeConversa } from '@/lib/igreja';
import { naIgreja } from '@/lib/site/sites';
import { SimboloFollow } from '@/components/Marca';
import { Schema } from '@/components/site/Schema';
import { follows } from '@/lib/site/eventos-schema';
import { Vozes, Sede, Arroba, Chapeu, Pil, Claro, Passos, Fecho, FaixaCamp, UmaLinha, Sep, liga, ligaTexto, fim } from '@/components/site/Blocos';
import { FC27 } from '@/lib/followcamp';
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
   800 com a última palavra em serifa itálica, o chapéu, as pílulas.
   Mais tarde no mesmo dia, a marca oficial do Follow entrou (ver o casco,
   app/(follow)/layout.tsx): o claro é o verde-claro da arte, o acento é o
   vermelho, e o canto da faixa "quando" e a janela do fecho são o chevron
   duplo dele.

   O HERÓI anda sobre cinco fotos de verdade do Follow (scripts/follow-
   fotos.py: Drive da igreja, 07.02 e 28.02 de 2026, tratamento do
   fotógrafo). Nada gerado por IA: o Arthur reprovou o vídeo gerado em 20/10
   e pediu os materiais reais. Duas faixas de legenda, uma foto em silêncio
   (os braços abertos) e o pouso com a única chamada da página: avisar que
   vai, pelo WhatsApp da igreja (medido como avisou_que_vai). Abaixo, só o
   que quem nunca foi precisa: as quatro dúvidas, como é um sábado (21/10),
   quando e onde (com a contagem até o próximo sábado), o Follow Camp e o
   fecho. Sem formulário.

   A COPY (21/10/2026): o Arthur reprovou a primeira ("tá muito ruim"): era
   slogan sobre slogan, com respostas de uma linha e nada sobre o que
   acontece num sábado. A de agora diz o que acontece (louvor, Palavra,
   encontro; a programação que muda), responde de verdade às dúvidas e só
   afirma o que é fato ou já estava aprovado na copy da igreja.

   O FOLLOW CAMP continua em guiachurch.com/followcamp (o pagamento usa
   sessionStorage do domínio); daqui é um link inteiro.

   A COPY DO ARTHUR (23/10/2026, o PDF "copy - lp guia follow"): o herói pousa
   em "Um lugar pra você", a primeira vez ganha duas dúvidas (a Bíblia e o
   custo), o sábado tem três partes (louvor, Palavra e conversa), o "quando e
   onde" ganha a linha de assinatura, o Camp diz o tema e o que está incluso,
   e o fecho é "Sábado, 19h. Tem um lugar guardado pra você.". O texto é o do
   PDF ao pé da letra, com ajustes só de pontuação: os quatro travessões viram
   dois-pontos, vírgula ou o "·" da casa (o site não usa travessão), "Avisa que
   vai um líder..." ganha o ponto que separa as duas ideias (como o próprio PDF
   escreve na dúvida "Vou sozinho") e "no Espaço Bethel quatro refeições" ganha
   o ponto entre o lugar e o que está incluso. Os números das três partes saem
   como em todo o site ("01 - Louvor"). Cada fato foi conferido nas páginas públicas antes
   (o /followcamp para tema, datas, idade, lugar, refeições e camisa; esta
   página e o /como-chegar para hora, endereço, duração e o líder na porta).
   A linha "Estamos vivendo [NOME DA SÉRIE]." ficou de fora: nenhuma página
   pública diz o nome da série de agora (pendência editorial do Arthur).
   ============================================================================= */

const CONVERSA = canalDeConversa('Oi! Quero ir no Follow no sábado.');
const CAMP = naIgreja('/followcamp');

/* as cinco fotos, na ordem do scroll: cada uma entra com fusão entre a e b.
   21/10/2026: O POUSO ABRE O HERÓI (como nos outros dois sites): quem chega
   pelo Instagram, no celular, vê na primeira tela o que é, quando e onde, e
   o "Avisar que vou". A sala cheia (a foto do pouso) abre; depois vem a
   chegada: a conversa nos sofás e as risadas na entrada com "Vem como você
   está", a adoração e o ministro de braços abertos com "Jesus no centro" */
const FOTOS: Foto[] = [
  { l: '/follow/f5-l.webp', p: '/follow/f5-p.webp', a: 0, b: 0, alt: 'A sala do Follow cheia, todo mundo de pé' },
  { l: '/follow/f1-l.webp', p: '/follow/f1-p.webp', a: 0.26, b: 0.32, alt: 'Jovens conversando nos sofás antes do Follow' },
  /* 22/10/2026: no celular a foto em pé encosta à direita (xp 100): no centro, o rosto
     do rapaz da direita virava meia fatia na borda; assim os dois que riem ficam inteiros */
  { l: '/follow/f2-l.webp', p: '/follow/f2-p.webp', a: 0.44, b: 0.5, alt: 'Três jovens rindo na entrada do Follow', xp: 100 },
  { l: '/follow/f3-l.webp', p: '/follow/f3-p.webp', a: 0.62, b: 0.68, alt: 'Jovens em adoração, de mãos levantadas' },
  { l: '/follow/f4-l.webp', p: '/follow/f4-p.webp', a: 0.8, b: 0.86, alt: 'Ministro de louvor de braços abertos diante do telão' },
];

/* as dúvidas de quem nunca foi, nas palavras de quem pergunta. 21/10/2026:
   o Arthur reprovou a copy anterior ("tá muito ruim"): as respostas eram de
   uma linha seca ("O que você já estava usando."). Agora respondem de verdade,
   com o que é fato: o líder na porta (ele, 19/10), a hora e meia (ele, 19/10),
   e as frases já aprovadas da casa ("Ninguém vai olhar pra sua roupa",
   "Atrasou? Entra assim mesmo"). 23/10/2026, a copy do PDF: seis, com a
   Bíblia (3ª) e o custo (6ª); o "não tem ingresso" é o que o Google já lê
   desta página (o evento de sábado com entrada livre, lib/site/eventos-schema.ts) */
const DUVIDAS = [
  { q: 'Não sou de igreja.', r: 'Melhor ainda. O Follow existe pra quem está chegando, não pra quem já sabe tudo. Ninguém vai te cobrar nada.' },
  { q: 'Vou sozinho.', r: 'Avisa que vai. Um líder do Follow te espera na porta e te apresenta pra galera. Você não fica perdido nem um minuto.' },
  { q: 'Não sei nada da Bíblia.', r: 'Não precisa saber. A mensagem é sobre o que você vive: ansiedade, família, futuro, fé. Se surgir dúvida, você pergunta. Ninguém vai achar estranho.' },
  { q: 'O que eu visto?', r: 'O que você usaria pra sair com os amigos. Ninguém vai olhar pra sua roupa.' },
  { q: 'Quanto tempo dura?', r: 'Mais ou menos uma hora e meia. Atrasou? Entra assim mesmo, ninguém vai olhar a hora.' },
  { q: 'Preciso pagar alguma coisa?', r: 'Não. Não tem inscrição e não tem ingresso. É só chegar.' },
];

/* como é um sábado, em três partes (23/10/2026, a copy do PDF: a terceira é a
   conversa, que antes se chamava "Encontro"). No celular só a primeira frase
   de cada uma aparece (UmaLinha) */
const SABADO = [
  { n: '01', t: 'Louvor', d: 'A banda toca, a galera canta. Você canta junto ou fica em silêncio, do seu jeito.' },
  { n: '02', t: 'Palavra', d: 'Uma mensagem da Bíblia pra vida real: o futuro, a família, a ansiedade, a fé que você quer que seja de verdade.' },
  { n: '03', t: 'Conversa', d: 'Antes e depois do culto, é onde tudo acontece: é aí que o Follow deixa de ser um culto que você visita e vira uma família que você tem.' },
];

/* o Follow Camp na faixa de areia, com a frase da copy do Follow (a do /eventos é a de sempre) */
const CAMP_LEAD = 'O retiro do Follow no Carnaval, para quem tem de 13 a 30 anos. Tema de 2027: ' + FC27.tema + '. Louvor, Palavra, natureza e gente da sua idade, no Espaço Bethel. Quatro refeições por dia, camisa oficial e atividade do começo ao fim.';

/* 23/10/2026: a página se refaz uma vez por dia, para as datas dos próximos
   sábados no JSON-LD (o Google só aceita evento com data) não ficarem no
   passado entre um deploy e outro. Na tela nada muda. */
export const revalidate = 86400;

export default function Follow() {
  return (
    <>
      {/* os próximos sábados, um evento cada (lib/site/eventos-schema.ts) */}
      {IGREJA.followHora && <Schema dados={{ '@context': 'https://schema.org', '@graph': follows(new Date()) }} />}

      {/* 1 · o herói que anda com o scroll: a chegada */}
      <Scrub
        rotulo="Follow"
        fotos={FOTOS}
        /* 21/10/2026, o teste de flick: o pouso ficava inteiro por 4 toques de rolagem no
           celular e a última frase por 10 a 12 (450 alturas de tela, a frase final com
           quase metade do herói). Com 340 e as janelas repartidas, cada um dos três
           momentos fica uns 5 a 7 toques; cada frase entra com uma foto nova e troca de
           foto no meio */
        altura={340}
        faixas={[
          { texto: 'Vem como você está', it: 'está', a: 0.31, b: 0.62 },
          { texto: 'Jesus no centro. Uma família em volta', it: 'volta', a: 0.67, b: 1, sobe: true },
        ]}
        /* 23/10/2026, a copy do PDF: "Um lugar pra você.", e a linha de apoio ganha
           o que é o sábado. No celular (e no notebook baixo) só a primeira frase,
           a de quando e onde, como nos outros heróis (UmaLinha, .s-resto) */
        pouso={{ titulo: 'Um lugar pra você', it: 'você', sub: <UmaLinha semFim texto={`Todo sábado, ${IGREJA.followHora}, na ${IGREJA.nome}, ${IGREJA.bairro}. Louvor, uma palavra pra vida real e gente da sua idade.`} />, a: 0, primeiro: true, b: 0.26 }}
        chapeu={<Chapeu forte="Follow" resto="O culto de jovens" />}
      >
        <Pil href={CONVERSA.href} fora medir="avisou_que_vai">Avisar que vou</Pil>
        {/* 20/10/2026: "Abrir no mapa", como na faixa "quando e onde": no menu, "Como chegar" é a página da igreja */}
        <Pil href={MAPA} fora tom="vidro" medir="mapa">Abrir no mapa</Pil>
      </Scrub>

      {/* 2 · é a sua primeira vez? (o cartão claro sobre a noite, tela 6) */}
      <Claro id="primeira-vez" tid="t-pv" titulo="É a sua primeira vez? Então já pensamos em tudo." lead={<UmaLinha semFim texto="Não precisa ser de igreja, não precisa conhecer ninguém, não precisa entender de nada. Chega, que o resto a gente te mostra." />}>
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

      {/* 3 · como é um sábado no Follow: louvor, Palavra, conversa (no menu,
          "Louvor, Palavra e conversa"; a âncora continua #como-e) */}
      <Passos id="como-e" tid="t-como" titulo="Como é um sábado no Follow" sub="A noite tem três partes." itens={SABADO} />

      {/* 4 · quando e onde (os fatos em linha e a contagem) */}
      <section id="quando" className="s-faixa papel" aria-labelledby="t-quando">
        <SimboloFollow className="s-canto duplo" />
        <div className="s-in">
          <Arroba className="topo" />
          <div className="s-cab centro s-rev">
            <Chapeu forte="Quando e onde" />
            <Vozes id="t-quando" className="s-h2" it={IGREJA.followHora || undefined}>{`Todo sábado às ${IGREJA.followHora}`}</Vozes>
            {/* a programação varia; a hora e o lugar não. 23/10/2026: a frase da copy do PDF.
                A linha seguinte do PDF ("Estamos vivendo [NOME DA SÉRIE].") espera o nome
                da série de agora, que nenhuma página pública diz: fica de fora até o Arthur dizer */}
            <p className="s-lead"><UmaLinha semFim texto="Cada sábado tem a sua cara, e cada série também tem nome. A hora e o lugar não mudam." /></p>
            <Contagem />
          </div>
          {/* os três fatos (o quando já é o título): onde, quanto tempo, inscrição.
              No celular viram três linhas com fio (.lista), não três caixas */}
          <div className="s-fatos lista s-rev d1">
            <a className="s-fato" href={MAPA} target="_blank" rel="noreferrer" data-medir="mapa"><small>Onde</small><b>{IGREJA.nome}</b><p>{IGREJA.rua}, {IGREJA.bairro}</p></a>
            {/* "Atrasou? Entra assim mesmo" já está na resposta de "Quanto tempo dura?": aqui, a conversa de depois (o "Encontro") */}
            <div className="s-fato"><small>Quanto tempo</small><b>Uma hora e meia</b><p>E a conversa depois</p></div>
            <div className="s-fato"><small>Inscrição</small><b>Não precisa</b><p>É só chegar</p></div>
          </div>
          {/* a linha de assinatura (23/10/2026, a copy do PDF): repete os fatos de cima
              em carimbo, então o leitor de tela não a lê. No celular são três linhas
              curtas (os dois Sep viram quebra); de 760 px para cima, uma */}
          <p className="s-assina s-rev d1" aria-hidden="true">
            {`Sábado\u00a0· Follow\u00a0· Jovens\u00a0· ${IGREJA.followHora}`}<Sep />{IGREJA.rua}<Sep />{IGREJA.bairro}
          </p>
          {/* uma ação aqui: o mapa. "Avisar que vou" fica no cartão da primeira vez e no fecho */}
          <div className="s-acoes centro s-cartoes-acoes s-rev">
            <Pil href={MAPA} fora tom="preta" medir="mapa">Abrir no mapa</Pil>
          </div>
          <Sede className="base" />
        </div>
      </section>

      {/* 5 · Follow Camp 2027 (a mesma faixa de areia do /eventos, com a frase da copy do Follow) */}
      <FaixaCamp href={CAMP} lead={CAMP_LEAD} />

      {/* 6 · o fecho: a sala do Follow cheia, vista pelo chevron da marca, que
          abre com a rolagem até a foto inteira (a assinatura da casa, como na
          home do Guia Church) */}
      {/* 23/10/2026, a copy do PDF: o título é o convite ("Sábado, 19h. Tem um lugar
          guardado pra você."), e a frase ganha o ponto entre "avisa que vai" e o
          líder na porta, como na dúvida "Vou sozinho" */}
      <Fecho id="vem" tom="janela" foto={{ l: '/follow/f5-l.webp', p: '/follow/f5-p.webp' }} titulo={`Sábado, ${IGREJA.followHora}. Tem um lugar guardado pra você`} it="você" lead="Avisa que vai. Um líder do Follow te espera na porta. Ou só aparece.">
        <Pil href={CONVERSA.href} fora medir="avisou_que_vai">Avisar que vou</Pil>
        <Pil href={IGREJA.instagram} fora tom="vidro">{IGREJA.instagramArroba}</Pil>
      </Fecho>
    </>
  );
}
