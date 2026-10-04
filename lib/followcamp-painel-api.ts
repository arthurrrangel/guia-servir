'use client';
/* O painel do Follow Camp fala com o banco pela MESMA porta das Demandas
   (04/10/2026, migração 110): o link pessoal guardado ou a sessão do e-mail.
   Quem decide se pode é o banco (`fc27_*` respondem SEM_ACESSO e SO_ADMIN),
   não esta tela. Os erros de infraestrutura têm o mesmo nome que lá
   (`rpcCom`): SEM_SISTEMA quando a 110 ainda não rodou. */
import { rpcCom, meuToken } from './demandas/api';
import { sb } from './supabase';
import type { FichaBanco, PagamentoBanco } from './followcamp-painel';

const rpc = <T>(nome: string, args: Record<string, unknown>) => rpcCom<T>(sb() as any, nome, args);
const t = () => meuToken();

export type DadosDoPainel = { eu: string; agora: string; fichas: FichaBanco[]; pagamentos: PagamentoBanco[] };

export const lerPainel = () => rpc<DadosDoPainel>('fc27_painel', { p_token: t() });
export const lancarFicha = (p: Record<string, unknown>) => rpc<{ id: string }>('fc27_ficha_lancar', { p_token: t(), p });
export const cancelarFicha = (id: string, cancelar: boolean, motivo?: string) =>
  rpc<Record<string, never>>('fc27_ficha_cancelar', { p_token: t(), p_id: id, p_cancelar: cancelar, p_motivo: motivo ?? null });
export const registrarPagamento = (p: Record<string, unknown>) => rpc<{ id: string }>('fc27_pagamento_registrar', { p_token: t(), p });
export const ajustarPagamento = (id: string, p: Record<string, unknown>) =>
  rpc<Record<string, never>>('fc27_pagamento_ajustar', { p_token: t(), p_id: id, p });
export const apagarPagamento = (id: string) => rpc<Record<string, never>>('fc27_pagamento_apagar', { p_token: t(), p_id: id });
