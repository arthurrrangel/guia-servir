/* O QR CODE DO PAREAMENTO, LEGÍVEL EM QUALQUER TERMINAL · 26/10/2026.

   O desenho pequeno do qrcode-terminal supõe terminal de fundo escuro. No
   Terminal do Mac (fundo branco), ele sai com as cores trocadas, e a câmera
   do WhatsApp pode não ler. Aqui o QR sai com as cores fixas (preto sobre
   branco) no terminal e também numa página que abre no navegador, grande, e
   se atualiza sozinha quando o WhatsApp troca o QR (a cada ~20 segundos).

   As funções de desenho são puras (testes/regras.test.mjs); só `matriz`
   usa a biblioteca. */

import { createRequire } from 'node:module';

/* o QR como matriz: matriz[linha][coluna] = true quando o módulo é escuro */
export function matriz(texto) {
  const require = createRequire(import.meta.url);
  const QRCode = require('qrcode-terminal/vendor/QRCode');
  const Nivel = require('qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel');
  const q = new QRCode(-1, Nivel.L);
  q.addData(texto);
  q.make();
  return q.modules.map((linha) => linha.map(Boolean));
}

/* no terminal: duas linhas de módulos por linha de texto, com as cores
   escritas (preto sobre branco), e a margem branca que a câmera precisa */
export function paraTerminal(m, margem = 2) {
  const n = m.length;
  const escuro = (l, c) => l >= 0 && l < n && c >= 0 && c < n && !!m[l][c];
  const linhas = [];
  for (let l = -margem; l < n + margem; l += 2) {
    let s = '';
    for (let c = -margem; c < n + margem; c++) {
      const cima = escuro(l, c);
      const baixo = escuro(l + 1, c);
      s += cima && baixo ? '█' : cima ? '▀' : baixo ? '▄' : ' ';
    }
    linhas.push(`\x1b[30;47m${s}\x1b[0m`);
  }
  return linhas.join('\n');
}

/* no navegador: SVG grande, com margem, e a página relendo o arquivo a cada
   4 segundos para pegar o QR novo */
export function paraPagina(m, { escala = 10, margem = 4 } = {}) {
  const n = m.length;
  const lado = (n + margem * 2) * escala;
  const caminho = [];
  for (let l = 0; l < n; l++) {
    for (let c = 0; c < n; c++) {
      if (m[l][c]) caminho.push(`M${(c + margem) * escala} ${(l + margem) * escala}h${escala}v${escala}h-${escala}z`);
    }
  }
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta http-equiv="refresh" content="4">
<title>Parear o robô do WhatsApp</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fff;color:#111;font:16px -apple-system,system-ui,sans-serif;text-align:center}
p{max-width:34em;margin:1em auto;line-height:1.4}svg{width:min(80vmin,560px);height:auto}</style></head><body><main>
<p><b>Celular da igreja</b> (+55 21 97297-6946): WhatsApp Business &gt; Configurações &gt; Dispositivos conectados &gt; Conectar dispositivo. Aponte a câmera para o código.</p>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}" role="img" aria-label="QR code para conectar o robô ao WhatsApp da igreja"><rect width="${lado}" height="${lado}" fill="#fff"/><path fill="#000" d="${caminho.join('')}"/></svg>
<p>O código troca sozinho a cada 20 segundos. Esta página se atualiza sozinha.</p>
</main></body></html>
`;
}
