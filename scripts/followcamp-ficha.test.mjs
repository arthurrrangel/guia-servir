/* A ficha de inscrição do Follow Camp 2027. Roda com `npm test`.

   O que este arquivo protege, em ordem de quanto custa errar:

     1. A IDADE NO DIA DO CAMP. De 13 a 24 anos em 05/02/2027, aniversário no
        próprio dia contando; e quem é menor de 18 nesse dia precisa do
        responsável com CPF válido e do termo aceito.
     2. O BANCO (04/10/2026, migração 110). A ficha vai com as chaves que
        `fc27_ficha_gravar` lê, e nenhum texto passa do tamanho que o banco
        aceita (senão o CHECK recusa e a ficha cai no WhatsApp). E o texto que
        começa com = + - @ continua saindo sem fórmula na exportação.
     3. O QUE CONTA COMO GRAVADO. Só 200 com ok:true; função que não existe
        (a 110 não rodou), 500, ok:false e página HTML NÃO são gravado.
        Conferido contra um dublê HTTP local do PostgREST, que guarda o que
        recebeu: caminho, chave de serviço e corpo.
     4. O RESTO DA FICHA: nomes, WhatsApp, irmão, pagamento, imagem,
        consentimento, isca.                                                  */
import http from 'node:http';
import {
  lerData, idadeEm, conferirFicha, fichaParaBanco, semFormula, termoDe, mensagemDaFicha,
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

/* ------------------------------------------------------------ o banco --- */
ok(semFormula('=IMPORTXML("http://x","//a")') === `'=IMPORTXML("http://x","//a")`, 'fórmula vira texto');
ok(['+55 21', '-', '@x', '\tA'].every(v => semFormula(v).startsWith("'")), '+ - @ e tab também');
ok(semFormula('camarão') === 'camarão' && semFormula('(21) 99999-9999') === '(21) 99999-9999', 'texto comum fica igual');
/* as chaves que `fc27_ficha_gravar` (supabase/110) lê, e o teto de cada uma */
const TETO = {
  campista: 80, sexo: 10, camisa: 10, whats_campista: 20, alergias: 500, saude: 500, responsavel_nome: 80,
  responsavel_cpf: 14, responsavel_whats: 20, parentesco: 40, emergencia_nome: 80, emergencia_whats: 20,
  irmao: 80, pagamento: 10, termo: 4000, versao_termo: 40,
};
const CHAVES = [...Object.keys(TETO), 'nascimento', 'idade', 'valor', 'imagem'].sort();
{
  const ANTES = new Date('2026-10-02T12:00:00-03:00');
  const r = conferirFicha({ ...MENOR, alergias: 'x'.repeat(300), saude: 'y'.repeat(300) });
  const b = fichaParaBanco(r.ficha, ANTES);
  ok(JSON.stringify(Object.keys(b).sort()) === JSON.stringify(CHAVES), `as chaves da ficha: ${Object.keys(b).sort().join(',')}`);
  for (const [k, n] of Object.entries(TETO)) ok(b[k] == null || String(b[k]).length <= n, `${k} passa de ${n} caracteres: ${String(b[k]).length}`);
  ok(b.nascimento === '2010-03-14' && b.idade === 16 && b.sexo === 'feminino' && b.camisa === 'M', 'nascimento em ISO, idade, sexo, camisa');
  ok(b.responsavel_cpf === '529.982.247-25' && b.responsavel_whats === '(21) 98888-7777' && b.parentesco === 'Mãe', 'responsável');
  ok(b.emergencia_nome === null && b.whats_campista === null, 'menor sem emergência nem WhatsApp próprio: null, e não texto vazio');
  ok(b.valor === 697 && b.pagamento === 'pix' && b.imagem === true && b.versao_termo === VERSAO_TERMO, 'valor, pagamento, imagem, versão do termo');
  ok(/^Eu, Carla Souza, CPF 529\.982\.247-25, responsável legal por Maria Eduarda Souza, autorizo Maria a participar/.test(b.termo), `termo: ${b.termo}`);
  const ad = fichaParaBanco(conferirFicha(ADULTO).ficha, ANTES);
  ok(ad.responsavel_nome === null && ad.emergencia_nome === 'Ana Dias' && ad.emergencia_whats === '(21) 97777-6666'
    && ad.whats_campista === '(21) 99594-6491' && ad.imagem === false && ad.pagamento === 'cartao', 'adulto: emergência e WhatsApp próprio');
  ok(fichaParaBanco(conferirFicha({ ...MENOR, temIrmao: 'sim', irmao: 'João Souza' }).ficha, ANTES).valor === 627.3, 'irmão: R$ 627,30');
  ok(fichaParaBanco(r.ficha, new Date('2026-11-04T00:00:00-03:00')).valor === null, 'depois do 1º lote: valor a confirmar (null), nunca o preço velho');
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
const recebidos = [];
let modo = 'ok';
const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', c => { corpo += c; });
  req.on('end', () => {
    recebidos.push({ caminho: req.url, chave: req.headers.apikey, auth: req.headers.authorization, corpo: corpo ? JSON.parse(corpo) : null });
    const json = (st, o) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (modo === 'demora') return setTimeout(() => json(200, { ok: true, id: 'x' }), 1500);
    if (modo === 'ausente') return json(404, { code: 'PGRST202', message: 'Could not find the function public.fc27_ficha_gravar(p)' });
    if (modo === 'html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<html>erro</html>'); }
    if (modo === 'erro') return json(500, { code: '23514', message: 'violates check constraint' });
    if (modo === 'falso') return json(200, { ok: false, erro: 'CODIGO_INVALIDO' });
    if (modo === 'repetido') return json(200, { ok: true, id: 'abc', repetido: true });
    return json(200, { ok: true, id: '11111111-2222-3333-4444-555555555555' });
  });
});
await new Promise(r => servidor.listen(0, '127.0.0.1', r));
process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${servidor.address().port}/`;
const bc = await import('../lib/followcamp-banco.ts');
{
  delete process.env.SUPABASE_SERVICE_ROLE;
  const sem = await bc.gravarFicha({ campista: 'x' });
  ok(!bc.bancoLigado() && sem.ok === false && /SUPABASE_SERVICE_ROLE/.test(sem.motivo) && recebidos.length === 0, 'sem a chave de serviço: nem tenta');
  process.env.SUPABASE_SERVICE_ROLE = 'chave-de-servico-teste';
  const f = fichaParaBanco(conferirFicha(MENOR).ficha);
  const g = await bc.gravarFicha(f);
  ok(g.ok === true && g.id === '11111111-2222-3333-4444-555555555555', `ok:true é gravado: ${JSON.stringify(g)}`);
  const env = recebidos.at(-1);
  ok(env.caminho === '/rest/v1/rpc/fc27_ficha_gravar', `o caminho é o da função: ${env.caminho}`);
  ok(env.chave === 'chave-de-servico-teste' && env.auth === 'Bearer chave-de-servico-teste', 'vai com a chave de serviço nos dois cabeçalhos');
  ok(env.corpo?.p?.campista === 'Maria Eduarda Souza' && env.corpo?.p?.valor === 697, 'o corpo é { p: ficha }');
  modo = 'ausente'; const a = await bc.gravarFicha(f);
  ok(a.ok === false && /110/.test(a.motivo), `a 110 não rodou: ${JSON.stringify(a)}`);
  modo = 'html'; ok((await bc.gravarFicha(f)).ok === false, 'página HTML (200) NÃO é gravado');
  modo = 'erro'; ok((await bc.gravarFicha(f)).ok === false, '500 (o CHECK recusou) não é gravado');
  modo = 'falso'; ok((await bc.gravarFicha(f)).ok === false, 'ok:false não é gravado');
  modo = 'demora'; const d = await bc.gravarFicha(f, 300);
  ok(d.ok === false && d.motivo === 'banco demorou', `demorou: ${JSON.stringify(d)}`);
  modo = 'ok'; ok(await bc.bancoResponde() === true, 'o banco responde ao teste');
  ok(recebidos.at(-1).corpo?.p?.teste === true, 'a pergunta de saúde é {teste:true}: não grava ficha');
  modo = 'ausente'; ok(await bc.bancoResponde() === false, 'sem a 110: não responde');
  modo = 'repetido'; const i = await bc.informarPagamento({ codigo: 'FC27K7P3M9QX' });
  ok(i.ok === true && i.repetido === true && recebidos.at(-1).caminho === '/rest/v1/rpc/fc27_pagamento_informar', 'o aviso de pagamento vai para a função dele, e o repetido passa');
  modo = 'ok';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:9';
  ok((await bc.gravarFicha(f, 500)).ok === false, 'banco fora do ar');
}
servidor.close();

if (mal) { console.error(`\n${mal} problema(s) na ficha do Follow Camp.`); process.exit(1); }
console.log('ok  followcamp-ficha: idade no dia do Camp, responsável e termo, ficha no formato do banco, gravado só com ok:true');
