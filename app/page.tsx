'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { sbPublico as sb } from '@/lib/supabase';
import { IcSeta } from '@/components/Icones';
import { Chevron } from '@/components/Marca';
import { Agora } from '@/components/Agora';
import { fotoDaArea } from '@/lib/fotos';
import { Schema } from '@/components/Texto';
import Movimento from '@/components/Movimento';
import { Barra, Rodape } from '@/components/Site';
import { AreasCarregando } from '@/components/Tela';
import Contador from '@/components/Contador';
import { IGREJA, SITE, MAPA as MAPA_SCHEMA } from '@/lib/igreja';
import ProximoCulto from '@/components/ProximoCulto';
import Abertura from '@/components/Abertura';
import { PEQUENAS_GUIAS } from '@/lib/pequenas-guias';
import { SIGLA, SIGLA_FRASE } from '@/lib/igreja';
import { pl, cont } from '@/lib/plural';
import { src as cria, alt as criaAlt } from '@/lib/criativos';

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

/* a sigla mora em lib/igreja.ts — ver a nota lá sobre por que ela saiu daqui */

/* As seções internas da home continuam com os mesmos ids — #domingo, #igreja
   e #areas seguem sendo endereços válidos, e os links dentro do conteúdo os
   usam. O que sumiu foi a lista SECOES e o marcador de capítulo ativo: eles
   existiam só para pintar o item do menu que estava na tela, e o menu não é
   mais de âncora. Código que não pinta mais nada não fica de lembrança.

/* O MENU DEIXOU DE SER ÂNCORA (03/09/2026) E DEPOIS DEIXOU DE SER CÓPIA (07/09).
   Enquanto a home era a única página pública, um menu de âncoras era a
   navegação certa. Virando páginas de verdade, o menu passou a ser o mesmo do
   resto do site — e por quatro dias foi uma CÓPIA dele, 50 linhas iguais aqui
   e em components/Site.tsx. Agora é o mesmo componente: `Barra`, com
   `inicio` (nasce transparente sobre a foto) e `solida` (fica opaca quando a
   rolagem passa do herói). */

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
  const [solida, setSolida] = useState(false);
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
      /* a faixa de números só entra com números de verdade: a RPC devolve um
         objeto; se voltar vazio ou em outro formato, a faixa não aparece, em
         vez de mostrar quatro rótulos sem número (08/09/2026) */
      const nd = Array.isArray(n.data) ? n.data[0] : n.data;
      if (!n.error && nd && typeof nd.pessoas === 'number') setNum(nd as Numeros);
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
      { rootMargin: '0px 0px 25% 0px' },
    );
    const pendentes = Array.from(r.querySelectorAll<HTMLElement>('.rev:not(.visto)'));
    pendentes.forEach(e => obs.observe(e));

    /* A ROLAGEM TAMBÉM REVELA (igual ao Movimento das outras páginas): todo
       evento de rolagem, num rAF, revela o que já está na tela ou acima dela.
       Uma rolagem rápida saltava seções inteiras entre dois quadros do
       observador e a faixa chegava vazia. A rede de 1,2s fica só para o caso
       em que nada rolou. */
    let pedindo = false;
    const varre = () => {
      pedindo = false;
      const limite = window.innerHeight * 1.25;
      for (let i = pendentes.length - 1; i >= 0; i--) {
        const e = pendentes[i];
        if (e.classList.contains('visto')) { pendentes.splice(i, 1); continue; }
        const rect = e.getBoundingClientRect();
        if (rect.top < limite) {
          if (rect.bottom < 0) e.style.transition = 'none';
          e.classList.add('visto'); obs.unobserve(e); pendentes.splice(i, 1);
        }
      }
      if (!pendentes.length) window.removeEventListener('scroll', aoRolar);
    };
    const aoRolar = () => { if (!pedindo) { pedindo = true; requestAnimationFrame(varre); } };
    window.addEventListener('scroll', aoRolar, { passive: true });
    const rede = setTimeout(varre, 1200);
    return () => { obs.disconnect(); clearTimeout(rede); window.removeEventListener('scroll', aoRolar); };
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

  return (
    <div ref={raiz} data-movimento>
      {/* a home tem a própria revelação (com parallax); daqui só entram o
          foco de luz no preto e o ímã do botão principal */}
      <Movimento semRevelar />
      <Abertura />
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
              dayOfWeek: 'https://schema.org/Sunday', opens: '10:00', closes: '12:00',
            }],
          },
        ],
      }} />
      <div className="progresso" ref={fio} style={{ color: solida ? 'var(--noite)' : '#fff' }} aria-hidden="true" />

      {/* o mesmo atalho de teclado das outras páginas: a home era a única sem
          <main> e sem "pular para o conteúdo" — e é a página em que mais se
          chega por teclado, porque é a primeira. */}
      <a href="#conteudo" className="pular">Pular para o conteúdo</a>
      <Barra inicio solida={solida} />

      <main id="conteudo" style={{ maxWidth: 'none', margin: 0, padding: 0 }}>
      {/* ------------------------------------------------------------ herói
          Foto de ponta a ponta, tudo centrado: rótulo, título, uma linha,
          dois botões, a régua. Nada de parágrafo. */}
      <section className="casa-heroi rev visto">
        <img className="casa-heroi-foto" src={cria('heroi')} alt={criaAlt('heroi')} fetchPriority="high" />
        <div className="casa-heroi-in">
          {/* a pílula viva: a próxima coisa que acontece na igreja, calculada
              no aparelho (lib/semana.ts), com a ação certa para o momento */}
          <Agora pill />
          <Tit as="h1" className="">Existe um lugar para você</Tit>
          <p className="g-ed" style={{ color: 'var(--areia)', margin: '18px auto 0' }}>{IGREJA.frase}.</p>
          {/* UM PRIMÁRIO, UMA PALAVRA. 06/09/2026.
              Eram dois botões do mesmo tamanho: um branco sólido e um
              contornado. Sobre foto escura o contornado praticamente some, e
              "Quero servir" já é um botão com borda na barra do topo — a
              mesma ação aparecia três vezes na primeira tela. O sólido fica
              com quem chega pela primeira vez; servir vira palavra, que é o
              peso certo para a ação de quem já está dentro. */}
          <div className="acoes">
            <Link href="/cultos" className="acao cheia">Quero conhecer</Link>
            <Link href="/servir" className="g-link claro">Quero servir</Link>
          </div>
        </div>
      </section>

      {/* ------------------------------------------ os três fatos, estruturados
          O que a pessoa procura num site de igreja em três segundos: quando é
          o próximo culto (data de verdade, calculada no aparelho), onde fica,
          e o que existe durante a semana. Cada um é uma porta. */}
      <section className="fatos rev visto" aria-label="O essencial">
        <Link href="/cultos" className="fato">
          <span className="fato-r">Próximo culto</span>
          <span className="fato-v"><ProximoCulto /><IcSeta /></span>
          <span className="fato-d">Chega a hora que der. Tem alguém na porta.</span>
        </Link>
        <Link href="/como-chegar" className="fato">
          <span className="fato-r">Onde</span>
          <span className="fato-v">{IGREJA.rua}<IcSeta /></span>
          <span className="fato-d">{IGREJA.bairro}, {IGREJA.cidade}. Estacionamento com equipe.</span>
        </Link>
        <Link href="/pequena-guia" className="fato">
          <span className="fato-r">Durante a semana</span>
          <span className="fato-v">{PEQUENAS_GUIAS.length} Pequenas Guias<IcSeta /></span>
          <span className="fato-d">Grupos de terça a quinta, perto de onde você mora.</span>
        </Link>
      </section>

      {/* --------------------------------------------- prova: sai do banco
          A única prova concreta da página, em quatro números. */}
      {num && (
        <section className="casa-escuro rev" aria-label="A igreja em números">
          <div className="g g-secao">
            <div className="c">
              <p className="g-rot">Hoje na GUIA</p>
              <p className="g-ed" style={{ margin: 0 }}>Quem faz o domingo acontecer.</p>
            </div>
            <div className="g-num centro c-bloco grande">
              <div><b><Contador n={num.pessoas} /></b><span>{pl(num.pessoas, 'pessoa servindo', 'pessoas servindo')}</span></div>
              <div><b><Contador n={num.ministerios} /></b><span>{pl(num.ministerios, 'área aberta', 'áreas abertas')}</span></div>
              <div><b><Contador n={num.postos} /></b><span>{pl(num.postos, 'posto na escala', 'postos na escala')}</span></div>
              <div><b><Contador n={num.cultos_no_mes} /></b><span>{pl(num.cultos_no_mes, 'encontro neste mês', 'encontros neste mês')}</span></div>
            </div>
          </div>
        </section>
      )}

      {/* ----------------------------------------------- 01 · O DOMINGO
          Título, uma linha, dois botões, a foto. As perguntas de quem nunca
          foi moram em /cultos — a home não repete. */}
      <section id="domingo" className="casa-papel rev">
        <div className="g g-secao">
          {/* assimétrico: o texto na esquerda, a ação no fim da linha. Ver
              FASE 20 no globals — era aqui que a home repetia .c pela segunda
              das quatro vezes. */}
          <div className="g-cab">
            <div className="g-cab-txt">
              <p className="g-rot">O domingo</p>
              <Tit className="g-h2">Como é o domingo</Tit>
              <p className="g-ed">Louvor, palavra e acolhida.</p>
            </div>
            <div className="g-acoes">
              <Link href="/cultos" className="acao cheia">O domingo por inteiro <IcSeta /></Link>
              <Link href="/como-chegar" className="g-link">Como chegar</Link>
            </div>
          </div>
          <div className="c-foto">
            <div className="g-foto leva">
              <img src={cria('domingo')} alt={criaAlt('domingo')} loading="lazy" decoding="async" />
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ 02 · QUEM É A GUIA
          No desktop, uma história em rolagem: a página trava e G, U, I e >
          atravessam a tela, uma letra por vez, com a palavra e a frase da
          igreja (CSS scroll-driven, ver .rolo). Onde não há suporte ou no
          celular, os quatro azulejos. O texto é o da igreja, palavra por
          palavra. */}
      <section id="igreja" className="casa-escuro retic rev">
        <div className="rolo">
          <div className="rolo-in">
            <div className="rolo-cab">
              <p className="g-rot" style={{ justifyContent: 'center' }}>A igreja</p>
            </div>
            <div className="rolo-track">
              {SIGLA.map((l, i) => (
                <div key={l.t} className="rolo-p">
                  <div>
                    <div className="rolo-l">{l.l === '>' ? <span className="marca-chev"><Chevron /></span> : l.l}</div>
                    <p className="rolo-t">{l.t}</p>
                    <p className="rolo-d">{l.d}</p>
                    {i === SIGLA.length - 1 && (
                      <div className="g-acoes" style={{ justifyContent: 'center' }}>
                        <Link href="/sobre" className="acao">Quem somos <IcSeta /></Link>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <span className="rolo-n">Somos GUIA · quatro palavras</span>
            <div className="rolo-prog"><i /></div>
          </div>
        </div>

        <div className="sigla-azulejos">
          <div className="g g-secao">
            <div className="c">
              <p className="g-rot">A igreja</p>
              <Tit className="g-h2">Somos GUIA</Tit>
              <p className="g-ed">{SIGLA_FRASE}.</p>
            </div>
            <div className="g-tiles quatro letras centro c-larga">
              {SIGLA.map(l => (
                <div key={l.t} className="g-tile">
                  <span className="g-tile-l">{l.l === '>' ? <span className="marca-chev" aria-hidden="true"><Chevron /></span> : l.l}</span>
                  <span className="g-tile-t">{l.t}</span>
                </div>
              ))}
            </div>
            <div className="c">
              <div className="g-acoes">
                <Link href="/sobre" className="acao">Quem somos <IcSeta /></Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------- 03 · SERVIR
          Título, uma linha, um botão, e as áreas com foto real saídas do
          banco. Os passos e a nota saíram: cada área explica o caminho. */}
      <section id="areas" className="casa-papel rev">
        <div className="g g-secao">
          <div className="g-cab">
            <div className="g-cab-txt">
              <p className="g-rot">Servir</p>
              <Tit className="g-h2">A igreja não é o prédio</Tit>
              <p className="g-ed">São pessoas que chegaram mais cedo.</p>
            </div>
            <div className="g-acoes">
              <Link href="/servir" className="acao cheia">Ver todas as áreas <IcSeta /></Link>
            </div>
          </div>

          {fase === 'carregando' && <AreasCarregando />}
          {fase === 'rede' && (
            <p className="g-corpo c" style={{ textAlign: 'center' }}>
              Não consegui carregar as áreas agora. Atualize a página.
            </p>
          )}
          {fase === 'pronto' && !mins.length && (
            <p className="g-corpo c" style={{ textAlign: 'center' }}>
              As áreas aparecem aqui assim que a liderança abrir as vagas.
            </p>
          )}
          <div className="casa-areas centro">
            {mins.map(m => (
              <Link key={m.slug} href={`/servir/${m.slug}`} className="casa-area corte">
                <img src={fotoDaArea(m.slug)} alt="" loading="lazy" />
                <span className="casa-area-nome">{m.nome}</span>
                {m.descricao && <p className="casa-area-desc">{m.descricao}</p>}
                <span className="casa-area-selo">
                  {m.postos} {m.postos === 1 ? 'posto' : 'postos'}
                  {!m.aberto && ' · conversa antes'}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- FECHO */}
      <section className="g-cheio centro fecho rev">
        <img src={cria('fecho')} alt={criaAlt('fecho')} loading="lazy" decoding="async" />
        <div className="g">
          <p className="g-rot">Sempre cabe mais um</p>
          <Tit className="g-h2">{num ? `${pl(num.pessoas, 'Hoje é', 'Hoje são')} ${cont(num.pessoas, 'pessoa servindo', 'pessoas servindo')} em ${cont(num.ministerios, 'área', 'áreas')}.` : 'Ninguém aqui começou sabendo.'}</Tit>
          <div className="g-acoes">
            <Link href="/servir" className="acao cheia">Encontrar minha área <IcSeta /></Link>
            <Link href="/eu" className="acao">Já sirvo · abrir meu espaço</Link>
          </div>
        </div>
      </section>
      </main>

      <Rodape />

    </div>
  );
}
