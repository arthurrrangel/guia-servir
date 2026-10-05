'use client';
import type { ReactNode } from 'react';
import { diaLongo, horaDoDia } from '@/lib/engine';
import {
  type ItemOrdem, horarios, minutosDe, ordemDoBanco, relogio, siteDaCifra, tempoDoItem,
} from '@/lib/ordem-do-culto';
import { IGREJA } from '@/lib/igreja';
import { BotaoDaLetra } from '@/components/escalas/SetlistNoLink';

/* =============================================================================
   A ORDEM DO CULTO NA PÁGINA DE QUEM SERVE — 105, 02/10/2026.

   Cada culto em que a pessoa serve nos próximos 60 dias, com a ordem de todo
   ministério que a publicou (`eu_ordens`). A banda vê o tom, o BPM e a cifra
   de cada música; a projeção da Mídia vê a ordem do Louvor e prepara as
   letras; todo mundo vê a hora de cada momento.

   A ordem do PRÓPRIO ministério vem sem rótulo; a de outro vem com o nome
   dele ("domingo, 4 de outubro · Louvor"), para ninguém achar que a ordem do
   Louvor é tarefa da Mídia.

   A CIFRA ABRE FORA, como os links do repertório: `noopener noreferrer`, e o
   nome do site no rótulo para leitor de tela. O link já chegou conferido
   pelo banco e de novo aqui (`ordemDoBanco`).
   ============================================================================= */

export type OrdemDoLink = {
  culto_id: string; data: string; evento: string | null; inicio: string | null;
  equipe: string; minha: boolean; ordem: ItemOrdem[];
};

/** as linhas de `eu_ordens`, só com o que vale virar tela */
export function ordensDoLink(linhas: unknown): OrdemDoLink[] {
  if (!Array.isArray(linhas)) return [];
  const out: OrdemDoLink[] = [];
  for (const l of linhas as any[]) {
    if (!l || typeof l.culto_id !== 'string' || typeof l.data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(l.data)) continue;
    const ordem = ordemDoBanco(l.ordem);
    if (!ordem.length) continue;
    out.push({
      culto_id: l.culto_id, data: l.data,
      evento: typeof l.evento === 'string' && l.evento ? l.evento : null,
      inicio: typeof l.inicio === 'string' && /^\d{2}:\d{2}/.test(l.inicio) ? l.inicio : null,
      equipe: typeof l.equipe === 'string' ? l.equipe : '',
      minha: l.minha === true, ordem,
    });
  }
  return out;
}

function Meta({ it }: { it: ItemOrdem }) {
  const partes: ReactNode[] = [];
  if (it.t === 'musica') {
    if (it.artista) partes.push(it.artista);
    if (it.tom) partes.push(<>Tom <b>{it.tom}</b></>);
    if (it.bpm) partes.push(`${it.bpm} BPM`);
    /* 111 · o compasso ao lado do BPM */
    if (it.compasso) partes.push(it.compasso);
  }
  if (it.quem) partes.push(it.quem);
  /* 111 · a música em minuto e segundo (4:35); o momento em minutos */
  const tempo = tempoDoItem(it);
  if (tempo) partes.push(tempo);
  if (!partes.length) return null;
  return (
    <span className="vol-oi-meta">
      {partes.map((p, i) => <span key={i}>{i > 0 ? ' · ' : ''}{p}</span>)}
    </span>
  );
}

export default function OrdemNoLink({ ordens }: { ordens: OrdemDoLink[] }) {
  if (!ordens.length) return null;
  const cultos = new Set(ordens.map(o => o.culto_id)).size;
  return (
    <section className="vol-secao" id="ordem">
      <div className="vol-secao-cab">
        <span className="rot">Ordem do culto</span>
        <span className="vol-secao-nota">{cultos === 1 ? '1 culto' : `${cultos} cultos`}</span>
      </div>
      {ordens.map(o => {
        const ini = minutosDe(horaDoDia(o.inicio, o.evento, o.data, IGREJA.cultoHora, IGREJA.followHora));
        const horas = horarios(o.ordem, ini);
        return (
          <div className="vol-ordem" key={`${o.culto_id}-${o.equipe}`}>
            <div className="vol-rep-dia">{diaLongo(o.data, o.evento)}{o.minha || !o.equipe ? '' : ` · ${o.equipe}`}</div>
            <ol className="vol-ordem-lista">
              {o.ordem.map((it, i) => (
                <li className={`vol-oi${it.t === 'momento' ? ' vol-oi-momento' : ''}`} key={i}>
                  <span className="vol-oi-hora">{horas[i] !== null ? relogio(horas[i] as number) : ''}</span>
                  <span className="vol-oi-corpo">
                    <span className="vol-oi-tit">{it.titulo}</span>
                    <Meta it={it} />
                    {it.nota && <span className="vol-oi-nota">{it.nota}</span>}
                  </span>
                  {(it.cifra || it.letra) && (
                    <span className="vol-oi-acoes">
                      {it.cifra && (
                        <a className="vol-oi-cifra" href={it.cifra} target="_blank" rel="noopener noreferrer"
                          aria-label={`Cifra de ${it.titulo}, no ${siteDaCifra(it.cifra)}`}>
                          Cifra
                        </a>
                      )}
                      <BotaoDaLetra it={it} />
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        );
      })}
    </section>
  );
}
