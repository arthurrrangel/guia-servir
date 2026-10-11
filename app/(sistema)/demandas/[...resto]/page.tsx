/* O ENDEREÇO QUE NÃO EXISTE DENTRO DE /demandas — 24/09/2026 (auditoria R14).
   Caía no 404 do site da igreja, com o topo e o rodapé do site: a pessoa
   saía do sistema sem saber. Aqui ele vira o "não encontrado" do próprio
   Demandas (`app/demandas/not-found.tsx`), com a volta para o Início. As
   rotas de verdade (Início, ficha, Nova...) são mais específicas e vencem. */
import { notFound } from 'next/navigation';

export default function Resto() {
  notFound();
}
