'use client';
/* OS NÚMEROS — os quatorze indicadores da seção 9 do documento.

   A ordem não é a do PDF: é a de quem vai olhar. Primeiro o que exige ação
   hoje (atrasadas, paradas, esperando aprovação), depois o volume, e só então
   as médias. Indicador que ninguém consegue transformar em decisão é enfeite.

   Nada de gráfico de pizza. Uma barra por linha, comparável, e o número
   escrito ao lado — é o que se lê no celular sem apertar os olhos. */

import { useCallback, useEffect, useRef, useState } from 'react';
import Casca, { useEu } from '@/components/demandas/Casca';
import Link from 'next/link';
import { Aviso, Esqueleto } from '@/components/demandas/Ui';
import { numeros } from '@/lib/demandas/api';
import { HOJE, horas, recadoDoErro, somaDias } from '@/lib/demandas/regras';
import type { Numeros } from '@/lib/demandas/tipos';

export default function Pagina() {
  return <Casca><Painel /></Casca>;
}

type Janela = '30' | '90' | '365';

function Painel() {
  /* A GUARDA DE PAPEL QUE ESTA TELA NAO TINHA — 22/09/2026.

     A aba "Números" só aparece para quem não é `solicitante` (ver `ABAS` em
     `Casca.tsx`), mas esconder a aba não protege a rota: bastava digitar
     `/demandas/numeros`. O servidor recusa com `SEM_PERMISSAO`, e a pessoa
     lia um erro vermelho em vez de uma frase. `/demandas/ajustes` já tinha a
     guarda; esta não recebeu.

     Continua sendo o servidor quem decide — isto aqui é só a frase educada
     para quem chegou onde não devia. */
  const { eu } = useEu();
  const [n, setN] = useState<Numeros | null>(null);
  const [erro, setErro] = useState('');
  const [janela, setJanela] = useState<Janela>('90');

  /* A RESPOSTA ATRASADA SOBRESCREVIA A RECENTE, AQUI TAMBÉM.

     O mesmo buraco de `/demandas`: `const r = await numeros(…); setN(r.numeros)`
     sem conferir se ainda é o período atual. Tocar "30 dias" e, antes de
     chegar, "1 ano" mostrava os números de 1 ano e, quando a consulta de 30
     dias enfim voltasse, trocava tudo por ela, com o seletor marcando "1 ano"
     e o rodapé imprimindo outra janela. Aqui é pior que na lista: o número
     errado com o rótulo certo é uma decisão tomada em cima de dado falso.

     O contador é o mesmo remédio: cada chamada carimba o seu pedido e só
     escreve se ainda for a última. */
  const pedido = useRef(0);

  const buscar = useCallback(async () => {
    const meu = ++pedido.current;
    setN(null);
    /* `HOJE()` E NAO `toISOString()` — 22/09/2026.

       `toISOString()` e SEMPRE UTC. Das 21h do Rio a meia-noite esta tela
       PEDIA e IMPRIMIA um periodo que termina amanha, enquanto o servidor
       recorta pelo dia do Rio. O arquivo ja importava `somaDias` e `horas`
       daqui; faltava `HOJE`, que existe para isto desde 20/09. */
    const hoje = HOJE();
    const r = await numeros(somaDias(hoje, -Number(janela)), hoje);
    if (meu !== pedido.current) return;   // chegou atrasada: já existe pedido mais novo
    if (!r.ok) { setErro(recadoDoErro(r, 'carregar os números')); return; }
    setErro(''); setN(r.numeros);
  }, [janela]);

  useEffect(() => { buscar(); }, [buscar]);

  if (eu && eu.papel === 'solicitante') {
    return (
      <>
        <div className="dm-rot">{'>'} atendimento · números</div>
        <Aviso tom="info">
          Esta tela mostra os números de todos os setores, e por isso é de quem coordena.
          As suas demandas estão em <b>Demandas</b>.
        </Aviso>
      </>
    );
  }

  /* O ERRO NÃO PODE ENGOLIR O ÚNICO CONTROLE DA TELA — 20/09/2026.

     Era `if (erro) return <Aviso/>`, antes do cabeçalho e do seletor de
     período. Numa falha passageira a página virava uma tarja vermelha
     sozinha: sem "tentar de novo" e sem como mudar o período, que é
     justamente o gesto que refaria a consulta. Recarregar era o único
     caminho possível, e nada na tela dizia isso. Agora o aviso convive com
     o seletor, como a lista de /demandas já fazia. */

  return (
    <>
      <Link className="dm-volta" href="/demandas/atendimento">Atender</Link>
      <div className="dm-cab">
        <div>
          <div className="dm-rot">{'>'} atendimento · números</div>
          <h1 style={{ marginTop: 4 }}>Como a operação está andando</h1>
        </div>
        <div className="dm-cab-acoes">
          <div className="dm-seg" role="group" aria-label="Período">
            {([['30', '30 dias'], ['90', '90 dias'], ['365', '1 ano']] as const).map(([v, r]) => (
              <button key={v} type="button" aria-pressed={janela === v} onClick={() => setJanela(v)}>{r}</button>
            ))}
          </div>
        </div>
      </div>

      {erro ? (
        <div style={{ marginBottom: 'var(--dm-e3)' }}>
          <Aviso tom="bad">{erro}</Aviso>
          <button className="dm-btn" onClick={buscar} style={{ marginTop: 'var(--dm-e2)' }}>
            Tentar de novo
          </button>
        </div>
      ) : null}


      {/* `!n` SOZINHO DEIXAVA UM ESQUELETO ANIMADO PARA SEMPRE.
          Quando a carga falha, `n` fica nulo e a tela mostrava ao mesmo tempo
          o erro, o "Tentar de novo" E uma forma piscando que nunca ia virar
          conteúdo. Piscar é promessa de que algo está a caminho. */}
      {!n && !erro ? <Esqueleto oQue="Carregando os números" /> : !n ? null : (
        <>
          {/* -------------------------------------------- o que pede ação hoje */}
          <h2 style={{ margin: '0 0 var(--dm-e2)' }}>Precisa de atenção</h2>
          <div className="dm-contas" style={{ marginBottom: 'var(--dm-e4)' }}>
            <Num v={n.atrasadas} r="passaram do prazo" alarme={n.atrasadas > 0} />
            <Num v={n.paradas} r="sem movimento há 7 dias" />
            <Num v={n.reabertas} r="foram reabertas" />
            <Num v={n.abertas} r="em aberto agora" />
          </div>

          <div className="dm-dupla" style={{ marginBottom: 'var(--dm-e4)' }}>
            <div>
              <h2 style={{ margin: '0 0 var(--dm-e2)' }}>Volume no período</h2>
              <div className="dm-contas dm-duas-colunas">
                <Num v={n.total} r="demandas abertas" />
                <Num v={n.concluidas} r="concluídas" />
                <Num v={n.canceladas} r="canceladas" />
                {/* O NÚMERO DIZ A BASE: a conta é só sobre quem tinha prazo,
                    e o rótulo diz sobre quantas. Sem base, "0%" em mudo, e
                    não um travessão. */}
                <Num v={n.no_prazo_pct === null ? '0%' : `${n.no_prazo_pct}%`}
                  r={n.no_prazo_base ? `dentro do prazo (de ${n.no_prazo_base} com prazo)` : 'concluídas dentro do prazo'} />
              </div>
            </div>
            <div>
              <h2 style={{ margin: '0 0 var(--dm-e2)' }}>Tempo</h2>
              <div className="dm-contas dm-duas-colunas">
                <Num v={horas(n.horas_ate_resposta)} r="até a primeira resposta" />
                <Num v={horas(n.horas_ate_concluir)} r="até concluir" />
              </div>
              <p className="dm-peq dm-mudo" style={{ margin: 'var(--dm-e1) 0 0' }}>
                Primeira resposta: a primeira vez que outra pessoa mexeu na demanda.
              </p>
            </div>
          </div>

          <div className="dm-dupla">
            <div>
              <h2 style={{ margin: '0 0 var(--dm-e2)' }}>Por setor</h2>
              <div className="dm-card">
                {/* a tabela de leitura rola de lado no celular, com a
                    primeira coluna fixa e um sinal de que rola */}
                <div className="dm-rola">
                  <table className="dm-tab">
                    <thead><tr>
                      <th className="dm-primeira">Setor</th><th className="dm-n">Pediu</th><th className="dm-n">Atendeu</th>
                      <th className="dm-n">Em aberto</th><th className="dm-n">Atrasadas</th>
                    </tr></thead>
                    <tbody>
                      {porVolume(n.por_setor).map(s => (
                        <tr key={s.nome}>
                          <td className="dm-primeira">{s.nome}</td>
                          <td className="dm-n">{s.pediu}</td>
                          <td className="dm-n">{s.atendeu}</td>
                          <td className="dm-n">{s.abertas}</td>
                          <td className="dm-n" style={{ color: s.atrasadas ? 'var(--dm-bad)' : 'var(--dm-mudo)', fontWeight: s.atrasadas ? 600 : undefined }}>
                            {s.atrasadas}
                          </td>
                        </tr>
                      ))}
                      {!n.por_setor.length ? <tr><td colSpan={5} className="dm-mudo">Nada no período.</td></tr> : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div>
              <h2 style={{ margin: '0 0 var(--dm-e2)' }}>O que mais se pede</h2>
              <div className="dm-card">
                <Barras itens={n.por_categoria.slice(0, TETO_BARRAS).map(c => ({ rot: c.nome, n: c.n, sub: c.grupo }))} />
                {!n.por_categoria.length ? <p className="dm-mudo dm-peq" style={{ margin: 0 }}>Nada no período.</p> : null}
                <SobraDeCategorias cs={n.por_categoria} />
              </div>
              <h2 style={{ margin: 'var(--dm-e4) 0 var(--dm-e2)' }}>Por que atrasa</h2>
              <div className="dm-card">
                <Barras itens={n.motivos_de_atraso.map(m => ({ rot: m.motivo, n: m.n }))} />
                {!n.motivos_de_atraso.length
                  ? <p className="dm-mudo dm-peq" style={{ margin: 0 }}>Nenhum atraso no período.</p> : null}
              </div>
            </div>
          </div>

          <h2 style={{ margin: 'var(--dm-e4) 0 var(--dm-e2)' }}>Mês a mês</h2>
          <div className="dm-card">
            {n.por_mes.length > 1 ? (
              <Barras itens={n.por_mes.map(m => ({ rot: mesPorExtenso(m.mes), n: m.n }))} />
            ) : n.por_mes.length === 1 ? (
              <p className="dm-peq" style={{ margin: 0 }}>
                Todo o período cabe em <b>{mesPorExtenso(n.por_mes[0].mes)}</b>: {n.por_mes[0].n}{' '}
                {n.por_mes[0].n === 1 ? 'demanda' : 'demandas'}.
                {/* o único caminho para ver um gráfico aqui é o seletor lá de
                    cima, e nada na tela dizia isso */}
                <span className="dm-mudo"> Para comparar meses, escolha 90 dias ou 1 ano.</span>
              </p>
            ) : (
              <p className="dm-mudo dm-peq" style={{ margin: 0 }}>Nada no período.</p>
            )}
          </div>

          <p className="dm-peq dm-mudo" style={{ marginTop: 'var(--dm-e4)' }}>
            De {n.de.split('-').reverse().join('/')} a {n.ate.split('-').reverse().join('/')},
            nas demandas que você vê.
          </p>
        </>
      )}
    </>
  );
}

/* A TABELA POR SETOR SAÍA EM ORDEM ALFABÉTICA.

   O documento pede, entre os indicadores, "setores com maior volume de
   solicitações". A tabela tinha os números certos e a ordem errada: `dem_numeros`
   agrega `por_setor` e a tela imprimia na ordem em que veio, alfabética. Com
   quinze setores, achar quem mais pede virava varrer a coluna "Pediu" com o
   dedo e guardar o maior de cabeça, que é justamente a conta que o indicador
   existia para não precisar fazer.

   Ordena por "pediu", que é a palavra do documento ("solicitações"), e não
   pela soma com "atendeu": setor que atende muito e pede pouco é outro fato,
   e ele está na coluna ao lado. Empate cai em "atendeu" e depois no nome, para
   a ordem não dançar entre duas cargas dos mesmos números.

   `slice()` antes do `sort` porque `sort` ordena no lugar, e `n.por_setor` é o
   objeto que veio do servidor e é lido de novo a cada render. Nada aqui toca
   no banco: é a mesma resposta, lida na ordem que responde a pergunta. */
type LinhaDeSetor = { nome: string; pediu: number; atendeu: number; abertas: number; atrasadas: number };
function porVolume(setores: LinhaDeSetor[]): LinhaDeSetor[] {
  return setores.slice().sort((a, b) =>
    b.pediu - a.pediu || b.atendeu - a.atendeu || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/* O CORTE DE 10 DESCARTAVA AS OUTRAS 34 EM SILÊNCIO, 22/09/2026.

   O documento pede DOIS indicadores com a palavra categoria, e eles não são
   o mesmo: "Demandas por categoria" e "Categorias com maior recorrência". O
   `.slice(0, 10)` atende o segundo com folga, porque dez é mais do que se
   olha de uma vez, e deixa o primeiro sem resposta nenhuma: medido, 44
   categorias com demanda no período, 10 barras na tela, 34 jogadas fora sem
   uma palavra. Quem lê conta as barras e conclui que a igreja pede dez tipos
   de coisa.

   O mesmo defeito, e o mesmo conserto, que `/demandas` já pagou na migração
   57: teto sem aviso é pior que o problema que ele resolve, porque a pessoa
   olha uma lista incompleta achando que é a lista. Lá a frase é "Mostrando
   as N mais urgentes. Outras N não couberam"; aqui é a mesma frase, com a
   mesma classe `.dm-corte` e o mesmo `role="status"`.

   A SOMA VAI JUNTO, E É ELA QUE RESPONDE O INDICADOR. "Outras 34 não
   couberam" diz quantas fatias faltam, e não quanto elas pesam: 34
   categorias de uma demanda cada é cauda longa, e 34 somando 300 é a maior
   parte do volume escondida embaixo das dez barras. O número que muda a
   leitura do gráfico é o segundo.

   E a frase PARA aí, sem oferecer gesto. Em `/demandas` o corte termina em
   "use os filtros acima", porque lá existe filtro que faz a demanda aparecer.
   Aqui não existe: nem o seletor de período nem nada nesta tela mostra a
   décima primeira categoria. Apontar um gesto que não existe é o defeito que
   a dica do comentário interno já custou nesta casa. */
const TETO_BARRAS = 10;

function SobraDeCategorias({ cs }: { cs: Numeros['por_categoria'] }) {
  const fora = cs.slice(TETO_BARRAS);
  if (!fora.length) return null;
  const soma = fora.reduce((s, c) => s + c.n, 0);
  return (
    <p className="dm-corte" role="status">
      Mostrando as {TETO_BARRAS} mais pedidas. Outras {fora.length} não couberam,
      e somam {soma} {soma === 1 ? 'demanda' : 'demandas'}.
    </p>
  );
}

/* o tile de LEITURA: fio, sem canto; alarme é o número em vermelho, e não um
   fundo preto, que em Atender significa "vista escolhida" */
function Num({ v, r, alarme }: { v: number | string; r: string; alarme?: boolean }) {
  const zero = v === 0 || v === '0' || v === '0%';
  return (
    <div className={`dm-conta dm-leitura dm-kpi ${alarme ? 'dm-bad' : zero ? 'dm-zero' : ''}`}>
      <b>{v}</b>
      <small>{r}</small>
    </div>
  );
}

function Barras({ itens }: { itens: { rot: string; n: number; sub?: string }[] }) {
  const max = Math.max(1, ...itens.map(i => i.n));
  return (
    <div className="dm-grade">
      {itens.map((i, k) => (
        <div key={k}>
          <div className="dm-entre" style={{ gap: 8 }}>
            <span className="dm-peq dm-cresce dm-corta">
              {i.rot}{i.sub ? <span className="dm-mudo"> · {i.sub}</span> : null}
            </span>
            <b className="dm-peq">{i.n}</b>
          </div>
          <div className="dm-barra"><i style={{ width: `${Math.round((i.n / max) * 100)}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function mesPorExtenso(m: string): string {
  const [a, mm] = m.split('-');
  return `${MESES[Number(mm) - 1]}/${a.slice(2)}`;
}
