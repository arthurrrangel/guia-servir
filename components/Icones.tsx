/* Ícones em SVG puro, traço 1.7, sem dependências.

   CANTO ZERO AQUI TAMBÉM. Os ícones eram a última coisa arredondada do
   produto: rx=2, 2.5, 3 e 4 espalhados pelos retângulos, enquanto botão,
   campo, card e tag já eram todos retos. Ícone com canto mole ao lado de
   caixa reta lê como ícone emprestado de outro sistema.

   O círculo fica, porque círculo aqui não é canto arredondado: é a outra
   primitiva — a mesma que marca estado no ponto e no contador. */
type P = { className?: string };
const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24', width: 18, height: 18 };

export const IcPainel = ({ className }: P) => (
  <svg {...base} className={className}><rect x="3" y="3" width="7.5" height="7.5"/><rect x="13.5" y="3" width="7.5" height="7.5"/><rect x="3" y="13.5" width="7.5" height="7.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5"/></svg>
);
export const IcCalendario = ({ className }: P) => (
  <svg {...base} className={className}><rect x="3" y="5" width="18" height="16"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>
);
export const IcTime = ({ className }: P) => (
  <svg {...base} className={className}><circle cx="9" cy="8.5" r="3.2"/><path d="M2.8 19.4c.9-3 3.3-4.6 6.2-4.6s5.3 1.6 6.2 4.6"/><circle cx="17" cy="9.5" r="2.5"/><path d="M16.4 14.9c2.4.2 4.2 1.6 4.9 3.9"/></svg>
);
export const IcAjustes = ({ className }: P) => (
  <svg {...base} className={className}><path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h9M17 17h3"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="15" cy="17" r="2"/></svg>
);
export const IcCopiar = ({ className }: P) => (
  <svg {...base} className={className}><rect x="8" y="8" width="12" height="12"/><path d="M5 15.5A2.5 2.5 0 0 1 4 13.5V6.2A2.2 2.2 0 0 1 6.2 4h7.3A2.5 2.5 0 0 1 15.5 5"/></svg>
);
export const IcCadeado = ({ className, aberto }: P & { aberto?: boolean }) => (
  <svg {...base} className={className}>
    <rect x="5" y="10.5" width="14" height="9.5"/>
    {aberto ? <path d="M8 10.5V7.5a4 4 0 0 1 7.5-1.8"/> : <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>}
  </svg>
);
export const IcDado = ({ className }: P) => (
  <svg {...base} className={className}><rect x="3.5" y="3.5" width="17" height="17"/><circle cx="8.6" cy="8.6" r="1.15" fill="currentColor" stroke="none"/><circle cx="15.4" cy="8.6" r="1.15" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none"/><circle cx="8.6" cy="15.4" r="1.15" fill="currentColor" stroke="none"/><circle cx="15.4" cy="15.4" r="1.15" fill="currentColor" stroke="none"/></svg>
);
export const IcCheck = ({ className }: P) => (
  <svg {...base} className={className}><path d="M4.5 12.5 10 18 19.5 6.5"/></svg>
);
export const IcX = ({ className }: P) => (
  <svg {...base} className={className}><path d="M6 6l12 12M18 6 6 18"/></svg>
);
export const IcAlerta = ({ className }: P) => (
  <svg {...base} className={className}><path d="M12 4 2.8 19.5h18.4Z"/><path d="M12 10v4.2"/><circle cx="12" cy="16.9" r=".4" fill="currentColor"/></svg>
);
export const IcInfo = ({ className }: P) => (
  <svg {...base} className={className}><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><circle cx="12" cy="8" r=".4" fill="currentColor"/></svg>
);
export const IcSeta = ({ className, dir = 'd' }: P & { dir?: 'e' | 'd' }) => (
  <svg {...base} className={className}>{dir === 'e' ? <path d="M14.5 5.5 8 12l6.5 6.5"/> : <path d="M9.5 5.5 16 12l-6.5 6.5"/>}</svg>
);
export const IcSino = ({ className }: P) => (
  <svg {...base} className={className}><path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6Z"/><path d="M10 19a2.2 2.2 0 0 0 4 0"/></svg>
);
export const IcSair = ({ className }: P) => (
  <svg {...base} className={className}><path d="M14 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7"/><path d="M17 8.5 20.5 12 17 15.5M10 12h10"/></svg>
);
/* A marca é o chevron da logo da igreja. Um traço só, sem caixa em volta:
   a caixa preta já é o próprio botão. */
export const IcMarca = ({ className }: P) => (
  <svg {...base} className={className} strokeWidth={2.4} viewBox="0 0 24 24">
    <path d="M9 5.5 16.5 12 9 18.5" />
  </svg>
);
export const IcGrupo = ({ className }: P) => (
  <svg {...base} className={className}><circle cx="8" cy="9" r="3"/><path d="M2.5 19c.7-2.8 2.9-4.3 5.5-4.3s4.8 1.5 5.5 4.3"/><circle cx="17" cy="9.5" r="2.4"/><path d="M16 14.8c2.3.2 4 1.6 4.7 3.9"/></svg>
);
export const IcMais = ({ className }: P) => (
  <svg {...base} className={className}><path d="M12 5.5v13M5.5 12h13"/></svg>
);
export const IcEstrela = ({ className, cheia }: P & { cheia?: boolean }) => (
  <svg {...base} className={className} fill={cheia ? 'currentColor' : 'none'}>
    <path d="M12 3.5l2.6 5.27 5.82.85-4.21 4.1.99 5.79L12 16.77 6.99 19.5l.99-5.79-4.21-4.1 5.82-.85z"/>
  </svg>
);

export const IcBusca = ({ className }: P) => (
  <svg {...base} className={className}><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>
);
