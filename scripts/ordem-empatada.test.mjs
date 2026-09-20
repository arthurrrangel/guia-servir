/* O EMPATE DE `funcoes.ordem` NÃO PODE MUDAR QUEM É ESCALADO — 20/09/2026.

   Auditoria de backend. `funcoes.ordem` é `int not null default 0` e não tem
   unique. Empate é alcançável pela tela (`app/ajustes/page.tsx` cria posto
   novo com `ordem: S.funcoes.length + 1`, então apagar um e criar outro
   repete a ordem). Sem desempate, a ordem final era a que o banco devolveu,
   que é ordem de heap e muda sozinha a cada UPDATE — e `gerarDia` usa a
   POSIÇÃO no array para desempatar prioridade entre postos.

   Resultado medido antes do conserto: mesma equipe, mesmas pessoas, mesmo
   dia, e a pessoa caía num posto ou no outro conforme a ordem física das
   linhas. "Sortear de novo" deixava de ser determinístico.

   Este teste monta o MESMO estado duas vezes, só trocando a ordem do array
   de funções, e cobra escala idêntica. */
import { funcoesAtivas, gerarDia, garantirDia } from '@/lib/engine';

let falhas = 0;
const ok = (c, oQue, viu) => { if (!c) { falhas++; console.log(`  x ${oQue}${viu !== undefined ? ` -> ${viu}` : ''}`); } };

const FUNCOES = [
  { id: 'f1', nome: 'ILUMINAÇÃO', simultanea: true, ordem: 5, ativa: true, tipos: [] },
  { id: 'f2', nome: 'PROJEÇÃO',   simultanea: true, ordem: 5, ativa: true, tipos: [] },
];

function estado(ordemDoBanco) {
  return {
    config: { limitePadrao: 9, janelaCarga: 30, plantaoQtd: 0, horasTardio: 48 },
    funcoes: ordemDoBanco.map(id => FUNCOES.find(f => f.id === id)),
    voluntarios: [{ id: 'v1', nome: 'Ana Souza', ativo: true, limiteMes: 9,
                    funcoes: { 'ILUMINAÇÃO': 'reserva', 'PROJEÇÃO': 'reserva' } }],
    escalas: {}, indisponibilidades: {}, equipes: [],
  };
}

/* 1) o desempate existe e é por nome, nos dois sentidos de entrada */
for (const entrada of [['f1', 'f2'], ['f2', 'f1']]) {
  const nomes = funcoesAtivas(estado(entrada)).map(f => f.nome);
  ok(nomes[0] === 'ILUMINAÇÃO' && nomes[1] === 'PROJEÇÃO',
     `funcoesAtivas desempata por nome vindo como ${entrada}`, nomes.join(', '));
}

/* 2) e o sorteio de um dia dá o MESMO resultado nas duas ordens.

      É este caso que prova o que importa: sem o desempate, a única pessoa
      disponível caía em postos diferentes conforme a ordem das linhas. */
const DIA = '2026-10-04';
const quem = (entrada) => {
  const S = estado(entrada);
  garantirDia(S, DIA);
  /* o terceiro argumento que estava aqui ('2026-09-01') nunca existiu na
     assinatura de `gerarDia`: era engolido em silêncio. Apareceu quando
     `gerarDia` ganhou um terceiro parâmetro de verdade (o mapa de recusas) e
     a string explodiu dentro dele. Fica o registro: em .mjs o compilador não
     confere argumento a mais, então argumento a mais dorme até incomodar. */
  gerarDia(S, DIA);
  const slots = S.escalas[DIA].slots || {};
  return Object.keys(slots).filter(k => slots[k]?.vid).sort().join('+');
};
const a = quem(['f1', 'f2']);
const b = quem(['f2', 'f1']);
ok(a === b, 'a mesma equipe sorteia o mesmo posto nas duas ordens do banco', `${a} vs ${b}`);
ok(a !== '', 'e alguém foi de fato escalado (senão o caso acima passa vazio)', a);

const total = 4;
if (falhas) { console.log(`ordem-empatada: ${falhas} falha(s) em ${total}`); process.exit(1); }
console.log(`ordem-empatada: ${total}/${total} ok`);
