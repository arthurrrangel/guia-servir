'use client';

import { useEffect, useState } from 'react';
import { IGREJA } from '@/lib/igreja';

/* =============================================================================
   A CONTAGEM ATÉ O PRÓXIMO FOLLOW · 19/10/2026

   O elemento vivo da seção "Quando e onde": quanto falta para sábado às 19h,
   no relógio do aparelho (quem lê está no Rio). No servidor e até montar,
   mostra o que é verdade sempre ("Sábado, 19h"), para não divergir na
   hidratação; depois atualiza a cada minuto, e só escreve quando o texto
   muda. Durante o culto (sábado, das 19h às 20h30) diz que está acontecendo.
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

function texto(agora: Date): { grande: string; frase: string; ao: boolean } {
  const { quando, agoraMesmo } = proximo(agora);
  const data = quando.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
  if (agoraMesmo) return { grande: 'Acontecendo agora', frase: `Sábado, ${data}, começou às ${IGREJA.followHora}.`, ao: true };
  const min = Math.max(0, Math.round((quando.getTime() - agora.getTime()) / 60000));
  const dias = Math.floor(min / 1440), horas = Math.floor((min % 1440) / 60), mins = min % 60;
  let grande: string;
  if (dias >= 1) grande = `${dias} ${dias === 1 ? 'dia' : 'dias'} e ${horas} h`;
  else if (horas >= 1) grande = `${horas} h e ${String(mins).padStart(2, '0')} min`;
  else grande = `${mins} min`;
  const hoje = dias === 0 && quando.getDate() === agora.getDate();
  return { grande, frase: `${hoje ? 'Hoje' : 'Sábado'}, ${data}, às ${IGREJA.followHora}.`, ao: false };
}

export default function Contagem() {
  const [t, setT] = useState<{ grande: string; frase: string; ao: boolean } | null>(null);
  useEffect(() => {
    let ultimo = '';
    const roda = () => {
      const n = texto(new Date());
      const chave = n.grande + n.frase;
      if (chave !== ultimo) { ultimo = chave; setT(n); }
    };
    roda();
    const id = setInterval(roda, 30000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="f-contagem f-rev" style={{ '--d': '.12s' } as React.CSSProperties} aria-live="off">
      <p className="f-chapeu"><span className="f-pulso" aria-hidden="true" />Próximo Follow</p>
      <p className="f-contagem-n">{t ? (t.ao ? <em>{t.grande}</em> : <>em <em>{t.grande}</em></>) : <>Sábado, <em>{IGREJA.followHora}</em></>}</p>
      <p>{t ? t.frase : 'Todo sábado, na GUIA Church.'}</p>
    </div>
  );
}
