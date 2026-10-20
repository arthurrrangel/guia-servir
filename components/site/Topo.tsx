'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Simbolo } from '@/components/Marca';
import { MAPAS, type Item, type QualSite } from '@/lib/site/nav';
import { IGREJA, canalDeConversa } from '@/lib/igreja';
import { daGuia } from '@/lib/site/sites';
import { Lupa, Fechar, SetaBaixo } from './Blocos';

/* =============================================================================
   A BARRA (tela 1 da apresentação) · 11/10/2026

   Preta, fixa no alto. O símbolo à esquerda; Igreja, Eventos, Envolva-se,
   PGs, Doação, cada um com a seta e um painel de links; a lupa à direita.

   O PAINEL ABRE DE DOIS JEITOS. No mouse, passar por cima abre (CSS,
   :hover). No teclado e no toque, o botão do grupo abre e fecha (estado
   aqui), porque toque não tem hover e Tab precisa chegar nos links. O
   rótulo do grupo também é link: clicar nele vai para a página principal do
   grupo. Esc fecha tudo e devolve o foco.

   ABAIXO DE 1000px a barra guarda o símbolo, a lupa e o botão de menu; o
   menu é a cortina com os oito destinos numa tela só (14/10/2026; antes
   eram os cinco grupos com 22 links e três telas de rolagem), mais
   WhatsApp, Instagram e "Já sirvo".

   A BUSCA é um véu com um campo: filtra o menu e a lista BUSCA de
   lib/site/nav.ts (perguntas como a pessoa digita). Sem rede, sem índice
   externo: são 30 linhas, cabem no aparelho.

   19/10/2026: a mesma barra serve aos dois sites (Guia Church e Guia
   Servir); `site` escolhe o mapa (lib/site/nav.ts). Link para o outro site
   é endereço completo e abre na mesma aba. 20/10: e ao terceiro, o Guia
   Follow.
   ============================================================================= */

const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* para fora (Instagram, WhatsApp): aba nova. Para o outro site da GUIA, para
   o sistema (outra folha de estilo) ou para uma âncora: <a> comum. O resto,
   <Link> (navegação sem recarregar) */
function LinkOu({ item, className, onClick, atual, children }: { item: Item; className?: string; onClick?: () => void; atual?: boolean; children: React.ReactNode }) {
  const completo = /^https?:/.test(item.href);
  const aqui = atual ? 'page' as const : undefined;
  if (completo && !daGuia(item.href)) return <a href={item.href} target="_blank" rel="noreferrer" className={className} onClick={onClick}>{children}</a>;
  if (completo || item.duro || item.href.includes('#')) return <a href={item.href} className={className} onClick={onClick} aria-current={aqui}>{children}</a>;
  return <Link href={item.href} className={className} onClick={onClick} aria-current={aqui}>{children}</Link>;
}

export default function Topo({ site = 'igreja' }: { site?: QualSite }) {
  const { menu: MENU, celular: MENU_CELULAR, busca: BUSCA, inicio, jaSirvo, nada } = MAPAS[site];
  /* 20/10/2026: em produção a raiz do guiaservir.com e do guiafollow.com é
     reescrita para /servir e /follow (next.config.mjs), e o usePathname
     devolve o caminho reescrito. A página de entrada de cada site conta
     como a entrada dele (o `inicio` do mapa), senão o grupo nunca acende. */
  const bruto = usePathname() || '/';
  const caminho = (site === 'servir' && bruto === '/servir') || (site === 'follow' && bruto === '/follow') ? inicio : bruto;
  const [aberto, setAberto] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const [busca, setBusca] = useState(false);
  const [q, setQ] = useState('');
  const campo = useRef<HTMLInputElement>(null);
  const lupaBt = useRef<HTMLButtonElement>(null);
  const conversa = canalDeConversa();

  /* qual grupo é o da página aberta (o sublinhado laranja) */
  const atual = MENU.findIndex(g => g.href === caminho || g.itens.some(i => i.href.split('#')[0] === caminho));

  /* tudo fecha ao navegar */
  useEffect(() => { setAberto(null); setMenu(false); setBusca(false); setQ(''); }, [caminho]);

  /* a cortina e a busca travam a rolagem; Esc fecha */
  useEffect(() => {
    document.body.style.overflow = menu || busca ? 'hidden' : '';
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setAberto(null); setMenu(false); if (busca) { setBusca(false); lupaBt.current?.focus(); } } };
    window.addEventListener('keydown', esc);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', esc); };
  }, [menu, busca]);

  useEffect(() => { if (busca) setTimeout(() => campo.current?.focus(), 30); }, [busca]);

  /* clicar fora fecha o painel aberto por toque/teclado */
  useEffect(() => {
    if (aberto === null) return;
    const fora = (e: PointerEvent) => { if (!(e.target as HTMLElement).closest('.s-nav')) setAberto(null); };
    document.addEventListener('pointerdown', fora);
    return () => document.removeEventListener('pointerdown', fora);
  }, [aberto]);

  const achados = useMemo(() => {
    const t = normal(q.trim());
    const tudo: Item[] = [...MENU.flatMap(g => g.itens.map(i => ({ ...i, rot: i.rot, sub: i.sub ? `${g.rot} · ${i.sub}` : g.rot }))), ...BUSCA];
    if (!t) return tudo.slice(0, 8);
    const pontua = (i: Item) => {
      const r = normal(i.rot), s = normal(i.sub || '');
      if (r.startsWith(t)) return 3;
      if (r.includes(t)) return 2;
      if (s.includes(t)) return 1;
      return 0;
    };
    return tudo.map(i => ({ i, p: pontua(i) })).filter(x => x.p > 0).sort((a, b) => b.p - a.p).map(x => x.i).slice(0, 10);
  }, [q, MENU, BUSCA]);

  return (
    <>
      <header className="s-topo">
        <div className="s-in s-topo-in">
          <Link href={inicio} className="s-logo" aria-label={site === 'servir' ? `Servir · ${IGREJA.nome}` : site === 'follow' ? `Follow · ${IGREJA.nome}` : IGREJA.nome}><Simbolo /></Link>

          <ul className="s-nav" aria-label="Seções do site">
            {MENU.map((g, i) => (
              <li key={g.rot}>
                <button type="button" className="s-nav-bt" aria-expanded={aberto === i} aria-controls={`s-sub-${i}`}
                        aria-current={atual === i ? 'true' : undefined}
                        onClick={() => setAberto(v => v === i ? null : i)}>
                  {g.rot}<SetaBaixo />
                </button>
                <div id={`s-sub-${i}`} className={'s-sub' + (aberto === i ? ' aberto' : '')}>
                  <LinkOu item={{ rot: g.rot, href: g.href, duro: g.duro }}><b>{g.rot}</b><small>Abrir a página</small></LinkOu>
                  {g.itens.map(it => (
                    <LinkOu key={it.href + it.rot} item={it}><b>{it.rot}</b>{it.sub && <small>{it.sub}</small>}</LinkOu>
                  ))}
                </div>
              </li>
            ))}
          </ul>

          <div className="s-topo-fim">
            <button ref={lupaBt} type="button" className="s-ico-bt" aria-label="Buscar no site" onClick={() => { setMenu(false); setBusca(true); }}><Lupa /></button>
            <button type="button" className="s-ico-bt s-menu-bt" aria-expanded={menu} aria-controls="s-cortina" aria-label={menu ? 'Fechar menu' : 'Abrir menu'}
                    onClick={() => setMenu(v => !v)}><i /><i /></button>
          </div>
        </div>
      </header>

      {/* o menu do celular: os destinos numa tela só (lib/site/nav.ts,
          MENU_CELULAR), a página aberta sublinhada em laranja, e embaixo as
          três saídas que não são página: WhatsApp, Instagram e o espaço de
          quem já serve */}
      <div id="s-cortina" className={'s-cortina' + (menu ? ' aberta' : '')} inert={!menu} aria-label="Menu">
        <ul className="s-cortina-lista">
          {MENU_CELULAR.map(it => {
            const aqui = !it.href.includes('#') && (caminho === it.href || caminho.startsWith(it.href + '/'));
            return (
              <li key={it.href + it.rot}>
                <LinkOu item={it} onClick={() => setMenu(false)} atual={aqui}>
                  <span>{it.rot}</span>{it.sub && <small>{it.sub}</small>}
                </LinkOu>
              </li>
            );
          })}
        </ul>
        <div className="s-cortina-pe">
          <a href={conversa.href} target="_blank" rel="noreferrer">{IGREJA.whatsapp ? 'WhatsApp' : 'Fale com a gente'}</a>
          <a href={IGREJA.instagram} target="_blank" rel="noreferrer">Instagram</a>
          <a href={jaSirvo} onClick={() => setMenu(false)}>Já sirvo</a>
        </div>
      </div>

      {/* a busca */}
      <div className={'s-busca' + (busca ? ' aberta' : '')} inert={!busca} role="dialog" aria-label="Buscar no site" aria-modal="true">
        <button type="button" className="s-ico-bt s-busca-x" aria-label="Fechar a busca" onClick={() => { setBusca(false); lupaBt.current?.focus(); }}><Fechar /></button>
        <div className="s-busca-in">
          <label htmlFor="s-busca-campo" className="s-so-leitor">O que você procura?</label>
          <input ref={campo} id="s-busca-campo" type="search" placeholder="O que você procura?" value={q} onChange={e => setQ(e.target.value)} autoComplete="off" />
          {achados.length
            ? <ul>{achados.map(it => <li key={it.href + it.rot}><LinkOu item={it} onClick={() => setBusca(false)}><b>{it.rot}</b>{it.sub && <small>{it.sub}</small>}</LinkOu></li>)}</ul>
            : <p className="s-busca-nada">{nada}</p>}
        </div>
      </div>
    </>
  );
}
