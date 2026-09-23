'use client';
/* A ADMINISTRAÇÃO · migração 94.

   Separada da interface comum, com topo próprio (a faixa escura de
   `Casca admin`), e com quatro seções: Pessoas, Setores, Categorias e
   Anexos (a lista de sites aceitos, migração 95).

   PESSOAS é a base central que o pedido cobrou: "uma pessoa deve existir uma
   única vez na base". A lista mostra todo mundo, ativo e inativo, com papel,
   setor e função; cada linha abre a ficha da pessoa, onde se edita, muda o
   papel, define o escopo, desativa e se lê o histórico. Os pedidos de papel
   (quem se cadastrou e disse "sou líder" ou "atendo demandas") ficam no topo,
   porque são a única coisa daqui que alguém está esperando.

   Nada disto é segurança: `dem_pessoas`, `dem_pessoa` e `dem_ajustar`
   respondem SO_ADMIN para qualquer outro papel, com ou sem esta tela. */

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Casca, { useEu } from '@/components/demandas/Casca';
import { Categorias, Setores } from '@/components/demandas/Configuracao';
import { Aviso, Campo, Esqueleto, Pill, Vazio } from '@/components/demandas/Ui';
import { ajustar, ajustarAnexos, bases, pessoas } from '@/lib/demandas/api';
import { PAPEIS, nomeDoSite, recadoDoErro, rotPapel } from '@/lib/demandas/regras';
import type { Bases, Membro, RegraDeAnexo } from '@/lib/demandas/tipos';

export default function Pagina() {
  /* `useSearchParams` na casca e aqui pede o Suspense na pré-renderização */
  return <Suspense fallback={null}><Casca admin><Administracao /></Casca></Suspense>;
}

type Secao = 'pessoas' | 'setores' | 'categorias' | 'anexos';
const SECOES: [Secao, string][] = [
  ['pessoas', 'Pessoas'], ['setores', 'Setores'], ['categorias', 'Categorias'], ['anexos', 'Anexos'],
];

function Administracao() {
  const ctx = useEu();
  const eu = ctx.eu;
  const [b, setB] = useState<Bases | null>(null);
  const [ms, setMs] = useState<Membro[] | null>(null);
  const busca = useSearchParams();
  /* a seção vem da URL: as abas da faixa preta são links, e "Portal" também.
     Fora da lista, fica em Pessoas. */
  const pedida = busca?.get('secao') as Secao | null;
  const secao: Secao = pedida && SECOES.some(([v]) => v === pedida) ? pedida : 'pessoas';
  const [erro, setErro] = useState('');
  const [indo, setIndo] = useState(false);

  const recarregar = useCallback(async () => {
    const [x, p] = await Promise.all([bases(), pessoas()]);
    /* o erro de cada chamada aparece: sem isto a tela ficava em esqueleto
       eterno quando uma das duas falhava (a mesma armadilha que os Ajustes
       antigos pagaram em 20/09) */
    if (x.ok) setB({ setores: x.setores, categorias: x.categorias, anexos: x.anexos });
    else setErro(recadoDoErro(x, 'carregar os setores'));
    if (p.ok) setMs(p.membros); else setErro(recadoDoErro(p, 'carregar as pessoas'));
  }, []);
  useEffect(() => { if (eu?.papel === 'admin') recarregar(); }, [eu, recarregar]);

  async function salvar(o: 'setor' | 'categoria', d: Record<string, unknown>) {
    setIndo(true); setErro('');
    const r = await ajustar(o, d);
    setIndo(false);
    if (!r.ok) { setErro(recadoDoErro(r, 'salvar')); return false; }
    await recarregar();
    return true;
  }

  if (erro && (!b || !ms)) {
    return (
      <>
        <div className="dm-rot">{'>'} administração</div>
        <Aviso tom="bad">{erro}</Aviso>
        <button className="dm-btn" onClick={() => { setErro(''); recarregar(); }}
          style={{ marginTop: 'var(--dm-e2)' }}>Tentar de novo</button>
      </>
    );
  }
  if (!b || !ms) return <Esqueleto />;

  const ativas = ms.filter(m => m.ativo !== false).length, inativas = ms.filter(m => m.ativo === false).length;
  return (
    <>
      <div className="dm-cab">
        <div>
          <div className="dm-rot">{'>'} administração · {SECOES.find(([v]) => v === secao)?.[1].toLowerCase()}</div>
          <h1 style={{ marginTop: 4 }}>{SECOES.find(([v]) => v === secao)?.[1]}</h1>
          {secao === 'pessoas' ? (
            <p className="dm-peq dm-mudo" style={{ margin: '6px 0 0' }}>
              {/* "1 ativa", e não "1 ativas": visto em produção, com a base de uma pessoa só */}
              {contar(ativas, 'ativa', 'ativas')} · {contar(inativas, 'inativa', 'inativas')}
            </p>
          ) : null}
        </div>
        {secao === 'pessoas' ? (
          <div className="dm-cab-acoes">
            <Link className="dm-btn dm-pri" href="/demandas/admin/pessoas/nova">Nova pessoa</Link>
          </div>
        ) : null}
      </div>
      {erro ? <Aviso tom="bad">{erro}</Aviso> : null}

      {secao === 'pessoas' ? <Pessoas ms={ms} b={b} recarregar={recarregar} /> : null}
      {secao === 'setores' ? <Setores b={b} indo={indo} salvar={salvar} /> : null}
      {secao === 'categorias' ? <Categorias b={b} indo={indo} salvar={salvar} /> : null}
      {secao === 'anexos'
        ? <Anexos regra={b.anexos} trocar={anexos => setB(x => (x ? { ...x, anexos } : x))}
            toast={ctx.toast} />
        : null}
    </>
  );
}

/* ------------------------------------------------------------------ anexos

   A LISTA DE SITES · migração 95. Ligada, só entra anexo de site da lista (e
   dos subdomínios dele); quem pede vê a lista antes de colar o link. O banco
   limpa o que se cola (`https://www.site.com/x` vira `site.com`) e recusa
   o que não é site, o domínio de país inteiro e o site onde qualquer pessoa
   publica página. Tirar é reversível: o recado traz "Desfazer". */
function Anexos({ regra, trocar, toast }: {
  regra?: RegraDeAnexo; trocar: (r: RegraDeAnexo) => void;
  toast?: (t: { texto: string; desfazer?: () => void }) => void;
}) {
  const [site, setSite] = useState('');
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState('');
  const [feito, setFeito] = useState<{ txt: string; desfaz?: string } | null>(null);

  if (!regra) {
    return <Aviso tom="warn">A lista de sites chega com a atualização do banco. Recarregue daqui a pouco.</Aviso>;
  }

  async function pedir(d: { restrito?: boolean; incluir?: string; tirar?: string },
                       ok: { txt: string; desfaz?: string }) {
    setIndo(true); setErro(''); setFeito(null);
    const r = await ajustarAnexos(d);
    setIndo(false);
    if (!r.ok) {
      setErro(r.erro === 'SITE_ABERTO' && r.site
        ? `Em ${r.site} qualquer pessoa publica página. Inclua o endereço exato, como igreja.${r.site}.`
        : recadoDoErro(r, 'salvar'));
      return false;
    }
    trocar({ restrito: r.restrito, sites: r.sites });
    /* o sucesso vira toast (com Desfazer quando é tirar um site); sem toast
       (fora da casca, num teste), fica o aviso em linha */
    if (toast) {
      toast({ texto: ok.txt, desfazer: ok.desfaz ? () => { pedir({ incluir: ok.desfaz }, { txt: `${ok.desfaz} voltou para a lista.` }); } : undefined });
    } else setFeito(ok);
    return true;
  }

  return (
    <>
      {erro ? <Aviso tom="bad">{erro}</Aviso> : null}
      {feito ? (
        <Aviso tom="ok">
          <div className="dm-entre">
            <span>{feito.txt}</span>
            {feito.desfaz ? (
              <button type="button" className="dm-btn dm-mini" disabled={indo}
                onClick={() => pedir({ incluir: feito.desfaz }, { txt: `${feito.desfaz} voltou para a lista.` })}>
                Desfazer
              </button>
            ) : null}
          </div>
        </Aviso>
      ) : null}

      <div className="dm-card">
        <h3 style={{ marginBottom: 'var(--dm-e1)' }}>Quais links entram como anexo</h3>
        <div className="dm-seg" role="group" aria-label="Quais links entram como anexo">
          <button type="button" aria-pressed={!regra.restrito} disabled={indo}
            onClick={() => { if (regra.restrito) pedir({ restrito: false }, { txt: 'Qualquer site entra de novo.' }); }}>
            Qualquer site
          </button>
          <button type="button" aria-pressed={regra.restrito} disabled={indo}
            onClick={() => { if (!regra.restrito) pedir({ restrito: true }, { txt: 'Agora só entram os sites da lista.' }); }}>
            Só os da lista
          </button>
        </div>
        <p className="dm-peq dm-mudo" style={{ marginTop: 'var(--dm-e2)' }}>
          {regra.restrito
            ? 'Link de outro site é recusado, e quem pede vê os sites aceitos antes de colar.'
            : 'Qualquer link https entra como anexo.'}
        </p>
      </div>

      <form className="dm-card" onSubmit={async e => {
        e.preventDefault();
        const v = site.trim();
        if (!v) return;
        if (await pedir({ incluir: v }, { txt: 'Site incluído.' })) setSite('');
      }}>
        <Campo rot="Incluir site" ajuda="Pode colar o link inteiro: fica só o site. Vale também para os subdomínios dele.">
          <input value={site} placeholder="drive.google.com" inputMode="url" autoCapitalize="none"
            autoCorrect="off" spellCheck={false} onChange={e => setSite(e.target.value)} />
        </Campo>
        <button type="submit" className="dm-btn dm-pri" disabled={indo || !site.trim()}>Incluir</button>
      </form>

      <div className="dm-card">
        <h3 style={{ marginBottom: 'var(--dm-e1)' }}>{contar(regra.sites.length, 'site na lista', 'sites na lista')}</h3>
        {regra.sites.length === 0 ? (
          <Vazio titulo="Nenhum site na lista.">
            {regra.restrito ? 'Com a lista ligada e vazia, nenhum anexo entra.' : 'Inclua os sites antes de ligar a lista.'}
          </Vazio>
        ) : (
          <ul className="dm-sites">
            {regra.sites.map(x => (
              <li key={x}>
                <span className="dm-cresce">
                  {nomeDoSite(x) !== x ? <><b>{nomeDoSite(x)}</b> <span className="dm-mudo">{x}</span></> : <b>{x}</b>}
                </span>
                <button type="button" className="dm-btn dm-mini" disabled={indo}
                  aria-label={`Tirar ${x} da lista`}
                  onClick={() => pedir({ tirar: x }, { txt: `${x} saiu da lista.`, desfaz: x })}>Tirar</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

const contar = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/* ------------------------------------------------------------------ pessoas */
function Pessoas({ ms, b, recarregar }: { ms: Membro[]; b: Bases; recarregar: () => Promise<void> }) {
  const [busca, setBusca] = useState('');
  const [situ, setSitu] = useState<'ativas' | 'inativas' | 'todas'>('ativas');
  const [papel, setPapel] = useState('');
  const [setor, setSetor] = useState('');
  const nomeSetor = (id: string | null) => b.setores.find(s => s.id === id)?.nome || 'sem setor';

  const pedidos = ms.filter(m => m.ativo !== false && m.papel_pedido);
  const vistas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const soDig = t.replace(/\D/g, '');
    return ms.filter(m =>
      (situ === 'todas' || (situ === 'ativas' ? m.ativo !== false : m.ativo === false))
      && (!papel || m.papel === papel)
      && (!setor || m.setor_id === setor)
      && (!t || m.nome.toLowerCase().includes(t)
          || (m.auth_email || '').includes(t) || (m.email || '').includes(t)
          || (!!soDig && soDig.length >= 4 && (m.telefone || '').includes(soDig))));
  }, [ms, busca, situ, papel, setor]);

  return (
    <>
      {pedidos.length ? <Pedidos pedidos={pedidos} nomeSetor={nomeSetor} recarregar={recarregar} /> : null}

      {/* os filtros numa linha só: situação, papel, setor e a busca */}
      <div className="dm-ferramentas">
        <div className="dm-seg" role="group" aria-label="Situação">
          {([['ativas', 'Ativas'], ['inativas', 'Inativas'], ['todas', 'Todas']] as const).map(([v, r]) => (
            <button key={v} type="button" aria-pressed={situ === v} onClick={() => setSitu(v)}>{r}</button>
          ))}
        </div>
        <div className="dm-ferramentas-dir">
          <select aria-label="Papel" value={papel} onChange={e => setPapel(e.target.value)} className="dm-filtro">
            <option value="">Todos os papéis</option>
            {PAPEIS.map(p => <option key={p.v} value={p.v}>{p.rot}</option>)}
          </select>
          <select aria-label="Setor" value={setor} onChange={e => setSetor(e.target.value)} className="dm-filtro">
            <option value="">Todos os setores</option>
            {b.setores.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
          <label className="dm-busca dm-aberta">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
              <path d="M11 11l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <input type="search" aria-label="Procurar pessoa" placeholder="Nome, e-mail, telefone"
              value={busca} onChange={e => setBusca(e.target.value)} />
          </label>
        </div>
      </div>

      {vistas.length === 0 ? (
        <Vazio titulo="Ninguém com esse filtro." tom="filtro">
          Tire um filtro, ou cadastre a pessoa.
          {busca || papel || setor || situ !== 'ativas' ? (
            <div style={{ marginTop: 'var(--dm-e2)' }}>
              <button type="button" className="dm-btn dm-mini"
                onClick={() => { setBusca(''); setPapel(''); setSetor(''); setSitu('ativas'); }}>Tirar os filtros</button>
            </div>
          ) : null}
        </Vazio>
      ) : (
        <div className="dm-pessoas">
          <div className="dm-pessoa dm-pessoas-cab" aria-hidden="true">
            <span className="dm-p-nome">Nome</span>
            <span className="dm-p-papel">Papel</span>
            <span className="dm-p-setor">Setor</span>
            <span className="dm-p-funcao">Função</span>
            <span className="dm-p-email">E-mail</span>
          </div>
          {vistas.map(m => (
            <Link key={m.id} href={`/demandas/admin/pessoas/${m.id}`}
              className={m.ativo === false ? 'dm-pessoa dm-inativa' : 'dm-pessoa'}>
              <span className="dm-p-nome"><b>{m.nome}</b>{m.origem === 'cadastro' ? <small className="dm-mudo"> · cadastro próprio</small> : null}</span>
              <span className="dm-p-papel">
                <Pill>{rotPapel(m.papel)}</Pill>
                {m.ativo === false ? <Pill tom="bad">Inativa</Pill> : null}
                {m.papel_pedido ? <Pill tom="info">Pediu {rotPapel(m.papel_pedido)}</Pill> : null}
              </span>
              <span className="dm-p-setor">{nomeSetor(m.setor_id)}</span>
              <span className="dm-p-funcao">{m.funcao || ''}</span>
              <span className="dm-p-email">{m.auth_email || m.email || 'sem e-mail'}</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

/* OS PEDIDOS DE PAPEL: quem se cadastrou dizendo que lidera um ministério ou
   que atende demandas. A pessoa já usa o sistema como Membro; o que espera
   aqui é só o papel maior, e ele só vem com um toque do administrador. */
function Pedidos({ pedidos, nomeSetor, recarregar }: {
  pedidos: Membro[]; nomeSetor: (id: string | null) => string; recarregar: () => Promise<void>;
}) {
  const [indo, setIndo] = useState('');
  const [erro, setErro] = useState('');
  async function decidir(m: Membro, decisao: 'aceitar' | 'recusar') {
    setIndo(m.id); setErro('');
    const r = await ajustar('pedido', { id: m.id, decisao });
    setIndo('');
    if (!r.ok) {
      setErro(r.erro === 'SETOR_NAO_ATENDE'
        ? `${m.nome.split(' ')[0]} está num setor que não atende demandas. Abra a ficha e acerte o setor antes de aceitar.`
        : recadoDoErro(r, 'decidir o pedido'));
      return;
    }
    await recarregar();
  }
  return (
    <div className="dm-card dm-precisa">
      <h3 style={{ marginBottom: 'var(--dm-e1)' }}>Pedidos de papel<span className="dm-selo">{pedidos.length}</span></h3>
      {erro ? <Aviso tom="bad">{erro}</Aviso> : null}
      <div className="dm-fila">
        {pedidos.map(m => (
          <div key={m.id} className="dm-pessoa">
            <div className="dm-item-topo">
              <Link className="dm-item-tit dm-cresce" href={`/demandas/admin/pessoas/${m.id}`}>{m.nome}</Link>
            </div>
            <div className="dm-item-baixo" style={{ marginBottom: 'var(--dm-e1)' }}>
              <Pill tom="info">Quer ser {rotPapel(m.papel_pedido)}</Pill>
              <span>{nomeSetor(m.setor_id)}</span>
              {m.funcao ? <span>{m.funcao}</span> : null}
            </div>
            <div className="dm-linha">
              <button className="dm-btn dm-pri" disabled={!!indo} onClick={() => decidir(m, 'aceitar')}>Aceitar</button>
              <button className="dm-btn dm-txt" disabled={!!indo} onClick={() => decidir(m, 'recusar')}>Recusar</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
