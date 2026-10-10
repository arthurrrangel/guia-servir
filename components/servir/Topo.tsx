'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/Marca';
import { IGREJA } from '@/lib/igreja';

/* =============================================================================
   O TOPO DA IDENTIDADE NOVA — 10/10/2026

   A apresentação do site (ApresentaSite.pdf) mostra uma barra escura sobre a
   fachada com cinco entradas: Igreja, Eventos, Envolva-se, PGs e Doação,
   cada uma com um chevron. É a estrutura da referência citada na copy
   (bethel.com): poucas palavras grandes, e o detalhe dentro de cada uma.

   Cada entrada aponta para páginas que EXISTEM. "Igreja" abre Quem somos,
   Cultos, Como chegar e a TV; "Eventos" abre o Follow Camp e o Follow;
   "Envolva-se" abre o caminho de quem quer servir e o de quem já serve. PGs
   e Doação são páginas únicas e vão direto. A lupa da apresentação não
   entrou: o site não tem busca, e um ícone que não faz nada é pior do que
   nenhum.

   No celular (abaixo de 1000px) a barra guarda só a marca e o botão de
   menu, e o menu é a cortina inteira, com os mesmos grupos. É um painel
   (sem aria-modal): a barra continua por cima, com o X, que é como se
   fecha. Esc fecha, tocar fora dos links fecha, o foco vai para o primeiro
   link ao abrir e volta ao botão ao fechar.

   Hoje só a /servir usa esta barra. Quando as outras páginas receberem a
   identidade nova, ela sobe para o casco de todas.
   ============================================================================= */

type Item = { href: string; rot: string; sub?: string; fora?: boolean };
type Grupo = { rot: string; href?: string; itens?: Item[] };

const GRUPOS: Grupo[] = [
  {
    rot: 'Igreja',
    itens: [
      { href: '/sobre', rot: 'Quem somos' },
      { href: '/cultos', rot: 'Cultos', sub: `${IGREJA.cultoDia}, ${IGREJA.cultoHora}` },
      { href: '/como-chegar', rot: 'Como chegar', sub: IGREJA.bairro },
      { href: '/guia-church-tv', rot: IGREJA.canalNome },
    ],
  },
  {
    rot: 'Eventos',
    itens: [
      { href: '/followcamp', rot: 'Follow Camp 2027', sub: '05 a 10 de fevereiro' },
      { href: '/cultos#follow', rot: 'Follow', sub: IGREJA.followHora ? `Sábados, ${IGREJA.followHora}` : 'Culto de jovens' },
    ],
  },
  {
    rot: 'Envolva-se',
    itens: [
      { href: '/servir', rot: 'Quero servir', sub: 'Encontre seu lugar' },
      { href: '/servir/onde-me-encaixo', rot: 'Não sei qual é a minha área' },
      { href: '/eu', rot: 'Já sirvo: meu espaço', sub: 'Escala, dias e líder' },
      { href: '/acessar', rot: 'Acesso às equipes' },
    ],
  },
  { rot: 'PGs', href: '/pequena-guia' },
  { rot: 'Doação', href: '/ofertar' },
];

const Chev = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export default function Topo({ atual = '/servir' }: { atual?: string }) {
  const [solida, setSolida] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const nav = useRef<HTMLUListElement>(null);
  const bt = useRef<HTMLButtonElement>(null);
  const cortina = useRef<HTMLDivElement>(null);

  /* a barra escurece depois da primeira rolagem; medido num rAF, um
     listener só, passivo */
  useEffect(() => {
    let pedindo = false;
    const medir = () => { pedindo = false; setSolida(window.scrollY > 24); };
    const aoRolar = () => { if (!pedindo) { pedindo = true; requestAnimationFrame(medir); } };
    medir();
    window.addEventListener('scroll', aoRolar, { passive: true });
    return () => window.removeEventListener('scroll', aoRolar);
  }, []);

  /* submenu aberto por toque/teclado fecha com Esc e com um clique fora */
  useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(null); };
    const fora = (e: PointerEvent) => { if (!nav.current?.contains(e.target as Node)) setAberto(null); };
    window.addEventListener('keydown', esc);
    document.addEventListener('pointerdown', fora);
    return () => { window.removeEventListener('keydown', esc); document.removeEventListener('pointerdown', fora); };
  }, [aberto]);

  /* o menu do celular: trava a rolagem, Esc fecha, foco vai e volta */
  useEffect(() => {
    document.body.style.overflow = menu ? 'hidden' : '';
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    window.addEventListener('keydown', esc);
    if (menu) cortina.current?.querySelector<HTMLElement>('a')?.focus();
    else if (document.activeElement && cortina.current?.contains(document.activeElement)) bt.current?.focus();
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', esc); };
  }, [menu]);

  return (
    <>
      <header className={'sv-topo' + (solida || menu ? ' solida' : '')}>
        <div className="sv-in sv-topo-in">
          <Link href="/" className="sv-logo" aria-label={IGREJA.nome}>
            <Logo />
          </Link>

          <ul className="sv-nav" ref={nav} aria-label="Páginas">
            {GRUPOS.map(g => g.itens ? (
              <li key={g.rot} className={aberto === g.rot ? 'aberto' : ''}>
                <button type="button" aria-expanded={aberto === g.rot} aria-controls={`sub-${g.rot}`}
                        onClick={() => setAberto(v => (v === g.rot ? null : g.rot))}>
                  {g.rot} <Chev />
                </button>
                <div className="sv-sub" id={`sub-${g.rot}`}>
                  <ul>
                    {g.itens.map(i => (
                      <li key={i.href}>
                        <Link href={i.href} aria-current={atual === i.href ? 'page' : undefined} onClick={() => setAberto(null)}>
                          {i.rot}{i.sub && <small>{i.sub}</small>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ) : (
              <li key={g.rot}>
                <Link href={g.href!} aria-current={atual === g.href ? 'page' : undefined}>{g.rot}</Link>
              </li>
            ))}
          </ul>

          <div className="sv-topo-fim">
            <a href="#quero-servir" className="sv-bt branco cta">Quero servir</a>
            <button ref={bt} type="button" className="sv-menu-bt" aria-expanded={menu} aria-controls="menu-servir"
                    aria-label={menu ? 'Fechar menu' : 'Abrir menu'} onClick={() => setMenu(v => !v)}>
              <i /><i />
            </button>
          </div>
        </div>
      </header>

      <div ref={cortina} id="menu-servir" className={'sv-menu' + (menu ? ' aberto' : '')} role="dialog" aria-label="Menu"
           inert={!menu} onClick={e => { if (e.target === e.currentTarget) setMenu(false); }}>
        {GRUPOS.map(g => (
          <nav key={g.rot} className="sv-menu-g" aria-label={g.rot}>
            <h2>{g.rot}</h2>
            {g.itens
              ? g.itens.map(i => <Link key={i.href} href={i.href} onClick={() => setMenu(false)}>{i.rot}</Link>)
              : <Link href={g.href!} onClick={() => setMenu(false)}>{g.rot === 'PGs' ? 'Pequena Guia' : 'Ofertar'}</Link>}
          </nav>
        ))}
        <div className="sv-acoes">
          <a href="#quero-servir" className="sv-bt branco" onClick={() => setMenu(false)}>Quero servir</a>
        </div>
        <div className="sv-menu-pe">
          <a href={IGREJA.instagram} target="_blank" rel="noreferrer">{IGREJA.instagramArroba}</a>
          <span><span className="nao-quebra">{IGREJA.rua}</span> · {IGREJA.bairro}</span>
          <span>{IGREJA.cultoDia}, {IGREJA.cultoHora}{IGREJA.followHora ? ` · Follow aos sábados, ${IGREJA.followHora}` : ''}</span>
        </div>
      </div>
    </>
  );
}
