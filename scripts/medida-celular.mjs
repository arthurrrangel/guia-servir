/* A MEDIDA DO CELULAR, UMA SÓ, PARA OS DOIS SISTEMAS.

   Isto nasceu dentro de `demandas-celular.mjs` e saiu de lá quando chegou a
   vez de medir as escalas. Copiar a função seria o começo de duas medidas
   diferentes: eu consertaria um viés aqui e o outro arquivo continuaria
   mentindo. Cada correção difícil que está aqui dentro custou uma auditoria
   inteira de relatório falso — elas estão comentadas onde estão, e valem para
   as duas casas.

   Exporta:
     · MEDIR       — roda DENTRO do navegador (pag.evaluate), recebe a largura
     · chromeDoContainer — acha o Chromium que já veio instalado aqui
     · criaContador      — o `ok()` que conta acertos e imprime as falhas */

import { existsSync, readdirSync } from 'node:fs';

export function chromeDoContainer() {
  const raiz = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const d of readdirSync(raiz).filter(x => x.startsWith('chromium-'))) {
    const c = `${raiz}/${d}/chrome-linux/chrome`;
    if (existsSync(c)) return c;
  }
  const direto = `${raiz}/chromium`;
  return existsSync(direto) ? direto : undefined;
}

export function criaContador() {
  const estado = { falhas: 0, feitas: 0 };
  const ok = (c, rot, extra = '') => {
    estado.feitas++;
    if (!c) { estado.falhas++; console.log('  FALHOU:', rot, extra ? '\n           ' + extra : ''); }
  };
  return { estado, ok };
}

/* --------------------------------------------------------------- a medida */
export const MEDIR = (largura) => {
  const vis = e => {
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const nome = e => e.tagName.toLowerCase() +
    (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).join('.') : '') +
    ' «' + (e.textContent || '').trim().slice(0, 26) + '»';

  /* 1. rolagem lateral.

     PASSAR DA BORDA NÃO É, POR SI SÓ, DEFEITO. Duas coisas legítimas fazem
     um elemento ficar mais largo que a tela sem que a página ande:

       · o pai recorta com `overflow` — é o caso de um nome cortado com
         reticências de propósito;
       · o pai é um container de rolagem — é o caso de uma tabela de
         comparação, que rola dentro do cartão porque grade de cinco colunas
         não se empilha sem destruir a comparação.

     A primeira versão disto acusava os dois, 22 vezes, e nenhuma era
     defeito. O que importa é uma coisa só: A PÁGINA anda? Então a medida
     que manda é `larguraDoc`, e a lista de culpados ignora quem já está
     preso por um ancestral que recorta. */
  /* ---- 21/09/2026 · ESTA CONTA RESPONDIA OUTRA PERGUNTA ------------------

     O comentario tres linhas acima diz, com razao, "o que importa e uma coisa
     so: A PAGINA anda?". E entao a conta usa `Math.max` com
     `body.scrollWidth`, que nao responde isso. Medido, com um link colado num
     comentario:

       {"htmlScrollW":320, "bodyScrollW":918, "innerW":320}
       window.scrollX depois de mandar rolar para a direita = 0

     `body.scrollWidth` foi para 918 e a janela NAO andou um pixel. A conta
     reprovaria como "desliza de lado" um defeito que e outro: texto cortado
     SEM RECUPERACAO. Dois defeitos diferentes, dois consertos diferentes, um
     numero so — e o pior: quem for consertar vai procurar o deslizamento que
     nao existe.

     Quem faz a JANELA rolar e `documentElement.scrollWidth`. O outro caso
     ganha medida propria, logo abaixo. */
  const larguraDoc = document.documentElement.scrollWidth;
  const presoPorAlguem = (e) => {
    let n = e.parentElement;
    while (n && n !== document.documentElement) {
      if (/auto|hidden|scroll|clip/.test(getComputedStyle(n).overflowX)) return true;
      n = n.parentElement;
    }
    return false;
  };
  const estoura = [];
  for (const e of document.querySelectorAll('body *')) {
    if (!vis(e)) continue;
    const r = e.getBoundingClientRect();
    if (r.right <= largura + 1 && r.left >= -1) continue;
    if (presoPorAlguem(e)) continue;                    // recortado: não empurra
    const p = e.parentElement && e.parentElement.getBoundingClientRect();
    if (p && (p.right > largura + 1 || p.left < -1)) continue;  // o pai é o culpado
    estoura.push(nome(e) + ` [${Math.round(r.left)}→${Math.round(r.right)}]`);
  }

  /* 1b · O QUE E CORTADO E NAO TEM COMO SER ALCANCADO.

     O defeito que a conta de cima confundia com deslizamento: o elemento tem
     mais conteudo do que cabe, RECORTA o excedente, e nao deixa rolar. O
     texto aparece bonitinho, cortado na borda, e o pedaco escondido nao
     existe para quem usa. Foi assim que um link do Drive num comentario
     mostrou 266px de 880px e ninguem notou em 252 medicoes.

     `overflow-x` em `visible` NAO entra aqui: nesse caso o conteudo transborda
     e alguem acima recorta, o que ja e coberto por `presoPorAlguem`. O que
     interessa e quem recorta ele mesmo. */
  /* E O CORTE QUE MORA NA PAGINA INTEIRA, QUE O LOOP ABAIXO NAO ALCANCA.

     `body` tem `overflow-x: visible`, entao ele e pulado pela regra "visivel
     transborda, quem recorta e outro". So que aqui NINGUEM recorta com
     rolagem: o conteudo passa de 320px, `body.scrollWidth` vai a 918, e
     `documentElement.scrollWidth` fica em 320 — a janela nao anda e o
     excedente some. Medido com um link colado na descricao.

     Esta e a diferenca entre "a pagina desliza" (defeito A, medido por
     `larguraDoc`) e "o conteudo some sem volta" (defeito B). Confundir os
     dois num numero so foi o que deixou 252 conferencias verdes. */
  const cortadoSemSaida = [];
  if (document.body.scrollWidth > document.documentElement.clientWidth + 1
      && document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1) {
    const culpados = [...document.querySelectorAll('body *')]
      .filter(e => vis(e) && e.getBoundingClientRect().right > largura + 1)
      .slice(0, 3).map(e => nome(e) + ` ate ${Math.round(e.getBoundingClientRect().right)}px`);
    cortadoSemSaida.push(
      `A PAGINA: ${document.body.scrollWidth}px de conteudo em ${document.documentElement.clientWidth}px `
      + `e a janela nao rola` + (culpados.length ? ` — ${culpados.join(' | ')}` : ''));
  }
  for (const e of document.querySelectorAll('body *')) {
    if (!vis(e)) continue;
    if (e.scrollWidth <= e.clientWidth + 1) continue;
    const cs = getComputedStyle(e);
    const ox = cs.overflowX;
    if (/auto|scroll/.test(ox)) continue;                 // rola: tem saida
    if (ox === 'visible') continue;                       // transborda: e o caso de cima
    /* RETICENCIAS SAO UM AVISO HONESTO, E NAO UM DEFEITO.

       A primeira versao desta medida acusou tres `.dm-corta` da tela de
       Numeros — rotulos de categoria truncados DE PROPOSITO, com o `…` no
       lugar. Cortar dizendo que cortou e uma decisao de desenho; o defeito e
       cortar em silencio, que foi o caso do link no comentario. Um
       instrumento que nao separa os dois vira barulho, e barulho se
       desliga. */
    if (cs.textOverflow === 'ellipsis') continue;
    /* O PADRAO "SO PARA QUEM OUVE" NAO E CONTEUDO CORTADO.

       `position:absolute; width:1px; height:1px; overflow:hidden;
       clip-path:inset(50%)` e como se poe texto na arvore de
       acessibilidade sem por na tela. Ele casa com a regra de cima por
       construcao: 1px de largura mostrando 566px de conteudo.

       Medido em 21/09: a medida nova reprovou `escala`, `time` e `ajustes`
       das ESCALAS, cinco vezes, sem que nenhuma tela das escalas tivesse
       mudado. Sao 10 desses numa tela so. O instrumento passou de 176/176
       para 5 falhas por conta propria, e instrumento que acusa o que nao
       existe e instrumento que as pessoas desligam.

       A isencao e pelo MECANISMO e nao pelo nome da classe: qualquer coisa
       de 1px com recorte esta escondida de proposito. */
    const r1 = e.getBoundingClientRect();
    if (cs.clipPath !== 'none' && r1.width <= 2 && r1.height <= 2) continue;
    /* campo de texto rola com o cursor: quem usa entra nele e alcanca o
       resto. Nao e conteudo inalcancavel. */
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName)) continue;
    /* um filho que rola por conta propria ja resolve o caso */
    if ([...e.querySelectorAll('*')].some(f => /auto|scroll/.test(getComputedStyle(f).overflowX))) continue;
    cortadoSemSaida.push(nome(e) + ` mostra ${e.clientWidth}px de ${e.scrollWidth}px`);
  }

  /* 2. alvo de toque.

     A WCAG 2.5.5 exige 44px, mas tem uma exceção que é preciso respeitar,
     senão o teste vira barulho: link DENTRO DE UMA FRASE está dispensado.
     Inflar uma palavra no meio de um parágrafo para 44px de altura
     estouraria o espaçamento entre as linhas e deixaria o texto pior, não
     melhor. O alvo que tem que crescer é o que existe sozinho para ser
     tocado — botão, aba, item de lista, link de navegação.

     O teste de "está numa frase" é o do próprio critério: o pai tem texto
     solto além deste link.

     A segunda dispensa é o campo que o próprio navegador desenha pequeno e
     que ninguém toca: checkbox e radio DENTRO de um rótulo clicável. Quem
     recebe o toque ali é o rótulo inteiro; inflar a caixinha para 44px
     desalinharia a linha sem aumentar alvo nenhum. Então o que eu meço
     nesse caso é o rótulo. */
  const dentroDeFrase = (e) => {
    const p = e.parentElement;
    if (!p) return false;
    return [...p.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1);
  };
  const alvoDeVerdade = (e) => {
    const t = (e.getAttribute('type') || '').toLowerCase();
    if (e.tagName === 'INPUT' && (t === 'checkbox' || t === 'radio')) {
      const rot = (e.labels && e.labels[0]) || e.closest('label');
      if (rot && vis(rot)) return rot;
    }
    return e;
  };
  const pequenos = [];
  const jaVistos = new Set();
  for (const e of document.querySelectorAll('a[href], button, input, select, textarea, [role="button"], [tabindex]')) {
    if (!vis(e)) continue;
    if (e.tagName === 'A' && dentroDeFrase(e)) continue;
    const alvo = alvoDeVerdade(e);
    if (jaVistos.has(alvo)) continue;
    jaVistos.add(alvo);
    const r = alvo.getBoundingClientRect();
    if (r.height < 44) pequenos.push(nome(alvo) + ` ${Math.round(r.width)}×${Math.round(r.height)}`);
  }

  /* 3. texto miúdo + 7. campo que dá zoom no iOS

     O PISO É 12px PARA FRASE, 11px PARA RÓTULO — E ISSO NÃO É CONCESSÃO.

     A primeira versão cobrava 12px de tudo e acusou sete rótulos do rodapé:
     "VISITAR", "A IGREJA", "VER NO MAPA". Fui atrás e achei a régua da casa
     escrita em globals.css: a variável --t-min vale 11px e está comentada
     como "rótulo mínimo, raro, e nunca em frase". Ou seja, não é descuido, é
     decisão — e é defensável: 11px em CAIXA ALTA com .15em de espaço tem
     letra maior que 11px em caixa baixa, porque não há minúsculas para
     encolher. O que some no ônibus é frase miúda, não etiqueta espaçada.

     Então o piso passa a perguntar o que importa: isto é FRASE ou é
     ETIQUETA? Etiqueta é caixa alta, com espaçamento largo, e curta. Abaixo
     de 11px não passa nem etiqueta. Qualquer outra coisa continua em 12.

     (A legibilidade da etiqueta ainda depende do contraste, e disso cuida
     `contraste-real.mjs`, que mede todas elas do mesmo jeito.) */
  const miudos = [], zoomIos = [];
  for (const e of document.querySelectorAll('body *')) {
    if (!vis(e) || !(e.textContent || '').trim()) continue;
    const cs = getComputedStyle(e);
    const t = parseFloat(cs.fontSize);
    const soMeu = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!soMeu || t >= 12) continue;
    const espaco = parseFloat(cs.letterSpacing);            // px
    const etiqueta = cs.textTransform === 'uppercase'
      && Number.isFinite(espaco) && espaco / t >= 0.08
      && (e.textContent || '').trim().length <= 40
      && t >= 11;
    if (!etiqueta) miudos.push(nome(e) + ` ${t}px`);
  }
  for (const e of document.querySelectorAll('input, select, textarea')) {
    if (!vis(e)) continue;
    const t = (e.getAttribute('type') || '').toLowerCase();
    if (t === 'checkbox' || t === 'radio') continue;    // não tem texto digitado: não dá zoom
    const f = parseFloat(getComputedStyle(e).fontSize);
    if (f < 16) zoomIos.push(nome(e) + ` ${f}px`);
  }

  /* 4. teclado errado */
  const teclado = [];
  for (const e of document.querySelectorAll('input')) {
    if (!vis(e)) continue;
    const rot = ((e.labels && e.labels[0]?.textContent) || e.placeholder ||
                 e.getAttribute('aria-label') || e.name || '').toLowerCase();
    const tipo = (e.getAttribute('type') || 'text').toLowerCase();
    const modo = (e.getAttribute('inputmode') || '').toLowerCase();
    const numerico = tipo === 'number' || tipo === 'tel' || modo === 'numeric' || modo === 'decimal' || modo === 'tel';
    if (/telefone|whatsapp|celular|fone/.test(rot) && tipo !== 'tel' && modo !== 'tel')
      teclado.push(nome(e) + ` (telefone com type=${tipo})`);
    if (/valor|orçament|orcament|preço|preco|r\$|quantia/.test(rot) && !numerico)
      teclado.push(nome(e) + ` (dinheiro com type=${tipo})`);
    if (/e-?mail/.test(rot) && tipo !== 'email')
      teclado.push(nome(e) + ` (e-mail com type=${tipo})`);
    /* "DIA" SOZINHO NÃO QUER DIZER CAMPO DE DATA.

       A primeira versão desta linha procurava `data|prazo|quando|dia` e
       acusou quatro vezes o campo "Recado deste dia" da tela de escala — que
       é texto livre ("ex: chegar 18h, tem batismo antes do culto") e está
       certíssimo como `type=text`. Casou com "dia" e pronto.

       Em português "dia" aparece em meia dúzia de frases que não pedem
       calendário. O que pede calendário diz o nome: data, prazo, nascimento,
       vencimento. */
    if (/\bdata\b|\bprazo\b|nascimento|vencimento/.test(rot) && tipo !== 'date' && tipo !== 'datetime-local')
      teclado.push(nome(e) + ` (data com type=${tipo})`);
  }

  /* 5. contraste — NÃO MORA MAIS AQUI.

     A conta de contraste saiu deste arquivo e foi para
     `scripts/contraste-real.mjs`, que mede nos pixels da tela em vez de
     perguntar ao CSS qual seria o fundo. O motivo está escrito lá: a versão
     que perguntava ao CSS errou quatro vezes seguidas, e duas delas quase
     me fizeram "consertar" uma tela que estava certa. Como a medida nova
     precisa decodificar uma imagem, ela roda no Node, não aqui dentro. */

  /* 6. zoom bloqueado */
  const vp = document.querySelector('meta[name="viewport"]')?.content || '';
  const zoomPreso = /user-scalable\s*=\s*(no|0)/.test(vp) || /maximum-scale\s*=\s*1(\.0)?\b/.test(vp);

  return { larguraDoc, estoura, cortadoSemSaida, pequenos, miudos, zoomIos, teclado, vp, zoomPreso };
};

/* Os sete julgamentos, iguais nos dois sistemas. Recebe o `ok` do contador.
   `m.fracos` e `m.sobreFoto` chegam de `contraste-real.mjs`, não do MEDIR. */
export function julgar(ok, etiqueta, m, largura) {
  ok(m.larguraDoc <= largura + 1, `${etiqueta} — não desliza de lado`,
    m.larguraDoc > largura + 1
      ? `documento ${m.larguraDoc}px numa tela de ${largura}px; culpados: ${m.estoura.slice(0, 3).join(' | ')}` : '');
  /* 21/09 · O JULGAMENTO QUE FALTAVA. Ver o comentario de `cortadoSemSaida`
     no MEDIR: nao e a pagina que anda, e o texto que some sem volta. Um link
     colado num comentario mostrava 266px de 880px e as 252 medicoes ficaram
     verdes. */
  ok((m.cortadoSemSaida || []).length === 0,
    `${etiqueta} — nada e cortado sem como alcancar`,
    (m.cortadoSemSaida || []).slice(0, 4).join(' | '));
  ok(m.pequenos.length === 0, `${etiqueta} — todo alvo de toque tem 44px`, m.pequenos.slice(0, 4).join(' | '));
  ok(m.miudos.length === 0, `${etiqueta} — nada de texto abaixo de 12px`, m.miudos.slice(0, 4).join(' | '));
  ok(m.zoomIos.length === 0, `${etiqueta} — nenhum campo dá zoom sozinho no iOS`, m.zoomIos.slice(0, 4).join(' | '));
  ok(m.teclado.length === 0, `${etiqueta} — cada campo abre o teclado certo`, m.teclado.slice(0, 4).join(' | '));
  ok((m.fracos || []).length === 0, `${etiqueta} — contraste em AA`, (m.fracos || []).slice(0, 4).join(' | '));
  ok(!m.zoomPreso, `${etiqueta} — quem enxerga pouco consegue dar zoom`, m.vp);
  if ((m.sobreFoto || []).length) {
    console.log(`  AVISO: ${etiqueta} — texto sobre foto: a média passa, o ponto pior não`);
    console.log('           ' + m.sobreFoto.slice(0, 3).join('\n           '));
  }
}

export function imprimirDetalhe(achados) {
  if (!achados.length) return;
  console.log('\n  --- detalhe ---');
  for (const a of achados) {
    console.log(`\n  ${a.etiqueta}`);
    for (const [k, rot] of [['estoura', 'passa da borda'],
                            ['cortadoSemSaida', 'cortado sem como rolar'], ['pequenos', 'alvo < 44px'],
                            ['miudos', 'texto < 12px'], ['zoomIos', 'campo < 16px'],
                            ['teclado', 'teclado errado'], ['fracos', 'contraste']]) {
      if (a[k]?.length) console.log(`    ${rot}: ${a[k].length}\n      ` + a[k].slice(0, 8).join('\n      '));
    }
  }
}
