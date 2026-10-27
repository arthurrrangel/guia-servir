'use client';
import { type KeyboardEvent as TeclaDoReact, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { type DressCode, amostraClara, nomeDoEstilo, urlDaImagem } from '@/lib/dress-code';

/* =============================================================================
   O DRESS CODE, PARA QUEM SERVE — 116 · 26/10/2026

   A mesma peça na página de quem está escalado (/eu/<token>) e na do link
   da mensagem do grupo (/dress/<id>): as cores como amostras, com o nome
   (combinações separadas por "ou"), o estilo e as orientações, e o painel
   de inspirações. Tocar numa imagem abre ela inteira, com anterior e
   próxima (setas, deslizar o dedo, Esc fecha).

   "Tudo deve ser extremamente simples, intuitivo e otimizado para
   dispositivos móveis": nada de botão que não seja ver.

   Imagem que não abre (apagada do armário, sem rede) sai da galeria em vez
   de ficar como um quadro quebrado. As classes `dc-*` moram em
   app/globals.css, na língua da página de quem serve.

   A IMAGEM INTEIRA É UM <dialog> MODAL, NO <body> (portal). Na página de
   quem serve, o conteúdo entra com `.entra` (uma animação de transform que
   fica "em efeito"), e um elemento assim vira o bloco de contenção de tudo
   que é `position:fixed` dentro dele: a camada escura cobria a página
   inteira, e não a tela; o Fechar ficava lá no alto da página e a foto no
   meio dela (a prova de ponta a ponta pegou). O <dialog> aberto com
   `showModal` mora na camada de cima do navegador, com a página de trás
   inerte: o Tab não escapa nem quando o toque na foto tira o foco do
   botão (a revisão pegou).
   ============================================================================= */

export default function DressCodeVisual({ dress, supabaseUrl, titulo }: {
  dress: DressCode; supabaseUrl: string; titulo?: string;
}) {
  const [aberta, setAberta] = useState<number | null>(null);
  const [quebradas, setQuebradas] = useState<string[]>([]);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const estilo = nomeDoEstilo(dress.estilo);
  const imagens = dress.imagens.filter(im => !quebradas.includes(im.caminho));
  const fechar = useCallback(() => {
    setAberta(i => { if (i !== null) setTimeout(() => refs.current[i]?.focus(), 0); return null; });
  }, []);

  return (
    <div className="dc">
      {titulo && <div className="dc-tit">{titulo}</div>}
      <div className="dc-bloco">
        <span className="rot">{dress.combinacoes.length > 1 ? 'Cores · escolha uma das combinações' : 'Cores'}</span>
        <div className="dc-cores" role="list" aria-label="Cores">
          {dress.combinacoes.map((c, i) => (
            <div className="dc-comb" role="listitem" key={i}>
              {i > 0 && <span className="dc-ou">ou</span>}
              <ul className="dc-amostras" aria-label={c.cores.map(k => k.nome).join(' e ')}>
                {c.cores.map(k => (
                  <li className="dc-cor" key={k.hex + k.nome}>
                    <span className={`dc-bola${amostraClara(k.hex) ? ' dc-bola-clara' : ''}`} style={{ background: k.hex }} aria-hidden="true" />
                    <span className="dc-nome">{k.nome}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      {(estilo || dress.orientacoes) && (
        <div className="dc-texto">
          {estilo && <span className="dc-estilo">{estilo}</span>}
          {dress.orientacoes && <p className="dc-ori">{dress.orientacoes}</p>}
        </div>
      )}
      {!!imagens.length && (
        <div className="dc-bloco">
          <span className="rot">Inspirações</span>
          <ul className={`dc-galeria dc-galeria-${Math.min(imagens.length, 3)}`} aria-label="Inspirações">
            {imagens.map((im, i) => (
              <li key={im.caminho}>
                <button type="button" className="dc-mini" ref={el => { refs.current[i] = el; }}
                  aria-label={`Ver a inspiração ${i + 1} de ${imagens.length}${im.ia ? ' (gerada por IA)' : ''}`}
                  onClick={() => setAberta(i)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={urlDaImagem(supabaseUrl, im.caminho)} alt="" loading="lazy" decoding="async"
                    onError={() => setQuebradas(q => (q.includes(im.caminho) ? q : [...q, im.caminho]))} />
                  {im.ia && <span className="dc-ia">IA</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {aberta !== null && aberta < imagens.length && (
        <Inteira imagens={imagens.map(im => urlDaImagem(supabaseUrl, im.caminho))} i={aberta}
          ir={setAberta} fechar={fechar} />
      )}
    </div>
  );
}

function Inteira({ imagens, i, ir, fechar }: {
  imagens: string[]; i: number; ir: (i: number) => void; fechar: () => void;
}) {
  const refCaixa = useRef<HTMLDialogElement | null>(null);
  const refFechar = useRef<HTMLButtonElement | null>(null);
  const inicio = useRef<number | null>(null);
  const n = imagens.length;
  const anterior = useCallback(() => ir((i - 1 + n) % n), [i, n, ir]);
  const proxima = useCallback(() => ir((i + 1) % n), [i, n, ir]);
  /* o <dialog> modal do navegador: a camada de cima de tudo (nenhum
     ancestral prende), a página de trás inerte e o Tab preso dentro dele,
     sem código nosso. Sem `showModal` (navegador antigo), abre comum: a
     folha cobre a tela do mesmo jeito. */
  useEffect(() => {
    const d = refCaixa.current;
    if (d && !d.open) {
      try { d.showModal(); } catch { d.setAttribute('open', ''); }
    }
    refFechar.current?.focus();
  }, []);
  /* o Esc também por aqui: no navegador sem `showModal` não há o pedido de
     fechar do <dialog>, e o foco pode estar fora dele (a prova pegou) */
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); fechar(); }
      else if (e.key === 'ArrowLeft' && n > 1) { e.preventDefault(); anterior(); }
      else if (e.key === 'ArrowRight' && n > 1) { e.preventDefault(); proxima(); }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [anterior, proxima, fechar, n]);
  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = antes; };
  }, []);
  /* o Tab gira entre os botões da caixa. Com a página de trás inerte, o
     navegador mandaria o foco para a barra dele depois do último botão (ou
     para o nada, depois de um toque na foto); aqui ele volta ao primeiro */
  const girar = (e: TeclaDoReact<HTMLDialogElement>) => {
    if (e.key !== 'Tab') return;
    const bts = [...(refCaixa.current?.querySelectorAll<HTMLButtonElement>('button') || [])];
    if (!bts.length) return;
    const atual = bts.indexOf(document.activeElement as HTMLButtonElement);
    e.preventDefault();
    bts[e.shiftKey ? (atual <= 0 ? bts.length - 1 : atual - 1) : (atual === -1 || atual === bts.length - 1 ? 0 : atual + 1)].focus();
  };

  return createPortal(
    <dialog className="dc-inteira" ref={refCaixa} aria-label={`Inspiração ${i + 1} de ${n}`}
      /* Esc: o navegador pede para fechar; quem fecha é a tela (o foco volta
         para a miniatura) */
      onCancel={e => { e.preventDefault(); fechar(); }}
      onKeyDown={girar}
      onClick={e => { if (e.target === e.currentTarget) fechar(); }}
      onTouchStart={e => { inicio.current = e.touches[0]?.clientX ?? null; }}
      onTouchEnd={e => {
        const x0 = inicio.current; inicio.current = null;
        const x1 = e.changedTouches[0]?.clientX;
        if (x0 === null || x1 === undefined || n < 2) return;
        if (x1 - x0 > 50) anterior(); else if (x0 - x1 > 50) proxima();
      }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="dc-inteira-img" src={imagens[i]} alt={`Inspiração ${i + 1} de ${n}`} />
      <button type="button" className="dc-inteira-bt dc-inteira-fechar" ref={refFechar} onClick={fechar} aria-label="Fechar">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
      {n > 1 && (
        <>
          <button type="button" className="dc-inteira-bt dc-inteira-ant" onClick={anterior} aria-label="Anterior">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
          <span className="dc-inteira-conta" aria-hidden="true">{i + 1} de {n}</span>
          <button type="button" className="dc-inteira-bt dc-inteira-prox" onClick={proxima} aria-label="Próxima">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
          </button>
        </>
      )}
    </dialog>,
    document.body,
  );
}
