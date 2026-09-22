/* A PORTA DO DEMANDAS NÃO PODE LEVAR AO OUTRO SISTEMA — 22/09/2026.

   Este teste existe porque a versão anterior da promessa era um COMENTÁRIO:

     "não existe a string `/painel` neste arquivo"

   E existia, cinco vezes, na prosa que explica o defeito. Promessa escrita em
   comentário não é promessa, é intenção — e a diferença entre as duas é
   justamente o que esta sessão inteira passou o dia achando.

   O que ele pediu, repetido o dia todo até eu entender:

     "SISTEMA DE DEMANDA TEM QUE SER UM SISTEMA TOTALMENTE DESCONECTADO COM
      SISTEMA DE ESCALAS."
     "nesse entrar eu entro diretamente pro sistema de escalas cara"

   O que este arquivo mede, no CÓDIGO (comentários e strings de prosa fora):

     1. a porta `/demandas/entrar` não menciona a rota do painel das escalas
     2. a casca de demandas não aponta para `/entrar`, que é a tela do outro
        sistema ("ESPAÇO DO ORGANIZADOR")
     3. nada dentro de `app/demandas/` nem de `components/demandas/` importa
        peça de `components/Shell`, `components/Marca` ou `app/entrar`
     4. `destino()` da porta só aceita caminho que comece com `/demandas` —
        senão `?volta=/painel` refazia o defeito por fora

   Roda com `node scripts/demandas-porta-propria.test.mjs`, sem banco e sem
   navegador. */

import { readFileSync, readdirSync, statSync } from 'node:fs';

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => {
  feitas++;
  if (!c) { falhas++; console.log('  FALHOU:', rot, extra ? ` — ${extra}` : ''); }
};

/* tira comentário de bloco, de linha, e o conteúdo das strings: o que sobra é
   o que o navegador vai EXECUTAR. Sem isto o teste reprovaria a prosa que
   explica o próprio defeito, que é o oposto do que se quer. */
function semComentario(txt) {
  /* tira SÓ comentário. As strings ficam, porque é dentro delas que mora a
     rota que este teste procura (`href="/entrar"`). */
  return txt
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

function soCodigo(txt) {
  return semComentario(txt)
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

function arquivos(dir, fim = /\.tsx?$/) {
  const saida = [];
  for (const nome of readdirSync(dir)) {
    const cam = `${dir}/${nome}`;
    if (statSync(cam).isDirectory()) saida.push(...arquivos(cam, fim));
    else if (fim.test(nome)) saida.push(cam);
  }
  return saida;
}

/* ---- 1 · a porta não conhece a rota do outro sistema -------------------- */
{
  const bruto = readFileSync('app/demandas/entrar/page.tsx', 'utf8');
  const codigo = soCodigo(bruto);
  ok(!/\/painel/.test(codigo), 'a porta do demandas não tem a rota do painel no código',
     (codigo.match(/.{0,50}\/painel.{0,50}/) || [''])[0]);
  /* e a prosa PODE citar: é o defeito que a tela existe para matar */
  ok(/painel/.test(bruto), 'e o arquivo explica por que ela existe (a prosa cita o defeito)');

  /* a guarda do `?volta=`: sem ela a porta vira a porta do outro sistema */
  ok(/startsWith\(\s*['"]\/demandas['"]\s*\)/.test(bruto),
     'destino() só aceita volta que comece com /demandas');
  ok(/includes\(\s*['"]\\\\['"]\s*\)|includes\('\\\\'\)/.test(bruto) || /\\\\/.test(bruto),
     'e continua barrando barra invertida (redirecionamento aberto)');
}

/* ---- 2 · a casca não manda ninguém para a tela do outro sistema --------- */
{
  const alvos = [...arquivos('app/demandas'), ...arquivos('components/demandas')];
  ok(alvos.length > 5, 'achei os arquivos do sistema de demandas', 'achei=' + alvos.length);

  for (const f of alvos) {
    const codigo = soCodigo(readFileSync(f, 'utf8'));
    /* `/entrar` sozinho é a porta das escalas; `/demandas/entrar` é a nossa.

       A varredura roda sobre o texto SEM COMENTÁRIO, e não linha a linha
       decidindo "isto parece comentário": a primeira versão deste teste fazia
       assim e reprovou a própria prosa que explica o defeito, porque o miolo
       de um comentário de bloco não tem `*` no começo da linha. */
    const vivo = semComentario(readFileSync(f, 'utf8'));
    const suspeitas = (vivo.match(/href=\{?["'`]\/entrar[^a-z]|["'`]\/entrar\?|location\.href\s*=\s*["'`]\/entrar/g) || []);
    ok(suspeitas.length === 0, `${f} não aponta para a porta das escalas`, suspeitas[0] || '');
    ok(!/\/painel/.test(codigo), `${f} não tem a rota do painel no código`,
       (codigo.match(/.{0,40}\/painel.{0,40}/) || [''])[0]);
  }
}

/* ---- 3 · nenhuma peça do outro sistema atravessa a fronteira ------------ */
{
  const proibidos = [
    /from\s+['"]@?\/?components\/Shell['"]/,
    /from\s+['"]@?\/?components\/Marca['"]/,
    /from\s+['"]@?\/?components\/Ui['"]/,
    /from\s+['"]@\/app\/entrar/,
  ];
  for (const f of [...arquivos('app/demandas'), ...arquivos('components/demandas')]) {
    const t = readFileSync(f, 'utf8');
    for (const p of proibidos) {
      ok(!p.test(t), `${f} não importa peça do sistema de escalas`, String(p));
    }
  }
}

console.log(`\nporta-propria: ${falhas ? `${falhas} falha(s) em ${feitas}` : `${feitas}/${feitas} ok`}`);
process.exit(falhas ? 1 : 0);
