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

/* =============================================================================
   O ESQUELETO DAS ÁREAS

   06/09/2026. A /servir existe para listar as áreas, e enquanto carregava ela
   mostrava 500px de branco com a frase "Carregando as áreas" perdida no meio.
   Numa conexão lenta esse vazio É a página: a primeira impressão do site é uma
   tela em branco com uma legenda.

   E quando os dados chegavam, a página pulava — o vazio de 500px virava uma
   grade de 5 cartões de 420px, e tudo que estava abaixo descia de uma vez.

   O esqueleto resolve as duas coisas com a mesma peça: ocupa exatamente a
   forma que os cartões vão ocupar (inclusive o primeiro, que atravessa duas
   colunas), então não há salto, e diz sem palavra nenhuma o que está vindo.

   `aria-hidden` na grade e o aviso de verdade num `role=status` invisível:
   quem usa leitor de tela ouve "Carregando as áreas", não cinco cartões
   fantasma.
============================================================================= */
/* 16/09/2026: a home e a /servir deixaram de usar os cartões de 420px. A home
   mostra um rolo de fotos verticais (.rostos) e a /servir uma lista de
   escolha (.areas-esc). O esqueleto tem que ter a forma do que vem, senão
   volta o salto que ele existe para evitar: `forma` escolhe o desenho. */
export function AreasCarregando({ n = 5, forma = 'cartoes' }: { n?: number; forma?: 'cartoes' | 'rostos' | 'lista' }) {
  const aviso = <p className="so-leitor" role="status" aria-live="polite">Carregando as áreas</p>;
  if (forma === 'rostos') return (
    <>
      {aviso}
      <div className="rostos" aria-hidden="true">
        {Array.from({ length: n }, (_, i) => (
          <div key={i} className="rosto esqueleto">
            <span className="rosto-txt">
              <span className="esq-l" style={{ width: i % 2 ? '48%' : '62%' }} />
              <span className="esq-l selo" style={{ width: '34%' }} />
            </span>
          </div>
        ))}
      </div>
    </>
  );
  if (forma === 'lista') return (
    <>
      {aviso}
      <div className="areas-esc" aria-hidden="true">
        {Array.from({ length: n }, (_, i) => (
          <div key={i} className="area-esc esqueleto">
            <span className="area-esc-foto" />
            <span className="area-esc-nome"><span className="esq-l" style={{ width: i % 2 ? '40%' : '52%' }} /></span>
            <span className="area-esc-desc">
              <span className="esq-l fina" style={{ width: '92%' }} />
              <span className="esq-l fina" style={{ width: '84%' }} />
              <span className="esq-l fina" style={{ width: i % 2 ? '48%' : '64%' }} />
            </span>
            <span className="area-esc-selo"><span className="esq-l selo" style={{ width: '26%' }} /></span>
            <span className="area-esc-seta" />
          </div>
        ))}
      </div>
    </>
  );
  return (
    <>
      {aviso}
      <div className="casa-areas centro rente" aria-hidden="true">
        {Array.from({ length: n }, (_, i) => (
          <div key={i} className="casa-area esqueleto">
            <span className="esq-l" style={{ width: i === 0 ? '38%' : '56%' }} />
            <span className="esq-l fina" style={{ width: '84%' }} />
            <span className="esq-l fina" style={{ width: i % 2 ? '62%' : '72%' }} />
            <span className="esq-l selo" style={{ width: '30%' }} />
          </div>
        ))}
      </div>
    </>
  );
}

export function Vazio({ titulo, texto, acao }:
  { titulo: string; texto: string; acao?: { href: string; rot: string } }) {
  return (
    <div className="estado-tela">
      <span className="rot">{titulo}</span>
      <p>{texto}</p>
      {acao && (/^https?:/.test(acao.href)
        ? <a href={acao.href} target="_blank" rel="noreferrer" className="acao">{acao.rot}</a>
        : <Link href={acao.href} className="acao">{acao.rot}</Link>)}
    </div>
  );
}

/* o link de conversa a partir do número do banco: DDD + número vira 55 na
   frente, e o texto entra pronto. Vive aqui para que a página da área e o
   cartão de pessoa montem o mesmo link. */
export const linkZap = (zap?: string | null, texto?: string) => {
  const numero = zap ? (zap.length <= 11 ? '55' + zap : zap) : null;
  return numero ? `https://wa.me/${numero}${texto ? '?text=' + encodeURIComponent(texto) : ''}` : null;
};

/* o cartão de quem vai falar com a pessoa. Nome, papel e o canal real. */
export function Pessoa({ nome, papel, zap, texto }:
  { nome: string; papel: string; zap?: string | null; texto?: string }) {
  const ini = nome.trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  const link = linkZap(zap, texto);
  return (
    <div className="pessoa">
      <span className="pessoa-ini" aria-hidden="true">{ini}</span>
      <span className="pessoa-txt">
        <b>{nome}</b>
        <span>{papel}</span>
      </span>
      {link && (
        <a className="acao" href={link} target="_blank" rel="noreferrer"
           style={{ fontSize: 'var(--t-min)', padding: '12px 18px' }}>
          WhatsApp
        </a>
      )}
    </div>
  );
}
