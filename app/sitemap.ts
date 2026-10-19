import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { SITE, SITE_IGREJA } from '@/lib/igreja';
import { AREAS_ORDEM } from '@/lib/site/areas';
import { ehServir } from '@/lib/site/sites';

/* =============================================================================
   sitemap.xml

   O sitemap não é o índice do site: é a LISTA DO QUE A IGREJA OFERECE À
   BUSCA. Rota que existe e funciona mas não deveria ser encontrada por
   estranho não entra — e rota que promete um conteúdo que ainda não existe
   também não.

   O que fica de fora, e por quê:
   · /entrar, /painel, /escala, /time, /ajustes — sistema.
   · /eu e /eu/[token] — o endereço é a credencial da pessoa.
   · /equipe/[slug] e /candidatura/[token] — nome de gente e convite de uso único.
   · /guia-church-tv — deixou de existir em 11/10/2026 (redireciona para
     /cultos#ao-vivo).

   PRIORIDADE E FREQUÊNCIA são dicas fracas: o Google praticamente as ignora
   desde 2023. Ficam aqui porque outros buscadores ainda leem, e porque a
   ordem relativa documenta a hierarquia real do site — /cultos e /como-chegar
   acima da própria home, porque são elas que tiram alguém de casa.

   19/10/2026: UM SITEMAP POR DOMÍNIO (next.config.mjs, "OS DOIS SITES").
   O de guiachurch.com lista só a igreja; o de guiaservir.com, a LP (na
   raiz), as cinco áreas e as duas páginas de apoio. Endereço que
   redireciona não entra em sitemap nenhum: o Search Console marca "página
   com redirecionamento" e para de confiar na lista.

   AS ÁREAS ENTRARAM. Ficavam de fora porque abrem e fecham no banco; mas as
   cinco de lib/site/areas.ts têm copy fixa e a página nunca some (sem o
   banco, ela mostra a copy). Área nova do banco continua fora até ganhar
   copy fixa.
   ============================================================================= */

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const agora = new Date();
  const servir = ehServir((await headers()).get('host'));

  const paginas: MetadataRoute.Sitemap = servir ? [
    { url: `${SITE}/`, changeFrequency: 'weekly', priority: 1.0 },
    ...AREAS_ORDEM.map(s => ({ url: `${SITE}/servir/${s}`, changeFrequency: 'monthly' as const, priority: 0.7 })),
    { url: `${SITE}/servir/onde-me-encaixo`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE}/acessar`, changeFrequency: 'yearly', priority: 0.3 },
  ] : [
    { url: `${SITE_IGREJA}/`, changeFrequency: 'monthly', priority: 1.0 },
    { url: `${SITE_IGREJA}/cultos`, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_IGREJA}/como-chegar`, changeFrequency: 'yearly', priority: 0.9 },
    { url: `${SITE_IGREJA}/sobre`, changeFrequency: 'yearly', priority: 0.7 },
    { url: `${SITE_IGREJA}/pequena-guia`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_IGREJA}/eventos`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_IGREJA}/ofertar`, changeFrequency: 'yearly', priority: 0.5 },
    /* Follow Camp 2027: página de evento, com prazo. Sai daqui depois de
       10/02/2027, quando o retiro acabar, para o sitemap não prometer um
       evento que já passou. Muda para o Guia Follow junto com a página. */
    { url: `${SITE_IGREJA}/followcamp`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${SITE_IGREJA}/privacidade`, changeFrequency: 'yearly', priority: 0.2 },
  ];

  return paginas.map(p => ({ ...p, lastModified: agora }));
}
