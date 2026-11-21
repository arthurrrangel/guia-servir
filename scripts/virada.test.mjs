/* A VIRADA 2027 · 21/11/2026.

   A reserva da landing page (guiachurch.com/virada): as regras do formulário
   (lib/virada.ts, as mesmas na tela e no servidor), a rota /api/virada com o
   banco de mentira (fetch trocado: nada sai da máquina), as contas e a
   planilha do painel (lib/virada-painel.ts) e a medição da página.

   O banco de verdade (a migração 118: a conta das vagas com a trava, o CPF
   que não duplica, a porta só da administração) tem a conferência dentro da
   própria migração, que roda quando ela é aplicada.

   Roda com: node --import ./scripts/_ts.mjs scripts/virada.test.mjs */
import {
  VIRADA, MAX_POR_RESERVA, conferirReserva, telefoneDe, mascaraCpf, mascaraTelefone, reservaAberta,
  whatsDaReserva, whatsDuvida, whatsListaDeEspera,
} from '@/lib/virada';
import { resumoDe, csvDasReservas, nomeDoArquivo } from '@/lib/virada-painel';
import { ehEvento, paginaPublica, NA_META } from '@/lib/site/medir';
import { zerar } from '@/lib/teto-de-taxa';
import { IGREJA } from '@/lib/igreja';

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => { feitas++; if (!c) { falhas++; console.log('  FALHOU:', rot, extra); } };

/* 1 · O FORMULÁRIO ----------------------------------------------------------- */
const BOA = { nome: '  Maria  da Silva ', cpf: '529.982.247-25', email: ' Maria@Exemplo.COM ', telefone: '(21) 99999-0000', vinculo: 'visitante', pessoas: 3 };
{
  const v = conferirReserva(BOA);
  ok(v.ok, 'a reserva boa passa', JSON.stringify(v));
  ok(v.ok && v.reserva.nome === 'Maria da Silva', 'o nome sai aparado', v.ok ? v.reserva.nome : '');
  ok(v.ok && v.reserva.cpf === '52998224725', 'o CPF sai só com números');
  ok(v.ok && v.reserva.email === 'maria@exemplo.com', 'o e-mail sai aparado e em minúscula');
  ok(v.ok && v.reserva.telefone === '21999990000', 'o telefone sai só com números');
  ok(v.ok && v.reserva.pessoas === 3 && v.reserva.vinculo === 'visitante', 'pessoas e vínculo');
  ok(conferirReserva({ ...BOA, pessoas: '2' }).ok, 'pessoas pode vir como texto do select');

  const campo = (mudanca, c) => { const r = conferirReserva({ ...BOA, ...mudanca }); return !r.ok && r.campo === c ? r.erro : null; };
  ok(campo({ nome: '' }, 'nome'), 'sem nome: aponta o nome');
  ok(campo({ nome: 'Maria' }, 'nome') === 'Escreva nome e sobrenome.', 'só o primeiro nome não passa');
  ok(campo({ nome: 'Maria 123' }, 'nome'), 'nome com número não passa');
  ok(campo({ cpf: '' }, 'cpf') === 'Escreva seu CPF.', 'sem CPF');
  ok(campo({ cpf: '529.982.247-24' }, 'cpf'), 'CPF com dígito errado não passa');
  ok(campo({ cpf: '111.111.111-11' }, 'cpf'), 'CPF de números repetidos não passa');
  ok(campo({ email: '' }, 'email'), 'sem e-mail');
  ok(campo({ email: 'maria@exemplo' }, 'email'), 'e-mail sem domínio não passa');
  ok(campo({ telefone: '' }, 'telefone'), 'sem telefone');
  ok(campo({ telefone: '9999-0000' }, 'telefone'), 'telefone sem DDD não passa');
  ok(campo({ vinculo: '' }, 'vinculo'), 'sem dizer se é membro ou visitante');
  ok(campo({ vinculo: 'pastor' }, 'vinculo'), 'vínculo fora da lista não passa');
  ok(campo({ pessoas: 0 }, 'pessoas') && campo({ pessoas: MAX_POR_RESERVA + 1 }, 'pessoas') && campo({ pessoas: 2.5 }, 'pessoas'), 'pessoas fora de 1 a 6 não passa');
  ok(!conferirReserva(null).ok && !conferirReserva('x').ok, 'corpo que não é objeto não passa');
}

/* telefones */
for (const [ent, sai] of [['(21) 99999-0000', '21999990000'], ['+55 21 99999-0000', '21999990000'], ['(21) 3333-4444', '2133334444'],
  ['21 2233-4455', '2122334455'], ['(01) 99999-0000', null], ['(21) 89999-0000', null], ['(21) 9333-4444', null], ['2133', null], ['', null]]) {
  ok(telefoneDe(ent) === sai, `telefone ${JSON.stringify(ent)} → ${sai}`, String(telefoneDe(ent)));
}
ok(mascaraCpf('52998224725') === '529.982.247-25' && mascaraCpf('5299') === '529.9', 'a máscara do CPF');
ok(mascaraTelefone('21999990000') === '(21) 99999-0000' && mascaraTelefone('2133334444') === '(21) 3333-4444' && mascaraTelefone('5521999990000') === '(21) 99999-0000', 'a máscara do telefone');

/* o WhatsApp */
{
  const r = conferirReserva(BOA).reserva;
  const t = decodeURIComponent(whatsDaReserva(r).split('?text=')[1]);
  ok(whatsDaReserva(r).startsWith(`https://wa.me/${IGREJA.whatsapp}?text=`), 'a reserva vai para o WhatsApp da igreja');
  ok(t.includes('Maria da Silva') && t.includes('529.982.247-25') && t.includes('(21) 99999-0000') && t.includes('3 pessoas') && t.includes('Sou visitante'),
    'a mensagem leva a reserva inteira', t);
  ok(!/\d{3}\.\d{3}/.test(decodeURIComponent(whatsDuvida())) && !/\d{3}\.\d{3}/.test(decodeURIComponent(whatsListaDeEspera())), 'dúvida e lista de espera não levam CPF');
}
/* a hora de fechar */
ok(reservaAberta(Date.parse('2026-12-31T19:29:00-03:00')) && !reservaAberta(Date.parse('2026-12-31T19:30:00-03:00')), 'o site reserva até 19h30 do dia 31');

/* 2 · O PAINEL ------------------------------------------------------------- */
{
  const R = (id, pessoas, vinculo, extra = {}) => ({ id, evento: VIRADA.slug, criada_em: '2026-11-21T22:10:00Z', origem: 'site', nome: `Pessoa ${id}`,
    cpf: '52998224725', email: 'a@b.com', telefone: '21999990000', vinculo, pessoas, lancada_por: null, cancelada_em: null, cancelada_por: null, motivo: null, ...extra });
  const lista = [R('a', 4, 'membro'), R('b', 2, 'visitante'), R('c', 3, 'visitante', { cancelada_em: '2026-11-22T10:00:00Z' }),
    R('d', 1, null, { origem: 'manual', cpf: null, nome: 'Fulano; da "Porta"', lancada_por: 'Arthur' })];
  const r = resumoDe(lista, 150);
  ok(r.reservas === 3 && r.pessoas === 7 && r.restantes === 143, 'as contas: só as vivas, em pessoas', JSON.stringify(r));
  ok(r.membros === 4 && r.visitantes === 2 && r.semVinculo === 1 && r.canceladas === 1, 'membros, visitantes e canceladas', JSON.stringify(r));
  ok(resumoDe([R('x', 6, 'membro')], 5).restantes === 0, 'restam nunca fica negativo');
  const csv = csvDasReservas(lista);
  const linhas = csv.split('\r\n');
  ok(csv.startsWith('﻿Nome;Pessoas;Membro ou visitante;Telefone;E-mail;CPF;'), 'a planilha abre no Excel em português (BOM e ponto e vírgula)');
  ok(linhas[1].startsWith('"Fulano; da ""Porta"""') && linhas[1].includes('Lançada por Arthur'), 'o texto com ; e aspas vai entre aspas; a lançada diz por quem', linhas[1]);
  ok(linhas[4].startsWith('Pessoa c') && linhas[4].includes('22/11/2026'), 'a cancelada vai no fim, com a data', linhas[4]);
  ok(linhas[2].includes('(21) 99999-0000') && linhas[2].includes('529.982.247-25') && linhas[2].includes('21/11/2026 19:10'), 'telefone, CPF e a hora de Brasília', linhas[2]);
  ok(/^virada-2027-reservas-\d{4}-\d{2}-\d{2}\.csv$/.test(nomeDoArquivo()), 'o nome do arquivo');
}

/* 3 · A MEDIÇÃO ------------------------------------------------------------- */
ok(paginaPublica('/virada') && !paginaPublica('/virada/reservas'), 'a /virada é medida; o painel não');
ok(ehEvento('reserva_virada') && NA_META.reserva_virada.nome === 'CompleteRegistration', 'a reserva vira CompleteRegistration na Meta');

/* 4 · A ROTA, COM O BANCO DE MENTIRA ------------------------------------------ */
{
  const pedidos = [];
  let resposta = { status: 200, corpo: { ok: true, id: 'r1', restantes: 140 } };
  globalThis.fetch = async (url, init) => {
    pedidos.push({ url: String(url), corpo: init?.body ? JSON.parse(init.body) : null });
    if (resposta.lancar) throw new Error('rede');
    return new Response(JSON.stringify(resposta.corpo), { status: resposta.status, headers: { 'content-type': 'application/json' } });
  };
  const rota = await import('@/app/api/virada/route');
  let ip = 0;
  const post = async (corpo, mesmoIp) => {
    const r = await rota.POST(new Request('https://guiachurch.com/api/virada', {
      method: 'POST', body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
      headers: { 'content-type': 'application/json', 'x-forwarded-for': mesmoIp || `10.0.0.${++ip}` },
    }));
    return { status: r.status, j: await r.json() };
  };
  const get = async () => { const r = await rota.GET(new Request('https://guiachurch.com/api/virada', { headers: { 'x-forwarded-for': `10.1.0.${++ip}` } })); return r.json(); };

  /* sem a chave do servidor: a reserva vai pelo WhatsApp */
  delete process.env.SUPABASE_SERVICE_ROLE;
  let r = await post(BOA);
  ok(r.status === 200 && r.j.ok === true && r.j.guardado === false && pedidos.length === 0, 'sem a chave: guardado false, e o banco não é chamado', JSON.stringify(r));
  ok((await get()).restantes === null, 'sem a chave: as vagas não são ditas');

  process.env.SUPABASE_SERVICE_ROLE = 'chave-de-servico-de-mentira';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://banco.exemplo';
  r = await post(BOA);
  ok(r.j.ok && r.j.guardado && r.j.restantes === 140, 'gravou: guardado true com as vagas', JSON.stringify(r.j));
  const p = pedidos.at(-1);
  ok(p.url === 'https://banco.exemplo/rest/v1/rpc/virada_reservar', 'chama virada_reservar no banco', p.url);
  ok(p.corpo?.p?.evento === 'virada-2027' && p.corpo.p.cpf === '52998224725' && p.corpo.p.telefone === '21999990000' && p.corpo.p.nome === 'Maria da Silva',
    'manda a reserva limpa, com o evento', JSON.stringify(p.corpo));

  resposta = { status: 200, corpo: { ok: true, id: 'r1', repetida: true, restantes: 140 } };
  r = await post(BOA);
  ok(r.j.ok && r.j.guardado && r.j.repetida === true, 'o mesmo CPF: repetida, sem duplicar', JSON.stringify(r.j));

  resposta = { status: 200, corpo: { ok: false, erro: 'ESGOTADO', restantes: 2 } };
  r = await post(BOA);
  ok(r.j.ok === false && r.j.esgotado === true && r.j.restantes === 2, 'não cabe: esgotado com o que resta', JSON.stringify(r.j));

  resposta = { status: 200, corpo: { ok: false, erro: 'ENCERRADA' } };
  r = await post(BOA);
  ok(r.j.ok === false && r.j.fechada === true, 'o banco fechou: fechada', JSON.stringify(r.j));

  resposta = { status: 404, corpo: { code: 'PGRST202', message: 'Could not find the function' } };
  r = await post(BOA);
  ok(r.j.ok === true && r.j.guardado === false, 'sem a 118 no banco: vai pelo WhatsApp', JSON.stringify(r.j));

  resposta = { status: 200, corpo: { ok: false, erro: 'DADOS' } };
  r = await post(BOA);
  ok(r.j.ok === true && r.j.guardado === false, 'o banco recusou os dados: vai pelo WhatsApp, nunca "reservado"', JSON.stringify(r.j));

  resposta = { lancar: true };
  r = await post(BOA);
  ok(r.j.ok === true && r.j.guardado === false, 'a rede caiu: vai pelo WhatsApp', JSON.stringify(r.j));

  const antes = pedidos.length;
  r = await post({ ...BOA, cpf: '123' });
  ok(r.status === 400 && r.j.campo === 'cpf' && pedidos.length === antes, 'CPF errado: 400 com o campo, sem chamar o banco', JSON.stringify(r.j));
  r = await post('{isto não é json');
  ok(r.status === 400 && r.j.ok === false, 'corpo quebrado: 400');
  r = await post({ ...BOA, site: 'http://spam.exemplo' });
  ok(r.j.ok === true && r.j.guardado === true && pedidos.length === antes, 'o robô que preenche a isca ouve "gravado", e nada é gravado', JSON.stringify(r.j));

  /* as vagas */
  resposta = { status: 200, corpo: { ok: true, capacidade: 150, ocupadas: 120, restantes: 30, aberta: true } };
  let g = await get();
  ok(g.aberta === true && g.restantes === 30 && pedidos.at(-1).url.endsWith('/rpc/virada_vagas'), 'GET: as vagas de agora', JSON.stringify(g));
  resposta = { status: 200, corpo: { ok: true, capacidade: 150, ocupadas: 150, restantes: 0, aberta: false } };
  g = await get();
  ok(g.aberta === false && g.restantes === 0, 'GET: esgotado fecha', JSON.stringify(g));
  resposta = { status: 500, corpo: {} };
  g = await get();
  ok(g.aberta === true && g.restantes === null, 'GET: banco fora, a página segue aberta', JSON.stringify(g));

  /* o teto de taxa: 30 reservas por aparelho em 10 minutos */
  zerar();
  resposta = { status: 200, corpo: { ok: true, id: 'r9', restantes: 100 } };
  let ultimo;
  for (let k = 0; k < 31; k++) ultimo = await post(BOA, '10.9.9.9');
  ok(ultimo.status === 429, 'a 31ª reserva do mesmo aparelho em 10 minutos espera', String(ultimo.status));

  /* depois das 19h30 do dia 31: fechada, sem chamar o banco */
  zerar();
  const agora = Date.now;
  Date.now = () => Date.parse('2026-12-31T20:00:00-03:00');
  const n = pedidos.length;
  r = await post(BOA);
  Date.now = agora;
  ok(r.j.fechada === true && pedidos.length === n, 'depois que a noite começa: fechada, sem chamar o banco', JSON.stringify(r.j));
}

console.log(`virada: ${feitas - falhas}/${feitas}`);
if (falhas) process.exit(1);
