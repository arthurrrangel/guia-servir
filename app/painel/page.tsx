'use client';
import Shell, { useApp, copiar } from '@/components/Shell';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { mudarStatus } from '@/lib/db';
import { AreaVisao, visaoGeral } from '@/lib/equipes';
import { IcSino, IcSeta, IcCopiar } from '@/components/Icones';
import {
  Cab, Kpis, Kpi, Secao, Pilula, Aviso, Dobra, Escolha, tomDoStatus, Tom,
} from '@/components/escalas/Pecas';
import { leituraDoDia } from '@/components/escalas/leitura';
import { rolarAte } from '@/components/escalas/ancora';
import { aviseHumano } from '@/lib/erros';
import {
  Status, funcoesAtivas, funcoesDoDia, fmtLongo, hojeISO, msgCobranca, msgConfirmar, msgEscala, nomeDe, vol,
  problemas, cultosAte, resumoDia, addDias, MESES, cultosDoMes, tipoDoDia, SITUACOES, proxMes,
  linkDoVoluntario,
} from '@/lib/engine';
import { pl, cont } from '@/lib/plural';

/* =============================================================================
   O PAINEL DE QUEM ORGANIZA

   A pergunta desta tela é uma só: O QUE PRECISA DE MIM AGORA. Tudo o mais é
   referência, e referência fica embaixo ou ao lado.

   A cascata de prioridade que decide o próximo passo (vagas > furos >
   recusados > pendentes > montar o mês > tudo pronto) NÃO mudou. Ela estava
   certa. O que mudou em 30/09/2026 foi a superfície, para a língua do
   Financeiro e do Demandas:

     . o culto em foco é o título, e a faixa de números diz o estado dele
       de longe: postos de pé, confirmados, sem resposta, sem gente;
     . o próximo passo é a única caixa com fundo, e tem a única ação cheia;
     . a escala do dia é uma tabela (função, pessoa, situação), com a
       situação trocável no lugar, na mesma pílula que a Escala usa;
     . ao lado, o que também espera por você e os próximos cultos, cada
       linha com a pílula do estado e o caminho para resolver.

   A cor segue o tom fixo do sistema (ver Pecas.tsx): vermelho é falta de
   gente, âmbar é resposta que não veio, verde é de pé. Um tom, um sentido.
   ============================================================================= */

export default function Pagina() { return <Shell><Painel /></Shell>; }

/* o dia de hoje por extenso, com a primeira letra grande */
function hojePorExtenso() {
  const s = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}


/* --------------------------------------------------------- a igreja inteira
   Para quem organiza mais de uma área: se o domingo está coberto na igreja
   toda, sem trocar de ministério cinco vezes. A linha de uma área que você
   organiza abre a escala dela (troca o ministério e vai para a Escala);
   antes ela levava para a página pública da área, no site. */
/* 102 · quem quer entrar numa área: pedido de candidatura que espera resposta
   e cadastro pela lista da equipe que ninguém liberou. */
const entram = (a: AreaVisao) => a.candidaturas_novas + (a.esperando_liberacao || 0);

function Igreja() {
  const { equipes, trocarEquipe } = useApp();
  const router = useRouter();
  const [areas, setAreas] = useState<AreaVisao[] | null>(null);
  /* 14/09/2026: vazio e falha eram o mesmo desenho (a seção sumia). Um líder
     com o token expirado via um painel limpo e concluía que estava tudo
     coberto. A falha tem cara de falha. */
  const [falhou, setFalhou] = useState(false);
  useEffect(() => {
    let vivo = true;
    void visaoGeral().then(r => { if (vivo) setAreas(r); }).catch(() => { if (vivo) { setAreas([]); setFalhou(true); } });
    return () => { vivo = false; };
  }, []);

  if (falhou) return <Aviso tom="bad">Não consegui carregar a visão da igreja. Recarregue a página; se continuar, saia e entre de novo.</Aviso>;
  /* uma área só não é visão geral: é a própria tela */
  if (!areas || areas.length < 2) return null;

  const leitura = (a: AreaVisao) => a.vagas === null
    ? { tom: 'neutro' as Tom, txt: 'sem culto marcado' }
    : leituraDoDia({ vagas: a.vagas, furos: a.furos, recusados: a.recusados, pendentes: a.pendentes });
  const emFalta = areas.filter(a => leitura(a).tom === 'bad').length;

  /* A DATA SÓ SAI DA LINHA QUANDO É DE TODAS (07/09/2026): cinco vezes a
     mesma data não distingue nenhuma área. Igreja em que uma área serve no
     sábado e as outras no domingo continua vendo a data em cada linha. */
  const datas = new Set(areas.map(a => a.proxima_data ? `${a.tipo}|${a.proxima_data}` : ''));
  const umaSoData = datas.size === 1 && !datas.has('');
  const comum = umaSoData ? areas[0] : null;

  return (
    <Secao
      titulo={comum ? `A igreja ${comum.tipo === 'follow' ? 'no Follow' : 'no domingo'}, ${fmtLongo(comum.proxima_data!)}` : 'A igreja no próximo culto'}
      sub={emFalta === 0 ? 'Todas as áreas de pé.' : emFalta === 1 ? '1 área precisa de gente.' : `${emFalta} áreas precisam de gente.`}>
      <div className="es-fila es-colunas" style={{ '--es-cols': 'minmax(0,1fr) 110px 170px 24px' } as React.CSSProperties}>
        <div className="es-fila-cab" aria-hidden="true"><span>Área</span><span className="es-n">Postos</span><span>Situação</span><span /></div>
        {areas.map(a => {
          const l = leitura(a);
          const dela = equipes.find(e => e.slug === a.slug);
          const sub = [
            !a.proxima_data ? cont(a.postos, 'função', 'funções')
              : umaSoData ? null : `${a.tipo === 'follow' ? 'Follow' : 'Domingo'}, ${fmtLongo(a.proxima_data)}`,
            /* 102: quem espera liberação também quer entrar */
            entram(a) > 0 ? `${entram(a)} ${pl(entram(a), 'quer', 'querem')} entrar` : null,
          ].filter(Boolean).join(' · ');
          const miolo = (
            <>
              <span className="es-c-tit"><b>{a.equipe}</b>{sub && <small>{sub}</small>}</span>
              <span className="es-c-meta">
                <span className="es-c-num">{a.proxima_data ? `${a.preenchidos} de ${a.postos}` : ''}</span>
                <span className="es-c-est"><Pilula tom={l.tom}>{l.txt}</Pilula></span>
              </span>
              <span className="es-c-acao">{dela && <IcSeta />}</span>
            </>
          );
          return dela
            ? <button key={a.slug} id={`area-${a.slug}`} className="es-item"
                onClick={async () => { if (await trocarEquipe(dela.id, undefined, `area-${a.slug}`)) router.push('/escala'); }}
                aria-label={`${a.equipe}: ${l.txt}. Abrir a escala`}>{miolo}</button>
            : <div key={a.slug} className="es-item">{miolo}</div>;
        })}
      </div>
    </Secao>
  );
}

/* ------------------------------------------------------------- pendências
   Só aparece o que EXIGE alguma coisa. Linha que mostra zero é ruído, e
   ruído diário é como o líder aprende a não olhar o painel. As contas vêm da
   casca (`nums`), a mesma leitura que acende os selos da navegação. */
function Pendencias() {
  const { nums: p, numsFalhou } = useApp();
  if (numsFalhou) return <Aviso tom="bad">Não consegui carregar o que espera por você neste ministério. Recarregue a página.</Aviso>;
  if (!p) return null;

  /* cada linha é uma frase inteira e concorda com o número (05/09/2026). O
     número é tinta em todas: nada aqui é falta de gente no culto, e o
     vermelho do sistema quer dizer só isso (30/09/2026). */
  const itens = [
    p.candidaturas_novas && { n: p.candidaturas_novas,
      txt: pl(p.candidaturas_novas, 'pessoa quer entrar e espera resposta', 'pessoas querem entrar e esperam resposta'),
      href: '/painel/candidaturas' },
    p.aguardando_conversa && { n: p.aguardando_conversa,
      txt: pl(p.aguardando_conversa, 'pessoa esperando a conversa com a liderança', 'pessoas esperando a conversa com a liderança'),
      href: '/painel/candidaturas' },
    /* 102 · cadastro pela lista da equipe que ninguém liberou. Até liberar, o
       nome não aparece na lista e a pessoa não entra no sorteio. */
    p.esperando_liberacao && { n: p.esperando_liberacao,
      txt: pl(p.esperando_liberacao, 'pessoa se cadastrou e espera você liberar', 'pessoas se cadastraram e esperam você liberar'),
      href: '/time#liberar' },
    p.sem_conferir && { n: p.sem_conferir,
      txt: pl(p.sem_conferir, 'pessoa com nível declarado que você ainda não conferiu', 'pessoas com nível declarado que você ainda não conferiu'),
      href: '/time/conferir' },
    p.sem_disponibilidade && { n: p.sem_disponibilidade,
      txt: pl(p.sem_disponibilidade, 'pessoa não respondeu a disponibilidade do mês', 'pessoas não responderam a disponibilidade do mês'),
      href: '/time' },
    p.funcoes_sem_gente && { n: p.funcoes_sem_gente,
      txt: pl(p.funcoes_sem_gente, 'função sem ninguém que saiba fazer', 'funções sem ninguém que saiba fazer'),
      href: '/ajustes' },
  ].filter(Boolean) as { n: number; txt: string; href: string }[];

  if (!itens.length) return null;
  return (
    <Secao titulo="Também espera por você" sub="Nada aqui trava o próximo culto.">
      <div className="es-fila">
        {itens.map((i, k) => (
          <Link key={k} href={i.href} className="es-item es-com-n">
            <span className="es-c-n">{i.n}</span>
            <span className="es-c-tit"><b>{i.txt}</b></span>
            <span className="es-c-acao"><IcSeta /></span>
          </Link>
        ))}
      </div>
    </Secao>
  );
}

/* ---------------------------------------------------------------------------
   AS CINCO REGRAS — a doutrina de operação. Não são um ajuste: são o
   contrato de como a escala funciona, e duas delas são promessa ao líder
   ("você não caça substituto", "o sistema bloqueia"). Fechadas para quem já
   roda a escala, abertas na primeira vez.
--------------------------------------------------------------------------- */
function CincoRegras({ aberta = false }: { aberta?: boolean }) {
  return (
    <Dobra titulo="As cinco regras da escala" aberta={aberta}>
      <ol className="es-regras">
        <li><span><b>Quem não pode, acha o substituto.</b> Você não caça substituto.</span></li>
        <li><span><b>Confirmação é ativa.</b> Ver a mensagem não é confirmar.</span></li>
        <li><span><b>Ninguém em duas funções ao mesmo tempo.</b> O sistema bloqueia.</span></li>
        <li><span><b>Buraco vai publicado.</b> Vaga escondida vira furo no domingo.</span></li>
        <li><span><b>Toda função precisa de 3 pessoas.</b> Menos que isso é dependência.</span></li>
      </ol>
    </Dobra>
  );
}

function Painel() {
  const { S, recarregar, aviso, base, equipe } = useApp();
  const [salvando, setSalvando] = useState('');
  const [otimista, setOtimista] = useState<{ f: string; st: Status } | null>(null);
  /* a âncora do endereço (`/painel#cobrar`): o navegador procura o alvo
     antes de a tela existir (ela nasce depois de a casca ler o banco), e não
     rolava. Uma vez, quando o alvo aparece, e mantida no lugar enquanto a
     coluna da direita chega (ver `components/escalas/ancora.ts`). */
  const rolouAncora = useRef(false);
  useEffect(() => {
    if (rolouAncora.current || !window.location.hash) return;
    if (rolarAte(decodeURIComponent(window.location.hash.slice(1)))) rolouAncora.current = true;
  });

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
      <>
        <Cab rot="Primeira vez por aqui" titulo="Três passos e a escala sai em minutos"
          meta="Depois disso, todo mês é só conferir e publicar." />
        <div className="es-fila">
          {passos.map(p => (
            <div key={p.n} className="es-item es-com-n es-pn-passo">
              <span className="es-c-n">{p.n}</span>
              <span className="es-c-tit">
                <b>{p.titulo}</b>
                <small>{p.txt}</small>
              </span>
              <span className="es-c-acao">
                {p.feito ? <Pilula tom="ok">feito</Pilula>
                  : p.mostra ? <Link href={p.href} className="es-btn es-pri">{p.rot}</Link>
                  : <Pilula>depois</Pilula>}
              </span>
            </div>
          ))}
        </div>
        {/* na primeira vez ela abre: é agora que estas cinco linhas valem mais
            do que qualquer botão desta tela */}
        <div className="es-secao"><CincoRegras aberta /></div>
      </>
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
    /* quem a tela acredita estar na vaga vai junto na gravação — ver o
       comentário de `mudarStatus` em lib/db.ts */
    const vid = dia?.slots?.[funcao]?.vid;
    /* o `return` era mudo (20/09, reauditoria): toque que não faz nada tem
       que dizer por quê */
    if (!f?.id || !dia?.cultoId || !vid) {
      aviso(!vid ? 'Essa vaga está sem ninguém: escolha a pessoa antes de marcar.'
                 : 'Ainda não carreguei esse culto por inteiro. Recarregue a página.');
      return;
    }
    setSalvando(funcao); setOtimista({ f: funcao, st: status });
    try { await mudarStatus(dia.cultoId, f.id, vid, status); await recarregar(); }
    catch (e) { aviso(aviseHumano(e, 'salvar')); await recarregar(); }
    setSalvando(''); setOtimista(null);
  }

  const diasFaltam = Math.round((Date.parse(prox) - Date.parse(hoje)) / 86400000);
  const quando = prox === hoje ? 'é hoje' : diasFaltam === 1 ? 'é amanhã' : `faltam ${diasFaltam} dias`;

  /* o mês seguinte já está na hora de montar? (o robô monta no dia 26; a
     partir do dia 18 o painel já cutuca, para ninguém deixar pro fim) */
  const diaDoMes = +hoje.slice(8, 10);
  /* a mesma `proxMes` que o robô do dia 26 usa: divergir do robô é o líder
     montar um mês e o robô montar outro */
  const pm = proxMes(hoje);
  const proxMesMontado = cultosDoMes(pm.ano, pm.mes).some(d => { const x = S.escalas[d]; return x && Object.values(x.slots || {}).some((s: any) => s?.vid); });
  const cutucaProxMes = diaDoMes >= 18 && !proxMesMontado;

  const vagas = r ? r.vagas.length : 0;
  const furos = r ? r.furos : 0;
  const recus = r ? r.recusados : 0;
  const pend = r ? r.pendentes : 0;
  const mesDe = (m: number) => MESES[m - 1];
  const linkDoDia = `/escala?m=${prox.slice(0, 7)}#d${prox}`;

  /* O PRÓXIMO PASSO: a única coisa que o líder precisa fazer agora.
     Esta cascata é o coração da tela e não mudou na reforma visual. */
  const passo: any = !dia
    ? { urg: '', titulo: `Monte a escala de ${mesDe(+prox.slice(5, 7))}`,
        sub: `${Dia}, ${fmtLongo(prox)}, ${quando}. O sorteio distribui todas as funções em um clique, respeitando quem não pode.`,
        acao: { tipo: 'link', label: 'Montar a escala', href: `/escala?m=${prox.slice(0, 7)}` } }
    : vagas
    ? { urg: 'fogo', titulo: vagas === 1 ? `Falta gente ${noDia}` : `Faltam ${vagas} pessoas ${noDia}`,
        sub: `${vagas === 1 ? '1 função está' : `${vagas} funções estão`} sem ninguém em ${fmtLongo(prox)}. Vaga escondida vira furo no culto: resolva antes de publicar.`,
        acao: { tipo: 'link', label: 'Resolver agora', href: linkDoDia },
        sec: { label: 'Copiar assim mesmo', on: () => copiar(msgEscala(S, prox, { link: linkDoVoluntario(base, equipe?.slug) }), aviso) } }
    : furos
    ? { urg: 'fogo', titulo: furos === 1 ? `Alguém furou ${noDia}` : `${furos} pessoas furaram ${noDia}`,
        sub: `Em ${fmtLongo(prox)}. Chame o plantão ou remaneje na escala antes que o culto chegue.`,
        acao: { tipo: 'link', label: 'Resolver agora', href: linkDoDia } }
    : recus
    ? { urg: 'fogo', titulo: recus === 1 ? `Alguém não pode ${noDia}` : `${recus} pessoas não podem ${noDia}`,
        sub: `${recus === 1 ? '1 pessoa avisou que não pode' : `${recus} pessoas avisaram que não podem`} servir em ${fmtLongo(prox)}. Re-sorteie ou troque antes de publicar.`,
        acao: { tipo: 'link', label: 'Resolver agora', href: linkDoDia } }
    : pend
    ? { urg: '', titulo: pend === 1 ? 'Falta 1 confirmação' : `Faltam ${pend} confirmações`,
        sub: `${pend === 1 ? '1 pessoa ainda não respondeu' : `${pend} pessoas ainda não responderam`} para ${fmtLongo(prox)}. Um toque abre o WhatsApp de cada um com a cobrança pronta.`,
        acao: { tipo: 'rolar', label: 'Ver quem falta' } }
    : cutucaProxMes
    ? { urg: '', titulo: `Hora de montar ${mesDe(pm.mes)}`,
        sub: `${Dia} está redondo. Aproveite: peça a disponibilidade e monte ${mesDe(pm.mes)} antes do fim do mês, sem correria.`,
        acao: { tipo: 'link', label: `Montar ${mesDe(pm.mes)}`, href: `/escala?m=${pm.ano}-${String(pm.mes).padStart(2, '0')}` } }
    : { urg: 'ok', titulo: `${Dia} está redondo`,
        sub: `Todo mundo confirmado para ${fmtLongo(prox)}. É só publicar, ou reenviar, a escala no grupo.`,
        acao: { tipo: 'copiar', label: 'Copiar para o WhatsApp' } };

  const rolarPara = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const naoPodem = furos + recus;

  return (
    <>
      <Cab
        rot={hojePorExtenso()}
        titulo={`${Dia}, ${fmtLongo(prox)}`}
        meta={dia ? `${quando[0].toUpperCase()}${quando.slice(1)}. ${cont(r!.total, 'posto', 'postos')} neste culto.` : `${quando[0].toUpperCase()}${quando.slice(1)}. A escala deste culto ainda não foi montada.`}
        /* "Abrir na escala" só quando o passo abaixo não leva para lá: com
           "Resolver agora" logo embaixo, eram dois botões para o mesmo lugar */
        acoes={dia && passo.acao.tipo !== 'link' ? <Link href={linkDoDia} className="es-btn">Abrir na escala</Link> : undefined}
      />

      {/* A FAIXA DE NÚMEROS diz o culto em foco de longe. Com a escala por
          montar, os quatro números seriam zeros enfileirados: a faixa sai e o
          passo abaixo diz o que fazer. */}
      {r && (
        <div className="es-secao">
          <Kpis n={4}>
            <Kpi rot="Postos preenchidos" valor={r.preenchidos} de={r.total}
              sub={vagas ? `${vagas} sem ninguém` : 'todos com alguém'} tom={vagas ? 'bad' : ''}
              rotulo={`Postos preenchidos: ${r.preenchidos} de ${r.total}`} />
            <Kpi rot="Confirmados" valor={r.confirmados} de={r.preenchidos}
              sub={r.confirmados === r.preenchidos && r.preenchidos ? 'todos responderam' : 'dos escalados'}
              tom={r.confirmados ? '' : 'zero'} rotulo={`Confirmados: ${r.confirmados} de ${r.preenchidos}`} />
            <Kpi rot="Sem resposta" valor={pend} destaque={pend > 0}
              sub={pend ? 'esperando confirmar' : 'ninguém devendo'} tom={pend ? 'warn' : 'zero'} />
            <Kpi rot="Não podem" valor={naoPodem}
              sub={naoPodem ? `${recus ? `${recus} ${pl(recus, 'avisou', 'avisaram')}` : ''}${recus && furos ? ' · ' : ''}${furos ? `${furos} ${pl(furos, 'furou', 'furaram')}` : ''}` : 'ninguém desmarcou'}
              tom={naoPodem ? 'bad' : 'zero'} />
          </Kpis>
        </div>
      )}

      {/* O PRÓXIMO PASSO: a única caixa com fundo, com a única ação cheia.
          Urgente (falta gente) pinta o fio e o título de vermelho; redondo
          pinta de verde; o resto fica neutro. */}
      <div className={`es-secao es-passo${passo.urg === 'fogo' ? ' es-bad' : passo.urg === 'ok' ? ' es-ok' : ''}`}>
        <div className="es-passo-txt">
          <h2 className="es-passo-tit">{passo.titulo}</h2>
          <p className="es-passo-sub">{passo.sub}</p>
        </div>
        <div className="es-passo-acoes">
          {passo.acao.tipo === 'link' ? <Link href={passo.acao.href} className="es-btn es-pri">{passo.acao.label}</Link>
            : passo.acao.tipo === 'copiar' ? <button className="es-btn es-pri" onClick={() => copiar(msgEscala(S, prox, { link: linkDoVoluntario(base, equipe?.slug) }), aviso)}><IcCopiar />{passo.acao.label}</button>
            : <button className="es-btn es-pri" onClick={() => rolarPara('cobrar')}><IcSino />{passo.acao.label}</button>}
          {passo.sec && <button className="es-btn es-txt" onClick={passo.sec.on}>{passo.sec.label}</button>}
        </div>
      </div>

      {!!probs.length && (
        <Secao titulo="Conferir antes de publicar">
          {probs.map((p, i) => <Aviso key={i} tom={p.grau === 'erro' ? 'bad' : 'warn'}>{p.texto}</Aviso>)}
        </Secao>
      )}

      <div className="es-duas es-secao">
        <div className="es-pilha">
          {dia && (
            <Secao titulo={`A escala ${ehFollow ? 'do Follow' : 'de domingo'}`}
              sub="A situação de cada pessoa muda aqui mesmo, no toque.">
              <div className="es-fila es-colunas" style={{ '--es-cols': 'minmax(0,1fr) minmax(0,1.3fr) 168px' } as React.CSSProperties}>
                <div className="es-fila-cab" aria-hidden="true"><span>Função</span><span>Pessoa</span><span>Situação</span></div>
                {funcoesDoDia(S, prox).map(f => {
                  const s = dia.slots[f.nome];
                  const st = (otimista?.f === f.nome ? otimista.st : (s?.status || 'pendente')) as Status;
                  return (
                    <div className="es-item es-pn-posto" key={f.nome}>
                      <span className="es-c-tit"><b className="es-pn-fn">{f.nome}</b></span>
                      <span className="es-c-meta">
                        {s?.vid
                          ? <span className="es-pn-pessoa">{nomeDe(S, s.vid)}</span>
                          : <span className="es-pn-pessoa es-pn-vaga">Precisa de alguém</span>}
                      </span>
                      <span className="es-c-acao">
                        {s?.vid
                          ? <Escolha forma="pill" tom={tomDoStatus(st)} valor={st} desabilitado={salvando === f.nome}
                              rotulo={`Situação de ${nomeDe(S, s.vid)} em ${f.nome}`}
                              mostra={SITUACOES.find(x => x.v === st)?.rot || st}
                              aoMudar={v => marcar(f.nome, v as Status)}>
                              {SITUACOES.map(x => <option key={x.v} value={x.v}>{x.rot}</option>)}
                            </Escolha>
                          : <Pilula tom="bad">sem ninguém</Pilula>}
                      </span>
                    </div>
                  );
                })}
                {!!dia.plantao?.length && (
                  <div className="es-item es-pn-posto">
                    <span className="es-c-tit"><b className="es-pn-fn">Plantão</b></span>
                    <span className="es-c-meta"><span className="es-pn-pessoa">{dia.plantao.map(p => nomeDe(S, p)).join(', ')}</span></span>
                    <span className="es-c-acao"><Pilula tom="info">entra se alguém faltar</Pilula></span>
                  </div>
                )}
              </div>
            </Secao>
          )}

          {!!pendentes.length && (
            <Secao id="cobrar" className="es-pn-cobrar" titulo="Sem resposta" n={pendentes.length}
              sub="O botão abre o WhatsApp da pessoa com a cobrança já escrita. Você só aperta enviar."
              acoes={
                /* ERA "COPIAR TODAS" (até 01/10/2026): juntava a cobrança de
                   cada pessoa, cada uma com o LINK PESSOAL dela, num texto só.
                   Colado no privado de alguém, entregava a chave dos outros;
                   colado no grupo, a de todo mundo. A cobrança coletiva agora
                   é a do grupo: os nomes e o link do ministério, sem chave. */
                <button className="es-btn es-peq" onClick={() => copiar(
                  msgConfirmar(S, prox, linkDoVoluntario(base, equipe?.slug)), aviso,
                  'Cobrança copiada. Cole no grupo.')}><IcCopiar />Cobrar no grupo</button>
              }>
              <div className="es-fila">
                {pendentes.map(([fn, s]) => {
                  const v = vol(S, s.vid);
                  const tel = (v?.tel || '').replace(/\D/g, '');
                  const zap = tel ? `https://wa.me/${tel.length <= 11 ? '55' + tel : tel}?text=${encodeURIComponent(msgCobranca(S, s.vid!, prox, base))}` : null;
                  return (
                    <div className="es-item" key={fn}>
                      <span className="es-c-tit"><b>{v?.nome}</b><small>{fn}</small></span>
                      <span className="es-c-acao">
                        {zap
                          ? <a className="es-btn es-peq es-zap" href={zap} target="_blank" rel="noopener"><IcSino />Cobrar no WhatsApp</a>
                          : <button className="es-btn es-peq" onClick={() => copiar(msgCobranca(S, s.vid!, prox, base), aviso, 'Cobrança copiada.')}><IcCopiar />Copiar</button>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Secao>
          )}

          {dia && (
            <Dobra titulo="A mensagem que vai para o grupo" nota="como sai no WhatsApp">
              <pre className="es-msg">{msgEscala(S, prox, { link: linkDoVoluntario(base, equipe?.slug) })}</pre>
              <div className="es-linha" style={{ marginTop: 12 }}>
                <button className="es-btn es-peq" onClick={() => copiar(msgEscala(S, prox, { link: linkDoVoluntario(base, equipe?.slug) }), aviso)}><IcCopiar />Copiar a mensagem</button>
              </div>
            </Dobra>
          )}

          <Igreja />
        </div>

        <div className="es-pilha">
          <Pendencias />

          <Secao titulo="Depois disso">
            <div className="es-fila">
              {seguintes.map(d => {
                const rr = S.escalas[d] && Object.values(S.escalas[d].slots || {}).some((x: any) => x?.vid) ? resumoDia(S, d) : null;
                const l = rr ? leituraDoDia({ vagas: rr.vagas.length, furos: rr.furos, recusados: rr.recusados, pendentes: rr.pendentes }) : null;
                return (
                  <Link href={`/escala?m=${d.slice(0, 7)}#d${d}`} key={d} className="es-item">
                    <span className="es-c-tit">
                      <b>{tipoDoDia(d) === 'follow' ? 'Follow, sábado' : 'Domingo'}, {fmtLongo(d)}</b>
                      <small>{rr ? `${rr.preenchidos} de ${rr.total} postos` : 'escala por montar'}</small>
                    </span>
                    <span className="es-c-acao">
                      {l ? <Pilula tom={l.tom}>{l.txt}</Pilula> : <Pilula>não montada</Pilula>}
                    </span>
                  </Link>
                );
              })}
            </div>
          </Secao>

          <CincoRegras />
        </div>
      </div>
    </>
  );
}
