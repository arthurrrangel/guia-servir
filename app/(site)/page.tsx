import type { Metadata } from 'next';
import Link from 'next/link';
import { Chevron, Simbolo } from '@/components/Marca';
import { IGREJA, SITE_IGREJA as SITE, MAPA, SIGLA, SIGLA_FRASE } from '@/lib/igreja';
import { Vozes, Sede, Arroba, Chapeu, Pil, Img, Seta, Sep, Perguntas, liga } from '@/components/site/Blocos';
import { Trilho } from '@/components/site/Trilho';
import { NumerosFaixa } from '@/components/site/Servir';
import { Schema } from '@/components/site/Schema';
import ProximoCulto from '@/components/site/ProximoCulto';
import { VideoHeroi } from '@/components/site/VideoHeroi';

/* =============================================================================
   A HOME · 11/10/2026 — refeita do zero na forma da apresentação

   O que ela resolve em cinco segundos: quem é a GUIA, quando é o culto, por
   onde entrar. As faixas seguem o ritmo da apresentação (noite, papel,
   areia), e o site inteiro fala na mesma voz: curta, direta, "pra".

   herói · a igreja não é o prédio · números vivos · por onde começar
   (quatro portas) · como é um domingo (quatro momentos) · somos GUIA (a
   sigla) · perguntas de quem vem pela primeira vez · sempre cabe mais um.
   ============================================================================= */

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

const PORTAS = [
  { href: '/cultos', t: 'Cultos', n: `${IGREJA.cultoDia}, ${IGREJA.cultoHora}`, f: 'Um domingo para pertencer', d: 'Louvor, Palavra e uma comunidade que recebe você pelo nome. Se é a sua primeira vez, a gente te espera na porta.' },
  { href: '/eventos#follow', t: 'Follow', n: `Sábado, ${IGREJA.followHora}`, f: 'O culto de jovens', d: 'Todo sábado à noite, a geração que está chegando adora, ouve e se encontra. Vem como está.' },
  { href: '/pequena-guia', t: 'Pequena Guia', n: 'Na semana', f: 'Relacionamentos que fortalecem a fé', d: 'Um grupo pequeno, numa casa perto da sua, pra compartilhar a vida e estudar a Palavra durante a semana.' },
  { href: '/servir', t: 'Servir', n: 'Todo domingo', f: 'Existe um lugar para você', d: 'Cinco áreas, dezenas de postos e gente pra ensinar. Cadastro de menos de um minuto.' },
];

const MOMENTOS = [
  { n: '01', t: 'Acolhida', d: 'Alguém recebe você na porta e mostra onde fica tudo.', lugar: 'cultos-1' },
  { n: '02', t: 'Louvor', d: 'A banda conduz a igreja a adorar, junto.', lugar: 'cultos-2' },
  { n: '03', t: 'Palavra', d: 'Uma mensagem da Bíblia pra vida real.', lugar: 'cultos-3' },
  { n: '04', t: 'Oração e saída', d: 'Oramos uns pelos outros. Depois, café e conversa.', lugar: 'cultos-4' },
] as const;

const PERGUNTAS = [
  { q: 'Que horas é o culto?', r: `${IGREJA.cultoDia}, ${IGREJA.cultoHora}. Chegue uns minutos antes pra conhecer a casa com calma.` },
  { q: 'Onde fica?', r: `${IGREJA.rua}, ${IGREJA.bairro}. Tem estacionamento, e a equipe orienta onde parar.` },
  { q: 'Posso levar as crianças?', r: 'Pode, e deve. A GUIA Kids recebe do berçário aos 12 anos, com uma equipe preparada e um ambiente seguro.' },
  { q: 'Preciso avisar que vou?', r: 'Não. Aparece. Se quiser, chama a gente no WhatsApp antes e a gente já te espera pelo nome.' },
  { q: 'Como me visto?', r: 'Como você está confortável. Ninguém vai olhar pra sua roupa.' },
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
        <Img lugar="home-heroi" prioridade retrato sizes="100vw" />
        <VideoHeroi largo="/site/heroi-largo" retrato="/site/heroi-retrato" />
        <div className="s-in s-heroi-in">
          <Chapeu forte={IGREJA.nome} resto={IGREJA.bairro} />
          <Vozes as="h1" id="t-home" className="s-h1" it="uma nova cultura">{IGREJA.frase}</Vozes>
          <p className="s-lead grande">{liga("Uma igreja que existe pra ajudar pessoas a viver uma fé prática: com Deus, com os outros, no dia a dia.")}</p>
          <div className="s-acoes">
            <Pil href="/cultos">Quero conhecer</Pil>
            <Pil href="/servir">Quero servir</Pil>
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
              <p className="s-lead">{liga("É gente. Gente que chega mais cedo pra receber você na porta, que prepara a sala das crianças, que afina o violão antes da primeira nota.")}</p>
              <p className="s-lead">{liga(`Todo domingo, às ${IGREJA.cultoHora}, a nossa casa vira santuário. E tem um lugar guardado pra você nela.`)}</p>
            </div>
            <div className="s-foto v s-rev d1"><Img lugar="home-abraco" sizes="(max-width: 999px) 90vw, 34vw" /></div>
          </div>
          <Sede className="base" />
        </div>
      </section>

      {/* 3 · números vivos */}
      <section className="s-faixa noite s-grao">
        <div className="s-in"><NumerosFaixa /></div>
      </section>

      {/* 4 · por onde começar */}
      <section className="s-faixa papel" aria-labelledby="t-portas">
        <div className="s-in">
          <Sede className="topo" />
          <div className="s-cab centro s-rev">
            <Vozes id="t-portas" className="s-h2">Por onde começar</Vozes>
            <p className="s-lead">{liga("Quatro portas. Entre por qualquer uma.")}</p>
          </div>
          <div className="s-rev d1">
            <Trilho className="s-cartoes quatro" rotulo="Por onde começar">
              {PORTAS.map(p => (
                <Link key={p.href} href={p.href} className="s-cartao">
                  <span className="s-cartao-t">{p.t}</span>
                  <span className="s-cartao-n">{p.n}</span>
                  <span className="s-cartao-f">{liga(p.f)}</span>
                  <span className="s-cartao-d">{liga(p.d)}</span>
                  <span className="s-cartao-ir">Abrir <Seta /></span>
                </Link>
              ))}
            </Trilho>
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
          <div className="s-rev d1">
            <Trilho className="s-momentos" rotulo="Os quatro momentos do domingo">
              {MOMENTOS.map(m => (
                <div key={m.n} className="s-momento">
                  <Img lugar={m.lugar} sizes="(max-width: 759px) 82vw, 25vw" />
                  <div><small>{m.n}</small><b>{m.t}</b><p>{liga(m.d)}</p></div>
                </div>
              ))}
            </Trilho>
          </div>
          <div className="s-acoes centro s-cartoes-acoes s-rev"><Pil href="/cultos" tom="preta">Ver os cultos</Pil></div>
        </div>
      </section>

      {/* 6 · somos GUIA */}
      <section className="s-faixa noite s-grao" aria-labelledby="t-sigla">
        <div className="s-in">
          <div className="s-claro s-rev">
            <Sede />
            <h2 id="t-sigla" className="s-h2 menor">{liga("Somos GUIA.")}</h2>
            <p className="s-lead">{liga(`${SIGLA_FRASE}. O nome diz o que a gente é: um povo que caminha junto, se comunica e anda na mesma direção.`)}</p>
            <ul className="s-sigla" style={{ marginTop: 'clamp(26px,3.6vw,48px)' }}>
              {SIGLA.map(l => (
                <li key={l.t}>
                  <span className="s-letra">{l.l === '>' ? <Chevron /> : l.l}</span>
                  <b>{l.t}</b>
                  <p>{l.d}</p>
                </li>
              ))}
            </ul>
            <div className="s-acoes centro"><Pil href="/sobre" tom="preta">Quem somos</Pil></div>
          </div>
        </div>
      </section>

      {/* 7 · perguntas de quem vem pela primeira vez */}
      <section className="s-faixa papel s-grao" aria-labelledby="t-faq">
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
            <p className="s-lead grande" style={{ margin: '22px auto 0' }}>{liga(`Domingo, às ${IGREJA.cultoHora}, tem um lugar com o seu nome. Vem conhecer. E se já é de casa, vem servir.`)}</p>
          </div>
          <div className="s-acoes centro s-rev d1" style={{ marginTop: 'clamp(28px,4vw,52px)' }}>
            <Pil href="/cultos">Quero conhecer</Pil>
            <Pil href="/servir">Quero servir</Pil>
          </div>
        </div>
      </section>
    </>
  );
}
