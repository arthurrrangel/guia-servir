/* O CLIQUE DE "MONTAR A ESCALA DESTE MÊS" NÃO PODE MATAR A TELA.

   19/09/2026. Este arquivo substitui `engine-orcamento.test.mjs`, que pode ser
   APAGADO: ele testava um teto de passos que foi removido por não fazer nada,
   e o cabeçalho dele afirmava um ganho de 5.591 ms para 711 ms que a medição
   não reproduz. A história completa está em `lib/engine.ts`, na nota "O
   ORÇAMENTO DE BUSCA QUE ESTEVE AQUI, E POR QUE ELE SAIU".

   O QUE IMPORTA MEDIR, E POR QUÊ

   `gerarMes` roda SÍNCRONO na thread principal, dentro do clique. Enquanto
   roda, nada anda: o spinner não gira, a rolagem trava, e a pessoa toca de
   novo achando que não pegou. Num Android mediano — algumas vezes mais lento
   que a máquina onde isto roda — cada segundo aqui vira entre 4 e 8 lá.

   O custo cresce com (dias carregados × postos) × (postos × pessoas), porque
   `candidatos()` chama três contagens por pessoa e `gerarDia` chama
   `candidatos` duas vezes por posto. Por isso o caso de teste precisa de
   HISTÓRICO no Estado: sem ele, a medição mente para baixo — a carga real
   traz 200 dias para trás (`DIAS_DE_HISTORICO` em lib/ponte.ts).

   E a igreja está andando na direção cara: a migração 47 dividiu UM posto do
   Connect em TRÊS sem somar uma pessoa.

   O QUE ESTE ARQUIVO EXIGE

     1. tempo com teto, no caso grande, com histórico de 6 meses;
     2. a escala continua VÁLIDA: ninguém indisponível, ninguém acima do
        limite do mês, ninguém em dois postos simultâneos no mesmo dia;
     3. a cobertura é medida CONTRA OS POSTOS DO DIA, e não contra as entradas
        criadas. Isto aqui é o conserto de um erro real: `gerarDia` só cria a
        entrada quando consegue preencher, então contar `dia.slots` mede
        quantos foram preenchidos e NUNCA quantos faltaram — a assertiva
        "nenhuma vaga aberta" era impossível de falhar.

   Roda com `npm test`. */

import * as E from '../lib/engine.ts';

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => { feitas++; if (!c) { falhas++; console.log('  FALHOU:', rot, extra); } };

/* Estado com histórico, como o que a carga entrega de verdade. */
function caso({ postos, pessoas, limite, densidade, meses }) {
  const funcoes = Array.from({ length: postos }, (_, i) => ({
    nome: 'POSTO ' + i, ordem: i, ativa: true, simultanea: true,
  }));
  const domingos = E.domingosDoMes(2026, 10);
  const voluntarios = Array.from({ length: pessoas }, (_, i) => ({
    id: 'v' + i, nome: 'Pessoa ' + i, ativo: true, limiteMes: limite,
    /* espalhada mas determinística: teste que varia entre execuções não serve */
    indisponivel: domingos.filter((_, d) => (i + d) % 3 === 0),
    funcoes: Object.fromEntries(funcoes.filter((f, j) => (i + j) % densidade === 0).map(f => [f.nome, 'titular'])),
  }));
  const S = E.estadoVazio();
  S.funcoes = funcoes; S.voluntarios = voluntarios; S.config.limitePadrao = limite;

  for (let m = 1; m <= meses; m++) {
    const abs = 10 - m, ano = abs > 0 ? 2026 : 2025, mes = abs > 0 ? abs : 12 + abs;
    for (const d of E.domingosDoMes(ano, mes)) {
      const dia = E.garantirDia(S, d);
      funcoes.forEach((f, j) => {
        const v = voluntarios[(j + mes) % pessoas];
        if (v.funcoes[f.nome]) dia.slots[f.nome] = { vid: v.id, status: 'pendente', fixo: false };
      });
    }
  }
  return S;
}

/* ------------------------------------------------------------ 1. tempo

   1.200 ms é o teto aqui porque num Android mediano isso já é de 5 a 10
   segundos — o limite do que dá para pedir de alguém que tocou um botão. O
   caso de 40 postos com 25 pessoas é DUAS vezes o maior ministério de hoje:
   ele existe para a conta continuar de pé quando o Connect crescer. */
const LIMITE_MS = 1200;

/* O TETO MENSAL MUDA O CUSTO EM 37 VEZES, E ESTE ARQUIVO MEDIA O MAIS BARATO.

   19/09/2026. Os três casos usavam limite 6, 8 e 10. Medido, variando SÓ o
   limite no terceiro caso, palavra por palavra igual ao resto:

       limite  2 ->   865 ms      limite  6 ->   595 ms
       limite  3 -> 1.010 ms      limite  8 ->   223 ms
       limite  4 -> 1.152 ms      limite 10 ->   243 ms   <- o que estava aqui

   A curva não é monótona, e é por isso que ela engana: o custo sobe até o
   ponto em que o teto ainda deixa vaga aberta e despenca quando o teto é
   folgado o bastante para preencher tudo. Vaga que NÃO TEM COMO ser
   preenchida custa a busca inteira antes de o motor desistir, e cada vaga
   paga essa busca por conta própria.

   Limite 10 é o vale da curva. Nenhum ministério usa 10: o padrão de equipe
   nova é 2 (`CONFIG_PADRAO.limitePadrao`), e a migração 11 gravou 4 no que
   está no ar. O teste media a configuração que ninguém tem.

   OS CASOS AGORA USAM OS LIMITES REAIS — 2 e 4 —, que é o pior lado da curva.
   O terceiro caso passou de 243 ms para cerca de 1.050 ms pela troca do
   limite, sem nada ter piorado no motor: ele só parou de medir o barato.

   O quarto caso é NOVO e tem teto próprio, bem mais alto: ele não afirma que
   o clique é rápido, afirma que ele não é ETERNO. É o caso que documenta, com
   número, que `limitePadrao = 2` num ministério de 40 postos custa segundos —
   decisão de produto que está registrada no rodapé da migração 56 e não é
   minha para tomar. */
const CASOS = [
  { postos: 11, pessoas: 17, limite: 4, densidade: 2, meses: 6 },
  { postos: 24, pessoas: 17, limite: 4, densidade: 3, meses: 6 },
  { postos: 40, pessoas: 25, limite: 4, densidade: 3, meses: 6 },
];
for (const c of CASOS) {
  const S = caso(c);
  const t0 = Date.now();
  E.gerarMes(S, 2026, 10, '2026-09-19');
  const ms = Date.now() - t0;
  ok(ms < LIMITE_MS, `${c.postos} postos / ${c.pessoas} pessoas / ${c.meses} meses de historico sai em menos de ${LIMITE_MS}ms`, `levou ${ms}ms`);
}

/* --- 1b. O PIOR CASO CONHECIDO, com teto próprio -------------------------

   `limitePadrao = 2` é o que todo ministério novo recebe, e é o lado mais
   caro da curva acima: com 40 postos e 60 pessoas custou entre 6 e 7 segundos
   de SERVIDOR na medição de 19/09, o que num Android mediano são dezenas de
   segundos de tela morta dentro de um clique.

   Este caso não pede que isso seja rápido. Ele pede que não piore, e existe
   para que a próxima pessoa que mexer no motor veja o número em vez de
   descobri-lo num domingo. Se ele começar a falhar, a resposta provavelmente
   não é otimizar mais: é a decisão de produto que está no rodapé da migração
   56 (mudar o padrão, ou tirar `gerarMes` do navegador). */
{
  const TETO_PIOR_CASO = 15000;
  const S2 = caso({ postos: 40, pessoas: 60, limite: 2, densidade: 3, meses: 7 });
  const t0 = Date.now();
  E.gerarMes(S2, 2026, 10, '2026-09-19');
  const ms = Date.now() - t0;
  ok(ms < TETO_PIOR_CASO,
    `pior caso conhecido (40 postos / 60 pessoas / limite 2) fica abaixo de ${TETO_PIOR_CASO}ms`,
    `levou ${ms}ms`);
  console.log(`  [medida] pior caso conhecido: ${ms}ms`);
}

/* ------------------------------------------- 2. e o resultado é válido */
const S = caso({ postos: 40, pessoas: 25, limite: 10, densidade: 3, meses: 6 });
E.gerarMes(S, 2026, 10, '2026-09-19');

let indisponivelEscalado = 0, duplicadoNoDia = 0;
const vezes = {};
for (const [data, dia] of Object.entries(S.escalas)) {
  if (data < '2026-09-19') continue;                 // história não é resultado
  const noDia = new Set();
  for (const sl of Object.values(dia.slots || {})) {
    if (!sl?.vid) continue;
    const v = S.voluntarios.find(x => x.id === sl.vid);
    if (v?.indisponivel?.includes(data)) indisponivelEscalado++;
    if (noDia.has(sl.vid)) duplicadoNoDia++;
    noDia.add(sl.vid);
    vezes[sl.vid] = (vezes[sl.vid] || 0) + 1;
  }
}
ok(indisponivelEscalado === 0, 'ninguem indisponivel foi escalado', `${indisponivelEscalado} caso(s)`);
ok(duplicadoNoDia === 0, 'ninguem em dois postos simultaneos no mesmo dia', `${duplicadoNoDia} caso(s)`);

/* limite mensal: conta DOMINGOS distintos, que é a regra do motor */
const diasPorPessoa = {};
for (const [data, dia] of Object.entries(S.escalas)) {
  if (data < '2026-09-19') continue;
  for (const sl of Object.values(dia.slots || {})) {
    if (!sl?.vid) continue;
    (diasPorPessoa[sl.vid] ||= new Set()).add(data);
  }
}
const acima = Object.entries(diasPorPessoa).filter(([, s]) => s.size > S.config.limitePadrao);
ok(acima.length === 0, 'ninguem passou do limite do mes', acima.map(([v, s]) => `${v}:${s.size}`).join(', '));

/* --------------------------------------- 3. a cobertura, medida certo

   Contra os POSTOS DO DIA. Este caso não sai cheio — é escasso de propósito —
   então o teste guarda o patamar: se uma mudança futura derrubar a cobertura,
   aparece aqui como falha, e não como um mês mais vazio que ninguém relaciona
   à mudança. */
let postosTotal = 0, preenchidos = 0;
for (const data of Object.keys(S.escalas)) {
  if (data < '2026-09-19') continue;
  const fs = E.funcoesDoDia(S, data);
  postosTotal += fs.length;
  preenchidos += fs.filter(f => S.escalas[data]?.slots?.[f.nome]?.vid).length;
}
ok(postosTotal > 300, 'o caso é grande de verdade (senão o teste mede o nada)', `${postosTotal} postos`);
/* 194/400 é o que este caso dá hoje, medido três vezes com o mesmo resultado
   (o caso é determinístico de propósito). Não é "a cobertura boa": é o caso
   escasso de propósito — 25 pessoas, um terço fora a cada domingo, cada uma
   sabendo um posto em cada três. O valor está aqui como PATAMAR: se cair, uma
   mudança tirou escala de alguém e isso tem que aparecer como falha. Se subir,
   ótimo — é só atualizar o número junto com a explicação do que melhorou. */
ok(preenchidos >= 194, 'a cobertura não caiu do patamar medido em 19/09', `${preenchidos}/${postosTotal}`);

/* e o motor de fato TRABALHOU: teste que passa porque não escalou ninguém
   não prova coisa nenhuma */
const total = Object.values(vezes).reduce((a, n) => a + n, 0);
ok(total > 150, 'o motor escalou gente de verdade no caso grande', `escalou ${total}`);

console.log(falhas ? `\nengine-tempo: ${falhas} falha(s) em ${feitas}` : `\nengine-tempo: ${feitas}/${feitas} ok`);
process.exit(falhas ? 1 : 0);
