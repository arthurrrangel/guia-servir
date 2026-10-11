/* Endereço e chave pública do projeto, sem 'use client'.

   Existe separado de lib/supabase.ts por um motivo prático: os layouts que
   geram o <title> e o card de prévia do WhatsApp são SERVER components, e não
   podem importar um módulo marcado 'use client'.

   E o valor padrão importa: as variáveis NEXT_PUBLIC_* não estão definidas no
   projeto da Vercel. O cliente sempre teve esse fallback; os layouts novos
   não tinham, e por isso o título do link do Louvor voltava genérico em vez de
   "Servir · Louvor" — exatamente o problema que eles existiam para resolver.

   A chave anon é pública por design: ela só diz QUAL projeto é. Quem decide o
   que cada sessão enxerga é o RLS dentro do banco. */

export const SUPA_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qjtcaijhgldypudzyafz.supabase.co';

export const SUPA_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqdGNhaWpoZ2xkeXB1ZHp5YWZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5MzkzMzcsImV4cCI6MjEwMTUxNTMzN30.9SHDqeDMkiNCr5pJdFoQMO87EcKRgusaAyCM10ojJKU';

/** Chama uma RPC pública do lado do servidor, para gerar metadata. */
export async function rpcPublica<T = any>(
  fn: string, corpo: Record<string, unknown> = {}, segundos = 3600,
): Promise<T | null> {
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      next: { revalidate: segundos },
    });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch { return null; }
}

/* =============================================================================
   A RPC PÚBLICA NO NAVEGADOR, SEM O CLIENTE DO SUPABASE — 11/10/2026

   As páginas públicas (home, /servir, as áreas, /eu) só leem quatro RPCs
   abertas ao anon. Para isso elas carregavam o supabase-js inteiro (um
   chunk de 124 kB, ~40 kB comprimido) e pagavam o custo de analisar ele no
   celular antes de qualquer coisa. O Lighthouse da home marcava 510 ms de
   bloqueio da thread principal.

   Um POST com fetch faz o mesmo. A forma do retorno é a do supabase-js
   ({ data, error }) de propósito: as páginas trocaram `s.rpc(...)` por
   `rpc(...)` e nada mais. O cliente de verdade continua em lib/supabase.ts
   para as telas que têm sessão (painel, escala, cadastro com `candidatar`).

   `erro` nunca é lançado: rede fora, 4xx e 5xx viram { data: null, error }
   e a página decide o que mostrar (a mesma política de antes). */
export type Resultado<T> = { data: T | null; error: { message: string; status?: number } | null };

export async function rpc<T = unknown>(fn: string, corpo: Record<string, unknown> = {}): Promise<Resultado<T>> {
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(corpo),
    });
    if (!r.ok) {
      let message = `HTTP ${r.status}`;
      try { const j = await r.json(); if (j && typeof j.message === 'string') message = j.message; } catch { /* corpo não é JSON */ }
      return { data: null, error: { message, status: r.status } };
    }
    const texto = await r.text();
    return { data: texto ? (JSON.parse(texto) as T) : null, error: null };
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : 'rede' } };
  }
}
