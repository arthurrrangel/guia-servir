/* A TELA DE OFERTA NÃO PODE AFIRMAR O QUE A IGREJA NÃO SABE — 21/09/2026.

   Auditoria do caminho do dinheiro. Três coisas foram medidas na tela de
   verdade, e as três são desta forma: a tela dizia algo sobre o dinheiro da
   pessoa que ninguém tinha conferido.

     1. `/ofertar?fim=1&t=dizimo&v=9999.00`, digitado à mão, com ZERO
        requisições saindo do site, escrevia:
            "Recebemos. Obrigado."
            "Dízimo de R$ 9.999,00. Que Deus multiplique o que você semeou."

     2. O botão "Já ofertei", no fim do passo do Pix, levava para a MESMA
        tela. O site não fala com banco nenhum nesse caminho: quem copiou o
        código, falhou no app do banco e voltou para tocar no botão saía da
        igreja achando que tinha dizimado.

     3. `v=999999` escrevia "R$ 999.999,00" numa tela cujo próprio teto é
        R$ 100.000.

   O precedente para consertar já estava escrito no mesmo arquivo, para o
   caso `pendente`: "escrever 'recebemos' ali seria a tela mentir para a
   pessoa sobre o dinheiro dela". Faltava aplicar ao Pix.

   Roda com `npm test`. */

import { fraseDoFim, MIN, MAX, TIPOS, valorInvalido, TEM_PIX, pixDisponivel, txidDe, PIX_CHAVE, PIX_NOME, PIX_CIDADE } from '@/lib/oferta';
import { pixCopiaECola, pixValido, pixCampos } from '@/lib/pix';

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => { feitas++; if (!c) { falhas++; console.log('  FALHOU:', rot, extra); } };

/* ------------------------------------------- 1) quem pode dizer "recebemos" */
{
  ok(fraseDoFim('cartao', false).titulo === 'Recebemos. Obrigado.',
     'voltando do adquirente, a igreja pode dizer que recebeu');
  ok(fraseDoFim('cartao', false).afirma === true,
     'e isso e uma AFIRMACAO sobre o dinheiro');

  ok(fraseDoFim('pix', false).titulo === 'Você marcou que já ofertou.',
     'pelo Pix, a frase e da PESSOA, nao da igreja', fraseDoFim('pix', false).titulo);
  ok(fraseDoFim('pix', false).afirma === false,
     'e a igreja NAO afirma ter recebido nada pelo Pix');

  ok(fraseDoFim('cartao', true).afirma === false, 'pendente nao e pago (ja era assim)');
  ok(fraseDoFim('pix', true).afirma === false, 'e pendente pelo Pix tambem nao');

  /* O CASO QUE MAIS IMPORTA, dito de outro jeito: existe ALGUM estado em que
     a igreja afirma ter recebido sem a palavra de um terceiro? */
  const afirmaSemTerceiro = [['pix', false], ['pix', true]]
    .filter(([o, p]) => fraseDoFim(o, p).afirma);
  ok(afirmaSemTerceiro.length === 0,
     'nenhum caminho sem confirmacao de terceiro afirma que a igreja recebeu',
     JSON.stringify(afirmaSemTerceiro));
}

/* ------------------------------------ 2) a faixa de valor e a mesma nas duas
   A tela do fim lê o valor da URL. Se ela aceitasse mais do que a tela de
   digitar aceita, daria para escrever qualquer número na tela de
   agradecimento da igreja. `lerVolta` prende em [MIN, MAX]; aqui se cobra que
   MIN e MAX sejam de fato a régua da tela de digitar. */
{
  /* `valorInvalido` devolve null quando esta certo, e a frase do erro quando
     nao esta. A primeira versao destes casos comparava com '' e reprovava os
     dois valores bons — erro meu, nao do codigo, e foi o teste que me contou. */
  ok(valorInvalido(MIN) === null, `${MIN} e um valor que a tela aceita`, String(valorInvalido(MIN)));
  ok(valorInvalido(MAX) === null, `${MAX} e um valor que a tela aceita`, String(valorInvalido(MAX)));
  ok(valorInvalido(MIN - 0.01) !== null, 'um centavo abaixo do minimo e recusado');
  ok(valorInvalido(MAX + 0.01) !== null, 'um centavo acima do maximo e recusado');
  ok(valorInvalido(999999) !== null,
     'R$ 999.999 e recusado pela tela — e por isso nao pode aparecer na tela do fim');
}

/* ------------------------- 3) o codigo do Pix, ou ele existe ou nao ha passo
   `TEM_PIX` dizia so `chave.length > 0`, e `pixCopiaECola` recusa chave acima
   de 77 caracteres ou fora do ASCII. Na faixa entre as duas, a tela desenhava
   o passo do Pix inteiro com o codigo VAZIO: QR da string vazia (que e um QR
   valido!), botao dizendo "Codigo copiado", nada na area de transferencia.

   `TEM_PIX` e calculado na carga do modulo a partir do ambiente, entao aqui se
   cobra a PERGUNTA, que e o que a tela passou a fazer: da para montar um
   codigo com esta chave? */
{
  /* `pixDisponivel` e A REGRA, e ela e testada aqui em qualquer maquina.
     `TEM_PIX` e a REGRA APLICADA A CHAVE DESTE AMBIENTE, e o invariante no fim
     do bloco so consegue ve-la quebrar quando o ambiente tem uma chave que as
     duas perguntas respondem diferente. Esta diferenca esta escrita em
     lib/oferta.ts, em vez de fingida. */
  const tenta = pixDisponivel;
  ok(tenta('12345678000195'), 'com a chave certa, da para montar codigo');
  ok(!tenta(''), 'chave vazia: nao da');
  ok(!tenta('A'.repeat(78)), 'chave de 78 caracteres: nao da — e era aqui que a tela mentia');
  ok(!tenta('tesouraria@igrejasãojoão.com.br'), 'chave com acento: nao da');
  ok(tenta('12345678000195​'), 'chave com espaco-zero colado: da, porque a sujeira e limpa');

  /* O INVARIANTE, E SEM ELE OS CASOS DE CIMA SAO DECORATIVOS.

     Os cinco acima medem `pixCopiaECola`, que sempre esteve certa. Quem
     mentia era `TEM_PIX`, e ele le o ambiente — entao um teste que so chama
     `tenta()` nao ve `TEM_PIX` voltar a ser `chave.length > 0`. Medido
     sabotando: passava verde.

     O que se cobra aqui e que as DUAS respondam a mesma pergunta, qualquer
     que seja a chave configurada nesta maquina (local, sem .env, ela e vazia
     e os dois lados dizem `false`). */
  ok(TEM_PIX === tenta(PIX_CHAVE),
     'TEM_PIX responde a MESMA pergunta que pixCopiaECola: da para montar codigo com esta chave?',
     `TEM_PIX=${TEM_PIX} e montar=${tenta(PIX_CHAVE)} com chave de ${PIX_CHAVE.length} caracteres`);
  ok(typeof PIX_NOME === 'string' && typeof PIX_CIDADE === 'string',
     'nome e cidade do recebedor existem como texto');
}

/* --------------------------------- 4) e o codigo que sai e o codigo da tela
   O que a pessoa lê na tela (o valor) tem que ser o que está dentro do código
   que ela cola no banco. É a única coisa nesta tela que move dinheiro. */
{
  for (const v of [1, 10, 49.9, 350.75, 100000]) {
    const cod = pixCopiaECola({ chave: '12345678000195', nome: 'IGREJA GUIA', cidade: 'RIO DE JANEIRO', valor: v, txid: 'GUIAD260921AAAA' });
    ok(pixValido(cod), `R$ ${v}: o codigo fecha o CRC`);
    ok(pixCampos(cod)['54'] === v.toFixed(2),
       `R$ ${v}: o valor dentro do codigo e o mesmo da tela`, pixCampos(cod)['54']);
    ok(pixCampos(cod)['26'].includes('12345678000195'),
       `R$ ${v}: a chave dentro do codigo e a da igreja`);
  }
}

/* ------------------------------------------- 5) os dois tipos existem mesmo */
{
  ok(TIPOS.some(t => t.id === 'dizimo') && TIPOS.some(t => t.id === 'oferta'),
     'dizimo e oferta continuam sendo os dois tipos que a tela do fim sabe escrever');
}

/* -------------------------------- 6) o txid, que e a chave de idempotencia
   Ele vai ao adquirente como `x-idempotency-key`. Numa colisao, a segunda
   pessoa recebe a resposta GUARDADA da primeira — e e mandada para o link de
   pagamento da oferta de outra pessoa, com o valor e o tipo dela.

   Eram quatro caracteres de um alfabeto de 32: espaco de 1.048.576 por DIA e
   por TIPO. Medido em 2.000 domingos simulados de 200 ofertas de cartao: 29
   domingos com colisao, 1,45%. */
{
  const FORMATO = /^GUIA[DO][0-9]{6}[A-Z0-9]{6,20}$/;
  ok(FORMATO.test(txidDe('dizimo')), 'o txid de dizimo casa o formato', txidDe('dizimo'));
  ok(FORMATO.test(txidDe('oferta')), 'o txid de oferta casa o formato', txidDe('oferta'));
  ok(txidDe('dizimo')[4] === 'D' && txidDe('oferta')[4] === 'O',
     'a letra do meio diz o tipo, que e por onde a tesouraria reconcilia');
  ok(txidDe('dizimo').length <= 25,
     'e ele cabe no campo 62-05 do Pix, que aceita 25', String(txidDe('dizimo').length));

  /* O CASO QUE MEDE O ESPACO, e nao o formato. 200 mil sorteios: com 4
     caracteres davam ~174 mil distintos (um monte de colisao); com 10, tem que
     dar 200 mil, porque o espaco ficou grande demais para repetir. */
  const N = 200000;
  const vistos = new Set();
  for (let i = 0; i < N; i++) vistos.add(txidDe('dizimo'));
  ok(vistos.size === N,
     `${N} txid sorteados no mesmo dia e tipo tem que dar ${N} distintos`,
     `deram ${vistos.size}`);

  /* e o alfabeto nao tem vies: 256 / tamanho tem que ser exato, senao alguns
     simbolos saem mais que outros e o espaco util encolhe */
  const cont = new Map();
  for (const t of vistos) for (const ch of t.slice(11)) cont.set(ch, (cont.get(ch) || 0) + 1);
  const vals = [...cont.values()];
  const media = vals.reduce((a, b) => a + b, 0) / vals.length;
  const pior = Math.max(...vals.map(v => Math.abs(v - media) / media));
  ok(pior < 0.05, 'o alfabeto do sorteio nao tem vies de modulo',
     `o simbolo mais desviado esta ${(pior * 100).toFixed(1)}% fora da media`);
}

/* ------------------------------------ 7) o centavo e regra do SERVIDOR
   A tela nunca produz fracao de centavo, entao isto nao muda nada para quem
   usa o site. Existe porque `app/api/ofertar/checkout/route.ts` chama esta
   mesma funcao, e quem chama a rota direto nao passa pela tela. Medido antes:
   `valor: 1.005` respondia 200, o checkout MOSTRAVA R$ 1,01 e COBRAVA 100
   centavos, e a tela de volta dizia R$ 1,00. */
{
  ok(valorInvalido(1.005) !== null, 'meio centavo e recusado');
  ok(valorInvalido(1.015) !== null, 'e o outro meio centavo tambem');
  ok(valorInvalido(36.035) !== null, 'fracao de centavo em valor maior tambem');
  ok(valorInvalido(1.01) === null, 'mas um centavo exato passa', String(valorInvalido(1.01)));
  ok(valorInvalido(350.75) === null, 'e R$ 350,75 passa', String(valorInvalido(350.75)));
  ok(valorInvalido(49.9) === null, 'e R$ 49,90 passa', String(valorInvalido(49.9)));
}

if (falhas) { console.log(`\nofertar-nao-mente: ${falhas} falha(s) em ${feitas}\n`); process.exit(1); }
console.log(`\nofertar-nao-mente: ${feitas}/${feitas} ok\n`);
