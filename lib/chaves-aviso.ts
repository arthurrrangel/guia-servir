/* =============================================================================
   O PAR DE CHAVES DO AVISO NO CELULAR (VAPID) — 104, 01/10/2026

   Gerado no navegador de quem administra (/ajustes/aviso-no-celular), com a
   criptografia do próprio navegador, e colado no Vercel. Mora aqui, e não
   na página, para o teste (`scripts/aviso-chaves.test.mjs`) gerar do MESMO
   jeito e provar que a biblioteca do servidor (web-push) aceita o par: a
   pública é o ponto P-256 sem compressão (65 bytes), a privada é o `d` (32
   bytes), as duas em base64url sem preenchimento.
   ============================================================================= */
export const b64url = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function gerarParVapid(subtle: SubtleCrypto = crypto.subtle): Promise<{ pub: string; priv: string }> {
  const k = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const pub = new Uint8Array(await subtle.exportKey('raw', k.publicKey));
  const jwk = await subtle.exportKey('jwk', k.privateKey);
  if (pub.length !== 65 || !jwk.d) throw new Error('par de chaves fora do formato');
  return { pub: b64url(pub), priv: jwk.d };
}
