'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Simbolo, LogoFollow } from '@/components/Marca';
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

   O TECLADO (22/10/2026, auditoria-teclado.mjs). Antes: o painel abria só
   de o foco passar pelo botão (:focus-within) e não fechava com Esc; o Tab
   atravessava os 22 links dos cinco painéis; com a busca ou a cortina
   abertas, o Tab ia para a página escondida atrás delas; e o Esc largava o
   foco no corpo da página. Agora:
     · o painel é um botão que abre e fecha (o padrão "disclosure"): fechado,
       os links dele não recebem Tab; Esc fecha e o foco volta ao botão; o
       foco que sai do grupo fecha o painel; e o painel que o mouse abriu
       também some com Esc, até o mouse sair dele (WCAG 1.4.13);
     · busca e cortina: o resto da página fica `inert` e o Tab dá a volta
       dentro (na busca, o diálogo; na cortina, a cortina e a barra); Esc
       fecha e devolve o foco a quem abriu (a lupa, o botão de menu);
     · a cortina aberta fecha sozinha se a tela passa de 1000 px (o iPad que
       deita): sem isso a página ficaria inerte sem botão para fechar.
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
  /* o grupo que o mouse abriu e o Esc calou (até o mouse sair dele) */
  const [calado, setCalado] = useState<number | null>(null);
  const campo = useRef<HTMLInputElement>(null);
  const lupaBt = useRef<HTMLButtonElement>(null);
  const menuBt = useRef<HTMLButtonElement>(null);
  /* quem recebe o foco quando a busca ou a cortina fecham (depois de a
     página deixar de ser inerte: foco em elemento inerte não pega) */
  const devolver = useRef<HTMLElement | null>(null);
  const conversa = canalDeConversa();

  /* qual grupo é o da página aberta (o sublinhado laranja) */
  const atual = MENU.findIndex(g => g.href === caminho || g.itens.some(i => i.href.split('#')[0] === caminho));

  /* tudo fecha ao navegar */
  useEffect(() => { setAberto(null); setMenu(false); setBusca(false); setQ(''); }, [caminho]);

  /* a cortina e a busca travam a rolagem */
  useEffect(() => {
    document.body.style.overflow = menu || busca ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menu, busca]);

  /* Esc fecha o que estiver aberto e devolve o foco a quem abriu; com a
     busca ou a cortina abertas, o Tab dá a volta dentro delas */
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (busca) { devolver.current = lupaBt.current; setBusca(false); return; }
        if (menu) { devolver.current = menuBt.current; setMenu(false); return; }
        if (aberto !== null) {
          const bt = document.querySelector<HTMLButtonElement>(`.s-nav-bt[aria-controls="s-sub-${aberto}"]`);
          const dentro = !!bt?.parentElement?.contains(document.activeElement);
          setAberto(null);
          if (bt && dentro) bt.focus();
        }
        const sobre = document.querySelector('.s-nav > li:hover');
        if (sobre?.parentElement) setCalado(Array.from(sobre.parentElement.children).indexOf(sobre));
        return;
      }
      if (e.key !== 'Tab' || (!menu && !busca)) return;
      const zonas = busca ? ['.s-busca'] : ['.s-topo', '#s-cortina'];
      const alvos = zonas.flatMap(z => Array.from(document.querySelectorAll<HTMLElement>(`${z} :is(a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"]))`)))
        .filter(el => !el.closest('[inert]') && !(el as HTMLButtonElement).disabled && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');
      if (!alvos.length) return;
      const ativo = document.activeElement as HTMLElement | null;
      const fora = !ativo || !alvos.includes(ativo);
      if (e.shiftKey ? (fora || ativo === alvos[0]) : (fora || ativo === alvos[alvos.length - 1])) {
        e.preventDefault();
        (e.shiftKey ? alvos[alvos.length - 1] : alvos[0]).focus();
      }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [menu, busca, aberto]);

  /* com a busca ou a cortina abertas, o resto da página fica inerte (sem
     foco, sem clique, fora da leitura): a busca cobre a tela inteira, barra
     incluída; a cortina deixa a barra (a lupa e o botão que fecha). Os
     irmãos da barra dentro de .s: o "Pular", o <main>, o pé. O que o React
     já marca como inerte (a cortina fechada, a busca fechada) fica como está */
  useEffect(() => {
    if (!menu && !busca) return;
    const raiz = document.getElementById('s-cortina')?.parentElement;
    if (!raiz) return;
    const fica = busca ? '.s-busca' : '.s-topo, #s-cortina';
    const postos: Element[] = [];
    for (const el of Array.from(raiz.children)) {
      if (el.matches(fica) || el.hasAttribute('inert')) continue;
      el.setAttribute('inert', '');
      postos.push(el);
    }
    return () => {
      postos.forEach(el => el.removeAttribute('inert'));
      const d = devolver.current;
      devolver.current = null;
      if (d && d.isConnected) d.focus();
    };
  }, [menu, busca]);

  /* a cortina é do celular e do tablet em pé: se a tela passa de 1000 px com
     ela aberta (o iPad que deita), ela fecha; senão a página ficaria inerte
     sem o botão de fechar, que some nessa largura */
  useEffect(() => {
    if (!menu) return;
    const largo = window.matchMedia('(min-width: 1000px)');
    const ve = () => { if (largo.matches) setMenu(false); };
    ve();
    largo.addEventListener('change', ve);
    return () => largo.removeEventListener('change', ve);
  }, [menu]);

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
          <Link href={inicio} className="s-logo" aria-label={site === 'servir' ? `Servir · ${IGREJA.nome}` : site === 'follow' ? `Follow · ${IGREJA.nome}` : IGREJA.nome}>
            {/* o Follow tem marca própria (20/10/2026): o logotipo FO»OW, deitado, no lugar do símbolo da GUIA */}
            {site === 'follow' ? <LogoFollow className="s-marca-follow" /> : <Simbolo />}
          </Link>

          {/* 22/10/2026: a barra é um marco de navegação (<nav>), e não só uma
              lista: quem usa leitor de tela pula para ela pelos marcos */}
          <nav className="s-nav-casca" aria-label="Seções do site">
          <ul className="s-nav">
            {MENU.map((g, i) => {
              /* 20/10/2026: o painel abria com "<grupo> · Abrir a página" e, logo abaixo, o
                 primeiro item indo para a MESMA página (Igreja → /sobre e Quem somos → /sobre,
                 nos cinco grupos). A entrada do grupo só existe quando nenhum item já leva à
                 página dele. E um grupo de um item só, que é a própria página (Follow Camp),
                 não é grupo: é um link na barra, sem painel. */
              const itemDoGrupo = g.itens.some(it => it.href === g.href);
              /* o grupo que é a própria entrada do site (Servir no Guia Servir, Follow no
                 guiafollow.com) também não ganha a entrada: o símbolo da barra já leva lá */
              const semEntrada = itemDoGrupo || g.href === inicio;
              if (g.itens.length === 1 && itemDoGrupo) {
                return (
                  <li key={g.rot}>
                    <LinkOu item={{ rot: g.rot, href: g.href, duro: g.duro }} className="s-nav-bt" atual={atual === i}>{g.rot}</LinkOu>
                  </li>
                );
              }
              return (
                <li key={g.rot} data-calado={calado === i ? '' : undefined}
                    onPointerLeave={() => setCalado(c => (c === i ? null : c))}
                    onBlur={e => {
                      /* o foco foi para fora do grupo (o Tab passou do último link): o
                         painel fecha. Sem destino (clique no Safari, que não dá foco a
                         link), fica como está: o clique ainda vai chegar no link */
                      const para = e.relatedTarget as Node | null;
                      if (para && !e.currentTarget.contains(para)) setAberto(v => (v === i ? null : v));
                    }}>
                  <button type="button" className="s-nav-bt" aria-expanded={aberto === i} aria-controls={`s-sub-${i}`}
                          aria-current={atual === i ? 'true' : undefined}
                          onClick={() => setAberto(v => v === i ? null : i)}>
                    {g.rot}<SetaBaixo />
                  </button>
                  <div id={`s-sub-${i}`} className={'s-sub' + (aberto === i ? ' aberto' : '')}>
                    {!semEntrada && <LinkOu item={{ rot: g.rot, href: g.href, duro: g.duro }}><b>{g.rot}</b><small>{g.sub ?? 'Abrir a página'}</small></LinkOu>}
                    {g.itens.map(it => (
                      <LinkOu key={it.href + it.rot} item={it}><b>{it.rot}</b>{it.sub && <small>{it.sub}</small>}</LinkOu>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
          </nav>

          <div className="s-topo-fim">
            <button ref={lupaBt} type="button" className="s-ico-bt" aria-label="Buscar no site" onClick={() => { setMenu(false); setBusca(true); }}><Lupa /></button>
            <button ref={menuBt} type="button" className="s-ico-bt s-menu-bt" aria-expanded={menu} aria-controls="s-cortina" aria-label={menu ? 'Fechar menu' : 'Abrir menu'}
                    onClick={() => setMenu(v => !v)}><i /><i /></button>
          </div>
        </div>
      </header>

      {/* o menu do celular: os destinos numa tela só (lib/site/nav.ts,
          MENU_CELULAR), a página aberta sublinhada em laranja, e embaixo as
          três saídas que não são página: WhatsApp, Instagram e o espaço de
          quem já serve */}
      <nav id="s-cortina" className={'s-cortina' + (menu ? ' aberta' : '')} inert={!menu} aria-label="Menu">
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
      </nav>

      {/* a busca */}
      <div className={'s-busca' + (busca ? ' aberta' : '')} inert={!busca} role="dialog" aria-label="Buscar no site" aria-modal="true">
        <button type="button" className="s-ico-bt s-busca-x" aria-label="Fechar a busca" onClick={() => { devolver.current = lupaBt.current; setBusca(false); }}><Fechar /></button>
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
