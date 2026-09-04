'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Logo } from './Marca';
import { IGREJA, ENDERECO_LINHA } from '@/lib/igreja';
import Movimento from './Movimento';

/* =============================================================================
   O CASCO DAS PÁGINAS PÚBLICAS

   A home monta a própria barra, com transparência sobre o herói de tela cheia
   e âncoras para as seções internas. Aquilo continua exatamente como está —
   é o rosto do site e funciona.

   As páginas novas precisam da MESMA barra, mas de outro jeito: elas não têm
   herói de tela cheia, então a barra nasce sólida; e a navegação delas não é
   por âncora, é por endereço. Copiar a barra da home para dentro de cada
   página nova daria seis acabamentos para o mesmo cabeçalho — que é
   exatamente o problema que o componente Tela resolveu para as telas internas.

   Cliente por um motivo só: o menu do celular. Sem ele, `.casa-nav` some
   abaixo de 920px e a pessoa fica sem navegação nenhuma na página. As páginas
   que usam este casco continuam sendo componentes de servidor: o conteúdo
   entra por `children`, renderizado no servidor e passado por aqui.

   O LINK DISCRETO DO TOPO. "Acesso às equipes" é o rótulo escolhido pelo
   Arthur, e o motivo importa: ele diz a quem pertence sem prometer login a
   quem não tem. "Entrar" faria o visitante achar que o site tem conta.
   ============================================================================= */

/* Os capítulos públicos, na ordem da decisão — não na ordem do organograma.
   Cultos e Como chegar vêm primeiro porque são as duas que tiram alguém de
   casa; Conheça é para quem já decidiu; TV é retenção de quem já conhece. */
const PAGINAS = [
  { href: '/cultos', rot: 'Cultos' },
  { href: '/como-chegar', rot: 'Como chegar' },
  { href: '/sobre', rot: 'Conheça' },
  { href: '/pequena-guia', rot: 'Pequena Guia' },
];

export function Barra({ atual }: { atual?: string }) {
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    document.body.style.overflow = menu ? 'hidden' : '';
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    window.addEventListener('keydown', esc);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', esc); };
  }, [menu]);

  /* sempre `opaco`: fora da home não existe foto de tela cheia atrás da barra,
     e barra transparente sobre papel claro vira texto branco no branco. */
  return (
    <>
      <header className="casa-barra opaco">
        <Link href="/" className="marca-link" aria-label={IGREJA.nome}>
          <Logo className="logo" />
        </Link>
        <nav className="casa-nav">
          {PAGINAS.map(p => (
            <Link key={p.href} href={p.href} aria-current={atual === p.href ? 'true' : undefined}>
              {p.rot}
            </Link>
          ))}
        </nav>
        <div className="casa-barra-fim">
          <Link href="/acessar" className="bt-barra discreto">Acesso às equipes</Link>
          <Link href="/servir" className="bt-barra">
            <span className="so-largo">Quero&nbsp;</span>servir
          </Link>
          <button className="menu-bt" aria-expanded={menu}
                  aria-label={menu ? 'Fechar menu' : 'Abrir menu'}
                  onClick={() => setMenu(v => !v)}>
            <i /><i />
          </button>
        </div>
      </header>

      <div className={'menu' + (menu ? ' aberto' : '')} role="dialog" aria-modal="true" aria-hidden={!menu}>
        <div>
          <Logo className="logo" />
          <ul style={{ marginTop: 34 }}>
            {PAGINAS.map((p, i) => (
              <li key={p.href} style={{ ['--i' as string]: i }}>
                <Link href={p.href} onClick={() => setMenu(false)}>{p.rot}</Link>
              </li>
            ))}
            <li style={{ ['--i' as string]: PAGINAS.length }}>
              <Link href="/servir" onClick={() => setMenu(false)}>Servir</Link>
            </li>
          </ul>
          <div className="menu-pe">
            <a href={IGREJA.instagram} target="_blank" rel="noreferrer">{IGREJA.instagramArroba}</a>
            <span>{IGREJA.rua} · {IGREJA.bairro}</span>
            <Link href="/acessar" onClick={() => setMenu(false)}>Acesso às equipes</Link>
          </div>
        </div>
      </div>
    </>
  );
}

/* O RODAPÉ DE VERDADE. Um rodapé de uma linha é o fim de um panfleto; um
   site de produto termina com a marca grande, os caminhos organizados e os
   fatos — onde, quando, como falar. É a última coisa que a pessoa vê, e a
   que ela lembra quando fecha. /privacidade continua alcançável de qualquer
   página, como a LGPD pede. */
export function Rodape() {
  return (
    <footer className="g-pe rev">
      <div className="g">
        <div className="g-pe-marca" aria-label={IGREJA.nome}>
          <Logo className="logo" />
        </div>
        <p className="g-ed g-pe-frase" style={{ color: 'var(--areia)', maxWidth: '22ch' }}>{IGREJA.frase}</p>

        <div className="g-pe-cols">
          <div>
            <h4>Onde e quando</h4>
            <span>{IGREJA.rua}</span>
            <span>{IGREJA.bairro}, {IGREJA.cidade} · {IGREJA.cep}</span>
            <span style={{ marginTop: 10, color: 'var(--areia)' }}>{IGREJA.cultoDia}, {IGREJA.cultoHora} · {IGREJA.cultoDuracao} minutos</span>
          </div>
          <div>
            <h4>Visitar</h4>
            <Link href="/cultos">Cultos</Link>
            <Link href="/como-chegar">Como chegar</Link>
            <Link href="/pequena-guia">Pequena Guia</Link>
          </div>
          <div>
            <h4>A igreja</h4>
            <Link href="/sobre">Quem somos</Link>
            <Link href="/guia-church-tv">Guia Church TV</Link>
            <Link href="/servir">Servir</Link>
          </div>
          <div>
            <h4>Equipes</h4>
            <Link href="/acessar">Acesso às equipes</Link>
            <Link href="/eu">Espaço do voluntário</Link>
            <Link href="/entrar">Organização</Link>
          </div>
        </div>

        <div className="g-pe-linha">
          <span>© {new Date().getFullYear()} {IGREJA.nome}</span>
          <a href={IGREJA.instagram} target="_blank" rel="noreferrer">{IGREJA.instagramArroba}</a>
          <Link href="/privacidade">Privacidade</Link>
        </div>
      </div>
    </footer>
  );
}

/* açúcar: barra + conteúdo + rodapé, que é o formato de toda página pública
   nova. A `main` fica fora do casco de propósito — cada página escolhe as
   próprias faixas, e faixa precisa sangrar de ponta a ponta. */
export function Site({ atual, children }: { atual?: string; children: React.ReactNode }) {
  return (
    <div data-movimento>
      {/* o primeiro item focável da página. Quem navega por teclado pula a
          barra inteira com um Tab e um Enter. Invisível até receber foco. */}
      <a href="#conteudo" className="pular">Pular para o conteúdo</a>
      <Movimento />
      <Barra atual={atual} />
      {/* a regra global de `main` é do app interno: largura travada em 1180 e
          padding lateral. Aqui as faixas precisam sangrar de ponta a ponta,
          então a regra é desfeita nesta instância — não no CSS, que continua
          valendo para todas as telas do sistema. */}
      <main id="conteudo" style={{ maxWidth: 'none', margin: 0, padding: '78px 0 0' }}>{children}</main>
      <Rodape />
    </div>
  );
}
