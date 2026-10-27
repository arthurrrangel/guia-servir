import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { SITE, SITE_FOLLOW, SITE_IGREJA } from '@/lib/igreja';
import { ehFollow, ehServir } from '@/lib/site/sites';

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

   19/10/2026: UM ROBOTS POR DOMÍNIO. Com o Guia Church e o Guia Servir em
   domínios próprios (next.config.mjs, "OS DOIS SITES"), cada um aponta a
   lista de páginas e o host do próprio domínio. Ler o host torna esta rota
   dinâmica: ela roda a cada pedido, e é pedida por robô, poucas vezes por
   dia. (A palavra da lista não aparece antes do bloqueio, de propósito:
   scripts/demandas-token-na-url.test.mjs lê o bloqueio por ela.)
   ============================================================================= */

export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get('host');
  /* 19/10/2026, à noite: o terceiro domínio, o Guia Follow (guiafollow.com) */
  const base = ehFollow(host) ? SITE_FOLLOW : ehServir(host) ? SITE : SITE_IGREJA;
  return {
    rules: [{
      userAgent: '*',
      allow: '/',
      disallow: [
        /* o link pessoal do voluntário: o token é a credencial */
        '/eu/',
        /* a área do gestor */
        '/painel', '/escala', '/time', '/ajustes', '/entrar',
        /* 109 · a aba Culto e a folha do cronograma pelo link do grupo.
           '/cronograma/' COM a barra: sem ela, o prefixo pegaria /cronogramas
           (que já está acima) e nada mais; com ela, fica claro que é a folha */
        '/cronogramas', '/cronograma/',
        /* 116 · o dress code pelo link do grupo */
        '/dress/',
        /* listas por equipe e convites: nome de pessoa, ou token de uso único */
        '/equipe/', '/candidatura/',
        /* Demandas: o link pessoal do membro é `/demandas?t=<token>`, e o
           token é a credencial inteira. Ficou de fora daqui até 19/09/2026. */
        '/demandas',
        /* 114 · o link pessoal da inscrição no Follow Camp */
        '/followcamp/minha/',
        /* rota de serviço */
        '/api/',
      ],
    }],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
