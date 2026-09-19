/* O SISTEMA DE ESCALAS MEDIDO NO TAMANHO DE CELULAR.

   Mesma medida do sistema de demandas — a de `medida-celular.mjs` — apontada
   para as telas que a liderança e os voluntários usam de verdade: painel,
   escala, time, conferir, ajustes, ministérios, candidaturas, entrar e a
   tela pessoal do voluntário.

   POR QUE `?demo=1` E NÃO O BANCO DE VERDADE

   As telas de escala só existem depois de uma sessão autenticada. Entrar
   como o Arthur para medir a interface seria usar a conta dele, e isso está
   fora de questão. O próprio app já resolve isso: em desenvolvimento,
   `?demo=1` alimenta a casca e as telas com um estado completo vindo de
   `lib/demo.ts` — cinco ministérios, uma escala montada, candidaturas na
   fila. É o mesmo desenho com os mesmos dados de tamanho realista.

   Em produção esse caminho não existe: `demoLigado()` é peneirado no build
   junto com o import (ver `lib/demo-ligado.ts`), então nada disto vira código
   servido a ninguém.

   Precisa do app em modo de desenvolvimento:
     NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:59999 \
     NEXT_PUBLIC_SUPABASE_ANON_KEY=chave-de-teste npx next dev -p 3500

   Roda com `node scripts/escala-celular.mjs`. */

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { MEDIR, chromeDoContainer, criaContador, julgar, imprimirDetalhe } from './medida-celular.mjs';
import { medirContraste } from './contraste-real.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:3500';
const FOTOS = '/tmp/celular-escala';
const TELAS = [{ nome: '320', width: 320, height: 640 }, { nome: '390', width: 390, height: 844 }];

/* `guarda` é o seletor que prova que a tela chegou inteira. Sem ele, medir
   uma tela que ainda está carregando (ou que caiu no portão) devolve
   relatório verde sobre a tela errada — foi o que aconteceu na auditoria de
   demandas, e a lição vale aqui. */
const PAGINAS = [
  { rota: '/painel?demo=1',                nome: 'painel',       guarda: '.sistema' },
  { rota: '/escala?demo=1',                nome: 'escala',       guarda: '.sistema' },
  { rota: '/time?demo=1',                  nome: 'time',         guarda: '.sistema' },
  { rota: '/time/conferir?demo=1',         nome: 'conferir',     guarda: '.sistema' },
  { rota: '/ajustes?demo=1',               nome: 'ajustes',      guarda: '.sistema' },
  { rota: '/ajustes/ministerios?demo=1',   nome: 'ministerios',  guarda: '.sistema' },
  { rota: '/painel/candidaturas?demo=1',   nome: 'candidaturas', guarda: '.sistema' },
  /* a tela do voluntário não tem <main> nem a casca `.sistema`: ela é a
     `.vol`, que é outra casca, mais enxuta, porque quem entra ali entra por
     link pessoal e não navega o sistema */
  { rota: '/eu/x?demo=1',                  nome: 'voluntario',   guarda: '.vol' },
  { rota: '/eu/x?demo=confirmado',         nome: 'voluntario-ok', guarda: '.vol' },
  { rota: '/entrar',                       nome: 'entrar',       guarda: 'main, form' },
  { rota: '/acessar',                      nome: 'acessar',      guarda: 'main' },
];

const { estado, ok } = criaContador();
const achados = [];

mkdirSync(FOTOS, { recursive: true });
const nav = await chromium.launch({ executablePath: chromeDoContainer() });

try {
  for (const tela of TELAS) {
    /* POR QUE A AUDITORIA RODA COM O MOVIMENTO REDUZIDO

       As telas revelam o conteúdo conforme a rolagem, e isso significa que a
       página fica se mexendo enquanto eu meço. Foi assim que o botão preto
       "Copiar a escala" — branco sólido sobre #252525 — apareceu no relatório
       como branco sobre branco: a foto era de um instante e as coordenadas de
       outro.

       A saída não é lutar contra o efeito, é usar a porta que o app já tem.
       Com `prefers-reduced-motion: reduce`, `components/Movimento.tsx` revela
       tudo de uma vez e não observa mais nada, a folha esconde a cortina de
       abertura e a rolagem deixa de ser suave. A página assenta e fica onde
       está. O LAYOUT é o mesmo — muda o movimento, não a medida —, e de
       quebra isto audita a versão que quem marcou "reduzir movimento" no
       aparelho realmente vê. */
    const ctx = await nav.newContext({
      viewport: { width: tela.width, height: tela.height },
      deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR',
      reducedMotion: 'reduce',
    });
    const pag = await ctx.newPage();

    /* nada sai daqui para a internet: o que não for do app local morre na
       porta, e o supabase aponta para uma porta morta de propósito */
    await pag.route('**', r => {
      const u = r.request().url();
      if (u.startsWith(BASE)) return r.continue();
      return r.abort();
    });

    for (const p of PAGINAS) {
      await pag.goto(BASE + p.rota, { waitUntil: 'domcontentloaded' });
      let chegou = true;
      try {
        await pag.waitForSelector(p.guarda, { timeout: 8000, state: 'attached' });
      } catch { chegou = false; }
      /* transição desligada, animação ADIANTADA até o fim — e só a de quem
         está na tela. Desligar a animação congelaria a cortina de abertura
         por cima de tudo; adiantar a de quem está escondido acordaria o menu
         fechado por cima de tudo. Os dois porquês estão em
         `contraste-real.mjs`. */
      await pag.addStyleTag({ content: '*,*::before,*::after{transition:none!important}' });
      await pag.evaluate(() => {
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
      });
      await pag.waitForTimeout(800);

      const etiqueta = `${tela.nome}px · ${p.nome}`;

      /* A TELA É A QUE EU PEDI? Se a casca não montou, ou se o que apareceu
         foi o portão de login, medir aqui produz um relatório sobre uma tela
         que ninguém vai usar. Melhor uma falha honesta. */
      const chegada = await pag.evaluate((g) => {
        const corpo = (document.body.textContent || '').trim();
        if (!corpo) return { ok: false, por: 'a página veio vazia' };
        if (!document.querySelector(g)) return { ok: false, por: `não achei ${g}` };
        const temEstilo = !!getComputedStyle(document.documentElement).getPropertyValue('--preto').trim();
        if (!temEstilo) return { ok: false, por: 'as variáveis do tema não resolvem: a folha não chegou' };
        return { ok: true, palavras: corpo.split(/\s+/).length };
      }, p.guarda);

      if (!chegou || !chegada.ok) {
        ok(false, `${etiqueta} — a tela carregou`, chegada.por || 'o seletor de guarda não apareceu a tempo');
        await pag.screenshot({ path: `${FOTOS}/FALHOU-${tela.nome}-${p.nome}.png`, fullPage: true });
        continue;
      }
      ok(true, `${etiqueta} — a tela carregou`);

      /* A FOTO DE ARQUIVO SAI POR ÚLTIMO.

         `fullPage: true` estica a janela até a altura do documento e refaz o
         layout. Enquanto a página volta ao normal, quem medir logo em
         seguida mede uma tela que ainda está se recompondo — e foi de lá que
         saíram dois avisos fantasma de "texto sobre foto" em elementos que,
         medidos sozinhos, estão limpos. Medir primeiro, retratar depois. */
      const m = await pag.evaluate(MEDIR, tela.width);
      Object.assign(m, await medirContraste(pag));
      julgar(ok, etiqueta, m, tela.width);
      await pag.screenshot({ path: `${FOTOS}/${tela.nome}-${p.nome}.png`, fullPage: true });

      if (m.estoura.length || m.pequenos.length || m.miudos.length || m.zoomIos.length ||
          m.teclado.length || m.fracos.length) {
        achados.push({ etiqueta, ...m });
      }
    }
    await ctx.close();
  }
} catch (e) {
  estado.falhas++; console.log('  ERRO:', String(e).slice(0, 500));
} finally {
  await nav.close().catch(() => {});
}

imprimirDetalhe(achados);
console.log(estado.falhas
  ? `\nescala no celular: ${estado.falhas} falha(s) em ${estado.feitas}`
  : `\nescala no celular: ${estado.feitas}/${estado.feitas} ok`);
console.log(`(fotos em ${FOTOS})`);
process.exit(estado.falhas ? 1 : 0);
