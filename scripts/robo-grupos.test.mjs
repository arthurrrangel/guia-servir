/* O QUE O ROBÔ DO WHATSAPP LÊ É O MESMO QUE O LÍDER VÊ · 26/10/2026.

   lib/robo-grupos.ts entrega ao robô as linhas do "Mandar nos grupos" e a
   cobrança com @. Este teste monta um domingo da Mídia com os mesmos tipos
   do demo (lib/demo.ts, que o Node puro não importa por causa dos tipos) e
   confere:
     · cada linha é a mesma mensagem que a tela monta, com a mesma assinatura;
     · a cobrança é a do botão "Cobrar confirmação", trocando só o nome pelo @
       de quem tem telefone;
     · a rota /api/robo/grupos fecha sem o segredo e não toca no banco antes
       de conferir o cabeçalho.
   Nada sai da máquina: o banco não é chamado em nenhum caso.

   Roda com `npm test`. */

import {
  assinaturaDoEnvio, estadoVazio, funcoesDoDia, garantirDia, gruposDoDia, linkDoVoluntario, msgConfirmar, msgEscala, nomeDe,
} from '@/lib/engine';
import { cobrancaDoRobo, linhasDoRobo, preenchidosDoDia, telefoneDoWhatsApp } from '@/lib/robo-grupos';
import { autorizado, SEGREDO_MINIMO } from '@/lib/robo-segredo';

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => { feitas++; if (!c) { falhas++; console.log('  FALHOU:', rot, extra); } };

/* um domingo da Mídia, com as peças do demo: funções por tipo de dia, dois
   grupos por área, uma função só do geral, gente confirmada e gente pendente */
const F = (nome, ordem, tipos = ['domingo', 'follow']) => ({ id: 'f' + ordem, nome, ordem, simultanea: true, ativa: true, tipos });
const P = (nome, funcoes, tel = '') => ({
  id: 'v' + nome.toLowerCase().replace(/\W/g, ''), nome, tel, ativo: true, limiteMes: 4,
  token: 'tok' + nome.toLowerCase().replace(/\W/g, ''), funcoes, conferido: true,
  confirmadas: Object.fromEntries(Object.keys(funcoes).map(f => [f, true])), indisponivel: [], disponivel: [],
});
const S = estadoVazio();
S.temAcesso = true;
S.equipe = 'Mídia';
S.funcoes = [F('PROJEÇÃO', 1), F('ILUMINAÇÃO', 2), F('FOTO', 3), F('CÂMERA 1', 4, ['domingo']), F('APOIO', 5)];
S.config.grupos = [
  { id: 'g1', nome: 'Multimídia · Projeção', funcoes: ['f1', 'f2'] },
  { id: 'g2', nome: 'Multimídia · Foto', funcoes: ['f3'] },
  { id: 'g3', nome: 'Multimídia · Câmeras', funcoes: ['f4'] },
];
S.voluntarios = [
  P('Ana Lima', { 'PROJEÇÃO': 'titular' }), P('Bruno Reis', { 'ILUMINAÇÃO': 'titular' }),
  P('Carla Dias', { 'FOTO': 'titular' }), P('Davi Melo', { 'CÂMERA 1': 'titular' }), P('Eva Rocha', { 'APOIO': 'titular' }),
];
const d = '2026-11-01';
const dia = garantirDia(S, d);
dia.cultoId = 'c' + d;
const st = { 'PROJEÇÃO': ['vanalima', 'pendente'], 'ILUMINAÇÃO': ['vbrunoreis', 'confirmado'], 'FOTO': ['vcarladias', 'pendente'],
  'CÂMERA 1': ['vdavimelo', 'pendente'], 'APOIO': ['vevarocha', 'pendente'] };
for (const [f, [vid, status]] of Object.entries(st)) dia.slots[f] = { vid, status, fixo: false, primeiraVez: false };
const link = linkDoVoluntario('https://escalas.guiaservir.com', 'midia', 'confirmar');
ok(funcoesDoDia(S, d).length === 5, 'o domingo tem os cinco postos', String(funcoesDoDia(S, d).length));

/* 1 · as linhas são as da tela */
{
  const l = linhasDoRobo(S, d, link);
  const grupos = gruposDoDia(S, d);
  ok(l.length === grupos.length + 1, 'uma linha para o geral e uma por grupo', `${l.length} linhas, ${grupos.length} grupos`);
  ok(l[0].gid === 'geral' && l[0].nome === 'Grupo geral' && l[0].texto === msgEscala(S, d, { link }), 'o geral leva a escala inteira, como na tela');
  ok(l[0].ass === assinaturaDoEnvio(S, d), 'o geral com a assinatura do dia');
  for (const [i, x] of grupos.entries()) {
    const li = l[i + 1];
    ok(li.gid === x.grupo.id && li.nome === x.grupo.nome, `grupo ${x.grupo.nome}: id e nome`);
    ok(li.texto === (x.funcoes.length ? msgEscala(S, d, { link, grupo: x.grupo }) : ''), `grupo ${x.grupo.nome}: o texto da tela`);
    ok(li.ass === assinaturaDoEnvio(S, d, x.grupo), `grupo ${x.grupo.nome}: a assinatura da tela`);
    ok(li.vazio === !x.funcoes.length, `grupo ${x.grupo.nome}: vazio quando não tem função no dia`);
  }
  ok(l.every(x => !x.texto.includes('tok')), 'nenhum link pessoal (token) nas mensagens de grupo');
  ok(l[0].texto.includes(link), 'o link do ministério fecha a mensagem');
}

/* 2 · a cobrança: o mesmo texto do botão, com @ no lugar do nome */
{
  const pend = [...new Set(funcoesDoDia(S, d).map(f => dia.slots[f.nome]).filter(sl => sl?.vid && (sl.status || 'pendente') === 'pendente').map(sl => sl.vid))];
  /* telefones diferentes para todos, menos o último, que fica sem telefone */
  pend.forEach((vid, i) => { const v = S.voluntarios.find(x => x.id === vid); v.tel = i === pend.length - 1 ? '' : `(21) 9${String(8000 + i).padStart(4, '0')}-00${String(i).padStart(2, '0')}`; });
  const c = cobrancaDoRobo(S, d, link);
  const comTel = pend.slice(0, -1);
  ok(c.pendentes === pend.length, 'pendentes conta pessoas', `${c.pendentes} x ${pend.length}`);
  ok(c.mencoes.length === comTel.length, 'uma menção por pessoa com telefone', `${c.mencoes.length} x ${comTel.length}`);
  ok(c.mencoes.every(m => /^55\d{10,11}$/.test(m.telefone) && c.texto.includes('@' + m.telefone)), 'cada menção está no texto como @55...');
  const ultimo = nomeDe(S, pend[pend.length - 1]);
  ok(pend.length < 2 || c.texto.includes(ultimo), 'quem não tem telefone aparece pelo nome', ultimo);
  let devolta = c.texto;
  for (const m of c.mencoes) devolta = devolta.split('@' + m.telefone).join(m.nome);
  ok(devolta === msgConfirmar(S, d, link), 'trocando o @ pelo nome, é a frase exata do botão', `\n${devolta}\n---\n${msgConfirmar(S, d, link)}`);
  ok(msgConfirmar(S, d, link) === msgConfirmar(S, d, link, vid => nomeDe(S, vid)), 'o padrão do msgConfirmar continua o nome');
}

/* 3 · dia sem escala: nada para mandar */
ok(preenchidosDoDia(S, '2099-01-03') === 0, 'dia sem escala: zero preenchidos');
ok(preenchidosDoDia(S, d) > 0, 'o dia do teste tem preenchidos');

/* 4 · telefone no formato do WhatsApp */
for (const [ent, sai] of [['21999990000', '5521999990000'], ['(21) 3333-4444', '552133334444'], ['+55 21 99999-0000', '5521999990000'],
  ['5521999990000', '5521999990000'], ['', null], [null, null], ['999', null], ['44 7700 900123', null]]) {
  ok(telefoneDoWhatsApp(ent) === sai, `telefone ${JSON.stringify(ent)} → ${sai}`, String(telefoneDoWhatsApp(ent)));
}

/* 5 · o segredo */
{
  const seg = 'a'.repeat(SEGREDO_MINIMO) + 'Z9';
  ok(autorizado(`Bearer ${seg}`, seg), 'o segredo certo passa');
  ok(!autorizado(`Bearer ${seg}x`, seg) && !autorizado(`Bearer ${seg.toLowerCase()}`, seg), 'qualquer diferença recusa');
  ok(!autorizado(seg, seg) && !autorizado(`Basic ${seg}`, seg), 'só no formato Bearer');
  ok(!autorizado(null, seg) && !autorizado('', seg), 'sem cabeçalho recusa');
  ok(!autorizado(`Bearer ${seg}`, undefined) && !autorizado('Bearer curto', 'curto'), 'servidor sem segredo, ou com segredo curto, fica fechado');
}

/* 6 · a rota: fecha sem o segredo e não chama o banco antes de conferir */
{
  let chamadas = 0;
  globalThis.fetch = async () => { chamadas++; throw new Error('o banco não podia ser chamado'); };
  const seg = 'b'.repeat(40);
  delete process.env.SUPABASE_SERVICE_ROLE;
  process.env.ROBO_WHATSAPP_SEGREDO = seg;
  const rota = await import('@/app/api/robo/grupos/route');
  const pede = (q, h = {}) => rota.GET(new Request('https://escalas.guiaservir.com/api/robo/grupos' + q, { headers: h }));
  let r = await pede('?equipe=midia&data=2026-10-31');
  ok(r.status === 401, 'sem cabeçalho: 401', String(r.status));
  r = await pede(`?equipe=midia&data=2026-10-31&segredo=${seg}`);
  ok(r.status === 401, 'segredo na URL não vale', String(r.status));
  r = await pede('?equipe=midia&data=2026-10-31', { authorization: 'Bearer ' + 'c'.repeat(40) });
  ok(r.status === 401 && (await r.json()).erro === 'NAO_AUTORIZADO', 'segredo errado: 401');
  r = await pede('?equipe=Midia;drop&data=2026-10-31', { authorization: 'Bearer ' + seg });
  ok(r.status === 400, 'equipe fora do formato: 400', String(r.status));
  r = await pede('?equipe=midia&data=31/10/2026', { authorization: 'Bearer ' + seg });
  ok(r.status === 400, 'data fora do formato: 400', String(r.status));
  r = await pede('?equipe=midia&data=2026-10-31', { authorization: 'Bearer ' + seg });
  ok(r.status === 503 && (await r.json()).erro === 'SEM_BANCO', 'sem a chave do banco: 503, sem tentar', String(r.status));
  ok(r.headers.get('cache-control') === 'no-store', 'resposta sem cache');
  delete process.env.ROBO_WHATSAPP_SEGREDO;
  r = await pede('?equipe=midia&data=2026-10-31', { authorization: 'Bearer ' + seg });
  ok(r.status === 401, 'servidor sem o segredo: fechado', String(r.status));
  ok(chamadas === 0, 'em nenhum caso o banco foi chamado', `${chamadas} chamadas`);
}

console.log(`robô do WhatsApp lê o que o líder vê: ${feitas - falhas}/${feitas}`);
if (falhas) process.exit(1);
