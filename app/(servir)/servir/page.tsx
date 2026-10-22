import type { Metadata } from 'next';
import { og } from '@/lib/site/meta';
import Link from 'next/link';
import { Simbolo } from '@/components/Marca';
import { IGREJA, SITE, SITE_IGREJA } from '@/lib/igreja';
import { Vozes, Sede, Arroba, Chapeu, Pil, Perguntas, Passos, Claro, FaixaPerguntas, UmaLinha, ligaTexto } from '@/components/site/Blocos';
import { Numero, NumerosFaixa, Areas, FormServir } from '@/components/site/Servir';
import { Schema } from '@/components/site/Schema';
import { Quadro } from '@/components/site/Midia';
import Scrub, { type Foto } from '@/components/site/Scrub';
import { AREAS } from '@/lib/site/areas';

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

   19/10/2026, mais tarde: o título parou de repetir o da home do Guia Church
   ("Existe um lugar para você", que lá é a primeira frase da igreja). Quem
   ia de um site ao outro achava que estava na mesma página. Escolha do
   Arthur, entre duas frases da copy dele: "Encontre o seu lugar pra servir"
   (site completo, página 7). O cartão do Servir na home diz o mesmo.

   20/10/2026, A CAMADA DE CIMA: o herói anda com o scroll pelas cinco
   áreas, cada uma sobre uma foto de quem serve nela (a mesa da Mídia, o
   Louvor no palco, o Kids com o bebê no colo, o Connect recebendo na porta,
   a Bíblia da Livraria), com o nome e a frase de cada área (lib/site/
   areas.ts), e pousa em "Encontre o seu lugar pra servir" sobre a equipe do
   Kids. As áreas, mais abaixo, viram linhas de índice no computador.
   ============================================================================= */

/* as cinco áreas no herói, na ordem do site (scripts/site-fotos-drive.py e
   scripts/site-fotos-areas: Mídia e Livraria vêm das fotos de 12/10).
   21/10/2026: O POUSO ABRE O HERÓI, como na home e em /cultos. Quem chega no
   guiaservir.com via a Mídia ("Faça a mensagem chegar longe") e só descobria
   que site era aquele no fim do scroll; agora a primeira tela diz o que é
   (o título do Servir sobre a equipe reunida), tem as duas portas (Quero
   servir, Já sirvo) e a nota do cadastro. As cinco áreas vêm depois, uma
   foto por vez, e a Livraria fica até o fim do herói */
const QUEM_SERVE: Foto[] = [
  { l: '/site/servir-pouso-l.webp', p: '/site/servir-pouso-p.webp', a: 0, b: 0, alt: 'A equipe do GUIA Kids reunida, de camiseta preta, diante do painel "Eu amo minha igreja"' },
  { l: '/site/servir-midia-l.webp', p: '/site/servir-midia-p.webp', a: 0.12, b: 0.17, alt: 'Um voluntário da Mídia de fone, na mesa de corte, com o telão ao fundo' },
  { l: '/site/servir-louvor-l.webp', p: '/site/servir-louvor-p.webp', a: 0.3, b: 0.35, alt: 'Uma cantora e um guitarrista do Louvor no palco' },
  { l: '/site/servir-kids-l.webp', p: '/site/servir-kids-p.webp', a: 0.48, b: 0.53, alt: 'Uma voluntária do GUIA Kids com um bebê no colo, sorrindo' },
  { l: '/site/servir-connect-l.webp', p: '/site/servir-connect-p.webp', a: 0.66, b: 0.71, alt: 'A equipe do Connect abraçando quem chega na porta' },
  { l: '/site/servir-livraria-l.webp', p: '/site/servir-livraria-p.webp', a: 0.84, b: 0.89, alt: 'Mãos folheando uma Bíblia na livraria' },
];
const ORDEM_HEROI = ['midia', 'louvor', 'kids', 'servico', 'livraria'] as const;

/* o título inteiro, sem o modelo: é a raiz do guiaservir.com, e o canonical
   também */
export const metadata: Metadata = {
  title: { absolute: 'Encontre o seu lugar pra servir · GUIA Servir' },
  description: 'Encontre o seu lugar pra servir. Deus semeou dons em cada pessoa; todo domingo, dezenas de pessoas cultivam os delas para que o culto aconteça. Mídia, Louvor, GUIA Kids, Connect e Livraria. Cadastro de menos de um minuto.',
  alternates: { canonical: '/' },
  openGraph: og('servir', '/', 'Encontre o seu lugar pra servir', 'Mídia, Louvor, GUIA Kids, Connect e Livraria. Cadastro de menos de um minuto.', '/og-servir.jpg', 'GUIA Servir: encontre o seu lugar pra servir'),
};

const PASSOS = [
  { n: '01', t: 'Cadastro', d: 'Você marca as funções que combinam com você e preenche o cadastro. Menos de um minuto.' },
  { n: '02', t: 'Conversa', d: 'Alguém da liderança fala com você. Pra te conhecer de verdade e te encaixar onde faz sentido, não pra te empurrar num posto.' },
  { n: '03', t: 'Time', d: 'Seu nome entra na lista da área e o seu espaço pessoal abre.' },
  { n: '04', t: 'Escala', d: 'Todo mês você diz quando pode. A escala é montada em cima disso, nunca ao contrário.' },
];

const OBJECOES = [
  { q: '“E se eu não souber fazer nada?”', r: 'Todo posto da GUIA é ocupado por alguém que um dia não sabia. A pessoa do som aprendeu na mesa, a professora do berçário aprendeu na sala. Você marca no cadastro até o que ainda não sabe fazer, e tem gente pra ensinar. Dom se desenvolve no servir.' },
  { q: '“E se eu não der conta do compromisso?”', r: 'A escala é montada em cima da sua disponibilidade. Todo mês você marca os dias em que pode, e só. Algo inesperado apareceu? O time cobre, é pra isso que ele existe. Corpo se sustenta em corpo.' },
  { q: '“E se eu escolher a área errada?”', r: 'A conversa com a liderança existe exatamente pra isso. E mudar de área não é recomeçar do zero: é se encontrar no lugar certo. Deus não se frustra com o nosso processo.' },
];

const PERGUNTAS: Array<{ q: string; r: React.ReactNode }> = [
  { q: 'Preciso ser membro para servir?', r: 'Não. Se você já frequenta os cultos e quer usar seus dons, o cadastro é aberto. A conversa com a liderança alinha o resto.' },
  { q: 'Quanto tempo de domingo eu vou gastar?', r: 'Depende do posto. Alguns chegam às 8h30, outros entram junto com a igreja. Na conversa com a liderança você fica sabendo exatamente o que o seu posto pede.' },
  { q: 'Nunca fiz nada disso. E agora?', r: 'Escolhe mesmo assim. O cadastro aceita o que você quer aprender, e cada área tem gente que ensina no próprio serviço. Ninguém foi chamado já pronto.' },
  { q: 'Como funciona a escala?', r: 'Todo mês você diz os dias em que pode servir. A escala do mês seguinte é montada em cima disso.' },
  { q: 'O que é essa “conversa antes” no Louvor e no Kids?', r: 'Duas áreas conversam com cada pessoa antes de escalar. No Louvor, pra entender seu instrumento e sua disponibilidade. No Kids, porque servir à criança pede preparo. Você preenche o cadastro e a liderança chama você.' },
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

      {/* 1 · o herói: as cinco áreas, foto a foto, e o pouso */}
      {/* 640 alturas de tela (21/10/2026, o teste de flick): seis faixas, cada uma
          com quatro a seis toques de rolagem inteira (com 450 eram dois a quatro) */}
      <Scrub
        rotulo="GUIA Servir"
        altura={640}
        fotos={QUEM_SERVE}
        faixas={ORDEM_HEROI.map((slug, i) => ({
          rotulo: AREAS[slug].nome, texto: AREAS[slug].frase,
          a: [0.15, 0.33, 0.51, 0.69, 0.87][i], b: [0.31, 0.49, 0.67, 0.85, 1][i], sobe: i % 2 === 1, baixo: true,
        }))}
        pouso={{ titulo: 'Encontre o seu lugar pra servir', it: 'pra servir', a: 0, primeiro: true, b: 0.12,
          sub: <>Deus semeou dons em cada pessoa.<span className="s-resto"> Todo domingo, <Numero campo="pessoas" /> pessoas cultivam os delas para que o culto aconteça. {ligaTexto('O seu também tem um posto esperando.')}</span></> }}
        chapeu={<Chapeu forte="Servir" resto={IGREJA.nome} />}
        micro={<p className="s-micro">{ligaTexto("Cadastro de menos de um minuto.")}</p>}
      >
        <Pil href="#quero-servir">Quero servir</Pil>
        <Pil href="/eu" duro tom="vidro">Já sirvo, abrir meu espaço</Pil>
      </Scrub>

      {/* 2 · Deus se alegra com o seu servir */}
      <section className="s-faixa papel">
        <div className="s-in">
          <Arroba className="topo" />
          <div className="s-duas">
            <div className="s-rev">
              <Vozes className="s-h2 media">Deus se alegra com o seu servir</Vozes>
              <p className="s-lead so-largo">{ligaTexto("Antes de soar a primeira nota, alguém já preparou a letra no telão, arrumou a sala das crianças e organizou o estacionamento.")}</p>
              <p className="s-lead">O culto começa às {IGREJA.cultoHora}. O serviço, muito antes.<span className="s-resto"> {ligaTexto('É assim que a nossa casa se torna santuário: por gente que entendeu que servir é adorar.')}</span></p>
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
            <Pil href="/servir/onde-me-encaixo" tom="contorno">Não sei qual é a minha</Pil>
          </div>
        </div>
      </section>

      {/* 5 · como funciona */}
      <Passos id="como-funciona" tid="t-como" titulo="Como funciona?" sub="do cadastro à escala, quatro passos:" itens={PASSOS} />

      {/* 6 · seu espaço */}
      <Claro id="ja-sirvo" tid="t-espaco" titulo="Seu espaço tem sua escala, seus dias e seu líder." lead={<UmaLinha semFim texto="Ache seu nome na lista da sua área, entre com seu PIN de 4 números e pronto: escala, avisos e contato do líder num lugar só. Fidelidade nos pequenos também se organiza." />}>
        <div className="s-qa so-largo">
          <div><b>Ainda não tem PIN?</b><p>{ligaTexto('Sem problema. Ache seu nome na lista da sua área e crie o PIN na hora, com quatro números.')}</p></div>
          <div><b>Ainda não serve?</b><p>O primeiro passo está logo acima.</p></div>
        </div>
        <div className="s-acoes centro"><Pil href="/eu" tom="preta" duro>Abrir meu espaço</Pil></div>
      </Claro>

      {/* 7 · ninguém começou sabendo (tela 7: título pequeno à esquerda, a
          linha de apoio grande, as três objeções) */}
      <section className="s-faixa noite s-grao" aria-labelledby="t-obj">
        <Simbolo className="s-canto" />
        <div className="s-in">
          <div className="s-cab s-rev">
            <h2 id="t-obj" className="s-h2 minima">Ninguém aqui começou sabendo.</h2>
            <p className="s-lead grande"><UmaLinha semFim texto="Se você espera se sentir pronto para servir, é assim mesmo que começa. Até os mais experientes um dia estiveram do seu lado dessa tela. Olha o que mais a gente ouve:" /></p>
          </div>
          <div className="s-rev d1"><Perguntas itens={OBJECOES} forma="obj" /></div>
        </div>
      </section>

      {/* 8 · perguntas */}
      <FaixaPerguntas id="perguntas" tid="t-faq" titulo="Perguntas que todo mundo tem antes do primeiro domingo" itens={PERGUNTAS} />

      {/* 9 · sempre cabe mais um: o fecho com o formulário dentro */}
      <section id="quero-servir" className="s-faixa noite s-grao s-fim" aria-labelledby="t-fim">
        <div className="s-in">
          <Sede className="topo" />
          <div className="s-centro s-rev">
            <Vozes id="t-fim" className="s-h2" it="mais um">Sempre cabe mais um</Vozes>
            <p className="s-lead grande">O próximo domingo tem <Numero campo="postos" /> postos para ocupar. {ligaTexto('Um deles pode ser o seu.')}<span className="s-resto"> {ligaTexto('Preenche aí embaixo e a liderança te chama pra conversar. Servir é a forma mais bonita de dizer sim a Deus.')}</span></p>
          </div>
          <div className="s-rev d1"><FormServir /></div>
          <p className="s-aviso s-centro">Prefere escolher a área com calma? <Link href="/servir/onde-me-encaixo" className="s-link claro">Não sei onde me encaixo</Link>.</p>
        </div>
      </section>
    </>
  );
}
