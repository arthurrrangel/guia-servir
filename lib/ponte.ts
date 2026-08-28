/* Ponte pura entre as linhas do banco e o Estado do motor.
   SEM 'use client': roda no navegador (db.ts) e no servidor (cron). */
import { CONFIG_PADRAO, Estado, Nivel, Status, estadoVazio, garantirDia } from './engine';

export type LinhasDoBanco = {
  funcoes: any[]; voluntarios: any[]; habilidades: any[]; indisponibilidades: any[];
  cultos: any[]; escalacoes: any[]; plantoes: any[]; config: any | null;
  /* recado do domingo POR EQUIPE (culto_obs). Sem isso, o recado de um
     ministério aparecia no aviso do outro e um sobrescrevia o do outro. */
  recados?: any[];
  /* respostas de "posso" por domingo (tabela disponibilidade) */
  disponibilidades?: any[];
  equipe?: string;
};

export function montarEstado(l: LinhasDoBanco): Estado {
  const S = estadoVazio();
  /* líder de verdade sempre lê a linha de config; quem logou sem estar na
     allowlist recebe null (RLS) — o Shell usa isso para mostrar "sem acesso" */
  (S as any).temAcesso = !!l.config;
  S.equipe = l.equipe || '';
  S.config = { ...CONFIG_PADRAO, ...(l.config?.dados || {}) };
  S.funcoes = (l.funcoes || []).map(f => ({
    id: f.id, nome: f.nome, simultanea: f.simultanea, ordem: f.ordem, ativa: f.ativa,
    /* em que tipo de culto esta área existe. Linha antiga (sem a coluna) vale
       para os dois: só quem foi marcado explicitamente fica de fora do Follow. */
    tipos: Array.isArray(f.tipos) && f.tipos.length ? f.tipos : ['domingo', 'follow'],
    /* posto que preenche o relatório do dia (líder escalado do Serviço) */
    relata: !!f.relata,
  }));

  const nomeFuncao = new Map<string, string>((l.funcoes || []).map(f => [f.id, f.nome]));
  const habPorVol = new Map<string, Record<string, Nivel>>();
  /* nível declarado no auto-cadastro x nível que alguém do time conferiu.
     Linha antiga (sem a coluna) vale como conferida: foi o líder que criou. */
  const okPorVol = new Map<string, Record<string, boolean>>();
  for (const h of l.habilidades || []) {
    const fn = nomeFuncao.get(h.funcao_id);
    if (!fn) continue;
    const m = habPorVol.get(h.voluntario_id) || {};
    m[fn] = h.nivel; habPorVol.set(h.voluntario_id, m);
    const c = okPorVol.get(h.voluntario_id) || {};
    c[fn] = h.confirmado !== false; okPorVol.set(h.voluntario_id, c);
  }
  const indisPorVol = new Map<string, string[]>();
  for (const i of l.indisponibilidades || []) {
    const arr = indisPorVol.get(i.voluntario_id) || [];
    arr.push(i.data); indisPorVol.set(i.voluntario_id, arr);
  }
  /* quem respondeu "posso". Só conta pode=true: um pode=false já virou
     indisponibilidade lá no eu_disponibilidade, então não conta duas vezes. */
  const dispPorVol = new Map<string, string[]>();
  for (const d of l.disponibilidades || []) {
    if (d.pode === false) continue;
    const arr = dispPorVol.get(d.voluntario_id) || [];
    arr.push(d.data); dispPorVol.set(d.voluntario_id, arr);
  }
  S.voluntarios = (l.voluntarios || []).map(v => ({
    id: v.id, nome: v.nome, tel: v.telefone || '', ativo: v.ativo,
    limiteMes: v.limite_mes, token: v.token,
    /* coluna nova: cadastros antigos vêm sem ela e valem como conferidos */
    conferido: v.conferido !== false,
    funcoes: habPorVol.get(v.id) || {}, confirmadas: okPorVol.get(v.id) || {},
    indisponivel: indisPorVol.get(v.id) || [],
    disponivel: dispPorVol.get(v.id) || [],
  }));

  /* O culto (o domingo) é compartilhado pela igreja inteira; o que é DESTA
     equipe são as escalações, os plantões e o recado. Materializar um dia só
     porque outro ministério montou nele fazia o app mostrar "7 funções sem
     ninguém" e sumir com o botão "Montar a escala deste mês". */
  const dataDoCulto = new Map<string, string>((l.cultos || []).map(c => [c.id, c.data]));
  const idDoCulto = new Map<string, string>((l.cultos || []).map(c => [c.data, c.id]));
  const abrir = (data: string) => {
    const d = garantirDia(S, data);
    const id = idDoCulto.get(data);
    if (id) d.cultoId = id;
    return d;
  };
  for (const e of l.escalacoes || []) {
    const data = dataDoCulto.get(e.culto_id); const fn = nomeFuncao.get(e.funcao_id);
    if (!data || !fn) continue;
    abrir(data).slots[fn] = { vid: e.voluntario_id, status: e.status as Status, fixo: e.fixo,
      primeiraVez: !!e.primeira_vez, respondidoEm: e.respondido_em || null,
      escaladoEm: e.escalado_em || null };
  }
  for (const p of l.plantoes || []) {
    const data = dataDoCulto.get(p.culto_id);
    if (data) abrir(data).plantao.push(p.voluntario_id);
  }
  for (const r of l.recados || []) {
    const data = dataDoCulto.get(r.culto_id);
    if (!data) continue;
    if ((r.obs || '').trim()) abrir(data).obs = r.obs;
    /* relatório do fim do culto: mora na mesma linha do recado */
    if (r.relatorio || r.problemas) {
      const d = abrir(data);
      d.relatorio = r.relatorio || '';
      d.problemas = r.problemas || '';
      d.relatadoEm = r.relatado_em || null;
      d.relatadoPor = r.relatado_por || null;
    }
  }
  return S;
}

/** Parâmetros prontos para a RPC transacional salvar_dia.
 *  p_equipe é obrigatório: sem ele o banco apagava a escala dos OUTROS
 *  ministérios no mesmo domingo (o culto é uma linha só para a igreja toda). */
export function paraSalvarDia(S: Estado, data: string, equipeId: string) {
  const dia = S.escalas[data];
  if (!dia) return null;
  if (!equipeId) throw new Error('salvarDia sem ministério');
  const idFuncao = new Map(S.funcoes.map(f => [f.nome, f.id!]));
  const meus = new Set(S.voluntarios.map(v => v.id));
  const slots = Object.entries(dia.slots)
    .filter(([fn, sl]) => sl?.vid && idFuncao.get(fn) && meus.has(sl.vid!))
    .map(([fn, sl]) => ({
      funcao_id: idFuncao.get(fn), voluntario_id: sl.vid,
      status: sl.status || 'pendente', fixo: !!sl.fixo, primeira_vez: !!sl.primeiraVez,
    }));
  return {
    p_equipe: equipeId, p_data: data, p_obs: dia.obs || '', p_slots: slots,
    p_plantao: (dia.plantao || []).filter(v => meus.has(v)),
  };
}
