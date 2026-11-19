'use client';
import { useEffect, useRef, useState } from 'react';
import type { Estado, FormatoDoSabado, SabadoPequeno as ConfigDoSabado } from '@/lib/engine';
import {
  diaTemGente, fmtDia, funcoesAtivas, hojeISO, juntarComE, novoSabadoPequeno, postosDoSabadoPequeno,
  rotuloDoSabadoPequeno, sabadoPequenoDe, tipoDoDia,
} from '@/lib/engine';
import { confirmar } from '@/lib/confirmar';
import { IcCheck } from '@/components/Icones';

/* =============================================================================
   O SÁBADO PEQUENO, NOS AJUSTES — 19/11/2026

   O pedido do Arthur: no Follow, "opcao de liberar compelto e opcao de follow
   somente com foto e filmagem", "pra qdo for culto grande ter escala completa
   mas qdo for culto pequeno usar outra escala". A regra mora no motor
   (lib/engine.ts, "O SÁBADO PEQUENO"); aqui o ministério diz quais postos
   fazem a escala pequena e como nasce o sábado que ninguém escolheu. A
   escolha de cada sábado é no cartão do dia, na Escala.

   Ligar, trocar o padrão ou mexer na lista não muda sábado que já tem gente:
   antes de gravar, cada um deles guarda o formato que tem agora
   (`novoSabadoPequeno`). Grava pela mesma `gravar()` do resto dos Ajustes; a
   tela mostra o pedido enquanto grava e, se a gravação falha, volta ao salvo
   (a `gravar` já avisa o porquê).
   ============================================================================= */

type Props = { S: Estado; gravar: (mudancas: Record<string, any>) => Promise<boolean> };
type F = { id?: string; nome: string; tipos?: string[] };
const chave = (f: F) => f.id || f.nome;
const noConjunto = (l: string[], f: F) => l.includes(chave(f)) || l.includes(f.nome);
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** O ministério tem posto no Follow (sem isso, a seção não aparece nos Ajustes). */
export const temPostoNoFollow = (S: Estado) =>
  funcoesAtivas(S).some(f => !f.tipos?.length || f.tipos.includes('follow'));

export default function SabadoPequeno({ S, gravar }: Props) {
  const doFollow = funcoesAtivas(S).filter(f => !f.tipos?.length || f.tipos.includes('follow'));
  const salvo = sabadoPequenoDe(S);
  /* ao ligar pela primeira vez já vêm marcados FOTO e FILMAGEM (o pedido do
     Arthur), quando o ministério tem esses postos; a liderança muda se quiser */
  const sugestao = () => doFollow.filter(f => /^(FOTO|FILMAGEM)\b/i.test(semAcento(f.nome))).map(chave);
  const padraoSalvo: FormatoDoSabado = salvo?.padrao === 'completo' ? 'completo' : 'pequeno';

  /* o que a tela mostra: o salvo, o rascunho de quem ainda não ligou, ou o
     pedido que está gravando */
  const [postos, setPostos] = useState<string[]>(() => (salvo ? salvo.postos : sugestao()));
  const [padrao, setPadrao] = useState<FormatoDoSabado>(padraoSalvo);
  const [gravando, setGravando] = useState(false);
  const noAr = useRef(0);
  const marcaDoSalvo = JSON.stringify(salvo || null);
  useEffect(() => {
    if (noAr.current) return;           // não atropela o pedido que está gravando
    if (salvo) { setPostos(salvo.postos); setPadrao(padraoSalvo); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marcaDoSalvo]);

  const hoje = hojeISO();
  const ligado = !!salvo;
  const rot = rotuloDoSabadoPequeno(S, postos);
  const marcados = doFollow.filter(f => noConjunto(postos, f));

  async function mandar(novo: ConfigDoSabado | null) {
    noAr.current++;
    setGravando(true);
    let ok = false;
    try { ok = await gravar({ sabadoPequeno: novo }); } finally {
      noAr.current--;
      if (!noAr.current) setGravando(false);
    }
    if (!ok && !noAr.current && salvo) { setPostos(salvo.postos); setPadrao(padraoSalvo); }
    return ok;
  }

  function alternar(f: F) {
    if (gravando) return;
    const k = chave(f);
    const sem = postos.filter(x => x !== k && x !== f.nome);
    const nova = noConjunto(postos, f) ? sem : [...sem, k];
    /* ligado, a escala pequena não fica sem posto: para não usar, é desligar */
    if (ligado && !doFollow.some(x => noConjunto(nova, x))) return;
    setPostos(nova);
    if (ligado) void mandar(novoSabadoPequeno(S, { postos: nova }, hoje));
  }
  function escolherPadrao(p: FormatoDoSabado) {
    if (gravando || p === padrao) return;
    setPadrao(p);
    if (ligado) void mandar(novoSabadoPequeno(S, { padrao: p }, hoje));
  }
  async function ligar() {
    if (gravando || !marcados.length) return;
    await mandar(novoSabadoPequeno(S, { postos, padrao }, hoje));
  }
  async function desligar() {
    if (gravando) return;
    /* o sábado pequeno que já tem gente volta para a escala completa, com
       os outros postos vazios: dito antes, com as datas */
    const afetados = Object.keys(S.escalas)
      .filter(d => d >= hoje && tipoDoDia(d) === 'follow' && !!postosDoSabadoPequeno(S, d) && diaTemGente(S, d))
      .sort();
    const datas = juntarComE(afetados.map(fmtDia));
    if (!await confirmar({
      titulo: 'Desligar o sábado pequeno?',
      texto: afetados.length
        ? `Todo sábado volta a ter a escala completa. ${afetados.length === 1 ? 'O sábado' : 'Os sábados'} ${datas} ${afetados.length === 1 ? 'fica' : 'ficam'} com os outros postos vazios.`
        : 'Todo sábado volta a ter a escala completa.',
      acao: 'Desligar',
    })) return;
    await mandar(null);
  }

  /* os sábados que já têm escolha própria, de hoje em diante */
  const dias = salvo?.dias && typeof salvo.dias === 'object' ? salvo.dias : {};
  const comEscolha = Object.keys(dias).filter(d => d >= hoje).sort();
  const completos = comEscolha.filter(d => dias[d] === 'completo');
  const pequenos = comEscolha.filter(d => Array.isArray(dias[d]));

  return (
    <div className="es-aj-pilha es-aj-sabado">
      <p className="es-prosa">
        Culto grande, <b>escala completa</b>: todos os postos do Follow. Culto pequeno, <b>escala
        pequena</b>: só os postos marcados aqui. Em cada sábado você escolhe, no cartão do dia na
        Escala. No sábado pequeno, os grupos que não servem recebem só uma linha: “Neste sábado
        não vamos precisar de …”.
      </p>

      <div className="es-campo">
        <span id="aj-sabado-postos">Postos da escala pequena</span>
        <div className="es-gz-fns" role="group" aria-labelledby="aj-sabado-postos">
          {doFollow.map(f => {
            const on = noConjunto(postos, f);
            const ultimo = ligado && on && marcados.length === 1;
            return (
              <button type="button" key={chave(f)} className="es-gz-fn" aria-pressed={on}
                disabled={gravando || ultimo} onClick={() => alternar(f)}>
                {on && <IcCheck />}{f.nome}
              </button>
            );
          })}
        </div>
      </div>

      <div className="es-campo">
        <span id="aj-sabado-padrao">O sábado novo nasce com</span>
        <div className="es-seg" role="group" aria-labelledby="aj-sabado-padrao">
          <button type="button" aria-pressed={padrao === 'pequeno'} disabled={gravando || !marcados.length}
            onClick={() => escolherPadrao('pequeno')}>
            {rot ? `Só ${rot}` : 'A escala pequena'}
          </button>
          <button type="button" aria-pressed={padrao === 'completo'} disabled={gravando}
            onClick={() => escolherPadrao('completo')}>
            A escala completa
          </button>
        </div>
      </div>

      {!ligado ? (
        <div className="es-linha">
          <button type="button" className="es-btn" disabled={gravando || !marcados.length} onClick={ligar}>
            Ligar o sábado pequeno
          </button>
          <span className="es-peq es-mudo" role="status">
            {marcados.length
              ? 'Desligado: todo sábado tem a escala completa. O sábado que já tem gente continua como está quando ligar.'
              : 'Marque ao menos um posto para ligar.'}
          </span>
        </div>
      ) : (
        <>
          <p className="es-gz-rot" role="status">
            {`Ligado. O sábado novo nasce ${padrao === 'pequeno' ? `só com ${rot}` : 'com a escala completa'}.`}
            {completos.length ? ` Com a escala completa: ${juntarComE(completos.map(fmtDia))}.` : ''}
            {pequenos.length ? ` Só com ${rot}: ${juntarComE(pequenos.map(fmtDia))}.` : ''}
          </p>
          <div className="es-linha">
            <button type="button" className="es-btn es-txt es-peq" disabled={gravando} onClick={desligar}>
              Desligar o sábado pequeno
            </button>
          </div>
        </>
      )}
    </div>
  );
}
