/* =============================================================================
   AS VAGAS DA VIRADA, NO NAVEGADOR · 21/11/2026

   Uma consulta só por página (GET /api/virada): o cartão do ingresso, a
   barra das vagas e o formulário leem a mesma resposta. Depois de uma
   reserva gravada, o formulário avisa o número novo e quem ouve atualiza.
   `restantes` é null quando o banco não responde (a 118 ainda não rodou, ou
   caiu): aí nenhuma tela mostra número de vagas, porque não há número
   verdadeiro para mostrar.
   ============================================================================= */
export type Vagas = { aberta: boolean; restantes: number | null };

let pedido: Promise<Vagas | null> | null = null;
const ouvintes = new Set<(v: Vagas) => void>();

export function lerVagas(): Promise<Vagas | null> {
  if (!pedido) {
    pedido = fetch('/api/virada', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(j => (j && typeof j.aberta === 'boolean'
        ? { aberta: j.aberta, restantes: typeof j.restantes === 'number' ? j.restantes : null }
        : null))
      .catch(() => null);
  }
  return pedido;
}

export function ouvirVagas(f: (v: Vagas) => void): () => void {
  ouvintes.add(f);
  return () => { ouvintes.delete(f); };
}

export function avisarVagas(v: Vagas): void {
  pedido = Promise.resolve(v);
  ouvintes.forEach(f => f(v));
}
