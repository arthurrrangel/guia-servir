/* OS ÍCONES DO SISTEMA DE DEMANDAS · 23/09/2026.

   Traço de 1,75 num quadro de 24, na cor do texto (`currentColor`), e
   `aria-hidden` sempre: o ícone acompanha a palavra, nunca a substitui. Quem
   lê a tela com leitor ouve "Avisos", e não "sino".

   Desenhados aqui, e não de uma biblioteca: são vinte e poucos, a folha
   decide o tamanho de cada um pelo lugar onde ele mora (`.dm-nav-item svg`,
   `.dm-btn svg`...), e uma dependência para isso seria peso sem motivo.

   Sem componente de servidor aqui dentro de propósito: quem usa é cliente. */

export type NomeDoIcone =
  | 'inicio' | 'atender' | 'nova' | 'avisos' | 'perfil' | 'numeros' | 'admin'
  | 'pessoas' | 'setores' | 'categorias' | 'anexos' | 'sair' | 'voltar' | 'seta'
  | 'busca' | 'ok' | 'alerta' | 'info' | 'erro' | 'relogio' | 'mais' | 'mensagem'
  | 'copiar' | 'fechar' | 'lista' | 'calendario' | 'portal' | 'link' | 'check'
  | 'alta' | 'urgente' | 'filtro' | 'panorama';

const DESENHO: Record<NomeDoIcone, React.ReactNode> = {
  inicio: <><path d="M3.5 10.2 12 3.5l8.5 6.7" /><path d="M5.5 8.8V19a1.5 1.5 0 0 0 1.5 1.5h3.5v-6h3v6H17a1.5 1.5 0 0 0 1.5-1.5V8.8" /></>,
  atender: <><path d="M3.5 13.5h4.8l1.4 2.5h4.6l1.4-2.5h4.8" /><path d="M6 4.5h12l2.5 9v5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5v-5z" /></>,
  nova: <path d="M12 5v14M5 12h14" />,
  avisos: <><path d="M18 15.5V11a6 6 0 1 0-12 0v4.5L4.5 18h15z" /><path d="M10 20.5a2.2 2.2 0 0 0 4 0" /></>,
  perfil: <><circle cx="12" cy="8.5" r="3.8" /><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /></>,
  numeros: <><path d="M4 20h16" /><path d="M7.5 16.5v-5M12 16.5V6.5M16.5 16.5v-8" /></>,
  admin: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
  pessoas: <><circle cx="9" cy="8.5" r="3.3" /><path d="M3 19.5a6 6 0 0 1 12 0" /><path d="M15.5 5.4a3.3 3.3 0 0 1 0 6.2" /><path d="M17.5 14.2a6 6 0 0 1 3.5 5.3" /></>,
  setores: <><rect x="4" y="4" width="6.5" height="6.5" rx="1.2" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2" /></>,
  categorias: <><path d="M3.5 12.2V4.8a1.3 1.3 0 0 1 1.3-1.3h7.4l8.3 8.3-8.7 8.7z" /><circle cx="8" cy="8" r="1.3" /></>,
  anexos: <path d="m19.5 11.5-7.7 7.7a4.8 4.8 0 0 1-6.8-6.8l8-8a3.2 3.2 0 0 1 4.5 4.5l-8 8a1.6 1.6 0 0 1-2.3-2.3l7.3-7.3" />,
  sair: <><path d="M9.5 20.5H6a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 6 3.5h3.5" /><path d="m15.5 16.5 4.5-4.5-4.5-4.5" /><path d="M20 12H9.5" /></>,
  voltar: <path d="m14.5 18-6-6 6-6" />,
  seta: <path d="m9.5 18 6-6-6-6" />,
  busca: <><circle cx="10.8" cy="10.8" r="6.3" /><path d="m20 20-4.4-4.4" /></>,
  ok: <><circle cx="12" cy="12" r="8.5" /><path d="m8.4 12.2 2.4 2.4 4.8-5" /></>,
  check: <path d="m5.5 12.5 4 4 9-9" />,
  alerta: <><path d="M10.4 4.4 3 17.3a1.8 1.8 0 0 0 1.6 2.7h14.8a1.8 1.8 0 0 0 1.6-2.7L13.6 4.4a1.8 1.8 0 0 0-3.2 0z" /><path d="M12 9.5v4" /><path d="M12 16.8h.01" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 16v-4.5" /><path d="M12 8h.01" /></>,
  erro: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.8v4.8" /><path d="M12 16h.01" /></>,
  relogio: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  mais: <><circle cx="6" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle cx="18" cy="12" r="1.2" fill="currentColor" stroke="none" /></>,
  mensagem: <path d="M4.5 19.5 5.6 16A7.8 7.8 0 1 1 8.4 18.6z" />,
  copiar: <><rect x="8.5" y="8.5" width="11" height="11" rx="1.8" /><path d="M5.5 15.5h-.3A1.7 1.7 0 0 1 3.5 13.8V5.2a1.7 1.7 0 0 1 1.7-1.7h8.6a1.7 1.7 0 0 1 1.7 1.7v.3" /></>,
  fechar: <path d="M17.5 6.5l-11 11M6.5 6.5l11 11" />,
  lista: <><path d="M9 6.5h11M9 12h11M9 17.5h11" /><path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" /></>,
  calendario: <><rect x="4" y="5.5" width="16" height="15" rx="2" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></>,
  portal: <><path d="M14.5 18.5 8 12l6.5-6.5" /><path d="M8.5 12h11.5" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  /* a prioridade tem FORMA própria, e não a cor de um estado: uma seta para
     alta, duas para urgente */
  alta: <path d="m7 14.5 5-5 5 5" />,
  urgente: <><path d="m7 12.5 5-5 5 5" /><path d="m7 17.5 5-5 5 5" /></>,
  filtro: <><path d="M4 7h16" /><path d="M7 12h10" /><path d="M10 17h4" /></>,
  /* 96 · o panorama: quatro quadros, o do alto maior (o que pede decisão) */
  panorama: <><rect x="3.5" y="3.5" width="17" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7.5" height="7" rx="1.5" /><rect x="13" y="13.5" width="7.5" height="7" rx="1.5" /></>,
};

export function Icone({ nome, className }: { nome: NomeDoIcone; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {DESENHO[nome]}
    </svg>
  );
}
