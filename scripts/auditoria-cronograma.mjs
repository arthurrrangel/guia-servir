/* =============================================================================
   AUDITORIA VISUAL DO CRONOGRAMA DO CULTO — 109, 03/10/2026

   A parte medida da auditoria das telas novas; a outra parte é olhar cada
   foto que ela salva. Todas as telas e estados, em sete larguras (do celular
   pequeno ao computador):
     · a aba Culto: a lista, a folha do líder (pela metade, vazia, pronta) e
       a folha com cada formulário aberto e com "Mandar no grupo";
     · a folha pelo link do grupo (pronta, vazia, Follow, comprida, link que
       não vale);
     · o dirigente: o cartão no link dele, o formulário e o culto que não é
       dele;
     · o cartão do painel.
   Para cada tela × largura: a MEDIDA do celular (rolagem de lado, texto
   cortado, alvo < 44px, texto miúdo, campo que dá zoom no iOS), o CONTRASTE
   medido nos pixels, o axe-core (WCAG 2.1 A/AA e boas práticas) e os erros de
   console. A foto de página inteira sai antes da medida.
     AXE=/caminho/axe.min.js BASE=http://127.0.0.1:3500 TZ=America/Sao_Paulo node scripts/auditoria-cronograma.mjs
   Sai com 1 se qualquer medida acusar. */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { MEDIR, chromeDoContainer, criaContador, julgar, imprimirDetalhe } from './medida-celular.mjs';
import { medirContraste } from './contraste-real.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:3500';
const FOTOS = process.env.FOTOS || '/tmp/auditoria-cronograma';
const AXE = process.env.AXE && existsSync(process.env.AXE) ? readFileSync(process.env.AXE, 'utf8') : '';
const TELAS = [
  { nome: '320', width: 320, height: 640, toque: true },
  { nome: '360', width: 360, height: 780, toque: true },
  { nome: '390', width: 390, height: 844, toque: true },
  { nome: '430', width: 430, height: 932, toque: true },
  { nome: '768', width: 768, height: 1024, toque: true },
  { nome: '1024', width: 1024, height: 768, toque: false },
  { nome: '1440', width: 1440, height: 900, toque: false },
];
const hoje = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
const DOM = (() => { const d = new Date(hoje + 'T12:00:00Z'); for (let k = 0; k < 14; k++) { const x = new Date(d.getTime() + k * 864e5); if (x.getUTCDay() === 0) return x.toISOString().slice(0, 10); } })();
const clicar = (sel, nome) => async pag => { await pag.locator(sel).getByRole('button', { name: nome }).first().click(); await pag.waitForTimeout(300); };
const so = (process.env.SO || '').split(',').filter(Boolean);
const PAGINAS = [
  { rota: '/cronogramas?demo=1', nome: 'lista', guarda: '.es-secao' },
  { rota: `/cronogramas/${DOM}?demo=parcial`, nome: 'folha-parcial', guarda: '#cr-avisos' },
  { rota: `/cronogramas/${DOM}?demo=vazia`, nome: 'folha-vazia', guarda: '#cr-avisos' },
  { rota: `/cronogramas/${DOM}?demo=cheia`, nome: 'folha-pronta', guarda: '#cr-avisos' },
  { rota: `/cronogramas/${DOM}?demo=parcial`, nome: 'form-palavra', guarda: '#cr-avisos', acao: clicar('#cr-palavra', 'Editar') },
  { rota: `/cronogramas/${DOM}?demo=parcial`, nome: 'form-horarios', guarda: '#cr-avisos', acao: clicar('#cr-linha', 'Editar') },
  { rota: `/cronogramas/${DOM}?demo=cheia`, nome: 'form-avisos', guarda: '#cr-avisos', acao: clicar('#cr-avisos', 'Editar') },
  { rota: `/cronogramas/${DOM}?demo=parcial`, nome: 'form-final', guarda: '#cr-avisos', acao: clicar('#cr-louvor', 'Escrever a música final') },
  { rota: `/cronogramas/${DOM}?demo=parcial`, nome: 'mandar', guarda: '#cr-avisos', acao: async pag => { await pag.getByRole('button', { name: 'Mandar no grupo' }).click(); await pag.waitForSelector('.es-cr-msg'); } },
  { rota: '/cronograma/0123456789abcdef01?demo=cheia', nome: 'publica-pronta', guarda: '.fo-titulo' },
  { rota: '/cronograma/0123456789abcdef01?demo=vazia', nome: 'publica-vazia', guarda: '.fo-titulo' },
  { rota: '/cronograma/0123456789abcdef01?demo=follow', nome: 'publica-follow', guarda: '.fo-titulo' },
  { rota: '/cronograma/0123456789abcdef01?demo=longa', nome: 'publica-longa', guarda: '.fo-titulo' },
  { rota: '/cronograma/0123456789abcdef99', nome: 'publica-invalida', guarda: '.fo-pagina-msg h1', rpc: { cronograma_publico: { ok: false, erro: 'LINK_INVALIDO' } } },
  { rota: '/eu/x?demo=dirigente', nome: 'dirigente-cartao', guarda: '#cronograma' },
  { rota: `/eu/x/culto/${DOM}?demo=1`, nome: 'dirigente-form', guarda: '#d-tema' },
  { rota: '/eu/x/culto/2026-01-04?demo=1', nome: 'dirigente-nao-e-dele', guarda: '.vol-chamada h1' },
  { rota: '/painel?demo=1', nome: 'painel', guarda: 'h2:has-text("Cronograma ·")' },
].filter(p => !so.length || so.some(s => p.nome.includes(s)));

const { estado, ok } = criaContador();
const achados = [];
mkdirSync(FOTOS, { recursive: true });
const nav = await chromium.launch({ executablePath: chromeDoContainer() });
try {
  for (const tela of TELAS) {
    const ctx = await nav.newContext({
      viewport: { width: tela.width, height: tela.height }, deviceScaleFactor: 2,
      isMobile: tela.toque, hasTouch: tela.toque, locale: 'pt-BR', reducedMotion: 'reduce', timezoneId: 'America/Sao_Paulo',
    });
    for (const p of PAGINAS) {
      const pag = await ctx.newPage();
      const erros = [];
      pag.on('console', m => { if (m.type() === 'error') erros.push(m.text().slice(0, 160)); });
      pag.on('pageerror', e => erros.push('pageerror: ' + String(e).slice(0, 160)));
      await pag.route('**', r => {
        const u = r.request().url();
        const rpc = u.includes('/rest/v1/rpc/') ? u.split('/rpc/')[1].split('?')[0] : '';
        if (u.includes('/rest/v1/')) {
          if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS' } });
          const d = rpc && p.rpc?.[rpc];
          /* o resto do banco: nada (as telas do harness não dependem dele) */
          return r.fulfill({ status: d ? 200 : rpc ? 404 : 200, contentType: 'application/json',
            headers: { 'access-control-allow-origin': '*' },
            body: JSON.stringify(d || (rpc ? { code: 'PGRST202', message: 'Could not find the function' } : [])) });
        }
        return u.startsWith(BASE) ? r.continue() : r.abort();
      });
      await pag.goto(BASE + p.rota, { waitUntil: 'domcontentloaded' });
      let chegou = true;
      try { await pag.waitForSelector(p.guarda, { timeout: 60000, state: 'attached' }); } catch { chegou = false; }
      await pag.addStyleTag({ content: '*,*::before,*::after{transition:none!important} nextjs-portal{display:none!important}' });
      await pag.waitForTimeout(1200);
      const etiqueta = `${tela.nome}px · ${p.nome}`;
      if (!chegou) {
        ok(false, `${etiqueta} — a tela carregou`, `não achei ${p.guarda}`);
        await pag.screenshot({ path: `${FOTOS}/FALHOU-${tela.nome}-${p.nome}.png`, fullPage: true });
        await pag.close(); continue;
      }
      if (p.acao) { try { await p.acao(pag); } catch (e) { ok(false, `${etiqueta} — a ação`, String(e).slice(0, 200)); } }
      ok(true, `${etiqueta} — a tela carregou`);
      await pag.evaluate(() => window.scrollTo(0, 0));
      await pag.waitForTimeout(150);
      await pag.screenshot({ path: `${FOTOS}/${tela.nome}-${p.nome}.png`, fullPage: true });
      const m = await pag.evaluate(MEDIR, tela.width);
      Object.assign(m, await medirContraste(pag));
      /* SEM TOQUE NÃO HÁ DEDO NEM TECLADO DO IPHONE. A casca do líder no
         computador é mais densa de propósito (escalas.css: "o mouse ganha
         densidade"): itens da lateral com 34px e campos a 14px. Alvo de 44px
         e campo de 16px são regras do toque; no computador elas acusariam o
         desenho da casa, e não o cronograma. */
      if (!tela.toque) { m.pequenos = []; m.zoomIos = []; }
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
  ? `\nauditoria do cronograma: ${estado.falhas} falha(s) em ${estado.feitas}`
  : `\nauditoria do cronograma: ${estado.feitas}/${estado.feitas} ok`);
console.log(`(fotos em ${FOTOS}${AXE ? '' : '; axe pulado: passe AXE=/caminho/axe.min.js'})`);
process.exit(estado.falhas ? 1 : 0);
