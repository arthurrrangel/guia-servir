/* O SEGREDO DO ROBÔ DO WHATSAPP · 26/10/2026. Só no servidor.

   O robô (robo-whatsapp/) lê a escala por /api/robo/grupos com um segredo
   próprio, ROBO_WHATSAPP_SEGREDO, que o Arthur cria e guarda nos dois lados.
   Só no cabeçalho, nunca na URL (a mesma regra do cron: query string fica
   gravada em log). Sem a variável no servidor, ou com uma curta demais, a
   rota fica fechada. A comparação não deixa o tempo da resposta contar
   quantos caracteres bateram. */
import { createHash, timingSafeEqual } from 'node:crypto';

export const SEGREDO_MINIMO = 32;

export function autorizado(cabecalho: string | null | undefined, segredo: string | null | undefined): boolean {
  if (!segredo || segredo.length < SEGREDO_MINIMO) return false;
  const m = /^Bearer\s+(\S+)$/.exec(String(cabecalho || '').trim());
  if (!m) return false;
  const a = createHash('sha256').update(m[1]).digest();
  const b = createHash('sha256').update(segredo).digest();
  return timingSafeEqual(a, b);
}
