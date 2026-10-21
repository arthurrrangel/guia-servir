import { Fragment } from 'react';
import Link from 'next/link';
import { Logo, LogoFollow } from '@/components/Marca';
import { MAPAS, type Item, type QualSite } from '@/lib/site/nav';
import { IGREJA, MAPA, canalDeConversa } from '@/lib/igreja';
import { daGuia } from '@/lib/site/sites';
import { Sede, Sep } from './Blocos';
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

export default function Pe({ site = 'igreja' }: { site?: QualSite }) {
  const { menu, pe } = MAPAS[site];
  const conversa = canalDeConversa();
  const ano = new Date().getFullYear();
  return (
    <footer className="s-pe">
      <div className="s-in">
        <div className="s-pe-g">
          <div className="s-pe-marca">
            {/* a marca de cada site (20/10/2026): o Follow tem a dele (FO»OW) e, embaixo, a
                frase dele, a que fecha o herói; os outros dois levam a marca e a frase da igreja */}
            {site === 'follow' ? <LogoFollow className="s-marca-follow" /> : <Logo />}
            <p className="s-frase">{site === 'follow' ? 'Um lugar para todos' : IGREJA.frase}.</p>
            <p className="s-corpo">
              {/* no guiafollow.com o sábado vem primeiro (21/10/2026); o domingo é a Celebração, como na agenda da igreja */}
              {site === 'follow' && IGREJA.followHora
                ? <b>Follow aos sábados, {IGREJA.followHora}<Sep />Celebração aos {IGREJA.cultoDia.toLowerCase()}s, {IGREJA.cultoHora}</b>
                : <b>{IGREJA.cultoDia}, {IGREJA.cultoHora}{IGREJA.followHora ? <><Sep />Follow aos sábados, {IGREJA.followHora}</> : null}</b>}<br />
              {/* 19/10/2026: rua numa linha, bairro e cidade na outra. Na coluna
                  estreita do pé a linha única partia o bairro ("Barra da" /
                  "Tijuca") */}
              {IGREJA.rua}<br />{IGREJA.bairro}, {IGREJA.cidade}<br />
              <a href={MAPA} target="_blank" rel="noreferrer">Ver no mapa</a>
            </p>
          </div>
          {menu.map(g => (
            <nav key={g.rot} aria-label={g.rot}>
              <h2>{g.rot}</h2>
              <ul>
                {g.itens.map(it => <li key={it.href + it.rot}><Ir it={it} /></li>)}
              </ul>
            </nav>
          ))}
        </div>
        {/* no celular (14/10/2026) o pé é só o que não está no menu: horário,
            endereço, mapa e os links de baixo. Os grupos, a marca, a frase e
            os sete atalhos saíram: o menu inteiro está a um toque, no topo
            fixo, e o pé ocupava uma tela inteira (661 px) em toda página */}
        <div className="s-pe-fim">
          <span>© {ano} {IGREJA.nome}</span>
          <Sede />
          <span className="s-pe-links">
            <a href={IGREJA.instagram} target="_blank" rel="noreferrer">{IGREJA.instagramArroba}</a>
            <i className="s-ponto" aria-hidden="true"> · </i>
            <a href={conversa.href} target="_blank" rel="noreferrer">WhatsApp</a>
            {pe.map(it => (
              <Fragment key={it.rot}>
                <i className="s-ponto" aria-hidden="true"> · </i>
                <Ir it={it} />
              </Fragment>
            ))}
            {PIXEL_ATIVO && (
              <>
                <i className="s-ponto" aria-hidden="true"> · </i>
                <RevisarCookies />
              </>
            )}
          </span>
        </div>
      </div>
    </footer>
  );
}
