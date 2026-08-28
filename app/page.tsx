'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { sbPublico as sb } from '@/lib/supabase';
import { IcSeta } from '@/components/Icones';
import { Logo, Chevron } from '@/components/Marca';
import { fotoDaArea } from '@/lib/fotos';

/* =============================================================================
   A HOME

   O QUE ELA RESOLVE, EM CINCO SEGUNDOS
   Quem é a GUIA, o que acontece no domingo, e por onde entrar. Nada mais.
   A home não é o lugar de explicar como funciona a escala nem de listar
   função por função: para isso existe /servir, e ela leva para lá.

   A versão anterior tentava fazer as duas coisas e virou um bloco SERVIR de
   cinco telas dentro da home, com portas, áreas, passos e "perdi meu link"
   empilhados. Quem chegou para conhecer a igreja passava por tudo aquilo;
   quem chegou para se cadastrar rolava cinco telas antes de achar. Agora a
   home mostra as áreas e para por aí.

   DOIS PÚBLICOS, DUAS PORTAS, LOGO NO PRIMEIRO DOBRA
   "Quero conhecer" desce a página. "Quero servir" sai para /servir. Quem já
   serve tem a própria porta em /eu, que é curta o bastante para dizer em voz
   alta num aviso de culto.
   ============================================================================= */

type Min = {
  slug: string; nome: string; descricao: string | null;
  convite: string | null; postos: number; aberto: boolean; artigo: string;
};
type Numeros = {
  pessoas: number; ministerios: number; postos: number;
  cultos_no_mes: number; respostas: number;
};

const ENDERECO = 'Rua Pedra de Itaúna, 534 · Barra da Tijuca, Rio de Janeiro, RJ · 22793-390';
const MAPA = 'https://www.google.com/maps/search/?api=1&query=' +
  encodeURIComponent('GUIA Church, Rua Pedra de Itaúna, 534, Barra da Tijuca, Rio de Janeiro, RJ, 22793-390');
const IG = 'https://instagram.com/guiachurch';

/* quatro itens. Menu de igreja com quinze links é catálogo, não navegação. */
const SECOES = [
  { id: 'domingo', rot: 'Domingo' },
  { id: 'igreja', rot: 'Conheça' },
  { id: 'areas', rot: 'Sirva' },
  { id: 'onde', rot: 'Onde fica' },
];

/* o título monta palavra por palavra. Fica em componente porque a quebra em
   <span> tem que existir no HTML do servidor: se fosse feita no efeito, a
   primeira pintura sairia com o texto inteiro e depois piscaria. */
function Tit({ children, className = 'tit', as: Tag = 'h2' }:
  { children: string; className?: string; as?: 'h1' | 'h2' }) {
  const pals = children.split(' ');
  return (
    <Tag className={className}>
      {pals.map((p, i) => (
        /* o espaço fica FORA do span, como nó de texto entre eles. Dentro, o
           navegador descarta o espaço final de um inline-block e o título sai
           com as palavras coladas: "RELACIONAMENTO,GENEROSIDADEESERVIÇO". */
        <span key={i}>
          <span className="pal" style={{ ['--i' as string]: i }}>{p}</span>
          {i < pals.length - 1 ? ' ' : ''}
        </span>
      ))}
    </Tag>
  );
}

export default function Casa() {
  const [mins, setMins] = useState<Min[]>([]);
  const [num, setNum] = useState<Numeros | null>(null);
  const [fase, setFase] = useState<'carregando' | 'pronto' | 'rede'>('carregando');
  const [menu, setMenu] = useState(false);
  const [solida, setSolida] = useState(false);
  const [ativa, setAtiva] = useState('');
  const [passou, setPassou] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const fio = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const s = sb();
      if (!s) { if (vivo) setFase('rede'); return; }
      const [lista, n] = await Promise.all([
        s.rpc('ministerios_publicos'), s.rpc('numeros_publicos'),
      ]);
      if (!vivo) return;
      if (lista.error) { setFase('rede'); return; }
      setMins((lista.data || []) as Min[]);
      if (!n.error) setNum(n.data as Numeros);
      setFase('pronto');
    })();
    return () => { vivo = false; };
  }, []);

  /* A REVELAÇÃO, E O BURACO QUE ELA ABRIU
     Este efeito rodava uma vez, na montagem, e observava os .rev que existiam
     naquele instante. A faixa dos números só entra no DOM quando a consulta
     ao banco volta, ou seja DEPOIS: ninguém observava ela, o opacity:0 nunca
     saía, e o resultado era uma mancha de 404px de nada logo abaixo do herói.

     Duas correções, e a segunda é a que importa:

     1. o efeito reobserva quando os dados chegam. Resolve o caso conhecido.
     2. uma rede de segurança revela QUALQUER .rev que ainda esteja escondido
        depois de 2,5s. Resolve o caso que eu ainda não conheço. Numa página
        pública, conteúdo invisível é pior que conteúdo sem animação, e
        nenhum efeito vale o risco de a pessoa ver um bloco vazio.

     E a lição de método: eu vinha conferindo as telas com um script que
     forçava .visto em tudo antes de medir. Isso desligava exatamente o
     mecanismo quebrado. Verificação que desliga o que ela deveria testar não
     é verificação. */
  useEffect(() => {
    const r = raiz.current; if (!r) return;
    const parado = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    r.classList.add('js-rev');
    const revelaTudo = () => r.querySelectorAll('.rev:not(.visto)').forEach(e => e.classList.add('visto'));
    if (parado) { r.classList.add('nao-anima'); revelaTudo(); return; }

    const obs = new IntersectionObserver(
      es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visto'); obs.unobserve(e.target); } }),
      { rootMargin: '0px 0px -12% 0px' },
    );
    r.querySelectorAll('.rev:not(.visto)').forEach(e => obs.observe(e));

    /* A rede pega só o que a pessoa JÁ deveria estar vendo: bloco acima da
       dobra que continua escondido é defeito, bloco abaixo dela é a animação
       fazendo o trabalho dela. A primeira versão da rede revelava tudo, e aí
       a página inteira acendia de uma vez no celular, o que é outro defeito.
       Sem transição de propósito: se chegou aqui, alguma coisa falhou, e
       animar a falha só chama atenção para ela. */
    const rede = setInterval(() => {
      const limite = window.scrollY + window.innerHeight;
      let sobrou = 0;
      r.querySelectorAll<HTMLElement>('.rev:not(.visto)').forEach(e => {
        if (e.getBoundingClientRect().top + window.scrollY < limite) {
          e.style.transition = 'none'; e.classList.add('visto');
        } else sobrou++;
      });
      if (!sobrou) clearInterval(rede);
    }, 1200);
    return () => { obs.disconnect(); clearInterval(rede); };
  }, [fase, num]);

  /* barra, fio de progresso, capítulo ativo e parallax num handler só, dentro
     de rAF. Quatro listeners separados brigam pelo mesmo quadro e o celular
     sente na rolagem. */
  useEffect(() => {
    const parado = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let pedindo = false;
    const medir = () => {
      pedindo = false;
      const y = window.scrollY, h = window.innerHeight;
      setSolida(y > h * 0.78);
      setPassou(y > h * 0.9);
      const total = document.documentElement.scrollHeight - h;
      if (fio.current) fio.current.style.setProperty('--p', String(total > 0 ? Math.min(1, y / total) : 0));
      let atual = '';
      for (const s of SECOES) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= h * 0.42) atual = s.id;
      }
      setAtiva(atual);
      if (!parado) {
        document.querySelectorAll<HTMLElement>('.casa-foto').forEach(f => {
          const r = f.getBoundingClientRect();
          if (r.bottom < -200 || r.top > h + 200) return;
          const img = f.querySelector<HTMLElement>('img');
          if (img) img.style.setProperty('--par', (((r.top + r.height / 2 - h / 2) / h) * -58).toFixed(1) + 'px');
        });
      }
    };
    const aoRolar = () => { if (!pedindo) { pedindo = true; requestAnimationFrame(medir); } };
    medir();
    window.addEventListener('scroll', aoRolar, { passive: true });
    window.addEventListener('resize', aoRolar, { passive: true });
    return () => { window.removeEventListener('scroll', aoRolar); window.removeEventListener('resize', aoRolar); };
  }, []);

  useEffect(() => {
    document.body.style.overflow = menu ? 'hidden' : '';
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    window.addEventListener('keydown', esc);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', esc); };
  }, [menu]);

  const irPara = useCallback((id: string) => {
    setMenu(false);
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }));
  }, []);

  return (
    <div ref={raiz}>
      <div className="progresso" ref={fio} style={{ color: solida ? 'var(--noite)' : '#fff' }} aria-hidden="true" />

      {/* ------------------------------------------------------------ barra */}
      <header className={'casa-barra' + (solida ? ' opaco' : '')}>
        <Link href="/" className="marca-link" aria-label="GUIA Church">
          <Logo className="logo" />
        </Link>
        <nav className="casa-nav">
          {SECOES.map(s => (
            <a key={s.id} href={`#${s.id}`} aria-current={ativa === s.id ? 'true' : undefined}>{s.rot}</a>
          ))}
        </nav>
        <div className="casa-barra-fim">
          <Link href="/eu" className="bt-barra discreto">Área do voluntário</Link>
          <Link href="/servir" className="bt-barra">
            <span className="so-largo">Quero&nbsp;</span>servir
          </Link>
          <button className="menu-bt" aria-expanded={menu} aria-label={menu ? 'Fechar menu' : 'Abrir menu'}
                  onClick={() => setMenu(v => !v)}>
            <i /><i />
          </button>
        </div>
      </header>

      {/* ------------------------------------------------- menu do celular */}
      <div className={'menu' + (menu ? ' aberto' : '')} role="dialog" aria-modal="true" aria-hidden={!menu}>
        <div>
          <Logo className="logo" />
          <ul style={{ marginTop: 34 }}>
            {SECOES.map((s, i) => (
              <li key={s.id} style={{ ['--i' as string]: i }}>
                <a href={`#${s.id}`} onClick={e => { e.preventDefault(); irPara(s.id); }}>{s.rot}</a>
              </li>
            ))}
            <li style={{ ['--i' as string]: SECOES.length }}>
              <Link href="/eu" onClick={() => setMenu(false)}>Meu espaço</Link>
            </li>
          </ul>
          <div className="menu-pe">
            <a href={IG} target="_blank" rel="noreferrer">@guiachurch</a>
            <span>Rua Pedra de Itaúna, 534 · Barra da Tijuca</span>
            <Link href="/entrar" onClick={() => setMenu(false)}>Sou da organização</Link>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------ herói */}
      <section className="casa-heroi rev visto">
        <img className="casa-heroi-foto" src="/fotos/heroi.webp" alt="" fetchPriority="high" />
        <div className="casa-heroi-in">
          <Tit as="h1" className="">Existe um lugar para você</Tit>
          <span className="chapeu">GUIA Church · Barra da Tijuca</span>
          <p className="corpo">
            Domingo, dez da manhã. Venha conhecer, ou entre para uma das equipes
            que fazem o domingo acontecer.
          </p>
          <div className="acoes">
            <a href="#domingo" className="acao cheia">Quero conhecer</a>
            <Link href="/servir" className="acao">Quero servir <IcSeta /></Link>
          </div>
        </div>
        <div className="casa-regua">
          <span><b>Domingo, 10h</b></span>
          <span className="so-largo"><b>Rua Pedra de Itaúna, 534</b> · Barra da Tijuca</span>
          <span><b>90 minutos</b> · termina em ponto</span>
        </div>
      </section>

      {/* --------------------------------------------- prova: sai do banco */}
      {num && (
        <section className="faixa casa-escuro rev" aria-label="A igreja em números">
          <div className="casa-numeros">
            <div><b>{num.pessoas}</b><span>pessoas servindo hoje</span></div>
            <div><b>{num.ministerios}</b><span>áreas abertas</span></div>
            <div><b>{num.postos}</b><span>funções diferentes</span></div>
            <div><b>{num.cultos_no_mes}</b><span>encontros neste mês</span></div>
          </div>
        </section>
      )}

      {/* ------------------------------------------------------- 01 domingo */}
      <section id="domingo" className="faixa casa-papel rev">
        <div className="casa-col">
          <p className="indice">01 · O domingo</p>
          <Tit>Chega a hora que der</Tit>
          <span className="chapeu">Ninguém vai reparar</span>
          <p className="casa-hora" style={{ marginTop: 56 }}>
            Dom 10h
            <small>Noventa minutos, e termina em ponto</small>
          </p>
        </div>

        {/* as quatro perguntas que travam quem nunca foi numa igreja. Se elas
            não forem respondidas aqui, a pessoa responde sozinha, e a resposta
            que ela inventa é sempre a pior. */}
        <dl className="casa-perguntas">
          <div>
            <dt>Como eu me visto?</dt>
            <dd>Do jeito que você já está. Tem gente de terno e gente de chinelo na mesma fileira.</dd>
          </div>
          <div>
            <dt>Vou ter que falar alguma coisa?</dt>
            <dd>Não. Tem um momento de acolhida no meio do culto, e ficar sentado é uma resposta perfeitamente boa.</dd>
          </div>
          <div>
            <dt>E o meu filho?</dt>
            <dd>Tem o GUIA Kids, com sala e equipe próprias, dividido por faixa etária. Check-in na entrada.</dd>
          </div>
          <div>
            <dt>Onde eu deixo o carro?</dt>
            <dd>Tem equipe de estacionamento no domingo de manhã. Se vier de aplicativo, a porta é na Pedra de Itaúna, 534.</dd>
          </div>
        </dl>
      </section>

      {/* ---------------------------------------------------- foto inteira */}
      <section className="casa-foto rev">
        <img src="/fotos/palco.webp" alt="" loading="lazy" />
        <div className="casa-col">
          <div className="chev-div" aria-hidden="true"><Chevron /><Chevron /><Chevron /></div>
          <Tit>A igreja não é o prédio</Tit>
          <p className="corpo">
            É a quantidade de gente que decidiu chegar mais cedo para que o domingo
            de outra pessoa funcionasse.
          </p>
        </div>
      </section>

      {/* -------------------------------------------------------- 02 igreja */}
      {/* TODO O TEXTO DESTA SEÇÃO É DA IGREJA.
          A primeira versão eu escrevi de cabeça e estava errada; a segunda era
          um resumo meu do texto certo, que também não serve. Agora são as
          palavras que o Arthur mandou, cortadas no comprimento, nunca
          reescritas. Página de igreja não é lugar de prosa inventada, e
          definição de identidade muito menos. */}
      <section id="igreja" className="faixa casa-papel rev">
        <div className="casa-col">
          <p className="indice">02 · A igreja</p>
          <Tit>Somos GUIA</Tit>
          <span className="chapeu">Cultivando uma nova cultura</span>
          <p className="corpo">
            GUIA é sigla, e é a razão de a marca ser <b style={{ fontWeight: 500 }}>GUI&gt;</b>:
            o chevron é o avanço. Ela vem do princípio de Gênesis 11:6.
          </p>
        </div>

        <div className="casa-col larga">
          <blockquote className="versiculo">
            Eis que o povo é um, e todos têm uma mesma língua; e isto é o que
            começam a fazer; e, agora, não haverá restrição para tudo o que eles
            intentarem fazer.
            <cite>Gênesis 11:6</cite>
          </blockquote>

          <div className="sigla" style={{ marginTop: 64 }}>
            <div>
              <b>G</b><span>Grupo</span>
              <p>Somos um povo. Não caminhamos isoladamente.</p>
            </div>
            <div>
              <b>U</b><span>Unidos</span>
              <p>Cada pessoa tem um papel na construção de algo maior do que si mesma.</p>
            </div>
            <div>
              <b>I</b><span>Interagindo</span>
              <p>Cultura se constrói por relacionamento, comunicação e participação.</p>
            </div>
            <div>
              <span className="marca-chev" aria-hidden="true"><Chevron /></span>
              <span>Avançando</span>
              <p>Um povo unido, que se comunica e anda na mesma direção, tem força para avançar.</p>
            </div>
          </div>
        </div>

        <div className="casa-col larga" style={{ marginTop: 100 }}>
          <p className="indice">Nossos pilares</p>
          <Tit>Relacionamento, generosidade e serviço</Tit>
          <div className="pilares">
            <div>
              <b>Relacionamento</b>
              <p>Ninguém foi chamado para caminhar sozinho. Pertencer é parte fundamental da vida cristã.</p>
            </div>
            <div>
              <b>Generosidade</b>
              <p>Tudo o que temos vem de Deus. Somos generosos com o tempo, os recursos e os dons que Ele colocou em nossas mãos.</p>
            </div>
            <div>
              <b>Serviço</b>
              <p>Serviço é característica de liderança no Reino. Quem serve se torna protagonista e agente de mudança na sociedade.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- o alvo -- */}
      <section className="faixa casa-escuro rev">
        <div className="casa-col">
          <p className="indice">Nosso alvo</p>
          <Tit>Plantar cada cristão no solo da responsabilidade do Reino</Tit>
          <p className="corpo">
            Que cada pessoa encontre seu lugar, compreenda sua responsabilidade e
            desenvolva aquilo que Deus depositou na vida dela.
          </p>
        </div>

        <div className="casa-col larga">
          <div className="alvo">
            <div><b>Encher bancos</b><span>Formar pessoas comprometidas com o Reino</span></div>
            <div><b>Espectadores</b><span>Participantes</span></div>
            <div><b>Pessoas que recebam</b><span>Pessoas que sirvam, contribuam e frutifiquem</span></div>
          </div>
          <p className="corpo" style={{ marginTop: 56 }}>
            Quando cada cristão entende seu lugar e assume sua responsabilidade, a
            igreja deixa de ser um lugar onde as pessoas chegam e passa a ser um
            povo que vive, serve e avança junto.
          </p>
        </div>
      </section>

      {/* --------------------------------------------------------- 03 áreas */}
      {/* Aqui a home mostra e para. Quem quiser entrar segue para /servir, que
          é onde a jornada tem contexto, funções e o responsável de cada área. */}
      <section id="areas" className="faixa casa-escuro rev">
        <div className="casa-col">
          <p className="indice">03 · Servir</p>
          <Tit>Encontre seu lugar</Tit>
          <span className="chapeu">Cinco equipes, uma para cada tipo de gente</span>
        </div>

        <div className="casa-col larga" style={{ marginTop: 64 }}>
          {fase === 'carregando' && <p className="corpo">Carregando as áreas</p>}
          {fase === 'rede' && (
            <p className="corpo">
              Não consegui carregar as áreas agora. Atualize a página, ou fale com
              quem te chamou para servir.
            </p>
          )}
          <div className="casa-areas">
            {mins.map(m => (
              <Link key={m.slug} href={`/servir/${m.slug}`} className="casa-area corte">
                <img src={fotoDaArea(m.slug)} alt="" loading="lazy" />
                <span className="casa-area-nome">{m.nome}</span>
                {m.descricao && <p className="casa-area-desc">{m.descricao}</p>}
                <span className="casa-area-selo">
                  {m.postos} {m.postos === 1 ? 'função' : 'funções'}
                  {!m.aberto && ' · conversa antes'}
                </span>
              </Link>
            ))}
          </div>

          <div className="acoes" style={{ marginTop: 52 }}>
            <Link href="/servir" className="acao cheia">Ver todas as áreas <IcSeta /></Link>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------- 04 faça parte */}
      <section className="faixa casa-papel rev">
        <div className="casa-col">
          <p className="indice">04 · Como começar</p>
          <Tit>Quatro passos</Tit>
          <span className="chapeu">Do primeiro clique até a primeira escala</span>
        </div>
        <div className="casa-col larga">
          <ol className="casa-passos">
            {/* OS MESMOS QUATRO ESTÁGIOS que a tela de acompanhamento marca,
                só que no futuro. Antes eram quatro aqui, cinco na página da
                área e seis no acompanhamento: a pessoa via a mesma jornada
                contada de três jeitos e não sabia em que passo estava. */}
            <li>
              <b>01</b><strong>Escolha a área e se cadastre</strong>
              <p>Cada área explica o que faz. O cadastro leva menos de um minuto.</p>
            </li>
            <li>
              <b>02</b><strong>Converse com a liderança</strong>
              <p>Uma conversa para te conhecer. Você acompanha por um link só seu.</p>
            </li>
            <li>
              <b>03</b><strong>Entre no time</strong>
              <p>Seu nome passa a aparecer na lista da área, e seu espaço abre.</p>
            </li>
            <li>
              <b>04</b><strong>Receba sua escala</strong>
              <p>Todo mês você diz quando pode, e a escala é montada em cima disso.</p>
            </li>
          </ol>
        </div>
      </section>

      {/* --------------------------------------------------- 05 já serve? --- */}
      <section className="faixa casa-escuro rev" style={{ paddingTop: 0 }}>
        <div className="casa-col">
          <p className="indice">05 · Já serve com a gente?</p>
          <Tit>Seu espaço</Tit>
          <p className="corpo">
            Sua escala, seus dias, seu líder e o que você precisa saber antes do
            próximo domingo.
          </p>
          <div className="acoes">
            <Link href="/eu" className="acao cheia">Acessar meu espaço <IcSeta /></Link>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- 06 onde */}
      <section id="onde" className="faixa casa-papel rev">
        <div className="casa-col larga">
          <p className="indice">06 · Onde fica</p>
          <Tit>Barra da Tijuca, Rio de Janeiro</Tit>
          <span className="chapeu">A porta é na Pedra de Itaúna</span>
          <div className="casa-onde">
            <div className="casa-onde-foto corte">
              <img src="/fotos/predio.webp" alt="Fachada da GUIA Church na Barra da Tijuca" loading="lazy" />
            </div>
            <dl className="casa-dados">
              <div>
                <dt>Endereço</dt>
                <dd>
                  <a href={MAPA} target="_blank" rel="noreferrer">
                    Rua Pedra de Itaúna, 534<br />Barra da Tijuca, Rio de Janeiro, RJ<br />22793-390
                  </a>
                </dd>
              </div>
              <div>
                <dt>Culto de domingo</dt>
                <dd>10h<br />cerca de 90 minutos</dd>
              </div>
              <div>
                <dt>No Instagram</dt>
                <dd><a href={IG} target="_blank" rel="noreferrer">@guiachurch</a></dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ fecho */}
      <section className="casa-foto rev">
        <img src="/fotos/congregacao.webp" alt="" loading="lazy" />
        <div className="casa-col">
          <div className="chev-div" aria-hidden="true"><Chevron /><Chevron /><Chevron /></div>
          <Tit>Sempre cabe mais um</Tit>
          <p className="corpo">
            {num
              ? `Hoje são ${num.pessoas} pessoas servindo em ${num.ministerios} áreas. Nenhuma delas começou sabendo.`
              : 'Ninguém aqui começou sabendo.'}
          </p>
          <div className="acoes">
            <Link href="/servir" className="acao cheia">Encontrar minha área <IcSeta /></Link>
            <a href="#domingo" className="acao">Ver o domingo</a>
          </div>
        </div>
      </section>

      <footer className="casa-pe">
        <div className="casa-pe-in">
          <Logo className="logo" />
          <span>{ENDERECO}</span>
          <a href={IG} target="_blank" rel="noreferrer">@guiachurch</a>
          <Link href="/eu">Área do voluntário</Link>
          <Link href="/entrar">Sou da organização</Link>
        </div>
      </footer>

      {/* no celular a barra encolhe e o bloco de áreas fica a quatro telas do
          herói. A ação não pode depender de a pessoa lembrar que ela existe. */}
      <div className={'cta-fixa' + (passou && !menu ? ' ver' : '')}>
        <Link href="/servir" className="acao">Quero servir <IcSeta /></Link>
      </div>
    </div>
  );
}
