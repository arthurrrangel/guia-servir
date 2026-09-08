'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DIAS_CURTOS, DIAS_LONGOS, DIAS_URL, eventosDoDia, type Evento } from '@/lib/semana';

/* =============================================================================
   A SEMANA — sete colunas, o ritmo da igreja numa olhada

   Domingo é culto, terça a quinta são as Pequenas Guias, sábado é o Follow.
   Cada coluna é uma porta: toca em quarta e cai nos grupos de quarta. O dia
   de hoje acende depois de montar (o servidor não sabe que dia é na casa da
   pessoa). Sem JS, as sete colunas nascem iguais e continuam sendo portas.

   O que cada coluna diz é o MÍNIMO que distingue o dia: "Culto · 10h",
   "1 grupo · 17h30", "5 grupos · 20h", "Follow". Os nomes dos grupos ficam
   para a página deles: aqui é ritmo, não lista.
   ============================================================================= */

function resumo(evs: Evento[]): { l1: string; l2: string; nomes: string } {
  if (!evs.length) return { l1: '', l2: '', nomes: '' };
  const culto = evs.find(e => e.tipo === 'culto');
  if (culto) return { l1: 'Culto', l2: culto.hora || '', nomes: 'Louvor, palavra e acolhida' };
  const follow = evs.find(e => e.tipo === 'follow');
  if (follow) return { l1: 'Follow', l2: follow.hora || 'jovens', nomes: 'O culto de jovens, menos no primeiro sábado do mês' };
  const grupos = evs.filter(e => e.tipo === 'grupo');
  /* horas diferentes no mesmo dia viram faixa: "19h–20h" (as listas já vêm
     na ordem da hora, então a primeira é a mais cedo e a última a mais tarde) */
  const horas = [...new Set(grupos.map(g => g.hora).filter(Boolean))] as string[];
  return {
    l1: grupos.length === 1 ? '1 grupo' : `${grupos.length} grupos`,
    l2: horas.length === 1 ? horas[0] : `${horas[0]}–${horas[horas.length - 1]}`,
    nomes: grupos.map(g => g.nome).join(', '),
  };
}

export function Semana() {
  const [hoje, setHoje] = useState<number | null>(null);
  useEffect(() => { setHoje(new Date().getDay()); }, []);

  return (
    <ol className="semana-dias" aria-label="A semana da igreja">
      {[0, 1, 2, 3, 4, 5, 6].map(d => {
        const evs = eventosDoDia(d);
        const r = resumo(evs);
        const vazio = !evs.length;
        const href = evs[0]?.tipo === 'grupo' ? `/pequena-guia?dia=${DIAS_URL[d]}` : evs[0]?.href || '';
        const cls = 'dia' + (hoje === d ? ' hoje' : '') + (vazio ? ' vazio' : '');
        const dentro = (
          <>
            <span className="dia-n">{DIAS_CURTOS[d]}</span>
            {!vazio && <span className="dia-l"><b>{r.l1}</b><i>{r.l2}</i></span>}
            {/* no desktop cabe dizer QUAIS: os nomes dos grupos do dia */}
            {!vazio && <span className="dia-nomes">{r.nomes}</span>}
            {hoje === d && <span className="so-leitor">, hoje</span>}
          </>
        );
        return (
          <li key={d} className={cls}>
            {vazio
              ? <span className="dia-in" aria-label={`${DIAS_LONGOS[d]}: nada marcado`}>{dentro}</span>
              : <Link href={href} className="dia-in" aria-label={`${DIAS_LONGOS[d]}: ${r.l1}${r.l2 ? ', ' + r.l2 : ''}`}>{dentro}</Link>}
          </li>
        );
      })}
    </ol>
  );
}
