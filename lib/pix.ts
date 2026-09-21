/* =============================================================================
   O CÓDIGO PIX, MONTADO AQUI DENTRO — 12/09/2026

   Para a pessoa ofertar pelo celular com o valor já preenchido, o site precisa
   de um "Pix copia e cola". A forma óbvia seria pedir um à API de cobrança do
   banco a cada oferta. Não é o que este arquivo faz, e a diferença importa:

     API de cobrança   →  precisa de certificado, client_id/secret, ambiente de
                          homologação, e uma chamada de rede POR OFERTA. Se o
                          banco estiver fora do ar às 11h de domingo, ninguém
                          oferta.
     BR Code estático  →  é uma STRING que se monta com a chave Pix, o nome, a
                          cidade e o valor. Nenhuma rede, nenhum segredo,
                          nenhuma dependência. Funciona com o servidor do banco
                          derrubado.

   O padrão é o EMV® QRCPS-MPM que o Banco Central adotou: campos em TLV
   (id de 2 dígitos + tamanho de 2 dígitos + valor) e um CRC-16 no fim. O
   dinheiro cai direto na conta da chave, sem adquirente no meio e sem taxa de
   intermediário — só a tarifa que o banco cobrar de Pix recebido.

   O QUE ESTE ARQUIVO NÃO RESOLVE: cartão e Apple Pay. Aqueles precisam de
   adquirente, porque são trilho de cartão. Aqui é só o Pix.
   ============================================================================= */

/* ------------------------------------------------------------------ CRC-16 ---
   CRC-16/CCITT-FALSE: polinômio 0x1021, valor inicial 0xFFFF, sem reflexão de
   entrada nem de saída, sem xor final. É o único jeito de o app do banco
   aceitar o código: errar o CRC devolve "QR Code inválido" e mais nada. */
/* O CRC RODA SOBRE BYTES UTF-8, E NÃO SOBRE `charCodeAt` — 21/09/2026.

   `charCodeAt` devolve unidades UTF-16. Para ASCII puro é a mesma coisa que o
   byte, e foi por isso que isto passou despercebido por nove dias: a chave da
   igreja é um CNPJ. Para qualquer caractere fora do ASCII são coisas
   diferentes, e o app do banco lê BYTES.

   Medido: com a chave `tesouraria@igrejasãojoão.com.br`, o CRC calculado aqui
   não fecha com o CRC que o app do banco calcula, e o código é recusado com
   "QR Code inválido" — sem dizer por quê. E `pixValido()` conferia com ESTA
   mesma função, então ele concordava consigo mesmo e nunca acusava nada.

   O vetor canônico do CRC-16/CCITT-FALSE é crc16("123456789") = 0x29B1, e
   `scripts/pix.test.mjs` passou a cobrá-lo. */
const bytesDe = (s: string) => new TextEncoder().encode(s);

function crc16(s: string): string {
  let crc = 0xffff;
  for (const byte of bytesDe(s)) {
    crc ^= byte << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/* --------------------------------------------------------------------- TLV ---
   O tamanho é o do VALOR, em dois dígitos. Acima de 99 caracteres o padrão não
   cabe, e nenhum campo nosso chega perto — mas se um dia chegar, é melhor
   estourar aqui do que gerar um código que o banco recusa em silêncio. */
function tlv(id: string, valor: string): string {
  /* EM BYTES, pelo mesmo motivo do CRC (21/09/2026): o padrão conta bytes e o
     app do banco também. Declarar 31 num valor de 33 bytes faz o parser ler 31
     bytes e PARAR NO MEIO — medido com uma chave de e-mail acentuada, o
     `.com.br` virou `.com.` e os dois últimos bytes ficaram órfãos. */
  const n = bytesDe(valor).length;
  if (n > 99) throw new Error(`pix: campo ${id} tem ${n} bytes (máximo 99)`);
  return id + String(n).padStart(2, '0') + valor;
}

/** Texto que o padrão aceita: sem acento, sem símbolo, cortado no limite.
 *  O app do banco mostra este texto para a pessoa antes de ela confirmar, e
 *  acento fora do ASCII é a causa mais comum de código recusado. */
function ascii(t: string, max: number): string {
  return (t || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[^A-Za-z0-9 .\-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
}

export type CodigoPix = {
  /** A chave Pix que recebe. Só dígitos para CNPJ/CPF/telefone, ou e-mail, ou
   *  a chave aleatória. Vai inteira para o campo 26-01. */
  chave: string;
  /** Quem aparece na tela do app de quem paga. Máximo 25 caracteres. */
  nome: string;
  /** Cidade do recebedor. Máximo 15 caracteres. */
  cidade: string;
  /** Valor em reais. Ausente ou 0 = a pessoa digita o valor no app do banco. */
  valor?: number | null;
  /** Identificador da transação, até 25 caracteres alfanuméricos. É o único
   *  campo que volta no registro do Pix recebido, então é por ele que se
   *  reconcilia quem ofertou o quê. `***` (o padrão) significa "nenhum". */
  txid?: string | null;
};

/** Limite do BR Code. Acima disso o QR fica denso demais para ler de longe e
 *  alguns apps recusam. Nosso código completo fica em torno de 130. */
const MAX = 512;

/**
 * Monta o "Pix copia e cola" (BR Code estático, EMV QRCPS-MPM).
 *
 * O mesmo texto serve para os dois usos: colado no app do banco, ou desenhado
 * como QR. São a mesma coisa — o QR é só este texto em forma de imagem.
 */
export function pixCopiaECola({ chave, nome, cidade, valor, txid }: CodigoPix): string {
  /* A CHAVE É O ÚNICO CAMPO QUE NÃO PASSA POR `ascii()`, E ISSO ESTÁ CERTO:
     ela não é texto para uma pessoa ler, é a conta que recebe o dinheiro.
     Limpar acento dela em silêncio seria trocar a conta de destino.

     Então a regra é o contrário: caractere invisível de copiar-e-colar sai,
     porque é sujeira e não escolha de ninguém; qualquer outra coisa fora do
     ASCII imprimível faz o código NÃO SER GERADO. Chave Pix é CPF, CNPJ,
     telefone, e-mail ou UUID — nenhum deles tem acento, e uma que tenha é
     erro de digitação em algo que decide para onde o dízimo vai.

     `\u200B` (espaço de largura zero) sobrevive ao `.trim()` do JavaScript e
     é o que vem junto quando se copia a chave do site do banco. Medido: com
     ele colado no fim, o código saía com a chave errada e o CRC quebrado, e
     `pixValido()` dizia que estava tudo bem. */
  const k = (chave || '').replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').trim();
  if (!k) throw new Error('pix: chave vazia');
  if (!/^[\x20-\x7E]+$/.test(k)) {
    throw new Error('pix: a chave tem caractere fora do ASCII. Chave Pix e CPF, CNPJ, telefone, e-mail ou UUID — confira NEXT_PUBLIC_PIX_CHAVE.');
  }
  if (k.length > 77) throw new Error('pix: chave com mais de 77 caracteres');

  const n = ascii(nome, 25) || 'RECEBEDOR';
  const c = ascii(cidade, 15) || 'BRASIL';

  /* O txid aceita só letras e números. `***` é o valor que o padrão reserva
     para "não tem", e é o que vai quando ninguém informa nada. */
  const t = (txid || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25);

  const partes = [
    tlv('00', '01'), // indicador de formato do payload
    /* 26 = conta do recebedor. `br.gov.bcb.pix` é o identificador do arranjo
       Pix dentro do padrão EMV, e não muda. */
    tlv('26', tlv('00', 'br.gov.bcb.pix') + tlv('01', k)),
    tlv('52', '0000'), // MCC: 0000 = não informado
    tlv('53', '986'), // moeda: 986 = real
  ];

  /* 54 = valor. AUSENTE é diferente de ZERO: ausente manda o app pedir o valor
     para a pessoa; presente trava o valor. A tela de oferta usa as duas coisas
     — botão de R$50 manda 50, botão "outro valor" não manda campo nenhum. */
  if (valor != null && valor > 0) {
    const v = Math.round(valor * 100) / 100;
    if (!Number.isFinite(v) || v > 99999999.99) throw new Error('pix: valor inválido');
    partes.push(tlv('54', v.toFixed(2)));
  }

  partes.push(
    tlv('58', 'BR'), // país
    tlv('59', n), // nome do recebedor
    tlv('60', c), // cidade do recebedor
    tlv('62', tlv('05', t || '***')), // dados adicionais: 05 = txid
  );

  /* O CRC entra por cima de tudo, INCLUINDO o próprio "6304" — é o que o
     padrão manda, e é o erro mais fácil de cometer aqui. */
  const corpo = partes.join('') + '6304';
  const cod = corpo + crc16(corpo);

  if (cod.length > MAX) throw new Error(`pix: código com ${cod.length} caracteres (máximo ${MAX})`);
  return cod;
}

/** Confere um código que já existe: o CRC dos últimos 4 caracteres bate com o
 *  resto? Serve para o teste e para nunca publicar um QR que o banco recusa. */
export function pixValido(cod: string): boolean {
  if (!cod || cod.length < 8) return false;
  const corpo = cod.slice(0, -4);
  if (!corpo.endsWith('6304')) return false;
  return crc16(corpo) === cod.slice(-4).toUpperCase();
}

/** EXPOSTO SÓ PARA O TESTE, E COM MOTIVO ESCRITO — 21/09/2026.
 *
 *  `crc16` e `tlv` passaram a trabalhar em BYTES. Só que, depois que a chave
 *  passou a ser recusada quando tem caractere fora do ASCII, NADA que chega ao
 *  código é multibyte: `ascii()` limpa nome e cidade, o txid é alfanumérico, e
 *  o resto são constantes. Ou seja, byte e caractere passaram a dar sempre o
 *  mesmo número pelo caminho público.
 *
 *  Medido: sabotando `crc16` de volta para `charCodeAt` e `tlv` de volta para
 *  `.length`, a suíte continuava verde. Correção que a suíte não consegue ver
 *  é correção que a próxima pessoa desfaz sem saber.
 *
 *  Então as duas ficam alcançáveis por aqui. Elas continuam sendo detalhe
 *  interno — quem usa este módulo usa `pixCopiaECola` —, e o que este par
 *  prende é a conformidade com o padrão, que precisa valer mesmo no dia em que
 *  algum campo voltar a aceitar multibyte. */
export const paraTeste = { crc16, tlv };

/** Lê um BR Code de volta para pares id→valor. Usado só pelo teste: é assim
 *  que se prova que o valor que entrou é o valor que saiu, sem confiar na
 *  própria função que montou. */
export function pixCampos(cod: string): Record<string, string> {
  const fora: Record<string, string> = {};
  let i = 0;
  while (i + 4 <= cod.length) {
    const id = cod.slice(i, i + 2);
    const n = parseInt(cod.slice(i + 2, i + 4), 10);
    if (!Number.isFinite(n)) break;
    fora[id] = cod.slice(i + 4, i + 4 + n);
    i += 4 + n;
  }
  return fora;
}
