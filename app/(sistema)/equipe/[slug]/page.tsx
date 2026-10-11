import Lista from './Lista';

/* =============================================================================
   A CASCA DE SERVIDOR DA LISTA — 09/09/2026, ESVAZIADA EM 19/09/2026

   POR QUE ELA EXISTIU. A tela é 'use client' e o navegador não tinha como
   saber o sobrenome de ninguém: a RPC pública mandava só
   `split_part(nome, ' ', 1)`, e `voluntarios` não é legível por `anon` (nem
   deve ser). Então esta casca buscava no servidor o mapa `id → nome inteiro`
   e passava como prop — usando `SUPABASE_SERVICE_ROLE`, a chave que ignora
   RLS, numa página que qualquer pessoa abre sem se identificar.

   O PRÓPRIO `lib/nomes-servidor.ts` dizia como terminar: "QUANDO A MIGRAÇÃO
   42 RODAR, este arquivo vira redundante: `equipe_time` passa a mandar
   `nome_completo` e a tela prefere esse campo. Aí é só apagar
   `lib/nomes-servidor.ts`, voltar `page.tsx` a 'use client' e seguir."

   A 42 rodou. `equipe_time` devolve `nome_completo` hoje — conferido no banco
   reconstruído — e `Lista.tsx` já prefere esse campo
   (`p.nome_completo || nomes[...] || p.primeiro_nome`). A limpeza é que não
   tinha sido feita, e o que ficou para trás foi uma chave de serviço no
   caminho de uma requisição anônima.

   O DADO EXPOSTO NÃO MUDA: o nome inteiro de quem serve na área continua
   aparecendo em /equipe/<área>, que é a decisão do Arthur de 09/09. O que
   muda é o caminho — agora ele vem pela mesma função `security definer` que
   já serve todo o resto do que é público, em vez de por uma credencial
   irrestrita. Menos código e uma chave a menos em rota aberta.
   ============================================================================= */

export default function PaginaEquipe() {
  return <Lista nomes={{}} />;
}
