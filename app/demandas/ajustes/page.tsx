'use client';
/* OS AJUSTES VIRARAM A ADMINISTRAÇÃO · migração 94.

   Esta tela misturava a lista de gente com a configuração do sistema, dentro
   da mesma barra de abas que todo mundo usa. O pedido foi separar ("não
   misture isso com a interface do usuário comum"), e a administração agora
   mora em `/demandas/admin`, com topo próprio. As peças de setores e de
   categorias foram, sem mudar uma linha, para
   `components/demandas/Configuracao.tsx`.

   O endereço antigo continua de pé porque ele está em favorito, em conversa
   de WhatsApp e no histórico do navegador de quem administra. Endereço que
   some vira "a página não existe", que é a pior forma de avisar uma mudança.
   Aqui ele só leva para o lugar novo. */

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Porta } from '@/components/demandas/Porta';

export default function Ajustes() {
  const router = useRouter();
  useEffect(() => { router.replace('/demandas/admin'); }, [router]);
  return (
    <Porta>
      <h1>Os ajustes mudaram de lugar</h1>
      <p className="dm-auth-sub">
        Agora eles ficam na <Link href="/demandas/admin">Administração</Link>. Levando você para lá…
      </p>
    </Porta>
  );
}
