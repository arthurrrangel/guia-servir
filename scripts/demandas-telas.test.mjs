/* AS CINCO TELAS DE DEMANDAS, EXECUTADAS DE VERDADE.

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

   2. Cinco módulos ganham dublê: `next/link`, `next/navigation`,
      `@/lib/supabase`, `@/lib/confirmar` e o diálogo próprio do Demandas
      (`@/components/demandas/Confirmar`). Só esses. O dublê de Supabase é o
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

   ===========================================================================
   A FICHA ENTROU — 22/09/2026, E ELA ERA O MAIOR BURACO DA SUÍTE

   Até aqui esta linha dizia: "`app/demandas/d/[numero]/page.tsx`. A ficha tem
   dono diferente do desta rodada e não entra aqui." Escrita assim ela parecia
   um recorte de escopo; medida, era o maior buraco de cobertura do sistema.

   São 873 linhas e 33 elementos interativos — a grade de doze botões, sete
   caixas de ação, o cartão verde da etapa 5 do PDF, o aviso do portão de
   aprovação, o "tirar" de cada anexo, a caixinha de comentário interno — e os
   outros dois arquivos que citam esse caminho (`demandas-css`,
   `demandas-porta-propria`) o abrem com `readFileSync` e passam expressão
   regular. Medido por uma auditoria independente: trocar `{a.posso_tirar ? (`
   por `{true ? (` — ou seja, devolver a "tirar" para TODO anexo, que é
   exatamente o defeito que a migração 89 conserta — deixava `npm test` verde.

   Agora ela monta aqui, com o mesmo maquinário das outras quatro.

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
  /* `useParams` e o registro do `push` entraram com a ficha: ela é a única
     tela que lê o número da rota e a única que manda o navegador embora. */
  'next/navigation': `
    export const usePathname = () => globalThis.__caminho || '/demandas';
    export const useRouter = () => ({
      push(u) { (globalThis.__idas = globalThis.__idas || []).push(String(u)); },
      replace() {}, refresh() {},
    });
    export const useSearchParams = () => new URLSearchParams(globalThis.__busca || '');
    export const useParams = () => globalThis.__params || { numero: '1' };`,
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
  /* o diálogo próprio do Demandas (23/09/2026), com o mesmo dublê */
  '@/components/demandas/Confirmar': `
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
  /* AS DUAS QUE A FICHA PRECISA, E NENHUMA A MAIS — 22/09/2026.

     Tocar em "Concluir" abre um formulário no fim de um cartão IRMÃO, e até
     22/09 nada rolava e nada recebia foco: a pessoa tocava, a tela ficava
     igual, e ela concluía que o botão estava morto. O conserto é um
     `scrollIntoView` mais um `querySelector('textarea,input,select')?.focus()`
     no efeito de abrir, e sem estes dois métodos a montagem da ficha morria
     em "n.scrollIntoView is not a function" — ou seja, o teste não rodava por
     causa do CONSERTO.

     `_rolouAte` guarda quem foi rolado, para o caso poder cobrar que rolou.
     Rolagem de verdade não existe aqui (o DOM não calcula caixa), então o que
     se mede é a CHAMADA, que é o que a tela decide.

     O seletor entende uma lista de NOMES DE TAG separados por vírgula, que é
     a única forma que este produto usa. Fingir um seletor CSS completo seria
     escrever um motor de seletor dentro de um teste. */
  scrollIntoView() { this.ownerDocument._rolouAte = this; }
  querySelector(sel) {
    const tags = String(sel).split(',').map(s => s.trim().toUpperCase());
    if (tags.some(t => !/^[A-Z]+$/.test(t))) {
      throw new Error(`o DOM de mentira só entende lista de tags, e veio: ${sel}`);
    }
    let achado = null;
    (function anda(x) {
      for (const c of x.childNodes) {
        if (achado) return;
        if (c.nodeType === 1 && tags.includes(c.tagName)) { achado = c; return; }
        anda(c);
      }
    })(this);
    return achado;
  }
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
  /* 23/09/2026 · a Nova procura o primeiro campo marcado como faltando por
     `document.querySelectorAll('input,select,textarea')`: a mesma lista de
     tags que o `querySelector` dos elementos entende, e só ela */
  querySelectorAll(sel) {
    const tags = String(sel).split(',').map(s => s.trim().toUpperCase());
    if (tags.some(t => !/^[A-Z]+$/.test(t))) {
      throw new Error(`o DOM de mentira só entende lista de tags, e veio: ${sel}`);
    }
    const achados = [];
    (function anda(x) {
      for (const c of x.childNodes) {
        if (c.nodeType === 1 && tags.includes(c.tagName)) achados.push(c);
        anda(c);
      }
    })(this.documentElement);
    return achados;
  }
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
/* ------------------------------------------------- a carga da ficha

   `dem_ver` devolve quatro coisas: a demanda CHEIA (o `Detalhe`, que é o
   `Resumo` mais dezoito campos), quem está olhando do ponto de vista DAQUELA
   demanda, os eventos e os anexos.

   `eu` vem do servidor e NÃO é o mesmo `eu` da casca: `atende` e `abriu` são
   respostas sobre esta demanda, calculadas por `pode_atender` e
   `aberta_por = m.id`. É por isso que os casos abaixo montam os dois lados —
   trocar um pelo outro é como a ficha passaria a oferecer botão de quem
   atende para quem só pediu. */
const detalhe = (extra = {}) => ({
  ...demanda(7),
  descricao: 'Criar a arte do culto de celebração, 1080x1080, com o tema do mês.',
  objetivo: null, local: null, publico: null, impacto: null, orcamento: null,
  sem_prazo_porque: null, travada_nota: null, aprovacao_nota: null,
  conclusao: null, concluida_em: null, atraso_motivo: null, cancelada_motivo: null,
  categoria_id: 'c1', setor_responsavel_id: 's1', responsavel_id: null,
  abriu_telefone: '5531900000001', resp_telefone: null,
  validada_em: null, validada_por: null,
  ...extra,
});

/* `atende`/`abriu` são do ponto de vista da demanda; `papel` é o da pessoa */
const QUEM = {
  atende:      { id: 'u9', papel: 'responsavel', atende: true,  abriu: false },
  pediu:       { id: 'u1', papel: 'solicitante', atende: false, abriu: true },
  soEnxerga:   { id: 'u2', papel: 'solicitante', atende: false, abriu: false },
  gestor:      { id: 'u3', papel: 'gestor',      atende: true,  abriu: false },
  gestorDeFora:{ id: 'u3', papel: 'gestor',      atende: false, abriu: false },
};

const vista = (d = {}, quem = QUEM.atende, eventos = [], anexos = []) =>
  ({ ok: true, demanda: detalhe(d), eu: quem, eventos, anexos });

const anexo = (extra = {}) => ({
  id: 'a1', nome: 'arte-final.png (drive.google.com)', url: 'https://drive.google.com/x',
  em: '2026-09-10T10:00:00Z', quem: 'Monik', depois_de_fechar: false, posso_tirar: false,
  ...extra,
});

/* A ficha é sempre montada com a rota apontando para ela: `useParams` é a
   única fonte do número, e um `undefined` ali faz `Number(undefined)` virar
   `NaN` e o efeito de carregar nunca rodar. */
async function abrirFicha(numero = 7) {
  globalThis.__params = { numero: String(numero) };
  globalThis.__caminho = `/demandas/d/${numero}`;
  globalThis.__idas = [];
  return montar(Ficha);
}

/* O PAINEL DE AÇÃO — 23/09/2026. A grade (`div.dm-grade`) e o "Mais opções"
   (`details.dm-mais`) viraram um painel: `aside.dm-painel`, com um primário
   e os secundários em `dm-painel-acoes` e os ajustes como botões-texto em
   `dm-painel-ajustes`. No celular a mesma decisão vira a barra fixa
   (`dm-barra-acao`) e a folha. Os botões continuam sendo o conjunto de
   `acoesDe` para efeito de regra; o que mudou é ONDE cada um mora, e isso é
   conferido à parte, no bloco 11. */
const grade = (alvo) =>
  todos(alvo, x => x.nodeType === 1 && x.tagName === 'ASIDE'
    && /(^| )dm-painel( |$)/.test(x.getAttribute('class') || ''))[0];
const porClasse = (no, classe) =>
  no ? todos(no, x => x.nodeType === 1 && (x.getAttribute('class') || '').split(' ').includes(classe))[0] : undefined;
const mais = (alvo) => porClasse(grade(alvo), 'dm-painel-ajustes');
const botoesPrincipais = (alvo) => {
  const g = porClasse(grade(alvo), 'dm-painel-acoes');
  return g ? porTag(g, 'BUTTON').map(texto) : [];
};
const botoesDeMais = (alvo) => {
  const m = mais(alvo);
  return m ? porTag(m, 'BUTTON').map(texto) : [];
};
const botoesDaGrade = (alvo) => [...botoesPrincipais(alvo), ...botoesDeMais(alvo)];

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
  /* ESTE ARQUIVO DERRUBOU O DEPLOY, E A CAUSA É UMA LINHA — 22/09/2026.

     `act` não existe no React de produção. O `react/index.js` escolhe qual
     build carregar OLHANDO `process.env.NODE_ENV` no momento do import:

       if (process.env.NODE_ENV === 'production') require('./cjs/react.production.min.js')
       else                                       require('./cjs/react.development.js')

     E a produção é onde este teste roda. `package.json` tem
     `"build": "npm test && next build"`, então a Vercel executa a suíte
     INTEIRA dentro do build — e o build da Vercel roda com
     `NODE_ENV=production`. Resultado medido no deploy do commit 7fbea0c:

       Error: act(...) is not supported in production builds of React.
       npm run build exited with 1   ·   35s (o build que passa leva 72s)

     O código do app estava certo. O push estava certo. Quem quebrou foi este
     arquivo de teste, escrito ontem, e o defeito não aparecia aqui porque o
     terminal deste container não tem `NODE_ENV=production`. Verde local não é
     verde da produção: é verde de UM ambiente.

     Para reproduzir o build da Vercel antes de empurrar:

       CI=1 NODE_ENV=production VERCEL=1 npm test     (com Node 24)

     O conserto é decidir a MODALIDADE aqui, em vez de herdá-la do ambiente.
     Funciona porque, até esta linha, NADA importou `react`: os imports deste
     arquivo são dinâmicos justamente por causa da ordem (ver a nota de
     `montarMundo`). E não enfraquece a medida: dev e produção renderizam
     igual, mudam só os avisos — e `act`, que só existe em dev, é a única
     forma de esperar o React terminar de montar. */
  process.env.NODE_ENV = 'development';

  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
  React = (await import('react')).default;
  act = (await import('react')).act;
  createRoot = (await import('react-dom/client')).createRoot;

  /* E se um dia alguém importar `react` antes desta função, o `act` volta a
     vir indefinido e cada `await act(...)` estoura com "act is not a
     function" — mensagem que não diz a causa. Então a checagem é aqui, com a
     causa escrita por extenso. */
  if (typeof act !== 'function') {
    console.error('O React carregado não tem `act`: veio o build de produção.');
    console.error('Alguma coisa importou `react` antes de ligarReact().');
    process.exit(1);
  }
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
/* o texto dos avisos da tela (`.dm-aviso`), separados por " | " */
const avisosDe = (no) => todos(no, x => x.nodeType === 1 && (x.getAttribute('class') || '').split(' ').includes('dm-aviso'))
  .map(texto).join(' | ');

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
  /* a parte da URL depois do `?`: desde 23/09/2026 a seção da administração
     vem dela (`/demandas/admin?secao=categorias`), pelos links da faixa
     preta, e não mais de um botão dentro da página */
  globalThis.__busca = '';
  globalThis.__caminho = undefined;
  const arm = armario();
  globalThis.localStorage = arm;
  globalThis.window.localStorage = arm;
  /* o recado que atravessa a troca de tela mora aqui (23/09/2026) */
  const sessao = armario();
  globalThis.sessionStorage = sessao;
  globalThis.window.sessionStorage = sessao;
  return arm;
}

/* O MUNDO NASCE ANTES DO react-dom SER IMPORTADO, E A ORDEM É O CONSERTO.

   `canUseDOM` e `isInputEventSupported` são constantes calculadas no topo do
   módulo do react-dom, na hora do import. Importando primeiro, ele nasce
   achando que não há DOM nenhum, e nada que este arquivo montar depois muda
   isso. */
montarMundo();
await ligarReact();

const Inicio = (await import('@/app/demandas/page.tsx')).default;
const Atendimento = (await import('@/app/demandas/atendimento/page.tsx')).default;
const Nova = (await import('@/app/demandas/nova/page.tsx')).default;
const Numeros = (await import('@/app/demandas/numeros/page.tsx')).default;
const Admin = (await import('@/app/demandas/admin/page.tsx')).default;
const FichaPessoa = (await import('@/app/demandas/admin/pessoas/[id]/page.tsx')).default;
const Perfil = (await import('@/app/demandas/perfil/page.tsx')).default;
const Avisos = (await import('@/app/demandas/avisos/page.tsx')).default;
const CadastroPagina = (await import('@/app/demandas/cadastro/page.tsx')).default;
const Ficha = (await import('@/app/demandas/d/[numero]/page.tsx')).default;

/* A LISTA, SOZINHA, COM OS QUATRO RECORTES DE SEMPRE · migração 94.

   Até a 93 `/demandas` ERA a lista, e os blocos 2, 3, 4 e 10 abaixo mediam o
   comportamento dela montando a página. Na 94 a lista virou uma peça
   (`components/demandas/Lista.tsx`) que os dois portais montam, cada um com
   os seus recortes. O que aqueles blocos medem (resposta atrasada, espera da
   busca, lista que não pisca, vocabulário da pílula, aviso de corte) é da
   PEÇA, e é a peça que eles passam a montar, pela mesma casca, com os
   quatro recortes que ela sempre teve.

   O que é de cada PÁGINA (quais recortes ela oferece, qual aba abre por
   padrão, que o Início nunca pede "tudo") tem bloco próprio, o 1 e o 17. */
const { default: Casca, useEu } = await import('@/components/demandas/Casca.tsx');
const { default: Lista } = await import('@/components/demandas/Lista.tsx');
function ListaDeTeste() {
  const { eu } = useEu();
  if (!eu) return null;
  return React.createElement(Lista, {
    eu,
    abas: [{ v: 'minhas', rot: 'Eu pedi' }, { v: 'setor', rot: 'Meu setor' }, { v: 'tudo', rot: 'Tudo' }],
    abaInicial: 'tudo',
    recortes: [{ v: 'abertas', rot: 'Em aberto' }, { v: 'atrasadas', rot: 'Atrasadas' },
               { v: 'concluidas', rot: 'Concluídas' }, { v: 'tudo', rot: 'Todas' }],
    vazio: (_a, so) => ({ titulo: so === 'concluidas' ? 'Nada concluído.' : 'Nada em aberto.' }),
  });
}
const Painel = () => React.createElement(Casca, null, React.createElement(ListaDeTeste));

/* o que a primeira tela devolve quando não há nada: as contas zeradas */
const N_ZERO = {
  responder: 0, minhas_andamento: 0, minhas_concluidas: 0, minhas_todas: 0, participo: 0, ministerio: 0,
  agir: 0, aprovar: 0, fila: 0, comigo: 0, atrasadas: 0, urgentes: 0, setor_abertas: 0, concluidas: 0,
  avisos: 0, pedidos: 0,
};
const portalDe = (eu, n = {}, precisa = []) => ({ ok: true, eu, n: { ...N_ZERO, ...n }, precisa });
const EU_MEMBRO = {
  ok: true, id: 'm1', nome: 'Lara Souza', primeiro_nome: 'Lara', papel: 'solicitante',
  setor_id: 's9', setor: 'Louvor', setor_atende: false, tem_login: true,
  atende: false, permissoes: ['pedir', 'acompanhar'], avisos: 0,
};
const EU_EQUIPE = {
  ...EU_MEMBRO, id: 'r1', nome: 'Monik Ribeiro', primeiro_nome: 'Monik', papel: 'responsavel',
  setor_id: 's1', setor: 'Comunicação', setor_atende: true, atende: true,
  permissoes: ['pedir', 'acompanhar', 'atender_setor', 'ver_numeros'],
};

/* ===========================================================================
   1 · O QUARTO RECORTE, E O QUE ELE MANDA PARA O BANCO
   =========================================================================== */
console.log('\n1. Os dois portais têm o recorte de concluídas, e ele vira `status: concluida`');
/* O ESCOPO DA PRIMEIRA VERSÃO PEDE "painel com demandas abertas, atrasadas e
   concluídas", e isso continua valendo para os DOIS portais da 94: o Início
   de quem pede tem "Em aberto / Concluídas / Histórico", e o Atendimento
   tem os seis atalhos do pedido do Arthur, entre eles Atrasadas e
   Concluídas. Aqui se mede o que cada toque manda para o banco. */
{
  mundoNovo();
  const b = banco({
    dem_quem_sou: EU_MEMBRO,
    dem_portal: portalDe(EU_MEMBRO),
    dem_lista: { ok: true, itens: [demanda(1)], total: 1, tem_mais: false },
  });
  globalThis.__banco = b;
  const { alvo, desmontar } = await montar(Inicio);

  const tira = porAria(alvo, 'aria-label', 'Em que estado');
  const rotulos = porTag(tira, 'BUTTON').map(texto);
  ok(rotulos.join('|') === 'Em aberto|Concluídas|Histórico',
    'o Início tem os três estados de quem pede', rotulos.join(' | '));

  const primeira = b.ultima('dem_lista');
  ok(primeira.args.p_f.abertas === true && primeira.args.p_f.status === undefined,
    'a carga inicial pede só as que estão andando', JSON.stringify(primeira.args.p_f));
  ok(primeira.args.p_f.aba === 'minhas',
    'e pede as MINHAS, nunca "tudo": o Início não abre na base inteira', JSON.stringify(primeira.args.p_f));
  ok(!b.chamadas.some(c => c.nome === 'dem_lista' && c.args.p_f.aba === 'tudo'),
    'nenhuma chamada da lista do Início pediu a aba "tudo"');

  await clicar(botao(tira, 'Concluídas'));
  const f = b.ultima('dem_lista').args.p_f;
  ok(f.status === 'concluida', 'tocar em Concluídas manda status: "concluida"', JSON.stringify(f));
  ok(f.abertas === undefined && f.atrasadas === undefined,
    'e não manda abertas nem atrasadas junto', JSON.stringify(f));
  ok(botao(tira, 'Concluídas').getAttribute('aria-pressed') === 'true',
    'o botão fica marcado como o recorte ativo');

  await clicar(botao(tira, 'Histórico'));
  const g = b.ultima('dem_lista').args.p_f;
  ok(g.status === undefined && g.abertas === undefined && g.atrasadas === undefined && g.aba === 'minhas',
    'Histórico tira o filtro de estado e continua nas minhas', JSON.stringify(g));
  await desmontar();
}
{
  /* o vazio do recorte de concluídas não pode falar a frase de outro recorte */
  mundoNovo();
  globalThis.__banco = banco({
    dem_quem_sou: EU_MEMBRO,
    dem_portal: portalDe(EU_MEMBRO),
    dem_lista: { ok: true, itens: [], total: 0, tem_mais: false },
  });
  const { alvo, desmontar } = await montar(Inicio);
  await clicar(botao(porAria(alvo, 'aria-label', 'Em que estado'), 'Concluídas'));
  ok(/concluído/i.test(texto(alvo)) && !/em andamento\./i.test(texto(alvo)),
    'a lista vazia em Concluídas fala de concluídas, não de andamento',
    texto(alvo).slice(0, 260));
  await desmontar();
}
{
  /* e o Atendimento: os seis atalhos, e o que cada um pede */
  mundoNovo();
  const b = banco({
    dem_quem_sou: EU_EQUIPE,
    dem_portal: portalDe(EU_EQUIPE, { agir: 3, comigo: 2, setor_abertas: 9, atrasadas: 1, urgentes: 4, concluidas: 12 }),
    dem_lista: { ok: true, itens: [demanda(1)], total: 1, tem_mais: false },
  });
  globalThis.__banco = b;
  const { alvo, desmontar } = await montar(Atendimento);
  const atalhos = porTag(porAria(alvo, 'aria-label', 'O que ver'), 'BUTTON');
  ok(atalhos.map(x => texto(x)).join('|') === 'Esperando você3|Com você2|Em aberto9|Atrasadas1|Urgentes4|Concluídas12',
    'os seis atalhos do pedido, cada um com a sua conta', atalhos.map(texto).join(' | '));
  ok(b.ultima('dem_lista').args.p_f.aba === 'agir',
    'o Atendimento abre em "esperando você"', JSON.stringify(b.ultima('dem_lista').args.p_f));
  await clicar(atalhos[3]);
  const f = b.ultima('dem_lista').args.p_f;
  ok(f.aba === 'setor' && f.atrasadas === true, 'Atrasadas pede a fila do setor, só as atrasadas', JSON.stringify(f));
  await clicar(atalhos[4]);
  const u = b.ultima('dem_lista').args.p_f;
  ok(u.aba === 'setor' && u.urgentes === true, 'Urgentes pede a fila do setor, só as urgentes', JSON.stringify(u));
  await clicar(atalhos[5]);
  const c = b.ultima('dem_lista').args.p_f;
  ok(c.aba === 'setor' && c.status === 'concluida', 'Concluídas pede a fila do setor, status concluída', JSON.stringify(c));
  ok(!porAria(alvo, 'aria-label', 'Em que estado'),
    'e a lista não desenha tira própria: os atalhos são o único seletor');
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
console.log('\n6. A administração cria categoria, no grupo que já está aberto');
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
  globalThis.__busca = 'secao=categorias';
  globalThis.__caminho = '/demandas/admin';
  const { alvo, desmontar } = await montar(Admin);
  const faixa = porAria(alvo, 'aria-label', 'Seções da administração');
  ok(!!faixa && porTag(faixa, 'A').find(x => texto(x) === 'Categorias')?.getAttribute('aria-current') === 'page',
    'a faixa preta marca Categorias como a seção aberta');

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
  /* 23/09/2026 · UMA FALTA SÓ se escreve "Falta: a categoria." (era "Falta :
     a categoria.", com o espaço), e o campo que falta fica marcado, com a
     frase embaixo; o preenchido, não */
  mundoNovo();
  globalThis.__banco = banco({ dem_quem_sou: EU_GESTOR, dem_bases: BASES_NOVA });
  const { alvo, desmontar } = await montar(Nova);
  await teclar(campo(alvo, 'Título'), 'Arte para o culto de celebração');
  await teclar(campo(alvo, 'O que precisa ser feito'), 'Uma arte quadrada para o feed e um story.');
  await teclar(campo(alvo, 'Para quando'), '2026-10-01');
  await assentar();
  await clicar(botao(alvo, 'Enviar a demanda'));
  const avisos = avisosDe(alvo);
  ok(!/Falta/.test(avisos), 'com uma falta só, sem resumo: o campo marcado diz tudo', avisos);
  ok(campo(alvo, 'Categoria').getAttribute('aria-invalid') === 'true', 'e a categoria fica marcada');
  ok(campo(alvo, 'Título').getAttribute('aria-invalid') !== 'true', 'e o título, preenchido, não');
  ok(/Falta a categoria\./.test(texto(alvo)), 'com a frase embaixo do campo', texto(alvo).slice(0, 400));
  ok(document.activeElement === campo(alvo, 'Categoria'), 'e o foco vai para o campo que falta',
    String(document.activeElement && document.activeElement.tagName));
  await desmontar();
}
{
  /* e com duas ou mais, o resumo aparece, com os dois-pontos colados */
  mundoNovo();
  globalThis.__banco = banco({ dem_quem_sou: EU_GESTOR, dem_bases: BASES_NOVA });
  const { alvo, desmontar } = await montar(Nova);
  await clicar(botao(alvo, 'Enviar a demanda'));
  const avisos = avisosDe(alvo);
  ok(/^Falta preencher: um título/.test(avisos.trim()) && !/ :/.test(avisos), 'várias faltas: "Falta preencher: …"', avisos);
  ok(document.activeElement === campo(alvo, 'Título'), 'e o foco vai para o primeiro campo que falta',
    String(document.activeElement && document.activeElement.tagName));
  await desmontar();
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
    dem_quem_sou: EU_MEMBRO,
    dem_portal: portalDe(EU_MEMBRO),
    dem_lista: { ok: true, itens: [demanda(1)], total: 1, tem_mais: false },
  });
  let caiu = '';
  try {
    /* 94 · a primeira tela é o Início, e é ela que tem que montar */
    const t = await montar(Inicio);
    ok(/Olá, Lara/.test(texto(t.alvo)),
      'o Início monta com o armário explodindo (o token guardado é lido dali)', texto(t.alvo).slice(0, 200));
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
  /* 23/09/2026 · o gesto virou o botão "Comparar meses" (que abre 1 ano) */
  ok(/comparar meses/i.test(t), 'apontando o gesto que faz a comparação aparecer');
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

/* ===========================================================================
   10 · A LISTA CORTADA DIZ QUE FOI CORTADA
   =========================================================================== */

/* A migração 57 pôs teto de 300 em `dem_lista` porque a aba "Tudo" com 20 mil
   demandas descia 10 MB de JSON. O comentário dela diz, com todas as letras:
   "com teto e SEM aviso, a lista passaria a mentir em silêncio".

   O aviso é uma linha só — `setSobraram(r.tem_mais ? Math.max(total - itens, 0)
   : 0)` — e até 22/09/2026 NENHUM dublê deste repositório devolvia
   `tem_mais: true`. Trocar a linha inteira por `setSobraram(0)` ficava verde:
   a pessoa olharia 300 de 1204 achando que são todas. */
console.log('\n10. A lista cortada diz quantas ficaram de fora');
{
  mundoNovo();
  const muitas = Array.from({ length: 300 }, (_, i) => demanda(i + 1));
  globalThis.__banco = banco({
    dem_quem_sou: EU_GESTOR,
    dem_lista: { ok: true, itens: muitas, total: 1204, tem_mais: true, limite: 300 },
  });
  const { alvo, desmontar } = await montar(Painel);
  const t = texto(alvo);
  ok(/Mostrando as 300 mais urgentes/.test(t),
    'a lista diz quantas está mostrando', t.slice(-320));
  ok(/Outras 904 não couberam/.test(t),
    'e quantas ficaram de fora: 1204 menos as 300 que vieram', t.slice(-320));
  const aviso = todos(alvo, x => x.nodeType === 1 && (x.getAttribute('class') || '') === 'dm-corte')[0];
  ok(existe(aviso, 'o aviso de lista cortada') && aviso.getAttribute('role') === 'status',
    'e ele é anunciado como estado, para quem usa leitor de tela',
    aviso ? String(aviso.getAttribute('role')) : '(ausente)');
  ok(/filtros|número/i.test(t), 'e diz o que fazer para achar o que falta', t.slice(-200));
  await desmontar();
}
{
  /* o outro lado: sem corte não pode haver aviso, senão a frase vira ruído
     fixo e ninguém mais a lê quando ela importa */
  mundoNovo();
  globalThis.__banco = banco({
    dem_quem_sou: EU_GESTOR,
    dem_lista: { ok: true, itens: [demanda(1), demanda(2)], total: 2, tem_mais: false, limite: 300 },
  });
  const { alvo, desmontar } = await montar(Painel);
  ok(!/não couberam/.test(texto(alvo)),
    'lista inteira não inventa aviso de corte', texto(alvo).slice(-200));
  await desmontar();
}
{
  /* e o número não é o do teto: com `total` menor que os itens (carga velha,
     contagem defasada) o aviso não pode dizer "Outras -3 não couberam" */
  mundoNovo();
  globalThis.__banco = banco({
    dem_quem_sou: EU_GESTOR,
    dem_lista: { ok: true, itens: [demanda(1), demanda(2)], total: 1, tem_mais: true, limite: 300 },
  });
  const { alvo, desmontar } = await montar(Painel);
  ok(!/-\d/.test(texto(alvo)), 'e nunca aparece um número negativo de sobra', texto(alvo).slice(-200));
  await desmontar();
}

/* ===========================================================================
   11 · A FICHA DE UMA DEMANDA

   As 873 linhas que nenhum teste da suíte executava. Ver o cabeçalho.
   =========================================================================== */

/* A GRADE É CONFERIDA CONTRA `acoesDe`, E NÃO CONTRA UMA LISTA ESCRITA AQUI.

   `acoesDe` é o espelho de `dem_mover`, e `scripts/demandas.test.mjs` já
   confere esse espelho célula por célula contra o SQL. Cobrando que a grade
   renderize EXATAMENTE `acoesDe` menos as que moram fora dela, a corrente
   fecha: SQL -> acoesDe -> botão na tela. Uma lista de rótulos escrita à mão
   aqui só concordaria comigo mesmo.

   O que sobra para este arquivo é o que só a tela sabe: qual rótulo cada ação
   ganha, e que a lista de fora da grade é `['comentar','validar']` — as duas
   têm lugar próprio (a caixa fixa do fim e o cartão verde). */
const { acoesDe, primariaDe, quemManda } = await import('@/lib/demandas/regras.ts');

const ROTULO = {
  aprovar: 'Aprovar', rejeitar: 'Recusar', assumir: 'Assumir e começar',
  concluir: 'Concluir', travar: 'Travar', destravar: 'Destravar',
  reabrir: 'Reabrir', validar: 'Resolveu, obrigado',
  prazo: 'Mudar o prazo', prioridade: 'Rever a prioridade',
  redirecionar: 'Mandar para outro setor', anexar: 'Juntar um anexo',
  cancelar: 'Cancelar',
};
/* só `comentar` mora fora do painel (a caixa no fim do histórico); `validar`
   entrou nele em 23/09/2026 como o primário de quem pediu na concluída */
const FORA_DA_GRADE = ['comentar'];

/* o que o painel DEVIA ter, calculado pelo espelho. `destravar` muda de rótulo
   quando quem abriu vai responder, e a ficha escreve isso de propósito. */
const rotDe = (a, d, quem) => (a === 'destravar' && quem.abriu && d.travada_por === 'informacao'
  ? 'Responder e destravar' : ROTULO[a]);
/* O QUE CONTRADIZ A FICHA NÃO VIRA BOTÃO (23/09/2026, auditoria do Fable):
   "Assumir e começar" quando a demanda já está com a pessoa, e "Travar" numa
   demanda já travada. O servidor aceita os dois (troca de dono; re-travar
   para trocar o motivo), então `acoesDe` os lista; a ficha os filtra, e o
   espelho aqui aplica a mesma regra, escrita por extenso. */
const contradiz = (a, d, quem) =>
  (a === 'assumir' && !!d.responsavel_id && d.responsavel_id === quem.id)
  || (a === 'travar' && d.status === 'travada');
const noPainel = (d, quem) => acoesDe(d, quem).filter(a => !FORA_DA_GRADE.includes(a) && !contradiz(a, d, quem));
function gradeEsperada(d, quem) {
  return noPainel(d, quem).map(a => rotDe(a, d, quem));
}
/* O PASSO É DE OUTRA PESSOA (23/09/2026): com a demanda na mão de outra
   pessoa ("Com Monik, em 3 dias"), o que quem administra vê são poderes, e
   não o passo dele. O painel se chama "Ações" e nenhum botão é preto; o
   primário continua o mesmo, e continua o último da barra, só sem o preto.
   Também quando quem atende olha a demanda travada esperando quem pediu: o
   passo é de quem pediu. Confirmar, decidir a aprovação e responder a
   trava continuam sendo o passo de quem olha. */
const passoDeOutro = (d, quem, prim) => {
  const pediu = !!(quem.pede ?? quem.abriu);
  const espera = d.status === 'travada' && d.travada_por === 'informacao';
  return prim !== 'validar'
    && !(d.falta_aprovacao && (quem.aprova ?? quemManda(quem.papel)))
    && !(espera && pediu)
    && ((espera && !pediu) || (!!d.responsavel_id && d.responsavel_id !== quem.id));
};

/* A DIVISÃO É DECISÃO DE TELA, E NÃO TEM FONTE ACIMA DELA.

   O conjunto vem do SQL; qual botão fica na grade e qual vai para "Mais
   opções" não vem de lugar nenhum além da ficha. Então aqui ele é escrito, e
   a sabotagem é o que prova que ele cobra: mover `travar` para as
   secundárias na ficha tem que reprovar este bloco. */
const SECUNDARIAS = ['prazo', 'prioridade', 'redirecionar', 'anexar', 'cancelar'];
function divisaoEsperada(d, quem) {
  const todas = noPainel(d, quem);
  const rot = a => rotDe(a, d, quem);
  const princ = todas.filter(a => !SECUNDARIAS.includes(a));
  const outras = todas.filter(a => SECUNDARIAS.includes(a));
  /* no painel os ajustes SEMPRE ficam na linha de botões-texto, mesmo quando
     não há ação que ande (esperando aprovação, vista por quem atende) */
  return { grade: princ.map(rot), mais: outras.length ? outras.map(rot) : null };
}

async function comFicha(carga, extra = {}) {
  mundoNovo();
  const b = banco({
    dem_quem_sou: EU_GESTOR,
    dem_bases: { ok: true, setores: [], categorias: [] },
    dem_ver: carga,
    dem_mover: { ok: true },
    ...extra,
  });
  globalThis.__banco = b;
  const { alvo, desmontar } = await abrirFicha(carga.demanda ? carga.demanda.numero : 7);
  return { b, alvo, desmontar };
}

console.log('\n11. A ficha: a grade de ações sai de `acoesDe`, papel por papel e estado por estado');
{
  /* dez combinações de estado × quem está olhando. Cada uma monta a ficha de
     verdade e compara o conjunto de botões com o do espelho. */
  const CASOS = [
    ['aberta · quem atende',        {}, QUEM.atende],
    ['aberta · quem pediu',         {}, QUEM.pediu],
    ['aberta · quem só enxerga',    {}, QUEM.soEnxerga],
    ['execução · quem atende',      { status: 'execucao', responsavel: 'Monik', responsavel_id: 'u9' }, QUEM.atende],
    ['execução · a gestão olhando a demanda de outra pessoa',
      { status: 'execucao', responsavel: 'Monik', responsavel_id: 'u9' }, QUEM.gestor],
    ['travada por informação · quem pediu',
      { status: 'travada', travada_por: 'informacao', travada_nota: 'Qual sala?' }, QUEM.pediu],
    ['travada por informação · quem atende',
      { status: 'travada', travada_por: 'informacao', travada_nota: 'Qual sala?' }, QUEM.atende],
    ['esperando aprovação · gestor',
      { aprovacao: 'pendente', falta_aprovacao: true, status: 'travada', travada_por: 'aprovacao' }, QUEM.gestor],
    ['esperando aprovação · quem atende',
      { aprovacao: 'pendente', falta_aprovacao: true, status: 'travada', travada_por: 'aprovacao' }, QUEM.atende],
    ['concluída · quem pediu',
      { status: 'concluida', conclusao: 'Arte entregue.', concluida_em: '2026-09-12T18:00:00Z' }, QUEM.pediu],
    ['cancelada · quem atende',
      { status: 'cancelada', cancelada_motivo: 'O evento saiu do calendário.' }, QUEM.atende],
  ];
  /* comparados como CONJUNTO: a ordem da grade é decisão de layout (o que se
     usa mais fica em cima), e cobrar a ordem aqui faria este teste reprovar
     no dia em que alguém reordenar dois botões sem mudar regra nenhuma. O que
     não pode variar é QUAIS. */
  const conjunto = (xs) => [...xs].sort().join(' | ');
  for (const [nome, d, quem] of CASOS) {
    const carga = vista(d, quem);
    const { alvo, desmontar } = await comFicha(carga);
    const veio = botoesDaGrade(alvo);
    const devia = gradeEsperada(carga.demanda, quem);
    ok(conjunto(veio) === conjunto(devia),
      `${nome}: a grade é exatamente o que \`acoesDe\` permite`,
      `na tela: [${veio.join(' | ')}]\n           no espelho: [${devia.join(' | ')}]`);

    const div = divisaoEsperada(carga.demanda, quem);
    const na = botoesPrincipais(alvo), em = botoesDeMais(alvo);
    ok(conjunto(na) === conjunto(div.grade)
       && (div.mais ? !!mais(alvo) && conjunto(em) === conjunto(div.mais) : !mais(alvo)),
      `${nome}: o que anda fica na grade, o que ajusta vai para "Mais opções"`,
      `grade: [${na.join(' | ')}]  mais: ${mais(alvo) ? '[' + em.join(' | ') + ']' : '(não existe)'}\n` +
      `           devia: [${div.grade.join(' | ')}]  mais: ${div.mais ? '[' + div.mais.join(' | ') + ']' : '(não existe)'}`);

    /* UM PRIMÁRIO POR VISTA (a regra do Fable, 23/09/2026): no painel há no
       máximo um botão preto, e ele é o que `primariaDe` escolheu; a barra do
       celular repete esse mesmo botão como o seu último, à direita. Sem
       ação nenhuma, não há barra: a página não carrega um rodapé vazio. */
    const pretos = porTag(porClasse(grade(alvo), 'dm-painel-acoes') || grade(alvo), 'BUTTON')
      .filter(x => /(^| )dm-pri( |$)/.test(x.getAttribute('class') || ''));
    const prim = primariaDe(carga.demanda, noPainel(carga.demanda, quem));
    const doOutro = !!prim && passoDeOutro(carga.demanda, quem, prim);
    const preto = prim && !doOutro;
    ok(pretos.length === (preto ? 1 : 0) && (!preto || texto(pretos[0]) === rotDe(prim, carga.demanda, quem)),
      `${nome}: ${preto ? 'um primário só, e é "' + rotDe(prim, carga.demanda, quem) + '"'
        : doOutro ? 'o passo é de outra pessoa, e nenhum botão é preto' : 'nenhum primário'}`,
      `pretos: [${pretos.map(texto).join(' | ')}]`);
    const titulo = porClasse(grade(alvo), 'dm-painel-titulo');
    const tituloDevia = !div.grade.length ? 'Esta demanda'
      : passoDeOutro(carga.demanda, quem, prim) ? 'Ações' : 'Próximo passo';
    ok(titulo && texto(titulo) === tituloDevia, `${nome}: o painel se chama "${tituloDevia}"`,
      titulo ? texto(titulo) : '(sem título)');
    const barra = porAria(alvo, 'aria-label', 'Ações');
    const barraCel = todos(alvo, x => x.nodeType === 1 && (x.getAttribute('class') || '') === 'dm-barra-acao')[0];
    /* a barra fixa só existe quando há ação que ANDA com a demanda (o
       primário ou um secundário); só ajustes moram num cartão em linha */
    const temBarra = div.grade.length > 0;
    ok(!!barraCel === temBarra, `${nome}: no celular, ${temBarra ? 'a barra fixa existe' : 'não há barra'}`,
      String(!!barraCel));
    if (!temBarra && div.mais) {
      const cartao = porAria(alvo, 'aria-label', 'Esta demanda');
      ok(!!cartao && porTag(cartao, 'BUTTON').length >= div.mais.length,
        `${nome}: e os ajustes moram no cartão em linha do celular`,
        cartao ? porTag(cartao, 'BUTTON').map(texto).join(' | ') : '(sem cartão)');
    }
    if (barraCel && prim) {
      const ultimo = porTag(barraCel, 'BUTTON').slice(-1)[0];
      ok(ultimo && texto(ultimo) === rotDe(prim, carga.demanda, quem)
         && /(^| )dm-pri( |$)/.test(ultimo.getAttribute('class') || '') === !doOutro,
        `${nome}: e o primário é o último botão da barra, à direita${doOutro ? ', sem o preto' : ''}`,
        barraCel ? porTag(barraCel, 'BUTTON').map(texto).join(' | ') : '(sem barra)');
    }
    ok(!!barra, `${nome}: o painel tem nome para o leitor de tela`);
    await desmontar();
  }
}
{
  /* e o botão faz o que promete: tocar em "Assumir e começar" manda `assumir`
     para o servidor, e não abre formulário nenhum. */
  const { b, alvo, desmontar } = await comFicha(vista({}, QUEM.atende));
  await clicar(botao(grade(alvo), 'Assumir e começar'), 'o botão Assumir');
  const c = b.ultima('dem_mover');
  ok(c && c.args.p_acao === 'assumir', 'tocar em Assumir manda a ação `assumir`',
    JSON.stringify(c && c.args));
  ok(c && c.args.p_numero === 7, 'e sobre o número que veio da rota',
    JSON.stringify(c && c.args));
  ok(b.quantas('dem_ver') >= 2, 'e a ficha recarrega depois de gravar',
    String(b.quantas('dem_ver')));
  await desmontar();
}
{
  /* e "Concluir" NÃO grava na hora: ele abre a caixa de "O que foi feito",
     porque concluir sem dizer o que foi feito é o que o banco recusa */
  const { b, alvo, desmontar } = await comFicha(vista({}, QUEM.atende));
  await clicar(botao(grade(alvo), 'Concluir'), 'o botão Concluir');
  ok(!b.ultima('dem_mover'), 'tocar em Concluir não grava nada sozinho');
  ok(/O que foi feito/.test(texto(alvo)), 'ele abre a caixa que pede o texto',
    texto(alvo).slice(0, 200));
  /* E A TELA TEM QUE SE MEXER. O formulário abre no fim de um cartão IRMÃO:
     medido no navegador, "Concluir" abria 0px de 327px visíveis, a rolagem
     ficava em 887 e o foco no BODY. A pessoa tocava, nada mudava, tocava de
     novo e concluía que o botão estava morto. */
  ok(document._rolouAte, 'a página rola até o formulário que abriu');
  ok(document.activeElement && document.activeElement.tagName === 'TEXTAREA',
    'e o foco cai no primeiro campo dele, sem a pessoa procurar',
    String(document.activeElement && document.activeElement.tagName));
  await desmontar();
}

{
  /* MANDAR PARA OUTRO SETOR — 23/09/2026. O formulário abria no setor de
     hoje, com "Mandar" ativo, e um toque sem mudar nada tirava o dono da
     demanda; e o acerto (quem mandou deixa de ver a demanda) aparecia como a
     tela vermelha de "não existe". Agora: sem escolha, sem o setor de hoje,
     "Mandar" só com escolha, e depois do ok um recado e a volta para a fila. */
  const SETORES = [
    { id: 's1', nome: 'Comunicação', slug: 'com', atende: true },
    { id: 's2', nome: 'Compras e suprimentos', slug: 'compras', atende: true },
    { id: 's3', nome: 'Louvor', slug: 'louvor', atende: false },
  ];
  const carga = vista({ status: 'execucao', responsavel: 'Monik', responsavel_id: 'u9' }, QUEM.gestor);
  const { alvo, desmontar } = await comFicha(carga, { dem_bases: { ok: true, setores: SETORES, categorias: [] } });
  await clicar(botao(grade(alvo), 'Mandar para outro setor'), 'o ajuste de mandar');
  const sel = porTag(grade(alvo), 'SELECT')[0];
  const opcoes = sel ? porTag(sel, 'OPTION').map(o => o.getAttribute('value') || '') : [];
  const escolhida = sel ? porTag(sel, 'OPTION').find(o => o.selected) : null;
  ok(escolhida && (escolhida.getAttribute('value') || '') === '' && opcoes[0] === '',
    'o formulário abre sem setor escolhido',
    `escolhida=${escolhida ? escolhida.getAttribute('value') : '(nenhuma)'} opções=${opcoes.join(',')}`);
  ok(!opcoes.includes('s1') && opcoes.includes('s2') && !opcoes.includes('s3'),
    'e oferece só os OUTROS setores que atendem', opcoes.join(','));
  const mandar = botao(grade(alvo), 'Mandar');
  ok(mandar && mandar.hasAttribute('disabled'), '"Mandar" começa desligado');
  await escolher(sel, 's2');
  ok(!botao(grade(alvo), 'Mandar').hasAttribute('disabled'), 'e liga com a escolha');
  globalThis.__idas = [];
  const b2 = banco({ dem_quem_sou: EU_GESTOR, dem_bases: { ok: true, setores: SETORES, categorias: [] },
                     dem_mover: { ok: true }, dem_ver: { ok: false, erro: 'NAO_EXISTE' } });
  globalThis.__banco = b2;
  await clicar(botao(grade(alvo), 'Mandar'), 'mandar');
  const c = b2.ultima('dem_mover');
  ok(c && c.args.p_acao === 'redirecionar' && c.args.p_d.setor === 's2', 'manda para o setor escolhido',
    JSON.stringify(c && c.args));
  ok((globalThis.__idas || []).includes('/demandas/atendimento'),
    'e quem deixou de ver a demanda volta para a fila, e não para a tela de erro', JSON.stringify(globalThis.__idas));
  ok(!/Essa demanda não existe/.test(texto(alvo)), 'sem a tela vermelha', texto(alvo).slice(0, 200));
  const guardado = globalThis.sessionStorage.getItem('demandas.recado');
  ok(guardado && JSON.parse(guardado).texto === 'Demanda #7 foi para Compras e suprimentos.',
    'e o recado vai guardado para a tela de destino', String(guardado));
  await desmontar();
  /* a tela de destino (outra casca) mostra o recado, uma vez */
  globalThis.__banco = banco({ dem_quem_sou: EU_GESTOR, dem_portal: portalDe(EU_GESTOR),
                               dem_lista: { ok: true, itens: [], total: 0, tem_mais: false } });
  const fila = await montar(Atendimento);
  ok(/Demanda #7 foi para Compras e suprimentos/.test(texto(fila.alvo)),
    'e a fila mostra o recado ao abrir', texto(fila.alvo).slice(0, 300));
  ok(globalThis.sessionStorage.getItem('demandas.recado') === null, 'e o recado é lido uma vez só');
  await fila.desmontar();
}

console.log('\n12. A ficha: "tirar" o anexo é decidido por anexo, e não pela pessoa');
{
  /* O DEFEITO DA MIGRAÇÃO 89, INTEIRO.

     Era `v.eu.atende || v.eu.abriu` em TODO anexo. O servidor aceita
     `pode_atender(m,d) OR o anexo é meu`: quem abriu e não atende só tira o
     que ELE colou. A solicitante tocava em "tirar" no boleto que Compras
     pregou e lia "Esse anexo não está mais aqui, ou não é seu para tirar."

     Hoje quem responde é `posso_tirar`, por anexo, calculado pelo servidor
     com a MESMA expressão do `desanexar`. Aqui a carga traz os dois tipos na
     mesma lista: se a tela voltar a decidir sozinha, os dois ficam iguais. */
  const meu = anexo({ id: 'a-meu', nome: 'recibo-meu.pdf (drive.google.com)',
                      quem: 'Ana', posso_tirar: true });
  const doOutro = anexo({ id: 'a-outro', nome: 'boleto-atualizado.pdf (drive.google.com)',
                          quem: 'Jander', posso_tirar: false });
  const { b, alvo, desmontar } = await comFicha(vista({}, QUEM.pediu, [], [meu, doOutro]));

  const linhas = porTag(alvo, 'LI').filter(li => /drive\.google\.com/.test(texto(li)));
  ok(linhas.length === 2, 'os dois anexos aparecem na ficha', String(linhas.length));
  const daPessoa = linhas.find(li => /recibo-meu/.test(texto(li)));
  const doColega = linhas.find(li => /boleto-atualizado/.test(texto(li)));
  ok(existe(daPessoa, 'a linha do anexo que a pessoa colou'), 'achei o anexo dela');
  ok(existe(doColega, 'a linha do anexo do colega'), 'achei o anexo do colega');

  /* 23/09/2026 · o botão passou a "Tirar", com maiúscula, como todo botão
     do sistema; o que se mede é o botão por anexo, e não a caixa da letra */
  const tirarDela = daPessoa && porTag(daPessoa, 'BUTTON').find(x => /^tirar$/i.test(texto(x)));
  const tirarDele = doColega && porTag(doColega, 'BUTTON').find(x => /^tirar$/i.test(texto(x)));
  ok(!!tirarDela, 'o anexo com `posso_tirar` tem o botão de tirar');
  ok(!tirarDele,
    'e o que NÃO é dela não tem: quem decide é o servidor, anexo por anexo',
    doColega ? texto(doColega) : '(linha ausente)');

  /* e o botão manda o id DAQUELE anexo, não o primeiro da lista */
  await clicar(tirarDela, 'o botão tirar do anexo dela');
  const c = b.ultima('dem_mover');
  ok(c && c.args.p_acao === 'desanexar' && c.args.p_d && c.args.p_d.anexo_id === 'a-meu',
    'tirar manda `desanexar` com o id do anexo tocado', JSON.stringify(c && c.args));
  await desmontar();
}
{
  /* e a ficha conta as outras duas respostas que o anexo precisa dar */
  const { alvo, desmontar } = await comFicha(vista(
    { status: 'concluida', conclusao: 'x', concluida_em: '2026-03-02T10:00:00Z' },
    QUEM.atende, [],
    [anexo({ quem: 'Jander', depois_de_fechar: true, posso_tirar: true })]));
  const t = texto(alvo);
  ok(/Jander/.test(t), 'a ficha diz QUEM colou o anexo', t.slice(0, 400));
  ok(/juntado depois de concluída/.test(t),
    'e avisa quando ele chegou depois de a demanda fechar', t.slice(0, 400));
  await desmontar();
}
{
  /* sem anexo nenhum, o cartão inteiro não existe — e não um cartão vazio
     com título */
  const { alvo, desmontar } = await comFicha(vista({}, QUEM.atende, [], []));
  ok(!/Anexos/.test(texto(alvo)), 'sem anexo, o cartão de anexos não aparece');
  await desmontar();
}

console.log('\n13. A ficha: o cartão verde de concluída e a etapa 5 do PDF');
{
  const concluida = { status: 'concluida', conclusao: 'Arte publicada no feed e no stories.',
                      concluida_em: '2026-09-12T18:00:00Z' };
  const { b, alvo, desmontar } = await comFicha(vista(concluida, QUEM.pediu));
  const t = texto(alvo);
  ok(/Concluída/.test(t) && /Arte publicada no feed/.test(t),
    'o cartão verde diz que concluiu e o que foi feito', t.slice(0, 400));
  ok(/12\/09\/2026/.test(t), 'com a DATA da conclusão, e não só "há 10 dias"', t.slice(0, 400));

  const confirmar = botao(grade(alvo), 'Resolveu, obrigado');
  ok(!!confirmar, 'e quem pediu tem o botão de confirmar que resolveu');
  /* desde 23/09/2026 ele é o PRIMÁRIO do painel (a regra estado→primário):
     é o botão preto de quem pediu na concluída, e não um botão perdido dentro
     do cartão verde */
  ok(botoesPrincipais(alvo)[0] === 'Resolveu, obrigado'
     && /(^| )dm-pri( |$)/.test(confirmar ? confirmar.getAttribute('class') || '' : ''),
    'e ele é o primário do painel', botoesPrincipais(alvo).join(' | '));

  await clicar(confirmar, 'o botão de confirmar');
  const c = b.ultima('dem_mover');
  ok(c && c.args.p_acao === 'validar', 'tocar nele manda a ação `validar`',
    JSON.stringify(c && c.args));
  await desmontar();
}
{
  /* JÁ VALIDADA: o botão some e vira a frase, que é o registro que o PDF pede */
  const { alvo, desmontar } = await comFicha(vista(
    { status: 'concluida', conclusao: 'Arte publicada.', concluida_em: '2026-09-12T18:00:00Z',
      validada_em: '2026-09-14T09:30:00Z', validada_por: 'Pedro Jovens' },
    QUEM.pediu));
  const t = texto(alvo);
  ok(/Validada por Pedro Jovens em 14\/09\/2026/.test(t),
    'demanda já confirmada diz quem confirmou e quando', t.slice(0, 400));
  ok(!botao(alvo, 'Resolveu, obrigado'),
    'e o botão de confirmar some: confirmar duas vezes o servidor recusa');
  await desmontar();
}
{
  /* e quem NÃO pediu nem manda não ganha o botão, mesmo com a demanda
     concluída e não validada: a guarda é a do servidor */
  const { alvo, desmontar } = await comFicha(vista(
    { status: 'concluida', conclusao: 'Arte publicada.', concluida_em: '2026-09-12T18:00:00Z' },
    QUEM.atende));
  ok(!botao(alvo, 'Resolveu, obrigado'),
    'quem executou não confirma a própria entrega');
  await desmontar();
}
{
  /* cancelada NÃO tem o que validar: não houve execução */
  const { alvo, desmontar } = await comFicha(vista(
    { status: 'cancelada', cancelada_motivo: 'O evento saiu do calendário.' }, QUEM.pediu));
  const t = texto(alvo);
  ok(/Cancelada/.test(t) && /saiu do calendário/.test(t), 'cancelada diz o motivo', t.slice(0, 300));
  ok(!botao(alvo, 'Resolveu, obrigado'), 'e não oferece confirmar o que não foi feito');
  await desmontar();
}

console.log('\n14. A ficha: o portão de aprovação fala antes de tudo');
{
  /* O DEFEITO: o aviso só aparecia com `status === 'travada'`. Quando o
     administrador liga "exige aprovação" numa categoria que já tem demanda
     andando, o servidor passa a cobrar na hora (`falta_aprovacao`) e a
     demanda continua `aberta` até alguém mexer nela. "Concluir" e "Assumir"
     somem da grade, a linha "Aprovação" da tabela também some, e NADA na tela
     diz por quê. */
  const { alvo, desmontar } = await comFicha(vista(
    { status: 'aberta', aprovacao: null, falta_aprovacao: true }, QUEM.atende));
  const t = texto(alvo);
  ok(/Aguardando aprovação/.test(avisosDe(alvo)),
    'demanda ABERTA que passou a exigir aprovação diz isso num aviso', avisosDe(alvo));
  ok(/passou a exigir aprovação/.test(t),
    'e conta que foi a categoria que mudou, e não que o pedido nasceu assim', t.slice(0, 500));
  ok(/Quem decide é a liderança/.test(t),
    'e diz de quem é a vez, para quem não decide', t.slice(0, 600));
  ok(!botoesDaGrade(alvo).includes('Concluir'),
    'com o portão aberto, Concluir não é oferecido', botoesDaGrade(alvo).join(' | '));
  ok(!botoesDaGrade(alvo).includes('Travar'),
    'nem Travar: o servidor recusa todo motivo que não seja `aprovacao`',
    botoesDaGrade(alvo).join(' | '));
  /* a linha da tabela também não pode sumir: era o segundo sintoma */
  ok(/Aprovação/.test(t) && /esperando a liderança decidir/.test(t),
    'e a tabela do pedido mostra a linha de aprovação mesmo sem valor gravado',
    t.slice(0, 900));
  await desmontar();
}
{
  /* e para quem DECIDE a frase é outra, e os dois botões aparecem */
  const { alvo, desmontar } = await comFicha(vista(
    { status: 'travada', travada_por: 'aprovacao', aprovacao: 'pendente', falta_aprovacao: true },
    QUEM.gestor));
  const t = texto(alvo);
  ok(/Você pode aprovar ou recusar nesta página/.test(t),
    'quem manda lê que a decisão é dele', t.slice(0, 500));
  ok(botoesDaGrade(alvo).includes('Aprovar') && botoesDaGrade(alvo).includes('Recusar'),
    'e os dois botões estão na grade', botoesDaGrade(alvo).join(' | '));
  /* o aviso do PORTÃO substitui o da trava: dois avisos amarelos dizendo a
     mesma coisa em palavras diferentes é ruído */
  ok((avisosDe(alvo).match(/Aguardando aprovação/g) || []).length === 1,
    'e o aviso do portão aparece uma vez só', avisosDe(alvo));
  await desmontar();
}
{
  /* a trava que NÃO é de aprovação continua com o aviso dela */
  const { alvo, desmontar } = await comFicha(vista(
    { status: 'travada', travada_por: 'informacao', travada_nota: 'Qual sala precisa de limpeza?' },
    QUEM.pediu));
  const t = texto(alvo);
  ok(/Qual sala precisa de limpeza\?/.test(t), 'a trava por informação mostra a pergunta',
    t.slice(0, 400));
  ok(!/aprovação/.test(avisosDe(alvo)), 'e não fala de aprovação nenhuma', avisosDe(alvo));
  ok(/Aguardando informações de quem pediu/.test(avisosDe(alvo)),
    'e o aviso usa o nome da pílula, dizendo de quem', avisosDe(alvo));
  ok(/Responda em “Responder e destravar”/.test(t),
    'e diz a quem pediu que responder destrava', t.slice(0, 400));
  ok(botoesDaGrade(alvo).includes('Responder e destravar'),
    'com o botão escrito na língua de quem vai tocar nele', botoesDaGrade(alvo).join(' | '));
  await desmontar();
}

console.log('\n15. A ficha: a caixinha "Só para a equipe" é só de quem atende');
{
  /* `dem_mover` faz `and demandas.pode_atender(m, d)` no gravar do comentário
     interno: oferecer a caixinha a quem pediu seria oferecer um controle que
     o servidor ignora em silêncio, que é a pior forma de recusa. */
  const { b, alvo, desmontar } = await comFicha(vista({}, QUEM.atende));
  /* desde 23/09/2026 a caixa nasce numa linha só e a caixinha aparece quando
     a pessoa começa a escrever: primeiro o texto, depois a marcação */
  const escrever = todos(alvo, x => x.nodeType === 1 && x.tagName === 'TEXTAREA').pop();
  ok(!todos(alvo, x => x.nodeType === 1 && x.tagName === 'INPUT' && x.getAttribute('type') === 'checkbox')[0],
    'antes de escrever, a caixinha não ocupa a tela');
  await teclar(escrever, 'Combinado: a Monik fecha o post no sábado.', 'a caixa de comentário');
  await assentar();
  const caixa = todos(alvo, x => x.nodeType === 1 && x.tagName === 'INPUT'
    && x.getAttribute('type') === 'checkbox')[0];
  ok(!!caixa, 'quem atende tem a caixinha de comentário interno');
  ok(/Só para a equipe \(quem pediu não vê\)/.test(texto(alvo)),
    'e ela diz o que faz, sem jargão', texto(alvo).slice(-400));

  /* marcada, o comentário viaja com `interno: true` */
  if (caixa) await act(async () => { caixa.checked = true; caixa.dispatchEvent(evento('click', { button: 0 })); });
  await assentar();
  await clicar(botao(alvo, 'Comentar'), 'o botão Comentar');
  const c = b.ultima('dem_mover');
  ok(c && c.args.p_acao === 'comentar' && c.args.p_d.interno === true,
    'comentário marcado viaja com `interno: true`', JSON.stringify(c && c.args.p_d));

  /* E ELA VOLTA PARA DESMARCADA. Uma caixinha que fica marcada faz o PRÓXIMO
     comentário sumir da vista de quem pediu sem ninguém perceber. */
  /* gravou: a caixa esvazia e se recolhe (a caixinha some com ela); no
     PRÓXIMO comentário ela tem que renascer desmarcada */
  const caixaVazia = todos(alvo, x => x.nodeType === 1 && x.tagName === 'TEXTAREA').pop();
  ok(caixaVazia && caixaVazia.value === '', 'depois de gravar a caixa esvazia', String(caixaVazia && caixaVazia.value));
  await teclar(caixaVazia, 'Segundo recado', 'a caixa de comentário');
  await assentar();
  const depois = todos(alvo, x => x.nodeType === 1 && x.tagName === 'INPUT'
    && x.getAttribute('type') === 'checkbox')[0];
  ok(depois && depois.checked !== true,
    'e no próximo comentário ela volta desmarcada', String(depois && depois.checked));
  await desmontar();
}
{
  const { alvo, desmontar } = await comFicha(vista({}, QUEM.pediu));
  await teclar(todos(alvo, x => x.nodeType === 1 && x.tagName === 'TEXTAREA').pop(), 'Obrigada!', 'a caixa de comentário');
  await assentar();
  ok(!todos(alvo, x => x.nodeType === 1 && x.tagName === 'INPUT'
      && x.getAttribute('type') === 'checkbox')[0],
    'quem só pediu não recebe a caixinha de interno, nem escrevendo');
  ok(!/Só para a equipe/.test(texto(alvo)),
    'nem a dica que manda marcá-la', texto(alvo).slice(-300));
  await desmontar();
}
{
  /* e o comentário interno se lê como interno no histórico: cor sozinha não
     informa, e interno é justamente o que não pode ser confundido */
  const { alvo, desmontar } = await comFicha(vista({}, QUEM.atende, [
    { em: '2026-09-11T10:00:00Z', tipo: 'comentario', de: null, para: null,
      texto: 'O cliente é o pastor.', interno: true, quem: 'Monik Ribeiro' },
    { em: '2026-09-10T10:00:00Z', tipo: 'abertura', de: null, para: null,
      texto: null, interno: false, quem: 'Paula Mendes' },
    /* quem olha (a sessão é da Ana Silva) é "Você" na atividade, como na
       faixa de fatos (23/09/2026) */
    { em: '2026-09-10T11:00:00Z', tipo: 'prioridade', de: 'normal', para: 'alta',
      texto: null, interno: false, quem: 'Ana Silva' },
  ]));
  const t = texto(alvo);
  ok(/interno \(só a equipe vê\)/.test(t),
    'o comentário interno diz por escrito que é interno', t.slice(-500));
  ok(/Paula abriu a demanda/.test(t) && /Monik escreveu/.test(t),
    'e o histórico vira frase, e não nome de tipo', t.slice(-500));
  ok(/Você mudou a prioridade/.test(t) && !/Ana mudou/.test(t),
    'e o gesto de quem olha é "Você"', t.slice(-500));
  await desmontar();
}

console.log('\n16. A ficha: o cartão de ações nunca fica mudo, e a ficha sabe errar');
{
  /* O CARTÃO RENDERIZAVA VAZIO, SEM UMA PALAVRA. Doze
     `{acoes.includes(...) ? <button/> : null}` e nenhum ramo de saída.
     `pode_ver` dá visão a TODO o setor solicitante e `pode_atender` não:
     qualquer pessoa do setor que pediu, que não abriu aquela demanda, caía
     nisso. */
  const { alvo, desmontar } = await comFicha(vista({}, QUEM.soEnxerga));
  ok(botoesDaGrade(alvo).length === 0, 'quem só enxerga não tem botão na grade',
    botoesDaGrade(alvo).join(' | '));
  ok(/Quem toca é o setor responsável/.test(texto(alvo)),
    'e o cartão explica por que está vazio, em vez de ficar mudo',
    texto(alvo).slice(0, 600));
  ok(/escreva aqui embaixo/.test(texto(alvo)),
    'e aponta o que ela ainda pode fazer', texto(alvo).slice(0, 600));
  await desmontar();
}
{
  /* o mesmo ramo, com a frase de outro motivo: demanda encerrada */
  const { alvo, desmontar } = await comFicha(vista(
    { status: 'concluida', conclusao: 'Feito.', concluida_em: '2026-09-12T18:00:00Z',
      validada_em: '2026-09-13T10:00:00Z', validada_por: 'Ana' },
    QUEM.soEnxerga));
  ok(botoesDaGrade(alvo).length === 0, 'grade vazia numa concluída que ela só enxerga',
    botoesDaGrade(alvo).join(' | '));
  ok(/Já encerrada/.test(texto(alvo)),
    'e a frase do cartão vazio é a do estado certo', texto(alvo).slice(0, 600));
  await desmontar();
}
{
  /* e a terceira frase: parada no portão. Quem PEDIU ainda tem "Cancelar" e
     "Juntar um anexo", então quem cai neste ramo com o portão aberto é o
     colega de setor que só enxerga — e é justamente ele que não tem como
     adivinhar por que a demanda não anda. */
  const { alvo, desmontar } = await comFicha(vista(
    { status: 'aberta', falta_aprovacao: true }, QUEM.soEnxerga));
  ok(botoesDaGrade(alvo).length === 0, 'grade vazia com o portão aberto',
    botoesDaGrade(alvo).join(' | '));
  ok(/até a liderança aprovar/.test(texto(alvo)),
    'e a frase do cartão vazio é a do portão, e não a de "o setor é que toca"',
    texto(alvo).slice(0, 700));
  await desmontar();
}
{
  /* a ficha de uma demanda que não é sua: o erro do servidor vira frase, e a
     tela não fica em branco */
  const { alvo, desmontar } = await comFicha({ ok: false, erro: 'NAO_EXISTE' });
  const t = texto(alvo);
  ok(/Essa demanda não existe/.test(t), 'demanda que não é sua vira recado, não tela branca',
    t.slice(0, 300));
  ok(!/NAO_EXISTE/.test(t), 'e o código do banco não aparece para a pessoa', t.slice(0, 300));
  await desmontar();
}
{
  /* e o que a recusa de UMA AÇÃO faz: o texto da pessoa não se perde */
  const { alvo, desmontar } = await comFicha(vista({}, QUEM.atende), {
    dem_mover: { ok: false, erro: 'ATRASO_PRECISA_MOTIVO' },
  });
  const escrever = todos(alvo, x => x.nodeType === 1 && x.tagName === 'TEXTAREA').pop();
  await teclar(escrever, 'Fiz a arte e mandei no grupo.', 'a caixa de comentário');
  await assentar();
  await clicar(botao(alvo, 'Comentar'), 'o botão Comentar');
  const t = texto(alvo);
  ok(/passou do prazo/.test(t), 'a recusa do servidor vira frase em português', t.slice(0, 400));
  const depois = todos(alvo, x => x.nodeType === 1 && x.tagName === 'TEXTAREA').pop();
  ok(depois && depois.value === 'Fiz a arte e mandei no grupo.',
    'e o texto continua na caixa: recusa não custa uma redigitação',
    String(depois && depois.value));
  await desmontar();
}
{
  /* A SAÍDA DA FICHA É O LINK DO TOPO — 22/09/2026.

     Havia um botão "Voltar para a lista" no fim da ficha, depois do
     histórico. Saiu: a barra de cima é fixa (`.dm-topo{position:sticky}`),
     então a aba "Demandas" fica a um toque em qualquer ponto da rolagem, e o
     "< todas as demandas" abre a ficha. Três saídas para o mesmo lugar eram
     duas a mais. O que não pode faltar é UMA, e ela tem que ir para a lista. */
  /* 94 · e ela volta para o PORTAL de quem olha: quem atende, para o
     Atendimento (onde estava a fila); quem pede, para as suas. */
  /* 23/09/2026 · a saída é o "‹ Atendimento" / "‹ Minhas demandas" acima do
     título (`a.dm-volta`), com o nome da seção de onde a pessoa veio: o
     mesmo da lateral e do alto da fila (a aba do celular é "Atender" porque
     cinco abas em 320px não cabem nomes longos) */
  const volta = (alvo) => todos(alvo, x => x.nodeType === 1 && x.tagName === 'A'
    && (x.getAttribute('class') || '') === 'dm-volta')[0];
  {
    const { alvo, desmontar } = await comFicha(vista({}, QUEM.atende));
    const saida = volta(alvo);
    ok(!!saida && texto(saida) === 'Atendimento', 'quem atende tem a saída do topo, "Atendimento"',
      saida ? texto(saida) : '(sem link)');
    ok(saida && saida.getAttribute('href') === '/demandas/atendimento',
      'e ela leva para o Atendimento', saida ? saida.getAttribute('href') : '(sem link)');
    ok(!botao(alvo, 'Voltar para a lista'),
      'e o botão repetido do fim não voltou');
    await desmontar();
  }
  {
    const { alvo, desmontar } = await comFicha(vista({}, QUEM.pediu));
    const saida = volta(alvo);
    ok(saida && texto(saida) === 'Minhas demandas' && saida.getAttribute('href') === '/demandas',
      'quem pediu volta para as suas, no Início', saida ? `${texto(saida)} → ${saida.getAttribute('href')}` : '(sem link)');
    await desmontar();
  }
}
{
  /* UM GESTO, UMA LINHA — 22/09/2026.

     `assumir` grava dois eventos no mesmo instante, e a ficha escrevia os
     dois: "Maria mudou de Aberta para Em execução" e "Maria passou para Maria
     Aparecida Gonçalves da Silva". A segunda se lê como defeito, e a primeira
     repete o que "assumiu" já diz.

     Os eventos abaixo têm o FORMATO QUE `dem_ver` DEVOLVE, copiado do banco
     semeado: `para` e `quem` com o mesmo nome completo, o mesmo carimbo. E
     os dois casos que a fusão NÃO pode engolir estão juntos: uma mudança de
     status que não veio de assumir, e alguém passando a demanda para OUTRA
     pessoa. */
  const MARIA = 'Maria Aparecida Gonçalves da Silva';
  const t0 = '2026-09-10T10:00:00.614434+00:00';
  const eventos = [
    { tipo: 'abertura', de: null, para: 'aberta', quem: 'Pedro Henrique Almeida Vasconcelos',
      em: '2026-09-10T09:00:00+00:00', texto: null, interno: false },
    { tipo: 'status', de: 'aberta', para: 'execucao', quem: MARIA, em: t0, texto: null, interno: false },
    { tipo: 'responsavel', de: null, para: MARIA, quem: MARIA, em: t0, texto: null, interno: false },
    { tipo: 'status', de: 'execucao', para: 'travada', quem: MARIA,
      em: '2026-09-11T10:00:00+00:00', texto: null, interno: false },
    { tipo: 'responsavel', de: null, para: 'José Carlos de Oliveira Nascimento',
      quem: 'Ana Beatriz Rodrigues dos Santos', em: '2026-09-12T10:00:00+00:00', texto: null, interno: false },
  ];
  const { alvo, desmontar } = await comFicha(vista(
    { status: 'travada', travada_por: 'informacao', travada_nota: 'Qual a medida?' }, QUEM.atende, eventos));
  const t = texto(alvo);
  ok(/Maria assumiu/.test(t), 'assumir aparece como "Maria assumiu"', t.slice(-700));
  ok(!/Maria passou para Maria/.test(t), 'e não como "Maria passou para Maria Aparecida…"', t.slice(-700));
  ok(!/mudou de Aberta para Em execução/.test(t),
    'e a linha de status do mesmo gesto não aparece duas vezes', t.slice(-700));
  ok(/Maria travou a demanda/.test(t),
    'mas uma mudança de status que não veio de assumir continua, com o verbo do botão', t.slice(-700));
  ok(/Ana passou para José Carlos de Oliveira Nascimento/.test(t),
    'e passar para outra pessoa continua sendo "passou para"', t.slice(-700));
  await desmontar();
}

/* ===========================================================================
   17 · MIGRAÇÃO 94: QUEM SOU, ONDE ESTOU, O QUE ESPERA POR MIM

   Os dois portais, o cadastro, o perfil, os avisos e a administração. O que
   estes blocos cobram é o que só a TELA decide; o que o banco decide (quem vê
   o quê) está provado na conferência da 94 e em `demandas-banco.test.sql`,
   com os quatro ataques do pedido.
   =========================================================================== */
console.log('\n17. A barra: as abas de cada papel, e o número de avisos');
const rotulosDaBarra = alvo =>
  porTag(porAria(alvo, 'aria-label', 'Seções de demandas'), 'A').map(a => a.childNodes[0] ? texto(a).replace(/\d+\+?$/, '').trim() : '');
{
  mundoNovo();
  globalThis.__banco = banco({ dem_quem_sou: { ...EU_MEMBRO, avisos: 3 }, dem_portal: portalDe(EU_MEMBRO),
                               dem_lista: { ok: true, itens: [], total: 0, tem_mais: false } });
  const { alvo, desmontar } = await montar(Inicio);
  ok(rotulosDaBarra(alvo).join('|') === 'Início|Nova|Avisos|Perfil',
    'quem só pede vê Início, Nova, Avisos e Perfil, e não vê Atendimento', rotulosDaBarra(alvo).join(' | '));
  const aba = porTag(porAria(alvo, 'aria-label', 'Seções de demandas'), 'A').find(x => /Avisos/.test(texto(x)));
  ok(aba && /3/.test(texto(aba)), 'e a aba Avisos carrega o número do que chegou', aba ? texto(aba) : '(sem aba)');
  ok(!/Administra/.test(rotulosDaBarra(alvo).join(' ')), 'a administração não está na barra de ninguém');
  await desmontar();
}
{
  mundoNovo();
  globalThis.__banco = banco({ dem_quem_sou: EU_EQUIPE, dem_portal: portalDe(EU_EQUIPE),
                               dem_lista: { ok: true, itens: [], total: 0, tem_mais: false } });
  const { alvo, desmontar } = await montar(Inicio);
  ok(rotulosDaBarra(alvo).join('|') === 'Início|Atender|Nova|Avisos|Perfil',
    'quem atende ganha a aba Atender', rotulosDaBarra(alvo).join(' | '));
  await desmontar();
}

console.log('\n18. O Início: o que espera por mim, e as portas dos outros portais');
{
  mundoNovo();
  const b = banco({
    dem_quem_sou: EU_MEMBRO,
    dem_portal: portalDe(EU_MEMBRO, { responder: 1 }, [
      { ...demanda(41, { titulo: 'Arte do retiro', status: 'travada', travada_por: 'informacao' }), motivo: 'responder' },
    ]),
    dem_lista: { ok: true, itens: [], total: 0, tem_mais: false },
  });
  globalThis.__banco = b;
  const { alvo, desmontar } = await montar(Inicio);
  const t = texto(alvo);
  ok(/Olá, Lara/.test(t) && /Membro/.test(t) && /Louvor/.test(t), 'quem sou: nome, papel e setor', t.slice(0, 200));
  ok(/Precisa de você/.test(t) && /Arte do retiro/.test(t), 'o que espera por mim vem primeiro', t.slice(0, 400));
  ok(/Responder/.test(t), 'com o nome do botão que resolve', t.slice(0, 400));
  ok(!/Atendimento/.test(t.replace(/Seções de demandas/, '')) || !/esperando você/.test(t),
    'quem só pede não vê as contas do atendimento', t.slice(0, 400));
  ok(!/Administração/.test(t), 'nem a porta da administração');
  await desmontar();
}
{
  mundoNovo();
  globalThis.__banco = banco({
    dem_quem_sou: { ...EU_EQUIPE, papel: 'admin' },
    dem_portal: portalDe({ ...EU_EQUIPE, papel: 'admin' }, { agir: 2, pedidos: 3 }),
    dem_lista: { ok: true, itens: [], total: 0, tem_mais: false },
  });
  const { alvo, desmontar } = await montar(Inicio);
  const t = texto(alvo);
  ok(/esperando você/.test(t), 'quem atende vê as contas do atendimento no Início', t.slice(0, 500));
  ok(/3 pedidos de papel esperam você/.test(t), 'e quem administra vê quantos pedidos esperam decisão', t.slice(0, 600));
  const porta = porTag(alvo, 'A').find(x => x.getAttribute('href') === '/demandas/admin');
  ok(!!porta, 'com a porta para a administração');
  await desmontar();
}

console.log('\n19. O Atendimento é de quem atende, e a administração é de quem administra');
{
  mundoNovo();
  const b = banco({ dem_quem_sou: EU_MEMBRO, dem_portal: portalDe(EU_MEMBRO),
                    dem_lista: { ok: true, itens: [demanda(1)], total: 1, tem_mais: false } });
  globalThis.__banco = b;
  const { alvo, desmontar } = await montar(Atendimento);
  ok(/O atendimento é de quem faz parte de uma equipe/.test(texto(alvo)),
    'quem só pede lê que o atendimento não é dele, e para onde ir', texto(alvo).slice(0, 300));
  ok(b.quantas('dem_lista') === 0, 'e a tela nem pede a lista', String(b.quantas('dem_lista')));
  await desmontar();
}
{
  mundoNovo();
  const b = banco({ dem_quem_sou: EU_EQUIPE, dem_pessoas: { ok: false, erro: 'SO_ADMIN' },
                    dem_bases: { ok: true, setores: [], categorias: [] } });
  globalThis.__banco = b;
  const { alvo, desmontar } = await montar(Admin);
  ok(/Esta área é de quem administra o sistema/.test(texto(alvo)),
    'quem não administra lê que a área é restrita', texto(alvo).slice(0, 300));
  ok(b.quantas('dem_pessoas') === 0, 'e a tela não pede a lista de pessoas', String(b.quantas('dem_pessoas')));
  await desmontar();
}
{
  /* os pedidos de papel no topo das Pessoas, e o que "Aceitar" manda */
  mundoNovo();
  const b = banco({
    dem_quem_sou: EU_ADMIN,
    dem_bases: { ok: true, setores: [{ id: 's1', nome: 'Comunicação', slug: 'com', atende: true }], categorias: [] },
    dem_pessoas: { ok: true, membros: [
      { id: 'p1', nome: 'Caio Lima', papel: 'solicitante', setor_id: 's1', telefone: null, ativo: true,
        papel_pedido: 'responsavel', funcao: 'Designer', origem: 'cadastro' },
      { id: 'p2', nome: 'Ana Souza', papel: 'lider', setor_id: 's1', telefone: null, ativo: false },
    ] },
    dem_ajustar: { ok: true, id: 'p1' },
  });
  globalThis.__banco = b;
  const { alvo, desmontar } = await montar(Admin);
  const t = texto(alvo);
  ok(/Pedidos de papel/.test(t) && /Quer ser Equipe/.test(t), 'o pedido aparece com o papel pedido', t.slice(0, 500));
  ok(!/Ana Souza/.test(t), 'a lista abre nas ativas: a inativa não aparece de cara', t.slice(0, 700));
  /* 22/09/2026 · "1 ativas" apareceu em produção, com a base de uma pessoa só */
  ok(/1 ativa · 1 inativa/.test(t) && !/1 ativas|1 inativas/.test(t),
    'uma pessoa é "1 ativa", no singular', (t.match(/\d+ ativas? · \d+ inativas?/) || [''])[0]);
  await clicar(botao(alvo, 'Aceitar'));
  const c = b.ultima('dem_ajustar');
  ok(c && c.args.p_o_que === 'pedido' && c.args.p_d.decisao === 'aceitar' && c.args.p_d.id === 'p1',
    'Aceitar decide o pedido daquela pessoa, e nada além', JSON.stringify(c && c.args));
  await desmontar();
}

console.log('\n20. O perfil muda o que é da pessoa, e só isso');
{
  mundoNovo();
  const b = banco({ dem_quem_sou: { ...EU_MEMBRO, telefone: '5521999990000', funcao: '' },
                    dem_perfil: { ...EU_MEMBRO, funcao: 'Baterista' } });
  globalThis.__banco = b;
  const { alvo, desmontar } = await montar(Perfil);
  ok(/Abrir demandas/.test(texto(alvo)), 'o que a pessoa pode, em frase', texto(alvo).slice(0, 400));
  await teclar(campo(alvo, 'Função'), 'Baterista');
  await assentar();
  await clicar(botao(alvo, 'Salvar'));
  const c = b.ultima('dem_perfil');
  ok(c && Object.keys(c.args.p_d).sort().join(',') === 'funcao,nome,telefone',
    'salvar manda nome, telefone e função, e mais nada', JSON.stringify(c && c.args.p_d));
  await clicar(botao(alvo, 'Pedir para liderar'));
  const d = b.ultima('dem_perfil');
  ok(d && d.args.p_d.papel_pedido === 'lider' && !('papel' in d.args.p_d),
    'pedir outro papel manda o PEDIDO, nunca o papel', JSON.stringify(d && d.args.p_d));
  await desmontar();
}

console.log('\n21. O cadastro: o e-mail primeiro, e depois só o que é da pessoa');
{
  mundoNovo();
  const b = banco({});
  let otp = null;
  b.auth = {
    getSession: async () => ({ data: { session: null } }),
    signInWithOtp: async a => { otp = a; return { error: null }; },
  };
  globalThis.__banco = b;
  const { alvo, desmontar } = await montar(CadastroPagina);
  ok(/Mandamos um link/.test(texto(alvo)), 'sem sessão, o cadastro começa pelo e-mail', texto(alvo).slice(0, 300));
  await teclar(campo(alvo, 'Seu e-mail'), 'lara@exemplo.com');
  await assentar();
  const form = porTag(alvo, 'FORM')[0];
  await act(async () => { form.dispatchEvent(evento('submit')); });
  await assentar();
  ok(otp && otp.email === 'lara@exemplo.com', 'pede o link para o e-mail digitado', JSON.stringify(otp));
  ok(otp && /\/demandas\/entrar\?volta=%2Fdemandas%2Fcadastro$/.test(otp.options.emailRedirectTo),
    'e o link volta pela porta das demandas, direto para o cadastro', otp && otp.options.emailRedirectTo);
  ok(b.chamadas.length === 0, 'e nenhuma função do banco foi chamada sem login', JSON.stringify(b.chamadas));
  await desmontar();
}
{
  mundoNovo();
  const b = banco({
    dem_cadastro: { ok: true, situacao: 'novo', email: 'lara@exemplo.com',
                    setores: [{ id: 's9', nome: 'Louvor', atende: false }, { id: 's1', nome: 'Comunicação', atende: true }] },
    dem_cadastrar: { ok: true, ...EU_MEMBRO, novo: true },
  });
  b.auth = { getSession: async () => ({ data: { session: { user: { email: 'lara@exemplo.com' } } } }) };
  globalThis.__banco = b;
  const { alvo, desmontar } = await montar(CadastroPagina);
  ok(/Você entrou como lara@exemplo.com/.test(texto(alvo)), 'com sessão, o cadastro mostra com que e-mail', texto(alvo).slice(0, 300));
  await teclar(campo(alvo, 'Nome completo'), 'Lara Souza');
  await teclar(campo(alvo, 'WhatsApp'), '(21) 99999-0000');
  await escolher(campo(alvo, 'Setor'), 's9');
  await clicar(botao(alvo, 'Lidero um ministério'));
  const form = porTag(alvo, 'FORM')[0];
  await act(async () => { form.dispatchEvent(evento('submit')); });
  await assentar();
  const c = b.ultima('dem_cadastrar');
  ok(c && !('p_token' in c.args), 'o cadastro não manda token: a identidade é o login', JSON.stringify(c && c.args));
  const chaves = c ? Object.keys(c.args.p_d).filter(k => c.args.p_d[k] !== undefined).sort().join(',') : '';
  ok(chaves === 'nome,papel_pedido,setor_id,telefone', 'e manda só nome, telefone, setor e o PEDIDO de papel', chaves);
  ok(c && c.args.p_d.telefone === '21999990000', 'o telefone vai só com os dígitos', c && c.args.p_d.telefone);
  await desmontar();
}

/* O LINK DE CADASTRO DE CADA SETOR (23/09/2026): `?equipe=comunicacao` chega
   com o setor e "Atendo demandas" marcados, `?setor=louvor` só com o setor,
   o link de equipe de um ministério não vira pedido, e o setor do link
   viaja no link do e-mail. */
{
  mundoNovo();
  window.location.search = '?equipe=comunicacao';
  const b = banco({});
  let otp = null;
  b.auth = {
    getSession: async () => ({ data: { session: null } }),
    signInWithOtp: async a => { otp = a; return { error: null }; },
  };
  globalThis.__banco = b;
  const { alvo, desmontar } = await montar(CadastroPagina);
  await teclar(campo(alvo, 'Seu e-mail'), 'monik@exemplo.com');
  await assentar();
  await act(async () => { porTag(alvo, 'FORM')[0].dispatchEvent(evento('submit')); });
  await assentar();
  ok(otp && /\/demandas\/entrar\?volta=%2Fdemandas%2Fcadastro%3Fequipe%3Dcomunicacao$/.test(otp.options.emailRedirectTo),
    'o setor do link viaja no link do e-mail', otp && otp.options.emailRedirectTo);
  await desmontar();
}
{
  mundoNovo();
  window.location.search = '?setor=..%2F..%2Fpainel&x=%3Cscript%3E';
  const b = banco({});
  let otp = null;
  b.auth = {
    getSession: async () => ({ data: { session: null } }),
    signInWithOtp: async a => { otp = a; return { error: null }; },
  };
  globalThis.__banco = b;
  const { alvo, desmontar } = await montar(CadastroPagina);
  await teclar(campo(alvo, 'Seu e-mail'), 'x@exemplo.com');
  await assentar();
  await act(async () => { porTag(alvo, 'FORM')[0].dispatchEvent(evento('submit')); });
  await assentar();
  const volta = otp ? decodeURIComponent(otp.options.emailRedirectTo.split('volta=')[1] || '') : '';
  ok(volta === '/demandas/cadastro?setor=painel', 'lixo no endereço não viaja no link do e-mail', volta);
  await desmontar();
}
{
  const cadastroCom = async (busca) => {
    mundoNovo();
    window.location.search = busca;
    const b = banco({
      dem_cadastro: { ok: true, situacao: 'novo', email: 'monik@exemplo.com',
                      setores: [{ id: 's9', nome: 'Louvor', atende: false }, { id: 's1', nome: 'Comunicação', atende: true },
                                { id: 's2', nome: 'Compras e suprimentos', atende: true }] },
      dem_cadastrar: { ok: true, ...EU_MEMBRO, novo: true },
    });
    b.auth = { getSession: async () => ({ data: { session: { user: { email: 'monik@exemplo.com' } } } }) };
    globalThis.__banco = b;
    const m = await montar(CadastroPagina);
    return { b, ...m };
  };
  const marcado = alvo => {
    const bt = botao(alvo, 'Atendo demandas');
    return bt ? bt.getAttribute('aria-pressed') : '(sem botão)';
  };
  /* o <select> controlado pelo React marca a <option> (`selected`), e não o
     `value` do select, neste DOM de mentira */
  const escolhido = alvo => {
    const sel = campo(alvo, 'Setor');
    if (!sel) return '(sem campo)';
    const o = porTag(sel, 'OPTION').find(x => x.selected === true);
    return o ? String(o.value ?? o.getAttribute('value') ?? '') : '';
  };
  {
    const { b, alvo, desmontar } = await cadastroCom('?equipe=comunicacao');
    ok(escolhido(alvo) === 's1', 'o link da equipe chega com o setor escolhido', escolhido(alvo));
    ok(marcado(alvo) === 'true', 'e com "Atendo demandas" marcado', marcado(alvo));
    await teclar(campo(alvo, 'Nome completo'), 'Monik Ribeiro');
    await teclar(campo(alvo, 'WhatsApp'), '(21) 99999-0001');
    await assentar();
    await act(async () => { porTag(alvo, 'FORM')[0].dispatchEvent(evento('submit')); });
    await assentar();
    const c = b.ultima('dem_cadastrar');
    ok(c && c.args.p_d.setor_id === 's1' && c.args.p_d.papel_pedido === 'responsavel',
      'e o cadastro manda o setor e o PEDIDO de atender, que a administração decide', JSON.stringify(c && c.args.p_d));
    await desmontar();
  }
  {
    const { alvo, desmontar } = await cadastroCom('?equipe=compras');
    ok(escolhido(alvo) === 's2', 'a primeira palavra basta ("compras")', escolhido(alvo));
    await desmontar();
  }
  {
    const { alvo, desmontar } = await cadastroCom('?setor=louvor');
    ok(escolhido(alvo) === 's9', 'o link do ministério chega com o setor escolhido', escolhido(alvo));
    ok(marcado(alvo) === 'false', 'e sem pedido nenhum', marcado(alvo));
    await desmontar();
  }
  {
    const { alvo, desmontar } = await cadastroCom('?equipe=louvor');
    ok(escolhido(alvo) === 's9' && marcado(alvo) === 'false',
      'link de equipe de um setor que não atende vira só o setor, sem pedido', `${escolhido(alvo)} ${marcado(alvo)}`);
    await desmontar();
  }
  {
    const { alvo, desmontar } = await cadastroCom('?equipe=nao-existe');
    ok(escolhido(alvo) === '' && marcado(alvo) === 'false', 'setor que não existe não escolhe nada',
      `${escolhido(alvo)} ${marcado(alvo)}`);
    await desmontar();
  }
}

console.log('\n22. A ficha: quem acompanha');
{
  const { b, alvo, desmontar } = await comFicha(
    { ...vista({}, { ...QUEM.pediu, pede: true, inclui: true }), participantes: [{ id: 'x2', nome: 'Beto Reis', eu: false }] },
    { dem_mover: { ok: true, nome: 'Carla' } });
  const t = texto(alvo);
  ok(/Quem acompanha/.test(t) && /Beto Reis/.test(t), 'a ficha diz quem acompanha, pelo nome', t.slice(0, 900));
  /* o dublê de DOM não transforma toque em botão de formulário em `submit`
     (quem faz isso é o navegador); o envio é disparado no formulário que
     contém a caixa, que é o caminho do Enter e do toque */
  const enviar = async caixa => {
    const form = porTag(alvo, 'FORM').find(f => todos(f, x => x === caixa).length > 0);
    await act(async () => { form.dispatchEvent(evento('submit')); });
    await assentar();
  };
  /* 23/09/2026 · o formulário de incluir fica atrás de "Incluir alguém":
     a linha de quem acompanha é uma só, e o campo só ocupa a tela quando a
     pessoa pede */
  ok(!campo(alvo, 'WhatsApp da pessoa'), 'o campo de incluir não ocupa a tela antes do toque');
  await clicar(botao(alvo, 'Incluir alguém'), 'o botão de incluir alguém');
  /* 22/09/2026 · WhatsApp primeiro, com o teclado de telefone; e-mail com o
     de e-mail. Era um campo só, de texto, e o medidor de celular acusou o
     teclado de letras para quem ia digitar número. */
  const tel = campo(alvo, 'WhatsApp da pessoa');
  /* o dublê de DOM guarda o atributo com o nome que o React escreveu
     (`inputMode`); o navegador o guarda em minúsculas. Os dois valem. */
  const modo = x => x && (x.getAttribute('inputmode') ?? x.getAttribute('inputMode'));
  ok(tel && tel.getAttribute('type') === 'tel' && modo(tel) === 'tel',
    'o campo começa pelo WhatsApp, com o teclado de telefone',
    tel ? `type=${tel.getAttribute('type')} inputmode=${modo(tel)}` : '(sem campo)');
  await teclar(tel, '(21) 99999-0007');
  await enviar(tel);
  let c = b.ultima('dem_mover');
  ok(c && c.args.p_acao === 'incluir' && c.args.p_d.quem === '(21) 99999-0007',
    'incluir pelo WhatsApp manda o número como foi digitado (quem normaliza é o banco)', JSON.stringify(c && c.args));
  /* incluiu: o formulário se fecha (a linha volta a ser uma só) e a pessoa
     reabre para incluir a segunda */
  ok(!campo(alvo, 'WhatsApp da pessoa'), 'depois de incluir, o formulário se recolhe');
  await clicar(botao(alvo, 'Incluir alguém'), 'o botão de incluir alguém, de novo');
  await teclar(campo(alvo, 'WhatsApp da pessoa'), '(21) 9');
  await clicar(botao(alvo, 'E-mail'));
  const em = campo(alvo, 'E-mail da pessoa');
  ok(em && em.getAttribute('type') === 'email', 'trocar para e-mail troca o campo e o teclado', em ? em.getAttribute('type') : '(sem campo)');
  ok(em && em.value === '', 'e o que estava escrito no outro não passa para este', em && em.value);
  await teclar(em, 'carla@exemplo.com');
  await enviar(em);
  c = b.ultima('dem_mover');
  ok(c && c.args.p_acao === 'incluir' && c.args.p_d.quem === 'carla@exemplo.com',
    'incluir manda o e-mail exato, e não um nome para procurar', JSON.stringify(c && c.args));
  await desmontar();
}
{
  const { alvo, desmontar } = await comFicha(vista({}, { ...QUEM.soEnxerga, participa: true, inclui: false }));
  ok(!campo(alvo, 'WhatsApp da pessoa') && !campo(alvo, 'E-mail da pessoa') && !botao(alvo, 'Incluir')
     && !botao(alvo, 'Incluir alguém'),
    'quem só acompanha não inclui ninguém');
  await desmontar();
}

console.log('\n23. Os avisos: a mesma frase da ficha, e abrir zera o número');
{
  mundoNovo();
  const b = banco({
    dem_quem_sou: { ...EU_MEMBRO, avisos: 2 },
    dem_avisos: { ok: true, novos: 1, vistos_em: '2026-09-01T00:00:00Z', itens: [
      { em: '2026-09-20T10:00:00Z', tipo: 'responsavel', de: null, para: 'Maria Aparecida', quem: 'Maria Aparecida',
        texto: null, numero: 41, titulo: 'Arte do retiro', motivo: 'pedi', novo: true },
    ] },
  });
  globalThis.__banco = b;
  const { alvo, desmontar } = await montar(Avisos);
  ok(/Maria assumiu/.test(texto(alvo)), 'o aviso usa a frase da ficha', texto(alvo).slice(0, 400));
  ok(b.ultima('dem_avisos').args.p_marcar === true, 'abrir os avisos os marca como vistos');
  const aba = porTag(porAria(alvo, 'aria-label', 'Seções de demandas'), 'A').find(x => /Avisos/.test(texto(x)));
  ok(aba && !/\d/.test(texto(aba)), 'e o número da aba some', aba ? texto(aba) : '(sem aba)');
  await desmontar();
}

console.log(`\ndemandas-telas: ${feitas - falhas}/${feitas} ok`);
if (falhas) { console.log(`\n${falhas} falha(s).`); process.exit(1); }
