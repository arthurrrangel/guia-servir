/* =============================================================================
   POST /api/ofertar/checkout — abre o pagamento por cartão, Apple Pay ou Google Pay

   A tela manda {valor, tipo, txid} e recebe uma URL para onde ir. É o único
   caminho entre o navegador e o adquirente, e ele existe por um motivo só: a
   credencial que autoriza cobrar em nome da igreja não pode passar pelo
   navegador de ninguém. Ela vive em `MP_ACCESS_TOKEN`, no painel da Vercel, e
   é lida aqui (ver lib/checkout.ts).

   O QUE ESTA ROTA NÃO FAZ, de propósito: não guarda nada. Quem registra a
   oferta é o adquirente, e é no extrato dele e do banco que a tesouraria lê.
   Um banco de dados nosso com quem deu quanto seria mais uma cópia de dado
   sensível para alguém ter que proteger, sem nada em troca.
   ============================================================================= */
import { NextResponse } from 'next/server';
import { criarCheckout } from '@/lib/checkout';
import { MIN, MAX, valorInvalido } from '@/lib/oferta';
import { passe, deQuem } from '@/lib/teto-de-taxa';

export const dynamic = 'force-dynamic';

/** O MESMO FORMATO QUE `txidDe` PRODUZ DE VERDADE — 21/09/2026.
 *
 *  Era `/^[A-Za-z0-9]{1,25}$/`, que aceita qualquer coisa alfanumérica. O
 *  formato real é `GUIA` + `D`|`O` + AAMMDD + sorteio, e ele é a chave de
 *  idempotência que vai ao adquirente e a referência pela qual a tesouraria
 *  reconcilia quem ofertou o quê. Medido: a rota aceitava `txid` de outra
 *  pessoa, e aceitava qualquer palavra.
 *
 *  A faixa do sorteio vai de 6 a 20 para o formato não ficar preso ao número
 *  de hoje: a 21/09 ele passou de 4 para 10, e prender em 10 faria esta linha
 *  ser a próxima a ficar para trás. */
const TXID_OK = /^GUIA[DO][0-9]{6}[A-Z0-9]{6,20}$/;

export async function POST(req: Request) {
  /* TETO DE TAXA (20/09/2026), RECALIBRADO EM 21/09.

     Esta rota faz o servidor chamar o adquirente com a chave secreta da igreja
     e criar uma cobrança por requisição, sem autenticação nenhuma. O teto
     existe contra abuso.

     Eram SEIS por minuto por IP, e a conta esquecia onde a igreja fica: num
     domingo, o salão inteiro sai pelo mesmo NAT — o wi-fi da igreja, ou o 4G
     da operadora. Medido: 200 pessoas no mesmo IP, na mesma janela de 60s,
     seis passam e 194 levam 429. E a frase que a pessoa nº 7 lê culpa ELA
     ("muitas tentativas seguidas") por uma coisa que ela não fez.

     Sessenta por minuto continua fechando o laço de `for` num terminal — um
     script faz milhares — e não alcança congregação nenhuma. E a frase deixa
     de acusar quem está ofertando. */
  const p = passe('oferta:' + deQuem(req), 60, 60);
  if (!p.ok) {
    return NextResponse.json(
      { ok: false, erro: 'O pagamento por cartão está congestionado agora. Espere um instante, ou use o Pix.' },
      { status: 429, headers: { 'Retry-After': String(p.esperar) } });
  }

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erro: 'Pedido inválido.' }, { status: 400 });
  }

  const c = corpo as { valor?: unknown; tipo?: unknown; txid?: unknown };

  const valor = typeof c.valor === 'number' ? c.valor : Number(c.valor);
  const mal = !Number.isFinite(valor) ? `O valor precisa estar entre R$${MIN} e R$${MAX}.` : valorInvalido(valor);
  if (mal) return NextResponse.json({ ok: false, erro: mal }, { status: 400 });

  if (c.tipo !== 'dizimo' && c.tipo !== 'oferta') {
    return NextResponse.json({ ok: false, erro: 'Escolha entre dízimo e oferta.' }, { status: 400 });
  }

  const txid = String(c.txid || '');
  if (!TXID_OK.test(txid)) {
    return NextResponse.json({ ok: false, erro: 'Pedido inválido.' }, { status: 400 });
  }

  const r = await criarCheckout({ valor, tipo: c.tipo, txid });
  /* 502 quando o adquirente falhou, 400 quando o pedido estava errado: a tela
     usa a mesma frase nos dois, mas o log da Vercel separa os dois problemas,
     que têm donos diferentes. */
  return NextResponse.json(r, { status: r.ok ? 200 : 502 });
}
