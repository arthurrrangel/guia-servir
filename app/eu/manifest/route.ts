import { NextResponse } from 'next/server';
import { IGREJA } from '@/lib/igreja';

/* =============================================================================
   O MANIFESTO DE QUEM JÁ SERVE · /eu/manifest?t=<token>

   16/09/2026. "Adicionar à tela inicial" resolve o problema de guardar o link
   pessoal de um jeito que nenhuma mensagem resolve: o link vira um ícone no
   celular. Só que o manifesto geral do site (app/manifest.ts) abre em "/", e
   no iPhone o app instalado tem armazenamento PRÓPRIO, separado do Safari:
   o token guardado no navegador não existe dentro dele. Quem instalasse pelo
   manifesto geral abriria a home, sem escala nenhuma.

   Por isso a página pessoal troca o manifesto pelo dela: `start_url` é o
   próprio link pessoal. O token vai na URL do manifesto como já vai na URL da
   página, e o iPhone lê o manifesto na hora de instalar. Nenhuma credencial
   nova nasce aqui; a que existe passa a abrir no lugar certo.

   O token só é aceito no formato do banco (letras e dígitos, até 64). Qualquer
   outra coisa cai no manifesto geral, e o JSON nunca recebe texto solto.
   ============================================================================= */

export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  const t = new URL(req.url).searchParams.get('t') || '';
  const valido = /^[A-Za-z0-9_-]{1,64}$/.test(t);
  const inicio = valido ? `/eu/${t}` : '/eu';
  const manifesto = {
    name: `Minha escala · ${IGREJA.nome}`,
    short_name: 'Minha escala',
    description: `Sua escala na ${IGREJA.nome}: confirmar, avisar quando não pode, ver o mês.`,
    id: inicio,
    start_url: inicio,
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#252525',
    theme_color: '#252525',
    lang: 'pt-BR',
    icons: [
      { src: '/icone-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  return NextResponse.json(manifesto, {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      /* o manifesto carrega o token: nunca fica em cache compartilhado */
      'Cache-Control': 'private, no-store',
    },
  });
}
