/* =============================================================================
   O TEXTO PÚBLICO DE CADA ÁREA — 09/09/2026

   POR QUE ISTO SAIU DO BANCO. O texto que aparece no azulejo de cada área
   (home, /servir, /servir/<área> e o cartão de compartilhamento) vinha de
   `equipes.descricao`. O Arthur mandou os cinco textos em 08/09; a migração
   que os grava ficou um dia sem rodar, e nesse dia o site mostrou ao visitante
   um texto que já não era o da igreja. Ele perguntou, com razão, "cadê as
   alterações".

   Copy de página não devia depender de alguém abrir um SQL Editor. Aqui ele
   sobe junto com o deploy, fica no git ao lado das páginas que o desenham, e
   quem revisar o texto revisa no mesmo lugar em que revisa o resto.

   QUEM MANDA. Para os slugs listados abaixo, manda este arquivo. Para qualquer
   outro — uma área nova criada no banco amanhã — continua mandando
   `equipes.descricao`, e ela aparece sozinha, sem passar por aqui.

   A ARMADILHA, dita em voz alta: enquanto o slug estiver nesta lista, editar
   `equipes.descricao` no banco NÃO muda o site. Para devolver o controle ao
   banco, apague a linha do slug daqui. A migração 42 grava os mesmos textos na
   coluna, então os dois dizem a mesma coisa e nada se contradiz.
   ============================================================================= */

const PUBLICA: Record<string, string> = {
  midia:
    'Ampliamos a mensagem da igreja por meio da tecnologia, conectando pessoas e registrando momentos com excelência em cada imagem, luz, som e transmissão.',
  louvor:
    'Conduzimos a igreja em uma adoração autêntica, criando um ambiente para que cada pessoa tenha um encontro profundo com Deus por meio da música e do serviço.',
  kids:
    'Plantamos sementes de fé no coração das crianças, oferecendo um ambiente seguro, acolhedor e educativo para que elas cresçam no conhecimento de Deus.',
  /* o slug é `servico` por história (a equipe nasceu como "Serviço" e a URL
     /servir/servico já foi divulgada); o nome público é Connect */
  servico:
    'Acolhemos com amor e atenção cada pessoa que chega à nossa casa, cuidando para que todos se sintam bem-vindos, seguros e valorizados desde o primeiro momento.',
  livraria:
    'Disponibilizamos recursos que fortalecem a caminhada cristã, ajudando cada pessoa a levar para casa conteúdos que edificam e prolongam a experiência do culto durante a semana.',
};

/** O texto público da área: o daqui quando existe, o do banco quando não. */
export function descricaoPublica(slug: string, doBanco?: string | null): string | null {
  return PUBLICA[slug] ?? (doBanco?.trim() || null);
}
