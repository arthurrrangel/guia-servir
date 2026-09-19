/* O SISTEMA DE DEMANDAS MEDIDO NO TAMANHO DE CELULAR.

   Abrir a tela e achar bonito não é auditoria. Esta mede, em cada tela e em
   cada papel, as coisas que quebram a leitura no celular e que o olho deixa
   passar porque o navegador de mesa esconde:

     1. ROLAGEM LATERAL. Em 320px, qualquer elemento mais largo que a tela
        faz a página inteira deslizar de lado. É o defeito mais comum e o
        mais fácil de não ver, porque no desktop sobra espaço.
     2. ALVO DE TOQUE PEQUENO. Botão, link ou campo com menos de 44px de
        altura é o que faz a pessoa errar o toque três vezes. 44 é o número
        da Apple e o da WCAG (2.5.5); uso 44.
     3. TEXTO MIÚDO. Abaixo de 12px ninguém lê no ônibus.
     4. TECLADO ERRADO. Campo de telefone, de número e de data que não diz
        `type`/`inputMode` abre o teclado de letras, e a pessoa digita
        errado. Custa um atributo e economiza um erro por preenchimento.
     5. CONTRASTE. Texto com razão abaixo de 4.5:1 (WCAG AA) some no sol.
     6. ZOOM BLOQUEADO. `user-scalable=no` ou `maximum-scale=1` tira de quem
        enxerga pouco a única saída que sobra.
     7. CAMPO QUE DÁ ZOOM SOZINHO. No iOS, input com fonte menor que 16px
        faz o Safari dar zoom ao focar, e a pessoa fica com a tela torta.

   Mede em 320 (o menor celular que ainda aparece) e 390 (o comum hoje).

   Precisa do app no ar em 127.0.0.1:3400, ligado na ponte da porta 54321.
   Sobe com `scripts/demandas-celular-subir.sh`.

   Roda com `node scripts/demandas-celular.mjs`. */

import { chromium } from 'playwright';
import { existsSync, readdirSync, mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3400';
const FOTOS = '/tmp/celular';
const TELAS = [{ nome: '320', width: 320, height: 640 }, { nome: '390', width: 390, height: 844 }];

/* um token por papel: o menu de abas e os botões mudam com o papel, então
   auditar só como admin esconderia metade da interface */
const PAPEIS = [
  { tok: 'tok-admin',    quem: 'admin' },
  { tok: 'tok-comunica', quem: 'responsavel' },
  { tok: 'tok-pede',     quem: 'solicitante' },
];

const PAGINAS = [
  { rota: '/demandas',           nome: 'lista' },
  { rota: '/demandas/nova',      nome: 'nova' },
  { rota: '/demandas/numeros',   nome: 'numeros', so: ['admin', 'responsavel'] },
  { rota: '/demandas/ajustes',   nome: 'ajustes', so: ['admin'] },
  { rota: '/demandas/d/4',       nome: 'detalhe-execucao' },
  { rota: '/demandas/d/3',       nome: 'detalhe-travada' },
  { rota: '/demandas/d/6',       nome: 'detalhe-concluida' },
];

let falhas = 0, feitas = 0;
const achados = [];
const ok = (c, rot, extra = '') => {
  feitas++;
  if (!c) { falhas++; console.log('  FALHOU:', rot, extra ? '\n           ' + extra : ''); }
};

function chromeDoContainer() {
  const raiz = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const d of readdirSync(raiz).filter(x => x.startsWith('chromium-'))) {
    const c = `${raiz}/${d}/chrome-linux/chrome`;
    if (existsSync(c)) return c;
  }
  return undefined;
}

/* --------------------------------------------------------------- a medida */
const MEDIR = (largura) => {
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

       · o pai recorta com `overflow` — é o caso do nome do setor no topo,
         que é cortado com reticências de propósito;
       · o pai é um container de rolagem — é o caso da tabela de Números,
         que rola dentro do cartão porque grade de cinco colunas não se
         empilha sem destruir a comparação.

     A primeira versão disto acusava os dois, 22 vezes, e nenhuma era
     defeito. O que importa é uma coisa só: A PÁGINA anda? Então a medida
     que manda é `larguraDoc`, e a lista de culpados agora ignora quem já
     está preso por um ancestral que recorta. */
  const larguraDoc = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
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

  /* 2. alvo de toque.

     A WCAG 2.5.5 exige 44px, mas tem uma exceção que é preciso respeitar,
     senão o teste vira barulho: link DENTRO DE UMA FRASE está dispensado.
     Inflar uma palavra no meio de um parágrafo para 44px de altura
     estouraria o espaçamento entre as linhas e deixaria o texto pior, não
     melhor. O alvo que tem que crescer é o que existe sozinho para ser
     tocado — botão, aba, item de lista, link de navegação.

     O teste de "está numa frase" é o do próprio critério: o pai tem texto
     solto além deste link. */
  const dentroDeFrase = (e) => {
    const p = e.parentElement;
    if (!p) return false;
    return [...p.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1);
  };
  const pequenos = [];
  for (const e of document.querySelectorAll('a[href], button, input, select, textarea, [role="button"], [tabindex]')) {
    if (!vis(e)) continue;
    if (e.tagName === 'A' && dentroDeFrase(e)) continue;
    const r = e.getBoundingClientRect();
    if (r.height < 44) pequenos.push(nome(e) + ` ${Math.round(r.width)}×${Math.round(r.height)}`);
  }

  /* 3. texto miúdo + 7. campo que dá zoom no iOS */
  const miudos = [], zoomIos = [];
  for (const e of document.querySelectorAll('body *')) {
    if (!vis(e) || !(e.textContent || '').trim()) continue;
    const t = parseFloat(getComputedStyle(e).fontSize);
    const soMeu = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (soMeu && t < 12) miudos.push(nome(e) + ` ${t}px`);
  }
  for (const e of document.querySelectorAll('input, select, textarea')) {
    if (!vis(e)) continue;
    const t = parseFloat(getComputedStyle(e).fontSize);
    if (t < 16) zoomIos.push(nome(e) + ` ${t}px`);
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
    if (/data|prazo|quando|dia/.test(rot) && tipo !== 'date' && tipo !== 'datetime-local')
      teclado.push(nome(e) + ` (data com type=${tipo})`);
  }

  /* 5. contraste */
  const lum = (c) => {
    const n = (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    if (n.length < 3) return null;
    const f = n.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  };
  /* O FUNDO DE VERDADE É UMA PILHA, NÃO UMA COR.

     A primeira versão disto pegava o primeiro fundo não transparente subindo
     a árvore e usava como está. Com isso, a pílula verde — tinta #0a6b3f
     sobre `rgba(10,107,63,.10)` — foi medida como #0a6b3f contra
     rgb(10,107,63), ou seja, ela mesma: razão 1.00:1, "texto invisível".

     Era mentira. Aqueles 10% de verde deitados sobre o branco dão um verde
     quase branco, e o contraste real é 5.67:1, que passa em AA folgado. Eu
     quase "consertei" uma folha que estava certa.

     Então aqui o fundo é composto de baixo para cima: junta as camadas
     translúcidas na ordem em que o navegador pinta, e só então compara. */
  const comporFundo = (e) => {
    const camadas = [];
    let n = e;
    while (n && n !== document.documentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      const p = (bg.match(/[\d.]+/g) || []).map(Number);
      if (p.length >= 3) {
        const a = p.length > 3 ? p[3] : 1;
        if (a > 0) {
          camadas.push({ cor: p.slice(0, 3), a });
          if (a >= 1) break;                       // opaca: nada abaixo importa
        }
      }
      n = n.parentElement;
    }
    /* base: o fundo da raiz, ou branco se ela também for transparente */
    const raiz = (getComputedStyle(document.documentElement).backgroundColor.match(/[\d.]+/g) || []).map(Number);
    let base = raiz.length >= 3 && (raiz.length < 4 || raiz[3] > 0) ? raiz.slice(0, 3) : [255, 255, 255];
    /* pinta da mais funda para a mais rasa */
    for (let i = camadas.length - 1; i >= 0; i--) {
      const { cor, a } = camadas[i];
      base = [0, 1, 2].map(j => a * cor[j] + (1 - a) * base[j]);
    }
    return `rgb(${base.map(Math.round).join(', ')})`;
  };
  const fundoDe = comporFundo;
  const fracos = [];
  for (const e of document.querySelectorAll('body *')) {
    if (!vis(e)) continue;
    const soMeu = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!soMeu) continue;
    const cs = getComputedStyle(e);
    const lt = lum(cs.color), lf = lum(fundoDe(e));
    if (lt === null || lf === null) continue;
    const razao = (Math.max(lt, lf) + 0.05) / (Math.min(lt, lf) + 0.05);
    const t = parseFloat(cs.fontSize), peso = Number(cs.fontWeight) || 400;
    const grande = t >= 24 || (t >= 18.66 && peso >= 700);
    const minimo = grande ? 3 : 4.5;
    if (razao < minimo) fracos.push(nome(e) + ` ${razao.toFixed(2)}:1 (mín ${minimo})`);
  }

  /* 6. zoom bloqueado */
  const vp = document.querySelector('meta[name="viewport"]')?.content || '';
  const zoomPreso = /user-scalable\s*=\s*(no|0)/.test(vp) || /maximum-scale\s*=\s*1(\.0)?\b/.test(vp);

  return { larguraDoc, estoura, pequenos, miudos, zoomIos, teclado, fracos, vp, zoomPreso };
};

/* ------------------------------------------------------------------ roda */
mkdirSync(FOTOS, { recursive: true });
const nav = await chromium.launch({ executablePath: chromeDoContainer() });

try {
  for (const tela of TELAS) {
    for (const papel of PAPEIS) {
      const ctx = await nav.newContext({
        viewport: { width: tela.width, height: tela.height },
        deviceScaleFactor: 2, isMobile: true, hasTouch: true,
      });
      const pag = await ctx.newPage();
      const recusas = [];
      pag.on('console', m => {
        if (m.type() === 'error' && /Refused to apply style|Failed to load resource.*\.css/i.test(m.text())) {
          recusas.push(m.text().slice(0, 140));
        }
      });
      /* entra pelo link pessoal uma vez; o token fica guardado */
      await pag.goto(`${BASE}/demandas?t=${papel.tok}`, { waitUntil: 'networkidle' });
      await pag.waitForTimeout(700);

      /* A FOLHA CHEGOU? SE NÃO, TUDO ABAIXO É MENTIRA.

         Isto existe porque aconteceu: um `next start` velho continuou de pé
         na porta enquanto eu subia o novo, e passou a servir o manifesto
         antigo. A folha de demandas virou 404, o 404 volta como HTML, o
         navegador recusa o HTML como CSS — e a auditoria mediu uma página
         SEM ESTILO NENHUM, relatando alegremente "54 defeitos". Todos
         falsos: a logo aparecia com 20px de altura porque não tinha regra,
         não porque a regra estava errada.

         Medir sem conferir se há o que medir é o jeito mais rápido de
         produzir um relatório inteiro de mentira. Então: a casca tem que
         existir e as variáveis dela têm que resolver, senão para aqui. */
      const folha = await pag.evaluate(() => {
        const casca = document.querySelector('.dm');
        if (!casca) return { ok: false, por: 'a casca .dm não existe na página' };
        const cs = getComputedStyle(casca);
        const bg = cs.getPropertyValue('--dm-bg').trim();
        if (!bg) return { ok: false, por: 'as variáveis --dm-* não resolvem: a folha não foi aplicada' };
        const logo = document.querySelector('.dm-logo');
        if (logo && getComputedStyle(logo).display === 'inline') {
          return { ok: false, por: 'a logo está sem estilo (display:inline): folha ausente' };
        }
        return { ok: true };
      });
      if (!folha.ok || recusas.length) {
        console.log(`  PAREI em ${tela.nome}px · ${papel.quem}: ${folha.por || 'o navegador recusou a folha'}`);
        if (recusas.length) console.log('    ' + recusas[0]);
        console.log('    Auditar sem folha produz relatório falso. Suba o app de novo e repita.');
        falhas++; feitas++;
        await ctx.close();
        continue;
      }

      /* E O TOKEN PEGOU? SE NÃO, EU ESTOU AUDITANDO O PORTÃO.

         Também aconteceu: a suíte de banco (`demandas-banco.sh`) derruba e
         recria o banco `dem`, e levou junto os dados desta auditoria. Os
         tokens sumiram, `dem_quem_sou` passou a responder SEM_ACESSO, e
         todas as rotas caíram na tela de "Entre para ver as demandas".

         Essa tela não tem defeito nenhum: um título, um parágrafo e um
         botão. Então a auditoria anunciou "252/252 ok" — medindo sete vezes
         a mesma tela de login, em vez das sete telas do sistema.

         Relatório verde sobre a tela errada é pior que relatório vermelho.
         Daqui em diante, se a casca não mostra as abas de quem entrou,
         para. */
      const dentro = await pag.evaluate(() => {
        const abas = document.querySelector('.dm-abas');
        if (!abas) return { ok: false, por: 'sem as abas: a sessão não foi reconhecida (o portão está na tela)' };
        const quantas = abas.querySelectorAll('a').length;
        if (!quantas) return { ok: false, por: 'as abas estão vazias' };
        return { ok: true, quantas };
      });
      if (!dentro.ok) {
        console.log(`  PAREI em ${tela.nome}px · ${papel.quem}: ${dentro.por}`);
        console.log('    Semeie o banco de novo (scripts/demandas-celular-subir.sh) e repita.');
        falhas++; feitas++;
        await ctx.close();
        continue;
      }

      for (const p of PAGINAS) {
        if (p.so && !p.so.includes(papel.quem)) continue;
        await pag.goto(BASE + p.rota, { waitUntil: 'networkidle' });
        await pag.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
        await pag.waitForTimeout(600);

        const m = await pag.evaluate(MEDIR, tela.width);
        const etiqueta = `${tela.nome}px · ${papel.quem} · ${p.nome}`;
        await pag.screenshot({ path: `${FOTOS}/${tela.nome}-${papel.quem}-${p.nome}.png`, fullPage: true });

        ok(m.larguraDoc <= tela.width + 1, `${etiqueta} — não desliza de lado`,
          m.larguraDoc > tela.width + 1 ? `documento ${m.larguraDoc}px numa tela de ${tela.width}px; culpados: ${m.estoura.slice(0,3).join(' | ')}` : '');
        ok(m.pequenos.length === 0, `${etiqueta} — todo alvo de toque tem 44px`,
          m.pequenos.slice(0, 4).join(' | '));
        ok(m.miudos.length === 0, `${etiqueta} — nada de texto abaixo de 12px`,
          m.miudos.slice(0, 4).join(' | '));
        ok(m.zoomIos.length === 0, `${etiqueta} — nenhum campo dá zoom sozinho no iOS`,
          m.zoomIos.slice(0, 4).join(' | '));
        ok(m.teclado.length === 0, `${etiqueta} — cada campo abre o teclado certo`,
          m.teclado.slice(0, 4).join(' | '));
        ok(m.fracos.length === 0, `${etiqueta} — contraste em AA`,
          m.fracos.slice(0, 4).join(' | '));
        ok(!m.zoomPreso, `${etiqueta} — quem enxerga pouco consegue dar zoom`, m.vp);

        if (m.estoura.length || m.pequenos.length || m.miudos.length || m.zoomIos.length ||
            m.teclado.length || m.fracos.length) {
          achados.push({ etiqueta, ...m });
        }
      }
      await ctx.close();
    }
  }
} catch (e) {
  falhas++; console.log('  ERRO:', String(e).slice(0, 400));
} finally {
  await nav.close().catch(() => {});
}

if (achados.length) {
  console.log('\n  --- detalhe ---');
  for (const a of achados) {
    console.log(`\n  ${a.etiqueta}`);
    for (const [k, rot] of [['estoura','passa da borda'], ['pequenos','alvo < 44px'],
                            ['miudos','texto < 12px'], ['zoomIos','campo < 16px'],
                            ['teclado','teclado errado'], ['fracos','contraste']]) {
      if (a[k]?.length) console.log(`    ${rot}: ${a[k].length}\n      ` + a[k].slice(0, 6).join('\n      '));
    }
  }
}

console.log(falhas ? `\ncelular: ${falhas} falha(s) em ${feitas}` : `\ncelular: ${feitas}/${feitas} ok`);
console.log(`(fotos em ${FOTOS})`);
process.exit(falhas ? 1 : 0);
