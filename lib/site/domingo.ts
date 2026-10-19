/* =============================================================================
   OS QUATRO MOMENTOS DO DOMINGO · 19/10/2026

   A copy final pede os mesmos quatro momentos, com os mesmos textos, na home
   ("Como é um domingo?") e em /cultos ("Como é um domingo aqui?"). Até aqui
   /cultos tinha um roteiro próprio, com hora de cada momento (09h45, 10h00,
   10h30, 11h20) e outro texto. Uma lista só, aqui, para as duas páginas não
   divergirem. Fica fora do componente Domingo (que é de cliente) porque a
   página, de servidor, lê a lista.
   ============================================================================= */
export const MOMENTOS = [
  { n: '01', t: 'Acolhida', d: 'Alguém recebe você na porta e mostra onde fica tudo.' },
  { n: '02', t: 'Louvor', d: 'A banda conduz o louvor e a igreja adora junto. Você canta, ou fica em silêncio, do seu jeito.' },
  { n: '03', t: 'Palavra', d: 'Uma mensagem da Bíblia pra vida real.' },
  { n: '04', t: 'Oração e saída', d: 'Oramos uns pelos outros. Depois, café e conversa.' },
] as const;
