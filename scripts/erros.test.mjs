/* O que a tela diz quando o banco recusa. Roda com `npm test`.

   16/09/2026. A regra que este arquivo protege: uma recusa escrita por nós no
   banco (`raise exception`, código P0001) NUNCA vira "Não consegui salvar".
   Foi assim que o João Victor ficou sem saber por que a escala da Mídia não
   gravava. E o atalho de uma linha (`aviseHumano`) leva o detalhe técnico
   quando cai no genérico, porque é a única cópia que a pessoa consegue mandar
   para alguém. */
import { humano, aviseHumano } from '../lib/erros.ts';
import { sugerirEmail } from '../lib/email.ts';

let falhas = 0;
const ok = (cond, rotulo, extra = '') => {
  if (!cond) { falhas++; console.log('  FALHOU:', rotulo, extra); }
};

/* ---------------------------------------------------- as recusas do banco */
const conflito = humano({ code: 'P0001', message: 'William Silva ja esta em TRANSMISSAO ao mesmo tempo neste domingo.' }, 'salvar');
ok(conflito.texto.startsWith('William Silva já está em TRANSMISSAO nesse mesmo culto.'), 'conflito simultâneo (04)', conflito.texto);
ok(!conflito.generico, 'conflito não é genérico');

const indisp = humano({ code: 'P0001', message: 'Maria Eduarda avisou que nao pode neste domingo.' }, 'salvar');
ok(indisp.texto === 'Maria Eduarda avisou que não pode nesse dia. Escolha outra pessoa.', 'indisponível (04)', indisp.texto);

const antigo = humano({ code: 'P0001', message: 'Essa pessoa avisou que não pode em 20/09.' }, 'salvar');
ok(antigo.texto === 'Essa pessoa avisou que não pode em 20/09. Escolha outra pessoa.', 'indisponível (01)', antigo.texto);

const antigo2 = humano({ code: 'P0001', message: 'Essa pessoa já está em PROJECAO neste domingo.' }, 'salvar');
ok(antigo2.texto.startsWith('Essa pessoa já está em PROJECAO nesse mesmo culto.'), 'conflito (01)', antigo2.texto);

const semMin = humano({ code: 'P0001', message: 'salvar_dia sem ministerio' }, 'salvar');
ok(semMin.texto.startsWith('Não achei o ministério'), 'salvar_dia sem ministério', semMin.texto);

const outro = humano({ code: 'P0001', message: 'voluntario de outro ministerio' }, 'salvar');
ok(outro.texto.startsWith('Alguém desta escala não é deste ministério'), 'voluntário de outro ministério', outro.texto);

/* P0001 que a gente ainda não conhece: passa como veio, com ponto */
const novo = humano({ code: 'P0001', message: 'Esse culto já foi fechado pela liderança' }, 'salvar');
ok(novo.texto === 'Esse culto já foi fechado pela liderança.', 'P0001 desconhecido passa como veio', novo.texto);
ok(!novo.generico, 'P0001 desconhecido não é genérico');

/* a recusa do banco vence os trechos genéricos: "telefone" dentro da frase
   não pode virar "Confira o WhatsApp" */
const tel = humano({ code: 'P0001', message: 'Ana Telefone avisou que nao pode neste domingo.' }, 'salvar');
ok(tel.texto.startsWith('Ana Telefone avisou que não pode'), 'recusa do banco vence /telefone/', tel.texto);

/* ------------------------------------------------ o que já funcionava fica */
ok(humano({ message: 'TypeError: Failed to fetch' }).texto.startsWith('Sem conexão agora'), 'rede');
ok(humano({ code: '42501', message: 'permission denied for table escalacoes' }).texto.startsWith('Você não tem permissão'), 'permissão por código');
ok(humano({ message: 'new row violates row-level security policy for table "cultos"' }).texto.startsWith('Você não tem permissão'), 'RLS por texto');
ok(humano({ message: 'email rate limit exceeded' }).texto.startsWith('O sistema chegou ao limite de e-mails'), 'limite de e-mail');
ok(humano({ message: 'For security purposes, you can only request this after 47 seconds.' }).texto.startsWith('Você acabou de pedir um link'), 'cooldown do link');

/* ------------------------------------------------------ o genérico com detalhe */
const gen = humano({ code: 'XX000', message: 'algo que ninguém previu' }, 'salvar');
ok(gen.generico === true, 'desconhecido é genérico');
ok(gen.texto === 'Não consegui salvar. Tente de novo; se continuar, avise quem organiza a igreja.', 'frase genérica', gen.texto);
const linha = aviseHumano({ code: 'XX000', message: 'algo que ninguém previu' }, 'salvar');
ok(linha.endsWith('Detalhe: algo que ninguém previu'), 'aviseHumano leva o detalhe no genérico', linha);
ok(aviseHumano({ message: 'TypeError: Failed to fetch' }) .indexOf('Detalhe:') === -1, 'aviseHumano não leva detalhe quando a frase é específica');
const longo = aviseHumano({ message: 'x'.repeat(400) }, 'salvar');
ok(longo.length < 260 && longo.endsWith('…'), 'detalhe longo é cortado', String(longo.length));
ok(aviseHumano(undefined, 'salvar') === 'Não consegui salvar. Tente de novo; se continuar, avise quem organiza a igreja.', 'sem erro nenhum, sem detalhe');

/* ------------------------------------------------------- e-mail digitado errado */
const EMAILS = [
  ['monikribeiro7@hotmail.comm', 'monikribeiro7@hotmail.com'],
  ['fulano@gmail.con', 'fulano@gmail.com'],
  ['fulano@gmal.com', 'fulano@gmail.com'],
  ['Fulano@Hotmal.Com', 'fulano@hotmail.com'],
  ['fulano@empresa.com.br', null],
  ['fulano@uol.com.br', null],
  ['fulano@gmail.com', null],
  ['fulano@outlook.com', null],
  ['fulano@dominio-estranho.co', null],
  ['semarroba', null],
  ['', null],
];
for (const [entrada, esperado] of EMAILS) {
  const r = sugerirEmail(entrada);
  ok(r === esperado, `sugerirEmail(${JSON.stringify(entrada)})`, `→ ${JSON.stringify(r)}, esperado ${JSON.stringify(esperado)}`);
}

/* ---- 19/09/2026: dois casos que nasceram de defeitos de verdade ---- */

/* 1) A escala mudou debaixo da tela. `mudarStatus` passou a gravar dizendo de
      quem é a vaga; quando ninguém casa, a pessoa precisa entender o que
      houve, não levar um "Não consegui". */
const mudou = humano(new Error('ESCALA_MUDOU_NO_POSTO'), 'salvar');
ok(!mudou.generico, 'escala mudou no posto não é genérico', mudou.texto);
ok(/outra pessoa entrou/i.test(mudou.texto), 'escala mudou diz o que aconteceu', mudou.texto);

/* 1b) APAGAR QUEM JÁ SERVIU. A migração 52 pôs um gatilho que recusa, com o
       nome e a contagem no recado. Sem tradução, isso caía no genérico "Não
       consegui. Tente de novo" — para uma ação que NUNCA vai funcionar, o que
       faz a pessoa tentar de novo para sempre. O recado tem que dizer o
       caminho que funciona, que é Pausar. */
const apagou = humano(
  { code: '23001', message: 'VOLUNTARIO_COM_HISTORICO: Leticia Ramos ja serviu 12 vez(es). Apagar levaria junto toda a escala dela, sem volta. Use Pausar.' },
  'salvar');
ok(!apagou.generico, 'apagar quem tem histórico não é genérico', apagou.texto);
ok(/Leticia Ramos/.test(apagou.texto), 'e diz de quem é', apagou.texto);
ok(/12 vezes/.test(apagou.texto), 'e quantas vezes serviu, no plural certo', apagou.texto);
ok(/Pausar/i.test(apagou.texto), 'e manda para o caminho que funciona', apagou.texto);
const apagou1 = humano(
  { code: '23001', message: 'VOLUNTARIO_COM_HISTORICO: Ana ja serviu 1 vez(es). Use Pausar.' }, 'salvar');
ok(/1 vez[^e]/.test(apagou1.texto), 'uma vez só fica no singular', apagou1.texto);

/* 2) A mensagem de "sem ministério" mudou de nome quando a gravação deixou de
      ser a RPC `salvar_dia` e passou a ser `salvarDia`, em JavaScript. A
      tradução ficou para trás e só valia para o cron, que não tem tela. As
      DUAS grafias precisam cair na mesma frase. */
for (const msg of ['salvar_dia sem ministerio', 'salvarDia sem ministério']) {
  const r = humano(new Error(msg), 'salvar');
  ok(!r.generico, `"${msg}" não cai no genérico`, r.texto);
  ok(/Não achei o ministério/.test(r.texto), `"${msg}" acha a frase certa`, r.texto);
}

const total = 31 + 6 + EMAILS.length;
if (falhas) { console.log(`erros: ${falhas} falha(s) em ${total}`); process.exit(1); }
console.log(`erros: ${total}/${total} ok`);
