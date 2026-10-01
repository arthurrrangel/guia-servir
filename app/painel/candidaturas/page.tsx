'use client';
import { Fragment, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Shell, { useApp } from '@/components/Shell';
import { Cab, Kpis, Kpi, Secao, Pilula, Aviso, Tom } from '@/components/escalas/Pecas';
import { IcSeta } from '@/components/Icones';
import { esperaLiberacao, msgConvite, vol } from '@/lib/engine';
import { aviseHumano } from '@/lib/erros';
import { cont, pl } from '@/lib/plural';
import {
  ABERTAS, NO_TIME, O_QUE_FAZER, Candidatura, Passo, Resposta, ROTULO_STATUS, StatusCand,
  decidir, historicoDe, listarCandidaturas, linkWhatsApp, respostasDe, telefoneLegivel,
} from '@/lib/candidaturas';

/* =============================================================================
   QUEM QUER ENTRAR — O LADO DO LÍDER DA JORNADA DE ENTRADA

   Esta tela é a outra metade de /candidatura/[token]. Lá a pessoa precisa
   saber em que etapa está; aqui o líder precisa saber o que fazer. Foram
   reescritas juntas, e é por isso que três defeitos apareceram: eles só
   existiam na costura entre as duas.

   1. OS DOIS LADOS MANDAVAM O OUTRO LIGAR
      No estado `conversa`, a tela da pessoa dizia "chame Jander no WhatsApp
      para marcar" e esta fila marcava a mesma candidatura como "chamar para
      conversar". Cada um esperava o outro, e o resultado de duas pessoas
      esperando é silêncio. Quem liga é a liderança: quem se ofereceu já fez
      a parte dela. A migração 36 acertou o texto do outro lado.

   2. O ESTADO NÃO SEGUIA O QUE O LÍDER FAZIA
      Chamar no WhatsApp e registrar "estou conversando" eram dois cliques, e
      o segundo ninguém dá. A candidatura ficava `enviada` para sempre e a
      pessoa continuava lendo "recebemos seu cadastro" três dias depois da
      conversa ter acontecido. Agora é o mesmo toque: abrir o WhatsApp move a
      candidatura, porque o líder não deveria ter que contar ao sistema uma
      coisa que o sistema acabou de ver.

   3. QUATRO BOTÕES DO MESMO TAMANHO
      "Quero conversar", "Aprovar", "Já está servindo" e "Encerrar" apareciam
      lado a lado, iguais. Escolher entre quatro é trabalho, e quem organiza
      abre isso no celular entre um culto e outro. Agora há uma ação cheia
      por candidatura aberta, a do momento, e as outras vêm em contorno,
      depois da frase "depois de falar com ela".

   O QUE FOI PRESERVADO: a fila continua sendo uma tela só, com o detalhe
   abrindo dentro da linha (sair da lista para decidir e voltar perdendo a
   posição é atrito puro no celular), e a ordem continua sendo por espera, não
   por data de chegada.

   30/09/2026: na língua do Financeiro e do Demandas. A situação no título,
   a faixa de números no lugar do placar preto, cada candidatura uma linha
   da fila (nome, funções, estado, espera) e a aberta numa caixa.
   ============================================================================= */

export default function Pagina() { return <Shell><Fila /></Shell>; }

const so2 = (n: number) => String(n).padStart(2, '0');
const dia = (iso: string) => {
  const d = new Date(iso);
  return `${so2(d.getDate())}/${so2(d.getMonth() + 1)}`;
};
const diasAtras = (iso: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
const espera = (n: number) => n === 0 ? 'chegou hoje' : n === 1 ? 'há 1 dia' : `há ${n} dias`;
const nomeInteiro = (n: string) => (n || '').trim();

/* as colunas das filas no desktop (nada em `auto`: ver a fila em escalas.css) */
const COLUNAS = { '--es-cols': 'minmax(0,1fr) 200px 96px 24px' } as React.CSSProperties;

function Fila() {
  const { equipe, aviso, recarregar, S } = useApp();
  const [lista, setLista] = useState<Candidatura[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aberta, setAberta] = useState('');
  const [verEncerradas, setVerEncerradas] = useState(false);

  const carregar = useCallback(async () => {
    if (!equipe?.id) return;
    setCarregando(true);
    try { setLista(await listarCandidaturas(equipe.id)); setErro(''); }
    catch (e) { setErro(aviseHumano(e, 'carregar quem está esperando')); }
    finally { setCarregando(false); }
  }, [equipe?.id]);

  useEffect(() => { void carregar(); }, [carregar]);

  /* quem espera decisão primeiro, e dentro disso a mais antiga na frente:
     quem está esperando há mais tempo é quem corre mais risco de desistir. */
  const porEspera = (a: Candidatura, b: Candidatura) => a.criado_em.localeCompare(b.criado_em);
  const abertas = lista.filter(c => ABERTAS.includes(c.status)).sort(porEspera);
  const noTime = lista.filter(c => NO_TIME.includes(c.status))
    .sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em));
  const fechadas = lista.filter(c => !ABERTAS.includes(c.status) && !NO_TIME.includes(c.status))
    .sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em));

  /* RECARREGAR NÃO APAGA A TELA (30/09/2026). Depois de cada decisão a lista
     é relida, e com `!carregando` em cada bloco a tela inteira sumia por um
     instante, inclusive a ficha que a pessoa acabou de usar. Com lista na
     mão, ela fica à vista enquanto a nova chega; só a primeira carga espera. */
  const mostra = !carregando || lista.length > 0;
  const maisAntiga = abertas.length ? diasAtras(abertas[0].criado_em) : 0;
  /* a espera da mais antiga ganha o tom de "espera resposta" a partir de três
     dias. Não é enfeite: é o único número desta tela que estraga a jornada
     de verdade. */
  const urge = maisAntiga >= 3;
  /* 102 · QUEM SE CADASTROU PELA LISTA DA EQUIPE também espera você, e não
     é candidatura: é vínculo que nasceu inativo esperando "Liberar" no Time.
     Antes não aparecia em lugar nenhum (o Elias, no Louvor, um mês). */
  const soltas = (S?.voluntarios || []).filter(esperaLiberacao);
  const nEsperando = abertas.length + soltas.length;

  const props = {
    equipeNome: equipe?.nome || '',
    abrir: (id: string) => setAberta(a => a === id ? '' : id),
    mudou: async (m: string) => { aviso(m); await carregar(); await recarregar(); },
  };

  /* a fila de uma seção: a linha abre a candidatura logo abaixo dela */
  const filaDe = (itens: Candidatura[], comEspera: boolean) => (
    <div className="es-fila es-colunas" style={COLUNAS}>
      <div className="es-fila-cab" aria-hidden="true">
        <span>Pessoa</span><span>Situação</span><span className="es-n">{comEspera ? 'Espera' : ''}</span><span />
      </div>
      {itens.map(c => (
        <Linha key={c.id} c={c} aberta={aberta === c.id} {...props} />
      ))}
    </div>
  );

  return (
    <>
      {/* LISTA VAZIA NÃO É A MESMA COISA QUE LISTA QUE NÃO CARREGOU.
          Com a internet caindo, esta tela dizia, em letra grande e com toda a
          confiança, "Ninguém esperando resposta" — e logo abaixo aparecia o
          aviso de falha, que ninguém lê depois de já ter lido o título. Uma
          tela só afirma o que ela sabe: se não conseguiu ler a lista, diz isso.

          OS NÚMEROS NÃO REPETEM O TÍTULO SEM ACRESCENTAR. O título diz quantas
          pessoas esperam; a faixa diz há quanto tempo a primeira delas está
          esperando, que é o número que mede a falha. */}
      <Cab
        rot="Entradas"
        /* e ENQUANTO CARREGA ela também não afirma nada: a lista começa vazia,
           e por um instante o título dizia "Ninguém esperando resposta" com
           duas pessoas esperando (medido em 30/09/2026) */
        titulo={carregando && !lista.length ? 'Quem quer entrar no time'
          : erro ? 'Não consegui carregar quem está esperando'
          : nEsperando === 0 ? 'Ninguém esperando resposta'
            : nEsperando === 1 ? '1 pessoa esperando você'
              : `${nEsperando} pessoas esperando você`}
        meta={carregando && !lista.length ? undefined
          : erro ? erro
          : abertas.length === 0 && soltas.length > 0
            ? 'Se cadastraram pela lista da equipe. Libere no Time: até lá o nome não aparece na lista.'
          : abertas.length === 0
            ? 'Quem se cadastrar pelo site aparece aqui na hora, e você recebe a pessoa por aqui mesmo.'
            : maisAntiga === 0
              ? 'Chegou hoje. Responder no mesmo dia é o que faz a pessoa aparecer no domingo.'
              : `A mais antiga está esperando ${espera(maisAntiga)}. Quem se oferece e não recebe resposta some, e não volta.`}
        acoes={erro ? <button type="button" className="es-btn" onClick={() => { setErro(''); void carregar(); }}>Tentar de novo</button> : undefined}
      />

      {/* o erro já é a linha de baixo do título; repetir aqui embaixo era a
          mesma frase duas vezes na mesma tela */}
      {carregando && !lista.length && (
        <div className="es-secao es-esqueleto" aria-busy="true" aria-label="Carregando">
          <div style={{ height: 92 }} /><div style={{ height: 180 }} />
        </div>
      )}

      {mostra && !erro && lista.length > 0 && (
        <div className="es-secao">
          <Kpis n={4}>
            <Kpi rot="Esperando você" valor={abertas.length} destaque={abertas.length > 0}
              sub={abertas.length ? 'esperando resposta' : 'ninguém na fila'}
              tom={abertas.length ? 'warn' : 'zero'} />
            <Kpi rot="A mais antiga"
              valor={!abertas.length ? 'ninguém'
                : maisAntiga === 0 ? 'hoje'
                  : <>{maisAntiga}<small> {pl(maisAntiga, 'dia', 'dias')}</small></>}
              texto={!abertas.length || maisAntiga === 0}
              sub={abertas.length ? `chegou em ${dia(abertas[0].criado_em)}` : 'sem espera'}
              tom={!abertas.length ? 'zero' : urge ? 'warn' : ''} />
            <Kpi rot="Entraram no time" valor={noTime.length}
              sub="aprovadas ou servindo" tom={noTime.length ? '' : 'zero'} />
            <Kpi rot="Encerradas" valor={fechadas.length}
              sub="por enquanto" tom={fechadas.length ? '' : 'zero'} />
          </Kpis>
        </div>
      )}

      {mostra && abertas.length > 0 && (
        <Secao titulo="Esperando você" n={abertas.length} sub="A mais antiga na frente.">
          {filaDe(abertas, true)}
        </Secao>
      )}

      {soltas.length > 0 && (
        <Secao titulo="Esperando liberação" n={soltas.length}
          sub="Cadastro pela lista da equipe. Até você liberar no Time, o nome não aparece na lista nem entra no sorteio.">
          <div className="es-fila">
            {soltas.map(v => (
              <Link key={v.id} href="/time#liberar" className="es-item"
                aria-label={`${v.nome}: liberar no Time`}>
                <span className="es-c-tit">
                  <b>{v.nome}</b>
                  {!!Object.keys(v.funcoes).length && <small>{Object.keys(v.funcoes).join(', ')}</small>}
                </span>
                <span className="es-c-acao"><IcSeta /></span>
              </Link>
            ))}
          </div>
        </Secao>
      )}

      {mostra && noTime.length > 0 && (
        <Secao titulo="Já entraram no time" sub={cont(noTime.length, 'pessoa', 'pessoas')}>
          {filaDe(noTime, false)}
        </Secao>
      )}

      {/* "como chega gente aqui" responde a pergunta de quem tem a lista
          vazia. Quem não conseguiu LER a lista tem outra pergunta, e ver o
          passo a passo de chegada ali reforça a leitura errada de que não
          tem ninguém. */}
      {!carregando && !erro && lista.length === 0 && soltas.length === 0 && (
        <Secao titulo="Como chega gente aqui">
          <div className="es-fila">
            <div className="es-item es-com-n">
              <span className="es-c-n">1</span>
              <span className="es-c-tit"><b>Mande o link da área no grupo do WhatsApp</b><small>guiaservir.com/servir</small></span>
            </div>
            <div className="es-item es-com-n">
              <span className="es-c-n">2</span>
              <span className="es-c-tit"><b>Quem se cadastrar aparece nesta tela na hora, com as funções que marcou.</b></span>
            </div>
            <div className="es-item es-com-n">
              <span className="es-c-n">3</span>
              <span className="es-c-tit"><b>Você chama no WhatsApp, conversa e aprova. O resto o sistema faz.</b></span>
            </div>
          </div>
        </Secao>
      )}

      {mostra && fechadas.length > 0 && (
        <Secao titulo="Encerradas"
          acoes={
            <button type="button" className="es-btn es-txt es-peq" aria-expanded={verEncerradas}
              onClick={() => setVerEncerradas(v => !v)}>
              {verEncerradas ? 'Esconder' : `Ver ${fechadas.length}`}
            </button>
          }>
          {verEncerradas && filaDe(fechadas, false)}
        </Secao>
      )}
    </>
  );
}

/* O TOM DA PÍLULA, no sentido fixo do sistema: esperando o seu contato, você
   disse que ia chamar e conversa marcada esperam resposta (warn); no time é
   de pé (ok); encerrada e inativa são fato sem juízo (neutro). */
const tomDo = (t: '' | 'ok' | 'pend' | 'ruim'): Tom => t === 'ok' ? 'ok' : t === '' ? 'neutro' : 'warn';

/* -------------------------------------------------------------- uma pessoa */
function Linha({ c, aberta, abrir, equipeNome, mudou }: {
  c: Candidatura; aberta: boolean; abrir: (id: string) => void;
  equipeNome: string; mudou: (m: string) => Promise<void>;
}) {
  const { S, base } = useApp();
  const [resp, setResp] = useState<Resposta[]>([]);
  const [hist, setHist] = useState<Passo[]>([]);
  const [nota, setNota] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!aberta) return;
    let vivo = true;
    void (async () => {
      try {
        const [r, h] = await Promise.all([respostasDe(c.id), historicoDe(c.id)]);
        if (vivo) { setResp(r); setHist(h); }
      } catch { /* detalhe é complemento: se falhar, a decisão continua possível */ }
    })();
    return () => { vivo = false; };
  }, [aberta, c.id]);

  /* DUAS GRAFIAS, E A DIFERENÇA IMPORTA. 21/09/2026, migração 64.
     `nome` é o de quem TEM aquele telefone; `digitado` é o que a pessoa
     escreveu na porta. Quando divergem, quem está aprovando precisa saber:
     medido, um anônimo que sabe um telefone abre candidatura em nome de
     terceiro, e a fila mostrava só o nome verdadeiro — a líder aprovava
     achando que era alguém da casa, e a aprovação criava um vínculo no
     cadastro daquela pessoa. O aviso não bloqueia nada: nome diferente tem
     explicação banal (apelido, nome de casada, a mãe cadastrando pelo
     telefone da família). Quem decide é quem conhece as pessoas. */
  const nome = c.pessoas?.nome?.trim() || 'Sem nome';
  const digitado = (c.nome_informado || '').trim();
  const outroNome = !!digitado && !!c.pessoas?.nome
    && digitado.toLowerCase() !== c.pessoas.nome.trim().toLowerCase();
  const tel = c.pessoas?.telefone || '';
  const funcoes = (c.candidatura_funcoes || []).map(x => x.funcoes?.nome).filter(Boolean) as string[];
  const dias = diasAtras(c.criado_em);
  const f = O_QUE_FAZER[c.status];

  async function agir(status: StatusCand, texto: string) {
    if (ocupado) return;
    setOcupado(true); setErro('');
    try { await decidir(c.id, status, nota.trim() || undefined); await mudou(texto); }
    catch (e) { setErro(aviseHumano(e, 'registrar essa decisão')); }
    finally { setOcupado(false); }
  }

  /* CHAMAR E MARCAR SÃO O MESMO TOQUE. O <a> navega de forma síncrona (senão o
     navegador bloqueia a aba); a mudança de estado sai atrás, sem travar. */
  const chamando = c.status === 'enviada' || c.status === 'em_analise';
  const zapContato = tel ? linkWhatsApp(tel,
    `Oi ${nomeInteiro(nome)}! Aqui é da ${equipeNome} da GUIA. Vi seu cadastro para servir com a gente. Posso te fazer umas perguntas?`) : '';
  function aoChamar() {
    if (!chamando) return;
    void decidir(c.id, 'conversa').then(() => mudou('marcado como em conversa'))
      .catch(() => mudou('o WhatsApp abriu, mas não consegui marcar "em conversa". Marque de novo quando a rede voltar.'));
  }

  /* aprovada: o link pessoal já está no banco e a pessoa já o recebe sozinha
     na tela dela. Aqui ele vira mensagem pronta, porque na prática é pelo
     WhatsApp que ela vai ver. Dois caminhos, nenhum dependendo de memória. */
  const v = c.voluntario_id ? vol(S, c.voluntario_id) : null;
  const zapLink = v?.token && tel
    ? linkWhatsApp(tel, msgConvite(S, c.voluntario_id!, base)) : '';

  /* A AÇÃO DO MOMENTO é a única cheia: chamar no WhatsApp quem ainda espera o
     contato, ou mandar o link a quem já entrou. Ela só existe numa linha
     aberta, e só uma abre por vez, então nunca há duas cheias na tela. */
  const temBotoes = (f.chama && !!zapContato) || (c.status === 'aprovada' && !!zapLink)
    || (c.status === 'entrevista' && !!zapContato);
  const quem = outroNome ? digitado : nome;

  return (
    <>
      <button type="button" className="es-item es-en-linha" onClick={() => abrir(c.id)}
        aria-expanded={aberta} aria-controls={`cand-${c.id}`}>
        <span className="es-c-tit">
          <b>{quem}</b>
          {funcoes.length
            ? <span className="es-etqs">{funcoes.map(fn => <span key={fn} className="es-etq">{fn}</span>)}</span>
            : <small>sem função marcada</small>}
        </span>
        <span className="es-c-meta">
          <span className="es-c-est"><Pilula tom={tomDo(f.tom)}>{f.rot}</Pilula></span>
          <span className="es-c-num">{ABERTAS.includes(c.status) ? espera(dias) : ''}</span>
        </span>
        <span className="es-c-acao"><IcSeta /></span>
      </button>

      {aberta && (
        <div className="es-en-aberta" id={`cand-${c.id}`}>
          <div className="es-caixa">
            <div className="es-caixa-corpo es-en-pilha">
              {erro && <Aviso tom="bad">{erro}</Aviso>}

              {/* A INSTRUÇÃO. Primeira coisa dentro da linha aberta, porque é a
                  única que o líder precisa ler para agir. */}
              <p className="es-prosa">{f.txt}</p>

              {/* ESTE TELEFONE JÁ ESTÁ NO SISTEMA COM OUTRO NOME.
                  A frase é factual e não acusa ninguém: na maioria das vezes é
                  apelido ou nome de casada. Mas é a única coisa que separa isso de
                  uma candidatura aberta em nome de terceiro, e sem ela a aprovação
                  é às cegas. Por isso vem antes dos botões. */}
              {outroNome && (
                <Aviso tom="warn">
                  O nome escrito no cadastro foi <b>{digitado}</b>, mas este WhatsApp já
                  está no sistema como <b>{nome}</b>. Confirme com a pessoa antes de
                  aprovar: aprovar liga esta candidatura ao cadastro de {nomeInteiro(nome)}.
                </Aviso>
              )}

              {temBotoes && (
                <div className="es-linha es-en-botoes">
                  {f.chama && zapContato && (
                    <a className="es-btn es-pri" href={zapContato} target="_blank" rel="noreferrer" onClick={aoChamar}>
                      Chamar {nomeInteiro(nome)} no WhatsApp
                    </a>
                  )}
                  {c.status === 'aprovada' && zapLink && (
                    <a className="es-btn es-pri" href={zapLink} target="_blank" rel="noreferrer">
                      Mandar o link de {nomeInteiro(nome)}
                    </a>
                  )}
                  {c.status === 'entrevista' && zapContato && (
                    <a className="es-btn" href={zapContato} target="_blank" rel="noreferrer">
                      Abrir o WhatsApp
                    </a>
                  )}
                </div>
              )}
              {f.chama && !zapContato && (
                <Aviso tom="warn">Sem WhatsApp cadastrado. Fale com quem indicou essa pessoa.</Aviso>
              )}
            </div>

            {/* AS DECISÕES. Depois da conversa, nunca antes dela: é essa a ordem
                do mundo real, e a tela passa a ter a mesma. */}
            {!NO_TIME.includes(c.status) && (
              <div className="es-caixa-corpo es-en-pilha">
                <h3 className="es-caixa-titulo">Depois de falar com {nomeInteiro(nome)}</h3>
                <div className="es-linha es-en-botoes">
                  <button type="button" className="es-btn" disabled={ocupado}
                    onClick={() => agir('aprovada', `${nomeInteiro(nome)} entrou no time`)}>
                    {ocupado ? 'salvando…' : 'Aprovar e criar no time'}
                  </button>
                  {c.status !== 'recusada' && (
                    <button type="button" className="es-btn" disabled={ocupado}
                      onClick={() => agir('recusada', 'candidatura encerrada')}>
                      Encerrar por enquanto
                    </button>
                  )}
                </div>
                <p className="es-peq es-mudo es-en-nota">
                  Aprovar cria a pessoa no time na hora, com as funções marcadas como{' '}
                  <b>a conferir</b>. Encerrar não é um não definitivo: a tela
                  dela oferece as outras áreas.
                </p>
              </div>
            )}
            {c.status === 'aprovada' && (
              <div className="es-caixa-corpo es-en-pilha">
                <h3 className="es-caixa-titulo">Quando vir a pessoa servindo</h3>
                <div className="es-linha es-en-botoes">
                  <button type="button" className="es-btn" disabled={ocupado}
                    onClick={() => agir('ativa', 'marcado como servindo')}>
                    Marcar como servindo
                  </button>
                  <Link className="es-btn" href="/time">Conferir o nível na aba Time</Link>
                </div>
              </div>
            )}

            {/* O QUE ELA MANDOU */}
            <div className="es-caixa-corpo es-en-pilha">
              <h3 className="es-caixa-titulo">O que {nomeInteiro(quem)} mandou</h3>
              <dl className="es-en-dados">
                <dt>Chegou</dt><dd>{dia(c.criado_em)} · {espera(dias)}</dd>
                {outroNome && <><dt>Nome no sistema</dt><dd>{nome}</dd></>}
                <dt>WhatsApp</dt><dd>{telefoneLegivel(tel) || 'não informou'}</dd>
                {c.pessoas?.email && <><dt>E-mail</dt><dd>{c.pessoas.email}</dd></>}
                <dt>Quer fazer</dt>
                <dd>{funcoes.length ? funcoes.join(' · ') : 'não marcou nenhuma função'}</dd>
                {resp.map(r => (
                  <Fragment key={r.pergunta}>
                    <dt>{r.pergunta}</dt><dd>{r.resposta.split('|').join(', ')}</dd>
                  </Fragment>
                ))}
              </dl>
            </div>

            {/* ANOTAÇÃO */}
            <div className="es-caixa-corpo es-en-pilha">
              {/* teto de 500: é uma anotação de decisão, não um prontuário — e campo
                  sem teto é por onde entra um texto colado inteiro sem querer */}
              <label className="es-campo">
                <span>Anotação da liderança</span>
                <textarea rows={2} value={nota} className="es-ctl" maxLength={500}
                  placeholder="o que ficou combinado, o que falta…"
                  aria-label={`Anotação sobre ${nome}, só a liderança vê`}
                  onChange={e => setNota(e.target.value)} />
                <small>Só a liderança vê. Fica junto da próxima decisão que você tomar aqui.</small>
              </label>
              {c.nota_interna && (
                <p className="es-peq es-dim">Já anotado: {c.nota_interna}</p>
              )}
            </div>

            {hist.length > 0 && (
              <div className="es-caixa-corpo es-en-pilha">
                <h3 className="es-caixa-titulo">Histórico</h3>
                <ul className="es-en-hist">
                  {hist.map((h, i) => (
                    <li key={i}>
                      <span>{dia(h.quando)}</span>
                      <span>
                        <b>{ROTULO_STATUS[h.para as StatusCand] || h.para}</b>
                        {h.por && h.por !== 'sistema' ? `, ${h.por}` : ''}
                        {h.nota ? ` (${h.nota})` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
