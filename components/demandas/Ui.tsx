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

/** Copia para a área de transferência e diz que copiou — ou que não copiou.

    O `catch {}` VAZIO ERA UM BOTÃO QUE MENTE — 19/09/2026.

    A versão anterior tentava `navigator.clipboard.writeText` e engolia a
    falha. Quando falhava, o rótulo simplesmente não mudava: a pessoa tocava,
    nada acontecia, nada explicava, e ela ia colar uma área de transferência
    vazia no grupo do WhatsApp.

    E falha com frequência: `navigator.clipboard` exige contexto seguro e,
    em vários navegadores, gesto do usuário reconhecido — dentro de um
    `async` que já cedeu a vez, o gesto pode ter expirado. É por isso que o
    `copiar()` do outro sistema (`components/Shell.tsx`) tem o plano B com
    `execCommand` e avisa quando os dois falham. Aqui faltava.

    Três estados agora, e o terceiro é o que importa: copiou, não copiou, e
    o texto à mostra para a pessoa selecionar com o dedo. */
export function Copiar({ texto, rot = 'Copiar' }: { texto: string; rot?: string }) {
  const [fase, setFase] = useState<'' | 'feito' | 'falhou'>('');
  useEffect(() => {
    if (fase !== 'feito') return;
    const i = setTimeout(() => setFase(''), 1800);
    return () => clearTimeout(i);
  }, [fase]);

  async function tentar() {
    try { await navigator.clipboard.writeText(texto); setFase('feito'); return; } catch { /* plano B */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = texto; ta.readOnly = true;
      ta.style.position = 'fixed'; ta.style.left = '-9999px'; ta.style.top = '0';
      document.body.appendChild(ta); ta.select();
      const deu = document.execCommand('copy');
      ta.remove();
      setFase(deu ? 'feito' : 'falhou');
    } catch { setFase('falhou'); }
  }

  if (fase === 'falhou') {
    return (
      <span className="dm-copiar-falhou">
        <span className="dm-peq dm-mudo">Não consegui copiar. Selecione e copie:</span>
        <textarea className="dm-copiar-cru" readOnly rows={3} value={texto}
          onFocus={e => e.currentTarget.select()} />
      </span>
    );
  }
  return (
    <button className="dm-btn dm-peq" onClick={tentar}>{fase === 'feito' ? 'Copiado' : rot}</button>
  );
}
