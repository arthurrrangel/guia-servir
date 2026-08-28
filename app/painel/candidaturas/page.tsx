'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Shell, { useApp } from '@/components/Shell';
import { Aviso } from '@/components/Ui';
import { msgConvite, vol } from '@/lib/engine';
import { aviseHumano } from '@/lib/erros';
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
      abre isso no celular entre um culto e outro. Agora há uma ação sólida
      por linha — a do momento — e as outras viram texto, depois da frase
      "depois de falar com ela".

   O QUE FOI PRESERVADO: a fila continua sendo uma tela só, com o detalhe
   abrindo dentro da linha (sair da lista para decidir e voltar perdendo a
   posição é atrito puro no celular), e a ordem continua sendo por espera, não
   por data de chegada.
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
const primeiro = (n: string) => (n || '').trim().split(/\s+/)[0] || '';

function Fila() {
  const { equipe, aviso, recarregar } = useApp();
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

  const maisAntiga = abertas.length ? diasAtras(abertas[0].criado_em) : 0;
  /* a faixa inverte quando alguém já está esperando há três dias. Não é
     enfeite: é o único número desta tela que estraga a jornada de verdade. */
  const urge = maisAntiga >= 3;

  const props = {
    equipeNome: equipe?.nome || '',
    abrir: (id: string) => setAberta(a => a === id ? '' : id),
    mudou: async (m: string) => { aviso(m); await carregar(); await recarregar(); },
  };

  return (
    <div className="lid">
      <div className={`lid-faixa ${urge ? 'fogo' : ''}`}>
        <div className="lid-faixa-in">
          <div className="lid-faixa-txt">
            <span className="rot">Quem quer entrar</span>
            {/* LISTA VAZIA NÃO É A MESMA COISA QUE LISTA QUE NÃO CARREGOU.
                Com a internet caindo, esta tela dizia, em letra grande e com
                toda a confiança, "Ninguém esperando resposta" — e logo abaixo
                aparecia o aviso de falha, que ninguém lê depois de já ter lido
                o título. O líder fecha o app convencido de que não tem gente
                esperando, quando pode ter cinco. Uma tela só afirma o que ela
                sabe: se não conseguiu ler a lista, ela diz isso. */}
            <h1>
              {erro ? 'Não consegui carregar quem está esperando'
                : abertas.length === 0 ? 'Ninguém esperando resposta'
                  : abertas.length === 1 ? '1 pessoa esperando você'
                    : `${abertas.length} pessoas esperando você`}
            </h1>
            <p className="lid-faixa-sub">
              {erro ? erro
                : abertas.length === 0
                  ? 'Quem se cadastrar pelo site aparece aqui na hora, e você recebe a pessoa por aqui mesmo.'
                  : maisAntiga === 0
                    ? 'Chegou hoje. Responder no mesmo dia é o que faz a pessoa aparecer no domingo.'
                    : `A mais antiga está esperando ${espera(maisAntiga).replace('há ', 'há ')}. Quem se oferece e não recebe resposta some, e não volta.`}
            </p>
            {erro && (
              <div className="lid-faixa-acoes">
                <button className="lid-bt" onClick={() => { setErro(''); void carregar(); }}>Tentar de novo</button>
              </div>
            )}
          </div>
          {/* O PLACAR NÃO REPETE O TÍTULO. O número de pessoas já está no h1;
              o que falta é o número que mede a falha, que é há quanto tempo a
              primeira delas está esperando. */}
          {abertas.length > 0 && (
            <div className="lid-placar">
              {maisAntiga === 0 ? <b>hoje</b> : <b>{maisAntiga}<i>d</i></b>}
              <span>{maisAntiga === 0 ? 'chegou a primeira' : 'esperando a mais antiga'}</span>
            </div>
          )}
        </div>
      </div>

      {/* o erro já é o subtítulo da faixa agora; repetir aqui embaixo era a
          mesma frase duas vezes na mesma tela */}
      {carregando && <p className="dim" style={{ marginTop: 'var(--e6)' }}>carregando…</p>}

      {!carregando && abertas.length > 0 && (
        <section className="lid-secao">
          <div className="lid-secao-cab">
            <span className="rot">Esperando você</span>
            <span className="lid-secao-nota">A mais antiga na frente</span>
          </div>
          {abertas.map(c => (
            <Linha key={c.id} c={c} aberta={aberta === c.id} {...props} />
          ))}
        </section>
      )}

      {!carregando && noTime.length > 0 && (
        <section className="lid-secao">
          <div className="lid-secao-cab">
            <span className="rot">Já entraram no time</span>
            <span className="lid-secao-nota">
              {noTime.length === 1 ? '1 pessoa' : `${noTime.length} pessoas`}
            </span>
          </div>
          {noTime.map(c => (
            <Linha key={c.id} c={c} aberta={aberta === c.id} {...props} />
          ))}
        </section>
      )}

      {/* "como chega gente aqui" responde a pergunta de quem tem a lista
          vazia. Quem não conseguiu LER a lista tem outra pergunta, e ver o
          passo a passo de chegada ali reforça a leitura errada de que não
          tem ninguém. */}
      {!carregando && !erro && lista.length === 0 && (
        <section className="lid-secao">
          <div className="lid-secao-cab"><span className="rot">Como chega gente aqui</span></div>
          <div className="lid-alerta">
            <span className="lid-alerta-n">1</span>
            <span>
              Mande o link da área no grupo do WhatsApp:{' '}
              <code style={{ overflowWrap: 'anywhere' }}>guiaservir.com/servir</code>
            </span>
          </div>
          <div className="lid-alerta">
            <span className="lid-alerta-n">2</span>
            <span>Quem se cadastrar aparece nesta tela na hora, com as funções que marcou.</span>
          </div>
          <div className="lid-alerta">
            <span className="lid-alerta-n">3</span>
            <span>Você chama no WhatsApp, conversa e aprova. O resto o sistema faz.</span>
          </div>
        </section>
      )}

      {!carregando && fechadas.length > 0 && (
        <section className="lid-secao">
          <div className="lid-secao-cab">
            <span className="rot">Encerradas</span>
            <button className="lid-bt-txt" onClick={() => setVerEncerradas(v => !v)}>
              {verEncerradas ? 'esconder' : `ver ${fechadas.length}`}
            </button>
          </div>
          {verEncerradas && fechadas.map(c => (
            <Linha key={c.id} c={c} aberta={aberta === c.id} {...props} />
          ))}
        </section>
      )}
    </div>
  );
}

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

  const nome = c.pessoas?.nome?.trim() || 'Sem nome';
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
    `Oi ${primeiro(nome)}! Aqui é da ${equipeNome} da GUIA. Vi seu cadastro para servir com a gente. Posso te fazer umas perguntas?`) : '';
  function aoChamar() {
    if (!chamando) return;
    void decidir(c.id, 'conversa').then(() => mudou('marcado como em conversa')).catch(() => {});
  }

  /* aprovada: o link pessoal já está no banco e a pessoa já o recebe sozinha
     na tela dela. Aqui ele vira mensagem pronta, porque na prática é pelo
     WhatsApp que ela vai ver. Dois caminhos, nenhum dependendo de memória. */
  const v = c.voluntario_id ? vol(S, c.voluntario_id) : null;
  const zapLink = v?.token && tel
    ? linkWhatsApp(tel, msgConvite(S, c.voluntario_id!, base)) : '';

  return (
    <details className={`lid-cand ${f.tom}`} open={aberta}>
      <summary onClick={e => { e.preventDefault(); abrir(c.id); }}>
        <span className="lid-marca" aria-hidden="true" />
        <span>
          <span className="lid-cand-nome">{nome}</span>
          <span className="lid-cand-sub">
            {funcoes.length ? funcoes.join(' · ') : 'sem função marcada'}
          </span>
        </span>
        <span className="lid-cand-est">
          {f.rot}
          {ABERTAS.includes(c.status) && <span className="lid-cand-esp">{espera(dias)}</span>}
        </span>
      </summary>

      <div className="lid-cand-corpo">
        {erro && <Aviso tom="erro">{erro}</Aviso>}

        {/* A INSTRUÇÃO. Primeira coisa dentro da linha aberta, porque é a
            única que o líder precisa ler para agir. */}
        <p className="lid-cand-fazer">{f.txt}</p>

        <div className="lid-cand-btns">
          {f.chama && zapContato && (
            <a className="lid-bt" href={zapContato} target="_blank" rel="noreferrer" onClick={aoChamar}>
              Chamar {primeiro(nome)} no WhatsApp
            </a>
          )}
          {f.chama && !zapContato && (
            <span style={{ fontSize: 'var(--t-ui)', color: 'var(--bad)' }}>
              Sem WhatsApp cadastrado. Fale com quem indicou essa pessoa.
            </span>
          )}
          {c.status === 'aprovada' && zapLink && (
            <a className="lid-bt" href={zapLink} target="_blank" rel="noreferrer">
              Mandar o link de {primeiro(nome)}
            </a>
          )}
          {c.status === 'entrevista' && zapContato && (
            <a className="lid-bt-txt" href={zapContato} target="_blank" rel="noreferrer">
              Abrir o WhatsApp
            </a>
          )}
        </div>

        {/* AS DECISÕES. Depois da conversa, nunca antes dela: é essa a ordem
            do mundo real, e a tela passa a ter a mesma. */}
        {!NO_TIME.includes(c.status) && (
          <>
            <span className="lid-cand-mini">Depois de falar com {primeiro(nome)}</span>
            <div className="lid-cand-btns" style={{ marginTop: 16 }}>
              <button className="lid-bt-txt" disabled={ocupado}
                onClick={() => agir('aprovada', `${primeiro(nome)} entrou no time`)}>
                {ocupado ? 'salvando…' : 'Aprovar e criar no time'}
              </button>
              {c.status !== 'recusada' && (
                <button className="lid-bt-txt lid-cand-perigo" disabled={ocupado}
                  onClick={() => agir('recusada', 'candidatura encerrada')}>
                  Encerrar por enquanto
                </button>
              )}
            </div>
            <p className="dim peq" style={{ marginTop: 12, maxWidth: '52ch' }}>
              Aprovar cria a pessoa no time na hora, com as funções marcadas como{' '}
              <strong>a conferir</strong>. Encerrar não é um não definitivo: a tela dela
              diz isso e oferece as outras áreas.
            </p>
          </>
        )}
        {c.status === 'aprovada' && (
          <>
            <span className="lid-cand-mini">Quando vir a pessoa servindo</span>
            <div className="lid-cand-btns" style={{ marginTop: 16 }}>
              <button className="lid-bt-txt" disabled={ocupado}
                onClick={() => agir('ativa', 'marcado como servindo')}>
                Marcar como servindo
              </button>
              <Link className="lid-bt-txt" href="/time">Conferir o nível na aba Time</Link>
            </div>
          </>
        )}

        {/* O QUE ELA MANDOU */}
        <span className="lid-cand-mini">O que {primeiro(nome)} mandou</span>
        <dl className="lid-cand-dl">
          <dt>Chegou</dt><dd>{dia(c.criado_em)} · {espera(dias)}</dd>
          <dt>WhatsApp</dt><dd>{telefoneLegivel(tel) || 'não informou'}</dd>
          {c.pessoas?.email && <><dt>E-mail</dt><dd>{c.pessoas.email}</dd></>}
          <dt>Quer fazer</dt>
          <dd>{funcoes.length ? funcoes.join(', ') : 'não marcou nenhuma função'}</dd>
          {resp.map(r => (
            <span key={r.pergunta} style={{ display: 'contents' }}>
              <dt>{r.pergunta}</dt><dd>{r.resposta.split('|').join(', ')}</dd>
            </span>
          ))}
        </dl>

        {/* ANOTAÇÃO */}
        <span className="lid-cand-mini">Anotação da liderança</span>
        <textarea rows={2} value={nota} className="lid-cand-nota"
          placeholder="o que ficou combinado, o que falta…"
          aria-label={`Anotação sobre ${nome}, só a liderança vê`}
          onChange={e => setNota(e.target.value)} />
        <p className="dim peq" style={{ marginTop: 6 }}>
          Só a liderança vê. Fica junto da próxima decisão que você tomar aqui.
        </p>
        {c.nota_interna && (
          <p className="dim peq" style={{ marginTop: 8 }}>Já anotado: {c.nota_interna}</p>
        )}

        {hist.length > 0 && (
          <>
            <span className="lid-cand-mini">Histórico</span>
            <ul className="lid-cand-hist">
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
          </>
        )}
      </div>
    </details>
  );
}
