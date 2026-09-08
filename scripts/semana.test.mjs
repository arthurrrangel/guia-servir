/* node scripts/semana.test.mjs — o motor do "agora" */
import * as S from '../lib/semana.ts';
let ok = 0, falhou = 0;
const t = (nome, cond) => { if (cond) { ok++; console.log('  PASS ', nome); } else { falhou++; console.log('  FAIL ', nome); } };
const d = (y, m, dd, h = 0, mi = 0) => new Date(y, m - 1, dd, h, mi);

t('20h → 1200 min', S.minutosDaHora('20h') === 1200);
t('17h30 → 1050', S.minutosDaHora('17h30') === 1050);
t('sem hora → null', S.minutosDaHora(undefined) === null);
t('lixo → null', S.minutosDaHora('à noite') === null);

t('sábado 5/9/2026 é o primeiro do mês: sem Follow', !S.ehSabadoDeFollow(d(2026, 9, 5)));
t('sábado 12/9/2026 tem Follow', S.ehSabadoDeFollow(d(2026, 9, 12)));
t('terça não é Follow', !S.ehSabadoDeFollow(d(2026, 9, 8)));

// terça 8/9/2026, 15h: a próxima coisa é a Elas, 17h30, hoje
const p1 = S.proxima(d(2026, 9, 8, 15));
t('terça 15h → hoje Elas 17h30', p1 && p1.evento.nome === 'Elas' && p1.emDias === 0 && S.rotuloDoDia(p1) === 'Hoje');
// terça 8/9/2026, 18h: a Elas já passou; a próxima é quarta 20h (grupos)
const p2 = S.proxima(d(2026, 9, 8, 18));
t('terça 18h → amanhã, 20h, grupo de quarta', p2 && p2.evento.dia === 3 && p2.emDias === 1 && S.rotuloDoDia(p2) === 'Amanhã');
// sexta 11/9/2026: próximo é sábado (Follow, 12/9, sem hora)
const p3 = S.proxima(d(2026, 9, 11, 10));
t('sexta → amanhã Follow (sem hora)', p3 && p3.evento.tipo === 'follow' && p3.emDias === 1 && !p3.evento.hora);
// sexta 4/9/2026: sábado 5/9 é o primeiro do mês → sem Follow → próximo é domingo 6/9, 10h
const p4 = S.proxima(d(2026, 9, 4, 10));
t('sexta antes do 1º sábado → domingo 10h', p4 && p4.evento.tipo === 'culto' && p4.emDias === 2 && S.rotuloDoDia(p4) === 'Domingo');
// domingo 6/9/2026, 11h: o culto começou às 10, ainda conta (tolerância 90 min)
const p5 = S.proxima(d(2026, 9, 6, 11));
t('domingo 11h → ainda é o culto de hoje', p5 && p5.evento.tipo === 'culto' && p5.emDias === 0);
// domingo 6/9/2026, 12h: passou; próximo é terça (Elas)
const p6 = S.proxima(d(2026, 9, 6, 12));
t('domingo 12h → terça, Elas', p6 && p6.evento.nome === 'Elas' && p6.emDias === 2 && S.rotuloDoDia(p6) === 'Terça');
// segunda: nada acontece
t('segunda tem zero eventos', S.eventosDoDia(1).length === 0);
t('quarta tem 5 grupos (Barraspace, Elohim, Bali, Seasons, Kairós)', S.eventosDoDia(3).length === 5);
t('quinta tem 6 grupos', S.eventosDoDia(4).length === 6);
t('domingo tem o culto', S.eventosDoDia(0).length === 1 && S.eventosDoDia(0)[0].tipo === 'culto');
t('a ordem de terça é por hora', S.eventosDoDia(2)[0].nome === 'Elas');
const f = S.fraseDoAgora(p1);
t('frase do agora: "Hoje, 17h30" · "Pequena Guia Elas"', f.quando === 'Hoje, 17h30' && f.oque === 'Pequena Guia Elas');
t('próximas(3) vem em ordem', (() => { const ps = S.proximas(d(2026, 9, 8, 15), 3); return ps.length === 3 && ps[0].quando <= ps[1].quando && ps[1].quando <= ps[2].quando; })());

console.log(`\n${ok} PASS, ${falhou} FAIL`);
process.exit(falhou ? 1 : 0);
