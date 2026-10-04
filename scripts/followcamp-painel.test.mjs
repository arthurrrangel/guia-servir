/* O painel do Follow Camp (04/10/2026, migração 110). Roda com `npm test`.

   O que este arquivo protege, em ordem de quanto custa errar:

     1. O DINHEIRO. "Recebido" é só o conferido; o aviso de "paguei" fica em
        "A conferir" e não entra no recebido. Quitado só com o recebido
        cobrindo o devido; desistência sai das contas; tudo em centavos
        (0,10 + 0,20 dá 0,30, e não 0,30000000000000004).
     2. O AVISO DO SITE. O valor que a página manda tem que ser o da regra
        (Pix direto) ou o do link do lote (cartão); código no formato; nada
        depois do 1º lote.
     3. A EXPORTAÇÃO. Excel em português: BOM, ponto e vírgula, e célula de
        texto sem fórmula ("=HYPERLINK" na alergia não roda na máquina de
        quem abrir).
     4. A FICHA DO WHATSAPP. O texto que a própria ficha manda volta inteiro
        pelo painel, com o prefixo que o WhatsApp põe na frente.          */
import {
  situacaoDe, resumoDe, ordenarSituacoes, csvFichas, csvPagamentos, lerFichaDoWhatsApp, centavos, reais, nomeDoArquivo,
} from '../lib/followcamp-painel.ts';
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
  const cp = csvPagamentos([pag('A', 627.3, { quem_pagou: '@golpe' })]);
  ok(cp.includes(';627,3;') && cp.includes(`'@golpe`), `pagamentos: vírgula decimal e sem fórmula`);
  ok(/^follow-camp-fichas-\d{4}-\d{2}-\d{2}\.csv$/.test(nomeDoArquivo('fichas', new Date('2026-10-04T02:00:00Z'))), 'nome do arquivo');
  ok(nomeDoArquivo('fichas', new Date('2026-10-04T02:00:00Z')).includes('2026-10-03'), 'a data do arquivo é a de Brasília');
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
