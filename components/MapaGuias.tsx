'use client';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import type { PequenaGuia } from '@/lib/pequenas-guias';
import { IGREJA } from '@/lib/igreja';
import { CHEVRON_D, CHEVRON_VB } from './Marca';

/* =============================================================================
   O MAPA DAS PEQUENAS GUIAS

   POR QUE ELE SUBSTITUI DOZE MAPAS. Cada cartão tinha o próprio embed do
   Google, e três problemas vinham juntos: doze iframes numa página só (cada um
   carrega o motor de mapas inteiro), três recortes quase idênticos de bairro
   escuro que não diziam nada sobre o grupo, e os controles do Google
   aparecendo por cima — botão de tela cheia, miniatura do Street View, faixa
   de atribuição — todos MORTOS, porque o iframe estava com
   `pointer-events:none`. Controle que não clica é ruído com cara de defeito.

   Um mapa, um pino por grupo, é a forma que a pergunta pede: "qual fica perto
   de mim?" é uma pergunta de comparação, e comparar exige ver todos juntos.

   POR QUE LEAFLET E NÃO GOOGLE. O embed clássico do Google aceita um ponto só.
   Vários marcadores exigem a Maps JavaScript API, que exige chave, e este
   projeto já tem duas variáveis de ambiente vazias em produção — somar uma
   terceira dependência com chave é somar uma forma nova de a página quebrar
   sem ninguém ver. Leaflet vai no pacote, os tiles são do CARTO (uso livre com
   atribuição, que fica visível no canto), e o mapa continua funcionando sem
   segredo nenhum.

   O PINO É A MARCA. Chevron da GUIA dentro do círculo escuro, o mesmo traçado
   de `components/Marca.tsx`. Não é enfeite: num mapa cheio de ícone genérico
   do Google, o pino da casa é o que diz de quem é aquele ponto.
============================================================================= */

type Props = {
  grupos: PequenaGuia[];
  /** o grupo em foco: recebe o pino grande e o mapa voa até ele */
  focoNome?: string;
  aoEscolher?: (nome: string) => void;
  /** a igreja como pino próprio (o mapa da cidade, na home) */
  igreja?: boolean;
  /** um ponto extra: onde a pessoa está, quando ela deixou */
  pessoa?: [number, number] | null;
  /** até onde o enquadramento aproxima (13 = a cidade; 16 = a rua, em /como-chegar) */
  zoomMax?: number;
};

const RIO: [number, number] = [-22.955, -43.38];

export function MapaGuias({ grupos, focoNome, aoEscolher, igreja, pessoa, zoomMax = 13 }: Props) {
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<any>(null);
  const pinos = useRef<Record<string, any>>({});
  const L = useRef<any>(null);
  /* o `zoomend` é registrado uma vez, na montagem, e o `desenhar` daquele
     render prenderia a lista daquela hora: depois de filtrar por dia, um zoom
     redesenharia TODOS os grupos. A referência aponta sempre para o último. */
  const desenharAtual = useRef<(enquadrar: boolean) => void>(() => {});

  const comPonto = grupos.filter(g => g.coord);

  /* ------------------------------------------------------------ montagem */
  useEffect(() => {
    let vivo = true;
    void (async () => {
      const mod = await import('leaflet');
      if (!vivo || !caixa.current || mapa.current) return;
      const l = (mod as any).default || mod;
      L.current = l;

      const m = l.map(caixa.current, {
        center: RIO, zoom: 11, scrollWheelZoom: false,
        zoomControl: true, attributionControl: true,
      });
      /* os dois links da atribuição abrem em nova aba: são os únicos externos
         do site que o Leaflet escreve sozinho, e todos os outros abrem assim */
      m.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noreferrer">Leaflet</a>');
      /* O CARTO PEDE CHAVE, E EU SÓ DESCOBRI EM PRODUÇÃO. 07/09/2026.
         A primeira versão usava o basemap Voyager do CARTO, no entendimento de
         que era livre com atribuição. Subiu, e o mapa apareceu com "API KEY
         REQUIRED · carto.com/basemaps" escrito na diagonal, repetido por cima
         de tudo. Pior que os doze mapas que ele substituiu.

         Não dava para pegar antes daqui: o Chromium deste container não
         carrega recurso externo dentro da página, então local o mapa nasce
         cinza com ou sem chave. Por curl o tile vinha 200 e eu li 200 como
         "funciona" — 200 era a marca d'água sendo entregue com sucesso.

         Vai para o tile padrão do OpenStreetMap: sem chave, sem marca d'água,
         política de uso compatível com um site de igreja (volume baixo,
         atribuição visível). Mapa claro, parque verde e água azul, que é o que
         deixa o pino escuro da marca legível. */
      l.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(m);
      m.zoomControl.setPosition('bottomright');
      mapa.current = m;
      /* a junção dos pinos depende do zoom: refaz a cada mudança, sem reenquadrar */
      m.on('zoomend', () => desenharAtual.current(false));
      desenhar(true);
    })();
    return () => {
      vivo = false;
      if (mapa.current) { mapa.current.remove(); mapa.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------------------------------------- os pinos */
  function desenhar(enquadrar: boolean) {
    const l = L.current, m = mapa.current;
    if (!l || !m) return;
    for (const k of Object.keys(pinos.current)) { m.removeLayer(pinos.current[k]); }
    pinos.current = {};
    if (!comPonto.length && !igreja) return;

    /* PINOS QUE SE ENCOSTAM VIRAM UM PINO COM NÚMERO. 07/09/2026.
       A primeira versão só juntava grupos de coordenada IDÊNTICA (Betel e
       Elas, na igreja; Elohim e Bali). Em produção, com o mapa enquadrando de
       Marechal Hermes ao Recreio (zoom 11), Barraspace e Farol de Itaúna caíam
       a poucos pixels da igreja e os círculos se empilhavam: quatro grupos,
       uma pilha ilegível, e o de baixo inclicável.

       Agora a junção é por DISTÂNCIA NA TELA no zoom atual (menos de 40px
       entre centros, com o pino medindo 34), refeita a cada mudança de zoom.
       Um pino com "3" no zoom da cidade vira três pinos quando a pessoa
       aproxima — que é o gesto natural de quem quer saber "qual fica perto de
       mim". Tocar num pino com número aproxima até separar; tocar num pino de
       um grupo só acende o cartão dele. Grupos no MESMO ponto (a igreja) nunca
       se separam, e aí o pino diz os dois e acende o primeiro.

       A primeira tentativa de resolver isso, dias atrás, foi afastar os
       repetidos em círculo: 0,00036 grau são ~40 metros, dois pixels no zoom
       13. Não separava nada e mentia sobre onde o grupo fica. */
    const zoom = m.getZoom();
    const RAIO = 40;
    type Grupo = { membros: PequenaGuia[]; px: any; igreja?: boolean };
    const grupos2: Grupo[] = [];
    /* os grupos que acontecem NA IGREJA ficam com o pino da igreja (mesma
       coordenada: dois pinos um em cima do outro não dizem nada) */
    const naIgreja = igreja ? comPonto.filter(g => g.coord![0] === IGREJA.coord[0] && g.coord![1] === IGREJA.coord[1]) : [];
    /* a igreja entra no agrupamento como semente: um grupo a menos de 40px
       dela no zoom atual se junta ao pino dela (e se separa ao aproximar),
       em vez de nascer um pino encostado por trás. 08/09/2026: a Barraspace
       ficava meio escondida atrás do pino da igreja no zoom da cidade. */
    if (igreja) grupos2.push({ membros: [], px: m.project(l.latLng(IGREJA.coord), zoom), igreja: true });
    for (const g of comPonto) {
      if (naIgreja.includes(g)) continue;
      const px = m.project(l.latLng(g.coord), zoom);
      const perto = grupos2.find(c => c.px.distanceTo(px) < RAIO);
      if (perto) perto.membros.push(g); else grupos2.push({ membros: [g], px });
    }
    const pertoDaIgreja = grupos2.find(c => c.igreja)?.membros || [];

    for (const c of grupos2) {
      if (c.igreja) continue;
      const doPonto = c.membros;
      const primeiro = doPonto[0];
      const limites = l.latLngBounds(doPonto.map(g => g.coord));
      const centro = limites.getCenter();
      const separavel = doPonto.length > 1 && !limites.getNorthEast().equals(limites.getSouthWest());
      const icone = l.divIcon({
        className: 'pin-guia',
        html: `<span class="pin-guia-c"><svg viewBox="${CHEVRON_VB}" aria-hidden="true"><path d="${CHEVRON_D}"/></svg>${doPonto.length > 1 ? `<b class="pin-guia-n">${doPonto.length}</b>` : ''}</span>`,
        /* 44 é a área de toque; o círculo visível tem 34 e fica centrado
           nela (ver .pin-guia no CSS). Pino de 34 era o único alvo do site
           abaixo do mínimo. */
        iconSize: [44, 44], iconAnchor: [22, 22],
      });
      const rotulo = doPonto.map(g => `${g.nome} · ${g.dia}, ${g.hora}`).join('<br>');
      const p = l.marker(centro, { icon: icone, title: doPonto.map(g => g.nome).join(', ') }).addTo(m);
      p.bindTooltip(rotulo, { direction: 'top', offset: [0, -19] });
      p.on('click', () => {
        if (separavel) m.fitBounds(limites, { padding: [70, 70], maxZoom: 16 });
        else aoEscolher?.(primeiro.nome);
      });
      /* o mesmo pino responde por todos os grupos daquele ponto: assim o
         cartão de qualquer um deles acende o pino certo */
      for (const g of doPonto) pinos.current[g.nome] = p;
    }
    /* A IGREJA E A PESSOA são pinos próprios, fora do agrupamento: a igreja
       é o ponto fixo da cidade e a pessoa é "você está aqui". */
    if (igreja) {
      const comIgreja = [...naIgreja, ...pertoDaIgreja];
      const ic = l.divIcon({
        className: 'pin-guia pin-igreja',
        html: `<span class="pin-guia-c"><svg viewBox="${CHEVRON_VB}" aria-hidden="true"><path d="${CHEVRON_D}"/></svg>${comIgreja.length ? `<b class="pin-guia-n">${comIgreja.length}</b>` : ''}</span>`,
        iconSize: [44, 44], iconAnchor: [22, 22],
      });
      const linhas = [`${IGREJA.nome} · ${IGREJA.cultoDia}, ${IGREJA.cultoHora}`, ...comIgreja.map(g => `${g.nome} · ${g.dia}, ${g.hora}`)];
      const p = l.marker(IGREJA.coord, { icon: ic, title: IGREJA.nome, zIndexOffset: 500 }).addTo(m);
      p.bindTooltip(linhas.join('<br>'), { direction: 'top', offset: [0, -19] });
      p.on('click', () => {
        /* com grupo só encostado (não na igreja), o toque aproxima até separar */
        if (pertoDaIgreja.length) m.fitBounds(l.latLngBounds([IGREJA.coord, ...pertoDaIgreja.map(g => g.coord as [number, number])]), { padding: [70, 70], maxZoom: 16 });
        else if (naIgreja[0]) aoEscolher?.(naIgreja[0].nome);
      });
      pinos.current['__igreja'] = p;
      for (const g of comIgreja) pinos.current[g.nome] = p;
    }
    if (pessoa) {
      const ic = l.divIcon({ className: 'pin-pessoa', html: '<span class="pin-pessoa-c"></span>', iconSize: [18, 18], iconAnchor: [9, 9] });
      const p = l.marker(pessoa, { icon: ic, title: 'Você', zIndexOffset: 600, interactive: false }).addTo(m);
      pinos.current['__pessoa'] = p;
    }

    /* enquadra TODOS os pinos visíveis quando a LISTA muda (não a cada zoom:
       aí o enquadramento desfaria o gesto da pessoa). Sem isto o mapa nasce
       num zoom fixo e o grupo de Marechal Hermes, que é o mais longe, fica
       fora da moldura — e "não tem grupo perto de mim" é a conclusão errada
       mais cara da página. */
    if (enquadrar) {
      const pontos: [number, number][] = comPonto.map(g => g.coord as [number, number]);
      if (igreja) pontos.push(IGREJA.coord);
      if (pessoa) pontos.push(pessoa);
      const limites = l.latLngBounds(pontos);
      m.fitBounds(limites, { padding: [46, 46], maxZoom: zoomMax });
    }
  }

  desenharAtual.current = desenhar;

  /* redesenha quando o filtro muda a lista */
  useEffect(() => { desenhar(true); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [grupos.map(g => g.nome).join('|'), pessoa ? pessoa.join(',') : '']);

  /* o cartão em foco levanta o pino correspondente */
  useEffect(() => {
    const m = mapa.current;
    if (!m || !focoNome) return;
    const p = pinos.current[focoNome];
    if (!p) return;
    for (const [k, v] of Object.entries(pinos.current)) {
      (v as any).getElement()?.classList.toggle('on', k === focoNome);
    }
    m.panTo(p.getLatLng(), { animate: true });
    p.openTooltip();
  }, [focoNome]);

  return (
    <div className="pg-mapao">
      <div ref={caixa} className="pg-mapao-tela" role="application"
        aria-label={comPonto.length ? `Mapa com ${comPonto.length} Pequenas Guias no Rio de Janeiro` : `Mapa: ${IGREJA.nome}, ${IGREJA.rua}, ${IGREJA.bairro}`} />
      {/* o mapa é desenho: quem não enxerga precisa do mesmo fato em texto */}
      <p className="so-leitor">
        {comPonto.map(g => `${g.nome} em ${g.bairro}, ${g.dia} às ${g.hora}.`).join(' ')}
      </p>
    </div>
  );
}
