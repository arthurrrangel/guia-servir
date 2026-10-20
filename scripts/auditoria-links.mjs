/* AUDITORIA · Rastreio dos links do site público: internos 200 (404 só onde é 404), âncoras existem no destino, externos com _blank + noreferrer, controles com nome.
   Requer o dev server: PORTA=3700 node scripts/auditoria-links.mjs  (ver claude/site-v4-volta-ao-modelo-startup-08-09-2026.md no Project) */
import { chromium } from 'playwright';
import { rotear } from './_rpc-mock.mjs';
import { readFileSync, existsSync } from 'node:fs';
const B = `http://localhost:${process.env.PORTA || 3700}`;
const INICIO = ['/', '/cultos', '/como-chegar', '/eventos', '/pequena-guia', '/sobre', '/ofertar', '/privacidade', '/servir', '/servir/midia', '/servir/louvor', '/servir/kids', '/servir/servico', '/servir/livraria', '/servir/onde-me-encaixo', '/acessar', '/follow', '/servir/midia/cadastro'];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.route('**', r => rotear(r, B));
const vistos = new Map(); const fila = [...INICIO]; const problemas = []; const externos = new Set();
const anchors = new Map(); // rota -> Set(ids)
async function carregar(rota) {
  const p = await ctx.newPage(); const resp = await p.goto(B + rota, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500);
  const status = resp?.status();
  const info = await p.evaluate(() => ({
    ids: [...document.querySelectorAll('[id]')].map(e => e.id),
    links: [...document.querySelectorAll('a[href]')].map(a => ({ href: a.getAttribute('href'), texto: (a.textContent || a.getAttribute('aria-label') || '').trim().slice(0, 40), target: a.getAttribute('target'), rel: a.getAttribute('rel') })),
    semNome: [...document.querySelectorAll('a,button')].filter(e => !(e.textContent || '').trim() && !e.getAttribute('aria-label') && !e.querySelector('img[alt]:not([alt=""])') && !e.querySelector('svg[aria-label]') && !e.querySelector('[role=img]') && !e.querySelector('title')).map(e => e.outerHTML.slice(0, 80)),
    titulo: document.title,
  }));
  await p.close();
  return { status, ...info };
}
while (fila.length) {
  const rota = fila.shift(); if (vistos.has(rota)) continue;
  const r = await carregar(rota); vistos.set(rota, r); anchors.set(rota.split('#')[0].split('?')[0], new Set(r.ids));
  if (rota !== '/rota-que-nao-existe' && r.status !== 200) problemas.push(`${rota}: status ${r.status}`);
  if (rota === '/rota-que-nao-existe' && r.status !== 404) problemas.push(`${rota}: status ${r.status} (esperado 404)`);
  for (const s of r.semNome) problemas.push(`${rota}: controle sem nome ${s}`);
  for (const l of r.links) {
    if (!l.href) continue;
    if (/^(mailto:|tel:)/.test(l.href)) continue;
    if (/^https?:/.test(l.href)) { externos.add(l.href); if (l.target !== '_blank' || !/noreferrer|noopener/.test(l.rel || '')) problemas.push(`${rota}: externo sem _blank/noreferrer: ${l.href} (${l.texto})`); continue; }
    const [caminho, hash] = l.href.split('#');
    const alvo = (caminho || rota.split('#')[0].split('?')[0]).split('?')[0];
    if (!vistos.has(alvo) && !fila.includes(alvo)) fila.push(alvo);
    if (hash) problemas.push({ pend: true, rota, alvo, hash, texto: l.texto });
  }
}
// âncoras: resolver depois que todas as páginas carregaram
const finais = [];
for (const pr of problemas) {
  if (typeof pr === 'string') { finais.push(pr); continue; }
  const ids = anchors.get(pr.alvo);
  if (!ids) { finais.push(`${pr.rota}: âncora #${pr.hash} em ${pr.alvo} (página não carregada)`); continue; }
  if (!ids.has(pr.hash)) finais.push(`${pr.rota}: âncora #${pr.hash} NÃO EXISTE em ${pr.alvo} ("${pr.texto}")`);
}
console.log('páginas visitadas:', vistos.size);
for (const [rota, r] of vistos) console.log(' ', r.status, rota, '·', r.titulo.slice(0, 50));
console.log('externos:', [...externos].join('\n  '));
console.log('PROBLEMAS:', finais.length); for (const f of finais) console.log('  -', f);
await b.close();
