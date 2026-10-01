/* O PAR QUE O ARTHUR GERA É O PAR QUE O SERVIDOR ACEITA — 104, 01/10/2026.

   A página /ajustes/aviso-no-celular gera o par no navegador (lib/chaves-aviso.ts)
   e o Arthur cola no Vercel. Se o formato não for o que a biblioteca do
   servidor (web-push) espera, o aviso não sai, e o erro só apareceria no
   primeiro pedido de troca de verdade. Aqui o par é gerado do MESMO jeito
   (a mesma função, com a criptografia do Node no lugar da do navegador) e:
     1. a biblioteca aceita o par (`setVapidDetails` confere os tamanhos);
     2. um aviso de verdade é montado e cifrado para uma inscrição de teste,
        com a assinatura VAPID e a cifra aes128gcm, sem sair para a rede;
     3. o par muda a cada geração (não é constante escrita no código).
   As chaves deste teste são descartáveis e não saem do processo.

   Roda com `npm test`. */
import { webcrypto, createECDH, randomBytes } from 'node:crypto';
import webpush from 'web-push';
import { gerarParVapid } from '@/lib/chaves-aviso';

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => { feitas++; if (!c) { falhas++; console.log('  FALHOU:', rot, extra); } };

const par = await gerarParVapid(webcrypto.subtle);
ok(/^[A-Za-z0-9_-]{87}$/.test(par.pub), 'a pública tem 87 caracteres base64url (65 bytes)', par.pub.length);
ok(/^[A-Za-z0-9_-]{43}$/.test(par.priv), 'a privada tem 43 caracteres base64url (32 bytes)', par.priv.length);
let aceitou = true;
try { webpush.setVapidDetails('https://guiaservir.com', par.pub, par.priv); } catch (e) { aceitou = false; console.log(e.message); }
ok(aceitou, 'a biblioteca do servidor aceita o par');

/* uma inscrição de teste, do jeito que o navegador entrega */
const ecdh = createECDH('prime256v1'); ecdh.generateKeys();
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/teste-104', keys: { p256dh: b64u(ecdh.getPublicKey()), auth: b64u(randomBytes(16)) } };
const det = webpush.generateRequestDetails(sub, JSON.stringify({ titulo: 'Pedido de troca', corpo: 'teste', url: '/eu', tag: 't' }),
  { vapidDetails: { subject: 'https://guiaservir.com', publicKey: par.pub, privateKey: par.priv }, TTL: 43200 });
ok(det.endpoint === sub.endpoint && det.method === 'POST', 'o aviso vai por POST ao endereço da inscrição');
ok(det.headers['Content-Encoding'] === 'aes128gcm', 'cifrado em aes128gcm', det.headers['Content-Encoding']);
ok(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/.test(det.headers.Authorization || ''), 'assinado com VAPID (t=JWT, k=chave pública)');
ok((det.headers.Authorization || '').includes(`k=${par.pub}`), 'e a chave pública do par vai junto');
ok(det.body && det.body.length > 100 && !det.body.includes('Pedido de troca'), 'o corpo vai cifrado, não em texto');
ok(String(det.headers.TTL) === '43200', 'vale por 12 horas');

const outro = await gerarParVapid(webcrypto.subtle);
ok(outro.pub !== par.pub && outro.priv !== par.priv, 'cada geração é um par novo');

if (falhas) { console.log(`aviso-chaves: ${falhas} falha(s) em ${feitas}`); process.exit(1); }
console.log(`aviso-chaves: ${feitas}/${feitas} ok`);
