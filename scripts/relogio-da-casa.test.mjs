/* =============================================================================
   O RELÓGIO DA CASA NÃO DEPENDE DO FUSO DO APARELHO · 22/10/2026

   A contagem do Follow e o "Próximo culto" (lib/site/relogio.ts) contam no
   horário de Brasília. Antes, contavam no fuso do aparelho: este contêiner
   roda em UTC, e a contagem dizia "Faltam 2 dias e 14h" na madrugada de quinta
   (o certo, de Brasília, era 17h); num aparelho em UTC, sábado às 22h do Rio já
   era domingo, e o "Próximo culto" dizia "Hoje". Os casos abaixo são instantes
   fixos; o arquivo roda de novo com o aparelho em Manaus, Tóquio e São Paulo, e
   a resposta tem que ser a mesma em todos.

   Uso: node --import ./scripts/_ts.mjs scripts/relogio-da-casa.test.mjs
   ============================================================================= */
import { spawnSync } from 'node:child_process';
import { textoDaContagem, textoDoProximoCulto, proximoFollow, proximasOcorrencias } from '../lib/site/relogio.ts';
import { cultosDeDomingo, follows, followCamp } from '../lib/site/eventos-schema.ts';

let n = 0, f = 0;
const ok = (c, nome, extra) => {
  n++;
  if (c) console.log('  PASS  ' + nome);
  else { f++; console.log('  FAIL  ' + nome + (extra ? '\n        ' + extra : '')); }
};
const fuso = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
const J = ' ·⁠ ';
const em = iso => new Date(iso);

console.log(`\n1. A contagem do Follow (aparelho em ${fuso})`);
{
  const casos = [
    ['2026-10-22T04:30:00Z', 'quinta, 01h30 do Rio', 'Faltam 2 dias e 17h.', 'Sábado, 24 de outubro.'],
    ['2026-10-24T21:00:00Z', 'sábado, 18h do Rio', 'Falta 1h e 00 min.', 'Hoje, 24 de outubro.'],
    ['2026-10-24T22:30:00Z', 'sábado, 19h30 do Rio (durante)', 'Acontecendo agora.', 'Começou às 19h, hoje, 24 de outubro.'],
    ['2026-10-24T23:31:00Z', 'sábado, 20h31 do Rio (depois)', 'Faltam 6 dias e 22h.', 'Sábado, 31 de outubro.'],
    ['2026-10-25T00:30:00Z', 'sábado, 21h30 do Rio (já domingo em UTC)', 'Faltam 6 dias e 21h.', 'Sábado, 31 de outubro.'],
    ['2026-10-24T21:59:00Z', 'sábado, 18h59 do Rio', 'Falta 1 min.', 'Hoje, 24 de outubro.'],
  ];
  for (const [iso, rot, forte, resto] of casos) {
    const t = textoDaContagem(em(iso));
    ok(t.forte === forte && t.resto === resto, `${rot}: "${forte} ${resto}"`, `veio: "${t.forte} ${t.resto}"`);
  }
  const p = proximoFollow(em('2026-10-22T04:30:00Z'));
  ok(p.quando.toISOString() === '2026-10-24T22:00:00.000Z' && !p.agoraMesmo, 'o próximo Follow é sábado, 19h do Rio (22h UTC)', p.quando.toISOString());
}

console.log(`\n2. O próximo culto (aparelho em ${fuso})`);
{
  const casos = [
    ['2026-10-22T04:30:00Z', 'quinta, 01h30 do Rio', `Domingo, 25 de outubro${J}10h`],
    ['2026-10-25T01:00:00Z', 'sábado, 22h do Rio (já domingo em UTC)', `Domingo, 25 de outubro${J}10h`],
    ['2026-10-25T12:00:00Z', 'domingo, 9h do Rio', `Hoje, 25 de outubro${J}10h`],
    ['2026-10-25T14:59:00Z', 'domingo, 11h59 do Rio (ainda o de hoje)', `Hoje, 25 de outubro${J}10h`],
    ['2026-10-25T15:30:00Z', 'domingo, 12h30 do Rio (o da outra semana)', `Domingo, 1 de novembro${J}10h`],
  ];
  for (const [iso, rot, txt] of casos) {
    const t = textoDoProximoCulto(em(iso));
    ok(t === txt, `${rot}: "${txt.replace(J, ' · ')}"`, `veio: "${t.replace(J, ' · ')}"`);
  }
}

console.log(`\n3. As próximas datas para o Google (aparelho em ${fuso})`);
{
  const datas = (iso, dia, hora, dur, n) => proximasOcorrencias(em(iso), dia, hora, dur, n).map(o => `${o.startDate}/${o.endDate.slice(11, 16)}`).join(' ');
  const casos = [
    ['2026-10-23T05:00:00Z', 0, '10h', 90, 3, 'sexta, 02h do Rio: os três domingos seguintes',
      '2026-10-25T10:00:00-03:00/11:30 2026-11-01T10:00:00-03:00/11:30 2026-11-08T10:00:00-03:00/11:30'],
    ['2026-10-25T02:00:00Z', 0, '10h', 90, 1, 'sábado, 23h do Rio (já domingo em UTC): o domingo de amanhã', '2026-10-25T10:00:00-03:00/11:30'],
    ['2026-10-25T13:30:00Z', 0, '10h', 90, 1, 'domingo, 10h30 do Rio (durante): o de hoje ainda conta', '2026-10-25T10:00:00-03:00/11:30'],
    ['2026-10-25T14:30:00Z', 0, '10h', 90, 1, 'domingo, 11h30 do Rio (acabou): o da outra semana', '2026-11-01T10:00:00-03:00/11:30'],
    ['2026-10-24T22:00:00Z', 6, '19h', 90, 1, 'sábado, 19h do Rio (começando): o Follow de hoje', '2026-10-24T19:00:00-03:00/20:30'],
    ['2026-10-24T23:31:00Z', 6, '19h', 90, 2, 'sábado, 20h31 do Rio (acabou): os dois sábados seguintes',
      '2026-10-31T19:00:00-03:00/20:30 2026-11-07T19:00:00-03:00/20:30'],
    ['2026-12-28T12:00:00Z', 0, '10h', 90, 2, 'segunda, 28/12: o domingo do outro ano', '2027-01-03T10:00:00-03:00/11:30 2027-01-10T10:00:00-03:00/11:30'],
    ['2026-10-23T05:00:00Z', 6, '19h30', 60, 1, 'a hora com minutos ("19h30")', '2026-10-24T19:30:00-03:00/20:30'],
    ['2026-10-23T05:00:00Z', 6, '19:00', 90, 1, 'hora fora do formato do site: nenhuma data (não inventa)', ''],
  ];
  for (const [iso, dia, hora, dur, n, rot, esperado] of casos) {
    const veio = datas(iso, dia, hora, dur, n);
    ok(veio === esperado, `${rot}: ${esperado || '(nenhuma)'}`, `veio: ${veio || '(nenhuma)'}`);
  }
  const agora = em('2026-10-23T05:00:00Z');
  const todos = [...cultosDeDomingo(agora), ...follows(agora), followCamp()];
  const faltando = todos.filter(e => !e.name || !e.startDate || !e.location?.address || !e.location?.name);
  ok(faltando.length === 0 && todos.length === 13, `os eventos do JSON-LD: ${todos.length} (6 domingos, 6 sábados e o Follow Camp), todos com nome, início e lugar`, JSON.stringify(faltando).slice(0, 200));
  ok(todos.every(e => !('eventSchedule' in e)), 'nenhum evento com a agenda semanal sem data (eventSchedule)');
}

/* o mesmo arquivo com o aparelho em outros fusos */
if (!process.env.RELOGIO_FILHO) {
  console.log('\n4. As mesmas respostas com o aparelho em outros fusos');
  for (const tz of ['America/Manaus', 'Asia/Tokyo', 'America/Sao_Paulo']) {
    const r = spawnSync(process.execPath, ['--import', './scripts/_ts.mjs', 'scripts/relogio-da-casa.test.mjs'], { env: { ...process.env, TZ: tz, RELOGIO_FILHO: '1' }, encoding: 'utf8' });
    const falhas = (r.stdout.match(/^ {2}FAIL /gm) || []).length;
    ok(r.status === 0 && falhas === 0, `aparelho em ${tz}: ${(r.stdout.match(/^ {2}PASS /gm) || []).length} PASS, ${falhas} FAIL`, (r.stdout + r.stderr).split('\n').filter(l => /FAIL|veio|Error/.test(l)).slice(0, 6).join('\n        '));
  }
}

console.log(`\n${n - f} PASS, ${f} FAIL`);
process.exit(f ? 1 : 0);
