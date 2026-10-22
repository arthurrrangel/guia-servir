'use client';
import { useEffect, useMemo, useState } from 'react';
import { IcSeta } from '@/components/Icones';
import { canalDeConversa } from '@/lib/igreja';
import { PEQUENAS_GUIAS, wazeDaPequenaGuia, mapaExterno, type PequenaGuia } from '@/lib/pequenas-guias';
import { MapaGuias } from '@/components/MapaGuias';
import { pontos } from '@/components/site/Blocos';
import { Trilho } from '@/components/site/Trilho';
import { gradeQueFecha } from '@/lib/site/grade';

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

/* `url` é o valor de ?dia= no endereço (/pequena-guia?dia=qua): o filtro nasce
   já no dia certo, e mudar o filtro escreve a URL de volta, para o link ser
   compartilhável. (A home levava para cá pelas colunas da semana; em 22/10/2026
   nenhuma página do site tem mais esse link: o dia chega pelo link compartilhado,
   pelo recarregar e pelo voltar.) */
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
          /* o filtro volta para "todos": o mais perto pode ser de outro dia.
             22/10/2026: pelo escolher(), que também tira o ?dia= do endereço (o
             endereço dizia terça com a lista em "todos", e recarregar voltava à
             terça); e sem animação para quem pediu menos movimento */
          escolher(0); setFoco(melhor.grupo.nome);
          const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          document.getElementById(idDoCartao(melhor.grupo.nome))?.scrollIntoView({ block: 'center', behavior: quieto ? 'auto' : 'smooth' });
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
  /* no celular a lista é um trilho de deslizar: o pino tocado no mapa traz o
     cartão dele para o centro do trilho (só na horizontal; a página não pula) */
  useEffect(() => {
    if (!foco) return;
    const c = document.getElementById(idDoCartao(foco));
    const t = c?.parentElement;
    if (!c || !t || t.scrollWidth <= t.clientWidth + 4) return;
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    t.scrollTo({ left: c.offsetLeft - (t.clientWidth - c.offsetWidth) / 2, behavior: quieto ? 'auto' : 'smooth' });
  }, [foco]);
  const contagens = useMemo(() => DIAS.map(d => PEQUENAS_GUIAS.filter(d.teste).length), []);
  const teste = DIAS[ativo].teste;
  const visiveis = useMemo(() => PEQUENAS_GUIAS.filter(teste), [teste]);
  const nVisiveis = visiveis.length;
  const noMapa = visiveis.some(g => g.coord);
  /* a grade dos grupos que o filtro mostra, por tela (5: ≥ 1500, 4: 1180 a 1499,
     3: 1000 a 1179): as colunas que fecham as linhas e, quando nenhuma fecha (um
     grupo só na terça, dois online), o grupo que abre a última linha e a trilha
     em que ele começa, para a linha ficar no centro (lib/site/grade.ts) */
  const grades = { 5: gradeQueFecha(nVisiveis, [5, 4, 3]), 4: gradeQueFecha(nVisiveis, [4, 3]), 3: gradeQueFecha(nVisiveis, [3, 2]) } as const;
  const abreUltima = (nome: string) => {
    const vi = visiveis.findIndex(p => p.nome === nome);
    return ([5, 4, 3] as const).filter(k => vi >= 0 && grades[k].ini?.i === vi).map(k => [k, grades[k].ini!.t] as const);
  };
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

      {/* 22/10/2026: o mapa e o "qual fica perto de mim" só quando o filtro tem
          grupo com endereço. No "Online" o mapa mostrava só a igreja e empurrava
          os dois cartões uns 600 px para baixo no celular */}
      {noMapa && (<>
        <MapaGuias grupos={visiveis} focoNome={foco} aoEscolher={setFoco} igreja pessoa={pessoa} />
        {/* a resposta de "qual fica perto de mim": o botão pede a posição; o
            resultado diz o grupo, a distância e o dia, e acende o cartão */}
        <div className="pg-perto">
          {/* 22/10/2026: um parágrafo só, que é região viva (role="status", WCAG 4.1.3):
              quem usa leitor de tela ouve "Pedindo a sua posição…", a recusa ou o grupo
              mais perto. Eram dois parágrafos trocados, e região viva que é trocada
              inteira não é lida */}
          <p className="pg-perto-txt" role="status">
            {achado ? (<>
              <span className="g-rot">Mais perto de você</span>
              <b>{achado.grupo.nome}</b>
              <span>a {fmtKm(achado.dist)} · {achado.grupo.dia}, {achado.grupo.hora}{achado.grupo.bairro ? ` · ${achado.grupo.bairro}` : ''}</span>
            </>) : (<>
              <b>Qual fica perto de mim?</b>
              <span>
                {estado === 'pedindo' && 'Pedindo a sua posição…'}
                {estado === 'negado' && 'Sem a posição não dá para calcular. Toque num pino do mapa.'}
                {estado === 'sem' && 'Este aparelho não informa a posição. Toque num pino do mapa.'}
                {estado === '' && 'A posição não sai do seu aparelho.'}
              </span>
            </>)}
          </p>
          <button type="button" className={'acao' + (achado ? '' : ' cheia')} onClick={acharPerto} disabled={estado === 'pedindo'}>
            {achado ? 'Calcular de novo' : 'Achar o mais perto de mim'} <IcSeta />
          </button>
        </div>
      </>)}
      {/* 14/09/2026: a live region ERA a lista inteira de cartões. Trocar o
          filtro mudava a visibilidade de vários cartões de uma vez dentro de
          uma região viva, e o leitor de tela lia todos os que apareceram. Agora
          a lista é só lista, e uma frase curta anuncia o resultado do filtro. */}
      <p className="so-leitor" role="status" aria-live="polite">
        {`${nVisiveis} de ${PEQUENAS_GUIAS.length} grupos no filtro atual`}
      </p>
      {/* 21/10/2026: as colunas que fecham as linhas para quantos grupos o filtro
          mostra (12 = 4 + 4 + 4; com cinco colunas no monitor largo eram 5 + 5 + 2) */}
      <Trilho className="pgs fila" rotulo="Os grupos" style={{ '--pg-c5x2': grades[5].c * 2, '--pg-c4x2': grades[4].c * 2, '--pg-c3x2': grades[3].c * 2 } as React.CSSProperties}>
        {PEQUENAS_GUIAS.map(pg => {
          const conv = canalDeConversa(`Oi! Vi o site da GUIA e quero ir na ${pg.nome} (${pg.dia}, ${pg.hora}). Meu nome é: `);
          const visivel = teste(pg);
          const waze = wazeDaPequenaGuia(pg);
          const verNoMapa = mapaExterno(pg);
          return (
            <article key={pg.nome} id={idDoCartao(pg.nome)}
              {...Object.fromEntries(abreUltima(pg.nome).map(([k]) => [`data-ini-${k}`, '']))}
              style={abreUltima(pg.nome).length ? Object.fromEntries(abreUltima(pg.nome).map(([k, t]) => [`--ini-${k}`, t])) as React.CSSProperties : undefined}
              className={'pg' + (visivel ? '' : ' some') + (foco === pg.nome ? ' aceso' : '')}
              aria-hidden={!visivel}
              onMouseEnter={() => pg.coord && setFoco(pg.nome)}>
              <div className="pg-corpo">
                <p className="g-rot">{pg.online ? pg.online : pg.bairro}</p>
                <span className="pg-nome">{pg.nome}</span>
                <span className="pg-quando">{pg.dia}, {pg.hora}</span>
                {(pg.lideres || pg.publico) && (
                  <span className="pg-nota">{pontos([pg.lideres, pg.publico].filter(Boolean).join(' · '))}</span>
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
      </Trilho>
    </>
  );
}
