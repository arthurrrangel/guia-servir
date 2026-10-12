'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Simbolo } from '@/components/Marca';
import { MENU, BUSCA, type Item } from '@/lib/site/nav';
import { IGREJA, canalDeConversa } from '@/lib/igreja';
import { Lupa, Fechar, SetaBaixo, Sep } from './Blocos';

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
   menu é a cortina inteira, com os cinco grupos e os links de cada um,
   mais WhatsApp, Instagram e o endereço.

   A BUSCA é um véu com um campo: filtra o menu e a lista BUSCA de
   lib/site/nav.ts (perguntas como a pessoa digita). Sem rede, sem índice
   externo: são 30 linhas, cabem no aparelho.
   ============================================================================= */

const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function LinkOu({ item, className, onClick, children }: { item: Item; className?: string; onClick?: () => void; children: React.ReactNode }) {
  const fora = /^https?:/.test(item.href);
  if (fora) return <a href={item.href} target="_blank" rel="noreferrer" className={className} onClick={onClick}>{children}</a>;
  if (item.duro || item.href.includes('#')) return <a href={item.href} className={className} onClick={onClick}>{children}</a>;
  return <Link href={item.href} className={className} onClick={onClick}>{children}</Link>;
}

export default function Topo() {
  const caminho = usePathname() || '/';
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
  }, [q]);

  return (
    <>
      <header className="s-topo">
        <div className="s-in s-topo-in">
          <Link href="/" className="s-logo" aria-label={IGREJA.nome}><Simbolo /></Link>

          <ul className="s-nav" aria-label="Seções do site">
            {MENU.map((g, i) => (
              <li key={g.rot}>
                <button type="button" className="s-nav-bt" aria-expanded={aberto === i} aria-controls={`s-sub-${i}`}
                        aria-current={atual === i ? 'true' : undefined}
                        onClick={() => setAberto(v => v === i ? null : i)}>
                  {g.rot}<SetaBaixo />
                </button>
                <div id={`s-sub-${i}`} className={'s-sub' + (aberto === i ? ' aberto' : '')}>
                  <Link href={g.href}><b>{g.rot}</b><small>Abrir a página</small></Link>
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

      {/* o menu do celular */}
      <div id="s-cortina" className={'s-cortina' + (menu ? ' aberta' : '')} inert={!menu} aria-label="Menu">
        {MENU.map(g => (
          <div key={g.rot} className="s-cortina-g">
            <Link href={g.href} onClick={() => setMenu(false)}>{g.rot}</Link>
            <ul>
              {g.itens.map(it => (
                <li key={it.href + it.rot}><LinkOu item={it} onClick={() => setMenu(false)}>{it.rot}{it.sub && <small>{it.sub}</small>}</LinkOu></li>
              ))}
            </ul>
          </div>
        ))}
        <div className="s-cortina-pe">
          <a href={conversa.href} target="_blank" rel="noreferrer">{conversa.rot}</a>
          <a href={IGREJA.instagram} target="_blank" rel="noreferrer">{IGREJA.instagramArroba}</a>
          <span>{IGREJA.rua}<Sep />{IGREJA.bairro}</span>
          <span>{IGREJA.cultoDia}, {IGREJA.cultoHora}{IGREJA.followHora ? <><Sep />Follow aos sábados, {IGREJA.followHora}</> : null}</span>
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
            : <p className="s-busca-nada">Nada com esse nome. Tente "culto", "endereço", "servir" ou "pix".</p>}
        </div>
      </div>
    </>
  );
}
