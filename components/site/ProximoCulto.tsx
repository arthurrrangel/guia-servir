'use client';
import { useEffect, useState } from 'react';
import { CULTO_QUANDO } from '@/lib/igreja';
import { textoDoProximoCulto } from '@/lib/site/relogio';

/* a data do próximo domingo, calculada depois de montar no horário de Brasília
   (lib/site/relogio.ts; até 22/10, no fuso do aparelho); até lá, "Domingo, 10h",
   que é verdade sempre (sem divergência de hidratação) */
export default function ProximoCulto({ fixo = CULTO_QUANDO }: { fixo?: string }) {
  const [txt, setTxt] = useState(fixo);
  useEffect(() => { setTxt(textoDoProximoCulto(new Date())); }, []);
  return <>{txt}</>;
}
