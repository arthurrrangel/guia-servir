'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { sbPublico as sb } from '@/lib/supabase';
import { IcSeta } from '@/components/Icones';
import { Chevron } from '@/components/Marca';
import { Schema } from '@/components/Texto';
import Movimento from '@/components/Movimento';
import { Barra, Rodape } from '@/components/Site';
import { IGREJA, SITE, MAPA as MAPA_SCHEMA, SIGLA_FRASE } from '@/lib/igreja';
import Abertura from '@/components/Abertura';
import { PEQUENAS_GUIAS } from '@/lib/pequenas-guias';
import { pl, cont } from '@/lib/plural';
import { Criativo } from '@/components/Criativo';
import { Agora } from '@/components/Agora';
import { Semana } from '@/components/Semana';
import { Cidade } from '@/components/Cidade';
import { PorDentro } from '@/components/PorDentro';

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
        '@type': 'Church',
        name: IGREJA.nomeLegal,
        alternateName: 'GUIA',
        url: SITE,
        address: { '@type': 'PostalAddress', streetAddress: IGREJA.rua, addressLocality: IGREJA.cidade, addressRegion: IGREJA.uf, postalCode: IGREJA.cep, addressCountry: 'BR' },
        hasMap: MAPA_SCHEMA,
        openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: 'Sunday', opens: '10:00', closes: '12:00' }],
        sameAs: [IGREJA.instagram],
        slogan: IGREJA.frase,
      }} />
      <div className="progresso" ref={fio} style={{ color: solida ? 'var(--noite)' : '#fff' }} aria-hidden="true" />

      <a href="#conteudo" className="pular">Pular para o conteúdo</a>
      <Barra inicio solida={solida} />

      <main id="conteudo" style={{ maxWidth: 'none', margin: 0, padding: 0 }}>

      {/* ================================================================ AGORA
          A primeira tela fala no presente: a próxima coisa que acontece na
          igreja, calculada no aparelho (components/Agora.tsx), a frase da
          casa e UMA ação — a certa para aquele momento. O criativo do herói
          fica atrás, quando existir; até lá, o painel da marca. */}
      <section className="agora casa-escuro rev visto">
        <Criativo id="heroi" fundo prioridade />
        <div className="agora-in">
          {/* o chevron da marca em traço, no espaço que sobra acima do texto:
              no celular ele ocupa o que o texto deixa (nunca cruza o título),
              no monitor mora na coluna da direita */}
          <div className="agora-selo" aria-hidden="true"><Chevron traco /></div>
          <p className="g-rot agora-rot">{IGREJA.nome} · {IGREJA.bairro}</p>
          <Tit as="h1" className="agora-h1">Existe um lugar para você</Tit>
          <Agora />
        </div>
      </section>

      {/* ============================================================== A SEMANA
          Sete colunas: o ritmo da igreja numa olhada. Cada coluna é uma porta. */}
      <section id="semana" className="semana casa-papel rev">
        <div className="g g-secao">
          <div className="g-cab">
            <div className="g-cab-txt">
              <p className="g-rot">A semana</p>
              <Tit className="g-h2">Toda semana tem lugar</Tit>
              <p className="g-ed">Culto no domingo, grupos de terça a quinta, Follow no sábado.</p>
            </div>
          </div>
          <Semana />
        </div>
      </section>

      {/* ============================================================ OS CAMINHOS
          Três portas, em tipo grande. Não são cartões: são três frases que a
          pessoa reconhece como a dela. O número em itálica editorial é a voz
          de índice do site; o chevron da marca aponta o caminho. */}
      <section className="caminhos casa-escuro rev" aria-label="Por onde entrar">
        <div className="g">
          <Link href="/cultos" className="caminho">
            <span className="caminho-n">01</span>
            <span className="caminho-txt">
              <span className="caminho-t">Visitar no domingo</span>
              <span className="caminho-d">{IGREJA.cultoHora}, na {IGREJA.bairro}. Chegue como você está.</span>
            </span>
            <span className="caminho-chev" aria-hidden="true"><Chevron /></span>
          </Link>
          <Link href="/pequena-guia" className="caminho">
            <span className="caminho-n">02</span>
            <span className="caminho-txt">
              <span className="caminho-t">Um grupo perto de você</span>
              <span className="caminho-d">{cont(PEQUENAS_GUIAS.length, 'Pequena Guia', 'Pequenas Guias')} durante a semana, em casa e por vídeo.</span>
            </span>
            <span className="caminho-chev" aria-hidden="true"><Chevron /></span>
          </Link>
          <Link href="/servir" className="caminho">
            <span className="caminho-n">03</span>
            <span className="caminho-txt">
              <span className="caminho-t">Servir com a gente</span>
              <span className="caminho-d">{num ? `${cont(num.ministerios, 'área', 'áreas')}, ${cont(num.pessoas, 'pessoa', 'pessoas')} chegando mais cedo.` : 'Cinco áreas. Ninguém aqui começou sabendo.'}</span>
            </span>
            <span className="caminho-chev" aria-hidden="true"><Chevron /></span>
          </Link>
        </div>
      </section>

      {/* ============================================================== A CIDADE
          O mapa como espinha: a igreja e os grupos espalhados pelo Rio, e o
          botão que responde à única pergunta de quem olha um mapa. */}
      <section id="cidade" className="cidade-secao casa-papel rev">
        <div className="g g-secao">
          <div className="g-cab">
            <div className="g-cab-txt">
              <p className="g-rot">Na cidade</p>
              <Tit className="g-h2">A GUIA está espalhada pelo Rio</Tit>
              <p className="g-ed">{cont(PEQUENAS_GUIAS.filter(g => g.coord).length, 'grupo', 'grupos')} em {cont(new Set(PEQUENAS_GUIAS.filter(g => g.coord).map(g => g.bairro)).size, 'bairro', 'bairros')}, e o culto na {IGREJA.bairro}.</p>
            </div>
          </div>
          <Cidade />
        </div>
      </section>

      {/* =================================================== UM DOMINGO POR DENTRO
          As áreas apresentadas pelo domingo, momento a momento, com a equipe
          que faz cada um acontecer. O fio à esquerda anda com a rolagem. */}
      <section id="areas" className="por-dentro casa-escuro rev">
        <div className="g g-secao">
          <div className="g-cab">
            <div className="g-cab-txt">
              <p className="g-rot">Um domingo por dentro</p>
              <Tit className="g-h2">Quem chega antes de você</Tit>
              <p className="g-ed">Cada momento do culto tem uma equipe. E lugar para mais uma pessoa.</p>
            </div>
            <div className="g-acoes">
              <Link href="/servir" className="acao cheia">Ver todas as áreas <IcSeta /></Link>
            </div>
          </div>
          <div className="por-dentro-corpo">
            <PorDentro mins={mins} fase={fase} />
            <Criativo id="domingo" className="por-dentro-cria" />
          </div>
        </div>
      </section>

      {/* ================================================================ FECHO */}
      <section className="fecho-v3 casa-escuro rev">
        <Criativo id="fecho" fundo />
        <div className="g">
          <p className="g-rot">Sempre cabe mais um</p>
          <Tit className="g-h2">{num ? `${pl(num.pessoas, 'Hoje é', 'Hoje são')} ${cont(num.pessoas, 'pessoa servindo', 'pessoas servindo')} em ${cont(num.ministerios, 'área', 'áreas')}.` : 'Ninguém aqui começou sabendo.'}</Tit>
          <p className="g-ed fecho-sigla">{SIGLA_FRASE}.</p>
          <div className="g-acoes">
            <Link href="/servir" className="acao cheia">Encontrar minha área <IcSeta /></Link>
            <Link href="/eu" className="g-link claro">Já sirvo · abrir meu espaço</Link>
          </div>
        </div>
      </section>
      </main>

      <Rodape />

    </div>
  );
}
