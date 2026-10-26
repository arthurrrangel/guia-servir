/* AS REGRAS DO ROBÔ, SEM WHATSAPP E SEM REDE · 26/10/2026.

   Tudo aqui é puro: recebe a hora, a resposta do sistema e o que o robô já
   fez, e devolve o que fazer. rodada.mjs executa; testes/regras.test.mjs
   confere sem tocar em nada.

   As regras de envio vêm do robô de 08/10 e do piloto discutido em 26/10:
   · uma mensagem por grupo por culto; se a escala do grupo mudou depois do
     envio (alguém trocado, vaga aberta), vai a versão nova; confirmação não conta;
   · envio INCERTO (o robô não sabe se saiu) não se repete sozinho: fica
     parado até alguém conferir, para não postar a mesma escala duas vezes;
   · a escala de um culto cuja hora de sair veio ANTES de o robô existir não é
     dele: quem mandava antes (à mão) já mandou. O robô não repete;
   · a cobrança só depois de a escala estar no grupo há algumas horas, só com
     gente faltando confirmar, e nunca depois de o culto começar. */

export const minutos = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
};

/* data e minuto do dia em Brasília */
export function agoraSP(d = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const g = (t) => p.find((x) => x.type === t)?.value;
  return { data: `${g('year')}-${g('month')}-${g('day')}`, min: +g('hour') * 60 + +g('minute'), ms: d.getTime() };
}

export function somaDias(iso, n) {
  return new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
}

export function diasEntre(de, ate) {
  return Math.round((Date.parse(ate + 'T12:00:00Z') - Date.parse(de + 'T12:00:00Z')) / 86400000);
}

/* "10h", "19h", "19h30" → minutos; sem hora → null */
export function horaDoCulto(hora) {
  const m = /^(\d{1,2})h(\d{2})?$/.exec(String(hora || '').trim());
  return m ? +m[1] * 60 + +(m[2] || 0) : null;
}

/* o culto daquele dia já começou? Sem hora conhecida, conta como não começado
   até o fim do dia */
export function cultoJaComecou(data, hora, agora) {
  if (data < agora.data) return true;
  if (data > agora.data) return false;
  const h = horaDoCulto(hora);
  return h !== null && agora.min >= h;
}

/* as rodadas que devem rodar agora: passou da hora, dentro da tolerância, e
   ainda não rodou hoje */
export function rodadasDevidas(rodadas, agora, feitas, toleranciaMin) {
  return rodadas.filter((r) => {
    const alvo = minutos(r.hhmm);
    return feitas[r.hhmm] !== agora.data && agora.min >= alvo && agora.min <= alvo + toleranciaMin;
  });
}

/* a hora em que a escala de um culto sai pela primeira vez: N dias antes, na
   rodada marcada "primeira", em Brasília (UTC-3 o ano todo desde 2019) */
export function momentoDaPrimeira(data, rodadas, antecedencia) {
  const r = (rodadas || []).find((x) => x.primeira);
  if (!r) return null;
  return Date.parse(`${somaDias(data, -antecedencia)}T${r.hhmm}:00-03:00`);
}

/* AS DATAS QUE UMA RODADA OLHA: os dias da janela (hoje até a antecedência),
   as datas futuras que o robô já postou (para repor trocas mesmo quando a
   escala saiu antes da hora, a pedido) e as datas que o Arthur mandou
   antecipar nesta rodada. Nada além de `vigiaDias` à frente. */
export function datasDaRodada(hoje, antecedencia, envios = {}, antecipar = [], vigiaDias = 14) {
  const limite = somaDias(hoje, vigiaDias);
  const datas = new Set();
  for (let n = 0; n <= antecedencia; n++) datas.add(somaDias(hoje, n));
  for (const d of Object.keys(envios || {})) if (d >= hoje && d <= limite && Object.keys(envios[d] || {}).length) datas.add(d);
  for (const d of antecipar || []) if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d >= hoje && d <= limite) datas.add(d);
  return [...datas].sort();
}

/* a escala deste dia pode sair pela primeira vez nesta rodada? Na rodada da
   noite, a de daqui a 2 dias; em qualquer rodada, a que ficou para trás
   (daqui a 1 dia, ou hoje antes do culto). Nunca a de um culto cuja hora de
   sair veio antes de o robô começar (`inicioMs`): essa já era de alguém. */
export function primeiraPermitida(diasAte, rodada, antecedencia, momentoMs = null, inicioMs = null) {
  if (diasAte < 0 || diasAte > antecedencia) return false;
  if (inicioMs != null && momentoMs != null && momentoMs < inicioMs) return false;
  return diasAte < antecedencia || !!rodada.primeira;
}

/* nome de grupo: igual depois de juntar acentos e espaços, nunca "parecido" */
export function mesmoNome(a, b) {
  const n = (s) => String(s || '').normalize('NFC').replace(/\s+/g, ' ').trim();
  return n(a) !== '' && n(a) === n(b);
}

/* OS GRUPOS FICAM PRESOS AO ENDEREÇO DO PRIMEIRO ENCONTRO. Se outro grupo
   ganhar o nome de um da tabela (alguém renomeou), o robô não posta nele:
   avisa e pula até alguém conferir (--grupos --refixar). Devolve o mapa
   conferido, os fixos (com os que apareceram agora) e os nomes trocados. */
export function conferirFixos(mapa, fixos = {}) {
  const novos = { ...fixos };
  const conferido = {};
  const trocados = [];
  for (const [nome, g] of Object.entries(mapa || {})) {
    if (!g?.jid) { conferido[nome] = g; continue; }
    if (fixos[nome] && fixos[nome] !== g.jid) {
      conferido[nome] = { erro: 'o grupo com esse nome não é mais o mesmo (renomeado ou recriado); confira e rode --grupos --refixar' };
      trocados.push(nome);
      continue;
    }
    if (!fixos[nome]) novos[nome] = g.jid;
    conferido[nome] = g;
  }
  return { mapa: conferido, fixos: novos, trocados };
}

/* O QUE POSTAR DE UM DIA. `primeiraPermitida`: se a escala deste dia pode
   sair pela primeira vez nesta rodada. Devolve as ações e os avisos (cada
   aviso com uma chave, para o Arthur não receber o mesmo a cada rodada). */
export function planoDoDia({ resposta, estadoDoDia = {}, grupos, primeiraPermitida, comecou, maxVersoes = 4 }) {
  const acoes = [];
  const avisos = [];
  if (!resposta?.ok || !resposta.culto?.preenchidos || comecou) return { acoes, avisos };
  for (const l of resposta.linhas || []) {
    const grupo = grupos[l.nome];
    const e = estadoDoDia[l.gid];
    if (l.vazio || !l.texto) {
      if (e?.situacao === 'postado') {
        avisos.push({ chave: `vazio:${l.gid}`, texto: `${grupo || l.nome}: a escala deste grupo ficou vazia depois do envio. O robô não manda nada; confira.` });
      }
      continue;
    }
    if (!grupo) { avisos.push({ chave: `semgrupo:${l.nome}`, texto: `linha sem grupo na tabela: "${l.nome}" (pulada)` }); continue; }
    if (e?.situacao === 'incerto') {
      avisos.push({ chave: `incerto:${l.gid}`, texto: `${grupo}: o último envio ficou incerto; parado até alguém conferir` });
      continue;
    }
    if (!e) {
      if (primeiraPermitida) acoes.push({ tipo: 'primeira', gid: l.gid, grupo, texto: l.texto, ass: l.ass });
      continue;
    }
    if (e.ass === l.ass) continue;
    if ((e.versao || 1) >= maxVersoes) {
      avisos.push({ chave: `versoes:${l.gid}`, texto: `${grupo}: mudou de novo depois de ${e.versao} versões. O robô não manda mais esta escala; mande pelo sistema se precisar.` });
      continue;
    }
    acoes.push({ tipo: 'atualizacao', gid: l.gid, grupo, texto: l.texto, ass: l.ass });
  }
  return { acoes, avisos };
}

/* cobrar agora? */
export function deveCobrar({ resposta, estadoDoDia = {}, cobranca, agoraMs, cfg, comecou }) {
  if (!resposta?.ok || comecou) return false;
  const c = resposta.cobranca;
  if (!c?.texto || !c.pendentes) return false;
  const geral = estadoDoDia.geral;
  if (geral?.situacao !== 'postado') return false;
  if (agoraMs - Date.parse(geral.em) < cfg.cobrancaDepoisDaEscalaH * 3600000) return false;
  if (cobranca?.situacao === 'incerto') return false;
  if (cobranca?.em && agoraMs - Date.parse(cobranca.em) < cfg.cobrancaIntervaloMinimoH * 3600000) return false;
  return true;
}

/* as formas de um celular brasileiro no WhatsApp: com e sem o 9 da frente
   (contas antigas ficaram sem ele) */
export function variantesBR(tel) {
  const d = String(tel || '').replace(/\D/g, '');
  if (!d) return [];
  if (/^55\d{2}9\d{8}$/.test(d)) return [d, d.slice(0, 4) + d.slice(5)];
  if (/^55\d{2}[6-9]\d{7}$/.test(d)) return [d, d.slice(0, 4) + '9' + d.slice(4)];
  return [d];
}

const usuario = (jid) => String(jid || '').split('@')[0].split(':')[0];

/* QUEM DA COBRANÇA ESTÁ NO GRUPO, E COMO O GRUPO CHAMA A PESSOA. O endereço
   é o que o grupo usa (o número, ou o código "@lid" dos grupos novos): é o
   que faz a menção virar o nome na tela de quem lê. Quem não está no grupo
   não é marcado (a menção não avisaria ninguém) e volta a aparecer pelo nome. */
export function mencoesNoGrupo(participantes, telefones) {
  const porNumero = new Map();
  for (const p of participantes || []) {
    const id = String(p?.id || '');
    if (!id) continue;
    const pn = /@s\.whatsapp\.net$/.test(id) ? id : String(p.phoneNumber || '');
    const num = usuario(pn);
    if (num && !porNumero.has(num)) porNumero.set(num, id);
  }
  return (telefones || []).map((telefone) => {
    for (const v of variantesBR(telefone)) if (porNumero.has(v)) return { telefone, jid: porNumero.get(v) };
    return { telefone, jid: null };
  });
}

/* troca o @telefone do sistema pelo @ que o grupo reconhece; quem não está no
   grupo volta a aparecer pelo nome, sem menção */
export function aplicarMencoes(texto, mencoes, resolvidos) {
  const porTelefone = new Map((mencoes || []).map((m) => [String(m.telefone), m]));
  const jids = [];
  /* uma passada só, pegando o número inteiro depois do @: um telefone que
     começa igual a outro (com e sem o 9) nunca troca o pedaço errado, e o
     que já foi trocado não é trocado de novo */
  const t = String(texto || '').replace(/@(\d{8,20})/g, (tudo, num) => {
    const m = porTelefone.get(num);
    if (!m) return tudo;
    const r = (resolvidos || []).find((x) => x.telefone === m.telefone);
    if (!r?.jid) return m.nome || '';
    if (!jids.includes(r.jid)) jids.push(r.jid);
    return '@' + usuario(r.jid);
  });
  return { texto: t, mentions: jids };
}

/* várias cobranças na mesma rodada (sábado ao meio-dia cobra o Follow e o
   domingo) viram UMA mensagem no grupo geral */
export function juntarCobrancas(partes) {
  const texto = partes.map((p) => p.texto).join('\n\n');
  const mentions = [...new Set(partes.flatMap((p) => p.mentions))];
  return { texto, mentions };
}

/* o resumo de uma mensagem para o registro: sem nomes, sem telefones */
export function resumoSemDados(texto) {
  const t = String(texto || '');
  return { linhas: t.split('\n').length, caracteres: t.length, mencoes: (t.match(/@\d{8,20}/g) || []).length };
}

/* tira do estado o que ficou para trás há mais de N dias (de todos os
   ministérios), os pedidos do botão com mais de 2 dias e relatos demais */
export function podar(estado, hoje, dias = 30) {
  const limite = somaDias(hoje, -dias);
  const podarDe = (alvo) => {
    for (const k of ['envios', 'cobrancas']) {
      for (const d of Object.keys(alvo?.[k] || {})) if (d < limite) delete alvo[k][d];
    }
  };
  podarDe(estado);
  for (const eq of Object.values(estado.equipes || {})) podarDe(eq);
  const limitePedidos = Date.parse(`${somaDias(hoje, -2)}T00:00:00-03:00`);
  for (const [id, p] of Object.entries(estado.pedidos || {})) if (!(Date.parse(p?.em) >= limitePedidos)) delete estado.pedidos[id];
  if (Array.isArray(estado.relatos) && estado.relatos.length > 20) estado.relatos = estado.relatos.slice(-20);
  return estado;
}

/* O ESTADO GRAVADO, de qualquer versão do robô: o de 26/10 (só a Mídia, no
   topo) continua valendo sem mudar de lugar; o que falta vira vazio */
export function normalizarEstado(e = {}) {
  return {
    inicio: e.inicio || null, envios: e.envios || {}, cobrancas: e.cobrancas || {}, rodadas: e.rodadas || {},
    equipes: e.equipes || {}, pedidos: e.pedidos || {}, relatos: Array.isArray(e.relatos) ? e.relatos : [],
  };
}

/* ===================================================== vários ministérios
   26/10/2026. O Arthur: "Para todos os ministérios". A Mídia continua onde
   sempre esteve no estado (envios e cobranças no topo: o que já foi gravado
   não muda de lugar, e um erro de mudança faria o robô repostar tudo); os
   outros ministérios ficam em estado.equipes[<slug>]. A visão devolve os
   mesmos objetos, então o que a rodada grava nela fica no estado. */
export function visaoDoMinisterio(estado, slug, principal) {
  if (slug === principal) return estado;
  estado.equipes ||= {};
  const eq = (estado.equipes[slug] ||= {});
  eq.envios ||= {};
  eq.cobrancas ||= {};
  return { inicio: estado.inicio, envios: eq.envios, cobrancas: eq.cobrancas };
}

/* a configuração de um ministério, com as regras gerais */
export function configDoMinisterio(cfg, slug) {
  const m = cfg.ministerios?.[slug];
  if (!m) return null;
  return { ...cfg, ...m, equipe: slug };
}

/* os grupos de todos os ministérios (para conferir e prender os endereços) */
export function todosOsGrupos(cfg) {
  const nomes = [];
  for (const m of Object.values(cfg.ministerios || {})) {
    nomes.push(...Object.values(m.grupos || {}));
    if (m.grupoDaCobranca) nomes.push(m.grupoDaCobranca);
  }
  return [...new Set(nomes)];
}

/* o que precisa estar certo na configuração antes de o robô sair */
export function conferirConfig(cfg) {
  const erros = [];
  const ms = Object.entries(cfg.ministerios || {});
  if (!ms.length) erros.push('nenhum ministério na configuração');
  if (!cfg.ministerios?.[cfg.principal]) erros.push(`o ministério principal "${cfg.principal}" não está na configuração`);
  const dono = new Map();
  for (const [slug, m] of ms) {
    if (!/^[a-z0-9-]{2,40}$/.test(slug)) erros.push(`ministério com nome inválido: "${slug}"`);
    const grupos = Object.entries(m.grupos || {});
    if (!grupos.length) erros.push(`${slug}: sem grupos`);
    for (const [linha, g] of grupos) {
      if (typeof g !== 'string' || !g.trim()) { erros.push(`${slug}: a linha "${linha}" sem grupo`); continue; }
      /* um grupo do WhatsApp pertence a um ministério só: o mesmo grupo em
         dois faria a mesma escala ter dois registros de envio */
      if (dono.has(g) && dono.get(g) !== slug) erros.push(`o grupo "${g}" está em ${dono.get(g)} e em ${slug}`);
      dono.set(g, slug);
    }
    if (m.automatico) {
      if (slug !== cfg.principal) erros.push(`${slug}: só o ministério principal (${cfg.principal}) sai sozinho`);
      if (!m.grupoDaCobranca || !Object.values(m.grupos || {}).includes(m.grupoDaCobranca)) erros.push(`${slug}: o grupo da cobrança precisa ser um dos grupos dele`);
    }
  }
  return erros;
}

/* O QUE ACONTECEU EM CADA GRUPO, para o líder ver na tela depois de um
   pedido. Sai do estado gravado (a fonte da verdade do que saiu), da
   resposta do sistema e dos motivos que a rodada anotou. `desde` = a hora em
   que o pedido começou: o que foi gravado depois disso saiu agora. */
export function relatorioDoDia({ resposta, estadoDoDia = {}, grupos, desde, motivos = {}, maxVersoes = 4 }) {
  const out = [];
  const desdeMs = Date.parse(desde);
  for (const l of resposta?.linhas || []) {
    if (l.vazio || !l.texto) continue;
    const grupo = grupos[l.nome];
    if (!grupo) { out.push({ nome: l.nome, situacao: 'pulado', detalhe: 'sem grupo do WhatsApp no robô' }); continue; }
    const e = estadoDoDia[l.gid];
    if (e?.situacao === 'incerto') { out.push({ nome: grupo, situacao: 'incerto' }); continue; }
    if (motivos[l.gid]) { out.push({ nome: grupo, situacao: 'pulado', detalhe: motivos[l.gid] }); continue; }
    if (!e) { out.push({ nome: grupo, situacao: 'pulado', detalhe: 'o envio parou antes deste grupo' }); continue; }
    if (e.ass !== l.ass) {
      out.push({ nome: grupo, situacao: 'pulado', detalhe: (e.versao || 1) >= maxVersoes ? `mudou depois de ${e.versao} versões; mande à mão se precisar` : 'a versão nova não saiu' });
      continue;
    }
    /* a linha e a assinatura vão junto: a tela marca a linha como mandada
       pelo robô, e "mudou depois do envio" se a escala mudar depois */
    const marca = { linha: l.nome, ass: l.ass };
    const agora = Date.parse(e.em) >= desdeMs;
    if (agora) out.push((e.versao || 1) > 1 ? { nome: grupo, situacao: 'postado', detalhe: 'versão nova', ...marca } : { nome: grupo, situacao: 'postado', ...marca });
    else out.push({ nome: grupo, situacao: 'ja_estava', ...marca });
  }
  return out;
}

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/* O RESULTADO DE UM PEDIDO DO BOTÃO, como a tela mostra (lib/robo-pedidos.ts
   limpa e corta de novo do lado do sistema). `r` é o que executarRodada
   devolveu; `dia` é o relatório daquela data. */
export function resultadoDoPedido(r, dia) {
  const grupos = (dia?.grupos || []).slice(0, 30);
  const avisos = (dia?.avisos || []).slice(0, 10);
  const conta = (s) => grupos.filter((g) => g.situacao === s).length;
  const postados = conta('postado'), jaEstavam = conta('ja_estava'), incertos = conta('incerto'), pulados = conta('pulado') + conta('erro');
  const partes = [];
  if (postados) partes.push(`mandado em ${plural(postados, 'grupo', 'grupos')}`);
  if (jaEstavam) partes.push(`${plural(jaEstavam, 'já tinha', 'já tinham')}`);
  if (incertos) partes.push(`${plural(incertos, 'para conferir', 'para conferir')}`);
  if (pulados) partes.push(`${plural(pulados, 'não mandado', 'não mandados')}`);
  const conta1 = partes.join('; ');
  const frase = (t) => t.charAt(0).toUpperCase() + t.slice(1) + '.';
  const falhou = (resumo) => ({ status: 'falhou', resultado: { resumo, grupos, avisos } });

  if (r?.motivo === 'recusado') return falhou('O WhatsApp recusou uma mensagem e o robô se pausou. Avise o Arthur.');
  if (r?.motivo === 'pausado') return falhou(`O robô foi pausado${conta1 ? ` no meio (${conta1})` : ''}. Nada mais sai até ele ser retomado.`);
  if (dia?.erro === 'leitura') return falhou('Não consegui ler a escala no sistema. Peça de novo em alguns minutos.');
  if (dia?.comecou) return falhou('O culto deste dia já começou: o robô não manda mais esta escala.');
  if (dia?.semEscala) return falhou('Este dia não tem escala com gente no sistema.');
  if (!r?.completa) {
    const porque = { 'sem conexão': 'sem conexão com o WhatsApp', grupos: 'não consegui ler os grupos do WhatsApp', gravar: 'não consegui gravar o registro do robô', antes: 'uma mensagem não saiu', durante: 'uma mensagem ficou incerta', prazo: 'passou do prazo de um pedido' }[r?.motivo] || 'parou no meio';
    return falhou(`Não terminou (${porque})${conta1 ? `: ${conta1}` : ''}. Peça de novo em alguns minutos; o que já saiu não repete.`);
  }
  if (!grupos.length) return falhou('Nenhuma linha deste dia tem grupo do WhatsApp no robô.');
  if (!postados && !incertos && !pulados) return { status: 'enviado', resultado: { resumo: `Nada novo: a escala já estava ${jaEstavam === 1 ? 'no grupo' : `nos ${jaEstavam} grupos`}.`, grupos, avisos } };
  return { status: 'enviado', resultado: { resumo: frase(conta1), grupos, avisos } };
}
