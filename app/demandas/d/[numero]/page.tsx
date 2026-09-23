'use client';
/* UMA DEMANDA.

   Em ordem de leitura: título e estado; a faixa com os quatro fatos que
   decidem a ação (quem pediu, quem atende, prazo, aberta); o pedido; o
   histórico, com a caixa de escrever no fim, que é onde se responde. A ação
   fica ao lado, no painel (desktop), ou na barra fixa do rodapé (celular):
   quem atende lê e age na mesma tela sem rolar 1400px, e quem pediu encontra
   "Resolveu, obrigado" como o botão principal, não como o menor da tela.

   UM PRIMÁRIO POR VISTA — 23/09/2026. A ficha travada mostrava TRÊS botões
   pretos ao mesmo tempo (Assumir, Concluir, Destravar), porque `dm-pri` era
   atribuído por ação e não por contexto. Três primários é nenhum primário.
   Agora `primariaDe` escolhe a ação que tira a demanda do estado atual, e
   uma só; o resto é secundário ou vira botão-texto em "ajustes".

   Os botões vêm de `acoesDe`, que é o espelho testado de `dem_mover`. Nenhum
   botão é desenhado à mão aqui: se aparecer um que o servidor recusa, o teste
   da matriz quebra antes de chegar em produção. */

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Casca, { useEu } from '@/components/demandas/Casca';
import { Aviso, CaixaDeAcao, Campo, Copiar, Esqueleto, Opcoes, Pill, useEstreito } from '@/components/demandas/Ui';
import { bases, mover, ver } from '@/lib/demandas/api';
import {
  HOJE, PRIORIDADES, TRAVAS, acoesDe, carimbo, comoOPdfChama, dataCheia, dataCurta, diasDeAtraso,
  dinheiro, linkZap, pedidoPara, primariaDe, quando, quemManda, recado, recadoDoErro, rotPrioridade,
  rotTrava, situacao, tetoDe, tomPill, tomPrioridade, type Acao,
  fraseDoEvento, dicaDeAnexo, recadoDeSite, siteDoLink, siteRecusado,
} from '@/lib/demandas/regras';
import type { Bases, Vista } from '@/lib/demandas/tipos';

export default function Pagina() {
  return <Casca><Uma /></Casca>;
}

/* As ações que `acoesDe` devolve e que NÃO viram botão de ação:
     comentar  — a caixa de escrever fica no fim do histórico. */
const FORA_DA_GRADE: Acao[] = ['comentar'];

/* O que ANDA com a demanda (principais) e o que só a AJUSTA (ajustes, em
   botão-texto). `cancelar` é ajuste em perigo. A ordem é a de leitura. */
const PRINCIPAIS: Acao[] = ['aprovar', 'rejeitar', 'assumir', 'concluir', 'travar', 'destravar', 'validar', 'reabrir'];
const AJUSTES: Acao[] = ['prazo', 'prioridade', 'redirecionar', 'anexar', 'cancelar'];

/* O TETO DE EVENTOS DA MIGRAÇÃO 93 (200 mais recentes, e `eventos_total` com
   quantos a pessoa poderia ver). Opcional porque um banco na 92 não manda. */
type VistaComTeto = Vista & { eventos_total?: number };


function Uma() {
  const params = useParams<{ numero: string }>();
  const router = useRouter();
  const ctx = useEu();
  const numero = Number(params?.numero);
  const [v, setV] = useState<VistaComTeto | null>(null);
  const [b, setB] = useState<Bases | null>(null);
  const [erro, setErro] = useState('');
  /* a ação aberta (o formulário), ou 'mais' (a folha de ajustes do celular) */
  const [aberto, setAberto] = useState<Acao | 'mais' | ''>('');
  const [indo, setIndo] = useState(false);
  /* celular ou desktop, para o formulário da ação abrir na folha ou no painel */
  const celular = useEstreito(1023);

  const carregar = useCallback(async () => {
    const r = await ver(numero);
    if (!r.ok) { setErro(recadoDoErro(r, 'abrir a demanda')); setV(null); return; }
    setErro('');
    setV({
      demanda: r.demanda, eu: r.eu, eventos: r.eventos, anexos: r.anexos,
      /* 94 · quem acompanha. Esta montagem campo a campo JOGAVA FORA o que não
         estivesse listado aqui. */
      participantes: r.participantes,
      eventos_total: (r as Partial<{ eventos_total: number }>).eventos_total,
    });
  }, [numero]);

  useEffect(() => { if (Number.isFinite(numero)) carregar(); }, [numero, carregar]);
  useEffect(() => { bases().then(x => { if (x.ok) setB({ setores: x.setores, categorias: x.categorias, anexos: x.anexos }); }); }, []);

  /* DEVOLVE SE DEU CERTO, E ISSO É O QUE SEGURA O TEXTO DA PESSOA: o ramo de
     erro devolve `false`, e a caixa não apaga o que foi escrito. */
  async function agir(acao: Acao, dados: Record<string, unknown> = {}): Promise<boolean> {
    setIndo(true); setErro('');
    const r = await mover(numero, acao, dados);
    setIndo(false);
    if (!r.ok) { setErro(recadoDoErro(r, 'gravar')); return false; }
    setAberto('');
    await carregar();
    if (acao === 'assumir') ctx.toast?.({ texto: `Demanda #${numero} é sua. Ela está em execução.` });
    if (acao === 'validar') ctx.toast?.({ texto: 'Confirmado. Obrigado por dizer.' });
    return true;
  }

  const acoes = useMemo(() => (v ? acoesDe(v.demanda, v.eu) : []), [v]);

  /* A ORDEM DO HISTÓRICO É DECIDIDA AQUI (`Date.parse`, e não texto: o
     carimbo é `timestamptz` e o fuso vem junto), e não herdada de um `order
     by` que a próxima migração pode virar. */
  const eventos = useMemo(() => {
    const q = (e: { em: string }) => { const t = Date.parse(e.em); return Number.isNaN(t) ? 0 : t; };
    return (v?.eventos ?? []).slice().sort((a, b) => q(a) - q(b));
  }, [v]);
  const eventosDeFora = Math.max(0, (v?.eventos_total ?? 0) - eventos.length);

  /* UM GESTO, UMA LINHA: `assumir` grava o status e o responsável no mesmo
     instante; "Maria assumiu" já diz as duas coisas. */
  const linhas = useMemo(() => {
    const ms = (e: { em: string }) => { const t = Date.parse(e.em); return Number.isNaN(t) ? 0 : t; };
    const assumiu = (e: typeof eventos[number]) =>
      e.tipo === 'responsavel' && !!e.para && e.para === e.quem;
    const abriuExecucao = (e: typeof eventos[number]) =>
      e.tipo === 'status' && (e.de || 'aberta') === 'aberta' && e.para === 'execucao';
    const fora = new Set<number>();
    for (let i = 0; i < eventos.length; i++) {
      if (!abriuExecucao(eventos[i])) continue;
      for (const j of [i - 1, i + 1]) {
        const o = eventos[j];
        if (o && assumiu(o) && o.quem === eventos[i].quem
            && Math.abs(ms(o) - ms(eventos[i])) < 5000) { fora.add(i); break; }
      }
    }
    return eventos.filter((_, i) => !fora.has(i));
  }, [eventos]);

  /* O PRAZO PEDIDO NO NASCIMENTO, quando o setor mudou a data: o primeiro
     evento `prazo` guarda em `de` o que existia antes. Cala quando o
     histórico veio cortado (o primeiro da janela não é o primeiro que
     aconteceu). ESTE BLOCO ORDENA POR CONTA PRÓPRIA em vez de ler `eventos`,
     de propósito: `scripts/demandas.test.mjs` recorta o corpo deste useMemo
     e o executa só com `v`. */
  const prazoPedido = useMemo(() => {
    const lista = v?.eventos ?? [];
    if ((v?.eventos_total ?? 0) > lista.length) return '';
    const p = lista.slice()
      .sort((a, b) => (Date.parse(a.em) || 0) - (Date.parse(b.em) || 0))
      .find(e => e.tipo === 'prazo');
    return p?.de || '';
  }, [v]);

  /* o formulário aberto no painel rola até ele e foca o primeiro campo: tocar
     em "Concluir" tem que mudar alguma coisa na tela */
  const cxForm = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto || aberto === 'mais' || celular) return;
    const n = cxForm.current;
    if (!n) return;
    n.scrollIntoView({ block: 'center', behavior: 'smooth' });
    n.querySelector<HTMLElement>('textarea,input,select')?.focus({ preventScroll: true });
  }, [aberto, celular]);

  /* e Escape fecha, porque o único jeito de desistir era achar o "Deixa pra
     lá" lá embaixo. Na folha do celular quem fecha é o <dialog>. */
  useEffect(() => {
    if (!aberto) return;
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(''); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [aberto]);

  if (erro && !v) {
    return (
      <>
        <Aviso tom="bad">{erro}</Aviso>
        <div className="dm-linha">
          <button className="dm-btn dm-pri" onClick={carregar}>Tentar de novo</button>
          <Link className="dm-btn" href="/demandas">Voltar para a lista</Link>
        </div>
      </>
    );
  }
  if (!v) return <Esqueleto forma="ficha" />;

  const d = v.demanda;
  const sit = situacao(d);
  const atraso = diasDeAtraso(d.prazo);
  /* a raiz do SISTEMA, não do site: os links que saem daqui pelo WhatsApp
     precisam cair em /demandas, e não na home da igreja */
  const base = typeof window !== 'undefined' ? window.location.origin + '/demandas' : '';

  /* o que contradiz a ficha não vira botão: "Assumir e começar" quando a
     demanda já está com a pessoa (o servidor aceita, como troca de dono, mas
     aqui é ruído), e "Travar" numa demanda já travada (re-travar existe para
     trocar o motivo; o caminho é destravar e travar de novo) */
  const contradiz = (a: Acao) =>
    (a === 'assumir' && !!d.responsavel_id && d.responsavel_id === v.eu.id)
    || (a === 'travar' && d.status === 'travada');
  const naGrade = acoes.filter(a => !FORA_DA_GRADE.includes(a) && !contradiz(a));
  const primaria = primariaDe(d, naGrade);
  const secundarias = PRINCIPAIS.filter(a => naGrade.includes(a) && a !== primaria);
  const ajustes = AJUSTES.filter(a => naGrade.includes(a));
  const podeAvisar = !!recadoDe(d, v.eu).zap || !!recadoDe(d, v.eu).nome;
  const temAcao = !!primaria || secundarias.length > 0 || ajustes.length > 0;
  /* a folha "Mais" existe quando há mais do que um primário e um secundário
     para caber na barra: ajustes, dois ou mais secundários, ou os recados */
  const temMais = ajustes.length > 0 || secundarias.length > 1 || podeAvisar;
  /* a barra fixa só existe com uma ação que anda com a demanda; ajustes e
     recados sozinhos moram num cartão em linha no celular (uma barra fixa só
     com "Mais" era 56px de rodapé para esconder dois botões-texto) */
  const temBarra = !!primaria || secundarias.length > 0;
  const soAjustes = !temBarra && (ajustes.length > 0 || podeAvisar);

  const rotulo = (a: Acao) => {
    switch (a) {
      case 'aprovar':      return 'Aprovar';
      case 'rejeitar':     return 'Recusar';
      case 'assumir':      return 'Assumir e começar';
      case 'concluir':     return 'Concluir';
      case 'travar':       return 'Travar';
      case 'destravar':    return (v.eu.pede ?? v.eu.abriu) && d.travada_por === 'informacao' ? 'Responder e destravar' : 'Destravar';
      case 'reabrir':      return 'Reabrir';
      case 'validar':      return 'Resolveu, obrigado';
      case 'prazo':        return 'Mudar o prazo';
      case 'prioridade':   return 'Rever a prioridade';
      case 'redirecionar': return 'Mandar para outro setor';
      case 'anexar':       return 'Juntar um anexo';
      case 'cancelar':     return 'Cancelar';
      default:             return a;
    }
  };
  /* assumir e validar gravam direto; as outras abrem o formulário */
  const tocar = (a: Acao) => (a === 'assumir' || a === 'validar' ? agir(a) : setAberto(a));
  const botao = (a: Acao, classe: string) => (
    <button key={a} type="button" className={classe} disabled={indo} onClick={() => tocar(a)}>{rotulo(a)}</button>
  );
  const estadoDoPainel =
    d.status === 'concluida' ? `Concluída em ${carimbo(d.concluida_em).split(' ')[0]}${primaria ? '' : '. Nada a fazer.'}`
    : d.status === 'cancelada' ? 'Cancelada.'
    : d.falta_aprovacao ? ((v.eu.aprova ?? quemManda(v.eu.papel)) ? 'A decisão é sua.' : 'Parada até a liderança aprovar.')
    : d.status === 'travada' ? `${rotTrava(d.travada_por)}.`
    : d.responsavel_id && d.responsavel_id === v.eu.id ? `Com você${d.prazo ? `, ${prazoEmPalavras(d.prazo, sit, atraso)}` : ''}`
    : d.responsavel ? `Com ${d.responsavel.split(' ')[0]}${d.prazo ? `, ${prazoEmPalavras(d.prazo, sit, atraso)}` : ''}`
    : d.status === 'aberta' ? 'Ninguém assumiu ainda.'
    : '';

  /* ---------------------------------------- o painel de ação (desktop) e a folha */
  const painel = aberto && aberto !== 'mais' ? (
    <div ref={cxForm}>
      <div className="dm-folha-topo">
        <h3 className="dm-painel-titulo">{rotulo(aberto)}</h3>
        <button type="button" className="dm-btn dm-txt dm-mini" onClick={() => setAberto('')}>Deixa pra lá</button>
      </div>
      {erro ? <Aviso tom="bad">{erro}</Aviso> : null}
      <Formulario aberto={aberto} d={d} b={b} eu={v.eu} indo={indo} agir={agir} />
    </div>
  ) : (
    <>
      <h3 className="dm-painel-titulo">{primaria || secundarias.length ? 'Próximo passo' : 'Esta demanda'}</h3>
      {estadoDoPainel ? <div className="dm-painel-estado">{estadoDoPainel}</div> : null}
      {!temAcao ? (
        <p className="dm-peq dm-mudo" style={{ margin: 0 }}>
          {d.status === 'concluida' || d.status === 'cancelada'
            ? 'Já encerrada. Se precisar, escreva aqui embaixo.'
            : d.falta_aprovacao
              ? 'Parada até a liderança aprovar. Se precisar, escreva aqui embaixo.'
              : 'Quem toca é o setor responsável. Se precisar, escreva aqui embaixo.'}
        </p>
      ) : null}
      <div className="dm-painel-acoes">
        {primaria ? botao(primaria, 'dm-btn dm-pri dm-larga') : null}
        {secundarias.map(a => botao(a, a === 'rejeitar' ? 'dm-btn dm-perigo dm-larga' : 'dm-btn dm-larga'))}
      </div>
      {ajustes.length ? (
        <div className="dm-painel-ajustes">
          {ajustes.map(a => botao(a, a === 'cancelar' ? 'dm-btn dm-txt dm-perigo' : 'dm-btn dm-txt'))}
        </div>
      ) : null}
      {podeAvisar ? <Recados d={d} base={base} eu={v.eu} /> : null}
    </>
  );

  return (
    <>
      {/* 94 · A SAÍDA VOLTA PARA O PORTAL DE QUEM OLHA: quem atende, para a
          fila; quem pede, para as suas. */}
      {v.eu.atende
        ? <Link className="dm-volta" href="/demandas/atendimento">Atender</Link>
        : <Link className="dm-volta" href="/demandas">Minhas demandas</Link>}

      <div className="dm-cab">
        <div>
          <div className="dm-rot">{'>'} demanda #{d.numero} · {d.categoria}</div>
          <h1 style={{ marginTop: 6 }}>{d.titulo}</h1>
          <div className="dm-linha" style={{ marginTop: 'var(--dm-e2)', gap: 6 }}>
            <Pill tom={tomPill(d.status)}>
              <span className={`dm-ponto ${tomPill(d.status) ? 'dm-' + tomPill(d.status) : ''}`} />
              {comoOPdfChama(d)}
            </Pill>
            {tomPrioridade(d.prioridade) ? <Pill tom={tomPrioridade(d.prioridade)}>{rotPrioridade(d.prioridade)}</Pill> : null}
            {sit === 'atrasada' ? <Pill tom="bad">{atraso} {atraso === 1 ? 'dia' : 'dias'} de atraso</Pill> : null}
            {sit === 'parada' ? <Pill tom="warn">parada há {d.parada_dias} dias</Pill> : null}
            {d.reaberturas > 0 ? <Pill tom="warn">reaberta {d.reaberturas}×</Pill> : null}
          </div>
        </div>
      </div>

      {erro && !aberto ? <Aviso tom="bad">{erro}</Aviso> : null}

      {/* ---------------------------------------------------- o que acontece

          O portão fala primeiro, em qualquer status, e diz de quem é a vez. */}
      {d.falta_aprovacao ? (
        <Aviso tom="warn">
          <div>
            <b>Esperando aprovação.</b>{' '}
            {d.aprovacao === 'pendente'
              ? 'A liderança precisa decidir antes de esta demanda andar.'
              : 'A categoria desta demanda passou a exigir aprovação. Ela fica parada até a liderança decidir.'}
            {(v.eu.aprova ?? quemManda(v.eu.papel))
              ? <> Você pode aprovar ou recusar aqui ao lado.</>
              : <> Quem decide é a liderança. Não há o que fazer aqui enquanto isso.</>}
          </div>
        </Aviso>
      ) : null}
      {d.status === 'travada' && !d.falta_aprovacao ? (
        <Aviso tom="warn">
          <div>
            <b>{rotTrava(d.travada_por)}.</b>{d.travada_nota ? ` ${d.travada_nota}` : ''}
            {d.travada_por === 'informacao' && (v.eu.pede ?? v.eu.abriu) && acoes.includes('destravar')
              ? <> Responda aqui embaixo e a demanda volta a andar.</>
              : null}
          </div>
        </Aviso>
      ) : null}
      {d.status === 'concluida' ? (
        <Aviso tom="ok">
          <div>
            <b>Concluída</b> em {carimbo(d.concluida_em)}. {d.conclusao}
            {d.atraso_motivo ? <> <span className="dm-mudo">(atrasou: {d.atraso_motivo})</span></> : null}
            {/* A ETAPA 5 DO PDF: quem pediu confirma que resolveu. O botão é
                o primário do painel (era o menor botão da tela, dentro deste
                aviso); confirmada, vira a frase, que é o registro pedido. */}
            {d.validada_em ? (
              <div className="dm-peq" style={{ marginTop: 6 }}>
                Validada{d.validada_por ? ` por ${d.validada_por}` : ''} em {dataCheia(d.validada_em.slice(0, 10))}.
              </div>
            ) : null}
          </div>
        </Aviso>
      ) : null}
      {d.status === 'cancelada' ? (
        <Aviso tom="bad"><div><b>Cancelada.</b> {d.cancelada_motivo}</div></Aviso>
      ) : null}

      {/* ------------------------------------------ os quatro fatos que decidem */}
      <div className="dm-fatos">
        <div className="dm-fato">
          <span>Quem pediu</span>
          <div>{d.abriu}<small>{d.solicitante}</small></div>
        </div>
        <div className="dm-fato">
          <span>Quem atende</span>
          <div>
            {d.responsavel ? (d.responsavel_id === v.eu.id ? 'Você' : d.responsavel) : d.responsavel_setor}
            <small>{d.responsavel ? d.responsavel_setor : 'ninguém assumiu'}</small>
          </div>
        </div>
        <div className="dm-fato">
          <span>Prazo</span>
          <div>
            {d.prazo ? dataCheia(d.prazo) : 'sem data'}
            <small>
              {d.prazo ? prazoEmPalavras(d.prazo, sit, atraso) : (d.sem_prazo_porque || 'sem justificativa')}
              {pedidoPara(d.prazo, prazoPedido)}
            </small>
          </div>
        </div>
        <div className="dm-fato">
          <span>Aberta</span>
          <div>{carimbo(d.criada_em).split(' · ')[0]}<small>{quando(d.criada_em)}</small></div>
        </div>
      </div>

      <div className="dm-duas">
        {/* ------------------------------------------------------- o pedido */}
        <div>
          <div className="dm-card">
            <h3>O que foi pedido</h3>
            <p className="dm-texto-livre">{d.descricao}</p>
            {d.objetivo ? <p className="dm-peq dm-mudo">Objetivo: {d.objetivo}</p> : null}
            {d.impacto ? <p className="dm-peq"><b>Impacto:</b> {d.impacto}</p> : null}
            {d.evento || d.local || d.publico || d.orcamento !== null || d.aprovacao || d.falta_aprovacao ? (
              <div className="dm-pares">
                {d.evento ? <div><span>Evento</span>{d.evento} · {dataCheia(d.evento_data)}</div> : null}
                {d.local ? <div><span>Onde</span>{d.local}</div> : null}
                {d.publico ? <div><span>Público</span>{d.publico}</div> : null}
                {d.orcamento !== null ? <div><span>Orçamento</span>{dinheiro(d.orcamento)}</div> : null}
                {d.aprovacao
                  ? <div><span>Aprovação</span>{d.aprovacao}{d.aprovacao_nota ? `: ${d.aprovacao_nota}` : ''}</div>
                  : d.falta_aprovacao ? <div><span>Aprovação</span>esperando a liderança decidir</div> : null}
              </div>
            ) : null}
          </div>

          {v.anexos.length ? (
            <div className="dm-card">
              <div className="dm-entre" style={{ marginBottom: 'var(--dm-e1)' }}>
                <h3 style={{ margin: 0 }}>Anexos<span className="dm-selo">{v.anexos.length}</span></h3>
                {acoes.includes('anexar') ? (
                  <button type="button" className="dm-btn dm-txt dm-mini" disabled={indo} onClick={() => setAberto('anexar')}>Juntar um anexo</button>
                ) : null}
              </div>
              {/* O anexo é um LINK para a conta de alguém: o único jeito de a
                  pessoa saber para onde vai é antes de clicar (o rótulo traz
                  o site), e a ficha diz QUEM colou, quando, e se chegou
                  depois de a demanda fechar. Quem pode tirar quem diz é o
                  servidor, anexo por anexo (`posso_tirar`, migração 89). */}
              <ul className="dm-anexos">
                {v.anexos.map((a, i) => (
                  <li key={a.id || i}>
                    <a className="dm-anexo-link" href={a.url} target="_blank" rel="noopener noreferrer">{a.nome}</a>
                    <span className="dm-anexo-de">
                      {a.quem ? `${a.quem} · ` : ''}{dataCurta(a.em)}
                      {a.depois_de_fechar ? <b> · juntado depois de concluída</b> : null}
                    </span>
                    {a.posso_tirar ? (
                      <button className="dm-btn dm-mini" disabled={indo}
                        onClick={() => agir('desanexar', { anexo_id: a.id })}>tirar</button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <Acompanham v={v} indo={indo} agir={agir} sair={() => router.push('/demandas')} />

          {/* --------------------------------------------------------- histórico */}
          <h2 style={{ margin: 'var(--dm-e4) 0 var(--dm-e2)' }}>O que já aconteceu</h2>
          <ul className="dm-hist">
            {linhas.map((e, i) => (
              <li key={i} className={marco(e.tipo) ? 'dm-marco' : ''}>
                {/* COR SOZINHA NÃO INFORMA: o comentário interno leva a
                    palavra ao lado do carimbo, além da tarja. */}
                <div className={e.interno ? 'dm-interno' : ''}>
                  <div className="dm-q">
                    <b>{frase(e)}</b> <span className="dm-mudo">· {quando(e.em)}</span>
                    {e.interno ? <span className="dm-mudo"> · interno (só a equipe vê)</span> : null}
                  </div>
                  {e.texto ? <div className="dm-t">{e.texto}</div> : null}
                </div>
              </li>
            ))}
          </ul>
          {linhas.length === 0 ? <p className="dm-mudo dm-peq">Nada ainda.</p> : null}
          {/* HISTÓRICO CORTADO TEM QUE DIZER QUE FOI CORTADO (o teto de 200 da
              93). Fica no fim, que é onde a linha do tempo termina de ser
              lida, e diz quais faltam: os mais antigos. */}
          {eventosDeFora > 0 ? (
            <p className="dm-corte" role="status">
              Mostrando os {eventos.length} mais recentes. Outros {eventosDeFora} mais
              antigos não couberam.
            </p>
          ) : null}

          {acoes.includes('comentar') ? (
            <Escrever atende={v.eu.atende} salvando={indo}
              aoEnviar={(texto, interno) => agir('comentar', { texto, interno })} />
          ) : null}
        </div>

        {/* no celular, quando não há ação que ande com a demanda, os ajustes e
            os recados ficam num cartão em linha (o mesmo conteúdo do painel do
            desktop), e não numa barra fixa só com "Mais" */}
        {soAjustes ? (
          <div className="dm-card dm-so-celular" aria-label="Esta demanda">
            <h3 className="dm-painel-titulo">Esta demanda</h3>
            {estadoDoPainel ? <div className="dm-painel-estado">{estadoDoPainel}</div> : null}
            {ajustes.length ? (
              <div className="dm-painel-ajustes">
                {ajustes.map(a => botao(a, a === 'cancelar' ? 'dm-btn dm-txt dm-perigo' : 'dm-btn dm-txt'))}
              </div>
            ) : null}
            {podeAvisar ? <Recados d={d} base={base} eu={v.eu} /> : null}
          </div>
        ) : null}

        {/* ------------------------------------------------- o painel (desktop) */}
        <aside className="dm-card dm-painel dm-fixa dm-so-desktop" aria-label="Ações" aria-live="polite">
          {painel}
        </aside>
      </div>

      {/* --------------------------------------- a barra fixa e a folha (celular) */}
      {temBarra ? (
        <>
          {/* dois lugares, no máximo: "Mais" (que abre a folha com o resto) e
              o primário. Três botões em 320px cortavam "Destravar" em 32px
              (medido em 23/09/2026). Quando não há "Mais", o único
              secundário toma o lugar dele. */}
          <div className="dm-barra-acao" role="group" aria-label="Ações">
            {temMais ? (
              <button type="button" className="dm-btn" disabled={indo} onClick={() => setAberto('mais')}>Mais</button>
            ) : secundarias[0] ? botao(secundarias[0], secundarias[0] === 'rejeitar' ? 'dm-btn dm-perigo' : 'dm-btn') : null}
            {primaria ? botao(primaria, 'dm-btn dm-pri') : null}
          </div>
          <div className="dm-barra-espaco" />
        </>
      ) : null}
      {celular && aberto ? (
        <Folha fechar={() => setAberto('')} titulo={aberto === 'mais' ? 'Mais' : rotulo(aberto)}>
          {erro ? <Aviso tom="bad">{erro}</Aviso> : null}
          {aberto === 'mais' ? (
            <>
              {estadoDoPainel ? <div className="dm-painel-estado">{estadoDoPainel}</div> : null}
              <div className="dm-painel-acoes">
                {secundarias.map(a => botao(a, a === 'rejeitar' ? 'dm-btn dm-perigo dm-larga' : 'dm-btn dm-larga'))}
                {ajustes.map(a => botao(a, a === 'cancelar' ? 'dm-btn dm-txt dm-perigo' : 'dm-btn dm-txt'))}
              </div>
              {podeAvisar ? <Recados d={d} base={base} eu={v.eu} /> : null}
            </>
          ) : (
            <Formulario aberto={aberto} d={d} b={b} eu={v.eu} indo={indo} agir={agir} />
          )}
        </Folha>
      ) : null}
    </>
  );
}

/* "em 3 dias", "vence hoje", "18 dias de atraso", "há 2 dias" */
function prazoEmPalavras(prazo: string, sit: ReturnType<typeof situacao>, atraso: number): string {
  if (sit === 'atrasada') return `${atraso} ${atraso === 1 ? 'dia' : 'dias'} de atraso`;
  if (sit === 'hoje') return 'vence hoje';
  const dias = Math.round((Date.parse(prazo) - Date.parse(HOJE())) / 86400000);
  if (sit === 'fechada') return dias < 0 ? 'passou' : '';
  return dias === 1 ? 'amanhã' : `em ${dias} dias`;
}

/* `validacao` entra como marco (migração 91): ela fecha a etapa 5 do PDF, que
   é uma decisão de pessoa, não um recado. */
const marco = (t: string) =>
  t === 'abertura' || t === 'status' || t === 'aprovacao' || t === 'reabertura'
  || t === 'validacao';

/* a frase de cada fato mora em `lib/demandas/regras.ts` desde a 94: os avisos
   contam os mesmos fatos e precisam da mesma frase */
const frase = fraseDoEvento;

/* ---------------------------------------------------------------- a folha

   O formulário da ação, no celular, sobe do rodapé num <dialog> nativo
   (prisão de foco, Escape, devolução do foco, tudo de graça). Tocar fora
   fecha. Onde `showModal` não existe (iOS antigo), o formulário abre em
   linha, como antes. */
function Folha({ titulo, fechar, children }: { titulo: string; fechar: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (typeof d.showModal === 'function' && !d.open) d.showModal();
    d.querySelector<HTMLElement>('textarea,input,select,button.dm-pri')?.focus({ preventScroll: true });
    return () => { if (d.open) d.close(); };
  }, []);
  return (
    <dialog ref={ref} className="dm-folha" onCancel={e => { e.preventDefault(); fechar(); }}
      onClick={e => { if (e.target === e.currentTarget) fechar(); }}>
      <div className="dm-folha-in">
        <div className="dm-folha-alca" aria-hidden="true" />
        <div className="dm-folha-topo">
          <h3 className="dm-painel-titulo">{titulo}</h3>
          <button type="button" className="dm-btn dm-txt dm-mini" onClick={fechar}>Deixa pra lá</button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

/* ------------------------------------------------------------- escrever

   A caixa de comentário fica no FIM do histórico, que é onde se responde. É
   uma linha de 46px que cresce ao focar ou quando já tem texto; o botão
   nasce quieto e vira primário quando há o que enviar. Não apaga o texto
   quando o servidor recusa. A caixinha "Só para a equipe" só existe para
   quem atende, porque o servidor ignora a chave para os outros. */
function Escrever({ atende, salvando, aoEnviar }: {
  atende: boolean; salvando: boolean;
  aoEnviar: (texto: string, interno: boolean) => Promise<boolean>;
}) {
  const [t, setT] = useState('');
  const [foco, setFoco] = useState(false);
  const [interno, setInterno] = useState(false);
  const teto = tetoDe('comentar');
  const aberta = foco || t.length > 0;
  const sobra = teto - t.length;
  return (
    <div className={aberta ? 'dm-card dm-escrever dm-aberta' : 'dm-card dm-escrever'}>
      <Campo rot="Escrever alguma coisa">
        <textarea value={t} maxLength={teto} placeholder="Escrever…" rows={1}
          onFocus={() => setFoco(true)} onBlur={() => setFoco(false)}
          onChange={e => setT(e.target.value)} />
      </Campo>
      {sobra < 300 ? <div className="dm-peq dm-mudo" role="status">{sobra} letra{sobra === 1 ? '' : 's'} restante{sobra === 1 ? '' : 's'}</div> : null}
      {aberta ? (
        <div className="dm-entre">
          {atende ? (
            <label className="dm-caixinha dm-peq">
              <input type="checkbox" checked={interno} onChange={e => setInterno(e.target.checked)} />
              Só para a equipe (quem pediu não vê)
            </label>
          ) : <span />}
          <button type="button" className="dm-btn dm-pri" disabled={salvando || !t.trim()}
            onClick={async () => { if (await aoEnviar(t.trim(), interno)) { setT(''); setInterno(false); } }}>
            {salvando ? 'Salvando…' : 'Comentar'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- recados */
function recadoDe(d: Vista['demanda'], eu: Vista['eu']) {
  const alvo = eu.atende
    ? { nome: d.abriu, tel: d.abriu_telefone, quem: 'quem pediu' }
    : { nome: d.responsavel || '', tel: d.resp_telefone, quem: 'quem atende' };
  const tipo = d.status === 'concluida' ? 'pronta'
    : d.status === 'travada' && d.travada_por === 'informacao' ? 'pergunta'
    : 'mudou';
  return { ...alvo, tipo, zap: linkZap(alvo.tel, '') };
}
function Recados({ d, base, eu }: { d: Vista['demanda']; base: string; eu: Vista['eu'] }) {
  const alvo = recadoDe(d, eu);
  const texto = recado(d, base, alvo.tipo as never);
  const zap = linkZap(alvo.tel, texto);
  if (!zap && !alvo.nome) return null;
  return (
    <div className="dm-painel-secao">
      <div className="dm-rot" style={{ marginBottom: 'var(--dm-e1)' }}>Avisar {alvo.quem}</div>
      <div className="dm-painel-acoes">
        {zap
          ? <a className="dm-btn dm-zap dm-larga" href={zap} target="_blank" rel="noopener noreferrer">
              WhatsApp para {alvo.nome.split(' ')[0]}
            </a>
          : <span className="dm-peq dm-mudo">{alvo.nome || 'Essa pessoa'} não tem telefone cadastrado.</span>}
        <Copiar texto={texto} rot="Copiar o recado" />
      </div>
    </div>
  );
}

/* -------------------------------------------- o formulário da ação aberta */
function Formulario({ aberto, d, b, eu, indo, agir }: {
  aberto: Acao | ''; d: Vista['demanda']; b: Bases | null; eu: Vista['eu']; indo: boolean;
  /* devolve `false` quando o servidor recusou, e é assim que a `CaixaDeAcao`
     sabe que NÃO pode apagar o que a pessoa escreveu */
  agir: (a: Acao, dados?: Record<string, unknown>) => Promise<boolean>;
}) {
  const [motivo, setMotivo] = useState<'informacao' | 'aprovacao' | 'terceiros'>('informacao');
  const [prazo, setPrazo] = useState(d.prazo || '');
  const [prio, setPrio] = useState(d.prioridade);
  const [setor, setSetor] = useState(d.setor_responsavel_id);
  const [url, setUrl] = useState('');
  const [urlErro, setUrlErro] = useState('');
  const [atraso, setAtraso] = useState('');

  if (!aberto || aberto === 'comentar') return null;
  /* o "Deixa pra lá" mora no topo do painel e da folha; aqui só o que a ação
     precisa */
  const fecha = null;

  if (aberto === 'concluir') {
    /* `HOJE()` E NAO `toISOString()` — 22/09/2026.

       `new Date().toISOString()` e SEMPRE UTC. Das 21h do Rio a meia-noite a
       tela pedia motivo de atraso de uma demanda que vence HOJE. O servidor
       usa `demandas.hoje()`, que e o dia do Rio; `HOJE()` e o mesmo remedio
       deste lado, e ja estava neste arquivo para outras contas. */
    const tarde = !!d.prazo && d.prazo < HOJE();
    /* "OPCIONAL" ERA MENTIRA, E RECUSAVA TODA CONCLUSAO ATRASADA.

       `supabase/86` recusa concluir sem `atraso` quando o prazo ja passou:
       `ATRASO_PRECISA_MOTIVO`. O campo aparecia JUSTAMENTE porque a demanda
       esta atrasada, dizia "Opcional", e o botao ficava habilitado so com a
       conclusao preenchida. Toda conclusao atrasada era recusada uma vez.

       O "Deixa pra la" tambem sumia quando `tarde`, porque o `extra` e um so:
       era ou o campo ou o botao de fechar. Agora sao os dois. */
    return (
      <CaixaDeAcao rot="O que foi feito" botao="Concluir" salvando={indo} teto={tetoDe('concluir')}
        dica="A conclusão precisa dizer o que foi realizado. É o que quem pediu vai ler."
        podeEnviar={!tarde || !!atraso.trim()}
        extra={tarde ? (
          <>
            <Campo rot="Por que atrasou"
              ajuda="Obrigatório: esta demanda passou do prazo, e o servidor não conclui sem isto.">
              <input value={atraso} maxLength={tetoDe('atraso')}
                onChange={e => setAtraso(e.target.value)} />
            </Campo>
            {fecha}
          </>
        ) : fecha}
        aoEnviar={t => agir('concluir', { texto: t, atraso })} />
    );
  }
  if (aberto === 'travar') {
    return (
      <div className="dm-card">
        {/* O SELETOR OFERECIA UMA TRAVA QUE O SERVIDOR RECUSA — 22/09/2026.

            `supabase/85` recusa `motivo = 'aprovacao'` quando a demanda JA foi
            aprovada e quem pede nao e lideranca: `SO_GESTOR_REABRE_APROVACAO`.
            Estado normalissimo — demanda aprovada, em execucao, quem atende
            quer devolver para a lideranca. `acoesDe` nao tem como cobrir, ela
            decide por ACAO e nunca por motivo. Quem cobre e o seletor. */}
        <Campo rot="Por que está travada">
          <select value={motivo} onChange={e => setMotivo(e.target.value as never)}>
            {TRAVAS.filter(t => t.v !== 'aprovacao'
                             || d.aprovacao !== 'aprovada'
                             || quemManda(eu.papel))
                   .map(t => <option key={t.v} value={t.v}>{t.rot}</option>)}
          </select>
        </Campo>
        <CaixaDeAcao rot="O que falta, exatamente" botao="Travar" salvando={indo}
          teto={tetoDe('travar')}
          dica="Quem pediu vai ler isto. Seja específico: “qual sala?” resolve; “falta informação” não."
          extra={fecha}
          aoEnviar={t => agir('travar', { motivo, texto: t })} />
      </div>
    );
  }
  if (aberto === 'destravar') {
    return (
      <CaixaDeAcao rot={eu.abriu ? 'A sua resposta' : 'O que destravou'} botao="Destravar"
        salvando={indo} exigeTexto={false} extra={fecha} teto={tetoDe('destravar')}
        aoEnviar={t => agir('destravar', { texto: t })} />
    );
  }
  if (aberto === 'cancelar') {
    return (
      <CaixaDeAcao rot="Por que cancelar" botao="Cancelar a demanda" tom="perigo" salvando={indo} teto={tetoDe('cancelar')}
        dica="Fica no histórico. Cancelar sem motivo é perder a informação de por que não foi feito."
        extra={fecha} aoEnviar={t => agir('cancelar', { texto: t })} />
    );
  }
  if (aberto === 'reabrir') {
    return (
      <CaixaDeAcao rot="O que não ficou resolvido" botao="Reabrir" salvando={indo} teto={tetoDe('reabrir')}
        dica="A demanda volta para execução com o histórico inteiro." extra={fecha}
        aoEnviar={t => agir('reabrir', { texto: t })} />
    );
  }
  if (aberto === 'aprovar') {
    return (
      <CaixaDeAcao rot="Observação da aprovação" botao="Aprovar" salvando={indo} exigeTexto={false} teto={tetoDe('aprovar')}
        dica="Depois disto o setor responsável pode começar." extra={fecha}
        aoEnviar={t => agir('aprovar', { texto: t })} />
    );
  }
  if (aberto === 'rejeitar') {
    return (
      <CaixaDeAcao rot="Por que não aprovar" botao="Recusar" tom="perigo" salvando={indo} teto={tetoDe('rejeitar')}
        dica="A demanda é encerrada com este motivo, e quem pediu lê." extra={fecha}
        aoEnviar={t => agir('rejeitar', { texto: t })} />
    );
  }
  if (aberto === 'prazo') {
    /* BECO SEM SAIDA GARANTIDO — 22/09/2026.

       `supabase/86` recusa tirar o prazo sem motivo: `SEM_PRAZO_PRECISA_MOTIVO`,
       que a tela traduz como "Para tirar o prazo, diga por que". So que aqui
       nao havia NENHUM campo de texto, entao nao havia onde dizer.

       E nao era caso de borda: `prazo` nasce com `d.prazo || ''`, entao numa
       demanda SEM prazo bastava abrir o formulario e tocar em Gravar, sem ter
       mexido em nada, para cair no erro sem saida.

       `/demandas/nova` ja tinha o par "Nao tenho data" + "Por que nao tem
       data". Esta tela nao tinha recebido o par. */
    const tirando = !prazo;
    return (
      <div className="dm-card">
        <Campo rot="Novo prazo"
          ajuda="Deixe em branco para tirar a data. O registro retroativo é aceito: data no passado vale.">
          {/* SEM `min`: a 89 deixou registrado por que. O servidor aceita data
              no passado DE PROPOSITO ("a lampada queimou semana passada, poe
              ai"), e no seletor nativo do celular a roda nao desce abaixo do
              `min` — nao existe "digitar". */}
          <input type="date" value={prazo} onChange={e => setPrazo(e.target.value)} />
        </Campo>
        {tirando ? (
          <CaixaDeAcao rot="Por que fica sem data" botao="Gravar sem data" salvando={indo}
            teto={tetoDe('sem_prazo')} extra={fecha}
            dica="“Não sei quando” serve. O que não serve é sumir com a data sem dizer nada."
            aoEnviar={t => agir('prazo', { prazo: '', texto: t })} />
        ) : (
          <div className="dm-linha">
            <button className="dm-btn dm-pri dm-cresce" disabled={indo}
              onClick={() => agir('prazo', { prazo })}>Gravar</button>
            {fecha}
          </div>
        )}
      </div>
    );
  }
  if (aberto === 'prioridade') {
    return (
      <div className="dm-card">
        <Campo rot="Prioridade" ajuda={PRIORIDADES.find(p => p.v === prio)?.explica}>
          <select value={prio} onChange={e => setPrio(e.target.value as never)}>
            {PRIORIDADES.map(p => <option key={p.v} value={p.v}>{p.rot}</option>)}
          </select>
        </Campo>
        {prio === 'urgente' ? (
          <CaixaDeAcao rot="O que acontece se não for feito" botao="Gravar" salvando={indo} extra={fecha}
            teto={tetoDe('prioridade')}
            aoEnviar={t => agir('prioridade', { prioridade: prio, texto: t })} />
        ) : (
          <div className="dm-linha">
            <button className="dm-btn dm-pri dm-cresce" disabled={indo}
              onClick={() => agir('prioridade', { prioridade: prio })}>Gravar</button>
            {fecha}
          </div>
        )}
      </div>
    );
  }
  if (aberto === 'redirecionar') {
    return (
      <div className="dm-card">
        <Campo rot="Qual setor vai atender" ajuda="Só aparecem os setores que recebem demanda.">
          <select value={setor} onChange={e => setSetor(e.target.value)}>
            {(b?.setores || []).filter(s => s.atende).map(s => (
              <option key={s.id} value={s.id}>{s.nome}</option>
            ))}
          </select>
        </Campo>
        <div className="dm-linha">
          <button className="dm-btn dm-pri dm-cresce" disabled={indo} onClick={() => agir('redirecionar', { setor })}>
            Mandar
          </button>
          {fecha}
        </div>
      </div>
    );
  }
  if (aberto === 'anexar') {
    /* 95 · a mesma regra do banco, lida antes: o site fora da lista é dito
       aqui, com o nome dele, e o toque em Juntar nem sai. Quem decide
       continua sendo `dem_mover`, que responde SITE_NAO_PERMITIDO igual. */
    const juntar = () => {
      const u = url.trim();
      if (!siteDoLink(u)) { setUrlErro('Cole o link inteiro, começando com https://'); return; }
      const recusado = siteRecusado(u, b?.anexos);
      if (recusado) { setUrlErro(recadoDeSite(recusado)); return; }
      agir('anexar', { url: u, nome: u.split('/').pop() });
    };
    return (
      <div className="dm-card">
        <Campo rot="Link do arquivo" ajuda={dicaDeAnexo(b?.anexos)}>
          <input value={url} placeholder="https://…" inputMode="url"
            aria-invalid={urlErro ? true : undefined}
            onChange={e => { setUrl(e.target.value); setUrlErro(''); }} />
        </Campo>
        {urlErro ? <p className="dm-peq dm-erro-campo" role="alert">{urlErro}</p> : null}
        <div className="dm-linha">
          <button className="dm-btn dm-pri dm-cresce" disabled={indo || !url.trim()} onClick={juntar}>Juntar</button>
          {fecha}
        </div>
      </div>
    );
  }
  return null;
}

/* ------------------------------------------------------ quem acompanha

   94 · "demandas em que ele seja explicitamente participante". A pessoa
   incluída passa a ver a demanda e a conversar nela, e só nela. QUEM INCLUI
   é decidido pelo servidor (`eu.inclui`), e a pessoa é achada pelo E-MAIL ou
   pelo WHATSAPP exatos, nunca por nome. Sair é sempre possível para o
   próprio participante; ao sair, a tela o leva para o Início.

   UMA LINHA, E O FORMULÁRIO A UM TOQUE — 23/09/2026. O formulário sempre
   aberto custava 300px em toda ficha, para uma ação rara. */
function Acompanham({ v, indo, agir, sair }: {
  v: Vista; indo: boolean;
  agir: (a: Acao, d?: Record<string, unknown>) => Promise<boolean>;
  sair: () => void;
}) {
  const [quem, setQuem] = useState('');
  const [abrindo, setAbrindo] = useState(false);
  /* WhatsApp primeiro, porque é o que a igreja sabe de cor; cada um com o
     seu teclado */
  const [por, setPor] = useState<'tel' | 'email'>('tel');
  const ps = v.participantes || [];
  const pode = !!v.eu.inclui;
  if (!ps.length && !pode) return null;
  return (
    <div className="dm-acompanha-bloco">
      <div className="dm-acompanha">
        <span className="dm-rot">Quem acompanha</span>
        {ps.length ? ps.map(p => (
          <span key={p.id} className="dm-linha" style={{ gap: 4 }}>
            {p.nome}{p.eu ? ' (você)' : ''}
            {pode || p.eu ? (
              <button className="dm-btn dm-txt dm-mini" disabled={indo}
                onClick={async () => {
                  const deu = await agir('tirar', { membro_id: p.id });
                  if (deu && p.eu && !v.eu.abriu && !v.eu.atende) sair();
                }}>{p.eu ? 'sair' : 'tirar'}</button>
            ) : null}
          </span>
        )) : <span className="dm-mudo">Só quem pediu e quem atende.</span>}
        {pode ? (
          <button type="button" className="dm-btn dm-txt dm-mini" aria-expanded={abrindo}
            onClick={() => setAbrindo(x => !x)}>{abrindo ? 'Fechar' : <span className="dm-seta">Incluir alguém</span>}</button>
        ) : null}
      </div>
      {pode && abrindo ? (
        <form className="dm-card" onSubmit={async e => {
          e.preventDefault();
          if (await agir('incluir', { quem: quem.trim() })) { setQuem(''); setAbrindo(false); }
        }}>
          <Opcoes rot="Incluir pelo" valor={por}
            opcoes={[{ v: 'tel', rot: 'WhatsApp' }, { v: 'email', rot: 'E-mail' }]}
            aoMudar={x => { setPor(x); setQuem(''); }} />
          <div style={{ marginTop: 'var(--dm-e2)' }}>
            <Campo rot={por === 'tel' ? 'WhatsApp da pessoa' : 'E-mail da pessoa'} classe="dm-curto"
              ajuda="Só quem já tem cadastro. Ela passa a ver esta demanda.">
              {por === 'tel'
                ? <input key="tel" type="tel" inputMode="tel" value={quem} onChange={e => setQuem(e.target.value)} autoComplete="off" />
                : <input key="email" type="email" inputMode="email" value={quem} onChange={e => setQuem(e.target.value)} autoComplete="off" />}
            </Campo>
          </div>
          <div className="dm-linha">
            <button className="dm-btn dm-pri" disabled={indo || !quem.trim()}>Incluir</button>
            <button type="button" className="dm-btn dm-txt" onClick={() => setAbrindo(false)}>Deixa pra lá</button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
