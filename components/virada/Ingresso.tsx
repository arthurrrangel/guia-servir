'use client';
/* =============================================================================
   O INGRESSO DA VIRADA: A CONTAGEM E AS VAGAS · 21/11/2026

   As duas partes vivas do cartão do ingresso (app/(igreja)/virada):
   · o relógio até as 19h30 do dia 31, no horário de Brasília (lib/virada.ts):
     dias, horas, minutos e segundos; durante a noite, "Está acontecendo.", e
     depois, a data ("31 de dezembro.");
   · as vagas, da consulta única da página (lib/virada-vagas.ts). Só aparecem
     com número verdadeiro do banco, e só quando dizem alguma coisa: a partir
     de 15 lugares ocupados, ou com 30 ou menos restando. Sem banco, nada.
   ============================================================================= */
import { useEffect, useState } from 'react';
import { Vozes } from '@/components/site/Blocos';
import { VIRADA, contagemDaVirada, fraseDaContagem, fraseDasVagas, relogioDaVirada, type Contagem } from '@/lib/virada';
import { lerVagas, ouvirVagas, type Vagas } from '@/lib/virada-vagas';

/* 21/11/2026, "quero mais chamativo e comercialmente atrativo": a contagem
   vira o relógio do ingresso, dias, horas, minutos e segundos, em quatro
   blocos de noite sobre o cartão claro. Até montar, os blocos mostram traços
   (o servidor não sabe a hora de quem abre); na noite, a frase do momento. */
const PARTES = [['d', 'dias'], ['h', 'horas'], ['m', 'min'], ['s', 'seg']] as const;

export function ContagemVirada({ id }: { id: string }) {
  const [agora, setAgora] = useState<number | null>(null);
  useEffect(() => {
    const roda = () => setAgora(Date.now());
    roda();
    const t = window.setInterval(roda, 1000);
    return () => window.clearInterval(t);
  }, []);
  const c: Contagem | null = agora === null ? null : contagemDaVirada(agora);
  const r = agora === null ? null : relogioDaVirada(agora);
  const conta = !c || c.fase === 'antes' || c.fase === 'hoje';
  const f = conta ? null : fraseDaContagem(c!);
  return (
    <>
      {f
        ? <Vozes as="h2" id={id} className="s-h2 vr-conta-t" it={f.it}>{f.texto}</Vozes>
        : <Vozes as="h2" id={id} className="s-h2 vr-conta-t" it="começa em" semPonto>A virada começa em</Vozes>}
      {conta && (
        <div className="vr-relogio" role="timer"
             aria-label={r ? `Faltam ${r.d} dias, ${r.h} horas e ${r.m} minutos para as 19h30 de 31 de dezembro` : 'Contagem até 31 de dezembro, 19h30'}>
          {PARTES.map(([k, rot]) => (
            <div key={k} className="vr-relogio-c" aria-hidden="true">
              <b>{r ? String(r[k]).padStart(2, '0') : '––'}</b>
              <small>{rot}</small>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** quando a barra das vagas diz alguma coisa */
export const vagasQueContam = (restantes: number) =>
  restantes <= 30 || VIRADA.capacidade - restantes >= 15;

export function VagasVirada() {
  const [v, setV] = useState<Vagas | null>(null);
  useEffect(() => {
    let vivo = true;
    lerVagas().then(x => { if (vivo) setV(x); });
    const sai = ouvirVagas(x => setV(x));
    return () => { vivo = false; sai(); };
  }, []);
  if (!v || v.restantes === null || !vagasQueContam(v.restantes)) return null;
  const ocupado = Math.min(100, Math.max(3, ((VIRADA.capacidade - v.restantes) / VIRADA.capacidade) * 100));
  return (
    <div className={'vr-vagas' + (v.restantes <= 30 ? ' poucas' : '')} role="status">
      <p className="vr-vagas-t">{fraseDasVagas(v.restantes)}</p>
      <span className="vr-vagas-barra" aria-hidden="true"><span style={{ width: `${ocupado}%` }} /></span>
    </div>
  );
}
