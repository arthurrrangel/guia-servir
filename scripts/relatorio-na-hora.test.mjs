/* =============================================================================
   O RELATÓRIO ABRE NA HORA QUE O BANCO ACEITA, E O BANCO NÃO FALA CRU
   · 26/10/2026

   A parte pura da prova de tela scripts/relatorio-tela.test.mjs (ver o
   cabeçalho de lá): a conta de "o culto já começou" que a página passa a usar
   é `horasAteCulto`, a mesma do banco (18h sem hora cadastrada, 75:252), e as
   duas recusas de `eu_relatorio` viram frase de gente em lib/erros.ts.
   node --import ./scripts/_ts.mjs scripts/relatorio-na-hora.test.mjs
   ============================================================================= */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { horasAteCulto } from '../lib/engine.ts';
import { humano } from '../lib/erros.ts';

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => { feitas++; if (c) console.log('  ok', rot); else { falhas++; console.log('  FALHOU:', rot, extra); } };
const em = (iso) => Date.parse(iso);

/* a conta, nos dois tipos de culto */
ok(horasAteCulto('2026-11-01', null, em('2026-11-01T12:30:00-03:00')) > 0, 'domingo sem hora, 12h30: ainda não começou para o banco');
ok(horasAteCulto('2026-11-01', null, em('2026-11-01T18:00:00-03:00')) === 0, 'domingo sem hora, 18h: começou');
ok(horasAteCulto('2026-11-01', null, em('2026-11-02T10:00:00-03:00')) < 0, 'segunda 10h: o domingo já passou');
ok(horasAteCulto('2026-11-04', '19:30:00', em('2026-11-04T19:29:00-03:00')) > 0, 'evento 19h30, às 19h29: ainda não');
ok(horasAteCulto('2026-11-04', '19:30:00', em('2026-11-04T19:30:00-03:00')) === 0, 'evento 19h30, às 19h30: começou');

/* a página usa essa conta para desenhar o formulário */
{
  const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
  const pagina = readFileSync(join(raiz, 'app/(sistema)/eu/[token]/page.tsx'), 'utf8');
  ok(/const paraRelatar = agenda\.filter\(i => i\.relata && i\.data <= hoje && horasAte\(i\.data, i\.inicio\) <= 0\);/.test(pagina),
    'o formulário do relatório só aparece quando o culto já começou pela conta do banco');
}

/* as duas recusas de eu_relatorio viram frase de gente */
for (const message of [
  'RELATORIO_ANTES_DA_HORA: o culto de 2026-11-01 ainda nao comecou, e relatorio se escreve depois.',
  'RELATORIO_DE_QUEM_NAO_FOI: voce marcou que nao ia neste dia, entao nao da para relatar como foi.',
]) {
  const r = humano({ code: 'P0001', message }, 'salvar');
  const codigo = message.split(':')[0];
  ok(!r.generico && !r.texto.includes(codigo) && !/[A-Z]{3,}_[A-Z_]{3,}/.test(r.texto), `${codigo} não chega cru`, r.texto);
}
ok(/ainda não abriu/.test(humano({ code: 'P0001', message: 'RELATORIO_ANTES_DA_HORA: o culto de 2026-11-01 ainda nao comecou, e relatorio se escreve depois.' }, 'salvar').texto),
  'antes da hora: diz que ainda não abriu (sem dizer que o culto não começou)');

/* lote 6 · RELATORIO_DE_QUEM_NAO_FOI vale para DOIS estados do posto que
   relata, `recusado` e `furou` (75:314-319), e também para quem saiu do
   posto. O texto cru do banco diz "voce marcou que nao ia", o que é falso
   para quem foi marcado como falta pela liderança. A frase tem que servir
   aos dois: não afirma recusa, não afirma falta e não afirma presença. */
{
  const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
  const sql = readFileSync(join(raiz, 'supabase/75-pausado-nao-e-link-invalido-e-relatorio-nao-e-profecia.sql'), 'utf8');
  ok(/and e\.status not in \('recusado','furou'\)\s*\) then\s*raise exception 'RELATORIO_DE_QUEM_NAO_FOI/.test(sql),
    'o banco usa o mesmo código para posto recusado e para posto marcado como falta');
  const comoSai = (message) => humano({ code: 'P0001', message }, 'salvar');
  const doBanco = comoSai('RELATORIO_DE_QUEM_NAO_FOI: voce marcou que nao ia neste dia, entao nao da para relatar como foi.');
  /* se um dia o banco disser o motivo, a frase continua a mesma */
  const recusado = comoSai('RELATORIO_DE_QUEM_NAO_FOI: posto recusado neste culto.');
  const furou = comoSai('RELATORIO_DE_QUEM_NAO_FOI: posto marcado como falta neste culto.');
  ok(!doBanco.generico && doBanco.texto === recusado.texto && doBanco.texto === furou.texto,
    'recusado e falta saem com a mesma frase', JSON.stringify([doBanco.texto, recusado.texto, furou.texto]));
  ok(!/marc|recus|n[ãa]o ia|falt|furou|quem foi|compareceu|esteve|presen/i.test(doBanco.texto),
    'a frase não afirma recusa, falta nem presença', doBanco.texto);
  ok(/escala/i.test(doBanco.texto) && /líder deste culto/.test(doBanco.texto) && /quem organiza o ministério/.test(doBanco.texto),
    'a frase diz o que a escala registra e a quem recorrer', doBanco.texto);
}

console.log(`\nrelatório na hora: ${feitas - falhas}/${feitas}`);
if (falhas) process.exit(1);
