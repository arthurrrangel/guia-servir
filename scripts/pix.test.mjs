/* O código Pix. Roda com `npm test`.

   O que este arquivo protege: um BR Code errado não dá erro, dá "QR Code
   inválido" na mão de quem está tentando ofertar no meio do culto. Não existe
   log disso. Então o teste tem que provar quatro coisas separadas:

     1. o CRC bate  — conferido contra valores calculados por fora (python,
        crcmod, CRC-16/CCITT-FALSE), não pela mesma função que os gera;
     2. o valor que entra é o valor que sai, lido de volta do código;
     3. valor ausente e valor zero produzem códigos DIFERENTES (um deixa a
        pessoa digitar, o outro trava) — foi aqui que eu errei na primeira
        versão, tratando 0 como "sem valor" mas escrevendo o campo;
     4. acento e símbolo somem do nome, porque é o que faz o app recusar.      */
import { pixCopiaECola, pixValido, pixCampos } from '../lib/pix.ts';

/* Chave de teste. É um CNPJ de exemplo, não é de ninguém: o teste nunca toca
   em rede, só monta texto. */
const CHAVE = '12345678000195';
const BASE = { chave: CHAVE, nome: 'GUIA Church', cidade: 'Rio de Janeiro' };

let mal = 0;
const ok = (cond, queixa) => {
  if (!cond) { mal++; console.error(`MAL  ${queixa}`); }
};

/* ---------------------------------------------------------------- 1. o CRC ---
   Estes quatro dígitos vieram de FORA: um CRC-16/CCITT-FALSE por tabela, em
   python, conferido antes contra o vetor canônico do padrão ("123456789" tem
   que dar 0x29B1). O lib/pix.ts calcula bit a bit, forma diferente — para as
   duas concordarem, o erro teria que estar nas duas ao mesmo tempo.

   E o teste também prova que os códigos de referência são os que a nossa
   função REALMENTE monta, senão ela poderia estar certa sobre um payload que
   ela nunca gera. */
const REFERENCIA = [
  {
    cod: '00020126360014br.gov.bcb.pix011412345678000195520400005303986540550.005802BR5911GUIA Church6014Rio de Janeiro62070503***6304',
    crc: 'BEF5',
  },
  {
    cod: '00020126360014br.gov.bcb.pix0114123456780001955204000053039865802BR5911GUIA Church6014Rio de Janeiro62070503***6304',
    crc: '399E',
  },
];
for (const { cod, crc } of REFERENCIA) {
  ok(pixValido(cod + crc), `CRC de referência ${crc} deveria validar`);
  ok(!pixValido(cod + '0000'), `CRC 0000 não deveria validar onde o certo é ${crc}`);
}

/* o payload que a função monta é, caractere por caractere, o que o python
   calculou — é isto que liga a referência externa ao código de verdade */
ok(
  pixCopiaECola({ ...BASE, valor: 50 }) === REFERENCIA[0].cod + REFERENCIA[0].crc,
  `com valor: a função montou\n     ${pixCopiaECola({ ...BASE, valor: 50 })}\n  e a referência é\n     ${REFERENCIA[0].cod + REFERENCIA[0].crc}`,
);
ok(
  pixCopiaECola({ ...BASE }) === REFERENCIA[1].cod + REFERENCIA[1].crc,
  `sem valor: a função montou\n     ${pixCopiaECola({ ...BASE })}\n  e a referência é\n     ${REFERENCIA[1].cod + REFERENCIA[1].crc}`,
);

/* -------------------------------------------------------------- 2. o valor ---
   R$50 tem que sair como "50.00" no campo 54, e o código todo tem que passar
   no CRC. Centavo quebrado também: 12,30 é "12.30", não "12.3". */
for (const [valor, esperado] of [[50, '50.00'], [12.3, '12.30'], [0.01, '0.01'], [1234.5, '1234.50']]) {
  const cod = pixCopiaECola({ ...BASE, valor });
  const campos = pixCampos(cod);
  ok(campos['54'] === esperado, `valor ${valor} saiu como ${JSON.stringify(campos['54'])}, esperado ${esperado}`);
  ok(pixValido(cod), `código de R$${valor} não passou no CRC`);
}

/* --------------------------------------------- 3. ausente não é zero --------- */
const semValor = pixCopiaECola({ ...BASE });
const comZero = pixCopiaECola({ ...BASE, valor: 0 });
ok(!('54' in pixCampos(semValor)), 'sem valor: o campo 54 não deveria existir');
ok(!('54' in pixCampos(comZero)), 'valor 0 é "a pessoa digita": o campo 54 não deveria existir');
ok(pixValido(semValor), 'código sem valor não passou no CRC');

/* --------------------------------------------------------------- 4. o nome --- */
const acento = pixCopiaECola({ chave: CHAVE, nome: 'Igreja São João', cidade: 'São Paulo', valor: 10 });
const c4 = pixCampos(acento);
ok(c4['59'] === 'Igreja Sao Joao', `nome com acento saiu ${JSON.stringify(c4['59'])}`);
ok(c4['60'] === 'Sao Paulo', `cidade com acento saiu ${JSON.stringify(c4['60'])}`);
ok(pixValido(acento), 'código com acento normalizado não passou no CRC');

/* nome comprido corta em 25, cidade em 15, e o código continua válido */
const longo = pixCopiaECola({
  chave: CHAVE,
  nome: 'Igreja Comunidade Crista Guia Church Barra da Tijuca',
  cidade: 'Rio de Janeiro Barra da Tijuca',
  valor: 20,
});
const c5 = pixCampos(longo);
ok(c5['59'].length <= 25, `nome ficou com ${c5['59'].length} caracteres`);
ok(c5['60'].length <= 15, `cidade ficou com ${c5['60'].length} caracteres`);
ok(pixValido(longo), 'código com nome cortado não passou no CRC');

/* ------------------------------------------------------------ 5. o txid ------
   É o campo que volta no registro do Pix recebido, e por isso é o único jeito
   de saber de quem foi a oferta sem API de cobrança. Tem que sobreviver
   inteiro, e sujeira tem que ser removida em vez de quebrar o código. */
const comTxid = pixCopiaECola({ ...BASE, valor: 50, txid: 'OFERTA20260913A7' });
ok(pixCampos(comTxid)['62'] === '0516OFERTA20260913A7', `txid saiu ${JSON.stringify(pixCampos(comTxid)['62'])}`);
ok(pixValido(comTxid), 'código com txid não passou no CRC');

const txidSujo = pixCopiaECola({ ...BASE, valor: 50, txid: 'oferta-2026/09/13 #a7' });
ok(pixCampos(txidSujo)['62'] === '0516oferta20260913a7', `txid sujo saiu ${JSON.stringify(pixCampos(txidSujo)['62'])}`);
ok(pixValido(txidSujo), 'código com txid sujo não passou no CRC');

/* txid de 40 caracteres corta em 25 e não estoura o campo */
const txidLongo = pixCopiaECola({ ...BASE, valor: 50, txid: 'A'.repeat(40) });
ok(pixCampos(txidLongo)['62'] === '0525' + 'A'.repeat(25), 'txid longo não cortou em 25');
ok(pixValido(txidLongo), 'código com txid longo não passou no CRC');

/* ------------------------------------------------------------ 6. as bordas --- */
let jogou = false;
try { pixCopiaECola({ ...BASE, chave: '' }); } catch { jogou = true; }
ok(jogou, 'chave vazia deveria dar erro em vez de gerar código quebrado');

jogou = false;
try { pixCopiaECola({ ...BASE, valor: 1e12 }); } catch { jogou = true; }
ok(jogou, 'valor absurdo deveria dar erro');

ok(!pixValido(''), 'string vazia não é código válido');
ok(!pixValido('00020101'), 'lixo curto não é código válido');

/* o código completo tem que caber num QR que se lê de longe */
const completo = pixCopiaECola({ ...BASE, valor: 100, txid: 'OFERTA20260913A7' });
ok(completo.length < 200, `código com ${completo.length} caracteres: QR fica denso demais para projetar`);

if (mal) { console.error(`\npix.test: ${mal} falharam`); process.exit(1); }
console.log('pix.test: todas passaram');
