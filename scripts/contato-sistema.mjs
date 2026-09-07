/* =============================================================================
   FOLHA DE CONTATO DO SISTEMA, NO CELULAR

   Captura cada tela do líder e do voluntário em 390px, de cima a baixo, e
   monta uma prancha só com todas lado a lado, reduzidas. O que se caça aqui
   não é detalhe: é RITMO. Se dez telas têm dez cabeçalhos diferentes, dez
   jeitos de listar e dez jeitos de agir, isso salta numa prancha e some em
   dez capturas vistas uma de cada vez. Sai também o número de "telas de
   celular" que cada uma ocupa, que é a medida mais honesta de peso.

     PORTA=3700 node scripts/contato-sistema.mjs          -> prancha em /tmp/contato-sistema.png
     PORTA=3700 node scripts/contato-sistema.mjs painel   -> só essa, em tamanho real
============================================================================= */
import { chromium } from 'playwright';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const B = `http://localhost:${process.env.PORTA || 3000}`;
const W = +(process.env.W || 390);
const TELAS = process.argv.slice(2).length ? process.argv.slice(2) : [
  'painel', 'painel/candidaturas', 'escala', 'time', 'time/conferir',
  'ajustes', 'ajustes/ministerios', 'eu/x', 'entrar', 'acessar',
];

async function serveRpc(route) {
  const req = route.request(), u = req.url();
  const fn = u.split('/rpc/')[1]?.split('?')[0];
  let slug = ''; try { slug = (JSON.parse(req.postData() || '{}').p_slug) || ''; } catch {}
  for (const nome of [slug ? `${fn}__${slug}` : null, fn]) {
    if (!nome) continue;
    const f = `/tmp/rpc/${nome}.json`;
    if (existsSync(f)) return route.fulfill({ status: 200, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' }, body: readFileSync(f, 'utf8') });
  }
  return route.fulfill({ status: 200, contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' }, body: '[]' });
}

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: W, height: 844 }, deviceScaleFactor: 1 });
await ctx.route('**', r => {
  const u = r.request().url();
  if (u.includes('/rest/v1/rpc/')) return serveRpc(r);
  return u.startsWith(B) ? r.continue() : r.abort();
});
const arquivos = [];
for (const tela of TELAS) {
  const p = await ctx.newPage();
  const sep = tela.includes('?') ? '&' : '?';
  try { await p.goto(`${B}/${tela}${sep}demo=1`, { waitUntil: 'domcontentloaded', timeout: 25000 }); } catch {}
  await p.waitForTimeout(2400);
  await p.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 300) {
      window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120));
    }
    window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 400));
  });
  const nome = tela.replace(/[\/?=&]/g, '_') || 'home';
  const f = `/tmp/cs-${nome}.png`;
  await p.screenshot({ path: f, fullPage: true });
  const h = await p.evaluate(() => document.body.scrollHeight);
  const sw = await p.evaluate(() => document.documentElement.scrollWidth);
  console.log(`${tela.padEnd(22)} ${String(h).padStart(5)}px  ${(h / 844).toFixed(1)} telas${sw > W ? `  ESTOURO scrollW=${sw}` : ''}`);
  arquivos.push([tela, f, h]);
  await p.close();
}
await b.close();

if (TELAS.length > 1) {
  /* a prancha: cada tela reduzida, lado a lado, cortada em 2600px reais para
     a prancha caber numa olhada. O que passar disso é peso, e o número acima
     já contou. */
  const py = `
from PIL import Image, ImageDraw
import json
itens = json.loads('''${JSON.stringify(arquivos)}''')
ESC = 0.36; CORTE = 2600; PAD = 14; ROT = 22
cols = len(itens)
larg = int(${W} * ESC)
altura = int(CORTE * ESC) + ROT
prancha = Image.new('RGB', (cols * (larg + PAD) + PAD, altura + PAD * 2), (236, 233, 226))
d = ImageDraw.Draw(prancha)
for i, (tela, f, h) in enumerate(itens):
    im = Image.open(f).convert('RGB')
    im = im.crop((0, 0, im.width, min(im.height, CORTE)))
    im = im.resize((larg, int(im.height * ESC)))
    x = PAD + i * (larg + PAD); y = PAD + ROT
    prancha.paste(im, (x, y))
    d.rectangle([x - 1, y - 1, x + larg, y + im.height], outline=(120, 120, 120))
    d.text((x, PAD + 4), f"/{tela}  {h}px", fill=(40, 40, 40))
prancha.save('/tmp/contato-sistema.png')
print('prancha /tmp/contato-sistema.png', prancha.size)
`;
  writeFileSync('/tmp/_prancha.py', py);
  console.log(execSync('python3 /tmp/_prancha.py').toString().trim());
}
