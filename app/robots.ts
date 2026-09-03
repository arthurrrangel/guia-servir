import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/igreja';

/* =============================================================================
   robots.txt

   A DECISÃO DE UM DOMÍNIO MUDOU A NATUREZA DESTE ARQUIVO.

   Enquanto guiaservir.com era só ferramenta, bloquear o domínio inteiro era
   seguro e correto. A partir do momento em que o site público da igreja mora
   aqui, um bloqueio geral significa um site que NUNCA aparece no Google — e
   ninguém percebe por semanas, porque o site funciona perfeitamente para quem
   já tem o link. Este arquivo é o lugar onde esse erro seria cometido.

   Por isso o padrão aqui é PERMITIR, e o bloqueio é lista explícita.

   O QUE ENTRA NA LISTA, E O CRITÉRIO. Não é "tela do sistema": é rota cujo
   endereço, indexado, revela alguém. /eu/ é o caso extremo — o código na URL
   é a credencial da pessoa, e um endereço desses no índice é a escala dela
   aparecendo na busca. Por isso ele aparece duas vezes (aqui e no
   X-Robots-Tag de cabeçalho, em next.config.mjs): robots.txt pede para não
   RASTREAR, o cabeçalho manda não INDEXAR. São coisas diferentes, e uma URL
   descoberta por link externo pode ser indexada sem nunca ter sido rastreada.
   ============================================================================= */

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: '*',
      allow: '/',
      disallow: [
        /* o link pessoal do voluntário: o token é a credencial */
        '/eu/',
        /* a área do gestor */
        '/painel', '/escala', '/time', '/ajustes', '/entrar',
        /* listas por equipe e convites: nome de pessoa, ou token de uso único */
        '/equipe/', '/candidatura/',
        /* rota de serviço */
        '/api/',
      ],
    }],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
