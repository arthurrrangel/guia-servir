import type { MetadataRoute } from 'next';
import { IGREJA, SITE } from '@/lib/igreja';

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
   · /servir/[area] — ficam fora por não serem estáveis: as áreas abrem e
     fecham no banco, e sitemap com URL que some vira erro no Search Console.
     Elas continuam indexáveis pelo link interno a partir de /servir, que é o
     caminho que o Google usa de verdade.
   · /guia-church-tv — só entra quando houver canal (ver lib/igreja.ts).

   PRIORIDADE E FREQUÊNCIA são dicas fracas: o Google praticamente as ignora
   desde 2023. Ficam aqui porque outros buscadores ainda leem, e porque a
   ordem relativa documenta a hierarquia real do site — /cultos e /como-chegar
   acima da própria home, porque são elas que tiram alguém de casa.
   ============================================================================= */

export default function sitemap(): MetadataRoute.Sitemap {
  const agora = new Date();

  const paginas: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, changeFrequency: 'monthly', priority: 1.0 },
    { url: `${SITE}/cultos`, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE}/como-chegar`, changeFrequency: 'yearly', priority: 0.9 },
    { url: `${SITE}/sobre`, changeFrequency: 'yearly', priority: 0.7 },
    { url: `${SITE}/pequena-guia`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE}/servir`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE}/acessar`, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${SITE}/privacidade`, changeFrequency: 'yearly', priority: 0.2 },
  ];

  if (IGREJA.youtube) {
    paginas.splice(5, 0, {
      url: `${SITE}/guia-church-tv`, changeFrequency: 'weekly', priority: 0.6,
    });
  }

  return paginas.map(p => ({ ...p, lastModified: agora }));
}
