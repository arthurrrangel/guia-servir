/* O nome como ele aparece na tela. Roda com `npm test`.

   A regra que este arquivo protege é uma só e é conservadora: mexer apenas em
   nome que esteja INTEIRO em caixa alta; devolver intacto qualquer nome que já
   tenha uma minúscula. Os casos abaixo existem porque são os que quebram
   qualquer regra mais esperta que essa — d'Ávila, McDonald, preposição no
   começo do sobrenome. Se alguém um dia "melhorar" `emNome`, é aqui que a
   melhora vai mostrar o que ela custa. */
import { emNome } from '../lib/nome.ts';

const CASOS = [
  /* caixa alta: normaliza, com preposição minúscula no meio */
  ['CLAUDIO SOUZA DA SILVA', 'Claudio Souza da Silva'],
  ['SANDRA REGINA DOS SANTOS', 'Sandra Regina dos Santos'],
  ['MURILO E SILVA', 'Murilo e Silva'],
  ['ÁLVARO ANDRÉ', 'Álvaro André'],
  ['JOICE', 'Joice'],
  /* preposição no COMEÇO é sobrenome de quem assina assim: sobe */
  ['DA SILVA JUNIOR', 'Da Silva Junior'],
  /* já tem minúscula: não se toca, custe o que custar */
  ['Andréia Ferreira', 'Andréia Ferreira'],
  ["Maria d'Ávila", "Maria d'Ávila"],
  ['João McDonald', 'João McDonald'],
  ['Luciene', 'Luciene'],
  /* borda */
  ['  ANA  MARIA  ', 'Ana Maria'],
  ['', ''],
  [null, ''],
  [undefined, ''],
];

let mal = 0;
for (const [entrada, esperado] of CASOS) {
  const saiu = emNome(entrada);
  if (saiu !== esperado) {
    mal++;
    console.error(`MAL  ${JSON.stringify(entrada)} -> ${JSON.stringify(saiu)}  (esperado ${JSON.stringify(esperado)})`);
  }
}
if (mal) { console.error(`\nnome.test: ${mal} de ${CASOS.length} falharam`); process.exit(1); }
console.log(`nome.test: ${CASOS.length} passaram`);
