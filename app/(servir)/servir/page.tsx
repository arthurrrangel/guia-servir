import type { Metadata } from 'next';
import Link from 'next/link';
import { Simbolo } from '@/components/Marca';
import { IGREJA, SITE, SITE_IGREJA } from '@/lib/igreja';
import { Vozes, Sede, Arroba, Chapeu, Pil, Perguntas, UmaLinha, liga, ligaTexto } from '@/components/site/Blocos';
import { Numero, NumerosFaixa, Areas, FormServir } from '@/components/site/Servir';
import { Schema } from '@/components/site/Schema';
import { Fundo, Quadro } from '@/components/site/Midia';

/* =============================================================================
   /servir — "EXISTE UM LUGAR PARA VOCÊ" · 11/10/2026

   As nove telas da apresentação (ApresentaSite.pdf), na ordem e na forma
   dela: herói na fachada · "Deus se alegra com o seu servir" · números
   vivos · as cinco áreas · como funciona · seu espaço · ninguém começou
   sabendo · perguntas · sempre cabe mais um (o formulário).

   O que é vivo vem do banco (números e postos); o formulário do fim guarda
   o rascunho e leva ao cadastro da área (components/site/Servir.tsx).

   14/10/2026, no celular: as nove telas continuam, na ordem do PDF; o texto
   de cada uma fica com a primeira frase (a regra de 11/10), as cinco áreas
   viram lista (e "Ver todas as áreas" sai: estão todas na tela), os números
   ficam dois a dois e "Seu espaço" fica com a frase e o botão.

   19/10/2026: O GUIA SERVIR. Esta página é a raiz de guiaservir.com (o
   next.config reescreve "/" para cá; /servir naquele domínio volta para a
   raiz), com a copy final da LP (LP_GUIA_SERVIR.docx): "Já sirvo, abrir meu
   espaço", "Hoje na GUIA" nos números e "quatro passos" por extenso.
   ============================================================================= */

/* o título inteiro, sem o modelo: é a raiz do guiaservir.com, e o canonical
   também */
export const metadata: Metadata = {
  title: { absolute: 'Existe um lugar para você · GUIA Servir' },
  description: 'Existe um lugar para você. Deus semeou dons em cada pessoa; todo domingo, dezenas de pessoas cultivam os delas para que o culto aconteça. Mídia, Louvor, GUIA Kids, Connect e Livraria. Cadastro de menos de um minuto.',
  alternates: { canonical: '/' },
  openGraph: { title: 'Existe um lugar para você · GUIA Servir', description: 'Mídia, Louvor, GUIA Kids, Connect e Livraria. Cadastro de menos de um minuto.', url: `${SITE}/`, siteName: 'GUIA Servir', type: 'website', locale: 'pt_BR', images: [{ url: '/og-servir.jpg', width: 1200, height: 630 }] },
};

const PASSOS = [
  { n: '01', t: 'Cadastro', d: 'Você marca as funções que combinam com você e preenche o cadastro. Menos de um minuto.' },
  { n: '02', t: 'Conversa', d: 'Alguém da liderança fala com você. Pra te conhecer de verdade e te encaixar onde faz sentido, não pra te empurrar num posto.' },
  { n: '03', t: 'Time', d: 'Seu nome entra na lista da área e o seu espaço pessoal abre.' },
  { n: '04', t: 'Escala', d: 'Todo mês você diz quando pode. A escala é montada em cima disso, nunca ao contrário.' },
];

const OBJECOES = [
  { q: '"E se eu não souber fazer nada?"', r: 'Todo posto da GUIA é ocupado por alguém que um dia não sabia. A pessoa do som aprendeu na mesa, a professora do berçário aprendeu na sala. Você marca no cadastro até o que ainda não sabe fazer, e tem gente pra ensinar. Dom se desenvolve no servir.' },
  { q: '"E se eu não der conta do compromisso?"', r: 'A escala é montada em cima da sua disponibilidade. Todo mês você marca os dias em que pode, e só. Algo inesperado apareceu? O time cobre, é pra isso que ele existe. Corpo se sustenta em corpo.' },
  { q: '"E se eu escolher a área errada?"', r: 'A conversa com a liderança existe exatamente pra isso. E mudar de área não é recomeçar do zero: é se encontrar no lugar certo. Deus não se frustra com o nosso processo.' },
];

const PERGUNTAS: Array<{ q: string; r: React.ReactNode }> = [
  { q: 'Preciso ser membro para servir?', r: 'Não. Se você já frequenta os cultos e quer usar seus dons, o cadastro é aberto. A conversa com a liderança alinha o resto.' },
  { q: 'Quanto tempo de domingo eu vou gastar?', r: 'Depende do posto. Alguns chegam às 8h30, outros entram junto com a igreja. Na conversa com a liderança você fica sabendo exatamente o que o seu posto pede.' },
  { q: 'Nunca fiz nada disso. E agora?', r: 'Escolhe mesmo assim. O cadastro aceita o que você quer aprender, e cada área tem gente que ensina no próprio serviço. Ninguém foi chamado já pronto.' },
  { q: 'Como funciona a escala?', r: 'Todo mês você diz os dias em que pode servir. A escala do mês seguinte é montada em cima disso.' },
  { q: 'O que é essa "conversa antes" no Louvor e no Kids?', r: 'Duas áreas conversam com cada pessoa antes de escalar. No Louvor, pra entender seu instrumento e sua disponibilidade. No Kids, porque servir à criança pede preparo. Você preenche o cadastro e a liderança chama você.' },
  { q: 'Posso conhecer antes de me comprometer?', r: <>Pode. Chega no próximo domingo e procura alguém da equipe na porta. Prefere conversar antes? Chama a gente no <a href={IGREJA.instagram} target="_blank" rel="noreferrer">Instagram</a>.</> },
];

export default function Servir() {
  return (
    <>
      {/* o nome do site para o Google (a linha acima do título no resultado):
          GUIA Servir, da GUIA Church, que é a entidade de guiachurch.com */}
      <Schema dados={{
        '@context': 'https://schema.org', '@type': 'WebSite', '@id': `${SITE}/#site`, url: `${SITE}/`,
        name: 'GUIA Servir', alternateName: 'Servir · GUIA Church', inLanguage: 'pt-BR',
        publisher: { '@type': 'Church', '@id': `${SITE_IGREJA}/#igreja`, name: IGREJA.nome, url: SITE_IGREJA },
      }} />
      <Schema dados={{
        '@context': 'https://schema.org', '@type': 'FAQPage',
        mainEntity: [...OBJECOES.map(o => ({ '@type': 'Question', name: o.q.replace(/"/g, ''), acceptedAnswer: { '@type': 'Answer', text: o.r } })),
          ...PERGUNTAS.filter(p => typeof p.r === 'string').map(p => ({ '@type': 'Question', name: p.q, acceptedAnswer: { '@type': 'Answer', text: String(p.r) } }))],
      }} />

      {/* 1 · o herói na fachada */}
      <section className="s-heroi" aria-labelledby="t-servir">
        {/* o voluntário de colete rindo e os três de polegar para cima (vídeo também no celular) */}
        <Fundo video="servir" prioridade />
        <div className="s-in s-heroi-in">
          <Chapeu forte="Servir" resto={IGREJA.nome} />
          <Vozes as="h1" id="t-servir" className="s-h1" it="para você">Existe um lugar para você</Vozes>
          <p className="s-lead grande">Deus semeou dons em cada pessoa.<span className="s-resto"> Todo domingo, <Numero campo="pessoas" /> pessoas cultivam os delas para que o culto aconteça. O seu também tem um posto esperando.</span></p>
          <div className="s-acoes">
            <Pil href="#quero-servir">Quero servir</Pil>
            <Pil href="/eu" duro>Já sirvo, abrir meu espaço</Pil>
          </div>
          <p className="s-micro">{ligaTexto("Cadastro de menos de um minuto.")}</p>
        </div>
      </section>

      {/* 2 · Deus se alegra com o seu servir */}
      <section className="s-faixa papel">
        <div className="s-in">
          <Arroba className="topo" />
          <div className="s-duas">
            <div className="s-rev">
              <Vozes className="s-h2 media">Deus se alegra com o seu servir</Vozes>
              <p className="s-lead so-largo">{ligaTexto("Antes de soar a primeira nota, alguém já preparou a letra no telão, arrumou a sala das crianças e organizou o estacionamento.")}</p>
              <p className="s-lead">O culto começa às {IGREJA.cultoHora}. O serviço, muito antes.<span className="s-resto"> É assim que a nossa casa se torna santuário: por gente que entendeu que servir é adorar.</span></p>
            </div>
            {/* o abraço da tela 2 do PDF, agora o próprio vídeo do abraço */}
            <Quadro video="abraco" className="s-rev d1" />
          </div>
          <Sede className="base" />
        </div>
      </section>

      {/* 3 · números vivos */}
      <section className="s-faixa noite s-grao">
        <div className="s-in"><NumerosFaixa circulos={['circ-louvor', 'circ-colete']} /></div>
      </section>

      {/* 4 · as áreas */}
      <section id="areas" className="s-faixa papel" aria-labelledby="t-areas">
        <div className="s-in">
          <Sede className="topo" />
          <div className="s-cab centro s-rev">
            <Vozes id="t-areas" className="s-h2">Escolha por onde começar</Vozes>
            <p className="s-lead"><UmaLinha semFim texto="Você escolhe as funções no cadastro. Pode marcar até o que ainda não sabe fazer: tem gente pra ensinar, porque dom também se discipula." /></p>
          </div>
          <div className="s-rev d1"><Areas /></div>
          <div className="s-acoes centro s-cartoes-acoes s-rev">
            {/* no celular as cinco estão na lista logo acima */}
            <Pil href="/servir/onde-me-encaixo#areas" tom="preta" className="so-largo">Ver todas as áreas</Pil>
            <Pil href="/servir/onde-me-encaixo" tom="preta">Não sei qual é a minha</Pil>
          </div>
        </div>
      </section>

      {/* 5 · como funciona */}
      <section id="como-funciona" className="s-faixa areia" aria-labelledby="t-como">
        <div className="s-in">
          <div className="s-passos-cab s-rev">
            <h2 id="t-como" className="s-serifa">{liga("Como funciona?")}</h2>
            <p className="s-serifa it">{liga("do cadastro à escala, quatro passos:")}</p>
          </div>
          <ol className="s-passos s-rev d1">
            {PASSOS.map(p => <li key={p.n}><b>{p.n} - {p.t}</b><p><UmaLinha texto={p.d} semFim /></p></li>)}
          </ol>
          <Sede className="base" />
        </div>
      </section>

      {/* 6 · seu espaço */}
      <section id="ja-sirvo" className="s-faixa noite s-grao justa" aria-labelledby="t-espaco">
        <div className="s-in">
          <div className="s-claro s-rev">
            <Sede />
            <h2 id="t-espaco" className="s-h2 menor">{liga("Seu espaço tem sua escala, seus dias e seu líder.")}</h2>
            <p className="s-lead"><UmaLinha semFim texto="Ache seu nome na lista da sua área, entre com seu PIN de 4 números e pronto: escala, avisos e contato do líder num lugar só. Fidelidade nos pequenos também se organiza." /></p>
            <div className="s-qa so-largo">
              <div><b>Ainda não tem PIN?</b><p>{ligaTexto('Sem problema. Ache seu nome na lista da sua área e crie o PIN na hora, com quatro números.')}</p></div>
              <div><b>Ainda não serve?</b><p>O primeiro passo está logo acima.</p></div>
            </div>
            <div className="s-acoes centro"><Pil href="/eu" tom="preta" duro>Abrir meu espaço</Pil></div>
          </div>
        </div>
      </section>

      {/* 7 · ninguém começou sabendo */}
      <section className="s-faixa noite s-grao" aria-labelledby="t-obj">
        <Simbolo className="s-canto" />
        <div className="s-in">
          <div className="s-rev">
            <h2 id="t-obj" className="s-h2 minima">Ninguém aqui começou sabendo.</h2>
            <p className="s-lead grande" style={{ marginTop: 18 }}><UmaLinha semFim texto="Se você espera se sentir pronto para servir, é assim mesmo que começa. Até os mais experientes um dia estiveram do seu lado dessa tela. Olha o que mais a gente ouve:" /></p>
          </div>
          <div className="s-rev d1"><Perguntas itens={OBJECOES} forma="obj" /></div>
        </div>
      </section>

      {/* 8 · perguntas */}
      <section id="perguntas" className="s-faixa papel s-grao" aria-labelledby="t-faq">
        <Simbolo className="s-canto" />
        <div className="s-in">
          <h2 id="t-faq" className="s-faq-t s-rev">{liga("Perguntas que todo mundo tem antes do primeiro domingo")}</h2>
          <div className="s-rev d1"><Perguntas itens={PERGUNTAS} /></div>
        </div>
      </section>

      {/* 9 · sempre cabe mais um */}
      <section id="quero-servir" className="s-faixa noite s-grao" aria-labelledby="t-fim">
        <div className="s-in">
          <Sede className="topo" />
          <div className="s-rev">
            <Vozes id="t-fim" className="s-h2" it="mais um">Sempre cabe mais um</Vozes>
            <p className="s-lead grande" style={{ marginTop: 22 }}>O próximo domingo tem <Numero campo="postos" /> postos para ocupar. {ligaTexto('Um deles pode ser o seu.')}<span className="s-resto"> {ligaTexto('Preenche aí embaixo e a liderança te chama pra conversar. Servir é a forma mais bonita de dizer sim a Deus.')}</span></p>
          </div>
          <div className="s-rev d1"><FormServir /></div>
          <p className="s-aviso s-centro" style={{ marginTop: 28 }}>Prefere escolher a área com calma? <Link href="/servir/onde-me-encaixo" className="s-link claro">Não sei onde me encaixo</Link>.</p>
        </div>
      </section>
    </>
  );
}
