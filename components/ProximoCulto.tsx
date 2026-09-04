'use client';
import { useEffect, useState } from 'react';

/* =============================================================================
   PRÓXIMO CULTO — a data do próximo domingo, calculada na hora

   "Domingo, 10h" é verdade sempre; "Domingo, 7 de setembro" é informação.
   Calcula no aparelho da pessoa (fuso local), depois de montar: o servidor
   pré-renderiza a página uma vez e ficaria com a data velha. Até montar,
   mostra o texto fixo — o mesmo nos dois lados, sem divergência de hidratação.
   Aos domingos até as 12h, o "próximo" é hoje.
   ============================================================================= */

export default function ProximoCulto({ fixo = 'Domingo, 10h' }: { fixo?: string }) {
  const [txt, setTxt] = useState(fixo);
  useEffect(() => {
    const agora = new Date();
    const d = new Date(agora);
    const dia = d.getDay(); // 0 = domingo
    let falta = (7 - dia) % 7;
    if (dia === 0 && agora.getHours() >= 12) falta = 7;
    d.setDate(d.getDate() + falta);
    const f = d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
    setTxt(falta === 0 ? `Hoje, ${f} · 10h` : `Domingo, ${f} · 10h`);
  }, []);
  return <>{txt}</>;
}
