import { SITE, SITE_IGREJA } from '@/lib/igreja';

/* =============================================================================
   OS DOIS SITES · 19/10/2026

   O Arthur separou o site em dois: guiachurch.com é a igreja (cultos, quem
   somos, como chegar, eventos, Pequena Guia, ofertar) e guiaservir.com é o
   Servir (a LP na raiz, as cinco áreas, "não sei onde me encaixo", o espaço
   do voluntário e o sistema). Os dois domínios continuam servindo o MESMO
   app: quem decide o que cada endereço mostra são as regras por host de
   next.config.mjs. Este arquivo é a outra metade: os links de um site para
   o outro.

   POR QUE O LINK ENTRE SITES É ENDEREÇO COMPLETO, E NÃO CAMINHO. Um <Link>
   do Next para outro domínio busca a página por fetch, e o fetch para outra
   origem esbarra no CORS: a navegação falha calada e o Next recarrega. Com o
   endereço completo num <a>, o navegador vai direto.

   E NO COMPUTADOR DE TESTE. Lá os dois sites são o mesmo servidor
   (localhost), sem domínio. Com NEXT_PUBLIC_SITES_LOCAL=1 no build, os links
   entre sites viram caminhos do mesmo servidor e a LP do Servir mora em
   /servir, onde o arquivo dela está; a auditoria anda pelos dois sem sair da
   máquina. Em produção a variável não existe.
   ============================================================================= */

const LOCAL = process.env.NEXT_PUBLIC_SITES_LOCAL === '1';

/** Um endereço do Guia Servir, a partir de qualquer um dos dois sites.
 *  '/' é a LP; '/#areas', a seção das áreas; '/eu', o espaço do voluntário. */
export function noServir(caminho = '/'): string {
  if (LOCAL) return caminho === '/' || caminho.startsWith('/#') ? '/servir' + caminho.slice(1) : caminho;
  return SITE + caminho;
}

/** Um endereço do Guia Church, a partir do Guia Servir. */
export function naIgreja(caminho = '/'): string {
  return LOCAL ? caminho : SITE_IGREJA + caminho;
}

/** A LP do Servir vista de dentro do próprio Servir: a raiz do domínio
 *  (o arquivo mora em /servir; o next.config reescreve). '#areas' → '/#areas'. */
export function lp(ancora = ''): string {
  return (LOCAL ? '/servir' : '/') + ancora;
}

/** O endereço é de um dos sites da GUIA: abre na mesma aba, sem o
 *  target="_blank" dos sites de fora. */
export const daGuia = (href: string) =>
  /^https:\/\/(www\.)?(guiaservir|guiachurch|guiafollow)\.com(\/|$|[?#])/.test(href);

/** O host do pedido é do Guia Servir (guiaservir.com ou um subdomínio dele,
 *  como o antigo escalas.guiaservir.com). Para robots e sitemap. */
export const ehServir = (host: string | null) =>
  /(^|\.)guiaservir\.com$/i.test((host || '').split(':')[0]);
