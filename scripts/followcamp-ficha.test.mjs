/* A ficha de inscrição do Follow Camp 2027. Roda com `npm test`.

   O que este arquivo protege, em ordem de quanto custa errar:

     1. A IDADE NO DIA DO CAMP. De 13 a 24 anos em 05/02/2027, aniversário no
        próprio dia contando; e quem é menor de 18 nesse dia precisa do
        responsável com CPF válido e do termo aceito.
     2. A PLANILHA. Texto que começa com = + - @ vira fórmula no Google
        Planilhas: "=IMPORTXML(...)" digitado na alergia rodaria na planilha da
        igreja. Toda célula de texto sai com o apóstrofo na frente. A linha tem
        exatamente as colunas do cabeçalho.
     3. O QUE CONTA COMO GRAVADO. Só JSON com ok:true; a página HTML de erro do
        Google (200) NÃO é gravado. Conferido contra um dublê HTTP local.
     4. O RESTO DA FICHA: nomes, WhatsApp, irmão, pagamento, imagem,
        consentimento, isca.                                                  */
import http from 'node:http';
import {
  lerData, idadeEm, conferirFicha, linhaDaFicha, CABECALHO, semFormula, termoDe, mensagemDaFicha,
  mensagemDeAviso, valorDaFicha, mascaraData, mascaraCpf, mascaraCelular, VERSAO_TERMO,
} from '../lib/followcamp-ficha.ts';

let mal = 0;
const ok = (cond, queixa) => { if (!cond) { mal++; console.error(`MAL  ${queixa}`); } };

/* -------------------------------------------------------------- datas --- */
ok(lerData('14/03/2009')?.ano === 2009, 'data comum');
ok(lerData('31/02/2010') === null, '31/02 não existe');
ok(lerData('29/02/2010') === null && lerData('29/02/2012') !== null, '29/02 só em ano bissexto');
ok(lerData('2009-03-14') === null && lerData('1/3/2009') === null && lerData('') === null, 'só dd/mm/aaaa');
ok(idadeEm({ dia: 5, mes: 2, ano: 2014 }) === 13, 'aniversário no dia do Camp conta');
ok(idadeEm({ dia: 6, mes: 2, ano: 2014 }) === 12, 'um dia depois: ainda 12');
ok(idadeEm({ dia: 4, mes: 2, ano: 2009 }) === 18 && idadeEm({ dia: 6, mes: 2, ano: 2009 }) === 17, '18 na véspera do Camp, 17 no dia seguinte');
ok(mascaraData('14032009') === '14/03/2009' && mascaraData('1403') === '14/03' && mascaraData('14/03/2009x9') === '14/03/2009', 'máscara da data');
ok(mascaraCpf('52998224725') === '529.982.247-25', 'máscara do CPF');
ok(mascaraCelular('+55 21 99594-6491') === '(21) 99594-6491', 'máscara do celular tira o +55');

/* ------------------------------------------------------------ a ficha --- */
const MENOR = {
  campista: 'Maria Eduarda Souza', nascimento: '14/03/2010', sexo: 'feminino', camisa: 'M', whatsCampista: '',
  alergias: 'camarão', saude: '', respNome: 'Carla Souza', respCpf: '529.982.247-25', respWhats: '(21) 98888-7777',
  respParentesco: 'Mãe', emergNome: '', emergWhats: '', temIrmao: 'nao', irmao: '', pagamento: 'pix', imagem: 'sim',
  termo: true, lgpd: true, site: '',
};
const ADULTO = {
  ...MENOR, campista: 'Pedro Henrique Dias', nascimento: '20/07/2005', sexo: 'masculino', camisa: 'G',
  whatsCampista: '(21) 99594-6491', respNome: '', respCpf: '', respWhats: '', respParentesco: '',
  emergNome: 'Ana Dias', emergWhats: '(21) 97777-6666', pagamento: 'cartao', imagem: 'nao',
};
const campoDe = c => { const r = conferirFicha(c); return r.ok ? 'ok' : r.campo; };

{
  const r = conferirFicha(MENOR);
  ok(r.ok && r.ficha.menor && r.ficha.idade === 16 && r.ficha.responsavel?.cpf === '52998224725' && r.ficha.emergencia === null, `menor de 16 com responsável: ${JSON.stringify(r)}`);
  const a = conferirFicha(ADULTO);
  ok(a.ok && !a.ficha.menor && a.ficha.emergencia?.nome === 'Ana Dias' && a.ficha.responsavel === null && a.ficha.imagem === false, 'adulto com contato de emergência');
}
for (const [mexe, campo, por] of [
  [{ campista: 'Maria' }, 'fc-campista', 'nome de uma palavra'],
  [{ nascimento: '14/13/2010' }, 'fc-nasc', 'mês 13'],
  [{ nascimento: '06/02/2014' }, 'fc-nasc', '12 anos no Camp'],
  [{ nascimento: '05/02/2002' }, 'fc-nasc', '25 anos no Camp'],
  [{ sexo: 'outro' }, 'fc-sexo', 'sexo fora da lista'],
  [{ camisa: 'XXL' }, 'fc-camisa', 'camisa fora da lista'],
  [{ whatsCampista: '(21) 3333-4444' }, 'fc-whats', 'fixo no WhatsApp do campista'],
  [{ alergias: 'x'.repeat(301) }, 'fc-alergias', 'alergia longa'],
  [{ respNome: 'Maria Eduarda Souza' }, 'fc-resp-nome', 'responsável = campista'],
  [{ respCpf: '529.982.247-24' }, 'fc-resp-cpf', 'CPF com dígito errado'],
  [{ respWhats: '' }, 'fc-resp-whats', 'sem WhatsApp do responsável'],
  [{ respParentesco: 'Vizinho' }, 'fc-resp-par', 'parentesco fora da lista'],
  [{ temIrmao: 'sim', irmao: '' }, 'fc-irmao', 'irmão sem nome'],
  [{ temIrmao: 'sim', irmao: 'maria eduarda souza' }, 'fc-irmao', 'irmão = campista'],
  [{ temIrmao: '' }, 'fc-tem-irmao', 'sem responder sobre irmão'],
  [{ pagamento: 'boleto' }, 'fc-pag', 'pagamento fora da lista'],
  [{ imagem: '' }, 'fc-imagem', 'sem responder o uso de imagem'],
  [{ termo: false }, 'fc-termo', 'termo não aceito'],
  [{ termo: 'true' }, 'fc-termo', 'termo como texto não vale'],
  [{ lgpd: false }, 'fc-lgpd', 'sem consentimento'],
  [{ site: 'http://spam' }, 'site', 'isca preenchida'],
]) ok(campoDe({ ...MENOR, ...mexe }) === campo, `${por}: esperava ${campo}, veio ${campoDe({ ...MENOR, ...mexe })}`);
ok(campoDe({ ...MENOR, nascimento: '05/02/2014' }) === 'ok', '13 anos no dia exato do Camp entra');
ok(campoDe({ ...MENOR, nascimento: '06/02/2002', ...{ respNome: '', respCpf: '', respWhats: '', respParentesco: '' }, emergNome: 'Ana Dias', emergWhats: '(21) 97777-6666', whatsCampista: '(21) 99594-6491' }) === 'ok', '24 anos no Camp entra');
ok(campoDe({ ...MENOR, whatsCampista: '' }) === 'ok', 'menor sem WhatsApp próprio: ok');
ok(campoDe({ ...ADULTO, whatsCampista: '' }) === 'fc-whats', 'adulto precisa do próprio WhatsApp');
ok(campoDe({ ...ADULTO, emergWhats: ADULTO.whatsCampista }) === 'fc-emerg-whats', 'contato de emergência com o número do campista');
ok(campoDe({ ...ADULTO, emergNome: 'Pedro Henrique Dias' }) === 'fc-emerg-nome', 'contato de emergência = campista');
ok(campoDe({ ...MENOR, nascimento: '06/02/2009', respNome: '' }) === 'fc-resp-nome', '17 no dia do Camp (18 só depois): precisa do responsável');
ok(campoDe({ ...ADULTO, nascimento: '05/02/2009' }) === 'ok', '18 no dia do Camp: adulto');

/* --------------------------------------------------------- a planilha --- */
ok(semFormula('=IMPORTXML("http://x","//a")') === `'=IMPORTXML("http://x","//a")`, 'fórmula vira texto');
ok(['+55 21', '-', '@x', '\tA'].every(v => semFormula(v).startsWith("'")), '+ - @ e tab também');
ok(semFormula('camarão') === 'camarão' && semFormula('(21) 99999-9999') === '(21) 99999-9999', 'texto comum fica igual');
{
  const r = conferirFicha({ ...MENOR, alergias: '=HYPERLINK("http://golpe","clique")', saude: '+ asma' });
  const ANTES = new Date('2026-10-02T12:00:00-03:00');
  const linha = linhaDaFicha(r.ficha, ANTES);
  ok(linha.length === CABECALHO.length - 1, `a linha tem ${linha.length} células para ${CABECALHO.length - 1} colunas (fora "Recebido em")`);
  const col = nome => linha[CABECALHO.indexOf(nome) - 1];
  ok(col('Alergia ou restrição alimentar').startsWith("'=") && col('Saúde ou remédio').startsWith("'+"), 'alergia e saúde sem fórmula');
  ok(col('Nascimento') === "'14/03/2010", 'nascimento como texto');
  ok(col('Idade no Camp') === 16 && col('Valor') === 697 && col('CPF do responsável') === '529.982.247-25', 'idade, valor e CPF');
  ok(col('Versão do termo') === VERSAO_TERMO && col('Origem') === 'site' && col('Uso de imagem') === 'Sim', 'versão do termo, origem, imagem');
  ok(/^Eu, Carla Souza, CPF 529\.982\.247-25, responsável legal por Maria Eduarda Souza, autorizo Maria a participar/.test(col('Termo aceito')), `termo: ${col('Termo aceito')}`);
  const irmaos = linhaDaFicha(conferirFicha({ ...MENOR, temIrmao: 'sim', irmao: 'João Souza' }).ficha, ANTES);
  ok(irmaos[CABECALHO.indexOf('Valor') - 1] === 627.3, 'irmão: R$ 627,30');
  const depois = linhaDaFicha(r.ficha, new Date('2026-11-04T00:00:00-03:00'));
  ok(depois[CABECALHO.indexOf('Valor') - 1] === 'a confirmar', 'depois do 1º lote: valor a confirmar, nunca o preço velho');
  ok(valorDaFicha({ irmao: '' }, ANTES) === 697, 'valor da ficha');
}
{
  const sem = termoDe({ campista: 'Maria Souza', menor: true, responsavel: { nome: 'Carla Souza', cpf: '', whats: null, parentesco: 'Mãe' }, emergencia: null });
  ok(!/CPF ,/.test(sem) && sem.startsWith('Eu, Carla Souza, responsável legal'), `termo sem CPF ainda: ${sem}`);
  const adulto = termoDe({ campista: 'Pedro Dias', menor: false, responsavel: null, emergencia: { nome: 'Ana Dias', whats: null } });
  ok(/avisar Ana Dias/.test(adulto) && /por minha conta/.test(adulto), 'declaração do adulto');
}
{
  const f = conferirFicha({ ...MENOR, temIrmao: 'sim', irmao: 'João Souza' }).ficha;
  const m = mensagemDaFicha(f, new Date('2026-10-02T12:00:00-03:00'));
  ok(/Campista: Maria Eduarda Souza/.test(m) && /16 anos no Camp/.test(m) && /Irmão inscrito: João Souza/.test(m) && /R\$\s?627,30/.test(m) && /Termo de autorização: aceito/.test(m), `mensagem da ficha: ${m}`);
  ok(/Maria Eduarda Souza/.test(mensagemDeAviso(f)) && /Pix/.test(mensagemDeAviso(f)), 'aviso curto');
}

/* ------------------------------------------- 3. o que conta como gravado --- */
process.env.NODE_ENV = 'test';
const pl = await import('../lib/planilha.ts');
ok(pl.urlDaPlanilha('https://script.google.com/macros/s/AKfycbx1234567890abcdefghij/exec') !== null, 'URL de app da web aceita');
ok(['', 'http://script.google.com/macros/s/AKfycbx1234567890abcdefghij/exec', 'https://golpe.com/exec',
  'https://script.google.com/macros/s/AKfycbx1234567890abcdefghij/dev', ' https://script.google.com/macros/s/curto/exec']
  .every(u => pl.urlDaPlanilha(u) === null), 'qualquer outra URL é recusada');

const recebidos = [];
let modo = 'ok';
const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', c => { corpo += c; });
  req.on('end', () => {
    recebidos.push({ metodo: req.method, corpo: corpo ? JSON.parse(corpo) : null });
    if (modo === 'demora') return setTimeout(() => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); }, 1500);
    if (modo === 'html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<html><body>Script function not found: doPost</body></html>'); }
    if (modo === 'erro') { res.writeHead(500, { 'content-type': 'application/json' }); return res.end('{"ok":false}'); }
    if (modo === 'falso') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":false,"erro":"x"}'); }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}');
  });
});
await new Promise(r => servidor.listen(0, '127.0.0.1', r));
const URL = `http://127.0.0.1:${servidor.address().port}/exec`;
{
  const f = conferirFicha(MENOR).ficha;
  const corpo = { cabecalho: CABECALHO, linha: linhaDaFicha(f), origem: 'site' };
  ok((await pl.gravarNaPlanilha(URL, corpo)).ok === true, 'JSON ok:true é gravado');
  const env = recebidos.at(-1)?.corpo;
  ok(env?.cabecalho?.length === CABECALHO.length && env?.linha?.length === CABECALHO.length - 1 && env?.origem === 'site', 'o script recebe cabeçalho, linha e origem');
  modo = 'html'; ok((await pl.gravarNaPlanilha(URL, corpo)).ok === false, 'página HTML do Google (200) NÃO é gravado');
  modo = 'erro'; ok((await pl.gravarNaPlanilha(URL, corpo)).ok === false, '500 não é gravado');
  modo = 'falso'; ok((await pl.gravarNaPlanilha(URL, corpo)).ok === false, 'ok:false não é gravado');
  modo = 'demora'; const d = await pl.gravarNaPlanilha(URL, corpo, 300);
  ok(d.ok === false && d.motivo === 'planilha demorou', `demorou: ${JSON.stringify(d)}`);
  modo = 'ok'; ok(await pl.planilhaResponde(URL) === true, 'doGet responde');
  modo = 'html'; ok(await pl.planilhaResponde(URL) === false, 'doGet com HTML: não responde');
  ok(!(await pl.gravarNaPlanilha('http://127.0.0.1:9/nada', corpo, 500)).ok, 'servidor fora do ar');
}
servidor.close();

if (mal) { console.error(`\n${mal} problema(s) na ficha do Follow Camp.`); process.exit(1); }
console.log('ok  followcamp-ficha: idade no dia do Camp, responsável e termo, planilha sem fórmula, gravado só com ok:true');
