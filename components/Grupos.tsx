'use client';
import { useMemo, useState } from 'react';
import { IcSeta } from '@/components/Icones';
import { canalDeConversa } from '@/lib/igreja';
import { PEQUENAS_GUIAS, wazeDaPequenaGuia, mapaExterno, type PequenaGuia } from '@/lib/pequenas-guias';
import { MapaGuias } from '@/components/MapaGuias';

/* =============================================================================
   OS GRUPOS, COM FILTRO POR DIA

   Doze cartões é lista demais para escolher de olho. O filtro responde a
   pergunta real de quem escolhe — "qual dia eu posso?" — e reduz a lista a
   três ou quatro. Sem filtro ativo, aparecem todos. É um estado só, sem
   roteamento e sem rede: a lista já está na página.

   UM MAPA, NÃO DOZE — 07/09/2026. Cada cartão tinha o próprio embed do Google.
   Três coisas erradas ao mesmo tempo: doze iframes numa página só; três
   recortes quase idênticos de bairro escuro que não diziam nada sobre grupo
   nenhum; e os controles do Google desenhados por cima, todos MORTOS, porque
   o iframe estava com `pointer-events:none` — botão de tela cheia e miniatura
   de Street View que não clicam são ruído com cara de defeito.

   E a pergunta de quem lê esta página é "qual fica perto de mim?", que é
   pergunta de COMPARAÇÃO. Comparar exige ver todos juntos, e nenhum recorte
   de bairro isolado responde isso. Agora é um mapa com um pino por grupo, e
   os cartões viraram a lista que o mapa aponta: clicar num pino acende o
   cartão, e o cartão em foco levanta o pino.

   O botão de navegar só existe onde há para onde navegar — ver a nota em
   `wazeDaPequenaGuia`.
   ============================================================================= */

const DIAS: Array<{ rot: string; teste: (p: PequenaGuia) => boolean }> = [
  { rot: 'Todos', teste: () => true },
  { rot: 'Terça', teste: p => p.dia === 'Terça' && !p.online },
  { rot: 'Quarta', teste: p => p.dia === 'Quarta' && !p.online },
  { rot: 'Quinta', teste: p => p.dia === 'Quinta' && !p.online },
  { rot: 'Online', teste: p => !!p.online },
];

export function Grupos() {
  const [ativo, setAtivo] = useState(0);
  const [foco, setFoco] = useState('');
  const contagens = useMemo(() => DIAS.map(d => PEQUENAS_GUIAS.filter(d.teste).length), []);
  const teste = DIAS[ativo].teste;
  const visiveis = useMemo(() => PEQUENAS_GUIAS.filter(teste), [teste]);
  return (
    <>
      {/* pg- porque `.chips`/`.chip` sem prefixo são o controle de nível do
          /time, e este bloco vencia a cascata lá dentro. Ver globals.css. */}
      <div className="pg-chips" role="group" aria-label="Filtrar por dia">
        {DIAS.map((d, i) => (
          <button key={d.rot} type="button" className="pg-chip" aria-pressed={i === ativo}
            onClick={() => { setAtivo(i); setFoco(''); }}>
            {d.rot}<small>{contagens[i]}</small>
          </button>
        ))}
      </div>

      <MapaGuias grupos={visiveis} focoNome={foco} aoEscolher={setFoco} />
      <div className="pgs centro fila" aria-live="polite">
        {PEQUENAS_GUIAS.map(pg => {
          const conv = canalDeConversa(`Oi! Vi o site da GUIA e quero ir na ${pg.nome} (${pg.dia}, ${pg.hora}). Meu nome é: `);
          const visivel = teste(pg);
          const waze = wazeDaPequenaGuia(pg);
          const verNoMapa = mapaExterno(pg);
          return (
            <article key={pg.nome} id={`pg-${pg.nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\W+/g, '-')}`}
              className={'pg' + (visivel ? '' : ' some') + (foco === pg.nome ? ' aceso' : '')}
              aria-hidden={!visivel}
              onMouseEnter={() => pg.coord && setFoco(pg.nome)}>
              <div className="pg-corpo">
                <p className="g-rot">{pg.online ? pg.online : pg.bairro}</p>
                <span className="pg-nome">{pg.nome}</span>
                <span className="pg-quando">{pg.dia}, {pg.hora}</span>
                {(pg.lideres || pg.publico) && (
                  <span className="pg-nota">{[pg.lideres, pg.publico].filter(Boolean).join(' · ')}</span>
                )}
                <div className="g-acoes">
                  <a href={conv.href} target="_blank" rel="noreferrer" className="acao cheia">Quero ir nessa <IcSeta /></a>
                  {/* Waze só onde existe endereço público. Onde não existe, o
                      endereço sai na conversa, que é o botão de cima. */}
                  {waze && (
                    <a href={waze} target="_blank" rel="noreferrer" className="acao">Ir de Waze</a>
                  )}
                  {!waze && verNoMapa && (
                    <a href={verNoMapa} target="_blank" rel="noreferrer" className="acao">Ver a região</a>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
