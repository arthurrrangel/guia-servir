'use client';
/* =============================================================================
   OS CONVITES PARA COBRIR, NO LINK DO VOLUNTÁRIO — 106, 02/10/2026

   A liderança chamou a pessoa para cobrir uma vaga aberta (Fase 4 do estudo
   do ServoApp). Aqui ela responde em um toque: "Posso cobrir" passa a vaga
   na hora, já confirmada; "Não posso" registra, e a liderança vê.

   Logo abaixo do "Precisa de você", porque também pede resposta, e o aviso
   no celular (104) abre a página aqui (#chamadas).

   Só aparece com a migração 106 no banco: a página só mostra isto depois que
   `eu_chamadas` respondeu com algum convite. As frases moram em
   lib/chamadas.ts, onde o teste alcança.
   ============================================================================= */
import { useState } from 'react';
import { sbPublico as sb } from '@/lib/supabase';
import { aviseHumano } from '@/lib/erros';
import { quandoDaVaga, motivoParaMim } from '@/lib/trocas';
import { type ChamadaMinha, erroAoResponderChamada, noticiaDaChamada, separarChamadas } from '@/lib/chamadas';

type Props = {
  token: string;
  chamadas: ChamadaMinha[];
  cultoHora: string; followHora?: string | null;
  aoMudar: () => Promise<void> | void;
  avisar: (msg: string) => void;
  errar: (msg: string) => void;
};

export default function ChamadasDoVoluntario(p: Props) {
  const { abertas, fechadas } = separarChamadas(p.chamadas);
  const [ocupado, setOcupado] = useState('');
  if (!abertas.length && !fechadas.length) return null;
  const quando = (c: ChamadaMinha) => quandoDaVaga(c, p.cultoHora, p.followHora);

  async function responder(c: ChamadaMinha, aceita: boolean) {
    setOcupado(c.id);
    const { data, error } = await sb()!.rpc('eu_chamada_responder', { p_token: p.token, p_chamada: c.id, p_aceita: aceita });
    setOcupado('');
    if (error) { p.errar(aviseHumano(error, 'responder')); return; }
    const r = data as any;
    if (!r?.ok) { p.errar(erroAoResponderChamada(r)); await p.aoMudar(); return; }
    p.avisar(aceita
      ? `Pronto. ${c.funcao} é sua, já confirmada.`
      : 'Registrado. A liderança vê a sua resposta.');
    await p.aoMudar();
  }

  async function possoNoDia(c: ChamadaMinha) {
    setOcupado(c.id);
    const { error } = await sb()!.rpc('eu_disponibilidade', { p_token: p.token, p_data: c.data, p_resposta: 'posso' });
    setOcupado('');
    if (error) { p.errar(aviseHumano(error, 'salvar')); return; }
    await p.aoMudar();
  }

  return (
    <section className="vol-secao" id="chamadas">
      <div className="vol-secao-cab">
        <span className="rot">Convites para cobrir</span>
        {!!abertas.length && (
          <span className="vol-secao-nota">{abertas.length === 1 ? '1 convite' : `${abertas.length} convites`}</span>
        )}
      </div>

      {abertas.map(c => {
        const motivo = c.impede ? motivoParaMim(c.impede) : '';
        return (
          <div className="vol-troca" key={c.id}>
            <div className="vol-troca-fn">{c.funcao}</div>
            <div className="vol-troca-dia">{quando(c)}</div>
            <p className="vol-troca-quem">
              A liderança chamou você para cobrir essa vaga. Se aceitar, ela é sua na hora, já confirmada.
              Se outra pessoa chamada aceitar antes, o convite fecha.
            </p>
            {motivo && <p className="vol-troca-motivo" role="note">{motivo}</p>}
            <div className="vol-btns">
              {!c.impede && (
                <button className="vol-bt" disabled={ocupado === c.id} onClick={() => responder(c, true)}>
                  Posso cobrir
                </button>
              )}
              {c.impede === 'INDISPONIVEL' && (
                <button className="vol-bt" disabled={ocupado === c.id} onClick={() => possoNoDia(c)}>
                  Posso nesse dia
                </button>
              )}
              <button className="vol-bt nao" disabled={ocupado === c.id} onClick={() => responder(c, false)}>
                Não posso
              </button>
            </div>
          </div>
        );
      })}

      {fechadas.map(c => (
        <div className={`vol-linha ${c.status === 'aceita' ? 'ok' : 'ruim'}`} key={c.id}>
          <span className="vol-marca" aria-hidden="true" />
          <span>
            <span className="vol-linha-dia">{quando(c)}</span>
            <span className="vol-linha-fn">{c.funcao}</span>
            <span className="vol-linha-obs">{noticiaDaChamada(c)}</span>
          </span>
          <span className="vol-linha-est">
            {c.status === 'aceita' ? 'sua' : c.status === 'recusada' ? 'não pode' : 'fechado'}
          </span>
        </div>
      ))}
    </section>
  );
}
