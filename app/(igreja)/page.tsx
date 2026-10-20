import type { Metadata } from 'next';
import { IGREJA, SITE_IGREJA as SITE, MAPA, SIGLA_FRASE } from '@/lib/igreja';
import { noServir, noFollow } from '@/lib/site/sites';
import { Vozes, Sede, Arroba, Chapeu, Pil, Ir, Seta, Sep, Claro, SerifaCab, FaixaPerguntas, Fecho, Sigla, liga, ligaTexto } from '@/components/site/Blocos';
import { NumerosFaixa } from '@/components/site/Servir';
import { Schema } from '@/components/site/Schema';
import ProximoCulto from '@/components/site/ProximoCulto';
import Scrub, { type Foto } from '@/components/site/Scrub';
import { Domingo } from '@/components/site/Domingo';
import { MOMENTOS } from '@/lib/site/domingo';

/* =============================================================================
   A HOME · 11/10/2026 — refeita do zero na forma da apresentação

   O que ela resolve em cinco segundos: quem é a GUIA, quando é o culto, por
   onde entrar. As faixas seguem o ritmo da apresentação (noite, papel,
   areia), e o site inteiro fala na mesma voz: curta, direta, "pra".

   herói · a igreja não é o prédio · números vivos · por onde começar
   (quatro portas) · como é um domingo (quatro momentos) · somos GUIA (a
   sigla) · perguntas de quem vem pela primeira vez · sempre cabe mais um.

   13/10/2026: menos foto, mais vídeo (pedido do Arthur). O herói, o "é
   gente" e o domingo são trechos dos vídeos da igreja; os números perderam
   os círculos de foto e viraram quatro números grandes.

   19/10/2026: A COPY FINAL (GUIA_Church_Site_Completo_Final.docx). O herói
   deixa o "Cultivando uma nova cultura" (conceito interno, que não fala com
   quem chega) e passa a "Existe um lugar para você"; cada porta tem a ação
   em primeira pessoa; a sigla ganhou as definições que falam com a pessoa.
   "Quero servir" leva ao Guia Servir (guiaservir.com), que virou site
   próprio. Travessões da copy viraram vírgula (regra do Arthur).

   19/10/2026, mais tarde: "Vou visitar" e "Vou conhecer" levam direto ao
   "É a sua primeira vez?" de /cultos, onde está o "Avisar que vou" (antes
   caíam no topo de /cultos, e o botão ficava quase três telas abaixo, no
   celular). O cartão do Servir diz o título do Servir, "Encontre o seu lugar
   pra servir", e não repete o herói desta página.
   ============================================================================= */

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

const PORTAS = [
  { href: '/cultos', t: 'Cultos', n: `${IGREJA.cultoDia}, ${IGREJA.cultoHora}`, f: 'Um domingo para pertencer', d: 'Louvor, Palavra e uma comunidade que recebe você pelo nome. Se é a sua primeira vez, a gente te espera na porta.', ir: 'Vou participar' },
  /* 20/10/2026: o Follow tem site próprio (guiafollow.com); a porta abre nele */
  { href: noFollow('/'), t: 'Follow', n: `Sábado, ${IGREJA.followHora}`, f: 'O culto de jovens', d: 'Todo sábado à noite, a geração que está chegando adora, ouve e se encontra. Vem como está.', ir: 'Vou no Follow' },
  { href: '/pequena-guia', t: 'Pequena Guia', n: 'Na semana', f: 'Relacionamentos que fortalecem a fé', d: 'Um grupo pequeno, numa casa perto da sua, pra compartilhar a vida e estudar a Palavra durante a semana.', ir: 'Encontrar a minha' },
  { href: noServir('/'), t: 'Servir', n: 'Todo domingo', f: 'Encontre o seu lugar pra servir', d: 'Cinco áreas, dezenas de postos e gente pra ensinar. Cadastro de menos de um minuto.', ir: 'Quero servir' },
];


/* A CHEGADA: as cinco fotos do herói, na ordem do scroll (scripts/site-fotos-
   drive.py, acervo do fotógrafo no Drive, cultos de 15.03 e 10.05 de 2026).
   Cada uma entra com fusão entre a e b. */
const CHEGADA: Foto[] = [
  { l: '/site/home-1-l.webp', p: '/site/home-1-p.webp', a: 0, b: 0, alt: 'Pessoas chegando pela calçada, diante do muro da GUIA Church, num domingo de sol' },
  { l: '/site/home-2-l.webp', p: '/site/home-2-p.webp', a: 0.18, b: 0.26, alt: 'Dois homens se abraçando na porta da igreja' },
  { l: '/site/home-3-l.webp', p: '/site/home-3-p.webp', a: 0.36, b: 0.44, alt: 'Um pai com o filho no colo, rindo com uma amiga na entrada' },
  { l: '/site/home-4-l.webp', p: '/site/home-4-p.webp', a: 0.54, b: 0.62, alt: 'A igreja em adoração, de olhos fechados' },
  { l: '/site/home-5-l.webp', p: '/site/home-5-p.webp', a: 0.72, b: 0.80, alt: 'O pastor diante da igreja, durante a Palavra' },
];

/* as três fotos da frase "é gente": a porta, a sala das crianças, o violão.
   As legendas são os pedaços da própria frase, ao pé da letra. */
const GENTE = [
  { id: 'gente-porta', legenda: 'chega mais cedo pra receber você na porta', alt: 'Uma mulher recebendo as pessoas na porta da igreja, sorrindo' },
  { id: 'gente-kids', legenda: 'prepara a sala das crianças', alt: 'Uma professora do GUIA Kids mostrando um livro para as crianças' },
  { id: 'gente-violao', legenda: 'afina o violão antes da primeira nota', alt: 'Um músico tocando guitarra no palco, antes do culto' },
];

const PERGUNTAS = [
  { q: 'Que horas é o culto?', r: `${IGREJA.cultoDia}, ${IGREJA.cultoHora}. Chegue uns minutos antes pra conhecer a casa com calma.` },
  { q: 'Onde fica?', r: `${IGREJA.rua}, ${IGREJA.bairro}. Tem estacionamento, e a equipe orienta onde parar.` },
  { q: 'Posso levar as crianças?', r: 'Pode, e deve. A GUIA Kids (o espaço das crianças) recebe do berçário aos 12 anos, com equipe preparada e ambiente seguro.' },
  { q: 'Preciso avisar que vou?', r: 'Não. Aparece. Se quiser, chama a gente no WhatsApp antes e a gente já te espera pelo nome.' },
  { q: 'Como me visto?', r: 'Como você estiver confortável. Ninguém vai olhar pra sua roupa.' },
  { q: 'E depois do domingo?', r: 'Tem a Pequena Guia na semana, o Follow no sábado e um lugar pra servir. O próximo passo é seu.' },
];

export default function Home() {
  return (
    <>
      <Schema dados={{
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'WebSite', '@id': `${SITE}/#site`, url: SITE, name: IGREJA.nome, inLanguage: 'pt-BR', publisher: { '@id': `${SITE}/#igreja` } },
          { '@type': 'Church', '@id': `${SITE}/#igreja`, name: IGREJA.nome, slogan: IGREJA.frase, url: SITE, image: `${SITE}/og.jpg`, hasMap: MAPA,
            sameAs: [IGREJA.instagram],
            address: { '@type': 'PostalAddress', streetAddress: IGREJA.rua, addressLocality: `${IGREJA.bairro}, ${IGREJA.cidade}`, addressRegion: IGREJA.uf, postalCode: IGREJA.cep, addressCountry: 'BR' },
            openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: 'https://schema.org/Sunday', opens: '10:00', closes: '12:00' }] },
        ],
      }} />

      {/* 1 · o herói: a chegada num domingo, em cinco fotos de verdade. A frase
          de apoio da copy se desenrola sobre as fotos, um pedaço por vez, e
          a página pousa no título. Nenhuma palavra fora da copy final. */}
      <Scrub
        rotulo={IGREJA.nome}
        fotos={CHEGADA}
        faixas={[
          { texto: 'Uma igreja na Barra da Tijuca', vozes: false, a: 0, b: 0.24 },
          { texto: 'feita de pessoas reais,', vozes: false, a: 0.27, b: 0.43, baixo: true },
          { texto: 'histórias reais', vozes: false, a: 0.46, b: 0.61, sobe: true, baixo: true },
          { texto: 'e um domingo que pode mudar a sua semana', it: 'semana', a: 0.64, b: 0.77, sobe: true, baixo: true },
        ]}
        pouso={{ titulo: 'Existe um lugar para você', it: 'para você', a: 0.79 }}
        chapeu={<Chapeu forte={IGREJA.nome} resto={IGREJA.bairro} />}
        micro={<p className="s-micro"><ProximoCulto /><Sep />{IGREJA.rua}</p>}
      >
        <Pil href="/cultos#primeira-vez">Vou visitar</Pil>
        <Pil href={noServir('/')} tom="vidro">Quero servir</Pil>
      </Scrub>

      {/* 2 · a igreja não é o prédio: a frase e as três fotos que ela descreve
          (a porta, a sala das crianças, o violão), em escada */}
      <section className="s-faixa papel" aria-labelledby="t-gente">
        <div className="s-in">
          <Arroba className="topo" />
          <div className="s-gente">
            <div className="s-rev">
              <Vozes id="t-gente" className="s-h2 media" it="prédio">A igreja não é o prédio</Vozes>
              <p className="s-lead">{ligaTexto("É gente. Gente que chega mais cedo pra receber você na porta, que prepara a sala das crianças, que afina o violão antes da primeira nota.")}</p>
              <p className="s-lead so-largo">{ligaTexto(`Todo domingo, às ${IGREJA.cultoHora}, a nossa casa vira santuário. E tem um lugar guardado pra você nela.`)}</p>
            </div>
            {/* tabIndex: no celular o trio desliza, e quem navega pelo teclado precisa chegar nele */}
            <div className="s-trio desliza" role="group" aria-label="Quem chega mais cedo" tabIndex={0}>
              {GENTE.map((g, i) => (
                <figure key={g.id} className={`s-rev d${i + 1}`}>
                  <div className="s-foto v"><img src={`/site/${g.id}-v.webp`} srcSet={`/site/${g.id}-s.webp 640w, /site/${g.id}-v.webp 1000w`} sizes="(max-width: 759px) 80vw, 24vw" width={1000} height={1250} alt={g.alt} loading="lazy" decoding="async" /></div>
                  <figcaption>{g.legenda}</figcaption>
                </figure>
              ))}
            </div>
          </div>
          <Sede className="base" />
        </div>
      </section>

      {/* 3 · números vivos (no celular, só no /servir) */}
      <section className="s-faixa noite s-grao so-largo">
        <div className="s-in"><NumerosFaixa circulos={false} /></div>
      </section>

      {/* 4 · por onde começar: as quatro portas como linhas de um índice (no
          celular, a lista de 14/10) */}
      <section className="s-faixa papel junta-celular" aria-labelledby="t-portas">
        <div className="s-in">
          <Sede className="topo" />
          <div className="s-cab centro s-rev">
            <Vozes id="t-portas" className="s-h2">Por onde começar</Vozes>
            <p className="s-lead">{ligaTexto("Quatro portas. Entre por qualquer uma.")}</p>
          </div>
          <div className="s-rev d1">
            <div className="s-cartoes quatro lista indice" role="group" aria-label="Por onde começar">
              {PORTAS.map(p => (
                <Ir key={p.href} href={p.href} className="s-cartao">
                  <span className="s-cartao-t">{p.t}</span>
                  <span className="s-cartao-n">{p.n}</span>
                  <span className="s-cartao-f">{liga(p.f)}</span>
                  <span className="s-cartao-d">{ligaTexto(p.d)}</span>
                  <span className="s-cartao-ir">{p.ir} <Seta /></span>
                </Ir>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 5 · como é um domingo */}
      <section className="s-faixa areia" aria-labelledby="t-domingo">
        <div className="s-in">
          <SerifaCab id="t-domingo" titulo="Como é um domingo?" sub="da porta à oração final, 4 momentos:" />
          {/* um vídeo só, em quatro capítulos: o que está passando acende na lista */}
          <div className="s-rev d1"><Domingo itens={MOMENTOS} rotulo="Os quatro momentos do domingo" /></div>
          <div className="s-acoes centro s-cartoes-acoes s-rev"><Pil href="/cultos" tom="preta">Ver os cultos</Pil></div>
        </div>
      </section>

      {/* 6 · somos GUIA */}
      <Claro tid="t-sigla" titulo="Somos GUIA." lead={ligaTexto(`${SIGLA_FRASE}.`)} soLargo>
        <Sigla className="s-miolo" />
      </Claro>

      {/* 7 · perguntas de quem vem pela primeira vez */}
      <FaixaPerguntas tid="t-faq" titulo="Perguntas de quem vem pela primeira vez" itens={PERGUNTAS} soLargo />

      {/* 8 · sempre cabe mais um: a igreja de pé, vista pelo chevron da marca,
          que abre com a rolagem até a foto inteira */}
      <Fecho tom="janela" foto={{ l: '/site/fecho-igreja-l.webp', p: '/site/fecho-igreja-p.webp' }} titulo="Sempre cabe mais um" it="mais um"
             lead={`Domingo, às ${IGREJA.cultoHora}, tem um lugar com o seu nome. Vem conhecer. E se já é de casa, vem servir.`}>
        <Pil href="/cultos#primeira-vez">Vou conhecer</Pil>
        <Pil href={noServir('/')} tom="vidro">Quero servir</Pil>
      </Fecho>
    </>
  );
}
