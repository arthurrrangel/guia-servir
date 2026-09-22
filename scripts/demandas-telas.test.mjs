/* AS QUATRO TELAS DE DEMANDAS, EXECUTADAS DE VERDADE.

   ===========================================================================
   POR QUE ESTE ARQUIVO EXISTE

   Até 22/09/2026, NENHUM teste da suíte executava `app/demandas/page.tsx`,
   `nova/page.tsx`, `numeros/page.tsx` ou `ajustes/page.tsx`. Os que citam
   esses caminhos (`demandas-css`, `classe-que-a-folha-conhece`,
   `demandas-token-na-url`, `demandas-porta-propria`) abrem os arquivos com
   `readFileSync` e passam expressão regular: eles medem GRAFIA, não
   comportamento. Um deles chega a dizer isso de si mesmo.

   Este repositório já pagou essa conta uma vez. O cabeçalho de
   `scripts/_ts.mjs` conta: `cron-guarda.test.mjs`, na primeira versão, casava
   texto e continuava VERDE com o guarda REMOVIDO. Um teste que lê código em
   vez de rodá-lo não testa comportamento, testa ortografia, e dá a impressão
   de cobertura exatamente onde não há nenhuma.

   Aqui as telas rodam. O React monta os componentes de verdade, os efeitos
   rodam, os toques passam pelo sistema de eventos do próprio React, e as
   respostas do banco voltam como voltariam: pelo `lib/demandas/api.ts` real,
   pelo `rpcCom` real, traduzidas pelo `regras.ts` real.

   ===========================================================================
   COMO A PONTE FUNCIONA, EM TRÊS PEÇAS

   1. O Node não sabe carregar `.tsx` (ele tira tipos, não JSX). Um gancho de
      módulo transpila cada `.tsx` com o TypeScript que já está no repositório
      e devolve o resultado. Nenhum arquivo do produto é alterado, e a FONTE
      que roda é a fonte que está no disco: sabotar a linha real reprova.

   2. Quatro módulos ganham dublê: `next/link`, `next/navigation`,
      `@/lib/supabase` e `@/lib/confirmar`. Só esses. O dublê de Supabase é o
      que importa: ele entrega um `rpc(nome, args)` controlado por este
      arquivo, e com isso TODO o resto do caminho (api.ts, rpcCom, a tradução
      de erro, a casca que pergunta "quem sou eu") continua sendo o de
      produção.

   3. Um DOM escrito à mão, com o mínimo que o react-dom 19 encosta. Não há
      jsdom neste container e instalar um seria trocar um teste por uma
      dependência.

   ===========================================================================
   O QUE ESTE ARQUIVO NÃO MEDE, E POR QUÊ

   · LAYOUT. Nada aqui tem caixa, largura ou fonte: o DOM é de mentira e não
     calcula estilo. Largura de pílula, filtro que cabe em 360px e alvo de
     toque continuam sendo trabalho do `scripts/medida-celular.mjs` e do
     `scripts/demandas-celular.mjs`, que abrem um Chromium de verdade.
   · A FOLHA. Que toda classe `dm-` escrita no JSX exista, e que nenhuma regra
     da folha fique órfã, é de `classe-que-a-folha-conhece.test.mjs`.
   · O BANCO. `dem_lista`, `dem_numeros` e `dem_ajustar` são dublês. Que o
     servidor aceite `status: 'concluida'` e que `dem_ajustar` sem `id` faça
     insert é conferido em `supabase/demandas-banco.test.sql`, contra um
     Postgres de verdade. Aqui se mede o que a TELA pede, não o que o banco
     responde.
   · SSR E HIDRATAÇÃO. Os componentes montam só do lado do cliente. Se uma
     tela passar a divergir entre servidor e cliente, este arquivo não vê.
   · `app/demandas/d/[numero]/page.tsx`. A ficha tem dono diferente do desta
     rodada e não entra aqui.

   Uso: node --import ./scripts/_ts.mjs scripts/demandas-telas.test.mjs
*/

import { createRequire, register } from 'node:module';
import { pathToFileURL } from 'node:url';

/* ======================================================= 1. a ponte de módulos */

const TS = pathToFileURL(createRequire(import.meta.url).resolve('typescript')).href;
const RAIZ = pathToFileURL(process.cwd() + '/').href;

const DUBLES = {
  'next/link': `
    import { createElement } from 'react';
    export default function Link({ href, children, ...r }) {
      return createElement('a', { href: String(href), ...r }, children);
    }`,
  'next/navigation': `
    export const usePathname = () => '/demandas';
    export const useRouter = () => ({ push() {}, replace() {}, refresh() {} });
    export const useSearchParams = () => new URLSearchParams('');`,
  /* o único dublê que muda o comportamento medido: ele devolve o cliente que
     este arquivo controla. Tudo o que vem depois (api.ts, rpcCom, regras.ts)
     é o código de produção. */
  '@/lib/supabase': `
    export const sb = () => globalThis.__banco;
    export const sbPublico = () => globalThis.__banco;
    export const lerCredenciais = () => ({ url: 'x', key: 'y' });
    export const gravarCredenciais = () => {};`,
  '@/lib/confirmar': `
    export const confirmar = async () => globalThis.__confirma !== false;`,
};

/* O dublê responde numa URL `file:` dentro do projeto, e não num esquema
   inventado: `import { createElement } from 'react'` dentro dele precisa de
   uma base hierárquica para o Node achar `node_modules`. Com `stub:next/link`
   a resolução de `react` morria em ERR_INVALID_URL. */
register(new URL('data:text/javascript,' + encodeURIComponent(`
  import { readFileSync } from 'node:fs';
  import { fileURLToPath } from 'node:url';
  const DUBLES = ${JSON.stringify(DUBLES)};
  const TS = ${JSON.stringify(TS)};
  const RAIZ = ${JSON.stringify(RAIZ)};
  const PREFIXO = RAIZ + 'duble.';
  const urlDe = s => PREFIXO + encodeURIComponent(s) + '.mjs';

  export async function resolve(spec, ctx, next) {
    if (DUBLES[spec]) return { url: urlDe(spec), shortCircuit: true, format: 'module' };
    return next(spec, ctx);
  }
  export async function load(url, ctx, next) {
    if (url.startsWith(PREFIXO)) {
      const nome = decodeURIComponent(url.slice(PREFIXO.length, -4));
      return { format: 'module', shortCircuit: true, source: DUBLES[nome] };
    }
    if (url.endsWith('.tsx')) {
      const ts = (await import(TS)).default;
      const bruto = readFileSync(fileURLToPath(url), 'utf8');
      const saida = ts.transpileModule(bruto, {
        compilerOptions: { target: 'es2022', module: 'esnext', jsx: 'react-jsx' },
        fileName: fileURLToPath(url),
      }).outputText;
      return { format: 'module', shortCircuit: true, source: saida };
    }
    return next(url, ctx);
  }
`)), pathToFileURL('./'));

/* ============================================================ 2. o DOM de mentira

   O mínimo que o react-dom 19 toca, e cada peça aqui está porque ele quebrou
   sem ela. As duas menos óbvias, medidas contra a versão 19.0.0:

     · `document.activeElement` e `window.HTMLIFrameElement`: o commit passa
       por `getActiveElementDeep`, que faz `element instanceof
       containerInfo.HTMLIFrameElement` antes de qualquer pintura. Sem os
       dois, toda montagem morria em "Right-hand side of 'instanceof' is not
       an object".
     · `value` NÃO é getter de protótipo aqui, de propósito. O rastreador de
       valor do React (`trackValueOnNode`) desiste quando
       `Object.getOwnPropertyDescriptor(node.constructor.prototype, 'value')`
       não existe, e é justamente esse desistir que faz todo `input` dedurar
       mudança para o onChange nos testes daqui. `option` é a exceção: ele
       PRECISA de `value` no protótipo porque `updateOptions` compara
       `node.options[i].value`, e o rastreador nunca olha para um `option`.
     · `input.type` cai em 'text' quando ninguém escreveu o atributo. Sem
       isso, `isTextInputElement` respondia não para todo campo sem `type`
       (o de busca do painel, o Título, a descrição), o plugin de mudança do
       React não reconhecia o evento `input`, e NENHUM onChange de texto
       disparava: as teclas entravam e o estado não mexia. */

class No {
  constructor(doc, tipo) {
    this.ownerDocument = doc; this.nodeType = tipo;
    this.childNodes = []; this.parentNode = null; this._ouvintes = new Map();
  }
  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
  get nextSibling() {
    const p = this.parentNode; if (!p) return null;
    return p.childNodes[p.childNodes.indexOf(this) + 1] || null;
  }
  get previousSibling() {
    const p = this.parentNode; if (!p) return null;
    return p.childNodes[p.childNodes.indexOf(this) - 1] || null;
  }
  appendChild(n) { return this.insertBefore(n, null); }
  insertBefore(n, ref) {
    if (n.parentNode) n.parentNode.removeChild(n);
    const i = ref ? this.childNodes.indexOf(ref) : this.childNodes.length;
    this.childNodes.splice(i < 0 ? this.childNodes.length : i, 0, n);
    n.parentNode = this; return n;
  }
  removeChild(n) {
    const i = this.childNodes.indexOf(n);
    if (i >= 0) this.childNodes.splice(i, 1);
    n.parentNode = null; return n;
  }
  replaceChild(novo, velho) { this.insertBefore(novo, velho); this.removeChild(velho); return velho; }
  contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
  get textContent() {
    if (this.nodeType === 3 || this.nodeType === 8) return this.dados;
    return this.childNodes.map(c => c.textContent).join('');
  }
  set textContent(v) {
    if (this.nodeType === 3 || this.nodeType === 8) { this.dados = String(v); return; }
    this.childNodes.slice().forEach(c => this.removeChild(c));
    if (v !== '' && v != null) this.appendChild(this.ownerDocument.createTextNode(String(v)));
  }
  addEventListener(t, fn, op) {
    const k = t + (op === true || (op && op.capture) ? '!' : '');
    if (!this._ouvintes.has(k)) this._ouvintes.set(k, new Set());
    this._ouvintes.get(k).add(fn);
  }
  removeEventListener(t, fn, op) {
    const s = this._ouvintes.get(t + (op === true || (op && op.capture) ? '!' : ''));
    if (s) s.delete(fn);
  }
  getRootNode() { let x = this; while (x.parentNode) x = x.parentNode; return x; }
  /* O React pendura os ouvintes NA RAIZ e reconstrói o caminho pelos fibers,
     não pelo DOM. Então basta subir a árvore chamando quem escutou: captura
     de cima para baixo, borbulha de baixo para cima. */
  dispatchEvent(ev) {
    const caminho = [];
    for (let x = this; x; x = x.parentNode) caminho.push(x);
    if (this.ownerDocument && !caminho.includes(this.ownerDocument)) caminho.push(this.ownerDocument);
    ev.target = this;
    for (let i = caminho.length - 1; i >= 0; i--) {
      const s = caminho[i]._ouvintes.get(ev.type + '!');
      if (s) for (const fn of [...s]) { ev.currentTarget = caminho[i]; fn.call(caminho[i], ev); }
    }
    for (let i = 0; i < caminho.length; i++) {
      const s = caminho[i]._ouvintes.get(ev.type);
      if (s) for (const fn of [...s]) { ev.currentTarget = caminho[i]; fn.call(caminho[i], ev); }
      if (!ev.bubbles) break;
    }
    return !ev.defaultPrevented;
  }
}

class Texto extends No {
  constructor(doc, d) { super(doc, 3); this.dados = String(d); this.nodeName = '#text'; }
  get data() { return this.dados; } set data(v) { this.dados = String(v); }
  get nodeValue() { return this.dados; } set nodeValue(v) { this.dados = String(v); }
}
class Comentario extends No {
  constructor(doc, d) { super(doc, 8); this.dados = String(d); this.nodeName = '#comment'; }
  get data() { return this.dados; } set data(v) { this.dados = String(v); }
}
class Estilo {
  constructor() { this._m = new Map(); }
  setProperty(k, v) { this._m.set(k, v); }
  removeProperty(k) { this._m.delete(k); }
  getPropertyValue(k) { return this._m.get(k) || ''; }
  get cssText() { return [...this._m].map(([k, v]) => `${k}:${v}`).join(';'); }
  set cssText(_v) { this._m.clear(); }
}
class Elemento extends No {
  constructor(doc, tag, ns) {
    super(doc, 1);
    this.tagName = String(tag).toUpperCase(); this.nodeName = this.tagName;
    this.namespaceURI = ns || 'http://www.w3.org/1999/xhtml';
    this.atributos = new Map(); this.style = new Estilo();
  }
  setAttribute(k, v) { this.atributos.set(String(k), String(v)); }
  setAttributeNS(_ns, k, v) { this.atributos.set(String(k), String(v)); }
  getAttribute(k) { return this.atributos.has(k) ? this.atributos.get(k) : null; }
  hasAttribute(k) { return this.atributos.has(k); }
  removeAttribute(k) { this.atributos.delete(String(k)); }
  removeAttributeNS(_ns, k) { this.atributos.delete(String(k)); }
  get attributes() { return [...this.atributos].map(([name, value]) => ({ name, value })); }
  get type() {
    const a = this.atributos.get('type');
    return a !== undefined ? a : (this.tagName === 'INPUT' ? 'text' : undefined);
  }
  set type(v) { this.atributos.set('type', String(v)); }
  /* `defaultValue` DE UM `textarea` É O TEXTO DO ELEMENTO, no DOM de verdade,
     e o react-dom conta com isso: `initTextarea` grava `defaultValue`, lê
     `element.textContent` de volta e SÓ ENTÃO copia para `element.value`. Sem
     a ligação entre os dois, a descrição restaurada de um rascunho aparecia
     no estado do React e não aparecia no campo. */
  get defaultValue() { return this._padrao === undefined ? '' : this._padrao; }
  set defaultValue(v) {
    this._padrao = String(v);
    if (this.tagName === 'TEXTAREA') this.textContent = this._padrao;
  }
  get options() {
    if (this.tagName !== 'SELECT') return undefined;
    const fora = [];
    (function anda(x) {
      for (const c of x.childNodes) { if (c.tagName === 'OPTION') fora.push(c); else anda(c); }
    })(this);
    return fora;
  }
  get innerHTML() { return ''; }
  set innerHTML(_v) { this.childNodes.slice().forEach(c => this.removeChild(c)); }
  focus() { this.ownerDocument._foco = this; }
  blur() {} select() {}
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
}
class Opcao extends Elemento {
  constructor(doc) { super(doc, 'option'); this.selected = false; this.defaultSelected = false; this.disabled = false; }
  get value() {
    const a = this.atributos.get('value');
    return a !== undefined ? a : this.textContent;
  }
  set value(v) { this.atributos.set('value', String(v)); }
}
class Documento extends No {
  constructor() {
    super(null, 9);
    this.ownerDocument = null; this.nodeName = '#document';
    /* `oninput` E `onchange` EXISTEM AQUI SÓ PARA SEREM ENCONTRADOS.

       O react-dom decide UMA VEZ, ao ser importado, se o navegador tem evento
       `input` nativo: `isEventSupported("input")` faz `"oninput" in document`.
       Sem a chave, ele conclui que está num navegador de 2008 e troca o
       caminho do onChange pelo remendo de IE8, que só reage depois de um
       `focusin` e nunca pelo `input`. Medido: o handler de TODO campo de
       texto (busca do painel, Título, descrição, orçamento, nome da
       categoria) simplesmente não era chamado, as teclas entravam e o estado
       não mexia, e três casos deste arquivo reprovavam por um defeito que não
       existia no produto. */
    this.oninput = null; this.onchange = null;
    this.documentElement = this.createElement('html');
    this.documentElement.parentNode = this;
    this.childNodes = [this.documentElement];
    this.head = this.createElement('head'); this.body = this.createElement('body');
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
  }
  get activeElement() { return this._foco || this.body; }
  createElement(t) { return String(t).toLowerCase() === 'option' ? new Opcao(this) : new Elemento(this, t); }
  createElementNS(ns, t) { return new Elemento(this, t, ns); }
  createTextNode(d) { return new Texto(this, d); }
  createComment(d) { return new Comentario(this, d); }
  createDocumentFragment() { const f = new No(this, 11); f.nodeName = '#fragment'; return f; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  getElementById() { return null; }
}

function montarMundo() {
  const doc = new Documento();
  const win = {
    document: doc,
    navigator: { userAgent: 'node' },
    location: { href: 'http://x/demandas', search: '', pathname: '/demandas', hash: '', origin: 'http://x' },
    history: { replaceState() {}, pushState() {} },
    addEventListener() {}, removeEventListener() {},
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: fn => setTimeout(() => fn(Date.now()), 0),
    cancelAnimationFrame: id => clearTimeout(id),
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
  };
  doc.defaultView = win;
  win.Node = No; win.Element = Elemento; win.HTMLElement = Elemento;
  win.Text = Texto; win.Comment = Comentario; win.DocumentFragment = No;
  win.HTMLIFrameElement = class extends Elemento {};
  globalThis.window = win;
  globalThis.document = doc;
  Object.defineProperty(globalThis, 'navigator', { value: win.navigator, configurable: true, writable: true });
  globalThis.location = win.location;
  globalThis.Node = No; globalThis.Element = Elemento; globalThis.HTMLElement = Elemento;
  globalThis.Text = Texto; globalThis.Comment = Comentario;
  globalThis.requestAnimationFrame = win.requestAnimationFrame;
  globalThis.cancelAnimationFrame = win.cancelAnimationFrame;
  globalThis.getComputedStyle = win.getComputedStyle;
  return doc;
}

const evento = (tipo, extra = {}) => ({
  type: tipo, bubbles: true, cancelable: true, defaultPrevented: false,
  target: null, currentTarget: null, eventPhase: 0, isTrusted: false,
  timeStamp: Date.now(), detail: 0, view: globalThis.window,
  preventDefault() { this.defaultPrevented = true; },
  stopPropagation() {}, stopImmediatePropagation() {},
  ...extra,
});

/* ===================================================== 3. o armário de mentira */

/* `demandas.rascunho` e `demandas.link` moram aqui; `escala.*` NÃO pode ser
   tocado pelo sistema de demandas, e um dos casos abaixo cobra isso. */
function armario() {
  const m = new Map();
  const a = {
    mapa: m, explode: false,
    getItem(k) { if (a.explode) throw new Error('SecurityError: acesso negado'); return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { if (a.explode) throw new Error('QuotaExceededError'); m.set(k, String(v)); },
    removeItem(k) { if (a.explode) throw new Error('SecurityError: acesso negado'); m.delete(k); },
    clear() { m.clear(); },
  };
  return a;
}

/* ========================================================= 4. o banco de mentira */

const EU_GESTOR = {
  ok: true, id: 'u1', nome: 'Ana Silva', primeiro_nome: 'Ana', papel: 'gestor',
  setor_id: 's1', setor: 'Comunicação', setor_atende: true, tem_login: true,
};
const EU_ADMIN = { ...EU_GESTOR, papel: 'admin' };

const demanda = (numero, extra = {}) => ({
  numero, titulo: 'Arte do culto ' + numero, status: 'aberta', travada_por: null,
  prioridade: 'normal', categoria: 'Criação de arte', grupo: 'Comunicação',
  solicitante: 'Ana', responsavel_setor: 'Comunicação', responsavel: null, abriu: 'Ana',
  prazo: null, evento: null, evento_data: null, aprovacao: null, falta_aprovacao: false,
  responsavel_id: null, criada_em: '2026-09-01T10:00:00Z', mexida_em: '2026-09-01T10:00:00Z',
  parada_dias: 0, atrasada: false, reaberturas: 0, ...extra,
});

/* Cada resposta pode ser um valor (volta na hora) ou uma função que devolve
   promessa; o caso da resposta fora de ordem usa a segunda forma para segurar
   duas consultas no ar ao mesmo tempo. */
function banco(respostas) {
  const chamadas = [];
  return {
    chamadas,
    ultima: nome => [...chamadas].reverse().find(c => c.nome === nome),
    quantas: nome => chamadas.filter(c => c.nome === nome).length,
    rpc: async (nome, args) => {
      chamadas.push({ nome, args });
      const r = respostas[nome];
      const valor = typeof r === 'function' ? await r(args, chamadas.filter(c => c.nome === nome).length - 1) : r;
      if (valor === undefined) return { data: { ok: true }, error: null };
      if (valor && valor.__erro) return { data: null, error: valor.__erro };
      return { data: valor, error: null };
    },
  };
}

/* ============================================================ 5. ajudantes de teste */

let React, act, createRoot;

async function ligarReact() {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
  React = (await import('react')).default;
  act = (await import('react')).act;
  createRoot = (await import('react-dom/client')).createRoot;
}

async function montar(Componente) {
  const alvo = document.createElement('div');
  document.body.appendChild(alvo);
  let raiz;
  await act(async () => { raiz = createRoot(alvo); raiz.render(React.createElement(Componente)); });
  await assentar();
  return { alvo, desmontar: async () => { await act(async () => { raiz.unmount(); }); alvo.remove(); } };
}

/* deixa assentar o que a montagem disparou: a promessa do `quemSou`, a
   mudança de estado que ela causa, o efeito filho que ela solta e a promessa
   DESSE efeito. Quatro voltas cobrem a cadeia mais funda destas telas. */
async function assentar(voltas = 4) {
  for (let i = 0; i < voltas; i++) await act(async () => { await Promise.resolve(); });
}

/* a espera roda DENTRO de `act`: o `setTimeout` do tempo de espera da busca
   dispara `setTermo`, e uma mudança de estado fora de `act` é justamente o
   que o React avisa que não foi medido do jeito que o navegador faria */
async function assentarDepoisDe(ms) {
  await act(async () => { await new Promise(r => setTimeout(r, ms)); });
  await assentar();
}

function todos(no, pred) {
  const fora = [];
  (function anda(x) {
    if (pred(x)) fora.push(x);
    for (const c of x.childNodes || []) anda(c);
  })(no);
  return fora;
}
const porTag = (no, tag) => todos(no, x => x.nodeType === 1 && x.tagName === tag);
const texto = no => no.textContent.replace(/\s+/g, ' ').trim();
const botao = (no, rot) => porTag(no, 'BUTTON').find(b => texto(b) === rot);
const porAria = (no, chave, v) => todos(no, x => x.nodeType === 1 && x.getAttribute(chave) === v)[0];

/* `Campo` e `Bloco` são `<label>`/`<div>` com `<span>rótulo</span>` na frente */
function campo(no, rot) {
  const caixa = todos(no, x =>
    x.nodeType === 1 && (x.getAttribute('class') || '').includes('dm-campo')
    && x.firstChild && x.firstChild.tagName === 'SPAN' && texto(x.firstChild) === rot)[0];
  if (!caixa) return null;
  return porTag(caixa, 'INPUT')[0] || porTag(caixa, 'TEXTAREA')[0] || porTag(caixa, 'SELECT')[0] || null;
}

/* Quando o alvo não está na tela, isto REPROVA em vez de explodir. Medido
   sabotando o produto: a primeira sabotagem que sumia com um botão derrubava
   o processo num `Cannot read properties of undefined`, e as duas dezenas de
   casos seguintes nunca rodavam. Teste que morre no primeiro tropeço não diz
   o tamanho do estrago. */
function existe(no, oQue) {
  if (no) return true;
  ok(false, `não achei na tela: ${oQue}`);
  return false;
}
async function clicar(no, oQue = 'o que ia receber o toque') {
  if (!existe(no, oQue)) return;
  await act(async () => { no.dispatchEvent(evento('click', { button: 0 })); });
  await assentar();
}
/* sem `await assentar()`: os casos de tempo de espera precisam poder bater
   quatro teclas sem dar tempo a nenhuma consulta */
async function teclar(no, valor, oQue = 'o campo') {
  if (!existe(no, oQue)) return;
  await act(async () => { no.value = valor; no.dispatchEvent(evento('input')); });
}
async function escolher(no, valor, oQue = 'o seletor') {
  if (!existe(no, oQue)) return;
  await act(async () => { no.value = valor; no.dispatchEvent(evento('change')); });
  await assentar();
}
const valorDe = no => (no ? String(no.value === undefined ? '' : no.value) : '(campo ausente)');

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => {
  feitas++;
  if (!c) { falhas++; console.log('  FALHOU:', rot, extra ? '\n           ' + extra : ''); }
};

/* cada caso começa com mundo, armário e banco novos: estado que vaza de um
   caso para o outro é como um teste passa a medir a ordem em que foi escrito */
function mundoNovo() {
  montarMundo();
  const arm = armario();
  globalThis.localStorage = arm;
  globalThis.window.localStorage = arm;
  return arm;
}

/* O MUNDO NASCE ANTES DO react-dom SER IMPORTADO, E A ORDEM É O CONSERTO.

   `canUseDOM` e `isInputEventSupported` são constantes calculadas no topo do
   módulo do react-dom, na hora do import. Importando primeiro, ele nasce
   achando que não há DOM nenhum, e nada que este arquivo montar depois muda
   isso. */
montarMundo();
await ligarReact();

const Painel = (await import('@/app/demandas/page.tsx')).default;
const Nova = (await import('@/app/demandas/nova/page.tsx')).default;
const Numeros = (await import('@/app/demandas/numeros/page.tsx')).default;
const Ajustes = (await import('@/app/demandas/ajustes/page.tsx')).default;

/* ===========================================================================
   1 · O QUARTO RECORTE, E O QUE ELE MANDA PARA O BANCO
   =========================================================================== */
console.log('\n1. O painel tem o recorte de concluídas, e ele vira `status: concluida`');
{
  mundoNovo();
  const b = banco({
    dem_quem_sou: EU_GESTOR,
    dem_lista: { ok: true, itens: [demanda(1)], total: 1, tem_mais: false },
  });
  globalThis.__banco = b;
  const { alvo, desmontar } = await montar(Painel);

  const tira = porAria(alvo, 'aria-label', 'Em que estado');
  const rotulos = porTag(tira, 'BUTTON').map(texto);
  ok(rotulos.length === 4, 'a tira de estado tem quatro botões', rotulos.join(' | '));
  ok(rotulos.includes('Concluídas'), 'um deles é "Concluídas"', rotulos.join(' | '));

  const primeira = b.ultima('dem_lista');
  ok(primeira.args.p_f.abertas === true && primeira.args.p_f.status === undefined,
    'a carga inicial continua pedindo só as abertas', JSON.stringify(primeira.args.p_f));

  await clicar(botao(tira, 'Concluídas'));
  const f = b.ultima('dem_lista').args.p_f;
  ok(f.status === 'concluida', 'tocar em Concluídas manda status: "concluida"', JSON.stringify(f));
  ok(f.abertas === undefined && f.atrasadas === undefined,
    'e não manda abertas nem atrasadas junto', JSON.stringify(f));
  ok(porAria(alvo, 'aria-pressed', 'true') && texto(botao(tira, 'Concluídas')) === 'Concluídas'
     && botao(tira, 'Concluídas').getAttribute('aria-pressed') === 'true',
    'o botão fica marcado como o recorte ativo');

  await clicar(botao(tira, 'Todas'));
  const g = b.ultima('dem_lista').args.p_f;
  ok(g.status === undefined && g.abertas === undefined && g.atrasadas === undefined,
    'voltar para Todas tira o filtro de status', JSON.stringify(g));
  await desmontar();
}
{
  /* o vazio do quarto recorte não pode falar a frase de outro recorte */
  mundoNovo();
  globalThis.__banco = banco({
    dem_quem_sou: EU_GESTOR,
    dem_lista: { ok: true, itens: [], total: 0, tem_mais: false },
  });
  const { alvo, desmontar } = await montar(Painel);
  await clicar(botao(porAria(alvo, 'aria-label', 'Em que estado'), 'Concluídas'));
  ok(/concluí/i.test(texto(alvo)) && !/Nenhuma demanda em aberto/.test(texto(alvo)),
    'a lista vazia em Concluídas fala de concluídas, não de abertas',
    texto(alvo).slice(0, 220));
  await desmontar();
}

/* ===========================================================================
   2 · A RESPOSTA ATRASADA NÃO SOBRESCREVE A RECENTE
   =========================================================================== */
console.log('\n2. Resposta que chega atrasada é descartada');
{
  mundoNovo();
  const presas = [];
  const b = banco({
    dem_quem_sou: EU_GESTOR,
    dem_lista: (_args, n) => {
      if (n === 0) return { ok: true, itens: [demanda(1, { titulo: 'CARGA INICIAL' })], total: 1, tem_mais: false };
      return new Promise(resolver => presas.push(resolver));
    },
  });
  globalThis.__banco = b;
  const { alvo, desmontar } = await montar(Painel);
  ok(/CARGA INICIAL/.test(texto(alvo)), 'a carga inicial apareceu');

  const tira = porAria(alvo, 'aria-label', 'Em que estado');
  await act(async () => { botao(tira, 'Atrasadas').dispatchEvent(evento('click', { button: 0 })); });
  await act(async () => { botao(tira, 'Todas').dispatchEvent(evento('click', { button: 0 })); });
  ok(presas.length === 2, 'as duas consultas estão no ar ao mesmo tempo', String(presas.length));

  /* a SEGUNDA volta primeiro, a PRIMEIRA depois: é o caso medido no
     navegador com a resposta antiga atrasada em 4 segundos */
  await act(async () => {
    presas[1]({ ok: true, itens: [demanda(9, { titulo: 'A QUE EU PEDI POR ÚLTIMO' })], total: 1, tem_mais: false });
  });
  await assentar();
  ok(/A QUE EU PEDI POR ÚLTIMO/.test(texto(alvo)), 'a consulta mais nova pintou a tela');

  await act(async () => {
    presas[0]({ ok: true, itens: [demanda(7, { titulo: 'A RESPOSTA VELHA' })], total: 1, tem_mais: false });
  });
  await assentar();
  ok(!/A RESPOSTA VELHA/.test(texto(alvo)),
    'a resposta velha, chegando depois, NÃO pinta por cima', texto(alvo).slice(0, 260));
  ok(/A QUE EU PEDI POR ÚLTIMO/.test(texto(alvo)),
    'e o que a pessoa pediu por último continua na tela');
  await desmontar();
}
{
  /* o mesmo buraco existia em Números, e com consequência pior: número certo
     debaixo do rótulo de outro período */
  mundoNovo();
  const presas = [];
  const b = banco({
    dem_quem_sou: EU_GESTOR,
    dem_numeros: (_a, n) => {
      if (n === 0) return { ok: true, numeros: numerosDe({ total: 1 }) };
      return new Promise(r => presas.push(r));
    },
  });
  globalThis.__banco = b;
  const { alvo, desmontar } = await montar(Numeros);
  const periodo = porAria(alvo, 'aria-label', 'Período');
  await act(async () => { botao(periodo, '30 dias').dispatchEvent(evento('click', { button: 0 })); });
  await act(async () => { botao(periodo, '1 ano').dispatchEvent(evento('click', { button: 0 })); });
  ok(presas.length === 2, 'Números também segurou duas consultas no ar', String(presas.length));
  await act(async () => { presas[1]({ ok: true, numeros: numerosDe({ total: 4242 }) }); });
  await assentar();
  await act(async () => { presas[0]({ ok: true, numeros: numerosDe({ total: 7 }) }); });
  await assentar();
  ok(/4242/.test(texto(alvo)) && !/(^|\D)7 demandas abertas/.test(texto(alvo)),
    'Números ignora a resposta do período que ninguém pediu mais', texto(alvo).slice(0, 200));
  await desmontar();
}

/* ===========================================================================
   3 · O TEMPO DE ESPERA DA BUSCA
   =========================================================================== */
console.log('\n3. Digitar agrupa as teclas; tocar num filtro continua instantâneo');
{
  mundoNovo();
  const b = banco({
    dem_quem_sou: EU_GESTOR,
    dem_lista: { ok: true, itens: [demanda(1)], total: 1, tem_mais: false },
  });
  globalThis.__banco = b;
  const { alvo, desmontar } = await montar(Painel);
  const antes = b.quantas('dem_lista');
  ok(antes === 1, 'uma consulta na carga inicial', String(antes));

  const procurar = porAria(alvo, 'aria-label', 'Procurar');
  for (const t of ['a', 'ar', 'art', 'arte']) await teclar(procurar, t);
  await assentar();
  ok(b.quantas('dem_lista') === antes,
    'quatro teclas em sequência não disparam consulta nenhuma',
    `${b.quantas('dem_lista') - antes} consulta(s) a mais`);

  await assentarDepoisDe(420);
  ok(b.quantas('dem_lista') === antes + 1,
    'passado o tempo de espera, sai UMA consulta',
    `${b.quantas('dem_lista') - antes} consulta(s)`);
  ok(b.ultima('dem_lista').args.p_f.busca === 'arte',
    'e ela leva o termo inteiro', JSON.stringify(b.ultima('dem_lista').args.p_f));

  /* treze letras eram treze consultas: o defeito medido */
  const antesDeDigitarMuito = b.quantas('dem_lista');
  const frase = 'arte do culto';
  for (let i = 1; i <= frase.length; i++) await teclar(procurar, frase.slice(0, i));
  await assentar();
  await assentarDepoisDe(420);
  ok(b.quantas('dem_lista') === antesDeDigitarMuito + 1,
    '"arte do culto" (13 teclas) vira 1 consulta, e não 13',
    `${b.quantas('dem_lista') - antesDeDigitarMuito} consulta(s)`);

  const antesDoToque = b.quantas('dem_lista');
  await clicar(botao(porAria(alvo, 'aria-label', 'Em que estado'), 'Atrasadas'));
  ok(b.quantas('dem_lista') === antesDoToque + 1,
    'o filtro NÃO espera: um toque, uma consulta, na hora',
    `${b.quantas('dem_lista') - antesDoToque} consulta(s)`);
  await desmontar();
}
{
  /* e a lista antiga fica no lugar enquanto a nova não chega */
  mundoNovo();
  const presas = [];
  globalThis.__banco = banco({
    dem_quem_sou: EU_GESTOR,
    dem_lista: (_a, n) => n === 0
      ? { ok: true, itens: [demanda(1, { titulo: 'O QUE JÁ ESTAVA NA TELA' })], total: 1, tem_mais: false }
      : new Promise(r => presas.push(r)),
  });
  const { alvo, desmontar } = await montar(Painel);
  await act(async () => {
    botao(porAria(alvo, 'aria-label', 'Em que estado'), 'Todas').dispatchEvent(evento('click', { button: 0 }));
  });
  await assentar();
  ok(/O QUE JÁ ESTAVA NA TELA/.test(texto(alvo)),
    'trocar de filtro não apaga a lista anterior enquanto a nova não chega',
    texto(alvo).slice(0, 200));
  ok(!!porAria(alvo, 'aria-busy', 'true'),
    'quem anuncia a troca é `aria-busy`, não a tela em branco');
  await act(async () => { presas[0]({ ok: true, itens: [demanda(2, { titulo: 'A NOVA' })], total: 1, tem_mais: false }); });
  await assentar();
  ok(!porAria(alvo, 'aria-busy', 'true') && /A NOVA/.test(texto(alvo)),
    'chegando a resposta, `aria-busy` cai e a lista nova entra');
  await desmontar();
}

/* ===========================================================================
   4 · O VOCABULÁRIO DA LISTA É O DO DOCUMENTO
   =========================================================================== */
console.log('\n4. A pílula da lista fala os nomes do documento');
{
  mundoNovo();
  globalThis.__banco = banco({
    dem_quem_sou: EU_GESTOR,
    dem_lista: {
      ok: true, tem_mais: false, total: 7,
      itens: [
        demanda(1, { status: 'travada', travada_por: 'terceiros' }),
        demanda(2, { status: 'travada', travada_por: 'informacao' }),
        demanda(3, { status: 'travada', travada_por: 'aprovacao' }),
        demanda(4, { status: 'execucao', reaberturas: 2 }),
        demanda(5, { status: 'execucao' }),
        demanda(6, { status: 'aberta', aprovacao: 'aprovada' }),
        demanda(7, { status: 'aberta', falta_aprovacao: true }),
      ],
    },
  });
  const { alvo, desmontar } = await montar(Painel);
  const t = texto(alvo);
  for (const nome of ['Aguardando terceiros', 'Aguardando informações', 'Aguardando aprovação',
                      'Reaberta', 'Em execução', 'Aprovada']) {
    ok(t.includes(nome), `a lista escreve "${nome}"`, t.slice(0, 400));
  }
  ok(!/Travada/i.test(t),
    'e não escreve "Travada", a etiqueta genérica que o documento proíbe', t.slice(0, 400));
  ok(!/esperando alguém de fora|falta aprovação/i.test(t),
    'nem o sufixo de trava que a lista imprimia antes', t.slice(0, 400));

  /* o caso da migração 88: a coluna diz "aberta", o portão diz que falta
     aprovação. A lista tem que dizer o que o servidor vai cobrar. */
  const pilulas = todos(alvo, x => x.nodeType === 1 && (x.getAttribute('class') || '').includes('dm-pill'));
  const daSete = pilulas.map(texto).filter(x => x.includes('Aguardando aprovação'));
  ok(daSete.length === 2,
    'demanda com `falta_aprovacao` sai como "Aguardando aprovação", mesmo com status "aberta"',
    pilulas.map(texto).join(' | '));
  await desmontar();
}

/* ===========================================================================
   5 · O ORÇAMENTO EXISTE EM QUALQUER CATEGORIA
   =========================================================================== */
console.log('\n5. O campo de orçamento não depende da categoria exigir orçamento');
{
  const catSem = {
    id: 'c1', grupo: 'Comunicação', nome: 'Criação de arte', setor_id: 's1',
    exige_aprovacao: false, exige_orcamento: false, prazo_padrao_dias: 3,
  };
  const catCom = { ...catSem, id: 'c2', grupo: 'Compras', nome: 'Compra de equipamentos', exige_orcamento: true };
  mundoNovo();
  globalThis.__banco = banco({
    dem_quem_sou: EU_GESTOR,
    dem_bases: { ok: true, setores: [{ id: 's1', nome: 'Comunicação', slug: 'com', atende: true }], categorias: [catSem, catCom] },
  });
  const { alvo, desmontar } = await montar(Nova);

  ok(!campo(alvo, 'Orçamento estimado (R$)'),
    'a primeira tela continua sem o campo: ele mora dentro da gaveta');
  await clicar(botao(alvo, 'Evento, local, orçamento e anexos'));
  const semCategoria = campo(alvo, 'Orçamento estimado (R$)');
  ok(!!semCategoria, 'aberta a gaveta, o campo está lá mesmo sem categoria escolhida');

  await escolher(campo(alvo, 'Categoria'), 'c1');
  ok(!!campo(alvo, 'Orçamento estimado (R$)'),
    'e continua lá numa categoria que NÃO exige orçamento (31 das 43)');
  await teclar(campo(alvo, 'Orçamento estimado (R$)'), '250,50');
  await assentar();
  ok(valorDe(campo(alvo, 'Orçamento estimado (R$)')) === '250.50',
    'o valor digitado é aceito e a vírgula vira ponto',
    valorDe(campo(alvo, 'Orçamento estimado (R$)')));

  await escolher(campo(alvo, 'Categoria'), 'c2');
  ok(!!campo(alvo, 'Orçamento estimado (R$)') && /exige o valor/i.test(texto(alvo)),
    'na categoria que exige, o campo é o mesmo e a ajuda muda de tom');
  await desmontar();
}

/* ===========================================================================
   6 · O ADMINISTRADOR CRIA CATEGORIA PELA TELA
   =========================================================================== */
console.log('\n6. Ajustes cria categoria, no grupo que já está aberto');
{
  mundoNovo();
  const cats = [
    { id: 'c1', grupo: 'Comunicação', nome: 'Criação de arte', setor_id: 's1', exige_aprovacao: false, exige_orcamento: false, prazo_padrao_dias: 3 },
    { id: 'c2', grupo: 'Compras', nome: 'Compra de equipamentos', setor_id: 's1', exige_aprovacao: true, exige_orcamento: true, prazo_padrao_dias: 7 },
  ];
  const b = banco({
    dem_quem_sou: EU_ADMIN,
    dem_bases: { ok: true, setores: [{ id: 's1', nome: 'Comunicação', slug: 'com', atende: true }], categorias: cats },
    dem_pessoas: { ok: true, membros: [] },
    dem_ajustar: { ok: true, id: 'novo' },
  });
  globalThis.__banco = b;
  const { alvo, desmontar } = await montar(Ajustes);
  await clicar(porTag(alvo, 'BUTTON').find(x => texto(x).startsWith('Categorias')));

  const nome = porAria(alvo, 'aria-label', 'Nome da categoria nova em Comunicação');
  ok(!!nome, 'a aba Categorias tem campo de nome, nascendo no grupo aberto');
  const criar = porTag(alvo, 'BUTTON').filter(x => texto(x) === 'Criar')[0];
  ok(!!criar && criar.getAttribute('disabled') !== null,
    'o botão Criar nasce desligado enquanto não há nome');

  await teclar(nome, 'Cobertura fotográfica');
  await assentar();
  await clicar(porTag(alvo, 'BUTTON').filter(x => texto(x) === 'Criar')[0]);

  const c = b.ultima('dem_ajustar');
  ok(c && c.args.p_o_que === 'categoria', 'o pedido é de categoria', JSON.stringify(c && c.args));
  ok(c && c.args.p_d.nome === 'Cobertura fotográfica' && c.args.p_d.grupo === 'Comunicação',
    'com o nome digitado e o grupo que estava aberto', JSON.stringify(c && c.args.p_d));
  ok(c && !('id' in c.args.p_d),
    'e SEM `id`, que é o que faz `dem_ajustar` inserir em vez de editar',
    JSON.stringify(c && c.args.p_d));

  /* trocar de grupo muda onde a categoria nasce, sem seletor novo */
  await clicar(porTag(alvo, 'BUTTON').find(x => texto(x) === 'Compras'));
  const nome2 = porAria(alvo, 'aria-label', 'Nome da categoria nova em Compras');
  ok(!!nome2, 'a tira de grupos é o único seletor: trocar de grupo muda onde nasce');
  await teclar(nome2, 'Reposição de estoque');
  await assentar();
  await clicar(porTag(alvo, 'BUTTON').filter(x => texto(x) === 'Criar')[0]);
  ok(b.ultima('dem_ajustar').args.p_d.grupo === 'Compras',
    'e a segunda nasce em Compras', JSON.stringify(b.ultima('dem_ajustar').args.p_d));
  await desmontar();
}

/* ===========================================================================
   7 · O RASCUNHO
   =========================================================================== */
console.log('\n7. O pedido começado sobrevive a uma remontagem e some depois do envio');
const BASES_NOVA = {
  ok: true,
  setores: [{ id: 's1', nome: 'Comunicação', slug: 'com', atende: true }],
  categorias: [{
    id: 'c1', grupo: 'Comunicação', nome: 'Criação de arte', setor_id: 's1',
    exige_aprovacao: false, exige_orcamento: false, prazo_padrao_dias: 3,
  }],
};
{
  const arm = mundoNovo();
  globalThis.__banco = banco({ dem_quem_sou: EU_GESTOR, dem_bases: BASES_NOVA });
  const um = await montar(Nova);
  ok(!/pedido começado/i.test(texto(um.alvo)),
    'formulário virgem não diz que havia um pedido começado');
  ok(arm.mapa.get('demandas.rascunho') === undefined,
    'e não guarda rascunho nenhum antes de a pessoa escrever',
    String(arm.mapa.get('demandas.rascunho')));

  await teclar(campo(um.alvo, 'Título'), 'Arte para o culto de celebração');
  await assentar();
  await teclar(campo(um.alvo, 'O que precisa ser feito'), 'Uma arte quadrada para o feed e um story.');
  await assentar();

  const cru = arm.mapa.get('demandas.rascunho');
  ok(!!cru, 'o que foi digitado ficou guardado');
  ok([...arm.mapa.keys()].every(k => k.startsWith('demandas.')),
    'e a chave é do espaço de Demandas, nunca de `escala.*`', [...arm.mapa.keys()].join(', '));
  ok(cru && JSON.parse(cru).r.titulo === 'Arte para o culto de celebração',
    'com o título dentro', String(cru).slice(0, 120));

  /* a interrupção: a aba morre e a pessoa volta */
  await um.desmontar();
  const dois = await montar(Nova);
  ok(valorDe(campo(dois.alvo, 'Título')) === 'Arte para o culto de celebração',
    'ao voltar, o título está de volta no campo', valorDe(campo(dois.alvo, 'Título')));
  ok(valorDe(campo(dois.alvo, 'O que precisa ser feito')) === 'Uma arte quadrada para o feed e um story.',
    'e a descrição também', valorDe(campo(dois.alvo, 'O que precisa ser feito')));
  ok(/Você tinha um pedido começado/.test(texto(dois.alvo)),
    'e uma linha explica por que os campos estão preenchidos');
  ok(!!botao(dois.alvo, 'Descartar'), 'com a opção de descartar');
  ok(arm.mapa.get('demandas.rascunho') !== undefined,
    'e o guardado continua lá depois da remontagem, e não some ao ser lido');

  /* e agora o envio */
  await escolher(campo(dois.alvo, 'Categoria'), 'c1');
  globalThis.__banco = banco({
    dem_quem_sou: EU_GESTOR, dem_bases: BASES_NOVA,
    dem_abrir: { ok: true, numero: 42, precisa_aprovacao: false, setor_responsavel: 'Comunicação', contato: null },
  });
  await clicar(botao(dois.alvo, 'Enviar a demanda'));
  ok(/Demanda #42 registrada/.test(texto(dois.alvo)),
    'a demanda foi aberta', texto(dois.alvo).slice(0, 200));
  ok(arm.mapa.get('demandas.rascunho') === undefined,
    'e o rascunho some depois que o banco confirmou o número',
    String(arm.mapa.get('demandas.rascunho')));
  await dois.desmontar();

  const tres = await montar(Nova);
  ok(valorDe(campo(tres.alvo, 'Título')) === '' && !/pedido começado/i.test(texto(tres.alvo)),
    'a próxima abertura começa limpa', valorDe(campo(tres.alvo, 'Título')));
  await tres.desmontar();
}
{
  /* o que foi digitado atrás da gaveta volta COM a gaveta aberta: guardar o
     trabalho e escondê-lo é meio conserto */
  mundoNovo();
  globalThis.__banco = banco({ dem_quem_sou: EU_GESTOR, dem_bases: BASES_NOVA });
  const um = await montar(Nova);
  await clicar(botao(um.alvo, 'Evento, local, orçamento e anexos'));
  await teclar(campo(um.alvo, 'Orçamento estimado (R$)'), '480', 'orçamento');
  await assentar();
  await um.desmontar();

  const dois = await montar(Nova);
  ok(!!campo(dois.alvo, 'Orçamento estimado (R$)'),
    'a gaveta volta ABERTA quando o rascunho tem campo de dentro dela');
  ok(valorDe(campo(dois.alvo, 'Orçamento estimado (R$)')) === '480',
    'e com o valor que a pessoa tinha digitado',
    valorDe(campo(dois.alvo, 'Orçamento estimado (R$)')));
  await dois.desmontar();
}
{
  /* e um rascunho só da primeira tela não abre a gaveta à toa */
  mundoNovo();
  globalThis.__banco = banco({ dem_quem_sou: EU_GESTOR, dem_bases: BASES_NOVA });
  const um = await montar(Nova);
  await teclar(campo(um.alvo, 'Título'), 'Só o título');
  await assentar();
  await um.desmontar();
  const dois = await montar(Nova);
  ok(!campo(dois.alvo, 'Orçamento estimado (R$)'),
    'rascunho sem campo de detalhe não abre a gaveta');
  await dois.desmontar();
}
{
  /* descartar joga fora de verdade, e não volta na remontagem */
  const arm = mundoNovo();
  globalThis.__banco = banco({ dem_quem_sou: EU_GESTOR, dem_bases: BASES_NOVA });
  const um = await montar(Nova);
  await teclar(campo(um.alvo, 'Título'), 'Pedido que vou descartar');
  await assentar();
  await um.desmontar();

  const dois = await montar(Nova);
  await clicar(botao(dois.alvo, 'Descartar'));
  ok(valorDe(campo(dois.alvo, 'Título')) === '', 'descartar limpa o formulário');
  ok(arm.mapa.get('demandas.rascunho') === undefined, 'e apaga o guardado');
  await dois.desmontar();

  const tres = await montar(Nova);
  ok(valorDe(campo(tres.alvo, 'Título')) === '' && !/pedido começado/i.test(texto(tres.alvo)),
    'e ele não volta na remontagem seguinte');
  await tres.desmontar();
}
{
  /* apagar tudo à mão também descarta: o formulário limpo não deixa fantasma */
  const arm = mundoNovo();
  globalThis.__banco = banco({ dem_quem_sou: EU_GESTOR, dem_bases: BASES_NOVA });
  const um = await montar(Nova);
  await teclar(campo(um.alvo, 'Título'), 'algo');
  await assentar();
  ok(arm.mapa.get('demandas.rascunho') !== undefined, 'guardou ao digitar');
  await teclar(campo(um.alvo, 'Título'), '');
  await assentar();
  ok(arm.mapa.get('demandas.rascunho') === undefined,
    'apagar o que foi escrito apaga o rascunho, sem botão para isso');
  await um.desmontar();
}
{
  /* rascunho corrompido não pode derrubar a tela nem ressuscitar meio pedido */
  const arm = mundoNovo();
  arm.mapa.set('demandas.rascunho', '{isto não é json');
  globalThis.__banco = banco({ dem_quem_sou: EU_GESTOR, dem_bases: BASES_NOVA });
  let caiu = '';
  try {
    const t = await montar(Nova);
    ok(/O que você precisa/.test(texto(t.alvo)), 'com rascunho corrompido a tela abre normal');
    ok(!/pedido começado/i.test(texto(t.alvo)), 'e não anuncia um pedido que não dá para ler');
    ok(arm.mapa.get('demandas.rascunho') === undefined, 'o guardado ilegível é jogado fora');
    await t.desmontar();
  } catch (e) { caiu = String(e && e.message); }
  ok(!caiu, 'e nada foi lançado', caiu);
}

/* ===========================================================================
   8 · localStorage QUE EXPLODE
   =========================================================================== */
console.log('\n8. localStorage indisponível não derruba a tela');
{
  const arm = mundoNovo();
  arm.explode = true;
  globalThis.__banco = banco({ dem_quem_sou: EU_GESTOR, dem_bases: BASES_NOVA });
  let caiu = '';
  try {
    const t = await montar(Nova);
    ok(/O que você precisa/.test(texto(t.alvo)),
      'a tela de abrir demanda monta com o armário lançando em toda leitura');
    await teclar(campo(t.alvo, 'Título'), 'Arte do culto');
    await assentar();
    ok(valorDe(campo(t.alvo, 'Título')) === 'Arte do culto',
      'e continua aceitando o que é digitado, com a escrita do rascunho falhando');
    ok(!/pedido começado/i.test(texto(t.alvo)),
      'sem inventar um rascunho que não existe');
    await t.desmontar();
  } catch (e) { caiu = String(e && e.message); }
  ok(!caiu, 'nenhuma exceção escapou de `nova`', caiu);
}
{
  const arm = mundoNovo();
  arm.explode = true;
  globalThis.__banco = banco({
    dem_quem_sou: EU_GESTOR,
    dem_lista: { ok: true, itens: [demanda(1)], total: 1, tem_mais: false },
  });
  let caiu = '';
  try {
    const t = await montar(Painel);
    ok(/O que a igreja está pedindo/.test(texto(t.alvo)),
      'o painel monta com o armário explodindo (o token guardado é lido dali)');
    await t.desmontar();
  } catch (e) { caiu = String(e && e.message); }
  ok(!caiu, 'nenhuma exceção escapou do painel', caiu);
}

/* ===========================================================================
   9 · NÚMEROS: SETOR POR VOLUME, E O MÊS ÚNICO
   =========================================================================== */
function numerosDe(extra = {}) {
  return {
    de: '2026-09-01', ate: '2026-09-22',
    total: 10, abertas: 4, concluidas: 5, canceladas: 1, atrasadas: 2, reabertas: 0, paradas: 1,
    horas_ate_concluir: 30, horas_ate_resposta: 3, no_prazo_pct: 80, no_prazo_base: 5,
    por_setor: [], por_categoria: [], por_prioridade: {}, motivos_de_atraso: [],
    por_mes: [{ mes: '2026-09', n: 10 }],
    ...extra,
  };
}

console.log('\n9. Números: a tabela por setor sai por volume, e o mês único vira texto');
{
  mundoNovo();
  /* de propósito em ordem alfabética, que é como `dem_numeros` devolve */
  const por_setor = [
    { nome: 'Acolhimento', pediu: 2, atendeu: 0, abertas: 1, atrasadas: 0 },
    { nome: 'Comunicação', pediu: 9, atendeu: 30, abertas: 5, atrasadas: 2 },
    { nome: 'Louvor', pediu: 17, atendeu: 1, abertas: 3, atrasadas: 0 },
    { nome: 'Zeladoria', pediu: 9, atendeu: 4, abertas: 0, atrasadas: 0 },
  ];
  globalThis.__banco = banco({ dem_quem_sou: EU_GESTOR, dem_numeros: { ok: true, numeros: numerosDe({ por_setor }) } });
  const { alvo, desmontar } = await montar(Numeros);

  const corpo = porTag(alvo, 'TBODY')[0];
  const ordem = porTag(corpo, 'TR').map(tr => texto(porTag(tr, 'TD')[0]));
  ok(JSON.stringify(ordem) === JSON.stringify(['Louvor', 'Comunicação', 'Zeladoria', 'Acolhimento']),
    'a tabela sai do que mais pede para o que menos pede', ordem.join(' > '));
  ok(ordem[1] === 'Comunicação' && ordem[2] === 'Zeladoria',
    'empate em "pediu" (9 e 9) cai em "atendeu", e não na sorte', ordem.join(' > '));
  await desmontar();
}
{
  mundoNovo();
  globalThis.__banco = banco({
    dem_quem_sou: EU_GESTOR,
    dem_numeros: { ok: true, numeros: numerosDe({ por_mes: [{ mes: '2026-09', n: 12 }] }) },
  });
  const { alvo, desmontar } = await montar(Numeros);
  const t = texto(alvo);
  ok(/Mês a mês/.test(t), 'a seção de volume por período existe com um mês só');
  ok(/Todo o período cabe em set\/26: 12 demandas/.test(t),
    'e diz o número do período em texto', t.slice(-320));
  ok(/comparar meses/.test(t), 'apontando o gesto que faz a comparação aparecer');
  await desmontar();
}
{
  mundoNovo();
  globalThis.__banco = banco({
    dem_quem_sou: EU_GESTOR,
    dem_numeros: { ok: true, numeros: numerosDe({ por_mes: [{ mes: '2026-08', n: 4 }, { mes: '2026-09', n: 12 }] }) },
  });
  const { alvo, desmontar } = await montar(Numeros);
  const t = texto(alvo);
  ok(/ago\/26/.test(t) && /set\/26/.test(t), 'com dois meses, os dois aparecem');
  ok(!/Todo o período cabe em/.test(t), 'e a frase do mês único some');
  ok(todos(alvo, x => x.nodeType === 1 && (x.getAttribute('class') || '') === 'dm-barra').length > 0,
    'as barras voltam quando há o que comparar');
  await desmontar();
}
{
  mundoNovo();
  globalThis.__banco = banco({
    dem_quem_sou: EU_GESTOR,
    dem_numeros: { ok: true, numeros: numerosDe({ por_mes: [], total: 0 }) },
  });
  const { alvo, desmontar } = await montar(Numeros);
  ok(/Mês a mês/.test(texto(alvo)) && /Nada no período/.test(texto(alvo)),
    'sem nenhum mês, a seção diz que não houve nada em vez de sumir');
  await desmontar();
}

console.log(`\ndemandas-telas: ${feitas - falhas}/${feitas} ok`);
if (falhas) { console.log(`\n${falhas} falha(s).`); process.exit(1); }
