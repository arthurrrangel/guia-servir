'use client';
/* =============================================================================
   AS PEÇAS DAS ESCALAS · 30/09/2026

   O mesmo vocabulário em toda tela de quem monta a escala: cabeçalho, faixa
   de números, seção, pílula, aviso, vazio, dobra e a escolha nativa. Cada
   peça decide a FORMA; quem chama decide o conteúdo. É o que faz oito telas
   parecerem um produto só sem que alguém precise lembrar de oito regras.

   O desenho mora em `components/escalas/escalas.css`, e tudo aqui escreve
   classe `es-`: fora de `.es` estas peças não têm roupa nenhuma, de
   propósito (ver a trava no topo da folha).
============================================================================= */
import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { IcAlerta, IcCheck, IcInfo, IcX } from '@/components/Icones';

/* O TOM É FIXO NO SISTEMA INTEIRO:
     bad    falta gente (sem ninguém, furou, não pode)
     warn   espera resposta (sem responder, esperando você)
     ok     de pé (confirmado, coberto, conferido)
     info   um fato a saber (primeira vez, fixo, plantão, novo)
     neutro sem juízo (não montada, já passou, encerrada) */
export type Tom = 'ok' | 'warn' | 'bad' | 'info' | 'neutro';
export const tomCls = (t?: Tom | '' | null) => (t && t !== 'neutro' ? ` es-${t}` : '');

/* a situação do motor (lib/engine.ts, `classificar`) no tom da tela */
export const tomDaSituacao = (s: 'ok' | 'atencao' | 'critico'): Tom =>
  s === 'critico' ? 'bad' : s === 'atencao' ? 'warn' : 'ok';

/* a situação de um posto (pendente, confirmado, recusado, furou) */
export const tomDoStatus = (st?: string | null): Tom =>
  st === 'confirmado' ? 'ok' : st === 'recusado' || st === 'furou' ? 'bad' : 'warn';

/* ---------------------------------------------------------------- cabeçalho
   rot     de onde é isto, ou quando ("Quarta-feira, 30 de setembro")
   titulo  a situação, ou o assunto. Nunca o nome do ministério: a lateral
           já diz, e o maior texto da tela repetindo o menor é ruído
   meta    uma linha de fatos, só quando acrescenta
   acoes   no máximo uma cheia; o resto contorno ou texto */
export function Cab({ rot, titulo, meta, acoes, comSetas, idTitulo }: {
  rot?: ReactNode; titulo: ReactNode; meta?: ReactNode; acoes?: ReactNode; comSetas?: boolean;
  /** quando a tela leva o foco ao título (troca de mês, por exemplo) */
  idTitulo?: string;
}) {
  return (
    <header className="es-cab">
      <div className="es-cab-linha">
        <div className="es-cab-txt">
          {rot && <div className="es-rot">{rot}</div>}
          <h1 className={`es-cab-titulo${comSetas ? ' es-com-setas' : ''}`} id={idTitulo} tabIndex={idTitulo ? -1 : undefined}>{titulo}</h1>
          {meta && <div className="es-cab-meta">{meta}</div>}
        </div>
        {acoes && <div className="es-cab-acoes">{acoes}</div>}
      </div>
    </header>
  );
}

/* ------------------------------------------------------- faixa de números */
export function Kpis({ n, children }: { n: number; children: ReactNode }) {
  return <div className="es-kpis" style={{ '--es-n': n } as CSSProperties}>{children}</div>;
}

export function Kpi({ rot, valor, de, sub, tom, destaque, texto, href, rotulo }: {
  rot: ReactNode; valor: ReactNode; de?: ReactNode; sub?: ReactNode;
  /** bad/warn pintam o número; zero apaga para cinza */
  tom?: 'bad' | 'warn' | 'zero' | '';
  /** o ponto preto de "é com você" */
  destaque?: boolean;
  /** o valor é uma palavra ("não montada"), não um número */
  texto?: boolean;
  href?: string;
  /** leitura inteira para o leitor de tela, quando o número sozinho não diz */
  rotulo?: string;
}) {
  const cls = `es-kpi${tom ? ` es-${tom}` : ''}${destaque ? ' es-destaque' : ''}${texto ? ' es-texto' : ''}`;
  const miolo = (
    <>
      <span className="es-kpi-rot">{rot}</span>
      <span className="es-kpi-valor">{valor}{de !== undefined && de !== null && <small>/{de}</small>}</span>
      {sub && <span className="es-kpi-sub">{sub}</span>}
    </>
  );
  return href
    ? <Link className={cls} href={href} aria-label={rotulo}>{miolo}</Link>
    : <div className={cls} aria-label={rotulo} role={rotulo ? 'group' : undefined}>{miolo}</div>;
}

/* ----------------------------------------------------------------- seção */
export function Secao({ titulo, n, sub, acoes, id, children, className }: {
  titulo: ReactNode; n?: number | null; sub?: ReactNode; acoes?: ReactNode;
  id?: string; children?: ReactNode; className?: string;
}) {
  return (
    <section className={`es-secao${className ? ' ' + className : ''}`} id={id}>
      <div className="es-secao-cab">
        <div>
          <h2 className="es-secao-titulo">
            {titulo}
            {!!n && <span className="es-selo" aria-label={`${n}`}>{n > 99 ? '99+' : n}</span>}
          </h2>
          {sub && <p className="es-secao-sub">{sub}</p>}
        </div>
        {acoes && <div className="es-linha">{acoes}</div>}
      </div>
      {children}
    </section>
  );
}

/* ---------------------------------------------------------------- pílula */
export function Pilula({ tom, children }: { tom?: Tom; children: ReactNode }) {
  return (
    <span className={`es-pill${tomCls(tom)}`}>
      <span className={`es-ponto${tomCls(tom)}`} aria-hidden="true" />
      {children}
    </span>
  );
}

/* ----------------------------------------------------------------- aviso
   Ícone junto do tom: estado nunca é só cor. Quando surge depois de uma
   ação, o leitor de tela precisa anunciar: erro interrompe (alert), o resto
   é gentil (status). Aviso presente na carga não é reanunciado. */
export function Aviso({ tom = 'info', children }: { tom?: 'ok' | 'warn' | 'bad' | 'info'; children: ReactNode }) {
  const Ic = tom === 'ok' ? IcCheck : tom === 'bad' ? IcX : tom === 'warn' ? IcAlerta : IcInfo;
  return (
    <div className={`es-aviso es-${tom}`} role={tom === 'bad' ? 'alert' : 'status'}>
      <Ic /><div>{children}</div>
    </div>
  );
}

/* ----------------------------------------------------------------- vazio */
export function Vazio({ titulo, children, bom, icone, solto }: {
  titulo: ReactNode; children?: ReactNode; bom?: boolean; icone?: ReactNode; solto?: boolean;
}) {
  return (
    <div className={`es-vazio${bom ? ' es-bom' : ''}${solto ? ' es-solto' : ''}`}>
      {icone && <span className="es-vazio-ico" aria-hidden="true">{icone}</span>}
      <h3>{titulo}</h3>
      {children && <div>{children}</div>}
    </div>
  );
}

/* -------------------------------------------------------------- esqueleto */
export function Esqueleto() {
  return (
    <div className="es-esqueleto" aria-busy="true" aria-label="Carregando">
      <div style={{ height: 56, maxWidth: 420 }} />
      <div style={{ height: 92 }} />
      <div style={{ height: 88 }} />
      <div style={{ height: 240 }} />
    </div>
  );
}

/* O FIO DE TRABALHO. Enquanto uma ação grava, os botões ficam `disabled` e
   ganham a cara de "você não pode". Este fio, no alto, diz a outra coisa:
   "estou fazendo". */
export function Fio() {
  return <div className="es-fio" role="status" aria-label="Salvando" />;
}

/* ----------------------------------------------------------------- dobra */
export function Dobra({ titulo, nota, aberta, id, children }: {
  titulo: ReactNode; nota?: ReactNode; aberta?: boolean; id?: string; children: ReactNode;
}) {
  return (
    <details className="es-dobra" open={aberta} id={id}>
      <summary><span>{titulo}</span>{nota && <small>{nota}</small>}</summary>
      <div className="es-dobra-corpo">{children}</div>
    </details>
  );
}

/* -------------------------------------------------------- a escolha nativa
   O texto visível é nosso e o <select> fica por cima, transparente, ocupando
   o invólucro inteiro: toque, teclado e leitor de tela continuam nativos.

   forma "pill"   a situação de um posto, com o tom do estado
   forma "campo"  a pessoa de um posto, com cara de campo */
export function Escolha({ valor, rotulo, mostra, vazia, desabilitado, aoMudar, tom, forma = 'campo', children }: {
  valor: string; rotulo: string; mostra: ReactNode; vazia?: boolean;
  desabilitado?: boolean; aoMudar: (v: string) => void; tom?: Tom;
  forma?: 'pill' | 'campo'; children: ReactNode;
}) {
  const cls = `es-escolha es-como-${forma}${tomCls(tom)}${vazia ? ' es-vazia' : ''}${desabilitado ? ' es-off' : ''}`;
  /* o invólucro é um <label>: o texto desenhado e o <select> são uma peça só
     para o navegador, e o que parece campo é, de fato, parte do controle */
  return (
    <label className={cls}>
      <span className="es-escolha-txt" aria-hidden="true">{mostra}</span>
      <select value={valor} disabled={desabilitado} aria-label={rotulo} onChange={e => aoMudar(e.target.value)}>
        {children}
      </select>
    </label>
  );
}
