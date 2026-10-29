/* O painel do Follow Camp (04/10/2026, migração 110). Roda com `npm test`.

   O que este arquivo protege, em ordem de quanto custa errar:

     1. O DINHEIRO. "Recebido" é só o conferido; o aviso de "paguei" fica em
        "A conferir" e não entra no recebido. Quitado só com o recebido
        cobrindo o devido; desistência sai das contas; tudo em centavos
        (0,10 + 0,20 dá 0,30, e não 0,30000000000000004).
     2. O AVISO DO SITE. O valor que a página manda tem que ser o da regra
        (Pix direto) ou o do link do lote (cartão); código no formato; nada
        depois do 1º lote.
     3. A EXPORTAÇÃO. Fichas em CSV para o Excel em português: BOM, ponto e
        vírgula, e célula de texto sem fórmula ("=HYPERLINK" na alergia não
        roda na máquina de quem abrir). Pagamentos numa planilha .xlsx (29/10):
        zip íntegro, XML bem formado, as três abas, dinheiro como número, data
        como data, texto do usuário nunca como fórmula, totais certos.
     4. A FICHA DO WHATSAPP. O texto que a própria ficha manda volta inteiro
        pelo painel, com o prefixo que o WhatsApp põe na frente.          */
import {
  situacaoDe, resumoDe, ordenarSituacoes, csvFichas, lerFichaDoWhatsApp, centavos, reais, nomeDoArquivo,
} from '../lib/followcamp-painel.ts';
import { planilhaDePagamentos, dataDoExcel } from '../lib/followcamp-planilha.ts';
import { letraDaColuna, nomeDeAba, serialDe } from '../lib/xlsx.ts';
import { conferirInformado, LINKS_CARTAO } from '../lib/followcamp.ts';
import { conferirFicha, mensagemDaFicha } from '../lib/followcamp-ficha.ts';

let mal = 0;
const ok = (cond, queixa) => { if (!cond) { mal++; console.error(`MAL  ${queixa}`); } };

const ficha = (id, extra = {}) => ({
  id, recebida_em: '2026-10-04T15:00:00Z', origem: 'site', campista: `Campista ${id}`, nascimento: '2010-03-14', idade: 16,
  sexo: 'feminino', camisa: 'M', whats_campista: null, alergias: null, saude: null, responsavel_nome: 'Mãe', responsavel_cpf: null,
  responsavel_whats: '(21) 98888-7777', parentesco: 'Mãe', emergencia_nome: null, emergencia_whats: null, irmao: null,
  valor: 697, pagamento: 'pix', imagem: true, termo: 't', versao_termo: 'v1', lancada_por: null,
  cancelada_em: null, cancelada_por: null, motivo: null, ...extra,
});
let n = 0;
const pag = (ficha_id, valor, extra = {}) => ({
  id: `p${++n}`, criado_em: `2026-10-04T15:0${n % 10}:00Z`, pago_em: '2026-10-04', ficha_id, campista: 'x', referente: 'inscricao',
  forma: 'pix_direto', valor, quem_pagou: null, codigo: null, conferido: true, origem: 'manual', stone_pedido: null,
  observacao: null, registrado_por: null, ...extra,
});

/* ------------------------------------------------------------ 1. dinheiro --- */
const F = [
  ficha('A'),                                                    // pagou tudo
  ficha('B', { valor: 627.3, irmao: 'Irmão B', pagamento: 'carne' }), // pagou parte + aviso
  ficha('C', { cancelada_em: '2026-10-04T16:00:00Z' }),          // desistiu (com pagamento)
  ficha('D', { valor: null, pagamento: null }),                  // a confirmar
  ficha('E', { origem: 'whatsapp', pagamento: 'dinheiro' }),     // só aviso, não conferido
];
const P = [
  pag('A', 697),
  pag('B', 300, { forma: 'dinheiro' }),
  pag('B', 100, { conferido: false, origem: 'site', forma: 'pix_direto' }),
  pag('C', 697),
  pag('E', 697, { conferido: false, origem: 'site', forma: 'link_stone' }),
  pag(null, 50, { forma: 'link_stone' }),
];
{
  const s = id => situacaoDe(F.find(f => f.id === id), P);
  ok(s('A').status === 'quitado' && s('A').recebido === 69700 && s('A').falta === 0, `A quitado: ${JSON.stringify(s('A').status)}`);
  ok(s('B').status === 'parcial' && s('B').recebido === 30000 && s('B').aConferir === 10000 && s('B').falta === 32730, 'B: parcial, o aviso não abate o que falta');
  ok(s('C').status === 'cancelada', 'C: desistência');
  ok(s('D').status === 'pendente' && s('D').devido === null && s('D').falta === null, 'D: valor a confirmar não vira dívida');
  ok(s('E').status === 'a_conferir' && s('E').recebido === 0 && s('E').aConferir === 69700, 'E: só aviso é A CONFERIR, e não pago');

  const r = resumoDe(F, P);
  ok(r.inscritos === 4 && r.desistencias === 1 && r.pelosite === 3 && r.lancadas === 1, `contagem de fichas: ${JSON.stringify(r)}`);
  ok(r.quitados === 1 && r.parciais === 1 && r.pendentes === 2, 'quitados, parciais e pendentes (o a conferir conta como pendente)');
  ok(r.recebido === 69700 + 30000 + 69700 + 5000, `recebido é só o conferido (inclusive o sem ficha e o da desistência): ${r.recebido}`);
  ok(r.aConferir === 10000 + 69700 && r.aConferirQtd === 2, 'a conferir: soma e quantidade');
  ok(r.devido === 69700 + 62730 + 69700 && r.falta === 0 + 32730 + 69700, `devido e falta só das ativas com valor: ${r.devido}/${r.falta}`);
  ok(r.recebidoPorForma.pix_direto === 139400 && r.recebidoPorForma.dinheiro === 30000 && r.recebidoPorForma.link_stone === 5000, 'recebido por meio');
  ok(r.escolheram.pix === 1 && r.escolheram.carne === 1 && r.escolheram.dinheiro === 1 && r.escolheram.sem === 1, 'o que escolheram na ficha');
  ok(r.semFicha === 1 && r.semFichaValor === 5000, 'pagamento sem ficha');

  const ordem = ordenarSituacoes(F.map(f => situacaoDe(f, P))).map(x => x.ficha.id).join('');
  ok(ordem === 'EBDAC', `a ordem da lista: a conferir, parcial, pendente, pago, desistência (${ordem})`);

  const c = resumoDe([ficha('X', { valor: 0.3 })], [pag('X', 0.1), pag('X', 0.2)]);
  ok(c.recebido === 30 && c.quitados === 1 && c.falta === 0, `centavos: 0,10 + 0,20 = 0,30 quita 0,30 (${c.recebido})`);
  ok(centavos(627.3) === 62730 && /627,30/.test(reais(62730)), 'centavos e reais');
}

/* ------------------------------------------------------ 2. aviso do site --- */
{
  const ANTES = new Date('2026-10-04T12:00:00-03:00');
  const base = { codigo: 'FC27K7P3M9QX', campista: 'Maria Souza', referente: 'inscricao', irmao: '', valor: 697, meio: 'pixdireto', titular: '' };
  const v = conferirInformado(base, ANTES);
  ok(v.ok && v.dados.valor === 697 && v.dados.meio === 'pixdireto', `Pix direto de 697: ${JSON.stringify(v)}`);
  ok(!conferirInformado({ ...base, valor: 600 }, ANTES).ok, 'valor diferente da regra');
  ok(!conferirInformado({ ...base, valor: '697' }, ANTES).ok, 'valor como texto');
  ok(!conferirInformado({ ...base, codigo: 'FC27-K7P3M9QX' }, ANTES).ok && !conferirInformado({ ...base, codigo: 'FC27IIIIIIII' }, ANTES).ok, 'código fora do formato');
  ok(!conferirInformado({ ...base, meio: 'pix' }, ANTES).ok, 'só Pix direto e link');
  ok(conferirInformado({ ...base, referente: 'irmaos', irmao: 'João Souza', valor: 627.3 }, ANTES).ok, 'irmãos no Pix: 627,30');
  ok(conferirInformado({ ...base, referente: 'parcela', valor: 174.25 }, ANTES).ok, 'parcela do carnê: o valor escolhido');
  const LINK = [{ lote: '1º lote', ref: 'inscricao', valor: 697, parcelas: 1, url: 'https://payment-link-v3.stone.com.br/pl_teste' }];
  ok(conferirInformado({ ...base, meio: 'cartaoLink', titular: 'Carlos Souza' }, ANTES, LINK).ok, 'link de 697 com quem pagou');
  ok(!conferirInformado({ ...base, meio: 'cartaoLink', referente: 'irmaos', irmao: 'João Souza', valor: 627.3 }, ANTES, LINK).ok, 'irmãos não têm link');
  ok(!conferirInformado({ ...base, meio: 'cartaoLink', titular: 'J0ão' }, ANTES, LINK).ok, 'quem pagou com dígito no nome');
  ok(!conferirInformado(base, new Date('2026-11-04T00:00:00-03:00')).ok, 'depois do 1º lote: não registra a inscrição pelo preço velho');
  ok(LINKS_CARTAO.every(l => conferirInformado({ ...base, meio: 'cartaoLink', referente: l.ref, irmao: l.ref === 'irmaos' ? 'João Souza' : '', valor: l.valor }, ANTES).ok),
    'os links de verdade passam no aviso');
}

/* ---------------------------------------------------------- 3. exportação --- */
{
  const F2 = [ficha('A', { campista: 'Ana; "Bia"', alergias: '=HYPERLINK("http://golpe","x")', saude: 'asma\nbombinha' })];
  const csv = csvFichas(F2, P);
  ok(csv.startsWith('﻿'), 'BOM na frente (o Excel lê o acento)');
  const linhas = csv.slice(1).trim().split('\r\n');
  ok(linhas[0].startsWith('Recebido em;Campista;') && linhas[0].endsWith(';Cancelada em;Motivo'), `cabeçalho: ${linhas[0].slice(0, 60)}`);
  ok(csv.includes('"Ana; ""Bia"""'), 'ponto e vírgula e aspas no nome vão entre aspas');
  ok(csv.includes(`'=HYPERLINK`) && !/;=HYPERLINK/.test(csv), 'a fórmula da alergia sai como texto');
  ok(csv.includes('"asma\nbombinha"'), 'quebra de linha fica dentro da célula');
  ok(/;697;/.test(csv), 'valor numérico como número');
  ok(nomeDoArquivo('pagamentos', new Date('2026-10-29T15:00:00Z'), 'xlsx') === 'follow-camp-pagamentos-2026-10-29.xlsx', 'a planilha de pagamentos é .xlsx');
  ok(/^follow-camp-fichas-\d{4}-\d{2}-\d{2}\.csv$/.test(nomeDoArquivo('fichas', new Date('2026-10-04T02:00:00Z'))), 'nome do arquivo');
  ok(nomeDoArquivo('fichas', new Date('2026-10-04T02:00:00Z')).includes('2026-10-03'), 'a data do arquivo é a de Brasília');
}

/* ------------------------------------- 3b. a planilha de pagamentos (.xlsx) ---
   Lida aqui como o Excel leria: o zip por dentro (CRC de cada arquivo
   conferido com uma conta independente), o XML bem formado, e o conteúdo. */
{
  const TAB = (() => { const t = []; for (let k = 0; k < 256; k++) { let c = k; for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t.push(c >>> 0); } return t; })();
  const crc = b => { let c = 0xffffffff; for (const x of b) c = TAB[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const abrir = bytes => {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const arqs = {};
    let o = 0, crcOk = true;
    while (dv.getUint32(o, true) === 0x04034b50) {
      const metodo = dv.getUint16(o + 8, true), c = dv.getUint32(o + 14, true), tam = dv.getUint32(o + 18, true);
      const nl = dv.getUint16(o + 26, true), el = dv.getUint16(o + 28, true);
      const nome = new TextDecoder().decode(bytes.subarray(o + 30, o + 30 + nl));
      const dados = bytes.subarray(o + 30 + nl + el, o + 30 + nl + el + tam);
      if (metodo !== 0 || crc(dados) !== c) crcOk = false;
      arqs[nome] = new TextDecoder().decode(dados);
      o += 30 + nl + el + tam;
    }
    return { arqs, crcOk, central: dv.getUint32(o, true) === 0x02014b50 };
  };
  /* XML bem formado o bastante para o Excel: cada tag fecha na ordem */
  const bemFormado = xml => {
    const pilha = [];
    for (const m of xml.replace(/<\?xml[^>]*\?>/, '').matchAll(/<(\/?)([A-Za-z_][\w:.-]*)[^>]*?(\/?)>/g)) {
      if (m[3]) continue;
      if (!m[1]) pilha.push(m[2]);
      else if (pilha.pop() !== m[2]) return false;
    }
    return pilha.length === 0 && !/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;)/.test(xml);
  };
  const P2 = [...P, pag('E', 10, { quem_pagou: '=HYPERLINK("http://golpe","x")', observacao: 'recibo 12 & <conferido>', pago_em: '2026-10-28', codigo: 'FC27K7P3M9QX' })];
  const agora = new Date('2026-10-29T15:00:00Z');
  const { arqs, crcOk, central } = abrir(planilhaDePagamentos(F, P2, agora));
  const partes = ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml',
    'xl/sharedStrings.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/worksheets/sheet3.xml', 'docProps/core.xml', 'docProps/app.xml'];
  ok(crcOk && central, 'xlsx: zip íntegro (CRC de cada parte confere, diretório central no fim)');
  ok(partes.every(x => x in arqs), `xlsx: as partes do Office Open XML: faltou ${partes.filter(x => !(x in arqs)).join(', ')}`);
  for (const [nome, xml] of Object.entries(arqs)) ok(bemFormado(xml), `xlsx: XML malformado em ${nome}`);
  ok(/<sheet name="Resumo"[^>]*\/><sheet name="Pagamentos"[^>]*\/><sheet name="Por campista"/.test(arqs['xl/workbook.xml']), 'xlsx: as três abas, nessa ordem');
  const sst = arqs['xl/sharedStrings.xml'];
  const textos = [...sst.matchAll(/<t xml:space="preserve">([^<]*)<\/t>/g)].map(m => m[1]);
  const sheet2 = arqs['xl/worksheets/sheet2.xml'];
  const formulas = [...Object.values(arqs).join('').matchAll(/<f>([^<]*)<\/f>/g)].map(m => m[1]);
  ok(textos.includes('=HYPERLINK(&quot;http://golpe&quot;,&quot;x&quot;)') && !formulas.some(f => /HYPERLINK/i.test(f)),
    'xlsx: o "=HYPERLINK" digitado vira texto, nunca fórmula');
  ok(textos.includes('recibo 12 &amp; &lt;conferido&gt;'), 'xlsx: & e < escapados no texto');
  ok(/<c r="E\d+" s="\d+"><v>697<\/v><\/c>/.test(sheet2) && /<v>300<\/v>/.test(sheet2), 'xlsx: valor é número (R$ 697 e R$ 300), não texto');
  ok(new RegExp(`<c r="A5" s="\\d+"><v>${serialDe(2026, 10, 4)}</v></c>`).test(sheet2), 'xlsx: a data do pagamento é data do Excel');
  /* conferido: 697 (A) + 300 (B) + 697 (C, desistiu depois) + 50 (sem ficha) + 10 (E) = 1754; a conferir: 100 (B) + 697 (E) = 797 */
  ok(/<f>SUMIFS\(E5:E11,G5:G11,&quot;Conferido&quot;\)<\/f><v>1754<\/v>/.test(sheet2), `xlsx: total conferido 1754 com a fórmula: ${formulas.join(' | ')}`);
  ok(/<f>SUMIFS\(E5:E11,G5:G11,&quot;A conferir&quot;\)<\/f><v>797<\/v>/.test(sheet2) && /<f>SUM\(E5:E11\)<\/f><v>2551<\/v>/.test(sheet2), 'xlsx: a conferir 797 e total 2551');
  ok(/<autoFilter ref="A4:[A-Z]+11"\/>/.test(sheet2) && /<pane ySplit="4" topLeftCell="A5"/.test(sheet2), 'xlsx: filtro e cabeçalho fixo nos pagamentos');
  ok(textos.includes('Conferido') && textos.includes('A conferir') && textos.includes('Avisou pelo site') && textos.includes('FC27-K7P3M9QX'), 'xlsx: rótulos e código legível');
  const sheet1 = arqs['xl/worksheets/sheet1.xml'];
  ok(/<v>1754<\/v>/.test(sheet1) && /<v>797<\/v>/.test(sheet1) && textos.includes('Recebido (conferido)') && textos.includes('Precisa de atenção'), 'xlsx: o resumo com o recebido conferido');
  const sheet3 = arqs['xl/worksheets/sheet3.xml'];
  ok(textos.includes('a confirmar') && textos.includes('Desistiu') && textos.includes('Total dos inscritos ativos'), 'xlsx: por campista com ficha a confirmar, desistência com dinheiro e total');
  ok(/<pane xSplit="1" ySplit="4" topLeftCell="B5" activePane="bottomRight"/.test(sheet3), 'xlsx: por campista com nome e cabeçalho fixos');
  ok(/<numFmt numFmtId="\d+" formatCode="&quot;R\$ &quot;#,##0\.00"\/>/.test(arqs['xl/styles.xml']) && /formatCode="dd\/mm\/yyyy"/.test(arqs['xl/styles.xml']), 'xlsx: moeda e data com formato');
  ok(/definedName name="_xlnm._FilterDatabase" localSheetId="1" hidden="1">&apos;Pagamentos&apos;!\$A\$4:\$[A-Z]+\$11</.test(arqs['xl/workbook.xml'])
    || /definedName name="_xlnm._FilterDatabase" localSheetId="1" hidden="1">'Pagamentos'!\$A\$4:\$[A-Z]+\$11</.test(arqs['xl/workbook.xml']), 'xlsx: o filtro tem o nome que o Excel espera');
  /* vazia: abre do mesmo jeito, com o recado em vez da tabela */
  const v = abrir(planilhaDePagamentos([], [], agora));
  ok(v.crcOk && Object.values(v.arqs).every(bemFormado) && v.arqs['xl/sharedStrings.xml'].includes('Nenhum pagamento registrado ainda.'), 'xlsx: sem nada, a planilha abre e diz que não há pagamento');
  /* as peças */
  ok(letraDaColuna(0) === 'A' && letraDaColuna(25) === 'Z' && letraDaColuna(26) === 'AA' && letraDaColuna(701) === 'ZZ' && letraDaColuna(702) === 'AAA', 'letra da coluna');
  ok(nomeDeAba('a/b:c?d*e[f]g') === 'a b c d e f g' && nomeDeAba('x'.repeat(40)).length === 31 && nomeDeAba('') === 'Planilha', 'nome de aba que o Excel aceita');
  ok(serialDe(1900, 3, 1) === 61 && serialDe(2026, 10, 29) === 46324, 'data do Excel (com o 29/02/1900 que o Excel inventou)');
  ok(dataDoExcel('2026-10-04') === serialDe(2026, 10, 4) && dataDoExcel('2026-10-04T02:10:00Z') === serialDe(2026, 10, 3) && dataDoExcel('lixo') === null,
    'data do pagamento: o dia de Brasília');
}

/* --------------------------------------------------- 4. ficha do WhatsApp --- */
{
  const MENOR = {
    campista: 'Maria Eduarda Souza', nascimento: '14/03/2010', sexo: 'feminino', camisa: 'M', whatsCampista: '',
    alergias: 'camarão', saude: '', respNome: 'Carla Souza', respCpf: '529.982.247-25', respWhats: '(21) 98888-7777',
    respParentesco: 'Mãe', emergNome: '', emergWhats: '', temIrmao: 'sim', irmao: 'João Souza', pagamento: 'pix', imagem: 'sim',
    termo: true, lgpd: true, site: '',
  };
  const ANTES = new Date('2026-10-04T12:00:00-03:00');
  const texto = '[04/10/2026 14:32] Carla: ' + mensagemDaFicha(conferirFicha(MENOR).ficha, ANTES);
  const r = lerFichaDoWhatsApp(texto);
  ok(r.ok, `leu a ficha: ${JSON.stringify(r)}`);
  const f = r.ficha;
  ok(f.campista === 'Maria Eduarda Souza' && f.nascimento === '2010-03-14' && f.idade === 16 && f.sexo === 'feminino' && f.camisa === 'M', 'campista, nascimento, idade, sexo, camisa');
  ok(f.alergias === 'camarão' && f.saude === null, 'alergia e "nada a informar" vira vazio');
  ok(f.responsavel_nome === 'Carla Souza' && f.parentesco === 'Mãe' && f.responsavel_cpf === '529.982.247-25' && f.responsavel_whats === '(21) 98888-7777', `responsável: ${JSON.stringify(f)}`);
  ok(f.irmao === 'João Souza' && f.valor === 627.3 && f.pagamento === 'pix' && f.imagem === true && /Termo de autorização/.test(f.termo), 'irmão, valor, pagamento, imagem, termo');

  const ADULTO = { ...MENOR, campista: 'Pedro Henrique Dias', nascimento: '20/07/2005', sexo: 'masculino', camisa: 'G', whatsCampista: '(21) 99594-6491',
    respNome: '', respCpf: '', respWhats: '', respParentesco: '', emergNome: 'Ana Dias', emergWhats: '(21) 97777-6666', temIrmao: 'nao', irmao: '',
    pagamento: 'cartao', imagem: 'nao' };
  const a = lerFichaDoWhatsApp(mensagemDaFicha(conferirFicha(ADULTO).ficha, ANTES)).ficha;
  ok(a.emergencia_nome === 'Ana Dias' && a.emergencia_whats === '(21) 97777-6666' && a.whats_campista === '(21) 99594-6491', 'adulto: emergência e WhatsApp próprio');
  ok(a.pagamento === 'cartao' && a.imagem === false && a.valor === 697 && a.responsavel_nome === null, 'adulto: cartão, sem imagem, 697');
  ok(!lerFichaDoWhatsApp('oi, quero me inscrever').ok, 'texto que não é ficha');
}

if (mal) { console.error(`\n${mal} problema(s) no painel do Follow Camp.`); process.exit(1); }
console.log('ok  followcamp-painel: recebido só conferido, centavos, aviso do site, exportação sem fórmula, ficha do WhatsApp');
