'use client';
/* O painel da Virada fala com o banco pela MESMA porta das Demandas
   (21/11/2026, migração 118), como o do Follow Camp: o link pessoal guardado
   ou a sessão do e-mail. Quem decide se pode é o banco (`virada_*` respondem
   SEM_ACESSO e SO_ADMIN), não esta tela. SEM_SISTEMA: a 118 ainda não rodou. */
import { rpcCom, meuToken } from './demandas/api';
import { sb } from './supabase';
import type { EventoBanco, ReservaBanco } from './virada-painel';

const rpc = <T>(nome: string, args: Record<string, unknown>) => rpcCom<T>(sb() as any, nome, args);

export type DadosDaVirada = { eu: string; agora: string; evento: EventoBanco | null; reservas: ReservaBanco[] };

export const lerReservas = () => rpc<DadosDaVirada>('virada_painel', { p_token: meuToken() });
export const lancarReserva = (p: Record<string, unknown>) =>
  rpc<{ id: string; repetida?: boolean; restantes?: number }>('virada_lancar', { p_token: meuToken(), p });
export const cancelarReserva = (id: string, cancelar: boolean, motivo?: string) =>
  rpc<Record<string, never>>('virada_cancelar', { p_token: meuToken(), p_id: id, p_cancelar: cancelar, p_motivo: motivo ?? null });
