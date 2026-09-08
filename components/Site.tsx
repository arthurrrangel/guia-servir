'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Logo } from './Marca';
import { IcSeta } from './Icones';
import { IGREJA } from '@/lib/igreja';
import Movimento from './Movimento';

/* =============================================================================
   O CASCO DAS PÁGINAS PÚBLICAS

   A mesma barra em todas as páginas do site, home inclusive (desde 07/09 a
   home também usa a `Barra` daqui, com `inicio`: transparente sobre a foto de
   tela cheia, opaca depois da rolagem). Copiar a barra para dentro de cada
   página daria seis acabamentos para o mesmo cabeçalho — que é exatamente o
   problema que o componente Tela resolveu para as telas internas.

   Cliente por um motivo só: o menu do celular. Sem ele, `.casa-nav` some
   abaixo de 1260px e a pessoa fica sem navegação nenhuma na página. As páginas
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
  { href: '/pequena-guia', rot: 'Pequena Guia' },
  { href: '/sobre', rot: 'Quem somos' },
];

/* A BARRA É UMA SÓ. 07/09/2026.
   A home tinha a própria cópia desta barra e deste menu — 50 linhas iguais,
   com a lista de páginas repetida e o endereço da igreja digitado à mão. Duas
   cópias do mesmo menu são dois lugares para o mesmo defeito, e foi o que
   aconteceu: o menu aberto não fechava em nenhuma das duas.

   O DEFEITO: `.menu` é fixo, z-index 65; a barra, com o botão que vira X, é
   z-index 60. Aberto o menu, o X ficava por baixo da cortina. Sem teclado
   (celular), a única saída era tocar num link e trocar de página. Agora a
   barra sobe acima da cortina enquanto o menu está aberto (vide CSS), tocar
   fora do bloco de links também fecha, e o foco vai para o primeiro link ao
   abrir e volta ao botão ao fechar — é um diálogo, e se comporta como um.

   `inicio`: a barra da home nasce transparente sobre a foto e fica opaca pela
   rolagem; fora da home é sempre opaca — barra transparente sobre papel
   claro vira texto branco no branco. */
export function Barra({ atual, inicio, solida = true }: { atual?: string; inicio?: boolean; solida?: boolean }) {
  const [menu, setMenu] = useState(false);
  const bt = useRef<HTMLButtonElement>(null);
  const cortina = useRef<HTMLDivElement>(null);

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
      <header className={'casa-barra' + (inicio ? ' inicio' : '') + (solida ? ' opaco' : '')}>
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
            <span className="so-largo">Quero servir</span><span className="so-estreito">Servir</span>
          </Link>
          <button ref={bt} className="menu-bt" aria-expanded={menu} aria-controls="menu-site"
                  aria-label={menu ? 'Fechar menu' : 'Abrir menu'}
                  onClick={() => setMenu(v => !v)}>
            <i /><i />
          </button>
        </div>
      </header>

      <div ref={cortina} id="menu-site" className={'menu' + (menu ? ' aberto' : '')}
           role="dialog" aria-modal="true" aria-label="Menu" aria-hidden={!menu}
           onClick={e => { if (e.target === e.currentTarget) setMenu(false); }}>
        <div>
          <ul>
            {PAGINAS.map((p, i) => (
              <li key={p.href} style={{ ['--i' as string]: i }}>
                <Link href={p.href} aria-current={atual === p.href ? 'true' : undefined}
                      onClick={() => setMenu(false)}>{p.rot}</Link>
              </li>
            ))}
            <li style={{ ['--i' as string]: PAGINAS.length }}>
              <Link href="/servir" onClick={() => setMenu(false)}>Quero servir</Link>
            </li>
          </ul>
          <div className="menu-pe">
            <a href={IGREJA.instagram} target="_blank" rel="noreferrer">{IGREJA.instagramArroba}</a>
            <span><span className="nao-quebra">{IGREJA.rua}</span> · {IGREJA.bairro}</span>
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
/* =============================================================================
   O RODAPÉ

   A VERSÃO ANTERIOR ERA UM MONUMENTO, NÃO UM RODAPÉ. Logo grande centrado, a
   frase da igreja embaixo, seis links numa fileira só e o endereço miúdo no
   meio de tudo. Numa tela de 1900px, isso ocupava uma faixa central de 700 e
   deixava 600px de vazio de cada lado. E os seis links vinham sem hierarquia:
   para achar "Como chegar" era preciso ler os seis.

   A referência que o Arthur trouxe (o rodapé da Igreja Batista Atitude) acerta
   em três coisas, e são as três que entram aqui:
     1. agrupar link por assunto, com título de categoria — quem procura lê a
        categoria, não a lista inteira;
     2. dar peso ao endereço, que num site de igreja é a informação mais
        acionável que existe;
     3. usar a largura em colunas em vez de empilhar tudo num eixo.

   E erra em quatro, que não entram:
     1. laranja gritante nos títulos de categoria — aqui a cor de rótulo já é a
        areia, e ela é da marca;
     2. redes sociais em minúsculas contra títulos em caixa alta, na mesma
        grade;
     3. colunas desbalanceadas (uma com dois itens, outra com quatro), que
        abrem buraco no fim da linha;
     4. botão flutuante de WhatsApp, que é vocabulário de template.

   O AGRUPAMENTO É POR INTENÇÃO, e não pela estrutura do site. Ninguém chega ao
   rodapé procurando "páginas": chega querendo visitar, entender ou servir.
============================================================================= */

/* três grupos de dois a três, que fecham a linha sem sobra. Ordem pela
   probabilidade de quem rolou até aqui: visitar antes de servir. */
const RODAPE = [
  {
    t: 'Visitar',
    itens: [
      { href: '/cultos', rot: 'O domingo' },
      { href: '/como-chegar', rot: 'Como chegar' },
      { href: '/pequena-guia', rot: 'Pequena Guia' },
    ],
  },
  {
    t: 'A igreja',
    itens: [
      { href: '/sobre', rot: 'Quem somos' },
      { href: '/guia-church-tv', rot: 'GUIA Church TV' },
      { href: IGREJA.instagram, rot: 'Instagram', fora: true },
    ],
  },
  {
    /* "Onde me encaixo" existe e hoje só é alcançável de dentro da /servir.
       É a página de quem não sabe escolher, que é justamente quem precisa de
       um caminho — e ela fecha a terceira coluna com três, como as outras. */
    t: 'Servir',
    itens: [
      { href: '/servir', rot: 'Quero servir' },
      { href: '/servir/onde-me-encaixo', rot: 'Onde me encaixo' },
      { href: '/acessar', rot: 'Acesso às equipes' },
    ],
  },
];

export function Rodape() {
  return (
    <footer className="g-pe rev">
      <div className="g">
        {/* O ENDEREÇO EM FAIXA, ANTES DAS COLUNAS.
            Ele começou dentro da coluna da marca e o resultado foi medido:
            as três colunas de link terminavam 260px antes dela, e o rodapé
            fechava com um buraco de meia tela à direita — o mesmo
            desbalanceamento que eu tinha criticado na referência.
            Em faixa, ele resolve as duas coisas de uma vez: ganha a largura
            inteira, que é o destaque que a informação de maior intenção do
            site merece, e devolve à coluna da marca uma altura parecida com a
            das outras três. */}
        <Link href="/como-chegar" className="g-pe-onde">
          <span className="g-pe-quando">{IGREJA.cultoDia}, {IGREJA.cultoHora}</span>
          {/* rua, bairro e cidade não quebram por dentro: em 390 saía
              "Barra da Tijuca, Rio / de Janeiro". */}
          <span className="g-pe-rua">
            <span className="nao-quebra">{IGREJA.rua}</span> · <span className="nao-quebra">{IGREJA.bairro}</span>, <span className="nao-quebra">{IGREJA.cidade}</span>
          </span>
          <span className="g-pe-ver">Ver no mapa <IcSeta /></span>
        </Link>

        <div className="g-pe-cols">
          <div className="g-pe-eu">
            <div className="g-pe-marca" aria-label={IGREJA.nome}>
              <Logo className="logo" />
            </div>
            <p className="g-pe-frase">{IGREJA.frase}</p>
          </div>

          {RODAPE.map(g => (
            <nav key={g.t} aria-label={g.t}>
              {/* h2, não h4: o rodapé é uma seção da página como as outras, e o
                  h4 pulava níveis (na /guia-church-tv, de h1 direto para h4). */}
              <h2 className="g-pe-h">{g.t}</h2>
              {g.itens.map(i => ('fora' in i && i.fora)
                ? <a key={i.href} href={i.href} target="_blank" rel="noreferrer">{i.rot}</a>
                : <Link key={i.href} href={i.href}>{i.rot}</Link>)}
            </nav>
          ))}
        </div>

        {/* três itens com space-between deixavam o @ boiando no meio da
            linha, longe dos dois vizinhos. Um de cada lado. */}
        <div className="g-pe-linha">
          <span>© {new Date().getFullYear()} {IGREJA.nome}</span>
          <span className="g-pe-fim">
            <a href={IGREJA.instagram} target="_blank" rel="noreferrer">{IGREJA.instagramArroba}</a>
            <Link href="/privacidade">Privacidade</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}

/* açúcar: barra + conteúdo + rodapé, que é o formato de toda página pública
   nova. A `main` fica fora do casco de propósito — cada página escolhe as
   próprias faixas, e faixa precisa sangrar de ponta a ponta. */
export function Site({ atual, escuro, children }: { atual?: string; escuro?: boolean; children: React.ReactNode }) {
  /* `escuro` (08/09/2026): a página abre com foto de ponta a ponta, e a
     barra nasce transparente sobre ela, como na home, e fica opaca pela
     rolagem — pelo compositor onde há animation-timeline, e por este estado
     onde não há. O `main` deixa de reservar a altura da barra: o herói
     (.g-cheio) já reserva por dentro (padding-top ≥ 120px). */
  const [solida, setSolida] = useState(!escuro);
  useEffect(() => {
    if (!escuro) return;
    let pedindo = false;
    const medir = () => { pedindo = false; setSolida(window.scrollY > window.innerHeight * 0.5); };
    const aoRolar = () => { if (!pedindo) { pedindo = true; requestAnimationFrame(medir); } };
    medir();
    window.addEventListener('scroll', aoRolar, { passive: true });
    return () => window.removeEventListener('scroll', aoRolar);
  }, [escuro]);
  return (
    <div data-movimento>
      {/* o primeiro item focável da página. Quem navega por teclado pula a
          barra inteira com um Tab e um Enter. Invisível até receber foco. */}
      <a href="#conteudo" className="pular">Pular para o conteúdo</a>
      <Movimento />
      <Barra atual={atual} inicio={escuro} solida={solida} />
      {/* a regra global de `main` é do app interno: largura travada em 1180 e
          padding lateral. Aqui as faixas precisam sangrar de ponta a ponta,
          então a regra é desfeita nesta instância — não no CSS, que continua
          valendo para todas as telas do sistema. */}
      <main id="conteudo" style={{ maxWidth: 'none', margin: 0, padding: escuro ? 0 : 'var(--barra-alt) 0 0' }}>{children}</main>
      <Rodape />
    </div>
  );
}
