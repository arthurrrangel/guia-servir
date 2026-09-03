import type { Metadata } from 'next';

/* Sem isto, toda aba do líder (Painel, Escala, Time…) mostrava o mesmo título
   genérico no navegador — quem trabalha com duas abas abertas não distinguia
   qual era qual. O template do layout raiz vira "Entrar · GUIA Church". */

/* NOINDEX. O cabeçalho X-Robots-Tag em next.config.mjs já cobre esta rota, e
   é ele que vale para robô que não executa JavaScript. Esta meta é a segunda
   trava, para o caso de a rota mudar de nome e sair da lista de lá: uma tela
   de sistema não pode virar pública por esquecimento de configuração. */
export const metadata: Metadata = {
  title: 'Entrar',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
