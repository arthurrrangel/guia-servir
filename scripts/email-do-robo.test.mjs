/* O E-MAIL DO ROBÔ SAI DO DOMÍNIO DA IGREJA, UM POR PESSOA · 26/10/2026.

   lib/email-do-robo.ts troca o `globalThis.fetch` aqui por uma Resend de
   mentira: nada sai da máquina. Cada caso diz o que a Resend responde e o
   teste confere quem foi chamado, de qual remetente, para quem, e o que a
   rota recebe de volta (`{ enviado, motivo }`).

   Roda com `npm test`. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { enviarEmail, destinatarios, REMETENTE, REMETENTE_DE_TESTE } from '../lib/email-do-robo.ts';

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => { feitas++; if (!c) { falhas++; console.log('  FALHOU:', rot, extra); } };

const CHAVE = 'CHAVE-RESEND-de-mentira-7b1c';
const DONO = 'dono@exemplo.org';
const NAO_VERIFICADO = 'The avisos.guiaservir.com domain is not verified. Please, add and verify your domain on https://resend.com/domains';
const SO_PARA_O_DONO = 'You can only send testing emails to your own email address (dono@exemplo.org).';

/* a Resend de mentira: `responde(from, to, n)` devolve [status, frase] */
function resend(responde) {
  const chamadas = [];
  globalThis.fetch = async (url, init = {}) => {
    if (url !== 'https://api.resend.com/emails') throw new Error('fora da Resend: ' + url);
    const corpo = JSON.parse(init.body);
    chamadas.push({ ...corpo, auth: init.headers?.Authorization, sinal: !!init.signal });
    const [status, frase = ''] = responde(corpo.from, corpo.to, chamadas.length);
    if (status === 'rede') throw new Error('getaddrinfo ENOTFOUND api.resend.com');
    return new Response(frase, { status });
  };
  return chamadas;
}

process.env.RESEND_API_KEY = CHAVE;

/* 1 · sem chave e sem destinatário: nada sai, o motivo de sempre */
{
  const ch = resend(() => [200]);
  delete process.env.RESEND_API_KEY;
  const r = await enviarEmail(['a@x.org'], 'assunto', 'corpo', 0);
  process.env.RESEND_API_KEY = CHAVE;
  ok(!r.enviado && r.motivo === 'sem RESEND_API_KEY', 'sem chave: não envia e diz por quê', JSON.stringify(r));
  const v = await enviarEmail(['', '  ', null], 'assunto', 'corpo', 0);
  ok(!v.enviado && v.motivo === 'sem destinatário', 'lista vazia: sem destinatário', JSON.stringify(v));
  ok(ch.length === 0, 'nos dois casos a Resend não é chamada', `${ch.length} chamadas`);
}

/* 2 · domínio verificado: um e-mail por pessoa, do domínio da igreja */
{
  const ch = resend(() => [200]);
  const r = await enviarEmail(['A@x.org', 'b@x.org', ' a@x.org ', 'c@x.org'], 'Escala de novembro', 'texto', 0);
  ok(r.enviado && r.motivo === 'ok', 'todos receberam: enviado e ok', JSON.stringify(r));
  ok(ch.length === 3, 'a mesma pessoa com outra caixa recebe uma vez só', `${ch.length} chamadas`);
  ok(ch.every((c) => c.from === 'Escala GUIA <escala@avisos.guiaservir.com>'), 'todas do remetente do domínio da igreja', ch.map((c) => c.from).join(' | '));
  ok(REMETENTE_DE_TESTE === 'Escala <onboarding@resend.dev>', 'o de teste é só o recuo, com o endereço da Resend', REMETENTE_DE_TESTE);
  ok(ch.every((c) => Array.isArray(c.to) && c.to.length === 1), 'cada e-mail tem UM destinatário: ninguém vê o endereço dos outros');
  ok(ch.map((c) => c.to[0]).join(',') === 'A@x.org,b@x.org,c@x.org', 'a ordem e a grafia de quem recebe ficam', ch.map((c) => c.to[0]).join(','));
  ok(ch.every((c) => c.subject === 'Escala de novembro' && c.text === 'texto'), 'assunto e corpo iguais para todos');
  ok(ch.every((c) => c.auth === `Bearer ${CHAVE}` && c.sinal), 'chave no cabeçalho e prazo no fetch');
}

/* 3 · domínio sem verificar: recua para o de teste, que só entrega ao dono */
{
  const ch = resend((from, to) =>
    from === REMETENTE ? [403, NAO_VERIFICADO] : (to[0] === DONO ? [200] : [403, SO_PARA_O_DONO]));
  const r = await enviarEmail([DONO, 'lider1@x.org', 'lider2@x.org'], 'assunto', 'corpo', 0);
  ok(ch.length === 6, 'cada pessoa: domínio primeiro, teste depois', `${ch.length} chamadas`);
  ok(ch.filter((c) => c.from === REMETENTE_DE_TESTE).length === 3, 'o recuo acontece só depois da recusa do domínio');
  ok(!r.enviado, 'quem não é dono não recebe: não conta como enviado', JSON.stringify(r));
  ok(r.motivo.startsWith('1/3 ok') && r.motivo.includes('resend 403') && r.motivo.includes('1 pelo remetente de teste'),
     'o motivo diz quantos, por quê e que saiu pelo de teste', r.motivo);
}

/* 4 · outra recusa 403 (chave, permissão) não ganha segunda tentativa */
{
  const ch = resend(() => [403, 'API key is invalid']);
  const r = await enviarEmail(['a@x.org', 'b@x.org'], 'assunto', 'corpo', 0);
  ok(ch.length === 2 && ch.every((c) => c.from === REMETENTE), 'sem recuo para o de teste', ch.map((c) => c.from).join(' | '));
  ok(!r.enviado && r.motivo === '0/2 ok; resend 403', 'motivo sem repetir a mesma falha', r.motivo);
}

/* 5 · uma falha no meio não para os outros, e entra no motivo */
{
  const ch = resend((from, to, n) => (n === 2 ? [429, 'rate limit'] : [200]));
  const r = await enviarEmail(['a@x.org', 'b@x.org', 'c@x.org'], 'assunto', 'corpo', 0);
  ok(ch.length === 3, 'o terceiro ainda é tentado depois do 429 do segundo', `${ch.length} chamadas`);
  ok(!r.enviado && r.motivo === '2/3 ok; resend 429', 'enviado só se todos; o motivo conta', r.motivo);
}

/* 6 · rede caída vira motivo, não exceção (a rota já gravou a escala) */
{
  resend(() => ['rede']);
  let r, estourou = false;
  try { r = await enviarEmail(['a@x.org'], 'assunto', 'corpo', 0); } catch { estourou = true; }
  ok(!estourou && r && !r.enviado && r.motivo.startsWith('0/1 ok; rede: '), 'falha de rede é dado do relatório', JSON.stringify(r));
}

/* 7 · a chave e os endereços nunca aparecem no motivo */
{
  resend((from, to) => (from === REMETENTE ? [403, NAO_VERIFICADO] : [500, 'erro ' + to[0]]));
  const r = await enviarEmail(['segredo@x.org'], 'assunto', 'corpo', 0);
  ok(!r.motivo.includes(CHAVE) && !r.motivo.includes('segredo@x.org'), 'sem chave e sem endereço no motivo', r.motivo);
}

/* 8 · a pausa entre envios existe (e não antes do primeiro) */
{
  resend(() => [200]);
  const t0 = Date.now();
  await enviarEmail(['a@x.org', 'b@x.org', 'c@x.org'], 'assunto', 'corpo', 40);
  const dt = Date.now() - t0;
  ok(dt >= 80 && dt < 1000, 'duas pausas de 40 ms para três envios', `${dt} ms`);
}

/* 9 · destinatarios: tira vazio, nulo e repetido, guarda a primeira grafia */
ok(JSON.stringify(destinatarios([null, ' X@y.org', 'x@Y.org', '', undefined, 'z@y.org'])) === '["X@y.org","z@y.org"]',
   'destinatarios limpa a lista', JSON.stringify(destinatarios([null, ' X@y.org', 'x@Y.org', '', undefined, 'z@y.org'])));

/* 10 · a rota do cron usa este módulo e não tem mais remetente próprio */
{
  const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
  const rota = readFileSync(join(raiz, 'app/api/cron/route.ts'), 'utf8');
  ok(rota.includes("import { enviarEmail as enviar } from '@/lib/email-do-robo';"), 'a rota importa o envio daqui');
  ok(!rota.includes('onboarding@resend.dev') && !rota.includes('api.resend.com'), 'a rota não fala mais com a Resend direto');
  ok(!/async function enviar\(/.test(rota), 'a rota não tem mais um enviar próprio');
}

console.log(`e-mail do robô pelo domínio, um por pessoa: ${feitas - falhas}/${feitas}`);
if (falhas) process.exit(1);
