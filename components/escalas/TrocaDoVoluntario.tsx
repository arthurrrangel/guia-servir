'use client';
/* =============================================================================
   A TROCA, NO LINK DO VOLUNTÁRIO — 103, 01/10/2026

   Três coisas na mesma seção, no alto da página (logo abaixo do "Precisa de
   você"), porque as três pedem ação ou dão notícia:

     1. TE PEDIRAM: um colega pediu para você ficar com a vaga dele. Você
        aceita ou diz que não pode. Aceitar passa a vaga na hora, confirmada.
     2. O PAINEL DE PEDIR: quem pode ficar com a sua vaga, sem telefone. Um
        toque pede; o WhatsApp avisa o colega com a mão de quem pediu, porque
        o sistema não manda aviso sozinho (ainda).
     3. VOCÊ PEDIU: o pedido esperando, e a resposta quando vem.

   Só aparece com a migração 103 aplicada: a página só mostra isto depois que
   `eu_trocas` respondeu. Antes disso, nada daqui existe na tela.
   As frases moram em lib/trocas.ts, onde o teste alcança.
   ============================================================================= */
import { useEffect, useState } from 'react';
import { sbPublico as sb } from '@/lib/supabase';
import { aviseHumano } from '@/lib/erros';
import { PRINCIPAL } from '@/lib/meu-token';
import {
  type Troca, type Candidato, type Vaga,
  NIVEL_EM_PALAVRAS, quandoDaVaga, motivoParaMim, motivoDoColega,
  erroAoPedir, erroAoResponder, separarTrocas, recadoDaTroca, linkDoWhatsSemNumero,
} from '@/lib/trocas';

const primeiro = (n: string | null | undefined) => (n || '').trim().split(/\s+/)[0] || 'A pessoa';
const chaveDaVaga = (v: { culto_id: string; funcao_id: string }) => `${v.culto_id}\u0000${v.funcao_id}`;

type Props = {
  token: string;
  trocas: Troca[];
  vaga: Vaga | null;
  abrirVaga: (v: Vaga) => void;
  fecharVaga: () => void;
  /* vagas que a pessoa disse que não pode NESTA visita, ainda dela e sem
     pedido aberto: a seção oferece pedir a um colega */
  ofertas: Vaga[];
  /* `culto_id\0funcao_id` das vagas que ainda são da pessoa */
  minhasVagas: Set<string>;
  slug: string | null;
  responsavel: string | null;
  cultoHora: string; followHora?: string | null;
  aoMudar: () => Promise<void> | void;
  avisar: (msg: string) => void;
  errar: (msg: string) => void;
};

export default function TrocaDoVoluntario(p: Props) {
  const { recebidas, minhasAbertas, respostas } = separarTrocas(p.trocas);
  const [ocupado, setOcupado] = useState('');
  const quando = (v: { data: string; evento?: string | null; inicio?: string | null }) =>
    quandoDaVaga(v, p.cultoHora, p.followHora);
  const porta = p.slug ? `${PRINCIPAL}/confirmar/${p.slug}` : `${PRINCIPAL}/eu`;
  /* resposta que diz "recusada" de uma vaga que já não é da pessoa não tem
     ação a oferecer: só a notícia */
  const ofertasVisiveis = p.ofertas.filter(o =>
    !minhasAbertas.some(t => chaveDaVaga(t) === chaveDaVaga(o)) && (!p.vaga || chaveDaVaga(p.vaga) !== chaveDaVaga(o)));

  const tem = recebidas.length || minhasAbertas.length || respostas.length || p.vaga || ofertasVisiveis.length;
  if (!tem) return null;

  async function responder(t: Troca, aceita: boolean) {
    setOcupado(t.id);
    const { data, error } = await sb()!.rpc('eu_troca_responder', { p_token: p.token, p_troca: t.id, p_aceita: aceita });
    setOcupado('');
    if (error) { p.errar(aviseHumano(error, 'responder')); return; }
    const r = data as any;
    if (!r?.ok) { p.errar(erroAoResponder(r)); await p.aoMudar(); return; }
    p.avisar(aceita
      ? `Pronto. A vaga de ${t.funcao} é sua, já confirmada.`
      : `Registrado. ${primeiro(t.outro)} vê a resposta ao abrir a página.`);
    await p.aoMudar();
  }

  async function possoNoDia(t: Troca) {
    setOcupado(t.id);
    const { error } = await sb()!.rpc('eu_disponibilidade', { p_token: p.token, p_data: t.data, p_resposta: 'posso' });
    setOcupado('');
    if (error) { p.errar(aviseHumano(error, 'salvar')); return; }
    await p.aoMudar();
  }

  async function desistir(t: Troca) {
    setOcupado(t.id);
    const { data, error } = await sb()!.rpc('eu_troca_cancelar', { p_token: p.token, p_troca: t.id });
    setOcupado('');
    if (error) { p.errar(aviseHumano(error, 'desistir')); return; }
    if (!(data as any)?.ok) p.errar('Esse pedido já tinha sido respondido.');
    else p.avisar('Pedido desfeito.');
    await p.aoMudar();
  }

  const temMeus = minhasAbertas.length + respostas.length > 0;
  return (
    <section className="vol-secao" id="trocas">
      <div className="vol-secao-cab">
        <span className="rot">Trocas</span>
        {!!recebidas.length && (
          <span className="vol-secao-nota">
            {recebidas.length === 1 ? '1 pedido para você' : `${recebidas.length} pedidos para você`}
          </span>
        )}
      </div>

      {/* O PAINEL DE PEDIR vem primeiro: é o que a pessoa acabou de abrir */}
      {p.vaga && (
        <PainelPedir key={chaveDaVaga(p.vaga)} {...p} vaga={p.vaga} quando={quando(p.vaga)} porta={porta} />
      )}

      {/* 1. TE PEDIRAM */}
      {!!recebidas.length && <div className="vol-troca-sub">Te pediram</div>}
      {recebidas.map(t => {
        const motivo = t.impede ? motivoParaMim(t.impede) : '';
        return (
          <div className="vol-troca" key={t.id}>
            <div className="vol-troca-fn">{t.funcao}</div>
            <div className="vol-troca-dia">{quando(t)}</div>
            <p className="vol-troca-quem">
              {t.outro || 'Um colega'} pediu para você ficar com essa vaga. Se aceitar, ela passa
              para você na hora, já confirmada.
            </p>
            {motivo && <p className="vol-troca-motivo" role="note">{motivo}</p>}
            <div className="vol-btns">
              {!t.impede && (
                <button className="vol-bt" disabled={ocupado === t.id} onClick={() => responder(t, true)}>
                  Fico com a vaga
                </button>
              )}
              {t.impede === 'INDISPONIVEL' && (
                <button className="vol-bt" disabled={ocupado === t.id} onClick={() => possoNoDia(t)}>
                  Posso nesse dia
                </button>
              )}
              <button className="vol-bt nao" disabled={ocupado === t.id} onClick={() => responder(t, false)}>
                Não posso
              </button>
            </div>
          </div>
        );
      })}

      {/* a vaga que a pessoa acabou de largar, com a oferta de pedir */}
      {ofertasVisiveis.map(o => (
        <div className="vol-linha pend" key={'of' + chaveDaVaga(o)}>
          <span className="vol-marca" aria-hidden="true" />
          <span>
            <span className="vol-linha-dia">{quando(o)}</span>
            <span className="vol-linha-fn">{o.funcao}</span>
            <span className="vol-linha-obs">A vaga ficou aberta. Peça a um colega: quem aceitar fica com ela na hora.</span>
            <button className="vol-acao" onClick={() => p.abrirVaga(o)}>Pedir a um colega</button>
          </span>
          <span className="vol-linha-est">vaga aberta</span>
        </div>
      ))}

      {/* 3. VOCÊ PEDIU */}
      {temMeus && <div className="vol-troca-sub">Você pediu</div>}
      {minhasAbertas.map(t => {
        const motivo = t.impede ? motivoDoColega(t.impede, t.outro) : '';
        const recado = recadoDaTroca(t.outro, t, quando(t), porta);
        return (
          <div className={`vol-linha ${motivo ? 'ruim' : 'pend'}`} key={t.id}>
            <span className="vol-marca" aria-hidden="true" />
            <span>
              <span className="vol-linha-dia">{quando(t)}</span>
              <span className="vol-linha-fn">{t.funcao}</span>
              <span className="vol-linha-obs">
                {motivo || `Você pediu a ${t.outro || 'um colega'}. A vaga continua sua até a resposta.`}
              </span>
              <span className="vol-troca-acoes">
                {!motivo && (
                  <a className="vol-acao" href={linkDoWhatsSemNumero(recado)} target="_blank" rel="noopener noreferrer">
                    Avisar no WhatsApp
                  </a>
                )}
                {motivo && p.minhasVagas.has(chaveDaVaga(t)) && (
                  <button className="vol-acao" onClick={() => p.abrirVaga(t)}>Pedir a outra pessoa</button>
                )}
                <button className="vol-acao" disabled={ocupado === t.id} onClick={() => desistir(t)}>Desistir</button>
              </span>
            </span>
            <span className="vol-linha-est">{motivo ? 'não pode mais' : 'esperando'}</span>
          </div>
        );
      })}
      {respostas.map(t => {
        const ainda = p.minhasVagas.has(chaveDaVaga(t));
        return (
          <div className={`vol-linha ${t.status === 'aceita' ? 'ok' : 'ruim'}`} key={t.id}>
            <span className="vol-marca" aria-hidden="true" />
            <span>
              <span className="vol-linha-dia">{quando(t)}</span>
              <span className="vol-linha-fn">{t.funcao}</span>
              <span className="vol-linha-obs">
                {t.status === 'aceita'
                  ? `${t.outro || 'O colega'} ficou com a vaga. Ela saiu da sua escala.`
                  : `${t.outro || 'O colega'} não pode.${ainda ? ' A vaga continua sua.' : ''}`}
              </span>
              {t.status === 'recusada' && ainda && (
                <button className="vol-acao" onClick={() => p.abrirVaga(t)}>Pedir a outra pessoa</button>
              )}
            </span>
            <span className="vol-linha-est">{t.status === 'aceita' ? 'trocado' : 'não pode'}</span>
          </div>
        );
      })}
    </section>
  );
}

/* ---------------------------------------------------------------------------
   Quem pode ficar com a vaga. A lista vem de `eu_troca_candidatos`, com as
   regras do sorteio: sabe a função, não avisou que não pode, não está em
   outro posto no dia, o sexo que o posto pede. Sem telefone.
--------------------------------------------------------------------------- */
function PainelPedir(p: Props & { vaga: Vaga; quando: string; porta: string }) {
  const [lista, setLista] = useState<Candidato[] | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [ocupado, setOcupado] = useState('');
  const [pedidos, setPedidos] = useState<string[]>([]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data, error } = await sb()!.rpc('eu_troca_candidatos',
        { p_token: p.token, p_culto_id: p.vaga.culto_id, p_funcao_id: p.vaga.funcao_id });
      if (!vivo) return;
      if (error) { setFalhou(true); return; }
      setLista((data || []) as Candidato[]);
    })();
    return () => { vivo = false; };
  }, [p.token, p.vaga.culto_id, p.vaga.funcao_id]);

  async function pedir(c: Candidato) {
    setOcupado(c.voluntario_id);
    const { data, error } = await sb()!.rpc('eu_troca_pedir', {
      p_token: p.token, p_culto_id: p.vaga.culto_id, p_funcao_id: p.vaga.funcao_id, p_para: c.voluntario_id,
    });
    setOcupado('');
    if (error) { p.errar(aviseHumano(error, 'pedir')); return; }
    const r = data as any;
    if (!r?.ok) { p.errar(erroAoPedir(r, c.nome, p.responsavel)); return; }
    setPedidos(xs => [...xs, c.voluntario_id]);
    p.avisar(`Pedido enviado a ${primeiro(c.nome)}. Avise pelo WhatsApp.`);
    await p.aoMudar();
  }

  return (
    <div className="vol-troca-painel" id="pedir-troca" role="group" aria-label={`Pedir troca de ${p.vaga.funcao}`}>
      <div className="vol-troca-fn">Quem pode ficar com {p.vaga.funcao}</div>
      <div className="vol-troca-dia">{p.quando}</div>
      <p className="vol-troca-quem">
        Quem aceitar fica com a vaga, já confirmada, e a liderança vê a troca. Até alguém
        aceitar, ela continua sua.
      </p>
      {falhou && <p className="vol-troca-motivo" role="status">Não consegui carregar a lista agora. Feche e abra de novo.</p>}
      {!falhou && lista === null && <p className="vol-troca-quem" role="status">Procurando quem pode…</p>}
      {!!lista && !lista.length && (
        <p className="vol-troca-motivo" role="status">
          Ninguém da sua área está livre para essa função nesse dia. Fale com {p.responsavel || 'a liderança'}.
        </p>
      )}
      {!!lista && lista.map(c => {
        const feito = c.ja_pedi || pedidos.includes(c.voluntario_id);
        const recado = recadoDaTroca(c.nome, p.vaga, p.quando, p.porta);
        return (
          <div className="vol-linha" key={c.voluntario_id}>
            <span className="vol-marca" aria-hidden="true" />
            <span>
              <span className="vol-linha-dia">{c.nome}</span>
              <span className="vol-linha-fn">{c.disse_que_pode ? 'disse que pode nesse dia' : NIVEL_EM_PALAVRAS[c.nivel]}</span>
              {feito && (
                <a className="vol-acao" href={linkDoWhatsSemNumero(recado)} target="_blank" rel="noopener noreferrer"
                  aria-label={`Avisar ${primeiro(c.nome)} no WhatsApp`}>
                  Avisar no WhatsApp
                </a>
              )}
            </span>
            {feito
              ? <span className="vol-linha-est">pedido enviado</span>
              : <button className="vol-acao vol-troca-pedir" disabled={!!ocupado} onClick={() => pedir(c)}>Pedir</button>}
          </div>
        );
      })}
      <button className="vol-acao" onClick={p.fecharVaga}>Fechar</button>
    </div>
  );
}
