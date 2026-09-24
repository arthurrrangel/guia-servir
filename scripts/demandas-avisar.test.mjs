/* A ROTA QUE MANDA OS AVISOS NÃO TINHA NENHUM TESTE.

   22/09/2026. `app/api/demandas/avisar/route.ts` é a única peça do sistema de
   demandas que (a) manda e-mail para fora, (b) roda com a chave de serviço,
   que passa por cima de toda política do banco, e (c) aceita chamada de fora
   com uma credencial no cabeçalho. Era também a única sem uma linha de teste.

   SETE SABOTAGENS FICARAM VERDES NO `npm test` ANTES DESTE ARQUIVO EXISTIR:

     1. apagar a chamada a `podeChamar`: a rota vira um gatilho de envio de
        e-mail aberto para quem achar a URL;
     2. aceitar o token em `?t=` na URL, que é o mesmo defeito que a 51 já
        pagou: URL entra em log de servidor, em Referer e no histórico;
     3. tirar o `segredo &&` da comparação: sem `CRON_SECRET` no ambiente,
        `Bearer undefined` casa com uma chamada sem cabeçalho e TUDO vira cron;
     4. devolver o token na resposta;
     5. devolver a fila inteira na resposta, com nome, e-mail e título de todo
        mundo, por uma rota que existe para mandar e-mail;
     6. carimbar como avisado quando o e-mail FALHOU, que faz a demanda nunca
        mais ser avisada e ninguém ficar sabendo;
     7. mandar o e-mail como `html:` com título de usuário interpolado sem
        escapar.

   POR QUE ELE EXECUTA A ROTA EM VEZ DE LER O ARQUIVO

   O próprio cabeçalho de `scripts/_ts.mjs` já diz por quê: "Teste que lê
   código em vez de executá-lo não testa comportamento, testa grafia." Este
   repositório já pagou por isso duas vezes (`cron-guarda`, primeira versão, e
   `demandas-porta-propria`, item 4). Nenhuma das sete sabotagens acima muda a
   grafia de um jeito que um regex honesto pegue.

   COMO O DUBLÊ FOI ESCOLHIDO, E POR QUE ESTE E NÃO OUTRO

   A rota cria o cliente do Supabase DENTRO de `servidor()`, a cada chamada,
   com `createClient`. Havia dois caminhos:

     · injetar o cliente na rota (mudar a assinatura de `varrer`), o que
       obrigaria a produção a carregar uma costura que só o teste usa;
     · pôr `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE` de mentira e
        trocar `globalThis.fetch`, que é por onde o supabase-js fala com o
        PostgREST e por onde a rota fala com o Resend.

   O segundo ganha: a rota roda EXATAMENTE como em produção, sem uma linha de
   código só para teste, e o dublê mede o que de fato sai pela rede. O acoplamento
   que sobra é com uma coisa estável: `POST <url>/rest/v1/rpc/<função>`.

   Um detalhe do supabase-js que o teste depende, e que vale escrever: ele
   resolve o `fetch` no CONSTRUTOR do cliente (`resolveFetch`, em
   `lib/fetch.js`). Como `servidor()` constrói um cliente novo por chamada,
   trocar `globalThis.fetch` antes de cada caso basta. Se um dia a rota passar
   a guardar o cliente num módulo, este arquivo precisa trocar o fetch ANTES do
   import e nunca mais.

   Roda com `npm test`, sem banco, sem rede e sem navegador. */

/* ------------------------------------------------------------------ régua */
let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => {
  feitas++;
  if (!c) { falhas++; console.__real.log('  FALHOU:', rot, extra ? ` · ${extra}` : ''); }
};

/* o console tem que ser vigiado ANTES de qualquer coisa: metade do que este
   arquivo promete é que segredo e token não aparecem em log */
const registro = [];
console.__real = { log: console.log, warn: console.warn, error: console.error };
for (const nivel of ['log', 'warn', 'error']) {
  console[nivel] = (...a) => { registro.push(a.map(x => String(x)).join(' ')); };
}

/* ------------------------------------------------------- o mundo de mentira */
const SUPA = 'https://banco-de-mentira.supabase.test';
const SITE = 'https://site-de-mentira.test';
const SEGREDO = 'SEGREDO-DO-CRON-nao-pode-vazar-9f2c';
const TOKEN = 'TOKEN-PESSOAL-nao-pode-vazar-7a1b';
const CHAVE_RESEND = 'CHAVE-RESEND-nao-pode-vazar-3d5e';

process.env.NEXT_PUBLIC_SUPABASE_URL = SUPA;
process.env.SUPABASE_SERVICE_ROLE = 'chave-de-servico-de-mentira';
process.env.NEXT_PUBLIC_SITE_URL = SITE;
process.env.RESEND_API_KEY = CHAVE_RESEND;
process.env.CRON_SECRET = SEGREDO;

/* dados que NÃO podem sair pela resposta nem pelo log: e-mail de gente, nome
   de gente e título de demanda. Escolhidos para não colidirem com nada. */
const EMAILS = ['monik.arte@exemplo-guia.test', 'ruth.pedido@exemplo-guia.test', 'lucas.espera@exemplo-guia.test'];
const NOMES = ['Monik Alcantara', 'Ruth Bezerra', 'Lucas Andrade'];
const TITULOS = ['Arte do culto de domingo', 'Banner do encontro de casais', 'Camiseta do time de midia'];

const avisoBase = (i, extra = {}) => ({
  aviso_id: `00000000-0000-4000-8000-00000000000${i + 1}`,
  tipo: 'nova',
  email: EMAILS[i], nome: NOMES[i],
  numero: 41 + i, titulo: TITULOS[i],
  grupo: 'Comunicação e divulgação', categoria: 'Criação de arte',
  setor: 'Comunicação', abriu: 'Monik',
  prioridade: 'normal', prazo: '2026-10-01', falta_aprovacao: false,
  estado: 'Em execução', nota: null,
  ...extra,
});

const resposta = (corpo, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

const cabecalhos = (init) => {
  const h = init?.headers;
  if (!h) return new Headers();
  return h instanceof Headers ? h : new Headers(h);
};

let cena = null;

function montar(opcoes = {}) {
  cena = {
    fila: opcoes.fila ?? [],
    /* `in` e não `??`: um caso deste arquivo manda o banco responder `null` de
       propósito, e com `??` esse caso virava silenciosamente o padrão `ok:true`
       e media o oposto do que diz medir */
    quemSou: 'quemSou' in opcoes ? opcoes.quemSou : { ok: true, nome: 'Fulano' },
    /* devolve o status do Resend para a n-ésima tentativa (1-based) */
    resend: opcoes.resend ?? (() => 200),
    semFuncao: new Set(opcoes.semFuncao ?? []),
    rpcs: [], emails: [], forasteiras: [],
  };
  registro.length = 0;
  return cena;
}

globalThis.fetch = async (entrada, init = {}) => {
  const url = typeof entrada === 'string' ? entrada : String(entrada?.url ?? entrada);
  const h = cabecalhos(init);
  let corpo = null;
  try { corpo = init?.body ? JSON.parse(String(init.body)) : null; } catch { corpo = String(init?.body); }

  const prefixo = `${SUPA}/rest/v1/rpc/`;
  if (url.startsWith(prefixo)) {
    const fn = url.slice(prefixo.length).split('?')[0];
    cena.rpcs.push({
      fn, args: corpo,
      /* `.schema('demandas')` vira este cabeçalho, e é o defeito que a 91
         matou: o schema `demandas` não está exposto na API e a chave de
         serviço não tem USAGE nele, então a chamada falhava SEMPRE */
      perfil: h.get('content-profile') || h.get('accept-profile') || null,
    });
    if (cena.semFuncao.has(fn)) {
      return resposta({ code: 'PGRST202', message: `Could not find the function public.${fn}` }, 404);
    }
    if (fn === 'dem_quem_sou') return resposta(cena.quemSou);
    if (fn === 'dem_avisos_pendentes') return resposta(cena.fila);
    if (fn === 'dem_aviso_enviado' || fn === 'dem_aviso_falhou') {
      return resposta((corpo?.p_ids || []).length);
    }
    /* função que o banco não tem: é assim que o PostgREST responde, e é o que
       a rota veria se alguém voltasse a chamar `a_avisar` */
    return resposta({ code: 'PGRST202', message: `Could not find the function public.${fn}` }, 404);
  }

  if (url === 'https://api.resend.com/emails') {
    cena.emails.push({ corpo, autorizacao: h.get('authorization'), sinal: init?.signal ?? null });
    /* número = só o status; objeto = status e a frase que a Resend manda.
       A frase importa desde que o remetente tem volta: só a recusa por
       domínio não verificado ganha segunda tentativa. */
    const st = cena.resend(cena.emails.length);
    const s = typeof st === 'object' ? st.status : st;
    const frase = typeof st === 'object' ? st.message : 'estourou';
    return s === 200 ? resposta({ id: 'msg_de_mentira' }) : resposta({ message: frase }, s);
  }

  /* qualquer outro host é falha de teste, não resultado: a rota só pode falar
     com o banco e com o provedor de e-mail */
  cena.forasteiras.push(url);
  return resposta({ erro: 'host nao previsto' }, 500);
};

const rota = await import('@/app/api/demandas/avisar/route');

const URL_ROTA = `${SITE}/api/demandas/avisar`;
const chamar = (opcoes = {}) => {
  const { metodo = 'POST', url = URL_ROTA, headers = {}, body, verbo } = opcoes;
  const req = new Request(url, { method: metodo, headers, ...(body === undefined ? {} : { body }) });
  return (verbo === 'GET' ? rota.GET : rota.POST)(req);
};

const comToken = { 'x-demandas-token': TOKEN };
const comCron = { authorization: `Bearer ${SEGREDO}` };

const emailDe = (e) => e.corpo || {};
const textoDe = (e) => String(emailDe(e).text ?? '');
const assuntoDe = (e) => String(emailDe(e).subject ?? '');

/* ==========================================================================
   1 · A PORTA. Quem não provou quem é não faz e-mail sair.
   ========================================================================== */
{
  const casos = [
    ['sem cabeçalho nenhum', {}],
    ['x-demandas-token vazio', { 'x-demandas-token': '' }],
    ['x-demandas-token só com espaço', { 'x-demandas-token': '   ' }],
    ['Authorization: Bearer errado', { authorization: 'Bearer chute-errado' }],
    ['Authorization: Bearer vazio', { authorization: 'Bearer ' }],
    ['Authorization com o token pessoal no lugar do segredo', { authorization: `Bearer ${TOKEN}` }],
    ['x-demandas-token com o segredo do cron dentro', { 'x-demandas-token': SEGREDO }],
  ];
  for (const [rot, headers] of casos) {
    montar({ fila: [avisoBase(0)], quemSou: { ok: false } });
    const r = await chamar({ headers });
    ok(r.status === 401, `401: ${rot}`, `veio ${r.status}`);
    ok(cena.emails.length === 0, `nenhum e-mail sai: ${rot}`, `saíram ${cena.emails.length}`);
    ok(cena.rpcs.every(c => c.fn === 'dem_quem_sou'),
       `a fila nem é lida: ${rot}`, cena.rpcs.map(c => c.fn).join(','));
  }
}

/* ---- o token NA URL não vale, em nenhuma grafia ------------------------- */
{
  for (const chave of ['t', 'token', 'secret', 'segredo', 'key', 'cron_secret']) {
    for (const valor of [TOKEN, SEGREDO]) {
      montar({ fila: [avisoBase(0)] });
      const r = await chamar({ url: `${URL_ROTA}?${chave}=${encodeURIComponent(valor)}` });
      ok(r.status === 401, `token na URL não autoriza: ?${chave}=`, `veio ${r.status}`);
      ok(cena.emails.length === 0, `e nenhum e-mail sai com ?${chave}=`, `saíram ${cena.emails.length}`);
    }
  }
  /* e a URL não vale nem junto com um cabeçalho vazio, que é como um
     "aceita os dois" mal escrito costuma entrar */
  montar({ fila: [avisoBase(0)] });
  const r = await chamar({ url: `${URL_ROTA}?t=${TOKEN}`, headers: { 'x-demandas-token': '' } });
  ok(r.status === 401, 'token na URL com cabeçalho vazio continua 401', `veio ${r.status}`);
}

/* ---- sem CRON_SECRET no ambiente, nada vira cron ------------------------ */
{
  const guardado = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  try {
    for (const [rot, headers] of [
      ['sem cabeçalho nenhum', {}],
      ['Bearer undefined, que é o que a comparação frouxa monta', { authorization: 'Bearer undefined' }],
      ['Bearer vazio', { authorization: 'Bearer ' }],
      ['só "Bearer"', { authorization: 'Bearer' }],
    ]) {
      montar({ fila: [avisoBase(0)], quemSou: { ok: false } });
      const r = await chamar({ headers });
      ok(r.status === 401, `sem CRON_SECRET no ambiente: ${rot} continua 401`, `veio ${r.status}`);
      ok(cena.emails.length === 0, `sem CRON_SECRET: ${rot} não faz e-mail sair`);
    }
  } finally { process.env.CRON_SECRET = guardado; }
}

/* ---- quem o banco NÃO reconhece também não entra ------------------------ */
{
  for (const [rot, quemSou] of [
    ['banco diz ok:false', { ok: false }],
    ['banco devolve nulo', null],
    ['banco devolve objeto vazio', {}],
    ['banco devolve ok como string', { ok: 'sim' }],
  ]) {
    montar({ fila: [avisoBase(0)], quemSou });
    const r = await chamar({ headers: comToken });
    ok(r.status === 401, `token que o banco não valida: ${rot}`, `veio ${r.status}`);
    ok(cena.emails.length === 0, `e nenhum e-mail sai: ${rot}`);
  }
  /* e se a própria checagem de identidade explodir, a porta fecha */
  montar({ fila: [avisoBase(0)], semFuncao: ['dem_quem_sou'] });
  const r = await chamar({ headers: comToken });
  ok(r.status === 401, 'erro na checagem de identidade fecha a porta (não abre)', `veio ${r.status}`);
}

/* ==========================================================================
   2 · COM A CREDENCIAL CERTA, O AVISO SAI. E pelas funções da 91.
   ========================================================================== */
{
  for (const [rot, headers, verbo, por] of [
    ['token pessoal no cabeçalho, POST', comToken, 'POST', 'membro'],
    ['segredo do cron, GET (é assim que a Vercel chama)', comCron, 'GET', 'cron'],
  ]) {
    montar({ fila: [avisoBase(0), avisoBase(1)] });
    const r = await chamar({ headers, verbo });
    const j = await r.json();
    ok(r.status === 200, `200: ${rot}`, `veio ${r.status} ${JSON.stringify(j)}`);
    ok(cena.emails.length === 2, `os dois e-mails saem: ${rot}`, `saíram ${cena.emails.length}`);
    ok(j.avisados === 2, `a resposta conta os dois: ${rot}`, JSON.stringify(j));
    ok(j.por === por, `a resposta diz quem chamou: ${rot}`, JSON.stringify(j.por));
    ok(cena.forasteiras.length === 0, `a rota só fala com o banco e com o Resend: ${rot}`,
       cena.forasteiras.join(','));
  }
}

/* ---- as três funções são as de `public`, sem schema `demandas` ---------- */
{
  montar({ fila: [avisoBase(0)] });
  await chamar({ headers: comToken });
  const nomes = cena.rpcs.map(c => c.fn);
  ok(nomes.includes('dem_avisos_pendentes'),
     'a fila vem de public.dem_avisos_pendentes', nomes.join(','));
  ok(nomes.includes('dem_aviso_enviado'),
     'o carimbo é public.dem_aviso_enviado', nomes.join(','));
  ok(!nomes.includes('a_avisar') && !nomes.includes('marcar_avisado'),
     'as funções da 90 (a_avisar / marcar_avisado) não são mais chamadas', nomes.join(','));
  /* o supabase-js manda `public` por padrão; `demandas` só aparece se alguém
     puser `.schema('demandas')` de volta, que é a chamada que falhava SEMPRE */
  ok(cena.rpcs.every(c => c.perfil === null || c.perfil === 'public'),
     'nenhuma chamada pede o schema `demandas` (ele não está exposto na API e a chave de serviço não tem USAGE nele)',
     JSON.stringify(cena.rpcs.map(c => [c.fn, c.perfil])));
  const fila = cena.rpcs.find(c => c.fn === 'dem_avisos_pendentes');
  ok(fila && Number.isFinite(fila.args?.p_limite),
     'e a fila é pedida com teto', JSON.stringify(fila?.args));
}

/* ---- a fila vazia não chama carimbo nenhum ------------------------------ */
{
  montar({ fila: [] });
  const r = await chamar({ headers: comToken });
  const j = await r.json();
  ok(r.status === 200 && j.avisados === 0, 'fila vazia responde 200 com zero', JSON.stringify(j));
  ok(cena.emails.length === 0, 'fila vazia não manda e-mail');
  ok(!cena.rpcs.some(c => c.fn === 'dem_aviso_enviado' || c.fn === 'dem_aviso_falhou'),
     'fila vazia não carimba nada (nem com lista vazia)', cena.rpcs.map(c => c.fn).join(','));
}

/* ==========================================================================
   3 · A RESPOSTA NÃO CARREGA DADO DE NINGUÉM.

   Quem chama pode ser qualquer membro, inclusive um que não vê aquela demanda
   na tela. A varredura inteira é lida com a chave de serviço, que passa por
   cima de toda política do banco: o que ela devolver, devolve para qualquer um
   com um token válido.
   ========================================================================== */
{
  const fila = [
    avisoBase(0),
    avisoBase(1, { tipo: 'status' }),
    avisoBase(2, { tipo: 'informacao', nota: 'Qual o tamanho do banner?' }),
  ];
  /* o segundo falha de propósito: o caminho de falha é onde texto de erro
     costuma vazar dado junto */
  montar({ fila, resend: (n) => (n === 2 ? 500 : 200) });
  const r = await chamar({ headers: comToken });
  const cru = await r.text();

  const proibido = [
    [SEGREDO, 'o segredo do cron'],
    [TOKEN, 'o token pessoal'],
    [CHAVE_RESEND, 'a chave do Resend'],
    ...EMAILS.map(e => [e, `o e-mail de ${e}`]),
    ...NOMES.map(n => [n, `o nome de ${n}`]),
    ...TITULOS.map(t => [t, `o título "${t}"`]),
    ['Qual o tamanho do banner?', 'a nota da demanda'],
    ['aviso_id', 'a chave interna do aviso'],
    ['00000000-0000-4000-8000-000000000001', 'o id do aviso'],
  ];
  for (const [agulha, rot] of proibido) {
    ok(!cru.includes(agulha), `a resposta não devolve ${rot}`, cru.slice(0, 240));
  }

  const j = JSON.parse(cru);
  ok(Array.isArray(j.falhas), 'a resposta traz a lista de falhas', cru);
  ok(j.falhas.length === 1, 'com a única que falhou', JSON.stringify(j.falhas));
  ok(j.falhas[0]?.numero === 42, 'e a falha diz o NÚMERO da demanda', JSON.stringify(j.falhas));
  ok(typeof j.falhas[0]?.motivo === 'string' && j.falhas[0].motivo.length > 0,
     'e o motivo', JSON.stringify(j.falhas));
  ok(j.avisados === 2, 'e a contagem de quem foi avisado de verdade', JSON.stringify(j));

  /* e o log também não é lugar de segredo nem de token */
  const tudoLog = registro.join('\n');
  for (const [agulha, rot] of [[SEGREDO, 'o segredo do cron'], [TOKEN, 'o token pessoal'], [CHAVE_RESEND, 'a chave do Resend']]) {
    ok(!tudoLog.includes(agulha), `nada escrito em console contém ${rot}`, tudoLog.slice(0, 240));
  }
}

/* ==========================================================================
   4 · FALHA DE E-MAIL NÃO CARIMBA.

   É a diferença entre "tentei e não deu" e "dei por avisado". Sem isto, um
   `resend 429` de um minuto ruim faz a demanda nunca mais ser avisada, e
   ninguém fica sabendo, porque não fica registro de que faltou.
   ========================================================================== */
{
  for (const status of [500, 429, 401, 422]) {
    montar({ fila: [avisoBase(0)], resend: () => status });
    const r = await chamar({ headers: comToken });
    const j = await r.json();
    const carimbou = cena.rpcs.filter(c => c.fn === 'dem_aviso_enviado');
    const devolveu = cena.rpcs.filter(c => c.fn === 'dem_aviso_falhou');
    ok(carimbou.length === 0, `resend ${status}: NÃO chama dem_aviso_enviado`,
       JSON.stringify(carimbou.map(c => c.args)));
    ok(devolveu.length === 1, `resend ${status}: chama dem_aviso_falhou`, `chamou ${devolveu.length}x`);
    ok(devolveu[0]?.args?.p_ids?.length === 1, `resend ${status}: devolve o aviso certo para a fila`,
       JSON.stringify(devolveu[0]?.args));
    ok(typeof devolveu[0]?.args?.p_erro === 'string' && devolveu[0].args.p_erro.includes(String(status)),
       `resend ${status}: o erro guardado diz o que aconteceu`, JSON.stringify(devolveu[0]?.args));
    ok(j.avisados === 0, `resend ${status}: a resposta não conta como avisado`, JSON.stringify(j));
  }

  /* metade e metade: o que deu certo carimba, o que falhou volta para a fila,
     e nenhum id aparece nos dois lados */
  montar({ fila: [avisoBase(0), avisoBase(1), avisoBase(2)], resend: (n) => (n === 2 ? 500 : 200) });
  await chamar({ headers: comToken });
  const enviados = cena.rpcs.filter(c => c.fn === 'dem_aviso_enviado').flatMap(c => c.args.p_ids);
  const caidos = cena.rpcs.filter(c => c.fn === 'dem_aviso_falhou').flatMap(c => c.args.p_ids);
  ok(enviados.length === 2, 'os dois que saíram são carimbados', JSON.stringify(enviados));
  ok(caidos.length === 1, 'e só o que caiu volta para a fila', JSON.stringify(caidos));
  ok(!enviados.some(id => caidos.includes(id)), 'e nenhum id está nos dois lados');

  /* sem a chave do provedor, ninguém é dado por avisado */
  {
    const guardado = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    try {
      montar({ fila: [avisoBase(0)] });
      await chamar({ headers: comToken });
      ok(cena.emails.length === 0, 'sem RESEND_API_KEY não há tentativa de envio');
      ok(!cena.rpcs.some(c => c.fn === 'dem_aviso_enviado'),
         'sem RESEND_API_KEY ninguém é carimbado como avisado');
      ok(cena.rpcs.some(c => c.fn === 'dem_aviso_falhou'),
         'sem RESEND_API_KEY o aviso volta para a fila');
    } finally { process.env.RESEND_API_KEY = guardado; }
  }
}

/* ---- sem endereço é falha PERMANENTE, e essa é a exceção ---------------- */
{
  for (const ruim of [null, '', '   ', 'nao-e-email', 'a@b', 'a b@c.com']) {
    montar({ fila: [avisoBase(0, { email: ruim })] });
    const r = await chamar({ headers: comToken });
    const j = await r.json();
    ok(cena.emails.length === 0, `e-mail ${JSON.stringify(ruim)}: nem tenta mandar`);
    /* carimba como enviado de propósito: `dem_aviso_falhou` devolve para a
       fila, e uma linha sem endereço válido nunca passa a ter um sozinha.
       Seria a mesma tentativa falhando para sempre, empurrando aviso de
       verdade para fora do teto. */
    ok(cena.rpcs.some(c => c.fn === 'dem_aviso_enviado'),
       `e-mail ${JSON.stringify(ruim)}: dá por encerrado em vez de tentar para sempre`,
       cena.rpcs.map(c => c.fn).join(','));
    ok(!cena.rpcs.some(c => c.fn === 'dem_aviso_falhou'),
       `e-mail ${JSON.stringify(ruim)}: não volta para a fila`);
    ok(j.semDestinatario === 1, `e-mail ${JSON.stringify(ruim)}: a resposta conta`, JSON.stringify(j));
    ok(registro.join('\n').includes('sem e-mail'),
       `e-mail ${JSON.stringify(ruim)}: e fica um log, que é o que paga a memória perdida`,
       registro.join(' | '));
  }
}

/* ==========================================================================
   5 · O CORPO DO E-MAIL É TEXTO, E NUNCA HTML.

   Título e nota são texto que o usuário digita. Num corpo HTML interpolado sem
   escapar, `<img src=x onerror=...>` e um `<a>` para outro domínio viajam
   dentro de um e-mail que parece ser do sistema.
   ========================================================================== */
{
  montar({ fila: [avisoBase(0, { titulo: '<img src=x onerror=alert(1)> <a href="https://malicioso.test">clique</a>' })] });
  await chamar({ headers: comToken });
  const e = emailDe(cena.emails[0]);
  ok(typeof e.text === 'string' && e.text.length > 0, 'o e-mail vai com `text`', JSON.stringify(Object.keys(e)));
  ok(!('html' in e), 'e o e-mail NÃO vai com `html`', JSON.stringify(Object.keys(e)));
  ok(Array.isArray(e.to) ? e.to.length === 1 : typeof e.to === 'string',
     'um aviso é um destinatário (ninguém vê o e-mail de ninguém)', JSON.stringify(e.to));
  ok(String(cena.emails[0].autorizacao || '').includes(CHAVE_RESEND),
     'e a chave do Resend vai no cabeçalho da chamada ao provedor');
  /* sem teto, um Resend pendurado segura a varredura até o timeout da Vercel e
     os avisos seguintes nem chegam a ser tentados */
  ok(cena.emails[0].sinal instanceof AbortSignal,
     'a chamada ao provedor tem prazo para desistir', String(cena.emails[0].sinal));
}

/* ==========================================================================
   6 · TÍTULO COM CRLF NÃO GANHA LINHA NENHUMA.

   Medido: `dem_abrir` aceita "Arte do culto\r\nBcc: espiao@malicioso.com" e o
   aviso saía com assunto de duas linhas e uma linha forjada dentro do corpo,
   com cara de campo do sistema. `demandas.limpo()` só apara as PONTAS.
   ========================================================================== */
{
  const SUJO = 'Arte do culto\r\nBcc: espiao@malicioso.com';
  montar({ fila: [avisoBase(0, { titulo: 'Arte do culto' })] });
  await chamar({ headers: comToken });
  const limpo = textoDe(cena.emails[0]);

  const ataques = [
    ['título com CRLF', { titulo: SUJO }],
    ['título com LF só', { titulo: 'Arte do culto\nBcc: espiao@malicioso.com' }],
    ['título com CR só', { titulo: 'Arte do culto\rBcc: espiao@malicioso.com' }],
    ['título com TAB', { titulo: 'Arte do culto\tBcc: espiao@malicioso.com' }],
    ['título com U+2028', { titulo: 'Arte do culto\u2028Bcc: espiao@malicioso.com' }],
    ['título com NBSP', { titulo: 'Arte do culto\u00a0Bcc: espiao@malicioso.com' }],
    ['quem abriu com CRLF', { abriu: 'Monik\r\nPrazo: ontem' }],
    ['setor com CRLF', { setor: 'Comunicação\r\nPrioridade: urgente' }],
    ['categoria com CRLF', { categoria: 'Arte\r\nlinha forjada' }],
    ['grupo com CRLF', { grupo: 'Comunicação\r\nlinha forjada' }],
    ['nota com CRLF', { tipo: 'informacao', nota: 'Qual tamanho?\r\nPrazo: ontem' }],
    ['estado com CRLF', { tipo: 'status', estado: 'Em execução\r\nlinha forjada' }],
  ];

  for (const [rot, extra] of ataques) {
    montar({ fila: [avisoBase(0, extra)] });
    await chamar({ headers: comToken });
    const corpo = textoDe(cena.emails[0]);
    const assunto = assuntoDe(cena.emails[0]);

    ok(cena.emails.length === 1, `${rot}: o e-mail sai (não derruba a rota)`);
    ok(!/[\r\n]/.test(assunto), `${rot}: o assunto continua de UMA linha`, JSON.stringify(assunto));
    ok(!/[\r\u2028\u2029]/.test(corpo), `${rot}: o corpo não ganha quebra estranha`, JSON.stringify(corpo));

    /* o corpo do tipo `nova` tem que ter exatamente o mesmo número de linhas
       do corpo limpo: é assim que se mede "não ganhou linha forjada" sem
       depender da redação do texto */
    if (!extra.tipo) {
      ok(corpo.split('\n').length === limpo.split('\n').length,
         `${rot}: o corpo não ganha linha nenhuma`,
         `limpo=${limpo.split('\n').length} sujo=${corpo.split('\n').length}`);
    }
    ok(!corpo.split('\n').some(l => /^(Bcc|Prazo|Prioridade|linha forjada)/.test(l.trim()) && l.includes('forjada')),
       `${rot}: nenhuma linha forjada aparece sozinha`, JSON.stringify(corpo));
  }

  /* e o caso nomeado, com a medida exata */
  montar({ fila: [avisoBase(0, { titulo: SUJO })] });
  await chamar({ headers: comToken });
  const corpo = textoDe(cena.emails[0]);
  ok(!corpo.split('\n').some(l => l.trim().startsWith('Bcc:')),
     'nenhuma linha do corpo COMEÇA com o campo forjado', JSON.stringify(corpo));
  ok(corpo.includes('Bcc: espiao@malicioso.com'),
     'e o texto não é engolido em silêncio: ele continua lá, na linha do título');
  ok(!assuntoDe(cena.emails[0]).includes('\n'), 'e o assunto é uma linha só');
}

/* ==========================================================================
   7 · TRÊS TIPOS, TRÊS TEXTOS. Cada um diz o que a pessoa faz AGORA.
   ========================================================================== */
{
  const fila = [
    avisoBase(0, { tipo: 'nova', numero: 41 }),
    avisoBase(1, { tipo: 'status', numero: 42, estado: 'Em execução' }),
    avisoBase(2, { tipo: 'informacao', numero: 43, nota: 'Qual o tamanho do banner?' }),
  ];
  montar({ fila });
  await chamar({ headers: comToken });
  ok(cena.emails.length === 3, 'os três avisos saem', `saíram ${cena.emails.length}`);

  const corpos = cena.emails.map(textoDe);
  const assuntos = cena.emails.map(assuntoDe);

  for (let i = 0; i < 3; i++) {
    const n = 41 + i;
    ok(corpos[i].includes(`#${n}`), `o texto do tipo ${fila[i].tipo} cita o número da demanda`, corpos[i]);
    ok(corpos[i].includes(`${SITE}/demandas/d/${n}`), `o texto do tipo ${fila[i].tipo} traz o link da ficha`, corpos[i]);
    ok(assuntos[i].includes(`#${n}`), `o assunto do tipo ${fila[i].tipo} cita o número`, assuntos[i]);
  }

  ok(new Set(corpos).size === 3, 'os três textos são diferentes entre si',
     corpos.map(c => c.split('\n')[0]).join(' || '));
  ok(new Set(assuntos).size === 3, 'os três assuntos são diferentes entre si', assuntos.join(' || '));

  /* e cada um fala com a pessoa certa: `status` e `informacao` são para quem
     PEDIU, e por isso dizem "a sua demanda"; `nova` é para quem ATENDE */
  ok(/sua demanda/i.test(corpos[1]), 'o de status fala com quem pediu', corpos[1]);
  ok(/sua demanda/i.test(corpos[2]), 'o de informação fala com quem pediu', corpos[2]);
  ok(!/sua demanda/i.test(corpos[0]), 'o de demanda nova NÃO fala "a sua demanda"', corpos[0]);
  ok(corpos[1].includes('Em execução'), 'o de status diz o estado novo', corpos[1]);
  ok(corpos[2].includes('Qual o tamanho do banner?'),
     'o de informação traz a pergunta no corpo (é ele que destrava)', corpos[2]);
  ok(!corpos[0].includes('Qual o tamanho do banner?'), 'e a pergunta não vaza para o aviso de demanda nova');

  /* 24/09/2026 (auditoria R13): "está agora em Em execução" repetia a
     preposição, e a concluída dizia "não precisa fazer nada" enquanto o
     Início pedia "Confirmar" */
  ok(/agora está: Em execução\./.test(corpos[1]) && !/em Em /.test(corpos[1] + assuntos[1]),
     'o estado vem sem "em Em"', corpos[1].split('\n')[0] + ' || ' + assuntos[1]);
  montar({ fila: [avisoBase(0, { tipo: 'status', numero: 44, estado: 'Concluída' })] });
  await chamar({ headers: comToken });
  ok(/confirme na ficha/.test(textoDe(cena.emails[0])) && !/não precisa fazer nada/.test(textoDe(cena.emails[0])),
     'a concluída pede a confirmação, e não diz que não há nada a fazer', textoDe(cena.emails[0]));

  /* o portão continua sendo dito, senão quem atende abre a ficha, encontra
     todos os botões fora, e conclui que o sistema quebrou */
  montar({ fila: [avisoBase(0, { falta_aprovacao: true })] });
  await chamar({ headers: comToken });
  ok(/aprova/i.test(textoDe(cena.emails[0])),
     'demanda que nasce esperando aprovação avisa isso no texto', textoDe(cena.emails[0]));

  /* prazo que não é data não vira "Invalid Date" dentro do e-mail */
  for (const prazo of [null, '', 'amanhã', '0000-00-00']) {
    montar({ fila: [avisoBase(0, { prazo })] });
    await chamar({ headers: comToken });
    ok(!/Invalid Date/.test(textoDe(cena.emails[0])),
       `prazo ${JSON.stringify(prazo)} não vira "Invalid Date" no e-mail`, textoDe(cena.emails[0]));
  }
}

/* ==========================================================================
   8 · LIXO NA ENTRADA NÃO DERRUBA A ROTA.

   Uma rota de API que estoura devolve 500 com pilha de execução, e pilha de
   execução conta caminho de arquivo e nome de função para quem mandou o lixo.
   ========================================================================== */
{
  const lixos = [
    ['corpo que não é JSON', '{{{ isto não fecha'],
    ['corpo vazio', ''],
    ['corpo que é um número', '42'],
    ['corpo que é um array', '[]'],
    ['corpo gigante', 'x'.repeat(50_000)],
  ];
  for (const [rot, body] of lixos) {
    montar({ fila: [avisoBase(0)] });
    let r = null, estourou = null;
    try {
      r = await chamar({ headers: { ...comToken, 'content-type': 'application/json' }, body });
    } catch (e) { estourou = e; }
    ok(!estourou, `${rot}: a rota não estoura`, String(estourou?.message || ''));
    ok(r?.status === 200, `${rot}: e responde normalmente (o corpo é ignorado)`, `veio ${r?.status}`);
  }

  /* método que não é o dela: o handler não olha `req.method`, e não pode
     passar a olhar de um jeito que estoure */
  for (const metodo of ['DELETE', 'PUT', 'PATCH']) {
    montar({ fila: [avisoBase(0)] });
    let r = null, estourou = null;
    try { r = await chamar({ metodo, headers: comToken }); } catch (e) { estourou = e; }
    ok(!estourou, `método ${metodo} não derruba a rota`, String(estourou?.message || ''));
    ok(r?.status === 200 || r?.status === 401, `método ${metodo} responde`, `veio ${r?.status}`);
  }
  /* e o Next só responde 405 sozinho se estes verbos NÃO forem exportados */
  for (const v of ['PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']) {
    ok(typeof rota[v] === 'undefined', `a rota não exporta ${v} (o Next responde 405 sozinho)`);
  }
  ok(typeof rota.GET === 'function' && typeof rota.POST === 'function',
     'e exporta GET (o cron) e POST (a tela)');

  /* fila que o banco devolve torta não pode derrubar a varredura */
  for (const [rot, fila] of [
    ['fila nula', null],
    ['fila que não é lista', { erro: 'oi' }],
    ['linha nula dentro da fila', [null]],
    ['linha sem aviso_id', [{ numero: 9, titulo: 'x', email: EMAILS[0] }]],
    ['linha sem número', [avisoBase(0, { numero: null })]],
    ['tipo que não existe', [avisoBase(0, { tipo: 'invencao' })]],
  ]) {
    montar({ fila });
    let r = null, estourou = null;
    try { r = await chamar({ headers: comToken }); } catch (e) { estourou = e; }
    ok(!estourou, `${rot}: não derruba a varredura`, String(estourou?.message || ''));
    ok(r?.status === 200, `${rot}: responde 200`, `veio ${r?.status}`);
  }

  /* e quando o banco reclama, a rota diz 500 em vez de fingir que avisou */
  montar({ fila: [avisoBase(0)], semFuncao: ['dem_avisos_pendentes'] });
  const r = await chamar({ headers: comToken });
  ok(r.status === 500, 'fila que o banco recusa vira 500, não 200 mudo', `veio ${r.status}`);
  ok(cena.emails.length === 0, 'e nenhum e-mail sai');
}

/* ==========================================================================
   O REMETENTE — 22/09/2026. `onboarding@resend.dev` só entrega para o dono
   da conta Resend. O remetente de verdade é o domínio da igreja, e a volta
   para o de teste acontece só quando a Resend diz que o domínio não está
   verificado. As frases abaixo são as da Resend.
   ========================================================================== */
{
  const de = (e) => String(emailDe(e).from ?? '');
  const NAO_VERIFICADO = { status: 403,
    message: 'The avisos.guiaservir.com domain is not verified. Please, add and verify your domain on https://resend.com/domains' };

  montar({ fila: [avisoBase(0)] });
  await chamar({ headers: comToken });
  ok(cena.emails.length === 1, 'com o domínio aceito, sai UM e-mail', `saíram ${cena.emails.length}`);
  ok(/<demandas@avisos\.guiaservir\.com>$/.test(de(cena.emails[0] || {})),
    'e ele sai do domínio da igreja, não do endereço de teste', de(cena.emails[0] || {}));
  ok(!/resend\.dev/.test(de(cena.emails[0] || {})), 'e onboarding@resend.dev não é o primeiro remetente');

  montar({ fila: [avisoBase(0)], resend: (n) => (n === 1 ? NAO_VERIFICADO : 200) });
  await chamar({ headers: comToken });
  ok(cena.emails.length === 2, 'domínio ainda não verificado: tenta de novo, uma vez', `saíram ${cena.emails.length}`);
  ok(/onboarding@resend\.dev/.test(de(cena.emails[1] || {})),
    'e a segunda tentativa usa o endereço de teste', de(cena.emails[1] || {}));
  ok(cena.rpcs.some(c => c.fn === 'dem_aviso_enviado'),
    'e o aviso conta como enviado quando a segunda passa',
    cena.rpcs.map(c => c.fn).join(' '));

  for (const [rot, resend] of [
    ['chave errada (401)', () => 401],
    ['limite da Resend (429)', () => 429],
    ['403 por outro motivo', () => ({ status: 403, message: 'You do not have access to this resource' })],
  ]) {
    montar({ fila: [avisoBase(0)], resend });
    await chamar({ headers: comToken });
    ok(cena.emails.length === 1, `${rot}: não ganha segunda tentativa`, `saíram ${cena.emails.length}`);
  }

  montar({ fila: [avisoBase(0)], resend: (n) => (n === 1 ? NAO_VERIFICADO : 403) });
  await chamar({ headers: comToken });
  ok(cena.rpcs.some(c => c.fn === 'dem_aviso_falhou'),
    'se as duas recusam, o aviso volta para a fila em vez de sumir',
    cena.rpcs.map(c => c.fn).join(' '));
}

console.__real.log(falhas
  ? `\ndemandas-avisar: ${falhas} falha(s) em ${feitas}`
  : `\ndemandas-avisar: ${feitas}/${feitas} ok`);
process.exit(falhas ? 1 : 0);
