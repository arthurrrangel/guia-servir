/* A RELEITURA NÃO DESMENTE O AVISO · 30/10/2026

   O DEFEITO, LIDO NO CÓDIGO (backlog de cobertura, item 2)

   Em `responderItens` (app/(sistema)/eu/[token]/page.tsx), depois de uma
   falha parcial ou de um `mudou:0`, a tela mostra o aviso e relê os dados com
   `carregar(false)`: na hora, quando tudo voltou `mudou:0`; 1,2 s depois, nas
   respostas parciais. A releitura parte de que o envio salvou. Dando certo,
   ela apaga o aviso; falhando, troca o aviso por "Salvou! Só não consegui
   atualizar a tela agora", e com tudo em `mudou:0` isso anuncia uma gravação
   que não houve.

   COMO ESTE ARQUIVO TESTA, SEM SERVIDOR E SEM BUILD

   As funções reais saem do page.tsx pela árvore sintática do TypeScript do
   próprio repositório (não por expressão regular) e são transpiladas em
   memória: `responderItens`, `carregar`, `agendarRecarga`, `chaveDoPosto` e
   `hojeISO`, mais os `useRef` do componente. Elas rodam com dublês só para o
   que não é delas: os `set...` do React (um estado em memória), a janela (um
   relógio de mentira), `process.env` e o Supabase, com a resposta de cada
   chamada escolhida pela cena. Nada de rede, banco ou servidor. O erro de
   rede tem a forma que o postgrest-js devolve numa queda (`{ error }`, sem
   exceção). Sabotar a linha real reprova: rodado contra o d7856e1, sem a
   correção, as cenas de falha caem.

   O QUE NÃO MEDE

   · A pintura. A barra mostra `erro || flash` (`.vol-flash`, no JSX); aqui o
     par é lido em cada fronteira de tarefa, depois das microtarefas, que é
     quando o React pinta. Um valor trocado dentro da mesma cadeia de
     microtarefas não chega à tela.
   · Os outros fluxos (`responderDisp`, `marcarPosso`), o layout, a rede de
     verdade e o banco.

   Uso: node --import ./scripts/_ts.mjs scripts/resposta-releitura.test.mjs
        PAGINA=/outra/page.tsx node --import ./scripts/_ts.mjs scripts/resposta-releitura.test.mjs
*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { aviseHumano } from '@/lib/erros';

const ts = createRequire(import.meta.url)('typescript');
const PAGINA = process.env.PAGINA
  || fileURLToPath(new URL('../app/(sistema)/eu/[token]/page.tsx', import.meta.url));
const arvore = ts.createSourceFile('page.tsx', readFileSync(PAGINA, 'utf8'),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

/* ============================================= 1. o código real, da árvore */

const texto = n => n.getText(arvore);
const chama = (n, nome) => !!n && ts.isCallExpression(n) && texto(n.expression) === nome;

let resposta = null;
(function andar(n) {
  if (ts.isFunctionDeclaration(n) && n.name?.text === 'responderItens') resposta = n;
  else ts.forEachChild(n, andar);
})(arvore);
if (!resposta) throw new Error(`responderItens não está em ${PAGINA}`);
let componente = resposta.parent;
while (componente && !ts.isFunctionLike(componente)) componente = componente.parent;

const FONTE = { responderItens: texto(resposta) };
const REFS = {};
for (const st of componente.body.statements) {
  if (!ts.isVariableStatement(st)) continue;
  for (const d of st.declarationList.declarations) {
    if (!ts.isIdentifier(d.name) || !d.initializer) continue;
    const nome = d.name.text, ini = d.initializer;
    if (chama(ini, 'useRef')) REFS[nome] = ini.arguments[0] ? texto(ini.arguments[0]) : 'undefined';
    else if (nome === 'carregar' && chama(ini, 'useCallback')) FONTE.carregar = texto(ini.arguments[0]);
    else if (nome === 'agendarRecarga' || nome === 'chaveDoPosto') FONTE[nome] = texto(ini);
  }
}
for (const st of arvore.statements) {
  if (!ts.isVariableStatement(st)) continue;
  for (const d of st.declarationList.declarations) {
    if (ts.isIdentifier(d.name) && d.name.text === 'hojeISO') FONTE.hojeISO = texto(d.initializer);
  }
}
for (const nome of ['carregar', 'agendarRecarga', 'chaveDoPosto', 'hojeISO']) {
  if (!FONTE[nome]) throw new Error(`${nome} não está em ${PAGINA}`);
}

const paraJs = fonte => ts.transpileModule(`(${fonte});`, {
  fileName: 'trecho.tsx', reportDiagnostics: false,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React },
}).outputText.replace(/^\s*"use strict";/, '').trim().replace(/;\s*$/, '');
const JS = Object.fromEntries(Object.entries(FONTE).map(([k, v]) => [k, paraJs(v)]));
const JS_REFS = Object.fromEntries(Object.entries(REFS).map(([k, v]) => [k, paraJs(v)]));

/* ============================================================ 2. os dublês */

/* o que o postgrest-js devolve quando o fetch cai: `{ data: null, error }` */
const QUEDA = { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' };
const SALVOU = /^Salvou!/;
const drenar = async () => { for (let k = 0; k < 3; k++) await new Promise(r => setImmediate(r)); };
const POSTOS = () => [
  { culto_id: 'c1', data: '2099-01-04', funcao: 'PROJEÇÃO', funcao_id: 'f1', status: 'pendente', obs: null, plantao: false },
  { culto_id: 'c1', data: '2099-01-04', funcao: 'FILMAGEM', funcao_id: 'f2', status: 'pendente', obs: null, plantao: false },
  { culto_id: 'c2', data: '2099-01-11', funcao: 'CÂMERA 1', funcao_id: 'f3', status: 'pendente', obs: null, plantao: false },
];

/* `postos`: o que `eu_responder` responde por posto ('ok', 'zero', 'falha' ou
   'legado', a resposta antiga sem `mudou`). `releitura`: 'ok' ou 'falha'.
   `dev`: o harness de design (`next dev` com ?demo=). */
function cena({ postos, releitura = 'ok', dev = false }) {
  const estado = { erro: '', flash: '', ocupado: '', ofertas: [], itens: POSTOS() };
  /* o banco: só os postos que ainda são da pessoa ('zero' já não é) */
  const servidor = new Map(POSTOS().filter(i => postos[i.funcao_id] !== 'zero').map(i => [i.funcao_id, i]));
  const pintadas = [];
  const pintar = () => pintadas.push(estado.erro || estado.flash);
  const relogio = { agora: 0, seq: 0, fila: [] };
  const banco = { postos, releitura, segurar: false, seguradas: [], chamadas: [] };
  const ate = v => Promise.resolve(v);
  const cliente = {
    rpc(fn, args) {
      banco.chamadas.push({ fn, args: { ...args }, em: relogio.agora });
      if (fn === 'eu_responder') {
        const r = banco.postos[args.p_funcao_id];
        if (r === 'falha') return ate({ data: null, error: QUEDA });
        if (r === 'zero') return ate({ data: { ok: true, mudou: 0, motivo: 'SEM_POSTO_SEU' }, error: null });
        const p = servidor.get(args.p_funcao_id);
        if (p) p.status = args.p_status;
        return ate({ data: r === 'legado' ? null : { ok: true, mudou: 1, status: args.p_status }, error: null });
      }
      if (fn === 'eu_dados') {
        const r = () => (banco.releitura === 'falha' ? { data: null, error: QUEDA } : {
          data: [{ nome: 'Pessoa', equipe: 'Mídia', escalas: [...servidor.values()].map(i => ({ ...i })),
            indisponivel: [], disponivel: [] }], error: null });
        return banco.segurar ? new Promise(ok => banco.seguradas.push(() => ok(r()))) : ate(r());
      }
      if (fn === 'eu_proximos_domingos') return ate({ data: [], error: null });
      return ate({ data: null, error: null });
    },
  };
  const janela = {
    location: { search: dev ? '?demo=troca' : '' },
    setTimeout: (fn, ms = 0) => { const id = ++relogio.seq; relogio.fila.push({ id, em: relogio.agora + ms, fn }); return id; },
    clearTimeout: id => { relogio.fila = relogio.fila.filter(t => t.id !== id); },
  };
  const avancar = async ms => {
    const fim = relogio.agora + ms;
    for (;;) {
      relogio.fila.sort((a, b) => a.em - b.em || a.id - b.id);
      const t = relogio.fila[0];
      if (!t || t.em > fim) break;
      relogio.fila.shift(); relogio.agora = t.em; t.fn(); await drenar(); pintar();
    }
    relogio.agora = fim;
  };
  /* tudo o que o código real procura fora de si cai aqui; o que não estiver
     na lista nem for um `set...` vira dublê neutro e fica anotado, para a cena
     reprovar em vez de simular errado em silêncio */
  const neutros = new Set();
  const base = {
    token: 'tk', sb: () => cliente, aviseHumano, window: janela, document: {},
    process: { env: { NODE_ENV: dev ? 'development' : 'production' } },
    localStorage: { setItem() {}, getItem() { return null; } },
    quemSou: async () => null, carregarExtras: async () => {}, esquecerVinculo() {}, lembrarVinculo() {},
  };
  const escopo = new Proxy(base, {
    has: (t, k) => typeof k === 'string' && (k in t || /^set[A-Z]/.test(k) || !(k in globalThis)),
    get: (t, k) => {
      if (typeof k !== 'string') return undefined;
      if (k in t) return t[k];
      if (/^set[A-Z]/.test(k)) {
        const campo = k[3].toLowerCase() + k.slice(4);
        return (t[k] = v => { estado[campo] = typeof v === 'function' ? v(estado[campo]) : v; });
      }
      neutros.add(k);
      return (t[k] = () => undefined);
    },
  });
  const def = js => new Function('escopo', `with (escopo) { return ${js}; }`)(escopo);
  for (const [k, js] of Object.entries(JS)) base[k] = def(js);
  for (const [k, js] of Object.entries(JS_REFS)) base[k] = { current: def(js) };
  const responder = async (status = 'confirmado', alvo = estado.itens.filter(i => i.culto_id === 'c1')) => {
    await escopo.responderItens(alvo.map(i => ({ ...i })), status, alvo[0].culto_id);
    await drenar(); pintar();
  };
  const tela = () => estado.erro || estado.flash;
  const soltar = async () => { for (const f of banco.seguradas.splice(0)) f(); await drenar(); pintar(); };
  const releituras = () => banco.chamadas.filter(c => c.fn === 'eu_dados');
  return { estado, banco, escopo, pintadas, neutros, avancar, responder, tela, soltar, releituras };
}

/* ============================================================== 3. as cenas */

const resultados = [];
async function caso(nome, fn) {
  let c = null;
  try {
    await fn(x => (c = x));
    if (c) assert.deepEqual([...c.neutros], [], `dublê neutro usado: ${[...c.neutros].join(', ')}`);
    resultados.push(true); console.log('  ok ' + nome);
  } catch (e) {
    resultados.push(false);
    console.log(`  FALHA ${nome}\n        ${String(e.message).split('\n')[0]}`
      + (c ? `\n        pintado: ${JSON.stringify(c.pintadas)}` : ''));
  }
}
const semSalvou = c => assert.ok(!c.pintadas.some(p => SALVOU.test(p)), 'a tela pintou "Salvou!" depois de uma falha');

console.log(`resposta-releitura: ${PAGINA}`);

/* ---- o defeito: falha ou `mudou:0`, e a releitura depois ---- */

for (const releitura of ['falha', 'ok']) {
  await caso(`falha parcial e releitura ${releitura === 'ok' ? 'que dá certo' : 'que falha'}: o aviso continua`, async guarda => {
    const c = guarda(cena({ postos: { f1: 'ok', f2: 'falha' }, releitura }));
    await c.responder();
    const aviso = c.tela();
    assert.ok(aviso.endsWith('Uma parte não entrou; confira a lista e toque de novo.'), `aviso: ${aviso}`);
    assert.equal(c.releituras().length, 0, 'releu antes de 1,2 s');
    await c.avancar(1200);
    assert.deepEqual(c.releituras().map(r => r.em), [1200], 'uma releitura, 1,2 s depois');
    await c.avancar(3000);
    assert.equal(c.tela(), aviso, 'a releitura trocou o aviso');
    semSalvou(c);
  });
  await caso(`mudou:0 numa parte e releitura ${releitura === 'ok' ? 'que dá certo' : 'que falha'}: o aviso continua`, async guarda => {
    const c = guarda(cena({ postos: { f1: 'ok', f2: 'zero' }, releitura }));
    await c.responder();
    const aviso = c.tela();
    assert.ok(aviso.startsWith('Uma parte dos postos não está mais com você'), `aviso: ${aviso}`);
    await c.avancar(4200);
    assert.equal(c.tela(), aviso, 'a releitura trocou o aviso');
    semSalvou(c);
  });
  await caso(`tudo mudou:0 e releitura ${releitura === 'ok' ? 'que dá certo' : 'que falha'}: nada gravou e a tela diz isso`, async guarda => {
    const c = guarda(cena({ postos: { f1: 'zero', f2: 'zero' }, releitura }));
    await c.responder();
    assert.deepEqual(c.releituras().map(r => r.em), [0], 'relê na hora, como antes');
    assert.ok(c.tela().startsWith('Esse posto não está mais com você neste dia.'), `tela: ${c.tela()}`);
    await c.avancar(4200);
    assert.ok(c.tela().startsWith('Esse posto não está mais com você neste dia.'), `tela: ${c.tela()}`);
    semSalvou(c);
  });
}
await caso('uma falha e um mudou:0, releitura que falha: nada gravou e a tela não diz "Salvou!"', async guarda => {
  const c = guarda(cena({ postos: { f1: 'falha', f2: 'zero' }, releitura: 'falha' }));
  await c.responder();
  await c.avancar(4200);
  assert.ok(c.tela().startsWith('Esse posto não está mais com você neste dia.'), `tela: ${c.tela()}`);
  semSalvou(c);
});

/* ---- o que já estava contratado e não pode mudar ---- */

await caso('falha total: o erro fica e não há releitura', async guarda => {
  const c = guarda(cena({ postos: { f1: 'falha', f2: 'falha' }, releitura: 'falha' }));
  await c.responder();
  await c.avancar(4200);
  assert.equal(c.tela(), aviseHumano(QUEDA, 'salvar'));
  assert.equal(c.releituras().length, 0);
  assert.deepEqual(c.estado.itens.map(i => i.status), ['pendente', 'pendente', 'pendente']);
});
await caso('sucesso e releitura que falha: "Confirmado" e depois o "Salvou!" de sempre', async guarda => {
  const c = guarda(cena({ postos: { f1: 'ok', f2: 'ok' }, releitura: 'falha' }));
  await c.responder();
  assert.equal(c.tela(), 'Confirmado. Obrigado!');
  await c.avancar(1200);
  assert.ok(SALVOU.test(c.tela()), `tela: ${c.tela()}`);
});
await caso('sucesso e releitura que dá certo: uma releitura em 1,2 s e a barra limpa em 2,6 s', async guarda => {
  const c = guarda(cena({ postos: { f1: 'ok', f2: 'ok' } }));
  await c.responder();
  assert.equal(c.tela(), 'Confirmado. Obrigado!');
  await c.avancar(2599);
  assert.equal(c.tela(), 'Confirmado. Obrigado!');
  await c.avancar(1);
  assert.equal(c.tela(), '');
  assert.deepEqual(c.releituras().map(r => r.em), [1200]);
  assert.deepEqual(c.estado.itens.filter(i => i.culto_id === 'c1').map(i => i.status), ['confirmado', 'confirmado']);
});
await caso('resposta antiga, sem `mudou`, conta como gravada', async guarda => {
  const c = guarda(cena({ postos: { f1: 'legado', f2: 'legado' } }));
  await c.responder();
  assert.equal(c.tela(), 'Confirmado. Obrigado!');
});
await caso('recusa parcial: o posto que gravou fica recusado, o outro volta, a oferta é só do que gravou', async guarda => {
  const c = guarda(cena({ postos: { f1: 'ok', f2: 'falha' } }));
  await c.responder('recusado');
  assert.deepEqual(c.estado.itens.map(i => [i.funcao_id, i.status]),
    [['f1', 'recusado'], ['f2', 'pendente'], ['f3', 'pendente']]);
  assert.deepEqual(c.estado.ofertas.map(o => o.funcao_id), ['f1']);
  assert.deepEqual(c.banco.chamadas.filter(x => x.fn === 'eu_responder').map(x => x.args.p_funcao_id), ['f1', 'f2']);
});
await caso('harness de design (?demo=): falha parcial sem releitura, o aviso fica', async guarda => {
  const c = guarda(cena({ postos: { f1: 'ok', f2: 'falha' }, dev: true }));
  await c.responder();
  const aviso = c.tela();
  await c.avancar(4200);
  assert.equal(c.releituras().length, 0);
  assert.equal(c.tela(), aviso);
});
await caso('dois sucessos seguidos: uma releitura só, 1,2 s depois do último', async guarda => {
  const c = guarda(cena({ postos: { f1: 'ok', f2: 'ok', f3: 'ok' } }));
  await c.responder();
  await c.avancar(500);
  await c.responder('confirmado', c.estado.itens.filter(i => i.culto_id === 'c2'));
  await c.avancar(4000);
  assert.deepEqual(c.releituras().map(r => r.em), [1700]);
});

/* ---- corridas: o aviso velho não volta por cima do que veio depois ---- */

await caso('nova resposta que dá certo durante a releitura: fica o "Confirmado", não o aviso velho', async guarda => {
  const c = guarda(cena({ postos: { f1: 'ok', f2: 'falha' } }));
  await c.responder();
  const velho = c.tela();
  c.banco.segurar = true;
  await c.avancar(1200);
  c.banco.postos.f2 = 'ok';
  await c.responder('confirmado', c.estado.itens.filter(i => i.funcao_id === 'f2'));
  await c.soltar();
  assert.notEqual(c.tela(), velho);
  assert.equal(c.tela(), 'Confirmado. Obrigado!');
});
await caso('nova resposta que falha inteira durante a releitura: o aviso velho não volta', async guarda => {
  const c = guarda(cena({ postos: { f1: 'ok', f2: 'falha' } }));
  await c.responder();
  const velho = c.tela();
  c.banco.segurar = true;
  await c.avancar(1200);
  await c.responder('confirmado', c.estado.itens.filter(i => i.funcao_id === 'f2'));
  await c.soltar();
  assert.notEqual(c.tela(), velho);
  assert.equal(c.tela(), aviseHumano(QUEDA, 'salvar'), 'o erro novo some');
});
await caso('outra ação (como marcarPosso) dá certo durante a releitura: a mensagem dela fica, não o aviso velho', async guarda => {
  const c = guarda(cena({ postos: { f1: 'ok', f2: 'falha' } }));
  await c.responder();
  c.banco.segurar = true;
  await c.avancar(1200);
  /* o que marcarPosso faz: limpa a barra ao começar, e no fim avisa e agenda */
  c.escopo.setOcupado('todos'); c.escopo.setErro('');
  c.escopo.setFlash('3 dias marcados como posso.'); c.escopo.agendarRecarga(); c.escopo.setOcupado('');
  await c.soltar();
  assert.equal(c.tela(), '3 dias marcados como posso.');
});
await caso('releitura pedida por outro componente (aoMudar) enquanto o aviso está na tela: o aviso fica', async guarda => {
  const c = guarda(cena({ postos: { f1: 'ok', f2: 'zero' } }));
  await c.responder();
  const aviso = c.tela();
  await c.avancar(4200);
  await c.escopo.carregar(false);
  assert.equal(c.tela(), aviso);
  assert.equal(c.releituras().length, 2);
});
await caso('falha total com a releitura de uma ação anterior em voo: o erro fica', async guarda => {
  const c = guarda(cena({ postos: { f1: 'ok', f2: 'ok', f3: 'falha' } }));
  await c.responder();
  c.banco.segurar = true;
  await c.avancar(1200);
  await c.responder('confirmado', c.estado.itens.filter(i => i.culto_id === 'c2'));
  assert.equal(c.tela(), aviseHumano(QUEDA, 'salvar'));
  await c.soltar();
  assert.equal(c.tela(), aviseHumano(QUEDA, 'salvar'));
  assert.equal(c.estado.itens[2].status, 'pendente');
});

const falhas = resultados.filter(r => !r).length;
console.log(`resposta-releitura: ${resultados.length - falhas}/${resultados.length} ok`);
if (falhas) process.exit(1);
