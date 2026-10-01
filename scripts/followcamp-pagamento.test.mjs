/* O pagamento do Follow Camp 2027. Roda com `npm test`.

   O que este arquivo protege, em ordem de quanto custa errar:

     1. O VALOR. R$ 697 no 1º lote (o dia 3/11 inteiro), R$ 627,30 com
        desconto de irmãos, parcela entre o piso e o teto e só como NÚMERO, e
        nada de "inscrição" depois de 03/11 enquanto o 2º lote não tiver valor.
     2. O PEDIDO QUE VAI À STONE. Centavos e não reais, customer com o que a doc
        exige para Pix, Idempotency-Key, o link do cartão até 12x com parcela
        mínima de R$ 50. Conferido contra um dublê HTTP local que GUARDA o que
        recebeu: o teste lê o corpo de verdade, não o código.
     3. A CONFERÊNCIA DA VOLTA. Pedido com outro código ou outro valor não chega
        à tela (era o caminho para "confirmado" no campista errado).
     4. O ESTADO. Só com a assinatura do POST; id inventado nem vai à Stone;
        "expirado" só depois da folga.
     5. O PIX DIRETO. O código do campista sai inteiro no BR Code, válido.
     6. O LOG. Nome, CPF, celular e e-mail não entram no log, nem quando a
        Stone ecoa o pedido inteiro no erro.                                   */
import http from 'node:http';
import {
  precoDe, valorIrmaos, loteVigente, carneAberto, cpfValido, celularDe, nomeInvalido, emailValido,
  codigoFC27, CODIGO_OK, conferirPedido, conferirPagador, mensagemWhatsApp, codigoLegivel,
  maxParcelasCartao, nomeCurtoDe, descricaoDe,
} from '../lib/followcamp.ts';
import { pixCopiaECola, pixValido, pixCampos } from '../lib/pix.ts';

let mal = 0;
const ok = (cond, queixa) => { if (!cond) { mal++; console.error(`MAL  ${queixa}`); } };
const d = s => new Date(s);

/* ---------------------------------------------------------------- 1. valor --- */
const ANTES = d('2026-10-01T12:00:00-03:00');
const FIM_DO_DIA_3 = d('2026-11-03T23:59:59.999-03:00');
const DIA_4 = d('2026-11-04T00:00:00-03:00');
const FIM_DO_DIA_3_JAN = d('2027-01-03T23:59:59.999-03:00');
const DIA_4_JAN = d('2027-01-04T00:00:00-03:00');

ok(valorIrmaos(697) === 627.3, `irmãos: ${valorIrmaos(697)} != 627.3`);
ok(precoDe('inscricao', ANTES).valor === 697, 'inscrição antes do prazo = 697');
ok(precoDe('inscricao', FIM_DO_DIA_3).valor === 697, 'o dia 3/11 vale inteiro, até o último milissegundo');
ok(!precoDe('inscricao', DIA_4).ok, 'inscrição em 04/11 fecha (2º lote sem valor)');
ok(!precoDe('irmaos', DIA_4).ok, 'irmãos em 04/11 fecha');
ok(precoDe('irmaos', ANTES).valor === 627.3, 'irmãos = 627,30');
ok(loteVigente(DIA_4) === null, 'nenhum lote vigente em 04/11');
for (const [v, deve] of [[49.99, false], [50, true], [174.25, true], [697, true], [697.01, false], [100.005, false], [0, false], [-10, false], [NaN, false], ['200', false], [[300], false]]) {
  ok(precoDe('parcela', ANTES, v).ok === deve, `parcela ${JSON.stringify(v)} deveria ser ${deve ? 'aceita' : 'recusada'}`);
}
ok(precoDe('parcela', DIA_4, 200).ok, 'parcela continua aberta depois de 03/11 (o carnê vai até 03/01)');
ok(precoDe('parcela', FIM_DO_DIA_3_JAN, 200).ok && carneAberto(FIM_DO_DIA_3_JAN), 'o dia 3/1 vale inteiro');
ok(!precoDe('parcela', DIA_4_JAN, 200).ok, 'parcela em 04/01 fecha');
ok(!precoDe('qualquer', ANTES).ok, 'referente desconhecido é recusado');

/* ------------------------------------------------------- documentos/nomes --- */
for (const c of ['529.982.247-25', '11144477735', '390.533.447-05']) ok(cpfValido(c), `CPF válido recusado: ${c}`);
for (const c of ['111.111.111-11', '529.982.247-24', '1234567890', '']) ok(!cpfValido(c), `CPF inválido aceito: ${c}`);
const cel = celularDe('(21) 99594-6491');
ok(cel && cel.area_code === '21' && cel.number === '995946491', 'celular formatado');
ok(celularDe('+55 21 99594-6491')?.number === '995946491', 'celular com +55');
ok(celularDe('21 3333-4444') === null, 'fixo não é celular');
ok(celularDe('21 89594-6491') === null, 'celular sem o 9 na frente');
ok(celularDe('00 99594-6491') === null, 'DDD inexistente');
ok(nomeInvalido('Ana') !== null, 'nome de uma palavra');
ok(nomeInvalido('Ana Li') === null, 'nome curto válido');
ok(nomeInvalido('José da Silva') === null, 'nome com partícula');
ok(nomeInvalido('José da Silva') === null, 'nome com acento decomposto (NFD), colado de outra origem');
ok(nomeInvalido("Maria D'Ávila-Souza") === null, 'nome com apóstrofo e hífen');
ok(nomeInvalido('J0ão Silva') !== null, 'nome com dígito');
ok(/^Escreva o nome completo do campista\.$/.test(nomeInvalido('')), `frase: ${nomeInvalido('')}`);
ok(emailValido('pai@exemplo.com.br') && !emailValido('pai@exemplo') && !emailValido('pai exemplo@x.com'), 'e-mail');

/* ------------------------------------------------------------------ código --- */
const vistos = new Set();
for (let i = 0; i < 20000; i++) {
  const c = codigoFC27();
  if (!CODIGO_OK.test(c)) { ok(false, `código fora do formato: ${c}`); break; }
  vistos.add(c);
}
ok(vistos.size === 20000, `colisão em 20 mil códigos: ${20000 - vistos.size}`);
ok(codigoLegivel('FC27K7P3M9QX') === 'FC27-K7P3M9QX', 'código legível');

/* ------------------------------------------------------ pedido conferido --- */
{
  const r = conferirPedido({ campista: '  Maria   Eduarda Souza ', referente: 'inscricao', valor: 1, codigo: 'FC27AAAAAAAA' }, ANTES);
  ok(r.ok && r.dados.valor === 697 && r.dados.campista === 'Maria Eduarda Souza', 'o valor vem da regra, não do navegador; nome limpo');
  ok(r.ok && !('codigo' in r.dados), 'o código do navegador é ignorado: quem sorteia é o servidor');
  ok(!conferirPedido({ campista: 'Maria Souza', referente: 'irmaos', irmao: 'maria souza' }, ANTES).ok, 'irmão não pode ser o próprio campista');
  ok(conferirPedido({ campista: 'Maria Souza', referente: 'irmaos', irmao: 'João Souza' }, ANTES).dados?.valor === 627.3, 'irmãos com nome do irmão');
  const p = conferirPagador({ nome: 'Carlos Souza', cpf: '529.982.247-25', email: ' Pai@Exemplo.com ', celular: '(21) 99594-6491' });
  ok(p.ok && p.dados.cpf === '52998224725' && p.dados.email === 'pai@exemplo.com', 'pagador normalizado');
  ok(!conferirPagador({ nome: 'Carlos Souza', cpf: '529.982.247-25', email: 'pai@exemplo.com', celular: '21 3333-4444' }).ok, 'pagador com fixo');
}
const COD = 'FC27K7P3M9QX';
ok(/Código: FC27-K7P3M9QX/.test(mensagemWhatsApp({ campista: 'Maria Souza', ref: 'parcela', valor: 174.25, codigo: COD, meio: 'pixdireto' })), 'mensagem do WhatsApp leva o código');
ok(maxParcelasCartao(697) === 12 && maxParcelasCartao(100) === 2 && maxParcelasCartao(50) === 1 && maxParcelasCartao(49) === 1, 'parcela mínima de R$ 50 no cartão');
ok(nomeCurtoDe('irmaos', 'Maria Eduarda Souza de Albuquerque') === 'FC27 · Irmãos · Maria Eduarda Souza de Albuquerque', 'nome curto com o campista inteiro');
ok(/irmão inscrito: João Souza/.test(descricaoDe('irmaos', 'Maria Souza', 'João Souza')), 'descrição leva o irmão');

/* ---------------------------------------------------------- 5. Pix direto --- */
{
  const cod = pixCopiaECola({ chave: '12345678000195', nome: 'GUIA CHURCH', cidade: 'Rio de Janeiro', valor: 627.3, txid: COD });
  ok(pixValido(cod), 'BR Code do Pix direto válido');
  ok(pixCampos(cod)['54'] === '627.30', `valor no BR Code: ${pixCampos(cod)['54']}`);
  ok(cod.includes(`05${String(COD.length).padStart(2, '0')}${COD}`), 'txid do campista dentro do campo 62');
}

/* ------------------------------------------- 2 a 4 e 6. o pedido à Stone --- */
const recebidos = [];
let modo = 'normal';
const PASSADO = new Date(Date.now() - 6 * 60 * 1000).toISOString();     // 6 min atrás
const RECENTE = new Date(Date.now() - 2 * 60 * 1000).toISOString();     // 2 min atrás
const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', c => { corpo += c; });
  req.on('end', () => {
    const b = corpo ? JSON.parse(corpo) : null;
    recebidos.push({ metodo: req.method, url: req.url, cab: req.headers, corpo: b });
    const json = (st, j) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(j)); };
    if (req.method === 'POST' && req.url === '/orders') {
      if (modo === 'eco') return json(422, { message: `customer.document 52998224725 invalido para ${b.customer.name}`, errors: { 'customer.document': ['invalido'] }, request: b });
      const code = modo === 'outro-codigo' ? 'FC27ZZZZZZZZ' : b.code;
      const amount = modo === 'outro-valor' ? 69700 : b.items[0].amount;
      return json(200, { id: 'or_TESTE1234567890', code, amount, status: 'pending',
        charges: [{ last_transaction: { status: 'waiting_payment', qr_code: '00020101021226BR.COM.STONE', expires_at: '2099-01-01T00:00:00Z' } }] });
    }
    const m = req.url.match(/^\/orders\/(or_\w+)$/);
    if (req.method === 'GET' && m) {
      const id = m[1];
      const base = { id, code: COD, metadata: { evento: 'followcamp2027' } };
      if (id === 'or_PAGO00000000') return json(200, { ...base, status: 'paid', charges: [{ last_transaction: { status: 'paid' } }] });
      if (id === 'or_VENCIDO00000') return json(200, { ...base, status: 'pending', charges: [{ last_transaction: { status: 'waiting_payment', expires_at: PASSADO } }] });
      if (id === 'or_RECENTE00000') return json(200, { ...base, status: 'pending', charges: [{ last_transaction: { status: 'waiting_payment', expires_at: RECENTE } }] });
      if (id === 'or_DEOUTRACOISA00') return json(200, { id, code: 'GUIAO260921ABCDEF', status: 'paid', metadata: {} });
      return json(404, {});
    }
    if (req.method === 'POST' && req.url === '/paymentlinks') {
      return json(200, { id: 'pl_TESTE', url: 'https://payment-link.pagar.me/pl_TESTE', status: 'active' });
    }
    json(404, {});
  });
});
await new Promise(r => servidor.listen(0, '127.0.0.1', r));
process.env.STONE_SECRET_KEY = 'sk_test_DUBLE';
process.env.PAGARME_API_URL = `http://127.0.0.1:${servidor.address().port}`;
process.env.NEXT_PUBLIC_SITE_URL = 'https://guiaservir.com';
delete process.env.PAGARME_JUROS;
const pg = await import('../lib/pagarme.ts');

const PAGADOR = { nome: 'Carlos Souza', email: 'pai@exemplo.com', cpf: '52998224725', celular: { area_code: '21', number: '995946491' } };
const PEDIDO = { codigo: COD, valor: 627.3, descricao: 'Follow Camp 2027 · Inscrição com desconto de irmãos · Clara Menor Lima', campista: 'Clara Menor Lima', referente: 'irmaos', irmao: 'João Souza', pagador: PAGADOR };

ok(pg.TEM_PAGARME === true, 'com a chave, o Pagar.me liga');
{
  const r = await pg.criarPix(PEDIDO);
  ok(r.ok && r.pedido === 'or_TESTE1234567890' && r.copiaECola.startsWith('000201') && r.valor === 627.3, 'Pix criado devolve pedido, copia e cola e o valor do pedido');
  ok(r.ok && pg.assinaturaOk(r.pedido, r.assinatura), 'a assinatura devolvida confere');
  const env = recebidos.find(x => x.url === '/orders');
  ok(env?.cab['idempotency-key'] === COD, 'Idempotency-Key = código do pagamento');
  ok(env?.cab.authorization === 'Basic ' + Buffer.from('sk_test_DUBLE:').toString('base64'), 'Basic com a chave e senha vazia');
  const c = env?.corpo;
  ok(c?.items?.[0]?.amount === 62730, `centavos: ${c?.items?.[0]?.amount}`);
  ok(c?.code === COD && c?.metadata?.campista === 'Clara Menor Lima' && c?.metadata?.irmao === 'João Souza', 'code e metadata');
  const cu = c?.customer || {};
  ok(cu.name && cu.email && cu.type === 'individual' && cu.document === '52998224725'
    && cu.phones?.mobile_phone?.area_code === '21' && cu.phones?.mobile_phone?.number === '995946491', 'customer com o que a doc exige para Pix');
  ok(c?.payments?.[0]?.payment_method === 'pix' && c?.payments?.[0]?.pix?.expires_in === 1800, 'Pix de 30 min, em segundos');
}
/* 3. a volta tem que ser ESTE pedido */
modo = 'outro-codigo';
ok(!(await pg.criarPix(PEDIDO)).ok, 'pedido devolvido com OUTRO código não chega à tela');
modo = 'outro-valor';
ok(!(await pg.criarPix(PEDIDO)).ok, 'pedido devolvido com OUTRO valor não chega à tela');

/* 6. o log não leva dado de pessoa, nem com a Stone ecoando o pedido */
modo = 'eco';
{
  const escrito = [];
  const original = console.error;
  console.error = (...a) => escrito.push(a.join(' '));
  const r = await pg.criarPix(PEDIDO);
  console.error = original;
  const log = escrito.join('\n');
  ok(!r.ok, 'erro da Stone vira erro na tela');
  ok(log.includes('status=422') && log.includes('customer.document'), `o log diz o que consertar: ${log}`);
  ok(!/Clara|Carlos|Menor|52998224725|pai@exemplo|995946491/.test(log), `log com dado pessoal: ${log}`);
}
modo = 'normal';

/* 4. o estado */
{
  const antes = recebidos.length;
  ok(await pg.estadoDoPix('or_PAGO00000000', 'assinatura-falsa-1234') === 'desconhecido', 'sem a assinatura certa, nada');
  ok(await pg.estadoDoPix('../../segredo', pg.assinar('../../segredo')) === 'desconhecido', 'id fora do formato');
  ok(recebidos.length === antes, 'id sem assinatura ou fora do formato nem chega à Stone');
  ok(await pg.estadoDoPix('or_PAGO00000000', pg.assinar('or_PAGO00000000')) === 'pago', 'pago');
  ok(await pg.estadoDoPix('or_RECENTE00000', pg.assinar('or_RECENTE00000')) === 'aguardando', 'passou do prazo há 2 min: ainda aguardando (folga de 5)');
  ok(await pg.estadoDoPix('or_VENCIDO00000', pg.assinar('or_VENCIDO00000')) === 'expirado', 'passou do prazo há 6 min: expirado');
  ok(await pg.estadoDoPix('or_DEOUTRACOISA00', pg.assinar('or_DEOUTRACOISA00')) === 'desconhecido', 'pedido que não é do Camp');
}

/* o link do cartão */
{
  const r = await pg.criarLinkCartao({ codigo: COD, valor: 697, nome: 'FC27 · Inscrição · Maria Souza', descricao: 'Follow Camp 2027 · Inscrição · Maria Souza' });
  ok(r.ok && r.url === 'https://payment-link.pagar.me/pl_TESTE', 'link do cartão');
  const c = recebidos.find(x => x.url === '/paymentlinks')?.corpo;
  const cc = c?.payment_settings?.credit_card_settings;
  ok(JSON.stringify(c?.payment_settings?.accepted_payment_methods) === '["credit_card"]', 'link só de cartão');
  ok(cc?.installments_setup?.max_installments === 12 && cc?.installments_setup?.amount === 69700
    && cc?.installments_setup?.customer_fee === true && cc?.installments_setup?.free_installments === 1, 'até 12x, juro de quem paga');
  ok(c?.order_code === COD && c?.max_paid_sessions === 1 && c?.expires_in === 60, 'order_code, uma venda, 60 min');
  ok(c?.name === 'FC27 · Inscrição · Maria Souza', 'nome curto no link');
  ok(c?.flow_settings?.success_url === `https://guiaservir.com/followcamp/pagar?fim=cartao&c=${COD}`, 'volta para a tela do Camp');
  ok(c?.cart_settings?.items?.[0]?.amount === 69700, 'item em centavos');
}
ok(pg.jurosDe('') === null && pg.jurosDe('3') === 3 && pg.jurosDe('2.99') === null && pg.jurosDe('1,99') === null && pg.jurosDe('0') === null, 'PAGARME_JUROS: só inteiro de 1 a 19');
ok(pg.parcelasDe(697, 3).interest_rate === 3 && !('customer_fee' in pg.parcelasDe(697, 3)), 'juro fixo troca o customer_fee');
ok(pg.parcelasDe(100, null).max_installments === 2, 'R$ 100 no cartão: até 2x');
servidor.close();

if (mal) { console.error(`\n${mal} problema(s) no pagamento do Follow Camp.`); process.exit(1); }
console.log('ok  followcamp-pagamento: valor, pedido à Stone, conferência, estado, Pix direto e log');
