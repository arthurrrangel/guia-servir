'use client';
/* =============================================================================
   O CRONOGRAMA DO CULTO, NA CASCA DO LÍDER — 109, 03/10/2026

   A aba "Culto": a lista dos próximos cultos com o que falta em cada um
   (`ListaDeCronogramas`), a folha de um culto para preencher
   (`EditorDoCronograma`) e o cartão do painel (`CronogramaNoPainel`).

   CADA BLOCO GRAVA SOZINHO. A Palavra, os horários, a música final e os
   avisos são gravações separadas (`cronograma_salvar`), cada uma com o que
   a tela tinha lido: duas pessoas preenchendo blocos diferentes ao mesmo
   tempo não se atrapalham, e no mesmo bloco a segunda recebe o que a
   primeira gravou (MUDOU) em vez de apagar.

   QUALQUER LÍDER PREENCHE QUALQUER BLOCO (o Arthur: "para a gente nunca
   depender de ninguém"). O dono de cada bloco aparece escrito, e cada
   gravação fica com o nome de quem gravou.

   As regras moram em lib/cronograma.ts; o banco, em lib/cronograma-banco.ts.
   ============================================================================= */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp, copiar } from '@/components/Shell';
import { Aviso, Cab, Fio, Pilula, Secao, Vazio, Esqueleto, type Tom } from '@/components/escalas/Pecas';
import { IcSeta, IcCopiar, IcEnviar, IcMais, IcX } from '@/components/Icones';
import { FolhaParaImprimir } from '@/components/cronograma/FolhaDoCulto';
import {
  type Aviso as AvisoDoCulto, type Bloco, type Folha, type Horario, type Palavra, type Pendencia, TETO,
  antesDoBloco, avisosParaGravar, diaCurto, donoDoDirigente, donoDoLouvor, erroDoCronograma, estadoDaFolha,
  horarioDaFolha, linhaDaMusicaNaFolha, linhaParaGravar, linkDaFolha, louvorParaGravar, mensagemDoGrupo,
  palavraParaGravar, pendenciasDaFolha, quemNoComando, rotuloDaAtualizacao, rotuloDaAutoria, rotuloDoPapel,
  rotuloDoPrazo, semCronogramaNoBanco, tituloDaFolha, direcaoDa, prazoDaFolha,
} from '@/lib/cronograma';
import {
  type Registrado, cronogramaDoDia, cronogramasDasDatas, cronogramasRegistrados, linkDoCronograma, salvarBloco,
} from '@/lib/cronograma-banco';
import { aviseHumano } from '@/lib/erros';
import { cultosAte, hojeISO } from '@/lib/engine';
import { IGREJA } from '@/lib/igreja';

const ehDemo = () => process.env.NODE_ENV === 'development'
  && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('demo');
const varianteDemo = () => new URLSearchParams(window.location.search).get('demo') || '';

const tomDoEstado = (t: 'ok' | 'warn' | 'bad' | 'neutro'): Tom => t;

/* ============================================================== a lista == */
export function ListaDeCronogramas() {
  const { aviso } = useApp();
  const hoje = hojeISO();
  const [proximos, setProximos] = useState<Folha[] | null>(null);
  const [registrados, setRegistrados] = useState<Registrado[] | null>(null);
  const [fase, setFase] = useState<'ok' | 'sem-109' | 'falhou'>('ok');

  useEffect(() => {
    let vivo = true;
    void (async () => {
      if (ehDemo()) {
        const { cronogramasDemo } = await import('@/lib/demo');
        const d = cronogramasDemo();
        if (vivo) { setProximos(d.proximos); setRegistrados(d.registrados); }
        return;
      }
      try {
        const [p, r] = await Promise.all([
          cronogramasDasDatas(cultosAte(hoje, 27).slice(0, 8)),
          cronogramasRegistrados(hoje, 60),
        ]);
        if (vivo) { setProximos(p); setRegistrados(r); }
      } catch (e) {
        if (!vivo) return;
        if (semCronogramaNoBanco(e)) setFase('sem-109');
        else { setFase('falhou'); aviso(aviseHumano(e, 'carregar os cronogramas')); }
      }
    })();
    return () => { vivo = false; };
  }, [hoje, aviso]);

  return (
    <>
      <Cab rot="Culto" titulo="Cronograma do culto"
        meta={`Uma folha por culto: a Palavra, quem está no comando, os horários, o louvor e os avisos. Prazo: ${PRAZO_TXT}.`} />
      {fase === 'sem-109' && <SemCronograma />}
      {fase === 'falhou' && <Aviso tom="bad">Não consegui carregar os cronogramas. Recarregue a página.</Aviso>}
      {fase === 'ok' && !proximos && <Esqueleto />}
      {fase === 'ok' && proximos && (
        <>
          <Secao titulo="Próximos cultos">
            <div className="es-fila">
              {proximos.map(f => <LinhaDaLista key={f.data} f={f} hoje={hoje} />)}
            </div>
          </Secao>
          <Secao titulo="Já aconteceram" sub="Cada cronograma fica registrado aqui, como foi.">
            {registrados && registrados.length ? (
              <div className="es-fila">
                {registrados.map(r => (
                  <Link key={r.data} href={`/cronogramas/${r.data}`} className="es-item">
                    <span className="es-c-tit">
                      <b>{diaCurto(r.data)}{r.tipo === 'follow' ? ' · Follow' : ''}</b>
                      <small>{[r.tema || 'sem tema registrado', r.quem].filter(Boolean).join(' · ')}</small>
                    </span>
                    <span className="es-c-acao"><IcSeta /></span>
                  </Link>
                ))}
              </div>
            ) : <Vazio titulo="Nenhum cronograma registrado ainda" solto>O primeiro aparece aqui depois do culto.</Vazio>}
          </Secao>
        </>
      )}
    </>
  );
}
const PRAZO_TXT = 'três dias antes do culto';

function LinhaDaLista({ f, hoje }: { f: Folha; hoje: string }) {
  const est = estadoDaFolha(f, hoje);
  const sub = [f.palavra?.tema || 'sem tema ainda', f.palavra?.quem].filter(Boolean).join(' · ');
  return (
    <Link href={`/cronogramas/${f.data}`} className="es-item" aria-label={`${tituloDaFolha(f.data)}: ${est.texto}. Abrir`}>
      <span className="es-c-tit">
        <b>{tituloDaFolha(f.data)}</b>
        <small>{sub}</small>
      </span>
      <span className="es-c-meta"><span className="es-c-est"><Pilula tom={tomDoEstado(est.tom)}>{est.texto}</Pilula></span></span>
      <span className="es-c-acao"><IcSeta /></span>
    </Link>
  );
}

function SemCronograma() {
  return (
    <Vazio titulo="O cronograma ainda não está ligado" solto>
      Falta a atualização 109 no banco. Assim que ela rodar, os cultos aparecem aqui.
    </Vazio>
  );
}

/* ========================================================== o cartão ===== */
/** No painel: o próximo culto, de longe, e o que é com este líder. */
export function CronogramaNoPainel() {
  const { equipe } = useApp();
  const hoje = hojeISO();
  const [f, setF] = useState<Folha | null>(null);
  const [admin, setAdmin] = useState(false);
  const prox = cultosAte(hoje, 8)[0];
  useEffect(() => {
    let vivo = true;
    if (!prox) return;
    void (async () => {
      try {
        if (ehDemo()) {
          const { cronogramaDemo } = await import('@/lib/demo');
          if (vivo) setF(cronogramaDemo('parcial', prox));
          return;
        }
        const r = await cronogramaDoDia(prox);
        if (vivo) { setF(r.folha); setAdmin(r.admin); }
      } catch { /* sem a 109 ou sem rede: o cartão não aparece */ }
    })();
    return () => { vivo = false; };
  }, [prox]);
  if (!f) return null;
  const est = estadoDaFolha(f, hoje);
  const pend = pendenciasDaFolha(f);
  const minhas = equipe && !admin ? pend.filter(p => p.equipeId === equipe.id) : [];
  const lista = (minhas.length ? minhas : pend).slice(0, 3);
  return (
    <Secao titulo={`Cronograma · ${tituloDaFolha(f.data)}`}
      sub={minhas.length
        ? `${minhas.length === 1 ? '1 coisa é' : `${minhas.length} coisas são`} com ${equipe?.nome || 'você'}. ${hoje > prazoDaFolha(f.data) ? 'O prazo era' : 'Prazo:'} ${rotuloDoPrazo(f.data)}.`
        : est.texto}
      acoes={<Link href={`/cronogramas/${f.data}`} className="es-btn es-peq">Abrir</Link>}>
      {!!lista.length && (
        <div className="es-fila">
          {lista.map(p => (
            <Link key={p.chave} href={`/cronogramas/${f.data}#cr-${p.bloco}`} className="es-item es-so-tit">
              <span className="es-c-tit"><b>{p.texto}</b><small>{p.posto ? `${p.posto} · escala de ${p.dono}` : p.dono}</small></span>
              <span className="es-c-acao"><IcSeta /></span>
            </Link>
          ))}
        </div>
      )}
    </Secao>
  );
}

/* ========================================================= a folha ======= */
type Carga = { folha: Folha; podeEditar: boolean; admin: boolean };

export function EditorDoCronograma({ data }: { data: string }) {
  const { aviso, equipes, trocarEquipe, base } = useApp();
  const router = useRouter();
  const hoje = hojeISO();
  const [carga, setCarga] = useState<Carga | null>(null);
  const [fase, setFase] = useState<'carregando' | 'ok' | 'sem-109' | 'sem-culto' | 'falhou'>('carregando');
  const [aberto, setAberto] = useState<Bloco | null>(null);
  const [gravando, setGravando] = useState(false);
  const [mandar, setMandar] = useState<{ token: string } | null>(null);
  const [abrindoLink, setAbrindoLink] = useState(false);

  const ler = useCallback(async () => {
    if (ehDemo()) {
      const { cronogramaDemo } = await import('@/lib/demo');
      const f = cronogramaDemo(varianteDemo(), data);
      if (f) { setCarga({ folha: f, podeEditar: f.data >= hoje, admin: true }); setFase('ok'); }
      else setFase('sem-culto');
      return;
    }
    try {
      const r = await cronogramaDoDia(data);
      setCarga(r); setFase('ok');
    } catch (e: any) {
      if (semCronogramaNoBanco(e)) setFase('sem-109');
      else if (e?.erroDoBanco === 'DATA_SEM_CULTO') setFase('sem-culto');
      else { setFase('falhou'); }
    }
  }, [data, hoje]);
  useEffect(() => { setFase('carregando'); setAberto(null); setMandar(null); void ler(); }, [ler]);

  /* a âncora (#cr-palavra) chega antes da folha: rola quando ela existe */
  const rolou = useRef(false);
  useEffect(() => {
    if (rolou.current || fase !== 'ok' || !window.location.hash) return;
    const el = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
    if (el) { rolou.current = true; el.scrollIntoView({ block: 'start' }); }
  }, [fase]);

  /** grava um bloco; devolve se gravou */
  async function gravar(bloco: Bloco, valor: unknown, modelo = false): Promise<boolean> {
    if (!carga) return false;
    const f = carga.folha;
    /* no harness (?demo) a folha vem da fixture, mas gravar vai ao banco
       como sempre: o teste de tela intercepta e confere o pedido */
    setGravando(true);
    try {
      const r = await salvarBloco(data, bloco, valor, antesDoBloco(f, bloco), modelo);
      if (r.ok) {
        setCarga(c => c && { ...c, folha: aplicar(c.folha, bloco, r.valor, r.linhaPropria, r.autoria) });
        aviso(modelo ? 'Salvo, e os próximos cultos deste tipo usam estes horários.' : 'Salvo.');
        return true;
      }
      if (r.erro === 'MUDOU') {
        /* quem gravou no meio ganha: a tela passa a mostrar o que está lá */
        setCarga(c => c && { ...c, folha: aplicar(c.folha, bloco, r.atual ?? null, null, null) });
        setAberto(null);
      }
      aviso(erroDoCronograma(r));
      return false;
    } catch (e) {
      aviso(semCronogramaNoBanco(e) ? 'O cronograma ainda não está ligado no banco (atualização 109).' : aviseHumano(e, 'salvar o cronograma'));
      return false;
    } finally {
      setGravando(false);
    }
  }

  async function abrirMandar() {
    if (!carga) return;
    if (carga.folha.token) { setMandar({ token: carga.folha.token }); return; }
    setAbrindoLink(true);
    try {
      const token = await linkDoCronograma(data);
      setCarga(c => c && { ...c, folha: { ...c.folha, token, existe: true } });
      setMandar({ token });
    } catch (e) {
      aviso(semCronogramaNoBanco(e) ? 'O cronograma ainda não está ligado no banco (atualização 109).' : aviseHumano(e, 'gerar o link da folha'));
    } finally {
      setAbrindoLink(false);
    }
  }

  if (fase === 'carregando') return <><Volta /><Esqueleto /></>;
  if (fase === 'sem-109') return <><Volta /><SemCronograma /></>;
  if (fase === 'sem-culto') return (
    <><Volta /><Vazio titulo="Esta data não tem culto da igreja" solto>O cronograma é dos domingos e dos sábados do Follow.</Vazio></>
  );
  if (fase === 'falhou' || !carga) return (
    <><Volta /><Aviso tom="bad">Não consegui carregar este cronograma. <button type="button" className="es-btn es-txt es-peq" onClick={() => { setFase('carregando'); void ler(); }}>Tentar de novo</button></Aviso></>
  );

  const f = carga.folha;
  const est = estadoDaFolha(f, hoje);
  const pend = pendenciasDaFolha(f);
  const pode = carga.podeEditar;
  const hora = horarioDaFolha(f, IGREJA.cultoHora, IGREJA.followHora);
  const minhasEquipes = new Set(equipes.map(e => e.id));
  const ehMinha = (p: Pendencia) => !carga.admin && !!p.equipeId && minhasEquipes.has(p.equipeId);
  const baseDoLink = (typeof window !== 'undefined' ? window.location.origin : base) || 'https://guiaservir.com';
  const travado = gravando;
  const abrir = (b: Bloco) => { setAberto(b); };
  const fechar = () => setAberto(null);

  async function irParaEscala(equipeId: string) {
    if (await trocarEquipe(equipeId)) router.push(`/escala?m=${data.slice(0, 7)}#d${data}`);
  }

  return (
    <div className="es-cr">
      {gravando && <Fio />}
      <Volta />
      <Cab rot="Cronograma do culto" titulo={tituloDaFolha(data)}
        meta={[hora, f.palavra ? (f.palavra.ceia ? 'Com Santa Ceia' : 'Sem Santa Ceia') : null,
               f.palavra?.quem ? `Palavra: ${f.palavra.quem}` : null].filter(Boolean).join(' · ')}
        acoes={<>
          <button type="button" className="es-btn es-pri" onClick={() => void abrirMandar()} disabled={abrindoLink}
            aria-expanded={!!mandar} aria-controls="cr-mandar">
            <IcEnviar /> Mandar no grupo
          </button>
          <button type="button" className="es-btn" onClick={() => window.print()}>Salvar PDF</button>
        </>} />

      {mandar && (
        <MandarNoGrupo id="cr-mandar" folha={f} link={linkDaFolha(baseDoLink, mandar.token)} faltam={pend.length}
          fechar={() => setMandar(null)} aviso={aviso} />
      )}

      <div className="es-cr-estado">
        <Aviso tom={est.tom === 'neutro' ? 'info' : est.tom}>
          {est.tipo === 'pronto' ? 'Tudo pronto. Já dá para mandar no grupo.'
            : est.tipo === 'passou' ? 'Culto realizado. Este cronograma fica registrado como está.'
            : est.tipo === 'atrasado' ? <><b>{pend.length === 1 ? 'Falta 1 coisa' : `Faltam ${pend.length} coisas`}</b> e o prazo era {rotuloDoPrazo(f.data)}.</>
            : <><b>{pend.length === 1 ? 'Falta 1 coisa' : `Faltam ${pend.length} coisas`}</b> até {rotuloDoPrazo(f.data)} (três dias antes do culto).</>}
        </Aviso>
        {!!pend.length && est.tipo !== 'passou' && (
          <div className="es-fila es-cr-pend">
            {pend.map(p => (
              <a key={p.chave} href={`#cr-${p.bloco}`} className="es-item es-so-tit">
                <span className="es-c-tit"><b>{p.texto}</b><small>{p.posto ? `${p.posto} · escala de ${p.dono}` : p.dono}</small></span>
                <span className="es-c-acao">{ehMinha(p) && <Pilula tom="warn">é com você</Pilula>}<IcSeta /></span>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------ a Palavra */}
      <Secao id="cr-palavra" titulo="A Palavra"
        sub={`Preenche: ${donoDoDirigente(f)}, pelo link dele`}
        acoes={pode && aberto !== 'palavra' ? <button type="button" className="es-btn es-peq" disabled={travado || !!aberto} onClick={() => abrir('palavra')}>Editar</button> : undefined}>
        {aberto === 'palavra'
          ? <FormPalavra inicial={f.palavra} gravando={gravando} cancelar={fechar}
              salvar={async p => { if (await gravar('palavra', palavraParaGravar(p))) fechar(); }} />
          : (
            <dl className="es-cr-dl">
              <CampoLido rot="Quem prega" valor={f.palavra?.quem} />
              <CampoLido rot="Tema" valor={f.palavra?.tema} forte />
              <CampoLido rot="Leitura" valor={f.palavra?.leitura} />
              <CampoLido rot="Frase na tela" valor={f.palavra?.frase} opcional />
              <CampoLido rot="Santa Ceia" valor={f.palavra ? (f.palavra.ceia ? 'Sim' : 'Não') : undefined} />
            </dl>
          )}
        <Salvo a={f.autoria.palavra} />
      </Secao>

      {/* ----------------------------------------------------- No comando */}
      <Secao id="cr-comando" titulo="No comando" sub="Sai da escala de cada área. Para mudar quem está, abra a escala da área.">
        {f.comando.length ? (
          <div className="es-fila">
            {f.comando.map(c => {
              const quem = quemNoComando(c);
              const minha = minhasEquipes.has(c.equipeId);
              return (
                <div key={c.funcaoId} className="es-item es-cr-cmd">
                  <span className="es-c-tit">
                    <b>{rotuloDoPapel(c)}</b>
                    <small>{c.papel === 'lider' ? c.posto : `${c.equipe} · ${c.posto}`}</small>
                  </span>
                  <span className="es-c-meta">
                    <span className="es-cr-quem">{quem || 'ninguém escalado'}</span>
                    <span className="es-c-est">
                      {!quem ? <Pilula tom="bad">sem ninguém</Pilula>
                        : c.convidado && !c.nome ? <Pilula tom="info">de fora da lista</Pilula>
                        : c.status === 'confirmado' ? <Pilula tom="ok">confirmou</Pilula>
                        : <Pilula tom="warn">sem resposta</Pilula>}
                    </span>
                  </span>
                  <span className="es-c-acao">
                    {minha && pode && (
                      <button type="button" className="es-btn es-txt es-peq" onClick={() => void irParaEscala(c.equipeId)}
                        aria-label={`Abrir a escala de ${c.equipe}`}>Escala <IcSeta /></button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        ) : <Vazio titulo="Nenhum posto marcado para aparecer aqui" solto />}
      </Secao>

      {/* ------------------------------------------------------ os horários */}
      <Secao id="cr-linha" titulo="Cronograma"
        sub={`Preenche: ${direcaoDa(f)?.equipe || 'Produção'} · ${f.linhaPropria ? 'horários só deste culto' : `o modelo ${f.tipo === 'follow' ? 'do Follow' : 'do domingo'}`}`}
        acoes={pode && aberto !== 'linha' ? <button type="button" className="es-btn es-peq" disabled={travado || !!aberto} onClick={() => abrir('linha')}>Editar</button> : undefined}>
        {aberto === 'linha'
          ? <FormLinha inicial={f.linha} tipo={f.tipo} propria={f.linhaPropria} gravando={gravando} cancelar={fechar}
              salvar={async (l, modelo) => { if (await gravar('linha', l, modelo)) fechar(); }}
              voltarAoModelo={async () => { if (await gravar('linha', null)) fechar(); }} />
          : f.linha.length ? (
            <table className="es-cr-tab">
              <tbody>
                {f.linha.map((l, i) => (
                  <tr key={`${l.h}-${i}`}>
                    <th scope="row">{l.h.replace(':', 'h')}</th>
                    <td><span className="es-cr-o">{l.o}</span>{l.q && <span className="es-cr-q">{l.q}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Vazio titulo="Sem horários" solto>Toque em Editar para montar.</Vazio>}
        {f.linhaPropria && <Salvo a={f.autoria.linha} />}
      </Secao>

      {/* --------------------------------------------------------- o Louvor */}
      <Secao id="cr-louvor" titulo="Louvor"
        sub={`Preenche: ${donoDoLouvor(f)}${f.repertorio.length ? ' · as músicas vêm da ordem do culto' : ''}`}>
        {f.musicas.length ? (
          <ol className="es-cr-musicas">{f.musicas.map((m, i) => <li key={`${m.titulo}-${i}`}>{linhaDaMusicaNaFolha(m)}</li>)}</ol>
        ) : f.repertorio.length ? (
          <p className="es-cr-nada">As músicas ainda não estão na ordem do culto.</p>
        ) : null}
        {f.repertorio.some(r => minhasEquipes.has(r.equipeId)) && pode && (
          <p className="es-cr-nota">
            <button type="button" className="es-link es-cr-linkbtn" onClick={() => void irParaEscala(f.repertorio[0].equipeId)}>
              Montar a ordem do culto na escala do {f.repertorio[0].equipe}
            </button>
          </p>
        )}
        <div className="es-cr-final">
          {aberto === 'louvor'
            ? <FormFinal inicial={f.louvor?.final || ''} gravando={gravando} cancelar={fechar}
                salvar={async t => { if (await gravar('louvor', louvorParaGravar({ final: t }))) fechar(); }} />
            : (
              <>
                <dl className="es-cr-dl"><CampoLido rot="Música final" valor={f.louvor?.final} /></dl>
                {pode && <button type="button" className="es-btn es-peq" disabled={travado || !!aberto} onClick={() => abrir('louvor')}>
                  {f.louvor?.final ? 'Trocar' : 'Escrever a música final'}
                </button>}
              </>
            )}
        </div>
        <Salvo a={f.autoria.louvor} />
      </Secao>

      {/* --------------------------------------------------------- os avisos */}
      <Secao id="cr-avisos" titulo="Avisos"
        sub={`Preenche: ${donoDoDirigente(f)}, pelo link dele`}
        acoes={pode && aberto !== 'avisos' ? <button type="button" className="es-btn es-peq" disabled={travado || !!aberto} onClick={() => abrir('avisos')}>Editar</button> : undefined}>
        {aberto === 'avisos'
          ? <FormAvisos inicial={f.avisos || []} gravando={gravando} cancelar={fechar}
              salvar={async a => { if (await gravar('avisos', avisosParaGravar(a))) fechar(); }} />
          : f.avisos === null ? <p className="es-cr-nada">Ainda ninguém escreveu os avisos.</p>
          : f.avisos.length === 0 ? <p className="es-cr-nada">Sem avisos neste culto.</p>
          : (
            <ol className="es-cr-avisos">
              {f.avisos.map((a, i) => (
                <li key={`${a.texto}-${i}`}><span>{a.texto}</span>{a.como && <span className="es-cr-como">{a.como === 'video' ? 'vídeo' : 'falado'}</span>}</li>
              ))}
            </ol>
          )}
        <Salvo a={f.autoria.avisos} />
      </Secao>

      {f.atualizadoEm && <p className="es-cr-pe">{rotuloDaAtualizacao(f.atualizadoEm)}</p>}

      <FolhaParaImprimir folha={f} hoje={hoje} cultoHora={IGREJA.cultoHora} followHora={IGREJA.followHora}
        atualizado={rotuloDaAtualizacao(f.atualizadoEm) || undefined} />
    </div>
  );
}

function Volta() {
  return <p className="es-cr-volta"><Link href="/cronogramas" className="es-link"><IcSeta dir="e" /> Todos os cultos</Link></p>;
}

/** o bloco gravado entra na folha da tela, com a autoria nova */
function aplicar(f: Folha, bloco: Bloco, valor: unknown, linhaPropria: boolean | null,
                 autoria: { por: string; em: string; via: 'lider' | 'dirigente' } | null): Folha {
  const n: Folha = { ...f, existe: true, autoria: { ...f.autoria } };
  if (autoria) { n.autoria[bloco] = autoria; n.atualizadoEm = autoria.em; }
  if (bloco === 'palavra') n.palavra = (valor as Palavra) || null;
  else if (bloco === 'avisos') n.avisos = Array.isArray(valor) ? (valor as AvisoDoCulto[]) : null;
  else if (bloco === 'louvor') n.louvor = valor && typeof valor === 'object' ? (valor as { final?: string }) : null;
  else {
    n.linha = Array.isArray(valor) ? (valor as Horario[]) : f.linha;
    if (linhaPropria !== null) n.linhaPropria = linhaPropria;
  }
  return n;
}

function CampoLido({ rot, valor, forte, opcional }: { rot: string; valor?: string; forte?: boolean; opcional?: boolean }) {
  return (
    <div className="es-cr-campo">
      <dt>{rot}</dt>
      <dd className={forte && valor ? 'es-cr-forte' : undefined}>
        {valor || (opcional ? <span className="es-cr-sem">não tem</span> : <span className="es-cr-falta">falta</span>)}
      </dd>
    </div>
  );
}

/** "Salvo por Paulo (dirigente), qua 20h05", no pé do bloco */
function Salvo({ a }: { a?: { por: string; em: string; via: 'lider' | 'dirigente' } }) {
  if (!a) return null;
  return <p className="es-cr-salvo">Salvo {rotuloDaAutoria(a)}</p>;
}

/* ------------------------------------------------------------ formulários */
export function FormPalavra({ inicial, gravando, salvar, cancelar }: {
  inicial: Palavra | null; gravando: boolean; salvar: (p: Palavra) => void; cancelar: () => void;
}) {
  const [p, setP] = useState<Palavra>({ ...(inicial || {}) });
  const mudar = (k: 'quem' | 'tema' | 'leitura' | 'frase') => (e: { target: { value: string } }) => setP(x => ({ ...x, [k]: e.target.value }));
  return (
    <form className="es-cr-form" noValidate aria-label="A Palavra"
      onSubmit={e => { e.preventDefault(); salvar(p); }}
      onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); cancelar(); } }}>
      <div className="es-dupla">
        <label className="es-campo" htmlFor="cr-quem"><span>Quem prega</span>
          <input id="cr-quem" className="es-ctl" autoComplete="off" enterKeyHint="next" maxLength={TETO.quem}
            placeholder="ex: Pr. Altomir Rangel" value={p.quem || ''} onChange={mudar('quem')} autoFocus /></label>
        <label className="es-campo" htmlFor="cr-leitura"><span>Leitura</span>
          <input id="cr-leitura" className="es-ctl" autoComplete="off" enterKeyHint="next" maxLength={TETO.leitura}
            placeholder="ex: Gênesis 32:30" value={p.leitura || ''} onChange={mudar('leitura')} /></label>
      </div>
      <label className="es-campo" htmlFor="cr-tema"><span>Tema</span>
        <input id="cr-tema" className="es-ctl" autoComplete="off" enterKeyHint="next" maxLength={TETO.tema}
          placeholder="ex: Peniel: hoje Deus mudará sua identidade" value={p.tema || ''} onChange={mudar('tema')} /></label>
      <label className="es-campo" htmlFor="cr-frase"><span>Frase na tela <i className="es-cr-opc">(se tiver)</i></span>
        <textarea id="cr-frase" className="es-ctl es-cr-curta" rows={2} maxLength={TETO.frase}
          value={p.frase || ''} onChange={mudar('frase')} />
        <small>A frase que a Mídia projeta depois da leitura.</small></label>
      <label className="es-caixinha">
        <input type="checkbox" checked={!!p.ceia} onChange={e => setP(x => ({ ...x, ceia: e.target.checked }))} />
        Este culto tem Santa Ceia
      </label>
      <div className="es-linha es-cr-botoes">
        <button type="submit" className="es-btn es-pri" disabled={gravando} aria-busy={gravando || undefined}>Salvar</button>
        <button type="button" className="es-btn es-txt" onClick={cancelar} disabled={gravando}>Cancelar</button>
      </div>
    </form>
  );
}

type LinhaEditada = { h: string; o: string; q: string; k: number };
let chaveDaLinha = 0;

function FormLinha({ inicial, tipo, propria, gravando, salvar, cancelar, voltarAoModelo }: {
  inicial: Horario[]; tipo: 'domingo' | 'follow'; propria: boolean; gravando: boolean;
  salvar: (l: Horario[], modelo: boolean) => void; cancelar: () => void; voltarAoModelo: () => void;
}) {
  const [rows, setRows] = useState<LinhaEditada[]>(() => inicial.map(l => ({ h: l.h, o: l.o, q: l.q || '', k: ++chaveDaLinha })));
  const [modelo, setModelo] = useState(false);
  const [erro, setErro] = useState<{ indice: number } | null>(null);
  const novo = useRef<number | null>(null);
  const mudar = (i: number, k: 'h' | 'o' | 'q') => (e: { target: { value: string } }) => {
    setRows(r => r.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)));
    if (erro?.indice === i) setErro(null);
  };
  useEffect(() => {
    if (novo.current === null) return;
    document.getElementById(`cr-h-${novo.current}`)?.focus();
    novo.current = null;
  }, [rows.length]);
  function enviar() {
    const r = linhaParaGravar(rows);
    if (!r.ok) {
      setErro({ indice: r.indice });
      document.getElementById(`cr-h-${rows[r.indice]?.k}`)?.focus();
      return;
    }
    salvar(r.linha, modelo);
  }
  const deTipo = tipo === 'follow' ? 'Follows' : 'domingos';
  return (
    <form className="es-cr-form" noValidate aria-label="Horários do culto"
      onSubmit={e => { e.preventDefault(); enviar(); }}
      onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); cancelar(); } }}>
      <div className="es-cr-lin es-cr-lin-cab" aria-hidden="true"><span>Hora</span><span>O que acontece</span><span>Quem</span><span /></div>
      <ol className="es-cr-linhas">
        {rows.map((r, i) => (
          <li key={r.k} className="es-cr-lin">
            <input id={`cr-h-${r.k}`} className="es-ctl es-cr-hora" inputMode="numeric" autoComplete="off" maxLength={6}
              placeholder="09:00" value={r.h} onChange={mudar(i, 'h')} aria-label={`Hora, linha ${i + 1}`}
              aria-invalid={erro?.indice === i || undefined}
              aria-describedby={erro?.indice === i ? `cr-he-${r.k}` : undefined} />
            <input id={`cr-o-${r.k}`} className="es-ctl es-cr-oque" autoComplete="off" maxLength={TETO.o} value={r.o}
              onChange={mudar(i, 'o')} aria-label={`O que acontece, linha ${i + 1}`} placeholder="O que acontece" />
            <input id={`cr-q-${r.k}`} className="es-ctl es-cr-quemfaz" autoComplete="off" maxLength={TETO.q} value={r.q}
              onChange={mudar(i, 'q')} aria-label={`Quem, linha ${i + 1}`} placeholder="Quem" />
            <button type="button" className="es-btn es-txt es-peq es-cr-tira" aria-label={`Tirar a linha ${i + 1}${r.o ? `, ${r.o}` : ''}`}
              onClick={() => setRows(x => x.filter((_, j) => j !== i))} disabled={gravando}><IcX /></button>
            {erro?.indice === i && <small className="es-erro-campo es-cr-erro" id={`cr-he-${r.k}`}>Escreva a hora como 9:30 ou 19h.</small>}
          </li>
        ))}
      </ol>
      <div className="es-linha">
        <button type="button" className="es-btn es-peq" disabled={gravando || rows.length >= TETO.linhas}
          onClick={() => { const k = ++chaveDaLinha; novo.current = k; setRows(x => [...x, { h: '', o: '', q: '', k }]); }}>
          <IcMais /> Acrescentar horário
        </button>
      </div>
      <label className="es-caixinha es-cr-modelo">
        <input type="checkbox" checked={modelo} onChange={e => setModelo(e.target.checked)} />
        Usar estes horários nos próximos {deTipo}
      </label>
      <div className="es-linha es-cr-botoes">
        <button type="submit" className="es-btn es-pri" disabled={gravando} aria-busy={gravando || undefined}>Salvar</button>
        <button type="button" className="es-btn es-txt" onClick={cancelar} disabled={gravando}>Cancelar</button>
        {propria && <button type="button" className="es-btn es-txt" onClick={voltarAoModelo} disabled={gravando}>Voltar ao modelo</button>}
      </div>
      <p className="es-cr-nota">A hora coloca a linha no lugar sozinha. Linha sem “o que acontece” sai.</p>
    </form>
  );
}

function FormFinal({ inicial, gravando, salvar, cancelar }: {
  inicial: string; gravando: boolean; salvar: (t: string) => void; cancelar: () => void;
}) {
  const [t, setT] = useState(inicial);
  return (
    <form className="es-cr-form" noValidate aria-label="Música final"
      onSubmit={e => { e.preventDefault(); salvar(t); }}
      onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); cancelar(); } }}>
      <label className="es-campo" htmlFor="cr-final"><span>Música final</span>
        <input id="cr-final" className="es-ctl" autoComplete="off" enterKeyHint="done" maxLength={TETO.final}
          placeholder="A música depois da bênção" value={t} onChange={e => setT(e.target.value)} autoFocus /></label>
      <div className="es-linha es-cr-botoes">
        <button type="submit" className="es-btn es-pri" disabled={gravando} aria-busy={gravando || undefined}>Salvar</button>
        <button type="button" className="es-btn es-txt" onClick={cancelar} disabled={gravando}>Cancelar</button>
      </div>
    </form>
  );
}

type AvisoEditado = { texto: string; como: '' | 'falado' | 'video'; k: number };

export function FormAvisos({ inicial, gravando, salvar, cancelar, rotuloSalvar }: {
  inicial: AvisoDoCulto[]; gravando: boolean; salvar: (a: AvisoDoCulto[]) => void; cancelar: () => void;
  rotuloSalvar?: string;
}) {
  const [rows, setRows] = useState<AvisoEditado[]>(() => inicial.length
    ? inicial.map(a => ({ texto: a.texto, como: a.como || '', k: ++chaveDaLinha }))
    : [{ texto: '', como: 'falado', k: ++chaveDaLinha }]);
  const novo = useRef<number | null>(null);
  useEffect(() => {
    if (novo.current === null) return;
    document.getElementById(`cr-a-${novo.current}`)?.focus();
    novo.current = null;
  }, [rows.length]);
  const cheios = rows.filter(r => r.texto.trim()).length;
  const enviar = () => salvar(rows.map(r => (r.como ? { texto: r.texto, como: r.como } : { texto: r.texto })));
  return (
    <form className="es-cr-form" noValidate aria-label="Avisos"
      onSubmit={e => { e.preventDefault(); enviar(); }}
      onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); cancelar(); } }}>
      <ol className="es-cr-linhas es-cr-avisos-ed">
        {rows.map((r, i) => (
          <li key={r.k} className="es-cr-av">
            <input id={`cr-a-${r.k}`} className="es-ctl es-cr-avtexto" autoComplete="off" maxLength={TETO.aviso}
              placeholder={i === 0 ? 'ex: Batismo no domingo 25' : 'Outro aviso'} value={r.texto}
              aria-label={`Aviso ${i + 1}`} autoFocus={i === 0 && !inicial.length}
              onChange={e => setRows(x => x.map((y, j) => (j === i ? { ...y, texto: e.target.value } : y)))} />
            <select id={`cr-c-${r.k}`} className="es-ctl es-cr-avcomo" value={r.como} aria-label={`Como é o aviso ${i + 1}`}
              onChange={e => setRows(x => x.map((y, j) => (j === i ? { ...y, como: e.target.value as AvisoEditado['como'] } : y)))}>
              <option value="falado">falado</option>
              <option value="video">vídeo</option>
              <option value="">sem dizer</option>
            </select>
            <button type="button" className="es-btn es-txt es-peq es-cr-tira" aria-label={`Tirar o aviso ${i + 1}`}
              onClick={() => setRows(x => x.filter((_, j) => j !== i))} disabled={gravando}><IcX /></button>
          </li>
        ))}
      </ol>
      <div className="es-linha">
        <button type="button" className="es-btn es-peq" disabled={gravando || rows.length >= TETO.avisos}
          onClick={() => { const k = ++chaveDaLinha; novo.current = k; setRows(x => [...x, { texto: '', como: 'falado', k }]); }}>
          <IcMais /> Acrescentar aviso
        </button>
      </div>
      <div className="es-linha es-cr-botoes">
        <button type="submit" className="es-btn es-pri" disabled={gravando} aria-busy={gravando || undefined}>
          {cheios ? (rotuloSalvar || 'Salvar') : 'Salvar: sem avisos neste culto'}
        </button>
        <button type="button" className="es-btn es-txt" onClick={cancelar} disabled={gravando}>Cancelar</button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------ mandar no grupo */
function MandarNoGrupo({ id, folha, link, faltam, fechar, aviso }: {
  id: string; folha: Folha; link: string; faltam: number; fechar: () => void; aviso: (t: string) => void;
}) {
  const msg = useMemo(() => mensagemDoGrupo(folha, link, IGREJA.cultoHora, IGREJA.followHora), [folha, link]);
  const zap = `https://wa.me/?text=${encodeURIComponent(msg)}`;
  return (
    <section className="es-caixa es-cr-mandar" id={id} aria-label="Mandar no grupo">
      <div className="es-caixa-cab">
        <h2>Mandar no grupo</h2>
        <button type="button" className="es-btn es-txt es-peq" onClick={fechar} aria-label="Fechar"><IcX /></button>
      </div>
      <div className="es-caixa-corpo">
        {faltam > 0 && (
          <Aviso tom="warn">{faltam === 1 ? 'Ainda falta 1 coisa.' : `Ainda faltam ${faltam} coisas.`} A mensagem sai sem elas, e a folha mostra o que falta.</Aviso>
        )}
        <pre className="es-cr-msg">{msg}</pre>
      </div>
      <div className="es-caixa-pe">
        <button type="button" className="es-btn es-pri" onClick={() => void copiar(msg, aviso)}><IcCopiar /> Copiar a mensagem</button>
        <a className="es-btn es-zap" href={zap} target="_blank" rel="noopener noreferrer">Abrir no WhatsApp</a>
        <a className="es-btn es-txt" href={link} target="_blank" rel="noopener noreferrer">Ver a folha</a>
      </div>
    </section>
  );
}
