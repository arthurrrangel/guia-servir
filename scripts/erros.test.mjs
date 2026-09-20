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


/* 3) OS CÓDIGOS DO EVENTO ESPORÁDICO, E POR QUE O MAIS PROVÁVEL FALTAVA.

      `criar_evento` e `apagar_evento` devolvem nove códigos curtos. Cinco
      estavam traduzidos; quatro chegavam crus na tela como
      "Não consegui salvar. Detalhe: DIA_DE_CULTO".

      `DIA_DE_CULTO` não é caso de canto: o campo é um `<input type="date">`
      comum, que não impede escolher um domingo, e escolher um domingo é a
      primeira coisa que alguém tenta. O erro mais frequente do recurso
      inteiro era o que menos dizia.

      E o gatilho do banco lança OS MESMOS casos por outro caminho, com o
      texto colado (`DIA_DE_CULTO: 2026-10-04 e domingo...`), escrito sem
      acento para o arquivo SQL atravessar qualquer editor. Quem lê é gente,
      então as duas formas precisam cair em português. */
const CODIGOS_DO_EVENTO = [
  'DIA_DE_CULTO', 'SEM_PERMISSAO', 'NAO_EXISTE', 'REGRA', 'JA_TEM_EVENTO',
  'JA_TEM_CULTO', 'DATA_NO_PASSADO', 'FALTA_NOME', 'FALTA_DATA',
  'NAO_E_EVENTO', 'EVENTO_NAO_CRIADO', 'EVENTO_NAO_APAGADO',
];
for (const c of CODIGOS_DO_EVENTO) {
  const r = humano(new Error(c), 'salvar');
  ok(!r.generico, `${c} tem frase própria`, r.texto);
  ok(!/[A-Z_]{6,}/.test(r.texto), `${c} não vaza o código na frase`, r.texto);
}

/* as mesmas recusas vindas do gatilho, com texto colado e código SQLSTATE */
const DO_GATILHO = [
  ['P0001', 'DIA_DE_CULTO: 2026-10-04 e domingo, e domingo ja tem culto.', /04\/10\/2026/],
  ['23505', 'JA_TEM_EVENTO: 2026-10-15 ja tem "GUIA Empreendedor" marcado para este ministerio, e a escala e um dia por data.', /GUIA Empreendedor/],
  ['42501', 'CULTO_REGULAR_SO_ORGANIZADOR_GERAL: mudar o culto de 2026-11-01 muda a escala de todos os ministerios daquele dia.', /todos os minist/],
  ['42501', 'EVENTO_DE_OUTRO_MINISTERIO: GUIA Empreendedor nao e do seu ministerio.', /outro minist/],
  ['42501', 'EVENTO_NAO_TROCA_DE_DONO: so quem lidera os dois ministerios.', /dois minist/],
  ['P0001', 'MINISTERIOS_DIFERENTES: FOTO nao e do ministerio de Ana.', /mesmo minist/],
  ['P0001', 'DATA_NO_PASSADO: 2020-01-05 ja passou.', /05\/01\/2020/],
];
for (const [code, message, esperado] of DO_GATILHO) {
  const r = humano({ code, message }, 'salvar');
  ok(!r.generico, `gatilho "${message.slice(0, 28)}…" não cai no genérico`, r.texto);
  ok(esperado.test(r.texto), `gatilho "${message.slice(0, 28)}…" diz o que importa`, r.texto);
  ok(!/[A-Z_]{6,}/.test(r.texto), `gatilho "${message.slice(0, 28)}…" não vaza o código`, r.texto);
}

/* 4) E A ORDEM: frase nossa ganha do código genérico.

      `PORCODIGO` responde pela CLASSE (42501 = permissão); `PORBANCO`
      responde pela FRASE que nós escrevemos. A frase é sempre mais
      específica. Com a ordem antiga (código primeiro), a explicação boa era
      apagada por uma genérica correta e vazia. */
{
  const r = humano({ code: '42501',
    message: 'CULTO_REGULAR_SO_ORGANIZADOR_GERAL: mudar o culto de 2026-11-01 muda a escala de todos os ministerios daquele dia.' }, 'salvar');
  ok(/igreja inteira/.test(r.texto),
    'a frase específica do banco ganha do texto genérico do código 42501', r.texto);
  const g = humano({ code: '42501', message: 'permission denied for table voluntarios' }, 'salvar');
  ok(/permiss/i.test(g.texto),
    'e um 42501 sem frase nossa continua caindo na frase do código', g.texto);
}

/* 5) AS CINCO QUE CHEGAVAM CRUAS — 20/09/2026.

      Auditoria de backend. O repasse de P0001 evitava o genérico e entregava
      o texto de máquina: sem acento, e num caso com nome de coluna do banco
      (`exige_sexo invalido`) na tela de Ajustes. Duas delas aparecem na tela
      do VOLUNTÁRIO, que não tem a quem perguntar.

      O caso do `Link inválido` é o que prova o conserto de acento: o banco de
      produção lança COM acento e o padrão casava só SEM. */
const CRUAS = [
  ['Voce nao e o lider deste culto', /organiza/i],
  ['Resposta invalida',              /pode servir/i],
  ['funcao sem nome',                /nome/i],
  ['exige_sexo invalido',            /homens|mulheres/i],
  ['Link inválido',                  /link/i],
  ['Link invalido',                  /link/i],
];
for (const [message, esperado] of CRUAS) {
  const r = humano({ code: 'P0001', message }, 'salvar');
  ok(esperado.test(r.texto), `"${message}" vira frase de gente`, r.texto);
  ok(r.texto !== message && !r.texto.startsWith(message),
     `"${message}" não é repassada crua`, r.texto);
  ok(!/exige_sexo|_id\b/.test(r.texto), `"${message}" não vaza nome de coluna`, r.texto);
}

const EXTRA = CODIGOS_DO_EVENTO.length * 2 + DO_GATILHO.length * 3 + 2 + CRUAS.length * 3;

const total = 31 + 6 + EMAILS.length + EXTRA;
if (falhas) { console.log(`erros: ${falhas} falha(s) em ${total}`); process.exit(1); }
console.log(`erros: ${total}/${total} ok`);
