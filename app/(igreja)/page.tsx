import type { Metadata } from 'next';
import { Chevron, Simbolo } from '@/components/Marca';
import { IGREJA, SITE_IGREJA as SITE, MAPA, SIGLA, SIGLA_FRASE } from '@/lib/igreja';
import { noServir } from '@/lib/site/sites';
import { Vozes, Sede, Arroba, Chapeu, Pil, Ir, Seta, Sep, Perguntas, UmaLinha, liga, ligaTexto } from '@/components/site/Blocos';
import { NumerosFaixa } from '@/components/site/Servir';
import { Schema } from '@/components/site/Schema';
import ProximoCulto from '@/components/site/ProximoCulto';
import { Fundo, Quadro } from '@/components/site/Midia';
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
  { href: '/eventos#follow', t: 'Follow', n: `Sábado, ${IGREJA.followHora}`, f: 'O culto de jovens', d: 'Todo sábado à noite, a geração que está chegando adora, ouve e se encontra. Vem como está.', ir: 'Vou no Follow' },
  { href: '/pequena-guia', t: 'Pequena Guia', n: 'Na semana', f: 'Relacionamentos que fortalecem a fé', d: 'Um grupo pequeno, numa casa perto da sua, pra compartilhar a vida e estudar a Palavra durante a semana.', ir: 'Encontrar a minha' },
  { href: noServir('/'), t: 'Servir', n: 'Todo domingo', f: 'Encontre o seu lugar pra servir', d: 'Cinco áreas, dezenas de postos e gente pra ensinar. Cadastro de menos de um minuto.', ir: 'Quero servir' },
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

      {/* 1 · o herói */}
      <section className="s-heroi" aria-labelledby="t-home">
        <Fundo video="inicio" prioridade />
        <div className="s-in s-heroi-in">
          <Chapeu forte={IGREJA.nome} resto={IGREJA.bairro} />
          <Vozes as="h1" id="t-home" className="s-h1" it="para você">Existe um lugar para você</Vozes>
          <p className="s-lead grande">{ligaTexto("Uma igreja na Barra da Tijuca feita de pessoas reais, histórias reais e um domingo que pode mudar a sua semana.")}</p>
          <div className="s-acoes">
            <Pil href="/cultos#primeira-vez">Vou visitar</Pil>
            <Pil href={noServir('/')}>Quero servir</Pil>
          </div>
          <p className="s-micro"><ProximoCulto /><Sep />{IGREJA.rua}</p>
        </div>
      </section>

      {/* 2 · a igreja não é o prédio */}
      <section className="s-faixa papel">
        <div className="s-in">
          <Arroba className="topo" />
          <div className="s-duas">
            <div className="s-rev">
              <Vozes className="s-h2 media">A igreja não é o prédio</Vozes>
              <p className="s-lead">{ligaTexto("É gente. Gente que chega mais cedo pra receber você na porta, que prepara a sala das crianças, que afina o violão antes da primeira nota.")}</p>
              <p className="s-lead so-largo">{ligaTexto(`Todo domingo, às ${IGREJA.cultoHora}, a nossa casa vira santuário. E tem um lugar guardado pra você nela.`)}</p>
            </div>
            {/* a frase em vídeo: quem recebe na porta, a sala das crianças, o violão */}
            <Quadro video="gente" className="s-rev d1" />
          </div>
          <Sede className="base" />
        </div>
      </section>

      {/* 3 · números vivos (no celular, só no /servir) */}
      <section className="s-faixa noite s-grao so-largo">
        <div className="s-in"><NumerosFaixa circulos={false} /></div>
      </section>

      {/* 4 · por onde começar */}
      <section className="s-faixa papel junta-celular" aria-labelledby="t-portas">
        <div className="s-in">
          <Sede className="topo" />
          <div className="s-cab centro s-rev">
            <Vozes id="t-portas" className="s-h2">Por onde começar</Vozes>
            <p className="s-lead">{ligaTexto("Quatro portas. Entre por qualquer uma.")}</p>
          </div>
          <div className="s-rev d1">
            <div className="s-cartoes quatro lista" role="group" aria-label="Por onde começar">
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
          <div className="s-passos-cab s-rev">
            <h2 id="t-domingo" className="s-serifa">{liga("Como é um domingo?")}</h2>
            <p className="s-serifa it">{liga("da porta à oração final, 4 momentos:")}</p>
          </div>
          {/* um vídeo só, em quatro capítulos: o que está passando acende na lista */}
          <div className="s-rev d1"><Domingo itens={MOMENTOS} rotulo="Os quatro momentos do domingo" /></div>
          <div className="s-acoes centro s-cartoes-acoes s-rev"><Pil href="/cultos" tom="preta">Ver os cultos</Pil></div>
        </div>
      </section>

      {/* 6 · somos GUIA */}
      <section className="s-faixa noite s-grao so-largo" aria-labelledby="t-sigla">
        <div className="s-in">
          <div className="s-claro s-rev">
            <Sede />
            <h2 id="t-sigla" className="s-h2 menor">{liga("Somos GUIA.")}</h2>
            <p className="s-lead">{ligaTexto(`${SIGLA_FRASE}.`)}</p>
            <ul className="s-sigla" style={{ marginTop: 'clamp(26px,3.6vw,48px)' }}>
              {SIGLA.map(l => (
                <li key={l.t}>
                  <span className="s-letra">{l.l === '>' ? <Chevron /> : l.l}</span>
                  <b>{l.t}</b>
                  <p>{l.d}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* 7 · perguntas de quem vem pela primeira vez */}
      <section className="s-faixa papel s-grao so-largo" aria-labelledby="t-faq">
        <Simbolo className="s-canto" />
        <div className="s-in">
          <h2 id="t-faq" className="s-faq-t s-rev">{liga("Perguntas de quem vem pela primeira vez")}</h2>
          <div className="s-rev d1"><Perguntas itens={PERGUNTAS} /></div>
        </div>
      </section>

      {/* 8 · sempre cabe mais um */}
      <section className="s-faixa noite s-grao" aria-labelledby="t-fim">
        <div className="s-in s-centro">
          <Sede className="topo" />
          <div className="s-rev">
            <Vozes id="t-fim" className="s-h2" it="mais um">Sempre cabe mais um</Vozes>
            <p className="s-lead grande" style={{ margin: '22px auto 0' }}><UmaLinha texto={`Domingo, às ${IGREJA.cultoHora}, tem um lugar com o seu nome. Vem conhecer. E se já é de casa, vem servir.`} semFim /></p>
          </div>
          <div className="s-acoes centro s-rev d1" style={{ marginTop: 'clamp(28px,4vw,52px)' }}>
            <Pil href="/cultos#primeira-vez">Vou conhecer</Pil>
            <Pil href={noServir('/')}>Quero servir</Pil>
          </div>
        </div>
      </section>
    </>
  );
}
