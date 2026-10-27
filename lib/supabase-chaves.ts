/* O PROJETO DO SUPABASE, PARA O NAVEGADOR E PARA O SERVIDOR · 26/10/2026.

   Morava dentro de lib/supabase.ts, que é 'use client'. A rota do dress
   code (116) fala com o banco como o líder que chamou (o JWT dele), e
   precisa do mesmo endereço e da mesma chave pública sem importar uma folha
   de navegador. A chave "anon" é pública por design: ela só diz QUAL projeto
   é; quem decide o que cada pessoa pode ver é o RLS. */
export const PADRAO_DO_SUPABASE = {
  url: 'https://qjtcaijhgldypudzyafz.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqdGNhaWpoZ2xkeXB1ZHp5YWZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5MzkzMzcsImV4cCI6MjEwMTUxNTMzN30.9SHDqeDMkiNCr5pJdFoQMO87EcKRgusaAyCM10ojJKU',
};

/** O endereço e a chave pública que valem aqui (as variáveis de ambiente, ou o padrão). */
export function projetoDoSupabase(): { url: string; key: string } {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || PADRAO_DO_SUPABASE.url,
    key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || PADRAO_DO_SUPABASE.key,
  };
}
