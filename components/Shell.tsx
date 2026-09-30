'use client';
import { useEffect, useState, createContext, useContext, useCallback, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { sb, lerCredenciais, gravarCredenciais } from '@/lib/supabase';
import { carregarEstado } from '@/lib/db';
import { Equipe, listarEquipes, souLider } from '@/lib/equipes';
import { Estado, estadoVazio, cultosAte, hojeISO, resumoDia } from '@/lib/engine';
import { Painel as NumPainel, painelDoMinisterio } from '@/lib/candidaturas';
import { aviseHumano } from '@/lib/erros';
import { IcAjustes, IcCalendario, IcCheck, IcEntrada, IcMais, IcPainel, IcPessoa, IcSair, IcSeta, IcTime } from './Icones';
import { Aviso, Esqueleto } from './escalas/Pecas';
import { Logo } from './Marca';
import './escalas/escalas.css';
import './escalas/tela-painel.css';
import './escalas/tela-escala.css';
import './escalas/tela-time.css';
import './escalas/tela-ajustes.css';

type Ctx = {
  S: Estado; recarregar: () => Promise<Estado | null>;
  /* PINTA A MUDANÇA NA HORA — otimização de percepção (fase 18).
     As ações do líder mutam o Estado em memória e só então gravam. Antes, a
     tela só refletia a mudança quando `recarregar()` voltava do servidor: um
     clique em "confirmou" ficava ~1s parado antes do ✓ aparecer. `pinta()`
     troca a referência do Estado e renderiza o que a ação já calculou —
     instantâneo. A gravação segue por baixo; se falhar, o snapshot reverte. */
  pinta: () => void;
  aviso: (t: string) => void; base: string;
  equipe: Equipe | null; equipes: Equipe[]; trocarEquipe: (id: string, lista?: Equipe[]) => void;
  recarregarEquipes: () => Promise<Equipe[]>;
  /* AS CONTAS DO QUE ESPERA POR VOCÊ (30/09/2026). Uma leitura só do banco
     (`painel_ministerio`, contagens), feita pela casca porque é ela que
     desenha os selos da navegação; o /painel usa a mesma, em vez de pedir de
     novo. `null` com `numsFalhou` falso é "ainda carregando". */
  nums: NumPainel | null; numsFalhou: boolean;
};
const C = createContext<Ctx>(null as any);
export const useApp = () => useContext(C);

/* A ORDEM É A DO TRABALHO (30/09/2026): o que espera por mim, a escala, as
   pessoas, quem está chegando, e os ajustes por último. Entradas ficava em
   segundo, com o mesmo ícone do Time; agora tem o seu (a pessoa com o "+") e
   um selo com quantas pessoas esperam resposta, que é o que a fazia merecer
   o segundo lugar. */
const ABAS = [
  { href: '/painel', rotulo: 'Painel', Ic: IcPainel },
  { href: '/escala', rotulo: 'Escala', Ic: IcCalendario },
  { href: '/time', rotulo: 'Time', Ic: IcTime },
  { href: '/painel/candidaturas', rotulo: 'Entradas', Ic: IcEntrada },
  { href: '/ajustes', rotulo: 'Ajustes', Ic: IcAjustes },
];
/* a aba acesa também nas telas de dentro: /time/conferir é do Time,
   /ajustes/ministerios é de Ajustes. Antes as duas deixavam a navegação sem
   nenhuma aba marcada, e a pessoa não sabia onde estava. */
const abaDe = (caminho: string) =>
  caminho.startsWith('/painel/candidaturas') ? '/painel/candidaturas'
  : caminho.startsWith('/time') ? '/time'
  : caminho.startsWith('/ajustes') ? '/ajustes'
  : caminho.startsWith('/escala') ? '/escala'
  : caminho.startsWith('/painel') ? '/painel' : '';
const K_EQUIPE = 'escala.equipe';

/* O LÍDER QUE TAMBÉM SERVE.
   Dois dos quatro organizadores da GUIA servem numa área além de organizar.
   Até aqui eles entravam por e-mail no painel e por um link com token no
   próprio espaço, como se fossem duas pessoas. `meu_link()` devolve os
   vínculos de quem está logado, e só os dela: sessão autenticada é prova de
   identidade mais forte que um token em URL, então ela pode pedir o próprio
   link. Ver o §6 da migração 33. */
type MeuVinculo = { slug: string; equipe: string; token: string };

/* ============================================================================
   CACHE ENTRE NAVEGAÇÕES — velocidade percebida (fase 18)

   Cada tela do líder (/painel, /escala, /time…) montava o Shell do zero, e o
   Shell mora DENTRO de cada página, não num layout compartilhado. Resultado:
   toda troca de aba desmontava tudo e refazia o cold start inteiro — sessão,
   lista de equipes, estado completo (~4 idas ao banco) — mostrando o esqueleto
   de novo, toda vez. Medido: a barra do topo remontava e o esqueleto voltava a
   cada clique de aba.

   Estas variáveis vivem no MÓDULO, não no componente: sobrevivem à remontagem
   durante a navegação SPA (só um reload de página inteira as zera). Na volta a
   uma aba, o Shell nasce já com o último estado daquela equipe e pinta na hora;
   a revalidação (recarregar) segue por baixo e atualiza sem piscar. É o padrão
   stale-while-revalidate: mostra o que tem, confirma com o servidor depois.

   Não substitui a persistência real: o localStorage guarda a equipe ativa entre
   reloads; isto guarda o ESTADO entre abas na mesma sessão de navegador. */
const _cacheEstado = new Map<string, Estado>();
const _cacheNums = new Map<string, NumPainel>();
let _cacheEquipes: Equipe[] = [];
let _cacheAtiva = '';
let _cacheConta = '';

export default function Shell({ children }: { children: React.ReactNode }) {
  /* 'sem-carga' (82): a carga FRIA falhou. Sem esta fase, o Shell seguia para
     'pronto' com `estadoVazio()`, e a tela do líder escrevia "Ainda não tem
     time" para um ministério com doze pessoas no banco. Ver o bloco em
     `recarregar`. */
  const [fase, setFase] = useState<'carregando' | 'sem-conexao' | 'sem-login' | 'sem-acesso' | 'sem-equipe' | 'sem-carga' | 'pronto'>(
    _cacheAtiva && _cacheEstado.has(_cacheAtiva) ? 'pronto' : 'carregando');
  const [erroCarga, setErroCarga] = useState('');
  const [S, setS] = useState<Estado>(() => _cacheEstado.get(_cacheAtiva) || estadoVazio());
  const [equipes, setEquipes] = useState<Equipe[]>(_cacheEquipes);
  const [equipeId, setEquipeId] = useState<string>(_cacheAtiva);
  const [msg, setMsg] = useState('');
  const [base, setBase] = useState('');
  const [menuAberto, setMenuAberto] = useState(false);
  /* o menu nasce ao lado do botão que o abriu: a lateral (desktop) ou o topo
     (celular). Desenhar nos dois lugares punha dois `#menu-equipes` na página. */
  const [menuLugar, setMenuLugar] = useState<'lateral' | 'topo'>('lateral');
  const btnTopo = useRef<HTMLButtonElement>(null);
  const caminho = usePathname();
  const router = useRouter();
  const btnSeletor = useRef<HTMLButtonElement>(null);
  const menuLugarRef = useRef<'lateral' | 'topo'>('lateral');
  const fecharMenu = useCallback(() => {
    setMenuAberto(false);
    (menuLugarRef.current === 'topo' ? btnTopo : btnSeletor).current?.focus();
  }, []);
  /* refs nascem alinhadas ao cache: se voltamos a uma aba com estado guardado,
     `recarregar()` já sabe qual equipe revalidar sem esperar o efeito. */
  const idAtivo = useRef(_cacheAtiva);
  const nomeAtivo = useRef(_cacheEquipes.find(e => e.id === _cacheAtiva)?.nome || '');
  const seq = useRef(0);          // descarta resposta fora de ordem da MESMA equipe
  const [meus, setMeus] = useState<MeuVinculo[]>([]);
  const [conta, setConta] = useState(_cacheConta);
  const [nums, setNums] = useState<NumPainel | null>(() => _cacheNums.get(_cacheAtiva) || null);
  const [numsFalhou, setNumsFalhou] = useState(false);
  const seqNums = useRef(0);
  /* as contas andam por fora da carga do Estado: falhar aqui não derruba a
     tela, só deixa os selos sem número (e o /painel diz que não conseguiu). */
  const lerNums = useCallback((id: string) => {
    if (!id) return;
    const meu = ++seqNums.current;
    void painelDoMinisterio(id)
      .then(r => { if (idAtivo.current !== id || seqNums.current !== meu) return; if (r) _cacheNums.set(id, r); setNums(r); setNumsFalhou(false); })
      .catch(() => { if (idAtivo.current !== id || seqNums.current !== meu) return; setNumsFalhou(true); });
  }, []);

  /* 16/09/2026: o aviso durava 2,2s para qualquer texto. "Recado salvo" cabe
     nisso; uma recusa do banco com nome e motivo, não. Agora dura o tempo de
     ler: uns 45ms por caractere, entre 2,2s e 8s. Um aviso novo substitui o
     anterior e zera o relógio, senão o timer do curto apagava o longo. */
  const relogioAviso = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aviso = useCallback((t: string) => {
    setMsg(t);
    if (relogioAviso.current) clearTimeout(relogioAviso.current);
    relogioAviso.current = setTimeout(() => setMsg(''), Math.min(8000, Math.max(2200, 900 + t.length * 45)));
  }, []);
  /* nova referência do mesmo Estado: força o React a repintar com o que a ação
     acabou de mudar em memória, sem esperar o servidor. */
  const pinta = useCallback(() => setS(s => ({ ...s })), []);
  /* a última falha de carga, em texto já humano. Existe porque `aviso()` é
     passageiro e a carga fria precisa de algo que fique. */
  const falhaDaCarga = useRef('');

  /* IMPORTANTE: entre o await e o setS, o líder pode ter trocado de ministério.
     Sem revalidar, o estado da equipe A caía dentro da equipe B — e o próximo
     "adicionar pessoa" gravava em B usando os ids de funções de A. */
  const recarregar = useCallback(async () => {
    const id = idAtivo.current;
    if (!id) return null;
    const meu = ++seq.current;
    lerNums(id);
    try {
      const est = await carregarEstado(id, nomeAtivo.current);
      if (idAtivo.current !== id || seq.current !== meu) return null;   // chegou tarde: ignora
      setS(est);
      _cacheEstado.set(id, est);   // guarda para a próxima volta a esta aba
      return est;
    } catch (e: any) {
      if (idAtivo.current !== id) return null;
      if (String(e?.message || e).includes('JWT') || e?.code === 'PGRST301') setFase('sem-login');
      else {
        /* 82 · a falha fica REGISTRADA, e não só piscando.

           `aviso()` some sozinho em 2,2 a 8 segundos (a conta está logo
           acima). Numa RECARGA isso basta: a tela anterior continua na frente
           do usuário e ele sabe que algo não atualizou. Na carga FRIA não
           basta, porque não há tela anterior — o `S` continua sendo
           `estadoVazio()` e, oito segundos depois, não sobra nenhuma pista.

           Medido em 21/09, com três falhas reais (5xx do PostgREST em
           `funcoes`, leitura cortada em `cultos`, RLS em `habilidades`):

             fase da tela ....... 'pronto'
             Estado que sobra ... voluntarios=0 funcoes=0 escalas=0
             /time escreve ...... "Ainda não tem time"
                                  "Sem saber quem sabe fazer o quê, não existe rodízio"
             /escala escreve .... "Time vazio. Cadastre as pessoas na aba Time"
             o seletor do topo .. "Louvor · 0"
             e o aviso some em .. 4,6 a 8 segundos

           Palavra por palavra a tela de um ministério recém-criado, com as
           doze pessoas intactas no banco. `app/equipe/[slug]/Lista.tsx` já
           tinha nomeado e consertado esta classe ("vazio e falha eram o mesmo
           desenho"); o Shell não foi junto.

           O erro fica aqui, e quem chama decide: recarga mostra o aviso
           passageiro, carga fria vira a fase 'sem-carga'. */
        falhaDaCarga.current = aviseHumano(e, 'carregar esta tela');
        aviso(falhaDaCarga.current);
      }
      return null;
    }
  }, [aviso, lerNums]);

  const recarregarEquipes = useCallback(async () => {
    const lista = await listarEquipes();
    setEquipes(lista);
    _cacheEquipes = lista;
    return lista;
  }, []);

  /* Trocar de ministério só conclui se o carregamento deu certo. Antes, uma
     falha de rede deixava a tela dizendo "Louvor" com os dados da Mídia. */
  const trocarEquipe = useCallback((id: string, lista?: Equipe[]) => {
    const antesId = idAtivo.current, antesNome = nomeAtivo.current;
    const fonte = lista || equipes;
    idAtivo.current = id; _cacheAtiva = id;
    nomeAtivo.current = fonte.find(e => e.id === id)?.nome || '';
    setEquipeId(id); setMenuAberto(false);
    try { localStorage.setItem(K_EQUIPE, id); } catch {}
    /* se este ministério já foi aberto nesta sessão, pinta o estado guardado na
       hora e revalida por baixo — trocar de equipe também fica instantâneo na
       segunda visita. Só a primeira vez mostra o esqueleto. */
    const guardado = _cacheEstado.get(id);
    setNums(_cacheNums.get(id) || null); setNumsFalhou(false);
    if (guardado) { setS(guardado); setFase('pronto'); } else setFase('carregando');
    /* O .catch NÃO É ZELO — sem ele isto trava a tela. `setFase('carregando')`
       já rodou; se `recarregar()` REJEITAR (a internet caiu no meio da troca,
       e aí o fetch lança em vez de devolver {error}), nada mais mexe na fase e
       o líder fica olhando o carregando para sempre, sem mensagem e sem saída.
       Voltar era o único gesto. Falha e recusa terminam no mesmo lugar: volta
       para o ministério de antes e diz o que houve. */
    const voltarAtras = () => {
      if (idAtivo.current !== id) return;                 // outra troca assumiu
      idAtivo.current = antesId; _cacheAtiva = antesId; nomeAtivo.current = antesNome;
      setEquipeId(antesId);
      try { if (antesId) localStorage.setItem(K_EQUIPE, antesId); } catch {}
      setFase(antesId ? 'pronto' : 'sem-equipe');
      aviso('Não consegui abrir esse ministério. Tente de novo.');
    };
    void recarregar()
      .then(est => { if (est) setFase('pronto'); else voltarAtras(); })
      .catch(voltarAtras);
  }, [recarregar, equipes, aviso]);

  useEffect(() => {
    setBase(window.location.origin);
    /* Harness de design. O import é DINÂMICO de propósito: com import estático
       o webpack não conseguia provar que o módulo era inalcançável e os nomes
       de fixture ("Malu Caffaro") acabaram dentro do bundle de produção. Dentro
       de um ramo que o NODE_ENV zera em build, o import dinâmico some inteiro. */
    if (process.env.NODE_ENV === 'development'
        && new URLSearchParams(window.location.search).has('demo')) {
      void import('@/lib/demo').then(({ estadoDemo, equipesDemo }) => {
        idAtivo.current = 'demo'; _cacheAtiva = 'demo'; nomeAtivo.current = 'Mídia';
        /* CINCO MINISTÉRIOS, NÃO UM. 05/09/2026.
           Este harness declarava uma equipe só, e por isso três telas nunca
           desenhavam o caso real: /ajustes/ministerios com uma linha, o menu
           do seletor com um item, e o bloco "O domingo da igreja" do /painel
           sem desenhar nada (ele só existe para quem organiza mais de uma).
           Foi por esse buraco que passou o defeito do nome colado — quem pegou
           foi uma captura de tela do Arthur, não a varredura.

           A ativa continua sendo a Mídia porque estadoDemo() é a Mídia. Trocar
           de ministério no demo cai no carregamento real e falha: o harness
           mede desenho, não navegação. */
        const eqs = equipesDemo();
        const est = estadoDemo();
        setEquipes(eqs); _cacheEquipes = eqs;
        setEquipeId('demo');
        setS(est); _cacheEstado.set('demo', est); setFase('pronto');
        setConta('lider@exemplo.com');
        lerNums('demo');
      });
      return;
    }
    const c = lerCredenciais();
    if (!c) { setFase('sem-conexao'); return; }
    const s = sb();
    if (!s) { setFase('sem-conexao'); return; }
    let vivo = true;
    const entrar = (temSessao: boolean) => {
      if (!vivo) return;
      if (!temSessao) { setFase('sem-login'); return; }
      setTimeout(async () => {
        if (!vivo) return;
        try {
          /* PERFORMANCE (fase 18): uma volta ao banco a menos no cold start.
             listarEquipes já vem filtrado por RLS — só devolve o que a pessoa
             lidera. Lista não-vazia ⇒ é líder, e o souLider() (uma ida inteira
             ao banco, no caminho de TODO login normal) fica de fora. Só o caso
             vazio, que é raro, ainda precisa dele — para separar "sem acesso"
             de "líder sem nenhuma equipe". */
          const lista = await recarregarEquipes();
          if (!vivo) return;
          if (!lista.length) {
            const lider = await souLider().catch(() => false);
            if (!vivo) return;
            setFase(lider ? 'sem-equipe' : 'sem-acesso');
            return;
          }
          let alvo = '';
          try { alvo = localStorage.getItem(K_EQUIPE) || ''; } catch {}
          if (!lista.some(e => e.id === alvo)) alvo = lista[0].id;
          idAtivo.current = alvo; _cacheAtiva = alvo;
          nomeAtivo.current = lista.find(e => e.id === alvo)?.nome || '';
          setEquipeId(alvo);
          falhaDaCarga.current = '';
          const carregou = await recarregar();
          if (!vivo) return;
          if (!carregou && falhaDaCarga.current) {
            /* 82 · carga fria falhou: NÃO segue para 'pronto' com o estado
               vazio. Ver o bloco em `recarregar`. */
            setErroCarga(falhaDaCarga.current);
            setFase('sem-carga');
            return;
          }
          setFase('pronto');
          /* os vínculos da própria pessoa. Falha aqui não atrapalha nada: é
             um atalho a mais, não um requisito da tela. O erro vem no objeto
             de resposta do supabase-js, não como rejeição, então não há
             .catch a acrescentar: basta não confiar no data. */
          const { data: meusDados } = await s.rpc('meu_link');
          if (vivo && (meusDados as any)?.ok) {
            setMeus(((meusDados as any).links || []) as MeuVinculo[]);
          }
        } catch (e: any) {
          if (String(e?.message || e).includes('JWT')) setFase('sem-login');
          else if (vivo) aviso(aviseHumano(e));
        }
      }, 0);
    };
    /* o .catch não é decoração: sem ele, uma falha de rede aqui deixava
       `entrar` sem ser chamado nunca e o app parado no estado inicial, sem
       erro e sem tela de login. Falhar decidindo "não tem sessão" leva a
       pessoa para o login, que é a saída certa. */
    /* o e-mail de quem entrou mora no pé da lateral: "quem sou" é a segunda
       pergunta de quem usa mais de uma conta no mesmo navegador */
    const guardarConta = (email?: string | null) => { _cacheConta = email || ''; setConta(email || ''); };
    s.auth.getSession()
      .then(({ data }) => { guardarConta(data.session?.user?.email); entrar(!!data.session); })
      .catch(() => entrar(false))
      .catch(() => entrar(false));
    const { data: sub } = s.auth.onAuthStateChange((_e, sess) => { guardarConta(sess?.user?.email); entrar(!!sess); });
    return () => { vivo = false; sub.subscription.unsubscribe(); };
  }, [recarregar, recarregarEquipes, aviso, lerNums]);

  /* Esc fecha o menu e devolve o foco ao botão — sem isso, quem navega por
     teclado abre a lista de ministérios e não tem como sair dela. */
  useEffect(() => {
    if (!menuAberto) return;
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') fecharMenu(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuAberto, fecharMenu]);

  /* A CASCA VAZIA. Carregando, a lateral e o corpo já nascem no lugar: o
     conteúdo chega por dentro, sem a página pular de uma coluna para duas. */
  const cascaVazia = (miolo: React.ReactNode) => (
    <div className="es es-casca">
      <aside className="es-lateral" aria-hidden="true">
        <div className="es-lateral-topo">
          <span className="es-marca"><Logo className="es-logo" /></span>
        </div>
      </aside>
      <header className="es-topo">
        <span className="es-marca"><Logo className="es-logo" /></span>
      </header>
      <main className="es-corpo">{miolo}</main>
    </div>
  );
  const sair = async () => { await sb()!.auth.signOut(); location.href = '/entrar'; };

  if (fase === 'carregando') return cascaVazia(<Esqueleto />);
  if (fase === 'sem-conexao') return cascaVazia(<Conexao aoSalvar={() => location.reload()} />);
  if (fase === 'sem-login') { if (caminho !== '/entrar') router.replace('/entrar'); return cascaVazia(<Esqueleto />); }
  if (fase === 'sem-acesso') return cascaVazia(
    <div className="es-estado">
      <h1>Este e-mail não tem acesso</h1>
      <p>Você entrou, mas este e-mail não está na lista de quem organiza. Peça para quem administra liberar o seu e-mail.</p>
      <div><button className="es-btn es-pri" onClick={sair}>Sair e trocar de conta</button></div>
    </div>
  );
  if (fase === 'sem-equipe') return cascaVazia(<PrimeiraEquipe aoCriar={async (id) => { const l = await recarregarEquipes(); trocarEquipe(id, l); }} />);
  /* 82 · a carga falhou, e isto NÃO é "não tem nada". A diferença entre as
     duas é a diferença entre "cadastre seu time" e "seu time está lá, eu é
     que não consegui ler". */
  if (fase === 'sem-carga') return cascaVazia(
    <div className="es-estado">
      <h1>Não consegui carregar</h1>
      <p>{erroCarga}</p>
      <p>Seus dados continuam no lugar. Isto é uma falha de leitura, não um ministério vazio.</p>
      <div><button className="es-btn es-pri" onClick={() => location.reload()}>Tentar de novo</button></div>
    </div>
  );

  const equipe = equipes.find(e => e.id === equipeId) || null;
  const ativa = abaDe(caminho);
  const nPessoas = S.voluntarios.filter(v => v.ativo).length;

  /* OS SELOS DA NAVEGAÇÃO. Dois, e só onde a espera tem prazo:
       Escala    postos do PRÓXIMO culto sem gente de pé (sem ninguém,
                 furou, não pode). É o que vira buraco no domingo.
       Entradas  pessoas que se ofereceram e esperam resposta.
     Conferir nível e disponibilidade não entram: "nada ali trava o
     domingo", e selo em tudo é selo em nada. */
  const prox = cultosAte(hojeISO(), 8)[0];
  const diaProx = prox ? S.escalas[prox] : null;
  const montado = !!diaProx && Object.values(diaProx.slots || {}).some((x: any) => x?.vid);
  const rProx = montado && prox ? resumoDia(S, prox) : null;
  const nEscala = rProx ? rProx.vagas.length + rProx.furos + rProx.recusados : 0;
  const nEntradas = nums ? (nums.candidaturas_novas || 0) + (nums.aguardando_conversa || 0) : 0;
  const selo: Record<string, { n: number; rot: string }> = {
    '/escala': { n: nEscala, rot: nEscala === 1 ? '1 posto do próximo culto sem gente de pé' : `${nEscala} postos do próximo culto sem gente de pé` },
    '/painel/candidaturas': { n: nEntradas, rot: nEntradas === 1 ? '1 pessoa esperando resposta' : `${nEntradas} pessoas esperando resposta` },
  };
  const navItens = ABAS.map(a => ({ ...a, on: ativa === a.href, selo: selo[a.href] }));

  const menu = menuAberto && (
    <>
      <div className="es-menu-fundo" onClick={fecharMenu} />
      <div className="es-menu" id="menu-equipes" role="menu" aria-label="Ministérios">
        <div className="es-menu-grupo">Ministérios</div>
        {equipes.map(e => (
          <button key={e.id} role="menuitem" className="es-menu-item"
            aria-current={e.id === equipeId ? 'true' : undefined} onClick={() => trocarEquipe(e.id)}>
            <span>{e.nome}</span>{e.id === equipeId && <IcCheck />}
          </button>
        ))}
        <Link href="/ajustes/ministerios" role="menuitem" className="es-menu-item es-mudo" onClick={() => setMenuAberto(false)}>
          <span>Novo ministério</span><IcMais />
        </Link>
        {/* MESMA PESSOA, MESMO PRODUTO. Quem organiza e também serve acha o
            próprio espaço aqui, onde já está, e não só no link do WhatsApp. */}
        {meus.length > 0 && (
          <>
            <div className="es-menu-risco" />
            <div className="es-menu-grupo">Onde eu sirvo</div>
            {meus.map(v => (
              <a key={v.slug} role="menuitem" className="es-menu-item" href={`/eu/${v.token}`}>
                <span>Meu espaço na {v.equipe}</span><IcPessoa />
              </a>
            ))}
          </>
        )}
        <div className="es-menu-risco es-so-celular" />
        <button role="menuitem" className="es-menu-item es-mudo es-so-celular" onClick={sair}>
          <span>Sair</span><IcSair />
        </button>
      </div>
    </>
  );
  const troca = (topo: boolean) => (
    <button ref={topo ? btnTopo : btnSeletor} className={`es-troca${topo ? ' es-troca-topo' : ''}`}
      onClick={() => {
        const lugar = topo ? 'topo' : 'lateral';
        menuLugarRef.current = lugar; setMenuLugar(lugar);
        setMenuAberto(v => !(v && menuLugar === lugar));
      }}
      aria-expanded={menuAberto && menuLugar === (topo ? 'topo' : 'lateral')} aria-controls="menu-equipes"
      aria-label={`Ministério: ${equipe?.nome || 'nenhum'}, ${nPessoas} ${nPessoas === 1 ? 'pessoa' : 'pessoas'}. Trocar`}>
      <span className="es-troca-txt">
        <b>{equipe?.nome || 'Ministério'}</b>
        <small>{nPessoas} {nPessoas === 1 ? 'pessoa' : 'pessoas'}</small>
      </span>
      <IcSeta />
    </button>
  );

  return (
    <C.Provider value={{ S, recarregar, pinta, aviso, base, equipe, equipes, trocarEquipe, recarregarEquipes, nums, numsFalhou }}>
      {/* A CASCA. É contêiner nu de propósito: sem transform, filter nem
          overflow, que quebrariam o `position:fixed` da lateral e das abas e
          o `sticky` do topo. `.es` é onde nascem os tokens desta folha. */}
      <div className="es es-casca">
        <aside className="es-lateral" aria-label="Navegação">
          <div className="es-lateral-topo">
            <Link href="/painel" className="es-marca" aria-label="GUIA Church, ir para o painel">
              <Logo className="es-logo" />
            </Link>
          </div>
          <div className="es-ministerio">
            {troca(false)}
            {menuLugar === 'lateral' && menu}
          </div>
          <nav className="es-nav" aria-label="Seções">
            {navItens.map(a => (
              <Link key={a.href} href={a.href} className="es-nav-item" aria-current={a.on ? 'page' : undefined}>
                <a.Ic /><span>{a.rotulo}</span>
                {a.selo?.n ? <span className="es-nav-n" aria-label={a.selo.rot}>{a.selo.n > 99 ? '99+' : a.selo.n}</span> : null}
              </Link>
            ))}
          </nav>
          <div className="es-lateral-pe">
            {meus.map(v => (
              <a key={v.slug} className="es-nav-item" href={`/eu/${v.token}`}>
                <IcPessoa /><span>Meu espaço na {v.equipe}</span>
              </a>
            ))}
            <button className="es-nav-item" onClick={sair}><IcSair /><span>Sair</span></button>
            {conta && <div className="es-conta" title={conta}>{conta}</div>}
          </div>
        </aside>

        <header className="es-topo">
          <Link href="/painel" className="es-marca" aria-label="GUIA Church, ir para o painel">
            <Logo className="es-logo" />
          </Link>
          <div className="es-ministerio">
            {troca(true)}
            {menuLugar === 'topo' && menu}
          </div>
        </header>

        <main className="es-corpo">{children}</main>

        <nav className="es-abas" aria-label="Seções">
          {navItens.map(a => (
            <Link key={a.href} href={a.href} className="es-aba" aria-current={a.on ? 'page' : undefined}>
              <a.Ic /><span>{a.rotulo}</span>
              {a.selo?.n ? <span className="es-aba-n" aria-label={a.selo.rot}>{a.selo.n > 99 ? '99+' : a.selo.n}</span> : null}
            </Link>
          ))}
        </nav>
        {msg && <div className="es-toast" role="status">{msg}</div>}
      </div>
    </C.Provider>
  );
}

function PrimeiraEquipe({ aoCriar }: { aoCriar: (id: string) => void }) {
  const [nome, setNome] = useState('');
  const [ocupado, setOcupado] = useState(false);
  /* o aviso fica na página, do lado do botão que falhou, e em português:
     o alert() do navegador cobria a tela e só oferecia "OK". */
  const [erro, setErro] = useState('');
  return (
    <div className="es-estado">
      <h1>Crie seu primeiro ministério</h1>
      <p>Cada ministério (Mídia, Louvor, Recepção) tem seu próprio time, funções e escala. Você pode criar quantos quiser.</p>
      <div className="es-caixa">
        <div className="es-caixa-corpo">
          <label className="es-campo" htmlFor="nt-nome">
            <span>Nome do ministério</span>
            <input className="es-ctl" id="nt-nome" value={nome} onChange={e => setNome(e.target.value)} placeholder="ex: Louvor" autoFocus />
          </label>
          {erro && <Aviso tom="bad">{erro}</Aviso>}
        </div>
        <div className="es-caixa-pe">
          <button className="es-btn es-pri" disabled={ocupado || !nome.trim()} onClick={async () => {
            setOcupado(true); setErro('');
            try { const { criarEquipe } = await import('@/lib/equipes'); const eq = await criarEquipe(nome.trim()); aoCriar(eq.id); }
            catch (e) { setErro(aviseHumano(e, 'criar o ministério')); setOcupado(false); }
          }}>Criar ministério</button>
        </div>
      </div>
    </div>
  );
}

export function Conexao({ aoSalvar }: { aoSalvar: () => void }) {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  return (
    <div className="es-estado">
      <h1>Conectar ao banco</h1>
      <p>Cole o endereço e a chave pública do seu projeto Supabase. Fica salvo neste aparelho.</p>
      <div className="es-caixa">
        <div className="es-caixa-corpo">
          <label className="es-campo" htmlFor="cfg-url">
            <span>URL do projeto</span>
            <input className="es-ctl" id="cfg-url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" />
          </label>
          <label className="es-campo" htmlFor="cfg-key">
            <span>Chave anon (pública)</span>
            <input className="es-ctl" id="cfg-key" value={key} onChange={e => setKey(e.target.value)} placeholder="eyJhbGciOi..." />
          </label>
        </div>
        <div className="es-caixa-pe">
          <button className="es-btn es-pri" disabled={!url || !key}
            onClick={() => { gravarCredenciais({ url: url.trim().replace(/\/$/, ''), key: key.trim() }); aoSalvar(); }}>
            Conectar
          </button>
        </div>
      </div>
    </div>
  );
}

export async function copiar(txt: string, aviso: (t: string) => void, rotulo = 'Copiado. É só colar no WhatsApp.') {
  try { await navigator.clipboard.writeText(txt); aviso(rotulo); return; } catch {}
  try {
    const ta = document.createElement('textarea');
    ta.value = txt; ta.readOnly = true;
    ta.style.position = 'fixed'; ta.style.left = '-9999px'; ta.style.top = '0';
    document.body.appendChild(ta); ta.select();
    const deuCerto = document.execCommand('copy');
    ta.remove();
    aviso(deuCerto ? rotulo : 'Não consegui copiar. Use "Ver a mensagem" e copie manualmente.');
  } catch { aviso('Não consegui copiar. Use "Ver a mensagem" e copie manualmente.'); }
}
