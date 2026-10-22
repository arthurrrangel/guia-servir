import { Fragment } from 'react';
import Link from 'next/link';
import { Logo, LogoFollow } from '@/components/Marca';
import { MAPAS, type Item, type QualSite } from '@/lib/site/nav';
import { IGREJA, MAPA, canalDeConversa } from '@/lib/igreja';
import { daGuia } from '@/lib/site/sites';
import { Sede } from './Blocos';
import RevisarCookies from './RevisarCookies';
import { pixelValido } from '@/lib/site/medir';

const PIXEL_ATIVO = !!pixelValido(process.env.NEXT_PUBLIC_META_PIXEL_ID);

/* =============================================================================
   O PÉ: a marca, a frase, o endereço e os grupos do menu · 11/10/2026
   O pé usa a mesma lista da barra (lib/site/nav.ts): um link novo entra nos
   dois de uma vez. No celular ficam só horário, endereço, mapa e os links
   de baixo (14/10/2026).

   19/10/2026: o mesmo pé nos dois sites, cada um com os grupos do seu menu.
   A frase da marca ("Cultivando uma nova cultura") só mora aqui: a copy
   final tirou o conceito de todas as páginas e deixou no rodapé.
   ============================================================================= */
function Ir({ it }: { it: Item }) {
  if (/^https?:/.test(it.href) && !daGuia(it.href)) return <a href={it.href} target="_blank" rel="noreferrer">{it.rot}</a>;
  if (/^https?:/.test(it.href) || it.duro || it.href.includes('#')) return <a href={it.href}>{it.rot}</a>;
  return <Link href={it.href}>{it.rot}</Link>;
}

/* a seta de "abre em outra aba", a mesma da pílula de fora */
function Seta() {
  return <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M5 11 11 5M6 5h5v5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function Pe({ site = 'igreja' }: { site?: QualSite }) {
  const { menu, pe } = MAPAS[site];
  const conversa = canalDeConversa();
  const ano = new Date().getFullYear();
  /* 21/10/2026: no computador os links de baixo que já estão num grupo do pé (o
     "GUIA Church" e o "Acesso às equipes" do Servir, o "GUIA Church" do Follow)
     não se repetem; no celular, onde os grupos não aparecem, vão todos */
  const nosGrupos = new Set(menu.flatMap(g => [g.href, ...g.itens.map(it => it.href)]));
  const peLargo = pe.filter(it => !nosGrupos.has(it.href));
  const deBaixo = (lista: readonly Item[], qual: string) => (
    <span className={'s-pe-links ' + qual}>
      {lista.map((it, i) => (
        <Fragment key={it.rot}>
          {i > 0 && <i className="s-ponto" aria-hidden="true"> · </i>}
          <Ir it={it} />
        </Fragment>
      ))}
      {PIXEL_ATIVO && (
        <>
          {lista.length > 0 && <i className="s-ponto" aria-hidden="true"> · </i>}
          <RevisarCookies />
        </>
      )}
    </span>
  );
  return (
    <footer className="s-pe" style={{ '--n': menu.length } as React.CSSProperties}>
      <div className="s-in">
        {/* 21/10/2026, "tá tudo meio desorganizado e desajustado": o pé em três
            andares, os mesmos em qualquer tela. Em cima, a marca e os grupos do
            menu, tantas colunas quantos grupos (eram seis colunas fixas e o
            Servir e o Follow, com quatro grupos, deixavam uma vazia); no meio, a
            faixa de quando, onde e as redes; embaixo, © | sede | links, com a
            sede no centro da página. No celular os grupos saem (o menu inteiro
            está no topo, a um toque) e tudo fica no eixo */}
        <div className="s-pe-topo">
          <div className="s-pe-marca">
            {/* a marca de cada site (20/10/2026): o Follow tem a dele (FO»OW) e a
                frase dele, a que fecha o herói; os outros dois, a marca e a frase da igreja */}
            {site === 'follow' ? <LogoFollow className="s-marca-follow" /> : <Logo />}
            <p className="s-frase">{site === 'follow' ? 'Um lugar para todos' : IGREJA.frase}.</p>
          </div>
          <div className="s-pe-grupos">
            {menu.map(g => (
              <nav key={g.rot} aria-label={g.rot}>
                <h2>{g.rot}</h2>
                <ul>
                  {g.itens.map(it => <li key={it.href + it.rot}><Ir it={it} /></li>)}
                </ul>
              </nav>
            ))}
          </div>
        </div>
        <div className="s-pe-faixa">
          {/* quando e onde, com rótulo; a ordem do horário segue o site: no
              guiafollow.com o sábado vem primeiro */}
          <dl className="s-pe-info">
            <div>
              <dt>Quando</dt>
              {site === 'follow' && IGREJA.followHora
                ? <dd><b>Follow aos sábados, {IGREJA.followHora}</b><br />Celebração aos {IGREJA.cultoDia.toLowerCase()}s, {IGREJA.cultoHora}</dd>
                : <dd><b>{IGREJA.cultoDia}, {IGREJA.cultoHora}</b>{IGREJA.followHora ? <><br />Follow aos sábados, {IGREJA.followHora}</> : null}</dd>}
            </div>
            <div>
              <dt>Onde</dt>
              {/* rua numa linha, bairro e cidade na outra (19/10/2026: a linha
                  única partia o bairro, "Barra da" / "Tijuca") */}
              <dd>{IGREJA.rua}<br />{IGREJA.bairro}, {IGREJA.cidade}<br />
                <a className="s-pe-mapa" href={MAPA} target="_blank" rel="noreferrer">Ver no mapa<Seta /></a>
              </dd>
            </div>
          </dl>
          <div className="s-pe-redes">
            <a className="s-pil contorno" href={IGREJA.instagram} target="_blank" rel="noreferrer" aria-label={`Instagram ${IGREJA.instagramArroba}`}>Instagram</a>
            <a className="s-pil contorno" href={conversa.href} target="_blank" rel="noreferrer">WhatsApp</a>
          </div>
        </div>
        <div className="s-pe-fim">
          <span className="s-pe-copy">© {ano} {IGREJA.nome}</span>
          <Sede />
          {peLargo.length === pe.length
            ? deBaixo(pe, 'todos')
            : <>{deBaixo(peLargo, 'largo')}{deBaixo(pe, 'curto')}</>}
        </div>
      </div>
    </footer>
  );
}
