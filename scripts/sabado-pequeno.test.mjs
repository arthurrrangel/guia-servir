/* O SÁBADO PEQUENO · 19/11/2026.

   O pedido do Arthur: no Follow, escala completa para o culto grande e só
   foto e filmagem para o pequeno (lib/engine.ts, "O SÁBADO PEQUENO"). Este
   teste monta a Mídia como ela está no banco em 19/11 (os 11 postos e os 7
   grupos por área) e confere:
     · o que NÃO muda: domingo, evento, sábado completo e o ministério que
       não liga o recurso saem com a mesma mensagem e a mesma assinatura,
       texto por texto (o robô manda de novo tudo o que muda de assinatura);
     · o sábado pequeno: só FOTO, FILMAGEM e FILMAGEM 2 no sorteio, na conta,
       na cobrança e na mensagem; o geral diz que é só foto e filmagem; o
       grupo misto diz quais postos dele não servem; o grupo sem posto
       recebe uma linha escrita, e não vazio;
     · o robô: num sábado já mandado completo que passa a pequeno, manda a
       versão nova no geral, no grupo misto e a linha nos grupos que não
       servem, e não manda nada no grupo da Foto, que não mudou;
     · ligar, trocar o padrão e mexer na lista não mudam sábado montado.
   Nada sai da máquina: o banco não é chamado.

   Roda com: node --import ./scripts/_ts.mjs scripts/sabado-pequeno.test.mjs */

import {
  assinaturaDoEnvio, comFormatoDoSabado, estadoVazio, formatoDoDia, foraDoSabadoPequeno, funcoesDoDia,
  garantirDia, gerarDia, gruposDoDia, linkDoVoluntario, mensagemDoGrupo, msgConfirmar, msgEscala,
  msgSemPostoNoSabado, novoSabadoPequeno, postosDoSabadoPequeno, quemSaiNoPequeno, rotuloDoSabadoPequeno,
  sabadoPequenoDe, sugerirPlantao, vagasDe,
} from '@/lib/engine';
import { linhasDoRobo, preenchidosDoDia, respostaDoRobo } from '@/lib/robo-grupos';
import { planoDoDia } from '../robo-whatsapp/regras.mjs';

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => { feitas++; if (!c) { falhas++; console.log('  FALHOU:', rot, extra); } };

/* ------------------------------------------------- a Mídia de 19/11/2026 */
const NOMES = ['PROJEÇÃO', 'ILUMINAÇÃO', 'EDIÇÃO', 'FOTO', 'FILMAGEM', 'HEAD', 'TRANSMISSÃO (CORTE + PTZ)',
  'TRANSMISSÃO (SOM)', 'CÂMERA 1', 'CÂMERA 2', 'FILMAGEM 2'];
const ID = Object.fromEntries(NOMES.map((n, i) => [n, 'f' + (i + 1)]));
const PEQUENA = [ID['FOTO'], ID['FILMAGEM'], ID['FILMAGEM 2']];
const HOJE = '2026-11-19';
const link = linkDoVoluntario('https://escalas.guiaservir.com', 'midia', 'confirmar');

function midia() {
  const S = estadoVazio();
  S.temAcesso = true;
  S.equipe = 'Mídia';
  S.funcoes = NOMES.map((nome, i) => ({ id: 'f' + (i + 1), nome, ordem: i + 1, simultanea: true, ativa: true, tipos: ['domingo', 'follow'] }));
  S.config.grupos = [
    { id: 'g1', nome: 'Multimídia · Projeção', funcoes: [ID['PROJEÇÃO']] },
    { id: 'g2', nome: 'Multimídia · Iluminação', funcoes: [ID['ILUMINAÇÃO']] },
    { id: 'g3', nome: 'Multimídia · Edição', funcoes: [ID['EDIÇÃO']] },
    { id: 'g4', nome: 'Multimídia · Foto', funcoes: [ID['FOTO']] },
    { id: 'g5', nome: 'Multimídia · Filmagem e Câmeras', funcoes: [ID['FILMAGEM'], ID['CÂMERA 1'], ID['CÂMERA 2'], ID['FILMAGEM 2']] },
    { id: 'g6', nome: 'Multimídia · Head', funcoes: [ID['HEAD']] },
    { id: 'g7', nome: 'Multimídia · Transmissão', funcoes: [ID['TRANSMISSÃO (CORTE + PTZ)'], ID['TRANSMISSÃO (SOM)']] },
  ];
  /* duas pessoas por posto: dá para sortear e para trocar */
  S.voluntarios = [];
  NOMES.forEach((nome, i) => {
    for (const k of [1, 2]) {
      const id = `v${i + 1}_${k}`;
      S.voluntarios.push({ id, nome: `Pessoa ${i + 1}.${k}`, tel: '', ativo: true, limiteMes: 4, token: 'tok' + id,
        funcoes: { [nome]: 'titular' }, conferido: true, confirmadas: { [nome]: true }, indisponivel: [], disponivel: [] });
    }
  });
  const montar = (d, gente, extra = {}) => {
    const dia = garantirDia(S, d);
    dia.cultoId = 'c' + d;
    for (const [nome, k, status] of gente) dia.slots[nome] = { vid: `v${NOMES.indexOf(nome) + 1}_${k}`, status, fixo: false, primeiraVez: false };
    Object.assign(dia, extra);
  };
  /* 21/11: o sábado de verdade, já mandado completo (três pessoas e "Não precisa neste sábado" nos outros oito) */
  montar('2026-11-21', [['FOTO', 1, 'confirmado'], ['FILMAGEM', 1, 'confirmado'], ['FILMAGEM 2', 1, 'pendente']], {
    obs: 'ATENÇÃO: desconsiderem o restante da escala do Follow deste sábado (21/11).',
    plantao: ['v4_2', 'v11_2'],
    convidados: Object.fromEntries(NOMES.filter(n => !['FOTO', 'FILMAGEM', 'FILMAGEM 2'].includes(n)).map(n => [n, 'Não precisa neste sábado'])),
  });
  montar('2026-11-22', NOMES.slice(0, 7).map(n => [n, 1, 'pendente']), { plantao: ['v1_2'] });
  /* 28/11: montado, 7 de 11 */
  montar('2026-11-28', NOMES.slice(0, 7).map(n => [n, 2, 'pendente']), { plantao: ['v2_2'] });
  /* 05/12: o culto existe, ninguém escalado ainda */
  montar('2026-12-05', []);
  /* 19/12: um evento num sábado */
  montar('2026-12-19', [['PROJEÇÃO', 1, 'pendente'], ['HEAD', 1, 'pendente']], { evento: 'Conferência' });
  return S;
}
const DIAS = ['2026-11-21', '2026-11-22', '2026-11-28', '2026-12-05', '2026-12-12', '2026-12-19'];

/* tudo o que sai de um dia para os grupos e para o robô */
const AGORA = new Date('2026-11-19T22:00:00Z');
function tudo(S, d) {
  return {
    postos: funcoesDoDia(S, d).map(f => f.nome),
    geral: msgEscala(S, d, { link, agora: AGORA }),
    ass: assinaturaDoEnvio(S, d),
    grupos: gruposDoDia(S, d).map(x => ({
      nome: x.grupo.nome, funcoes: x.funcoes.map(f => f.nome),
      texto: x.funcoes.length ? msgEscala(S, d, { link, grupo: x.grupo, agora: AGORA }) : '',
      ass: assinaturaDoEnvio(S, d, x.grupo), conta: x.conta,
    })),
    robo: linhasDoRobo(S, d, link).map(l => ({ ...l, texto: l.texto.replace(/^(Bo[am] (dia|tarde|noite))/i, 'SAUDAÇÃO') })),
    cobranca: msgConfirmar(S, d, link),
    preenchidos: preenchidosDoDia(S, d),
    vagas: vagasDe(S, d),
  };
}
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* 1 · O QUE NÃO MUDA ---------------------------------------------------- */
{
  const antes = midia();
  const base = Object.fromEntries(DIAS.map(d => [d, tudo(antes, d)]));

  /* ligado hoje, com o padrão pequeno: 21/11 e 28/11 já têm gente e ficam completos */
  const S = midia();
  S.config.sabadoPequeno = novoSabadoPequeno(S, { postos: PEQUENA, padrao: 'pequeno' }, HOJE);
  const sp = sabadoPequenoDe(S);
  ok(sp && sp.desde === HOJE, 'ligar grava o dia de hoje como o começo', JSON.stringify(sp));
  ok(sp && sp.dias['2026-11-21'] === 'completo' && sp.dias['2026-11-28'] === 'completo', 'os sábados montados ficam completos', JSON.stringify(sp?.dias));
  ok(sp && !('2026-12-05' in sp.dias), 'o sábado sem ninguém não ganha escolha própria', JSON.stringify(sp?.dias));
  ok(sp && !('2026-11-22' in sp.dias) && !('2026-12-19' in sp.dias), 'domingo e evento não entram na lista dos sábados', JSON.stringify(sp?.dias));
  for (const d of ['2026-11-21', '2026-11-22', '2026-11-28', '2026-12-19']) {
    ok(igual(tudo(S, d), base[d]), `${d}: tudo igual ao de antes de ligar`);
  }
  ok(formatoDoDia(S, '2026-12-05') === 'pequeno' && formatoDoDia(S, '2026-12-12') === 'pequeno', 'o sábado novo nasce pequeno');
  ok(formatoDoDia(S, '2026-11-14') === 'completo', 'o sábado de antes de ligar é completo');
  ok(formatoDoDia(S, '2026-12-19') === 'completo', 'evento num sábado é completo (leva todos os postos)');
  ok(formatoDoDia(S, '2026-11-22') === 'completo' && postosDoSabadoPequeno(S, '2026-11-22') === null, 'domingo não tem formato');

  /* o padrão "completo": nada muda em dia nenhum */
  const C = midia();
  C.config.sabadoPequeno = novoSabadoPequeno(C, { postos: PEQUENA, padrao: 'completo' }, HOJE);
  for (const d of DIAS) ok(igual(tudo(C, d), base[d]), `padrão completo, ${d}: tudo igual`);

  /* a escolha "completo" num sábado que nasceria pequeno: igual ao de antes */
  const E = midia();
  E.config.sabadoPequeno = comFormatoDoSabado(novoSabadoPequeno(E, { postos: PEQUENA, padrao: 'pequeno' }, HOJE), '2026-12-05', 'completo');
  ok(igual(tudo(E, '2026-12-05'), base['2026-12-05']), 'sábado escolhido completo: tudo igual ao de antes');

  /* o que vem do banco com outra forma não derruba nada e vale como desligado */
  for (const lixo of [null, 'sim', 7, [], { postos: 'FOTO' }, { postos: null }, { dias: {} }]) {
    const L = midia();
    L.config.sabadoPequeno = lixo;
    ok(DIAS.every(d => igual(tudo(L, d), base[d])), `config estranha (${JSON.stringify(lixo)}): tudo igual`);
  }
  /* `dias` com forma estranha também */
  const D = midia();
  D.config.sabadoPequeno = { postos: PEQUENA, padrao: 'pequeno', desde: HOJE, dias: ['2026-12-05'] };
  ok(formatoDoDia(D, '2026-12-05') === 'pequeno' && igual(tudo(D, '2026-11-22'), base['2026-11-22']), 'dias como lista: ignorado, o padrão vale');
  /* lista sem nenhum posto que exista no dia: volta a ser completo, e não um sábado sem posto */
  const V = midia();
  V.config.sabadoPequeno = { postos: ['nao-existe'], padrao: 'pequeno', desde: HOJE };
  ok(formatoDoDia(V, '2026-12-05') === 'completo' && igual(tudo(V, '2026-12-05'), base['2026-12-05']), 'lista sem posto do dia: completo');
}

/* 2 · O SÁBADO PEQUENO -------------------------------------------------- */
{
  const S = midia();
  S.config.sabadoPequeno = novoSabadoPequeno(S, { postos: PEQUENA, padrao: 'pequeno' }, HOJE);
  const d = '2026-12-12';
  ok(igual(funcoesDoDia(S, d).map(f => f.nome), ['FOTO', 'FILMAGEM', 'FILMAGEM 2']), 'só FOTO, FILMAGEM e FILMAGEM 2', funcoesDoDia(S, d).map(f => f.nome).join());
  ok(rotuloDoSabadoPequeno(S, PEQUENA) === 'foto e filmagem', 'o nome da escala pequena: "foto e filmagem"', rotuloDoSabadoPequeno(S, PEQUENA));

  /* o sorteio só preenche os três, e não sobra vaga de posto que não existe */
  const r = gerarDia(S, d);
  const dia = S.escalas[d];
  ok(igual(Object.keys(dia.slots).sort(), ['FILMAGEM', 'FILMAGEM 2', 'FOTO']), 'o sorteio só põe gente nos três', Object.keys(dia.slots).join());
  ok(r.vagas.length === 0 && vagasDe(S, d).length === 0, 'nenhuma vaga aberta', JSON.stringify(r.vagas));
  ok(preenchidosDoDia(S, d) === 3, 'três preenchidos para o robô');
  /* o plantão cobre o dia inteiro (aqui ninguém é curinga, então vai à mão) */
  dia.plantao = ['v1_2'];

  /* o geral */
  const geral = msgEscala(S, d, { link, agora: AGORA });
  ok(geral.includes('Neste sábado vamos precisar só de foto e filmagem.'), 'o geral diz que é só foto e filmagem', geral);
  ok(['FOTO', 'FILMAGEM', 'FILMAGEM 2'].every(n => geral.split('\n').includes(n)), 'o geral lista os três');
  ok(!['PROJEÇÃO', 'HEAD', 'CÂMERA 1', 'TRANSMISSÃO (SOM)'].some(n => geral.includes(n)), 'o geral não fala dos outros postos', geral);
  ok(!geral.includes('PRECISO DE ALGUÉM') && !geral.includes('Não precisa'), 'nenhum "preciso de alguém" nem "não precisa" no geral');
  ok(geral.includes('PLANTÃO'), 'o plantão continua no geral');
  ok(geral.endsWith(`Confirma por aqui: ${link}`), 'o geral fecha com o link do ministério');

  const G = Object.fromEntries(gruposDoDia(S, d).map(x => [x.grupo.id, x]));
  const M = Object.fromEntries(Object.entries(G).map(([id, x]) => [id, mensagemDoGrupo(S, d, x, link, AGORA)]));
  /* a Foto: a parte dela, sem linha a mais */
  ok(!M.g4.linha && !M.g4.vazio && M.g4.texto.includes('FOTO') && !M.g4.texto.includes('Neste sábado'), 'Foto: a parte dela, sem linha a mais', M.g4.texto);
  /* o grupo misto */
  ok(!M.g5.linha && M.g5.texto.includes('Neste sábado não vamos precisar de CÂMERA 1 e CÂMERA 2.'), 'Filmagem e Câmeras: diz que as câmeras não servem', M.g5.texto);
  ok(M.g5.texto.split('\n').includes('FILMAGEM') && M.g5.texto.split('\n').includes('FILMAGEM 2') && !M.g5.texto.split('\n').includes('CÂMERA 1'), 'Filmagem e Câmeras: lista FILMAGEM e FILMAGEM 2');
  /* os grupos sem posto: a linha escrita */
  const linhaProj = 'Boa noite galera! Neste sábado (12/12) o Follow vai ter só foto e filmagem: não vamos precisar de PROJEÇÃO.';
  ok(M.g1.linha && !M.g1.vazio && M.g1.texto === linhaProj, 'Projeção: uma linha escrita', M.g1.texto);
  ok(M.g7.texto.endsWith('não vamos precisar de TRANSMISSÃO (CORTE + PTZ) e TRANSMISSÃO (SOM).'), 'Transmissão: os dois postos na linha', M.g7.texto);
  ok(['g1', 'g2', 'g3', 'g6', 'g7'].every(g => M[g].linha && !M[g].texto.includes('\n')), 'os cinco grupos sem posto recebem uma linha só');
  ok(['g1', 'g2', 'g3', 'g6', 'g7'].every(g => !M[g].texto.includes(link) && !M[g].texto.includes('tok')), 'a linha não leva link nenhum');
  ok(msgSemPostoNoSabado(S, d, G.g4.grupo) === '' && msgSemPostoNoSabado(S, '2026-11-28', G.g1.grupo) === '', 'grupo que serve e sábado completo: sem linha');

  /* o robô recebe as oito linhas, nenhuma vazia, iguais às da tela */
  const l = linhasDoRobo(S, d, link);
  ok(l.length === 8 && l.every(x => !x.vazio && !!x.texto), 'o robô recebe oito linhas, nenhuma vazia', JSON.stringify(l.map(x => [x.nome, x.vazio])));
  ok(l.slice(1).every(x => x.ass === M[x.gid].ass), 'a assinatura de cada grupo é a da tela');
  const resp = respostaDoRobo(S, d, { slug: 'midia', nome: 'Mídia' }, link, '18:00', '19:30');
  ok(resp.culto.postos === 3 && resp.culto.preenchidos === 3 && resp.linhas.length === 8, 'a rota do robô: 3 postos, 3 preenchidos, 8 linhas', JSON.stringify(resp.culto));

  /* a cobrança só fala de quem está nos três */
  const cob = msgConfirmar(S, d, link);
  ok(cob && ['FOTO', 'FILMAGEM', 'FILMAGEM 2'].every(n => cob.includes(`Pessoa ${NOMES.indexOf(n) + 1}.`)), 'a cobrança chama quem está nos três', cob);
  ok(!/Pessoa (1|2|3|6|7|8|9|10)\./.test(cob), 'a cobrança não chama ninguém dos outros postos', cob);

  /* a assinatura da linha: não muda com o recado nem com quem está nos três; muda com a lista */
  const assLinha = M.g1.ass;
  dia.obs = 'chegar 18h';
  ok(assinaturaDoEnvio(S, d, G.g1.grupo) === assLinha, 'o recado não muda a assinatura da linha');
  ok(assinaturaDoEnvio(S, d) !== resp.linhas[0].ass, 'o recado muda a do geral, como sempre');
  dia.slots['FOTO'] = { vid: 'v4_2', status: 'pendente', fixo: true };
  ok(assinaturaDoEnvio(S, d, G.g1.grupo) === assLinha, 'trocar a pessoa da FOTO não muda a linha da Projeção');
  ok(assinaturaDoEnvio(S, d, G.g4.grupo) !== M.g4.ass, 'e muda a da Foto');
  const S2 = midia();
  S2.config.sabadoPequeno = { postos: [ID['FOTO'], ID['FILMAGEM']], padrao: 'pequeno', desde: HOJE };
  ok(assinaturaDoEnvio(S2, d, G.g5.grupo) !== M.g5.ass, 'outra lista muda a assinatura do grupo misto');
}

/* 3 · O ROBÔ: um sábado mandado completo que passa a pequeno ---------------- */
{
  const S = midia();
  const d = '2026-11-28';
  const grupos = Object.fromEntries(['Grupo geral', ...S.config.grupos.map(g => g.nome)].map(n => [n, { jid: n + '@g.us' }]));
  /* o que o robô gravou quando mandou o 28/11 completo */
  const estadoDoDia = Object.fromEntries(linhasDoRobo(S, d, link).filter(l => !l.vazio)
    .map(l => [l.gid, { situacao: 'postado', ass: l.ass, versao: 1 }]));
  ok(Object.keys(estadoDoDia).length === 8, 'completo, o 28/11 saiu nos oito grupos');

  S.config.sabadoPequeno = novoSabadoPequeno(S, { postos: PEQUENA, padrao: 'pequeno' }, HOJE);
  const semMudar = planoDoDia({ resposta: respostaDoRobo(S, d, { slug: 'midia', nome: 'Mídia' }, link, '18:00', '19:30'), estadoDoDia, grupos, primeiraPermitida: true });
  ok(semMudar.acoes.length === 0, 'ligar o recurso não faz o robô mandar o 28/11 de novo', JSON.stringify(semMudar.acoes.map(a => a.grupo)));

  /* o líder troca o 28/11 para "só foto e filmagem": quem está nos outros postos sai */
  S.config.sabadoPequeno = comFormatoDoSabado(S.config.sabadoPequeno, d, 'pequeno');
  const sai = quemSaiNoPequeno(S, d, PEQUENA);
  ok(igual(sai.map(x => x.funcao), ['PROJEÇÃO', 'ILUMINAÇÃO', 'EDIÇÃO', 'HEAD', 'TRANSMISSÃO (CORTE + PTZ)']), 'quem sai: os cinco dos outros postos', sai.map(x => x.funcao).join());
  for (const x of sai) delete S.escalas[d].slots[x.funcao];
  const p = planoDoDia({ resposta: respostaDoRobo(S, d, { slug: 'midia', nome: 'Mídia' }, link, '18:00', '19:30'), estadoDoDia, grupos, primeiraPermitida: true });
  const mandados = p.acoes.map(a => a.grupo.jid.replace('@g.us', '')).sort();
  ok(igual(mandados, ['Grupo geral', 'Multimídia · Edição', 'Multimídia · Filmagem e Câmeras', 'Multimídia · Head',
    'Multimídia · Iluminação', 'Multimídia · Projeção', 'Multimídia · Transmissão'].sort()), 'o robô manda a versão nova em sete grupos e deixa a Foto', mandados.join(' | '));
  ok(p.acoes.every(a => a.tipo === 'atualizacao'), 'como atualização, não como primeira');
  const nosCinco = p.acoes.filter(a => /Projeção|Head|Edição|Iluminação|Transmissão/.test(a.grupo.jid));
  ok(nosCinco.length === 5 && nosCinco.every(a => a.texto.includes('não vamos precisar de') && !a.texto.includes('\n')), 'nos cinco, a linha escrita');
}

/* 4 · AJUSTES: o que já está montado não muda sozinho ----------------------- */
{
  const S = midia();
  S.config.sabadoPequeno = novoSabadoPequeno(S, { postos: PEQUENA, padrao: 'pequeno' }, HOJE);
  /* o 12/12 é montado pequeno */
  gerarDia(S, '2026-12-12');
  const antes12 = tudo(S, '2026-12-12');
  const antes05 = formatoDoDia(S, '2026-12-05');
  /* trocar o padrão para completo: o 12/12 (montado) continua pequeno; o 05/12 (vazio) passa a completo */
  S.config.sabadoPequeno = novoSabadoPequeno(S, { padrao: 'completo' }, HOJE);
  ok(antes05 === 'pequeno' && formatoDoDia(S, '2026-12-05') === 'completo', 'padrão completo: o sábado sem ninguém segue o padrão novo');
  ok(igual(tudo(S, '2026-12-12'), antes12), 'padrão completo: o 12/12 montado pequeno continua igual');
  ok(sabadoPequenoDe(S).desde === HOJE, 'mudar o padrão não muda o começo');
  /* tirar FILMAGEM 2 da lista: o 12/12 montado continua com os três */
  S.config.sabadoPequeno = novoSabadoPequeno(S, { postos: [ID['FOTO'], ID['FILMAGEM']], padrao: 'pequeno' }, HOJE);
  ok(igual(tudo(S, '2026-12-12'), antes12), 'outra lista: o 12/12 montado continua igual');
  ok(igual(funcoesDoDia(S, '2026-12-26').map(f => f.nome), ['FOTO', 'FILMAGEM']), 'o sábado novo já sai com a lista nova');
  /* desligar: tudo completo */
  ok(novoSabadoPequeno(S, null, HOJE) === null, 'desligar grava null');
  S.config.sabadoPequeno = null;
  ok(DIAS.every(d => formatoDoDia(S, d) === 'completo'), 'desligado, todo sábado é completo');
  /* religar depois: o começo é o dia de religar, e o 12/12 (montado completo agora) fica completo */
  S.config.sabadoPequeno = novoSabadoPequeno(S, { postos: PEQUENA, padrao: 'pequeno' }, '2026-12-01');
  ok(sabadoPequenoDe(S).desde === '2026-12-01' && sabadoPequenoDe(S).dias['2026-12-12'] === 'completo', 'religar: começa de novo e guarda o montado como está', JSON.stringify(sabadoPequenoDe(S)));
  /* a escolha do cartão guarda a lista de agora */
  const c = comFormatoDoSabado(sabadoPequenoDe(S), '2027-01-09', 'pequeno');
  ok(igual(c.dias['2027-01-09'], PEQUENA), 'o cartão guarda a lista de agora no sábado', JSON.stringify(c.dias));
  ok(comFormatoDoSabado(c, '2027-01-09', 'completo').dias['2027-01-09'] === 'completo', 'e volta para completo');
  ok(foraDoSabadoPequeno(S, '2026-11-22').length === 0, 'domingo: nada fica de fora');
}

/* 5 · A ASSINATURA DE ANTES, ESCRITA AQUI ----------------------------------
   As de baixo saíram do código de antes do sábado pequeno (016f5c7), com
   este mesmo estado. Comparar o código novo com ele mesmo não pega uma
   mudança na conta (um 'sem=' vazio em todo dia, por exemplo): estas
   pegam. Com o recurso ligado, os três dias montados têm de dar o mesmo. */
{
  const ANTES = {
    '2026-11-21': ['kx64kz', 'iam9bp', '6ladqu', '1tsr3w7', '16g3g17', '1hcwci4', '1fo2phu', 'fuhfq3'],
    '2026-11-22': ['gvsno3', 'fkypuw', '1y7ddzc', '11lcwiw', 'yfh1e0', '1pkduoq', '1kfp2fc', '15eaam2'],
    '2026-11-28': ['hlgvhv', 'fkzfwr', '1y7e44r', '11ldmkr', 'yfbsff', '5cd5g9', '1kfpskr', '1xe1ard'],
  };
  for (const ligado of [false, true]) {
    const S = midia();
    if (ligado) S.config.sabadoPequeno = novoSabadoPequeno(S, { postos: PEQUENA, padrao: 'pequeno' }, HOJE);
    for (const [d, esperadas] of Object.entries(ANTES)) {
      const agora = [assinaturaDoEnvio(S, d), ...gruposDoDia(S, d).map(x => assinaturaDoEnvio(S, d, x.grupo))];
      ok(igual(agora, esperadas), `${d}${ligado ? ', ligado' : ''}: as assinaturas de antes`, JSON.stringify(agora));
    }
  }
}

/* 6 · O PLANTÃO DO SÁBADO PEQUENO ------------------------------------------
   No sábado pequeno o plantão entra no lugar de quem furar na FOTO ou na
   FILMAGEM: só quem pode pegar um desses postos. No completo, o curinga de
   sempre (quem é titular ou reserva em dois postos ou mais). */
{
  const comCuringa = () => {
    const S = midia();
    S.voluntarios.push({ id: 'vcur', nome: 'Curinga da Projeção', tel: '', ativo: true, limiteMes: 4, token: 'tokcur',
      funcoes: { 'PROJEÇÃO': 'titular', 'ILUMINAÇÃO': 'titular' }, conferido: true,
      confirmadas: { 'PROJEÇÃO': true, 'ILUMINAÇÃO': true }, indisponivel: [], disponivel: [] });
    return S;
  };
  const DESLIGADO = comCuringa();
  const LIGADO = comCuringa();
  LIGADO.config.sabadoPequeno = novoSabadoPequeno(LIGADO, { postos: PEQUENA, padrao: 'pequeno' }, HOJE);
  for (const d of ['2026-11-21', '2026-11-22', '2026-11-28', '2026-12-19']) {
    ok(igual(sugerirPlantao(LIGADO, d, 2), sugerirPlantao(DESLIGADO, d, 2)), `${d}: o plantão sugerido é o de sempre`);
  }
  ok(igual(sugerirPlantao(DESLIGADO, '2026-12-05', 1), ['vcur']), 'completo: o curinga da Projeção é o plantão', JSON.stringify(sugerirPlantao(DESLIGADO, '2026-12-05', 1)));
  const p = sugerirPlantao(LIGADO, '2026-12-05', 3);
  const daFotoEFilmagem = ['v4_1', 'v4_2', 'v5_1', 'v5_2', 'v11_1', 'v11_2'];
  ok(p.length === 3 && p.every(id => daFotoEFilmagem.includes(id)), 'pequeno: o plantão é de quem faz foto ou filmagem', JSON.stringify(p));
  ok(!p.includes('vcur'), 'pequeno: o curinga da Projeção não entra');
  /* e o sorteio do dia já põe o plantão assim */
  gerarDia(LIGADO, '2026-12-05');
  const pl = LIGADO.escalas['2026-12-05'].plantao;
  ok(pl.length === LIGADO.config.plantaoQtd && pl.every(id => daFotoEFilmagem.includes(id)), 'o sorteio do sábado pequeno põe o plantão de foto ou filmagem', JSON.stringify(pl));
}

console.log(`sabado-pequeno: ${feitas - falhas}/${feitas}`);
if (falhas) process.exit(1);
