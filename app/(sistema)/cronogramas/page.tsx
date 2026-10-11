'use client';
import Shell from '@/components/Shell';
import { ListaDeCronogramas } from '@/components/escalas/Cronograma';

/* /cronogramas — a aba Culto: os próximos cultos com o que falta em cada um,
   e o histórico. O desenho mora em components/escalas/Cronograma.tsx. */
export default function Pagina() { return <Shell><ListaDeCronogramas /></Shell>; }
