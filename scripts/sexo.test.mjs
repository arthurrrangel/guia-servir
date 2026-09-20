/* A regra do prédio: quem pode entrar onde. Roda com `npm test`.

   18/09/2026. O que este arquivo protege, em uma frase: uma restrição de
   ACESSO não pode depender de alguém lembrar de marcar habilidade uma a uma.
   Foi assim que, ao dividir o posto do Connect em três, as 21 habilidades
   foram copiadas para as vagas novas e o sorteio passou a poder pôr uma
   mulher no banheiro masculino.

   O caso do "sexo não informado" tem teste próprio porque é a parte que dá
   vontade de facilitar: deixar entrar quem não informou encheria a escala
   rápido e erraria em silêncio. Vaga vazia com motivo é melhor. */
import {
  candidatos, podeNoPosto, porqueNaoPode, pendenciasDeSexo, saudeDoTime,
  estadoVazio, garantirDia,
} from '../lib/engine.ts';

let falhas = 0;
let feitas = 0;
const ok = (cond, rotulo, extra = '') => { feitas++; if (!cond) { falhas++; console.log('  FALHOU:', rotulo, extra); } };

const DIA = '2026-09-20';
function base() {
  const S = estadoVazio();
  S.funcoes = [
    { id: 'f1', nome: 'GABINETE E BANHEIRO MASCULINO', simultanea: true, ordem: 1, ativa: true, exigeSexo: 'M' },
    { id: 'f2', nome: 'BANHEIRO FEMININO', simultanea: true, ordem: 2, ativa: true, exigeSexo: 'F' },
    { id: 'f3', nome: 'COZINHA', simultanea: true, ordem: 3, ativa: true },
  ];
  const todas = { 'GABINETE E BANHEIRO MASCULINO': 'titular', 'BANHEIRO FEMININO': 'titular', COZINHA: 'titular' };
  S.voluntarios = [
    { id: 'vm', nome: 'Marcos Silva', ativo: true, limiteMes: 4, sexo: 'M', funcoes: { ...todas }, indisponivel: [] },
    { id: 'vf', nome: 'Ana Souza', ativo: true, limiteMes: 4, sexo: 'F', funcoes: { ...todas }, indisponivel: [] },
    { id: 'vx', nome: 'Chris Lima', ativo: true, limiteMes: 4, funcoes: { ...todas }, indisponivel: [] },
  ];
  garantirDia(S, DIA);
  return S;
}
const nomes = (S, f) => candidatos(S, f, DIA, { excluirOcupados: false }).map(c => c.id).sort();

/* 1. o posto masculino só oferece o homem. É o caso que quebrou hoje: os três
   têm habilidade titular, e só um pode entrar. */
{
  const S = base();
  ok(JSON.stringify(nomes(S, 'GABINETE E BANHEIRO MASCULINO')) === '["vm"]',
    'posto de homens oferece só o homem', JSON.stringify(nomes(S, 'GABINETE E BANHEIRO MASCULINO')));
}

/* 2. o posto feminino só oferece a mulher */
{
  const S = base();
  ok(JSON.stringify(nomes(S, 'BANHEIRO FEMININO')) === '["vf"]', 'posto de mulheres oferece só a mulher');
}

/* 3. posto sem exigência continua oferecendo todo mundo, inclusive quem não
   informou: pedir sexo para entrar na cozinha seria coletar dado por coletar */
{
  const S = base();
  ok(JSON.stringify(nomes(S, 'COZINHA')) === '["vf","vm","vx"]', 'posto sem exigência não filtra ninguém',
    JSON.stringify(nomes(S, 'COZINHA')));
}

/* 4. sexo não informado NÃO entra em posto com exigência, nem no masculino
   nem no feminino. Não é "serve para os dois", é "não sei". */
{
  const S = base();
  const vx = S.voluntarios.find(v => v.id === 'vx');
  ok(!podeNoPosto(S, vx, 'GABINETE E BANHEIRO MASCULINO'), 'não informado fica fora do masculino');
  ok(!podeNoPosto(S, vx, 'BANHEIRO FEMININO'), 'não informado fica fora do feminino');
  ok(podeNoPosto(S, vx, 'COZINHA'), 'não informado entra onde não há exigência');
}

/* 5. nenhuma opção de `candidatos` destrava a regra. `ignorarLimite` e
   `incluirTreino` afrouxam o que é nosso; a regra do prédio não é nossa. */
{
  const S = base();
  const solto = candidatos(S, 'BANHEIRO FEMININO', DIA,
    { excluirOcupados: false, ignorarLimite: true, incluirTreino: true }).map(c => c.id);
  ok(JSON.stringify(solto) === '["vf"]', 'ignorarLimite/incluirTreino não destravam a regra', JSON.stringify(solto));
}

/* 6. a frase do porquê, que é o que a tela mostra */
{
  const S = base();
  const vf = S.voluntarios.find(v => v.id === 'vf');
  const vx = S.voluntarios.find(v => v.id === 'vx');
  ok(porqueNaoPode(S, vf, 'GABINETE E BANHEIRO MASCULINO').includes('posto de homens'),
    'diz que o posto é de homens', porqueNaoPode(S, vf, 'GABINETE E BANHEIRO MASCULINO'));
  ok(porqueNaoPode(S, vx, 'BANHEIRO FEMININO').startsWith('Falta dizer se Chris'),
    'quem não informou recebe o pedido, não a recusa', porqueNaoPode(S, vx, 'BANHEIRO FEMININO'));
  ok(porqueNaoPode(S, vf, 'BANHEIRO FEMININO') === '', 'quem pode não recebe frase nenhuma');
}

/* 7. o painel não pode dizer "ok" contando gente que não entra no posto */
{
  const S = base();
  const linha = saudeDoTime(S).funcoes.find(x => x.nome === 'GABINETE E BANHEIRO MASCULINO');
  ok(linha.aptos === 1, 'saúde conta só quem pode entrar', 'aptos=' + linha.aptos);
  ok(linha.grau === 'critico', 'uma pessoa só é crítico, mesmo com 3 habilitados', linha.grau);
}

/* 8. quem falta informar aparece, e só quem atrapalha */
{
  const S = base();
  const p = pendenciasDeSexo(S);
  ok(p.semSexo.length === 1 && p.semSexo[0].nome === 'Chris Lima', 'lista quem falta informar',
    JSON.stringify(p.semSexo));
  S.voluntarios.find(v => v.id === 'vx').funcoes = { COZINHA: 'titular' };
  ok(pendenciasDeSexo(S).semSexo.length === 0,
    'quem só serve onde não há exigência não entra na lista');
}

/* 9. posto com exigência e ninguém que possa: a vaga nunca preenche, e isso
   tem que ser dito em vez de virar vaga vazia sem explicação */
{
  const S = base();
  S.voluntarios = S.voluntarios.filter(v => v.id !== 'vm');
  const p = pendenciasDeSexo(S);
  ok(p.postosSemNinguem.length === 1 && p.postosSemNinguem[0].nome === 'GABINETE E BANHEIRO MASCULINO',
    'aponta o posto que ficou sem ninguém', JSON.stringify(p.postosSemNinguem));
}

/* 10. quem JÁ estava escalado quando a regra nasceu aparece para o líder
   trocar. Não some da escala sozinho: sumir seria mexer na escala pelas
   costas dele. */
{
  const S = base();
  garantirDia(S, DIA).slots['GABINETE E BANHEIRO MASCULINO'] = { vid: 'vf', status: 'pendente' };
  const p = pendenciasDeSexo(S);
  ok(p.escaladosErrados.length === 1 && p.escaladosErrados[0].nome === 'Ana Souza',
    'mostra quem está escalado onde não pode', JSON.stringify(p.escaladosErrados));
  ok(S.escalas[DIA].slots['GABINETE E BANHEIRO MASCULINO'].vid === 'vf',
    'e não tira ninguém da escala sozinho');
}

/* O PLACAR CONTA, EM VEZ DE SER DECLARADO — 20/09/2026.
   Era `const total = 16`, desacoplado do número real de `ok()`. Acrescentar
   uma asserção fazia a saída dizer "16/16" com 17 rodando, e a décima sétima
   podia estar reprovando sem aparecer no número que a gente lê. */
const total = feitas;
if (falhas) { console.log(`sexo: ${falhas} falha(s) em ${total}`); process.exit(1); }
console.log(`sexo: ${total}/${total} ok`);
