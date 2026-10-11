import Link from 'next/link';
import { FOTOS, type LugarDeFoto, type Foto } from '@/lib/site/fotos';

/* =============================================================================
   OS BLOCOS DO SITE — as peças pequenas que toda página usa · 11/10/2026

   Tudo aqui é componente de servidor (sem estado): o HTML já nasce pronto.
   O desenho de cada peça está em app/(site)/site.css, com o nome da tela
   da apresentação de onde ela veio.
   ============================================================================= */

/* O TÍTULO EM DUAS VOZES: a grotesca pesada e a última palavra (ou as
   últimas, com `it`) em serifa itálica, que ganha o ponto pelo CSS. A copy
   fica inteira no HTML, sem o ponto, e o leitor de tela lê a frase. */
export function Vozes({ children, it, as: Tag = 'h2', className = '', id, semPonto }:
  { children: string; it?: string; as?: 'h1' | 'h2' | 'h3' | 'p'; className?: string; id?: string; semPonto?: boolean }) {
  const texto = children.trim();
  let antes = '', dep = '';
  if (it && texto.endsWith(it)) { antes = texto.slice(0, texto.length - it.length).trim(); dep = it; }
  else if (it) { antes = texto; dep = it; }
  else {
    const i = texto.lastIndexOf(' ');
    if (i > 0) { antes = texto.slice(0, i); dep = texto.slice(i + 1); }
    else { dep = texto; }
  }
  return (
    <Tag id={id} className={className}>
      {antes && <>{antes} </>}
      <span className={'s-it' + (semPonto ? ' sem-ponto' : '')}>{dep}</span>
    </Tag>
  );
}

/* a assinatura das faixas */
export function Sede({ className = '' }: { className?: string }) {
  return <span className={'s-sede ' + className}><b>guiachurch</b><i>|</i><span>sede</span></span>;
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

/* a pílula: Link para dentro, <a> para fora e para o sistema */
export function Pil({ href, children, tom = '', duro, fora, className = '' }:
  { href: string; children: React.ReactNode; tom?: '' | 'preta' | 'vidro' | 'contorno'; duro?: boolean; fora?: boolean; className?: string }) {
  const cls = `s-pil ${tom} ${className}`.trim();
  if (fora) return <a href={href} target="_blank" rel="noreferrer" className={cls}>{children}</a>;
  if (duro || href.startsWith('#')) return <a href={href} className={cls}>{children}</a>;
  return <Link href={href} className={cls}>{children}</Link>;
}

/* a foto de um lugar do registro, com a versão pequena quando existe */
export function Img({ lugar, className = '', sizes = '100vw', prioridade, alt }:
  { lugar: LugarDeFoto; className?: string; sizes?: string; prioridade?: boolean; alt?: string }) {
  const f: Foto = FOTOS[lugar];
  const srcSet = f.pequena ? `${f.pequena} 640w, ${f.arquivo} ${f.largura}w` : undefined;
  return (
    <img
      src={f.arquivo}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      width={f.largura}
      height={f.altura}
      alt={alt ?? f.alt}
      className={className}
      style={f.foco ? { objectPosition: f.foco } : undefined}
      loading={prioridade ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={prioridade ? 'high' : undefined}
    />
  );
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

/* O FECHO: a foto escura, uma frase, as ações. O último bloco de toda página. */
export function Fecho({ titulo, it, lead, children, lugar = 'fecho' }:
  { titulo: string; it?: string; lead?: string; children: React.ReactNode; lugar?: LugarDeFoto }) {
  return (
    <section className="s-fecho s-rev">
      <Img lugar={lugar} />
      <div className="s-in">
        <Vozes className="s-h2 media" it={it}>{titulo}</Vozes>
        {lead && <p className="s-lead">{lead}</p>}
        <div className="s-acoes centro">{children}</div>
      </div>
    </section>
  );
}
