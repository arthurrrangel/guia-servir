'use client';
/* OS NÚMEROS — os quatorze indicadores da seção 9 do documento.

   A ordem não é a do PDF: é a de quem vai olhar. Primeiro o que exige ação
   hoje (atrasadas, paradas, esperando aprovação), depois o volume, e só então
   as médias. Indicador que ninguém consegue transformar em decisão é enfeite.

   Nada de gráfico de pizza. Uma barra por linha, comparável, e o número
   escrito ao lado — é o que se lê no celular sem apertar os olhos. */

import { useCallback, useEffect, useState } from 'react';
import Casca, { useEu } from '@/components/demandas/Casca';
import { Aviso, Esqueleto, Opcoes } from '@/components/demandas/Ui';
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

  const buscar = useCallback(async () => {
    setN(null);
    /* `HOJE()` E NAO `toISOString()` — 22/09/2026.

       `toISOString()` e SEMPRE UTC. Das 21h do Rio a meia-noite esta tela
       PEDIA e IMPRIMIA um periodo que termina amanha, enquanto o servidor
       recorta pelo dia do Rio. O arquivo ja importava `somaDias` e `horas`
       daqui; faltava `HOJE`, que existe para isto desde 20/09. */
    const hoje = HOJE();
    const r = await numeros(somaDias(hoje, -Number(janela)), hoje);
    if (!r.ok) { setErro(recadoDoErro(r, 'carregar os números')); return; }
    setErro(''); setN(r.numeros);
  }, [janela]);

  useEffect(() => { buscar(); }, [buscar]);

  if (eu && eu.papel === 'solicitante') {
    return (
      <>
        <div className="dm-rot">{'>'} números</div>
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
      <div className="dm-rot">{'>'} números</div>
      <h1 style={{ margin: '6px 0 var(--dm-e3)' }}>Como a operação está andando</h1>

      {erro ? (
        <div style={{ marginBottom: 'var(--dm-e3)' }}>
          <Aviso tom="bad">{erro}</Aviso>
          <button className="dm-btn" onClick={buscar} style={{ marginTop: 'var(--dm-e2)' }}>
            Tentar de novo
          </button>
        </div>
      ) : null}

      <div style={{ marginBottom: 'var(--dm-e3)', maxWidth: 380 }}>
        <Opcoes<Janela> rot="Período" valor={janela} aoMudar={setJanela}
          opcoes={[{ v: '30' as Janela, rot: '30 dias' }, { v: '90' as Janela, rot: '90 dias' }, { v: '365' as Janela, rot: '1 ano' }]} />
      </div>

      {/* `!n` SOZINHO DEIXAVA UM ESQUELETO ANIMADO PARA SEMPRE.
          Quando a carga falha, `n` fica nulo e a tela mostrava ao mesmo tempo
          o erro, o "Tentar de novo" E uma forma piscando que nunca ia virar
          conteúdo. Piscar é promessa de que algo está a caminho. */}
      {!n && !erro ? <Esqueleto oQue="Carregando os números" /> : !n ? null : (
        <>
          {/* -------------------------------------------- o que pede ação hoje */}
          <h2 style={{ margin: '0 0 var(--dm-e2)' }}>Precisa de atenção</h2>
          <div className="dm-tres" style={{ marginBottom: 'var(--dm-e4)' }}>
            <Num v={n.atrasadas} r="passaram do prazo" destaque={n.atrasadas > 0} />
            <Num v={n.paradas} r="sem movimento há 7 dias" />
            <Num v={n.reabertas} r="foram reabertas" />
            <Num v={n.abertas} r="em aberto agora" />
          </div>

          {/* ------------------------------------------------------- volume */}
          <h2 style={{ margin: '0 0 var(--dm-e2)' }}>Volume no período</h2>
          <div className="dm-tres" style={{ marginBottom: 'var(--dm-e4)' }}>
            <Num v={n.total} r="demandas abertas" />
            <Num v={n.concluidas} r="concluídas" />
            <Num v={n.canceladas} r="canceladas" />
            {/* O NÚMERO DIZ A BASE. Antes ele dizia 90% contando como pontual
                toda demanda que nunca teve prazo — ou seja, inflava
                exatamente onde o sistema menos sabe. Hoje a conta é só sobre
                quem tinha prazo, e o rótulo diz sobre quantas. */}
            <Num v={n.no_prazo_pct === null ? '—' : `${n.no_prazo_pct}%`}
              r={n.no_prazo_base ? `dentro do prazo (de ${n.no_prazo_base} com prazo)` : 'concluídas dentro do prazo'} />
          </div>

          {/* -------------------------------------------------------- tempo */}
          <h2 style={{ margin: '0 0 var(--dm-e2)' }}>Tempo</h2>
          <div className="dm-dupla" style={{ marginBottom: 'var(--dm-e4)' }}>
            <Num v={horas(n.horas_ate_resposta)} r="até a primeira resposta" />
            <Num v={horas(n.horas_ate_concluir)} r="até concluir" />
          </div>
          <p className="dm-peq dm-mudo" style={{ marginTop: -12, marginBottom: 'var(--dm-e4)' }}>
            “Primeira resposta” é a primeira vez que alguém que não abriu a demanda mexeu nela.
            É o número que mostra se um setor está deixando pedido parado sem ninguém olhar.
          </p>

          {/* ------------------------------------------------------- setores */}
          <h2 style={{ margin: '0 0 var(--dm-e2)' }}>Por setor</h2>
          <div className="dm-card">
            <table className="dm-tab">
              <thead><tr>
                <th>Setor</th><th className="dm-n">Pediu</th><th className="dm-n">Atendeu</th>
                <th className="dm-n">Em aberto</th><th className="dm-n">Atrasadas</th>
              </tr></thead>
              <tbody>
                {n.por_setor.map(s => (
                  <tr key={s.nome}>
                    <td>{s.nome}</td>
                    <td className="dm-n">{s.pediu}</td>
                    <td className="dm-n">{s.atendeu}</td>
                    <td className="dm-n">{s.abertas}</td>
                    <td className="dm-n" style={{ color: s.atrasadas ? 'var(--dm-bad)' : undefined, fontWeight: s.atrasadas ? 600 : undefined }}>
                      {s.atrasadas || '—'}
                    </td>
                  </tr>
                ))}
                {!n.por_setor.length ? <tr><td colSpan={5} className="dm-mudo">Nada no período.</td></tr> : null}
              </tbody>
            </table>
          </div>

          {/* ----------------------------------------------------- categorias */}
          <h2 style={{ margin: 'var(--dm-e4) 0 var(--dm-e2)' }}>O que mais se pede</h2>
          <div className="dm-card">
            <Barras itens={n.por_categoria.slice(0, 10).map(c => ({ rot: c.nome, n: c.n, sub: c.grupo }))} />
            {!n.por_categoria.length ? <p className="dm-mudo dm-peq" style={{ margin: 0 }}>Nada no período.</p> : null}
          </div>

          {/* ------------------------------------------------------- atrasos */}
          <h2 style={{ margin: 'var(--dm-e4) 0 var(--dm-e2)' }}>Por que atrasa</h2>
          <div className="dm-card">
            <Barras itens={n.motivos_de_atraso.map(m => ({ rot: m.motivo, n: m.n }))} />
            {!n.motivos_de_atraso.length
              ? <p className="dm-mudo dm-peq" style={{ margin: 0 }}>Nenhum atraso no período.</p> : null}
          </div>

          {/* --------------------------------------------------------- meses */}
          {n.por_mes.length > 1 ? (
            <>
              <h2 style={{ margin: 'var(--dm-e4) 0 var(--dm-e2)' }}>Mês a mês</h2>
              <div className="dm-card">
                <Barras itens={n.por_mes.map(m => ({ rot: mesPorExtenso(m.mes), n: m.n }))} />
              </div>
            </>
          ) : null}

          <p className="dm-peq dm-mudo" style={{ marginTop: 'var(--dm-e4)' }}>
            De {n.de.split('-').reverse().join('/')} a {n.ate.split('-').reverse().join('/')}.
            Você vê os números das demandas que consegue ver: a liderança vê tudo, um setor vê o que
            pediu e o que atende.
          </p>
        </>
      )}
    </>
  );
}

function Num({ v, r, destaque }: { v: number | string; r: string; destaque?: boolean }) {
  return (
    <div className={`dm-num ${destaque ? 'dm-destaque' : ''}`}>
      <div className="dm-v">{v}</div>
      <div className="dm-r">{r}</div>
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
