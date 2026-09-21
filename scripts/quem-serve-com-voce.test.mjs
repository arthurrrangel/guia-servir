/* "QUEM SERVE COM VOCÊ" CONTAVA LINHA ACHANDO QUE CONTAVA GENTE — 21/09/2026.

   `eu_quem_serve` devolve UMA LINHA POR POSTO, e isso está certo: a lista
   quer mostrar quem faz o quê. A tela do voluntário então escrevia
   `juntos.length - 1` como "mais N pessoas".

   Medido num banco nascido do repositório, com UMA pessoa escalada em DOIS
   postos no mesmo culto:

       nome          | funcao    | eu | status
       Jander Rafael | DIRIGENTE | t  | confirmado
       Jander Rafael | VOCAL 1   | t  | pendente

   e a tela escreveu:  "Quem serve com você — mais 1 pessoa"
                       Você · DIRIGENTE
                       Você · VOCAL 1

   Ela está sozinha no dia. Se for a primeira vez dela, chega procurando
   alguém que não existe — e a seção termina com "procure qualquer um desses
   nomes quando chegar".

   Roda com `npm test`. */

import { agruparQuemServe } from '@/lib/engine';

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => { feitas++; if (!c) { falhas++; console.log('  FALHOU:', rot, extra); } };

/* ------------------------------------------------- 1) o caso que foi medido */
{
  const g = agruparQuemServe([
    { nome: 'Jander Rafael', funcao: 'DIRIGENTE', eu: true, status: 'confirmado' },
    { nome: 'Jander Rafael', funcao: 'VOCAL 1',   eu: true, status: 'pendente'   },
  ]);
  ok(g.length === 1, 'duas linhas da MESMA pessoa viram uma pessoa', `deu ${g.length}`);
  ok(g[0].funcoes.length === 2 && g[0].funcoes.join(' · ') === 'DIRIGENTE · VOCAL 1',
     'e os dois postos ficam juntos na linha dela', g[0].funcoes.join(' · '));
  ok(g[0].eu === true, 'e ela continua sendo "Você"');

  /* É ESTA A CONTA QUE A TELA FAZ, e é onde estava o defeito. */
  ok(g.length - 1 === 0,
     'a tela escreveria "mais 0 pessoas" — ou seja, a secao nem aparece',
     `escreveria "mais ${g.length - 1}"`);
}

/* -------------------------------------- 2) o status que sobra é o mais aberto
   Quem tem um posto pendente ainda está confirmando o dia, mesmo já tendo
   confirmado o outro. Escrever "confirmado" ali seria a tela afirmando sobre
   a decisão de outra pessoa mais do que ela sabe. */
{
  const conf_pend = agruparQuemServe([
    { nome: 'Ana', funcao: 'A', eu: false, status: 'confirmado' },
    { nome: 'Ana', funcao: 'B', eu: false, status: 'pendente'   },
  ]);
  ok(conf_pend[0].status === 'pendente',
     'confirmado + pendente = ainda confirmando', conf_pend[0].status);

  const pend_conf = agruparQuemServe([
    { nome: 'Ana', funcao: 'A', eu: false, status: 'pendente'   },
    { nome: 'Ana', funcao: 'B', eu: false, status: 'confirmado' },
  ]);
  ok(pend_conf[0].status === 'pendente',
     'e a ORDEM das linhas nao muda a resposta', pend_conf[0].status);

  const dois_conf = agruparQuemServe([
    { nome: 'Ana', funcao: 'A', eu: false, status: 'confirmado' },
    { nome: 'Ana', funcao: 'B', eu: false, status: 'confirmado' },
  ]);
  ok(dois_conf[0].status === 'confirmado',
     'e quem confirmou os dois aparece como confirmada', dois_conf[0].status);
}

/* ------------------------------------------- 3) gente de verdade continua lá
   O conserto não pode ser "some com tudo": a seção existe para a pessoa achar
   alguém quando chegar. */
{
  const g = agruparQuemServe([
    { nome: 'Você mesma', funcao: 'DIRIGENTE', eu: true,  status: 'confirmado' },
    { nome: 'Ana',        funcao: 'VOCAL 1',   eu: false, status: 'confirmado' },
    { nome: 'Bruno',      funcao: 'TECLADO',   eu: false, status: 'pendente'   },
    { nome: 'Ana',        funcao: 'VIOLAO',    eu: false, status: 'confirmado' },
  ]);
  ok(g.length === 3, 'quatro linhas de tres pessoas dao tres pessoas', `deu ${g.length}`);
  ok(g.length - 1 === 2, 'e a tela escreve "mais 2 pessoas"');
  ok(g.find(p => p.nome === 'Ana').funcoes.join(' · ') === 'VOCAL 1 · VIOLAO',
     'a Ana aparece uma vez, com os dois postos dela');
  ok(g.filter(p => p.eu).length === 1, 'e so uma linha e "Você"');
  /* a ordem de chegada é a ordem da lista: quem vem primeiro do banco
     (ordenado por posto) continua vindo primeiro na tela */
  ok(g[0].nome === 'Você mesma', 'a ordem de chegada e preservada', g.map(p => p.nome).join(','));
}

/* ------------------------------------------------------- 4) os casos de borda */
{
  ok(agruparQuemServe([]).length === 0, 'lista vazia da lista vazia');
  const um = agruparQuemServe([{ nome: 'So eu', funcao: 'X', eu: true, status: 'pendente' }]);
  ok(um.length === 1 && um.length - 1 === 0,
     'uma linha so: a secao nao aparece, porque nao ha com quem servir');
  /* posto repetido (dado sujo) não vira dois rótulos iguais na mesma linha */
  const rep = agruparQuemServe([
    { nome: 'Ana', funcao: 'VOCAL', eu: false, status: 'confirmado' },
    { nome: 'Ana', funcao: 'VOCAL', eu: false, status: 'confirmado' },
  ]);
  ok(rep.length === 1 && rep[0].funcoes.length === 1,
     'posto repetido nao vira "VOCAL · VOCAL"', rep[0].funcoes.join(' · '));
}

/* ===================================== 5) O INVARIANTE, e sem ele o resto é
   uma tabela de exemplos que eu escolhi.

   Duas propriedades que valem para QUALQUER entrada:

     a) o número de linhas de saída é o número de NOMES DISTINTOS da entrada
        (era o número de linhas, e é exatamente o defeito);
     b) nenhum posto da entrada se perde pelo caminho. */
{
  const NOMES = ['Ana', 'Bruno', 'Carla', 'Davi'];
  const POSTOS = ['A', 'B', 'C', 'D', 'E'];
  const ESTADOS = ['confirmado', 'pendente', 'recusado'];
  let errosA = 0, errosB = 0, sorteios = 0;

  /* gerador determinístico: o teste tem que dar o mesmo resultado sempre */
  let semente = 12345;
  const sorteia = (n) => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente % n; };

  for (let i = 0; i < 3000; i++) {
    const linhas = [];
    const quantas = 1 + sorteia(8);
    for (let k = 0; k < quantas; k++) {
      linhas.push({
        nome: NOMES[sorteia(NOMES.length)],
        funcao: POSTOS[sorteia(POSTOS.length)],
        eu: sorteia(4) === 0,
        status: ESTADOS[sorteia(ESTADOS.length)],
      });
    }
    sorteios++;
    const g = agruparQuemServe(linhas);

    const nomesDistintos = new Set(linhas.map(l => l.nome)).size;
    if (g.length !== nomesDistintos) errosA++;

    const paresEntrada = new Set(linhas.map(l => l.nome + '§' + l.funcao));
    const paresSaida = new Set(g.flatMap(p => p.funcoes.map(f => p.nome + '§' + f)));
    if (paresEntrada.size !== paresSaida.size) errosB++;
    else for (const par of paresEntrada) if (!paresSaida.has(par)) { errosB++; break; }
  }

  ok(sorteios === 3000, 'a varredura rodou os 3000 sorteios', String(sorteios));
  ok(errosA === 0,
     'em 3000 listas sorteadas, a contagem de saida e sempre a de NOMES DISTINTOS',
     `${errosA} divergencia(s)`);
  ok(errosB === 0,
     'e nenhum posto se perde no agrupamento',
     `${errosB} divergencia(s)`);
}

if (falhas) { console.log(`\nquem-serve-com-voce: ${falhas} falha(s) em ${feitas}\n`); process.exit(1); }
console.log(`\nquem-serve-com-voce: ${feitas}/${feitas} ok\n`);
