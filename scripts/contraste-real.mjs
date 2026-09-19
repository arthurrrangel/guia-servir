/* CONTRASTE MEDIDO NOS PIXELS, NÃO NA ÁRVORE DE CSS.

   POR QUE ESTE ARQUIVO EXISTE

   A medida de contraste começou lendo `backgroundColor` do elemento e subindo
   pelos pais até achar uma cor opaca. Essa conta erra em quatro situações que
   acontecem o tempo todo nesta casa, e eu caí nas quatro:

     1. FUNDO TRANSLÚCIDO. Tinta #0a6b3f sobre rgba(10,107,63,.10) foi lida
        como verde sobre verde: 1.00:1, "texto invisível". O valor real é
        5.67:1. Consertei compondo as camadas — e isso resolveu só o caso 1.

     2. FOTO ATRÁS DO TEXTO. Os três cartões de `/acessar` têm uma foto
        escurecida por baixo do texto branco. O `backgroundColor` do cartão é
        BRANCO, então a conta deu branco sobre branco: 1.00:1, nove vezes.
        Olhei a tela: está perfeitamente legível. Eu quase pintei de preto um
        texto que está certo.

     3. GRADIENTE. `background-image: linear-gradient(...)` não aparece em
        `backgroundColor` nenhum.

     4. PSEUDO-ELEMENTO. Um `::before` com fundo cobrindo o pai não é visível
        para quem só olha os elementos reais.

   A raiz das quatro é a mesma: eu estava PERGUNTANDO ao CSS o que o navegador
   ia pintar, em vez de OLHAR o que ele pintou. Então aqui a conta é outra:

     · tira a tinta de todo o texto da página (e dos pseudo-elementos);
     · tira uma foto da página inteira nesse estado — isso é, literalmente, o
       fundo, seja ele cor, gradiente, foto, sombra ou vídeo parado;
     · para cada trecho de texto, lê os pixels que ficam debaixo dele;
     · compara a tinta contra esse fundo.

   Devolve dois números por trecho, porque texto sobre foto tem os dois:
     · `medio`  — contra a cor média do fundo, que é o julgamento principal;
     · `pior`   — contra o pixel de fundo mais parecido com a tinta, que é o
       que a WCAG exige de quem põe texto sobre imagem. Vai separado, como
       aviso, porque reprovar por um pixel solto transformaria o teste em
       barulho e ninguém olharia mais para ele.

   Não é usado em produção: é instrumento de auditoria. */

import sharp from 'sharp';

/* POR QUE A FOTO É DE CADA PEDAÇO, E NÃO DA PÁGINA NEM DA JANELA

   Tentei as duas fotos grandes e as duas mentem, pelo mesmo motivo de fundo:
   entre eu perguntar ONDE está o texto e o navegador ME DAR a foto, a página
   não fica parada.

     · `fullPage: true` estica a janela até a altura do documento. Tudo que
       depende de `vh` cresce junto e empurra o resto para baixo. Os dois
       primeiros botões pretos de `/escala` batiam certo e os três de baixo
       liam branco — o erro crescia com a profundidade, que é a assinatura
       desse tipo de deslocamento.

     · foto da janela a cada rolagem. Aqui o problema é outro: a foto sai de
       um quadro anterior ao fim da rolagem. Medi um deslocamento de 54px
       para baixo no último botão — a foto era de sy=1554 e as coordenadas de
       sy=1608.

   A saída é parar de casar duas medidas tiradas em momentos diferentes.
   Agora cada trecho de texto é fotografado SOZINHO, pelo retângulo do
   próprio elemento, e as linhas são localizadas RELATIVAS a esse retângulo.
   Coordenada relativa não muda com a rolagem: não importa onde a página
   estava quando a foto saiu, a terceira linha continua a 38px do topo do
   parágrafo. O casamento entre foto e coordenada passa a ser exato por
   construção, e não por sorte de temporização.

   Custa uma foto por trecho e demora mais. Vale: a versão rápida produziu
   três relatórios falsos seguidos.

   --- histórico da versão anterior, para não repetir ---

   A primeira versão tirava uma foto só, com `fullPage: true`, e amostrava
   pelas coordenadas de documento. Deu errado de um jeito silencioso: o botão
   preto "Copiar mensagem do grupo", branco sobre #252525, foi medido como
   branco sobre rgb(250,254,255) — 1.02:1.

   O motivo é que `fullPage` não fotografa a página como ela está: o Chromium
   estica a janela até a altura inteira do documento e refaz o layout. Tudo
   que depende da altura da janela muda de lugar — o que está grudado no topo
   ou no rodapé, os blocos com `min-height:100vh`, os reveals de rolagem. As
   coordenadas que eu tinha colhido antes passaram a apontar para outro
   pedaço da tela.

   Então agora: rola de uma janela por vez, e a cada parada tira a foto DA
   JANELA e pergunta à página quais linhas de texto estão visíveis AGORA, em
   coordenadas de janela. Foto e medida saem do mesmo layout, no mesmo
   instante. Custa algumas fotos por tela e acaba com a classe inteira de
   erro. */

/* roda DENTRO do navegador: lista cada trecho de texto com a tinta e a caixa */
const COLHER = () => {
  const vis = e => {
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const nome = e => e.tagName.toLowerCase() +
    (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).join('.') : '') +
    ' «' + (e.textContent || '').trim().slice(0, 26) + '»';

  /* CONTROLE DESLIGADO NÃO ENTRA NA CONTA.

     "Criar função" e "Salvar senha" aparecem apagados enquanto o campo do
     lado está vazio: é `rgba(37,37,37,.34)`, e dá 2.03:1. O medidor estava
     certo na aritmética e errado no critério — a própria WCAG (1.4.3)
     dispensa o que está inativo, justamente porque o apagado É a mensagem.
     Exigir 4.5:1 num botão desligado é exigir que ele pareça ligado. */
  const desligado = (e) => {
    if (e.disabled) return true;
    if (e.getAttribute('aria-disabled') === 'true') return true;
    const c = e.closest('[disabled],[aria-disabled="true"],fieldset[disabled]');
    return !!c;
  };

  const itens = [];
  for (const e of document.querySelectorAll('body *')) {
    if (!vis(e)) continue;
    const proprio = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!proprio) continue;
    if (desligado(e)) continue;
    const cs = getComputedStyle(e);
    const tinta = cs.webkitTextFillColor && cs.webkitTextFillColor !== 'currentcolor'
      ? cs.webkitTextFillColor : cs.color;
    const p = (tinta.match(/[\d.]+/g) || []).map(Number);
    if (p.length < 3) continue;
    const alfa = p.length > 3 ? p[3] : 1;
    if (alfa === 0) continue;   /* tinta transparente: quem pinta é o fundo recortado */

    /* A CAIXA QUE IMPORTA É A DA LINHA DE TEXTO, NÃO A DO ELEMENTO.

       Um <p> ocupa a largura toda do cartão; o texto dentro ocupa só as
       linhas. Amostrar a caixa do <p> puxaria para a média um monte de fundo
       vazio à direita da última linha — e, pior, num cartão com foto, ia
       misturar pedaços da foto onde não há texto nenhum. `getClientRects()`
       do intervalo devolve exatamente os retângulos das linhas. */
    const faixa = document.createRange();
    const linhas = [];
    for (const n of e.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue;
      faixa.selectNodeContents(n);
      for (const r of faixa.getClientRects()) {
        if (r.width > 0 && r.height > 0) linhas.push({ x: r.left, y: r.top, w: r.width, h: r.height });
      }
    }
    if (!linhas.length) continue;

    /* QUANDO O CSS BASTA, E QUANDO NÃO BASTA.

       Fotografar cada trecho de texto separadamente é exato e é lento: numa
       tela com 150 trechos são 150 fotos. Mas o CSS só mente quando há algo
       pintando que ele não conta na `backgroundColor` — foto, gradiente,
       pseudo-elemento, filtro, mistura, transparência de camada.

       Quando não há nada disso entre a tinta e a primeira camada opaca, a
       composição das cores É o que o navegador vai pintar, e a conta pode
       ser feita aqui mesmo, de graça. É o caso da esmagadora maioria:
       cartão branco, botão preto, pílula translúcida.

       Então: compõe aqui, e marca `incerto` só para quem tem pintura que o
       CSS não enxerga. Esses vão para a foto. */
    const camadas = [];
    let incerto = false;
    let n2 = e;
    while (n2 && n2 !== document.documentElement) {
      const c2 = getComputedStyle(n2);
      if (c2.backgroundImage !== 'none') incerto = true;
      if (c2.filter !== 'none' || c2.backdropFilter !== 'none' && c2.backdropFilter !== undefined) incerto = true;
      if (c2.mixBlendMode && c2.mixBlendMode !== 'normal') incerto = true;
      if (Number(c2.opacity) < 1) incerto = true;
      for (const pseudo of ['::before', '::after']) {
        const ps = getComputedStyle(n2, pseudo);
        if (ps.content === 'none') continue;
        if (ps.backgroundImage !== 'none') { incerto = true; continue; }
        const pc = (ps.backgroundColor.match(/[\d.]+/g) || []).map(Number);
        if (pc.length >= 3 && (pc.length < 4 || pc[3] > 0)) incerto = true;
      }
      const bg = (c2.backgroundColor.match(/[\d.]+/g) || []).map(Number);
      if (bg.length >= 3) {
        const a2 = bg.length > 3 ? bg[3] : 1;
        if (a2 > 0) { camadas.push({ cor: bg.slice(0, 3), a: a2 }); if (a2 >= 1) break; }
      }
      n2 = n2.parentElement;
    }
    /* uma mídia desenhada por baixo, dentro do mesmo cartão, também some do
       CSS: o `<img>` não é ancestral do texto, é irmão empilhado atrás */
    if (!incerto) {
      const cx = linhas[0].x + linhas[0].w / 2, cy = linhas[0].y + linhas[0].h / 2;
      for (const m of document.querySelectorAll('img, video, canvas, svg, picture')) {
        const rm = m.getBoundingClientRect();
        if (rm.width <= 0 || rm.height <= 0) continue;
        if (cx >= rm.left && cx <= rm.right && cy >= rm.top && cy <= rm.bottom) { incerto = true; break; }
      }
    }
    const raiz = (getComputedStyle(document.documentElement).backgroundColor.match(/[\d.]+/g) || []).map(Number);
    let base = raiz.length >= 3 && (raiz.length < 4 || raiz[3] > 0) ? raiz.slice(0, 3) : [255, 255, 255];
    for (let i = camadas.length - 1; i >= 0; i--) {
      const { cor, a: aa } = camadas[i];
      base = [0, 1, 2].map(j => aa * cor[j] + (1 - aa) * base[j]);
    }

    e.dataset.ctrId = String(itens.length);
    itens.push({
      id: itens.length, nome: nome(e), tinta: p.slice(0, 3), alfa,
      tam: parseFloat(cs.fontSize), peso: Number(cs.fontWeight) || 400,
      linhas: linhas.length, incerto, fundoCss: base,
    });
  }
  return itens;
};

/* roda DENTRO do navegador: para o elemento pedido, devolve a caixa dele e
   as linhas de texto RELATIVAS a essa caixa. Uma leitura só, atômica — foto
   e coordenada saem do mesmo instante e do mesmo referencial. */
const LINHAS_RELATIVAS = (id) => {
  const e = document.querySelector(`[data-ctr-id="${id}"]`);
  if (!e) return null;
  const cs = getComputedStyle(e);
  if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return null;
  const caixa = e.getBoundingClientRect();
  if (caixa.width <= 0 || caixa.height <= 0) return null;

  /* O QUE ESTÁ TAPADO NÃO PODE SER MEDIDO.

     "VOLUNTÁRIO", tinta escura sobre areia, foi medido como escuro sobre
     rgb(38,40,41) — quase preto — porque naquela hora a linha estava por
     baixo do topo grudado. Os pixels ali são do topo, não do texto. A foto
     de um elemento tapado mostra quem está por cima, então a pergunta
     continua valendo mesmo agora que a foto é individual. */
  const meuMesmo = (alvo) => !!alvo && (alvo === e || e.contains(alvo) || alvo.contains(e));

  const faixa = document.createRange();
  const linhas = [];
  for (const n of e.childNodes) {
    if (n.nodeType !== 3 || !n.textContent.trim()) continue;
    faixa.selectNodeContents(n);
    for (const r of faixa.getClientRects()) {
      if (r.width <= 0 || r.height <= 0) continue;
      const cy = r.top + r.height / 2;
      const tapado = [r.left + 2, r.left + r.width / 2, r.right - 2]
        .some(x => !meuMesmo(document.elementFromPoint(x, cy)));
      if (tapado) continue;
      linhas.push({
        x: r.left - caixa.left, y: r.top - caixa.top, w: r.width, h: r.height,
      });
    }
  }
  return { caixa: { w: caixa.width, h: caixa.height }, linhas };
};

/* apaga a tinta de tudo — inclusive dos pseudo-elementos, que também
   escrevem (o chevron do menu, o "·" entre os fatos, os ícones de fonte) */
const APAGAR_TINTA = `
  *, *::before, *::after {
    color: transparent !important;
    -webkit-text-fill-color: transparent !important;
    text-shadow: none !important;
    text-decoration-color: transparent !important;
    caret-color: transparent !important;
  }
  *, *::before, *::after { transition: none !important; }
  /* ROLAGEM SUAVE É INIMIGA DE MEDIDA. O globals.css pede scroll-behavior
     smooth no html, então scrollTo não pula: desliza por uns 400ms. A foto
     saía de um ponto do deslize e as coordenadas de outro, e o botão preto
     "Copiar a escala" foi medido nos pixels de onde ele NÃO estava: branco
     sobre branco, 1.02:1. Aqui a rolagem é seca, e ainda espero assentar. */
  html, body, * { scroll-behavior: auto !important; }
`;

/* ANIMAÇÃO NÃO SE DESLIGA: SE ADIANTA ATÉ O FIM.

   Desligar com `animation:none` parecia a coisa óbvia e produziu o defeito
   mais bem escondido desta auditoria. A abertura do site é uma CORTINA:
   `.abertura{position:fixed;inset:0;background:var(--noite);animation:cortina}`,
   e a animação é o que a levanta (`clip-path` fechando de baixo para cima).
   Com `animation:none`, a cortina fica no estado inicial — ou seja, uma
   chapa preta em cima da página inteira. E como ela tem `pointer-events:none`,
   a checagem de "está tapado?" olha através dela e não vê nada.

   Resultado: o título "Você não tem senha aqui" foi medido como tinta escura
   sobre rgb(18,20,21). Era a cortina. Adiantar cada animação até o fim deixa
   a tela exatamente como ela fica parada — que é o que eu queria medir. */
/* ...MAS SÓ DO QUE ESTÁ NA TELA.

   Adiantar TODAS as animações tem um efeito colateral que levou um tempo
   para aparecer: o menu do site está fechado, e os itens dele têm uma
   animação de entrada parada no começo. Mandar `finish()` em tudo termina
   essa animação também — e o menu, que é uma chapa escura de tela cheia,
   acorda por cima da página. O relatório então acusa "Como chegar" como
   tinta cinza sobre cinza: um link de um menu que ninguém abriu.

   Então o adiantamento respeita o que está escondido: se o alvo da animação
   (ou algum pai dele) não está visível, aquela animação fica como está. */
const ADIANTAR = () => {
  const aparece = (e) => {
    if (!(e instanceof Element)) return false;
    let n = e;
    while (n && n !== document.documentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      n = n.parentElement;
    }
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  for (const a of document.getAnimations()) {
    const alvo = a.effect && a.effect.target;
    if (alvo && !aparece(alvo)) continue;
    try { a.finish(); } catch { /* infinita */ }
  }
};

const lumDe = (r, g, b) => {
  const f = [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
};
const razao = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

/**
 * Mede o contraste real de cada trecho de texto da página aberta em `pag`.
 * Devolve { fracos, sobreFoto, medidos } — `fracos` reprova, `sobreFoto` avisa.
 */
export async function medirContraste(pag) {
  const itens = await pag.evaluate(COLHER);
  if (!itens.length) return { fracos: [], sobreFoto: [], medidos: 0 };

  const marca = await pag.addStyleTag({ content: APAGAR_TINTA });
  await pag.evaluate(ADIANTAR);
  await pag.waitForTimeout(120);

  const escala = await pag.evaluate(() => window.devicePixelRatio || 1);
  const acumulado = new Map();   // id -> { soma, n, piorRazao, piorCor }

  /* ASSENTAR A PÁGINA ANTES DE MEDIR.

     As telas revelam o conteúdo conforme a rolagem: cada bloco entra
     deslocado e sobe ao aparecer. Enquanto isso acontece a página está se
     mexendo, e o que eu tiro dela é instantâneo de um filme, não retrato.
     Um passeio de ponta a ponta acorda todos os reveals; depois disso ela
     fica onde está. (Com `reducedMotion: reduce` no contexto, o próprio app
     já revela tudo de uma vez — isto aqui é o cinto além do suspensório.) */
  await pag.evaluate(async () => {
    const janela = window.innerHeight;
    for (let y = 0; y < document.documentElement.scrollHeight; y += janela) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 50));
    }
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 120));
  });
  await pag.evaluate(ADIANTAR);
  await pag.waitForTimeout(200);

  for (const it of itens) {
    if (!it.incerto) continue;          // o CSS já respondeu: não gasta foto
    const alvo = await pag.$(`[data-ctr-id="${it.id}"]`);
    if (!alvo) continue;

    /* UMA FOTO DO PEDAÇO, E AS LINHAS RELATIVAS A ELE.

       O Playwright rola o elemento para dentro da janela, espera ele parar e
       recorta a foto na caixa dele. Como as linhas vêm em coordenada
       relativa a essa mesma caixa, não importa onde a página parou: a
       terceira linha continua a 38px do topo do parágrafo. */
    let png, rel;
    try {
      await alvo.scrollIntoViewIfNeeded({ timeout: 3000 });
      rel = await pag.evaluate(LINHAS_RELATIVAS, it.id);
      if (!rel || !rel.linhas.length) { await alvo.dispose(); continue; }
      png = await alvo.screenshot({ timeout: 5000 });
    } catch { await alvo.dispose(); continue; }
    await alvo.dispose();

    const cru = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width: W, height: H, channels: C } = cru.info;
    const data = cru.data;
    const a = { soma: [0, 0, 0], n: 0, piorRazao: Infinity, piorCor: null };
    const lumTinta = lumDe(...it.tinta);

    for (const r of rel.linhas) {
      const x0 = Math.max(0, Math.round(r.x * escala));
      const y0 = Math.max(0, Math.round(r.y * escala));
      const x1 = Math.min(W, Math.round((r.x + r.w) * escala));
      const y1 = Math.min(H, Math.round((r.y + r.h) * escala));
      if (x1 <= x0 || y1 <= y0) continue;
      const passoX = Math.max(1, Math.floor((x1 - x0) / 40));
      const passoY = Math.max(1, Math.floor((y1 - y0) / 15));
      for (let y = y0; y < y1; y += passoY) {
        for (let x = x0; x < x1; x += passoX) {
          const i = (y * W + x) * C;
          const px = [data[i], data[i + 1], data[i + 2]];
          a.soma[0] += px[0]; a.soma[1] += px[1]; a.soma[2] += px[2]; a.n++;
          const rz = razao(lumTinta, lumDe(...px));
          if (rz < a.piorRazao) { a.piorRazao = rz; a.piorCor = px; }
        }
      }
    }
    if (a.n) acumulado.set(it.id, a);
  }


  await pag.evaluate(el => el.remove(), marca);
  await pag.evaluate(() => {
    for (const e of document.querySelectorAll('[data-ctr-id]')) delete e.dataset.ctrId;
    window.scrollTo(0, 0);
  });

  const fracos = [], sobreFoto = [];
  let porFoto = 0;
  for (const it of itens) {
    const a = acumulado.get(it.id);
    /* dois caminhos, um julgamento: quem foi fotografado usa os pixels; quem
       não precisava usa a composição de cores que o CSS já entregou */
    let piorRazao = Infinity, piorCor = null, medio;
    if (a && a.n) { porFoto++; piorRazao = a.piorRazao; piorCor = a.piorCor; medio = a.soma.map(v => v / a.n); }
    else if (it.incerto) continue;        // devia ter foto e não saiu: não inventa
    else medio = it.fundoCss;
    /* tinta translúcida: compõe sobre o fundo medido antes de comparar */
    const tintaReal = it.alfa >= 1 ? it.tinta
      : [0, 1, 2].map(j => it.alfa * it.tinta[j] + (1 - it.alfa) * medio[j]);
    const rMedio = razao(lumDe(...tintaReal), lumDe(...medio));
    const grande = it.tam >= 24 || (it.tam >= 18.66 && it.peso >= 700);
    const minimo = grande ? 3 : 4.5;

    const rotulo = (v, cor) => `${it.nome} ${v.toFixed(2)}:1 (mín ${minimo}) tinta rgb(${it.tinta.map(Math.round).join(',')}) sobre rgb(${cor.map(Math.round).join(',')})`;
    if (rMedio < minimo) fracos.push(rotulo(rMedio, medio));
    else if (piorRazao < minimo && piorCor) sobreFoto.push(rotulo(piorRazao, piorCor));
  }
  return { fracos, sobreFoto, medidos: itens.length, porFoto };
}
