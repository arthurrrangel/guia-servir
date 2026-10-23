import Link from 'next/link';
import type { Evento } from '@/lib/site/medir';
import { FOTOS, type LugarDeFoto, type Foto } from '@/lib/site/fotos';
import { Simbolo, Chevron } from '@/components/Marca';
import { SIGLA } from '@/lib/igreja';
import { FC27 } from '@/lib/followcamp';
import { Fundo } from './Midia';
import Janela from './Janela';

/* =============================================================================
   OS BLOCOS DO SITE — as peças pequenas que toda página usa · 11/10/2026

   Tudo aqui é componente de servidor (sem estado): o HTML já nasce pronto.
   O desenho de cada peça está em app/site.css, com o nome da tela
   da apresentação de onde ela veio.
   ============================================================================= */

/* SEM VIÚVA: cola a última palavra na penúltima com espaço que não quebra.
   Texto centralizado que termina com uma palavra sozinha na linha parece
   erro; o text-wrap:balance resolve até 6 linhas no Chrome, e isto resolve
   em qualquer tamanho e em qualquer navegador. */
/* SEPARADOR COLADO: " · " dentro de uma linha de dados ("Will e Lucas · jovens
   · Follow") nunca fica sobrando no começo ou no fim de uma linha: o ponto
   gruda nas duas palavras vizinhas, e a quebra acontece num espaço comum */
export const pontos = (t: string) => t.replace(/ · /g, '\u00a0·\u2060\u00a0');

export const fim = (t: string) => {
  /* "… RJ · 22793-390": o Chrome quebra depois do "·" mesmo com espaço
     que não quebra, então o separador gruda nas duas pontas (U+2060 é o
     "juntador de palavras": invisível, proíbe quebra dos dois lados) */
  t = nomes(pontos(t));
  const sep = t.match(/^([\s\S]*\S)\s+([^\s\p{L}\p{N}]+)\s+(\S+)\s*$/u);
  const colado = sep ? `${sep[1]}\u00a0${sep[2]}\u2060\u00a0${sep[3]}` : t.replace(/\s+(\S+)\s*$/, '\u2060\u00a0$1');
  /* hífen dentro da última palavra (CEP 22793-390) também é ponto de quebra:
     o juntador depois dele mantém a palavra inteira */
  return colado.replace(/-(?=[^\s]*$)/g, '-\u2060');
};

/* PALAVRA CURTA NÃO FICA NO FIM DA LINHA · 12/10/2026
   Em texto centralizado, "o", "a", "de", "que" sozinhos no fim de uma linha
   ("Que Deus multiplique o / que você semeou") puxam o olho para a borda
   torta. Regra de composição: a palavra curta gruda na seguinte com espaço
   que não quebra. Duas passadas, para pegar sequências ("e a vida").
   21/10/2026: "às" entrou ("Culto todo domingo, às / 10h" partia a hora). */
const CURTAS = 'o|a|e|é|de|da|do|em|no|na|um|uma|à|às|ao|os|as|pra|para|por|que|se|com|dos|das|nos|nas|seu|sua|te|me|eu|ou|nem|só|sem|há';
/* TÍTULO (liga): só gruda se a palavra seguinte for curta (até 9 letras):
   "da responsabilidade" grudado vira um bloco que não cabe numa linha de 320.
   TEXTO CORRIDO (ligaTexto, 17 a 20 px): aceita até 16 letras ("uma
   comunidade:", "sua disponibilidade", "de tecnologia"); no corpo de texto o
   bloco grudado mais longo dá ~190 px, dois terços da coluna mais estreita. */
const reCurta = (max: number) => new RegExp(`(^|[\\s\u00a0("“])(${CURTAS})[ ]+(?=[^\\s]{1,${max}}(?:[\\s]|$))`, 'giu');
const RE_CURTA = reCurta(9);
const RE_CURTA_TEXTO = reCurta(16);
/* NOME NÃO SE PARTE · 21/10/2026: no celular "na GUIA / Church, Barra da Tijuca"
   quebrava o nome da igreja no meio. Os nomes próprios de duas ou três palavras
   que o site repete viram um bloco só (espaço que não quebra) */
const NOMES = /GUIA Church|GUIA Kids|GUIA Servir|Follow Camp|Pequenas? Guias?|Barra da Tijuca|Pedra de Itaúna/gu;
const nomes = (t: string) => t.replace(NOMES, m => m.replace(/ /g, '\u00a0'));
export const liga = (t: string) => nomes(t).replace(RE_CURTA, '$1$2\u00a0').replace(RE_CURTA, '$1$2\u00a0');
export const ligaTexto = (t: string) => nomes(t).replace(RE_CURTA_TEXTO, '$1$2\u00a0').replace(RE_CURTA_TEXTO, '$1$2\u00a0');
const CURTA_NO_FIM = new RegExp(`(^|\\s)(${CURTAS})$`, 'iu');

/* SEPARADOR " · " entre dois trechos de uma linha (endereço, horário). No
   celular, centralizado, o ponto sobrava no começo ou no fim de uma linha:
   abaixo de 760 px ele vira quebra de linha (e continua sendo lido). */
export const Sep = () => <span className="s-sep"> · </span>;

/* PALAVRA COM HÍFEN INTEIRA: "e-mail" não parte em "e-" / "mail" */
export const inteiro = (t: string) => t.replace(/(\p{L})-(?=\p{L})/gu, '$1-\u2060');

/* FAIXA DE NÚMEROS INTEIRA (23/10/2026, o 22e): "TURMA 2-4 PROFESSORA", nas funções
   do GUIA Kids, partia em "2-" / "4 PROFESSORA" abaixo de 320 (o hífen é ponto de
   quebra). O juntador depois do hífen mantém a faixa num pedaço só; o nome vem do
   banco e não muda, só a quebra */
export const faixaInteira = (t: string) => t.replace(/(\d)-(?=\d)/g, '$1-\u2060');

/* UMA LINHA NO CELULAR · 14/10/2026
   A regra do Arthur de 11/10 (título + uma linha; cartão = título + uma
   frase) tinha se perdido quando o site foi refeito do zero na mesma noite:
   24 de 26 cartões e metade das faixas voltaram a ter parágrafo. No celular
   ela volta sem mexer no computador (o computador segue o PDF): a primeira
   frase fica, o resto vai num .s-resto, que some abaixo de 760 px. O texto
   inteiro continua no HTML, para o computador, o Google e o leitor de tela
   do computador. Sem frase seguinte, sai o texto como era. */
export const primeiraFrase = (t: string): [string, string] => {
  const m = t.match(/^([\s\S]*?[.!?…])\s+(\S[\s\S]*)$/);
  return m ? [m[1], m[2].trim()] : [t, ''];
};
/* `estreita` (21/10/2026): numa coluna estreita (os cartões das funções de cada
   área, 14,5 px em ~170 px de linha numa janela de 1000 px) o bloco grudado do texto
   corrido (até 16 letras, ~190 px) é maior que a linha, e sobrava uma palavra
   sozinha no meio do parágrafo ("necessários," / "com uma pluralidade"). Ali
   vale a régua do título: a curta só gruda numa palavra de até 9 letras */
export function UmaLinha({ texto, semFim, estreita }: { texto: string; semFim?: boolean; estreita?: boolean }) {
  const ligar = estreita ? liga : ligaTexto;
  const [a, b] = primeiraFrase(texto);
  if (!b) return <>{semFim ? ligar(a) : fim(ligar(a))}</>;
  return <>{ligar(a)}<span className="s-resto"> {semFim ? ligar(b) : fim(ligar(b))}</span></>;
}

/* O TÍTULO EM DUAS VOZES: a grotesca pesada e a última palavra (ou as
   últimas, com `it`) em serifa itálica, que ganha o ponto pelo CSS. A copy
   fica inteira no HTML, sem o ponto, e o leitor de tela lê a frase. */
export function Vozes({ children, it, as: Tag = 'h2', className = '', id, semPonto }:
  { children: string; it?: string; as?: 'h1' | 'h2' | 'h3' | 'p'; className?: string; id?: string; semPonto?: boolean }) {
  const texto = liga(children.trim());
  let antes = '', dep = '';
  const itL = it ? liga(it) : it;
  if (itL && texto.endsWith(itL)) { antes = texto.slice(0, texto.length - itL.length).trim(); dep = itL; }
  else if (itL) { antes = texto; dep = itL; }
  else {
    /* a última palavra de verdade: o espaço que não quebra (de `liga`) também
       separa palavra ("com o seu servir" não pode virar o itálico inteiro) */
    const i = Math.max(texto.lastIndexOf(' '), texto.lastIndexOf('\u00a0'));
    if (i > 0) { antes = texto.slice(0, i).trim(); dep = texto.slice(i + 1); }
    else { dep = texto; }
  }
  return (
    <Tag id={id} className={className}>
      {/* a primeira parte termina em palavra curta ("lugar para"): ela vai
          junto com o itálico, não fica sozinha no fim da linha; e o itálico
          de uma palavra só leva a anterior junto (não fica viúvo). No h1 o
          itálico é bloco (linha própria): lá o espaço comum some no fim da
          linha, e o que não quebra sobraria como recuo */}
      {antes && <>{antes}{Tag !== 'h1' && (CURTA_NO_FIM.test(antes) || (!/\s/.test(dep) && dep.length <= 10)) ? '\u00a0' : ' '}</>}
      {/* a frase que já termina em ? ou ! não ganha o ponto da folha (21/10/2026: "E se um
          culto pudesse mudar toda a sua vida?" saía com ponto, uma pergunta virando afirmação) */}
      <span className={'s-it' + (semPonto || /[?!]$/.test(dep) ? ' sem-ponto' : '')}>{dep}</span>
    </Tag>
  );
}

/* a assinatura das faixas (o carimbo do PDF): ornamento, não conteúdo. 21/10/2026:
   o leitor de tela lia "guiachurch, barra, sede" em quase toda faixa dos três
   sites; agora ela é só visual (aria-hidden). No Guia Follow a folha troca o
   desenho pelo chevron duplo da marca dele (app/site.css, "O SELO DO FOLLOW") */
export function Sede({ className = '' }: { className?: string }) {
  return <span className={'s-sede ' + className} aria-hidden="true"><b>guiachurch</b><i>|</i><span>sede</span></span>;
}
export function Arroba({ className = '' }: { className?: string }) {
  return <a href="https://instagram.com/guiachurch" target="_blank" rel="noreferrer" className={'s-arroba ' + className}>@guiachurch</a>;
}

/* o chapéu laranja: "Servir • Guia Church" */
export function Chapeu({ forte, resto, mudo }: { forte: string; resto?: string; mudo?: boolean }) {
  return (
    <p className={'s-chapeu' + (mudo ? ' mudo' : '')}>
      <b>{forte}</b>{resto && <><i aria-hidden="true" /><span>{resto}</span></>}
    </p>
  );
}

/* a pílula: Link para dentro, <a> para fora e para o sistema.
   19/10/2026: endereço completo (o outro site da GUIA, lib/site/sites.ts) e
   qualquer âncora também vão de <a>. O <Link> busca a página por fetch: para
   outro domínio o fetch esbarra no CORS, e uma âncora de outra página
   (/servir#areas) que passa por um redirecionamento perde o ponto. */
/* `medir`: o evento que o clique dispara (lib/site/medir.ts), quando a
   regra do link sozinha não diz (o "Avisar que vou" é WhatsApp, mas vale
   como "avisou que vai") */
export function Pil({ href, children, tom = '', duro, fora, className = '', medir }:
  { href: string; children: React.ReactNode; tom?: '' | 'preta' | 'vidro' | 'contorno'; duro?: boolean; fora?: boolean; className?: string; medir?: Evento }) {
  const cls = `s-pil ${tom} ${className}`.trim();
  if (fora) return <a href={href} target="_blank" rel="noreferrer" className={cls} data-medir={medir}>{children}</a>;
  if (duro || href.includes('#') || /^https?:/.test(href)) return <a href={href} className={cls} data-medir={medir}>{children}</a>;
  return <Link href={href} className={cls} data-medir={medir}>{children}</Link>;
}

/* o cartão (ou qualquer bloco que é link inteiro) com a mesma regra da pílula */
export function Ir({ href, className, children, duro }: { href: string; className?: string; children: React.ReactNode; duro?: boolean }) {
  if (duro || href.includes('#') || /^https?:/.test(href)) return <a href={href} className={className}>{children}</a>;
  return <Link href={href} className={className}>{children}</Link>;
}

/* a foto de um lugar do registro, com a versão pequena quando existe */
export function Img({ lugar, className = '', sizes = '100vw', prioridade, alt, retrato }:
  { lugar: LugarDeFoto; className?: string; sizes?: string; prioridade?: boolean; alt?: string; retrato?: boolean }) {
  const f: Foto = FOTOS[lugar];
  const srcSet = f.pequena ? `${f.pequena} 640w, ${f.arquivo} ${f.largura}w` : undefined;
  /* o ponto da foto que nunca sai do quadro: variável no estilo, e o CSS
     troca pelo do retrato quando a tela está em pé */
  const r0: { foco?: string; celular?: string } | undefined = f.retrato;
  const foco = { ...(f.foco ? { '--foco': f.foco } : {}), ...(r0?.foco ? { '--foco-r': r0.foco } : {}), ...(r0?.celular ? { '--foco-c': r0.celular } : {}) } as React.CSSProperties;
  const img = (
    <img
      src={f.arquivo}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      width={f.largura}
      height={f.altura}
      alt={alt ?? f.alt}
      className={className}
      style={Object.keys(foco).length ? foco : undefined}
      loading={prioridade ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={prioridade ? 'high' : undefined}
    />
  );
  /* herói e fecho no celular em pé: o recorte em pé (<picture>), para não
     ampliar uma faixa estreita da foto deitada */
  if (retrato && f.retrato) {
    const r = f.retrato;
    const rSet = r.pequena ? `${r.pequena} 640w, ${r.arquivo} ${r.largura}w` : `${r.arquivo} ${r.largura}w`;
    return (
      <picture>
        <source media="(orientation: portrait)" srcSet={rSet} sizes={sizes} width={r.largura} height={r.altura} />
        {img}
      </picture>
    );
  }
  return img;
}

/* os dois ícones do site: a seta e o visto */
export const Seta = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const Visto = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m4 12.5 5 5L20 6.5" /></svg>
);
export const Lupa = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.8-3.8" /></svg>
);
export const Fechar = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const SetaBaixo = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
);

/* AS PERGUNTAS · 12/10/2026
   No computador, a lista da apresentação: a pergunta em negrito e a resposta
   na mesma linha (forma "faq", telas 8) ou embaixo (forma "obj", tela 7).
   No celular, cada uma abre e fecha: a pergunta no eixo, a resposta só para
   quem quer ler. Seis respostas de cinco linhas centralizadas, uma atrás da
   outra, eram 700 px de texto corrido no meio da tela. As duas formas saem
   no HTML e o CSS mostra uma (sem JS, sem pulo de layout); o leitor de tela
   só ouve a que está visível. */
export function Perguntas({ itens, forma = 'faq', aberta = -1 }:
  { itens: ReadonlyArray<{ q: string; r: React.ReactNode }>; forma?: 'faq' | 'obj'; aberta?: number }) {
  const resp = (r: React.ReactNode) => (typeof r === 'string' ? fim(ligaTexto(r)) : r);
  return (
    <>
      {forma === 'faq'
        ? <div className="s-faq so-largo">{itens.map(p => <p key={p.q}><b>{liga(p.q)}</b> {resp(p.r)}</p>)}</div>
        : <div className="s-obj so-largo">{itens.map(p => <div key={p.q}><b>{liga(p.q)}</b><p>{resp(p.r)}</p></div>)}</div>}
      <div className={'s-abre so-celular' + (forma === 'obj' ? ' obj' : '')}>
        {itens.map((p, k) => (
          <details key={p.q} open={k === aberta}>
            <summary>{liga(p.q)}</summary>
            <div><p>{resp(p.r)}</p></div>
          </details>
        ))}
      </div>
    </>
  );
}

/* =============================================================================
   AS SEÇÕES QUE TODA PÁGINA REPETE · 20/10/2026
   O herói, o cartão claro, os passos em serifa, a faixa de perguntas e o
   fecho eram escritos à mão em cada página, cada um com o seu recuo. Aqui
   cada um tem UMA anatomia (a mesma ordem, as mesmas classes, o mesmo
   respiro, que mora em app/site.css) e a página só passa o texto.
   ============================================================================= */

/* O HERÓI DE FOTO (ou de vídeo, no /acessar e no /onde-me-encaixo): o chapéu,
   o título em duas vozes, a linha de apoio, as pílulas e o micro. A foto vem
   do registro (lib/site/fotos.ts), com o recorte em pé para o celular. */
export function Heroi({ id, lugar, video, chapeu, titulo, it, semPonto, longa, lead, micro, curto, porta, children }:
  { id: string; lugar?: LugarDeFoto; video?: string; chapeu: React.ReactNode; titulo: string; it?: string; semPonto?: boolean; longa?: boolean;
    lead?: React.ReactNode; micro?: React.ReactNode; curto?: boolean; porta?: boolean; children?: React.ReactNode }) {
  return (
    <section className={'s-heroi' + (curto ? ' curto' : '') + (porta ? ' porta' : '')} aria-labelledby={id}>
      {lugar ? <Img lugar={lugar} prioridade retrato /> : video ? <Fundo video={video} prioridade /> : null}
      <div className="s-in s-heroi-in">
        {chapeu}
        <Vozes as="h1" id={id} className={'s-h1' + (longa ? ' longa' : '')} it={it} semPonto={semPonto}>{titulo}</Vozes>
        {lead && <p className="s-lead grande">{lead}</p>}
        {children && <div className="s-acoes">{children}</div>}
        {micro && <p className="s-micro">{micro}</p>}
      </div>
    </section>
  );
}

/* O CARTÃO CLARO (tela 6): sobre a noite, o papel de canto redondo com a
   assinatura, o título e a linha de apoio; o miolo (perguntas, lista,
   formulário, pílulas) vem da página, na ordem que ela precisa. */
export function Claro({ id, tid, titulo, lead, soLargo, children }:
  { id?: string; tid: string; titulo: string; lead?: React.ReactNode; soLargo?: boolean; children?: React.ReactNode }) {
  return (
    <section id={id} className={'s-faixa noite s-grao justa' + (soLargo ? ' so-largo' : '')} aria-labelledby={tid}>
      <div className="s-in">
        <div className="s-claro s-rev">
          <Sede />
          <h2 id={tid} className="s-h2 menor">{liga(titulo)}</h2>
          {lead && <p className="s-lead">{lead}</p>}
          {children}
        </div>
      </div>
    </section>
  );
}

/* O CABEÇALHO EM SERIFA (tela 5): "Como funciona?" com a régua embaixo e a
   linha itálica; e OS PASSOS, a lista "01 - Cadastro" com a frase ao lado. */
export function SerifaCab({ id, titulo, sub }: { id: string; titulo: string; sub: string }) {
  return (
    <div className="s-passos-cab s-rev">
      <h2 id={id} className="s-serifa">{liga(titulo)}</h2>
      <p className="s-serifa it">{liga(sub)}</p>
    </div>
  );
}
export function Passos({ id, tid, titulo, sub, itens, tom = 'areia', sede = true }:
  { id?: string; tid: string; titulo: string; sub: string; itens: ReadonlyArray<{ n: string; t: string; d: string }>; tom?: 'areia' | 'papel'; sede?: boolean }) {
  return (
    <section id={id} className={`s-faixa ${tom}`} aria-labelledby={tid}>
      <div className="s-in">
        <SerifaCab id={tid} titulo={titulo} sub={sub} />
        <ol className="s-passos s-rev d1">
          {/* o número e o nome não se separam ("01 -" sozinho numa linha): espaços que não quebram */}
          {itens.map(p => <li key={p.n}><b>{`${p.n} - ${p.t}`}</b><p><UmaLinha texto={p.d} semFim /></p></li>)}
        </ol>
        {sede && <Sede className="base" />}
      </div>
    </section>
  );
}

/* A FAIXA DE PERGUNTAS (tela 8): o símbolo no canto, o título no bloco preto
   e a lista (no celular, as perguntas que abrem). */
export function FaixaPerguntas({ id, tid, titulo, itens, tom = 'papel', soLargo }:
  { id?: string; tid: string; titulo: string; itens: ReadonlyArray<{ q: string; r: React.ReactNode }>; tom?: 'papel' | 'areia' | 'noite'; soLargo?: boolean }) {
  return (
    <section id={id} className={`s-faixa ${tom} s-grao` + (soLargo ? ' so-largo' : '')} aria-labelledby={tid}>
      <Simbolo className="s-canto" />
      <div className="s-in">
        <h2 id={tid} className="s-faq-t s-rev">{liga(titulo)}</h2>
        <div className="s-rev d1"><Perguntas itens={itens} /></div>
      </div>
    </section>
  );
}

/* O FECHO: a frase e as ações, o último bloco da página. Até 12/10/2026 era
   uma foto escura de ponta a ponta, a mesma em seis páginas; desde 13/10
   (menos foto, pedido do Arthur) é a faixa com grão e a frase, como o fim
   da home. Na noite por padrão; depois de outra faixa escura, papel (as
   pílulas da página vêm pretas).
   20/10/2026: a JANELA, o fecho de assinatura da página principal de cada
   site (home, Follow): a foto vista pelo chevron da marca, que abre com a
   rolagem até a foto inteira (components/site/Janela.tsx, .s-janela em
   app/site.css). O título vai no corpo cheio; o resto é o mesmo fecho. */
export function Fecho({ titulo, it, lead, chapeu, children, tom = 'noite', id, soLargo, foto }:
  { titulo: string; it?: string; lead?: string; chapeu?: React.ReactNode; children: React.ReactNode; tom?: 'noite' | 'papel' | 'areia' | 'janela'; id?: string; soLargo?: boolean;
    /** só com tom "janela": a foto deitada e em pé (1920x1080 e 1080x1920) */
    foto?: { l: string; p: string } }) {
  const janela = tom === 'janela' && foto;
  const quadro = janela && (
    <picture>
      <source media="(orientation: portrait)" srcSet={foto.p} type="image/webp" />
      <img src={foto.l} width={1920} height={1080} alt="" loading="lazy" decoding="async" />
    </picture>
  );
  return (
    <section id={id} className={(janela ? 's-faixa noite s-janela' : `s-faixa ${tom} s-grao`) + ' s-fim' + (soLargo ? ' so-largo' : '')} aria-labelledby="t-fim">
      {janela && (
        <>
          <div className="s-janela-foto" aria-hidden="true">{quadro}<div className="s-janela-mascara">{quadro}</div></div>
          <Janela />
        </>
      )}
      <div className="s-in s-centro">
        <Sede className="topo" />
        <div className="s-rev">
          {chapeu}
          {/* a janela leva o corpo cheio quando a frase é curta ("Sempre cabe mais um"); uma frase longa fica no corpo médio, como todo fecho */}
          <Vozes id="t-fim" className={janela && titulo.length <= 26 ? 's-h2' : 's-h2 media'} it={it}>{titulo}</Vozes>
          {lead && <p className="s-lead grande"><UmaLinha texto={lead} semFim /></p>}
        </div>
        <div className="s-acoes centro s-rev d1">{children}</div>
      </div>
    </section>
  );
}

/* O FOLLOW CAMP (a faixa de areia): a mesma peça em /eventos e no
   guiafollow.com. 20/10/2026: estava escrita duas vezes, e as duas já
   tinham divergido (uma sem o id do título, com o aria-labelledby quebrado).
   O nome e as datas vêm de lib/followcamp.ts, com o resto do Camp. */
export function FaixaCamp({ href }: { href: string }) {
  return (
    <section id="camp" className="s-faixa areia" aria-labelledby="t-camp">
      <div className="s-in">
        <div className="s-so-texto s-rev">
          <Chapeu forte={FC27.nome} resto={FC27.datas} />
          {/* 21/10/2026: as palavras da própria página do Camp ("cinco noites longe da rotina",
              13 a 24 anos, Espaço Bethel); dizia "seis dias", que a página do Camp não diz */}
          <Vozes id="t-camp" className="s-h2 media" it="rotina">Cinco noites longe da rotina</Vozes>
          <p className="s-lead"><UmaLinha semFim texto="O retiro do Follow no Carnaval, pra quem tem de 13 a 24 anos: louvor, Palavra, natureza e gente da sua idade, no Espaço Bethel. Inscrição e pagamento na página do Camp." /></p>
          <div className="s-acoes">
            <Pil href={href} duro tom="preta">Quero ir no Camp</Pil>
          </div>
        </div>
      </div>
    </section>
  );
}

/* A SIGLA (G · U · I · >): as quatro letras com a definição de cada uma,
   na home (dentro do cartão claro) e em /sobre (na noite). Os textos moram
   em lib/igreja.ts (SIGLA); aqui só a peça, uma vez. */
export function Sigla({ className = '' }: { className?: string }) {
  return (
    <ul className={`s-sigla ${className}`.trim()}>
      {SIGLA.map(l => (
        <li key={l.t}>
          <span className="s-letra">{l.l === '>' ? <Chevron /> : l.l}</span>
          <b>{l.t}</b>
          <p>{l.d}</p>
        </li>
      ))}
    </ul>
  );
}
