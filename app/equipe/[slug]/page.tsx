import Lista from './Lista';
import { nomesDaEquipe } from '@/lib/nomes-servidor';

/* =============================================================================
   A CASCA DE SERVIDOR DA LISTA — 09/09/2026

   A tela toda é 'use client' e continua sendo: ela guarda PIN, token, foco de
   campo, estado de formulário. Só que o navegador não tem como saber o
   sobrenome de ninguém — a RPC pública manda `split_part(nome, ' ', 1)`, e a
   tabela `voluntarios` não é legível por `anon` (nem deve ser).

   Então esta casca existe para uma coisa só: buscar no servidor o mapa
   `id → nome inteiro` e passá-lo à tela como prop. Uma consulta, feita uma vez
   por render de página, com cache de 60 segundos.

   O QUE ACONTECE QUANDO FALHA: `nomesDaEquipe` devolve `{}` em qualquer erro,
   a tela cai no primeiro nome e nada quebra. Quem se cadastrou nos últimos 60
   segundos aparece pelo primeiro nome até o cache virar — que é exatamente o
   comportamento de antes, por menos de um minuto.
   ============================================================================= */

export default async function PaginaEquipe({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <Lista nomes={await nomesDaEquipe(slug)} />;
}
