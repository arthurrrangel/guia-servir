/* OS PEDIDOS DO BOTÃO "MANDAR AGORA PELO ROBÔ" · 26/10/2026.

   O Arthur: "Gostaria de na aba do sistema ter a opção de disparar escala,
   através desse robo, vou deixar o macbook ligado" e "Para todos os
   ministérios".

   O líder aperta o botão no "Mandar nos grupos"; o sistema guarda o pedido
   (migração 115). O serviço (robo.mjs) passa a cada 30 s pela rota
   /api/robo/pedidos: conta que está vivo, leva os pedidos abertos e devolve
   o que fez. Aqui fica a parte que se testa sem rede e sem WhatsApp
   (testes/pedidos.test.mjs):
     · decidir o que fazer com cada pedido (mandar, recusar, esperar, ou só
       repetir o relato de um pedido já atendido);
     · atender: uma rodada só daquele ministério e daquele dia, sem cobrança,
       com as mesmas travas de sempre (grava antes de mandar, não repete o que
       já está no grupo, não repete envio incerto);
     · a fila de relatos: o relato fica gravado no estado até o sistema dizer
       que recebeu (uma queda de rede não perde o resultado). */

import * as R from './regras.mjs';
import { executarRodada } from './rodada.mjs';

export const RODADA_DO_PEDIDO = { hhmm: 'pedido', primeira: false, cobrar: false };
/* o mesmo prazo do sistema (lib/robo-pedidos.ts): pedido mais velho que isto
   não sai, e um envio não continua depois disto (Mac que dormiu no meio) */
export const VALIDADE_DO_PEDIDO_MIN = 30;
export const PRAZO_DO_ENVIO_MIN = 25;

const falhou = (resumo) => ({ status: 'falhou', resultado: { resumo, grupos: [], avisos: [] } });

/* o que fazer com um pedido que veio do sistema:
   · { tipo: 'repetir', relato }: já atendido; o relato não chegou lá, manda de novo;
   · { tipo: 'final', relato }: recusa na hora, com o motivo para a tela;
   · { tipo: 'ignorar' }: velho demais; o sistema fecha sozinho;
   · { tipo: 'mandar' }: o robô ainda marca "mandando" no sistema antes, e
     só manda se a marca pegar (robo.mjs).
   Sem WhatsApp, o pedido cai na hora (e não espera): a tela já mandou o
   líder mandar à mão, e esperar viraria mensagem em dobro. */
export function decidirPedido(pedido, { cfg, estado, pausado, conectado, hoje, agoraMs }) {
  const feito = estado.pedidos?.[pedido?.id];
  if (feito?.final) return { tipo: 'repetir', relato: { id: pedido.id, status: feito.status, resultado: feito.resultado } };
  const criado = Date.parse(pedido?.criado_em || '');
  if (Number.isFinite(criado) && Number.isFinite(agoraMs) && agoraMs - criado > VALIDADE_DO_PEDIDO_MIN * 60000) return { tipo: 'ignorar' };
  /* pedido que já estava "mandando" quando o robô parou: pode ter saído em
     parte, então nunca "nada foi mandado" */
  const meio = pedido?.status === 'enviando';
  const final = (resumo) => ({ tipo: 'final', relato: { id: pedido.id, ...falhou(meio ? `O robô parou no meio do envio e não vai continuar: ${resumo.charAt(0).toLowerCase()}${resumo.slice(1)} Confira os grupos.` : resumo) } });
  if (!cfg.ministerios?.[pedido?.equipe]) return final('O robô não tem os grupos do WhatsApp deste ministério.');
  const d = String(pedido.data || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d < hoje || d > R.somaDias(hoje, cfg.diasDeVigia)) {
    return final(`O robô manda escala de hoje até daqui a ${cfg.diasDeVigia} dias.`);
  }
  if (pausado) return final(meio ? 'o robô foi pausado.' : 'O robô está pausado: nada foi mandado. Avise o Arthur.');
  if (!conectado) return final(meio ? 'o robô perdeu a conexão com o WhatsApp.' : 'O robô está sem conexão com o WhatsApp agora: nada foi mandado. Peça de novo em alguns minutos.');
  return { tipo: 'mandar' };
}

/* atende um pedido: só aquele ministério, só aquele dia, sem cobrança */
export async function atenderPedido({
  pedido, estado, cfg, wa, lerDia, avisar, log, pausado, pausar, espera, salvar, agora, agoraMs = () => Date.now(),
}) {
  const cfgM = R.configDoMinisterio(cfg, pedido.equipe);
  const visao = R.visaoDoMinisterio(estado, pedido.equipe, cfg.principal);
  let r;
  try {
    r = await executarRodada({
      wa, lerDia: (data) => lerDia(pedido.equipe, data), rodada: RODADA_DO_PEDIDO, agora, estado: visao, cfg: cfgM,
      avisar, log, pausado, pausar, espera, salvar, agoraMs, soDatas: [pedido.data],
      prazoMs: agoraMs() + PRAZO_DO_ENVIO_MIN * 60000,
    });
  } catch (e) {
    log(`pedido ${pedido.equipe} ${pedido.data}: parou com erro:`, e?.message || String(e));
    r = { completa: false, motivo: 'erro', relatorio: {} };
  }
  const dia = r.relatorio?.[pedido.data];
  const { status, resultado } = R.resultadoDoPedido(r, dia);
  if ((dia?.grupos || []).some((g) => g.situacao === 'incerto')) {
    resultado.avisos = [
      'Grupo para conferir: o robô não sabe se a mensagem saiu e não repete sozinho. Se não saiu, mande à mão pelas linhas abaixo.',
      ...resultado.avisos,
    ].slice(0, 10);
  }
  return { id: pedido.id, status, resultado, motivo: r.motivo || null };
}

/* ------------------------------------------------ a fila de relatos --- */
export function guardarRelato(estado, relato, emIso) {
  const limpo = { id: relato.id, status: relato.status, resultado: relato.resultado ?? null };
  estado.relatos = (estado.relatos || []).filter((x) => x.id !== limpo.id);
  estado.relatos.push(limpo);
  if (limpo.status === 'enviado' || limpo.status === 'falhou') {
    estado.pedidos ||= {};
    estado.pedidos[limpo.id] = { em: emIso, final: true, status: limpo.status, resultado: limpo.resultado };
  }
  return estado;
}

export function tirarVistos(estado, vistos) {
  const v = new Set(Array.isArray(vistos) ? vistos : []);
  estado.relatos = (estado.relatos || []).filter((x) => !v.has(x.id));
  return estado;
}

/* o que vai para o sistema a cada passada (até 20 relatos, o limite da rota) */
export function corpoDaPassada({ conectado, pausado, versao, cfg, relatos = [] }) {
  return {
    batimento: { conectado: !!conectado, pausado: !!pausado, versao: versao || null, ministerios: Object.keys(cfg.ministerios || {}) },
    relatos: relatos.slice(0, 20).map((x) => ({ id: x.id, status: x.status, resultado: x.resultado ?? null })),
  };
}
