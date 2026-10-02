'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type Estado } from '@/lib/engine';
import { type PresencaDoLider, erroAoMarcar, fraseDoTime, genteDoDia, horaDaChegada, quemMarcou } from '@/lib/chegada';
import { marcarChegada, presencasDoDia } from '@/lib/db';
import { aviseHumano } from '@/lib/erros';
import { Pilula } from '@/components/escalas/Pecas';

/* =============================================================================
   A CHEGADA DO DIA, NA ESCALA DO LÍDER — 107, 02/10/2026

   Fase 4 do estudo do ServoApp (o check-in do Voluts, melhor): no dia do
   culto, quem está na escala toca "Cheguei" no próprio link, o líder do dia
   marca quem esqueceu, e aqui a liderança vê o time chegando, uma linha por
   pessoa, com a hora e quem marcou. A liderança também marca e desmarca (até
   30 dias depois, para corrigir o registro).

   SEM MARCA NÃO É FURO. A pessoa pode ter esquecido de tocar. Furo continua
   sendo a situação do posto, que o líder decide logo acima.

   SÓ APARECE COM A 107 NO BANCO, em dia de hoje ou que já passou: a seção
   pergunta `presencas_do_dia` ao abrir e some se a pergunta falhar.

   SEM POLLING: relê ao abrir o dia, depois de cada marca e, no dia do culto,
   quando a janela volta a ter foco.
   ============================================================================= */

export default function ChegadaDoDia({ S, d, hoje, cultoId, equipeId, ocupado, aviso }: {
  S: Estado; d: string; hoje: string; cultoId: string; equipeId: string; ocupado: boolean;
  aviso: (t: string) => void;
}) {
  const [marcas, setMarcas] = useState<PresencaDoLider[] | null>(null);
  const [gravando, setGravando] = useState('');
  const equipeRef = useRef(equipeId); equipeRef.current = equipeId;

  const ler = useCallback(async () => {
    const eq = equipeId;
    try {
      const l = await presencasDoDia(eq, d);
      if (equipeRef.current === eq) setMarcas(l);
    } catch {
      /* banco sem a 107 (ou sem rede): a seção não aparece */
      if (equipeRef.current === eq) setMarcas(null);
    }
  }, [equipeId, d]);

  useEffect(() => { void ler(); }, [ler]);
  useEffect(() => {
    if (d !== hoje) return;
    const volta = () => { if (document.visibilityState === 'visible') void ler(); };
    document.addEventListener('visibilitychange', volta);
    return () => document.removeEventListener('visibilitychange', volta);
  }, [ler, d, hoje]);

  if (marcas === null) return null;
  const gente = genteDoDia(S, d, marcas.filter(m => m.culto_id === cultoId));
  if (!gente.length) return null;
  const chegaram = gente.filter(g => !!g.chegou_em).length;
  const ehHoje = d === hoje;
  const travado = ocupado || !!gravando;

  async function alternar(vid: string, chegou: boolean) {
    const eq = equipeId;
    setGravando(vid);
    try {
      const r = await marcarChegada(cultoId, vid, chegou);
      if (equipeRef.current !== eq) return;
      if (!r?.ok) aviso(erroAoMarcar(r));
      await ler();
    } catch (e: any) {
      if (equipeRef.current === eq) aviso(aviseHumano(e, 'marcar a chegada'));
    } finally {
      if (equipeRef.current === eq) setGravando('');
    }
  }

  const lista = (
    <ul className="es-ec-cg-lista">
      {gente.map(g => (
        <li className="es-ec-cg" key={g.vid}>
          <span className="es-ec-cg-quem">
            <span className="es-ec-cg-nome">{g.nome}</span>
            <small>
              {g.funcoes.join(' · ')}
              {g.recusou ? ' · tinha avisado que não podia' : ''}
            </small>
          </span>
          <span className="es-ec-cg-est">
            {g.chegou_em
              ? <Pilula tom="ok">chegou {horaDaChegada(g.chegou_em)}</Pilula>
              : <Pilula tom="neutro">sem marca</Pilula>}
            {g.chegou_em && <small>{quemMarcou(g.marcado_por)}</small>}
          </span>
          <button type="button" className="es-btn es-txt es-peq" disabled={travado}
            aria-label={g.chegou_em ? `Desmarcar a chegada de ${g.nome}` : `Marcar que ${g.nome} chegou`}
            onClick={() => void alternar(g.vid, !g.chegou_em)}>
            {g.chegou_em ? 'Desmarcar' : 'Marcar chegada'}
          </button>
        </li>
      ))}
    </ul>
  );

  /* no dia, aberta: é a lista que a liderança acompanha enquanto o time
     chega. Depois, um registro: fechada, com a conta na linha. */
  if (ehHoje) {
    return (
      <section className="es-ec-chegada" aria-labelledby={`cg-${d}`}>
        <div className="es-ec-ordem-cab">
          <span className="es-ec-rep-tit" id={`cg-${d}`}>Chegada</span>
          <span className="es-ec-ordem-resumo">{fraseDoTime(chegaram, gente.length)}</span>
        </div>
        {lista}
        <p className="es-ec-cg-nota">
          Cada pessoa marca no próprio link, ao chegar, e quem lidera o dia marca quem esqueceu.
          Sem marca não quer dizer que faltou.
        </p>
      </section>
    );
  }
  return (
    <details className="es-dobra es-ec-chegada">
      <summary>
        <span className="es-ec-disp-linha">
          <b className="es-ec-disp-tit">Chegada</b>
          <span><b>{chegaram}</b> de {gente.length} com marca</span>
        </span>
      </summary>
      <div className="es-dobra-corpo">
        {lista}
        <p className="es-ec-cg-nota">
          Sem marca não quer dizer que faltou: a pessoa pode ter esquecido de tocar. Quem faltou de
          verdade fica com a situação &ldquo;furou&rdquo; no posto, logo acima.
        </p>
      </div>
    </details>
  );
}
