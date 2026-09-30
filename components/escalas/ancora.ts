/* =============================================================================
   A ÂNCORA QUE CHEGA ANTES DA TELA · 30/09/2026

   Os links do sistema levam a um ponto da página (`/escala#d2026-10-31`,
   `/painel#cobrar`). A tela nasce depois de a casca ler o banco, e continua
   crescendo por mais um instante: o dia do link abre, a coluna da direita
   chega com os números. Rolar uma vez, no primeiro desenho em que o alvo
   existe, deixava o alvo longe do topo. Medido na auditoria de 30/09, a
   1440px: o sábado 31/10 ficava a 786px do topo, com só o título à vista, e
   o "Sem resposta" do Painel, a 298px.

   Aqui a rolagem é instantânea (a suave mira o fim da página de AGORA, que
   ainda é curta) e se refaz a cada vez que a página muda de tamanho, por
   até um segundo e meio. Qualquer gesto da pessoa (roda, toque, tecla,
   clique) encerra na hora: a página nunca briga com quem já está rolando.
   A barra de rolagem arrastada não dispara nenhum desses eventos, então
   qualquer rolagem que não foi esta função quem fez também encerra.
============================================================================= */

const GESTOS = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const;

/** Rola até o elemento `id` e o mantém no topo enquanto a página assenta.
 *  Devolve false quando o elemento ainda não existe (quem chama tenta de novo
 *  no próximo desenho). */
export function rolarAte(id: string, ms = 1500): boolean {
  /* onde a última rolagem desta função deixou a página */
  let deixou = -1;
  const alinhar = () => {
    const el = document.getElementById(id);
    if (el) { el.scrollIntoView({ block: 'start', behavior: 'instant' as ScrollBehavior }); deixou = window.scrollY; }
    return !!el;
  };
  if (!alinhar()) return false;
  if (typeof ResizeObserver === 'undefined') return true;

  let ativo = true;
  const obs = new ResizeObserver(() => { if (ativo) alinhar(); });
  /* rolagem que não veio daqui (a barra arrastada, por exemplo) */
  const rolouSozinha = () => { if (Math.abs(window.scrollY - deixou) > 2) parar(); };
  const parar = () => {
    if (!ativo) return;
    ativo = false;
    obs.disconnect();
    window.clearTimeout(prazo);
    for (const g of GESTOS) window.removeEventListener(g, parar, true);
    window.removeEventListener('scroll', rolouSozinha);
  };
  const prazo = window.setTimeout(parar, ms);
  for (const g of GESTOS) window.addEventListener(g, parar, { capture: true, passive: true });
  window.addEventListener('scroll', rolouSozinha, { passive: true });
  obs.observe(document.body);
  return true;
}
