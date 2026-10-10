import Link from 'next/link';
import { Logo } from '@/components/Marca';
import { IcSeta } from '@/components/Icones';
import { IGREJA } from '@/lib/igreja';

/* =============================================================================
   O PÉ DA IDENTIDADE NOVA — 10/10/2026

   A apresentação não desenha o rodapé; esta é a tradução do rodapé atual
   do site (components/Site.tsx) para a linguagem das faixas escuras: a
   marca, a frase da igreja em serifa itálica, o endereço com peso (num
   site de igreja é a informação mais acionável que existe) e os mesmos
   três grupos de links por intenção: visitar, a igreja, servir.
   ============================================================================= */

const GRUPOS = [
  { t: 'Visitar', itens: [
    { href: '/cultos', rot: 'Cultos' },
    { href: '/como-chegar', rot: 'Como chegar' },
    { href: '/pequena-guia', rot: 'Pequena Guia' },
  ] },
  { t: 'A igreja', itens: [
    { href: '/sobre', rot: 'Quem somos' },
    { href: '/guia-church-tv', rot: IGREJA.canalNome },
    { href: '/ofertar', rot: 'Ofertar' },
  ] },
  { t: 'Servir', itens: [
    { href: '/servir', rot: 'Quero servir' },
    { href: '/servir/onde-me-encaixo', rot: 'Onde me encaixo' },
    { href: '/eu', rot: 'Meu espaço' },
    { href: '/acessar', rot: 'Acesso às equipes' },
  ] },
];

export default function Pe() {
  return (
    <footer className="sv-pe">
      <div className="sv-in">
        <div className="sv-pe-g">
          <div className="sv-pe-eu">
            <span className="sv-logo" aria-label={IGREJA.nome}><Logo /></span>
            <p className="sv-pe-frase">{IGREJA.frase}</p>
            <Link href="/como-chegar" className="sv-pe-onde">
              <b>{IGREJA.cultoDia}, {IGREJA.cultoHora}{IGREJA.followHora ? ` · Follow aos sábados, ${IGREJA.followHora}` : ''}</b>
              <span><span className="nao-quebra">{IGREJA.rua}</span> · <span className="nao-quebra">{IGREJA.bairro}</span>, <span className="nao-quebra">{IGREJA.cidade}</span></span>
              <span className="ver">Ver no mapa <IcSeta /></span>
            </Link>
          </div>
          <div className="sv-pe-cols">
            {GRUPOS.map(g => (
              <nav key={g.t} aria-label={g.t}>
                <h2>{g.t}</h2>
                {g.itens.map(i => <Link key={i.href} href={i.href}>{i.rot}</Link>)}
              </nav>
            ))}
          </div>
        </div>
        <div className="sv-pe-linha">
          <span>© {new Date().getFullYear()} {IGREJA.nome}</span>
          <span>
            <a href={IGREJA.instagram} target="_blank" rel="noreferrer">{IGREJA.instagramArroba}</a>
            <Link href="/privacidade">Privacidade</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
