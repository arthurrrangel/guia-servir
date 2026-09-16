/* AUDITORIA · O site em sete larguras de aparelho, medido antes de olhado.

   Para cada rota × largura: captura de página inteira e cinco medições que
   não dependem de gosto:

     estouro    document.scrollWidth > innerWidth (a página rola de lado)
     vazando    elemento cuja caixa passa da borda direita da janela
     cortado    texto com scrollWidth > clientWidth dentro de overflow:hidden
                (o rótulo que sai do botão sem ninguém ver)
     alvo       controle interativo com menos de 44×44 (WCAG 2.5.5); links
                dentro de texto corrido (e os da atribuição do mapa) seguem a
                exceção de link em linha do WCAG 2.5.8
     invisivel  .pal ou .rev que ficou em opacity:0 depois de a página assentar
                (o título que some quando falta .rev)
     fonte      texto visível abaixo de 12px

   E, uma vez por largura, se a Inter carregou de verdade (document.fonts).

     PORTA=3800 CHROMIUM=/opt/pw-browsers/chromium node scripts/auditoria-aparelhos.mjs [/rota ...]

   Sai com código 1 se qualquer medição acusar. As capturas ficam em
   /tmp/audit/<largura>/<rota>.png e o resumo em /tmp/audit/medidas.json.       */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';

const B = `http://localhost:${process.env.PORTA || 3000}`;
const CHROME = process.env.CHROMIUM || undefined;

const ROTAS = process.argv.slice(2).length ? process.argv.slice(2) : [
  '/', '/cultos', '/como-chegar', '/pequena-guia', '/sobre', '/guia-church-tv', '/privacidade',
  '/servir', '/servir/onde-me-encaixo',
  '/servir/midia', '/servir/louvor', '/servir/kids', '/servir/servico', '/servir/livraria',
  '/servir/midia/cadastro',
  '/ofertar',
  '/acessar', '/entrar', '/eu',
  '/rota-que-nao-existe',
];

/* largura × altura de aparelhos reais, do menor para o maior */
const APARELHOS = [
  [320, 568, 'iphone-se'],
  [390, 844, 'iphone-15'],
  [430, 932, 'iphone-pro-max'],
  [768, 1024, 'ipad'],
  [1024, 768, 'ipad-deitado'],
  [1440, 900, 'notebook'],
  [1920, 1080, 'monitor'],
];

/* as RPCs vêm de arquivo: o Chromium do container não alcança o Supabase */
function serveRpc(r) {
  const u = r.request().url();
  const fn = u.split('/rpc/')[1]?.split('?')[0];
  let slug = '';
  try { slug = JSON.parse(r.request().postData() || '{}').p_slug || ''; } catch {}
  for (const n of [slug ? `${fn}__${slug}` : null, fn].filter(Boolean)) {
    const f = `/tmp/rpc/${n}.json`;
    if (existsSync(f)) return r.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(f, 'utf8') });
  }
  return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
}

const nav = await chromium.launch({ executablePath: CHROME });
const medidas = [];
let total = 0;

/* as sete larguras correm em paralelo: são contextos independentes e o
   servidor é local. Sequencial levava mais de dez minutos. */
async function umaLargura([W, H, nome]) {
  mkdirSync(`/tmp/audit/${W}`, { recursive: true });
  const ctx = await nav.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: W < 800 ? 2 : 1,
    isMobile: W < 800, hasTouch: W < 800 });
  await ctx.route('**', r => {
    const u = r.request().url();
    if (u.includes('/rest/v1/rpc/')) return serveRpc(r);
    return u.startsWith(B) ? r.continue() : r.abort();
  });

  for (const rota of ROTAS) {
    const p = await ctx.newPage();
    const erros = [];
    p.on('pageerror', e => erros.push(String(e).slice(0, 120)));
    try {
      await p.goto(B + rota, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) { medidas.push({ W, rota, falha: 'não abriu: ' + String(e).slice(0, 80) }); total++; await p.close(); continue; }
    /* ESPERA A HIDRATAÇÃO DE VERDADE antes de rolar. `components/Movimento`
       põe `.js-rev` no <html> quando monta; rolar antes disso não revela nada
       (o observador ainda não existe) e a captura sai com títulos e fotos
       "invisíveis" que nenhuma pessoa veria — foi o falso positivo da primeira
       rodada, 5 por página. */
    /* a home põe `.js-rev` na SUA raiz (um div), não no <html>: procura nos dois */
    try { await p.waitForFunction(() => !!document.querySelector('html.js-rev, .js-rev, html.nao-anima, .nao-anima'), null, { timeout: 8000 }); } catch {}
    await p.waitForTimeout(600);
    /* e rola no ritmo de uma pessoa, parando em cada seção */
    await p.evaluate(async () => {
      /* remede a altura a cada passo: as imagens lazy crescem a página enquanto
         se rola, e uma altura medida no começo parava antes do fim de verdade */
      let y = 0;
      while (y < document.documentElement.scrollHeight) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 140)); y += 320; }
      window.scrollTo(0, document.documentElement.scrollHeight); await new Promise(r => setTimeout(r, 500));
      window.scrollTo(0, 0);
    });
    /* espera a revelação ASSENTAR, em vez de um tempo fixo: com sete larguras
       em paralelo, o observador e as transições de 62ms por palavra às vezes
       ainda estão no meio quando 1,5s passam, e a medição acusava título
       invisível que uma pessoa nunca veria (10 falsos positivos na 2ª rodada). */
    /* 15/09: A SEGUNDA CHANCE, QUE É O QUE UMA PESSOA FAZ. Mesmo com a espera
       acima, sobrava um sinal por rodada (1024 /servir/midia; 1440 /como-chegar),
       sempre as cinco palavras do fecho lá embaixo, sempre passando quando a
       rota rodava sozinha. Com três larguras disputando CPU, a varredura passa
       pela seção antes de o observador rodar, e ela fica `.rev` sem `.visto`
       — coisa que nunca acontece com alguém olhando, porque a pessoa PARA na
       seção. Então o medidor faz o mesmo: o que não revelou, ele centra na
       tela e espera. Só é defeito o que continua invisível DEPOIS de estar
       na tela por 1,4s, que é mais do que o failsafe de 1,2s do Movimento. */
    await p.evaluate(async () => {
      for (let volta = 0; volta < 2; volta++) {
        const pend = [...document.querySelectorAll('.rev:not(.visto)')];
        if (!pend.length) break;
        for (const e of pend) { e.scrollIntoView({ block: 'center' }); await new Promise(r => setTimeout(r, 700)); }
      }
      window.scrollTo(0, 0);
    });
    try {
      await p.waitForFunction(() => {
        const pend = [...document.querySelectorAll('.rev:not(.visto)')];
        if (pend.length) return false;
        return [...document.querySelectorAll('.pal')].every(e => parseFloat(getComputedStyle(e).opacity) > 0.95 || e.getBoundingClientRect().width === 0);
      }, null, { timeout: 6000 });
    } catch {}
    await p.waitForTimeout(400);

    const m = await p.evaluate((W) => {
      const vis = e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const rot = e => (e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      const seletor = e => e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '');

      const estouro = document.documentElement.scrollWidth > window.innerWidth + 1;

      const vazando = [];
      for (const e of document.querySelectorAll('body *')) {
        if (!vis(e)) continue;
        const r = e.getBoundingClientRect();
        if (r.right > W + 1 && r.width < W * 3) {  // caixas gigantes de fundo (retículas) são decorativas
          const s = getComputedStyle(e);
          if (s.position === 'fixed' && s.opacity === '0') continue;
          /* o que sai da borda DE PROPÓSITO: foto de herói com sobra (object-fit
             cover), e tudo que vive dentro de um rolo horizontal (a fila de
             cartões, os chips, a sigla em rolagem no desktop). A página em si não
             rola de lado: `estouro` cuida disso. */
          if (e.tagName === 'IMG') continue;
          if (e.closest('.pgs, .fila, .rolo, .rolo-p, .rostos, .chips, .g-pe-cols, [class*="rolo"]')) continue;
          let anc = e.parentElement, dentroDeRolo = false;
          while (anc && anc !== document.body) { const cs = getComputedStyle(anc); if (/(auto|scroll)/.test(cs.overflowX)) { dentroDeRolo = true; break; } anc = anc.parentElement; }
          if (dentroDeRolo) continue;
          vazando.push(`${seletor(e)} direita=${Math.round(r.right)} "${rot(e)}"`);
          if (vazando.length > 6) break;
        }
      }

      const cortado = [];
      for (const e of document.querySelectorAll('a, button, .acao, .g-rot, .g-h1, .g-h2, .g-ed, p, li, span')) {
        if (!vis(e)) continue;
        if (e.closest('.so-leitor')) continue;   // texto só de leitor de tela: caixa de 1px por desenho
        const s = getComputedStyle(e);
        if (s.overflow !== 'hidden' && s.overflowX !== 'hidden' && s.textOverflow !== 'ellipsis') {
          /* também pega texto que passa da própria caixa mesmo sem hidden:
             nowrap num botão de largura limitada */
          if (s.whiteSpace === 'nowrap' && e.scrollWidth > e.clientWidth + 2 && e.clientWidth > 0) {
            cortado.push(`${seletor(e)} texto=${e.scrollWidth} caixa=${e.clientWidth} "${rot(e)}"`);
          }
          continue;
        }
        if (e.scrollWidth > e.clientWidth + 2 && e.clientWidth > 0 && e.children.length === 0) {
          cortado.push(`${seletor(e)} texto=${e.scrollWidth} caixa=${e.clientWidth} "${rot(e)}"`);
        }
        if (cortado.length > 6) break;
      }

      const alvo = [];
      for (const e of document.querySelectorAll('a[href], button, input, select, textarea, [role=button], summary')) {
        if (!vis(e)) continue;
        if (e.type === 'hidden') continue;
        const r = e.getBoundingClientRect();
        /* área tocável real: a caixa OU o padding negativo que a folha usa para
           crescer o alvo sem mexer no layout (inline-block com margin negativa) */
        const alt = Math.max(r.height, parseFloat(getComputedStyle(e).paddingTop) * 2 + r.height * 0);
        if (r.height < 40 && r.width < 40) alvo.push(`${seletor(e)} ${Math.round(r.width)}×${Math.round(r.height)} "${rot(e)}"`);
        /* os links da atribuição do mapa são links dentro de texto corrido, como os
           de um parágrafo: a mesma exceção do WCAG 2.5.8 (15/09: antes eram
           pulados inteiros; agora são medidos como prosa) */
        else if (r.height < 40 && !e.closest('p, li, .g-form-nota, .dim, .pequeno, .g-pe, .leaflet-control-attribution')) alvo.push(`${seletor(e)} ${Math.round(r.width)}×${Math.round(r.height)} "${rot(e)}"`);
        if (alvo.length > 8) break;
      }

      const invisivel = [];
      for (const e of document.querySelectorAll('.pal, .rev, .g-h1, .g-h2')) {
        if (!vis(e)) continue;
        if (parseFloat(getComputedStyle(e).opacity) < 0.05) {
          invisivel.push(`${seletor(e)} "${rot(e)}"`);
          if (invisivel.length > 4) break;
        }
      }

      const fonte = [];
      for (const e of document.querySelectorAll('p, span, a, li, h1, h2, h3, label, button, small')) {
        if (!vis(e)) continue;
        if (!e.textContent.trim()) continue;
        if (e.closest('.so-leitor')) continue;
        const fs = parseFloat(getComputedStyle(e).fontSize);
        /* 11px é o tamanho dos rótulos em caixa alta do sistema (g-rot, g-pe-h,
           fato-r); abaixo de 10.5 é que é defeito */
        if (fs < 10.5 && e.children.length === 0) { fonte.push(`${seletor(e)} ${fs}px "${rot(e)}"`); if (fonte.length > 4) break; }
      }

      const inter = [...document.fonts].some(f => /inter/i.test(f.family) && f.status === 'loaded');
      const h1 = document.querySelectorAll('h1').length;
      return { estouro, vazando, cortado, alvo, invisivel, fonte, inter, h1, altura: document.documentElement.scrollHeight };
    }, W);

    const arq = `/tmp/audit/${W}/${rota === '/' ? 'home' : rota.replace(/^\//, '').replace(/\//g, '__')}.png`;
    try { await p.screenshot({ path: arq, fullPage: true }); } catch {}

    const problemas = (m.estouro ? 1 : 0) + m.vazando.length + m.cortado.length + m.alvo.length + m.invisivel.length + m.fonte.length + (m.inter ? 0 : 1) + (m.h1 === 1 ? 0 : 1) + erros.length;
    total += problemas;
    medidas.push({ W, nome, rota, arq, altura: m.altura, estouro: m.estouro, vazando: m.vazando, cortado: m.cortado,
      alvo: m.alvo, invisivel: m.invisivel, fonte: m.fonte, inter: m.inter, h1: m.h1, erros, problemas });

    const marca = problemas ? 'MAL' : 'ok ';
    console.log(`${marca} ${String(W).padStart(4)} ${rota.padEnd(28)} alt=${String(m.altura).padStart(5)}${m.estouro ? ' ESTOURO' : ''}${m.vazando.length ? ` vazando=${m.vazando.length}` : ''}${m.cortado.length ? ` cortado=${m.cortado.length}` : ''}${m.alvo.length ? ` alvo=${m.alvo.length}` : ''}${m.invisivel.length ? ` INVISIVEL=${m.invisivel.length}` : ''}${m.fonte.length ? ` fonte=${m.fonte.length}` : ''}${m.inter ? '' : ' SEM-INTER'}${m.h1 !== 1 ? ` h1=${m.h1}` : ''}${erros.length ? ` erros=${erros.length}` : ''}`);
    await p.close();
  }
  await ctx.close();
}
/* três larguras por vez, não sete: com sete, a CPU do container deixava a
   revelação por palavra (62ms por palavra + transição) para trás e a medição
   acusava título invisível que, sozinho, revela 6 de 6 vezes. Três é o ponto
   em que a rodada ainda cabe em ~4 minutos sem inventar defeito. */
for (let i = 0; i < APARELHOS.length; i += 3) await Promise.all(APARELHOS.slice(i, i + 3).map(umaLargura));
await nav.close();
medidas.sort((a, b) => a.W - b.W || ROTAS.indexOf(a.rota) - ROTAS.indexOf(b.rota));
writeFileSync('/tmp/audit/medidas.json', JSON.stringify(medidas, null, 1));
console.log(`\nTOTAL DE PROBLEMAS: ${total}  (${medidas.length} telas)`);
process.exit(total ? 1 : 0);
