/* A chave PÚBLICA do aviso no celular (104). O navegador precisa dela para
   se inscrever. Não é segredo: é a metade que o serviço de aviso usa para
   conferir que o aviso veio deste servidor. Sem ela configurada no Vercel,
   devolve `null`, e a tela do voluntário não oferece ligar o aviso. */
export const dynamic = 'force-dynamic';

export function GET() {
  const chave = process.env.VAPID_PUBLIC_KEY || null;
  return Response.json({ chave }, { headers: { 'cache-control': 'public, max-age=300' } });
}
