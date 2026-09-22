/* OS CÓDIGOS QUE O BANCO DEVOLVE E AS FRASES QUE A TELA TEM, CRUZADOS.

   ===========================================================================
   O BURACO QUE ESTE ARQUIVO FECHA

   `PORBANCO`, em `lib/demandas/regras.ts`, é a tabela que transforma
   `ATRASO_PRECISA_MOTIVO` em "Esta demanda passou do prazo. Diga o que
   atrasou antes de concluir." Cada chave dela é uma promessa sobre uma
   palavra que o SQL devolve.

   Medido em 22/09/2026 por uma auditoria independente: renomear essa chave
   (para `ATRASO_PRECISA_MOTIVOS`, digamos) deixa `bash
   scripts/demandas-banco.sh` VERDE do começo ao fim, porque o harness de
   banco não conhece o TypeScript, e deixa `npm test` verde também, porque a
   varredura de `demandas.test.mjs` percorre `Object.keys(PORBANCO)` — ou
   seja, ela varre exatamente a lista que acabou de ser estragada, e a chave
   nova tem frase própria tanto quanto a antiga tinha.

   O que quebra, em silêncio, é a produção: a pessoa toca em "Concluir" numa
   demanda atrasada, o banco responde `ATRASO_PRECISA_MOTIVO`, a tabela não
   acha a chave, e a frase vira "Não consegui. Tente de novo." — que manda
   repetir uma coisa que nunca vai funcionar sem o motivo do atraso.

   As duas listas só podem ser conferidas UMA CONTRA A OUTRA, e é isso aqui.

   ===========================================================================
   DE ONDE VEM CADA LADO

   · O LADO DO BANCO não vem de expressão regular em arquivo de migração. Um
     código escrito na versão da 52 de `dem_mover` e apagado pela 85 ainda
     está no disco, e contá-lo seria inventar um órfão. A lista vem do BANCO
     MONTADO: `scripts/demandas-banco.sh` pergunta ao Postgres o corpo de
     cada função viva (`pg_get_functiondef`) e tira dali cada `'erro','X'`.
     É o que o servidor responde HOJE, com todas as migrações aplicadas em
     ordem.

   · O LADO DA TELA é `CODIGOS`, que é `Object.keys(PORBANCO)` exportado.
     Nada é repetido à mão aqui: uma lista copiada envelhece calada.

   Uso (via scripts/demandas-banco.sh):
     node --import ./scripts/_ts.mjs scripts/demandas-codigos.test.mjs <arquivo>
*/

import { readFileSync } from 'node:fs';
import { CODIGOS, recadoDoErro } from '../lib/demandas/regras.ts';
import { rpcCom } from '../lib/demandas/api.ts';

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => {
  feitas++;
  if (!c) { falhas++; console.log('  FALHOU:', rot, extra ? '\n           ' + extra : ''); }
};

const arquivo = process.argv[2] || '/tmp/_codigos-do-banco.txt';
let doBanco = [];
try {
  doBanco = readFileSync(arquivo, 'utf8').split('\n').map(x => x.trim()).filter(Boolean);
} catch (e) {
  console.log(`  FALHOU: não achei a lista de códigos do banco em ${arquivo} (${e.code})`);
  console.log('           este teste roda por dentro de scripts/demandas-banco.sh, que a produz.');
  process.exit(1);
}

/* PISO, PARA A VARREDURA NÃO FICAR VERDE VARRENDO NADA.

   Se a consulta que produz o arquivo quebrar e devolver duas linhas, os dois
   cruzamentos abaixo passariam sem ter conferido coisa nenhuma. Medido no
   banco montado em 22/09/2026: 50 códigos. */
ok(doBanco.length >= 45, 'a lista do banco veio inteira', `${doBanco.length} código(s)`);
ok(CODIGOS.length >= 50, 'a lista da tela veio inteira', `${CODIGOS.length} chave(s)`);

/* ===========================================================================
   1 · O QUE O BANCO DEVOLVE E A TELA NÃO SABE LER
   =========================================================================== */

/* `REGRA` NÃO É UM CÓDIGO, É UM DESVIO.

   Ele sai de todo `exception when check_violation` do SQL e vem SEMPRE
   acompanhado de `regra` (o `SQLERRM` cru do Postgres). `recadoDoErro` o trata
   num ramo próprio, ANTES de olhar `PORBANCO`, e traduz pela tabela `PORCHECK`
   — que casa pelo nome da restrição. Pôr `REGRA` em `PORBANCO` daria uma
   frase fixa a treze restrições diferentes, que é o defeito que a `PORCHECK`
   existe para não cometer.

   A exceção não fica na palavra de quem escreveu: logo abaixo ela é MEDIDA. */
const SO_NO_BANCO_DE_PROPOSITO = ['REGRA'];

for (const c of doBanco) {
  if (SO_NO_BANCO_DE_PROPOSITO.includes(c)) continue;
  ok(CODIGOS.includes(c), `"${c}" sai do banco e tem frase em PORBANCO`,
    'código sem chave vira palavra em MAIÚSCULA na cara de quem toca o botão');
}

/* e a exceção prova que é exceção: `REGRA` chega traduzido pelo nome da
   restrição, e o caminho genérico dele não é a frase de "tente de novo" */
{
  const comCheck = recadoDoErro({ erro: 'REGRA', regra: 'new row violates check constraint "ck_urgente"' });
  ok(/Urgente/.test(comCheck), 'REGRA é traduzido pela PORCHECK, e por isso não precisa de chave', comCheck);
  const semCheck = recadoDoErro({ erro: 'REGRA', regra: 'check constraint "ck_que_ninguem_escreveu"' });
  ok(semCheck !== 'Não consegui. Tente de novo.' && !/constraint/.test(semCheck),
    'e restrição desconhecida ainda diz alguma coisa, sem jargão do Postgres', semCheck);
}

/* ===========================================================================
   2 · O QUE A TELA TRADUZ E O BANCO NÃO DEVOLVE MAIS
   =========================================================================== */

/* OS CINCO ÓRFÃOS LEGÍTIMOS: ELES NASCEM EM `lib/demandas/api.ts`.

   `rpcCom` produz código próprio para cinco situações que o SQL nunca chega a
   responder, porque em quatro delas a resposta nem sai do Postgres como
   negócio:

     SEM_CONFIG        o app sem as chaves do Supabase: não há chamada.
     VAZIO             a RPC respondeu 200 com corpo nulo.
     SEM_SISTEMA       PGRST202: o schema `demandas` não existe nesse banco.
     SEM_PERMISSAO_DB  42501, permissão faltando no próprio Postgres.
     VINCULO_EM_USO    23503, violação de chave estrangeira.

   Os três últimos têm nome próprio justamente para não caírem em `humano()` e
   voltarem falando a língua das ESCALAS ("ministério", "escala") dentro das
   Demandas.

   A LISTA NÃO É UMA DESCULPA ESCRITA: cada um é PRODUZIDO aqui embaixo, pelo
   `rpcCom` de verdade. Uma exceção que ninguém mede é como um código morto
   entra na lista e nunca mais sai. */
const SO_NA_TELA_DE_PROPOSITO = {
  SEM_CONFIG: async () => rpcCom(null, 'dem_quem_sou', {}),
  VAZIO: async () => rpcCom({ rpc: async () => ({ data: null, error: null }) }, 'dem_ver', {}),
  SEM_SISTEMA: async () => rpcCom({ rpc: async () => ({ data: null, error:
    { code: 'PGRST202', message: 'Could not find the function public.dem_quem_sou' } }) }, 'dem_quem_sou', {}),
  SEM_PERMISSAO_DB: async () => rpcCom({ rpc: async () => ({ data: null, error:
    { code: '42501', message: 'permission denied for schema demandas' } }) }, 'dem_mover', {}),
  VINCULO_EM_USO: async () => rpcCom({ rpc: async () => ({ data: null, error:
    { code: '23503', message: 'violates foreign key constraint "demandas_setor_responsavel_fkey"' } }) },
    'dem_ajustar', {}),
};

for (const c of CODIGOS) {
  if (doBanco.includes(c)) continue;
  const nasceNaTela = Object.prototype.hasOwnProperty.call(SO_NA_TELA_DE_PROPOSITO, c);
  ok(nasceNaTela, `"${c}" tem frase na tela e alguém o produz`,
    'nenhuma função viva do banco devolve este código e `api.ts` também não: '
    + 'ou a chave foi renomeada e a antiga virou letra morta, ou o SQL parou de devolvê-la');
}

for (const [c, produzir] of Object.entries(SO_NA_TELA_DE_PROPOSITO)) {
  const r = await produzir();
  ok(r.erro === c, `"${c}" é mesmo produzido por api.ts`, `rpcCom devolveu ${JSON.stringify(r.erro)}`);
  ok(CODIGOS.includes(c), `"${c}" continua tendo chave em PORBANCO`);
  ok(recadoDoErro(r) !== 'Não consegui. Tente de novo.',
    `e "${c}" não cai na frase genérica pelo caminho de verdade`, recadoDoErro(r));
}

/* ===========================================================================
   3 · E CADA CÓDIGO DO BANCO CHEGA NA TELA COMO FRASE, NÃO COMO SENHA
   =========================================================================== */

/* o cruzamento acima garante que a CHAVE existe. Isto garante que ela vale
   alguma coisa: chave apontando para string vazia passaria no item 1. */
const VAZAMENTO = /ministério|escala|voluntári|organizador|posto|culto/i;
for (const c of doBanco) {
  if (SO_NO_BANCO_DE_PROPOSITO.includes(c)) continue;
  const frase = recadoDoErro({ erro: c });
  ok(frase.length > 10, `"${c}" vira uma frase, e não uma senha`, JSON.stringify(frase));
  ok(frase !== 'Não consegui. Tente de novo.', `"${c}" não cai na frase genérica`, frase);
  ok(!VAZAMENTO.test(frase), `"${c}" fala a língua das Demandas`, frase);
  ok(frase !== c, `"${c}" não é a própria palavra em maiúscula`);
}

console.log(falhas
  ? `\ndemandas-codigos: ${falhas} falha(s) em ${feitas} (${doBanco.length} códigos no banco, ${CODIGOS.length} chaves na tela)`
  : `\ndemandas-codigos: ${feitas}/${feitas} ok (${doBanco.length} códigos no banco, ${CODIGOS.length} chaves na tela)`);
process.exit(falhas ? 1 : 0);
