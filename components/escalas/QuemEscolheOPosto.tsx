'use client';
import { useEffect, useRef, useState } from 'react';
import type { Estado } from '@/lib/engine';
import { funcoesAtivas, postoFechado, nivelNoSorteio } from '@/lib/engine';
import { IcCheck } from '@/components/Icones';
import { cont } from '@/lib/plural';

/* =============================================================================
   QUEM ESCOLHE O POSTO, NOS AJUSTES — 13/10/2026

   O pedido do Connect, pelo Arthur: "Hoje cada voluntário escolhe e marca no
   sistema o local onde quer servir, e isso tem nos deixado sem flexibilidade
   para montar a escala, pois alguns setores ficam sem voluntário ou
   entendemos que tal posição necessita de outra pessoa, e não a que se
   inscreveu."

   Dois jeitos, um por ministério (`config.distribuir`):
     · cada um marca o seu: a pessoa só entra nos postos que marcou (o de
       sempre, e o padrão);
     · a liderança distribui: o que a pessoa marcou vira preferência, o
       sorteio completa o posto vazio com quem estiver livre e a lista do
       posto na Escala mostra o time inteiro. A regra está em `nivelNoSorteio`
       (lib/engine.ts).

   E, no segundo, os postos que o sorteio não decide (`config.postosFechados`,
   pelo id da função): só entra quem a liderança marcou. Ao ligar pela
   primeira vez já vêm marcados os postos de quem escreve o relatório do dia
   (LÍDER 1 e LÍDER 2 no Connect): sortear o líder do culto entre quem estiver
   livre é exatamente o que a liderança não quer. Ela desmarca se quiser.

   Grava pela mesma `gravar()` do resto dos Ajustes. A tela mostra o que o
   líder pediu enquanto grava; se a gravação falha, volta ao que está salvo
   (a `gravar` já avisa o porquê).
   ============================================================================= */

type Props = {
  S: Estado;
  gravar: (mudancas: Record<string, any>) => Promise<boolean>;
};

export default function QuemEscolheOPosto({ S, gravar }: Props) {
  const funcoes = funcoesAtivas(S);
  const salvoDistribui = !!S.config.distribuir;
  const salvoFechados = Array.isArray(S.config.postosFechados) ? S.config.postosFechados : null;

  /* o que a tela mostra: o salvo, ou o pedido que ainda está gravando */
  const [distribui, setDistribui] = useState(salvoDistribui);
  const [fechados, setFechados] = useState<string[] | null>(salvoFechados);
  const [gravando, setGravando] = useState(false);
  const noAr = useRef(0);
  useEffect(() => {
    if (noAr.current) return;           // não atropela o pedido que está gravando
    setDistribui(salvoDistribui);
    setFechados(salvoFechados);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salvoDistribui, JSON.stringify(salvoFechados)]);

  async function mandar(mudancas: { distribuir?: boolean; postosFechados?: string[] }) {
    noAr.current++;
    setGravando(true);
    if ('distribuir' in mudancas) setDistribui(!!mudancas.distribuir);
    if (mudancas.postosFechados) setFechados(mudancas.postosFechados);
    let ok = false;
    try { ok = await gravar(mudancas); } finally {
      noAr.current--;
      if (!noAr.current) setGravando(false);
    }
    if (!ok && !noAr.current) { setDistribui(salvoDistribui); setFechados(salvoFechados); }
  }

  /* a chave de cada posto é o id; o nome só para a linha antiga sem id */
  const chave = (f: { id?: string; nome: string }) => f.id || f.nome;
  /* ligado pela primeira vez: os postos de quem escreve o relatório do dia */
  const padrao = () => funcoes.filter(f => f.relata).map(chave);
  const lista = fechados ?? [];
  const fechado = (f: { id?: string; nome: string }) => lista.includes(chave(f)) || lista.includes(f.nome);

  function ligar(sim: boolean) {
    if (sim === distribui || gravando) return;
    if (sim && fechados === null) void mandar({ distribuir: true, postosFechados: padrao() });
    else void mandar({ distribuir: sim });
  }
  function alternar(f: { id?: string; nome: string }) {
    if (gravando) return;
    const k = chave(f);
    const sem = lista.filter(x => x !== k && x !== f.nome);
    void mandar({ postosFechados: fechado(f) ? sem : [...sem, k] });
  }

  /* posto fechado sem ninguém marcado: o sorteio vai deixar vazio sempre.
     A conta é a do motor, com o que está na tela (inclusive o que grava) */
  const comoFica = { ...S, config: { ...S.config, distribuir: true, postosFechados: lista } };
  const ativos = S.voluntarios.filter(v => v.ativo);
  const vazios = funcoes.filter(f => fechado(f) && postoFechado(comoFica, f.nome)
    && !ativos.some(v => ['titular', 'reserva'].includes(nivelNoSorteio(comoFica, v, f.nome) as string)));
  const nFechados = funcoes.filter(fechado).length;

  return (
    <div className="es-aj-pilha">
      <div className="es-seg" role="group" aria-label="Quem escolhe o posto">
        <button type="button" aria-pressed={!distribui} disabled={!funcoes.length} onClick={() => ligar(false)}>
          Cada um marca o seu
        </button>
        <button type="button" aria-pressed={distribui} disabled={!funcoes.length} onClick={() => ligar(true)}>
          A liderança distribui
        </button>
      </div>

      {!distribui ? (
        <p className="es-prosa">
          Cada pessoa entra só nos postos que marcou no cadastro. Posto que ninguém marcou fica vazio
          no sorteio, e a lista do posto na Escala só mostra quem marcou.
        </p>
      ) : (
        <>
          <p className="es-prosa">
            O que cada pessoa marcou vira <b>preferência</b>. O sorteio põe primeiro quem marcou o posto
            e completa o que sobrar com quem estiver livre no time. Na Escala, a lista de cada posto tem o
            time inteiro: quem marcou em cima, o resto embaixo.
          </p>
          <p className="es-prosa">
            Continua valendo para todo mundo: o sexo do posto, o “não posso”, o máximo por mês e ninguém
            em dois postos ao mesmo tempo.
          </p>

          <div className="es-campo">
            <span id="aj-fechados">Postos só para quem a liderança marcou</span>
            <p className="es-gz-rot">
              Nesses o sorteio só põe quem você marcou na aba Time ou aprovou na conferência. Quem marcou
              sozinho no cadastro não entra, e o posto que ficar vazio espera você escolher. Na Escala, a
              lista continua com o time inteiro.
            </p>
            <div className="es-gz-fns" role="group" aria-labelledby="aj-fechados">
              {funcoes.map(f => {
                const on = fechado(f);
                return (
                  <button type="button" key={chave(f)} className="es-gz-fn" aria-pressed={on}
                    disabled={gravando} onClick={() => alternar(f)}>
                    {on && <IcCheck />}{f.nome}
                  </button>
                );
              })}
            </div>
            <p className={vazios.length ? 'es-gz-rot es-gz-falta' : 'es-gz-rot'} role="status">
              {vazios.length
                ? `${vazios.map(f => f.nome).join(', ')}: ninguém marcado pela liderança ainda. `
                  + `O sorteio vai deixar ${vazios.length === 1 ? 'esse posto vazio' : 'esses postos vazios'} até você marcar alguém na aba Time.`
                : nFechados
                  ? `${cont(nFechados, 'posto só', 'postos só')} para quem a liderança marcou.`
                  : 'Nenhum: o sorteio pode completar qualquer posto.'}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
