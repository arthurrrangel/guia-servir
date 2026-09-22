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
     o que espera por mim . "Precisa de você": responder, confirmar
     o próximo passo ...... "Nova demanda", sempre à vista
     minhas demandas ...... em andamento, concluídas, histórico

   E, para quem também atende ou administra, um cartão com as contas e a
   porta para o outro portal. Sem gráfico: contas que são atalhos. */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import Casca, { useEu } from '@/components/demandas/Casca';
import Lista, { Linha } from '@/components/demandas/Lista';
import { Aviso, Esqueleto, Pill } from '@/components/demandas/Ui';
import { portal, type Aba } from '@/lib/demandas/api';
import { recadoDoErro, rotPapel } from '@/lib/demandas/regras';
import type { Portal } from '@/lib/demandas/tipos';

export default function Pagina() {
  return <Casca><Inicio /></Casca>;
}

function Inicio() {
  const { eu } = useEu();
  const [p, setP] = useState<Portal | null>(null);
  const [erro, setErro] = useState('');
  const [bemvindo, setBemvindo] = useState(false);

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

  /* o cadastro devolve a pessoa para cá com `?bemvindo=1`. A frase aparece
     uma vez e o parâmetro sai da barra: recarregar não repete boas-vindas. */
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.get('bemvindo') === '1') {
        setBemvindo(true);
        u.searchParams.delete('bemvindo');
        window.history.replaceState(null, '', u.pathname + u.search + u.hash);
      }
    } catch { /* sem history: a frase aparece e o parâmetro fica, sem dano */ }
  }, []);

  if (!eu) return null;
  const n = p?.n;
  const abas: { v: Aba; rot: string }[] = [{ v: 'minhas', rot: 'Minhas' }];
  if (eu.papel === 'lider') abas.push({ v: 'ministerio', rot: 'Ministério' });
  if ((n?.participo ?? 0) > 0) abas.push({ v: 'participo', rot: 'Acompanho' });
  const atende = eu.atende ?? eu.papel !== 'solicitante';

  return (
    <>
      <div className="dm-entre" style={{ marginBottom: 'var(--dm-e3)' }}>
        <div>
          <div className="dm-rot">{'>'} início</div>
          <h1 style={{ marginTop: 4 }}>Olá, {eu.primeiro_nome}</h1>
          <div className="dm-quem">
            <Pill>{rotPapel(eu.papel)}</Pill>
            {eu.setor ? <span>{eu.setor}</span> : null}
            {eu.funcao ? <span>{eu.funcao}</span> : null}
          </div>
        </div>
        <Link className="dm-btn dm-pri" href="/demandas/nova">Nova demanda</Link>
      </div>

      {bemvindo ? <Aviso tom="ok">Cadastro feito. Você já pode abrir demandas.</Aviso> : null}
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

      {!p && !erro ? <Esqueleto linhas={2} oQue="Carregando o que espera por você" /> : null}
      {p ? <Precisa itens={p.precisa || []} /> : null}
      {p && atende ? <Contas n={p.n} /> : null}
      {p && eu.papel === 'admin' ? <Administracao pedidos={p.n.pedidos || 0} /> : null}

      <h2 style={{ margin: 'var(--dm-e4) 0 var(--dm-e2)' }}>Minhas demandas</h2>
      <Lista eu={eu} abas={abas} abaInicial="minhas"
        recortes={[
          /* "Abertas", e não "Em andamento": com três fatias em 320 e 360
             a palavra não cabia na dela e encostava em "Concluídas" (medido:
             90px de texto numa fatia de 80) */
          { v: 'abertas', rot: 'Abertas' },
          { v: 'concluidas', rot: 'Concluídas' },
          { v: 'tudo', rot: 'Histórico' },
        ]}
        vazio={vazioDoInicio} />
    </>
  );
}

/* SEM "Abrir uma demanda" DENTRO DO AVISO · 22/09/2026. Era um link de 16px
   de altura (o medidor acusou em todos os papéis), e repetia o botão "Nova
   demanda" que está no topo da mesma tela, sempre à vista. Dois caminhos
   para a mesma coisa na mesma tela é ruído; o do topo fica. */
function vazioDoInicio(aba: Aba, so: string): { titulo: string; dica?: React.ReactNode } {
  if (aba === 'participo') {
    return { titulo: 'Você não acompanha nenhuma demanda.',
             dica: 'Quem pede ou quem atende pode incluir você numa demanda.' };
  }
  if (aba === 'ministerio') {
    if (so === 'concluidas') return { titulo: 'Nada do ministério foi concluído ainda.' };
    if (so === 'tudo') return { titulo: 'O ministério ainda não pediu nada.' };
    return { titulo: 'O ministério não tem pedido em andamento.' };
  }
  if (so === 'concluidas') return { titulo: 'Nenhum pedido seu foi concluído ainda.' };
  if (so === 'tudo') return { titulo: 'Você ainda não abriu nenhuma demanda.' };
  return { titulo: 'Nenhuma demanda sua em andamento.' };
}

/* O QUE ESPERA POR VOCÊ, DO LADO DE QUEM PEDE.

   Vem pronto do servidor (`espera_pedido` da 94): a demanda parou esperando
   uma resposta sua, ou ficou pronta esperando você dizer que resolveu. A
   pílula de cada linha é o nome do botão que resolve. */
function Precisa({ itens }: { itens: Portal['precisa'] }) {
  if (!itens.length) {
    return (
      <div className="dm-card dm-precisa">
        <h3>Nada esperando você</h3>
        <p className="dm-peq dm-mudo" style={{ marginTop: 4 }}>
          Quando uma demanda sua precisar de resposta ou de confirmação, ela aparece aqui.
        </p>
      </div>
    );
  }
  return (
    <div className="dm-card dm-precisa">
      <h3 style={{ marginBottom: 'var(--dm-e1)' }}>
        Precisa de você<span className="dm-selo">{itens.length}</span>
      </h3>
      <div className="dm-fila">{itens.map(d => <Linha key={d.numero} d={d} />)}</div>
    </div>
  );
}

/* AS CONTAS DE QUEM ATENDE: quatro números que também são a porta. */
function Contas({ n }: { n: Portal['n'] }) {
  return (
    <div className="dm-card">
      <div className="dm-entre" style={{ marginBottom: 'var(--dm-e2)' }}>
        <h3>Atendimento</h3>
        <Link className="dm-btn dm-mini" href="/demandas/atendimento">Abrir</Link>
      </div>
      <div className="dm-contas">
        <Link href="/demandas/atendimento?ver=agir"><b>{n.agir}</b><small>esperando você</small></Link>
        <Link href="/demandas/atendimento?ver=fila"><b>{n.fila}</b><small>na fila, sem dono</small></Link>
        <Link href="/demandas/atendimento?ver=comigo"><b>{n.comigo}</b><small>com você</small></Link>
        <Link className={n.atrasadas ? 'dm-bad' : undefined} href="/demandas/atendimento?ver=atrasadas">
          <b>{n.atrasadas}</b><small>atrasadas</small>
        </Link>
      </div>
    </div>
  );
}

/* A PORTA DA ADMINISTRAÇÃO, SÓ PARA QUEM ADMINISTRA.

   Fica aqui e no Perfil, e não na barra de abas: "não misture isso com a
   interface do usuário comum". O número é o de pedidos de papel esperando
   decisão, que é a única coisa da administração que tem prazo. */
function Administracao({ pedidos }: { pedidos: number }) {
  return (
    <div className="dm-card">
      <div className="dm-entre">
        <div>
          <h3>Administração</h3>
          <p className="dm-peq dm-mudo" style={{ marginTop: 2 }}>
            {pedidos
              ? `${pedidos} ${pedidos === 1 ? 'pedido de papel espera' : 'pedidos de papel esperam'} você.`
              : 'Pessoas, setores e categorias.'}
          </p>
        </div>
        <Link className="dm-btn" href="/demandas/admin">Abrir</Link>
      </div>
    </div>
  );
}
