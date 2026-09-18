'use client';
/* As peças. Poucas de propósito: o que separa as coisas aqui é espaço e peso,
   não borda nem cor. */

import { useEffect, useState } from 'react';

export function Aviso({ tom, children }: {
  tom: 'ok' | 'warn' | 'bad' | 'info'; children: React.ReactNode;
}) {
  /* leitor de tela: erro interrompe, o resto é gentil. Um aviso que aparece
     depois de uma ação e não é anunciado deixa a pessoa cega sem saber o que
     aconteceu. */
  return <div className={`dm-aviso dm-${tom}`} role={tom === 'bad' ? 'alert' : 'status'}>{children}</div>;
}

export function Pill({ tom, children }: {
  tom?: 'ok' | 'warn' | 'bad' | 'info'; children: React.ReactNode;
}) {
  return <span className={`dm-pill ${tom ? 'dm-' + tom : ''}`}>{children}</span>;
}

export function Campo({ rot, ajuda, children }: {
  rot: string; ajuda?: string; children: React.ReactNode;
}) {
  return (
    <label className="dm-campo">
      <span>{rot}</span>
      {children}
      {ajuda ? <small>{ajuda}</small> : null}
    </label>
  );
}

/** Escolha de poucas opções: botão em vez de select. Um toque, não dois. */
export function Opcoes<T extends string>({ valor, opcoes, aoMudar, rot }: {
  valor: T; opcoes: { v: T; rot: string }[]; aoMudar: (v: T) => void; rot: string;
}) {
  return (
    <div className="dm-opcoes" role="group" aria-label={rot}>
      {opcoes.map(o => (
        <button key={o.v} type="button" aria-pressed={valor === o.v} onClick={() => aoMudar(o.v)}>
          {o.rot}
        </button>
      ))}
    </div>
  );
}

export function Esqueleto({ linhas = 4 }: { linhas?: number }) {
  return (
    <div className="dm-esqueleto" aria-hidden="true">
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} style={{ height: i === 0 ? 92 : 64, marginBottom: 10, width: i === linhas - 1 ? '70%' : '100%' }} />
      ))}
    </div>
  );
}

export function Vazio({ titulo, children }: { titulo: string; children?: React.ReactNode }) {
  return (
    <div className="dm-card dm-centro" style={{ padding: 'var(--dm-e5) var(--dm-e3)' }}>
      <div className="dm-rot" style={{ marginBottom: 6 }}>{'>'} nada aqui</div>
      <h3 style={{ marginBottom: 8 }}>{titulo}</h3>
      <div className="dm-peq dm-mudo">{children}</div>
    </div>
  );
}

/* Caixa de texto que vira ação: o padrão de "concluir", "travar", "cancelar".
   O botão só liga quando há texto, porque o banco vai recusar vazio de
   qualquer jeito e é melhor a pessoa ver isso antes de tocar. */
export function CaixaDeAcao({ rot, dica, botao, tom, exigeTexto = true, salvando, aoEnviar, extra }: {
  rot: string; dica?: string; botao: string;
  tom?: 'pri' | 'perigo'; exigeTexto?: boolean; salvando?: boolean;
  aoEnviar: (texto: string) => void; extra?: React.ReactNode;
}) {
  const [t, setT] = useState('');
  return (
    <div className="dm-card">
      <Campo rot={rot} ajuda={dica}>
        <textarea value={t} onChange={e => setT(e.target.value)} />
      </Campo>
      {extra}
      <button className={`dm-btn dm-${tom || 'pri'} dm-larga`} disabled={salvando || (exigeTexto && !t.trim())}
        onClick={() => { aoEnviar(t.trim()); setT(''); }}>
        {salvando ? 'Salvando…' : botao}
      </button>
    </div>
  );
}

/** Copia para a área de transferência e diz que copiou. */
export function Copiar({ texto, rot = 'Copiar' }: { texto: string; rot?: string }) {
  const [feito, setFeito] = useState(false);
  useEffect(() => { if (!feito) return; const i = setTimeout(() => setFeito(false), 1800); return () => clearTimeout(i); }, [feito]);
  return (
    <button className="dm-btn dm-peq" onClick={async () => {
      try { await navigator.clipboard.writeText(texto); setFeito(true); } catch {}
    }}>{feito ? 'Copiado' : rot}</button>
  );
}
