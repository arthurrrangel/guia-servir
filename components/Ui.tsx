'use client';
/* Peças visuais compartilhadas: medidor, anel de progresso, avisos, escolha.

   O AVATAR SAIU DAQUI. Ele desenhava um círculo colorido com as iniciais, e a
   cor vinha de um hash do nome — ou seja, oito cores que não significavam
   nada, num sistema onde cor significa estado. Em /time isso rendia 86
   círculos coloridos numa tela só, e ao lado de cada um o nome inteiro
   escrito por extenso: "AR" ao lado de "Amanda Ribeiro" não informa, ocupa.
   /escala já tinha tirado pelo mesmo motivo. */
import { IcAlerta, IcCheck, IcInfo, IcX } from './Icones';

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
  /* quando um aviso surge depois de uma ação (erro ao salvar, PIN errado,
     "pronto"), o leitor de tela precisa anunciá-lo — senão a pessoa cega toca
     e não sabe o que aconteceu. Erro interrompe (alert); o resto é gentil
     (status). Avisos já presentes na carga não são reanunciados: live region
     só dispara em mudança, então painéis fixos de info seguem silenciosos. */
  return <div className={`aviso ${tom}`} role={tom === 'erro' ? 'alert' : 'status'}><Ic /><div>{children}</div></div>;
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
