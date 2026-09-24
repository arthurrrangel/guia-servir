'use client';
/* O ATENDIMENTO: O PORTAL DE QUEM ATENDE · migração 94.

   As seis perguntas do pedido, com os nomes dele, e cada uma com a conta ao
   lado:

     Esperando você    o que chegou e ninguém pegou, o que está com você em
                       execução, e o que só você pode aprovar
     Com você          o que você assumiu e ainda está vivo
     Em aberto         tudo que o seu setor atende e não acabou (para a
                       gestão, o escopo; para a administração, tudo)
     Atrasadas         do setor, passaram do prazo
     Urgentes          do setor, marcadas como urgentes
     Concluídas        do setor, entregues

   "Em aberto" é `pode_atender` no banco: o responsável da Comunicação vê a
   fila da Comunicação e NÃO vê o que o Financeiro atende, nem pelo número da
   demanda na barra de endereço. A tela não filtra nada; ela escolhe o
   recorte, e o banco decide o que cabe nele.

   As seis vistas SÃO o seletor. A lista embaixo não desenha as tiras dela
   (`controle`), porque dois controles para a mesma pergunta é como a pessoa
   se perde. */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Casca, { useEu } from '@/components/demandas/Casca';
import Lista, { type Recorte } from '@/components/demandas/Lista';
import { Cabecalho, Pill, Subabas, Vazio } from '@/components/demandas/Ui';
import { Icone } from '@/components/demandas/Icone';
import { portal, type Aba } from '@/lib/demandas/api';
import { alcanceDoAtendimento, rotPapel } from '@/lib/demandas/regras';
import type { Portal } from '@/lib/demandas/tipos';

export default function Pagina() {
  return <Casca><Atendimento /></Casca>;
}

type Vista = 'agir' | 'comigo' | 'fila' | 'atrasadas' | 'urgentes' | 'concluidas';

const VISTAS: { v: Vista; aba: Aba; so: Recorte; conta: (n: Portal['n']) => number;
                legenda: string }[] = [
  { v: 'agir',       aba: 'agir',   so: 'abertas',    conta: n => n.agir,           legenda: 'Esperando você' },
  { v: 'comigo',     aba: 'comigo', so: 'abertas',    conta: n => n.comigo,         legenda: 'Com você' },
  { v: 'fila',       aba: 'setor',  so: 'abertas',    conta: n => n.setor_abertas,  legenda: 'Em aberto' },
  { v: 'atrasadas',  aba: 'setor',  so: 'atrasadas',  conta: n => n.atrasadas,      legenda: 'Atrasadas' },
  { v: 'urgentes',   aba: 'setor',  so: 'urgentes',   conta: n => n.urgentes,       legenda: 'Urgentes' },
  { v: 'concluidas', aba: 'setor',  so: 'concluidas', conta: n => n.concluidas,     legenda: 'Concluídas' },
];

/* o que "do setor" quer dizer para cada papel: `alcanceDoAtendimento`, em
   regras.ts (o Início usa a mesma legenda na casa que abre esta vista) */

function Atendimento() {
  const { eu } = useEu();
  const [p, setP] = useState<Portal | null>(null);
  const [vista, setVista] = useState<Vista>('agir');

  /* o Início manda `?ver=` pelos números da faixa */
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
      <>
        <Cabecalho titulo="Atendimento" />
        <Vazio titulo="O atendimento é de quem faz parte de uma equipe." solto>
          Se você atende demandas num setor, peça esse papel no <Link href="/demandas/perfil">seu perfil</Link>.
        </Vazio>
      </>
    );
  }
  const a = alcanceDoAtendimento(eu);
  const atual = VISTAS.find(x => x.v === vista) || VISTAS[0];

  return (
    <>
      <Cabecalho sobre={eu.papel === 'gestor' ? 'Atendimento · Gestão' : 'Atendimento'} titulo={a.titulo}
        /* o nome já está na lateral; aqui fica o papel, que é o que explica
           o alcance do título */
        meta={<Pill>{rotPapel(eu.papel)}</Pill>}
        /* no desktop "Números" está na lateral, logo abaixo de Atendimento;
           no celular a barra de abas não tem lugar para ele, e a porta é
           esta. Pequena: no celular a regra do cabeçalho alargava o botão
           até a borda, e uma saída secundária virava a maior peça da tela. */
        acoes={<Link className="dm-btn dm-peq dm-so-celular" href="/demandas/numeros"><Icone nome="numeros" />Números</Link>} />

      {/* as seis vistas SÃO o seletor, cada uma com a sua conta */}
      <Subabas<Vista> rot="O que ver" valor={vista} aoMudar={setVista}
        itens={VISTAS.map(x => ({
          v: x.v, rot: x.v === 'fila' ? a.legendaFila : x.legenda,
          n: p ? x.conta(p.n) : null, bad: x.v === 'atrasadas', destaque: x.v === 'agir',
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
