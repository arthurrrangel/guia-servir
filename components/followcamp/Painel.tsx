'use client';
/* =============================================================================
   O PAINEL DO FOLLOW CAMP 2027 — 04/10/2026 (migração 110)

   O Arthur: "preciso que o próprio site informe tudo o que foi pago, qual
   valor foi pago e tudo mais, tudo 100% organizado". Mora na Administração
   das Demandas (a mesma porta, a mesma pessoa única da 96), em
   /demandas/admin/followcamp, e /followcamp/painel leva para cá.

   A ORDEM É A DAS PERGUNTAS DE QUEM ORGANIZA
     1. quantos vão, quanto entrou, quanto falta (a faixa de números);
     2. o que espera um toque meu: os avisos de "paguei" A CONFERIR na Stone;
     3. cada campista, com a situação dele;
     4. o livro do dinheiro inteiro;
     5. lançar o que chegou fora do site (dinheiro, ficha do WhatsApp).

   O QUE ESTA TELA PODE AFIRMAR: "Recebido" é só pagamento CONFERIDO. O aviso
   que a pessoa deu pelo site fica em "A conferir", em outra cor, e não entra
   no recebido até alguém achar o dinheiro na Stone. As contas moram em
   lib/followcamp-painel.ts, com teste.
   ============================================================================= */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useEu } from '@/components/demandas/Casca';
import { Aviso, Cabecalho, Campo, Esqueleto, Kpi, Kpis, Opcoes, Pill, Secao, Subabas, Vazio, useEstreito } from '@/components/demandas/Ui';
import {
  lerPainel, lancarFicha, cancelarFicha, registrarPagamento, ajustarPagamento, apagarPagamento, verComprovantes, definirPlano,
  type DadosDoPainel, type ComprovanteDoBanco,
} from '@/lib/followcamp-painel-api';
import {
  resumoDe, situacaoDe, ordenarSituacoes, csvFichas, nomeDoArquivo, lerFichaDoWhatsApp, reais, centavos,
  dataHoraBr, ROTULO_FORMA, ROTULO_FORMA_DA_FICHA, ROTULO_REFERENTE, ROTULO_STATUS, ROTULO_ORIGEM, FORMAS,
  type Situacao, type PagamentoBanco, type Forma, type Referente, type FormaDaFicha, type FichaLida, type Status,
} from '@/lib/followcamp-painel';
import { LOTES, valorIrmaos, soDigitos, type LinkCartao } from '@/lib/followcamp';
import { diaMes } from '@/lib/followcamp-carne';
import { contatoDe, linkDoWhats, linkPessoal, mensagemDeCobranca, numeroWhats } from '@/lib/followcamp-cobranca';
import { planilhaDePagamentos } from '@/lib/followcamp-planilha';
import { TIPO_XLSX } from '@/lib/xlsx';
import s from './painel.module.css';

/* 29/10/2026: o cartão por link morreu sem ninguém saber, e a mensagem do
   Cobrar continuava oferecendo "ou no cartão". O painel pergunta ao
   /api/followcamp/meios (que pergunta à Stone, lib/followcamp-link-vivo.ts):
   cartão fora do ar = a mensagem não oferece cartão, e o aviso diz o motivo.
   Sem resposta do meios, vale a lista do código, como antes. */
type Cartao = { noAr: boolean; parado: string | null };
const LinksDoCobrar = createContext<readonly LinkCartao[] | undefined>(undefined);

type Aba = 'campistas' | 'conferir' | 'pagamentos' | 'lancar';

const TOM: Record<Status, 'ok' | 'warn' | 'info' | undefined> = {
  quitado: 'ok', parcial: 'warn', a_conferir: 'info', pendente: undefined, cancelada: undefined,
};

const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const dataCurta = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m ? `${m[3]}/${m[2]}` : iso; };
const zap = (tel: string | null) => {
  const d = soDigitos(tel || '');
  return d.length === 11 ? `https://wa.me/55${d}` : null;
};
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function baixar(nome: string, conteudo: string | Uint8Array, tipo = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([conteudo as BlobPart], { type: tipo }));
  const a = document.createElement('a');
  a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function recado(r: { ok: boolean; erro?: string }, fazendo: string): string {
  if (r.ok) return '';
  switch (r.erro) {
    case 'SEM_SISTEMA': return 'O painel ainda não está ligado: falta rodar a migração 110 no Supabase.';
    case 'SO_ADMIN': return 'Só a administração abre o painel do Follow Camp.';
    case 'SEM_ACESSO': return 'Sua sessão saiu. Entre de novo pelo portal.';
    case 'FORMA_INVALIDA': return 'Escolha a forma do pagamento.';
    case 'REFERENTE_INVALIDO': return 'Escolha a que se refere o pagamento.';
    case 'VALOR_INVALIDO': return 'Confira o valor (maior que zero, com no máximo dois dígitos depois da vírgula).';
    case 'SEM_CAMPISTA': return 'Escreva o nome do campista.';
    case 'FICHA_INEXISTENTE': return 'Essa ficha não existe mais. Atualize o painel.';
    case 'NAO_ACHEI': return 'Não achei esse lançamento. Atualize o painel.';
    case 'PAGAMENTO_INVALIDO': return 'Escolha como a pessoa vai pagar.';
    default: return `Não consegui ${fazendo}. Tente de novo.`;
  }
}

export default function Painel() {
  const ctx = useEu();
  const [dados, setDados] = useState<DadosDoPainel | null>(null);
  const [erro, setErro] = useState('');
  const [aba, setAba] = useState<Aba>('campistas');
  const [busca, setBusca] = useState('');
  const [aberta, setAberta] = useState<string | null>(null);
  const [indo, setIndo] = useState(false);
  const [paraPagar, setParaPagar] = useState<string | null>(null);
  const [cartao, setCartao] = useState<Cartao | null>(null);
  const estreito = useEstreito(760);

  const carregar = useCallback(async () => {
    void fetch('/api/followcamp/meios', { cache: 'no-store' })
      .then(x => (x.ok ? x.json() : null))
      .then((j: { cartaoLink?: unknown; cartaoStone?: unknown; cartaoMotivo?: unknown } | null) => {
        if (j) setCartao({ noAr: j.cartaoLink === true, parado: j.cartaoStone === 'parado' ? String(j.cartaoMotivo || 'a Stone não abre o link') : null });
      })
      .catch(() => { /* fica o que já se sabia */ });
    const r = await lerPainel();
    if (r.ok) { setDados({ eu: r.eu, agora: r.agora, fichas: r.fichas || [], pagamentos: r.pagamentos || [] }); setErro(''); }
    else setErro(recado(r, 'carregar o painel'));
  }, []);

  useEffect(() => {
    void carregar();
    /* com a aba à vista, a cada minuto: o aviso de "paguei" chega sozinho */
    const i = setInterval(() => { if (document.visibilityState === 'visible') void carregar(); }, 60_000);
    return () => clearInterval(i);
  }, [carregar]);

  const fichas = dados?.fichas ?? [];
  const pagamentos = dados?.pagamentos ?? [];
  const resumo = useMemo(() => resumoDe(fichas, pagamentos), [fichas, pagamentos]);
  const agoraDoBanco = dados?.agora;
  const situacoes = useMemo(() => {
    const agora = agoraDoBanco ? new Date(agoraDoBanco) : new Date();
    return ordenarSituacoes(fichas.map(f => situacaoDe(f, pagamentos, agora)));
  }, [fichas, pagamentos, agoraDoBanco]);
  const aConferir = useMemo(() => pagamentos.filter(p => !p.conferido), [pagamentos]);
  const semFicha = useMemo(() => pagamentos.filter(p => !p.ficha_id), [pagamentos]);
  const ativas = useMemo(() => fichas.filter(f => !f.cancelada_em).sort((a, b) => a.campista.localeCompare(b.campista, 'pt-BR')), [fichas]);

  async function fazer(acao: () => Promise<{ ok: boolean; erro?: string }>, fazendo: string, ok: string) {
    if (indo) return false;
    setIndo(true);
    try {
      const r = await acao();
      if (!r.ok) { setErro(recado(r, fazendo)); return false; }
      setErro('');
      ctx.toast?.({ texto: ok });
      await carregar();
      return true;
    } finally { setIndo(false); }
  }

  if (!dados && !erro) return <Esqueleto linhas={6} oQue="Carregando o painel do Follow Camp" />;

  const filtradas = busca.trim()
    ? situacoes.filter(x => x.ficha.campista.toLocaleLowerCase('pt-BR').includes(busca.trim().toLocaleLowerCase('pt-BR')))
    : situacoes;
  const porMeio = FORMAS.filter(f => resumo.recebidoPorForma[f] > 0).map(f => `${ROTULO_FORMA[f]} ${reais(resumo.recebidoPorForma[f])}`);
  const escolhas = (['pix', 'cartao', 'dinheiro', 'carne'] as FormaDaFicha[]).filter(f => resumo.escolheram[f] > 0)
    .map(f => `${ROTULO_FORMA_DA_FICHA[f]} ${resumo.escolheram[f]}`);

  return (
    <LinksDoCobrar.Provider value={cartao && !cartao.noAr ? [] : undefined}>
    <div className={s.painel}>
      <Cabecalho
        sobre="Administração"
        titulo="Follow Camp 2027"
        meta={dados ? <><span>{plural(resumo.inscritos, 'inscrito', 'inscritos')}</span><span>atualizado às {dataHoraBr(dados.agora).slice(11)}</span></> : null}
        acoes={dados ? (
          <>
            <button type="button" className="dm-btn dm-peq" disabled={indo} onClick={() => void carregar()}>Atualizar</button>
            <button type="button" className="dm-btn dm-peq" onClick={() => baixar(nomeDoArquivo('fichas'), csvFichas(fichas, pagamentos))}>Exportar fichas</button>
            <button type="button" className="dm-btn dm-peq" onClick={() => {
              /* 29/10/2026: planilha .xlsx com Resumo, Pagamentos e Por campista (lib/followcamp-planilha.ts) */
              const agora = dados.agora ? new Date(dados.agora) : new Date();
              baixar(nomeDoArquivo('pagamentos', agora, 'xlsx'), planilhaDePagamentos(fichas, pagamentos, agora), TIPO_XLSX);
            }}>Exportar pagamentos</button>
          </>
        ) : null}
      />

      {erro ? <Aviso tom="bad">{erro}</Aviso> : null}
      {cartao?.parado ? (
        <Aviso tom="warn">
          O cartão saiu do site: {cartao.parado}. Crie outro link de pagamento no app da Stone, no valor do lote, sem
          limite de pagamentos e válido até o fim do lote, e passe o endereço novo para trocar no site. O Pix continua.
        </Aviso>
      ) : null}

      {dados ? (
        <>
          <Kpis rot="Números do Follow Camp" colunas={5} colunasMedio={3}>
            <Kpi rot="Inscritos" valor={resumo.inscritos}
              sub={`${resumo.pelosite} pelo site · ${resumo.lancadas} lançadas${resumo.desistencias ? ` · ${resumo.desistencias} desistiu` : ''}`} />
            <Kpi rot="Pagos" valor={resumo.quitados} sub={plural(resumo.parciais, 'pagou parte', 'pagaram parte')} />
            <Kpi rot="Recebido" valor={reais(resumo.recebido)} sub="conferido" />
            <Kpi rot="A conferir" valor={resumo.aConferirQtd === 0 ? 0 : reais(resumo.aConferir)} destaque
              sub={resumo.aConferirQtd ? plural(resumo.aConferirQtd, 'aviso de pagamento', 'avisos de pagamento') : 'nada esperando'} />
            <Kpi rot="Falta receber" valor={reais(resumo.falta)} sub={`de ${reais(resumo.devido)}`} />
          </Kpis>
          {(porMeio.length || escolhas.length) ? (
            <p className={s.linhaMeios}>
              {porMeio.length ? <span><b>Recebido por meio:</b> {porMeio.join(' · ')}</span> : null}
              {escolhas.length ? <span><b>Escolheram na ficha:</b> {escolhas.join(' · ')}</span> : null}
            </p>
          ) : null}

          <Subabas rot="Partes do painel" valor={aba} aoMudar={v => setAba(v)} itens={[
            { v: 'campistas', rot: 'Campistas', n: resumo.inscritos },
            { v: 'conferir', rot: 'A conferir', n: new Set([...aConferir, ...semFicha].map(p => p.id)).size, destaque: true },
            { v: 'pagamentos', rot: 'Pagamentos', n: pagamentos.length },
            { v: 'lancar', rot: 'Lançar' },
          ]} />

          {aba === 'campistas' ? (
            <Secao titulo="Campistas" sub="Quem mais precisa de olho vem primeiro: parcela vencida, a conferir, pagou parte, não pagou. Cobrar abre o WhatsApp da pessoa com a mensagem pronta. Toque no nome para ver a ficha inteira.">
              <input className={s.busca} type="search" placeholder="Buscar pelo nome" value={busca}
                onChange={e => setBusca(e.target.value)} aria-label="Buscar campista pelo nome" />
              {filtradas.length === 0 ? (
                <Vazio titulo={busca ? 'Ninguém com esse nome' : 'Nenhuma ficha ainda'} tom={busca ? 'filtro' : undefined}>
                  {busca ? null : 'As fichas do site entram aqui sozinhas. As que chegaram pelo WhatsApp se lançam na aba Lançar.'}
                </Vazio>
              ) : estreito ? (
                <ul className={s.cartoes}>
                  {filtradas.map(x => (
                    <li key={x.ficha.id} className={s.cartao} data-cancelada={!!x.ficha.cancelada_em || undefined}>
                      <button type="button" className={s.cartaoTopo} onClick={() => setAberta(aberta === x.ficha.id ? null : x.ficha.id)}
                        aria-expanded={aberta === x.ficha.id}>
                        <span className={s.nome}>{x.ficha.campista}</span>
                        <Pill tom={x.atrasado ? 'bad' : TOM[x.status]}>{x.atrasado ? 'Atrasado' : ROTULO_STATUS[x.status]}</Pill>
                      </button>
                      <div className={s.cartaoValores}>
                        <span>{x.devido == null ? 'Valor a confirmar' : reais(x.devido)}</span>
                        <span>Recebido {reais(x.recebido)}</span>
                        {x.aConferir ? <span className={s.conferirTxt}>+ {reais(x.aConferir)} a conferir</span> : null}
                      </div>
                      {textoDoPlano(x) ? <small className={s.sub}>{textoDoPlano(x)}</small> : null}
                      {!x.ficha.cancelada_em ? <div className="dm-linha"><Cobrar x={x} /></div> : null}
                      {aberta === x.ficha.id ? <Detalhes x={x} indo={indo} fazer={fazer} pagar={() => { setParaPagar(x.ficha.id); setAba('lancar'); }} /> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="dm-tabela">
                  <table className={`dm-tab ${s.tab}`}>
                    <thead>
                      <tr><th>Campista</th><th>Responsável</th><th>Na ficha</th><th className={s.num}>Valor</th><th className={s.num}>Recebido</th><th>Situação</th><th className="dm-fim"><span className="dm-so-leitor">Ações</span></th></tr>
                    </thead>
                    <tbody>
                      {filtradas.map(x => (
                        <FichaNaTabela key={x.ficha.id} x={x} aberta={aberta === x.ficha.id}
                          alternar={() => setAberta(aberta === x.ficha.id ? null : x.ficha.id)}
                          indo={indo} fazer={fazer} pagar={() => { setParaPagar(x.ficha.id); setAba('lancar'); }} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Secao>
          ) : null}

          {aba === 'conferir' ? (
            <>
              <Secao titulo="Avisos de pagamento" n={aConferir.length} destaque
                sub="Quem pagou e avisou pelo site. Ache na Stone pelo valor, pelo nome de quem pagou e pelo horário (Pix direto: extrato da conta; link: vendas do link de pagamento). Achou: toque em Conferi.">
                {aConferir.length === 0 ? <Vazio titulo="Nada esperando conferência" tom="bom" /> : (
                  <ListaDePagamentos lista={[...aConferir].sort((a, b) => b.criado_em.localeCompare(a.criado_em))} estreito={estreito} indo={indo} fazer={fazer} />
                )}
              </Secao>
              {semFicha.length ? (
                <Secao titulo="Pagamentos sem ficha" n={semFicha.length}
                  sub="O nome não bateu com nenhuma ficha (ou há dois iguais). Ligue cada um ao campista certo.">
                  <ul className={s.semFicha}>
                    {semFicha.map(p => (
                      <li key={p.id}>
                        <span><b>{p.campista}</b> · {reais(centavos(p.valor))} · {ROTULO_FORMA[p.forma]} · {dataCurta(p.pago_em)}</span>
                        <select aria-label={`Ligar o pagamento de ${p.campista} a uma ficha`} defaultValue="" disabled={indo}
                          onChange={e => { const v = e.target.value; if (v) void fazer(() => ajustarPagamento(p.id, { ficha_id: v }), 'ligar o pagamento', 'Pagamento ligado à ficha'); }}>
                          <option value="">Ligar a…</option>
                          {ativas.map(f => <option key={f.id} value={f.id}>{f.campista}</option>)}
                        </select>
                      </li>
                    ))}
                  </ul>
                </Secao>
              ) : null}
            </>
          ) : null}

          {aba === 'pagamentos' ? (
            <Secao titulo="Pagamentos" n={pagamentos.length} sub="Tudo o que entrou e o que foi avisado, do mais novo para o mais antigo. Recebido é só o conferido.">
              {pagamentos.length === 0 ? <Vazio titulo="Nenhum pagamento ainda">Os avisos do site e os lançamentos aparecem aqui.</Vazio> : (
                <ListaDePagamentos lista={[...pagamentos].sort((a, b) => b.pago_em.localeCompare(a.pago_em) || b.criado_em.localeCompare(a.criado_em))}
                  estreito={estreito} indo={indo} fazer={fazer} />
              )}
            </Secao>
          ) : null}

          {aba === 'lancar' ? (
            <div className={s.formas}>
              <NovoPagamento ativas={ativas} inicial={paraPagar} indo={indo} fazer={fazer} limpar={() => setParaPagar(null)} />
              <NovaFicha indo={indo} fazer={fazer} />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
    </LinksDoCobrar.Provider>
  );
}

type Fazer = (acao: () => Promise<{ ok: boolean; erro?: string }>, fazendo: string, ok: string) => Promise<boolean>;

function FichaNaTabela({ x, aberta, alternar, indo, fazer, pagar }: {
  x: Situacao; aberta: boolean; alternar: () => void; indo: boolean; fazer: Fazer; pagar: () => void;
}) {
  const f = x.ficha;
  const quem = f.responsavel_nome || f.emergencia_nome;
  const tel = f.responsavel_whats || f.emergencia_whats || f.whats_campista;
  const link = zap(tel);
  return (
    <>
      <tr data-cancelada={!!f.cancelada_em || undefined}>
        <td>
          <button type="button" className={s.nomeBotao} onClick={alternar} aria-expanded={aberta}>{f.campista}</button>
          <small className={s.sub}>{[f.idade ? `${f.idade} anos` : '', f.sexo === 'feminino' ? 'F' : f.sexo === 'masculino' ? 'M' : '', f.camisa ? `camisa ${f.camisa}` : '', f.irmao ? `irmão de ${f.irmao}` : ''].filter(Boolean).join(' · ')}</small>
        </td>
        <td>
          {quem ? <span>{quem}</span> : <span className={s.mudo}>sem contato</span>}
          {tel ? <small className={s.sub}>{link ? <a href={link} target="_blank" rel="noopener">{tel}</a> : <span style={{ whiteSpace: 'nowrap' }}>{tel}</span>}</small> : null}
        </td>
        <td>{f.pagamento ? ROTULO_FORMA_DA_FICHA[f.pagamento] : <span className={s.mudo}>não disse</span>}</td>
        <td className={s.num}>{x.devido == null ? <span className={s.mudo}>a confirmar</span> : reais(x.devido)}</td>
        <td className={s.num}>
          {reais(x.recebido)}
          {x.aConferir ? <small className={`${s.sub} ${s.conferirTxt}`}>+ {reais(x.aConferir)} a conferir</small> : null}
        </td>
        <td>
          <Pill tom={x.atrasado ? 'bad' : TOM[x.status]}>{x.atrasado ? 'Atrasado' : ROTULO_STATUS[x.status]}</Pill>
          {textoDoPlano(x) ? <small className={s.sub}>{textoDoPlano(x)}</small> : null}
        </td>
        <td className="dm-fim">
          <div className={s.acoes}>
            {!f.cancelada_em ? <Cobrar x={x} /> : null}
            {!f.cancelada_em && x.status !== 'quitado'
              ? <button type="button" className="dm-btn dm-txt dm-peq" disabled={indo} onClick={pagar}>Registrar pagamento</button>
              : null}
          </div>
        </td>
      </tr>
      {aberta ? (
        <tr className={s.linhaDetalhe}><td colSpan={7}><Detalhes x={x} indo={indo} fazer={fazer} pagar={pagar} /></td></tr>
      ) : null}
    </>
  );
}

function Detalhes({ x, indo, fazer, pagar }: { x: Situacao; indo: boolean; fazer: Fazer; pagar: () => void }) {
  const f = x.ficha;
  const [desistindo, setDesistindo] = useState(false);
  const [motivo, setMotivo] = useState('');
  const itens: [string, string | null][] = [
    ['Nascimento', f.nascimento ? `${f.nascimento.split('-').reverse().join('/')}${f.idade ? ` (${f.idade} anos no Camp)` : ''}` : null],
    ['WhatsApp do campista', f.whats_campista],
    ['Alergia ou restrição', f.alergias || 'nenhuma'],
    ['Saúde ou remédio', f.saude || 'nada a informar'],
    ['Responsável', f.responsavel_nome ? `${f.responsavel_nome}${f.parentesco ? ` (${f.parentesco})` : ''}` : null],
    ['CPF do responsável', f.responsavel_cpf],
    ['WhatsApp do responsável', f.responsavel_whats],
    ['Contato de emergência', f.emergencia_nome ? `${f.emergencia_nome}${f.emergencia_whats ? ` · ${f.emergencia_whats}` : ''}` : null],
    ['Irmão inscrito', f.irmao],
    ['Uso de imagem', f.imagem == null ? null : f.imagem ? 'autorizado' : 'não autorizado'],
    ['Termo', f.termo ? `aceito${f.versao_termo ? ` (${f.versao_termo})` : ''}` : null],
    ['Ficha', `${f.origem === 'site' ? 'pelo site' : f.origem === 'whatsapp' ? 'lançada do WhatsApp' : 'lançada à mão'} em ${dataHoraBr(f.recebida_em)}${f.lancada_por ? ` por ${f.lancada_por}` : ''}`],
    ['Desistência', f.cancelada_em ? `${dataHoraBr(f.cancelada_em)}${f.motivo ? ` · ${f.motivo}` : ''}` : null],
    ['Reenviou a ficha', f.atualizada_em ? dataHoraBr(f.atualizada_em) : null],
  ];
  const parcelas = x.conta.situacao?.parcelas ?? [];
  return (
    <div className={s.detalhes}>
      <dl className={s.dl}>
        {itens.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
      {parcelas.length ? (
        <ul className={s.pagsDaFicha} aria-label="Parcelas do carnê">
          {parcelas.map(p => (
            <li key={p.numero}>{p.numero}ª · vence {diaMes(p.vencimento)} · {reais(p.valor)} · {ROTULO_PARCELA[p.estado]}{p.falta && p.falta < p.valor ? ` (faltam ${reais(p.falta)})` : ''}</li>
          ))}
        </ul>
      ) : null}
      {x.pagamentos.length ? (
        <ul className={s.pagsDaFicha}>
          {x.pagamentos.map(p => (
            <li key={p.id}>{dataCurta(p.pago_em)} · {reais(centavos(p.valor))} · {ROTULO_FORMA[p.forma]} · {p.conferido ? 'conferido' : 'a conferir'}{p.comprovantes ? ' · com comprovante' : ''}</li>
          ))}
        </ul>
      ) : null}
      {!f.cancelada_em && f.token ? <LinkEPlano x={x} indo={indo} fazer={fazer} /> : null}
      {desistindo ? (
        <div className={s.confirma}>
          <Campo rot={`Desistência de ${f.campista}: motivo (opcional)`}>
            <input value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={200} autoFocus />
          </Campo>
          <div className="dm-linha">
            <button type="button" className="dm-btn dm-perigo dm-peq" disabled={indo}
              onClick={() => void fazer(() => cancelarFicha(f.id, true, motivo), 'marcar a desistência', 'Desistência marcada')}>Confirmar desistência</button>
            <button type="button" className="dm-btn dm-txt dm-peq" onClick={() => { setDesistindo(false); setMotivo(''); }}>Voltar</button>
          </div>
        </div>
      ) : (
        <div className="dm-linha">
          {!f.cancelada_em && x.status !== 'quitado'
            ? <button type="button" className="dm-btn dm-peq" disabled={indo} onClick={pagar}>Registrar pagamento</button> : null}
          {f.cancelada_em
            ? <button type="button" className="dm-btn dm-txt dm-peq" disabled={indo}
                onClick={() => void fazer(() => cancelarFicha(f.id, false), 'desfazer a desistência', 'Ficha de volta')}>Desfazer desistência</button>
            : <button type="button" className="dm-btn dm-txt dm-peq dm-perigo" disabled={indo} onClick={() => setDesistindo(true)}>Marcar desistência</button>}
        </div>
      )}
    </div>
  );
}

function ListaDePagamentos({ lista, estreito, indo, fazer }: { lista: PagamentoBanco[]; estreito: boolean; indo: boolean; fazer: Fazer }) {
  /* apagar pede o segundo toque no MESMO lugar: sem caixa do navegador */
  const [apagando, setApagando] = useState<string | null>(null);
  const [vendo, setVendo] = useState<string | null>(null);
  const botaoComprovante = (p: PagamentoBanco) => (p.comprovantes ?? 0) > 0 ? (
    <button type="button" className="dm-btn dm-peq" aria-expanded={vendo === p.id}
      onClick={() => setVendo(vendo === p.id ? null : p.id)}>
      {vendo === p.id ? 'Fechar comprovante' : (p.comprovantes ?? 0) > 1 ? `Comprovantes (${p.comprovantes})` : 'Comprovante'}
    </button>
  ) : null;
  const acoes = (p: PagamentoBanco) => apagando === p.id ? (
    <>
      <button type="button" className="dm-btn dm-perigo dm-peq" disabled={indo}
        onClick={() => void fazer(() => apagarPagamento(p.id), 'apagar', 'Pagamento tirado das contas').then(() => setApagando(null))}>Tirar das contas</button>
      <button type="button" className="dm-btn dm-txt dm-peq" onClick={() => setApagando(null)}>Voltar</button>
    </>
  ) : (
    <>
      {botaoComprovante(p)}
      {p.conferido
        ? <button type="button" className="dm-btn dm-txt dm-peq" disabled={indo}
            onClick={() => void fazer(() => ajustarPagamento(p.id, { conferido: false }), 'desmarcar', 'Voltou para a conferir')}>Desmarcar</button>
        : <button type="button" className="dm-btn dm-pri dm-peq" disabled={indo}
            onClick={() => void fazer(() => ajustarPagamento(p.id, { conferido: true }), 'conferir', 'Pagamento conferido')}>Conferi</button>}
      <button type="button" className="dm-btn dm-txt dm-peq dm-perigo" disabled={indo}
        aria-label={`Apagar o pagamento de ${reais(centavos(p.valor))} de ${p.campista}`}
        onClick={() => setApagando(p.id)}>Apagar</button>
    </>
  );
  if (estreito) {
    return (
      <ul className={s.cartoes}>
        {lista.map(p => (
          <li key={p.id} className={s.cartao}>
            <div className={s.cartaoTopo}>
              <span className={s.nome}>{p.campista}</span>
              <Pill tom={p.conferido ? 'ok' : 'info'}>{p.conferido ? 'Conferido' : 'A conferir'}</Pill>
            </div>
            <div className={s.cartaoValores}>
              <span><b>{reais(centavos(p.valor))}</b></span>
              <span>{ROTULO_FORMA[p.forma]}</span>
              <span>{dataCurta(p.pago_em)}</span>
            </div>
            <small className={s.sub}>{[ROTULO_REFERENTE[p.referente], p.quem_pagou ? `pagou: ${p.quem_pagou}` : '', p.codigo ? p.codigo : '', ROTULO_ORIGEM[p.origem]].filter(Boolean).join(' · ')}</small>
            <div className="dm-linha">{acoes(p)}</div>
            {vendo === p.id ? <VerComprovante id={p.id} /> : null}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="dm-tabela">
      <table className={`dm-tab ${s.tab}`}>
        <thead>
          <tr><th>Data</th><th>Campista</th><th>Forma</th><th className={s.num}>Valor</th><th>Quem pagou</th><th>Situação</th><th className="dm-fim"><span className="dm-so-leitor">Ações</span></th></tr>
        </thead>
        <tbody>
          {lista.map(p => (
            <tr key={p.id}>
              <td>{dataCurta(p.pago_em)}</td>
              <td>{p.campista}<small className={s.sub}>{[ROTULO_REFERENTE[p.referente], p.codigo || ''].filter(Boolean).join(' · ')}</small></td>
              <td>{ROTULO_FORMA[p.forma]}<small className={s.sub}>{ROTULO_ORIGEM[p.origem]}</small></td>
              <td className={s.num}>{reais(centavos(p.valor))}</td>
              <td>{p.quem_pagou || <span className={s.mudo}>não informado</span>}</td>
              <td><Pill tom={p.conferido ? 'ok' : 'info'}>{p.conferido ? 'Conferido' : 'A conferir'}</Pill></td>
              <td className="dm-fim"><div className={s.acoes}>{acoes(p)}</div></td>
            </tr>
          )).flatMap((linha, i) => {
            const p = lista[i];
            return vendo === p.id
              ? [linha, <tr key={`${p.id}-comprovante`} className={s.linhaDetalhe}><td colSpan={7}><VerComprovante id={p.id} /></td></tr>]
              : [linha];
          })}
        </tbody>
      </table>
    </div>
  );
}

const VALOR_PADRAO: Record<Referente, number | null> = { inscricao: LOTES[0].valor, irmaos: valorIrmaos(LOTES[0].valor), parcela: null };
const emCampo = (v: number | null) => (v == null ? '' : v.toFixed(2).replace('.', ','));
const doCampo = (t: string) => {
  const limpo = t.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  return limpo ? Number(limpo) : NaN;
};

function NovoPagamento({ ativas, inicial, indo, fazer, limpar }: {
  ativas: { id: string; campista: string; irmao: string | null }[]; inicial: string | null; indo: boolean; fazer: Fazer; limpar: () => void;
}) {
  const [ficha, setFicha] = useState<string>(inicial ?? '');
  const [outro, setOutro] = useState('');
  const [referente, setReferente] = useState<Referente>('inscricao');
  const [forma, setForma] = useState<Forma>('pix_direto');
  const [valor, setValor] = useState(emCampo(VALOR_PADRAO.inscricao));
  const [data, setData] = useState(hojeSP());
  const [quem, setQuem] = useState('');
  const [obs, setObs] = useState('');
  const [falta, setFalta] = useState('');

  useEffect(() => {
    if (!inicial) return;
    setFicha(inicial);
    const f = ativas.find(x => x.id === inicial);
    if (f?.irmao) { setReferente('irmaos'); setValor(emCampo(VALOR_PADRAO.irmaos)); }
  }, [inicial, ativas]);

  async function enviar() {
    const v = doCampo(valor);
    if (!ficha && outro.trim().length < 3) { setFalta('Escolha o campista (ou escreva o nome).'); return; }
    if (!Number.isFinite(v) || v <= 0) { setFalta('Escreva o valor recebido.'); return; }
    setFalta('');
    const ok = await fazer(() => registrarPagamento({
      ficha_id: ficha || null, campista: ficha ? null : outro.trim(), referente, forma, valor: v,
      pago_em: data, quem_pagou: quem.trim() || null, observacao: obs.trim() || null, conferido: true,
    }), 'registrar o pagamento', 'Pagamento registrado');
    if (ok) { setQuem(''); setObs(''); setOutro(''); setFicha(''); limpar(); }
  }

  return (
    <Secao titulo="Registrar pagamento" sub="O dinheiro que você já viu entrar (na Stone ou em mão). Entra como conferido.">
      <div className={s.form}>
        <Campo rot="Campista">
          <select value={ficha} onChange={e => setFicha(e.target.value)}>
            <option value="">Outro nome (sem ficha)</option>
            {ativas.map(f => <option key={f.id} value={f.id}>{f.campista}</option>)}
          </select>
        </Campo>
        {!ficha ? <Campo rot="Nome do campista"><input value={outro} onChange={e => setOutro(e.target.value)} maxLength={80} /></Campo> : null}
        <Opcoes rot="A que se refere" valor={referente} aoMudar={v => { setReferente(v); setValor(emCampo(VALOR_PADRAO[v])); }}
          opcoes={(['inscricao', 'irmaos', 'parcela'] as Referente[]).map(v => ({ v, rot: ROTULO_REFERENTE[v] }))} />
        <Campo rot="Forma">
          <select value={forma} onChange={e => setForma(e.target.value as Forma)}>
            {FORMAS.map(f => <option key={f} value={f}>{ROTULO_FORMA[f]}</option>)}
          </select>
        </Campo>
        <div className={s.dupla}>
          <Campo rot="Valor (R$)" classe="dm-numero"><input inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00" /></Campo>
          <Campo rot="Data" classe="dm-data"><input type="date" value={data} max={hojeSP()} onChange={e => setData(e.target.value)} /></Campo>
        </div>
        <Campo rot="Quem pagou (opcional)"><input value={quem} onChange={e => setQuem(e.target.value)} maxLength={80} /></Campo>
        <Campo rot="Observação (opcional)"><input value={obs} onChange={e => setObs(e.target.value)} maxLength={300} /></Campo>
        {falta ? <p className={s.falta} role="alert">{falta}</p> : null}
        <div className="dm-linha"><button type="button" className="dm-btn dm-pri" disabled={indo} onClick={() => void enviar()}>Registrar</button></div>
      </div>
    </Secao>
  );
}

function NovaFicha({ indo, fazer }: { indo: boolean; fazer: Fazer }) {
  const [texto, setTexto] = useState('');
  const [lida, setLida] = useState<FichaLida | null>(null);
  const [falta, setFalta] = useState('');
  /* sem texto: os campos mínimos, para a ficha de papel */
  const [m, setM] = useState({ campista: '', responsavel_nome: '', responsavel_whats: '', irmao: '', pagamento: '' as FormaDaFicha | '' });

  function ler() {
    const r = lerFichaDoWhatsApp(texto);
    if (!r.ok) { setFalta(r.erro); setLida(null); return; }
    setFalta(''); setLida(r.ficha);
  }

  async function lancar(p: Record<string, unknown>, origem: 'whatsapp' | 'manual') {
    const ok = await fazer(() => lancarFicha({ ...p, origem }), 'lançar a ficha', 'Ficha lançada');
    if (ok) { setTexto(''); setLida(null); setM({ campista: '', responsavel_nome: '', responsavel_whats: '', irmao: '', pagamento: '' }); }
  }

  function lancarManual() {
    if (m.campista.trim().length < 3) { setFalta('Escreva o nome do campista.'); return; }
    setFalta('');
    const valor = m.irmao.trim() ? VALOR_PADRAO.irmaos : VALOR_PADRAO.inscricao;
    void lancar({ ...m, pagamento: m.pagamento || null, valor }, 'manual');
  }

  return (
    <Secao titulo="Lançar ficha" sub="A ficha que chegou pelo WhatsApp (cole a mensagem inteira) ou no papel.">
      <div className={s.form}>
        <Campo rot="Ficha do WhatsApp" ajuda='A mensagem que começa com "Ficha de inscrição · Follow Camp 2027".'>
          <textarea rows={6} value={texto} onChange={e => { setTexto(e.target.value); setLida(null); }} />
        </Campo>
        {lida ? (
          <div className={s.previa}>
            <b>{lida.campista}</b>
            <span>{[lida.idade ? `${lida.idade} anos` : '', lida.responsavel_nome ? `responsável: ${lida.responsavel_nome}` : '', lida.emergencia_nome ? `emergência: ${lida.emergencia_nome}` : '',
              lida.valor != null ? reais(centavos(lida.valor)) : 'valor a confirmar', lida.pagamento ? ROTULO_FORMA_DA_FICHA[lida.pagamento] : ''].filter(Boolean).join(' · ')}</span>
          </div>
        ) : null}
        {falta ? <p className={s.falta} role="alert">{falta}</p> : null}
        <div className="dm-linha">
          {lida
            ? <button type="button" className="dm-btn dm-pri" disabled={indo} onClick={() => void lancar(lida as unknown as Record<string, unknown>, 'whatsapp')}>Lançar esta ficha</button>
            : <button type="button" className="dm-btn" disabled={!texto.trim()} onClick={ler}>Ler a ficha</button>}
        </div>

        <details className={s.manual}>
          <summary>Sem mensagem: lançar à mão</summary>
          <div className={s.form}>
            <Campo rot="Campista"><input value={m.campista} onChange={e => setM({ ...m, campista: e.target.value })} maxLength={80} /></Campo>
            <Campo rot="Responsável ou contato (opcional)"><input value={m.responsavel_nome} onChange={e => setM({ ...m, responsavel_nome: e.target.value })} maxLength={80} /></Campo>
            <Campo rot="WhatsApp (opcional)"><input inputMode="tel" value={m.responsavel_whats} onChange={e => setM({ ...m, responsavel_whats: e.target.value })} maxLength={20} /></Campo>
            <Campo rot="Irmão inscrito (opcional)"><input value={m.irmao} onChange={e => setM({ ...m, irmao: e.target.value })} maxLength={80} /></Campo>
            <Campo rot="Como vai pagar">
              <select value={m.pagamento} onChange={e => setM({ ...m, pagamento: e.target.value as FormaDaFicha | '' })}>
                <option value="">Não disse</option>
                {(['pix', 'cartao', 'dinheiro', 'carne'] as FormaDaFicha[]).map(f => <option key={f} value={f}>{ROTULO_FORMA_DA_FICHA[f]}</option>)}
              </select>
            </Campo>
            <div className="dm-linha"><button type="button" className="dm-btn" disabled={indo} onClick={lancarManual}>Lançar</button></div>
          </div>
        </details>
      </div>
    </Secao>
  );
}

/* ---------------------------------------------------------------- 114 ---
   O plano, a cobrança e o comprovante. A conta vem pronta em `x.conta`
   (lib/followcamp-carne.ts); aqui é só o que se vê. */
const ROTULO_PARCELA = { paga: 'paga', conferindo: 'em conferência', aberta: 'em aberto', vencida: 'vencida' } as const;

function textoDoPlano(x: Situacao): string {
  if (x.ficha.cancelada_em || !x.conta.carne || x.status === 'quitado') return '';
  const sit = x.conta.situacao;
  if (!x.conta.plano || !sit) return 'Carnê sem plano: a pessoa escolhe no link';
  const n = x.conta.plano.length;
  const vencida = sit.parcelas.find(p => p.estado === 'vencida');
  if (vencida) return `Carnê ${n}x · a ${vencida.numero}ª venceu em ${diaMes(vencida.vencimento)} (faltam ${reais(vencida.falta)})`;
  if (sit.proxima) return `Carnê ${n}x · a ${sit.proxima.numero}ª vence em ${diaMes(sit.proxima.vencimento)}`;
  return `Carnê ${n}x · em dia`;
}

/** Abre o WhatsApp da pessoa certa com a mensagem pronta. Quem aperta enviar é a organização. */
function Cobrar({ x }: { x: Situacao }) {
  const links = useContext(LinksDoCobrar);
  const f = x.ficha;
  if (f.cancelada_em || !f.token) return null;
  const contato = contatoDe(f);
  const numero = contato ? numeroWhats(contato.whats) : null;
  if (!contato || !numero) return <span className={s.mudo}>sem WhatsApp</span>;
  const texto = mensagemDeCobranca({ ficha: f, conta: x.conta, pagamentos: x.pagamentos, link: linkPessoal(f.token), links });
  return (
    <a className="dm-btn dm-peq" href={linkDoWhats(numero, texto)} target="_blank" rel="noopener"
      aria-label={`Mandar mensagem no WhatsApp para ${contato.nome || f.campista} sobre ${f.campista}`}>
      {x.status === 'quitado' ? 'Mensagem' : 'Cobrar'}
    </a>
  );
}

function LinkEPlano({ x, indo, fazer }: { x: Situacao; indo: boolean; fazer: Fazer }) {
  const f = x.ficha;
  const [copiado, setCopiado] = useState(false);
  if (!f.token) return null;
  const url = linkPessoal(f.token);
  return (
    <div className={s.linkEPlano}>
      <div className={s.linkPessoal}>
        <span className={s.mudo}>Link pessoal</span>
        <a href={url} target="_blank" rel="noopener">{url.replace('https://', '')}</a>
        <button type="button" className="dm-btn dm-txt dm-peq"
          onClick={() => navigator.clipboard?.writeText(url).then(() => setCopiado(true), () => setCopiado(false))}>
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <label className={s.planoCampo}>
        <span className={s.mudo}>Plano do carnê</span>
        <select value={f.parcelas ?? ''} disabled={indo} aria-label={`Plano do carnê de ${f.campista}`}
          onChange={e => {
            const v = e.target.value ? Number(e.target.value) : null;
            void fazer(() => definirPlano(f.id, v), 'trocar o plano', v ? `Plano em ${v}x` : 'Plano tirado');
          }}>
          <option value="">Sem plano (paga inteiro ou escolhe no link)</option>
          <option value="1">1 parcela</option>
          <option value="2">2 parcelas</option>
          <option value="3">3 parcelas</option>
        </select>
      </label>
    </div>
  );
}

/** O comprovante como a pessoa mandou: foto na tela, PDF numa aba nova. */
function VerComprovante({ id }: { id: string }) {
  const [lista, setLista] = useState<ComprovanteDoBanco[] | null>(null);
  const [erro, setErro] = useState('');
  const [pdfs, setPdfs] = useState<Record<string, string>>({});
  useEffect(() => {
    let vivo = true;
    void verComprovantes(id).then(r => {
      if (!vivo) return;
      if (r.ok) setLista(r.comprovantes || []);
      else setErro(recado(r, 'abrir o comprovante'));
    });
    return () => { vivo = false; };
  }, [id]);
  useEffect(() => {
    if (!lista) return;
    const urls: Record<string, string> = {};
    for (const c of lista) {
      if (c.tipo !== 'application/pdf') continue;
      const bin = Uint8Array.from(atob(c.dados.replace(/\s+/g, '')), ch => ch.charCodeAt(0));
      urls[c.id] = URL.createObjectURL(new Blob([bin], { type: 'application/pdf' }));
    }
    setPdfs(urls);
    return () => { for (const u of Object.values(urls)) URL.revokeObjectURL(u); };
  }, [lista]);
  if (erro) return <Aviso tom="bad">{erro}</Aviso>;
  if (!lista) return <p className={s.mudo}>Abrindo o comprovante…</p>;
  if (lista.length === 0) return <p className={s.mudo}>Nenhum comprovante neste pagamento.</p>;
  return (
    <div className={s.comprovantes}>
      {lista.map(c => (
        <figure key={c.id}>
          {c.tipo === 'application/pdf'
            ? (pdfs[c.id] ? <a className="dm-btn dm-peq" href={pdfs[c.id]} target="_blank" rel="noopener">Abrir o PDF do comprovante</a> : null)
            /* eslint-disable-next-line @next/next/no-img-element */
            : <img src={`data:${c.tipo};base64,${c.dados.replace(/\s+/g, '')}`} alt="Comprovante do pagamento" />}
          <figcaption className={s.mudo}>Enviado em {dataHoraBr(c.criado_em)}</figcaption>
        </figure>
      ))}
    </div>
  );
}
