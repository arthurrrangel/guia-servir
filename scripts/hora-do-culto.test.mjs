/* =============================================================================
   A HORA DO CULTO ESTÁ ESCRITA EM DOIS LUGARES, E ELES TÊM QUE CONCORDAR

   20/09/2026. `lib/engine.ts` é lógica pura e não importa nada, de propósito:
   `scripts/engine.test.mjs` o carrega cru pelo node, que não resolve import
   sem extensão. Por isso a hora do culto está lá como constante
   (`MIN_CULTO_DOMINGO`) em vez de vir de `lib/igreja.ts`, que é a fonte.

   Cópia sem conferência é divergência marcada para uma data futura. Este
   arquivo é a conferência: ele lê `lib/igreja.ts` e reprova se os dois
   lugares discordarem.

   POR QUE ISSO IMPORTA. Até hoje o motor usava `18:00` fixo, com o
   comentário "o culto é à noite". O culto é às 10h desde sempre, e
   `lib/igreja.ts` diz isso desde 03/09, quando o Arthur corrigiu justamente
   porque a hora errada tinha circulado. Eram oito horas de erro na conta de
   "avisou com quanta antecedência", sempre perdoando quem desmarcou.
   ============================================================================= */

import * as E from '../lib/engine.ts';
import { IGREJA } from '../lib/igreja.ts';
import { minutosDaHora } from '../lib/semana.ts';

let n = 0, f = 0;
const ok = (c, nome, extra) => {
  n++;
  if (c) console.log('  PASS  ' + nome);
  else { f++; console.log('  FAIL  ' + nome + (extra ? '\n        ' + extra : '')); }
};

console.log('\n1. O motor e lib/igreja.ts dizem a mesma hora');
{
  const daFonte = minutosDaHora(IGREJA.cultoHora);
  ok(daFonte !== null, `lib/igreja.ts tem uma hora legível para o culto (${IGREJA.cultoHora})`);
  ok(E.MIN_CULTO_DOMINGO === daFonte,
     'a constante do motor é a mesma hora de lib/igreja.ts',
     `motor=${E.MIN_CULTO_DOMINGO}min  igreja=${IGREJA.cultoHora} (${daFonte}min)`);
  ok(E.MIN_CULTO_DOMINGO !== 18 * 60,
     'e não voltou a ser as 18h antigas');
}

console.log('\n2. O Follow continua sem hora confirmada, e o motor sabe disso');
{
  /* Enquanto `followHora` for null, o motor usa um palpite e o nome da
     constante diz que é palpite. Quando a igreja confirmar, este teste passa
     a exigir que os dois mudem juntos. */
  if (IGREJA.followHora === null) {
    ok(true, 'IGREJA.followHora segue null: o palpite do motor é legítimo');
    ok(E.MIN_FOLLOW_PALPITE === 18 * 60, 'e o palpite é 18h, como está escrito no motor');
  } else {
    const daFonte = minutosDaHora(IGREJA.followHora);
    ok(daFonte !== null, `lib/igreja.ts tem uma hora legível para o Follow (${IGREJA.followHora})`);
    ok(E.MIN_FOLLOW_PALPITE === daFonte,
       'a igreja confirmou a hora do Follow: o motor precisa acompanhar',
       `motor=${E.MIN_FOLLOW_PALPITE}min  igreja=${IGREJA.followHora} (${daFonte}min)`);
  }
}

console.log('\n3. E a conta de antecedência usa a hora certa');
{
  const S = E.estadoVazio();
  const domingo = '2026-10-04';
  const sabado = '2026-10-10';                    // 2º sábado: é Follow
  E.garantirDia(S, domingo); E.garantirDia(S, sabado);

  ok(E.minutosDoCulto(S, domingo) === E.MIN_CULTO_DOMINGO, 'domingo usa a hora do culto');
  ok(E.minutosDoCulto(S, sabado) === E.MIN_FOLLOW_PALPITE, 'sábado de Follow usa a hora do Follow');

  /* uma hora informada no próprio dia manda em tudo: é o caso do evento
     esporádico da migração 54, que pode ser em qualquer hora de qualquer dia */
  S.escalas[domingo].inicio = '07h30';
  ok(E.minutosDoCulto(S, domingo) === 7 * 60 + 30, 'a hora informada no dia vence a constante',
     String(E.minutosDoCulto(S, domingo)));
  S.escalas[domingo].inicio = 'manhã';
  ok(E.minutosDoCulto(S, domingo) === E.MIN_CULTO_DOMINGO,
     'texto que não é hora volta para a constante, em vez de virar NaN',
     String(E.minutosDoCulto(S, domingo)));
  S.escalas[domingo].inicio = null;

  /* a conta em si, com número conferível à mão */
  const h = E.horasDeAntecedencia(domingo, '2026-10-02T13:00:00.000Z', 10 * 60);
  /* 2026-10-02 13:00Z = 10:00 no Rio. Até 2026-10-04 10:00 no Rio são 48h. */
  ok(h === 48, 'quinta 10h para domingo 10h são 48 horas', String(h));
  ok(E.horasDeAntecedencia(domingo, null) === null, 'sem respondido_em não há julgamento');
  ok(E.horasDeAntecedencia(domingo, 'isto não é data') === null, 'data ilegível não vira número');
}

console.log(`\n================  ${n - f}/${n} testes passaram  ================\n`);
process.exit(f ? 1 : 0);
