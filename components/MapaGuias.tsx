'use client';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import type { PequenaGuia } from '@/lib/pequenas-guias';

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
};

const RIO: [number, number] = [-22.955, -43.38];

export function MapaGuias({ grupos, focoNome, aoEscolher }: Props) {
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
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
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
    if (!comPonto.length) return;

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
    type Grupo = { membros: PequenaGuia[]; px: any };
    const grupos2: Grupo[] = [];
    for (const g of comPonto) {
      const px = m.project(l.latLng(g.coord), zoom);
      const perto = grupos2.find(c => c.px.distanceTo(px) < RAIO);
      if (perto) perto.membros.push(g); else grupos2.push({ membros: [g], px });
    }

    for (const c of grupos2) {
      const doPonto = c.membros;
      const primeiro = doPonto[0];
      const limites = l.latLngBounds(doPonto.map(g => g.coord));
      const centro = limites.getCenter();
      const separavel = doPonto.length > 1 && !limites.getNorthEast().equals(limites.getSouthWest());
      const icone = l.divIcon({
        className: 'pin-guia',
        html: `<span class="pin-guia-c"><svg viewBox="504.6 2.5 90 95" aria-hidden="true"><path d="M515.18 2.50 L602.58 48.68 L605.08 50.00 L602.58 51.32 L515.18 97.50 L515.18 76.10 L577.38 50.00 L515.18 23.90 Z"/></svg>${doPonto.length > 1 ? `<b class="pin-guia-n">${doPonto.length}</b>` : ''}</span>`,
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
    /* enquadra TODOS os pinos visíveis quando a LISTA muda (não a cada zoom:
       aí o enquadramento desfaria o gesto da pessoa). Sem isto o mapa nasce
       num zoom fixo e o grupo de Marechal Hermes, que é o mais longe, fica
       fora da moldura — e "não tem grupo perto de mim" é a conclusão errada
       mais cara da página. */
    if (enquadrar) {
      const limites = l.latLngBounds(comPonto.map(g => g.coord));
      m.fitBounds(limites, { padding: [46, 46], maxZoom: 13 });
    }
  }

  desenharAtual.current = desenhar;

  /* redesenha quando o filtro muda a lista */
  useEffect(() => { desenhar(true); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [grupos.map(g => g.nome).join('|')]);

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
        aria-label={`Mapa com ${comPonto.length} Pequenas Guias no Rio de Janeiro`} />
      {/* o mapa é desenho: quem não enxerga precisa do mesmo fato em texto */}
      <p className="so-leitor">
        {comPonto.map(g => `${g.nome} em ${g.bairro}, ${g.dia} às ${g.hora}.`).join(' ')}
      </p>
    </div>
  );
}
