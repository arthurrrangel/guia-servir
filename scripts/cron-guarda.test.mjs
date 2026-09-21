/* O ROBÔ SÓ PODE MONTAR MÊS VAZIO — E ISSO É LOAD-BEARING.

   19/09/2026. `app/api/cron/route.ts` e `lib/db.ts` gravam a escala por
   caminhos DIFERENTES:

     · a tela usa `salvarDia`, que calcula a diferença (`planoDoDia`) e toca
       só no que mudou — precisa disso porque regravar linha que não mudou
       fazia o gatilho recusar quem avisou "não posso" depois de escalado (o
       caso do João Victor, 17/09), e porque a ordem entre apagar e inserir
       importa na permuta (19/09);

     · o robô usa a RPC `salvar_dia`, que APAGA a escala inteira da equipe
       naquele domingo e regrava.

   Duas implementações da mesma operação normalmente é defeito. Esta é
   segura por UM motivo, e só por ele: o robô só grava quando NENHUM dia do
   mês tem gente. Não há o que preservar, então diferença e wipe-and-write
   dão o mesmo resultado.

   O problema é que esse motivo não parecia um motivo. A regra vivia dentro
   de dois `if` no meio do laço, escrita como regra de produto ("não
   re-sortear o que o líder pôs à mão"). Quem fosse afrouxá-la um dia estaria
   pensando em produto — "seria bom o robô completar o mês pela metade" — sem
   saber que estava soltando a gravação do robô em cima do trabalho manual do
   líder, às 9 da manhã do dia 26 — a hora em que ele também está no app.

   POR ISSO A REGRA SAIU DO `if` E VIROU `decisaoDoRobo` em lib/engine.ts:
   com nome, com o motivo escrito em cima, e com esta tabela-verdade. A
   primeira versão deste arquivo lia o texto do route.ts procurando palavras,
   e eu descobri — sabotando de propósito — que ela passava mesmo depois de
   eu remover o guarda. Teste que não falha não é teste.

   Roda com `npm test`. */

import { decisaoDoRobo, avisarDiaSemNinguem, bancoAtrasado } from '../lib/engine.ts';

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => { feitas++; if (!c) { falhas++; console.log('  FALHOU:', rot, extra); } };

/* ------------------------------------------------- a tabela-verdade */
const casos = [
  /* montados, no mês, esperado, por quê */
  [0, 5, 'monta',   'mês inteiro vazio: é para isso que o robô existe'],
  [0, 4, 'monta',   'mês de quatro domingos, vazio'],
  [5, 5, 'ja-tem',  'mês inteiro montado: não toca'],
  [4, 4, 'ja-tem',  'idem, com quatro'],
  [1, 5, 'parcial', 'UM dia montado já basta para o robô não mexer'],
  [4, 5, 'parcial', 'quase todo montado ainda é parcial'],
  [2, 5, 'parcial', 'no meio'],
  /* bordas que não deveriam acontecer, mas que não podem virar gravação */
  [0, 0, 'ja-tem',  'mês sem culto nenhum: não há o que montar'],
  [3, 0, 'ja-tem',  'contagem incoerente não pode virar "monta"'],
  [7, 5, 'ja-tem',  'mais montados que dias também não'],
];
for (const [m, n, esperado, porque] of casos) {
  const r = decisaoDoRobo(m, n);
  ok(r === esperado, `${m}/${n} → ${esperado} (${porque})`, `veio ${r}`);
}

/* ---------------------------------------- a propriedade que importa

   Qualquer entrada em que exista pelo menos UM dia montado NÃO pode
   resultar em 'monta'. Esta é a frase inteira do guarda, e é ela que segura
   a divergência de gravação. Varrida exaustivamente em vez de amostrada:
   o espaço é pequeno e a garantia é grande. */
{
  let furos = 0;
  for (let n = 0; n <= 10; n++) {
    for (let m = 0; m <= 10; m++) {
      if (m > 0 && decisaoDoRobo(m, n) === 'monta') furos++;
    }
  }
  ok(furos === 0,
    'com QUALQUER dia já montado, o robô nunca decide montar (121 combinações)',
    `${furos} furo(s)`);
}
{
  /* e o contrário: mês vazio com dias de verdade SEMPRE monta, senão o robô
     deixou de trabalhar e ninguém ia perceber até o mês virar */
  let mudos = 0;
  for (let n = 1; n <= 10; n++) if (decisaoDoRobo(0, n) !== 'monta') mudos++;
  ok(mudos === 0, 'mês vazio com dias de verdade sempre monta', `${mudos} caso(s) mudo(s)`);
}

/* ------------------------------- e o robô de fato usa esta função

   A tabela-verdade acima não vale nada se o route.ts voltar a decidir
   sozinho. Isto é leitura de texto e tem o alcance curto que texto tem —
   mas a decisão de verdade está testada acima, onde não depende de regex. */
{
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
  const cron = readFileSync(join(raiz, 'app/api/cron/route.ts'), 'utf8');
  ok(/decisaoDoRobo\(montados\.length, dias\.length\)/.test(cron),
    'o robô chama decisaoDoRobo em vez de decidir sozinho');
  ok(!/montados\.length === dias\.length/.test(cron),
    'e a comparação antiga não voltou junto por copiar e colar');
}

/* ========================================================================
   A COBRANÇA DE QUINTA E O DIA SEM NINGUÉM — 21/09/2026

   O defeito que esta tabela-verdade fixa: `if (!dia) continue` calava sobre
   um domingo REGULAR em que a equipe não tinha nada. É o pior estado
   possível — ninguém escalado, quatro dias antes — e era o único que não
   gerava aviso nenhum, porque `montarEstado` não materializa o dia e o cron
   leu essa ausência como "não é comigo".

   Os dois casos que a função precisa separar, e nenhum dos dois é óbvio:
   evento de OUTRO ministério é silêncio certo (cobrar seria ruído que ensina
   a ignorar o robô), e domingo regular vazio é alarme.
   ======================================================================== */
{
  ok(avisarDiaSemNinguem(true, true) === true,
     'domingo regular, equipe com time, nada montado: AVISA');
  ok(avisarDiaSemNinguem(false, true) === false,
     'evento de outro ministerio: cala (o dia nao e desta equipe)');
  ok(avisarDiaSemNinguem(true, false) === false,
     'equipe sem time ou sem funcao ativa: cala (nao ha o que montar)');
  ok(avisarDiaSemNinguem(false, false) === false,
     'evento alheio E sem time: cala');
}

/* e o robô de fato usa ESTA função, e não voltou a calar sozinho */
{
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
  const cron = readFileSync(join(raiz, 'app/api/cron/route.ts'), 'utf8');
  ok(/avisarDiaSemNinguem\(regular, temTime\)/.test(cron),
     'a cobranca chama avisarDiaSemNinguem em vez de um `continue` seco');
  ok(!/const dia = S\.escalas\[data\];\s*\n\s*if \(!dia\) continue;/.test(cron),
     'e o `if (!dia) continue` seco nao voltou por copiar e colar');

  /* A RÉGUA DO BANCO. O robô que escreve sobre banco atrasado grava no lugar
     errado em silêncio — medido em 21/09 com o banco na 60.

     A PRIMEIRA VERSÃO DESTES DOIS CASOS ERA VAZIA, e eu só descobri sabotando:
     renomeei a DECLARAÇÃO de `VERSAO_MINIMA_DO_BANCO` e o teste passou, porque
     os USOS ainda tinham a palavra e o regex só procurava a palavra.

     SÃO TRÊS CAMADAS, E CADA UMA PEGA UMA COISA — dito assim para ninguém
     confiar demais nesta:
       · a tabela-verdade lá embaixo é onde a DECISÃO está testada de verdade,
         sem regex nenhum;
       · estes dois regex pinam o FIO: que o route.ts chama a função em vez de
         decidir sozinho de novo;
       · e `tsc --noEmit`, que roda no `npm run build`, é quem pega a renomeação
         quebrada — medido: três erros TS2304 naquele mesmo arquivo.
     Texto não vira verificador de tipo, e este arquivo não vai fingir que
     vira. */
  ok(/bancoAtrasado\(noBanco, VERSAO_MINIMA_DO_BANCO\)/.test(cron),
     'o robo confere a versao do banco antes de escrever, chamando bancoAtrasado');
  ok(/from\('schema_versao'\)/.test(cron),
     'e a le de schema_versao, que e a regua que as migracoes mantem');

  /* O MÊS PELA METADE PRECISA CHEGAR A QUEM CONSERTA. */
  ok(/parcial: true/.test(cron),
     'mes incompleto manda e-mail ao lider DAQUELE ministerio, nao so ao global');

  /* E A HORA. `vercel.json` agenda 0 12 * * *, que e 09:00 em Brasilia.
     "3 da manha" era o argumento implicito de que a corrida do robo com o
     lider nao acontece — e as 9h do dia 26 ela acontece. */
  const vercel = readFileSync(join(raiz, 'vercel.json'), 'utf8');
  ok(/"0 12 \* \* \*"/.test(vercel), 'o agendamento continua 0 12 * * * (09:00 BRT)');
  ok(!/rob[oô] das 3h|3 da manh/.test(cron), 'o route.ts nao diz mais "3h"');
}

/* a tabela-verdade da régua, que é onde a decisão de verdade mora */
{
  ok(bancoAtrasado(65, 66) === true,  'banco na 65, codigo pede 66: ATRASADO');
  ok(bancoAtrasado(66, 66) === false, 'banco na 66, codigo pede 66: em dia');
  ok(bancoAtrasado(70, 66) === false, 'banco ADIANTE do codigo nao e erro: migrar antes do deploy e a ordem certa');
  ok(bancoAtrasado(null, 66) === true,      'banco sem regua nenhuma conta como atrasado');
  ok(bancoAtrasado(undefined, 66) === true, 'leitura vazia tambem');
  ok(bancoAtrasado(0, 66) === true,         'e zero tambem');
}

console.log(falhas ? `\ncron-guarda: ${falhas} falha(s) em ${feitas}` : `\ncron-guarda: ${feitas}/${feitas} ok`);
process.exit(falhas ? 1 : 0);
