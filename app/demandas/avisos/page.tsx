'use client';
/* OS AVISOS DENTRO DO SISTEMA · migração 94.

   "O que mudou nas minhas demandas desde a última vez que eu olhei." Cada
   linha é um fato do histórico, feito por OUTRA pessoa, numa demanda que é
   desta pessoa de algum jeito (abriu, acompanha, está com ela, é do
   ministério que ela lidera, chegou na fila dela, espera a aprovação dela).
   Quem escolhe o que entra é `demandas.avisos_de`, sempre por `pode_ver`, e
   comentário interno só aparece para quem atende, igual na ficha.

   A frase é a MESMA da ficha (`fraseDoEvento`): o aviso e a linha do
   histórico contam o mesmo fato, e duas redações discordariam no dia em que
   uma fosse corrigida.

   Abrir esta tela marca tudo como visto (o contador da barra volta a zero).
   O ponto escuro diz o que era novo NESTA visita, e continua lá até ela
   acabar: marcar e apagar a marca no mesmo instante faria a pessoa perder o
   que acabou de chegar. */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Casca, { useEu } from '@/components/demandas/Casca';
import { Aviso, Esqueleto, Vazio } from '@/components/demandas/Ui';
import { avisos } from '@/lib/demandas/api';
import { carimbo, fraseDoEvento, recadoDoErro } from '@/lib/demandas/regras';
import type { AvisoDentro } from '@/lib/demandas/tipos';

export default function Pagina() {
  return <Casca><Avisos /></Casca>;
}

function Avisos() {
  const ctx = useEu();
  const [itens, setItens] = useState<AvisoDentro[] | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let vivo = true;
    avisos(true).then(r => {
      if (!vivo) return;
      if (!r.ok) { setErro(recadoDoErro(r, 'carregar os avisos')); setItens([]); return; }
      setItens(r.itens || []);
      ctx.zerarAvisos?.();
    });
    /* uma vez por visita (dependências vazias de propósito): marcar de novo a
       cada renderização zeraria o que chegou enquanto a pessoa lia */
    return () => { vivo = false; };
  }, []);

  return (
    <>
      <div className="dm-rot">{'>'} avisos</div>
      <h1 style={{ margin: '6px 0 var(--dm-e1)' }}>Avisos</h1>
      <p className="dm-peq dm-mudo" style={{ marginBottom: 'var(--dm-e3)' }}>
        O que outras pessoas fizeram nas suas demandas, nos últimos 60 dias.
      </p>
      {erro ? <Aviso tom="bad">{erro}</Aviso> : null}
      {itens === null ? <Esqueleto /> : itens.length === 0 && !erro ? (
        <Vazio titulo="Nenhum aviso ainda.">Quando alguém mexer numa demanda sua, aparece aqui.</Vazio>
      ) : (
        <ul className="dm-avisos">
          {itens.map((a, i) => (
            <li key={`${a.numero}-${a.em}-${i}`} className={a.novo ? 'dm-novo' : undefined}>
              <Link href={`/demandas/d/${a.numero}`}>
                <div className="dm-aviso-o-que">
                  {fraseDoEvento(a)}
                  {a.novo ? <span className="dm-so-leitor"> (novo)</span> : null}
                </div>
                {a.tipo === 'comentario' && a.texto
                  ? <div className="dm-aviso-de">“{a.texto.length > 140 ? a.texto.slice(0, 140) + '…' : a.texto}”</div>
                  : null}
                <div className="dm-aviso-de">#{a.numero} {a.titulo} · {carimbo(a.em)}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
