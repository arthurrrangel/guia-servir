'use client';
/* O INÍCIO: O PORTAL DE QUEM PEDE · migração 94, forma de 23/09/2026.

   Até a 93 esta tela era uma lista só, igual para todo mundo, com o título
   "O que a igreja está pedindo" e a aba "Tudo" aberta: para um membro do
   Louvor, isso era tudo que qualquer pessoa do Louvor tinha pedido. O pedido
   do Arthur, com as palavras dele: "ele não pode simplesmente abrir
   /demandas e enxergar toda a base".

   O recorte é do BANCO (`pode_ver` da 94). Esta tela só organiza o que volta,
   na ordem da pergunta que a pessoa faz ao abrir:

     quem sou ............. nome, papel, setor e função, no cabeçalho
     os números ........... a faixa: o que é meu (quem pede) ou o que espera
                            no atendimento (quem atende), cada número levando
                            à lista dele
     o que espera por mim . "Precisa de você": responder, confirmar e, para
                            quem atende ou administra, o que espera do outro
                            lado (a fila, os pedidos de papel), na MESMA lista
     minhas demandas ...... a tabela, com os recortes em cima

   "Nova demanda" mora na lateral (desktop) e na barra de abas (celular):
   sempre no mesmo lugar, em vez de um botão a mais no alto de cada tela. */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import Casca, { useEu } from '@/components/demandas/Casca';
import Lista, { Fila } from '@/components/demandas/Lista';
import { Aviso, Cabecalho, Esqueleto, Kpi, Kpis, Pill, Secao } from '@/components/demandas/Ui';
import { Icone } from '@/components/demandas/Icone';
import { lista, portal, type Aba } from '@/lib/demandas/api';
import { HOJE, alcanceDoAtendimento, recadoDoErro, rotPapel, umOuVarios } from '@/lib/demandas/regras';
import type { Eu, Portal, Resumo } from '@/lib/demandas/tipos';

export default function Pagina() {
  return <Casca><Inicio /></Casca>;
}

const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro',
               'outubro', 'novembro', 'dezembro'];
/* "Quarta-feira, 23 de setembro", pelo dia do Rio (`HOJE()`), e não pelo
   relógio de quem abre: a igreja inteira vê o mesmo dia */
function hojePorExtenso(): string {
  const [a, m, d] = HOJE().split('-').map(Number);
  const dia = DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
  return `${dia[0].toUpperCase()}${dia.slice(1)}, ${d} de ${MESES[m - 1]}`;
}

function Inicio() {
  const ctx = useEu();
  const eu = ctx.eu;
  const [p, setP] = useState<Portal | null>(null);
  /* as demandas que esperam quem atende, para o "Precisa de você" mostrar
     QUAIS são, e não só quantas (ver `Precisa`) */
  const [agir, setAgir] = useState<Resumo[]>([]);
  const [erro, setErro] = useState('');
  const atende = !!eu && (eu.atende ?? eu.papel !== 'solicitante');

  const carregar = useCallback(async () => {
    /* as duas perguntas vão juntas e chegam juntas: a lista de "esperando
       você" chegando depois do portal fazia o bloco pular de uma linha
       somada ("5 esperando você") para cinco linhas */
    const [r, a] = await Promise.all([
      portal(),
      atende ? lista({ aba: 'agir', abertas: true }) : Promise.resolve(null),
    ]);
    /* `n` é conferido, e não só `ok`: um banco que ainda não tem a 94
       responde a função que não existe como SEM_SISTEMA, mas um dublê ou um
       proxy pode devolver `{ok:true}` vazio, e uma conta indefinida na tela
       seria "undefined esperando você". */
    if (!r.ok || !(r as unknown as Portal).n) {
      setErro(r.ok ? 'Não consegui carregar o que espera por você.' : recadoDoErro(r, 'carregar o início'));
      return;
    }
    /* a lista é enfeite do número: se ela falhar, o bloco volta à linha
       somada, que o portal sozinho já sabe escrever */
    setAgir(a && a.ok ? a.itens : []);
    setErro(''); setP(r as unknown as Portal);
  }, [atende]);
  useEffect(() => { carregar(); }, [carregar]);

  /* o cadastro devolve a pessoa para cá com `?bemvindo=1`. A frase aparece
     uma vez, como toast, e o parâmetro sai da barra: recarregar não repete
     boas-vindas. */
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.get('bemvindo') === '1') {
        ctx.toast?.({ texto: 'Cadastro feito. Você já pode abrir demandas.' });
        u.searchParams.delete('bemvindo');
        window.history.replaceState(null, '', u.pathname + u.search + u.hash);
      }
    } catch { /* sem history: nada a fazer */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!eu) return null;
  const n = p?.n;
  /* para quem atende, "Pedidas por você": "Minhas" logo abaixo de "Com você
     3 em execução" se lia como as dela para atender */
  const abas: { v: Aba; rot: string }[] = [{ v: 'minhas', rot: atende ? 'Pedidas por você' : 'Minhas' }];
  if (eu.papel === 'lider') abas.push({ v: 'ministerio', rot: 'Ministério' });
  if ((n?.participo ?? 0) > 0) abas.push({ v: 'participo', rot: 'Acompanho' });
  const pendentesDoLado = p ? (p.precisa || []).length : 0;
  /* O TÍTULO É DA SEÇÃO, E NÃO DE UMA ABA — 24/09/2026 (auditoria R10). Com
     mais de uma aba, "Minhas demandas" ficava em cima das nove do
     ministério: com abas, o título é neutro e a aba diz de quem. */
  const tituloDaLista = abas.length > 1 ? 'Demandas' : atende ? 'Pedidas por você' : 'Minhas demandas';
  /* e a líder sem nada aberto em nome próprio abre no ministério, que é onde
     está o trabalho dela (a aba "Minhas" vazia era a primeira coisa da
     lista). A lista remonta quando o portal chega com as contas (`key`). */
  const abaInicial: Aba = eu.papel === 'lider' && !!n && !n.minhas_andamento && (n.ministerio || 0) > 0
    ? 'ministerio' : 'minhas';

  return (
    <>
      <Cabecalho sobre={hojePorExtenso()} titulo={`Olá, ${eu.primeiro_nome}`}
        meta={<>
          <Pill>{rotPapel(eu.papel)}</Pill>
          {eu.setor ? <span>{eu.setor}</span> : null}
          {eu.funcao ? <span>{eu.funcao}</span> : null}
        </>} />

      {eu.papel_pedido ? (
        <Aviso tom="info">
          Seu pedido para atuar como <b>{rotPapel(eu.papel_pedido)}</b> está com a administração.
        </Aviso>
      ) : null}
      {erro ? (
        <>
          <Aviso tom="bad">{erro}</Aviso>
          <button type="button" className="dm-btn dm-tentar" onClick={carregar}>Tentar de novo</button>
        </>
      ) : null}

      {!p && !erro ? <Esqueleto forma="numeros" oQue="Carregando o que espera por você" /> : null}
      {p ? <Numeros n={p.n} eu={eu} atende={atende} precisa={(p.precisa || []).length} /> : null}
      {p ? <Precisa p={p} eu={eu} atende={atende} agirItens={agir} /> : null}

      {/* para quem atende, "Pedidas por você": "Minhas demandas: nenhuma em
          andamento" logo abaixo de "Com você 3 em execução" se lia como
          contradição (as três são dela, mas para atender) */}
      <Secao titulo={tituloDaLista}>
        <Lista key={abaInicial} eu={eu} abas={abas} abaInicial={abaInicial}
          recortes={[
            /* "Em aberto", o nome do conjunto em todo o sistema (a aba do
               Atendimento, a casa de cima, Números); "Abertas" confundia com
               a pílula "Aberta", que quer dizer "ninguém assumiu". "Em
               andamento" não cabia na fatia de 80px em 320 e 360 */
            { v: 'abertas', rot: 'Em aberto' },
            { v: 'concluidas', rot: 'Concluídas' },
            { v: 'tudo', rot: 'Histórico' },
          ]}
          vazio={(aba, so) => vazioDoInicio(aba, so, pendentesDoLado, atende)} />
      </Secao>
    </>
  );
}

/* A FAIXA DE NÚMEROS DO INÍCIO. Quem atende vê o atendimento (é o que pede
   ação hoje, e cada número abre a vista dele em Atender); quem só pede vê as
   próprias contas. Leitura, e não link, quando a lista é a própria página. */
function Numeros({ n, eu, atende, precisa }: { n: Portal['n']; eu: Eu; atende: boolean; precisa: number }) {
  if (atende) {
    /* CADA CASA É A PORTA DE UMA ABA DO ATENDIMENTO, E O NÚMERO DA PORTA É O
       DA SALA — 23/09/2026. "Na fila 3" (as sem responsável) abria a aba "Do
       setor 6": a pessoa ia atrás de três e achava seis misturadas. A casa
       agora tem o nome e a conta da aba; as sem responsável viram a linha de
       baixo. E a linha de baixo concorda com o número ("1 passou do
       prazo"); "em execução" saiu de "Com você" porque uma delas podia
       estar aguardando informação. */
    const a = alcanceDoAtendimento(eu);
    const abertas = n.setor_abertas || 0;
    return (
      <Kpis rot="Atendimento">
        {/* o subtítulo não repete o número ("1 / 1 espera aprovação") */}
        <Kpi rot="Esperando você" valor={n.agir} href="/demandas/atendimento?ver=agir" destaque
          sub={!n.aprovar ? 'para agir agora'
            : n.aprovar === n.agir ? umOuVarios(n.agir, 'espera aprovação', 'todas esperam aprovação')
            : `${n.aprovar} ${umOuVarios(n.aprovar, 'espera aprovação', 'esperam aprovação')}`} />
        <Kpi rot={a.legendaFila} valor={abertas} href="/demandas/atendimento?ver=fila"
          sub={!abertas ? 'nada em aberto' : !n.fila ? umOuVarios(abertas, 'com responsável', 'todas com responsável')
            : `${n.fila} sem responsável`} />
        <Kpi rot="Com você" valor={n.comigo} href="/demandas/atendimento?ver=comigo"
          sub={umOuVarios(n.comigo, 'assumida por você', 'assumidas por você')} />
        <Kpi rot="Atrasadas" valor={n.atrasadas} tom="bad" href="/demandas/atendimento?ver=atrasadas"
          sub={umOuVarios(n.atrasadas, 'passou do prazo', 'passaram do prazo')} />
      </Kpis>
    );
  }
  /* QUATRO CASAS PARA TODO PAPEL — 23/09/2026. Quem só pedia via duas casas
     de 556px em 1440 (e três no celular, a terceira sozinha numa linha): a
     faixa de quem pede parecia outro produto ao lado da de quem atende. A
     primeira é a mesma pergunta das duas faixas: o que espera por você. */
  return (
    <Kpis rot="Suas demandas" colunas={4}>
      <Kpi rot="Esperando você" valor={precisa} destaque
        sub={precisa === 1 ? 'resposta ou confirmação' : 'respostas ou confirmações'} />
      <Kpi rot="Em aberto" valor={n.minhas_andamento} sub={umOuVarios(n.minhas_andamento, 'pedida por você', 'pedidas por você')} />
      <Kpi rot="Concluídas" valor={n.minhas_concluidas} sub={umOuVarios(n.minhas_concluidas, 'entregue', 'entregues')} />
      {eu.papel === 'lider'
        ? <Kpi rot="Do ministério" valor={n.ministerio} sub="em aberto" />
        : <Kpi rot="Acompanho" valor={n.participo} sub="de outras pessoas" />}
    </Kpis>
  );
}

/* SEM "Abrir uma demanda" DENTRO DO AVISO: repetia o "Nova demanda" que está
   sempre à vista. E o vazio da lista fala com quem tem pendências em cima:
   "Nada em andamento" a 200px de "Precisa de você 3" lia-se como
   contradição. */
function vazioDoInicio(aba: Aba, so: string, pendentes: number, atende: boolean): { titulo: string; dica?: React.ReactNode; tom?: 'bom' } {
  if (aba === 'participo') {
    return { titulo: 'Você não acompanha nenhuma demanda.',
             dica: 'Quem pede ou quem atende pode incluir você numa demanda.' };
  }
  if (aba === 'ministerio') {
    if (so === 'concluidas') return { titulo: 'Nada do ministério foi concluído ainda.' };
    if (so === 'tudo') return { titulo: 'O ministério ainda não pediu nada.' };
    return { titulo: 'O ministério não tem pedido em aberto.', dica: 'Quem pede em nome do ministério aparece aqui.' };
  }
  if (so === 'concluidas') return { titulo: 'Nenhum pedido seu foi concluído ainda.' };
  if (so === 'tudo') return { titulo: 'Você ainda não abriu nenhuma demanda.' };
  /* sem o visto verde quando há pendência logo acima: "boa notícia" ao lado
     de "as 3 de cima esperam a sua resposta" se contradizia. E o título diz
     DE QUEM é o vazio: "Nada em aberto." embaixo de três demandas abertas
     do ministério (a líder responde por elas) se contradizia do mesmo jeito */
  const titulo = atende ? 'Nada pedido por você em aberto.' : 'Nenhuma demanda sua em aberto.';
  if (pendentes > 0) {
    return { titulo,
             dica: `${pendentes === 1 ? 'A de cima espera' : `As ${pendentes} de cima esperam`} a sua resposta ou confirmação.` };
  }
  return { titulo, tom: 'bom' };
}

/* O QUE ESPERA POR VOCÊ, DE TODOS OS LADOS.

   As linhas vêm prontas do servidor (`espera_pedido` da 94): a demanda parou
   esperando uma resposta sua, ou ficou pronta esperando você dizer que
   resolveu. Para quem atende, entram AS DEMANDAS que esperam do outro lado
   (a mesma vista "Esperando você" do Atendimento), até cinco, e uma linha
   com quantas mais; para quem administra, os pedidos de papel.

   23/09/2026 · ANTES ERA UM NÚMERO SÓ, TRÊS VEZES. A faixa dizia "Esperando
   você 5", o título "Precisa de você 5" e a única linha "5 demandas
   esperando você em Atender", as três levando ao mesmo lugar e nenhuma
   dizendo QUAIS. A faixa é o resumo; aqui é a lista. A linha somada só
   volta quando a lista não veio (falhou, ou o banco ainda não respondeu). */
const TETO_DO_INICIO = 5;

function Precisa({ p, eu, atende, agirItens }: { p: Portal; eu: Eu; atende: boolean; agirItens: Resumo[] }) {
  const itens = p.precisa || [];
  const agir = atende ? (p.n.agir || 0) : 0;
  const aprovar = atende ? (p.n.aprovar || 0) : 0;
  const pedidos = eu.papel === 'admin' ? (p.n.pedidos || 0) : 0;
  /* A CONTA DA SEÇÃO É DE DEMANDAS, A MESMA DA FAIXA. O pedido de papel
     entra como a última linha, fora do número: "Esperando você 1" na faixa e
     "Precisa de você 2" no título, na mesma tela, era número que não batia. */
  const total = itens.length + agir;
  const algo = total + pedidos;
  const daFila = atende
    ? agirItens.filter(x => !itens.some(y => y.numero === x.numero)).slice(0, TETO_DO_INICIO)
    : [];
  const linhas = [...itens, ...daFila];
  const outras = Math.max(0, agir - daFila.length);
  return (
    <Secao titulo="Precisa de você" n={total || null} destaque>
      {!algo ? (
        <div className="dm-tabela">
          <p className="dm-linha-vazia">
            <Icone nome="check" />
            <span><b>Nada esperando você.</b> Quando uma demanda sua precisar de resposta ou de confirmação, ela aparece aqui.</span>
          </p>
        </div>
      ) : (
        <div className="dm-tabela">
          {/* com cabeçalho, como a tabela de baixo: as duas caem nas mesmas
              colunas e se leem como um sistema só */}
          {/* quem atende um setor só não vê o próprio setor em toda linha
              (a mesma regra do Atendimento): vê a categoria */}
          {linhas.length ? <Fila itens={linhas} eu={eu} tarefas mostrarSetor={!atende || alcanceDoAtendimento(eu).varios} /> : null}
          {outras || pedidos ? (
            /* as linhas somadas moram numa `dm-fila` como as outras, para
               ganharem a mesma forma por largura */
            <div className="dm-fila">
              {outras ? (
                /* A CONTA MORA NA FRASE, E A COLUNA DO NÚMERO LEVA UM ÍCONE:
                   um "1" solto embaixo de "#104", mais escuro que ele, se lia
                   como a demanda número 1 */
                <Link className="dm-item dm-item-soma" href="/demandas/atendimento?ver=agir">
                  <span className="dm-c-num"><Icone nome="atender" /></span>{' '}
                  <span className="dm-c-tit">
                    <b>{outras} {daFila.length
                      ? umOuVarios(outras, 'outra esperando você no Atendimento', 'outras esperando você no Atendimento')
                      : umOuVarios(outras, 'demanda esperando você no Atendimento', 'demandas esperando você no Atendimento')}</b>
                    {aprovar && !daFila.length
                      ? <span className="dm-c-ctx">{aprovar} {umOuVarios(aprovar, 'espera aprovação', 'esperam aprovação')}</span>
                      : null}
                  </span>
                  <span className="dm-c-meta"><span className="dm-c-passo">{daFila.length ? 'Ver todas' : 'Atender'}<Icone nome="seta" /></span></span>
                </Link>
              ) : null}
              {pedidos ? (
                <Link className="dm-item dm-item-soma" href="/demandas/admin">
                  <span className="dm-c-num"><Icone nome="pessoas" /></span>{' '}
                  <span className="dm-c-tit"><b>{pedidos} {umOuVarios(pedidos, 'pedido de papel espera você', 'pedidos de papel esperam você')}</b></span>
                  <span className="dm-c-meta"><span className="dm-c-passo">Decidir<Icone nome="seta" /></span></span>
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </Secao>
  );
}
