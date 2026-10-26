/* /api/robo/pedidos · O ROBÔ PASSA PARA BUSCAR OS PEDIDOS · 26/10/2026.

   O robô do WhatsApp chama a cada minuto: conta que está vivo, devolve o que
   fez e leva os pedidos de "mandar agora" que a liderança fez no "Mandar nos
   grupos". O corpo está em lib/robo-pedidos-rota.ts (testado sem o Next). */
import { createClient } from '@supabase/supabase-js';
import { atenderOPedidoDoRobo } from '@/lib/robo-pedidos-rota';

export const dynamic = 'force-dynamic';

function servico() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qjtcaijhgldypudzyafz.supabase.co';
  const chave = process.env.SUPABASE_SERVICE_ROLE || '';
  return chave ? createClient(url, chave, { auth: { persistSession: false } }) : null;
}

export async function POST(req: Request) {
  return atenderOPedidoDoRobo(req, process.env.ROBO_WHATSAPP_SEGREDO, servico);
}
