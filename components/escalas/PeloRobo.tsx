'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { roboPedir, roboSituacao } from '@/lib/db';
import { hojeISO } from '@/lib/engine';
import {
  type PedidoNaTela, type RoboNaTela, type Tom as TomDoRobo,
  dentroDaJanelaDoRobo, erroDoPedido, leituraDoPedido, leituraDoRobo, mandadasAMao, marcasDoRobo, roboNoAr,
  JANELA_DO_ROBO_DIAS,
} from '@/lib/robo-pedidos';
import { Pilula, type Tom } from '@/components/escalas/Pecas';
import { IcEnviar } from '@/components/Icones';

/* =============================================================================
   PELO ROBÔ — 26/10/2026

   O Arthur: "Gostaria de na aba do sistema ter a opção de disparar escala,
   através desse robo, vou deixar o macbook ligado" e "Para todos os
   ministérios".

   Um toque e o robô do WhatsApp (no MacBook do Arthur, pelo número da
   igreja) manda a escala do dia em todos os grupos do ministério, cada um
   com a parte dele: as mesmas mensagens das linhas abaixo. Grupo em que o
   robô já mandou esta escala não recebe de novo. O que foi mandado à mão o
   robô não sabe: a confirmação mostra as linhas que este aparelho já mandou.
   E o que o robô mandou volta para as linhas (`aoMarcas`), marcado "pelo
   robô", para ninguém mandar à mão de novo.

   Robô fora do ar com um pedido aberto: a tela diz que ele não vai sair (a
   rota fecha o pedido quando o robô volta), em vez de ficar esperando.

   O botão só aparece com o robô ligado de verdade (passou há menos de três
   minutos, conectado ao WhatsApp, sem pausa, com os grupos deste ministério).
   Desligado, a tela diz isso e manda usar as linhas de baixo, como antes: um
   pedido esperando um robô desligado viraria mensagem repetida no grupo
   quando ele voltasse. Pelo mesmo motivo o pedido vence em 30 minutos.

   SÓ APARECE COM A 115 NO BANCO. Sem ela (ou sem login de líder), some, e o
   "Mandar nos grupos" fica exatamente como era.
   ============================================================================= */

const TOM_DO_ROBO: Record<TomDoRobo, Tom> = { ok: 'ok', alerta: 'warn', fora: 'neutro' };
const TOM_DO_PEDIDO: Record<TomDoRobo, Tom> = { ok: 'ok', alerta: 'warn', fora: 'bad' };
type Situacao = { robo: RoboNaTela; pedidos: PedidoNaTela[] };

export default function PeloRobo({ equipeId, d, aviso, linhas, envios, aoMarcas }: {
  equipeId: string; d: string; aviso: (t: string) => void;
  /* as linhas do "Mandar nos grupos" e as marcas de envio à mão deste aparelho */
  linhas: { gid: string; nome: string; ass: string }[];
  envios: Record<string, { ass: string }>;
  aoMarcas: (m: Record<string, { em: string; ass: string | null }>) => void;
}) {
  /* undefined: carregando; null: sem o que mostrar (esconde) */
  const [sit, setSit] = useState<Situacao | null | undefined>(undefined);
  const [agora, setAgora] = useState(() => Date.now());
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const refConfirmar = useRef<HTMLButtonElement | null>(null);
  const chave = `${equipeId}:${d}`;
  const chaveRef = useRef(chave); chaveRef.current = chave;

  const carregar = useCallback(async () => {
    const pedida = `${equipeId}:${d}`;
    try {
      const r = await roboSituacao(equipeId, d);
      if (chaveRef.current !== pedida) return;
      setSit(r);
      setAgora(Date.now());
    } catch {
      /* rede caiu: fica o que estava na tela, e o próximo ciclo tenta de novo */
      if (chaveRef.current === pedida) setSit(s => (s === undefined ? null : s));
    }
  }, [equipeId, d]);

  useEffect(() => { setSit(undefined); setConfirmando(false); carregar(); }, [carregar]);

  /* o que o robô mandou vira marca nas linhas */
  const refAoMarcas = useRef(aoMarcas); refAoMarcas.current = aoMarcas;
  const pedidosDoDia = sit ? sit.pedidos : null;
  useEffect(() => { refAoMarcas.current(pedidosDoDia ? marcasDoRobo(pedidosDoDia) : {}); }, [pedidosDoDia]);

  const noAr = !!sit && roboNoAr(sit.robo);
  const ultimo = sit?.pedidos[0] ? leituraDoPedido(sit.pedidos[0], agora, noAr) : null;
  const aberto = !!ultimo?.aberto;
  const some = sit === null;
  /* com pedido em andamento, a cada 4 s; sem, a cada 30 s (o robô pode cair ou voltar) */
  useEffect(() => {
    if (some) return;
    const t = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      carregar();
    }, aberto ? 4000 : 30000);
    return () => clearInterval(t);
  }, [carregar, aberto, some]);

  useEffect(() => { if (confirmando) refConfirmar.current?.focus(); }, [confirmando]);

  if (!sit) return null;

  const robo = leituraDoRobo(sit.robo);
  const aMao = mandadasAMao(linhas, envios);
  const naJanela = dentroDaJanelaDoRobo(hojeISO(), d);
  const podePedir = robo.podePedir && naJanela && !aberto;

  const pedir = async () => {
    setOcupado(true);
    try {
      const r = await roboPedir(equipeId, d);
      if (r.ok) aviso('Pedido feito. O robô pega em até um minuto.');
      else aviso(erroDoPedido(r.erro));
    } catch {
      aviso(erroDoPedido(null));
    } finally {
      setOcupado(false);
      setConfirmando(false);
      await carregar();
    }
  };

  return (
    <section className="es-mg-robo" aria-label="Mandar pelo robô do WhatsApp da igreja">
      <div className="es-mg-robo-cab">
        <b>Pelo robô</b>
        <Pilula tom={TOM_DO_ROBO[robo.tom]}>{robo.titulo}</Pilula>
      </div>
      <p className="es-mg-robo-txt">
        {robo.podePedir && !naJanela
          ? `O robô manda a escala a partir de ${JANELA_DO_ROBO_DIAS} dias antes do culto.`
          : robo.detalhe}
      </p>

      {podePedir && !confirmando && (
        <div className="es-mg-robo-acoes">
          <button type="button" className="es-btn es-peq es-zap" onClick={() => setConfirmando(true)}>
            <IcEnviar />Mandar agora pelo robô
          </button>
        </div>
      )}
      {podePedir && confirmando && (
        <div className="es-mg-robo-conf" role="group" aria-label="Confirmar o envio pelo robô">
          <p>
            Manda a escala deste dia em todos os grupos do WhatsApp do ministério, pelo número da
            igreja, uma mensagem a cada 15 a 40 segundos. Grupo em que o robô já mandou esta escala
            não recebe de novo.
          </p>
          {!!aMao.length && (
            <p className="es-mg-robo-amao">
              Neste aparelho você já mandou à mão: {aMao.join(', ')}. O robô não sabe disso e manda
              de novo {aMao.length === 1 ? 'nesse grupo' : 'nesses grupos'}.
            </p>
          )}
          <div className="es-mg-robo-acoes">
            <button type="button" ref={refConfirmar} className="es-btn es-peq es-pri" disabled={ocupado} onClick={pedir}>
              <IcEnviar />{ocupado ? 'Pedindo…' : 'Mandar agora'}
            </button>
            <button type="button" className="es-btn es-txt es-peq" disabled={ocupado} onClick={() => setConfirmando(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="es-mg-robo-ped" aria-live="polite">
        {ultimo && (
          <>
            <div className="es-mg-robo-ped-cab">
              <Pilula tom={TOM_DO_PEDIDO[ultimo.tom]}>{ultimo.titulo}</Pilula>
              <small>{ultimo.detalhe}</small>
            </div>
            {!!ultimo.grupos.length && (
              <ul className="es-mg-robo-grupos">
                {ultimo.grupos.map(g => (
                  <li key={g.nome}>
                    <span>{g.nome}</span>
                    <Pilula tom={TOM_DO_PEDIDO[g.tom]}>{g.texto}</Pilula>
                  </li>
                ))}
              </ul>
            )}
            {!!ultimo.avisos.length && (
              <ul className="es-mg-robo-avisos">
                {ultimo.avisos.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            )}
          </>
        )}
      </div>

      {robo.podePedir && <p className="es-mg-robo-ou">Ou mande você mesmo, grupo por grupo:</p>}
    </section>
  );
}
