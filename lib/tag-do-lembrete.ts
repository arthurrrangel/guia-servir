/* =============================================================================
   A TAG DO LEMBRETE, POR VÍNCULO E DATA · só no servidor · 26/10/2026

   O aparelho usa a tag do aviso para saber qual substitui qual: um aviso novo
   com a mesma tag apaga o anterior da bandeja (public/sw.js repassa a tag). A
   do lembrete era `lembrete-<data>`. Quem serve em dois ministérios e ligou o
   aviso nos dois links, no mesmo celular, tem dois vínculos com o mesmo
   aparelho; com escala nos dois no mesmo dia, o lembrete de um apagava o do
   outro.

   Agora a tag é a data e uma impressão do vínculo: o SHA-256 do token junto
   com a data, do qual só os 16 primeiros dígitos vão para a tag. O token não
   aparece nela, nem codificado. O lembrete de 3 dias e o de 1 dia do mesmo
   vínculo e dia continuam com a mesma tag, e o de 1 dia substitui o de 3,
   como antes. Se o token de um vínculo mudar, a impressão muda junto.

   Fica fora de lib/aviso.ts, que não leva `node:crypto`; quem importa este
   arquivo é só a rota do lembrete (app/api/cron/lembretes). Título, texto e
   endereço continuam vindo de `mensagemDoLembrete`, sem mudança.
   ============================================================================= */
import { createHash } from 'node:crypto';
import { mensagemDoLembrete, type LinhaDoLembrete, type Mensagem } from './aviso';

export function tagDoLembrete(token: string, data: string): string {
  const impressao = createHash('sha256').update(`guia-servir/lembrete\u0000${token}\u0000${data}`).digest('hex').slice(0, 16);
  return `lembrete-${data}-${impressao}`;
}

export function lembreteParaMandar(l: LinhaDoLembrete, base: string, cultoHora: string, followHora?: string | null): Mensagem {
  return { ...mensagemDoLembrete(l, base, cultoHora, followHora), tag: tagDoLembrete(l.token, l.data) };
}
