/* O ROBÔ DAS 3H SÓ PODE MONTAR MÊS VAZIO — E ISSO É LOAD-BEARING.

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
   líder, às 3 da manhã, sem ninguém olhando.

   POR ISSO A REGRA SAIU DO `if` E VIROU `decisaoDoRobo` em lib/engine.ts:
   com nome, com o motivo escrito em cima, e com esta tabela-verdade. A
   primeira versão deste arquivo lia o texto do route.ts procurando palavras,
   e eu descobri — sabotando de propósito — que ela passava mesmo depois de
   eu remover o guarda. Teste que não falha não é teste.

   Roda com `npm test`. */

import { decisaoDoRobo } from '../lib/engine.ts';

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

console.log(falhas ? `\ncron-guarda: ${falhas} falha(s) em ${feitas}` : `\ncron-guarda: ${feitas}/${feitas} ok`);
process.exit(falhas ? 1 : 0);
