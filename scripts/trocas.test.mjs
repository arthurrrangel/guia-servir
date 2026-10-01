/* O QUE A TELA DIZ SOBRE A TROCA, A FUNÇÃO NOVA E A AGENDA — 103, 01/10/2026.

   As frases e as contas de lib/trocas.ts. Três regras que não podem voltar:

     1. todo código que o banco devolve (supabase/103) tem frase, e nenhuma
        frase é vazia: código novo sem frase vira "erro" sem explicação;
     2. nenhuma frase promete aviso que o sistema não manda ("avisamos",
        "notificamos"): o sistema não avisa ninguém sozinho;
     3. a grade junta os eventos aos sábados e domingos sem repetir dia, e o
        rótulo do evento diz o dia da semana de verdade (a 71 ensinou: tudo
        que não era sábado virava "domingo").

   Roda com `npm test`. */
import {
  motivoParaMim, motivoDoColega, erroAoPedir, erroAoResponder, erroAoAcrescentar, erroAoRetirar,
  separarTrocas, diasDaGrade, rotuloDoDia, recadoDaTroca, linkDoWhatsSemNumero, quandoDaVaga,
  NIVEL_EM_PALAVRAS, NIVEL_EU,
} from '@/lib/trocas';

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => { feitas++; if (!c) { falhas++; console.log('  FALHOU:', rot, extra); } };
const eq = (a, b, rot) => ok(a === b, rot, `disse ${JSON.stringify(a)}, esperava ${JSON.stringify(b)}`);
const PROMESSA = /avisamos|avisaremos|notificamos|notifica(?:r|mos)? (?:a|o) l[ií]der|o sistema avisa/i;

/* 1 · cada código do banco tem frase, e a frase não promete aviso */
const MOTIVOS = ['INDISPONIVEL', 'JA_ESCALADO', 'NAO_FAZ', 'SEXO', 'INATIVO', 'OUTRA_AREA', 'CULTO', 'REGRA', 'QUALQUER_NOVO'];
for (const m of MOTIVOS) {
  const a = motivoParaMim(m, 'M'); const b = motivoDoColega(m, 'Bia Souza');
  ok(a.length > 10 && !PROMESSA.test(a), `motivoParaMim(${m}) tem frase honesta`, a);
  ok(b.length > 10 && !PROMESSA.test(b), `motivoDoColega(${m}) tem frase honesta`, b);
}
eq(motivoParaMim(null), '', 'sem motivo, sem frase');
eq(motivoParaMim('SEXO', 'F'), 'Esse posto é só para mulheres.', 'o sexo do posto entra na frase');
ok(motivoDoColega('INDISPONIVEL', 'Bia Souza').startsWith('Bia '), 'o colega pelo primeiro nome');

const PEDIR = ['NAO_E_SUA', 'TRAVADO', 'JA_PASSOU', 'CULTO_INEXISTENTE', 'MUITOS_PEDIDOS', 'NAO_PODE', 'OUTRO'];
for (const e of PEDIR) {
  const t = erroAoPedir({ ok: false, erro: e, motivo: 'INDISPONIVEL' }, 'Bia Souza', 'Arthur');
  ok(t.length > 10 && !PROMESSA.test(t), `erroAoPedir(${e}) tem frase honesta`, t);
}
ok(erroAoPedir({ ok: false, erro: 'TRAVADO' }, 'Bia', 'Arthur').includes('Arthur'), 'vaga travada manda falar com o líder pelo nome');
ok(erroAoPedir({ ok: false, erro: 'TRAVADO' }, 'Bia', null).includes('a liderança'), 'sem nome do líder, "a liderança"');
eq(erroAoPedir({ ok: true }, 'Bia'), '', 'deu certo: nada a dizer');

const RESP = ['NAO_E_SEU', 'NAO_ESTA_ABERTA', 'JA_PASSOU', 'MUDOU', 'TRAVADO', 'NAO_PODE', 'OUTRO'];
for (const e of RESP) {
  const t = erroAoResponder({ ok: false, erro: e, motivo: 'JA_ESCALADO' });
  ok(t.length > 10 && !PROMESSA.test(t), `erroAoResponder(${e}) tem frase honesta`, t);
}
ok(/Nada mudou na sua escala/.test(erroAoResponder({ ok: false, erro: 'MUDOU' })),
  'MUDOU diz que nada mudou na escala de quem tentou aceitar');

for (const e of ['JA_TEM', 'FUNCAO_INVALIDA', 'NIVEL_INVALIDO', 'SEXO', 'SEXO_NAO_INFORMADO', 'MUITAS_A_CONFERIR', 'OUTRO']) {
  const t = erroAoAcrescentar({ ok: false, erro: e });
  ok(t.length > 10 && !PROMESSA.test(t), `erroAoAcrescentar(${e}) tem frase honesta`, t);
}
for (const e of ['CONFERIDA', 'ULTIMA', 'NAO_TEM', 'OUTRO']) {
  const t = erroAoRetirar({ ok: false, erro: e });
  ok(t.length > 10 && !PROMESSA.test(t), `erroAoRetirar(${e}) tem frase honesta`, t);
}
eq(NIVEL_EM_PALAVRAS.titular, 'faz sozinho', 'o nível na voz da tela do líder');
eq(NIVEL_EU.reserva, 'Ajudo quando falta', 'e na primeira pessoa');

/* 2 · o que a seção mostra */
const T = (o) => ({ id: o.id, papel: o.papel, culto_id: 'c', data: o.data || '2026-10-11', inicio: null, evento: null,
  funcao_id: 'f', funcao: 'VOZ', outro: 'Bia', status: o.status, impede: null,
  criado_em: o.criado_em || '2026-10-01T10:00:00Z', respondido_em: null });
const s = separarTrocas([
  T({ id: 'a', papel: 'me_pediram', status: 'aberta', data: '2026-10-18' }),
  T({ id: 'b', papel: 'me_pediram', status: 'aberta', data: '2026-10-11' }),
  T({ id: 'c', papel: 'me_pediram', status: 'recusada' }),
  T({ id: 'd', papel: 'pedi', status: 'aberta' }),
  T({ id: 'e', papel: 'pedi', status: 'aceita' }),
  T({ id: 'f', papel: 'pedi', status: 'recusada' }),
  T({ id: 'g', papel: 'pedi', status: 'cancelada' }),
  T({ id: 'h', papel: 'pedi', status: 'expirada' }),
]);
eq(s.recebidas.map(t => t.id).join(','), 'b,a', 'recebidas abertas, do dia mais perto ao mais longe');
eq(s.minhasAbertas.map(t => t.id).join(','), 'd', 'minhas abertas');
eq(s.respostas.map(t => t.id).sort().join(','), 'e,f', 'respostas: aceita e recusada; cancelada e vencida somem');

/* 3 · a grade e o rótulo */
eq(diasDaGrade(['2026-10-04', '2026-10-03'], [{ data: '2026-10-07' }, { data: '2026-10-04' }]).join(','),
   '2026-10-03,2026-10-04,2026-10-07', 'grade: une, ordena e não repete dia');
eq(rotuloDoDia('2026-10-07', [{ evento: 'Ensaio Geral', inicio: '19:30:00' }], 'dom 07'),
   'qua 07 · Ensaio Geral, 19h30', 'evento numa quarta diz quarta, com a hora');
eq(rotuloDoDia('2026-10-08', [{ evento: 'Reunião', inicio: '20:00:00' }, { evento: 'Ensaio', inicio: null }], 'x'),
   'qui 08 · Reunião, 20h · Ensaio', 'dois eventos no mesmo dia, os dois');
eq(rotuloDoDia('2026-10-04', [], 'dom 04'), 'dom 04', 'dia sem evento: o rótulo de sempre');
eq(rotuloDoDia('2026-10-04', [{ evento: 'Batismo', inicio: null }], 'dom 04'), 'dom 04 · Batismo', 'domingo com evento mantém o "dom"');
/* a propriedade, em 400 dias: evento em dia de semana nunca é chamado de dom ou sáb */
{
  const base = Date.parse('2026-10-01T12:00:00Z'); let ruins = 0;
  for (let k = 0; k < 400; k++) {
    const d = new Date(base + k * 86400000); const iso = d.toISOString().slice(0, 10); const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const r = rotuloDoDia(iso, [{ evento: 'X', inicio: null }], 'dom 00');
    if (/^(dom|sáb)/.test(r)) ruins++;
  }
  eq(ruins, 0, 'nenhum evento de dia de semana vira domingo ou sábado (400 dias)');
}

/* 4 · o recado do WhatsApp e a vaga numa frase */
const vaga = { culto_id: 'c', funcao_id: 'f', funcao: 'VOZ', data: '2026-10-07', evento: 'Ensaio Geral', inicio: '19:30:00' };
const q = quandoDaVaga(vaga, '10h', '19h');
eq(q, 'Ensaio Geral · quarta, 7 de outubro, 19h30', 'vaga de evento: nome, dia da semana e hora do evento');
eq(quandoDaVaga({ data: '2026-10-04' }, '10h', '19h'), 'domingo, 4 de outubro, 10h', 'domingo com a hora do culto');
eq(quandoDaVaga({ data: '2026-10-03' }, '10h', '19h'), 'sábado (Follow), 3 de outubro, 19h', 'sábado é Follow, 19h');
const r = recadoDaTroca('Bia Souza', vaga, q, 'https://guiaservir.com/confirmar/louvor');
ok(r.startsWith('Oi, Bia!') && r.includes('VOZ') && r.includes(q) && r.endsWith('https://guiaservir.com/confirmar/louvor'),
  'o recado tem o primeiro nome, a função, o dia e o link da porta', r);
ok(!/\d{4,}/.test(r.replace(/https?:\/\/\S+/, '').replace(/\d{1,2}h\d{0,2}/g, '')), 'o recado não carrega telefone');
const w = linkDoWhatsSemNumero(r);
ok(w.startsWith('https://wa.me/?text=') && decodeURIComponent(w.slice(20)) === r, 'wa.me sem número, texto codificado inteiro', w);

if (falhas) { console.log(`trocas: ${falhas} falha(s) em ${feitas}`); process.exit(1); }
console.log(`trocas: ${feitas}/${feitas} ok`);
