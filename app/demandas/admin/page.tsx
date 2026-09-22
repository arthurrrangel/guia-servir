'use client';
/* A ADMINISTRAÇÃO · migração 94.

   Separada da interface comum, com topo próprio (a faixa escura de
   `Casca admin`), e com três seções: Pessoas, Setores e Categorias.

   PESSOAS é a base central que o pedido cobrou: "uma pessoa deve existir uma
   única vez na base". A lista mostra todo mundo, ativo e inativo, com papel,
   setor e função; cada linha abre a ficha da pessoa, onde se edita, muda o
   papel, define o escopo, desativa e se lê o histórico. Os pedidos de papel
   (quem se cadastrou e disse "sou líder" ou "atendo demandas") ficam no topo,
   porque são a única coisa daqui que alguém está esperando.

   Nada disto é segurança: `dem_pessoas`, `dem_pessoa` e `dem_ajustar`
   respondem SO_ADMIN para qualquer outro papel, com ou sem esta tela. */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Casca, { useEu } from '@/components/demandas/Casca';
import { Categorias, Setores } from '@/components/demandas/Configuracao';
import { Aviso, Esqueleto, Pill, Vazio } from '@/components/demandas/Ui';
import { ajustar, bases, pessoas } from '@/lib/demandas/api';
import { PAPEIS, recadoDoErro, rotPapel } from '@/lib/demandas/regras';
import type { Bases, Membro } from '@/lib/demandas/tipos';

export default function Pagina() {
  return <Casca admin><Administracao /></Casca>;
}

type Secao = 'pessoas' | 'setores' | 'categorias';

function Administracao() {
  const { eu } = useEu();
  const [b, setB] = useState<Bases | null>(null);
  const [ms, setMs] = useState<Membro[] | null>(null);
  const [secao, setSecao] = useState<Secao>('pessoas');
  const [erro, setErro] = useState('');
  const [indo, setIndo] = useState(false);

  useEffect(() => {
    try {
      const s = new URLSearchParams(window.location.search).get('secao') as Secao | null;
      if (s === 'setores' || s === 'categorias' || s === 'pessoas') setSecao(s);
    } catch { /* fica em Pessoas */ }
  }, []);

  const recarregar = useCallback(async () => {
    const [x, p] = await Promise.all([bases(), pessoas()]);
    /* o erro de cada chamada aparece: sem isto a tela ficava em esqueleto
       eterno quando uma das duas falhava (a mesma armadilha que os Ajustes
       antigos pagaram em 20/09) */
    if (x.ok) setB({ setores: x.setores, categorias: x.categorias });
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

  return (
    <>
      <div className="dm-rot">{'>'} administração</div>
      <h1 style={{ margin: '6px 0 var(--dm-e3)' }}>
        {secao === 'pessoas' ? 'Pessoas' : secao === 'setores' ? 'Setores' : 'Categorias'}
      </h1>
      {erro ? <Aviso tom="bad">{erro}</Aviso> : null}

      <div className="dm-opcoes" role="group" aria-label="Seção" style={{ marginBottom: 'var(--dm-e3)' }}>
        {([['pessoas', 'Pessoas'], ['setores', 'Setores'], ['categorias', 'Categorias']] as const).map(([v, r]) => (
          <button key={v} type="button" aria-pressed={secao === v} onClick={() => setSecao(v)}>{r}</button>
        ))}
      </div>

      {secao === 'pessoas' ? <Pessoas ms={ms} b={b} recarregar={recarregar} /> : null}
      {secao === 'setores' ? <Setores b={b} indo={indo} salvar={salvar} /> : null}
      {secao === 'categorias' ? <Categorias b={b} indo={indo} salvar={salvar} /> : null}
    </>
  );
}

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
      <div className="dm-entre" style={{ marginBottom: 'var(--dm-e2)' }}>
        <p className="dm-peq dm-mudo">
          {ms.filter(m => m.ativo !== false).length} ativas · {ms.filter(m => m.ativo === false).length} inativas
        </p>
        <Link className="dm-btn dm-pri" href="/demandas/admin/pessoas/nova">Nova pessoa</Link>
      </div>

      {pedidos.length ? <Pedidos pedidos={pedidos} nomeSetor={nomeSetor} recarregar={recarregar} /> : null}

      <div className="dm-card">
        <div className="dm-seg" role="group" aria-label="Situação">
          {([['ativas', 'Ativas'], ['inativas', 'Inativas'], ['todas', 'Todas']] as const).map(([v, r]) => (
            <button key={v} type="button" aria-pressed={situ === v} onClick={() => setSitu(v)}>{r}</button>
          ))}
        </div>
        <div className="dm-dupla" style={{ marginTop: 'var(--dm-e2)', gap: 'var(--dm-e1)' }}>
          <select aria-label="Papel" value={papel} onChange={e => setPapel(e.target.value)} className="dm-filtro">
            <option value="">Todos os papéis</option>
            {PAPEIS.map(p => <option key={p.v} value={p.v}>{p.rot}</option>)}
          </select>
          <select aria-label="Setor" value={setor} onChange={e => setSetor(e.target.value)} className="dm-filtro">
            <option value="">Todos os setores</option>
            {b.setores.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </div>
        <label className="dm-busca">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
            <path d="M11 11l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input type="search" aria-label="Procurar pessoa" placeholder="Nome, e-mail, telefone"
            value={busca} onChange={e => setBusca(e.target.value)} />
        </label>
      </div>

      {vistas.length === 0 ? (
        <Vazio titulo="Ninguém com esse filtro.">Tire um filtro, ou cadastre a pessoa.</Vazio>
      ) : (
        <div className="dm-fila">
          {vistas.map(m => (
            <Link key={m.id} href={`/demandas/admin/pessoas/${m.id}`}
              className={m.ativo === false ? 'dm-pessoa dm-inativa' : 'dm-pessoa'}>
              <div className="dm-item-topo">
                <span className="dm-item-tit dm-cresce">{m.nome}</span>
              </div>
              <div className="dm-item-baixo">
                <Pill>{rotPapel(m.papel)}</Pill>
                {m.ativo === false ? <Pill tom="bad">Inativa</Pill> : null}
                {m.papel_pedido ? <Pill tom="info">Pediu {rotPapel(m.papel_pedido)}</Pill> : null}
                <span>{nomeSetor(m.setor_id)}</span>
                {m.funcao ? <span>{m.funcao}</span> : null}
                <span>{m.auth_email || m.email || 'sem e-mail'}</span>
                {m.origem === 'cadastro' ? <span>cadastro próprio</span> : null}
              </div>
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
            <div className="dm-grade" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <button className="dm-btn dm-pri" disabled={!!indo} onClick={() => decidir(m, 'aceitar')}>Aceitar</button>
              <button className="dm-btn" disabled={!!indo} onClick={() => decidir(m, 'recusar')}>Recusar</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
