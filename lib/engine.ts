/* ===========================================================================
   MOTOR DE ESCALA — lógica pura, sem React, sem banco, sem DOM.
   Recebe um objeto de estado, devolve decisões. Testado em scripts/engine.test.mjs
   =========================================================================== */

export type Nivel = 'titular' | 'reserva' | 'treino';
export type Status = 'pendente' | 'confirmado' | 'recusado' | 'furou';

/* Tipos de culto que a igreja tem hoje. O Follow é no sábado e não usa
   todas as áreas — por isso a função guarda em quais cultos ela entra. */
export type TipoCulto = 'domingo' | 'follow';
export type Funcao = {
  id?: string; nome: string; simultanea: boolean; ordem: number; ativa: boolean;
  tipos?: TipoCulto[];
  /* quem está escalado aqui preenche o relatório do dia pelo próprio link */
  relata?: boolean;
};
export type Voluntario = {
  id: string; nome: string; tel?: string; ativo: boolean; limiteMes: number;
  token?: string; funcoes: Record<string, Nivel>; indisponivel: string[];
  /* false = a pessoa se cadastrou sozinha pelo link e o líder ainda não
     conferiu o nível que ela declarou. Não bloqueia nada: só destaca. */
  conferido?: boolean;
  /* por área: true quando alguém do time conferiu o nível, false quando é só
     o que a pessoa declarou no cadastro. Área que não está aqui vale como
     conferida (é cadastro antigo, feito pelo líder). */
  confirmadas?: Record<string, boolean>;
  /* domingos em que a pessoa respondeu "posso". Quem não está nem aqui nem
     em indisponivel simplesmente não respondeu ainda. */
  disponivel?: string[];
};

/* Como cada pessoa respondeu a um domingo: 'posso', 'nao' ou 'mudo'.
   'mudo' não impede escalar (decisão do líder), só aparece na cobrança. */
export type Resposta = 'posso' | 'nao' | 'mudo';
export function respostaDe(v: Voluntario, data: string): Resposta {
  if ((v.indisponivel || []).includes(data)) return 'nao';
  if ((v.disponivel || []).includes(data)) return 'posso';
  return 'mudo';
}
/* -------------------------------------------------- compromisso da escala

   Nada aqui bloqueia o voluntário de desmarcar. Tirar o botão só trocaria um
   aviso com antecedência por uma ausência surpresa — mesma cadeira vazia, sem
   as horas de reação. O que cria compromisso é a confirmação valer alguma
   coisa: ficar registrada, aparecer para o grupo e cobrar quem desmarca em
   cima da hora a ajudar a resolver.                                          */

/* Horas entre a resposta e o culto. O culto é à noite; 18h é a referência.
   Sem respondido_em não dá para julgar, e aí não conta como tardio. */
export function horasDeAntecedencia(data: string, respondidoEm?: string | null) {
  if (!respondidoEm) return null;
  const quando = Date.parse(respondidoEm);
  const culto = Date.parse(`${data}T18:00:00-03:00`);
  if (Number.isNaN(quando) || Number.isNaN(culto)) return null;
  return Math.round((culto - quando) / 3600000);
}

/* Desmarque em cima da hora: recusou dentro da janela de horasTardio. */
export function desmarqueTardio(S: Estado, data: string, sl?: Slot | null) {
  if (!sl || sl.status !== 'recusado') return false;
  const h = horasDeAntecedencia(data, sl.respondidoEm);
  return h !== null && h < (S.config.horasTardio ?? 48);
}

/* Ficha de compromisso de uma pessoa, para o líder conversar com dado
   na mão em vez de com sensação. */
export function fichaDe(S: Estado, vid: string) {
  let confirmou = 0, avisouAntes = 0, tardios = 0, furos = 0;
  for (const data of Object.keys(S.escalas)) {
    for (const sl of Object.values(S.escalas[data].slots || {})) {
      if (sl?.vid !== vid) continue;
      if (sl.status === 'confirmado') confirmou++;
      else if (sl.status === 'furou') furos++;
      else if (sl.status === 'recusado') {
        if (desmarqueTardio(S, data, sl)) tardios++; else avisouAntes++;
      }
    }
  }
  return { confirmou, avisouAntes, tardios, furos };
}

/* Vagas que ficaram abertas por desmarque tardio ou furo — é o que o líder
   precisa resolver AGORA, não na próxima vez que abrir o app. */
export function furosAbertos(S: Estado, hoje = hojeISO()) {
  const out: { data: string; funcao: string; vid: string; nome: string; tardio: boolean }[] = [];
  for (const data of Object.keys(S.escalas)) {
    if (data < hoje) continue;
    for (const [funcao, sl] of Object.entries(S.escalas[data].slots || {})) {
      if (!sl?.vid) continue;
      const tardio = desmarqueTardio(S, data, sl);
      if (sl.status === 'furou' || tardio) {
        out.push({ data, funcao, vid: sl.vid, nome: nomeDe(S, sl.vid), tardio });
      }
    }
  }
  return out.sort((a, b) => a.data < b.data ? -1 : 1);
}

/* Quem pode cobrir esta vaga neste domingo, do melhor para o pior:
   quem disse que pode, depois quem tem menos carga. Aprendiz fica de fora,
   porque cobrir buraco de última hora não é hora de treinar. */
export function quemPodeCobrir(S: Estado, data: string, funcao: string, qtd = 3) {
  /* quem desmarcou está "livre" naquele domingo, então sem isto ela voltava
     na lista como substituta de si mesma. */
  const vagou = new Set<string>();
  for (const [fn, sl] of Object.entries(S.escalas[data]?.slots || {})) {
    if (fn === funcao && sl?.vid && (sl.status === 'recusado' || sl.status === 'furou')) vagou.add(sl.vid);
  }
  return candidatos(S, funcao, data, { excluirOcupados: true, ignorarLimite: true })
    .filter(c => !vagou.has(c.id))
    .map(c => {
      const v = S.voluntarios.find(x => x.id === c.id)!;
      return { id: c.id, nome: c.nome, tel: v?.tel || '', nivel: c.nivel,
               resposta: respostaDe(v, data), carga: c.carga };
    })
    .filter(c => c.resposta !== 'nao')
    .sort((a, b) =>
      (a.resposta === 'posso' ? 0 : 1) - (b.resposta === 'posso' ? 0 : 1)
      || a.carga - b.carga
      || (a.nome < b.nome ? -1 : 1))
    .slice(0, qtd);
}

/* Resumo do dia para o líder: quem topou, quem recusou, quem sumiu. */
export function respostasDoDia(S: Estado, data: string) {
  const ativos = S.voluntarios.filter(v => v.ativo);
  const posso = ativos.filter(v => respostaDe(v, data) === 'posso');
  const nao = ativos.filter(v => respostaDe(v, data) === 'nao');
  const mudo = ativos.filter(v => respostaDe(v, data) === 'mudo');
  return { posso, nao, mudo, total: ativos.length };
}
export type Slot = {
  vid: string | null; status: Status; fixo: boolean; primeiraVez?: boolean;
  /* quando a pessoa respondeu (ISO com hora). É o que permite saber se o
     "não posso" veio com antecedência ou em cima da hora. */
  respondidoEm?: string | null;
  /* quando ESTA PESSOA entrou NESTA vaga (migração 38). Nulo nas linhas
     anteriores à migração: nulo é "não sei", nunca "é antigo". */
  escaladoEm?: string | null;
};
export type Dia = {
  cultoId?: string; slots: Record<string, Slot>; plantao: string[]; obs: string;
  /* relatório que o líder escalado escreve no fim do culto */
  relatorio?: string; problemas?: string; relatadoEm?: string | null; relatadoPor?: string | null;
};
export type Config = {
  limitePadrao: number; janelaCarga: number; plantaoQtd: number;
  prazoConfirmacao: string; saudacao: string; rodape: string;
  /* desmarcar com menos de X horas do culto conta como "em cima da hora".
     Não bloqueia nada: entra no histórico e dispara a busca por substituto. */
  horasTardio: number;
};
export type Estado = {
  funcoes: Funcao[]; voluntarios: Voluntario[];
  escalas: Record<string, Dia>; config: Config;
  /* nome do ministério dono deste estado — usado nos textos que o voluntário lê */
  equipe?: string;
};

export const CONFIG_PADRAO: Config = {
  limitePadrao: 2, janelaCarga: 90, plantaoQtd: 1,
  prazoConfirmacao: 'quinta-feira',
  horasTardio: 48,
  saudacao: 'Boa noite galera',
  rodape: 'Confirma no seu link pessoal até {PRAZO}. Quem não puder, avisa agora e já indica o substituto.',
};

export const estadoVazio = (): Estado => ({
  funcoes: [], voluntarios: [], escalas: {}, config: { ...CONFIG_PADRAO },
});

/* ---------------------------------------------------------------- datas --- */
const d2 = (n: number) => String(n).padStart(2, '0');
export const isoDe = (y: number, m: number, d: number) => `${y}-${d2(m)}-${d2(d)}`;
const DIA = 86400000;
const t = (s: string) => Date.parse(s + 'T00:00:00Z');
export const diffDias = (a: string, b: string) => Math.round((t(b) - t(a)) / DIA);
export function addDias(s: string, n: number) {
  const dt = new Date(t(s) + n * DIA);
  return isoDe(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}
export const hojeISO = () => { const d = new Date(); return isoDe(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
export const fmtDia = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
export const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
export const fmtLongo = (s: string) => `${+s.slice(8, 10)} de ${MESES[+s.slice(5, 7) - 1]}`;

export function domingosDoMes(ano: number, mes: number): string[] {
  const out: string[] = [];
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  for (let d = 1; d <= ultimo; d++) {
    if (new Date(Date.UTC(ano, mes - 1, d)).getUTCDay() === 0) out.push(isoDe(ano, mes, d));
  }
  return out;
}

/* Culto do Follow: todo sábado do mês MENOS o primeiro.
   A mesma regra vale no banco (coluna gerada em cultos.tipo), então app e
   banco nunca discordam sobre o que é um sábado de Follow. */
export function sabadosDoFollow(ano: number, mes: number): string[] {
  const out: string[] = [];
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  for (let d = 1; d <= ultimo; d++) {
    if (new Date(Date.UTC(ano, mes - 1, d)).getUTCDay() === 6) out.push(isoDe(ano, mes, d));
  }
  return out.slice(1);          // fora o primeiro sábado
}

/* O tipo sai do dia da semana: sábado é Follow, o resto é domingo. */
export const tipoDoDia = (data: string): TipoCulto =>
  new Date(t(data)).getUTCDay() === 6 ? 'follow' : 'domingo';

/* Como o culto é chamado nas mensagens e na tela. Uma função só, para não
   sobrar "domingo" escrito na mão em canto nenhum. */
export const tituloDoCulto = (data: string) =>
  tipoDoDia(data) === 'follow' ? 'Escala do Follow, sábado' : 'Escala de domingo';
export const nomeDoCulto = (data: string) =>
  tipoDoDia(data) === 'follow' ? 'o Follow de sábado' : 'o domingo';
export const rotuloCurto = (data: string) =>
  tipoDoDia(data) === 'follow' ? `sáb ${fmtDia(data)}` : fmtDia(data);

/* Todos os cultos do mês, domingos e Follows, em ordem de data. */
export function cultosDoMes(ano: number, mes: number): string[] {
  return [...domingosDoMes(ano, mes), ...sabadosDoFollow(ano, mes)].sort();
}

/* As áreas que este dia precisa. O Follow não tem HEAD nem transmissão,
   então escalar essas funções num sábado seria criar vaga que não existe. */
export function funcoesDoDia(S: Estado, data: string) {
  const tipo = tipoDoDia(data);
  return funcoesAtivas(S).filter(f => !f.tipos?.length || f.tipos.includes(tipo));
}

/* Cultos de hoje até daqui a n dias. A cobrança de quinta precisa pegar o
   Follow de sábado E o domingo: mirando só no domingo, o sábado ficava sem
   cobrança nenhuma e o líder só descobria o furo na hora. */
export function cultosAte(ref: string, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i <= n; i++) {
    const d = addDias(ref, i);
    const dow = new Date(t(d)).getUTCDay();
    if (dow === 0 || (dow === 6 && +d.slice(8, 10) > 7)) out.push(d);
  }
  return out;
}

export function proximoDomingo(ref = hojeISO()): string {
  let d = ref;
  for (let i = 0; i < 8; i++) {
    if (new Date(t(d)).getUTCDay() === 0) return d;
    d = addDias(d, 1);
  }
  return ref;
}

/* ------------------------------------------------------------- consultas --- */
export const vol = (S: Estado, id: string | null) => S.voluntarios.find(v => v.id === id) || null;
export const nomeDe = (S: Estado, id: string | null) => vol(S, id)?.nome ?? '';
export const metaFuncao = (S: Estado, nome: string) =>
  S.funcoes.find(f => f.nome === nome) || { nome, simultanea: true, ordem: 99, ativa: true };
export const funcoesAtivas = (S: Estado) =>
  S.funcoes.filter(f => f.ativa !== false).sort((a, b) => a.ordem - b.ordem);

export function escalacoesDe(S: Estado, vid: string) {
  const out: { data: string; funcao: string; status: Status }[] = [];
  for (const [data, dia] of Object.entries(S.escalas)) {
    for (const [fn, slot] of Object.entries(dia.slots || {})) {
      if (slot?.vid === vid) out.push({ data, funcao: fn, status: slot.status || 'pendente' });
    }
  }
  return out.sort((a, b) => (a.data < b.data ? -1 : 1));
}

/* carga e teto contam DOMINGOS distintos: FOTO+EDIÇÃO no mesmo dia vale 1 */
export const cargaJanela = (S: Estado, vid: string, ref: string, dias: number) => {
  const ini = addDias(ref, -dias);
  return new Set(escalacoesDe(S, vid).filter(e => e.data >= ini && e.data <= ref).map(e => e.data)).size;
};
export const escalasNoMes = (S: Estado, vid: string, ano: number, mes: number) =>
  new Set(escalacoesDe(S, vid).filter(e => e.data.startsWith(`${ano}-${d2(mes)}`)).map(e => e.data)).size;
export const furosJanela = (S: Estado, vid: string, ref: string, dias: number) => {
  const ini = addDias(ref, -dias);
  return escalacoesDe(S, vid).filter(e => e.data >= ini && e.data <= ref && e.status === 'furou').length;
};
export function diasDesdeUltima(S: Estado, vid: string, ref: string, funcao?: string) {
  const l = escalacoesDe(S, vid).filter(e => e.data < ref && (!funcao || e.funcao === funcao));
  return l.length ? diffDias(l[l.length - 1].data, ref) : 9999;
}

export function ocupadoNoDia(S: Estado, data: string, vid: string, funcaoAlvo: string | null) {
  const dia = S.escalas[data];
  if (!dia) return null;
  for (const [fn, slot] of Object.entries(dia.slots || {})) {
    if (fn === funcaoAlvo) continue;
    if (slot?.vid === vid) return fn;
  }
  return null;
}

export function garantirDia(S: Estado, data: string): Dia {
  if (!S.escalas[data]) S.escalas[data] = { slots: {}, plantao: [], obs: '' };
  const d = S.escalas[data];
  d.slots ||= {}; d.plantao ||= []; d.obs ??= '';
  return d;
}

/* ---------------------------------------------------------- elegibilidade --- */

/* NÍVEL DECLARADO x NÍVEL EFETIVO.
   No auto-cadastro a pessoa escolhe o próprio nível, e "titular" quer dizer
   "eu faço isso sozinho, a área fica de pé em mim". Aceitar isso sem conferir
   é deixar a escala inteira apoiada num toque de tela: foi assim que 15 dos 16
   cadastros entraram como titular e só uma pessoa usou "reserva".

   Enquanto ninguém confere, titular vale como RESERVA. A pessoa continua
   entrando na escala normalmente e nada quebra; o que ela não faz é virar o
   primeiro nome da fila nem sustentar a área sozinha. Reserva e treino não
   mudam: só o degrau mais alto precisa de alguém do time chancelando. */
export const confirmada = (v: Voluntario, funcao: string) =>
  v.confirmadas?.[funcao] !== false;

export function nivelEfetivo(v: Voluntario, funcao: string): Nivel | undefined {
  const n = v.funcoes?.[funcao];
  if (!n) return undefined;
  return n === 'titular' && !confirmada(v, funcao) ? 'reserva' : n;
}

export type Candidato = { id: string; nome: string; nivel: Nivel; carga: number; paradoGeral: number; paradoFuncao: number };

export function candidatos(
  S: Estado, funcao: string, data: string,
  o: { excluirOcupados?: boolean; incluirTreino?: boolean; ignorarLimite?: boolean } = {},
): Candidato[] {
  const excluirOcupados = o.excluirOcupados !== false;
  const [ano, mes] = data.split('-').map(Number);

  const lista = S.voluntarios.filter(v => {
    if (!v.ativo) return false;
    const nivel = nivelEfetivo(v, funcao);
    if (!nivel) return false;
    if (nivel === 'treino' && !o.incluirTreino) return false;
    if ((v.indisponivel || []).includes(data)) return false;
    if (!o.ignorarLimite) {
      const limite = v.limiteMes || S.config.limitePadrao;
      const atual = S.escalas[data]?.slots?.[funcao];
      const desconto = atual?.vid === v.id ? 1 : 0;
      if (escalasNoMes(S, v.id, ano, mes) - desconto >= limite) return false;
    }
    if (excluirOcupados && ocupadoNoDia(S, data, v.id, funcao)) return false;
    return true;
  });

  const peso = (n: Nivel) => (n === 'titular' ? 0 : n === 'reserva' ? 1 : 2);
  return lista
    .map(v => ({
      id: v.id, nome: v.nome, nivel: nivelEfetivo(v, funcao)!,
      carga: cargaJanela(S, v.id, data, S.config.janelaCarga),
      paradoGeral: diasDesdeUltima(S, v.id, data),
      paradoFuncao: diasDesdeUltima(S, v.id, data, funcao),
    }))
    .sort((a, b) =>
      peso(a.nivel) - peso(b.nivel) ||
      a.carga - b.carga ||
      b.paradoFuncao - a.paradoFuncao ||
      b.paradoGeral - a.paradoGeral ||
      (a.nome < b.nome ? -1 : 1));
}

export const vagasDe = (S: Estado, data: string) =>
  funcoesDoDia(S, data).filter(f => !S.escalas[data]?.slots?.[f.nome]?.vid).map(f => f.nome);

/* Plantão só recebe quem é CURINGA: cobre 2+ funções sem depender de treino
   (titular ou reserva). Alguém que só sabe uma coisa não serve de plantão —
   se o furo for em outra função, ele não resolve. */
export function ehCuringa(v: Voluntario) {
  return Object.values(v.funcoes || {}).filter(n => n === 'titular' || n === 'reserva').length >= 2;
}
export function sugerirPlantao(S: Estado, data: string, qtd: number) {
  return S.voluntarios
    .filter(v => v.ativo && ehCuringa(v) &&
      !(v.indisponivel || []).includes(data) && !ocupadoNoDia(S, data, v.id, null))
    .map(v => ({ id: v.id, nome: v.nome, carga: cargaJanela(S, v.id, data, S.config.janelaCarga), parado: diasDesdeUltima(S, v.id, data) }))
    .sort((a, b) => a.carga - b.carga || b.parado - a.parado || (a.nome < b.nome ? -1 : 1))
    .slice(0, qtd).map(p => p.id);
}

/* ------------------------------------------------------------- geração ----- */
export function gerarDia(S: Estado, data: string) {
  const dia = garantirDia(S, data);
  /* quem RECUSOU este dia não volta no re-sorteio: vira indisponibilidade do dia */
  for (const slot of Object.values(dia.slots)) {
    if (slot?.vid && slot.status === 'recusado') {
      const v = vol(S, slot.vid);
      if (v && !(v.indisponivel || []).includes(data)) (v.indisponivel ||= []).push(data);
    }
  }
  /* quem JÁ CONFIRMOU vale cadeado: a pessoa combinou o domingo dela e o
     sorteio não desmancha isso pelas costas do líder. Para trocar mesmo assim,
     o líder usa o select da tela (que avisa antes). */
  const intocavel = (nome: string) => {
    const sl = dia.slots[nome];
    return !!sl && (sl.fixo || sl.status === 'confirmado');
  };
  for (const f of funcoesAtivas(S)) {
    if (intocavel(f.nome)) continue;
    delete dia.slots[f.nome];
  }
  /* resto de função desativada — ou de função que este culto não tem (HEAD e
     transmissão num sábado de Follow) — não sobrevive nem bloqueia ninguém */
  const doDia = new Set(funcoesDoDia(S, data).map(f => f.nome));
  for (const nome of Object.keys(dia.slots)) {
    const meta = S.funcoes.find(f => f.nome === nome);
    if ((!meta || meta.ativa === false || !doDia.has(nome)) && !intocavel(nome)) delete dia.slots[nome];
  }
  const ordem = funcoesDoDia(S, data)
    .map((f, i) => ({ f, i, n: candidatos(S, f.nome, data, { excluirOcupados: false }).length }))
    .sort((a, b) => a.n - b.n || a.i - b.i);

  for (const { f } of ordem) {
    if (dia.slots[f.nome]) continue;
    const c = candidatos(S, f.nome, data);
    if (c.length) dia.slots[f.nome] = { vid: c[0].id, status: 'pendente', fixo: false };
  }
  repararDia(S, data);
  dia.plantao = sugerirPlantao(S, data, S.config.plantaoQtd);
  return { vagas: vagasDe(S, data) };
}

/* Slot que o remanejamento não pode desmanchar: travado no cadeado OU já
   confirmado pela pessoa. Mover alguém que confirmou é quebrar um combinado. */
const travado = (sl?: Slot | null) => !!sl && (sl.fixo || sl.status === 'confirmado');

/* Reparo por caminho aumentante: quando sobra vaga, procura uma CADEIA de
   remanejamentos (A sai daqui, B assume o lugar de A) que fecha o buraco sem
   violar nenhuma regra. Slot travado nunca é tocado. */
function aumentar(S: Estado, data: string, F: string, visto: Set<string>, dias: string[]): boolean {
  for (const c of candidatos(S, F, data, { excluirOcupados: false, ignorarLimite: true })) {
    const chave = c.id + '|' + data;
    if (visto.has(chave)) continue;
    visto.add(chave);

    /* candidato já ocupado hoje: só serve se conseguirmos liberar TODOS os
       slots que CONFLITAM com F (simultâneos, quando F é simultânea).
       Slot de função pós-culto não conflita; slot de função inativa é lixo
       e é só removido, sem repor. */
    const ehSim = metaFuncao(S, F).simultanea;
    const ocupadas = Object.entries(S.escalas[data]?.slots || {})
      .filter(([fn, sl]) => fn !== F && sl?.vid === c.id).map(([fn]) => fn);
    const conflitantes = ehSim ? ocupadas.filter(fn => metaFuncao(S, fn).simultanea) : [];
    if (conflitantes.length > 1) continue;
    if (conflitantes.some(fn => travado(S.escalas[data].slots[fn]))) continue;
    if (conflitantes.length === 1) {
      const ocup = conflitantes[0];
      const meta = S.funcoes.find(f => f.nome === ocup);
      const s2 = S.escalas[data].slots[ocup];
      delete S.escalas[data].slots[ocup];
      garantirDia(S, data).slots[F] = { vid: c.id, status: 'pendente', fixo: false };
      if (!meta || meta.ativa === false) return true;      // função morta: não repõe
      if (aumentar(S, data, ocup, visto, dias)) return true;
      delete S.escalas[data].slots[F];
      S.escalas[data].slots[ocup] = s2;
      continue;
    }
    if (ocupadas.length && !ehSim) {
      /* F é pós-culto: acumular é legal, não precisa liberar nada */
    } else if (ocupadas.length) {
      /* ocupado só em pós-culto e F simultânea: também é legal */
    }

    const [ano, mes] = data.split('-').map(Number);
    const limite = vol(S, c.id)?.limiteMes || S.config.limitePadrao;
    if (escalasNoMes(S, c.id, ano, mes) < limite) {
      garantirDia(S, data).slots[F] = { vid: c.id, status: 'pendente', fixo: false };
      return true;
    }

    for (const d2 of dias) {
      if (d2 === data) continue;
      for (const [F2, s] of Object.entries(S.escalas[d2]?.slots || {})) {
        if (s?.vid !== c.id || travado(s)) continue;
        delete S.escalas[d2].slots[F2];
        garantirDia(S, data).slots[F] = { vid: c.id, status: 'pendente', fixo: false };
        if (aumentar(S, d2, F2, visto, dias)) return true;
        delete S.escalas[data].slots[F];
        S.escalas[d2].slots[F2] = s;
      }
    }
  }
  return false;
}

export function repararDia(S: Estado, data: string) {
  let n = 0;
  for (const F of vagasDe(S, data)) if (aumentar(S, data, F, new Set(), [data])) n++;
  return n;
}

export function gerarMes(S: Estado, ano: number, mes: number, aPartirDe?: string) {
  const todos = cultosDoMes(ano, mes);
  /* dias antes do corte são história: contam na carga e no teto, mas nunca
     são regenerados nem usados como origem/destino de remanejamento */
  const dias = aPartirDe ? todos.filter(d => d >= aPartirDe) : todos;
  for (const d of dias) gerarDia(S, d);
  for (const D of dias) for (const F of vagasDe(S, D)) aumentar(S, D, F, new Set(), dias);
  for (const d of dias) S.escalas[d].plantao = sugerirPlantao(S, d, S.config.plantaoQtd);
  return dias.map(d => ({ data: d, vagas: vagasDe(S, d) }));
}

/* ------------------------------------------------------------- problemas --- */
/* `foco` são os postos que o problema aponta. Sem isso o aviso era só uma
   frase: "Fulano está em PROJEÇÃO e ILUMINAÇÃO ao mesmo tempo" e o líder que
   se virasse para achar as duas linhas numa lista de nove. Com o foco, a
   frase vira caminho. */
export type Problema = { grau: 'erro' | 'aviso'; texto: string; foco?: string[] };

export function problemas(S: Estado, data: string): Problema[] {
  const dia = S.escalas[data];
  const out: Problema[] = [];
  if (!dia) return out;

  const porPessoa: Record<string, string[]> = {};
  for (const [fn, slot] of Object.entries(dia.slots || {})) {
    if (slot?.vid) (porPessoa[slot.vid] ||= []).push(fn);
  }
  for (const [vid, fns] of Object.entries(porPessoa)) {
    if (fns.length < 2) continue;
    const sim = fns.filter(f => metaFuncao(S, f).simultanea);
    if (sim.length >= 2) out.push({ grau: 'erro', foco: sim, texto: `${nomeDe(S, vid)} está em ${sim.join(' e ')} ao mesmo tempo.` });
    else out.push({ grau: 'aviso', foco: fns, texto: `${nomeDe(S, vid)} está em duas funções (${fns.join(' + ')}).` });
  }
  for (const [fn, slot] of Object.entries(dia.slots || {})) {
    const v = vol(S, slot?.vid);
    if (v && (v.indisponivel || []).includes(data)) {
      out.push({ grau: 'erro', foco: [fn], texto: `${v.nome} avisou que não pode neste dia, mas está em ${fn}.` });
    }
  }
  const vagas = vagasDe(S, data);
  if (vagas.length) out.push({ grau: 'erro', foco: vagas, texto: `Sem ninguém em ${vagas.join(', ')}.` });
  return out;
}

/* Quem está escalado neste dia e ainda não respondeu. Uma mensagem só, para o
   grupo, com os nomes.

   Por que isso não existia e por que faz falta: 50 das 64 escalações futuras
   estão pendentes. A cobrança que já existia era individual (msgCobranca, um
   WhatsApp por pessoa, no painel) ou era sobre DISPONIBILIDADE do mês, que é
   outra pergunta. Cobrar confirmação de um domingo, no grupo, de uma vez, não
   tinha botão em lugar nenhum, e é o que o líder faz na terça de manhã. */
export function msgConfirmar(S: Estado, data: string) {
  const dia = S.escalas[data];
  const faltam = funcoesDoDia(S, data)
    .map(f => dia?.slots?.[f.nome])
    .filter(sl => sl?.vid && (sl.status || 'pendente') === 'pendente')
    .map(sl => nomeDe(S, sl!.vid!).split(' ')[0]);
  const nomes = [...new Set(faltam)];
  if (!nomes.length) return '';
  const quem = nomes.length === 1 ? nomes[0]
    : nomes.slice(0, -1).join(', ') + ' e ' + nomes[nomes.length - 1];
  const dia_ = tipoDoDia(data) === 'follow' ? 'o Follow de sábado' : 'domingo';
  return `${quem}: vocês estão na escala d${dia_ === 'domingo' ? 'e domingo' : 'o Follow de sábado'} (${fmtDia(data)}) `
    + `e ainda falta confirmar. Entrem no link de vocês e toquem em EU VOU. `
    + `Se não puder, marca "não posso" que eu chamo outra pessoa, sem problema.`;
}

export function resumoDia(S: Estado, data: string) {
  const dia = S.escalas[data];
  const ativos = funcoesDoDia(S, data);
  const preenchidos = ativos.filter(f => dia?.slots?.[f.nome]?.vid);
  const confirmados = preenchidos.filter(f => dia.slots[f.nome].status === 'confirmado');
  const recusados = preenchidos.filter(f => dia.slots[f.nome].status === 'recusado');
  const furos = preenchidos.filter(f => dia.slots[f.nome].status === 'furou');
  const pendentes = preenchidos.filter(f => (dia.slots[f.nome].status || 'pendente') === 'pendente');
  const vagas = vagasDe(S, data);
  const situacao: 'ok' | 'atencao' | 'critico' =
    vagas.length || recusados.length || furos.length ? 'critico' : pendentes.length ? 'atencao' : 'ok';
  return {
    total: ativos.length, preenchidos: preenchidos.length,
    confirmados: confirmados.length, pendentes: pendentes.length,
    recusados: recusados.length, furos: furos.length, vagas, situacao,
  };
}

/* ------------------------------------------------------------- mensagens --- */
export function msgEscala(S: Estado, data: string) {
  const dia = S.escalas[data] || { slots: {}, plantao: [], obs: '' };
  const L: string[] = [S.config.saudacao, `${tituloDoCulto(data)} (${fmtDia(data)})`, ''];
  for (const f of funcoesDoDia(S, data)) {
    const sl = dia.slots?.[f.nome];
    L.push(f.nome);
    /* mostrar quem já confirmou é o empurrão mais barato que existe: o
       compromisso deixa de ser combinado no privado e passa a ser público. */
    if (!sl?.vid) L.push('*** PRECISO DE ALGUÉM ***');
    else if (sl.status === 'confirmado') L.push(`${nomeDe(S, sl.vid)} (confirmou)`);
    else if (sl.status === 'recusado') L.push('*** PRECISO DE ALGUÉM ***');
    else if (sl.status === 'furou') L.push('*** PRECISO DE ALGUÉM ***');
    else L.push(`${nomeDe(S, sl.vid)} (falta confirmar)`);
    L.push('');
  }
  if (dia.plantao?.length) {
    L.push('PLANTÃO (entra se alguém furar)');
    dia.plantao.forEach(p => L.push(nomeDe(S, p)));
    L.push('');
  }
  if (dia.obs) { L.push(dia.obs); L.push(''); }
  L.push((S.config.rodape || '').replace('{PRAZO}', S.config.prazoConfirmacao));
  return L.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function msgConvite(S: Estado, vid: string, base: string) {
  const v = vol(S, vid);
  if (!v) return '';
  return `${v.nome.split(' ')[0]}, esse é o seu link pessoal da escala${S.equipe ? ` de ${S.equipe}` : ''}. `
    + `Salva no favorito: sempre que você for escalado, é aqui que você confirma e é aqui que você avisa quando não pode.\n\n`
    + `${base}/eu/${v.token}`;
}

export function msgCobranca(S: Estado, vid: string, data: string, base: string) {
  const v = vol(S, vid);
  const fns = Object.entries(S.escalas[data]?.slots || {}).filter(([, s]) => s?.vid === vid).map(([f]) => f);
  return `${(v?.nome || '').split(' ')[0]}, você está na escala d${tipoDoDia(data) === 'follow' ? `o Follow de sábado` : 'e domingo'} (${fmtDia(data)}) em ${fns.join(' e ')}. `
    + `Confirma no seu link até ${S.config.prazoConfirmacao}?\n${base}/eu/${v?.token}`;
}

export function msgColeta(S: Estado, ano: number, mes: number, _base: string) {
  const doms = domingosDoMes(ano, mes).map(fmtDia).join(', ');
  const sabs = sabadosDoFollow(ano, mes).map(fmtDia).join(', ');
  return `${S.config.saudacao}\n\nVou montar a escala de ${MESES[mes - 1]}. Domingos: ${doms}.`
    + (sabs ? `\nFollow (sábado): ${sabs}.` : '') + `\n\n`
    + `Entra no seu link pessoal e marca só os dias em que você NÃO pode. `
    + `Quem não marcar nada entra no rodízio normal.\n\nSe você quer aprender uma função nova, me chama que eu encaixo você como dupla de treino.`;
}

/* ------------------------------------------- auditoria do que foi declarado

   O que o sistema consegue afirmar sozinho é pouco, e o pouco tem que ser
   certo: alerta falso ensina o líder a ignorar o painel.

   NÃO serve como sinal: a pessoa ser titular em duas áreas simultâneas. Isso
   é o normal de quem serve — num domingo ela faz uma, no outro faz a outra, e
   o banco já impede as duas no mesmo culto. Acusar isso enche a tela de gente
   inocente.

   Serve como sinal:

   1. PILAR ÚNICO. Se esta declaração estiver errada, a área fica com uma
      pessoa ou com nenhuma. Não julga a pessoa, mede o risco: é o que decide
      o que o líder confere primeiro.

   2. SEM GRADIENTE. Marcou 4 ou mais áreas, todas exatamente no mesmo nível,
      nada conferido. Ninguém tem competência idêntica em 4 coisas diferentes;
      é a assinatura de quem tocou uma vez em cada chip e saiu.

   Nada bloqueia ninguém. O resultado é uma fila de conferência ordenada por
   quanto a escala depende daquilo estar certo.                              */
export type Suspeita = {
  vid: string; nome: string; motivo: 'pilar_unico' | 'sem_gradiente';
  areas: string[]; nivel?: Nivel; texto: string;
};

/* Quantas pessoas seguem aptas nesta área se tirarmos esta pessoa. */
function aptosSem(S: Estado, funcao: string, vid: string) {
  return S.voluntarios.filter(v =>
    v.ativo && v.id !== vid && ['titular', 'reserva'].includes(nivelEfetivo(v, funcao) as string)).length;
}

export function declaracoesSuspeitas(S: Estado): Suspeita[] {
  const out: Suspeita[] = [];
  const ativas = funcoesAtivas(S).map(f => f.nome);
  for (const v of S.voluntarios) {
    if (!v.ativo) continue;
    const areas = Object.keys(v.funcoes || {}).filter(f => ativas.includes(f));
    const naoConferidas = areas.filter(f => !confirmada(v, f));
    if (!naoConferidas.length) continue;
    const p = v.nome.split(' ')[0];

    const pilar = naoConferidas.filter(f =>
      ['titular', 'reserva'].includes(v.funcoes[f]) && aptosSem(S, f, v.id) <= 1);
    if (pilar.length) {
      const detalhe = pilar.map(f => {
        const n = aptosSem(S, f, v.id);
        return `${f} (fica com ${n === 0 ? 'ninguém' : '1 pessoa'})`;
      }).join(', ');
      out.push({
        vid: v.id, nome: v.nome, motivo: 'pilar_unico', areas: pilar,
        texto: `A escala inteira depende desta declaração de ${p}: ${detalhe}. `
          + `Ninguém conferiu ainda, então confira estas primeiro.`,
      });
    }

    const niveis = new Set(naoConferidas.map(f => v.funcoes[f]));
    if (naoConferidas.length >= 4 && niveis.size === 1) {
      const nivel = [...niveis][0];
      out.push({
        vid: v.id, nome: v.nome, motivo: 'sem_gradiente', areas: naoConferidas, nivel,
        texto: `${p} marcou ${naoConferidas.length} áreas e todas exatamente como ${nivel}, `
          + `sem diferença nenhuma entre elas. Vale perguntar em quais dessas a pessoa realmente `
          + `segura sozinha e em quais ela prefere estar acompanhada.`,
      });
    }
  }
  /* risco primeiro: o que quebra a escala antes do que só parece estranho */
  return out.sort((a, b) =>
    (a.motivo === 'pilar_unico' ? 0 : 1) - (b.motivo === 'pilar_unico' ? 0 : 1)
    || b.areas.length - a.areas.length
    || (a.nome < b.nome ? -1 : 1));
}

/* A fila de conferência do líder, uma área por vez: quem declarou o quê e
   ainda não passou por ninguém. Área vazia some da fila. */
export function filaDeConferencia(S: Estado) {
  return funcoesAtivas(S).map(f => ({
    funcao: f.nome, funcaoId: f.id,
    pendentes: S.voluntarios
      .filter(v => v.ativo && v.funcoes?.[f.nome] && !confirmada(v, f.nome))
      .map(v => ({ id: v.id, nome: v.nome, declarou: v.funcoes[f.nome], efetivo: nivelEfetivo(v, f.nome)! }))
      .sort((a, b) => (a.nome < b.nome ? -1 : 1)),
  })).filter(x => x.pendentes.length);
}

/* ----------------------------------------------------------- diagnóstico --- */
export function saudeDoTime(S: Estado) {
  const ref = hojeISO();
  const funcoes = funcoesAtivas(S).map(f => {
    const ativos = S.voluntarios.filter(v => v.ativo);
    const aptos = ativos.filter(v => ['titular', 'reserva'].includes(nivelEfetivo(v, f.nome) as string));
    const treino = ativos.filter(v => nivelEfetivo(v, f.nome) === 'treino');
    /* quem a gente SABE que segura a área sozinho. Contar declaração como
       titular fazia o painel dizer "ok" para área que na real tem uma pessoa
       só, e o líder só descobria no domingo. */
    const titulares = ativos.filter(v => v.funcoes?.[f.nome] === 'titular' && confirmada(v, f.nome));
    const declarados = ativos.filter(v => v.funcoes?.[f.nome] === 'titular' && !confirmada(v, f.nome));
    const grau = aptos.length <= 1 ? 'critico'
      : titulares.length === 0 ? 'critico'
      : aptos.length === 2 || titulares.length === 1 ? 'atencao' : 'ok';
    const texto = aptos.length === 0 ? 'ninguém sabe fazer'
      : aptos.length === 1 ? 'uma pessoa só'
      : titulares.length === 0 ? (declarados.length ? 'ninguém conferido: só o que se declararam' : 'sem titular')
      : titulares.length === 1 ? 'um titular só'
      : aptos.length === 2 ? 'sem folga' : 'ok';
    return {
      nome: f.nome, aptos: aptos.length, treino: treino.length,
      titulares: titulares.length, declarados: declarados.length, grau, texto,
    };
  });
  const pessoas = S.voluntarios.map(v => ({
    id: v.id, nome: v.nome, ativo: v.ativo,
    carga: cargaJanela(S, v.id, ref, S.config.janelaCarga),
    furos: furosJanela(S, v.id, ref, S.config.janelaCarga),
    parado: diasDesdeUltima(S, v.id, ref),
    funcoes: Object.keys(v.funcoes || {}),
  })).sort((a, b) => b.carga - a.carga || (a.nome < b.nome ? -1 : 1));
  return { funcoes, pessoas };
}
