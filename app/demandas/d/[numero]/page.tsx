'use client';
/* UMA DEMANDA.

   Três camadas, nesta ordem: o que está acontecendo AGORA (e o que destrava),
   o que foi pedido, e o histórico. O histórico fica por último de propósito —
   quem abre esta tela quer saber o que fazer, não ler o passado.

   Os botões vêm de `acoesDe`, que é o espelho testado de `dem_mover`. Nenhum
   botão é desenhado à mão aqui: se aparecer um que o servidor recusa, o teste
   da matriz quebra antes de chegar em produção. */

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Casca from '@/components/demandas/Casca';
import { Aviso, CaixaDeAcao, Campo, Copiar, Esqueleto, Pill } from '@/components/demandas/Ui';
import { bases, mover, ver } from '@/lib/demandas/api';
import {
  PRIORIDADES, TRAVAS, acoesDe, comoOPdfChama, dataCheia, dataCurta, diasDeAtraso,
  dinheiro, linkZap, quando, recado, recadoDoErro, rotPrioridade, rotStatus, rotTrava,
  situacao, tomPill, tomPrioridade, type Acao,
} from '@/lib/demandas/regras';
import type { Bases, Vista } from '@/lib/demandas/tipos';

export default function Pagina() {
  return <Casca><Uma /></Casca>;
}

function Uma() {
  const params = useParams<{ numero: string }>();
  const router = useRouter();
  const numero = Number(params?.numero);
  const [v, setV] = useState<Vista | null>(null);
  const [b, setB] = useState<Bases | null>(null);
  const [erro, setErro] = useState('');
  const [aberto, setAberto] = useState<Acao | ''>('');
  const [indo, setIndo] = useState(false);

  const carregar = useCallback(async () => {
    const r = await ver(numero);
    if (!r.ok) { setErro(recadoDoErro(r)); setV(null); return; }
    setErro(''); setV({ demanda: r.demanda, eu: r.eu, eventos: r.eventos, anexos: r.anexos });
  }, [numero]);

  useEffect(() => { if (Number.isFinite(numero)) carregar(); }, [numero, carregar]);
  useEffect(() => { bases().then(x => { if (x.ok) setB({ setores: x.setores, categorias: x.categorias, membros: x.membros }); }); }, []);

  async function agir(acao: Acao, dados: Record<string, unknown> = {}) {
    setIndo(true); setErro('');
    const r = await mover(numero, acao, dados);
    setIndo(false);
    if (!r.ok) { setErro(recadoDoErro(r)); return; }
    setAberto('');
    await carregar();
  }

  const acoes = useMemo(
    () => (v ? acoesDe(v.demanda, v.eu) : []),
    [v]);

  if (erro && !v) {
    return (
      <>
        <Aviso tom="bad">{erro}</Aviso>
        <Link className="dm-btn" href="/demandas">Voltar para a lista</Link>
      </>
    );
  }
  if (!v) return <Esqueleto />;

  const d = v.demanda;
  const sit = situacao(d);
  const atraso = diasDeAtraso(d.prazo);
  /* a raiz do SISTEMA, não do site: os links que saem daqui pelo WhatsApp
     precisam cair em /demandas, e não na home da igreja */
  const base = typeof window !== 'undefined' ? window.location.origin + '/demandas' : '';

  return (
    <>
      <Link className="dm-peq dm-mudo" href="/demandas" style={{ textDecoration: 'none' }}>{'<'} todas as demandas</Link>

      <div style={{ margin: 'var(--dm-e2) 0 var(--dm-e3)' }}>
        <div className="dm-rot">{'>'} demanda #{d.numero} · {d.grupo} · {d.categoria}</div>
        <h1 style={{ marginTop: 6 }}>{d.titulo}</h1>
        <div className="dm-linha" style={{ marginTop: 'var(--dm-e2)' }}>
          <Pill tom={tomPill(d.status)}>
            <span className={`dm-ponto ${tomPill(d.status) ? 'dm-' + tomPill(d.status) : ''}`} />
            {comoOPdfChama(d)}
          </Pill>
          <Pill tom={tomPrioridade(d.prioridade)}>{rotPrioridade(d.prioridade)}</Pill>
          {sit === 'atrasada' ? <Pill tom="bad">{atraso} {atraso === 1 ? 'dia' : 'dias'} de atraso</Pill> : null}
          {sit === 'parada' ? <Pill tom="warn">parada há {d.parada_dias} dias</Pill> : null}
          {d.reaberturas > 0 ? <Pill tom="warn">reaberta {d.reaberturas}×</Pill> : null}
        </div>
      </div>

      {erro ? <Aviso tom="bad">{erro}</Aviso> : null}

      {/* ---------------------------------------------------- o que acontece */}
      {d.status === 'travada' ? (
        <Aviso tom="warn">
          <div>
            <b>{rotTrava(d.travada_por)}.</b>{d.travada_nota ? ` ${d.travada_nota}` : ''}
            {d.travada_por === 'informacao' && v.eu.abriu
              ? <> Responda aqui embaixo e a demanda volta a andar.</>
              : null}
          </div>
        </Aviso>
      ) : null}
      {d.status === 'concluida' ? (
        <Aviso tom="ok">
          <div>
            <b>Concluída</b> {quando(d.concluida_em)}. {d.conclusao}
            {d.atraso_motivo ? <> <span className="dm-mudo">(atrasou: {d.atraso_motivo})</span></> : null}
          </div>
        </Aviso>
      ) : null}
      {d.status === 'cancelada' ? (
        <Aviso tom="bad"><div><b>Cancelada.</b> {d.cancelada_motivo}</div></Aviso>
      ) : null}

      <div className="dm-dupla">
        {/* ------------------------------------------------------- o pedido */}
        <div>
          <div className="dm-card">
            <h3 style={{ marginBottom: 8 }}>O que foi pedido</h3>
            <p style={{ whiteSpace: 'pre-wrap' }}>{d.descricao}</p>
            {d.objetivo ? <p className="dm-peq dm-mudo">Objetivo: {d.objetivo}</p> : null}
            {d.impacto ? <p className="dm-peq"><b>Impacto:</b> {d.impacto}</p> : null}

            <table className="dm-tab" style={{ marginTop: 'var(--dm-e2)' }}>
              <tbody>
                <Li rot="Quem pediu" v={`${d.abriu} · ${d.solicitante}`} />
                <Li rot="Quem atende" v={d.responsavel ? `${d.responsavel} · ${d.responsavel_setor}` : `${d.responsavel_setor} (ninguém assumiu)`} />
                <Li rot="Prazo" v={d.prazo ? dataCheia(d.prazo) : `sem data — ${d.sem_prazo_porque || 'sem justificativa'}`} />
                {d.evento ? <Li rot="Evento" v={`${d.evento} · ${dataCheia(d.evento_data)}`} /> : null}
                {d.local ? <Li rot="Onde" v={d.local} /> : null}
                {d.publico ? <Li rot="Público" v={d.publico} /> : null}
                {d.orcamento !== null ? <Li rot="Orçamento" v={dinheiro(d.orcamento)} /> : null}
                {d.aprovacao ? <Li rot="Aprovação" v={`${d.aprovacao}${d.aprovacao_nota ? ` — ${d.aprovacao_nota}` : ''}`} /> : null}
                <Li rot="Aberta" v={quando(d.criada_em)} />
              </tbody>
            </table>
          </div>

          {v.anexos.length ? (
            <div className="dm-card">
              <h3 style={{ marginBottom: 8 }}>Anexos</h3>
              <ul className="dm-peq" style={{ margin: 0, paddingLeft: 18 }}>
                {v.anexos.map((a, i) => (
                  <li key={i}><a href={a.url} target="_blank" rel="noopener noreferrer">{a.nome}</a></li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* --------------------------------------------------- o WhatsApp */}
          <Recados d={d} base={base} eu={v.eu} />
        </div>

        {/* ------------------------------------------------------- as ações */}
        <div>
          <div className="dm-card">
            <h3 style={{ marginBottom: 10 }}>O que dá para fazer</h3>
            <div className="dm-grade">
              {acoes.includes('aprovar') ? (
                <button className="dm-btn dm-pri" disabled={indo} onClick={() => setAberto('aprovar')}>Aprovar</button>
              ) : null}
              {acoes.includes('rejeitar') ? (
                <button className="dm-btn dm-perigo" disabled={indo} onClick={() => setAberto('rejeitar')}>Recusar</button>
              ) : null}
              {acoes.includes('assumir') ? (
                <button className="dm-btn dm-pri" disabled={indo} onClick={() => agir('assumir')}>Assumir e começar</button>
              ) : null}
              {acoes.includes('concluir') ? (
                <button className="dm-btn dm-pri" disabled={indo} onClick={() => setAberto('concluir')}>Concluir</button>
              ) : null}
              {acoes.includes('travar') ? (
                <button className="dm-btn" disabled={indo} onClick={() => setAberto('travar')}>Travar</button>
              ) : null}
              {acoes.includes('destravar') ? (
                <button className="dm-btn dm-pri" disabled={indo} onClick={() => setAberto('destravar')}>
                  {v.eu.abriu && d.travada_por === 'informacao' ? 'Responder e destravar' : 'Destravar'}
                </button>
              ) : null}
              {acoes.includes('reabrir') ? (
                <button className="dm-btn" disabled={indo} onClick={() => setAberto('reabrir')}>Reabrir</button>
              ) : null}
              {acoes.includes('prazo') ? (
                <button className="dm-btn" disabled={indo} onClick={() => setAberto('prazo')}>Mudar o prazo</button>
              ) : null}
              {acoes.includes('prioridade') ? (
                <button className="dm-btn" disabled={indo} onClick={() => setAberto('prioridade')}>Rever a prioridade</button>
              ) : null}
              {acoes.includes('redirecionar') ? (
                <button className="dm-btn" disabled={indo} onClick={() => setAberto('redirecionar')}>Mandar para outro setor</button>
              ) : null}
              {acoes.includes('anexar') ? (
                <button className="dm-btn" disabled={indo} onClick={() => setAberto('anexar')}>Juntar um anexo</button>
              ) : null}
              {acoes.includes('cancelar') ? (
                <button className="dm-btn dm-perigo" disabled={indo} onClick={() => setAberto('cancelar')}>Cancelar</button>
              ) : null}
            </div>
          </div>

          <Formulario aberto={aberto} d={d} b={b} eu={v.eu} indo={indo}
            fechar={() => setAberto('')} agir={agir} />

          <CaixaDeAcao rot="Escrever alguma coisa" botao="Comentar" salvando={indo}
            dica={v.eu.atende ? 'Marque como interno o que for combinação da equipe.' : undefined}
            aoEnviar={t => agir('comentar', { texto: t })} />
        </div>
      </div>

      {/* --------------------------------------------------------- histórico */}
      <h2 style={{ margin: 'var(--dm-e4) 0 var(--dm-e2)' }}>O que já aconteceu</h2>
      <ul className="dm-hist">
        {v.eventos.map((e, i) => (
          <li key={i} className={marco(e.tipo) ? 'marco' : ''}>
            <div className={e.interno ? 'interno' : ''}>
              <div className="dm-q">{frase(e)} <span className="dm-mudo">· {quando(e.em)}</span></div>
              {e.texto ? <div className="dm-t">{e.texto}</div> : null}
            </div>
          </li>
        ))}
      </ul>
      {v.eventos.length === 0 ? <p className="dm-mudo dm-peq">Nada ainda.</p> : null}

      <button className="dm-btn" style={{ marginTop: 'var(--dm-e3)' }} onClick={() => router.push('/demandas')}>
        Voltar para a lista
      </button>
    </>
  );
}

function Li({ rot, v }: { rot: string; v: string }) {
  return <tr><th style={{ width: '38%', paddingTop: 10 }}>{rot}</th><td>{v}</td></tr>;
}

const marco = (t: string) => t === 'abertura' || t === 'status' || t === 'aprovacao' || t === 'reabertura';

function frase(e: { tipo: string; de: string | null; para: string | null; quem: string | null }): string {
  const q = e.quem ? e.quem.split(' ')[0] : 'alguém';
  switch (e.tipo) {
    case 'abertura':    return `${q} abriu a demanda`;
    case 'status':      return `${q} mudou de ${rotStatus((e.de || 'aberta') as never)} para ${rotStatus((e.para || 'aberta') as never)}`;
    case 'responsavel': return e.para ? `${q} passou para ${e.para}` : `${q} soltou o responsável`;
    case 'setor':       return `${q} mandou de ${e.de} para ${e.para}`;
    case 'prazo':       return `${q} mudou o prazo${e.de ? ` de ${dataCurta(e.de)}` : ''} para ${e.para ? dataCurta(e.para) : 'sem data'}`;
    case 'prioridade':  return `${q} mudou a prioridade de ${e.de} para ${e.para}`;
    case 'aprovacao':   return `${q} marcou a aprovação como ${e.para}`;
    case 'reabertura':  return `${q} reabriu`;
    case 'anexo':       return `${q} juntou um anexo`;
    case 'comentario':  return `${q} escreveu`;
    default:            return `${q}: ${e.tipo}`;
  }
}

/* ---------------------------------------------------------------- recados */
function Recados({ d, base, eu }: {
  d: Vista['demanda']; base: string; eu: Vista['eu'];
}) {
  const alvo = eu.atende
    ? { nome: d.abriu, tel: d.abriu_telefone, quem: 'quem pediu' }
    : { nome: d.responsavel || '', tel: d.resp_telefone, quem: 'quem atende' };
  const tipo = d.status === 'concluida' ? 'pronta'
    : d.status === 'travada' && d.travada_por === 'informacao' ? 'pergunta'
    : 'mudou';
  const texto = recado(d, base, tipo as never);
  const zap = linkZap(alvo.tel, texto);
  if (!zap && !alvo.nome) return null;
  return (
    <div className="dm-card">
      <h3 style={{ marginBottom: 6 }}>Avisar {alvo.quem}</h3>
      <p className="dm-peq dm-mudo">O recado já vem escrito, com o link direto desta demanda.</p>
      <div className="dm-linha">
        {zap
          ? <a className="dm-btn dm-zap" href={zap} target="_blank" rel="noopener noreferrer">
              Mandar para {alvo.nome.split(' ')[0]}
            </a>
          : <span className="dm-peq dm-mudo">{alvo.nome || 'Essa pessoa'} não tem telefone cadastrado.</span>}
        <Copiar texto={texto} rot="Copiar o recado" />
      </div>
    </div>
  );
}

/* -------------------------------------------- o formulário da ação aberta */
function Formulario({ aberto, d, b, eu, indo, fechar, agir }: {
  aberto: Acao | ''; d: Vista['demanda']; b: Bases | null; eu: Vista['eu']; indo: boolean;
  fechar: () => void; agir: (a: Acao, dados?: Record<string, unknown>) => void;
}) {
  const [motivo, setMotivo] = useState<'informacao' | 'aprovacao' | 'terceiros'>('informacao');
  const [prazo, setPrazo] = useState(d.prazo || '');
  const [prio, setPrio] = useState(d.prioridade);
  const [setor, setSetor] = useState(d.setor_responsavel_id);
  const [url, setUrl] = useState('');
  const [atraso, setAtraso] = useState('');

  if (!aberto || aberto === 'comentar') return null;
  const fecha = <button className="dm-btn dm-peq" onClick={fechar}>Deixa pra lá</button>;

  if (aberto === 'concluir') {
    const tarde = !!d.prazo && d.prazo < new Date().toISOString().slice(0, 10);
    return (
      <CaixaDeAcao rot="O que foi feito" botao="Concluir" salvando={indo}
        dica="A conclusão precisa dizer o que foi realizado. É o que quem pediu vai ler."
        extra={tarde ? (
          <Campo rot="Por que atrasou" ajuda="Opcional, e é o que faz o relatório de atrasos servir para alguma coisa.">
            <input value={atraso} onChange={e => setAtraso(e.target.value)} />
          </Campo>
        ) : fecha}
        aoEnviar={t => agir('concluir', { texto: t, atraso })} />
    );
  }
  if (aberto === 'travar') {
    return (
      <div className="dm-card">
        <Campo rot="Por que está travada">
          <select value={motivo} onChange={e => setMotivo(e.target.value as never)}>
            {TRAVAS.map(t => <option key={t.v} value={t.v}>{t.rot}</option>)}
          </select>
        </Campo>
        <CaixaDeAcao rot="O que falta, exatamente" botao="Travar" salvando={indo}
          dica="Quem pediu vai ler isto. Seja específico: “qual sala?” resolve; “falta informação” não."
          extra={fecha}
          aoEnviar={t => agir('travar', { motivo, texto: t })} />
      </div>
    );
  }
  if (aberto === 'destravar') {
    return (
      <CaixaDeAcao rot={eu.abriu ? 'A sua resposta' : 'O que destravou'} botao="Destravar"
        salvando={indo} exigeTexto={false} extra={fecha}
        aoEnviar={t => agir('destravar', { texto: t })} />
    );
  }
  if (aberto === 'cancelar') {
    return (
      <CaixaDeAcao rot="Por que cancelar" botao="Cancelar a demanda" tom="perigo" salvando={indo}
        dica="Fica no histórico. Cancelar sem motivo é perder a informação de por que não foi feito."
        extra={fecha} aoEnviar={t => agir('cancelar', { texto: t })} />
    );
  }
  if (aberto === 'reabrir') {
    return (
      <CaixaDeAcao rot="O que não ficou resolvido" botao="Reabrir" salvando={indo}
        dica="A demanda volta para execução com o histórico inteiro." extra={fecha}
        aoEnviar={t => agir('reabrir', { texto: t })} />
    );
  }
  if (aberto === 'aprovar') {
    return (
      <CaixaDeAcao rot="Observação da aprovação" botao="Aprovar" salvando={indo} exigeTexto={false}
        dica="Depois disto o setor responsável pode começar." extra={fecha}
        aoEnviar={t => agir('aprovar', { texto: t })} />
    );
  }
  if (aberto === 'rejeitar') {
    return (
      <CaixaDeAcao rot="Por que não aprovar" botao="Recusar" tom="perigo" salvando={indo}
        dica="A demanda é encerrada com este motivo, e quem pediu lê." extra={fecha}
        aoEnviar={t => agir('rejeitar', { texto: t })} />
    );
  }
  if (aberto === 'prazo') {
    return (
      <div className="dm-card">
        <Campo rot="Novo prazo">
          <input type="date" value={prazo} onChange={e => setPrazo(e.target.value)} />
        </Campo>
        <div className="dm-linha">
          <button className="dm-btn dm-pri dm-cresce" disabled={indo} onClick={() => agir('prazo', { prazo })}>Gravar</button>
          {fecha}
        </div>
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
    return (
      <div className="dm-card">
        <Campo rot="Link do arquivo">
          <input value={url} placeholder="https://…" onChange={e => setUrl(e.target.value)} />
        </Campo>
        <div className="dm-linha">
          <button className="dm-btn dm-pri dm-cresce" disabled={indo || !url.trim()}
            onClick={() => agir('anexar', { url: url.trim(), nome: url.trim().split('/').pop() })}>Juntar</button>
          {fecha}
        </div>
      </div>
    );
  }
  return null;
}
