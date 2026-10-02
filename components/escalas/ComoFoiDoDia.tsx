'use client';
import { useEffect, useRef, useState } from 'react';
import {
  type ComoFoiDaEquipe, type RespostaComoFoi, ROTULO_COMO_FOI, emOrdemDeAtencao, resumoComoFoi,
} from '@/lib/chegada';
import { comoFoiDaEquipe } from '@/lib/db';
import Link from 'next/link';
import { Pilula, Secao, type Tom } from '@/components/escalas/Pecas';

/* =============================================================================
   "COMO FOI", NA ESCALA E NO PAINEL DO LÍDER — 107, 02/10/2026

   O que quem serviu contou depois do culto: foi bom, foi puxado ou teve
   problema, e a nota quando escreveu. Só a liderança do ministério vê (o
   banco confere: `como_foi_da_equipe` só responde a quem lidera).

   Duas casas: o dia, na tela de Escala, junto do relatório de quem liderou;
   e as duas últimas semanas, no Painel, porque "teve problema" que fica
   esperando o líder abrir um dia passado é problema que ninguém lê.

   O tom não usa o vermelho: no sistema ele quer dizer falta de gente no
   culto, e só isso (30/09/2026). "Teve problema" é atenção, não falta.

   SÓ APARECE COM A 107 NO BANCO e com alguma resposta.
   ============================================================================= */

const TOM: Record<RespostaComoFoi, Tom> = { bom: 'ok', puxado: 'neutro', problema: 'warn' };

function Linha({ c, comDia }: { c: ComoFoiDaEquipe; comDia?: string }) {
  return (
    <li className="es-ec-cf">
      <span className="es-ec-cf-quem">
        <span className="es-ec-cf-nome">{c.nome}</span>
        <small>{[comDia, (c.funcoes || []).join(' · ')].filter(Boolean).join(' · ')}</small>
      </span>
      <Pilula tom={TOM[c.resposta]}>{ROTULO_COMO_FOI[c.resposta]}</Pilula>
      {c.texto && <p className="es-ec-cf-texto">{c.texto}</p>}
    </li>
  );
}

/** o dia, na tela de Escala */
export default function ComoFoiDoDia({ d, equipeId }: { d: string; equipeId: string }) {
  const [lista, setLista] = useState<ComoFoiDaEquipe[] | null>(null);
  const equipeRef = useRef(equipeId); equipeRef.current = equipeId;
  useEffect(() => {
    const eq = equipeId;
    let vivo = true;
    comoFoiDaEquipe(eq, d, d).then(
      l => { if (vivo && equipeRef.current === eq) setLista(l); },
      () => { if (vivo && equipeRef.current === eq) setLista(null); },
    );
    return () => { vivo = false; };
  }, [equipeId, d]);

  if (!lista?.length) return null;
  return (
    <div className="es-caixa es-ec-comofoi">
      <span className="es-ec-rot">Como foi para quem serviu</span>
      <p className="es-ec-cf-resumo">{resumoComoFoi(lista)}</p>
      <ul className="es-ec-cf-lista">
        {emOrdemDeAtencao(lista).map(c => <Linha key={c.voluntario_id + c.culto_id} c={c} />)}
      </ul>
    </div>
  );
}

/** as duas últimas semanas, no Painel: a conta e o que pede atenção, cada
    linha levando ao dia na tela de Escala */
export function ComoFoiNoPainel({ equipeId, hoje, aDiaLongo }: {
  equipeId: string; hoje: string; aDiaLongo: (data: string, evento: string | null) => string;
}) {
  const [lista, setLista] = useState<ComoFoiDaEquipe[] | null>(null);
  useEffect(() => {
    let vivo = true;
    const de = new Date(new Date(hoje + 'T12:00:00Z').getTime() - 14 * 86400000).toISOString().slice(0, 10);
    comoFoiDaEquipe(equipeId, de, hoje).then(l => { if (vivo) setLista(l); }, () => { if (vivo) setLista(null); });
    return () => { vivo = false; };
  }, [equipeId, hoje]);

  if (!lista?.length) return null;
  const atencao = emOrdemDeAtencao(lista.filter(c => c.resposta !== 'bom' || !!c.texto)).slice(0, 6);
  return (
    <Secao titulo="Como foi para quem serviu" sub={`Últimas duas semanas: ${resumoComoFoi(lista)}.`}>
      {!!atencao.length && (
        <div className="es-fila">
          {atencao.map(c => (
            <Link key={c.voluntario_id + c.culto_id} href={`/escala?m=${c.data.slice(0, 7)}#d${c.data}`}
              className="es-item es-cf-item">
              <span className="es-c-tit">
                <b>{c.nome}</b>
                <small>{[aDiaLongo(c.data, c.evento), (c.funcoes || []).join(' · ')].filter(Boolean).join(' · ')}</small>
                {c.texto && <span className="es-ec-cf-texto">{c.texto}</span>}
              </span>
              <span className="es-c-acao"><Pilula tom={TOM[c.resposta]}>{ROTULO_COMO_FOI[c.resposta]}</Pilula></span>
            </Link>
          ))}
        </div>
      )}
    </Secao>
  );
}
