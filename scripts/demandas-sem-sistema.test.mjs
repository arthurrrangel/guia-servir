/* "A FUNÇÃO NÃO EXISTE" NÃO É "VOCÊ NÃO ESTÁ CADASTRADO".

   20/09/2026. Medido no banco de produção, pelo SQL Editor, logado como o dono
   do sistema:

       schema `demandas` existe           false
       funções dem_* em public            NENHUMA
       tabelas demandas/setores/membros   NENHUMA em qualquer schema

   A migração 50 nunca foi aplicada naquele projeto. As telas de Demandas
   estão no ar; o banco delas não existe. E a tela dizia:

       "Você não está no sistema de demandas. Você está logado como
        <e-mail>, mas esse e-mail ainda não foi cadastrado aqui. Quem
        administra o sistema de demandas cadastra em Ajustes, e leva um
        minuto."

   O estrago não é o texto, é o destino: manda procurar em Ajustes um cadastro
   que não pode existir, numa aba que só aparece para admin — que ninguém é,
   porque a tabela de membros não existe. Beco sem saída com placa para dentro.

   E TINHA UM SEGUNDO DEFEITO ATRÁS DO PRIMEIRO, pior porque tira acesso:

   a casca descarta o token guardado quando a resposta é negativa, para um link
   velho não sombrear o login por e-mail. O gatilho pegava QUALQUER negativa,
   inclusive `REDE`. Quem entra pelo link do WhatsApp e cai num 5xx passageiro
   perdia o link — e ele só existe naquela mensagem. Perda de acesso causada
   por um erro que ia passar em três segundos.

   Este arquivo fecha as duas classes. Roda com `npm test`. */

import { ehSemSistema, ehRecusaDeIdentidade, rpcCom } from '../lib/demandas/api.ts';

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => { feitas++; if (!c) { falhas++; console.log('  FALHOU:', rot, extra); } };

/* ---------------------------------------- 1. o que É "sistema não instalado" */
const NAO_INSTALADO = [
  [{ code: 'PGRST202', message: 'Could not find the function public.dem_quem_sou(p_token)' },
   'PGRST202, que foi exatamente o que produção devolveu'],
  [{ code: 'PGRST202', message: '' }, 'PGRST202 sem texto'],
  [{ message: 'Could not find the function public.dem_lista' }, 'o texto do PostgREST, sem código'],
  [{ message: 'schema "demandas" does not exist' }, 'o schema inteiro faltando'],
];
for (const [erro, rot] of NAO_INSTALADO) ok(ehSemSistema(erro), `reconhece: ${rot}`, JSON.stringify(erro));

/* -------------------------------- 2. e o que NÃO é, para não virar desculpa

   Isto é metade do valor do teste: um detector largo demais transformaria
   falha de permissão e queda de rede em "não instalado", e aí a tela mentiria
   de um jeito novo em vez do antigo. */
const OUTRAS_COISAS = [
  [{ code: '42501', message: 'permission denied for schema demandas' }, 'permissão negada'],
  [{ code: '500', message: 'internal server error' }, '5xx do servidor'],
  [{ message: 'Failed to fetch' }, 'rede caída'],
  [{ code: 'PGRST301', message: 'JWT expired' }, 'sessão expirada'],
  [{ code: '23505', message: 'duplicate key value violates unique constraint' }, 'chave duplicada'],
  [{}, 'erro sem nada dentro'],
];
for (const [erro, rot] of OUTRAS_COISAS) ok(!ehSemSistema(erro), `NÃO confunde com: ${rot}`, JSON.stringify(erro));

/* ------------------- 3. quando o link guardado pode ser descartado, e só aí */
ok(ehRecusaDeIdentidade({ ok: false, erro: 'SEM_ACESSO' }),
  'token que não é de ninguém: descarta e tenta pelo e-mail');
ok(ehRecusaDeIdentidade({ ok: false, erro: 'LINK_INVALIDO' }),
  'link inválido: descarta');

for (const erro of ['REDE', 'SEM_SISTEMA', 'SEM_CONFIG', 'VAZIO']) {
  ok(!ehRecusaDeIdentidade({ ok: false, erro }),
    `${erro} NÃO queima o link da pessoa (ele só existe na mensagem do WhatsApp)`);
}
ok(!ehRecusaDeIdentidade({ ok: true }), 'resposta boa não descarta nada');

/* ---------- 4. E O CAMINHO QUE USA OS PREDICADOS, que é o que importa

   ESTE BLOCO EXISTE PORQUE O ARQUIVO SEM ELE ERA VERDE COM O DEFEITO DE VOLTA.

   Sabotei `rpc` apagando a linha `if (ehSemSistema(error)) return ...` e os
   casos 1 a 3 continuaram passando: eles mediam os predicados, não a
   tradução. É a mesma armadilha que `cron-guarda.test.mjs` já tinha pago
   aqui, cometida de novo no mesmo dia. Agora o teste entrega um dublê de
   cliente e cobra o RESULTADO. */
const dubleQueFalha = (error) => ({ rpc: async () => ({ data: null, error }) });
const dubleQueResponde = (data) => ({ rpc: async () => ({ data, error: null }) });

{
  const r = await rpcCom(dubleQueFalha({ code: 'PGRST202', message: 'Could not find the function public.dem_quem_sou' }), 'dem_quem_sou', {});
  ok(r.erro === 'SEM_SISTEMA', 'PGRST202 chega na tela como SEM_SISTEMA', JSON.stringify(r));

  const r2 = await rpcCom(dubleQueFalha({ code: '500', message: 'boom' }), 'dem_quem_sou', {});
  ok(r2.erro === 'REDE', '5xx continua sendo REDE, e não vira "não instalado"', JSON.stringify(r2));

  const r3 = await rpcCom(dubleQueFalha({ code: '42501', message: 'permission denied' }), 'dem_lista', {});
  ok(r3.erro === 'REDE', 'permissão negada continua REDE', JSON.stringify(r3));

  const r4 = await rpcCom(null, 'dem_quem_sou', {});
  ok(r4.erro === 'SEM_CONFIG', 'sem cliente configurado dá SEM_CONFIG');

  const r5 = await rpcCom(dubleQueResponde({ ok: true, nome: 'Arthur' }), 'dem_quem_sou', {});
  ok(r5.ok === true && r5.nome === 'Arthur', 'resposta boa passa inteira', JSON.stringify(r5));

  const r6 = await rpcCom(dubleQueResponde(null), 'dem_quem_sou', {});
  ok(r6.erro === 'VAZIO', 'resposta nula vira VAZIO, e VAZIO não queima o token');
  ok(!ehRecusaDeIdentidade(r6), 'e VAZIO de fato não queima o token');
}

console.log(falhas
  ? `\ndemandas-sem-sistema: ${falhas} falha(s) em ${feitas}`
  : `\ndemandas-sem-sistema: ${feitas}/${feitas} ok`);
process.exit(falhas ? 1 : 0);
