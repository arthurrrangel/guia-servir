#!/usr/bin/env node
/* =============================================================================
   AS FONTES DA MARCA ENTRAM NO BUILD, NUNCA NO REPOSITÓRIO

   O manual da marca usa PP Neue Montreal e PP Editorial New, da Pangram
   Pangram. São licenciadas, e o EULA deles proíbe, com todas as letras,
   "uploading the Font to a public internet file transfer or storing
   channel". Este repositório é público. Logo: os .woff2 licenciados NÃO
   PODEM existir aqui — nem commitados, nem em branch, nem em histórico.

   O que pode: a Vercel buscar os arquivos de uma ORIGEM PRIVADA na hora do
   build e servi-los pelo próprio domínio guiaservir.com, que é o que a Web
   License cobre ("for each individual domain or subdomain on which the Font
   is embedded"). Este script é essa busca.

   COMO FUNCIONA
   · Lê duas variáveis de ambiente (configuradas no painel da Vercel, nunca
     em arquivo): FONTES_ORIGEM, a URL-base de um repositório PRIVADO com os
     três .woff2, e FONTES_TOKEN, um token de leitura só daquele repositório.
   · Baixa os três arquivos para public/fontes/ (pasta ignorada pelo git).
   · Escreve public/fontes/marca.css com os @font-face, e um manifest.json
     que o layout usa para emitir os <link rel=preload> certos.
   · Se as variáveis não existirem, NÃO FALHA: escreve um marca.css vazio e
     o site cai na pilha de fallback do CSS. Build quebrado por fonte ausente
     seria a igreja sem site por causa de tipografia — o custo errado.

   INTEGRIDADE
   Se a origem tiver um fontes.sha256 (formato do `shasum -a 256`), cada
   arquivo é conferido contra ele. Arquivo que não bate é descartado: melhor
   cair no fallback do que servir um binário que não é o que se pensa.
   ============================================================================= */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DESTINO = join(process.cwd(), 'public', 'fontes');
const ORIGEM = (process.env.FONTES_ORIGEM || '').replace(/\/+$/, '');
const TOKEN = process.env.FONTES_TOKEN || '';

/* As três faces do manual. O nome do arquivo é contrato: é assim que eles
   precisam se chamar na origem privada. */
const FACES = [
  { arquivo: 'pp-neue-montreal-book.woff2',
    familia: 'PP Neue Montreal', peso: 400, estilo: 'normal' },
  { arquivo: 'pp-neue-montreal-bold.woff2',
    familia: 'PP Neue Montreal', peso: 700, estilo: 'normal' },
  { arquivo: 'pp-editorial-new-ultralight-italic.woff2',
    familia: 'PP Editorial New', peso: 200, estilo: 'italic' },
];

mkdirSync(DESTINO, { recursive: true });

function css(presentes) {
  if (!presentes.length) {
    return '/* fontes da marca não configuradas neste build — ver scripts/fontes.mjs */\n';
  }
  return presentes.map(f => `@font-face{
  font-family:"${f.familia}";
  font-style:${f.estilo};
  font-weight:${f.peso};
  font-display:swap;
  src:url("/fontes/${f.arquivo}") format("woff2");
}`).join('\n') + '\n';
}

function grava(presentes) {
  writeFileSync(join(DESTINO, 'marca.css'), css(presentes));
  writeFileSync(join(DESTINO, 'manifest.json'),
    JSON.stringify({ geradoEm: new Date().toISOString(), fontes: presentes.map(f => f.arquivo) }, null, 2));
}

async function baixa(caminho) {
  const r = await fetch(`${ORIGEM}/${caminho}`, {
    headers: TOKEN ? { Authorization: `Bearer ${TOKEN}`, Accept: 'application/octet-stream' } : {},
  });
  if (!r.ok) throw new Error(`${r.status} em ${caminho}`);
  return Buffer.from(await r.arrayBuffer());
}

async function principal() {
  if (!ORIGEM) {
    console.log('[fontes] FONTES_ORIGEM não definida — o build segue com a pilha de fallback.');
    grava([]);
    return;
  }

  /* somas opcionais */
  let somas = null;
  try {
    const txt = (await baixa('fontes.sha256')).toString('utf8');
    somas = Object.fromEntries(
      txt.split('\n').map(l => l.trim()).filter(Boolean)
        .map(l => { const [h, ...n] = l.split(/\s+\*?/); return [n.join(' ').trim(), h.toLowerCase()]; }),
    );
    console.log('[fontes] fontes.sha256 encontrado — integridade será conferida.');
  } catch { /* sem somas: segue sem conferir */ }

  const presentes = [];
  for (const f of FACES) {
    try {
      const bytes = await baixa(f.arquivo);
      /* woff2 começa com "wOF2". Qualquer outra coisa (uma página HTML de
         erro, por exemplo) não é fonte, e não vai para o disco. */
      if (bytes.subarray(0, 4).toString('ascii') !== 'wOF2') {
        console.warn(`[fontes] ${f.arquivo}: não é woff2 (${bytes.length} bytes) — ignorado.`);
        continue;
      }
      if (somas && somas[f.arquivo]) {
        const h = createHash('sha256').update(bytes).digest('hex');
        if (h !== somas[f.arquivo]) {
          console.warn(`[fontes] ${f.arquivo}: sha256 não bate — ignorado.`);
          continue;
        }
      }
      writeFileSync(join(DESTINO, f.arquivo), bytes);
      presentes.push(f);
      console.log(`[fontes] ${f.arquivo} · ${(bytes.length / 1024).toFixed(1)} kB`);
    } catch (e) {
      console.warn(`[fontes] ${f.arquivo}: ${e.message} — ignorado.`);
    }
  }

  grava(presentes);
  console.log(`[fontes] ${presentes.length} de ${FACES.length} faces prontas.`);
}

principal().catch(e => {
  /* nunca derruba o build: fonte é acabamento, não estrutura */
  console.warn('[fontes] falhou:', e.message, '— seguindo com fallback.');
  if (!existsSync(join(DESTINO, 'marca.css'))) grava([]);
});
