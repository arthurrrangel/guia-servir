/* Cada navegação remonta este template: o conteúdo novo entra com um fade
   curto (CSS puro, ver .entra-pagina). Sem JS, sem biblioteca, e respeita
   prefers-reduced-motion. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="entra-pagina">{children}</div>;
}
