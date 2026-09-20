/* =============================================================================
   O TETO DO MÊS É UM TETO, E CONTA DIAS

   20/09/2026. Escrito depois de a auditoria de lógica de negócio provar que o
   motor estourava o limite mensal em uso normal, e que o teste que existia
   para impedir isso rodava com um valor que nenhum ministério usa.

   O teste antigo (`engine-tempo`, "ninguem passou do limite do mes") montava o
   mês com `limite: 10`. O próprio arquivo escreve, na linha 121, que nenhum
   ministério usa 10. Produção usa 4 (migração 11) e o Louvor usa 6 (migração
   17). Medido nos dois lados, com 17 pessoas e 11 postos:

       limite  2  ->  2 pessoas acima do teto (uma com 4 dias)
       limite  3  ->  4 pessoas acima do teto (três com 5 dias)
       limite  4  ->  3 pessoas acima do teto (uma com 7 dias)
       limite  6  ->  0
       limite 10  ->  0      <- o único valor que o teste antigo experimentava

   Ou seja: o teste passava justamente porque escolhia o único par de valores
   em que o defeito não aparece. Um teste que só roda com o número que não
   quebra é um teste que descreve o número, não a regra.

   Este arquivo varre os limites que a igreja usa de verdade.
   ============================================================================= */

import * as E from '../lib/engine.ts';

let n = 0, f = 0;
const ok = (c, nome, extra) => {
  n++;
  if (c) console.log('  PASS  ' + nome);
  else { f++; console.log('  FAIL  ' + nome + (extra ? '\n        ' + extra : '')); }
};

const FN = [
  { nome: 'PROJEÇÃO',    simultanea: true,  ordem: 1,  ativa: true },
  { nome: 'ILUMINAÇÃO',  simultanea: true,  ordem: 2,  ativa: true },
  { nome: 'FOTO',        simultanea: true,  ordem: 3,  ativa: true },
  { nome: 'FILMAGEM',    simultanea: true,  ordem: 4,  ativa: true },
  { nome: 'HEAD',        simultanea: true,  ordem: 5,  ativa: true },
  { nome: 'TRANSMISSÃO', simultanea: true,  ordem: 6,  ativa: true },
  { nome: 'CÂMERA 1',    simultanea: true,  ordem: 7,  ativa: true },
  { nome: 'CÂMERA 2',    simultanea: true,  ordem: 8,  ativa: true },
  { nome: 'RECEPÇÃO',    simultanea: true,  ordem: 9,  ativa: true },
  /* as duas de baixo são PÓS-CULTO (`simultanea: false`): acumular com um
     posto do próprio culto é legal, e é justamente esse acúmulo que fazia o
     remanejamento achar que tinha liberado um dia sem ter liberado. */
  { nome: 'EDIÇÃO',      simultanea: false, ordem: 10, ativa: true },
  { nome: 'ENTREGA',     simultanea: false, ordem: 11, ativa: true },
];
const POSTOS = FN.map(f => f.nome);

/* Time sintético: cada pessoa sabe três postos, rodando pela lista, para que
   o sorteio tenha escolha real e o remanejamento tenha para onde ir. */
function time(qtd, limite) {
  const out = [];
  for (let i = 0; i < qtd; i++) {
    const fs = {};
    for (let k = 0; k < 3; k++) fs[POSTOS[(i * 3 + k) % POSTOS.length]] = k === 0 ? 'titular' : 'reserva';
    out.push({
      id: 'v' + i, nome: 'P' + String(i).padStart(2, '0'),
      ativo: true, limiteMes: limite, funcoes: fs, indisponivel: [],
    });
  }
  return out;
}
function mes(qtd, limite) {
  const S = E.estadoVazio();
  S.funcoes = JSON.parse(JSON.stringify(FN));
  S.voluntarios = time(qtd, limite);
  S.config = { ...S.config, limitePadrao: limite };
  E.gerarMes(S, 2026, 10);
  return S;
}

const base = (vols, funcoes = FN) => {
  const S = E.estadoVazio();
  S.funcoes = JSON.parse(JSON.stringify(funcoes));
  S.voluntarios = vols;
  return S;
};
const v = (id, nome, funcoes, limite = 2, indisp = []) =>
  ({ id, nome, ativo: true, limiteMes: limite, funcoes, indisponivel: indisp });


console.log('\n1. O mês inteiro respeita o teto, em TODO limite que a igreja usa');
/* 2 e 3 não são valores de produção hoje; entram porque o defeito aparecia
   neles e porque nada impede um líder de escolher 2 na tela de Ajustes. */
for (const limite of [2, 3, 4, 6, 10]) {
  const S = mes(17, limite);
  const c = E.cargaDoMes(S, 2026, 10);
  ok(c.acimaDoLimite.length === 0,
     `limite ${limite}: ninguém passa do teto do mês`,
     c.acimaDoLimite.map(p => `${p.nome} em ${p.n} dias`).join(', '));
  /* segunda leitura do mesmo fato, sem passar por `cargaDoMes`, para o caso
     de o alarme dela voltar a ter uma guarda que engula o próprio defeito */
  const estourou = S.voluntarios
    .map(x => ({ nome: x.nome, n: E.escalasNoMes(S, x.id, 2026, 10) }))
    .filter(x => x.n > limite);
  ok(estourou.length === 0,
     `limite ${limite}: e a contagem de dias crua concorda`,
     estourou.map(x => `${x.nome}:${x.n}`).join(' '));
}

console.log('\n2. Times de tamanhos diferentes, no limite de produção (4)');
for (const qtd of [8, 12, 17, 25, 40]) {
  const S = mes(qtd, 4);
  const c = E.cargaDoMes(S, 2026, 10);
  ok(c.acimaDoLimite.length === 0, `${qtd} pessoas: ninguém passa do teto`,
     c.acimaDoLimite.map(p => `${p.nome} em ${p.n} dias`).join(', '));
}


console.log('\n3. Zero é um teto, não é "sem teto"');
{
  /* `v.limiteMes || S.config.limitePadrao` fazia zero cair em falsy e virar o
     padrão da equipe. A pessoa que o líder tinha proibido de servir naquele
     mês era escalada duas vezes, e o alarme da tela não acusava porque tinha
     a mesma guarda (`p.limite > 0 &&`). */
  const S = base([
    v('z', 'Zelia', { 'PROJEÇÃO': 'titular' }, 0),
    v('a', 'Ana',   { 'ILUMINAÇÃO': 'titular' }, 2),
  ]);
  S.config = { ...S.config, limitePadrao: 2 };
  E.gerarMes(S, 2026, 10);
  ok(E.escalasNoMes(S, 'z', 2026, 10) === 0, 'limiteMes 0 não é escalada nenhuma vez',
     'ficou com ' + E.escalasNoMes(S, 'z', 2026, 10));
  ok(E.quantosPodem(S, 'PROJEÇÃO', E.domingosDoMes(2026, 10)[0]) === 0,
     'e nem chega a ser elegível');
  ok(E.cargaDoMes(S, 2026, 10).pessoas.find(p => p.id === 'z').limite === 0,
     'a tela mostra teto 0, e não o padrão da equipe');
}
{
  /* o espelho: limitePadrao 0 na config vazia o mês inteiro, e isso TEM que
     ser o que acontece. `config` é jsonb e é editado por SQL nas migrações. */
  const S = base([v('a', 'Ana', { 'PROJEÇÃO': 'titular' }, null)]);
  S.config = { ...S.config, limitePadrao: 0 };
  E.gerarMes(S, 2026, 10);
  ok(E.escalasNoMes(S, 'a', 2026, 10) === 0, 'limitePadrao 0 vale para quem segue a equipe');
}
{
  /* e `null` continua querendo dizer "segue a equipe", que é a regra da 11 */
  const S = base([v('a', 'Ana', { 'PROJEÇÃO': 'titular' }, null)]);
  S.config = { ...S.config, limitePadrao: 3 };
  E.gerarMes(S, 2026, 10);
  ok(E.escalasNoMes(S, 'a', 2026, 10) === 3, 'limiteMes null segue o limitePadrao da equipe',
     'ficou com ' + E.escalasNoMes(S, 'a', 2026, 10));
}


console.log('\n4. O teto conta DIAS, então o segundo posto do mesmo dia é de graça');
{
  /* FOTO (do culto) + EDIÇÃO (pós-culto) no mesmo domingo valem 1 dia. Era o
     que `cargaJanela` já dizia por escrito e o que `elegiveis` não cumpria: o
     desconto olhava só a mesma vaga, então quem já estava em FOTO era barrada
     de EDIÇÃO no mesmo dia e a vaga ficava aberta à toa. */
  const S = base(
    [v('d', 'Duda', { 'FOTO': 'titular', 'EDIÇÃO': 'titular' }, 2)],
    [{ nome: 'FOTO', simultanea: true, ordem: 1, ativa: true },
     { nome: 'EDIÇÃO', simultanea: false, ordem: 2, ativa: true }],
  );
  const D = E.domingosDoMes(2026, 10);
  /* gasta o teto nos dois primeiros domingos */
  E.gerarDia(S, D[0]); E.gerarDia(S, D[1]);
  ok(E.escalasNoMes(S, 'd', 2026, 10) === 2, 'Duda está em 2 dias, no teto dela',
     String(E.escalasNoMes(S, 'd', 2026, 10)));
  /* no SEGUNDO domingo ela já está em FOTO; EDIÇÃO ali não gasta dia nenhum */
  delete S.escalas[D[1]].slots['EDIÇÃO'];
  /* `excluirOcupados: false` porque é o caminho do reparo. A ocupação do dia
     é outra trava, de propósito, e continua valendo no sorteio guloso: o que
     este caso mede é o TETO ter parado de barrar. */
  ok(E.candidatos(S, 'EDIÇÃO', D[1], { excluirOcupados: false }).some(x => x.id === 'd'),
     'o teto não barra mais um segundo posto NO DIA em que ela já serve');
  ok(E.repararDia(S, D[1]) === 1, 'e o reparo preenche a vaga em vez de deixá-la aberta');
  ok(E.escalasNoMes(S, 'd', 2026, 10) === 2, 'o dia continua contando uma vez só',
     String(E.escalasNoMes(S, 'd', 2026, 10)));
  /* e num dia NOVO ela continua barrada, que é o teto fazendo o trabalho dele */
  ok(!E.candidatos(S, 'FOTO', D[2], { excluirOcupados: false }).some(x => x.id === 'd'),
     'num dia novo ela continua barrada pelo teto');
}


console.log('\n5. O remanejamento entre dias não inventa um dia a mais');
{
  /* O caso exato: a pessoa tem DOIS postos no dia de origem. Tirar um deles
     não libera o dia, porque ela continua lá no outro. O código antigo movia
     mesmo assim e a pessoa ganhava um dia. */
  const F = [{ nome: 'FOTO', simultanea: true, ordem: 1, ativa: true },
             { nome: 'EDIÇÃO', simultanea: false, ordem: 2, ativa: true }];
  const S = base([
    v('a', 'Ana', { 'FOTO': 'titular', 'EDIÇÃO': 'titular' }, 2),
    v('b', 'Bia', { 'FOTO': 'titular' }, 2),
  ], F);
  const D = E.domingosDoMes(2026, 10);
  /* montado à mão: Ana em dois dias, e no segundo com os dois postos */
  E.garantirDia(S, D[0]).slots['FOTO']   = { vid: 'a', status: 'pendente', fixo: false };
  E.garantirDia(S, D[1]).slots['FOTO']   = { vid: 'a', status: 'pendente', fixo: false };
  S.escalas[D[1]].slots['EDIÇÃO']        = { vid: 'a', status: 'pendente', fixo: false };
  E.garantirDia(S, D[2]);
  ok(E.escalasNoMes(S, 'a', 2026, 10) === 2, 'Ana começa com 2 dias, no teto');

  /* o reparo do terceiro dia pode preencher, mas nunca à custa do teto dela */
  E.gerarMes(S, 2026, 10, D[2]);
  ok(E.escalasNoMes(S, 'a', 2026, 10) <= 2, 'Ana continua com no máximo 2 dias',
     'ficou com ' + E.escalasNoMes(S, 'a', 2026, 10));
}


console.log('\n6. O remanejamento entre dias EXISTE e resolve um caso que a ganância não resolve');
{
  /* Sem este bloco, trocar o corpo de `aumentar()` por `return false` deixava
     a suíte inteira verde: o backtracking, que é a parte mais complexa do
     repositório, não tinha um único teste que o exercitasse.

     O caso: um posto por dia, dois domingos, duas pessoas. Ana serve os dois
     dias mas tem teto 1. Bia só pode no primeiro domingo. O sorteio guloso
     pega Ana para o primeiro domingo (ordem alfabética no empate) e o segundo
     fica vazio, porque Ana já bateu o teto e Bia não pode. A única saída é
     MOVER Ana para o segundo domingo e pôr Bia no primeiro, que é exatamente
     o que `aumentar` faz atravessando dias. */
  /* `tipos: ['domingo']` para o mês ter só os quatro domingos: com os sábados
     de Follow no meio, Bia gastaria o teto dela neles e o caso deixaria de
     ser sobre remanejamento. */
  const F = [{ nome: 'FOTO', simultanea: true, ordem: 1, ativa: true, tipos: ['domingo'] }];
  const D = E.domingosDoMes(2026, 10);
  const S = base([
    v('a', 'Ana', { 'FOTO': 'titular' }, 1),
    v('b', 'Bia', { 'FOTO': 'titular' }, 1, [D[1], D[2], D[3]]),
  ], F);
  E.gerarMes(S, 2026, 10, D[0]);
  const quem = (d) => S.escalas[d]?.slots?.['FOTO']?.vid || '(vazio)';
  ok(quem(D[0]) === 'b' && quem(D[1]) === 'a',
     'o remanejamento troca as duas de dia e fecha os dois domingos',
     `${D[0]}=${quem(D[0])}  ${D[1]}=${quem(D[1])}`);
  ok(E.escalasNoMes(S, 'a', 2026, 10) === 1 && E.escalasNoMes(S, 'b', 2026, 10) === 1,
     'e cada uma continua no teto de 1',
     `a=${E.escalasNoMes(S, 'a', 2026, 10)} b=${E.escalasNoMes(S, 'b', 2026, 10)}`);
}


console.log('\n7. Quem está EXATAMENTE no teto não é acusado de ter passado dele');
{
  const S = base([v('a', 'Ana', { 'PROJEÇÃO': 'titular' }, 2)]);
  S.config = { ...S.config, limitePadrao: 2 };
  E.gerarMes(S, 2026, 10);
  ok(E.escalasNoMes(S, 'a', 2026, 10) === 2, 'Ana serve as duas vezes do teto dela');
  ok(E.cargaDoMes(S, 2026, 10).acimaDoLimite.length === 0,
     'e não aparece como "passou do limite"');
}
{
  /* o outro lado: quem passou TEM que aparecer, senão o alarme não alarma */
  const S = base([v('a', 'Ana', { 'PROJEÇÃO': 'titular' }, 2)]);
  const D = E.domingosDoMes(2026, 10);
  for (const d of D.slice(0, 3)) E.garantirDia(S, d).slots['PROJEÇÃO'] = { vid: 'a', status: 'pendente', fixo: false };
  const c = E.cargaDoMes(S, 2026, 10);
  ok(c.acimaDoLimite.some(p => p.id === 'a'), 'três dias num teto de dois é acusado',
     JSON.stringify(c.acimaDoLimite));
}
{
  /* O ALARME TEM QUE ACUSAR QUEM TEM TETO ZERO E FOI ESCALADO.
     O motor nunca escala alguém com teto 0, mas o líder escala à mão pelo
     select da tela — e é exatamente aí que o alarme precisa falar. A guarda
     `p.limite > 0 &&` que existia em `acimaDoLimite` calava justamente este
     caso: quem o líder tinha proibido de servir naquele mês era o único que
     o painel nunca acusava. */
  const S = base([v('z', 'Zelia', { 'PROJEÇÃO': 'titular' }, 0)]);
  S.config = { ...S.config, limitePadrao: 2 };
  E.garantirDia(S, E.domingosDoMes(2026, 10)[0]).slots['PROJEÇÃO'] =
    { vid: 'z', status: 'pendente', fixo: true };
  const c = E.cargaDoMes(S, 2026, 10);
  ok(c.acimaDoLimite.some(p => p.id === 'z'),
     'escalada à mão com teto 0, o painel acusa',
     JSON.stringify(c.acimaDoLimite));
}
{
  /* "em todos" só é fato quando há mais de um culto montado para estar */
  const S = base([v('a', 'Ana', { 'PROJEÇÃO': 'titular' }, 5)]);
  E.garantirDia(S, E.domingosDoMes(2026, 10)[0]).slots['PROJEÇÃO'] = { vid: 'a', status: 'pendente', fixo: false };
  ok(E.cargaDoMes(S, 2026, 10).emTodos.length === 0,
     'com um culto montado só, ninguém está "em todos"');
}


console.log('\n8. O sorteio não escreve dentro do voluntário');
{
  /* `gerarDia` transportava "fulano recusou este dia" escrevendo a data em
     `v.indisponivel`, ou seja, inventando no objeto uma linha que a tabela
     `indisponibilidades` não tem. Três estragos, todos na mesma sessão do
     navegador: `problemas()` passava a acusar a pessoa depois que o líder a
     repunha; /time mostrava a data sob "Avisou que não pode"; e o motor
     deixava de ser função do estado que recebeu. */
  const S = base([
    v('a', 'Ana', { 'PROJEÇÃO': 'titular' }, 2),
    v('b', 'Bia', { 'PROJEÇÃO': 'titular' }, 2),
  ]);
  const D = E.domingosDoMes(2026, 10)[0];
  E.garantirDia(S, D).slots['PROJEÇÃO'] = { vid: 'a', status: 'recusado', fixo: false };

  ok(E.respostaDe(S.voluntarios[0], D) === 'mudo', 'antes do sorteio, Ana está muda para este dia');
  E.gerarDia(S, D);
  ok((S.voluntarios[0].indisponivel || []).length === 0,
     'o sorteio não escreveu uma indisponibilidade que ninguém declarou',
     JSON.stringify(S.voluntarios[0].indisponivel));
  ok(E.respostaDe(S.voluntarios[0], D) === 'mudo', 'e Ana continua muda, não "não posso"');
  ok(S.escalas[D].slots['PROJEÇÃO']?.vid === 'b',
     'mas quem recusou continua fora do re-sorteio daquele dia',
     JSON.stringify(S.escalas[D].slots['PROJEÇÃO']));

  /* e o líder repondo a pessoa não vira alarme falso */
  S.escalas[D].slots['PROJEÇÃO'] = { vid: 'a', status: 'confirmado', fixo: true };
  ok(!E.problemas(S, D).some(p => p.grau === 'erro' && /avisou que não pode/.test(p.texto)),
     'repor quem tinha recusado não acusa "avisou que não pode"',
     JSON.stringify(E.problemas(S, D)));
}
{
  /* a recusa também não deve mandar a pessoa para o plantão daquele dia */
  const S = base([
    v('a', 'Ana', { 'PROJEÇÃO': 'titular', 'FOTO': 'titular' }, 2),
    v('b', 'Bia', { 'PROJEÇÃO': 'titular', 'FOTO': 'titular' }, 2),
  ]);
  S.config = { ...S.config, plantaoQtd: 2 };
  const D = E.domingosDoMes(2026, 10)[0];
  E.garantirDia(S, D).slots['PROJEÇÃO'] = { vid: 'a', status: 'recusado', fixo: false };
  E.gerarDia(S, D);
  ok(!(S.escalas[D].plantao || []).includes('a'),
     'quem recusou o dia não entra no plantão dele',
     JSON.stringify(S.escalas[D].plantao));
}


console.log('\n9. Dois nomes iguais desempatam sempre igual');
{
  /* O desempate de duas vias (`a.nome < b.nome ? -1 : 1`) devolve 1 nos dois
     sentidos quando os nomes são IGUAIS, e aí a ordem final vira a ordem
     física com que o banco devolveu as linhas — que muda sozinha. Duas Marias
     num ministério não é hipótese remota. */
  const monta = (ordem) => {
    const S = base(ordem.map(id => v(id, 'Maria Silva', { 'PROJEÇÃO': 'titular' }, 2)));
    const D = E.domingosDoMes(2026, 10)[0];
    E.gerarDia(S, D);
    return S.escalas[D].slots['PROJEÇÃO'].vid;
  };
  const a = monta(['m1', 'm2']);
  const b = monta(['m2', 'm1']);
  ok(a === b, 'a mesma pessoa é escalada, venha o banco na ordem que vier', `${a} x ${b}`);
  ok(E.porNome({ id: 'm1', nome: 'Maria' }, { id: 'm2', nome: 'Maria' }) < 0, 'porNome desempata por id');
  ok(E.porNome({ id: 'm2', nome: 'Maria' }, { id: 'm1', nome: 'Maria' }) > 0, 'e é antissimétrico');
  ok(E.porNome({ id: 'x', nome: 'Ana' }, { id: 'a', nome: 'Bia' }) < 0, 'nome ainda manda quando difere');
  ok(E.porNome({ vid: 'p1', nome: 'Ana' }, { vid: 'p2', nome: 'Ana' }) < 0,
     'e funciona para quem usa `vid` em vez de `id`');
}


console.log(`\n================  ${n - f}/${n} testes passaram  ================\n`);
process.exit(f ? 1 : 0);
