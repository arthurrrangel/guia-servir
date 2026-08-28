'use client';
import Shell, { useApp, copiar } from '@/components/Shell';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { mudarStatus } from '@/lib/db';
import { Painel as NumPainel, painelDoMinisterio } from '@/lib/candidaturas';
import { AreaVisao, visaoGeral } from '@/lib/equipes';
import { IcSino, IcSeta, IcCopiar } from '@/components/Icones';
import { Escolha } from '@/components/Ui';
import {
  Status, funcoesAtivas, funcoesDoDia, fmtLongo, hojeISO, msgCobranca, msgEscala, nomeDe, vol,
  problemas, cultosAte, resumoDia, addDias, fmtDia, MESES, cultosDoMes, tipoDoDia,
} from '@/lib/engine';

/* =============================================================================
   O PAINEL DE QUEM ORGANIZA

   A pergunta desta tela é uma só: O QUE PRECISA DE MIM AGORA. Tudo o mais é
   referência, e referência fica embaixo.

   A cascata de prioridade que decide o próximo passo (vagas > furos >
   recusados > pendentes > montar o mês > tudo pronto) NÃO mudou nesta
   reforma. Ela estava certa. O que mudou foi a superfície: a tela falava
   outra língua visual que o resto do produto (card arredondado, gradiente,
   avatar colorido, sombra) e quem vinha do site via duas empresas diferentes.

   O QUE ENTROU DE NOVO
     . a visão da igreja inteira, para quem organiza mais de uma área. Era o
       buraco real: três dos quatro organizadores são admin e não tinham como
       saber se o domingo estava coberto sem trocar de equipe cinco vezes.
     . as pendências deixaram de ser um cartãozinho e entraram na hierarquia
       da tela, logo abaixo do próximo passo.

   O QUE SAIU, E POR QUÊ
     . o anel de confirmações: gráfico para 9 itens é enfeite com aparência de
       dado. Virou número grande, que é o que se lê de longe.
     . os avatares coloridos: em lista de escala, a chave de leitura é o nome
       da FUNÇÃO, não o rosto. Círculo colorido com iniciais é vocabulário de
       painel genérico, e não existe no site da igreja.
     . o gradiente do herói: a urgência já está nas palavras. Quando urge, a
       faixa inverte para fundo tinta, que é o recurso que a home usa.
   ============================================================================= */

/* o vocabulário da situação mora aqui e na escala. Uma lista só, para as duas
   telas dizerem as mesmas palavras. */
const SITUACOES: { v: Status; rot: string }[] = [
  { v: 'pendente', rot: 'falta confirmar' },
  { v: 'confirmado', rot: 'confirmou' },
  { v: 'recusado', rot: 'não pode' },
  { v: 'furou', rot: 'furou' },
];

export default function Pagina() { return <Shell><Painel /></Shell>; }

/* --------------------------------------------------------- a igreja inteira */
function Igreja() {
  const [areas, setAreas] = useState<AreaVisao[] | null>(null);
  useEffect(() => {
    let vivo = true;
    void visaoGeral().then(r => { if (vivo) setAreas(r); });
    return () => { vivo = false; };
  }, []);

  /* uma área só não é visão geral: é a própria tela. */
  if (!areas || areas.length < 2) return null;

  const leitura = (a: AreaVisao) => {
    if (a.vagas === null) return { cls: '', txt: 'sem culto marcado' };
    if (a.vagas > 0) return { cls: 'ruim', txt: `${a.vagas} sem ninguém` };
    if (a.furos > 0) return { cls: 'ruim', txt: `${a.furos} furou` };
    if (a.recusados > 0) return { cls: 'pend', txt: `${a.recusados} não pode` };
    if (a.pendentes > 0) return { cls: 'pend', txt: `${a.pendentes} sem responder` };
    return { cls: 'ok', txt: 'coberto' };
  };
  const emFalta = areas.filter(a => a.vagas !== null && (a.vagas > 0 || a.furos > 0)).length;

  return (
    <section className="lid-secao">
      <div className="lid-secao-cab">
        <span className="rot">O domingo da igreja</span>
        <span className="lid-secao-nota">
          {emFalta === 0 ? 'Todas as áreas de pé' : emFalta === 1 ? '1 área precisa de gente' : `${emFalta} áreas precisam de gente`}
        </span>
      </div>
      <div className="lid-igreja">
        {areas.map(a => {
          const l = leitura(a);
          return (
            <Link key={a.slug} href={`/servir/${a.slug}`} className={`lid-area ${l.cls}`}>
              <span className="lid-marca" aria-hidden="true" />
              <span>
                <span className="lid-area-nome">{a.equipe}</span>
                <span className="lid-area-sub">
                  {a.proxima_data ? `${a.tipo === 'follow' ? 'Follow' : 'domingo'} ${fmtDia(a.proxima_data)} · ${a.preenchidos} de ${a.postos}` : `${a.postos} funções`}
                  {a.candidaturas_novas > 0 && ` · ${a.candidaturas_novas} querem entrar`}
                </span>
              </span>
              <span className="lid-area-est">{l.txt}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- pendências
   Só aparece o que EXIGE alguma coisa. Bloco que mostra zero é ruído, e ruído
   diário é como o líder aprende a não olhar o painel. */
function Pendencias() {
  const { equipe } = useApp();
  const [p, setP] = useState<NumPainel | null>(null);
  useEffect(() => {
    let vivo = true;
    if (!equipe?.id) return;
    void painelDoMinisterio(equipe.id).then(r => { if (vivo) setP(r); });
    return () => { vivo = false; };
  }, [equipe?.id]);
  if (!p) return null;

  const itens = [
    p.candidaturas_novas && { grave: true, n: p.candidaturas_novas,
      txt: p.candidaturas_novas === 1 ? 'pessoa quer entrar e espera resposta' : 'pessoas querem entrar e esperam resposta',
      href: '/painel/candidaturas' },
    p.aguardando_conversa && { grave: false, n: p.aguardando_conversa,
      txt: 'esperando a conversa com a liderança', href: '/painel/candidaturas' },
    p.sem_conferir && { grave: false, n: p.sem_conferir,
      txt: 'com nível declarado e ainda não conferido', href: '/time' },
    p.sem_disponibilidade && { grave: false, n: p.sem_disponibilidade,
      txt: 'sem responder a disponibilidade do mês', href: '/time' },
    p.funcoes_sem_gente && { grave: true, n: p.funcoes_sem_gente,
      txt: 'funções sem ninguém que saiba fazer', href: '/ajustes' },
  ].filter(Boolean) as { grave: boolean; n: number; txt: string; href: string }[];

  if (!itens.length) return null;
  return (
    <section className="lid-secao">
      <div className="lid-secao-cab">
        <span className="rot">Também espera por você</span>
        <span className="lid-secao-nota">Nada aqui trava o domingo</span>
      </div>
      <div>
        {itens.map((i, k) => (
          <div key={k} className={`lid-alerta ${i.grave ? 'ruim' : ''}`}>
            <span className="lid-alerta-n">{i.n}</span>
            <span><Link href={i.href}>{i.txt}</Link></span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Painel() {
  const { S, recarregar, aviso, base } = useApp();
  const [salvando, setSalvando] = useState('');
  const [otimista, setOtimista] = useState<{ f: string; st: Status } | null>(null);

  const hoje = hojeISO();
  /* o próximo culto pode ser um sábado do Follow: mirar sempre no domingo
     deixava o Follow fora do painel até o dia acontecer. */
  const prox = cultosAte(hoje, 8)[0] || hoje;
  const ehFollow = tipoDoDia(prox) === 'follow';
  const Dia = ehFollow ? 'Follow' : 'Domingo';
  const noDia = ehFollow ? 'no Follow' : 'no domingo';
  const diaBruto = S.escalas[prox];
  const temFuncoes = funcoesAtivas(S).length > 0;
  /* "montada" é ter gente escalada, não é o culto existir. Sem isso, um
     ministério com 0 funções via "todo mundo confirmado" com nada montado. */
  const dia = temFuncoes && diaBruto && Object.values(diaBruto.slots || {}).some((s: any) => s?.vid)
    ? diaBruto : null;

  /* primeira vez: três passos em vez de telas vazias */
  if (!S.voluntarios.length || !temFuncoes || (!dia && !Object.keys(S.escalas).length)) {
    const temTime = S.voluntarios.length > 0;
    const passos = [
      { n: 1, feito: temFuncoes, titulo: 'Crie as funções',
        txt: 'O que precisa de gente em cada culto: projeção, vocal, recepção. Sem isso não há o que sortear.',
        href: '/ajustes', rot: 'Criar as funções', mostra: !temFuncoes },
      { n: 2, feito: temTime, titulo: 'Cadastre o time',
        txt: 'Quem são as pessoas e o que cada uma sabe fazer. É a única parte trabalhosa, e é uma vez só.',
        href: '/time', rot: 'Cadastrar o time', mostra: temFuncoes && !temTime },
      { n: 3, feito: false, titulo: 'Monte o mês e publique',
        txt: 'O sorteio respeita quem não pode e quem já serviu. Um botão copia a mensagem pronta para o grupo.',
        href: '/escala', rot: 'Montar a escala', mostra: temTime && temFuncoes },
    ];
    return (
      <div className="lid">
        <div className="lid-faixa">
          <div className="lid-faixa-in"><div className="lid-faixa-txt">
            <span className="rot">Primeira vez por aqui</span>
            <h1>Três passos e a escala sai em minutos</h1>
            <p className="lid-faixa-sub">Depois disso, todo mês é só conferir e publicar.</p>
          </div></div>
        </div>
        <section className="lid-secao">
          {passos.map(p => (
            <div key={p.n} className={`lid-linha ${p.feito ? 'ok' : ''}`}>
              <span className="lid-marca" aria-hidden="true" />
              <span>
                <span className="lid-fn">Passo {p.n}{p.feito ? ' · feito' : ''}</span>
                <span className="lid-nome">{p.titulo}</span>
                <p style={{ margin: '6px 0 0', fontSize: 'var(--t-ui)', lineHeight: 1.6, color: 'var(--cinza)', maxWidth: '52ch' }}>{p.txt}</p>
              </span>
              {p.mostra && <Link href={p.href} className="lid-bt">{p.rot}</Link>}
            </div>
          ))}
        </section>
      </div>
    );
  }

  const seguintes = cultosAte(addDias(prox, 1), 21).slice(0, 4);
  const r = dia ? resumoDia(S, prox) : null;
  const probs = dia ? problemas(S, prox) : [];
  const pendentes = dia
    ? Object.entries(dia.slots).filter(([, s]) => s?.vid && (s.status || 'pendente') === 'pendente')
    : [];

  async function marcar(funcao: string, status: Status) {
    const f = S.funcoes.find(x => x.nome === funcao);
    if (!f?.id || !dia?.cultoId) return;
    setSalvando(funcao); setOtimista({ f: funcao, st: status });
    try { await mudarStatus(dia.cultoId, f.id, status); await recarregar(); }
    catch (e: any) { aviso('Não salvou: ' + e.message); await recarregar(); }
    setSalvando(''); setOtimista(null);
  }

  const diasFaltam = Math.round((Date.parse(prox) - Date.parse(hoje)) / 86400000);
  const quando = prox === hoje ? 'é hoje' : diasFaltam === 1 ? 'é amanhã' : `faltam ${diasFaltam} dias`;

  /* o mês seguinte já está na hora de montar? (o cron faz no dia 26; a partir
     do dia 18 o painel já cutuca, pra ninguém deixar pro último dia) */
  const diaDoMes = +hoje.slice(8, 10);
  const pm = (() => { const a = +hoje.slice(0, 4), m = +hoje.slice(5, 7); return m === 12 ? { a: a + 1, m: 1 } : { a, m: m + 1 }; })();
  const proxMesMontado = cultosDoMes(pm.a, pm.m).some(d => { const x = S.escalas[d]; return x && Object.values(x.slots || {}).some((s: any) => s?.vid); });
  const cutucaProxMes = diaDoMes >= 18 && !proxMesMontado;

  const vagas = r ? r.vagas.length : 0;
  const furos = r ? (r as any).furos || 0 : 0;
  const recus = r ? r.recusados : 0;
  const pend = r ? r.pendentes : 0;
  const mesDe = (a: number, m: number) => MESES[m - 1];

  /* O PRÓXIMO PASSO: a única coisa que o líder precisa fazer agora.
     Esta cascata é o coração da tela e não mudou na reforma visual. */
  const passo: any = !dia
    ? { urg: '', tag: 'Sua missão agora', titulo: `Monte a escala de ${mesDe(+prox.slice(0, 4), +prox.slice(5, 7))}`,
        sub: `${Dia}, ${fmtLongo(prox)}, ${quando}. O sorteio distribui todas as funções em um clique, respeitando quem não pode.`,
        acao: { tipo: 'link', label: 'Montar a escala', href: `/escala?m=${prox.slice(0, 7)}` } }
    : vagas
    ? { urg: 'fogo', tag: 'Precisa de você', titulo: vagas === 1 ? `Falta gente ${noDia}` : `Faltam ${vagas} pessoas ${noDia}`,
        sub: `${vagas === 1 ? '1 função está' : `${vagas} funções estão`} sem ninguém em ${fmtLongo(prox)}. Vaga escondida vira furo no culto: resolva antes de publicar.`,
        acao: { tipo: 'link', label: 'Resolver agora', href: `/escala?m=${prox.slice(0, 7)}#d${prox}` },
        sec: { label: 'Copiar assim mesmo', on: () => copiar(msgEscala(S, prox), aviso) } }
    : furos
    ? { urg: 'fogo', tag: 'Precisa de você', titulo: furos === 1 ? `Alguém furou ${noDia}` : `${furos} pessoas furaram ${noDia}`,
        sub: `Em ${fmtLongo(prox)}. Chame o plantão ou remaneje na escala antes que o culto chegue.`,
        acao: { tipo: 'link', label: 'Resolver agora', href: `/escala?m=${prox.slice(0, 7)}#d${prox}` } }
    : recus
    ? { urg: 'fogo', tag: 'Precisa de você', titulo: recus === 1 ? `Alguém não pode ${noDia}` : `${recus} pessoas não podem ${noDia}`,
        sub: `${recus === 1 ? '1 pessoa avisou que não pode' : `${recus} pessoas avisaram que não podem`} servir em ${fmtLongo(prox)}. Re-sorteie ou troque antes de publicar.`,
        acao: { tipo: 'link', label: 'Resolver agora', href: `/escala?m=${prox.slice(0, 7)}#d${prox}` } }
    : pend
    ? { urg: '', tag: 'Quase lá', titulo: pend === 1 ? 'Falta 1 confirmação' : `Faltam ${pend} confirmações`,
        sub: `${pend === 1 ? '1 pessoa ainda não respondeu' : `${pend} pessoas ainda não responderam`} para ${fmtLongo(prox)}. Um toque abre o WhatsApp de cada um com a cobrança pronta.`,
        acao: { tipo: 'rolar', label: 'Ver quem falta' } }
    : cutucaProxMes
    ? { urg: '', tag: 'Adiante o próximo mês', titulo: `Hora de montar ${mesDe(pm.a, pm.m)}`,
        sub: `${Dia} está redondo. Aproveite: peça a indisponibilidade e monte ${mesDe(pm.a, pm.m)} antes do fim do mês, sem correria.`,
        acao: { tipo: 'link', label: `Montar ${mesDe(pm.a, pm.m)}`, href: `/escala?m=${pm.a}-${String(pm.m).padStart(2, '0')}` } }
    : { urg: '', tag: 'Tudo pronto', titulo: `${Dia} está redondo`,
        sub: `Todo mundo confirmado para ${fmtLongo(prox)}. É só publicar, ou reenviar, a escala no grupo.`,
        acao: { tipo: 'copiar', label: 'Copiar para o WhatsApp' } };

  const rolarPara = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const situacao = (st: string) => st === 'confirmado' ? 'ok' : st === 'pendente' ? 'pend' : 'ruim';

  return (
    <div className="lid">
      {/* A FAIXA responde uma pergunta só: o que eu preciso fazer agora.
          Uma ação sólida, no máximo duas de texto ao lado. */}
      <div className={`lid-faixa ${passo.urg}`}>
        <div className="lid-faixa-in">
          <div className="lid-faixa-txt">
            <span className="rot">{passo.tag}</span>
            <h1>{passo.titulo}</h1>
            <p className="lid-faixa-sub">{passo.sub}</p>
            <div className="lid-faixa-acoes">
              {passo.acao.tipo === 'link' && <Link href={passo.acao.href} className="lid-bt">{passo.acao.label}</Link>}
              {passo.acao.tipo === 'copiar' && <button className="lid-bt" onClick={() => copiar(msgEscala(S, prox), aviso)}><IcCopiar />{passo.acao.label}</button>}
              {passo.acao.tipo === 'rolar' && <button className="lid-bt" onClick={() => rolarPara('cobrar')}><IcSino />{passo.acao.label}</button>}
              {passo.sec && <button className="lid-bt-txt" onClick={passo.sec.on}>{passo.sec.label}</button>}
              {dia && passo.acao.tipo !== 'copiar' && <Link href="/escala" className="lid-bt-txt">Abrir escala</Link>}
            </div>
          </div>
          {r && (
            <div className="lid-placar">
              <b>{r.confirmados}<i>/{r.total}</i></b>
              <span>confirmados</span>
            </div>
          )}
        </div>
      </div>

      <Igreja />

      {!!probs.length && (
        <section className="lid-secao">
          <div className="lid-secao-cab"><span className="rot">Conferir antes de publicar</span></div>
          {probs.map((p, i) => (
            <div key={i} className={`lid-alerta ${p.grau === 'erro' ? 'ruim' : ''}`}>
              <span className="lid-alerta-n" aria-hidden="true">{p.grau === 'erro' ? '!' : '·'}</span>
              <span>{p.texto}</span>
            </div>
          ))}
        </section>
      )}

      <div className="lid-duas" style={{ marginTop: 'var(--e7)' }}>
        <div>
          {dia && (
            <>
              <section>
                <div className="lid-secao-cab">
                  <span className="rot">{ehFollow ? 'Follow' : 'Domingo'}, {fmtLongo(prox)}</span>
                  <span className="lid-secao-nota">{quando}</span>
                </div>
                {funcoesDoDia(S, prox).map(f => {
                  const s = dia.slots[f.nome];
                  const st = (otimista?.f === f.nome ? otimista.st : (s?.status || 'pendente')) as Status;
                  return (
                    <div className={`lid-linha ${s?.vid ? situacao(st) : 'ruim'}`} key={f.nome}>
                      <span className="lid-marca" aria-hidden="true" />
                      <span>
                        <span className="lid-fn">{f.nome}</span>
                        {s?.vid
                          ? <span className="lid-nome">{nomeDe(S, s.vid)}</span>
                          : <span className="lid-vazio">precisa de alguém</span>}
                      </span>
                      {/* MESMO CONTROLE DA ESCALA. Eram dois: aqui uma caixa
                          de formulário, lá uma palavra. Mesma ação, mesmo dado,
                          duas aparências — o líder pula entre as duas telas o
                          tempo todo. */}
                      {s?.vid && (
                        <Escolha classe="esc-sit" valor={st} desabilitado={salvando === f.nome}
                          rotulo={`Situação de ${nomeDe(S, s.vid)} em ${f.nome}`}
                          mostra={SITUACOES.find(x => x.v === st)?.rot || st}
                          aoMudar={v => marcar(f.nome, v as Status)}>
                          {SITUACOES.map(x => <option key={x.v} value={x.v}>{x.rot}</option>)}
                        </Escolha>
                      )}
                    </div>
                  );
                })}
                {!!dia.plantao?.length && (
                  <div className="lid-linha">
                    <span className="lid-marca" aria-hidden="true" />
                    <span>
                      <span className="lid-fn">Plantão</span>
                      <span className="lid-nome" style={{ color: 'var(--cinza)' }}>
                        {dia.plantao.map(p => nomeDe(S, p)).join(', ')} · entra se alguém furar
                      </span>
                    </span>
                  </div>
                )}
              </section>

              {!!pendentes.length && (
                <section className="lid-secao" id="cobrar" style={{ scrollMarginTop: 90 }}>
                  <div className="lid-secao-cab">
                    <span className="rot">{pendentes.length} sem responder</span>
                    <button className="lid-bt-txt" onClick={() => copiar(
                      pendentes.map(([, s]) => msgCobranca(S, s.vid!, prox, base)).join('\n\n· · ·\n\n'), aviso,
                      'Cobranças copiadas. Cole no privado de cada um.')}>Copiar todas</button>
                  </div>
                  {pendentes.map(([fn, s]) => {
                    const v = vol(S, s.vid);
                    const tel = (v?.tel || '').replace(/\D/g, '');
                    const zap = tel ? `https://wa.me/${tel.length <= 11 ? '55' + tel : tel}?text=${encodeURIComponent(msgCobranca(S, s.vid!, prox, base))}` : null;
                    return (
                      <div className="lid-linha pend" key={fn}>
                        <span className="lid-marca" aria-hidden="true" />
                        <span>
                          <span className="lid-fn">{fn}</span>
                          <span className="lid-nome">{v?.nome}</span>
                        </span>
                        {zap
                          ? <a className="lid-bt-txt" href={zap} target="_blank" rel="noopener">Cobrar no WhatsApp</a>
                          : <button className="lid-bt-txt" onClick={() => copiar(msgCobranca(S, s.vid!, prox, base), aviso, 'Cobrança copiada.')}>Copiar</button>}
                      </div>
                    );
                  })}
                  <p style={{ margin: '16px 0 0', fontSize: 'var(--t-apoio)', lineHeight: 1.6, color: 'var(--cinza)', maxWidth: '54ch' }}>
                    O botão abre o WhatsApp da pessoa com a mensagem já digitada. Você só aperta enviar.
                  </p>
                </section>
              )}

              <details className="bloco-extra" style={{ marginTop: 'var(--e6)' }}>
                <summary>
                  <span className="cresce">Ver a mensagem que vai para o grupo</span>
                  <IcSeta className="giro" />
                </summary>
                <div className="bloco-extra-corpo">
                  <pre className="lid-msg">{msgEscala(S, prox)}</pre>
                </div>
              </details>
            </>
          )}
        </div>

        <div>
          <section>
            <div className="lid-secao-cab"><span className="rot">Depois disso</span></div>
            {seguintes.map(d => {
              const rr = S.escalas[d] ? resumoDia(S, d) : null;
              const cls = !rr ? '' : rr.situacao === 'ok' ? 'ok' : rr.situacao === 'atencao' ? 'pend' : 'ruim';
              return (
                <Link href={`/escala?m=${d.slice(0, 7)}#d${d}`} key={d} className={`lid-area ${cls}`}>
                  <span className="lid-marca" aria-hidden="true" />
                  <span>
                    <span className="lid-area-nome">
                      {tipoDoDia(d) === 'follow' ? 'Follow, sábado' : 'domingo'} {fmtDia(d)}
                    </span>
                  </span>
                  <span className="lid-area-est">
                    {rr
                      ? (rr.vagas.length ? `${rr.vagas.length} sem ninguém` : `${rr.confirmados}/${rr.preenchidos}`)
                      : 'não montada'}
                  </span>
                </Link>
              );
            })}
          </section>

          <Pendencias />
        </div>
      </div>
    </div>
  );
}
