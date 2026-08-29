'use client';
import { useEffect, useState, createContext, useContext, useCallback, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { sb, lerCredenciais, gravarCredenciais } from '@/lib/supabase';
import { carregarEstado } from '@/lib/db';
import { Equipe, listarEquipes, souLider } from '@/lib/equipes';
import { Estado, estadoVazio } from '@/lib/engine';
import { aviseHumano } from '@/lib/erros';
import { IcAjustes, IcCalendario, IcPainel, IcSair, IcSeta, IcTime } from './Icones';
import { Logo } from './Marca';
import { Aviso, Esqueleto } from './Ui';

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
};
const C = createContext<Ctx>(null as any);
export const useApp = () => useContext(C);

const ABAS = [
  { href: '/painel', rotulo: 'Painel', Ic: IcPainel },
  { href: '/painel/candidaturas', rotulo: 'Entradas', Ic: IcTime },
  { href: '/escala', rotulo: 'Escala', Ic: IcCalendario },
  { href: '/time', rotulo: 'Time', Ic: IcTime },
  { href: '/ajustes', rotulo: 'Ajustes', Ic: IcAjustes },
];
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
let _cacheEquipes: Equipe[] = [];
let _cacheAtiva = '';

export default function Shell({ children }: { children: React.ReactNode }) {
  const [fase, setFase] = useState<'carregando' | 'sem-conexao' | 'sem-login' | 'sem-acesso' | 'sem-equipe' | 'pronto'>(
    _cacheAtiva && _cacheEstado.has(_cacheAtiva) ? 'pronto' : 'carregando');
  const [S, setS] = useState<Estado>(() => _cacheEstado.get(_cacheAtiva) || estadoVazio());
  const [equipes, setEquipes] = useState<Equipe[]>(_cacheEquipes);
  const [equipeId, setEquipeId] = useState<string>(_cacheAtiva);
  const [msg, setMsg] = useState('');
  const [base, setBase] = useState('');
  const [menuAberto, setMenuAberto] = useState(false);
  const caminho = usePathname();
  const router = useRouter();
  const btnSeletor = useRef<HTMLButtonElement>(null);
  const fecharMenu = useCallback(() => { setMenuAberto(false); btnSeletor.current?.focus(); }, []);
  /* refs nascem alinhadas ao cache: se voltamos a uma aba com estado guardado,
     `recarregar()` já sabe qual equipe revalidar sem esperar o efeito. */
  const idAtivo = useRef(_cacheAtiva);
  const nomeAtivo = useRef(_cacheEquipes.find(e => e.id === _cacheAtiva)?.nome || '');
  const seq = useRef(0);          // descarta resposta fora de ordem da MESMA equipe
  const [meus, setMeus] = useState<MeuVinculo[]>([]);

  const aviso = useCallback((t: string) => { setMsg(t); setTimeout(() => setMsg(''), 2200); }, []);
  /* nova referência do mesmo Estado: força o React a repintar com o que a ação
     acabou de mudar em memória, sem esperar o servidor. */
  const pinta = useCallback(() => setS(s => ({ ...s })), []);

  /* IMPORTANTE: entre o await e o setS, o líder pode ter trocado de ministério.
     Sem revalidar, o estado da equipe A caía dentro da equipe B — e o próximo
     "adicionar pessoa" gravava em B usando os ids de funções de A. */
  const recarregar = useCallback(async () => {
    const id = idAtivo.current;
    if (!id) return null;
    const meu = ++seq.current;
    try {
      const est = await carregarEstado(id, nomeAtivo.current);
      if (idAtivo.current !== id || seq.current !== meu) return null;   // chegou tarde: ignora
      setS(est);
      _cacheEstado.set(id, est);   // guarda para a próxima volta a esta aba
      return est;
    } catch (e: any) {
      if (idAtivo.current !== id) return null;
      if (String(e?.message || e).includes('JWT') || e?.code === 'PGRST301') setFase('sem-login');
      else aviso(aviseHumano(e, 'carregar esta tela'));
      return null;
    }
  }, [aviso]);

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
      void import('@/lib/demo').then(({ estadoDemo }) => {
        idAtivo.current = 'demo'; _cacheAtiva = 'demo'; nomeAtivo.current = 'Mídia';
        const eqs = [{ id: 'demo', nome: 'Mídia', slug: 'midia', whatsapp_grupo: null, ordem: 1 } as any];
        const est = estadoDemo();
        setEquipes(eqs); _cacheEquipes = eqs;
        setEquipeId('demo');
        setS(est); _cacheEstado.set('demo', est); setFase('pronto');
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
          await recarregar();
          if (vivo) setFase('pronto');
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
    s.auth.getSession()
      .then(({ data }) => entrar(!!data.session))
      .catch(() => entrar(false))
      .catch(() => entrar(false));
    const { data: sub } = s.auth.onAuthStateChange((_e, sess) => entrar(!!sess));
    return () => { vivo = false; sub.subscription.unsubscribe(); };
  }, [recarregar, recarregarEquipes, aviso]);

  /* Esc fecha o menu e devolve o foco ao botão — sem isso, quem navega por
     teclado abre a lista de ministérios e não tem como sair dela. */
  useEffect(() => {
    if (!menuAberto) return;
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') fecharMenu(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuAberto]);

  if (fase === 'carregando') return <Esqueleto />;
  if (fase === 'sem-conexao') return <Conexao aoSalvar={() => location.reload()} />;
  if (fase === 'sem-login') { if (caminho !== '/entrar') router.replace('/entrar'); return <Esqueleto />; }
  if (fase === 'sem-acesso') return (
    <main style={{ maxWidth: 460, paddingTop: 80 }} className="centro">
      <h1>Este email não tem acesso</h1>
      <p className="dim" style={{ margin: '10px 0 20px' }}>
        Você entrou, mas este email não está na lista de organizadores. Peça para quem administra liberar seu email.
      </p>
      <button className="pri" onClick={async () => { await sb()!.auth.signOut(); location.href = '/entrar'; }}>Sair e trocar de conta</button>
    </main>
  );
  if (fase === 'sem-equipe') return <PrimeiraEquipe aoCriar={async (id) => { const l = await recarregarEquipes(); trocarEquipe(id, l); }} />;

  const equipe = equipes.find(e => e.id === equipeId) || null;
  const navItens = ABAS.map(a => ({ ...a, on: caminho === a.href }));

  return (
    <C.Provider value={{ S, recarregar, pinta, aviso, base, equipe, equipes, trocarEquipe, recarregarEquipes }}>
      <header className="topo">
        <div className="topo-in">
          <div className="marca">
            {/* a marca da igreja, a mesma do site público — não um ícone à
                parte. O seletor de equipe continua pendurado nela. */}
            <Logo className="logo" />
            <div className="marca-nome">
              <button ref={btnSeletor} className="seletor-equipe" onClick={() => setMenuAberto(v => !v)}
                aria-expanded={menuAberto} aria-haspopup="menu">
                <span className="seletor-nome">{equipe?.nome || 'Equipe'}</span>
                <span aria-hidden>·</span>
                <span>{(() => { const n = S.voluntarios.filter(v => v.ativo).length; return `${n}`; })()}</span>
                <IcSeta />
              </button>
            </div>
            {menuAberto && (
              <>
                <div className="menu-fundo" onClick={fecharMenu} />
                <div className="menu-equipes" role="menu">
                  {/* MESMA PESSOA, MESMO PRODUTO.
                      Quem organiza e também serve encontrava o próprio espaço
                      só se tivesse guardado o link do WhatsApp. Agora ele está
                      onde a pessoa já está, dentro do mesmo menu. */}
                  {meus.length > 0 && (
                    <>
                      <div className="overline" style={{ padding: '4px 12px 8px' }}>Onde eu sirvo</div>
                      {meus.map(v => (
                        <a key={v.slug} role="menuitem" className="menu-item" href={`/eu/${v.token}`}>
                          {v.equipe} · meu espaço
                        </a>
                      ))}
                      <div className="menu-risco" />
                    </>
                  )}
                  <div className="overline" style={{ padding: '4px 12px 8px' }}>Ministérios</div>
                  {equipes.map(e => (
                    <button key={e.id} role="menuitem" className={`menu-item ${e.id === equipeId ? 'on' : ''}`} onClick={() => trocarEquipe(e.id)}>
                      {e.nome}{e.id === equipeId && ' ✓'}
                    </button>
                  ))}
                  <Link href="/ajustes#equipes" role="menuitem" className="menu-item add" onClick={fecharMenu}>+ novo ministério</Link>
                </div>
              </>
            )}
          </div>
          <button className="mini fantasma" onClick={async () => { await sb()!.auth.signOut(); location.href = '/entrar'; }}>
            <IcSair /> sair
          </button>
        </div>
        <nav className="abas" aria-label="Seções">
          {navItens.map(a => (
            <Link key={a.href} href={a.href} className={a.on ? 'on' : ''} aria-current={a.on ? 'page' : undefined}>
              <a.Ic /> {a.rotulo}
            </Link>
          ))}
        </nav>
      </header>
      <main>{children}</main>
      <nav className="barra-fundo" aria-label="Seções">
        {navItens.map(a => (
          <Link key={a.href} href={a.href} className={a.on ? 'on' : ''} aria-current={a.on ? 'page' : undefined}>
            <a.Ic /> {a.rotulo}
          </Link>
        ))}
      </nav>
      {msg && <div className="toast" role="status">{msg}</div>}
    </C.Provider>
  );
}

function PrimeiraEquipe({ aoCriar }: { aoCriar: (id: string) => void }) {
  const [nome, setNome] = useState('');
  const [ocupado, setOcupado] = useState(false);
  /* Esta tela usava alert() do navegador para dar a notícia de que não deu
     certo. Modal do sistema operacional é o oposto do que a pessoa precisa
     num erro: ela cobre a tela, não diz o que fazer, e só oferece "OK" —
     que é justamente a palavra errada. O aviso agora fica na página, do
     lado do botão que falhou, e o texto vem em português. */
  const [erro, setErro] = useState('');
  return (
    <main style={{ maxWidth: 460, paddingTop: 70 }}>
      <h1>Crie seu primeiro ministério</h1>
      <p className="dim" style={{ margin: '8px 0 18px' }}>
        Cada ministério (Mídia, Louvor, Recepção…) tem seu próprio time, funções e escala. Você pode adicionar quantos quiser.
      </p>
      <div className="card">
        <label>Nome do ministério</label>
        <input value={nome} onChange={e => setNome(e.target.value)} placeholder="ex: Louvor" autoFocus />
        <div style={{ height: 14 }} />
        <button className="pri grande" disabled={ocupado || !nome.trim()} onClick={async () => {
          setOcupado(true); setErro('');
          try { const { criarEquipe } = await import('@/lib/equipes'); const eq = await criarEquipe(nome.trim()); aoCriar(eq.id); }
          catch (e) { setErro(aviseHumano(e, 'criar o ministério')); setOcupado(false); }
        }}>Criar ministério</button>
        {erro && <div style={{ marginTop: 14 }}><Aviso tom="erro">{erro}</Aviso></div>}
      </div>
    </main>
  );
}

export function Conexao({ aoSalvar }: { aoSalvar: () => void }) {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  return (
    <main style={{ maxWidth: 540, paddingTop: 60 }}>
      <h1>Conectar ao banco</h1>
      <p className="dim" style={{ marginTop: 8 }}>
        Cole o endereço e a chave pública do seu projeto Supabase. Fica salvo neste aparelho.
      </p>
      <div className="card">
        <label>URL do projeto</label>
        <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" />
        <div style={{ height: 12 }} />
        <label>Chave anon (public)</label>
        <input value={key} onChange={e => setKey(e.target.value)} placeholder="eyJhbGciOi..." />
        <div style={{ height: 14 }} />
        <button className="pri grande" disabled={!url || !key}
          onClick={() => { gravarCredenciais({ url: url.trim().replace(/\/$/, ''), key: key.trim() }); aoSalvar(); }}>
          Conectar
        </button>
      </div>
    </main>
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
