/* A COLUNA QUE O BANCO RECUSA NÃO PODE DERRUBAR A TELA.

   Escrito em 18/09/2026, depois de derrubar o Painel de produção.

   O que aconteceu: a migração 48 criou `voluntarios.sexo`. Neste banco o
   GRANT é POR COLUNA, e no Postgres coluna nova não herda GRANT nenhum. Eu
   acrescentei `sexo` à lista que `linhasDaEquipe` pede em toda carga, e o
   PostgREST passou a recusar o pedido INTEIRO com 42501 — não a coluna, o
   pedido. Painel, Escala e Time morreram juntos, mostrando "LOUVOR · 0" com
   os 13 voluntários intactos no banco.

   O grant consertou. Este teste existe para que a PRÓXIMA coluna não repita:
   se o banco recusar as colunas opcionais, a carga tem que seguir sem elas.

   Roda com `node --import ./scripts/_ts.mjs scripts/ponte-colunas.test.mjs`. */

import { linhasDaEquipe } from '../lib/ponte.ts';

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => {
  feitas++;
  if (!c) { falhas++; console.log('  FALHOU:', rot, extra); }
};

/* Um dublê do cliente do Supabase: registra o que foi pedido e responde o que
   o teste mandar. Nada de rede. */
function fingeBanco({ recusa = [], erroDuro = null } = {}) {
  const pedidos = [];
  const tabela = (nome) => {
    const estado = { nome, cols: '*' };
    const eu = {
      select(cols) { estado.cols = cols; return eu; },
      eq() { return eu; },
      gte() { return eu; },
      in() { return eu; },
      maybeSingle() { return resposta(); },
      order() { return resposta(); },
      then(res) { return Promise.resolve(resposta()).then(res); },
    };
    const resposta = () => {
      pedidos.push({ tabela: nome, cols: estado.cols });
      if (nome === 'voluntarios') {
        if (erroDuro) return { data: null, error: erroDuro };
        const pedidas = String(estado.cols).split(',');
        const proibida = pedidas.find(c => recusa.includes(c.trim()));
        if (proibida) {
          return { data: null, error: { code: '42501', message: 'permission denied for table voluntarios' } };
        }
        return { data: [{ id: 'v1', nome: 'Ana', ativo: true, equipe_id: 'e1' }], error: null };
      }
      return { data: [], error: null };
    };
    return eu;
  };
  return { cliente: { from: tabela }, pedidos };
}

/* 1. caminho feliz: pede tudo, inclusive as opcionais, e não tenta de novo */
{
  const { cliente, pedidos } = fingeBanco();
  const r = await linhasDaEquipe(cliente, 'e1', '2026-01-01');
  const aVoluntarios = pedidos.filter(p => p.tabela === 'voluntarios');
  ok(aVoluntarios.length === 1, 'com permissão, pede uma vez só', String(aVoluntarios.length));
  ok(/sexo/.test(aVoluntarios[0].cols), 'e pede a coluna opcional', aVoluntarios[0].cols);
  ok((r.voluntarios || []).length === 1, 'e traz o voluntário');
}

/* 2. O CASO QUE QUEBROU A PRODUÇÃO: o banco recusa `sexo`. */
{
  const { cliente, pedidos } = fingeBanco({ recusa: ['sexo'] });
  let erro = null; let r = null;
  try { r = await linhasDaEquipe(cliente, 'e1', '2026-01-01'); } catch (e) { erro = e; }
  const aVoluntarios = pedidos.filter(p => p.tabela === 'voluntarios');
  ok(!erro, 'a carga NÃO estoura quando o banco recusa uma coluna opcional',
    erro ? String(erro.message || erro) : '');
  ok(aVoluntarios.length === 2, 'tenta de novo, uma vez', String(aVoluntarios.length));
  ok(/sexo/.test(aVoluntarios[0].cols), 'a primeira tentativa pede a opcional');
  ok(!/sexo/.test(aVoluntarios[1].cols), 'a segunda vai sem ela', aVoluntarios[1].cols);
  ok(r && (r.voluntarios || []).length === 1, 'e a tela recebe o time mesmo assim');
}

/* 3. tabela realmente fechada: aí o erro SOBE. Esconder isso seria pior —
      a tela mostraria "ninguém no time" com o banco cheio. */
{
  const { cliente } = fingeBanco({ recusa: ['sexo', 'id', 'nome'] });
  let erro = null;
  try { await linhasDaEquipe(cliente, 'e1', '2026-01-01'); } catch (e) { erro = e; }
  ok(!!erro, 'se nem as essenciais passam, o erro sobe em vez de virar lista vazia');
  ok(erro && erro.code === '42501', 'e sobe com o código do Postgres', erro && erro.code);
}

/* 4. erro que NÃO é de permissão não vira segunda tentativa: 5xx passageiro
      tem que subir, senão o cron lê "ninguém escalado" e apaga o mês. */
{
  const { cliente, pedidos } = fingeBanco({ erroDuro: { code: '500', message: 'boom' } });
  let erro = null;
  try { await linhasDaEquipe(cliente, 'e1', '2026-01-01'); } catch (e) { erro = e; }
  const aVoluntarios = pedidos.filter(p => p.tabela === 'voluntarios');
  ok(!!erro, 'erro que não é de permissão sobe');
  ok(aVoluntarios.length === 1, 'e não gera segunda tentativa', String(aVoluntarios.length));
}

if (falhas) { console.log(`ponte-colunas: ${falhas} falha(s) em ${feitas}`); process.exit(1); }
console.log(`ponte-colunas: ${feitas}/${feitas} ok`);
