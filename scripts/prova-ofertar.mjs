/* PROVA · /ofertar do começo ao fim, no navegador, contra o servidor de produção local.

   Por que existe, e por que não é teste de unidade: `scripts/pix.test.mjs` já
   prova que o BR Code é montado certo. O que ele NÃO alcança é o caminho que a
   pessoa faz — escolher o tipo, digitar centavo por centavo, tocar em Pix,
   voltar, mudar o valor. É aí que mora o erro que custa oferta: um código na
   tela que não corresponde ao valor que a pessoa acha que está dando.

   Cada asserção abaixo é uma coisa que já deu errado em alguma versão desta
   tela ou que daria errado calado.

     PORTA=3800 CHROMIUM=/opt/pw-browsers/chromium node scripts/prova-ofertar.mjs

   Precisa do servidor no ar com NEXT_PUBLIC_PIX_CHAVE definida.              */
import { chromium } from 'playwright';

const BASE = `http://localhost:${process.env.PORTA || 3000}`;
const CHROME = process.env.CHROMIUM || undefined;

let mal = 0;
const ok = (cond, queixa) => { if (!cond) { mal++; console.error(`  MAL  ${queixa}`); } };

/* o mesmo CRC por tabela que scripts/pix.test.mjs usa como referência externa:
   aqui ele confere o código que SAIU DA TELA, não o que a função devolveu */
const TAB = [];
for (let i = 0; i < 256; i++) {
  let c = i << 8;
  for (let b = 0; b < 8; b++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
  TAB.push(c);
}
const crc16 = s => {
  let crc = 0xffff;
  for (const ch of Buffer.from(s, 'utf8')) crc = ((crc << 8) & 0xffff) ^ TAB[((crc >> 8) ^ ch) & 0xff];
  return crc.toString(16).toUpperCase().padStart(4, '0');
};
const campos = cod => {
  const fora = {};
  for (let i = 0; i + 4 <= cod.length;) {
    const id = cod.slice(i, i + 2), n = parseInt(cod.slice(i + 2, i + 4), 10);
    fora[id] = cod.slice(i + 4, i + 4 + n);
    i += 4 + n;
  }
  return fora;
};

const nav = await chromium.launch({ executablePath: CHROME });
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
/* a área de transferência precisa de permissão, senão `copiar()` cai sempre no
   caminho de erro e o teste do botão não prova nada */
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
const p = await ctx.newPage();

const erros = [];
p.on('pageerror', e => erros.push(String(e)));

await p.goto(`${BASE}/ofertar`, { waitUntil: 'networkidle' });

/* ------------------------------------------------ 1. o que falta é dito ---
   Um botão apagado não explica o que falta. A tela tem que falar. */
console.log('1. sem escolher nada');
await p.getByRole('button', { name: /^Pix$/ }).click();
ok(await p.locator('.g-form-erro').isVisible(), 'sem tipo: nenhum aviso apareceu');
ok(/dízimo e oferta/i.test(await p.locator('.g-form-erro').innerText()),
   'sem tipo: o aviso não diz o que fazer');

console.log('2. tipo escolhido, valor zero');
await p.getByRole('button', { name: /Dízimo/ }).click();
await p.getByRole('button', { name: /^Pix$/ }).click();
ok(/mínimo/i.test(await p.locator('.g-form-erro').innerText()), 'valor 0: o aviso não fala do mínimo');
ok(await p.locator('.of-valor-in').evaluate(e => e === document.activeElement),
   'valor 0: o foco não foi para o campo do valor');

console.log('3. acima do teto');
await p.locator('.of-valor-in').fill('99999999');   // R$ 999.999,99
await p.getByRole('button', { name: /^Pix$/ }).click();
ok(/tesouraria/i.test(await p.locator('.g-form-erro').innerText()),
   'valor absurdo: o aviso não manda falar com a tesouraria');

/* ------------------------------------------- 4. o valor que a pessoa vê ---
   O número grande da tela e o número dentro do código Pix têm que ser o
   mesmo. Se divergirem, a pessoa dá um valor e o banco cobra outro. */
console.log('4. dízimo de R$ 350,75');
await p.locator('.of-valor-in').fill('35075');
ok((await p.locator('.of-valor-cx').innerText()).includes('350,75'),
   `a tela mostra ${await p.locator('.of-valor-cx').innerText()}, esperado R$ 350,75`);
await p.getByRole('button', { name: /^Pix$/ }).click();
await p.waitForSelector('#of-codigo');

const cod = await p.locator('#of-codigo').innerText();
const c = campos(cod);
ok(c['54'] === '350.75', `campo 54 saiu ${c['54']}, esperado 350.75`);
ok(crc16(cod.slice(0, -4)) === cod.slice(-4), `CRC da tela não fecha: ${cod.slice(-4)}`);
ok(c['62'].slice(4).startsWith('GUIAD'), `txid de dízimo saiu ${c['62'].slice(4)}, devia começar com GUIAD`);
ok(c['59'].length <= 25 && c['60'].length <= 15, 'nome ou cidade passaram do limite do padrão');

/* --------------------------------------------------- 5. o QR é o código ---
   O QR e o texto copiado saem da mesma variável; se um dia deixarem de sair,
   quem escaneia paga uma coisa e quem cola paga outra. */
console.log('5. o QR está na tela e o código é copiável');
ok(await p.locator('.of-qr').isVisible(), 'o QR não apareceu');
await p.getByRole('button', { name: /Copiar código Pix/ }).click();
await p.waitForTimeout(200);
const naArea = await p.evaluate(() => navigator.clipboard.readText());
ok(naArea === cod, 'o que foi para a área de transferência não é o código da tela');
ok(/copiado/i.test(await p.locator('.of-copiar').innerText()), 'o botão não confirmou a cópia');

/* -------------------------------------------------- 6. voltar não perde ---
   Quem errou o valor volta, corrige e segue. Se a volta apagar o que foi
   digitado, a pessoa digita tudo de novo no escuro. */
console.log('6. voltar e mudar o valor');
await p.getByRole('button', { name: /Voltar e mudar o valor/ }).click();
ok(await p.locator('.of-valor-in').inputValue() === '35075', 'voltar apagou o valor digitado');
ok(await p.getByRole('button', { name: /Dízimo/ }).getAttribute('aria-pressed') === 'true',
   'voltar apagou o tipo escolhido');

/* ------------------------------------------------------- 7. oferta ≠ dízimo */
console.log('7. oferta gera txid de oferta');
await p.getByRole('button', { name: /Oferta/ }).click();
await p.locator('.of-valor-in').fill('2000');
await p.getByRole('button', { name: /^Pix$/ }).click();
await p.waitForSelector('#of-codigo');
const c2 = campos(await p.locator('#of-codigo').innerText());
ok(c2['54'] === '20.00', `oferta de R$20 saiu como ${c2['54']}`);
ok(c2['62'].slice(4).startsWith('GUIAO'), `txid de oferta saiu ${c2['62'].slice(4)}, devia começar com GUIAO`);

/* dois códigos seguidos não podem ter o mesmo txid, senão a conciliação junta
   duas ofertas de pessoas diferentes na mesma linha */
ok(c2['62'] !== c['62'], 'dois códigos seguidos saíram com o mesmo txid');

/* ------------------------------------------------------------ 8. o fim --- */
console.log('8. a tela de depois');
await p.getByRole('button', { name: /Já ofertei/ }).click();
await p.waitForTimeout(400);
ok(/Recebemos/i.test(await p.locator('.of-fim').innerText()), 'a tela de fim não confirmou');
ok(await p.locator('.of-causa').isVisible(), 'o campo de oração não apareceu');
/* o aviso de privacidade tem que ser LEGÍVEL, não um rótulo em caixa alta:
   `label{}` da folha global já transformou este texto em caixa alta uma vez */
const tr = await p.locator('.of-oracao .g-form-nota').evaluate(e => getComputedStyle(e).textTransform);
ok(tr === 'none', `o aviso de privacidade saiu com text-transform:${tr}`);
/* e o campo não pode ser obrigatório: quem não quer pedir oração sai por aqui */
ok(await p.getByRole('link', { name: /Voltar para o início/ }).isVisible(),
   'sem escrever nada, não há saída da tela de fim');

/* ---------------------------------------------------------- 9. o console --- */
ok(erros.length === 0, `erros de página: ${erros.join(' | ')}`);

await nav.close();
if (mal) { console.error(`\nprova-ofertar: ${mal} falharam`); process.exit(1); }
console.log('\nprova-ofertar: tudo passou');
