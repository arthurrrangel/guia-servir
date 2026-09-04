'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { sbPublico as sb } from '@/lib/supabase';
import { IcSeta } from '@/components/Icones';
import { Logo, Chevron } from '@/components/Marca';
import { fotoDaArea } from '@/lib/fotos';
import { Schema } from '@/components/Texto';
import Movimento from '@/components/Movimento';
import { Rodape } from '@/components/Site';
import Contador from '@/components/Contador';
import { Letreiro } from '@/components/Letreiro';
import { IGREJA, SITE, MAPA as MAPA_SCHEMA } from '@/lib/igreja';

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

/* endereço, mapa e @ saem de lib/igreja.ts — uma fonte só para o site inteiro */
const IG = IGREJA.instagram;

/* As seções internas da home continuam com os mesmos ids — #domingo, #igreja
   e #areas seguem sendo endereços válidos, e os links dentro do conteúdo os
   usam. O que sumiu foi a lista SECOES e o marcador de capítulo ativo: eles
   existiam só para pintar o item do menu que estava na tela, e o menu não é
   mais de âncora. Código que não pinta mais nada não fica de lembrança.

/* O MENU DEIXOU DE SER ÂNCORA (03/09/2026).

   Enquanto a home era a única página pública, um menu de âncoras era a
   navegação certa: os capítulos estavam todos ali embaixo. Agora Cultos,
   Como chegar, Conheça e Pequena Guia são páginas de verdade, e um menu que
   rola a home enquanto o resto do site tem outro menu não é navegação — são
   dois sites com o mesmo cabeçalho.

   Mesma lista de components/Site.tsx, na mesma ordem, de propósito: quem
   aprendeu o menu numa página não reaprende na outra. */
const PAGINAS = [
  { href: '/cultos', rot: 'Cultos' },
  { href: '/como-chegar', rot: 'Como chegar' },
  { href: '/sobre', rot: 'Conheça' },
  { href: '/pequena-guia', rot: 'Pequena Guia' },
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
  const [passou, setPassou] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const fio = useRef<HTMLDivElement>(null);

  /* O LINK DE ACESSO DO ORGANIZADOR CAÍA AQUI E MORRIA.

     O email volta para o endereço do site com o token no fragmento
     (#access_token=…). Só que a home fala com o banco pelo cliente PÚBLICO,
     que nasce com detectSessionInUrl:false e persistSession:false de
     propósito: a página do voluntário não pode guardar sessão de ninguém.
     Resultado: o token chegava numa tela programada para não olhar para ele.
     A pessoa clicava no link do email, via a home, e concluía que o login
     estava quebrado. Estava.

     Fragmento não sobe para o servidor, então não existe redirecionamento de
     borda que resolva: quem tem que reencaminhar é o navegador, aqui.

     Isto é uma rede de segurança, não o caminho principal. O caminho é o
     emailRedirectTo apontando para /entrar. Esta rede existe porque, se o
     endereço /entrar não estiver na lista de Redirect URLs do Supabase, o
     Supabase descarta o destino pedido e joga tudo no Site URL, que é esta
     página — e aí a única saída é esta. */
  useEffect(() => {
    const h = window.location.hash;
    if (/[#&](access_token|error_code|error_description)=/.test(h)) {
      window.location.replace('/entrar' + h);
    }
  }, []);

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

  return (
    <div ref={raiz} data-movimento>
      {/* a home tem a própria revelação (com parallax); daqui só entram o
          foco de luz no preto e o ímã do botão principal */}
      <Movimento semRevelar />
      {/* A ENTIDADE. É aqui que o custo do nome do domínio é pago.
          O endereço diz "guiaservir"; o que o Google lê como identidade é
          este bloco — name, endereço, horário e os perfis oficiais. Domínio
          não é entidade: `name` + NAP idêntico ao Google Empresa é. Por isso
          nada aqui é escrito à mão: sai de lib/igreja.ts, a mesma fonte de
          /como-chegar e do rodapé. Um endereço divergente entre páginas é o
          erro de SEO local mais comum e o mais caro. */}
      <Schema dados={{
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebSite', '@id': `${SITE}/#site`,
            url: SITE, name: IGREJA.nome, inLanguage: 'pt-BR',
            publisher: { '@id': `${SITE}/#igreja` },
          },
          {
            '@type': 'Church', '@id': `${SITE}/#igreja`,
            name: IGREJA.nome, slogan: IGREJA.frase, url: SITE,
            image: `${SITE}/og.jpg`, hasMap: MAPA_SCHEMA,
            sameAs: [IGREJA.instagram, ...(IGREJA.youtube ? [IGREJA.youtube] : [])],
            address: {
              '@type': 'PostalAddress',
              streetAddress: IGREJA.rua,
              addressLocality: `${IGREJA.bairro}, ${IGREJA.cidade}`,
              addressRegion: IGREJA.uf, postalCode: IGREJA.cep, addressCountry: 'BR',
            },
            openingHoursSpecification: [{
              '@type': 'OpeningHoursSpecification',
              dayOfWeek: 'https://schema.org/Sunday', opens: '10:00', closes: '11:30',
            }],
          },
        ],
      }} />
      <div className="progresso" ref={fio} style={{ color: solida ? 'var(--noite)' : '#fff' }} aria-hidden="true" />

      {/* ------------------------------------------------------------ barra */}
      <header className={'casa-barra' + (solida ? ' opaco' : '')}>
        <Link href="/" className="marca-link" aria-label="GUIA Church">
          <Logo className="logo" />
        </Link>
        <nav className="casa-nav">
          {PAGINAS.map(p => (
            <Link key={p.href} href={p.href}>{p.rot}</Link>
          ))}
        </nav>
        <div className="casa-barra-fim">
          <Link href="/acessar" className="bt-barra discreto">Acesso às equipes</Link>
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
            {PAGINAS.map((p, i) => (
              <li key={p.href} style={{ ['--i' as string]: i }}>
                <Link href={p.href} onClick={() => setMenu(false)}>{p.rot}</Link>
              </li>
            ))}
            <li style={{ ['--i' as string]: PAGINAS.length }}>
              <Link href="/servir" onClick={() => setMenu(false)}>Servir</Link>
            </li>
          </ul>
          <div className="menu-pe">
            <a href={IG} target="_blank" rel="noreferrer">@guiachurch</a>
            <span>Rua Pedra de Itaúna, 534 · Barra da Tijuca</span>
            <Link href="/acessar" onClick={() => setMenu(false)}>Acesso às equipes</Link>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------ herói
          A foto respira (Ken Burns), o bloco recua com o scroll, e o título
          agora fala na voz do manual: bold, caixa baixa, apertado. */}
      <section className="casa-heroi rev visto">
        <img className="casa-heroi-foto" src="/fotos/heroi.webp" alt="" fetchPriority="high" />
        <div className="casa-heroi-in">
          <p className="g-rot" style={{ justifyContent: 'center', color: 'rgba(255,255,255,.62)' }}>GUIA Church · Barra da Tijuca</p>
          <Tit as="h1" className="">Existe um lugar para você</Tit>
          <p className="g-ed" style={{ color: 'var(--areia)', margin: '18px auto 0' }}>Domingo, dez da manhã.</p>
          <p className="corpo">
            Venha conhecer, ou entre para uma das equipes que fazem o domingo
            acontecer.
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

      <Letreiro />

      {/* --------------------------------------------- prova: sai do banco
          A única prova concreta da página, em número grande. À esquerda, a
          frase que dá sentido aos números; à direita, os números subindo. */}
      {num && (
        <section className="casa-escuro rev" aria-label="A igreja em números">
          <div className="g g-secao justa">
            <div className="g-grade meio">
              <div className="g-c4">
                <p className="g-rot">Hoje</p>
                <p className="g-ed" style={{ margin: 0 }}>Nenhuma delas começou sabendo.</p>
              </div>
              <div className="g-c8">
                <div className="g-num">
                  <div><b><Contador n={num.pessoas} /></b><span>pessoas servindo hoje</span></div>
                  <div><b><Contador n={num.ministerios} /></b><span>áreas abertas</span></div>
                  <div><b><Contador n={num.postos} /></b><span>funções diferentes</span></div>
                  <div><b><Contador n={num.cultos_no_mes} /></b><span>encontros neste mês</span></div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ----------------------------------------------- 01 · O DOMINGO
          FUNÇÃO: tirar o medo de quem nunca veio. Texto à esquerda, foto com o
          selo do horário à direita, as quatro travas embaixo, e a saída para
          as páginas fundas. As quatro perguntas são as palavras da igreja. */}
      <section id="domingo" className="casa-papel rev">
        <div className="g g-secao">
          <div className="g-grade meio">
            <div className="g-c5">
              <p className="g-rot">01 · O domingo</p>
              <Tit className="g-h2">Chega a hora que der</Tit>
              <p className="g-ed">Ninguém vai reparar.</p>
              <p className="g-corpo">
                Noventa minutos, e termina em ponto. Tem gente de terno e gente
                de chinelo na mesma fileira, e ninguém é chamado na frente.
              </p>
              <div className="g-acoes">
                <Link href="/cultos" className="acao cheia">O domingo por inteiro <IcSeta /></Link>
                <Link href="/como-chegar" className="acao">Como chegar</Link>
              </div>
            </div>
            <div className="g-c6 g-d7">
              <div className="g-foto larga leva">
                <img src="/fotos/congregacao.webp" alt="Congregação reunida no culto de domingo" loading="lazy" decoding="async" />
                <div className="g-selo">Dom 10h<small>Rua Pedra de Itaúna, 534</small></div>
              </div>
            </div>
          </div>

          <div className="g-grade" style={{ marginTop: 'clamp(48px,6vw,88px)' }}>
            <div className="g-c10 g-d2">
              <ol className="g-perg">
                <li>
                  <span className="g-perg-n">01</span>
                  <div><h3 className="g-perg-q">Como eu me visto?</h3>
                  <p className="g-perg-r">Do jeito que você já está. Tem gente de terno e gente de chinelo na mesma fileira.</p></div>
                </li>
                <li>
                  <span className="g-perg-n">02</span>
                  <div><h3 className="g-perg-q">Vou ter que falar alguma coisa?</h3>
                  <p className="g-perg-r">Não. Tem um momento de acolhida no meio do culto, e ficar sentado é uma resposta perfeitamente boa.</p></div>
                </li>
                <li>
                  <span className="g-perg-n">03</span>
                  <div><h3 className="g-perg-q">E o meu filho?</h3>
                  <p className="g-perg-r">Tem o GUIA Kids, com sala e equipe próprias, dividido por faixa etária. Check-in na entrada.</p></div>
                </li>
                <li>
                  <span className="g-perg-n">04</span>
                  <div><h3 className="g-perg-q">Onde eu deixo o carro?</h3>
                  <p className="g-perg-r">Tem equipe de estacionamento no domingo de manhã. Se vier de aplicativo, a porta é na Pedra de Itaúna, 534.</p></div>
                </li>
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ 02 · QUEM É A GUIA
          TODO O TEXTO DESTA SEÇÃO É DA IGREJA, palavra por palavra. O que
          mudou é o recipiente: a sigla vira quatro azulejos, o versículo vira
          a frase grande em itálico, e os pilares e o alvo ganham a areia. */}
      <section id="igreja" className="casa-escuro rev">
        <div className="g g-secao">
          <div className="g-grade fim">
            <div className="g-c7">
              <p className="g-rot">02 · A igreja</p>
              <Tit className="g-h2">Somos GUIA</Tit>
            </div>
            <div className="g-c4 g-d9">
              <p className="g-corpo">
                GUIA é sigla, e é a razão de a marca ser <b style={{ fontWeight: 600, color: '#fff' }}>GUI&gt;</b>:
                o chevron é o avanço. Ela vem do princípio de Gênesis 11:6.
              </p>
            </div>
          </div>

          <div className="g-tiles quatro">
            <div className="g-tile">
              <span className="g-tile-l">G</span>
              <span><span className="g-tile-t">Grupo</span><span className="g-tile-d">Somos um povo. Não caminhamos isoladamente.</span></span>
            </div>
            <div className="g-tile">
              <span className="g-tile-l">U</span>
              <span><span className="g-tile-t">Unidos</span><span className="g-tile-d">Cada pessoa tem um papel na construção de algo maior do que si mesma.</span></span>
            </div>
            <div className="g-tile">
              <span className="g-tile-l">I</span>
              <span><span className="g-tile-t">Interagindo</span><span className="g-tile-d">Cultura se constrói por relacionamento, comunicação e participação.</span></span>
            </div>
            <div className="g-tile">
              <span className="g-tile-l"><span className="marca-chev" aria-hidden="true"><Chevron /></span></span>
              <span><span className="g-tile-t">Avançando</span><span className="g-tile-d">Um povo unido, que se comunica e anda na mesma direção, tem força para avançar.</span></span>
            </div>
          </div>

          <div className="g-grade" style={{ marginTop: 'clamp(56px,7vw,104px)' }}>
            <div className="g-c9 g-d2">
              <blockquote className="g-ed" style={{ margin: 0, fontSize: 'clamp(28px,4vw,58px)', maxWidth: '26ch' }}>
                Eis que o povo é um, e todos têm uma mesma língua; e isto é o que
                começam a fazer; e, agora, não haverá restrição para tudo o que
                eles intentarem fazer.
              </blockquote>
              <p className="g-rot" style={{ marginTop: 28 }}>Gênesis 11:6</p>
            </div>
          </div>
        </div>
      </section>

      <section className="casa-areia rev">
        <div className="g g-secao">
          <div className="g-grade">
            <div className="g-c4">
              <div className="g-fixa">
                <p className="g-rot">Nossos pilares</p>
                <Tit className="g-h2">Relacionamento, generosidade e serviço</Tit>
              </div>
            </div>
            <div className="g-c7 g-d6">
              <ol className="g-perg">
                <li><span className="g-perg-n">01</span><div><h3 className="g-perg-q">Relacionamento</h3>
                  <p className="g-perg-r">Ninguém foi chamado para caminhar sozinho. Pertencer é parte fundamental da vida cristã.</p></div></li>
                <li><span className="g-perg-n">02</span><div><h3 className="g-perg-q">Generosidade</h3>
                  <p className="g-perg-r">Tudo o que temos vem de Deus. Somos generosos com o tempo, os recursos e os dons que Ele colocou em nossas mãos.</p></div></li>
                <li><span className="g-perg-n">03</span><div><h3 className="g-perg-q">Serviço</h3>
                  <p className="g-perg-r">Serviço é característica de liderança no Reino. Quem serve se torna protagonista e agente de mudança na sociedade.</p></div></li>
              </ol>
            </div>
          </div>

          <div className="g-grade" style={{ marginTop: 'clamp(56px,7vw,96px)' }}>
            <div className="g-c5">
              <p className="g-rot">Nosso alvo</p>
              <Tit className="g-h2">Plantar cada cristão no solo da responsabilidade do Reino</Tit>
              <p className="g-corpo">
                Que cada pessoa encontre seu lugar, compreenda sua responsabilidade e
                desenvolva aquilo que Deus depositou na vida dela.
              </p>
            </div>
            <div className="g-c6 g-d7">
              <ul className="g-vira" style={{ marginTop: 0 }}>
                <li><span className="g-vira-de">Encher bancos</span><span className="g-vira-chev"><Chevron /></span><span className="g-vira-para">Formar pessoas comprometidas com o Reino</span></li>
                <li><span className="g-vira-de">Espectadores</span><span className="g-vira-chev"><Chevron /></span><span className="g-vira-para">Participantes</span></li>
                <li><span className="g-vira-de">Pessoas que recebam</span><span className="g-vira-chev"><Chevron /></span><span className="g-vira-para">Pessoas que sirvam, contribuam e frutifiquem</span></li>
              </ul>
              <p className="g-corpo">
                Quando cada cristão entende seu lugar e assume sua responsabilidade, a
                igreja deixa de ser um lugar onde as pessoas chegam e passa a ser um
                povo que vive, serve e avança junto.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------- 03 · SERVIR
          FUNÇÃO: apresentar as possibilidades e conduzir. A tese do produto
          em itálico, as áreas com foto real saídas do banco, os quatro passos
          numa linha. */}
      <section id="areas" className="casa-papel rev">
        <div className="g g-secao">
          <div className="g-grade fim">
            <div className="g-c7">
              <p className="g-rot">03 · Servir</p>
              <Tit className="g-h2">A igreja não é o prédio</Tit>
              <p className="g-ed">São pessoas que chegaram mais cedo.</p>
            </div>
            <div className="g-c4 g-d9">
              <p className="g-corpo">
                É a quantidade de gente que decidiu chegar mais cedo para que o
                domingo de outra pessoa funcionasse. São cinco equipes, uma para
                cada tipo de gente.
              </p>
              <div className="g-acoes">
                <Link href="/servir" className="acao cheia">Ver todas as áreas <IcSeta /></Link>
              </div>
            </div>
          </div>

          {fase === 'carregando' && <p className="g-corpo">Carregando as áreas</p>}
          {fase === 'rede' && (
            <p className="g-corpo">
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

          <ol className="casa-tira" aria-label="Como começar" style={{ marginTop: 'clamp(40px,5vw,64px)' }}>
            <li><b>01</b> Escolha a área e se cadastre</li>
            <li><b>02</b> Converse com a liderança</li>
            <li><b>03</b> Entre no time</li>
            <li><b>04</b> Receba sua escala</li>
          </ol>
          <p className="casa-tira-nota">
            O cadastro leva menos de um minuto, e cada área explica o que faz antes de você decidir.
          </p>
        </div>
      </section>

      {/* --------------------------------------------------------- FECHO */}
      <section className="g-cheio rev">
        <img src="/fotos/oferta.webp" alt="" loading="lazy" decoding="async" />
        <div className="g">
          <p className="g-rot">Sempre cabe mais um</p>
          <Tit className="g-h2">{num ? `Hoje são ${num.pessoas} pessoas servindo em ${num.ministerios} áreas.` : 'Ninguém aqui começou sabendo.'}</Tit>
          {num && <p className="g-ed">Nenhuma delas começou sabendo.</p>}
          <div className="g-acoes">
            <Link href="/servir" className="acao cheia">Encontrar minha área <IcSeta /></Link>
            <Link href="/eu" className="acao">Já sirvo · abrir meu espaço</Link>
          </div>
        </div>
      </section>

      <Rodape />

      <div className={'cta-fixa' + (passou && !menu ? ' ver' : '')}>
        <Link href="/servir" className="acao">Quero servir <IcSeta /></Link>
      </div>
    </div>
  );
}
