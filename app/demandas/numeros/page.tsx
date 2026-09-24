'use client';
/* OS NÚMEROS — os quatorze indicadores da seção 9 do documento.

   A ordem não é a do PDF: é a de quem vai olhar. Primeiro o que exige ação
   hoje (atrasadas, paradas, reabertas), depois o volume e o tempo, depois o
   mês a mês, e só então os cortes por setor e por categoria. Indicador que
   ninguém consegue transformar em decisão é enfeite.

   Nada de gráfico de pizza. Números numa faixa, colunas para o tempo (o
   eixo que a pessoa lê da esquerda para a direita), barras horizontais para
   o que se compara por nome, e a tabela para o que se compara por coluna. */

import { useCallback, useEffect, useRef, useState } from 'react';
import Casca, { useEu } from '@/components/demandas/Casca';
import { Aviso, Cabecalho, Esqueleto, Kpi, Kpis, Secao, Vazio, useFitaQueRola } from '@/components/demandas/Ui';
import { Icone } from '@/components/demandas/Icone';
import { numeros } from '@/lib/demandas/api';
import { HOJE, horas, recadoDoErro, somaDias, umOuVarios } from '@/lib/demandas/regras';
import type { Numeros } from '@/lib/demandas/tipos';

export default function Pagina() {
  return <Casca><Painel /></Casca>;
}

type Janela = '30' | '90' | '365';

function Painel() {
  /* A GUARDA DE PAPEL QUE ESTA TELA NAO TINHA — 22/09/2026.

     "Números" só aparece para quem atende (ver `Casca.tsx`), mas esconder a
     entrada não protege a rota: bastava digitar `/demandas/numeros`. O
     servidor recusa com `SEM_PERMISSAO`, e a pessoa lia um erro vermelho em
     vez de uma frase. Continua sendo o servidor quem decide — isto aqui é só
     a frase educada para quem chegou onde não devia. */
  const { eu } = useEu();
  const [n, setN] = useState<Numeros | null>(null);
  const [erro, setErro] = useState('');
  const [janela, setJanela] = useState<Janela>('90');

  /* A RESPOSTA ATRASADA SOBRESCREVIA A RECENTE, AQUI TAMBÉM.

     Tocar "30 dias" e, antes de chegar, "1 ano" mostrava os números de 1 ano
     e, quando a consulta de 30 dias enfim voltasse, trocava tudo por ela, com
     o seletor marcando "1 ano". O número errado com o rótulo certo é uma
     decisão tomada em cima de dado falso. Cada chamada carimba o seu pedido e
     só escreve se ainda for a última. */
  const pedido = useRef(0);
  /* a tabela por setor que rola de lado diz que rola (o esmaecimento da
     borda, o mesmo das fitas de abas) */
  const rola = useFitaQueRola<HTMLDivElement>();

  const buscar = useCallback(async () => {
    const meu = ++pedido.current;
    setN(null);
    /* `HOJE()` E NAO `toISOString()` — 22/09/2026: das 21h do Rio a
       meia-noite esta tela pedia um periodo que termina amanha. */
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
        <Cabecalho sobre="Atendimento" titulo="Números" />
        <Aviso tom="info">
          Esta tela mostra os números de todos os setores, e por isso é de quem coordena.
          As suas demandas estão no <b>Início</b>.
        </Aviso>
      </>
    );
  }

  /* O ERRO NÃO PODE ENGOLIR O ÚNICO CONTROLE DA TELA — 20/09/2026: o aviso
     convive com o seletor de período, que é o gesto que refaz a consulta. */
  const periodo = (
    <div className="dm-seg" role="group" aria-label="Período">
      {([['30', '30 dias'], ['90', '90 dias'], ['365', '1 ano']] as const).map(([v, r]) => (
        <button key={v} type="button" aria-pressed={janela === v} onClick={() => setJanela(v)}>{r}</button>
      ))}
    </div>
  );

  const de = n ? n.de.split('-').reverse().join('/') : '';
  const ate = n ? n.ate.split('-').reverse().join('/') : '';
  return (
    <>
      {/* 23/09/2026 · o nome da seção em cima ("Números", o mesmo da lateral)
          e a pergunta que ela responde no título */}
      <Cabecalho volta={{ href: '/demandas/atendimento', rot: 'Atendimento', soCelular: true }} sobre="Números"
        titulo="Como a operação está andando"
        meta={n ? <span>De {de} a {ate}, nas demandas que você vê.</span> : null}
        acoes={periodo} />

      {erro ? (
        <>
          <Aviso tom="bad">{erro}</Aviso>
          <button type="button" className="dm-btn dm-tentar" onClick={buscar}>Tentar de novo</button>
        </>
      ) : null}

      {/* `!n` SOZINHO DEIXAVA UM ESQUELETO ANIMADO PARA SEMPRE: quando a
          carga falha, a forma piscando prometia algo que nunca vinha. */}
      {!n && !erro ? <Esqueleto forma="numeros" oQue="Carregando os números" /> : !n ? null : (
        <>
          {/* ------------------------------------------ o que pede ação hoje */}
          <Secao titulo="Precisa de atenção" sub="O que está parado ou atrasado agora, independente do período.">
            <Kpis>
              {/* sem o ponto de "espera você": aqui o número já é vermelho,
                  e o ponto no Início quer dizer outra coisa */}
              <Kpi rot="Atrasadas" valor={n.atrasadas} tom="bad" sub={umOuVarios(n.atrasadas, 'passou do prazo', 'passaram do prazo')} />
              {/* as mesmas palavras do resumo das listas (a regra é `>= 7`) */}
              <Kpi rot="Paradas" valor={n.paradas} sub="sem movimento há 7 dias ou mais" />
              <Kpi rot="Reabertas" valor={n.reabertas} sub={umOuVarios(n.reabertas, 'voltou depois de concluída', 'voltaram depois de concluídas')} />
              <Kpi rot="Em aberto" valor={n.abertas} sub="agora, em todos os estados" />
            </Kpis>
          </Secao>

          {/* O VOLUME E O TEMPO NUMA FAIXA SÓ — 23/09/2026. Eram duas seções
              lado a lado, uma de 2×2 e outra de 1×2, com 105px de vazio
              embaixo da menor. Seis casas iguais, numa linha a partir de
              1280, três por linha entre 720 e 1279. */}
          {/* o intervalo de datas já está no cabeçalho; aqui fica o que
              precisa de explicação */}
          <Secao titulo="No período"
            sub="Primeira resposta é a primeira vez que outra pessoa mexeu na demanda.">
            <Kpis colunas={6} colunasMedio={3}>
              {/* "Recebidas": o que chegou no período. "Abertas" aqui, a duas
                  linhas de "Em aberto", eram dois números com quase o mesmo
                  nome */}
              <Kpi rot="Recebidas" valor={n.total} sub={umOuVarios(n.total, 'pedido novo', 'pedidos novos')} />
              <Kpi rot="Concluídas" valor={n.concluidas} sub={umOuVarios(n.concluidas, 'entregue', 'entregues')} />
              <Kpi rot="Canceladas" valor={n.canceladas} sub={umOuVarios(n.canceladas, 'não vai andar', 'não vão andar')} />
              {/* O NÚMERO DIZ A BASE: a conta é só sobre quem tinha prazo,
                  e o rótulo diz sobre quantas. Sem base, "0%" em cinza. */}
              {/* sem base, "sem dados", e não "0%" (que se lia como "tudo
                  atrasou") */}
              <Kpi rot="No prazo" valor={n.no_prazo_pct === null || !n.no_prazo_base ? 'sem dados' : `${n.no_prazo_pct}%`}
                sub={n.no_prazo_base ? `de ${n.no_prazo_base} com prazo` : 'nenhuma com prazo'} />
              <Kpi rot="Primeira resposta" valor={horas(n.horas_ate_resposta)} sub="em média" />
              <Kpi rot="Até concluir" valor={horas(n.horas_ate_concluir)} sub="em média" />
            </Kpis>
          </Secao>

          <Secao titulo="Mês a mês" sub="Demandas recebidas em cada mês do período.">
            {n.por_mes.length > 1 ? (
              <div className="dm-caixa">
                <div className="dm-caixa-corpo">
                  <Colunas itens={mesesDoPeriodo(n.de, n.ate, n.por_mes).map(m => ({ rot: mesPorExtenso(m.mes), n: m.n }))} />
                </div>
              </div>
            ) : (
              /* UM MÊS SÓ NÃO É GRÁFICO: é uma linha, com o gesto que faz a
                 comparação aparecer ao lado dela (antes era uma caixa inteira
                 para uma frase, e o gesto morava lá em cima) */
              <div className="dm-tabela">
                <p className="dm-linha-vazia dm-neutra">
                  <Icone nome="calendario" />
                  {n.por_mes.length === 1 ? (
                    <span className="dm-cresce">
                      Todo o período cabe em <b>{mesPorExtenso(n.por_mes[0].mes)}</b>: {n.por_mes[0].n}{' '}
                      {n.por_mes[0].n === 1 ? 'demanda' : 'demandas'}.
                      {janela === '365' ? <span className="dm-mudo"> Ainda não há outro mês para comparar.</span> : null}
                    </span>
                  ) : (
                    <span className="dm-cresce dm-mudo">Nada no período.</span>
                  )}
                  {/* o gesto que faz a comparação aparecer, e só ele: a frase
                      "escolha 1 ano" ao lado do botão "Ver 1 ano" dizia a
                      mesma coisa duas vezes */}
                  {n.por_mes.length === 1 && janela !== '365' ? (
                    <button type="button" className="dm-btn dm-peq" onClick={() => setJanela('365')}>Comparar meses</button>
                  ) : null}
                </p>
              </div>
            )}
          </Secao>

          <div className="dm-dupla dm-dupla-secoes">
            {/* "Recebeu", e não "Atendeu": a coluna conta o que chegou para o
                setor atender, andando ou não ("Atendeu 1" numa demanda que
                ainda esperava aprovação). "Pediu" é o outro lado, e a frase
                de baixo diz os dois */}
            <Secao titulo="Por setor" sub="Pediu: o que o setor pediu. Recebeu, Em aberto e Atrasadas: o que chegou para ele atender.">
              <div className="dm-tabela">
                {/* no celular cada setor vira um bloco (o nome em cima, os
                    quatro números embaixo, cada um com o seu rótulo): a
                    tabela rolando de lado escondia justamente "Atrasadas" */}
                <div className="dm-rola" ref={rola}>
                  <table className="dm-tab dm-empilha">
                    <thead><tr>
                      <th className="dm-primeira">Setor</th><th className="dm-n">Pediu</th><th className="dm-n">Recebeu</th>
                      <th className="dm-n">Em aberto</th><th className="dm-n">Atrasadas</th>
                    </tr></thead>
                    <tbody>
                      {porVolume(n.por_setor).map(s => (
                        <tr key={s.nome}>
                          <td className="dm-primeira">{s.nome}</td>
                          {/* o zero sai cinza em toda coluna, e não só em Atrasadas */}
                          <td className={s.pediu ? 'dm-n' : 'dm-n dm-mudo'} data-rot="Pediu">{s.pediu}</td>
                          <td className={s.atendeu ? 'dm-n' : 'dm-n dm-mudo'} data-rot="Recebeu">{s.atendeu}</td>
                          <td className={s.abertas ? 'dm-n' : 'dm-n dm-mudo'} data-rot="Em aberto">{s.abertas}</td>
                          <td className={s.atrasadas ? 'dm-n dm-bad' : 'dm-n dm-mudo'} data-rot="Atrasadas">{s.atrasadas}</td>
                        </tr>
                      ))}
                      {!n.por_setor.length ? <tr><td colSpan={5} className="dm-mudo">Nada no período.</td></tr> : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </Secao>
            <div>
              <Secao titulo="O que mais se pede" sub="As categorias com mais pedidos no período.">
                <div className="dm-caixa">
                  <div className="dm-caixa-corpo">
                    {n.por_categoria.length
                      ? <Barras itens={n.por_categoria.slice(0, TETO_BARRAS).map(c => ({ rot: c.nome, n: c.n, sub: c.grupo }))} />
                      : <p className="dm-mudo dm-frase-unica">Nada no período.</p>}
                  </div>
                  <SobraDeCategorias cs={n.por_categoria} />
                </div>
              </Secao>
              {/* o banco junta as duas coisas (`50-demandas.sql`, motivos de
                  atraso): o motivo de quem concluiu com atraso e a trava das
                  que seguem atrasadas; a frase diz as duas */}
              <Secao titulo="Por que atrasa" sub="Nas concluídas com atraso, o motivo registrado; nas que seguem atrasadas, o que as trava.">
                <div className="dm-caixa">
                  <div className="dm-caixa-corpo">
                    {n.motivos_de_atraso.length ? (() => {
                      const { travas, livres, sem } = motivosDeAtraso(n.motivos_de_atraso);
                      return (
                        <>
                          {/* as travas se comparam (barras); o motivo escrito
                              por quem concluiu é frase, e se lê (citação):
                              uma frase de 1 virava uma barra de 100% */}
                          {travas.length ? <Barras itens={travas} /> : null}
                          {livres.length ? (
                            <ul className="dm-motivos">
                              {livres.map((m, k) => (
                                <li key={k}>“{m.rot}”{m.n > 1 ? <span className="dm-mudo"> · {m.n} vezes</span> : null}</li>
                              ))}
                            </ul>
                          ) : null}
                          {sem ? (
                            <p className="dm-nota-barras">
                              {sem} {umOuVarios(sem, 'segue atrasada, sem trava', 'seguem atrasadas, sem trava')}: o motivo
                              é pedido na conclusão.
                            </p>
                          ) : null}
                        </>
                      );
                    })() : <Vazio titulo="Nenhum atraso no período." tom="bom" />}
                  </div>
                </div>
              </Secao>
            </div>
          </div>
        </>
      )}
    </>
  );
}

/* A TABELA POR SETOR SAÍA EM ORDEM ALFABÉTICA.

   O documento pede "setores com maior volume de solicitações". A tabela
   tinha os números certos e a ordem errada: `dem_numeros` agrega `por_setor`
   em ordem alfabética. Ordena por "pediu", que é a palavra do documento
   ("solicitações"); empate cai em "atendeu" e depois no nome, para a ordem
   não dançar entre duas cargas dos mesmos números. `slice()` antes do `sort`
   porque `sort` ordena no lugar, e `n.por_setor` é o objeto do servidor. */
type LinhaDeSetor = { nome: string; pediu: number; atendeu: number; abertas: number; atrasadas: number };
function porVolume(setores: LinhaDeSetor[]): LinhaDeSetor[] {
  return setores.slice().sort((a, b) =>
    b.pediu - a.pediu || b.atendeu - a.atendeu || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/* O CORTE DE 10 DESCARTAVA AS OUTRAS 34 EM SILÊNCIO, 22/09/2026.

   O documento pede "Demandas por categoria" e "Categorias com maior
   recorrência". Dez barras atendem o segundo; o primeiro precisa saber
   quanto ficou de fora, e a SOMA é que responde o indicador: 34 categorias
   de uma demanda cada é cauda longa, e 34 somando 300 é a maior parte do
   volume escondida embaixo das dez barras. A frase para aí, sem oferecer
   gesto: nada nesta tela mostra a décima primeira categoria. */
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

/* barras horizontais: o que se compara por NOME. O valor à direita, a barra
   embaixo, todas na mesma escala (a maior é a cheia). */
/* "SEM MOTIVO REGISTRADO" NÃO É UM MOTIVO — 23/09/2026. Vinha do banco
   (`50-demandas.sql`) em minúscula, como uma barra escura igual às dos
   motivos de verdade, e ainda definia a escala: dois atrasos sem motivo
   viravam a barra cheia, e o único motivo real ficava com metade. A falta
   do dado sai das barras e vira uma linha embaixo delas. */
const SEM_MOTIVO = 'sem motivo registrado';
/* as travas chegam do banco com as palavras antigas, em minúscula; na tela
   elas têm o nome da pílula, o mesmo em todo o sistema */
const NOME_DA_TRAVA: Record<string, string> = {
  'faltou informação do solicitante': 'Aguardando informações de quem pediu',
  'esperando aprovação': 'Aguardando aprovação',
  'esperando terceiros': 'Aguardando terceiros',
};
const comMaiuscula = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
function motivosDeAtraso(ms: Numeros['motivos_de_atraso']): {
  travas: { rot: string; n: number }[]; livres: { rot: string; n: number }[]; sem: number;
} {
  const reais = ms.filter(m => m.motivo !== SEM_MOTIVO);
  return {
    travas: reais.filter(m => NOME_DA_TRAVA[m.motivo]).map(m => ({ rot: NOME_DA_TRAVA[m.motivo], n: m.n })),
    livres: reais.filter(m => !NOME_DA_TRAVA[m.motivo]).map(m => ({ rot: comMaiuscula(m.motivo), n: m.n })),
    sem: ms.find(m => m.motivo === SEM_MOTIVO)?.n || 0,
  };
}

function Barras({ itens }: { itens: { rot: string; n: number; sub?: string }[] }) {
  const max = Math.max(1, ...itens.map(i => i.n));
  return (
    <div className="dm-barras">
      {itens.map((i, k) => (
        <div key={k} className="dm-barras-linha">
          <div>
            <span className="dm-cresce dm-corta">
              {/* o grupo é peça própria: no celular desce para a linha de
                  baixo, sem ponto (o ponto ficava no fim da linha quando o
                  nome quebrava) */}
              {i.rot}{i.sub ? <span className="dm-mudo dm-barras-sub">{i.sub}</span> : null}
            </span>
            <b>{i.n}</b>
          </div>
          <div className="dm-barra"><i style={{ width: `${Math.round((i.n / max) * 100)}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

/* colunas: o que se compara no TEMPO. O número em cima de cada coluna, o mês
   embaixo, e a escala é a do maior mês. A coluna é a mesma `dm-barra` das
   barras horizontais, em pé. */
function Colunas({ itens }: { itens: { rot: string; n: number }[] }) {
  const max = Math.max(1, ...itens.map(i => i.n));
  return (
    <div className="dm-colunas-caixa" role="img"
      aria-label={itens.map(i => `${i.rot}: ${i.n}`).join(', ')}>
      <div className="dm-colunas">
        {itens.map((i, k) => (
          <div key={k} className={i.n ? 'dm-coluna' : 'dm-coluna dm-zero'}>
            <b>{i.n}</b>
            <div className="dm-barra"><i style={{ height: i.n ? `${Math.max(2, Math.round((i.n / max) * 100))}%` : '0' }} /></div>
          </div>
        ))}
      </div>
      <div className="dm-colunas-rot">
        {itens.map((i, k) => <span key={k}>{i.rot}</span>)}
      </div>
    </div>
  );
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/* O EIXO É O PERÍODO, E NÃO SÓ OS MESES COM DEMANDA — 23/09/2026. O banco
   devolve só os meses que tiveram pedido (`por_mes`), e um mês vazio no meio
   sumia do gráfico sem aviso: jul e set lado a lado, como se agosto não
   existisse. Aqui o eixo vai do mês de `de` ao de `ate`, com zero onde não
   houve pedido. */
function mesesDoPeriodo(de: string, ate: string, porMes: { mes: string; n: number }[]): { mes: string; n: number }[] {
  const conta = new Map(porMes.map(m => [m.mes, m.n]));
  const fora = [...porMes.map(m => m.mes)];
  let [a, m] = de.slice(0, 7).split('-').map(Number);
  const [af, mf] = ate.slice(0, 7).split('-').map(Number);
  const meses: { mes: string; n: number }[] = [];
  while ((a < af || (a === af && m <= mf)) && meses.length < 36) {
    const chave = `${a}-${String(m).padStart(2, '0')}`;
    meses.push({ mes: chave, n: conta.get(chave) || 0 });
    m += 1; if (m > 12) { m = 1; a += 1; }
  }
  /* se o banco mandou mês fora do intervalo (não deveria), ele não some */
  for (const x of fora) if (!meses.some(y => y.mes === x)) meses.push({ mes: x, n: conta.get(x) || 0 });
  return meses.sort((x, y) => (x.mes < y.mes ? -1 : 1));
}
function mesPorExtenso(m: string): string {
  const [a, mm] = m.split('-');
  return `${MESES[Number(mm) - 1]}/${a.slice(2)}`;
}
