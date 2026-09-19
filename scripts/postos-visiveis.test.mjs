/* NENHUM POSTO PODE SUMIR DA ESCALA EM SILÊNCIO.

   19/09/2026. Este é o defeito mais caro que a auditoria de arquitetura
   encontrou, e ele estava no ar havia meses sem ninguém notar.

   `funcoes.tipos` diz em que tipo de culto o posto existe, e `cultos.tipo` é
   COLUNA GERADA a partir do dia da semana — ou seja, só produz 'domingo' ou
   'follow'. Qualquer outra palavra no array não casa com nada, e o posto
   simplesmente deixa de existir para o motor.

   O que torna isso grave não é sumir: é sumir CALADO. Rodado no motor de
   verdade, com dois postos marcados `tipos = ['culto']`:

       funcoesDoDia  : [ 'PROJEÇÃO' ]
       slots gerados : [ 'PROJEÇÃO' ]
       vagasDe       : []              ← nenhuma vaga aberta
       resumoDia     : { total: 1 }    ← e o dia diz que está completo

   `vagasDe` lista o que falta DENTRO de `funcoesDoDia`; se o posto não está
   nessa lista, ele não falta. O líder abre a tela, vê tudo verde, e não tem
   como desconfiar.

   No banco: quinze postos ativos com `tipos = {culto}` — o GUIA Kids inteiro
   (9), a Livraria inteira (2) e quatro do Connect. E não foi a primeira vez: a
   migração 18 já tinha tirado 'evento' do Louvor pelo mesmo motivo, e a 29
   reintroduziu a mesma classe de defeito com outra palavra.

   Três trancas, e este arquivo é a terceira:
     1. o CHECK em `funcoes.tipos` (migração 53) — o banco recusa a palavra;
     2. o filtro em `lib/ponte.ts` — se vier mesmo assim, o posto aparece nos
        dois tipos em vez de sumir (errar para o lado visível);
     3. este teste — a regra dita em código executável, para a quarta vez não
        acontecer.

   Roda com `npm test`. */

import * as E from '../lib/engine.ts';
import { montarEstado } from '../lib/ponte.ts';

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => { feitas++; if (!c) { falhas++; console.log('  FALHOU:', rot, extra); } };

const TIPOS_QUE_EXISTEM = ['domingo', 'follow'];

/* ----------------------------------- 1. o motor só conhece dois tipos */
{
  const vistos = new Set();
  for (const d of [...E.domingosDoMes(2026, 10), ...E.sabadosDoFollow(2026, 10)]) vistos.add(E.tipoDoDia(d));
  ok([...vistos].every(t => TIPOS_QUE_EXISTEM.includes(t)),
    'tipoDoDia só produz domingo e follow', [...vistos].join(','));
  ok(vistos.has('domingo') && vistos.has('follow'), 'e produz os dois de verdade', [...vistos].join(','));
}

/* ------------------- 2. posto com palavra inventada NÃO some pela ponte */
{
  const linhas = {
    equipe: 'GUIA Kids',
    funcoes: [
      { id: 'f1', nome: 'BERÇÁRIO PROFESSORA', ativa: true, ordem: 1, simultanea: true, tipos: ['culto'] },
      { id: 'f2', nome: 'LANCHE', ativa: true, ordem: 2, simultanea: true, tipos: ['cantata', 'evento'] },
      { id: 'f3', nome: 'PROJEÇÃO', ativa: true, ordem: 3, simultanea: true, tipos: ['domingo'] },
      { id: 'f4', nome: 'FOTO', ativa: true, ordem: 4, simultanea: true, tipos: [] },
      /* o caso misto: uma palavra boa e uma inventada. A boa manda. */
      { id: 'f5', nome: 'SOM', ativa: true, ordem: 5, simultanea: true, tipos: ['follow', 'cantata'] },
    ],
    voluntarios: [], habilidades: [], indisponibilidades: [],
    cultos: [], escalacoes: [], plantoes: [], config: null,
  };
  const S = montarEstado(linhas);
  const porNome = Object.fromEntries(S.funcoes.map(f => [f.nome, f.tipos]));

  ok(JSON.stringify(porNome['BERÇÁRIO PROFESSORA']) === JSON.stringify(['domingo', 'follow']),
    'posto com tipo inventado passa a valer para os dois (aparece em vez de sumir)',
    JSON.stringify(porNome['BERÇÁRIO PROFESSORA']));
  ok(JSON.stringify(porNome['LANCHE']) === JSON.stringify(['domingo', 'follow']),
    'e o mesmo quando TODAS as palavras são inventadas', JSON.stringify(porNome['LANCHE']));
  ok(JSON.stringify(porNome['PROJEÇÃO']) === JSON.stringify(['domingo']),
    'posto legítimo não é alargado por engano', JSON.stringify(porNome['PROJEÇÃO']));
  ok(JSON.stringify(porNome['FOTO']) === JSON.stringify(['domingo', 'follow']),
    'array vazio continua valendo para os dois (linha antiga)', JSON.stringify(porNome['FOTO']));
  ok(JSON.stringify(porNome['SOM']) === JSON.stringify(['follow']),
    'palavra boa junto com inventada: a boa manda, a inventada cai',
    JSON.stringify(porNome['SOM']));
}

/* ------------- 3. a regra de verdade: todo posto ativo aparece em algum dia

   Esta é a asserção que importa, porque é a que vale mesmo quando alguém
   inventar um quarto jeito de quebrar isso. */
{
  const monta = (tipos) => {
    const S = E.estadoVazio();
    S.funcoes = [{ nome: 'POSTO', ordem: 1, ativa: true, simultanea: true, tipos }];
    return S;
  };
  const apareceEmAlgumDia = (S) => {
    const dias = [...E.domingosDoMes(2026, 10), ...E.sabadosDoFollow(2026, 10)];
    return dias.some(d => E.funcoesDoDia(S, d).length > 0);
  };
  ok(apareceEmAlgumDia(monta(['domingo'])), 'posto de domingo aparece');
  ok(apareceEmAlgumDia(monta(['follow'])), 'posto de follow aparece');
  ok(apareceEmAlgumDia(monta([])), 'posto sem tipo aparece');
  ok(apareceEmAlgumDia(monta(['domingo', 'follow'])), 'posto dos dois aparece');
  /* e a prova de que o teste PEGA o defeito: com a palavra inventada crua,
     sem passar pela ponte, o posto some — que é exatamente o que acontecia */
  ok(!apareceEmAlgumDia(monta(['culto'])),
    'posto com tipo inventado CRU some mesmo (é o defeito que a ponte conserta)');
}

/* ------------- 4. e some CALADO: vagasDe e resumoDia não acusam nada

   Documenta o porquê de o defeito ter durado meses. Se um dia alguém fizer
   `vagasDe` acusar posto invisível, este teste falha — e aí é só apagá-lo com
   alegria, porque o problema deixou de existir. */
{
  const S = E.estadoVazio();
  S.funcoes = [
    { nome: 'PROJEÇÃO', ordem: 1, ativa: true, simultanea: true, tipos: ['domingo'] },
    { nome: 'BERÇÁRIO', ordem: 2, ativa: true, simultanea: true, tipos: ['culto'] },
  ];
  S.voluntarios = [{ id: 'v1', nome: 'Ana Silva', ativo: true, indisponivel: [], funcoes: { 'PROJEÇÃO': 'titular', BERÇÁRIO: 'titular' } }];
  const dom = E.domingosDoMes(2026, 10)[0];
  E.gerarMes(S, 2026, 10, dom);
  ok(!E.vagasDe(S, dom).includes('BERÇÁRIO'),
    'vagasDe NÃO acusa o posto invisível — é por isso que ninguém via',
    JSON.stringify(E.vagasDe(S, dom)));
  ok(E.funcoesDoDia(S, dom).length === 1,
    'e o dia enxerga um posto onde existem dois', String(E.funcoesDoDia(S, dom).length));
}

console.log(falhas ? `\npostos-visiveis: ${falhas} falha(s) em ${feitas}` : `\npostos-visiveis: ${feitas}/${feitas} ok`);
process.exit(falhas ? 1 : 0);
