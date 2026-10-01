/* OS AJUSTES MOSTRAM O QUE ESTÁ SALVO — 01/10/2026.

   Medido em produção: o Louvor tinha "quinta-feira" salvo e o campo do prazo
   mostrava "véspera", o padrão do código. Os campos dos Ajustes são não
   controlados e nasciam com o estado daquele instante; quando o estado do
   ministério mudava depois (recarga em segundo plano), o campo não seguia.

   A prova troca o estado do Shell por fora, como uma recarga faria, e exige:
   o campo de texto e o seletor passam a mostrar o salvo novo, e o campo que
   a pessoa está editando não é tocado.

   Roda com BASE=http://127.0.0.1:3500 node scripts/ajustes-segue-o-salvo.test.mjs */
import { chromium } from 'playwright';
import { chromeDoContainer } from './medida-celular.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:3500';
let falhas = 0, feitas = 0;
const ok = (c, nome, extra = '') => { feitas++; if (!c) falhas++; console.log(`  ${c ? 'ok ' : 'FALHOU'} ${nome}${!c && extra ? '\n      ' + extra : ''}`); };
/* acha o `useState` do Shell que guarda o Estado e despacha uma versão nova */
const trocar = (p, mudar) => p.evaluate(m => {
  const el = document.querySelector('input[aria-label="Prazo para confirmar"]');
  const fk = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
  for (let f = el[fk]; f; f = f.return) {
    for (let h = f.memoizedState; h; h = h.next) {
      const v = h.memoizedState;
      if (v && typeof v === 'object' && v.config && 'prazoConfirmacao' in v.config && h.queue?.dispatch) {
        h.queue.dispatch({ ...v, config: { ...v.config, ...m } });
        return true;
      }
    }
  }
  return false;
}, mudar);
const nav = await chromium.launch({ executablePath: chromeDoContainer() });
try {
  const c = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  await c.route('**', r => r.request().url().startsWith(BASE) ? r.continue() : r.abort());
  const p = await c.newPage();
  await p.goto(`${BASE}/ajustes?demo=1`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.es-casca', { timeout: 30000 }); await new Promise(r => setTimeout(r, 2000));
  const prazo = p.getByLabel('Prazo para confirmar');
  const limite = p.getByLabel('Máximo de escalas por pessoa por mês');
  const antes = await prazo.inputValue();
  ok(await trocar(p, { prazoConfirmacao: 'quinta-feira', limitePadrao: 3 }), 'achou o estado do Shell para trocar');
  await new Promise(r => setTimeout(r, 600));
  ok(await prazo.inputValue() === 'quinta-feira', 'o prazo passa a mostrar o salvo novo', `${antes} -> ${await prazo.inputValue()}`);
  ok(await limite.inputValue() === '3', 'o seletor também', await limite.inputValue());
  await prazo.focus(); await prazo.fill('sábado');
  await trocar(p, { prazoConfirmacao: 'domingo' });
  await new Promise(r => setTimeout(r, 500));
  ok(await prazo.inputValue() === 'sábado', 'o campo em edição não é tocado', await prazo.inputValue());
} catch (e) {
  falhas++; console.log('  FALHOU (exceção)', e?.message || e);
} finally {
  await nav.close();
}
console.log(`ajustes-segue-o-salvo: ${feitas - falhas}/${feitas} ${falhas ? 'FALHOU' : 'ok'}`);
process.exit(falhas ? 1 : 0);
