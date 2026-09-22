'use client';
/* O PERFIL · migração 94.

   Quem sou, o que posso, os meus dados, e sair.

   A pessoa muda o NOME, o WHATSAPP e a FUNÇÃO. Papel, setor e e-mail não
   se mudam daqui, e a tela diz isso em uma linha em vez de esconder: quem
   procura onde trocar de setor precisa saber com quem falar. Isso não é
   enfeite de interface, é o banco: `dem_perfil` tem a lista de chaves
   FECHADA e recusa a chamada inteira se vier `papel`, `setor_id`, `ativo`
   ou qualquer outra coisa (CAMPO_NAO_PERMITIDO). É o ataque "usuário
   tentando alterar o próprio papel para admin", e a conferência da 94 o
   executa.

   O que a pessoa PODE é pedir outro papel. O pedido fica anotado e quem
   decide é a administração; até lá nada muda. */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Casca, { useEu } from '@/components/demandas/Casca';
import { Aviso, Campo, Pill } from '@/components/demandas/Ui';
import { esquecerToken, perfil } from '@/lib/demandas/api';
import { PAPEIS, PERMISSOES, dataCheia, recadoDoErro, rotPapel, soDigitos, telDoBanco, telVisivel } from '@/lib/demandas/regras';
import { sb } from '@/lib/supabase';
import type { Eu } from '@/lib/demandas/tipos';

export default function Pagina() {
  return <Casca><Perfil /></Casca>;
}

function Perfil() {
  const ctx = useEu();
  const eu = ctx.eu;
  const [nome, setNome] = useState('');
  const [tel, setTel] = useState('');
  const [funcao, setFuncao] = useState('');
  const [indo, setIndo] = useState(false);
  const [msg, setMsg] = useState<{ tom: 'ok' | 'bad'; t: string } | null>(null);

  useEffect(() => {
    if (!eu) return;
    setNome(eu.nome || ''); setTel(telVisivel(eu.telefone)); setFuncao(eu.funcao || '');
  }, [eu]);

  if (!eu) return null;

  async function salvar(d: Parameters<typeof perfil>[0], feito: string) {
    setIndo(true); setMsg(null);
    const r = await perfil(d);
    setIndo(false);
    if (!r.ok) { setMsg({ tom: 'bad', t: recadoDoErro(r, 'salvar') }); return; }
    ctx.ajustarEu?.(r as unknown as Partial<Eu>);
    setMsg({ tom: 'ok', t: feito });
  }

  async function sair() {
    esquecerToken();
    try { await sb()?.auth.signOut(); } catch { /* sem sessão, já está fora */ }
    location.href = '/demandas/entrar';
  }

  const mudou = nome.trim() !== (eu.nome || '') || telDoBanco(tel) !== telDoBanco(eu.telefone)
    || funcao.trim() !== (eu.funcao || '');
  /* o que dá para pedir: o próximo passo do lado de quem pede (líder) e o de
     quem atende (equipe). Gestão e administração não se pedem por aqui: são
     designadas por quem administra. */
  const podePedir = (['lider', 'responsavel'] as const).filter(p => p !== eu.papel)
    .filter(() => eu.papel === 'solicitante' || eu.papel === 'lider' || eu.papel === 'responsavel');

  return (
    <>
      <div className="dm-rot">{'>'} perfil</div>
      <h1 style={{ margin: '6px 0 var(--dm-e1)' }}>{eu.nome}</h1>
      <div className="dm-quem" style={{ marginBottom: 'var(--dm-e3)' }}>
        <Pill>{rotPapel(eu.papel)}</Pill>
        {eu.setor ? <span>{eu.setor}</span> : null}
        {eu.criado_em ? <span>desde {dataCheia(eu.criado_em.slice(0, 10))}</span> : null}
      </div>
      {msg ? <Aviso tom={msg.tom}>{msg.t}</Aviso> : null}

      <div className="dm-card">
        <h3 style={{ marginBottom: 'var(--dm-e1)' }}>O que você pode</h3>
        <p className="dm-peq dm-mudo" style={{ marginBottom: 'var(--dm-e1)' }}>
          {PAPEIS.find(p => p.v === eu.papel)?.explica}
        </p>
        <ul className="dm-pode">
          {(eu.permissoes || []).map(k => <li key={k}>{PERMISSOES[k] ?? k}</li>)}
        </ul>
        {eu.papel === 'gestor' && !eu.escopo_total && eu.escopo?.length ? (
          <p className="dm-peq dm-mudo" style={{ marginTop: 'var(--dm-e1)' }}>
            Setores que você acompanha: {eu.escopo.join(', ')}.
          </p>
        ) : null}
      </div>

      <div className="dm-card">
        <h3 style={{ marginBottom: 'var(--dm-e2)' }}>Seus dados</h3>
        <Campo rot="Nome">
          <input value={nome} autoComplete="name" onChange={e => setNome(e.target.value)} />
        </Campo>
        <Campo rot="WhatsApp" ajuda="Com DDD. É por ele que a equipe fala com você.">
          <input inputMode="tel" autoComplete="tel" value={tel} onChange={e => setTel(e.target.value)} />
        </Campo>
        <Campo rot="Função" ajuda="O que você faz. Exemplo: baterista, designer, recepção.">
          <input value={funcao} maxLength={80} onChange={e => setFuncao(e.target.value)} />
        </Campo>
        <p className="dm-peq dm-mudo" style={{ marginBottom: 'var(--dm-e2)' }}>
          E-mail: <b>{eu.email || 'sem e-mail'}</b>. Setor, papel e e-mail quem muda é a administração.
        </p>
        <button className="dm-btn dm-pri dm-larga" disabled={indo || !mudou || !nome.trim()}
          onClick={() => salvar({ nome: nome.trim(), telefone: soDigitos(tel), funcao: funcao.trim() }, 'Dados salvos.')}>
          Salvar
        </button>
      </div>

      {eu.papel_pedido ? (
        <div className="dm-card">
          <h3 style={{ marginBottom: 6 }}>Pedido de papel</h3>
          <p className="dm-peq dm-mudo" style={{ marginBottom: 'var(--dm-e2)' }}>
            Você pediu para atuar como <b>{rotPapel(eu.papel_pedido)}</b>. A administração decide.
          </p>
          <button className="dm-btn dm-larga" disabled={indo}
            onClick={() => salvar({ papel_pedido: '' }, 'Pedido cancelado.')}>Cancelar pedido</button>
        </div>
      ) : podePedir.length ? (
        <div className="dm-card">
          <h3 style={{ marginBottom: 6 }}>Pedir outro papel</h3>
          <p className="dm-peq dm-mudo" style={{ marginBottom: 'var(--dm-e2)' }}>
            A administração confirma. Até lá, nada muda.
          </p>
          <div className="dm-grade">
            {podePedir.map(p => (
              <button key={p} className="dm-btn" disabled={indo}
                onClick={() => salvar({ papel_pedido: p }, 'Pedido enviado para a administração.')}>
                {/* as mesmas palavras do cadastro, e curtas o bastante para
                    uma linha em 320px */}
                {p === 'lider' ? 'Lidero um ministério' : 'Atendo demandas'}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {eu.papel === 'admin' ? (
        <div className="dm-card">
          <div className="dm-entre">
            <div>
              <h3>Administração</h3>
              <p className="dm-peq dm-mudo" style={{ marginTop: 2 }}>Pessoas, setores e categorias.</p>
            </div>
            <Link className="dm-btn" href="/demandas/admin">Abrir</Link>
          </div>
        </div>
      ) : null}

      <button className="dm-btn dm-larga" style={{ marginTop: 'var(--dm-e2)' }} onClick={sair}>Sair</button>
    </>
  );
}
