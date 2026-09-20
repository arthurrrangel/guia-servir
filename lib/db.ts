'use client';
import { sb } from './supabase';
import { addDias, Estado, hojeISO, Nivel, Status } from './engine';
import { montarEstado, paraSalvarDia, linhasDaEquipe, DIAS_DE_HISTORICO } from './ponte';
import { planoDoDia, planoDoPlantao, type SlotDesejado, type LinhaAtual } from './escala-diff';

/* Ponte entre o banco e o objeto de estado que o motor entende.
   O motor nunca sabe que existe Supabase. */

export async function carregarEstado(equipeId: string, nomeEquipe = ''): Promise<Estado> {
  const s = sb();
  if (!s) throw new Error('sem conexão');
  /* A consulta mora em ponte.ts, junto do cron. Ver o cabeçalho de
     `linhasDaEquipe`: esta busca já existiu em duplicata e as duas cópias
     divergiram em silêncio. */
  const desde = addDias(hojeISO(), DIAS_DE_HISTORICO);
  return montarEstado(await linhasDaEquipe(s, equipeId, desde, nomeEquipe));
}

/* -------------------------------------------------------------- escrita --- */
/* 17/09/2026: era a RPC `salvar_dia`, uma transação só. Ela regrava o dia
   inteiro por upsert, e o gatilho BEFORE INSERT `fn_indisponivel` recusava
   quem já estava na vaga e avisou "não posso" depois de escalado (o caso do
   João Victor em 20/09: nada no dia salvava). Agora o dia é salvo em partes,
   só o que mudou, direto nas tabelas (o RLS já valia na RPC, que era
   `security invoker`). O plano é puro e testado em lib/escala-diff.ts. Se uma
   parte falhar, a tela recarrega do banco e mostra o motivo; nada fica
   "meio salvo" sem a pessoa ver. */
export async function salvarDia(S: Estado, data: string, equipeId: string) {
  const s = sb()!;
  const p = paraSalvarDia(S, data, equipeId);
  if (!p) return;

  /* 1. o culto do dia.

     A DATA DEIXOU DE SER ÚNICA NA 54, E ESTA FUNÇÃO NÃO SOUBE — 20/09/2026.
     Até lá `cultos(data)` tinha unique completo e `.maybeSingle()` era
     seguro. A 54 trocou por um unique PARCIAL (`where evento is null`) para
     caber evento esporádico, e o unique dos eventos passou a ser
     `(data, equipe_id)`. Ou seja: o mesmo dia pode ter uma linha regular e
     uma linha de evento de cada equipe.

     Duas equipes marcando evento na mesma quinta faziam este `.maybeSingle()`
     receber duas linhas, devolver PGRST116 e estourar `salvarDia` — nenhuma
     das duas conseguia salvar a escala daquele dia, com um erro cru de
     PostgREST na tela. `lib/ponte.ts` já aplica o filtro de equipe na
     leitura (`.or('equipe_id.is.null,equipe_id.eq.<id>')`); aqui não
     aplicava. A própria 54 escreveu, em letras grandes, que "regra de acesso
     que só existe no navegador é regra que a próxima tela esquece". Este
     arquivo era a próxima tela. */
  const doDia = () => s.from('cultos').select('id').eq('data', p.p_data)
    .or(`equipe_id.is.null,equipe_id.eq.${equipeId}`);
  let cultoId: string | undefined;
  {
    const { data: c, error } = await doDia().maybeSingle();
    if (error) throw error;
    cultoId = c?.id;
    if (!cultoId) {
      const { data: novo, error: e2 } = await s.from('cultos').insert({ data: p.p_data }).select('id').single();
      if (e2) {
        /* outro líder criou o mesmo dia neste instante: busca de novo */
        const { data: c2, error: e3 } = await doDia().maybeSingle();
        if (e3 || !c2) throw e2;
        cultoId = c2.id;
      } else cultoId = novo.id;
    }
  }

  /* 2. o recado do dia deste ministério */
  {
    const { error } = await s.from('culto_obs')
      .upsert({ culto_id: cultoId, equipe_id: p.p_equipe, obs: p.p_obs }, { onConflict: 'culto_id,equipe_id' });
    if (error) throw error;
  }

  /* 3. as vagas: só o que mudou */
  const funcaoIds = S.funcoes.map(f => f.id!).filter(Boolean);
  {
    const { data: atuais, error } = await s.from('escalacoes')
      .select('id,funcao_id,voluntario_id,fixo,primeira_vez')
      .eq('culto_id', cultoId).in('funcao_id', funcaoIds);
    if (error) throw error;
    const plano = planoDoDia(p.p_slots as SlotDesejado[], (atuais || []) as LinhaAtual[]);

    const apagar = async () => {
      if (!plano.apagar.length) return;
      const { error: e } = await s.from('escalacoes').delete().in('id', plano.apagar);
      if (e) throw e;
    };
    const inserir = async () => {
      if (!plano.inserir.length) return;
      const { error: e } = await s.from('escalacoes').insert(plano.inserir.map(x => ({
        culto_id: cultoId, funcao_id: x.funcao_id, voluntario_id: x.voluntario_id,
        status: x.status, fixo: x.fixo, primeira_vez: x.primeira_vez,
      })));
      if (e) throw e;
    };

    /* INSERIR PRIMEIRO QUANDO DÁ.

       São três requisições, logo três transações: o que o DELETE apagou fica
       apagado mesmo se o INSERT seguinte for recusado por um gatilho, e a
       vaga esvazia por causa da tentativa. Inserindo primeiro, uma recusa
       acontece ANTES de qualquer perda — o estado anterior fica de pé.

       A exceção é a permuta (as mesmas pessoas saindo e entrando no mesmo
       dia): ali o gatilho de função simultânea recusa a entrada antes de a
       saída acontecer, e é preciso liberar antes. `planoDoDia` sabe dizer
       qual dos dois casos é este. */
    if (plano.apagarPrimeiro) { await apagar(); }
    else { await inserir(); }

    /* em paralelo: são updates por `id`, sem ordem entre si. Em série, um dia
       remontado com 9 postos custava 9 viagens de rede encadeadas — cerca de
       2 segundos num 4G ruim, só nesta linha. */
    const erros = (await Promise.all(plano.atualizar.map(async a => {
      const { id, ...patch } = a;
      const { error: e } = await s.from('escalacoes').update(patch).eq('id', id);
      return e;
    }))).filter(Boolean);
    if (erros.length) throw erros[0];

    if (plano.apagarPrimeiro) { await inserir(); }
    else { await apagar(); }
  }

  /* 4. o plantão */
  {
    const meus = S.voluntarios.map(v => v.id);
    const { data: atuais, error } = meus.length
      ? await s.from('plantoes').select('voluntario_id').eq('culto_id', cultoId).in('voluntario_id', meus)
      : { data: [], error: null };
    if (error) throw error;
    const plano = planoDoPlantao(p.p_plantao, (atuais || []).map((r: any) => r.voluntario_id as string));
    if (plano.apagar.length) {
      const { error: e } = await s.from('plantoes').delete().eq('culto_id', cultoId).in('voluntario_id', plano.apagar);
      if (e) throw e;
    }
    if (plano.inserir.length) {
      const { error: e } = await s.from('plantoes').insert(plano.inserir.map(v => ({ culto_id: cultoId, voluntario_id: v })));
      if (e) throw e;
    }
  }

  S.escalas[data].cultoId = cultoId;
}

/* "MONTAR A ESCALA DESTE MÊS" CUSTAVA 28 SEGUNDOS NUM 4G RUIM — 20/09/2026.

   Em série, `salvarDia` por dia. Cada `salvarDia` já é uma cadeia de 6 a 9
   viagens encadeadas, então 14 cultos davam 128 viagens uma atrás da outra.
   Medido pela auditoria de performance, com RTT de 220 ms:

       4 cultos ->  38 viagens ->  8,4 s
       9 cultos ->  83 viagens -> 18,3 s
      14 cultos -> 128 viagens -> 28,2 s

   E não era atômico: cair na viagem 60 deixava meio mês gravado, que é
   exatamente o estado "mês parcial" que `decisaoDoRobo` depois se recusa a
   completar.

   Os dias são independentes entre si — cultos diferentes, linhas diferentes.
   Em paralelo, as 128 viagens viram 9 ondas: 28,2 s caem para ~2,4 s.

   `Promise.allSettled` e não `Promise.all`: com `all`, o primeiro erro
   abandona os outros dias no meio do caminho e a pessoa não fica sabendo
   quais gravaram. Aqui todos terminam, e o erro que sobe é o primeiro, com a
   data dentro dele — a tela recarrega do banco e mostra o que de fato ficou. */
export async function salvarDias(S: Estado, datas: string[], equipeId: string) {
  const r = await Promise.allSettled(datas.map(d => salvarDia(S, d, equipeId)));
  const ruim = r.map((x, i) => ({ x, d: datas[i] })).filter(o => o.x.status === 'rejected');
  if (ruim.length) {
    const e0: any = (ruim[0].x as PromiseRejectedResult).reason;
    const quais = ruim.map(o => o.d).join(', ');
    throw Object.assign(e0 instanceof Error ? e0 : new Error(String(e0?.message || e0)), {
      message: `${e0?.message || e0} (nao gravou: ${quais})`,
    });
  }
}

/* MARCAR "FUROU" PRECISA DIZER DE QUEM.

   Esta função gravava por (culto, função) e pronto. Nenhum gatilho barra um
   UPDATE que não muda a pessoa nem o culto, então ela SEMPRE dava certo — e
   dava certo inclusive quando a vaga já era de outra pessoa.

   O caso não é hipotético, é a rotina desta igreja: três dos quatro
   organizadores são admin geral e mexem nas mesmas áreas. O líder A abre a
   escala e vê a Maria em FOTO. O líder B troca para o João. O líder A toca em
   "furou" pensando na Maria — e o furo entra na ficha do João.

   Isso corrompe exatamente a coisa que o produto existe para tornar
   confiável: a ficha de compromisso, que `fichaDe()` monta "para o líder
   conversar com dado na mão em vez de com sensação".

   Agora a gravação diz de quem é a vaga que a tela acredita estar vendo. Se
   ninguém casar, a escala mudou por baixo e a pessoa é avisada em vez de
   marcar o nome errado. O `select('id')` está aí para isso: sem ele o
   PostgREST não devolve as linhas afetadas e não dá para saber se pegou. */
export async function mudarStatus(cultoId: string, funcaoId: string, voluntarioId: string, status: Status) {
  const s = sb()!;
  const { data, error } = await s.from('escalacoes')
    .update({ status, respondido_em: new Date().toISOString() })
    .eq('culto_id', cultoId).eq('funcao_id', funcaoId).eq('voluntario_id', voluntarioId)
    .select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('ESCALA_MUDOU_NO_POSTO');
}

/* ---------------------------------------------------------- voluntários --- */
/* Antes isto eram DOIS inserts a partir do navegador: a pessoa e, depois, as
   habilidades dela. O segundo não olhava o erro, então quando ele falhava a
   pessoa nascia sem função nenhuma e a tela dizia que ela tinha entrado no
   time. Também não havia validação: o caminho público exige nome com
   sobrenome e telefone de 10 a 13 dígitos, o caminho do líder aceitava
   qualquer coisa.

   Agora é a RPC `criar_voluntario` (migração 32), que grava identidade,
   vínculo e habilidades numa transação só e valida no banco. Mesmo idioma do
   `salvar_dia`. O mapa nome→id deixou de ser necessário: a função casa a
   função pelo nome dentro do SQL. */
export async function criarVoluntario(
  equipeId: string, nome: string, tel: string, limite: number, funcoes: Record<string, Nivel>,
) {
  const { data, error } = await sb()!.rpc('criar_voluntario', {
    p_equipe: equipeId, p_nome: nome, p_tel: tel, p_limite: limite, p_funcoes: funcoes,
  });
  if (error) throw error;
  const r = data as { ok: boolean; erro?: string; id?: string };
  if (!r?.ok) throw new Error(RECADO[r?.erro || ''] || r?.erro || 'não deu para cadastrar');
  return r.id as string;
}

/* o banco fala em código; a tela fala com gente. */
const RECADO: Record<string, string> = {
  NOME_INCOMPLETO: 'Escreva nome e sobrenome',
  TELEFONE_INVALIDO: 'Telefone precisa ter DDD e número',
  JA_CADASTRADO: 'Esse telefone já está no time',
};

export async function atualizarVoluntario(id: string, campos: Record<string, any>) {
  const { error } = await sb()!.from('voluntarios').update(campos).eq('id', id);
  if (error) throw error;
}

export async function removerVoluntario(id: string) {
  const { error } = await sb()!.from('voluntarios').delete().eq('id', id);
  if (error) throw error;
}

/* Quando o LÍDER mexe no nível, ele está conferindo — por isso vai pela RPC,
   que grava confirmado = true. Nível que a pessoa declarou sozinha continua
   valendo como reserva até passar por aqui. */
export async function definirHabilidade(vid: string, funcaoId: string, nivel: Nivel | null) {
  const { error } = await sb()!.rpc('conferir_habilidade', {
    p_voluntario: vid, p_funcao: funcaoId, p_nivel: nivel,
  });
  if (error) throw error;
}

/* =============================================================================
   EVENTO ESPORÁDICO (migração 54)

   O que não está na programação fixa: o GUIA Empreendedor numa quinta, um
   ensaio geral num sábado. Depois de criado, o dia entra no mesmo fluxo de
   sempre — a tela mostra, "Montar" sorteia, as regras de disponibilidade e
   de teto valem igual.

   Vai por RPC e não por `insert` direto porque a regra ("o dia não pode ser
   no passado", "o ministério tem que ser seu", "não pode haver culto regular
   nessa data") mora no banco, onde vale para qualquer tela que venha depois.
   ============================================================================= */
export async function criarEvento(
  equipeId: string, data: string, nome: string, inicio?: string | null,
) {
  const { data: r, error } = await sb()!.rpc('criar_evento', {
    p_equipe: equipeId, p_data: data, p_nome: nome, p_inicio: inicio || null,
  });
  if (error) throw error;
  /* a RPC devolve `{ok:false, erro:'...'}` em vez de estourar, para o erro
     chegar como recado e não como stack. `aviseHumano` sabe traduzir. */
  if (!r?.ok) throw new Error(r?.erro || 'EVENTO_NAO_CRIADO');
  return r as { ok: true; id: string; data: string; nome: string };
}

export async function apagarEvento(cultoId: string) {
  const { data: r, error } = await sb()!.rpc('apagar_evento', { p_id: cultoId });
  if (error) throw error;
  if (!r?.ok) throw new Error(r?.erro || 'EVENTO_NAO_APAGADO');
}

export async function salvarConfig(equipeId: string, dados: any) {
  const { error } = await sb()!.from('config').upsert({ equipe_id: equipeId, dados }, { onConflict: 'equipe_id' });
  if (error) throw error;
}

/* Era um update ou insert por função, em série, e nenhum deles olhava o erro:
   cair no meio deixava a lista de postos da área pela metade e a tela dizia
   "Salvo". Agora é a RPC `salvar_funcoes` (migração 32): uma transação, e ela
   ainda recusa explicitamente função de outro ministério em vez de deixar a
   RLS fazer a linha sumir em silêncio. */
export async function salvarFuncoes(equipeId: string, funcoes: { id?: string; nome: string; simultanea: boolean; ordem: number; ativa: boolean; exigeSexo?: 'M' | 'F' }[]) {
  /* a RPC fala a língua do banco (exige_sexo), o motor fala a da tela
     (exigeSexo). A tradução mora aqui, que é a fronteira. `null` é
     explícito: sem ele, tirar a exigência de um posto não apagaria nada. */
  const p_funcoes = funcoes.map(f => ({
    id: f.id, nome: f.nome, simultanea: f.simultanea, ordem: f.ordem, ativa: f.ativa,
    exige_sexo: f.exigeSexo || null,
  }));
  const { error } = await sb()!.rpc('salvar_funcoes', { p_equipe: equipeId, p_funcoes });
  if (error) throw error;
}

export async function removerFuncao(id: string) {
  const { error } = await sb()!.from('funcoes').delete().eq('id', id);
  if (error) throw error;
}

/* -------------------------------------------------------------- líderes --- */
export type LinhaLider = { email: string; equipe_id: string | null };

/* equipe_id null = organiza todos os ministérios. Preenchido = só aquele.
   A mesma pessoa pode aparecer duas vezes, uma por ministério. */
export async function listarLideres(): Promise<LinhaLider[]> {
  const { data, error } = await sb()!.from('lideres').select('email,equipe_id').order('email');
  if (error) throw error;
  return (data || []) as LinhaLider[];
}
export async function addLider(email: string, equipeId: string | null) {
  const { error } = await sb()!.from('lideres')
    .insert({ email: email.trim().toLowerCase(), equipe_id: equipeId });
  if (error) throw error;
}
export async function removerLider(email: string, equipeId: string | null) {
  let q = sb()!.from('lideres').delete().eq('email', email);
  q = equipeId ? q.eq('equipe_id', equipeId) : q.is('equipe_id', null);
  const { error } = await q;
  if (error) throw error;
}
/* 18/09/2026: quem organiza nunca teve senha, entrava só pelo link do
   email. A senha é da conta de quem está logado (Supabase Auth), não de um
   ministério: por isso não passa por RLS nem por tabela nossa. Quem chegou
   pelo link de acesso pode criar a senha aqui mesmo, sem outro email. */
export async function definirMinhaSenha(senha: string) {
  const { error } = await sb()!.auth.updateUser({ password: senha });
  if (error) throw error;
}

/* quem organiza TUDO é quem pode dar e tirar acesso */
export async function souOrganizadorGeral(): Promise<boolean> {
  const { data, error } = await sb()!.rpc('lidera_tudo');
  if (error) return false;
  return !!data;
}

/* o líder confere o nível que a pessoa declarou no auto-cadastro */
export async function conferirVoluntario(id: string) {
  const { error } = await sb()!.rpc('conferir_voluntario', { p_id: id });
  if (error) throw error;
}
