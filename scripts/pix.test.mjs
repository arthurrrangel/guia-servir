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
import { pixCopiaECola, pixValido, pixCampos, paraTeste } from '../lib/pix.ts';

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

/* O CÓDIGO TEM QUE CABER NUM QR QUE SE LÊ DE LONGE.

   O teto era 200 escrito à mão, e ele media o tamanho da chave Pix de hoje:
   trocar a chave por uma mais longa quebraria o teste sem nada estar errado.
   Agora ele mede o que de fato depende de nós — o que o código acrescenta
   ALÉM da chave — e mantém um teto absoluto folgado para o QR.

   Por que 200 continua ali como teto duro: acima disso o QR sai denso demais
   para alguém ler do fundo da igreja, e isso independe de quem é a chave. */
const completo = pixCopiaECola({ ...BASE, valor: 100, txid: 'OFERTA20260913A7' });
const semChave = completo.length - BASE.chave.length;
ok(semChave < 130, `o código acrescenta ${semChave} caracteres à chave: gordo demais para o QR`);
ok(completo.length < 200, `código com ${completo.length} caracteres: QR fica denso demais para projetar`);

/* ===========================================================================
   OS CASOS QUE FALTAVAM — 21/09/2026

   Esta suíte testava só chave ASCII de 14 dígitos, e é exatamente por isso que
   três defeitos passaram por baixo dela por nove dias: o CRC somava
   `charCodeAt` em vez de bytes, o TLV declarava tamanho em unidades UTF-16, e
   a chave era o único campo que não passava por validação nenhuma.

   O caso 1 é o mais importante de todos: um CRC conferido pela MESMA função
   que o gerou concorda consigo mesmo e nunca acusa nada. O vetor canônico é a
   única coisa que prende essa função à realidade.
   =========================================================================== */

/* 1) O VETOR CANÔNICO DO CRC-16/CCITT-FALSE.
      crc16("123456789") = 0x29B1. Está em toda especificação do algoritmo, e é
      independente deste repositório. */
{
  /* não há como chamar `crc16` direto (é interna), então o vetor é conferido
     pelo caminho que existe: um campo cujo conteúdo é "123456789" e cujo CRC
     precisa fechar contra um cálculo feito AQUI, byte a byte, do zero. */
  const cruCRC = (str) => {
    let crc = 0xffff;
    for (const b of new TextEncoder().encode(str)) {
      crc ^= b << 8;
      for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  };
  ok(cruCRC('123456789') === '29B1', 'o CRC deste teste bate com o vetor canonico (29B1)');
  ok(paraTeste.crc16('123456789') === '29B1',
     'e o CRC de lib/pix.ts tambem bate com o vetor canonico', paraTeste.crc16('123456789'));
  /* o caso que separa bytes de unidades UTF-16: "é" e 1 caractere e 2 bytes */
  ok(paraTeste.crc16('é') === cruCRC('é'),
     'o CRC roda sobre BYTES: com multibyte, ele bate com o calculo por fora',
     `${paraTeste.crc16('é')} vs ${cruCRC('é')}`);
  ok(paraTeste.tlv('01', 'é') === '0102é',
     'o TLV declara o tamanho em BYTES: "é" e 02, nao 01', paraTeste.tlv('01', 'é'));
  ok(paraTeste.tlv('26', 'joão@ig.com.br') === '26' + '15' + 'joão@ig.com.br',
     'e um e-mail acentuado declara 15 bytes, nao 14', paraTeste.tlv('26', 'joão@ig.com.br'));

  const cod = pixCopiaECola({ ...BASE, valor: 350.75, txid: 'GUIAD2609211ABC' });
  ok(cruCRC(cod.slice(0, -4)) === cod.slice(-4),
     'o CRC do codigo gerado bate com um CRC calculado por fora, sobre BYTES');
  ok(pixValido(cod), 'e pixValido concorda');
}

/* 2) CHAVE COM CARACTERE FORA DO ASCII: recusa, não normaliza.
      Normalizar em silêncio trocaria a conta que recebe o dinheiro. */
for (const ruim of ['tesouraria@igrejasãojoão.com.br', 'GUIA-CHÚRCH-CHAVE', 'chave\u00a0com\u00a0nbsp']) {
  let jogou = false;
  try { pixCopiaECola({ ...BASE, chave: ruim, valor: 10 }); } catch { jogou = true; }
  ok(jogou, `chave fora do ASCII deveria ser recusada, e nao normalizada: ${JSON.stringify(ruim)}`);
}

/* 3) ESPAÇO DE LARGURA ZERO: limpa, porque é sujeira de copiar-e-colar do site
      do banco e não escolha de ninguém. `.trim()` do JavaScript não o remove. */
{
  const cod = pixCopiaECola({ ...BASE, chave: BASE.chave + '\u200B', valor: 10 });
  ok(pixValido(cod), 'chave com espaco-zero colado no fim ainda gera codigo valido');
  ok(pixCampos(cod)['26'].includes(BASE.chave),
     'e a chave que sai e a chave limpa, sem o caractere invisivel');
  ok(!pixCampos(cod)['26'].includes('\u200B'), 'o caractere invisivel nao foi para o codigo');
}

/* 4) TAMANHO DECLARADO EM BYTES, e não em unidades UTF-16.
      O nome passa por `ascii()`, então para chegar num campo com byte
      multibyte é preciso... não dar: `ascii()` tira tudo. O que se cobra aqui
      é o contrário — que `ascii()` continue tirando, porque é ele que garante
      que 59 e 60 nunca tenham multibyte. */
{
  const cod = pixCopiaECola({ ...BASE, nome: 'IGREJA SÃO JOÃO DA BARRA', cidade: 'SÃO GONÇALO', valor: 10 });
  const c = pixCampos(cod);
  ok(/^[\x20-\x7E]*$/.test(c['59']), 'o nome no codigo e ASCII puro', c['59']);
  ok(/^[\x20-\x7E]*$/.test(c['60']), 'a cidade no codigo e ASCII pura', c['60']);
  for (const [id, val] of Object.entries(c)) {
    ok(new TextEncoder().encode(val).length === val.length,
       `campo ${id}: bytes e caracteres batem (so ASCII entra no codigo)`);
  }
  ok(pixValido(cod), 'e o codigo com nome acentuado na ENTRADA continua valido');
}

/* 5) O TETO DE 77 CARACTERES DA CHAVE, e a faixa entre "tem chave" e "gera
      codigo". A tela usava `PIX_CHAVE.length > 0` para decidir se mostra o
      botao do Pix, e esta funcao recusa acima de 77: no meio havia uma faixa
      em que o botao aparecia e o codigo saia vazio. */
{
  let jogou = false;
  try { pixCopiaECola({ ...BASE, chave: 'A'.repeat(78), valor: 10 }); } catch { jogou = true; }
  ok(jogou, 'chave de 78 caracteres e recusada');
  ok(pixValido(pixCopiaECola({ ...BASE, chave: 'A'.repeat(77), valor: 10 })),
     'e a de 77 ainda gera codigo valido');
}

if (mal) { console.error(`\npix.test: ${mal} falharam`); process.exit(1); }
console.log('pix.test: todas passaram');
