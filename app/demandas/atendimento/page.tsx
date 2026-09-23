'use client';
/* O ATENDIMENTO: O PORTAL DE QUEM ATENDE · migração 94.

   As seis perguntas do pedido, com os nomes dele, e cada uma com a conta ao
   lado:

     Aguardando você   o que chegou e ninguém pegou, o que está com você em
                       execução, e o que só você pode aprovar
     Com você          o que você assumiu e ainda está vivo
     Do setor          tudo que o seu setor atende (para a gestão, o escopo)
     Atrasadas         do setor, passaram do prazo
     Urgentes          do setor, marcadas como urgentes
     Concluídas        do setor, entregues

   "Do setor" é `pode_atender` no banco: o responsável da Comunicação vê a
   fila da Comunicação e NÃO vê o que o Financeiro atende, nem pelo número da
   demanda na barra de endereço. A tela não filtra nada; ela escolhe o
   recorte, e o banco decide o que cabe nele.

   Os seis atalhos SÃO o seletor. A lista embaixo não desenha as tiras dela
   (`controle`), porque dois controles para a mesma pergunta é como a pessoa
   se perde. */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Casca, { useEu } from '@/components/demandas/Casca';
import Lista, { type Recorte } from '@/components/demandas/Lista';
import { Pill, Subabas, Vazio } from '@/components/demandas/Ui';
import { portal, type Aba } from '@/lib/demandas/api';
import { rotPapel } from '@/lib/demandas/regras';
import type { Eu, Portal } from '@/lib/demandas/tipos';

export default function Pagina() {
  return <Casca><Atendimento /></Casca>;
}

type Vista = 'agir' | 'comigo' | 'fila' | 'atrasadas' | 'urgentes' | 'concluidas';

const VISTAS: { v: Vista; aba: Aba; so: Recorte; conta: (n: Portal['n']) => number;
                legenda: string }[] = [
  { v: 'agir',       aba: 'agir',   so: 'abertas',    conta: n => n.agir,           legenda: 'Esperando você' },
  { v: 'comigo',     aba: 'comigo', so: 'abertas',    conta: n => n.comigo,         legenda: 'Com você' },
  { v: 'fila',       aba: 'setor',  so: 'abertas',    conta: n => n.setor_abertas,  legenda: 'Do setor' },
  { v: 'atrasadas',  aba: 'setor',  so: 'atrasadas',  conta: n => n.atrasadas,      legenda: 'Atrasadas' },
  { v: 'urgentes',   aba: 'setor',  so: 'urgentes',   conta: n => n.urgentes,       legenda: 'Urgentes' },
  { v: 'concluidas', aba: 'setor',  so: 'concluidas', conta: n => n.concluidas,     legenda: 'Concluídas' },
];

/* o que "do setor" quer dizer para cada papel, na legenda e no título. A
   gestão e a administração olham vários setores: o setor aparece em cada
   linha. Quem atende um setor só vê a fila DELE, e "Comunicação" em toda
   linha de "Fila da Comunicação" é ruído. */
function alcance(eu: Eu): { titulo: string; legendaFila: string; varios: boolean } {
  if (eu.papel === 'admin') return { titulo: 'Todos os setores', legendaFila: 'Em todos os setores', varios: true };
  if (eu.papel === 'gestor') {
    if (eu.escopo_total) return { titulo: 'Todos os setores', legendaFila: 'Em todos os setores', varios: true };
    const e = eu.escopo || [];
    return { titulo: e.length ? e.join(', ') : 'Seu escopo', legendaFila: 'No seu escopo', varios: e.length !== 1 };
  }
  return { titulo: eu.setor ? `Fila da ${eu.setor}` : 'Sua fila', legendaFila: 'Do setor', varios: false };
}

function Atendimento() {
  const { eu } = useEu();
  const [p, setP] = useState<Portal | null>(null);
  const [vista, setVista] = useState<Vista>('agir');

  /* o Início manda `?ver=` pelos atalhos das contas */
  useEffect(() => {
    try {
      const v = new URLSearchParams(window.location.search).get('ver') as Vista | null;
      if (v && VISTAS.some(x => x.v === v)) setVista(v);
    } catch { /* sem URL legível, fica no primeiro */ }
  }, []);
  useEffect(() => {
    portal().then(r => { if (r.ok && (r as unknown as Portal).n) setP(r as unknown as Portal); });
  }, []);

  if (!eu) return null;
  /* quem não atende nada não tem fila: a tela diz isso e aponta o caminho,
     em vez de mostrar seis zeros. O banco devolveria listas vazias de
     qualquer jeito (`pode_atender` é falso), então isto é clareza, e não
     segurança. */
  if (!(eu.atende ?? eu.papel !== 'solicitante')) {
    return (
      <Vazio titulo="O atendimento é de quem faz parte de uma equipe.">
        Se você atende demandas num setor, peça esse papel no <Link href="/demandas/perfil">seu perfil</Link>.
      </Vazio>
    );
  }
  const a = alcance(eu);
  const atual = VISTAS.find(x => x.v === vista) || VISTAS[0];

  return (
    <>
      <div className="dm-cab">
        <div>
          <div className="dm-rot">{'>'} atendimento{eu.papel === 'gestor' ? ' · gestão' : ''}</div>
          <h1 style={{ marginTop: 4 }}>{a.titulo}</h1>
          {/* o nome já está no topo; aqui fica o papel, que é o que explica o
              alcance do título */}
          <div className="dm-quem"><Pill>{rotPapel(eu.papel)}</Pill></div>
        </div>
        <div className="dm-cab-acoes">
          <Link className="dm-btn dm-txt dm-seta" href="/demandas/numeros">Números</Link>
        </div>
      </div>

      {/* as seis vistas SÃO o seletor: sub-abas no desktop, fita de fichas no
          celular, cada uma com a sua conta */}
      <Subabas<Vista> rot="O que ver" valor={vista} aoMudar={setVista}
        itens={VISTAS.map(x => ({
          v: x.v, rot: x.v === 'fila' ? a.legendaFila : x.legenda,
          n: p ? x.conta(p.n) : null, bad: x.v === 'atrasadas',
        }))} />

      <Lista eu={eu} abas={[]} recortes={[]} controle={{ aba: atual.aba, so: atual.so }}
        mostrarSetor={a.varios} vazio={() => vazioDoAtendimento(vista)} />
    </>
  );
}

function vazioDoAtendimento(v: Vista): { titulo: string; dica?: React.ReactNode; tom?: 'bom' } {
  switch (v) {
    case 'agir':       return { titulo: 'Nada esperando você.', dica: 'O que chegar na fila e o que estiver com você aparece aqui.', tom: 'bom' };
    case 'comigo':     return { titulo: 'Nada está com você agora.' };
    case 'fila':       return { titulo: 'O setor está em dia.', tom: 'bom' };
    case 'atrasadas':  return { titulo: 'Nada atrasado.', tom: 'bom' };
    case 'urgentes':   return { titulo: 'Nenhuma urgente.', tom: 'bom' };
    case 'concluidas': return { titulo: 'Nada concluído ainda.' };
  }
}
