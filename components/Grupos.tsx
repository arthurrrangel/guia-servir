'use client';
import { useEffect, useMemo, useState } from 'react';
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

/* `url` é o valor de ?dia= que a home usa nas colunas da semana
   (/pequena-guia?dia=qua): o filtro nasce já no dia certo, e mudar o filtro
   escreve a URL de volta, para o link ser compartilhável. */
const idDoCartao = (nome: string) => `pg-${nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\W+/g, '-')}`;

const DIAS: Array<{ rot: string; url: string; teste: (p: PequenaGuia) => boolean }> = [
  { rot: 'Todos', url: '', teste: () => true },
  { rot: 'Terça', url: 'ter', teste: p => p.dia === 'Terça' && !p.online },
  { rot: 'Quarta', url: 'qua', teste: p => p.dia === 'Quarta' && !p.online },
  { rot: 'Quinta', url: 'qui', teste: p => p.dia === 'Quinta' && !p.online },
  { rot: 'Online', url: 'online', teste: p => !!p.online },
];

/* "QUAL FICA PERTO DE MIM?" — a pergunta desta página, respondida com a
   posição do aparelho, só quando a pessoa pede (nunca automático). A
   distância é em linha reta (haversine): serve para comparar, não para
   navegar — navegar é o Waze. */
function km(a: [number, number], b: [number, number]): number {
  const R = 6371, rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]), dLon = rad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const fmtKm = (d: number) => d < 1 ? `${Math.round(d * 100) * 10} m` : `${d.toFixed(d < 10 ? 1 : 0).replace('.', ',')} km`;
type Achado = { grupo: PequenaGuia; dist: number };

export function Grupos() {
  const [ativo, setAtivo] = useState(0);
  const [foco, setFoco] = useState('');
  const [pessoa, setPessoa] = useState<[number, number] | null>(null);
  const [achado, setAchado] = useState<Achado | null>(null);
  const [estado, setEstado] = useState<'' | 'pedindo' | 'negado' | 'sem'>('');

  function acharPerto() {
    if (!('geolocation' in navigator)) { setEstado('sem'); return; }
    setEstado('pedindo');
    navigator.geolocation.getCurrentPosition(
      pos => {
        const eu: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setPessoa(eu);
        let melhor: Achado | null = null;
        for (const g of PEQUENAS_GUIAS) {
          if (!g.coord) continue;
          const d = km(eu, g.coord as [number, number]);
          if (!melhor || d < melhor.dist) melhor = { grupo: g, dist: d };
        }
        setAchado(melhor); setEstado('');
        if (melhor) {
          /* o filtro volta para "todos": o mais perto pode ser de outro dia */
          setAtivo(0); setFoco(melhor.grupo.nome);
          document.getElementById(idDoCartao(melhor.grupo.nome))?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      },
      err => { setEstado(err.code === 1 ? 'negado' : 'sem'); },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 },
    );
  }
  useEffect(() => {
    const dia = new URLSearchParams(window.location.search).get('dia') || '';
    const i = DIAS.findIndex(d => d.url === dia);
    if (i > 0) setAtivo(i);
  }, []);
  const escolher = (i: number) => {
    setAtivo(i); setFoco('');
    const u = new URL(window.location.href);
    if (DIAS[i].url) u.searchParams.set('dia', DIAS[i].url); else u.searchParams.delete('dia');
    window.history.replaceState(null, '', u.pathname + u.search + u.hash);
  };
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
            onClick={() => escolher(i)}>
            {d.rot}<small>{contagens[i]}</small>
          </button>
        ))}
      </div>

      <MapaGuias grupos={visiveis} focoNome={foco} aoEscolher={setFoco} igreja pessoa={pessoa} />
      {/* a resposta de "qual fica perto de mim": o botão pede a posição; o
          resultado diz o grupo, a distância e o dia, e acende o cartão */}
      <div className="pg-perto">
        {achado ? (
          <p className="pg-perto-txt">
            <span className="g-rot">Mais perto de você</span>
            <b>{achado.grupo.nome}</b>
            <span>a {fmtKm(achado.dist)} · {achado.grupo.dia}, {achado.grupo.hora}{achado.grupo.bairro ? ` · ${achado.grupo.bairro}` : ''}</span>
          </p>
        ) : (
          <p className="pg-perto-txt">
            <b>Qual fica perto de mim?</b>
            <span>
              {estado === 'pedindo' && 'Pedindo a sua posição…'}
              {estado === 'negado' && 'Sem a posição não dá para calcular. Toque num pino do mapa.'}
              {estado === 'sem' && 'Este aparelho não informa a posição. Toque num pino do mapa.'}
              {estado === '' && 'A posição fica no seu aparelho, e só é usada se você pedir.'}
            </span>
          </p>
        )}
        <button type="button" className={'acao' + (achado ? '' : ' cheia')} onClick={acharPerto} disabled={estado === 'pedindo'}>
          {achado ? 'Calcular de novo' : 'Achar o mais perto de mim'} <IcSeta />
        </button>
      </div>
      <div className="pgs fila" aria-live="polite">
        {PEQUENAS_GUIAS.map(pg => {
          const conv = canalDeConversa(`Oi! Vi o site da GUIA e quero ir na ${pg.nome} (${pg.dia}, ${pg.hora}). Meu nome é: `);
          const visivel = teste(pg);
          const waze = wazeDaPequenaGuia(pg);
          const verNoMapa = mapaExterno(pg);
          return (
            <article key={pg.nome} id={idDoCartao(pg.nome)}
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
                  {/* `.g-link`, não segundo botão: é a regra do site desde
                      06/09 — um sólido, o secundário é palavra. Dois botões
                      não cabiam numa linha de 416px e empilhavam. */}
                  {waze && (
                    <a href={waze} target="_blank" rel="noreferrer" className="g-link">Ir de Waze</a>
                  )}
                  {!waze && verNoMapa && (
                    <a href={verNoMapa} target="_blank" rel="noreferrer" className="g-link">Ver a região</a>
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
