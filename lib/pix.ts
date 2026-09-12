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
function crc16(s: string): string {
  let crc = 0xffff;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
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
  if (valor.length > 99) throw new Error(`pix: campo ${id} tem ${valor.length} caracteres (máximo 99)`);
  return id + String(valor.length).padStart(2, '0') + valor;
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
  const k = (chave || '').trim();
  if (!k) throw new Error('pix: chave vazia');
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
