import Link from 'next/link';
import { Logo } from '@/components/Marca';
import { MENU } from '@/lib/site/nav';
import { IGREJA, MAPA, canalDeConversa } from '@/lib/igreja';
import { Sede, Sep } from './Blocos';

/* =============================================================================
   O PÉ — a marca, a frase, o endereço e os cinco grupos do menu · 11/10/2026
   O pé usa a mesma lista da barra (lib/site/nav.ts): um link novo entra nos
   dois de uma vez.
   ============================================================================= */
const ATALHOS: Array<[string, string]> = [
  ['Quem somos', '/sobre'], ['Cultos', '/cultos'], ['Como chegar', '/como-chegar'], ['Agenda', '/eventos'],
  ['Quero servir', '/servir'], ['Pequena Guia', '/pequena-guia'], ['Ofertar', '/ofertar'],
];

export default function Pe() {
  const conversa = canalDeConversa();
  const ano = new Date().getFullYear();
  return (
    <footer className="s-pe">
      <div className="s-in">
        <div className="s-pe-g">
          <div className="s-pe-marca">
            <Logo />
            <p className="s-frase">{IGREJA.frase}.</p>
            <p className="s-corpo">
              <b>{IGREJA.cultoDia}, {IGREJA.cultoHora}{IGREJA.followHora ? <><Sep />Follow aos sábados, {IGREJA.followHora}</> : null}</b><br />
              {IGREJA.rua}<Sep />{IGREJA.bairro}, {IGREJA.cidade}<br />
              <a href={MAPA} target="_blank" rel="noreferrer">Ver no mapa</a>
            </p>
          </div>
          {MENU.map(g => (
            <nav key={g.rot} aria-label={g.rot}>
              <h2>{g.rot}</h2>
              <ul>
                {g.itens.map(it => (
                  <li key={it.href + it.rot}>
                    {/^https?:/.test(it.href)
                      ? <a href={it.href} target="_blank" rel="noreferrer">{it.rot}</a>
                      : it.duro || it.href.includes('#')
                        ? <a href={it.href}>{it.rot}</a>
                        : <Link href={it.href}>{it.rot}</Link>}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        {/* no celular os cinco grupos (22 links em duas colunas centralizadas,
            ~900 px) dão lugar a uma linha de atalhos: o mapa inteiro do site
            continua no menu, a um toque, no alto da tela */}
        <nav className="s-pe-atalhos" aria-label="Atalhos">
          {ATALHOS.map(([rot, href]) => <Link key={href} href={href}>{rot}</Link>)}
        </nav>
        <div className="s-pe-fim">
          <span>© {ano} {IGREJA.nome}</span>
          <Sede />
          <span className="s-pe-links">
            <a href={IGREJA.instagram} target="_blank" rel="noreferrer">{IGREJA.instagramArroba}</a>
            <i className="s-ponto" aria-hidden="true"> · </i>
            <a href={conversa.href} target="_blank" rel="noreferrer">WhatsApp</a>
            <i className="s-ponto" aria-hidden="true"> · </i>
            <Link href="/acessar">Acesso às equipes</Link>
            <i className="s-ponto" aria-hidden="true"> · </i>
            <Link href="/privacidade">Privacidade</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
