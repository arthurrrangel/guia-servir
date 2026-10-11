'use client';
import { cont } from '@/lib/plural';
import Shell, { useApp } from '@/components/Shell';
import Link from 'next/link';
import { useState } from 'react';
import { definirHabilidade } from '@/lib/db';
import { Cab, Secao, Aviso, Dobra, Fio } from '@/components/escalas/Pecas';
import { IcSeta } from '@/components/Icones';
import { aviseHumano } from '@/lib/erros';
import { Nivel, declaracoesSuspeitas, filaDeConferencia } from '@/lib/engine';

/* =============================================================================
   /time/conferir — A CAIXA DE ENTRADA DO NÍVEL

   POR QUE ISTO SAIU DO /TIME — arquitetura de informação, 29/08/2026

   O /time carregava 1.509 elementos. As outras telas do líder carregam 277
   (/painel), 334 (/ajustes) e 574 (/escala): era três a cinco vezes a mais
   pesada do produto, e a diferença toda estava aqui.

   A causa não era tamanho, era mistura. A página se chama TIME e o nome promete
   uma coisa permanente — quem são as pessoas da área. Mas quem ocupava o topo
   dela era uma FILA, que existe só enquanto `pendentes > 0` e some quando o
   líder termina. Mesma URL, dois produtos: no primeiro mês uma fila de trabalho
   de seis telas, no terceiro um cadastro. A pergunta "quantas pessoas eu tenho"
   passava por um mutirão antes de ser respondida.

   O ARGUMENTO QUE DECIDIU, e ele é do próprio produto: a fila não é transitória.
   O funil de /servir despeja gente nova toda semana, e cada pessoa nova declara
   o próprio nível. É uma caixa de entrada recorrente — exatamente a mesma
   espécie de coisa que as CANDIDATURAS, que já têm página própria
   (/painel/candidaturas, "Entradas" na navegação). Duas caixas de entrada
   irmãs, geradas pelo mesmo cadastro, e só uma tinha endereço. Isto corrige a
   incoerência em vez de criar uma regra nova.

   E O RISCO DE ESCONDER, que é real: nível não conferido não é cosmético — um
   "faz sozinho" que ninguém confirmou vale como "ajuda quando falta", e o
   sorteio não deixa a área de pé só nessa pessoa. Fila esquecida é escala pior.
   Por isso a convocação continua em DOIS lugares que o líder abre sozinho: o
   alto do /time (a ação cheia e o número na faixa) e a pendência no /painel.
   Mudou onde o trabalho é feito, não se ele é lembrado.

   30/09/2026: na língua do Financeiro e do Demandas. Cada área é uma dobra
   com a conta de pessoas, e cada pessoa uma linha da fila com os quatro
   níveis como botões: o que ela declarou vem em contorno, os outros em
   texto.
   ============================================================================= */

export default function Pagina() { return <Shell><Conferir /></Shell>; }

const MINI: Record<string, string> = { titular: 'sozinho', reserva: 'ajuda', treino: 'aprende' };
const OPCOES: { nivel: Nivel | null; rotulo: string }[] = [
  { nivel: 'titular', rotulo: 'Sozinho' },
  { nivel: 'reserva', rotulo: 'Ajuda' },
  { nivel: 'treino', rotulo: 'Aprende' },
  { nivel: null, rotulo: 'Não faz' },
];

function Conferir() {
  const { S, recarregar, aviso } = useApp();
  const [chipSalvando, setChipSalvando] = useState('');
  const mapa = new Map(S.funcoes.map(f => [f.nome, f.id!]));

  const suspeitas = declaracoesSuspeitas(S);
  const fila = filaDeConferencia(S);
  const pendentes = fila.reduce((a, x) => a + x.pendentes.length, 0);

  async function conferirNivel(vid: string, funcao: string, nivel: Nivel | null) {
    if (chipSalvando) return;
    setChipSalvando(vid + '|' + funcao);
    try { await definirHabilidade(vid, mapa.get(funcao)!, nivel); await recarregar(); }
    catch (e) { aviso(aviseHumano(e, 'salvar')); await recarregar(); }
    setChipSalvando('');
  }

  return (
    <>
      {/* enquanto grava, os botões ficam desligados; o fio diz "estou fazendo" */}
      {!!chipSalvando && <Fio />}
      <Cab
        rot="Time"
        titulo={pendentes ? `${cont(pendentes, 'nível', 'níveis')} para conferir` : 'Tudo conferido'}
        meta={pendentes
          ? 'Estas pessoas se cadastraram sozinhas e escolheram o próprio nível. Vá área por área, é rápido.'
          : 'Quando alguém novo se cadastrar, aparece aqui.'}
        acoes={<Link className="es-btn" href="/time">Ver o time</Link>}
      />

      {!!suspeitas.length && (
        <div className="es-secao">
          <Dobra titulo={cont(suspeitas.length, 'ponto de atenção', 'pontos de atenção')}>
            <div className="es-tm-avisos">
              {suspeitas.map((sp, i) => (
                <Aviso key={i} tom={sp.motivo === 'pilar_unico' ? 'bad' : 'warn'}>{sp.texto}</Aviso>
              ))}
            </div>
          </Dobra>
        </div>
      )}

      {pendentes === 0 && !suspeitas.length && (
        <div className="es-secao">
          <Aviso tom="ok">
            Todo mundo do time está com o nível conferido. O sorteio pode contar com quem
            declarou <b>faz sozinho</b> para segurar uma área.
          </Aviso>
        </div>
      )}

      {/* A REGRA INTEIRA, UMA VEZ SÓ, no alto da lista. Ela não se repete nas 32
          linhas abaixo: repetir "vale como ajuda até você conferir" em cada
          linha não informa, só faz a lista parecer o dobro do tamanho.

          UMA ÁREA ABERTA POR VEZ. Nove blocos abertos ao mesmo tempo são 32
          linhas iguais para rolar; o texto do alto diz "vá área por área" e é
          isso que um bloco por vez permite. A contagem vai no cabeçalho para
          ninguém precisar abrir para saber se tem alguém ali dentro. */}
      {pendentes > 0 && (
        <Secao titulo="Área por área"
          sub={<>Enquanto ninguém confere, um <b>faz sozinho</b> declarado <b>vale como ajuda quando
            falta</b>: a pessoa entra na escala normal, mas o sorteio não deixa a área de pé só nela.</>}>
          <div className="es-tm-areas">
            {fila.map((bl, i) => (
              <Dobra key={bl.funcao} titulo={bl.funcao} nota={cont(bl.pendentes.length, 'pessoa', 'pessoas')} aberta={i === 0}>
                <div className="es-fila">
                  {bl.pendentes.map(p => (
                    <div className="es-item es-tm-conf" key={p.id}>
                      <span className="es-c-tit">
                        <b>{p.nome.split(' ').slice(0, 2).join(' ')}</b>
                        <small>
                          disse <b>{MINI[p.declarou]}</b>
                          {p.declarou !== p.efetivo && <> · vale <b>{MINI[p.efetivo]}</b></>}
                        </small>
                      </span>
                      <span className="es-c-acao" role="group" aria-label={`Nível de ${p.nome} em ${bl.funcao}`}>
                        {OPCOES.map(o => (
                          <button key={o.rotulo} type="button"
                            className={o.nivel === p.declarou ? 'es-btn es-peq' : 'es-btn es-txt es-peq'}
                            disabled={!!chipSalvando}
                            onClick={() => conferirNivel(p.id, bl.funcao, o.nivel)}>
                            {o.rotulo}
                          </button>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              </Dobra>
            ))}
          </div>
        </Secao>
      )}

      <div className="es-secao">
        <Link className="es-btn es-txt" href="/time"><IcSeta dir="e" />Voltar ao time</Link>
      </div>
    </>
  );
}
