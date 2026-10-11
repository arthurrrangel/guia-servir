'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { preload } from 'react-dom';
import { rpc } from '@/lib/publico';
import { IcSeta } from '@/components/Icones';
import { Simbolo } from '@/components/Marca';
import Movimento from '@/components/Movimento';
import Topo from '@/components/Topo';
import Pe from '@/components/Pe';
import { IGREJA } from '@/lib/igreja';
import { telefoneOk } from '@/lib/nome';
import { descricaoPublica } from '@/lib/areas-publicas';
import { src as cria, alt as criaAlt, celular as criaCel, preloadHeroi } from '@/lib/criativos';

/* =============================================================================
   /servir — "EXISTE UM LUGAR PARA VOCÊ" · 10/10/2026

   A página inteira foi refeita a partir de dois documentos que o Arthur
   mandou: a copy "LP GUIA SERVIR" (nove seções, texto por texto) e a
   apresentação visual "ApresentaSite" (a fachada no herói, o título em duas
   vozes, as faixas que alternam noite e papel, os cinco cartões escuros).
   O texto é o da copy, palavra por palavra; a forma é a da apresentação; a
   folha que veste tudo é app/servir/servir.css, escopo `.sv`.

   O QUE É VIVO E O QUE É FIXO. Os números (pessoas, áreas, postos, cultos
   no mês) e os cartões das áreas vêm do banco, pelas duas RPCs públicas que
   a home já usa (ministerios_publicos, numeros_publicos). A copy traz os
   mesmos números de 08/10/2026, e eles ficam aqui como PONTO DE PARTIDA:
   a página nasce com eles no HTML (o Google e a prévia do WhatsApp leem
   números, não um vazio) e troca pelos do banco assim que a consulta
   responde. Sem rede, a página continua inteira.

   O FORMULÁRIO DO FIM NÃO É UM SEGUNDO CADASTRO. Ele pede nome, WhatsApp e
   área, e leva a pessoa para o cadastro da área escolhida com esses dois
   campos já preenchidos (é o rascunho que /servir/<área>/cadastro já lê
   do localStorage, chave guia.cadastro.<slug>). Lá ela marca as funções,
   que é o que a copy chama de passo 1, e a candidatura chega à liderança
   pelo caminho que já existe. "Ainda não sei" guarda o rascunho para todas
   as áreas e abre o guia de quem não sabe escolher. Um segundo backend para
   "interesse" seria uma migração que o Arthur precisaria rodar e uma fila
   que ninguém olha hoje.

   11/10/2026, à tarde: "o site tem que ser mais minimalista, menos texto
   embaixo". As nove seções e os títulos da copy ficaram; o que saiu foi a
   elaboração: cada parágrafo de apoio virou uma frase (a primeira ou a mais
   forte da copy), cada cartão de área ficou com título e uma frase, cada
   passo com uma linha, objeções e perguntas com a resposta curta. O texto
   inteiro continua no documento do Arthur; a tela mostra o que decide.
   ============================================================================= */

type Min = { slug: string; nome: string; descricao: string | null; postos: number; aberto: boolean; artigo: string };
type Numeros = { pessoas: number; ministerios: number; postos: number; cultos_no_mes: number };

/* os números da copy (08/10/2026): o que a página mostra até o banco responder */
const NUM_COPY: Numeros = { pessoas: 82, ministerios: 5, postos: 47, cultos_no_mes: 9 };
const AREAS_COPY: Min[] = [
  { slug: 'midia', nome: 'Mídia', descricao: null, postos: 10, aberto: true, artigo: 'a' },
  { slug: 'louvor', nome: 'Louvor', descricao: null, postos: 8, aberto: false, artigo: 'o' },
  { slug: 'kids', nome: 'GUIA Kids', descricao: null, postos: 9, aberto: false, artigo: 'o' },
  { slug: 'servico', nome: 'Connect', descricao: null, postos: 18, aberto: true, artigo: 'o' },
  { slug: 'livraria', nome: 'Livraria', descricao: null, postos: 2, aberto: true, artigo: 'a' },
];

/* o texto de cada cartão, da copy. Área que o banco publicar sem texto aqui
   usa a descrição pública dela, como a home. */
const CARTAO: Record<string, { titulo: string; texto: string }> = {
  midia: {
    titulo: 'Faça a mensagem chegar longe',
    texto: 'Da letra no telão à transmissão para quem acompanha de longe.',
  },
  louvor: {
    titulo: 'Conduza a igreja à presença de Deus',
    texto: 'Se você toca, canta ou opera mesa, há um lugar pra você.',
  },
  kids: {
    titulo: 'Plante fé desde pequeno',
    texto: 'Do berçário à turma de 8 a 12 anos. A semente de hoje é a fé de amanhã.',
  },
  servico: {
    titulo: 'Receba cada pessoa como família',
    texto: 'Recepção, estacionamento, visitantes, segurança, cozinha, setor.',
  },
  livraria: {
    titulo: 'Leve o culto pra fora dele',
    texto: 'Se você gosta de livros e de conversar com gente, é aqui.',
  },
};
/* a ordem da apresentação; o que o banco publicar além disso entra depois */
const ORDEM = ['midia', 'louvor', 'kids', 'servico', 'livraria'];
const ordenar = (ms: Min[]) =>
  [...ms].sort((a, b) => {
    const ia = ORDEM.indexOf(a.slug), ib = ORDEM.indexOf(b.slug);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

const PASSOS = [
  { n: '01', t: 'Cadastro', d: 'Marque as funções que combinam com você. Menos de um minuto.' },
  { n: '02', t: 'Conversa', d: 'Alguém da liderança fala com você.' },
  { n: '03', t: 'Time', d: 'Seu nome entra na lista da área e o seu espaço abre.' },
  { n: '04', t: 'Escala', d: 'Todo mês você diz quando pode.' },
];

const OBJECOES = [
  { q: '"E se eu não souber fazer nada?"', r: 'Todo posto da GUIA é ocupado por alguém que um dia não sabia. Tem gente pra ensinar.' },
  { q: '"E se eu não der conta do compromisso?"', r: 'A escala é montada em cima da sua disponibilidade. Algo inesperado? O time cobre.' },
  { q: '"E se eu escolher a área errada?"', r: 'Mudar de área não é recomeçar do zero: é se encontrar no lugar certo.' },
];

const PERGUNTAS: { q: string; r: React.ReactNode }[] = [
  { q: 'Preciso ser membro para servir?', r: 'Não. Se você já frequenta os cultos, o cadastro é aberto.' },
  { q: 'Quanto tempo de domingo eu vou gastar?', r: 'Depende do posto: alguns chegam às 8h30, outros entram junto com a igreja.' },
  { q: 'Nunca fiz nada disso. E agora?', r: 'Escolhe mesmo assim. Cada área tem gente que ensina no próprio serviço.' },
  { q: 'Como funciona a escala?', r: 'Todo mês você diz os dias em que pode. A escala do mês seguinte é montada em cima disso.' },
  { q: 'O que é essa "conversa antes" no Louvor e no Kids?', r: 'As duas áreas conversam com cada pessoa antes de escalar. Você preenche o cadastro e a liderança chama você.' },
  { q: 'Posso conhecer antes de me comprometer?', r: <>Pode. Chega no próximo domingo e procura alguém da equipe na porta, ou chama a gente no <a href={IGREJA.instagram} target="_blank" rel="noreferrer">Instagram</a>.</> },
];

const Visto = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m4 12.5 5 5L20 6.5" />
  </svg>
);

/* dois dígitos, como na apresentação ("08 postos") */
const dois = (n: number) => String(n).padStart(2, '0');

/* O NÚMERO QUE SOBE. Nasce no HTML já com o valor (o servidor escreve "82"),
   e só no navegador, com movimento permitido, conta de zero até ele quando
   a faixa entra na tela. Quem pediu "reduzir movimento" vê o valor parado. */
function useContagem(alvo: number, ativo: boolean) {
  const [v, setV] = useState(alvo);
  const anima = useRef(false);
  useEffect(() => {
    if (!ativo) return;
    if (anima.current) { setV(alvo); return; }
    anima.current = true;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(alvo); return; }
    const t0 = performance.now(), dur = 1100;
    let id = 0;
    const passo = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setV(Math.round(alvo * e));
      if (p < 1) id = requestAnimationFrame(passo);
    };
    setV(0);
    id = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(id);
  }, [alvo, ativo]);
  return v;
}

export default function Servir() {
  preload('/tipos/instrument-serif-italic.woff2', { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' });
  preload('/tipos/instrument-serif.woff2', { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' });
  preloadHeroi('servir');

  const [mins, setMins] = useState<Min[]>(AREAS_COPY);
  const [num, setNum] = useState<Numeros>(NUM_COPY);
  const [rede, setRede] = useState(false);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const [lista, n] = await Promise.all([rpc('ministerios_publicos'), rpc('numeros_publicos')]);
      if (!vivo) return;
      if (lista.error) setRede(true);
      else if (Array.isArray(lista.data) && lista.data.length) setMins(ordenar(lista.data as Min[]));
      const nd = Array.isArray(n.data) ? n.data[0] : n.data;
      if (!n.error && nd && typeof nd.pessoas === 'number') {
        setNum({ pessoas: nd.pessoas, ministerios: nd.ministerios, postos: nd.postos, cultos_no_mes: nd.cultos_no_mes });
      }
    })();
    return () => { vivo = false; };
  }, []);

  /* âncoras rolam suave (o botão "Quero servir" vai ao formulário), menos
     para quem pediu "reduzir movimento" */
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const raiz = document.documentElement;
    const antes = raiz.style.scrollBehavior;
    raiz.style.scrollBehavior = 'smooth';
    return () => { raiz.style.scrollBehavior = antes; };
  }, []);

  return (
    <div className="sv" data-movimento>
      <a href="#conteudo" className="sv-pular">Pular para o conteúdo</a>
      <Movimento />
      <Topo atual="/servir" />
      <main id="conteudo">
        <Heroi />
        <Frase />
        <Numeros num={num} />
        <Areas mins={mins} rede={rede} />
        <Como />
        <JaServe />
        <Objecoes />
        <Perguntas />
        <Fim mins={mins} postos={num.postos} />
      </main>
      <Pe />
    </div>
  );
}

/* ----------------------------------------------------------------- 1 · herói */
function Heroi() {
  return (
    <section className="sv-heroi" aria-labelledby="sv-t">
      <picture>
        {criaCel('servir') && <source media="(max-width: 759px)" srcSet={criaCel('servir')!} />}
        <img src={cria('servir')} alt={criaAlt('servir')} fetchPriority="high" decoding="async" />
      </picture>
      <div className="sv-in">
        <p className="sv-chapeu sv-e" style={{ ['--i' as string]: 0 }}>
          Servir <span className="ponto" aria-hidden="true" /> <span className="sede">{IGREJA.nome}</span>
        </p>
        <h1 id="sv-t" className="sv-h1">
          <span className="sv-mask"><span className="sv-linha" style={{ ['--i' as string]: 0 }}>Existe um lugar</span></span>
          <span className="sv-mask"><span className="sv-linha sv-it" style={{ ['--i' as string]: 1 }}>para você.</span></span>
        </h1>
        <p className="sv-lead sv-e" style={{ ['--i' as string]: 2 }}>
          Deus semeou dons em cada pessoa. O seu tem um posto esperando.
        </p>
        <div className="sv-acoes sv-e" style={{ ['--i' as string]: 3 }}>
          <a href="#quero-servir" className="sv-bt branco">Quero servir</a>
          <Link href="/eu" className="sv-bt vidro">Já sirvo, abrir meu espaço</Link>
        </div>
        <p className="sv-micro sv-e" style={{ ['--i' as string]: 4 }}>Cadastro de menos de um minuto.</p>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- 2 · frase-âncora */
function Frase() {
  return (
    <section className="sv-frase rev" aria-labelledby="sv-frase-t">
      <div className="sv-in">
        <a href={IGREJA.instagram} target="_blank" rel="noreferrer" className="sv-arroba sv-r">{IGREJA.instagramArroba}</a>
        <div className="sv-frase-g">
          <div>
            <h2 id="sv-frase-t" className="sv-h2 sv-r" style={{ ['--i' as string]: 1 }}>
              Deus se alegra<br />com o seu <span className="sv-it">servir.</span>
            </h2>
            <div className="sv-txt">
              <p className="sv-r" style={{ ['--i' as string]: 2 }}>O culto começa às {IGREJA.cultoHora}. O serviço, muito antes.</p>
            </div>
          </div>
          <div className="sv-foto-v sv-r" style={{ ['--i' as string]: 2 }}>
            <img src={cria('servir-frase')} alt={criaAlt('servir-frase')} loading="lazy" decoding="async" />
          </div>
        </div>
        <span className="sv-sede sv-r" style={{ ['--i' as string]: 4 }}><b>guiachurch</b><i>|</i>sede</span>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- 3 · números vivos */
function Numeros({ num }: { num: Numeros }) {
  const faixa = useRef<HTMLElement>(null);
  const [ativo, setAtivo] = useState(false);
  useEffect(() => {
    const el = faixa.current; if (!el) return;
    const obs = new IntersectionObserver(es => {
      if (es.some(e => e.isIntersecting)) { setAtivo(true); obs.disconnect(); }
    }, { rootMargin: '0px 0px -10% 0px' });
    obs.observe(el);
    const rede = setTimeout(() => setAtivo(true), 6000);
    return () => { obs.disconnect(); clearTimeout(rede); };
  }, []);
  const pessoas = useContagem(num.pessoas, ativo);
  const areas = useContagem(num.ministerios, ativo);
  const postos = useContagem(num.postos, ativo);
  const cultos = useContagem(num.cultos_no_mes, ativo);
  return (
    <section ref={faixa} className="sv-numeros sv-escuro sv-grao rev" aria-labelledby="sv-num-t">
      <div className="sv-in">
        <div className="sv-numeros-g">
          <div className="sv-circulos sv-r" aria-hidden="true">
            <div className="sv-circ a"><img src={cria('servir-louvor')} alt="" loading="lazy" decoding="async" /></div>
            <div className="sv-circ b"><img src={cria('servir-porta')} alt="" loading="lazy" decoding="async" /></div>
          </div>
          <div>
            <span className="sv-arroba sv-r" style={{ ['--i' as string]: 1 }}>Hoje na GUIA</span>
            <h2 id="sv-num-t" className="sv-h2 sv-r" style={{ ['--i' as string]: 2 }}>Números <span className="sv-it">vivos.</span></h2>
            <ul className="sv-vivos">
              <li className="sv-r" style={{ ['--i' as string]: 3 }}><span><b>{pessoas}</b> pessoas servindo.</span><Visto /></li>
              <li className="sv-r" style={{ ['--i' as string]: 4 }}><span><b>{areas}</b> áreas abertas.</span><Visto /></li>
              <li className="sv-r" style={{ ['--i' as string]: 5 }}><span><b>{postos}</b> postos na escala.</span><Visto /></li>
              <li className="sv-r" style={{ ['--i' as string]: 6 }}><span><b>{cultos}</b> encontros no mês.</span><Visto /></li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- 4 · as áreas */
function Areas({ mins, rede }: { mins: Min[]; rede: boolean }) {
  return (
    <section id="areas" className="sv-areas rev" aria-labelledby="sv-areas-t">
      <div className="sv-in">
        <span className="sv-sede sv-r"><b>guiachurch</b><i>|</i>sede</span>
        <h2 id="sv-areas-t" className="sv-h2 sv-r" style={{ ['--i' as string]: 1 }}>Escolha por onde <span className="sv-it">começar.</span></h2>
        <p className="sv-lead sv-r" style={{ ['--i' as string]: 2 }}>Pode marcar até o que ainda não sabe fazer: tem gente pra ensinar.</p>
        <ul className="sv-cartoes">
          {mins.map((m, i) => {
            const c = CARTAO[m.slug];
            const texto = c?.texto ?? descricaoPublica(m.slug, m.descricao) ?? '';
            return (
              <li key={m.slug} className="sv-r" style={{ ['--i' as string]: 2 + i }}>
                <Link href={`/servir/${m.slug}`} className="sv-cartao">
                  <h3>{m.nome}</h3>
                  <span className="sv-postos">{dois(m.postos)} {m.postos === 1 ? 'posto' : 'postos'}</span>
                  {!m.aberto && <span className="sv-tag">conversa antes</span>}
                  {c && <h4>{c.titulo}</h4>}
                  {texto && <p>{texto}</p>}
                  <span className="sv-ir">Escolher esta área <IcSeta /></span>
                </Link>
              </li>
            );
          })}
        </ul>
        {rede && <p className="sv-aviso" role="status">Sem conexão agora: os números e as áreas acima são os últimos conhecidos. Atualize a página para ver os de hoje.</p>}
        <div className="sv-acoes sv-r" style={{ ['--i' as string]: 7 }}>
          <Link href="/servir/onde-me-encaixo#areas" className="sv-bt preto">Ver todas as áreas</Link>
          <Link href="/servir/onde-me-encaixo" className="sv-bt preto">Não sei qual é a minha</Link>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- 5 · como funciona */
function Como() {
  return (
    <section className="sv-como rev" aria-labelledby="sv-como-t">
      <div className="sv-in">
        <h2 id="sv-como-t" className="sv-como-tit sv-r">Como funciona?</h2>
        <p className="sv-como-sub sv-r" style={{ ['--i' as string]: 1 }}>do cadastro à escala, 4 passos:</p>
        <ol className="sv-passos">
          {PASSOS.map((p, i) => (
            <li key={p.n} className="sv-passo sv-r" style={{ ['--i' as string]: 2 + i }}>
              <b><small>{p.n}</small> - {p.t}</b>
              <p>{p.d}</p>
            </li>
          ))}
        </ol>
        <span className="sv-sede sv-r" style={{ ['--i' as string]: 6 }}><b>guiachurch</b><i>|</i>sede</span>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- 6 · quem já serve */
function JaServe() {
  return (
    <section id="ja-sirvo" className="sv-ja sv-escuro sv-grao rev" aria-labelledby="sv-ja-t">
      <div className="sv-ja-cartao">
        <span className="sv-sede sv-r"><b>guiachurch</b><i>|</i>sede</span>
        <h2 id="sv-ja-t" className="sv-h2 sv-r" style={{ ['--i' as string]: 1 }}>Seu espaço tem sua escala, seus dias e seu líder.</h2>
        <p className="sv-lead sv-r" style={{ ['--i' as string]: 2 }}>Escala, avisos e contato do líder num lugar só.</p>
        <div className="sv-ja-q">
          <div className="sv-r" style={{ ['--i' as string]: 3 }}>
            <h3 className="sv-h3">Ainda não tem PIN?</h3>
            <p>Ache seu nome na lista da sua área e crie o PIN na hora.</p>
          </div>
          <div className="sv-r" style={{ ['--i' as string]: 4 }}>
            <h3 className="sv-h3">Ainda não serve?</h3>
            <p>O primeiro passo está logo acima.</p>
          </div>
        </div>
        <div className="sv-acoes sv-r" style={{ ['--i' as string]: 5, justifyContent: 'center' }}>
          <Link href="/eu" className="sv-bt preto">Abrir meu espaço</Link>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------- 7 · quebra de objeção */
function Objecoes() {
  return (
    <section className="sv-obj sv-escuro sv-grao rev" aria-labelledby="sv-obj-t">
      <span className="sv-marca-canto" aria-hidden="true"><Simbolo /></span>
      <div className="sv-in">
        <h2 id="sv-obj-t" className="sv-h2 sv-r">Ninguém aqui começou sabendo.</h2>
        <p className="sv-lead sv-r" style={{ ['--i' as string]: 1 }}>Até os mais experientes um dia estiveram do seu lado dessa tela.</p>
        <div className="sv-obj-q">
          {OBJECOES.map((o, i) => (
            <div key={o.q} className="sv-r" style={{ ['--i' as string]: 2 + i }}>
              <h3 className="sv-h3">{o.q}</h3>
              <p>{o.r}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- 8 · perguntas */
function Perguntas() {
  return (
    <section id="perguntas" className="sv-faq rev" aria-labelledby="sv-faq-t">
      <span className="sv-marca-canto" aria-hidden="true"><Simbolo /></span>
      <div className="sv-in">
        <div className="sv-faq-cab sv-r">
          <h2 id="sv-faq-t" className="sv-h2">Perguntas que todo mundo tem antes do primeiro domingo</h2>
        </div>
        <dl className="sv-faq-l">
          {PERGUNTAS.map((p, i) => (
            <div key={p.q} className="sv-r" style={{ ['--i' as string]: 1 + i }}>
              <dt>{p.q}</dt> <dd>{p.r}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- 9 · o fecho */
const SEM_AREA = '';
const NAO_SEI = 'nao-sei';

function Fim({ mins, postos }: { mins: Min[]; postos: number }) {
  const router = useRouter();
  const [nome, setNome] = useState('');
  const [tel, setTel] = useState('');
  const [area, setArea] = useState(SEM_AREA);
  const [erro, setErro] = useState<{ nome?: string; tel?: string; area?: string; geral?: string }>({});
  const [indo, setIndo] = useState(false);

  const enviar = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (indo) return;
    const n = nome.trim().replace(/\s+/g, ' ');
    const dig = tel.replace(/\D/g, '');
    const falta: typeof erro = {};
    if (!n) falta.nome = 'Escreva seu nome.';
    if (!dig) falta.tel = 'Escreva seu WhatsApp, com DDD.';
    else if (!telefoneOk(dig)) falta.tel = 'Confira o WhatsApp: DDD e número, de 10 a 13 dígitos.';
    if (!area) falta.area = 'Escolha uma área, ou marque que ainda não sabe.';
    setErro(falta);
    if (Object.keys(falta).length) return;

    /* o rascunho que o cadastro da área lê: nome e WhatsApp já preenchidos.
       Com nome e sobrenome e telefone válidos, o cadastro abre direto no
       passo das funções; senão, abre no primeiro passo para a pessoa
       completar. 24h de validade, como o próprio cadastro faz. */
    const pronto = n.includes(' ') && telefoneOk(dig);
    const guardar = (slug: string) => {
      try {
        localStorage.setItem(`guia.cadastro.${slug}`,
          JSON.stringify({ em: Date.now(), passo: pronto ? 1 : 0, nome: n, tel: tel.trim(), email: '', escolhidas: [], resp: {} }));
      } catch {}
    };
    setIndo(true);
    if (area === NAO_SEI) {
      mins.forEach(m => guardar(m.slug));
      router.push('/servir/onde-me-encaixo');
      return;
    }
    guardar(area);
    router.push(`/servir/${area}/cadastro`);
  }, [indo, nome, tel, area, mins, router]);

  return (
    <section id="quero-servir" className="sv-fim sv-escuro sv-grao rev" aria-labelledby="sv-fim-t">
      <div className="sv-in">
        <span className="sv-sede sv-r"><b>guiachurch</b><i>|</i>sede</span>
        <h2 id="sv-fim-t" className="sv-h2 sv-r" style={{ ['--i' as string]: 1 }}>Sempre cabe <span className="sv-it">mais um.</span></h2>
        <p className="sv-lead sv-r" style={{ ['--i' as string]: 2 }}>O próximo domingo tem {postos} postos para ocupar. Um deles pode ser o seu.</p>
        <form className="sv-form sv-r" style={{ ['--i' as string]: 3 }} onSubmit={enviar} noValidate>
          <div className="sv-campo">
            <label htmlFor="sv-nome">Nome</label>
            <input id="sv-nome" name="nome" type="text" placeholder="Nome:" autoComplete="name" value={nome}
                   aria-invalid={!!erro.nome} aria-describedby={erro.nome ? 'sv-nome-e' : undefined}
                   onChange={e => { setNome(e.target.value); if (erro.nome) setErro(x => ({ ...x, nome: undefined })); }} />
            {erro.nome && <span id="sv-nome-e" className="sv-dica" role="alert">{erro.nome}</span>}
          </div>
          <div className="sv-campo">
            <label htmlFor="sv-tel">WhatsApp</label>
            <input id="sv-tel" name="whatsapp" type="tel" inputMode="tel" placeholder="Whatsapp:" autoComplete="tel" value={tel}
                   aria-invalid={!!erro.tel} aria-describedby={erro.tel ? 'sv-tel-e' : undefined}
                   onChange={e => { setTel(e.target.value); if (erro.tel) setErro(x => ({ ...x, tel: undefined })); }} />
            {erro.tel && <span id="sv-tel-e" className="sv-dica" role="alert">{erro.tel}</span>}
          </div>
          <div className="sv-campo">
            <label htmlFor="sv-area">Área de interesse</label>
            <select id="sv-area" name="area" value={area} className={area ? '' : 'vazio'}
                    aria-invalid={!!erro.area} aria-describedby={erro.area ? 'sv-area-e' : undefined}
                    onChange={e => { setArea(e.target.value); if (erro.area) setErro(x => ({ ...x, area: undefined })); }}>
              <option value={SEM_AREA} disabled>Área de interesse:</option>
              {mins.map(m => <option key={m.slug} value={m.slug}>{m.nome}</option>)}
              <option value={NAO_SEI}>Ainda não sei</option>
            </select>
            {erro.area && <span id="sv-area-e" className="sv-dica" role="alert">{erro.area}</span>}
          </div>
          <button type="submit" className="sv-bt branco" aria-busy={indo}>{indo ? 'Abrindo o cadastro' : 'Quero servir'}</button>
        </form>
        <p className="sv-fim-micro sv-r" style={{ ['--i' as string]: 4 }}>Seus dados servem só pra te chamar pra essa conversa.</p>
      </div>
    </section>
  );
}
