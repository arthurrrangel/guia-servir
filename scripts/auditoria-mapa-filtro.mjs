/* O MAPA DAS PEQUENAS GUIAS SEGUE O FILTRO? (22/10/2026)
   O filtro escreve o dia no endereço (/pequena-guia?dia=qua), para o link ser
   compartilhável; quem abre esse link (ou recarrega) chega com o dia. O filtro
   mudava a lista enquanto o Leaflet ainda carregava, e o mapa nascia com os dez
   grupos da primeira lista ao lado de quatro cartões
   (components/MapaGuias.tsx, desenharAtual). Esta auditoria abre a página com
   cada ?dia= e também troca o filtro por clique logo na abertura, e compara os
   grupos nos pinos com os cartões visíveis que têm ponto no mapa (no filtro sem
   grupo com endereço, o "Online", o mapa e o "perto de mim" não aparecem). E o
   "Achar o mais perto de mim" vindo de um dia: filtro, endereço, cartão aceso e
   pino.
   Requer o servidor: PORTA=3800 node scripts/auditoria-mapa-filtro.mjs
   Sai com 1 se algum caso divergir. */
import { chromium } from 'playwright';
import { rotear } from './_rpc-mock.mjs';
const B = `http://localhost:${process.env.PORTA || 3700}`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let ruins = 0;
const contar = p => p.evaluate(() => {
  const vis = [...document.querySelectorAll('.pgs > .pg')].filter(e => getComputedStyle(e).display !== 'none');
  const cartoes = vis.map(e => e.querySelector('.pg-nome')?.textContent?.trim());
  /* no mapa só entra grupo com ponto: o cartão dele tem "Ir de Waze" ou "Ver a região" (os online não têm) */
  const noMapa = vis.filter(e => e.querySelector('.g-link')).length;
  const pinos = [...document.querySelectorAll('.leaflet-marker-icon')];
  const nums = pinos.map(e => +(e.querySelector('.pin-guia-n')?.textContent || (e.classList.contains('pin-igreja') ? 0 : 1)));
  const titulos = pinos.map(e => e.getAttribute('title'));
  return { cartoes, noMapa, pinos: pinos.length, gruposNosPinos: nums.reduce((a, n) => a + n, 0), titulos };
});
for (const dia of ['', 'ter', 'qua', 'qui', 'online']) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route('**', r => rotear(r, B));
  const p = await ctx.newPage();
  await p.goto(`${B}/pequena-guia${dia ? '?dia=' + dia : ''}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  /* sem grupo com endereço no filtro (o "Online"), o mapa e o "perto de mim" saem (22/10/2026) */
  const temMapa = await p.evaluate(() => !!document.querySelector('.pg-mapao'));
  if (temMapa) await p.waitForSelector('.leaflet-marker-icon', { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(600);
  const r = await contar(p);
  const temPerto = await p.evaluate(() => !!document.querySelector('.pg-perto'));
  const semPonto = !temMapa && !temPerto;
  const ok = r.noMapa === 0 ? semPonto : temMapa && temPerto && r.gruposNosPinos === r.noMapa;
  if (!ok) ruins++;
  console.log(`${ok ? 'ok ' : 'MAL'} url ?dia=${dia || '(todos)'}: ${r.cartoes.length} cartões (${r.noMapa} com ponto no mapa), ${temMapa ? `${r.pinos} pinos com ${r.gruposNosPinos} grupos` : 'sem mapa'}${temPerto ? '' : ', sem o "perto de mim"'}`);
  await ctx.close();
}
/* o clique antes do Leaflet: abre sem filtro e clica em "Terça" assim que o botão existe */
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route('**', r => rotear(r, B));
  const p = await ctx.newPage();
  await p.goto(`${B}/pequena-guia`, { waitUntil: 'commit' });
  await p.waitForSelector('.pg-chip', { timeout: 15000 });
  const ja = await p.evaluate(() => document.querySelectorAll('.leaflet-marker-icon').length);
  await p.locator('.pg-chip', { hasText: 'Terça' }).click();
  await p.waitForLoadState('networkidle');
  await p.waitForTimeout(800);
  const r = await contar(p);
  const ok = r.gruposNosPinos === r.noMapa;
  if (!ok) ruins++;
  console.log(`${ok ? 'ok ' : 'MAL'} clique em Terça (pinos já na tela no clique: ${ja}): ${r.cartoes.length} cartões (${r.noMapa} com ponto no mapa), ${r.pinos} pinos com ${r.gruposNosPinos} grupos`);
  await ctx.close();
}
/* "Achar o mais perto de mim" vindo da terça (posição simulada perto da igreja):
   o filtro volta para "Todos" e o endereço perde o ?dia= (recarregar não volta à
   terça), o cartão do mais perto acende e o pino "você" aparece no mapa */
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, geolocation: { latitude: -23.0105, longitude: -43.4238 }, permissions: ['geolocation'], reducedMotion: 'reduce' });
  await ctx.route('**', r => rotear(r, B));
  const p = await ctx.newPage();
  await p.goto(`${B}/pequena-guia?dia=ter`, { waitUntil: 'networkidle' });
  await p.waitForSelector('.leaflet-marker-icon', { timeout: 15000 }).catch(() => {});
  await p.locator('.pg-perto button').click();
  await p.waitForTimeout(1200);
  const r = await p.evaluate(() => ({
    url: location.search,
    todos: document.querySelector('.pg-chip[aria-pressed="true"]')?.textContent?.trim() || '',
    achado: document.querySelector('.pg-perto-txt b')?.textContent?.trim() || '',
    aceso: document.querySelector('.pgs > .pg.aceso .pg-nome')?.textContent?.trim() || '',
    voce: document.querySelectorAll('.pin-pessoa').length,
    cartoes: [...document.querySelectorAll('.pgs > .pg')].filter(e => getComputedStyle(e).display !== 'none').length,
  }));
  const ok = r.url === '' && r.todos.startsWith('Todos') && r.achado && r.achado === r.aceso && r.voce === 1 && r.cartoes === 12;
  if (!ok) ruins++;
  console.log(`${ok ? 'ok ' : 'MAL'} mais perto vindo da terça: endereço "${r.url || '(sem ?dia)'}", filtro "${r.todos}", ${r.cartoes} cartões, mais perto "${r.achado}", aceso "${r.aceso}", pino você ${r.voce}`);
  await ctx.close();
}
await b.close();
console.log(ruins ? `${ruins} caso(s) com o mapa fora do filtro` : 'o mapa segue o filtro em todos os casos');
process.exit(ruins ? 1 : 0);
