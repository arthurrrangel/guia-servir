'use client';
/* O PAINEL DO FOLLOW CAMP · migração 110, 04/10/2026.
   Na Administração das Demandas: a mesma porta (link pessoal ou e-mail) e a
   mesma pessoa única (96). Quem não é a administração vê a recusa da casca, e
   o banco recusa de novo (`fc27_painel` responde SO_ADMIN). */
import { Suspense } from 'react';
import Casca from '@/components/demandas/Casca';
import Painel from '@/components/followcamp/Painel';

export default function Pagina() {
  return <Suspense fallback={null}><Casca admin><Painel /></Casca></Suspense>;
}
