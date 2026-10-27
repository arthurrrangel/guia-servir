/* A IMAGEM DE INSPIRAÇÃO GERADA POR IA · 116 · 26/10/2026.

   Executa o corpo de /api/dress-code/gerar (lib/dress-code-ia.ts) com um
   banco e um gerador de mentira:
     · sem login, nada abre; pedido torto, nada abre;
     · é o banco que decide, como quem chamou (dress_code_pode_gerar): sem
       liderança, fora do Louvor ou no limite, o gerador nem é chamado;
     · o gerador recebe o pedido montado do rascunho (as cores, sem gente);
     · a imagem vai para a pasta do ministério no armário, com o tipo certo;
     · cada falha volta com um código que a tela traduz, sem detalhe.

   Roda com `npm test`. */
import { atenderGeracao, lerPedidoDaGeracao, erroDaGeracao } from '@/lib/dress-code-ia';

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => { feitas++; if (!c) { falhas++; console.log('  FALHOU:', rot, extra); } };

const EQ = '6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const JWT = 'aaa.bbb.ccc';
const RASCUNHO = {
  combinacoes: [{ cores: [{ hex: '#1f2a44', nome: 'Azul-marinho' }, { hex: '#e3d5bd', nome: 'Bege' }] }, { cores: [{ hex: '#111111', nome: 'Preto' }] }],
  estilo: 'esporte-fino', orientacoes: 'Camisa lisa.',
};
const pedido = (corpo, jwt = JWT) => new Request('https://x/api/dress-code/gerar', {
  method: 'POST', headers: jwt ? { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' } : { 'content-type': 'application/json' },
  body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
});

function mundo({ pode = { ok: true, restam: 11 }, rpcErro = null, gerar = null, upErro = null } = {}) {
  const m = { abriuUsuario: 0, abriuServidor: 0, jwt: null, rpc: [], prompts: [], subiu: [] };
  const deps = {
    comoQuemChamou: (jwt) => { m.abriuUsuario++; m.jwt = jwt; return {
      rpc: async (fn, args) => { m.rpc.push([fn, args]); return rpcErro ? { data: null, error: rpcErro } : { data: pode, error: null }; },
      storage: null } },
    doServidor: () => { m.abriuServidor++; return {
      rpc: null,
      storage: { from: (balde) => ({ upload: async (caminho, bytes, op) => { m.subiu.push({ balde, caminho, tam: bytes.length, op }); return upErro ? { error: upErro } : { data: { path: caminho }, error: null }; } }) } } },
    gerar: gerar || (async (prompt) => { m.prompts.push(prompt); return { bytes: new Uint8Array([1, 2, 3, 4]), tipo: 'image/webp' }; }),
    novoId: () => 'AAAAAAAA-1D2A-4C3B-9E4F-5A6B7C8D9E0F',
  };
  return { m, deps };
}

/* sem login, nada abre */
for (const [rot, jwt] of [['sem cabeçalho', null], ['não é JWT', 'abc'], ['JWT com espaço', 'a.b c.d']]) {
  const { m, deps } = mundo();
  const r = await atenderGeracao(pedido({ equipe: EQ, rascunho: RASCUNHO }, jwt), deps);
  ok(r.status === 401 && m.abriuUsuario === 0 && m.abriuServidor === 0, `${rot}: 401 e o banco nem abre`, String(r.status));
}
/* pedido torto, nada abre */
for (const [rot, corpo] of [
  ['vazio', ''], ['não é JSON', '{x'], ['equipe torta', { equipe: 'louvor', rascunho: RASCUNHO }],
  ['sem cor', { equipe: EQ, rascunho: { ...RASCUNHO, combinacoes: [] } }],
  ['cor torta', { equipe: EQ, rascunho: { ...RASCUNHO, combinacoes: [{ cores: [{ hex: 'azul', nome: 'Azul' }] }] } }],
  ['estilo inventado', { equipe: EQ, rascunho: { ...RASCUNHO, estilo: 'pijama' } }],
  ['grande demais', JSON.stringify({ equipe: EQ, rascunho: RASCUNHO, x: 'y'.repeat(20_001) })],
]) {
  const { m, deps } = mundo();
  const r = await atenderGeracao(pedido(corpo), deps);
  ok(r.status === 400 && m.abriuUsuario === 0, `${rot}: 400 e o banco nem abre`, String(r.status));
}

/* o caminho bom */
{
  const { m, deps } = mundo();
  const r = await atenderGeracao(pedido({ equipe: EQ.toUpperCase(), rascunho: RASCUNHO, combinacao: 1 }), deps);
  const j = await r.json();
  ok(r.status === 200 && j.ok && j.caminho === `${EQ}/aaaaaaaa-1d2a-4c3b-9e4f-5a6b7c8d9e0f.webp` && j.ia === true && j.restam === 11, 'gera e devolve o caminho na pasta do ministério', JSON.stringify(j));
  ok(m.jwt === JWT && JSON.stringify(m.rpc) === JSON.stringify([['dress_code_pode_gerar', { p_equipe: EQ }]]), 'o banco decide, como quem chamou (o JWT dele)');
  ok(m.prompts.length === 1 && m.prompts[0].includes('Preto (#111111)') && !m.prompts[0].includes('Bege') && /No people/.test(m.prompts[0]), 'o gerador recebe a combinação escolhida, sem gente', m.prompts[0]);
  ok(m.subiu.length === 1 && m.subiu[0].balde === 'dress-code' && m.subiu[0].op.contentType === 'image/webp' && m.subiu[0].op.upsert === false, 'a imagem vai para o armário, com o tipo, sem sobrescrever');
  ok(r.headers.get('cache-control') === 'no-store', 'sem cache');
}
/* o banco diz não: o gerador nem é chamado */
for (const [rot, pode, status, erro] of [
  ['no limite', { ok: false, erro: 'LIMITE' }, 429, 'LIMITE'],
  ['sem liderança', { ok: false, erro: 'SEM_PERMISSAO' }, 403, 'SEM_PERMISSAO'],
  ['fora do Louvor', { ok: false, erro: 'SO_LOUVOR' }, 403, 'SO_LOUVOR'],
]) {
  const { m, deps } = mundo({ pode });
  const r = await atenderGeracao(pedido({ equipe: EQ, rascunho: RASCUNHO }), deps);
  const j = await r.json();
  ok(r.status === status && j.erro === erro && m.prompts.length === 0 && m.abriuServidor === 0, `${rot}: ${status} ${erro}, e nada é gerado`, `${r.status} ${JSON.stringify(j)}`);
}
for (const [rot, err, status, erro] of [
  ['JWT vencido', { code: 'PGRST301', message: 'JWT expired' }, 401, 'SEM_LOGIN'],
  ['sem a 116 no banco', { code: 'PGRST202', message: 'Could not find the function' }, 503, 'SEM_116'],
  ['banco fora', { code: '08006', message: 'connection' }, 502, 'BANCO'],
]) {
  const { m, deps } = mundo({ rpcErro: err });
  const r = await atenderGeracao(pedido({ equipe: EQ, rascunho: RASCUNHO }), deps);
  const j = await r.json();
  ok(r.status === status && j.erro === erro && m.prompts.length === 0, `${rot}: ${status} ${erro}`, `${r.status} ${JSON.stringify(j)}`);
}
/* o gerador falha */
for (const [rot, falha, erro] of [
  ['demorou', Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }), 'IA_TEMPO'],
  ['recusou', new Error('Your request was rejected by the moderation system'), 'IA_RECUSOU'],
  ['fora do ar', new Error('403 customer_verification_required'), 'IA_INDISPONIVEL'],
]) {
  const { m, deps } = mundo({ gerar: async () => { throw falha; } });
  const r = await atenderGeracao(pedido({ equipe: EQ, rascunho: RASCUNHO }), deps);
  const j = await r.json();
  ok(r.status === 502 && j.erro === erro && m.subiu.length === 0 && !JSON.stringify(j).includes('customer'), `gerador ${rot}: ${erro}, sem detalhe na resposta`, JSON.stringify(j));
}
{
  const { m, deps } = mundo({ gerar: async () => ({ bytes: new Uint8Array([1]), tipo: 'image/gif' }) });
  const j = await (await atenderGeracao(pedido({ equipe: EQ, rascunho: RASCUNHO }), deps)).json();
  ok(j.erro === 'IA_INDISPONIVEL' && m.subiu.length === 0, 'imagem num tipo que o armário não aceita: não sobe');
  const { m: m2, deps: d2 } = mundo({ upErro: { message: 'mime type not supported' } });
  const j2 = await (await atenderGeracao(pedido({ equipe: EQ, rascunho: RASCUNHO }), d2)).json();
  ok(j2.erro === 'ARMARIO' && m2.subiu.length === 1, 'o armário recusa: ARMARIO');
}

/* o que a rota aceita, e as mensagens da tela */
{
  const p = lerPedidoDaGeracao({ equipe: EQ, rascunho: { ...RASCUNHO, orientacoes: 'x'.repeat(500) }, combinacao: 7 });
  ok(p && p.orientacoes.length === 400 && p.combinacao === 0, 'orientações cortadas no limite; combinação fora volta à primeira');
  ok(lerPedidoDaGeracao({ equipe: EQ, rascunho: { ...RASCUNHO, combinacoes: [{ cores: [{ hex: '#111111', nome: 'Preto\u0007' }] }] } }) === null, 'nome de cor com caractere de controle: não');
  ok(lerPedidoDaGeracao({ equipe: EQ, rascunho: { ...RASCUNHO, combinacoes: [{ cores: [{ hex: '#111111', nome: 'Preto\u0085' }] }] } }) === null
    && lerPedidoDaGeracao({ equipe: EQ, rascunho: { ...RASCUNHO, combinacoes: [{ cores: [{ hex: '#111111', nome: 'Pre\u2028to' }] }] } }) === null,
    'nem de C1, nem a quebra do Unicode');
  ok(/12 imagens/.test(erroDaGeracao('LIMITE')) && /foto/.test(erroDaGeracao('IA_INDISPONIVEL')) && /Entre de novo/.test(erroDaGeracao('SEM_LOGIN')) && /Tente de novo/.test(erroDaGeracao('???')), 'cada erro com a frase da tela');
  ok(/ainda não foi ligada/.test(erroDaGeracao('SEM_116')) && /foto/.test(erroDaGeracao('SEM_BANCO')),
    'antes da 116 no banco (ou sem a chave do servidor): a frase diz, e não manda "tentar de novo"');
}

console.log(`dress-code-ia: ${feitas - falhas}/${feitas}`);
if (falhas) process.exit(1);
