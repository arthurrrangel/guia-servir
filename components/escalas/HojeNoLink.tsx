'use client';
/* =============================================================================
   O DIA DO CULTO, NO LINK DO VOLUNTÁRIO — 107, 02/10/2026

   No dia em que a pessoa serve, o topo da página ganha o "Cheguei": um toque
   ao chegar na igreja, e a liderança sabe quem já está lá. Para quem lidera o
   dia (posto de relato), o mesmo bloco mostra o time chegando, com a hora de
   cada um, e deixa marcar quem chegou sem tocar.

   Logo abaixo do bloco escuro do topo, porque no dia é a única coisa que a
   pessoa veio fazer aqui. O cartaz da porta e o link do grupo (/cheguei/...)
   abrem a página neste ponto (#hoje).

   Só aparece com a migração 107 no banco: a página só mostra isto depois que
   `eu_hoje` respondeu com um culto de hoje. As frases moram em
   lib/chegada.ts, onde o teste alcança.
   ============================================================================= */
import { useState } from 'react';
import { sbPublico as sb } from '@/lib/supabase';
import { aviseHumano } from '@/lib/erros';
import { diaLongo, horaDoDia } from '@/lib/engine';
import {
  type CultoDeHoje, type GenteDoDia, contaDoTime, erroAoChegar, fraseDoTime, horaDaChegada, quemMarcou,
} from '@/lib/chegada';

type Props = {
  token: string;
  hoje: CultoDeHoje[];
  /* os postos da pessoa em cada culto de hoje, da escala que a página já tem */
  postos: Record<string, string[]>;
  cultoHora: string; followHora?: string | null;
  aoMudar: () => Promise<void> | void;
  avisar: (msg: string) => void;
  errar: (msg: string) => void;
};

export default function HojeNoLink(p: Props) {
  const [ocupado, setOcupado] = useState('');
  if (!p.hoje.length) return null;

  async function chegar(c: CultoDeHoje, chegou: boolean) {
    setOcupado(c.culto_id);
    const { data, error } = await sb()!.rpc('eu_cheguei', { p_token: p.token, p_culto: c.culto_id, p_chegou: chegou });
    setOcupado('');
    if (error) { p.errar(aviseHumano(error, 'marcar')); return; }
    const r = data as any;
    if (!r?.ok) { p.errar(erroAoChegar(r)); await p.aoMudar(); return; }
    p.avisar(chegou ? `Chegada marcada às ${horaDaChegada(r.chegou_em)}. Bom culto!` : 'Chegada desmarcada.');
    await p.aoMudar();
  }

  async function marcar(c: CultoDeHoje, g: GenteDoDia, chegou: boolean) {
    setOcupado(c.culto_id + g.voluntario_id);
    const { data, error } = await sb()!.rpc('eu_marcar_chegada', {
      p_token: p.token, p_culto: c.culto_id, p_voluntario: g.voluntario_id, p_chegou: chegou,
    });
    setOcupado('');
    if (error) { p.errar(aviseHumano(error, 'marcar')); return; }
    const r = data as any;
    if (!r?.ok) { p.errar(erroAoChegar(r)); await p.aoMudar(); return; }
    await p.aoMudar();
  }

  return (
    <>
      {p.hoje.map((c, i) => {
        const hora = horaDoDia(c.inicio, c.evento, c.data, p.cultoHora, p.followHora);
        const postos = p.postos[c.culto_id] || [];
        const time = c.relata && c.time ? c.time : null;
        const conta = time ? contaDoTime(time) : null;
        return (
          <section className="vol-secao vol-hoje" id={i === 0 ? 'hoje' : undefined} key={c.culto_id}
            aria-labelledby={`hoje-${c.culto_id}`}>
            <div className="vol-secao-cab">
              <span className="rot" id={`hoje-${c.culto_id}`}>Hoje</span>
              <span className="vol-secao-nota">
                {c.evento ? diaLongo(c.data, c.evento) : postos.join(' · ')}{hora ? `, ${hora}` : ''}
              </span>
            </div>

            {!c.chegou_em ? (
              <div className="vol-hoje-chegar">
                <button type="button" className="vol-bt vol-bt-cheguei" disabled={ocupado === c.culto_id}
                  onClick={() => void chegar(c, true)}>
                  Cheguei
                </button>
                <p className="vol-nota">Toque quando chegar na igreja. A liderança vê quem já está lá.</p>
              </div>
            ) : (
              <div className="vol-linha ok vol-hoje-chegou" role="status">
                <span className="vol-marca" aria-hidden="true" />
                <span>
                  <span className="vol-linha-dia">Você chegou às {horaDaChegada(c.chegou_em)}</span>
                  <span className="vol-linha-fn">{quemMarcou(c.marcado_por, true)}</span>
                </span>
                <button type="button" className="vol-acao" disabled={ocupado === c.culto_id}
                  onClick={() => void chegar(c, false)}>
                  Desfazer
                </button>
              </div>
            )}

            {time && conta && (
              <div className="vol-hoje-time">
                <div className="vol-troca-sub vol-hoje-time-cab">
                  <span>Seu time hoje</span>
                  <span className="vol-hoje-conta">{fraseDoTime(conta.chegaram, conta.total)}</span>
                </div>
                {time.map(g => (
                  <div className={`vol-linha ${g.chegou_em ? 'ok' : ''}`} key={g.voluntario_id}>
                    <span className="vol-marca" aria-hidden="true" />
                    <span>
                      <span className="vol-linha-dia">{g.eu ? 'Você' : g.nome}</span>
                      <span className="vol-linha-fn">
                        {g.funcoes.join(' · ')}
                        {g.chegou_em ? ` · chegou ${horaDaChegada(g.chegou_em)}` : ''}
                      </span>
                    </span>
                    {g.eu ? (
                      <span className="vol-linha-est">{g.chegou_em ? 'aqui' : 'falta você'}</span>
                    ) : g.chegou_em ? (
                      <button type="button" className="vol-acao" disabled={ocupado === c.culto_id + g.voluntario_id}
                        aria-label={`Desmarcar a chegada de ${g.nome}`}
                        onClick={() => void marcar(c, g, false)}>
                        Desmarcar
                      </button>
                    ) : (
                      <button type="button" className="vol-acao" disabled={ocupado === c.culto_id + g.voluntario_id}
                        aria-label={`Marcar que ${g.nome} chegou`}
                        onClick={() => void marcar(c, g, true)}>
                        Marcar chegada
                      </button>
                    )}
                  </div>
                ))}
                <p className="vol-nota">
                  Você lidera este culto. Marque quem já está aqui e não tocou em Cheguei. A marca é só a
                  chegada: não confirma ninguém por ninguém.
                </p>
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
