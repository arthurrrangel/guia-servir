'use client';
/* O PAINEL DA VIRADA 2027 · migração 118, 21/11/2026.
   Na Administração das Demandas, como o do Follow Camp: a mesma porta (link
   pessoal ou e-mail) e a mesma pessoa única (96). Quem não é a administração
   vê a recusa da casca, e o banco recusa de novo (`virada_painel` responde
   SO_ADMIN). guiachurch.com/virada/reservas leva para cá. */
import { Suspense } from 'react';
import Casca from '@/components/demandas/Casca';
import Painel from '@/components/virada/Painel';

export default function Pagina() {
  return <Suspense fallback={null}><Casca admin><Painel /></Casca></Suspense>;
}
