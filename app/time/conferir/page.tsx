'use client';
import Shell, { useApp } from '@/components/Shell';
import Link from 'next/link';
import { useState } from 'react';
import { definirHabilidade } from '@/lib/db';
import { Aviso } from '@/components/Ui';
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
   Por isso a convocação continua em DOIS lugares que o líder abre sozinho: a
   linha no topo do /time e a pendência no /painel. Mudou onde o trabalho é
   feito, não se ele é lembrado.
   ============================================================================= */

export default function Pagina() { return <Shell><Conferir /></Shell>; }

const MINI: Record<string, string> = { titular: 'sozinho', reserva: 'ajuda', treino: 'aprende' };
const OPCOES: { nivel: Nivel | null; rotulo: string }[] = [
  { nivel: 'titular', rotulo: 'sozinho' },
  { nivel: 'reserva', rotulo: 'ajuda' },
  { nivel: 'treino', rotulo: 'aprende' },
  { nivel: null, rotulo: 'não faz' },
];

function Conferir() {
  const { S, recarregar, aviso, equipe } = useApp();
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
    <div className="lid">
      <div className="lid-faixa">
        <div className="lid-faixa-in"><div className="lid-faixa-txt">
          <span className="rot">Conferir nível</span>
          <h1>{equipe?.nome}</h1>
          <p className="lid-faixa-sub">
            {pendentes
              ? 'Estas pessoas se cadastraram sozinhas e escolheram o próprio nível. Vá área por área, é rápido.'
              : 'Nada para conferir agora. Quando alguém novo se cadastrar, aparece aqui.'}
          </p>
          <div className="lid-faixa-acoes">
            <Link className="lid-bt-txt" href="/time">Ver o time</Link>
          </div>
        </div>
        {pendentes > 0 && (
          <div className="lid-placar">
            <b>{pendentes}</b>
            <span>para conferir</span>
          </div>
        )}
        </div>
      </div>

      {/* A REGRA INTEIRA, UMA VEZ SÓ. Ela não se repete nas 32 linhas abaixo:
          repetir "vale como ajuda até você conferir" em cada linha não informa,
          só faz a lista parecer o dobro do tamanho. */}
      {pendentes > 0 && (
        <p className="dim pequeno" style={{ marginTop: 'var(--e5)' }}>
          Enquanto ninguém confere, um <strong>faz sozinho</strong> declarado <strong>vale
          como ajuda quando falta</strong>: a pessoa entra na escala normal, mas o sorteio
          não deixa a área de pé só nela.
        </p>
      )}

      {!!suspeitas.length && (
        <details className="bloco-extra" style={{ margin: '18px 0 4px' }}>
          <summary>
            <span className="pill warn peq"><span className="ponto warn" />{suspeitas.length}</span>
            <span className="cresce">{suspeitas.length === 1 ? 'ponto de atenção' : 'pontos de atenção'}</span>
            <IcSeta className="giro" />
          </summary>
          <div className="bloco-extra-corpo" style={{ paddingTop: 12 }}>
            {suspeitas.map((sp, i) => (
              <Aviso key={i} tom={sp.motivo === 'pilar_unico' ? 'erro' : 'atencao'}>{sp.texto}</Aviso>
            ))}
          </div>
        </details>
      )}

      {pendentes === 0 && !suspeitas.length && (
        <div style={{ marginTop: 'var(--e5)' }}>
          <Aviso tom="bom">
            Todo mundo do time está com o nível conferido. O sorteio pode contar com quem
            declarou <strong>faz sozinho</strong> para segurar uma área.
          </Aviso>
        </div>
      )}

      {/* UMA ÁREA ABERTA POR VEZ. Nove blocos abertos ao mesmo tempo são 32
          linhas iguais para rolar; o texto acima diz "vá área por área" e é
          isso que um bloco por vez permite. A contagem vai no cabeçalho para
          ninguém precisar abrir para saber se tem alguém ali dentro. */}
      {fila.map((bl, i) => (
        <details className="area-conf" key={bl.funcao} open={i === 0}>
          <summary>
            <span className="overline">{bl.funcao}</span>
            <span className="area-conf-n">{bl.pendentes.length}</span>
            <IcSeta className="giro" />
          </summary>
          {bl.pendentes.map(p => (
            <div className="conf-linha" key={p.id}>
              <div className="cresce">
                <div className="forte">{p.nome.split(' ').slice(0, 2).join(' ')}</div>
                <div className="dim pequeno">
                  disse <strong>{MINI[p.declarou]}</strong>
                  {p.declarou !== p.efetivo && <> · vale <strong>{MINI[p.efetivo]}</strong></>}
                </div>
              </div>
              <div className="conf-btns" role="group" aria-label={`Nível de ${p.nome} em ${bl.funcao}`}>
                {OPCOES.map(o => (
                  <button key={o.rotulo}
                    className={`seg ${o.nivel === p.declarou ? 'on' : ''} ${o.nivel === null ? 'nao' : ''}`}
                    disabled={!!chipSalvando}
                    onClick={() => conferirNivel(p.id, bl.funcao, o.nivel)}>
                    {o.rotulo}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </details>
      ))}

      <p className="lid-pe">
        <Link href="/time">‹ Voltar ao time</Link>
      </p>
    </div>
  );
}
