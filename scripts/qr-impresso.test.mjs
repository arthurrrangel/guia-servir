/* OS ENDEREÇOS QUE ESTÃO IMPRESSOS EM QR CODE — 02/10/2026.

   Um QR code guarda um endereço fixo. Depois de impresso (cartaz, banner,
   adesivo), ele não muda mais: se o endereço deixar de responder, o QR morre
   em todo papel que já saiu. Por isso o QR guarda um endereço curto que só
   redireciona (next.config.mjs), e o destino pode mudar à vontade.

   Esta prova reprova o build se alguém apagar ou estragar um desses
   endereços: ele tem que existir, redirecionar para algum lugar e ser
   temporário (307). Permanente (308) o navegador guarda, e aí trocar o
   destino não alcança quem já escaneou uma vez.

   Roda com `npm test`. */
import { strict as assert } from 'node:assert';
import config from '../next.config.mjs';

/* endereço impresso → para quê (só para a frase de erro) */
const IMPRESSOS = {
  '/fc': 'QR code do Follow Camp',
};

const redirecionamentos = await config.redirects();
let feitas = 0;
for (const [caminho, para] of Object.entries(IMPRESSOS)) {
  const r = redirecionamentos.filter(x => x.source === caminho);
  assert.equal(r.length, 1, `${caminho} (${para}) tem que existir uma vez só em next.config.mjs: está impresso`);
  assert.ok(typeof r[0].destination === 'string' && /^(\/[^/]|https:\/\/)/.test(r[0].destination),
    `${caminho} (${para}) tem que levar a um caminho do site ou a um https://`);
  assert.notEqual(r[0].destination, caminho, `${caminho} não pode levar a si mesmo`);
  assert.equal(r[0].permanent, false, `${caminho} (${para}) tem que ser temporário (307), para o destino poder mudar`);
  feitas++;
}
/* nenhuma rota de página pode morar no mesmo endereço: o redirecionamento
   passa na frente e a página nunca abriria */
const { existsSync } = await import('node:fs');
for (const caminho of Object.keys(IMPRESSOS)) {
  assert.ok(!existsSync(`app${caminho}`) && !existsSync(`public${caminho}`),
    `${caminho} está impresso como QR: não crie página ou arquivo com esse nome`);
  feitas++;
}
console.log(`qr-impresso: ${feitas}/${feitas} ok`);
