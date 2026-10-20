'use client';

import { useEffect, useState } from 'react';
import { IGREJA } from '@/lib/igreja';

/* =============================================================================
   A CONTAGEM ATÉ O PRÓXIMO FOLLOW · 19/10/2026, na língua da casa em 20/10

   O elemento vivo da seção "Quando e onde": quanto falta para sábado às 19h,
   no relógio do aparelho (quem lê está no Rio). No servidor e até montar,
   mostra o que é verdade sempre ("Todo sábado, às 19h"), para não
   divergir na hidratação; depois atualiza a cada meio minuto, e só escreve
   quando o texto muda. Durante o culto (sábado, das 19h às 20h30) diz que
   está acontecendo. Sai como a linha de apoio da seção (.s-lead): o número
   em negrito, a data em seguida.
   ============================================================================= */
const HORA = 19, DURACAO_MIN = 90;

function proximo(agora: Date): { quando: Date; agoraMesmo: boolean } {
  const d = new Date(agora);
  d.setHours(HORA, 0, 0, 0);
  const dia = d.getDay();                              /* 6 = sábado */
  let falta = (6 - dia + 7) % 7;
  const fimDeHoje = new Date(d); fimDeHoje.setMinutes(DURACAO_MIN);
  if (dia === 6) {
    if (agora >= d && agora < fimDeHoje) return { quando: d, agoraMesmo: true };
    if (agora >= fimDeHoje) falta = 7;
  }
  d.setDate(d.getDate() + falta);
  return { quando: d, agoraMesmo: false };
}

export function texto(agora: Date): { forte: string; resto: string } {
  const { quando, agoraMesmo } = proximo(agora);
  const data = quando.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
  if (agoraMesmo) return { forte: 'Acontecendo agora.', resto: `Começou às ${IGREJA.followHora}, hoje, ${data}.` };
  const min = Math.max(0, Math.round((quando.getTime() - agora.getTime()) / 60000));
  const dias = Math.floor(min / 1440), horas = Math.floor((min % 1440) / 60), mins = min % 60;
  let forte: string;
  if (dias >= 1) forte = `${dias === 1 ? 'Falta 1 dia' : `Faltam ${dias} dias`} e ${horas}h.`;
  else if (horas >= 1) forte = `${horas === 1 ? 'Falta 1h' : `Faltam ${horas}h`} e ${String(mins).padStart(2, '0')} min.`;
  else forte = mins === 1 ? 'Falta 1 min.' : `Faltam ${mins} min.`;
  const hoje = dias === 0 && quando.getDate() === agora.getDate();
  /* a hora já está no título da seção ("Todo sábado às 19h"): aqui só o dia */
  return { forte, resto: `${hoje ? 'Hoje' : 'Sábado'}, ${data}.` };
}

export default function Contagem() {
  const [t, setT] = useState<{ forte: string; resto: string } | null>(null);
  useEffect(() => {
    let ultimo = '';
    const roda = () => {
      const n = texto(new Date());
      const chave = n.forte + n.resto;
      if (chave !== ultimo) { ultimo = chave; setT(n); }
    };
    roda();
    const id = setInterval(roda, 30000);
    return () => clearInterval(id);
  }, []);
  return (
    <p className="s-lead" aria-live="off">
      {t ? <><b className="s-b">{t.forte}</b> {t.resto}</> : <>{`Todo sábado, às ${IGREJA.followHora}. Não precisa de inscrição.`}</>}
    </p>
  );
}
