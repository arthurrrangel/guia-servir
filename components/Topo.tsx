'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/Marca';
import { IGREJA, canalDeConversa } from '@/lib/igreja';

/* =============================================================================
   O TOPO DA IDENTIDADE NOVA — 10/10/2026, plano desde 11/10/2026

   A apresentação do site (ApresentaSite.pdf) mostra uma barra escura sobre a
   fachada. A primeira versão desta barra copiou os cinco grupos com chevron
   da apresentação (Igreja, Eventos, Envolva-se, PGs, Doação), cada um com um
   submenu. O Arthur pediu "sem muita aba, algo mais direto" (11/10/2026):
   a barra passou a ter quatro páginas, lado a lado, e a pílula. Nada abre
   por cima de nada.

   Cultos (o domingo inteiro: horário, como chegar, primeira vez, ao vivo e
   o Follow), Quem somos, Pequena Guia, Ofertar. "Quero servir" é a pílula,
   porque servir é a conversão do site. O que saiu da barra não sumiu: o
   Follow Camp, "Já sirvo" e o acesso das equipes vivem no menu do celular e
   no pé.

   No celular (abaixo de 1000px) a barra guarda só a marca e o botão de
   menu, e o menu é a cortina inteira. É um painel (sem aria-modal): a barra
   continua por cima, com o X, que é como se fecha. Esc fecha, tocar fora
   dos links fecha, o foco vai para o primeiro link ao abrir e volta ao
   botão ao fechar.

   `escuro`: a página abre com foto de ponta a ponta e a barra nasce
   transparente sobre ela, escurecendo com a rolagem; sem `escuro` (uma
   página de texto, como /privacidade) ela já nasce escura.
   ============================================================================= */

const PAGINAS = [
  { href: '/cultos', rot: 'Cultos' },
  { href: '/sobre', rot: 'Quem somos' },
  { href: '/pequena-guia', rot: 'Pequena Guia' },
  { href: '/ofertar', rot: 'Ofertar' },
];

/* o que fica fora da barra e dentro do menu do celular e do pé */
const MAIS = [
  { href: '/followcamp', rot: 'Follow Camp 2027', sub: '05 a 10 de fevereiro', duro: true },
  { href: '/eu', rot: 'Já sirvo: meu espaço', sub: 'Escala, dias e líder' },
  { href: '/acessar', rot: 'Acesso às equipes' },
];

export default function Topo({ atual, escuro = true }: { atual?: string; escuro?: boolean }) {
  const [solida, setSolida] = useState(!escuro);
  const [menu, setMenu] = useState(false);
  const bt = useRef<HTMLButtonElement>(null);
  const cortina = useRef<HTMLDivElement>(null);
  const conversa = canalDeConversa();

  /* a barra escurece depois da primeira rolagem; medido num rAF, um
     listener só, passivo */
  useEffect(() => {
    if (!escuro) { setSolida(true); return; }
    let pedindo = false;
    const medir = () => { pedindo = false; setSolida(window.scrollY > 24); };
    const aoRolar = () => { if (!pedindo) { pedindo = true; requestAnimationFrame(medir); } };
    medir();
    window.addEventListener('scroll', aoRolar, { passive: true });
    return () => window.removeEventListener('scroll', aoRolar);
  }, [escuro]);

  /* o menu do celular: trava a rolagem, Esc fecha, foco vai e volta */
  useEffect(() => {
    document.body.style.overflow = menu ? 'hidden' : '';
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    window.addEventListener('keydown', esc);
    if (menu) cortina.current?.querySelector<HTMLElement>('a')?.focus();
    else if (document.activeElement && cortina.current?.contains(document.activeElement)) bt.current?.focus();
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', esc); };
  }, [menu]);

  /* na /servir a pílula desce até o formulário; nas outras, leva para a /servir */
  const Servir = ({ className, onClick }: { className: string; onClick?: () => void }) =>
    atual === '/servir'
      ? <a href="#quero-servir" className={className} onClick={onClick}>Quero servir</a>
      : <Link href="/servir" className={className} onClick={onClick}>Quero servir</Link>;

  return (
    <>
      <header className={'sv-topo' + (solida || menu ? ' solida' : '')}>
        <div className="sv-in sv-topo-in">
          <Link href="/" className="sv-logo" aria-label={IGREJA.nome}>
            <Logo />
          </Link>

          <ul className="sv-nav" aria-label="Páginas">
            {PAGINAS.map(p => (
              <li key={p.href}>
                <Link href={p.href} aria-current={atual === p.href ? 'page' : undefined}>{p.rot}</Link>
              </li>
            ))}
          </ul>

          <div className="sv-topo-fim">
            <Servir className="sv-bt branco cta" />
            <button ref={bt} type="button" className="sv-menu-bt" aria-expanded={menu} aria-controls="menu-servir"
                    aria-label={menu ? 'Fechar menu' : 'Abrir menu'} onClick={() => setMenu(v => !v)}>
              <i /><i />
            </button>
          </div>
        </div>
      </header>

      <div ref={cortina} id="menu-servir" className={'sv-menu' + (menu ? ' aberto' : '')} role="dialog" aria-label="Menu"
           inert={!menu} onClick={e => { if (e.target === e.currentTarget) setMenu(false); }}>
        <nav className="sv-menu-g" aria-label="Páginas">
          {PAGINAS.map(p => (
            <Link key={p.href} href={p.href} aria-current={atual === p.href ? 'page' : undefined} onClick={() => setMenu(false)}>{p.rot}</Link>
          ))}
        </nav>
        <div className="sv-acoes">
          <Servir className="sv-bt branco" onClick={() => setMenu(false)} />
        </div>
        <nav className="sv-menu-g sv-menu-mais" aria-label="Mais">
          {MAIS.map(i => i.duro
            /* /followcamp é um HTML estático servido por reescrita, não uma rota
               do app: o <Link> pré-carregava o RSC dele e o servidor respondia
               404 no console de toda página. Âncora comum. */
            ? <a key={i.href} href={i.href} onClick={() => setMenu(false)}>{i.rot}{i.sub && <small>{i.sub}</small>}</a>
            : <Link key={i.href} href={i.href} onClick={() => setMenu(false)}>{i.rot}{i.sub && <small>{i.sub}</small>}</Link>)}
        </nav>
        <div className="sv-menu-pe">
          <a href={conversa.href} target="_blank" rel="noreferrer">{conversa.rot}</a>
          <a href={IGREJA.instagram} target="_blank" rel="noreferrer">{IGREJA.instagramArroba}</a>
          <span><span className="nao-quebra">{IGREJA.rua}</span> · {IGREJA.bairro}</span>
          <span>{IGREJA.cultoDia}, {IGREJA.cultoHora}{IGREJA.followHora ? ` · Follow aos sábados, ${IGREJA.followHora}` : ''}</span>
        </div>
      </div>
    </>
  );
}
