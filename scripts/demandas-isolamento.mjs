/* O ISOLAMENTO PROVADO DE FORA PARA DENTRO · migração 94, 22/09/2026.

   O pedido, com as palavras do Arthur: "Mesmo que alguém tente manipular:
   URL; número da demanda; ID; parâmetros; chamadas de API; ele não pode
   acessar uma demanda que não lhe pertence." E: "Teste deliberadamente:
   Usuário A tentando acessar a demanda do Usuário B. Profissional do Setor A
   tentando acessar demanda restrita do Setor B. Usuário comum tentando
   acessar área administrativa. Usuário tentando alterar seu próprio papel
   para admin. Tudo deve ser bloqueado no backend."

   A conferência da 94 (o bloco `$conf$` da migração) e a seção 23 de
   `demandas-banco.test.sql` já provam isso DENTRO do banco, chamando as
   funções como superusuário. Este arquivo prova pelo lado de FORA, do jeito
   que alguém chegaria:

     · pela API, como o navegador fala com o Supabase (`POST /rest/v1/rpc`),
       com o papel `anon` do PostgREST (a ponte troca de papel a cada
       chamada), trocando o número da demanda, o id da pessoa e os parâmetros
       por valores que a tela nunca manda;
     · pelo navegador, digitando na barra de endereço a ficha dos outros e a
       área da administração.

   Nada aqui confia na tela: a pergunta é sempre o que o SERVIDOR devolveu.
   Quando a tela aparece, é para provar que ela não mostra o que o servidor
   recusou.

   As pessoas são as da semente (`demandas-celular-semear.sql`):

     Pedro ... membro do ministério de eventos, abriu doze demandas
     Rafael .. membro do MESMO ministério; Pedro o incluiu só na primeira
     Luciana . líder do ministério de eventos
     Carla ... membro, cadastrada num setor que ATENDE (comunicação), sem
               papel de equipe; pediu para ser equipe
     Maria ... equipe da comunicação
     José .... equipe de compras
     Ana ..... equipe da manutenção (até a 95, gestora de tudo)
     Arthur .. administração, a única (96)

   DESDE A 96 NÃO HÁ GESTÃO. Bruno, o gestor só da comunicação, saiu da
   semente com o papel; a seção H prova de fora o que a 96 prometeu: uma
   administração só, nenhuma gestão, e o panorama só para ela.

   Precisa de `scripts/demandas-celular-subir.sh` (ponte na 54321, app na
   3400). Roda por último em `npm run test:demandas`, porque cria dados. */

import { chromium } from 'playwright';
import { existsSync, readdirSync } from 'node:fs';

const PONTE = process.env.PONTE || 'http://127.0.0.1:54321';
const BASE = process.env.BASE || 'http://127.0.0.1:3400';

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => {
  feitas++;
  if (!c) { falhas++; console.log('  FALHOU:', rot, extra ? `· ${String(extra).slice(0, 220)}` : ''); }
};
const secao = t => console.log(`\n${t}`);

/* ------------------------------------------------------------ a API crua */
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwtDe(email) {
  const agora = Math.floor(Date.now() / 1000);
  const sub = '00000000-0000-4000-8000-' + Buffer.from(email).toString('hex').slice(0, 12).padEnd(12, '0');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, email, role: 'authenticated',
    aud: 'authenticated', iat: agora, exp: agora + 3600 })}.teste`;
}
async function rpc(fn, args = {}, jwt = null) {
  const r = await fetch(`${PONTE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: 'chave-de-teste',
               authorization: `Bearer ${jwt || 'chave-de-teste'}` },
    body: JSON.stringify(args),
  });
  const txt = await r.text();
  let corpo = null;
  try { corpo = JSON.parse(txt); } catch { /* fica o texto cru */ }
  return { http: r.status, txt, ...(corpo && typeof corpo === 'object' && !Array.isArray(corpo) ? corpo : {}) };
}
const recusou = (r, codigo) => r.ok === false && (!codigo || r.erro === codigo);
const numerosDe = r => (r.itens || []).map(i => i.numero);

/* ---------------------------------------------------------------- pessoas */
const TOK = {
  arthur: 'tok-admin', maria: 'tok-comunica', jose: 'tok-compras', ana: 'tok-manutencao',
  pedro: 'tok-pede', luciana: 'tok-lider', rafael: 'tok-colega', carla: 'tok-pedido',
};
const eu = {};
const RODADA = Date.now().toString(36);
const LETRAS = [...Date.now().toString(26)].map(c => 'abcdefghijklmnopqrstuvwxyz'[parseInt(c, 26)]).join('');
const tel = () => '219' + String(Math.floor(1e7 + Math.random() * 9e7));
const TEL_NOVO = tel(), TEL_NOVO2 = tel(), TEL_SAI = tel();

try {
  secao('0 · controle positivo: cada um entra pelo próprio link');
  for (const [k, tok] of Object.entries(TOK)) {
    const r = await rpc('dem_quem_sou', { p_token: tok });
    ok(r.ok === true, `${k} entra pelo próprio link`, r.txt);
    eu[k] = r;
  }

  /* o mapa da base, pelos olhos de quem vê tudo */
  const tudo = await rpc('dem_lista', { p_token: TOK.arthur, p_f: { aba: 'tudo' } });
  ok(tudo.ok === true && tudo.itens.length >= 13, 'o administrador vê a base inteira', tudo.txt);
  const setorDe = new Map(tudo.itens.map(i => [i.numero, i.responsavel_setor]));
  const tituloDe = new Map(tudo.itens.map(i => [i.numero, i.titulo]));
  const doPedro = numerosDe(await rpc('dem_lista', { p_token: TOK.pedro, p_f: { aba: 'minhas' } }));
  const doRafael = numerosDe(await rpc('dem_lista', { p_token: TOK.rafael, p_f: { aba: 'minhas' } }));
  const acompanha = numerosDe(await rpc('dem_lista', { p_token: TOK.rafael, p_f: { aba: 'participo' } }));
  ok(doPedro.length === 12, 'Pedro abriu as doze da semente', doPedro.join(','));
  ok(doRafael.length === 1, 'Rafael abriu uma', doRafael.join(','));
  ok(acompanha.length === 1 && doPedro.includes(acompanha[0]), 'Rafael acompanha uma das de Pedro', acompanha.join(','));
  const n1 = acompanha[0];
  const alheiasDoRafael = doPedro.filter(n => n !== n1);
  /* só as de Pedro (ministério de eventos): uma demanda que a COMUNICAÇÃO
     pediu à manutenção é, por desenho, vista pela gestão da comunicação, e
     não serve de alvo para "outro setor". Achado rodando este arquivo duas
     vezes seguidas: a demanda que Carla abre na seção B entrava aqui na
     segunda volta e o teste acusava o sistema por uma regra certa. */
  const porSetor = nome => tudo.itens.filter(i => new RegExp(nome, 'i').test(i.responsavel_setor || ''))
    .map(i => i.numero).filter(n => doPedro.includes(n));
  const deCompras = porSetor('compra');
  const deManutencao = porSetor('manuten');
  const daComunicacao = tudo.itens.filter(i => /comunica/i.test(i.responsavel_setor || '')).map(i => i.numero);
  const doCarla = () => rpc('dem_lista', { p_token: TOK.carla, p_f: { aba: 'minhas' } }).then(numerosDe);
  ok(deCompras.length > 0 && deManutencao.length > 0 && daComunicacao.length > 0,
     'a semente tem demanda em compras, manutenção e comunicação',
     `${deCompras} | ${deManutencao} | ${daComunicacao}`);
  const bases = await rpc('dem_bases', { p_token: TOK.arthur });
  const setorId = slug => (bases.setores || []).find(s => new RegExp(slug, 'i').test(`${s.slug || ''} ${s.nome}`))?.id;
  const idCompras = setorId('compra'), idComunicacao = setorId('comunica');
  ok(!!idCompras && !!idComunicacao, 'os ids dos setores', JSON.stringify(bases).slice(0, 200));
  const pessoas = await rpc('dem_pessoas', { p_token: TOK.arthur });
  const idDe = nome => (pessoas.membros || []).find(m => m.nome.startsWith(nome))?.id;
  const idCarla = idDe('Carla'), idArthur = idDe('Arthur'), idPedro = idDe('Pedro');
  ok(!!idCarla && !!idArthur && !!idPedro, 'os ids das pessoas', '');

  /* ====================================================================
     A · USUÁRIO A TENTANDO ACESSAR A DEMANDA DO USUÁRIO B

     Rafael e Pedro servem no MESMO ministério. Até a 93 isso bastava: o
     `pode_ver` antigo abria tudo que o setor do solicitante tinha pedido. */
  secao('A · Rafael (membro) contra as demandas de Pedro, do mesmo ministério');
  for (const n of alheiasDoRafael) {
    const r = await rpc('dem_ver', { p_token: TOK.rafael, p_numero: n });
    ok(recusou(r, 'NAO_EXISTE'), `Rafael abre #${n} de Pedro pelo número: não existe`, r.txt);
    ok(!r.txt.includes(tituloDe.get(n)), `e a resposta não traz o título de #${n}`);
  }
  {
    const r = await rpc('dem_ver', { p_token: TOK.rafael, p_numero: n1 });
    ok(r.ok === true, `controle: Rafael abre #${n1}, em que foi incluído`, r.txt);
  }
  const permitidasRafael = new Set([...doRafael, n1]);
  const FILTROS = [{}, { abertas: true }, { status: 'concluida' }, { atrasadas: true }, { urgentes: true },
                   { setor: idComunicacao }, { setor: idCompras }, { busca: 'arte' }, { busca: String(doPedro[1]) }];
  const ABAS = ['tudo', 'minhas', 'setor', 'comigo', 'participo', 'ministerio', 'responder', 'agir', 'inventada'];
  let listasRafael = 0, vazouRafael = [];
  for (const aba of ABAS) {
    for (const f of FILTROS) {
      const r = await rpc('dem_lista', { p_token: TOK.rafael, p_f: { aba, ...f } });
      listasRafael++;
      for (const n of numerosDe(r)) if (!permitidasRafael.has(n)) vazouRafael.push(`${aba}:${n}`);
    }
  }
  ok(vazouRafael.length === 0,
     `nenhuma das ${listasRafael} combinações de aba e filtro devolve a Rafael o que não é dele`, vazouRafael.join(' '));
  {
    const n = alheiasDoRafael[0];
    const c = await rpc('dem_mover', { p_token: TOK.rafael, p_numero: n, p_acao: 'comentar',
                                       p_d: { texto: 'INVASOR comentou aqui' } });
    ok(recusou(c, 'NAO_EXISTE'), `Rafael comenta em #${n} de Pedro: não existe`, c.txt);
    const a = await rpc('dem_mover', { p_token: TOK.rafael, p_numero: n, p_acao: 'anexar',
                                       p_d: { nome: 'x', url: 'https://exemplo.org/invasor' } });
    ok(recusou(a, 'NAO_EXISTE'), `Rafael anexa em #${n} de Pedro: não existe`, a.txt);
    const v = await rpc('dem_mover', { p_token: TOK.rafael, p_numero: n, p_acao: 'validar', p_d: {} });
    ok(recusou(v, 'NAO_EXISTE'), `Rafael confirma a entrega de #${n} de Pedro: não existe`, v.txt);
    const k = await rpc('dem_mover', { p_token: TOK.rafael, p_numero: n, p_acao: 'cancelar', p_d: { texto: 'x' } });
    ok(recusou(k, 'NAO_EXISTE'), `Rafael cancela #${n} de Pedro: não existe`, k.txt);
    const ficha = await rpc('dem_ver', { p_token: TOK.pedro, p_numero: n });
    ok(ficha.ok && !ficha.txt.includes('INVASOR') && !ficha.txt.includes('exemplo.org/invasor'),
       `e a ficha de #${n}, vista por Pedro, não tem rastro da tentativa`);
  }
  {
    /* participante vê, mas não manda: incluir outra pessoa e cancelar são de
       quem pediu ou de quem atende */
    const i = await rpc('dem_mover', { p_token: TOK.rafael, p_numero: n1, p_acao: 'incluir',
                                       p_d: { quem: 'carla@exemplo.org' } });
    ok(recusou(i, 'SEM_PERMISSAO'), `Rafael, participante, inclui outra pessoa em #${n1}: recusado`, i.txt);
    const k = await rpc('dem_mover', { p_token: TOK.rafael, p_numero: n1, p_acao: 'cancelar', p_d: { texto: 'x' } });
    ok(recusou(k, 'SEM_PERMISSAO'), `Rafael, participante, cancela #${n1}: SEM_PERMISSAO`, k.txt);
  }
  {
    const av = await rpc('dem_avisos', { p_token: TOK.rafael, p_marcar: false });
    const fora = (av.itens || []).filter(a => !permitidasRafael.has(a.numero)).map(a => a.numero);
    ok(av.ok === true && fora.length === 0, 'os avisos de Rafael só falam do que é dele', fora.join(','));
    const po = await rpc('dem_portal', { p_token: TOK.rafael });
    const pfora = (po.precisa || []).filter(d => !permitidasRafael.has(d.numero)).map(d => d.numero);
    ok(po.ok === true && pfora.length === 0, 'o portal de Rafael só lista o que é dele', pfora.join(','));
    ok(po.ok === true && !doPedro.filter(n => n !== n1).some(n => po.txt.includes(tituloDe.get(n))),
       'e não cita título nenhum das de Pedro');
  }
  {
    const r = await rpc('dem_ver', { p_token: TOK.pedro, p_numero: doRafael[0] });
    ok(recusou(r, 'NAO_EXISTE'), `na volta: Pedro abre #${doRafael[0]} de Rafael: não existe`, r.txt);
  }
  {
    /* quem sai deixa de ver, na hora */
    const t = await rpc('dem_mover', { p_token: TOK.pedro, p_numero: n1, p_acao: 'tirar',
                                       p_d: { membro_id: eu.rafael.id } });
    ok(t.ok === true, `Pedro tira Rafael de #${n1}`, t.txt);
    const r = await rpc('dem_ver', { p_token: TOK.rafael, p_numero: n1 });
    ok(recusou(r, 'NAO_EXISTE'), `e Rafael deixa de ver #${n1} na mesma hora`, r.txt);
    const i = await rpc('dem_mover', { p_token: TOK.pedro, p_numero: n1, p_acao: 'incluir',
                                       p_d: { quem: '(21) 99999-0007' } });
    ok(i.ok === true, `Pedro inclui Rafael de volta pelo WhatsApp, em outro formato`, i.txt);
  }

  /* ====================================================================
     B · PROFISSIONAL DO SETOR A TENTANDO ACESSAR DEMANDA DO SETOR B */
  secao('B · entre setores: Maria (comunicação), Ana (manutenção), Carla (setor sem papel)');
  for (const n of [...deCompras, ...deManutencao]) {
    const r = await rpc('dem_ver', { p_token: TOK.maria, p_numero: n });
    ok(recusou(r, 'NAO_EXISTE'), `Maria abre #${n} (${setorDe.get(n)}): não existe`, r.txt);
  }
  for (const n of [...deCompras, ...daComunicacao]) {
    const g = await rpc('dem_ver', { p_token: TOK.ana, p_numero: n });
    ok(recusou(g, 'NAO_EXISTE'), `Ana, equipe da manutenção, abre #${n} (${setorDe.get(n)}): não existe`, g.txt);
  }
  {
    const n = deCompras[0];
    for (const [acao, d] of [['assumir', {}], ['comentar', { texto: 'x' }], ['aprovar', {}],
                             ['redirecionar', { setor: idComunicacao }], ['concluir', { texto: 'x' }]]) {
      const r = await rpc('dem_mover', { p_token: TOK.maria, p_numero: n, p_acao: acao, p_d: d });
      ok(recusou(r, 'NAO_EXISTE'), `Maria tenta "${acao}" em #${n} de compras: não existe`, r.txt);
      const g = await rpc('dem_mover', { p_token: TOK.ana, p_numero: n, p_acao: acao, p_d: d });
      ok(recusou(g, 'NAO_EXISTE'), `Ana tenta "${acao}" em #${n} de compras: não existe`, g.txt);
    }
  }
  /* Maria vê a fila da comunicação; Ana, a da manutenção. Nada além disso
     para nenhuma das duas (até a 95 Ana era a gestora de tudo e via o banco
     inteiro: a 96 a trouxe para a equipe) */
  /* a fila inteira da manutenção, e não só as de Pedro (`deManutencao` é a
     lista de ALVOS, filtrada por Pedro): a que Carla abre na seção B, numa
     rodada anterior, é da manutenção e é da Ana ver */
  const daManutencao = tudo.itens.filter(i => /manuten/i.test(i.responsavel_setor || '')).map(i => i.numero);
  for (const [quem, tok, pode] of [['Maria', TOK.maria, new Set(daComunicacao)], ['Ana', TOK.ana, new Set(daManutencao)]]) {
    let vaz = [], n = 0;
    for (const aba of ABAS) {
      for (const f of FILTROS) {
        const r = await rpc('dem_lista', { p_token: tok, p_f: { aba, ...f } });
        n++;
        for (const i of r.itens || []) if (!pode.has(i.numero)) vaz.push(`${aba}:${i.numero}`);
      }
    }
    ok(vaz.length === 0, `nenhuma das ${n} combinações de aba e filtro devolve a ${quem} demanda fora do escopo`, vaz.join(' '));
  }
  {
    const r = await rpc('dem_numeros', { p_token: TOK.maria });
    ok(r.ok === true, 'controle: Maria vê os números', r.txt);
    const setores = (r.numeros?.por_setor || []).map(s => s.nome);
    ok(setores.every(s => /comunica|eventos/i.test(s)),
       'e os números dela só contam o que ela vê (comunicação, e quem pediu à comunicação)', setores.join(', '));
    ok(r.numeros?.total === daComunicacao.length,
       `total dos números de Maria = demandas da comunicação (${daComunicacao.length})`, String(r.numeros?.total));
  }
  {
    /* setor sem papel não é credencial: Carla está na comunicação e não atende */
    for (const n of daComunicacao) {
      const r = await rpc('dem_ver', { p_token: TOK.carla, p_numero: n });
      ok(recusou(r, 'NAO_EXISTE'), `Carla (membro da comunicação) abre #${n} da fila da comunicação: não existe`, r.txt);
    }
    const l = await rpc('dem_lista', { p_token: TOK.carla, p_f: { aba: 'setor' } });
    ok(l.ok === true && (l.itens || []).length === 0, 'a aba "setor" de Carla vem vazia', l.txt);
    const nu = await rpc('dem_numeros', { p_token: TOK.carla });
    ok(recusou(nu, 'SEM_PERMISSAO'), 'os números não abrem para Carla', nu.txt);
    const po = await rpc('dem_portal', { p_token: TOK.carla });
    ok(po.ok === true && !po.n?.setor_abertas && !po.n?.fila, 'o portal de Carla não conta fila de setor', JSON.stringify(po.n));
  }
  {
    /* a líder vê o que o ministério DELA pediu, e nada de outro ministério */
    const c = await rpc('dem_abrir', { p_token: TOK.carla, p_d: {
      titulo: 'Pedido da comunicacao que a lider de eventos nao pode ver',
      descricao: 'Troca da lampada do estudio de fotografia.', objetivo: 'Estudio com luz.',
      local: 'Estudio', publico: 'Equipe', prioridade: 'normal',
      categoria_id: (bases.categorias || []).find(x => /el[eé]trico/i.test(x.nome))?.id,
      prazo: new Date(Date.now() + 9 * 864e5).toISOString().slice(0, 10) } });
    ok(c.ok === true, 'Carla abre uma demanda (de outro ministério)', c.txt);
    const nC = c.numero;
    const l = await rpc('dem_ver', { p_token: TOK.luciana, p_numero: nC });
    ok(recusou(l, 'NAO_EXISTE'), `Luciana, líder de eventos, abre #${nC} da comunicação: não existe`, l.txt);
    const r = await rpc('dem_ver', { p_token: TOK.rafael, p_numero: nC });
    ok(recusou(r, 'NAO_EXISTE'), `Rafael abre #${nC} de Carla: não existe`, r.txt);
    const m = await rpc('dem_ver', { p_token: TOK.maria, p_numero: nC });
    ok(recusou(m, 'NAO_EXISTE'), `Maria (equipe da comunicação) abre #${nC}, que vai para a manutenção: não existe`, m.txt);
    const o = await rpc('dem_ver', { p_token: TOK.luciana, p_numero: doPedro[0] });
    ok(o.ok === true, 'controle: Luciana vê o que o ministério dela pediu', o.txt);
    const lv = numerosDe(await rpc('dem_lista', { p_token: TOK.luciana, p_f: { aba: 'ministerio' } }));
    ok(!lv.includes(nC) && lv.includes(doPedro[0]), 'e a aba "Ministério" dela não traz o pedido de Carla', lv.join(','));
  }

  /* ====================================================================
     C · USUÁRIO COMUM TENTANDO ACESSAR A ÁREA ADMINISTRATIVA */
  secao('C · a administração pela API, com o token de quem não administra');
  for (const [quem, tok] of [['Pedro', TOK.pedro], ['Maria', TOK.maria], ['Luciana', TOK.luciana],
                             ['Ana (equipe, ex-gestora de tudo)', TOK.ana], ['Carla', TOK.carla]]) {
    const p = await rpc('dem_pessoas', { p_token: tok });
    ok(recusou(p, 'SO_ADMIN') && !p.txt.includes('tok-'), `${quem} lista as pessoas: SO_ADMIN`, p.txt);
    const f = await rpc('dem_pessoa', { p_token: tok, p_id: idCarla });
    ok(recusou(f, 'SO_ADMIN') && !f.txt.includes('Carla'), `${quem} abre a ficha de Carla pelo id: SO_ADMIN`, f.txt);
    for (const [o, d] of [['membro', { id: idCarla, papel: 'admin' }], ['membro', { id: idArthur, ativo: false }],
                          ['setor', { nome: 'Setor do invasor' }], ['categoria', { nome: 'x', setor_id: idCompras }],
                          ['link', { id: idArthur }], ['pedido', { id: idCarla, decisao: 'aceitar' }]]) {
      const r = await rpc('dem_ajustar', { p_token: tok, p_o_que: o, p_d: d });
      ok(recusou(r, 'SO_ADMIN'), `${quem} tenta dem_ajustar("${o}"): SO_ADMIN`, r.txt);
    }
  }
  {
    const b = await rpc('dem_bases', { p_token: TOK.pedro });
    ok(b.ok === true && !('membros' in b) && !/\b55\d{10,11}\b/.test(b.txt) && !b.txt.includes('tok-'),
       'as bases que o membro recebe não trazem pessoas, telefones nem links', b.txt.slice(0, 160));
    const d = await rpc('dem_ver', { p_token: TOK.pedro, p_numero: doPedro[3] });
    ok(d.ok === true && !d.txt.includes('tok-'), 'a ficha que o membro abre não traz o link pessoal de ninguém');
  }

  /* ====================================================================
     D · USUÁRIO TENTANDO ALTERAR O PRÓPRIO PAPEL, SETOR OU ESCOPO */
  secao('D · o próprio papel, setor e escopo');
  for (const d of [{ papel: 'admin' }, { setor_id: idCompras }, { ativo: false }, { escopo_total: true },
                   { token: 'tok-meu-novo' }, { auth_email: 'outro@exemplo.org' }, { email: 'outro@exemplo.org' },
                   { id: idArthur }, { nome: 'Pedro Admin', papel: 'admin' }]) {
    const r = await rpc('dem_perfil', { p_token: TOK.pedro, p_d: d });
    ok(recusou(r, 'CAMPO_NAO_PERMITIDO'), `Pedro manda ${JSON.stringify(d)} no próprio perfil: recusado inteiro`, r.txt);
  }
  {
    const q = await rpc('dem_quem_sou', { p_token: TOK.pedro });
    ok(q.papel === 'solicitante' && q.nome.startsWith('Pedro Henrique') && q.setor_id === eu.pedro.setor_id,
       'e Pedro continua membro, com o mesmo nome e o mesmo setor', `${q.papel} ${q.nome} ${q.setor_id}`);
    for (const p of ['admin', 'gestor']) {
      const r = await rpc('dem_perfil', { p_token: TOK.pedro, p_d: { papel_pedido: p } });
      ok(recusou(r, 'PEDIDO_INVALIDO'), `Pedro pede o papel "${p}" pelo perfil: não se pede`, r.txt);
    }
    const g = await rpc('dem_ajustar', { p_token: TOK.ana, p_o_que: 'membro',
                                         p_d: { id: eu.ana.id, escopo_total: true } });
    ok(recusou(g, 'SO_ADMIN'), 'Ana tenta se dar escopo de tudo: SO_ADMIN', g.txt);
    const b2 = await rpc('dem_ver', { p_token: TOK.ana, p_numero: deCompras[0] });
    ok(recusou(b2, 'NAO_EXISTE'), 'e continua sem ver compras', b2.txt);
  }

  /* ====================================================================
     E · O CADASTRO: SÓ COM LOGIN, NASCE MEMBRO, E NÃO DUPLICA */
  secao('E · o cadastro próprio, pela sessão do login por e-mail');
  {
    const semLogin = await rpc('dem_cadastrar', { p_d: { nome: 'Sem Login', telefone: '21988887777', setor_id: idCompras } });
    ok(recusou(semLogin, 'SEM_LOGIN'), 'cadastrar sem login: SEM_LOGIN', semLogin.txt);
    const semLogin2 = await rpc('dem_cadastro', {});
    ok(semLogin2.ok === true && semLogin2.situacao === 'sem_login', 'perguntar sem login: "sem_login", e só isso', semLogin2.txt);
    /* e-mail, nome e telefone novos a cada rodada: este arquivo tem que poder
       rodar duas vezes seguidas sem reprovar pelo que ele mesmo criou */
    const novo = jwtDe(`marcos.${RODADA}@exemplo.org`);
    const p = await rpc('dem_cadastrar', { p_d: { nome: `Marcos ${LETRAS}`, telefone: TEL_NOVO,
      setor_id: idCompras, papel: 'admin' } }, novo);
    ok(recusou(p, 'CAMPO_NAO_PERMITIDO'), 'cadastrar mandando "papel": recusado inteiro', p.txt);
    for (const extra of [{ ativo: true }, { token: 'tok-escolhido' }, { escopo_total: true }, { auth_email: 'x@y.org' }]) {
      const r = await rpc('dem_cadastrar', { p_d: { nome: `Marcos ${LETRAS}`, telefone: TEL_NOVO,
        setor_id: idCompras, ...extra } }, novo);
      ok(recusou(r, 'CAMPO_NAO_PERMITIDO'), `cadastrar mandando ${JSON.stringify(extra)}: recusado`, r.txt);
    }
    const dup = await rpc('dem_cadastrar', { p_d: { nome: `Marcos ${LETRAS}`, telefone: '+55 (21) 99999-0005',
      setor_id: idCompras } }, novo);
    ok(recusou(dup, 'TELEFONE_EM_USO'), 'cadastrar com o WhatsApp de Pedro, escrito de outro jeito: TELEFONE_EM_USO', dup.txt);
    const c = await rpc('dem_cadastrar', { p_d: { nome: `Marcos ${LETRAS}`, telefone: TEL_NOVO,
      setor_id: idCompras, papel_pedido: 'responsavel' } }, novo);
    ok(c.ok === true && c.papel === 'solicitante' && c.papel_pedido === 'responsavel',
       'cadastrar certo, num setor que atende e pedindo "equipe": nasce MEMBRO, com o pedido anotado', c.txt);
    const de2 = await rpc('dem_cadastrar', { p_d: { nome: `Marcos Segundo ${LETRAS}`, telefone: TEL_NOVO2, setor_id: idCompras } }, novo);
    ok(recusou(de2, 'JA_CADASTRADO'), 'o mesmo login cadastrando de novo: JA_CADASTRADO', de2.txt);
    const q = await rpc('dem_quem_sou', { p_token: null }, novo);
    ok(q.ok === true && q.id === c.id, 'o login dele passa a entrar no sistema, sem link pessoal', q.txt);
    const v = await rpc('dem_ver', { p_token: null, p_numero: deCompras[0] }, novo);
    ok(recusou(v, 'NAO_EXISTE'), 'e, cadastrado em compras, ele NÃO vê a fila de compras', v.txt);
    const l = await rpc('dem_lista', { p_token: null, p_f: { aba: 'setor' } }, novo);
    ok(l.ok === true && (l.itens || []).length === 0, 'a aba "setor" dele vem vazia', l.txt);
    const pedroMaiusc = jwtDe('PEDRO@EXEMPLO.ORG');
    const jp = await rpc('dem_cadastrar', { p_d: { nome: 'Pedro Duplicado', telefone: '21966665555', setor_id: idCompras } }, pedroMaiusc);
    ok(recusou(jp, 'JA_CADASTRADO'), 'o e-mail de Pedro, em maiúsculas, tentando uma segunda pessoa: JA_CADASTRADO', jp.txt);
    const qp = await rpc('dem_quem_sou', { p_token: null }, pedroMaiusc);
    ok(qp.ok === true && qp.id === eu.pedro.id, 'e esse login é o PEDRO de sempre, uma pessoa só', qp.txt);
    const conta = await rpc('dem_pessoas', { p_token: TOK.arthur });
    ok((conta.membros || []).filter(m => /^Pedro/.test(m.nome)).length === 1, 'a base tem um Pedro só');
  }

  /* ====================================================================
     F · SEM IDENTIDADE, E AS FUNÇÕES QUE NÃO SÃO PORTA */
  secao('F · sem identidade nenhuma, e o que não é porta');
  for (const [fn, a] of [['dem_quem_sou', { p_token: null }], ['dem_bases', { p_token: null }],
                         ['dem_lista', { p_token: null, p_f: { aba: 'tudo' } }],
                         ['dem_ver', { p_token: null, p_numero: doPedro[0] }],
                         ['dem_mover', { p_token: null, p_numero: doPedro[0], p_acao: 'comentar', p_d: { texto: 'x' } }],
                         ['dem_abrir', { p_token: null, p_d: { titulo: 'x' } }],
                         ['dem_numeros', { p_token: null }], ['dem_pessoas', { p_token: null }],
                         ['dem_pessoa', { p_token: null, p_id: idCarla }],
                         ['dem_ajustar', { p_token: null, p_o_que: 'membro', p_d: { id: idCarla, papel: 'admin' } }],
                         ['dem_portal', { p_token: null }], ['dem_avisos', { p_token: null, p_marcar: false }],
                         ['dem_perfil', { p_token: null, p_d: { nome: 'x' } }],
                         ['dem_ver', { p_token: 'tok-que-nao-existe', p_numero: doPedro[0] }],
                         ['dem_ver', { p_token: "' or 1=1 --", p_numero: doPedro[0] }]]) {
    const r = await rpc(fn, a);
    ok(r.ok === false && !r.txt.includes(tituloDe.get(doPedro[0])), `${fn} sem identidade válida: recusado`, r.txt);
  }
  for (const fn of ['quem', 'pode_ver', 'permissoes', 'eu', 'contato_do_setor', 'avisos_de']) {
    const r = await rpc(fn, {});
    ok(r.ok !== true && r.http >= 400, `as funções internas não são porta: /rpc/${fn} não existe na API`, `${r.http} ${r.txt.slice(0, 80)}`);
  }
  {
    /* desativar tira o acesso na hora, pelo link e pelo login */
    const x = await rpc('dem_ajustar', { p_token: TOK.arthur, p_o_que: 'membro',
      p_d: { nome: `Pessoa Que Sai ${LETRAS}`, auth_email: `sai.${RODADA}@exemplo.org`, telefone: TEL_SAI,
             setor_id: idComunicacao, papel: 'responsavel' } });
    ok(x.ok === true, 'o administrador cadastra uma pessoa de equipe', x.txt);
    const ficha = await rpc('dem_pessoa', { p_token: TOK.arthur, p_id: x.id });
    const tokSai = ficha.pessoa?.token;
    ok(!!tokSai && (await rpc('dem_quem_sou', { p_token: tokSai })).ok === true, 'ela entra pelo link');
    const des = await rpc('dem_ajustar', { p_token: TOK.arthur, p_o_que: 'membro', p_d: { id: x.id, ativo: false } });
    ok(des.ok === true, 'o administrador a desativa', des.txt);
    ok(recusou(await rpc('dem_quem_sou', { p_token: tokSai })), 'e o link dela para de entrar');
    ok(recusou(await rpc('dem_quem_sou', { p_token: null }, jwtDe(`sai.${RODADA}@exemplo.org`))), 'e o login dela também');
    ok(recusou(await rpc('dem_ver', { p_token: tokSai, p_numero: daComunicacao[0] })), 'e a fila que ela via fecha');
  }

  /* ====================================================================
     H · UMA PESSOA CONTROLA TUDO (96), PELA API */
  secao('H · uma administração só, nenhuma gestão, e o panorama só dela');
  {
    const pessoasAntes = await rpc('dem_pessoas', { p_token: TOK.arthur });
    const admins = (pessoasAntes.membros || []).filter(m => m.papel === 'admin' && m.ativo);
    ok(admins.length === 1 && admins[0].id === eu.arthur.id, 'a base tem uma administração ativa, e é o Arthur',
       admins.map(m => m.nome).join(', '));
    ok(!(pessoasAntes.membros || []).some(m => m.papel === 'gestor'), 'e ninguém com o papel Gestão');
    for (const [rot, d, codigo] of [
      ['Maria para Administração', { id: eu.maria.id, papel: 'admin' }, 'ADMIN_UNICO'],
      ['Maria para Gestão', { id: eu.maria.id, papel: 'gestor' }, 'SEM_GESTAO'],
      ['escopo para Maria', { id: eu.maria.id, escopo: [idCompras] }, 'SEM_GESTAO'],
      ['escopo de tudo para Maria', { id: eu.maria.id, escopo_total: true }, 'SEM_GESTAO'],
      ['uma Administração nova', { nome: `Outra Adm ${LETRAS}`, setor_id: idComunicacao, papel: 'admin' }, 'ADMIN_UNICO'],
      ['uma Gestão nova', { nome: `Outra Gestao ${LETRAS}`, setor_id: idComunicacao, papel: 'gestor' }, 'SEM_GESTAO'],
      ['o Arthur deixa de administrar', { id: eu.arthur.id, papel: 'responsavel' }, 'ULTIMO_ADMIN'],
      ['o Arthur se desativa', { id: eu.arthur.id, ativo: false }, 'ULTIMO_ADMIN'],
      /* R15A: com uma administração só, o login dela errado tranca tudo */
      ['o Arthur fica sem e-mail de entrar', { id: eu.arthur.id, auth_email: '', email: '' }, 'LOGIN_VAZIO'],
      ['o Arthur troca o e-mail de entrar sem confirmar', { id: eu.arthur.id, auth_email: `outro.${LETRAS.toLowerCase()}@exemplo.org` }, 'CONFIRMAR_LOGIN'],
    ]) {
      const r = await rpc('dem_ajustar', { p_token: TOK.arthur, p_o_que: 'membro', p_d: d });
      ok(recusou(r, codigo), `a própria administração tenta ${rot}: ${codigo}`, r.txt);
    }
    const q = await rpc('dem_quem_sou', { p_token: TOK.maria });
    ok(q.papel === 'responsavel', 'e Maria continua equipe', q.papel);
    const depois = await rpc('dem_pessoas', { p_token: TOK.arthur });
    ok((depois.membros || []).filter(m => m.papel === 'admin' && m.ativo).length === 1
       && !(depois.membros || []).some(m => /^Outra (Adm|Gestao)/.test(m.nome)),
       'depois das dez tentativas: ainda uma administração, e ninguém novo');
    const eu2 = await rpc('dem_quem_sou', { p_token: TOK.arthur });
    ok(eu2.ok === true && eu2.papel === 'admin', 'e o Arthur continua entrando, administrando', eu2.txt.slice(0, 120));
  }
  for (const [quem, tok] of [['Pedro', TOK.pedro], ['Maria', TOK.maria], ['José', TOK.jose], ['Ana', TOK.ana],
                             ['Luciana', TOK.luciana], ['Rafael', TOK.rafael], ['Carla', TOK.carla]]) {
    const r = await rpc('dem_panorama', { p_token: tok });
    ok(recusou(r, 'SO_ADMIN') && !r.txt.includes('operacao'), `${quem} pede o panorama: SO_ADMIN`, r.txt);
  }
  {
    const s0 = await rpc('dem_panorama', { p_token: null });
    ok(recusou(s0, 'SEM_ACESSO'), 'o panorama sem identidade: SEM_ACESSO', s0.txt);
    const r = await rpc('dem_panorama', { p_token: TOK.arthur });
    ok(r.ok === true && !!r.operacao && Array.isArray(r.setores), 'o panorama abre para a administração', r.txt.slice(0, 120));
    ok(!r.txt.includes('tok-') && !/\b55\d{10,11}\b/.test(r.txt) && !/@exemplo\.org/.test(r.txt),
       'e não carrega link pessoal, telefone nem e-mail de ninguém', r.txt.match(/tok-[a-z-]+|55\d{10,11}|[\w.]+@exemplo\.org/)?.[0]);
    const po = await rpc('dem_portal', { p_token: TOK.arthur });
    ok(String(r.operacao?.na_fila) === String(po.n?.fila) && String(r.operacao?.atrasadas) === String(po.n?.atrasadas)
       && String(r.operacao?.aprovar) === String(po.n?.aprovar),
       'e as contas batem com o Atendimento da administração (fila, atrasadas, aprovar)',
       `${r.operacao?.na_fila}/${po.n?.fila} ${r.operacao?.atrasadas}/${po.n?.atrasadas} ${r.operacao?.aprovar}/${po.n?.aprovar}`);
  }

  /* ====================================================================
     G · PELO NAVEGADOR: A BARRA DE ENDEREÇO */
  secao('G · pelo navegador, digitando o endereço');
  const nav = await chromium.launch({ executablePath: chromeDoContainer() });
  try {
    const entrar = async tok => {
      const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' });
      const pag = await ctx.newPage();
      const respostas = [];
      pag.on('response', async res => {
        if (!res.url().includes('/rest/v1/rpc/')) return;
        try { respostas.push({ fn: res.url().split('/').pop(), txt: await res.text() }); } catch {}
      });
      await pag.goto(`${BASE}/demandas?t=${tok}`, { waitUntil: 'networkidle' });
      return { ctx, pag, respostas };
    };
    const texto = pag => pag.evaluate(() => document.body.innerText);
    const abrir = async (pag, rota) => { await pag.goto(BASE + rota, { waitUntil: 'networkidle' }); await pag.waitForTimeout(500); };

    {
      const { ctx, pag, respostas } = await entrar(TOK.rafael);
      const alvo = alheiasDoRafael[1];
      respostas.length = 0;
      await abrir(pag, `/demandas/d/${alvo}`);
      const t = await texto(pag);
      ok(/não existe/i.test(t) && !t.includes(tituloDe.get(alvo)),
         `Rafael digita /demandas/d/${alvo} (de Pedro): "não existe", sem o título`, t.slice(0, 120));
      const ver = respostas.find(r => r.fn === 'dem_ver');
      ok(!!ver && ver.txt.includes('NAO_EXISTE') && !ver.txt.includes(tituloDe.get(alvo)),
         'e a resposta do servidor que a página recebeu também é NAO_EXISTE', ver?.txt);
      await abrir(pag, `/demandas/d/${n1}`);
      ok(/demanda\s*#\s*\d+/i.test(await pag.evaluate(() => document.querySelector('.dm-rot')?.textContent || '')),
         `controle: /demandas/d/${n1}, em que ele foi incluído, abre a ficha`);
      await abrir(pag, '/demandas/atendimento?ver=fila');
      ok(/de quem faz parte de uma equipe/i.test(await texto(pag)), 'Rafael digita /demandas/atendimento: não há fila para ele');
      await ctx.close();
    }
    {
      const { ctx, pag } = await entrar(TOK.maria);
      const alvo = deCompras[0];
      await abrir(pag, `/demandas/d/${alvo}`);
      const t = await texto(pag);
      ok(/não existe/i.test(t) && !t.includes(tituloDe.get(alvo)),
         `Maria (comunicação) digita /demandas/d/${alvo} (compras): "não existe"`, t.slice(0, 120));
      await ctx.close();
    }
    {
      const { ctx, pag, respostas } = await entrar(TOK.pedro);
      respostas.length = 0;
      await abrir(pag, '/demandas/admin');
      const t = await texto(pag);
      ok(/área restrita/i.test(t) && !/Maria Aparecida|Carla Simone|Pedidos de papel/.test(t),
         'Pedro digita /demandas/admin: área restrita, e nenhum nome da base', t.slice(0, 120));
      ok(!respostas.some(r => /"membros"/.test(r.txt)), 'e nenhuma resposta do servidor trouxe a lista de pessoas');
      await abrir(pag, `/demandas/admin/pessoas/${idCarla}`);
      const t2 = await texto(pag);
      ok(/área restrita/i.test(t2) && !/Carla/.test(t2), `Pedro digita /demandas/admin/pessoas/<id de Carla>: área restrita`, t2.slice(0, 120));
      /* e o que a tela não faz, ele faz pelo console: a mesma chamada, com o
         cliente da própria página */
      const direto = await pag.evaluate(async ({ id, ponte }) => {
        const r = await fetch(`${ponte}/rest/v1/rpc/dem_pessoa`, { method: 'POST',
          headers: { 'content-type': 'application/json', apikey: 'chave-de-teste', authorization: 'Bearer chave-de-teste' },
          body: JSON.stringify({ p_token: localStorage.getItem('demandas.link'), p_id: id }) });
        return r.text();
      }, { id: idCarla, ponte: PONTE });
      ok(/SO_ADMIN/.test(direto) && !/Carla/.test(direto), 'Pedro chama dem_pessoa pelo console da página: SO_ADMIN', direto);
      await ctx.close();
    }
    {
      const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
      const pag = await ctx.newPage();
      await pag.goto(`${BASE}/demandas?t=tok-inventado-na-barra`, { waitUntil: 'networkidle' });
      await pag.waitForTimeout(500);
      const t = await pag.evaluate(() => document.body.innerText);
      /* a porta é a de entrar, e desde a R14 ela diz que o link não vale
         (a frase antiga, "entre para ver", saiu com a tela do meio em 23/09) */
      ok(/Entrar nas demandas/.test(t) && /não vale mais/.test(t) && !/Arte para o culto/.test(t),
         'um link inventado na barra não entra em nada, e a porta diz que ele não vale', t.slice(0, 300));
      await ctx.close();
    }
  } finally {
    await nav.close().catch(() => {});
  }
} catch (e) {
  falhas++; console.log('  ERRO:', String(e?.stack || e).slice(0, 600));
}

function chromeDoContainer() {
  const raiz = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const d of readdirSync(raiz).filter(x => x.startsWith('chromium-'))) {
    const c = `${raiz}/${d}/chrome-linux/chrome`;
    if (existsSync(c)) return c;
  }
  return undefined;
}

console.log(falhas ? `\nisolamento: ${falhas} falha(s) em ${feitas}` : `\nisolamento: ${feitas}/${feitas} ok`);
process.exit(falhas ? 1 : 0);
