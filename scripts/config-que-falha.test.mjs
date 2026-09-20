/* LER `config` E FALHAR NÃO É O MESMO QUE NÃO TER `config` — 20/09/2026.

   Auditoria de backend. `linhasDaEquipe` só subia erro de `funcoes`, `vols` e
   `cultos`; `cfg` ficava de fora de propósito, porque "config pode vir nula
   por RLS, e isso é informação, não falha". Verdade pela metade: RLS negando
   devolve `{data: null, error: null}`, e um 5xx passageiro devolve `error`.
   Os dois viravam `config: null`, e `montarEstado` montava o PADRÃO.

   O estrago é do robô das 3h, não da tela: com a leitura de `config`
   falhando, o mês do Connect (limitePadrao 4, plantaoQtd 3) sai sorteado com
   teto 2 e um plantão só, e o e-mail diz que está montado.

   Este teste cobra as duas metades: RLS continua degradando em silêncio, e
   erro de verdade sobe. */
import { linhasDaEquipe } from '@/lib/ponte';

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => { feitas++; if (!c) { falhas++; console.log('  FALHOU:', rot, extra); } };

function fingeBanco(respostaDaConfig) {
  const tabela = (nome) => {
    const eu = {
      select() { return eu; }, eq() { return eu; }, gte() { return eu; },
      or() { return eu; }, in() { return eu; }, order() { return eu; },
      maybeSingle() { return nome === 'config' ? respostaDaConfig : { data: null, error: null }; },
      then(res) { return Promise.resolve(resposta()).then(res); },
    };
    const resposta = () => {
      if (nome === 'funcoes') return { data: [{ id: 'f1', nome: 'PROJEÇÃO', equipe_id: 'e1', ativa: true, ordem: 1 }], error: null };
      if (nome === 'voluntarios') return { data: [{ id: 'v1', nome: 'Ana', ativo: true, equipe_id: 'e1' }], error: null };
      return { data: [], error: null };
    };
    return eu;
  };
  return { from: tabela };
}

/* 1. RLS negou: `config` vem nula, sem erro. A carga TEM que seguir. */
{
  const r = await linhasDaEquipe(fingeBanco({ data: null, error: null }), 'e1', '2026-01-01');
  ok(r.config === null || r.config === undefined, 'config nula por RLS não derruba a carga', JSON.stringify(r.config));
  ok((r.funcoes || []).length === 1, 'e o resto do estado veio junto');
}

/* 2. `maybeSingle` sem linha devolve PGRST116, que também é o caso legítimo. */
{
  const r = await linhasDaEquipe(fingeBanco({ data: null, error: { code: 'PGRST116', message: 'no rows' } }), 'e1', '2026-01-01');
  ok((r.funcoes || []).length === 1, 'PGRST116 é "não tem linha", e não derruba a carga');
}

/* 3. A LEITURA FALHOU DE VERDADE: tem que SUBIR, e não virar padrão calado. */
{
  let subiu = null;
  try {
    await linhasDaEquipe(fingeBanco({ data: null, error: { code: '500', message: 'canceling statement due to statement timeout' } }), 'e1', '2026-01-01');
  } catch (e) { subiu = e; }
  ok(subiu !== null, 'erro de verdade na leitura de config SOBE em vez de virar config padrão');
  ok(/timeout/i.test(String(subiu?.message || '')), 'e sobe com o motivo original', String(subiu?.message));
}

if (falhas) { console.log(`config-que-falha: ${falhas} falha(s) em ${feitas}`); process.exit(1); }
console.log(`config-que-falha: ${feitas}/${feitas} ok`);
