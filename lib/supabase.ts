'use client';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/* A chave "anon" é pública por design: ela só diz QUAL projeto é. Quem decide o
   que cada pessoa pode ver é o RLS dentro do banco, que já está fechado:
   nenhuma tabela é legível sem login de líder autorizado. */
const PADRAO = {
  url: 'https://qjtcaijhgldypudzyafz.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqdGNhaWpoZ2xkeXB1ZHp5YWZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5MzkzMzcsImV4cCI6MjEwMTUxNTMzN30.9SHDqeDMkiNCr5pJdFoQMO87EcKRgusaAyCM10ojJKU',
};
const K = 'escala.credenciais';

export type Credenciais = { url: string; key: string };

export function lerCredenciais(): Credenciais | null {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(K);
      if (raw) { const c = JSON.parse(raw); if (c?.url && c?.key) return c; }
    } catch {}
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || PADRAO.url;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || PADRAO.key;
  return url && key ? { url, key } : null;
}

export function gravarCredenciais(c: Credenciais) {
  localStorage.setItem(K, JSON.stringify(c));
  cliente = null;
}

/* Lock de sessão que NUNCA fica esperando.
   O navigator.locks padrão do supabase-js espera para sempre se outra aba
   (por exemplo, uma aba antiga travada) estiver segurando o lock — e o app
   inteiro congela no esqueleto. Aqui: tenta pegar o lock se estiver livre;
   se não estiver, roda mesmo assim. O pior caso vira uma escrita concorrente
   de token entre abas (inofensivo aqui), em vez de um app morto. */
async function lockSemEspera<R>(nome: string, _timeout: number, fn: () => Promise<R>): Promise<R> {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    let rodou = false; let valor: R; let erro: unknown;
    try {
      await navigator.locks.request(nome, { ifAvailable: true }, async () => {
        rodou = true;
        try { valor = await fn(); } catch (e) { erro = e; }
      });
    } catch { /* a API do lock falhou ANTES de rodar fn — cai no fallback */ }
    if (rodou) {                       // fn rodou exatamente uma vez
      if (erro !== undefined) throw erro;  // erro real de fn propaga, nunca é engolido
      return valor!;
    }
  }
  return await fn();
}

let cliente: SupabaseClient | null = null;
/** Cliente do LÍDER: sessão persistida, lock que não bloqueia. */
export function sb(): SupabaseClient | null {
  if (cliente) return cliente;
  const c = lerCredenciais();
  if (!c) return null;
  cliente = createClient(c.url, c.key, {
    auth: { persistSession: true, autoRefreshToken: true, lock: lockSemEspera },
  });
  return cliente;
}

let clientePublico: SupabaseClient | null = null;
/** Cliente da página do VOLUNTÁRIO: sem sessão, sem storage, sem lock.
    A autorização ali é o token na URL, validado pelo banco. */
export function sbPublico(): SupabaseClient | null {
  if (clientePublico) return clientePublico;
  const c = lerCredenciais();
  if (!c) return null;
  clientePublico = createClient(c.url, c.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return clientePublico;
}
