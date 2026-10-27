/* /api/dress-code/gerar · A IMAGEM DE INSPIRAÇÃO GERADA POR IA · 116, 26/10/2026.

   O corpo está em lib/dress-code-ia.ts (testado sem o Next). Aqui só a
   ligação com o mundo:
     · o banco como o líder que chamou (o JWT dele) e com a chave do servidor;
     · o gerador: o AI Gateway da Vercel, pelo AI SDK, com o modelo
       openai/gpt-image-1-mini. Na Vercel a autenticação é o token OIDC do
       próprio projeto (sem chave nova); o custo sai dos créditos do gateway.
     · DRESS_CODE_IA_FALSA=1 (só na prova de ponta a ponta, nunca na Vercel):
       um gerador de mentira que devolve uma imagem lisa, sem rede. */
import { randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { createClient } from '@supabase/supabase-js';
import { generateImage } from 'ai';
import { atenderGeracao, type Gerado } from '@/lib/dress-code-ia';
import { projetoDoSupabase } from '@/lib/supabase-chaves';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MODELO = 'openai/gpt-image-1-mini';

function comoQuemChamou(jwt: string) {
  const { url, key } = projetoDoSupabase();
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}
function doServidor() {
  const { url } = projetoDoSupabase();
  const chave = process.env.SUPABASE_SERVICE_ROLE || '';
  return chave ? createClient(url, chave, { auth: { persistSession: false } }) : null;
}

async function gerarDeVerdade(prompt: string, sinal: AbortSignal): Promise<Gerado> {
  /* WebP de qualidade média: leve no celular de quem vê. Se o gateway não
     aceitar as opções do modelo, tenta uma vez sem elas (sai PNG) */
  try {
    const r = await generateImage({
      model: MODELO, prompt, n: 1, size: '1024x1536', abortSignal: sinal, maxRetries: 1,
      providerOptions: { openai: { quality: 'medium', output_format: 'webp', output_compression: 82 } },
    });
    return { bytes: r.image.uint8Array, tipo: r.image.mediaType };
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    if (sinal.aborted || /moderation|safety|content.?policy|blocked/i.test(msg)) throw e;
    const r = await generateImage({ model: MODELO, prompt, n: 1, size: '1024x1536', abortSignal: sinal, maxRetries: 0 });
    return { bytes: r.image.uint8Array, tipo: r.image.mediaType };
  }
}

/* ---------------------------------------- o gerador de mentira (só a prova) */
const TABELA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = TABELA_CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function bloco(tipo: string, dados: Buffer) {
  const t = Buffer.from(tipo, 'ascii');
  const tam = Buffer.alloc(4); tam.writeUInt32BE(dados.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, dados])));
  return Buffer.concat([tam, t, dados, crc]);
}
async function gerarDeMentira(prompt: string): Promise<Gerado> {
  const hex = /#([0-9a-f]{6})/.exec(prompt)?.[1] || '808080';
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
  const w = 64, h = 96;
  const linha = Buffer.alloc(1 + w * 3);
  for (let x = 0; x < w; x++) { linha[1 + x * 3] = r; linha[2 + x * 3] = g; linha[3 + x * 3] = b; }
  const cru = Buffer.concat(Array.from({ length: h }, () => linha));
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), bloco('IHDR', ihdr), bloco('IDAT', deflateSync(cru)), bloco('IEND', Buffer.alloc(0))]);
  return { bytes: new Uint8Array(png), tipo: 'image/png' };
}

export async function POST(req: Request) {
  const falsa = process.env.DRESS_CODE_IA_FALSA === '1' && process.env.VERCEL !== '1';
  return atenderGeracao(req, {
    comoQuemChamou, doServidor, novoId: randomUUID,
    gerar: falsa ? (p) => gerarDeMentira(p) : gerarDeVerdade,
    log: (...x) => console.error(...x),
  });
}
