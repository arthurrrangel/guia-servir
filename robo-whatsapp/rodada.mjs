/* UMA RODADA DO ROBÔ · 26/10/2026.

   Lê a escala dos próximos dias, decide (regras.mjs) e posta. Tudo o que
   toca o mundo entra por parâmetro: o WhatsApp (`wa`), a leitura do sistema
   (`lerDia`), a pausa entre mensagens (`espera`), o aviso ao Arthur, a pausa
   de emergência (`pausar`) e a gravação do estado. Assim
   testes/regras.test.mjs roda uma semana inteira com um WhatsApp e um sistema
   de mentira.

   GRAVA ANTES DE MANDAR. Cada envio fica gravado como "incerto" antes de sair
   e vira "postado" depois. Se o processo morrer no meio (Mac desligado,
   travamento), o envio fica incerto e não se repete sozinho; se o estado não
   puder ser gravado, nada sai.

   Devolve { completa, motivo }. Rodada incompleta (sem conexão, sistema fora,
   envio que não saiu) roda de novo dentro da tolerância; o que já saiu fica
   gravado e não sai de novo. */

import * as R from './regras.mjs';

const PAROU_NO_MEIO = 'o robô parou no meio do envio';

export async function executarRodada({
  wa, lerDia, rodada, agora, estado, cfg, avisar, log, pausado, pausar, espera, salvar,
  agoraMs = () => Date.now(), antecipar = [],
}) {
  log(`rodada ${rodada.hhmm} de ${agora.data}`);
  if (pausado()) { log('PAUSADO: nada sai nesta rodada'); return { completa: true, motivo: 'pausado' }; }
  if (!wa.aberto()) {
    try { await wa.esperarAberto(cfg.esperaConexaoS * 1000); } catch {
      avisar(`Sem conexão com o WhatsApp na rodada das ${rodada.hhmm}. Tento de novo em alguns minutos.`, 'conexao');
      return { completa: false, motivo: 'sem conexão' };
    }
  }
  let mapa;
  try { mapa = await wa.mapearGrupos([...new Set([...Object.values(cfg.grupos), cfg.grupoDaCobranca])]); } catch (e) {
    avisar(`Não consegui ler os grupos do WhatsApp (${e.message}). Tento de novo em alguns minutos.`, 'mapear');
    return { completa: false, motivo: 'grupos' };
  }

  const inicioMs = Number.isFinite(Date.parse(estado.inicio)) ? Date.parse(estado.inicio) : agoraMs();
  let primeiraMsg = true;
  const pausaEntreMensagens = async () => { if (!primeiraMsg) await espera(cfg.intervaloEntreMensagensS); primeiraMsg = false; };
  const agoraIso = () => new Date(agoraMs()).toISOString();
  let incompleta = null;

  /* posta com o estado gravado antes e depois. `registros` diz onde fica a
     marca de cada envio: [{ pai, chave, novo(id) }]. Devolve 'ok', ou o
     motivo para PARAR a rodada (o resto sai na próxima tentativa, sem
     repetir o que já saiu) */
  async function postarEGravar(alvo, texto, mentions, registros, rotulo) {
    await pausaEntreMensagens();
    if (pausado()) { log('PAUSADO no meio da rodada'); return 'pausado'; }
    const antes = registros.map((r) => r.pai[r.chave]);
    const voltar = () => registros.forEach((r, i) => { if (antes[i] === undefined) delete r.pai[r.chave]; else r.pai[r.chave] = antes[i]; });
    for (const r of registros) r.pai[r.chave] = { ...r.novo(null), situacao: 'incerto', erro: PAROU_NO_MEIO };
    try { salvar(); } catch (e) {
      voltar();
      avisar(`Não consegui gravar o estado do robô (${e.message}). Nada sai até isso ser resolvido.`, 'gravar');
      return 'gravar';
    }
    try {
      const id = await wa.postar(alvo.jid, texto, mentions);
      for (const r of registros) r.pai[r.chave] = { ...r.novo(id || null), situacao: 'postado' };
    } catch (e) {
      if (e.fase === 'antes') {
        voltar();
        try { salvar(); } catch { /* fica incerto no disco: não repete, pede conferência */ }
        avisar(`${rotulo} não saiu (${e.message}). Tento de novo em alguns minutos.`, `antes:${rotulo}`);
        return 'antes';
      }
      const erro = String(e.message).slice(0, 160);
      for (const r of registros) r.pai[r.chave] = { ...r.novo(null), situacao: 'incerto', erro };
      try { salvar(); } catch { /* já está incerto no disco */ }
      if (e.fase === 'recusado') {
        pausar(`o WhatsApp recusou a mensagem em ${rotulo} (${e.message})`);
        avisar(`O WhatsApp RECUSOU a mensagem em ${rotulo} (${e.message}). Pausei o robô: nada mais sai até alguém conferir o número da igreja.`, `recusado:${rotulo}`);
        return 'recusado';
      }
      avisar(`Envio INCERTO em ${rotulo} (${e.message}). Não repito sozinho: confira o grupo.`, `incerto:${rotulo}`);
      return 'durante';
    }
    try { salvar(); } catch (e) {
      avisar(`A mensagem em ${rotulo} saiu, mas não consegui gravar (${e.message}). Ela fica como incerta; nada mais sai.`, 'gravar');
      return 'gravar';
    }
    return 'ok';
  }

  const cobrar = [];
  /* os dias da janela, as datas já postadas mais à frente (trocas) e as que
     o Arthur mandou antecipar (pedido --mandar-agora) */
  for (const data of R.datasDaRodada(agora.data, cfg.diasDeAntecedencia, estado.envios, antecipar, cfg.diasDeVigia)) {
    const n = R.diasEntre(agora.data, data);
    const pedida = (antecipar || []).includes(data);
    let resp;
    try { resp = await lerDia(data); } catch (e) {
      avisar(`Não consegui ler a escala de ${data}: ${e.message}`, `leitura:${data}`);
      incompleta ||= 'leitura';
      continue;
    }
    if (!resp?.culto?.preenchidos) continue;
    const comecou = R.cultoJaComecou(data, resp.culto.hora, agora);
    const estadoDoDia = (estado.envios[data] ||= {});
    const momento = R.momentoDaPrimeira(data, cfg.rodadas, cfg.diasDeAntecedencia);
    const permitida = pedida || R.primeiraPermitida(n, rodada, cfg.diasDeAntecedencia, momento, inicioMs);
    if (pedida) log(`${data}: escala antecipada a pedido (${n} dias antes)`);
    if (!permitida && momento != null && momento < inicioMs && !Object.keys(estadoDoDia).length && !comecou) {
      log(`${data}: a hora de mandar esta escala foi antes de o robô começar; fica com quem já mandava`);
    }
    const plano = R.planoDoDia({
      resposta: resp, estadoDoDia, grupos: cfg.grupos, comecou, primeiraPermitida: permitida, maxVersoes: cfg.maxVersoes,
    });
    for (const a of plano.avisos) avisar(`${data}: ${a.texto}`, `${data}:${a.chave}`);

    for (const acao of plano.acoes) {
      const alvo = mapa[acao.grupo];
      if (!alvo?.jid) { avisar(`${data}: grupo "${acao.grupo}": ${alvo?.erro || 'não achei'}. Pulei.`, `${data}:alvo:${acao.grupo}`); continue; }
      if (alvo.soAdmin && !alvo.admin) { avisar(`${data}: "${acao.grupo}" só deixa administrador escrever, e o número da igreja não é. Pulei.`, `${data}:admin:${acao.grupo}`); continue; }
      const versao = (estadoDoDia[acao.gid]?.versao || 0) + 1;
      const r = await postarEGravar(alvo, acao.texto, [], [{
        pai: estadoDoDia, chave: acao.gid,
        novo: (id) => ({ ass: acao.ass, em: agoraIso(), versao, grupo: acao.grupo, id }),
      }], `${data} ${acao.grupo}`);
      if (r === 'ok') { log(`${data} ${acao.tipo} → ${acao.grupo}: postado`, JSON.stringify(R.resumoSemDados(acao.texto))); continue; }
      if (r === 'pausado' || r === 'recusado') return { completa: true, motivo: r };
      return { completa: false, motivo: r };
    }

    /* a cobrança fica na janela de sempre (até 2 dias antes), mesmo com a
       escala postada mais cedo: cedo demais, viraria uma semana de @ */
    if (rodada.cobrar && n <= cfg.diasDeAntecedencia
      && R.deveCobrar({ resposta: resp, estadoDoDia, cobranca: estado.cobrancas[data], agoraMs: agoraMs(), cfg, comecou })) {
      cobrar.push({ data, cobranca: resp.cobranca });
    }
  }

  /* a cobrança: uma mensagem só no grupo geral, mesmo com dois cultos. Com
     algum dia sem leitura, espera a nova tentativa (senão sairiam duas) */
  if (cobrar.length && incompleta) {
    log('cobrança adiada: falta ler algum dia; sai junto na próxima tentativa');
  } else if (cobrar.length) {
    const alvo = mapa[cfg.grupoDaCobranca];
    if (!alvo?.jid) {
      avisar(`Grupo da cobrança "${cfg.grupoDaCobranca}": ${alvo?.erro || 'não achei'}. A cobrança não saiu.`, `alvo:cobranca`);
    } else if (alvo.soAdmin && !alvo.admin) {
      avisar(`"${cfg.grupoDaCobranca}" só deixa administrador escrever, e o número da igreja não é. A cobrança não saiu.`, `admin:cobranca`);
    } else {
      const telefones = [...new Set(cobrar.flatMap((c) => c.cobranca.mencoes.map((m) => m.telefone)))];
      let resolvidos = [];
      try { resolvidos = await wa.mencoesDoGrupo(alvo.jid, telefones); } catch (e) {
        log('não consegui ler os participantes do grupo geral; a cobrança sai pelos nomes:', e.message);
      }
      const partes = cobrar.map((c) => R.aplicarMencoes(c.cobranca.texto, c.cobranca.mencoes, resolvidos));
      const { texto, mentions } = R.juntarCobrancas(partes);
      const datas = cobrar.map((c) => c.data);
      /* a conta de vezes sai antes da marca "incerto" (que troca o registro) */
      const registros = datas.map((d) => {
        const vezes = (estado.cobrancas[d]?.vezes || 0) + 1;
        return { pai: estado.cobrancas, chave: d, novo: () => ({ em: agoraIso(), vezes }) };
      });
      const r = await postarEGravar(alvo, texto, mentions, registros, `cobrança ${datas.join(' e ')}`);
      if (r === 'ok') {
        log(`cobrança → ${cfg.grupoDaCobranca}: postada (${datas.join(' e ')})`,
          JSON.stringify({ pendentes: cobrar.reduce((s, c) => s + c.cobranca.pendentes, 0), mencoes: mentions.length, semMencao: telefones.length - resolvidos.filter((x) => x.jid).length }));
      } else if (r === 'pausado' || r === 'recusado') {
        return { completa: true, motivo: r };
      } else {
        return { completa: false, motivo: r };
      }
    }
  }
  return incompleta ? { completa: false, motivo: incompleta } : { completa: true };
}
