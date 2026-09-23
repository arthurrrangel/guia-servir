'use client';
/* O INÍCIO: O PORTAL DE QUEM PEDE · migração 94.

   Até a 93 esta tela era uma lista só, igual para todo mundo, com o título
   "O que a igreja está pedindo" e a aba "Tudo" aberta: para um membro do
   Louvor, isso era tudo que qualquer pessoa do Louvor tinha pedido. O pedido
   do Arthur, com as palavras dele: "ele não pode simplesmente abrir
   /demandas e enxergar toda a base".

   O recorte agora é do BANCO (`pode_ver` da 94). Esta tela só organiza o que
   volta, na ordem da pergunta que a pessoa faz ao abrir:

     quem sou ............. nome, papel, setor e função
     o que espera por mim . "Precisa de você": responder, confirmar, e, para
                            quem atende ou administra, o que espera do outro
                            lado (a fila, os pedidos de papel), no MESMO
                            cartão. Até 23/09 o cartão dizia "Nada esperando
                            você" para quem tinha três coisas esperando nos
                            cartões de baixo.
     o próximo passo ...... "Nova demanda", num lugar fixo por largura
     minhas demandas ...... em andamento, concluídas, histórico

   No desktop, a coluna da direita é leitura: o resumo em números e os três
   últimos avisos. No celular ela não existe: as abas já levam lá. */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import Casca, { useEu } from '@/components/demandas/Casca';
import Lista, { Fila } from '@/components/demandas/Lista';
import { Aviso, Esqueleto, Pill } from '@/components/demandas/Ui';
import { avisos, portal, type Aba } from '@/lib/demandas/api';
import { fraseDoEvento, quando, recadoDoErro, rotPapel } from '@/lib/demandas/regras';
import type { AvisoDentro, Eu, Portal } from '@/lib/demandas/tipos';

export default function Pagina() {
  return <Casca><Inicio /></Casca>;
}

function Inicio() {
  const ctx = useEu();
  const eu = ctx.eu;
  const [p, setP] = useState<Portal | null>(null);
  const [erro, setErro] = useState('');
  const [ultimos, setUltimos] = useState<AvisoDentro[] | null>(null);

  const carregar = useCallback(async () => {
    const r = await portal();
    /* `n` é conferido, e não só `ok`: um banco que ainda não tem a 94
       responde a função que não existe como SEM_SISTEMA, mas um dublê ou um
       proxy pode devolver `{ok:true}` vazio, e uma conta indefinida na tela
       seria "undefined esperando você". */
    if (!r.ok || !(r as unknown as Portal).n) {
      setErro(r.ok ? 'Não consegui carregar o que espera por você.' : recadoDoErro(r, 'carregar o início'));
      return;
    }
    setErro(''); setP(r as unknown as Portal);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  /* os três últimos avisos, para a coluna da direita do desktop. Sem marcar
     como vistos: quem marca é a tela de Avisos. Falha aqui não é erro de
     tela: a coluna simplesmente não aparece. */
  useEffect(() => {
    let vivo = true;
    avisos(false).then(r => { if (vivo) setUltimos(r.ok ? (r.itens || []).slice(0, 3) : []); });
    return () => { vivo = false; };
  }, []);

  /* o cadastro devolve a pessoa para cá com `?bemvindo=1`. A frase aparece
     uma vez, como toast, e o parâmetro sai da barra: recarregar não repete
     boas-vindas. */
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.get('bemvindo') === '1') {
        ctx.toast?.({ texto: 'Cadastro feito. Você já pode abrir demandas.' });
        u.searchParams.delete('bemvindo');
        window.history.replaceState(null, '', u.pathname + u.search + u.hash);
      }
    } catch { /* sem history: nada a fazer */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!eu) return null;
  const n = p?.n;
  const abas: { v: Aba; rot: string }[] = [{ v: 'minhas', rot: 'Minhas' }];
  if (eu.papel === 'lider') abas.push({ v: 'ministerio', rot: 'Ministério' });
  if ((n?.participo ?? 0) > 0) abas.push({ v: 'participo', rot: 'Acompanho' });
  const atende = eu.atende ?? eu.papel !== 'solicitante';
  const pendentesDoLado = p ? (p.precisa || []).length : 0;

  return (
    <>
      <div className="dm-cab">
        <div>
          <div className="dm-rot">{'>'} início</div>
          <h1 style={{ marginTop: 4 }}>Olá, {eu.primeiro_nome}</h1>
          <div className="dm-quem">
            <Pill>{rotPapel(eu.papel)}</Pill>
            {eu.setor ? <span>{eu.setor}</span> : null}
            {eu.funcao ? <span>{eu.funcao}</span> : null}
          </div>
        </div>
        <div className="dm-cab-acoes">
          <Link className="dm-btn dm-pri" href="/demandas/nova">Nova demanda</Link>
        </div>
      </div>

      {eu.papel_pedido ? (
        <Aviso tom="info">
          Seu pedido para atuar como <b>{rotPapel(eu.papel_pedido)}</b> está com a administração.
        </Aviso>
      ) : null}
      {erro ? (
        <>
          <Aviso tom="bad">{erro}</Aviso>
          <button className="dm-btn" style={{ marginBottom: 'var(--dm-e3)' }} onClick={carregar}>
            Tentar de novo
          </button>
        </>
      ) : null}

      <div className="dm-duas">
        <div>
          {!p && !erro ? <Esqueleto linhas={2} oQue="Carregando o que espera por você" /> : null}
          {p ? <Precisa p={p} eu={eu} atende={atende} /> : null}

          <div className="dm-entre" style={{ margin: 'var(--dm-e4) 0 var(--dm-e2)' }}>
            <h2>Minhas demandas</h2>
          </div>
          <Lista eu={eu} abas={abas} abaInicial="minhas"
            recortes={[
              /* "Abertas", e não "Em andamento": com três fatias em 320 e 360
                 a palavra não cabia na dela e encostava em "Concluídas" */
              { v: 'abertas', rot: 'Abertas' },
              { v: 'concluidas', rot: 'Concluídas' },
              { v: 'tudo', rot: 'Histórico' },
            ]}
            vazio={(aba, so) => vazioDoInicio(aba, so, pendentesDoLado)} />
          {p && atende ? <ContasNoCelular n={p.n} eu={eu} /> : null}
        </div>

        {/* a coluna da direita: leitura, só no desktop */}
        <aside className="dm-so-desktop" aria-label="Resumo">
          {p ? <Resumo n={p.n} eu={eu} atende={atende} /> : null}
          {ultimos && ultimos.length ? <Ultimos itens={ultimos} /> : null}
        </aside>
      </div>
    </>
  );
}

/* SEM "Abrir uma demanda" DENTRO DO AVISO: repetia o botão "Nova demanda" que
   está no topo da mesma tela, sempre à vista. E o vazio da lista fala com
   quem tem pendências em cima: "Nada em andamento" a 200px de "Precisa de
   você 3" lia-se como contradição. */
function vazioDoInicio(aba: Aba, so: string, pendentes: number): { titulo: string; dica?: React.ReactNode; tom?: 'bom' } {
  if (aba === 'participo') {
    return { titulo: 'Você não acompanha nenhuma demanda.',
             dica: 'Quem pede ou quem atende pode incluir você numa demanda.' };
  }
  if (aba === 'ministerio') {
    if (so === 'concluidas') return { titulo: 'Nada do ministério foi concluído ainda.' };
    if (so === 'tudo') return { titulo: 'O ministério ainda não pediu nada.' };
    return { titulo: 'O ministério não tem pedido em andamento.', dica: 'Quem pede em nome do ministério aparece aqui.' };
  }
  if (so === 'concluidas') return { titulo: 'Nenhum pedido seu foi concluído ainda.' };
  if (so === 'tudo') return { titulo: 'Você ainda não abriu nenhuma demanda.' };
  if (pendentes > 0) {
    return { titulo: 'Nada em andamento.',
             dica: `${pendentes === 1 ? 'A de cima espera' : `As ${pendentes} de cima esperam`} a sua resposta ou confirmação.`, tom: 'bom' };
  }
  return { titulo: 'Nenhuma demanda sua em andamento.', tom: 'bom' };
}

/* O QUE ESPERA POR VOCÊ, DE TODOS OS LADOS.

   As linhas vêm prontas do servidor (`espera_pedido` da 94): a demanda parou
   esperando uma resposta sua, ou ficou pronta esperando você dizer que
   resolveu. Para quem atende, entra a conta do outro lado ("5 esperando você
   em Atender"), e para quem administra, os pedidos de papel. Um cartão, um
   número, e a barra preta só quando há algo. */
function Precisa({ p, eu, atende }: { p: Portal; eu: Eu; atende: boolean }) {
  const itens = p.precisa || [];
  const agir = atende ? (p.n.agir || 0) : 0;
  const aprovar = atende ? (p.n.aprovar || 0) : 0;
  const pedidos = eu.papel === 'admin' ? (p.n.pedidos || 0) : 0;
  const total = itens.length + agir + pedidos;
  if (!total) {
    return (
      <div className="dm-card dm-quieto">
        <h3>Nada esperando você</h3>
        <p className="dm-peq dm-mudo" style={{ margin: '4px 0 0' }}>
          Quando uma demanda sua precisar de resposta ou de confirmação, ela aparece aqui.
        </p>
      </div>
    );
  }
  return (
    <div className="dm-card dm-precisa">
      <h3 style={{ marginBottom: 'var(--dm-e1)' }}>
        Precisa de você<span className="dm-selo">{total}</span>
      </h3>
      {itens.length ? <Fila itens={itens} eu={eu} /> : null}
      {agir || pedidos ? (
        <div className="dm-grade" style={{ marginTop: itens.length ? 'var(--dm-e2)' : 0 }}>
          {agir ? (
            <Link className="dm-item" href="/demandas/atendimento?ver=agir">
              <span className="dm-c-num">{agir}</span>
              <span className="dm-c-tit"><b>{agir === 1 ? 'demanda esperando você em Atender' : 'demandas esperando você em Atender'}</b>
                {aprovar ? <span className="dm-c-ctx">{aprovar} {aprovar === 1 ? 'espera aprovação' : 'esperam aprovação'}</span> : null}
              </span>
              <span className="dm-c-meta"><span className="dm-c-passo">Atender</span></span>
            </Link>
          ) : null}
          {pedidos ? (
            <Link className="dm-item" href="/demandas/admin">
              <span className="dm-c-num">{pedidos}</span>
              <span className="dm-c-tit"><b>{pedidos === 1 ? 'pedido de papel espera você' : 'pedidos de papel esperam você'}</b></span>
              <span className="dm-c-meta"><span className="dm-c-passo">Decidir</span></span>
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* AS CONTAS, EM LEITURA: números que também são a porta. */
function Resumo({ n, eu, atende }: { n: Portal['n']; eu: Eu; atende: boolean }) {
  return (
    <div className="dm-card">
      <h3>Resumo</h3>
      <div className="dm-contas dm-duas-colunas">
        <Link className={`dm-conta ${n.minhas_andamento ? '' : 'dm-zero'}`} href="/demandas"><b>{n.minhas_andamento}</b><small>{n.minhas_andamento === 1 ? 'sua em andamento' : 'suas em andamento'}</small></Link>
        <Link className={`dm-conta ${n.minhas_concluidas ? '' : 'dm-zero'}`} href="/demandas"><b>{n.minhas_concluidas}</b><small>{n.minhas_concluidas === 1 ? 'sua concluída' : 'suas concluídas'}</small></Link>
        {eu.papel === 'lider' ? <Link className={`dm-conta ${n.ministerio ? '' : 'dm-zero'}`} href="/demandas"><b>{n.ministerio}</b><small>do ministério</small></Link> : null}
        {n.participo ? <Link className="dm-conta" href="/demandas"><b>{n.participo}</b><small>{n.participo === 1 ? 'que você acompanha' : 'que você acompanha'}</small></Link> : null}
      </div>
      {atende ? (
        <>
          <div className="dm-entre" style={{ margin: 'var(--dm-e3) 0 var(--dm-e1)' }}>
            <h3 style={{ margin: 0 }}>Atendimento</h3>
            <Link className="dm-btn dm-txt" href="/demandas/atendimento">Abrir ›</Link>
          </div>
          <div className="dm-contas dm-duas-colunas">
            <Link className={`dm-conta ${n.agir ? '' : 'dm-zero'}`} href="/demandas/atendimento?ver=agir"><b>{n.agir}</b><small>esperando você</small></Link>
            <Link className={`dm-conta ${n.fila ? '' : 'dm-zero'}`} href="/demandas/atendimento?ver=fila"><b>{n.fila}</b><small>na fila, sem dono</small></Link>
            <Link className={`dm-conta ${n.comigo ? '' : 'dm-zero'}`} href="/demandas/atendimento?ver=comigo"><b>{n.comigo}</b><small>com você</small></Link>
            <Link className={`dm-conta ${n.atrasadas ? 'dm-bad' : 'dm-zero'}`} href="/demandas/atendimento?ver=atrasadas"><b>{n.atrasadas}</b><small>atrasadas</small></Link>
          </div>
        </>
      ) : null}
      {eu.papel === 'admin' ? (
        <div className="dm-entre" style={{ marginTop: 'var(--dm-e3)' }}>
          <div>
            <h3 style={{ margin: 0 }}>Administração</h3>
            <p className="dm-peq dm-mudo" style={{ margin: '2px 0 0' }}>
              {n.pedidos
                ? `${n.pedidos} ${n.pedidos === 1 ? 'pedido de papel espera' : 'pedidos de papel esperam'} você.`
                : 'Pessoas, setores e categorias.'}
            </p>
          </div>
          <Link className="dm-btn dm-txt" href="/demandas/admin">Abrir ›</Link>
        </div>
      ) : null}
    </div>
  );
}

function Ultimos({ itens }: { itens: AvisoDentro[] }) {
  return (
    <div className="dm-card">
      <div className="dm-entre" style={{ marginBottom: 'var(--dm-e1)' }}>
        <h3 style={{ margin: 0 }}>Últimos avisos</h3>
        <Link className="dm-btn dm-txt" href="/demandas/avisos">Ver todos ›</Link>
      </div>
      <ul className="dm-avisos">
        {itens.map((a, i) => (
          <li key={`${a.numero}-${a.em}-${i}`} className="dm-aviso-grupo">
            <Link href={`/demandas/d/${a.numero}`}>{fraseDoEvento(a)}</Link>
            <div className="dm-aviso-de">#{a.numero} {a.titulo} · {quando(a.em)}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* Contas de quem atende e a porta da administração no CELULAR: onde a
   coluna da direita não existe, elas ficam no fim do Início. Quem atende
   também tem a aba; quem administra chega pelo Perfil. Aqui é o atalho. */
function ContasNoCelular({ n, eu }: { n: Portal['n']; eu: Eu }) {
  return (
    <div className="dm-card dm-so-celular">
      <div className="dm-entre" style={{ marginBottom: 'var(--dm-e2)' }}>
        <h3 style={{ margin: 0 }}>Atendimento</h3>
        <Link className="dm-btn dm-txt" href="/demandas/atendimento">Abrir ›</Link>
      </div>
      <div className="dm-contas">
        <Link className={`dm-conta ${n.agir ? '' : 'dm-zero'}`} href="/demandas/atendimento?ver=agir"><b>{n.agir}</b><small>esperando você</small></Link>
        <Link className={`dm-conta ${n.fila ? '' : 'dm-zero'}`} href="/demandas/atendimento?ver=fila"><b>{n.fila}</b><small>na fila, sem dono</small></Link>
        <Link className={`dm-conta ${n.comigo ? '' : 'dm-zero'}`} href="/demandas/atendimento?ver=comigo"><b>{n.comigo}</b><small>com você</small></Link>
        <Link className={`dm-conta ${n.atrasadas ? 'dm-bad' : 'dm-zero'}`} href="/demandas/atendimento?ver=atrasadas"><b>{n.atrasadas}</b><small>atrasadas</small></Link>
      </div>
      {eu.papel === 'admin' ? (
        <div className="dm-entre" style={{ marginTop: 'var(--dm-e2)' }}>
          <span className="dm-peq dm-mudo">Pessoas, setores e categorias.</span>
          <Link className="dm-btn dm-txt" href="/demandas/admin">Administração ›</Link>
        </div>
      ) : null}
    </div>
  );
}
