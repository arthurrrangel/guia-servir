/* =============================================================================
   AUDITORIA VISUAL DA ÁREA DO VOLUNTÁRIO — 02/10/2026

   Pedido do Arthur, depois de refazer o confirmar e o "posso / não posso":
   "auditoria da interface visual completa após tudo estar feito". Esta é a
   parte medida da auditoria; a outra parte é olhar cada foto que ela salva.

   Todas as telas e estados que o voluntário encontra, em seis larguras (do
   celular pequeno ao computador):

     · /eu/<token> nos estados do harness: confirmar pendente, confirmado,
       tudo respondido, recém-chegado, troca, convite para cobrir, o dia do
       culto (e o líder do dia), como foi, ordem do culto, setlist;
     · /eu/<token> sem rede e com link que não vale;
     · a porta da equipe ("Quem é você?"), onde cai quem chega pelo link do
       grupo num aparelho que não conhece.

   Para cada tela × largura: a MEDIDA do celular (rolagem de lado, texto
   cortado, alvo < 44px, texto miúdo, campo que dá zoom no iOS), o CONTRASTE
   medido nos pixels, o axe-core (WCAG 2.1 A/AA e boas práticas; contraste
   fica com a medida de pixels) e os erros de console. A foto de página
   inteira sai por último, em /tmp/auditoria-voluntario.

     AXE=/caminho/axe.min.js BASE=http://127.0.0.1:3500 node scripts/auditoria-voluntario.mjs

   Sem AXE, a parte do axe é pulada e dito. Sai com 1 se qualquer medida
   acusar. */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { MEDIR, chromeDoContainer, criaContador, julgar, imprimirDetalhe } from './medida-celular.mjs';
import { medirContraste } from './contraste-real.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:3500';
const FOTOS = process.env.FOTOS || '/tmp/auditoria-voluntario';
const AXE = process.env.AXE && existsSync(process.env.AXE) ? readFileSync(process.env.AXE, 'utf8') : '';
const TELAS = [
  { nome: '320', width: 320, height: 640, toque: true },
  { nome: '360', width: 360, height: 780, toque: true },
  { nome: '390', width: 390, height: 844, toque: true },
  { nome: '430', width: 430, height: 932, toque: true },
  { nome: '768', width: 768, height: 1024, toque: true },
  { nome: '1440', width: 1440, height: 900, toque: false },
];
const so = (process.env.SO || '').split(',').filter(Boolean);
const PAGINAS = [
  ...['1', 'confirmado', 'tudo', 'novo', 'troca', 'chamada', 'hoje', 'hoje-lider', 'comofoi', 'ordem', 'setlist']
    .map(v => ({ rota: `/eu/x?demo=${v}`, nome: `eu-${v}`, guarda: '#meu-perfil' })),
  /* sem harness: o banco de mentira responde que caiu, e que o link não vale */
  { rota: '/eu/tok-rede', nome: 'eu-sem-rede', guarda: '.vol', rpc: { eu_dados: { status: 500, body: { message: 'fora do ar' } } } },
  { rota: '/eu/tok-invalido', nome: 'eu-link-invalido', guarda: '.vol', rpc: { eu_dados: { status: 400, body: { message: 'Link invalido', code: 'P0001' } } } },
  { rota: '/equipe/midia?ir=confirmar&demo=lista', nome: 'porta-equipe', guarda: '.eu-titulo' },
].filter(p => !so.length || so.some(s => p.nome.includes(s)));

const { estado, ok } = criaContador();
const achados = [];
mkdirSync(FOTOS, { recursive: true });
const nav = await chromium.launch({ executablePath: chromeDoContainer() });
try {
  for (const tela of TELAS) {
    /* movimento reduzido: a página assenta e a medida mede o que fica (ver a
       nota longa em scripts/escala-celular.mjs) */
    const ctx = await nav.newContext({
      viewport: { width: tela.width, height: tela.height }, deviceScaleFactor: 2,
      isMobile: tela.toque, hasTouch: tela.toque, locale: 'pt-BR', reducedMotion: 'reduce',
    });
    for (const p of PAGINAS) {
      const pag = await ctx.newPage();
      const erros = [];
      pag.on('console', m => { if (m.type() === 'error') erros.push(m.text().slice(0, 160)); });
      pag.on('pageerror', e => erros.push('pageerror: ' + String(e).slice(0, 160)));
      await pag.route('**', r => {
        const u = r.request().url();
        const rpc = u.includes('/rest/v1/rpc/') ? u.split('/rpc/')[1].split('?')[0] : '';
        if (rpc) {
          if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' } });
          const d = p.rpc?.[rpc];
          return r.fulfill({ status: d?.status || 200, contentType: 'application/json',
            headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(d ? d.body : null) });
        }
        return u.startsWith(BASE) ? r.continue() : r.abort();
      });
      await pag.goto(BASE + p.rota, { waitUntil: 'domcontentloaded' });
      let chegou = true;
      try { await pag.waitForSelector(p.guarda, { timeout: 60000, state: 'attached' }); } catch { chegou = false; }
      await pag.addStyleTag({ content: '*,*::before,*::after{transition:none!important} nextjs-portal{display:none!important}' });
      await pag.waitForTimeout(1500);
      const etiqueta = `${tela.nome}px · ${p.nome}`;
      if (!chegou) {
        ok(false, `${etiqueta} — a tela carregou`, `não achei ${p.guarda}`);
        await pag.screenshot({ path: `${FOTOS}/FALHOU-${tela.nome}-${p.nome}.png`, fullPage: true });
        await pag.close(); continue;
      }
      ok(true, `${etiqueta} — a tela carregou`);
      /* A FOTO VEM ANTES DA MEDIDA. Depois que a medida de contraste tira as
         fotos dos pedaços (rolando até cada um), a foto de página inteira do
         Chromium com isMobile saía deslocada uns 30px para cima: a porta da
         equipe aparecia com "MÍDIA" cortado no topo, com a página no lugar
         (scrollY 0, topo da faixa em 0) e até depois de voltar ao topo.
         Reproduzido isolado em 02/10/2026; a medida não muda o DOM, então a
         foto de antes é a mesma tela que ela mede. */
      await pag.evaluate(() => window.scrollTo(0, 0));
      await pag.waitForTimeout(150);
      await pag.screenshot({ path: `${FOTOS}/${tela.nome}-${p.nome}.png`, fullPage: true });
      const m = await pag.evaluate(MEDIR, tela.width);
      Object.assign(m, await medirContraste(pag));
      julgar(ok, etiqueta, m, tela.width);
      if (AXE) {
        await pag.addScriptTag({ content: AXE });
        const v = await pag.evaluate(async () => {
          const r = await window.axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] },
            rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
          });
          return r.violations.map(x => `${x.id} (${x.impact}, ${x.nodes.length}): ${x.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')}`);
        });
        ok(!v.length, `${etiqueta} — axe sem violação`, v.join('\n           '));
      }
      const reais = erros.filter(e => !/net::ERR_FAILED|Failed to load resource|ERR_BLOCKED|status of 40[04]|status of 500/.test(e));
      ok(!reais.length, `${etiqueta} — console sem erro`, reais.slice(0, 3).join(' | '));
      if (m.estoura.length || m.pequenos.length || m.miudos.length || m.zoomIos.length || m.teclado.length || m.fracos.length) {
        achados.push({ etiqueta, ...m });
      }
      await pag.close();
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
  ? `\nauditoria do voluntário: ${estado.falhas} falha(s) em ${estado.feitas}`
  : `\nauditoria do voluntário: ${estado.feitas}/${estado.feitas} ok`);
console.log(`(fotos em ${FOTOS}${AXE ? '' : '; axe pulado: passe AXE=/caminho/axe.min.js'})`);
process.exit(estado.falhas ? 1 : 0);
