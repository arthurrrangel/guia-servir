'use client';
/* Peças visuais compartilhadas: avatar, medidor, anel de progresso, avisos. */
import { IcAlerta, IcCheck, IcInfo, IcX } from './Icones';

/* avatar com iniciais e cor estável por nome */
export function Avatar({ nome, grande }: { nome?: string | null; grande?: boolean }) {
  if (!nome) return <span className={`avatar vazio ${grande ? 'g' : ''}`}>?</span>;
  const partes = nome.trim().split(/\s+/);
  const ini = (partes[0][0] + (partes[1]?.[0] || '')).toUpperCase();
  let h = 0;
  for (const c of nome) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return <span className={`avatar av-${h % 8} ${grande ? 'g' : ''}`}>{ini}</span>;
}

/* medidor: fill carrega a severidade; trilho é passo claro da MESMA rampa */
export function Medidor({ valor, total, grau }: { valor: number; total: number; grau: 'ok' | 'warn' | 'bad' }) {
  const pct = total > 0 ? Math.min(100, Math.round((valor / total) * 100)) : 0;
  return (
    <div className={`medidor ${grau}`} role="img" aria-label={`${valor} de ${total}`}>
      <div className="fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

/* anel de progresso do hero (confirmações do domingo) */
export function Anel({ valor, total, cor }: { valor: number; total: number; cor: string }) {
  const R = 36, C = 2 * Math.PI * R;
  const frac = total > 0 ? valor / total : 0;
  return (
    <div className="anel" role="img" aria-label={`${valor} de ${total} confirmados`}>
      <svg viewBox="0 0 88 88">
        <circle className="fundo" cx="44" cy="44" r={R} fill="none" strokeWidth="8" />
        <circle className="valor" cx="44" cy="44" r={R} fill="none" strokeWidth="8"
          stroke={cor} strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - frac)} />
      </svg>
      {/* só o número dentro do anel: "confirmados" por extenso não cabe no
          miolo e encostava no traço. O sentido fica no aria-label e na legenda
          de fora. */}
      <div className="anel-texto"><div className="n">{valor}/{total}</div></div>
    </div>
  );
}

/* aviso com ícone correspondente ao tom (status nunca é só cor) */
export function Aviso({ tom, children }: { tom: 'erro' | 'atencao' | 'info' | 'bom'; children: React.ReactNode }) {
  const Ic = tom === 'bom' ? IcCheck : tom === 'erro' ? IcX : tom === 'atencao' ? IcAlerta : IcInfo;
  return <div className={`aviso ${tom}`}><Ic /><div>{children}</div></div>;
}

export function Esqueleto() {
  return (
    <div className="esqueleto">
      <div className="osso" style={{ height: 148, marginBottom: 14, borderRadius: 20 }} />
      <div className="osso" style={{ height: 64, marginBottom: 10 }} />
      <div className="osso" style={{ height: 64, marginBottom: 10 }} />
      <div className="osso" style={{ height: 64, width: '70%' }} />
    </div>
  );
}

/* -----------------------------------------------------------------------------
   O SELECT QUE NÃO SEQUESTRA A LINHA

   Um <select> nativo mostra, fechado, o texto inteiro da opção escolhida. As
   opções aqui precisam de contexto para a ESCOLHA ("pode · Giovana Rosalem ·
   titular · 2 escalas/60d"), e era isso que aparecia cortado em 390px, virando
   "Giovana Rosalem · titula...". Quem lê a escala quer o nome; quem escolhe
   quer o contexto. São dois momentos.

   Aqui o texto visível é meu e o <select> fica por cima, transparente,
   ocupando a linha inteira. Toque, teclado e leitor de tela continuam sendo os
   nativos — o seletor não foi reimplementado, só ficou invisível. O foco é
   desenhado no invólucro.
----------------------------------------------------------------------------- */
export function Escolha({ valor, rotulo, mostra, vazio, desabilitado, aoMudar, classe, children }: {
  valor: string; rotulo: string; mostra: string; vazio?: boolean;
  desabilitado?: boolean; aoMudar: (v: string) => void; classe?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={`esc-sel ${classe || ''} ${vazio ? 'vazio' : ''} ${desabilitado ? 'off' : ''}`}>
      <span className="esc-sel-txt" aria-hidden="true">{mostra}</span>
      <select value={valor} disabled={desabilitado} aria-label={rotulo}
        onChange={e => aoMudar(e.target.value)}>
        {children}
      </select>
    </span>
  );
}
