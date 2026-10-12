'use client';
import { useEffect, useState } from 'react';
import { IGREJA, CULTO_QUANDO } from '@/lib/igreja';

/* a data do próximo domingo, calculada no aparelho depois de montar; até lá,
   "Domingo, 10h", que é verdade sempre (sem divergência de hidratação) */
export default function ProximoCulto({ fixo = CULTO_QUANDO }: { fixo?: string }) {
  const [txt, setTxt] = useState(fixo);
  useEffect(() => {
    const agora = new Date();
    const d = new Date(agora);
    const dia = d.getDay();
    let falta = (7 - dia) % 7;
    if (dia === 0 && agora.getHours() >= 12) falta = 7;
    d.setDate(d.getDate() + falta);
    const f = d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
    /* data e hora não se separam no "·" (o Chrome quebra depois do ponto) */
    const j = '\u00a0·\u2060\u00a0';
    setTxt(falta === 0 ? `Hoje, ${f}${j}${IGREJA.cultoHora}` : `${IGREJA.cultoDia}, ${f}${j}${IGREJA.cultoHora}`);
  }, []);
  return <>{txt}</>;
}
