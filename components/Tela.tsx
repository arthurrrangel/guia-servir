'use client';
import Link from 'next/link';
import { Logo } from './Marca';
import { IcSeta } from './Icones';

/* =============================================================================
   O CASCO DAS TELAS INTERNAS

   Toda tela que não é a home usa este casco: barra fixa com a marca à
   esquerda e UMA saída à direita. Uma só. Barra de tela interna com menu
   completo faz a pessoa sair do fluxo que ela mesma começou.

   Existe porque antes cada tela montava o próprio topo, e dava para ver:
   três acabamentos para o mesmo cabeçalho.
   ============================================================================= */

export function Tela({ volta, voltaRot = 'Voltar', children, escura }:
  { volta?: string; voltaRot?: string; children: React.ReactNode; escura?: boolean }) {
  return (
    <div className={'tela' + (escura ? ' tela-escura' : '')}>
      <header className="tela-topo">
        <Link href="/" className="marca-link" aria-label="GUIA Church"><Logo className="logo" /></Link>
        {volta && <Link href={volta} className="tela-volta"><IcSeta />{voltaRot}</Link>}
      </header>
      {children}
    </div>
  );
}

/* índice, título, uma linha de apoio. Sempre nessa ordem, nunca mais que isso. */
export function Cabeca({ rot, titulo, apoio, menor }:
  { rot?: string; titulo: string; apoio?: string; menor?: boolean }) {
  return (
    <div className="cabeca">
      {rot && <span className="rot">{rot}</span>}
      <h1 className={menor ? 'menor' : undefined}>{titulo}</h1>
      {apoio && <p>{apoio}</p>}
    </div>
  );
}

/* os três estados que todo fluxo tem, e que quase todo site esquece de ter */
export function Carregando({ o = 'Carregando' }: { o?: string }) {
  return (
    <div className="estado-tela" role="status" aria-live="polite">
      <span className="pulso" aria-hidden="true" />
      <p>{o}</p>
    </div>
  );
}

export function Vazio({ titulo, texto, acao }:
  { titulo: string; texto: string; acao?: { href: string; rot: string } }) {
  return (
    <div className="estado-tela">
      <span className="rot">{titulo}</span>
      <p>{texto}</p>
      {acao && <Link href={acao.href} className="acao">{acao.rot}</Link>}
    </div>
  );
}

/* o cartão de quem vai falar com a pessoa. Nome, papel e o canal real. */
export function Pessoa({ nome, papel, zap, texto }:
  { nome: string; papel: string; zap?: string | null; texto?: string }) {
  const ini = nome.trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  const numero = zap ? (zap.length <= 11 ? '55' + zap : zap) : null;
  const link = numero ? `https://wa.me/${numero}${texto ? '?text=' + encodeURIComponent(texto) : ''}` : null;
  return (
    <div className="pessoa">
      <span className="pessoa-ini" aria-hidden="true">{ini}</span>
      <span className="pessoa-txt">
        <b>{nome}</b>
        <span>{papel}</span>
      </span>
      {link && (
        <a className="acao" href={link} target="_blank" rel="noreferrer"
           style={{ fontSize: 10.5, padding: '12px 18px' }}>
          WhatsApp
        </a>
      )}
    </div>
  );
}
