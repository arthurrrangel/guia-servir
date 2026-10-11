'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { sbPublico as sb } from '@/lib/supabase';
import Instalar from '@/components/Instalar';
import { icsDaEscala } from '@/lib/ics';
import { IGREJA } from '@/lib/igreja';
import { MESES, fmtDia, diaLongo, diffDias, agruparQuemServe, distintivoDoDia, horaDoDia, linksDoRepertorio } from '@/lib/engine';
import { Aviso } from '@/components/Ui';
import { IcCheck, IcSeta, IcCalendario } from '@/components/Icones';
import { Logo } from '@/components/Marca';
import { quemSou, outrasAreas, organiza, faltaDizerSexo, vinculoDeste, type Identidade } from '@/lib/identidade';
import { aviseHumano } from '@/lib/erros';
import { pl, cont } from '@/lib/plural';
import { lembrarVinculo, esquecerVinculo, noPrincipal } from '@/lib/meu-token';
import { rolarAte } from '@/components/escalas/ancora';
/* 103 · troca, função nova e agenda do ministério */
import TrocaDoVoluntario from '@/components/escalas/TrocaDoVoluntario';
import FuncoesDoVoluntario from '@/components/escalas/FuncoesDoVoluntario';
/* 104 · o aviso no celular */
import AvisoNoCelular from '@/components/escalas/AvisoNoCelular';
import OrdemNoLink, { ordensDoLink, type OrdemDoLink } from '@/components/escalas/OrdemNoLink';
import SetlistNoLink, { musicasDaOrdem } from '@/components/escalas/SetlistNoLink';
import ChamadasDoVoluntario from '@/components/escalas/ChamadasDoVoluntario';
import type { ChamadaMinha } from '@/lib/chamadas';
/* 107 · o "Cheguei" do dia e o "Como foi" depois */
import HojeNoLink from '@/components/escalas/HojeNoLink';
/* 109 · o dirigente da semana vê aqui o que falta do bloco dele */
import CronogramaNoLink from '@/components/escalas/CronogramaNoLink';
import { type Folha as FolhaDoCulto, folhaDoBanco } from '@/lib/cronograma';
import ComoFoiNoLink from '@/components/escalas/ComoFoiNoLink';
import { type CultoDeHoje, type ComoFoiMeu, hojeDoLink, comoFoiDoLink } from '@/lib/chegada';
import { type Troca, type Evento, type Vaga, diasDaGrade, rotuloDoDia } from '@/lib/trocas';

type Item = {
  culto_id: string; data: string; funcao: string; status: string; obs: string | null;
  plantao: boolean; primeira_vez?: boolean;
  /* 71 · o posto, para a resposta ser POR POSTO. A tela desenha um cartão por
     posto e `eu_responder` mexia no culto inteiro: um toque em "Não posso"
     derrubava todos os postos da pessoa naquele domingo. */
  funcao_id?: string | null;
  /* 71 · evento esporádico. Sem isto, `diaLongo` chamava de "domingo" toda
     data que não é sábado — e `criar_evento` SÓ aceita dia que não é domingo
     nem sábado de Follow, então TODO evento aparecia como "domingo", com a
     hora do domingo no lembrete do calendário. */
  evento?: string | null; inicio?: string | null;
  /* 71 · de quem é o relatório que está no campo. `culto_obs` tem uma linha
     por (culto, equipe) e o Connect tem dois postos que relatam. */
  relatado_por?: string | null; relatado_eu?: boolean | null;
  /* quando esta pessoa entrou nesta vaga (migração 38). Null nas escalações
     anteriores à migração: null é "não sei", nunca "é antigo". */
  escalado_em?: string | null;
  /* posto de líder do dia: quem está aqui escreve o relatório no fim do culto */
  relata?: boolean; relatorio?: string | null; problemas?: string | null;
  /* 100 · o setlist do culto (links do Spotify, Deezer e YouTube), quando o
     ministério ligou o repertório */
  repertorio?: Record<string, string> | null;
};
/* quem mais está escalado no MESMO dia, na mesma área: nome e função, sem
   telefone. Ver supabase/40-quem-serve-com-voce.sql para o porquê. */
type Junto = { nome: string; funcao: string; eu: boolean; status: string };

/* quem pode cobrir a vaga que a pessoa acabou de deixar */
type Cobre = { nome: string; telefone: string; nivel: string; disse_que_pode: boolean };

/* sábado é o culto do Follow. Escrever "domingo" num sábado é o tipo de erro
   que faz a pessoa aparecer no dia errado. */
const ehSabado = (s: string) => new Date(s + 'T12:00:00Z').getUTCDay() === 6;
const hojeISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
  .toISOString().slice(0, 10);
/* na lista e na grade a data aparece dez vezes: por extenso vira parede.
   "dom 30/08" e "sáb 29/08 (Follow)" dizem o mesmo em um terço do espaço. */
const diaCurto = (s: string) => {
  const dt = new Date(s + 'T12:00:00Z');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  return ehSabado(s) ? `sáb ${d}/${m} · Follow` : `dom ${d}/${m}`;
};
/* o mesmo rótulo sem o mês, para dentro de um grupo que já diz de que mês é */
const diaNoMes = (s: string) => {
  const dt = new Date(s + 'T12:00:00Z');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return ehSabado(s) ? `sáb ${d} · Follow` : `dom ${d}`;
};
/* 71 · `diaLongo` mora em `lib/engine.ts`, com o porquê e a regra escritos
   lá. Saiu daqui porque é a frase que manda a pessoa sair de casa num dia, e
   dentro deste componente de cliente nenhum teste conseguia importá-la.
   `scripts/dia-longo.test.mjs` tem a tabela verdade. */


/* O relatório é do LÍDER ESCALADO, não do líder do app: quem viveu o culto é
   quem sabe como foi. Por isso ele aparece aqui, no link pessoal, no celular
   da pessoa, e só depois que o culto começou. Pedir antes do dia é como o
   formulário morre. */
function Relatorio({ item, token, aoSalvar }: { item: Item; token: string; aoSalvar: () => void }) {
  const [texto, setTexto] = useState(item.relatorio || '');
  const [probs, setProbs] = useState(item.problemas || '');
  const [salvando, setSalvando] = useState(false);
  const [ok, setOk] = useState(false);
  const [erro, setErro] = useState('');

  async function salvar() {
    setSalvando(true); setErro(''); setOk(false);
    const { error } = await sb()!.rpc('eu_relatorio', {
      p_token: token, p_culto_id: item.culto_id, p_texto: texto, p_problemas: probs,
    });
    if (error) setErro(aviseHumano(error, 'salvar'));
    else { setOk(true); aoSalvar(); setTimeout(() => setOk(false), 3000); }
    setSalvando(false);
  }

  const jaTinha = !!(item.relatorio || item.problemas);
  /* 71 · DE QUEM É O TEXTO QUE ESTÁ NA CAIXA.

     `culto_obs` tem UMA linha por (culto, equipe), e o Connect tem DOIS postos
     que relatam (LÍDER 1 e LÍDER 2, migração 12). Medido em 21/09: a Ana
     escreve, o Caio abre a tela dele e encontra o texto DELA já preenchido na
     caixa, sob o rótulo "Relatório enviado" e com o botão "Atualizar
     relatório". Nada dizia que aquilo era de outra pessoa. Ele escreve o dele
     e some o dela — junto com "bebedouro vazando", que era a manutenção que
     ninguém mais ia ver.

     A correção é dizer. Sobrescrever continua possível, porque às vezes é
     exatamente o que se quer (corrigir o próprio texto, completar o do
     colega), mas agora é uma escolha e não um acidente. */
  const deOutro = jaTinha && item.relatado_eu === false && !!item.relatado_por;
  return (
    <div className="relatorio">
      <span className="overline eu-lbl">
        {!jaTinha ? 'Relatório do dia'
          : deOutro ? `Relatório de ${item.relatado_por!.split(' ')[0]}`
          : 'Relatório enviado'}
      </span>
      <p className="dim pequeno" style={{ margin: '2px 0 12px' }}>
        Você é líder deste culto. No fim, conta aqui como foi. Quem lidera no próximo
        domingo lê isso antes de começar.
      </p>
      {deOutro && (
        <p className="postos-falta" role="note" style={{ marginBottom: 12 }}>
          Este texto é de {item.relatado_por}, que também liderou este culto. Se você
          salvar por cima, o dela some. Complete o texto em vez de apagar, ou combine
          com {item.relatado_por!.split(' ')[0]} quem escreve.
        </p>
      )}
      <label htmlFor={'rel' + item.culto_id}>Como foi o andamento do trabalho</label>
      {/* teto de 1000 nos dois campos: quem lidera escreve isto no celular, no
          fim do culto, e o que o próximo líder lê antes de começar é um
          parágrafo, não um relatório longo. Teto também fecha a porta de um
          texto colado inteiro por engano. */}
      <textarea id={'rel' + item.culto_id} rows={3} value={texto} maxLength={1000}
        onChange={e => setTexto(e.target.value)}
        placeholder="Equipe completa, tudo tranquilo." />
      <div style={{ height: 12 }} />
      <label htmlFor={'prob' + item.culto_id}>Algum defeito ou falta de material</label>
      <textarea id={'prob' + item.culto_id} rows={2} value={probs} maxLength={1000}
        onChange={e => setProbs(e.target.value)}
        placeholder="Banheiro masculino sem papel. Bebedouro vazando." />
      {/* a nota diz por que o botão está apagado. Era vermelha (a classe de
          alerta da escala), e aparecia assim antes de a pessoa tocar em nada:
          um erro na tela de quem ainda não errou (auditoria de 02/10). */}
      {!salvando && !texto.trim() && !probs.trim() && (
        <p className="dim pequeno" role="status" style={{ margin: '8px 0 0' }}>
          Escreva pelo menos um dos dois campos. Se o dia foi tranquilo, escrever isso
          já ajuda quem lidera no próximo.
        </p>
      )}
      <div className="linha" style={{ marginTop: 12 }}>
        <button className="pri" disabled={salvando || (!texto.trim() && !probs.trim())} onClick={salvar}>
          {salvando ? 'Salvando...' : jaTinha ? 'Atualizar relatório' : 'Enviar relatório'}
        </button>
        {ok && <span className="pill ok"><IcCheck /> salvo</span>}
      </div>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
    </div>
  );
}

export default function Eu() {
  const { token } = useParams<{ token: string }>();
  const [nome, setNome] = useState('');
  const [equipe, setEquipe] = useState('');
  const [itens, setItens] = useState<Item[]>([]);
  const [indisp, setIndisp] = useState<string[]>([]);
  const [disponivel, setDisponivel] = useState<string[]>([]);
  const [cobrem, setCobrem] = useState<Record<string, Cobre[]>>({});
  const [domingos, setDomingos] = useState<string[]>([]);
  /* 82 · a leitura dos domingos falhou?  sozinho e indistinguivel de
     "nao ha domingos", e a secao sumia calada. */
  const [domingosFalhou, setDomingosFalhou] = useState(false);
  /* QUEM SERVE COM VOCÊ — fase 7. Chega depois da tela, e some sozinho se a
     função ainda não existir no banco: nenhuma tela quebra por causa disto. */
  const [juntos, setJuntos] = useState<Junto[]>([]);
  /* MEU ESPAÇO (§13, §14): perfil, função, primeiros passos e contato do líder.
     Vem de `eu_espaco`, função nova ao lado da `eu_dados` que a tela já usava —
     trocar a que funciona no dia da campanha seria trocar de asa em pleno voo. */
  const [espaco, setEspaco] = useState<any>(null);
  const [fase, setFase] = useState<'carregando' | 'erro' | 'rede' | 'ok'>('carregando');
  /* veio da porta do link do grupo (?porta=c|d): mostra "Não é você?" */
  const [viaPorta, setViaPorta] = useState<'' | 'confirmar' | 'disponibilidade' | 'cheguei'>('');
  const [slugDaPorta, setSlugDaPorta] = useState('');
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const v = q.get('porta');
      setViaPorta(v === 'd' ? 'disponibilidade' : v === 'h' ? 'cheguei' : v === 'c' || v === '1' ? 'confirmar' : '');
      const m = q.get('m') || '';
      if (/^[a-z0-9-]{1,40}$/.test(m)) setSlugDaPorta(m);
    } catch {}
  }, []);
  const [ocupado, setOcupado] = useState('');
  const [flash, setFlash] = useState('');
  const [erro, setErro] = useState('');
  /* quem é a pessoa na igreja inteira, não só neste vínculo. É o que permite
     dizer "você também serve na Mídia" para quem chegou pelo link do Louvor. */
  const [eu, setEu] = useState<Identidade | null>(null);
  const [salvandoSexo, setSalvandoSexo] = useState('');
  /* 103 · TROCA, FUNÇÃO NOVA E AGENDA. Chegam depois da tela, como `eu_espaco`:
     a escala é o que a pessoa veio ver e não espera por isto. `trocasOk` só
     vira verdadeiro quando `eu_trocas` respondeu, isto é, quando a migração
     103 está no banco: antes disso nenhum botão novo aparece. */
  const [trocas, setTrocas] = useState<Troca[]>([]);
  const [trocasOk, setTrocasOk] = useState(false);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [vagaTroca, setVagaTroca] = useState<Vaga | null>(null);
  const [ofertas, setOfertas] = useState<Vaga[]>([]);
  /* 105 · a ordem dos cultos em que a pessoa serve, de todo ministério que a
     publicou. Chega depois da tela, como as trocas; antes da 105 no banco a
     chamada falha e a seção simplesmente não aparece. */
  const [ordens, setOrdens] = useState<OrdemDoLink[]>([]);
  /* 106 · os convites da liderança para cobrir vaga. Mesma regra: sem a 106
     no banco a chamada falha e nada aparece. */
  const [chamadas, setChamadas] = useState<ChamadaMinha[]>([]);
  /* 107 · o culto de hoje (o "Cheguei" e, para o líder do dia, o time) e os
     cultos dos últimos sete dias para contar como foi. Mesma regra: sem a 107
     no banco a chamada falha e nada aparece. */
  const [hojeLink, setHojeLink] = useState<CultoDeHoje[]>([]);
  const [comoFoi, setComoFoi] = useState<ComoFoiMeu[]>([]);
  /* 109 · os cultos em que a pessoa é o dirigente da semana (a Palavra e os
     avisos são dela). Mesma regra: sem a 109 no banco, nada aparece. */
  const [cronos, setCronos] = useState<FolhaDoCulto[]>([]);

  /* 103 · as trocas e a agenda do ministério. Falha aqui não derruba nada:
     a seção da troca e os eventos da grade simplesmente não aparecem. */
  const carregarExtras = useCallback(async () => {
    const s = sb();
    if (!s) return;
    try {
      const [tr, ev, or, ch, hj, cf, cr] = await Promise.all([
        s.rpc('eu_trocas', { p_token: token }),
        s.rpc('eu_eventos', { p_token: token }),
        s.rpc('eu_ordens', { p_token: token }),
        s.rpc('eu_chamadas', { p_token: token }),
        s.rpc('eu_hoje', { p_token: token }),
        s.rpc('eu_como_foi', { p_token: token }),
        s.rpc('eu_cronogramas', { p_token: token }),
      ]);
      if (!tr.error) { setTrocas((tr.data || []) as Troca[]); setTrocasOk(true); }
      if (!ev.error) setEventos((ev.data || []) as Evento[]);
      if (!or.error) setOrdens(ordensDoLink(or.data));
      if (!ch.error) setChamadas((ch.data || []) as ChamadaMinha[]);
      if (!hj.error) setHojeLink(hojeDoLink(hj.data));
      if (!cf.error) setComoFoi(comoFoiDoLink(cf.data));
      if (!cr.error && (cr.data as any)?.ok) setCronos((((cr.data as any).cultos || []) as unknown[]).map(folhaDoBanco).filter(Boolean) as FolhaDoCulto[]);
    } catch { /* a tela fica como estava */ }
  }, [token]);
  /* 103 · depois de acrescentar ou tirar função, "Você faz" relê o banco */
  const lerEspaco = useCallback(async () => {
    try {
      const { data: e } = await sb()!.rpc('eu_espaco', { p_token: token });
      if ((e as any)?.ok) setEspaco(e);
    } catch { /* fica o que estava */ }
  }, [token]);

  /* inicial=true: primeira carga, pode mostrar tela cheia de erro/rede.
     inicial=false: reload de fundo após uma ação — NUNCA rebaixar a tela
     (o envio já salvou); no máximo um aviso discreto. */
  const carregar = useCallback(async (inicial = true) => {
    /* harness de design; import dinâmico para não entrar no build (ver Shell) */
    if (process.env.NODE_ENV === 'development'
        && new URLSearchParams(window.location.search).has('demo')) {
      const { euDemo } = await import('@/lib/demo');
      const d = euDemo(new URLSearchParams(window.location.search).get('demo') || '');
      setNome(d.nome); setEquipe(d.equipe); setItens(d.escalas as any);
      setIndisp(d.indisponivel); setDisponivel(d.disponivel);
      /* 103 · o harness desenha a troca e a agenda também */
      if (d.trocas) { setTrocas(d.trocas as Troca[]); setTrocasOk(true); }
      if (d.eventos) setEventos(d.eventos as Evento[]);
      if (d.espaco) setEspaco(d.espaco);
      /* 105 · e a ordem do culto */
      if ((d as any).ordens) setOrdens(ordensDoLink((d as any).ordens));
      /* 106 · e os convites para cobrir */
      if ((d as any).chamadas) setChamadas((d as any).chamadas as ChamadaMinha[]);
      /* 107 · e o dia de hoje e o como foi */
      if ((d as any).hoje) setHojeLink(hojeDoLink((d as any).hoje));
      if ((d as any).comoFoi) setComoFoi(comoFoiDoLink((d as any).comoFoi));
      /* 109 · e o cartão do dirigente */
      if ((d as any).cronogramas) setCronos(((d as any).cronogramas as unknown[]).map(folhaDoBanco).filter(Boolean) as FolhaDoCulto[]);
      setDomingos(d.dias); setFase('ok');
      return;
    }
    const s = sb();
    if (!s) { if (inicial) setFase('erro'); return; }
    const [{ data, error }, dom] = await Promise.all([
      s.rpc('eu_dados', { p_token: token }),
      s.rpc('eu_proximos_domingos'),
    ]);
    if (error) {
      /* link que não vale mais: o aparelho esquece, para o link do grupo
         não mandar a pessoa para cá de novo (01/10/2026) */
      if (/link inv/i.test(error.message || '')) { esquecerVinculo(token); if (inicial) setFase('erro'); return; }
      if (inicial) setFase('rede');
      else setErro('Salvou! Só não consegui atualizar a tela agora, recarregue quando tiver sinal.');
      return;
    }
    if (!data?.length) { esquecerVinculo(token); if (inicial) setFase('erro'); return; }
    setErro('');
    /* 16/09/2026: o aparelho passa a saber quem é a pessoa. Até aqui só quem
       entrava pelo PIN guardava o token; quem só usava o link pessoal era
       estranho para o site a cada visita. Com o token guardado, a barra de
       próximo passo das páginas públicas vira "Sua escala", e a porta /eu
       reconhece o aparelho. É o mesmo token do link: nada novo entra no
       aparelho que a pessoa já não tivesse na barra de endereço. */
    try { localStorage.setItem('escala.meu-token', token); } catch {}
    setNome(data[0].nome);
    setEquipe(data[0].equipe || '');
    /* o título era global e dizia 'Escala de Mídia' para todo mundo, inclusive
       para quem serve no Louvor ou na Diaconia */
    try { document.title = 'Minha escala · ' + (data[0].equipe || 'GUIA'); } catch {}
    setItens((data[0].escalas || []) as Item[]);
    setIndisp((data[0].indisponivel || []) as string[]);
    setDisponivel((data[0].disponivel || []) as string[]);
    /* 82 · O ERRO DESTA SEGUNDA CHAMADA NÃO ERA OLHADO.

       Era `setDomingos(((dom.data || []) as any[])...)`, e `dom.error` nunca
       foi lido. Numa falha, `domingos` virava `[]`, e `[]` é indistinguível
       de "não há domingos": a seção "Quando você pode" e o botão "Dizer
       quando eu posso" simplesmente NÃO APARECIAM, sem uma palavra.

       Medido em 21/09, falhando só esta RPC:

         fase da tela ......................... ok
         domingos ............................. 0
         seção "Quando você pode" ............. NÃO APARECE
         botão "Dizer quando eu posso" ........ NÃO APARECE
         algum aviso de erro na tela .......... NENHUM

       É a única coisa que a pessoa nova é instruída a fazer, e é o dado que
       alimenta o sorteio. Uma falha de rede de um segundo tirava a seção até
       alguém recarregar.

       A escala continua aparecendo — ela é o que a pessoa veio ver, e
       derrubar a tela inteira por causa da grade seria pior. O que muda é
       que a ausência passa a ter MOTIVO, e a tela o diz. */
    if (dom.error) {
      setDomingosFalhou(true);
      setDomingos([]);
    } else {
      setDomingosFalhou(false);
      setDomingos(((dom.data || []) as any[]).map(d => (typeof d === 'string' ? d : d.data)));
    }
    /* identidade única: uma chamada, e a tela passa a saber tudo que a
       pessoa é. Sem await para não segurar a escala, que é o que ela veio ver. */
    void quemSou(token).then(i => { if (i?.ok) setEu(i); }).catch(() => {});
    /* as duas chamadas acima são extras: a escala, que é o que a pessoa veio
       ver, já carregou. Se elas falharem a tela continua útil — mas a rejeição
       precisa ter dono, senão vira ruído de console e, em alguns navegadores,
       um erro global. */
    /* .then(ok, erro) e não .then().catch(): o retorno do supabase-js é um
       PromiseLike, um "thenable" — tem .then e NÃO tem .catch. A forma de dois
       argumentos existe no PromiseLike e faz a mesma coisa aqui. */
    sb()!.rpc('eu_espaco', { p_token: token }).then(
      ({ data: e }) => {
        if (!(e as any)?.ok) return;
        setEspaco(e);
        /* 01/10/2026: o aparelho passa a saber DE QUAL ministério é este
           token. É o que deixa o link do grupo (/confirmar/<ministério>)
           abrir a página certa de quem serve em dois ministérios. */
        lembrarVinculo(token, (e as any).equipe_slug);
      },
      () => {},
    );
    void carregarExtras();
    setFase('ok');
  }, [token, carregarExtras]);

  /* O LINK QUE CHEGA COM ÂNCORA (#quando-posso, #confirmar), vindo da porta
     do grupo. O navegador procura a âncora ao abrir a página, quando ela
     ainda é só o "carregando", e desiste. Aqui a busca acontece de novo
     quando a página existe, e segue a página enquanto ela assenta. */
  useEffect(() => {
    if (fase !== 'ok') return;
    let id = '';
    try { id = decodeURIComponent(window.location.hash.slice(1)); } catch { return; }
    if (!id || !/^[a-z0-9-]+$/i.test(id)) return;
    let tentativas = 0;
    const tentar = () => { if (!rolarAte(id) && ++tentativas < 30) window.setTimeout(tentar, 100); };
    const q = window.requestAnimationFrame(tentar);
    return () => window.cancelAnimationFrame(q);
  }, [fase]);

  useEffect(() => { void carregar(); }, [carregar]);

  /* quem já desmarcou em cima da hora e voltou depois continua vendo a lista
     de quem pode cobrir — o pedido não some ao fechar a página. */
  useEffect(() => {
    /* 02/10/2026 · enquanto uma resposta grava, a tela já mudou (a recusa
       aparece no toque) mas o banco ainda não: perguntar agora devolveria a
       lista de antes da vaga abrir. Quando a gravação termina, `ocupado`
       volta a vazio e este efeito pergunta, uma vez. */
    if (ocupado) return;
    const abertos = itens.filter(i => !i.plantao && i.status === 'recusado'
      && horasAte(i.data, i.inicio) < TARDIO && horasAte(i.data, i.inicio) > -12 && !cobrem[i.culto_id]);
    if (!abertos.length) return;
    /* uma pergunta por CULTO: com dois postos recusados no mesmo culto eram
       duas chamadas iguais */
    const porCulto = [...new Map(abertos.map(i => [i.culto_id, i] as const)).values()];
    let vivo = true;
    void (async () => {
      for (const i of porCulto) {
        const { data, error } = await sb()!.rpc('eu_quem_cobre', { p_token: token, p_culto_id: i.culto_id });
        if (!vivo) return;
        /* 82 · FALHA NÃO VIRA LISTA VAZIA, E NÃO TRANCA A PRÓXIMA TENTATIVA.

           Era `const { data } = await ...` e `setCobrem(... (data || []))`.
           Em falha isso gravava `[]` — e o guarda deste efeito é
           `!cobrem[i.culto_id]`, que passa a ser FALSO. Ou seja: uma falha de
           rede de um segundo deixava a pessoa que acabou de desmarcar em cima
           da hora sem a lista de quem pode cobrir, para sempre naquela visita,
           sem a tela dizer que tentou.

           Não gravar nada mantém o guarda aberto: a próxima repintura (a
           resposta a qualquer botão, ou a volta do foco) tenta de novo
           sozinha, que é o comportamento que a lista vazia impedia. */
        if (error) continue;
        setCobrem(prev => ({ ...prev, [i.culto_id]: (data || []) as Cobre[] }));
      }
    })();
    return () => { vivo = false; };
  }, [itens, token, ocupado]);   // eslint-disable-line react-hooks/exhaustive-deps

  /* QUEM SERVE COM VOCÊ NO PRÓXIMO DIA — fase 7.

     Busca depois da primeira pintura, e de propósito: a tela não pode esperar
     por isto para dizer à pessoa o que ela precisa fazer. Se a função ainda não
     existir no banco (o SQL é uma migração à parte), o erro é engolido e a
     seção simplesmente não aparece — nenhuma tela quebra por causa de um
     complemento. */
  useEffect(() => {
    const hj = hojeISO();
    const prox = [...itens]
      .filter(i => !i.plantao && i.data >= hj && (i.status || 'pendente') !== 'recusado')
      .sort((a, b) => a.data.localeCompare(b.data))[0];
    if (!prox) { setJuntos([]); return; }
    let vivo = true;
    void (async () => {
      try {
        const { data, error } = await sb()!.rpc('eu_quem_serve',
          { p_token: token, p_culto_id: prox.culto_id });
        if (!vivo || error) return;
        setJuntos((data || []) as Junto[]);
      } catch { /* a seção some, a tela fica */ }
    })();
    return () => { vivo = false; };
  }, [itens, token]);

  /* horas entre agora e o culto (domingo, 18h). Serve para saber se o
     "não posso" veio com antecedência ou em cima da hora. */
  /* 79 · `inicio` ENTRA NA CONTA, e antes não entrava.

     A 76 pôs a janela de 48h dentro de `eu_quem_cobre` e escreveu que as
     duas pontas passavam a usar a mesma expressão. Não passavam: o banco
     lê `cultos.inicio` e cai em 18h só quando ele é nulo; esta função
     cravava 18h SEMPRE, mesmo tendo `inicio` em mãos (`eu_dados` traz desde
     a 71, e o `.ics` logo abaixo já usava).

     Divergiam nos dois sentidos, e o que importa é o primeiro:

       · evento das 08h, faltando 46h reais -> a função devolvia os
         TELEFONES e a tela nem chamava. Quer dizer: quem chamasse a rota
         direto colhia a lista fora da regra de produto.
       · evento das 20h, faltando 48,5h -> a tela chamava e a função devolvia
         vazio, e o bloco sumia sem explicação.

     Agora a conta é a mesma dos dois lados. O `-03:00` fixo continua aqui
     porque é o que o JavaScript do navegador sabe fazer sem biblioteca; o
     lado SQL usa a zona `America/Sao_Paulo`, que é o que sobrevive a uma
     volta do horário de verão. Hoje dá no mesmo, e está escrito para o dia
     em que não der. */
  const horasAte = (data: string, inicio?: string | null) =>
    Math.round((Date.parse(`${data}T${(inicio || '18:00:00').slice(0, 8)}-03:00`) - Date.now()) / 3600000);
  const TARDIO = 48;

  /* =================================================================== 02/10/2026
     RESPONDER POR DIA, E A TELA MUDA NA HORA.

     Pedido do Arthur: "melhore a intuitividade e objetividade da área do
     voluntário no celular para posso / não posso e confirmar escala". Três
     coisas pesavam:

       1. Um cartão POR POSTO. Quem está em PROJEÇÃO e FILMAGEM no mesmo
          sábado respondia duas vezes a mesma pergunta ("eu vou no sábado?").
          Agora é um cartão por culto, com os postos dentro, e um toque
          responde todos os postos que estão esperando resposta. O banco já
          responde por posto desde a 71: aqui vão uma chamada por posto, em
          paralelo, e só os postos do cartão (um posto recusado de propósito
          no mesmo dia não é reconfirmado por tabela).
       2. A resposta esperava duas viagens ao banco (gravar e reler) para
          aparecer. Num 4G ruim, um segundo de botão apagado. Agora a tela
          muda no toque; se o banco recusar, ela volta e a barra diz por quê.
       3. A grade "Quando você pode" e o cartão diziam coisas diferentes do
          mesmo dia: "Posso" num dia em que a pessoa está escalada só marcava
          disponibilidade, e o cartão de cima continuava pedindo confirmação.
          Ver `dizerDia`, logo abaixo.

     Os outros caminhos de resposta da página (o cartão da próxima escala e
     "Depois disso") também passam por aqui, com os postos daquele culto. */
  const chaveDoPosto = (i: { culto_id: string; funcao_id?: string | null; funcao: string }) =>
    `${i.culto_id}\u0000${i.funcao_id ?? i.funcao}`;
  /* a releitura depois de responder: uma só, um instante depois do último
     toque. Com a tela já certa pelo toque, reler a cada resposta só fazia o
     dia piscar de volta quando duas respostas se cruzavam. No harness de
     design não há banco para reler, e reler devolveria o estado inicial. */
  const recarga = useRef<number | null>(null);
  const agendarRecarga = () => {
    if (process.env.NODE_ENV === 'development' && /[?&]demo=/.test(window.location.search)) return;
    if (recarga.current) window.clearTimeout(recarga.current);
    recarga.current = window.setTimeout(() => { recarga.current = null; void carregar(false); }, 1200);
  };
  useEffect(() => () => { if (recarga.current) window.clearTimeout(recarga.current); }, []);

  async function responderItens(alvo: Item[], status: 'confirmado' | 'recusado', chave = alvo[0]?.culto_id || '') {
    if (!alvo.length) return;
    setOcupado(chave); setErro('');
    const antes = itens;
    const marcados = new Set(alvo.map(chaveDoPosto));
    setItens(prev => prev.map(i => (!i.plantao && marcados.has(chaveDoPosto(i))) ? { ...i, status } : i));
    /* uma chamada por posto; posto antigo sem id (anterior à 71) responde
       pelo culto inteiro, uma vez só */
    const chamadas: { culto_id: string; funcao_id: string | null }[] = [];
    const semId = new Set<string>();
    for (const i of alvo) {
      if (i.funcao_id) chamadas.push({ culto_id: i.culto_id, funcao_id: i.funcao_id });
      else if (!semId.has(i.culto_id)) { semId.add(i.culto_id); chamadas.push({ culto_id: i.culto_id, funcao_id: null }); }
    }
    const rs = await Promise.allSettled(chamadas.map(c => sb()!.rpc('eu_responder',
      { p_token: token, p_culto_id: c.culto_id, p_status: status, p_funcao_id: c.funcao_id })
      .then((r: any) => { if (r?.error) throw r.error; return r?.data; })));
    const ruins = rs.filter(r => r.status === 'rejected') as PromiseRejectedResult[];
    if (ruins.length === rs.length) {
      setItens(antes);
      setFlash(''); setErro(aviseHumano(ruins[0].reason, 'salvar'));
      setOcupado(''); return;
    }
    /* 75 · a tela agradecia mesmo quando nada tinha sido gravado. A função
       devolve `{ok, mudou}`; deploy antigo contra banco novo continua
       funcionando (`mudou` indefinido cai na frase de sempre). */
    const mudou = rs.filter(r => r.status === 'fulfilled')
      .map(r => ((r as PromiseFulfilledResult<any>).value as { mudou?: number } | null)?.mudou);
    if (mudou.length && mudou.every(m => m === 0)) {
      setFlash('');
      setErro('Esse posto não está mais com você neste dia. Recarregue a página; se continuar, fale com quem organiza a sua área.');
      await carregar(false);
      setOcupado(''); return;
    }
    if (ruins.length) {
      setFlash('');
      setErro(`${aviseHumano(ruins[0].reason, 'salvar')} Uma parte não entrou; confira a lista e toque de novo.`);
    } else {
      /* honestidade: o sistema NÃO avisa o líder sozinho. Prometer isso fazia
         a pessoa não avisar por fora, achando que já estava resolvido. */
      setFlash(status === 'confirmado' ? 'Confirmado. Obrigado!' : 'Registrado.');
    }
    /* 103 · quem acabou de largar uma vaga ganha, logo abaixo do "Precisa de
       você", a oferta de pedir a um colega. Quem voltou atrás perde a oferta. */
    setOfertas(prev => {
      const sem = prev.filter(o => !alvo.some(i => i.culto_id === o.culto_id && i.funcao_id === o.funcao_id));
      return status === 'recusado'
        ? [...sem, ...alvo.filter(i => !!i.funcao_id && i.data >= hojeISO()).map(i => ({
            culto_id: i.culto_id, funcao_id: i.funcao_id!, funcao: i.funcao, data: i.data,
            evento: i.evento ?? null, inicio: i.inicio ?? null }))]
        : sem;
    });
    setOcupado('');
    agendarRecarga();
    window.setTimeout(() => setFlash(f => (f === 'Confirmado. Obrigado!' || f === 'Registrado.' ? '' : f)), 2600);
    /* desmarcou em cima da hora: quem abriu o buraco ajuda a fechar. Quem
       pergunta "quem pode cobrir" é o efeito lá de cima, quando `ocupado`
       volta a vazio: perguntar aqui também fazia duas chamadas por recusa. */
  }

  /* disponibilidade explícita: cada dia é posso / não posso, sem meio-termo.
     A cor muda no toque; se o banco recusar, ela volta. */
  async function responderDisp(d: string, resposta: 'posso' | 'nao') {
    setOcupado(d); setErro('');
    const [antesP, antesN] = [disponivel, indisp];
    if (resposta === 'posso') { setDisponivel(p => (p.includes(d) ? p : [...p, d])); setIndisp(p => p.filter(x => x !== d)); }
    else { setIndisp(p => (p.includes(d) ? p : [...p, d])); setDisponivel(p => p.filter(x => x !== d)); }
    const { error } = await sb()!.rpc('eu_disponibilidade', { p_token: token, p_data: d, p_resposta: resposta });
    if (error) { setDisponivel(antesP); setIndisp(antesN); setFlash(''); setErro(aviseHumano(error, 'salvar')); }
    else agendarRecarga();
    setOcupado('');
  }

  /* O MESMO DIA, A MESMA RESPOSTA — 02/10/2026.

     Na grade, o dia em que a pessoa está escalada respondia outra pergunta:
     "Posso" marcava só a disponibilidade, e o cartão "Confirme se você vai"
     continuava pedindo resposta para o mesmo sábado. Quem tocou "Posso"
     achava que tinha confirmado; a liderança via "sem resposta".

     Agora, nesse dia, a grade responde a escala: "Posso" confirma os postos
     que esperam resposta (ou, se ela tinha dito que não podia, todos de
     volta), e "Não posso" recusa os postos do dia, e o banco marca o dia como
     indisponível (`eu_responder`, 75). O dia sem escala continua sendo
     disponibilidade, como sempre. */
  const escalaDoDia = (d: string) => itens.filter(i => !i.plantao && i.data === d
    && (i.status || 'pendente') !== 'furou');
  async function dizerDia(d: string, resposta: 'posso' | 'nao') {
    const esc = escalaDoDia(d);
    if (!esc.length) return responderDisp(d, resposta);
    if (resposta === 'posso') {
      const alvo = esc.every(i => i.status === 'recusado') ? esc
        : esc.filter(i => (i.status || 'pendente') === 'pendente');
      if (alvo.length) await responderItens(alvo, 'confirmado', d);
      return;
    }
    const alvo = esc.filter(i => i.status !== 'recusado');
    if (alvo.length) await responderItens(alvo, 'recusado', d);
  }

  /* os dias agrupados pelo mês a que pertencem, na ordem em que vêm. Cálculo
     de leitura, não de estado: nada aqui precisa de memo. */
  /* 103 · os dias da grade: sábados e domingos, e os eventos do ministério no
     dia deles. A resposta continua sendo por dia, como sempre. */
  const dias = diasDaGrade(domingos, eventos);
  const porMes = (() => {
    const anoHoje = new Date().getUTCFullYear();
    const g: { chave: string; rot: string; ano: string; dias: string[] }[] = [];
    for (const d of dias) {
      const chave = d.slice(0, 7);
      const at = g.find(x => x.chave === chave);
      if (at) { at.dias.push(d); continue; }
      const nome = MESES[+d.slice(5, 7) - 1];
      g.push({ chave, rot: nome[0].toUpperCase() + nome.slice(1), ano: d.slice(0, 4), dias: [d] });
    }
    /* O ANO SÓ APARECE QUANDO INFORMA. Antes vinha colado em todo mês:
       "setembro de 2026", "outubro de 2026", "novembro de 2026". Três vezes a
       mesma informação, que por ser a mesma não distingue nenhum dos três — só
       alonga a linha e empurra o nome do mês, que é o que a pessoa procura,
       para longe da borda. Agora sai no primeiro grupo apenas se não for o ano
       corrente, e depois só quando o ano vira, que é o único momento em que
       "dezembro" e "janeiro" precisam ser desempatados. */
    return g.map((m, i) => ({
      ...m,
      rot: (i === 0 ? +m.ano !== anoHoje : m.ano !== g[i - 1].ano) ? `${m.rot} de ${m.ano}` : m.rot,
    }));
  })();

  /* a resposta de cada dia da grade: a da escala, quando ela está escalada
     nele; a da disponibilidade, quando não */
  const respostaDoDia = (d: string): 'posso' | 'nao' | '' => {
    const esc = escalaDoDia(d);
    if (esc.length) {
      if (esc.every(i => i.status === 'recusado')) return 'nao';
      return esc.some(i => (i.status || 'pendente') === 'pendente') ? '' : 'posso';
    }
    return disponivel.includes(d) ? 'posso' : indisp.includes(d) ? 'nao' : '';
  };

  /* "POSSO EM TODOS" CUSTAVA QUATRO SEGUNDOS, E PARAVA NO MEIO — 20/09/2026.

     Era um laço `for` com `await` dentro, uma RPC por data, uma atrás da
     outra, e um `break` no primeiro erro: num 4G ruim, 4 s de botão travado,
     e falhar na quarta de oito deixava três gravadas e cinco não. Em
     paralelo e com `allSettled`, a onda inteira leva o tempo de uma, e a
     mensagem diz QUAIS datas não entraram.

     02/10/2026: o dia em que ela está escalada entra como confirmação dos
     postos que esperam resposta (ver `dizerDia`), e a grade muda no toque. */
  async function marcarPosso(lista: string[], oQue: string) {
    if (!lista.length) return;
    setOcupado('todos'); setErro('');
    const soltos = lista.filter(d => !escalaDoDia(d).length);
    const postos = lista.flatMap(d => escalaDoDia(d).filter(i => (i.status || 'pendente') === 'pendente'));
    const [antesP, antesN, antesI] = [disponivel, indisp, itens];
    setDisponivel(p => [...p, ...soltos.filter(d => !p.includes(d))]);
    setIndisp(p => p.filter(d => !soltos.includes(d)));
    const marcados = new Set(postos.map(chaveDoPosto));
    setItens(prev => prev.map(i => (!i.plantao && marcados.has(chaveDoPosto(i))) ? { ...i, status: 'confirmado' } : i));
    const tarefas = [
      ...soltos.map(d => ({ d, f: () => sb()!.rpc('eu_disponibilidade', { p_token: token, p_data: d, p_resposta: 'posso' }) })),
      ...postos.map(i => ({ d: i.data, f: () => sb()!.rpc('eu_responder',
        { p_token: token, p_culto_id: i.culto_id, p_status: 'confirmado', p_funcao_id: i.funcao_id ?? null }) })),
    ];
    const rs = await Promise.allSettled(tarefas.map(t => t.f().then((r: any) => { if (r?.error) throw r.error; return r; })));
    const ruins = rs.map((r, k) => ({ r, d: tarefas[k].d })).filter(o => o.r.status === 'rejected');
    if (ruins.length) {
      if (ruins.length === rs.length) { setDisponivel(antesP); setIndisp(antesN); setItens(antesI); }
      const e0 = (ruins[0].r as PromiseRejectedResult).reason;
      const quais = [...new Set(ruins.map(o => fmtDia(o.d)))].join(', ');
      setFlash(''); setErro(`${aviseHumano(e0, oQue)} Não entraram: ${quais}.`);
      await carregar(false);
    } else {
      setFlash(lista.length === 1 ? 'Registrado.' : `${lista.length} dias marcados como posso.`);
      window.setTimeout(() => setFlash(f => (/marcados como posso|^Registrado\.$/.test(f) ? '' : f)), 2600);
      agendarRecarga();
    }
    setOcupado('');
  }

  const possoNoMes = (lista: string[]) => marcarPosso(lista, 'salvar o mês');
  const possoTodos = () => marcarPosso(dias.filter(d => !respostaDoDia(d)), 'salvar tudo');

  /* ------------------------------------------------------------ os estados
     Todos com a MESMA barra do topo. A tela antiga não tinha cabeçalho em
     estado nenhum, nem no "link inválido" — que é justamente quando a pessoa
     mais precisa de um caminho para algum lugar. */
  const Barra = ({ perfil = false, repertorio = false, ordem = false }: { perfil?: boolean; repertorio?: boolean; ordem?: boolean }) => (
    <div className="vol-barra" role="banner">
      <div className="vol-barra-in">
        <Link href="/" aria-label="GUIA Church"><Logo className="logo" /></Link>
        {perfil
          ? (
            <span className="vol-barra-links">
              {/* 100 · o repertório tem lugar na barra quando existe */}
              {repertorio && <a className="vol-quem" href="#repertorio">Repertório</a>}
              {/* 105 · e a ordem do culto, quando existe */}
              {ordem && <a className="vol-quem" href="#ordem">Ordem</a>}
              <a className="vol-quem" href="#meu-perfil">Meu perfil</a>
            </span>
          )
          : <Link className="vol-quem" href="/eu">Achar meu link</Link>}
      </div>
    </div>
  );

  if (fase === 'carregando') return (
    <div className="vol"><Barra />
      <div className="vol-in" role="main"><div className="vol-chamada">
        <span className="rot">Espaço do voluntário</span>
        <h1>Carregando</h1>
      </div></div>
    </div>
  );

  if (fase === 'rede') return (
    <div className="vol"><Barra />
      <div className="vol-in" role="main"><div className="vol-chamada">
        <span className="rot">Espaço do voluntário</span>
        <h1>Sem conexão agora</h1>
        <p className="vol-sub">Seu link continua valendo. Tente de novo quando o sinal voltar.</p>
        {/* a mesma largura (360) do botão único das outras faixas: eram
            320 aqui, 380 no link inválido e 360 no "Dizer quando eu posso" */}
        <div className="vol-btns" style={{ maxWidth: 360 }}>
          <button className="vol-bt" style={{ background: 'var(--noite)', color: '#fff', borderColor: 'var(--noite)' }}
            onClick={() => { setFase('carregando'); void carregar(); }}>Tentar de novo</button>
        </div>
      </div></div>
    </div>
  );

  if (fase === 'erro') return (
    <div className="vol"><Barra />
      <div className="vol-in" role="main"><div className="vol-chamada">
        <span className="rot">Espaço do voluntário</span>
        <h1>Esse link não vale</h1>
        <p className="vol-sub">
          Links pessoais são únicos e podem ter vindo cortados pelo WhatsApp.
          Dá para achar o seu de novo escolhendo seu nome na lista da sua área.
        </p>
        <div className="vol-btns" style={{ maxWidth: 360 }}>
          <Link href="/eu" className="vol-bt" style={{ background: 'var(--noite)', color: '#fff', borderColor: 'var(--noite)' }}>
            Achar meu link
          </Link>
        </div>
      </div></div>
    </div>
  );

  /* ------------------------------------------------------------- os fatos
     Calculados uma vez e usados na ordem em que a pessoa pergunta. */
  const hoje = hojeISO();
  /* o primeiro nome: "Olá, Giovana", e não o nome inteiro em caixa alta */
  const primeiro = (nome || '').trim().split(/\s+/)[0] || '';
  const agenda = itens.filter(i => !i.plantao);
  const plantoes = itens.filter(i => i.plantao);
  /* 75 · `i.data >= hoje` JUNTO, e é o que faltava.

     `eu_dados` devolve a partir de `current_date - 1` de propósito: na
     segunda de manhã a pessoa ainda precisa ver o domingo, para relatar e
     para entender o que aconteceu. Mas `pendentes` é o que enche o bloco
     preto do topo com o título "Precisa de você" e os botões "Eu vou" /
     "Não posso" — e um domingo que já passou não precisa mais dela.

     Medido: na segunda, quem não respondeu no domingo abre a tela e é
     cobrada por um culto que terminou ontem. */
  const pendentes = agenda.filter(i =>
    (i.status || 'pendente') === 'pendente' && i.data >= hoje);
  /* 107 · os postos de hoje de cada culto, para o "Cheguei" dizer onde */
  const postosHoje: Record<string, string[]> = {};
  for (const i of agenda) {
    if (i.data !== hoje || (i.status || 'pendente') === 'recusado') continue;
    (postosHoje[i.culto_id] ||= []).push(i.funcao);
  }
  /* 82 · quantos DIAS, não quantas linhas. Ver o título logo abaixo. */
  const diasPendentes = new Set(pendentes.map(i => i.data)).size;
  /* 02/10/2026 · um cartão por culto, com os postos dentro: a pergunta é
     "você vai no sábado?", e a resposta vale para os postos que esperam */
  const cartoesPend = (() => {
    const g: { culto_id: string; data: string; evento?: string | null; inicio?: string | null;
               obs: string | null; itens: Item[] }[] = [];
    for (const i of [...pendentes].sort((a, b) => a.data.localeCompare(b.data))) {
      const at = g.find(x => x.culto_id === i.culto_id);
      if (at) { at.itens.push(i); if (!at.obs && i.obs) at.obs = i.obs; continue; }
      g.push({ culto_id: i.culto_id, data: i.data, evento: i.evento, inicio: i.inicio, obs: i.obs || null, itens: [i] });
    }
    return g;
  })();
  const ordenada = [...agenda].sort((a, b) => a.data.localeCompare(b.data));
  /* só o que ainda vai acontecer. Sem este filtro, "sua próxima escala"
     mostrava um domingo que já passou, com "você está confirmado" embaixo. */
  const futuras = ordenada.filter(i => i.data >= hoje);
  const proxima = futuras.find(i => (i.status || 'pendente') !== 'recusado') || null;
  /* "depois disso" não repete o que já está no bloco preto lá em cima: a
     pessoa acabou de ver aquelas duas linhas e decidir sobre elas. */
  /* 100 · O REPERTÓRIO: o setlist de cada culto em que a pessoa serve, do
     mais próximo ao mais distante. Um por culto (quem está em dois postos no
     mesmo culto vê uma vez só), e nunca o do dia em que ela disse que não
     pode. Só link que passa por `linksDoRepertorio` vira botão. */
  const setlists = (() => {
    const vistos = new Set<string>();
    const out: { culto_id: string; data: string; evento?: string | null;
                 links: ReturnType<typeof linksDoRepertorio> }[] = [];
    for (const i of [...itens].sort((a, b) => a.data.localeCompare(b.data))) {
      if (i.data < hoje || vistos.has(i.culto_id)) continue;
      if (!i.plantao && (i.status || 'pendente') === 'recusado') continue;
      const links = linksDoRepertorio(i.repertorio as any);
      if (!links.length) continue;
      vistos.add(i.culto_id);
      out.push({ culto_id: i.culto_id, data: i.data, evento: i.evento, links });
    }
    return out;
  })();
  /* 105 · a ordem só dos cultos em que a pessoa ainda serve: quem acabou de
     tocar em "Não posso" deixa de ver a ordem daquele dia na hora, como deixa
     de ver o repertório */
  const ordensDosMeusCultos = ordens.filter(o => itens.some(i =>
    i.culto_id === o.culto_id && i.data >= hoje && (i.plantao || (i.status || 'pendente') !== 'recusado')));
  /* 02/10/2026 · O SETLIST LOGO ABAIXO DOS LINKS (sugestão do Louvor): a
     ordem do PRÓPRIO ministério, no culto que tem links, entra no bloco do
     repertório com tom, BPM e observações (components/escalas/SetlistNoLink).
     Se essa ordem é só música, ela já está inteira ali, e a seção "Ordem do
     culto" não a repete; com momentos (abertura, avisos, palavra), ela segue
     na seção, que é a linha do tempo do culto. */
  const setlistDoCulto = (cultoId: string) =>
    ordensDosMeusCultos.find(o => o.minha && o.culto_id === cultoId && musicasDaOrdem(o.ordem).length) || null;
  const cultosComLinks = new Set(setlists.map(r => r.culto_id));
  const ordensVisiveis = ordensDosMeusCultos.filter(o =>
    !(o.minha && cultosComLinks.has(o.culto_id) && o.ordem.every(it => it.t === 'musica')));
  const jaMostrados = new Set(pendentes.map(i => i.culto_id + i.funcao));
  /* 02/10/2026 · O CARTÃO DA PRÓXIMA ESCALA É DO CULTO, NÃO DO POSTO. Quem
     está em PROJEÇÃO e FILMAGEM no mesmo sábado via só PROJEÇÃO no cartão, e
     FILMAGEM do mesmo dia aparecia logo abaixo, em "Depois disso", como se
     fosse outro compromisso. O cartão só aparece quando o culto não está
     esperando resposta lá em cima (aí ele já está no cartão escuro). */
  const comPendencia = new Set(cartoesPend.map(g => g.culto_id));
  const mostraProxima = !!proxima && !comPendencia.has(proxima.culto_id);
  const proximaPostos = mostraProxima
    ? futuras.filter(i => i.culto_id === proxima!.culto_id && (i.status || 'pendente') !== 'recusado')
    : [];
  const restantes = futuras.filter(i =>
    !jaMostrados.has(i.culto_id + i.funcao) && !proximaPostos.includes(i));
  /* "Depois disso" também é por culto: uma linha por culto e situação, com os
     postos juntos (situação diferente no mesmo culto, como um posto recusado
     de propósito, fica em linha própria) */
  const gruposDepois = (() => {
    const g: { chave: string; culto_id: string; data: string; evento?: string | null;
               status: string; obs: string | null; itens: Item[] }[] = [];
    for (const i of restantes) {
      const st = i.status || 'pendente';
      const chave = `${i.culto_id}|${st}`;
      const at = g.find(x => x.chave === chave);
      if (at) { at.itens.push(i); if (!at.obs && i.obs) at.obs = i.obs; continue; }
      g.push({ chave, culto_id: i.culto_id, data: i.data, evento: i.evento, status: st, obs: i.obs || null, itens: [i] });
    }
    return g;
  })();
  /* ================================================================ 75 ===
     "QUEM SERVE COM VOCÊ" CONTAVA LINHA ACHANDO QUE CONTAVA GENTE.

     `eu_quem_serve` devolve UMA LINHA POR POSTO, e isso está certo: a lista
     quer mostrar quem faz o quê. A tela então escrevia `juntos.length - 1`
     como "mais N pessoas", e listava o mesmo nome uma vez por posto.

     Medido em 21/09, num banco nascido do repositório: um culto com UMA
     pessoa escalada em DOIS postos. A tela escreveu "Quem serve com você —
     mais 1 pessoa" e listou "Você" duas vezes. A pessoa está sozinha no dia
     e a tela diz que tem companhia; se for a primeira vez dela, ela chega
     procurando alguém que não existe.

     Agrupar por nome resolve os dois de uma vez: a contagem passa a ser de
     gente, e cada pessoa aparece uma vez com os postos dela juntos. O
     `status` mantido é o mais "aberto" dos postos — quem tem um posto
     pendente ainda está confirmando, mesmo já tendo confirmado o outro. */
  const gente = agruparQuemServe(juntos);

  const semResposta = dias.filter(d => !respostaDoDia(d));
  /* Alguém que acabou de entrar no time. Não é o mesmo que "não tem escala
     este mês", e as duas situações pedem frases diferentes.

     75 · O COMENTÁRIO DIZIA "nem no passado" E ISSO NÃO ERA VERDADE.
     `agenda` vem de `eu_dados`, que devolve `c.data >= current_date - 1`:
     escala de agosto não está aí. Quem serve desde março e está sem nada
     marcado para as próximas semanas — férias do time, mês sem escala —
     abria a tela e era recebida com "Bem-vindo".

     Quem sabe se a pessoa é nova é o vínculo, não a agenda: `escalado_em`
     nulo em tudo E nenhuma escalação passada. Como `eu_dados` não traz o
     passado, a pergunta possível aqui é outra e é mais simples: a pessoa é
     nova quando o VÍNCULO dela é recente. `eu_espaco` já traz `desde`. */
  const desde = (espaco?.voluntario?.desde as string | undefined)?.slice(0, 10);
  const diasDeCasa = desde ? diffDias(desde, hoje) : null;
  /* `diasDeCasa === null` cai FORA de `novo` de propósito, e não dentro.
     `espaco` chega numa segunda requisição, então nos primeiros milissegundos
     `desde` é indefinido. Errar para "Olá, Maria" numa pessoa nova é nada;
     errar para "Bem-vindo" em quem serve há um ano é o defeito. */
  const novo = agenda.length === 0 && plantoes.length === 0
            && diasDeCasa !== null && diasDeCasa <= 30;
  /* relatório só quando é posto de relato E o dia já passou: escrever o
     relatório do culto antes do culto não faz sentido, e mostrar dois campos
     de texto abertos em toda visita empurrava o resto da tela para baixo. */
  const paraRelatar = agenda.filter(i => i.relata && i.data <= hoje);
  /* 103 · as vagas que ainda são da pessoa, para a troca. `furou` não troca:
     é fato de quem estava lá. */
  const minhasVagas = new Set(agenda
    .filter(i => (i.status || 'pendente') !== 'furou' && !!i.funcao_id && i.data >= hoje)
    .map(i => `${i.culto_id}\u0000${i.funcao_id}`));
  const abrirTroca = (i: { culto_id: string; funcao_id?: string | null; funcao: string; data: string;
                           evento?: string | null; inicio?: string | null }) => {
    if (!i.funcao_id) return;
    setVagaTroca({ culto_id: i.culto_id, funcao_id: i.funcao_id, funcao: i.funcao, data: i.data,
                   evento: i.evento ?? null, inicio: i.inicio ?? null });
    /* o painel nasce no próximo desenho; tenta até ele existir */
    let n = 0;
    const tentar = () => { if (!rolarAte('pedir-troca', 800) && ++n < 20) window.setTimeout(tentar, 50); };
    window.requestAnimationFrame(tentar);
  };
  /* a mesma barra de baixo para as ações novas (ver o comentário do fim) */
  const avisar = (msg: string) => {
    setErro(''); setFlash(msg);
    window.setTimeout(() => setFlash(f => (f === msg ? '' : f)), 4200);
  };
  const errar = (msg: string) => { setFlash(''); setErro(msg); };
  /* 103 · a grade "Quando você pode" com os eventos do ministério dentro */
  const eventosDoDia = (d: string) => eventos.filter(e => e.data === d);
  const dePlantao = (d: string) => plantoes.some(p => p.data === d);
  const est = (i: Item) => {
    const s = i.status || 'pendente';
    return s === 'confirmado' ? { cls: 'ok', txt: 'confirmado' }
         : s === 'recusado' ? { cls: 'ruim', txt: 'você não pode' }
         : s === 'furou' ? { cls: 'ruim', txt: 'faltou' }
         : { cls: 'pend', txt: 'confirmar' };
  };

  /* "CONSULTAR ALTERAÇÕES" NÃO ERA UMA TELA FALTANDO: ERA UM DADO QUE NÃO
     EXISTIA. A escala do mês sai no dia 26; na sexta alguém fura e a liderança
     põe outra pessoa. Essa pessoa abria o link e via uma linha idêntica às que
     estavam lá desde o dia 26. Se já tinha olhado naquela semana, não olhava de
     novo; e se olhasse, não tinha como saber que aquilo era novo.

     A migração 38 passou a guardar quando cada pessoa entrou em cada vaga.
     Aqui isso vira uma palavra. Só até uma semana: depois disso não é mais
     novidade, é a escala. E nulo (as 92 linhas anteriores à migração) não
     mostra nada — não sei quando entrou não é a mesma coisa que é antigo. */
  const novidade = (i: Item) => {
    if (!i.escalado_em) return '';
    const dias = Math.floor((Date.now() - Date.parse(i.escalado_em)) / 86400000);
    if (dias > 7 || dias < 0) return '';
    return dias <= 0 ? 'entrou hoje' : dias === 1 ? 'entrou ontem' : `entrou há ${dias} dias`;
  };

  /* 18/09/2026. A liderança do Connect: "mulher não pode acessar banheiro
     masculino e nem sala dos pastores". O sistema passou a saber a regra
     (migração 48), e faltava o dado. A alternativa era a liderança abrir 21
     pessoas uma a uma; aqui a própria pessoa responde, em um toque, no link
     que ela já usa. Grava em todas as áreas dela: sexo é da pessoa, não do
     vínculo (migração 49). */
  async function dizerSexo(v: 'M' | 'F') {
    if (salvandoSexo) return;
    setSalvandoSexo(v); setErro('');
    const { data, error } = await sb()!.rpc('eu_sexo', { p_token: token, p_sexo: v });
    if (error || !(data as any)?.ok) {
      setErro(aviseHumano(error || new Error((data as any)?.erro || ''), 'salvar'));
      setSalvandoSexo(''); return;
    }
    /* recarrega a identidade: é ela que decide se o card continua na tela */
    const i = await quemSou(token).catch(() => null);
    if (i?.ok) setEu(i);
    setSalvandoSexo('');
  }

  return (
    <div className="vol">
      <Barra perfil repertorio={!!setlists.length} ordem={!!ordensVisiveis.length} />
      <div className="vol-in entra" role="main">

        {/* 1. O QUE PRECISO FAZER.
            Quando há confirmação pendente, ela toma a primeira dobra e o fundo
            vira tinta. Quando não há, a mesma faixa em papel diz o que vem. */}
        <div id="confirmar" className={`vol-chamada ${pendentes.length ? 'age' : ''}`}>
          {/* CHEGOU PELO LINK DO GRUPO (01/10/2026). A porta leva direto à
              página de quem já abriu o próprio link neste celular. Num celular
              da família, isso podia abrir a página de outra pessoa: de quem é
              a página vem antes de tudo, e a saída junto. O ministério vem da
              própria porta (?m=), para a linha nascer junto com o bloco e não
              empurrar os botões depois (auditoria 3). */}
          {!!viaPorta && !!nome && (
            <p style={{ margin: '0 0 12px', fontSize: 14, lineHeight: '21px', color: 'inherit', opacity: 0.86 }}>
              Página de {nome}.{' '}
              {!!(slugDaPorta || espaco?.equipe_slug) && (
                <a href={noPrincipal(`/equipe/${slugDaPorta || espaco?.equipe_slug}?ir=${viaPorta}`)}
                  onClick={() => esquecerVinculo(token)}
                  style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                  Não é você?
                </a>
              )}
            </p>
          )}
          <span className="rot">
            {/* "Boas-vindas", e não "Bem-vindo": a tela não sabe se fala com
                um homem ou com uma mulher (02/10/2026) */}
            {pendentes.length ? 'Precisa de você' : novo ? 'Boas-vindas' : `Olá, ${primeiro}`}
          </span>
          <h1>
            {pendentes.length
              /* 82 · CONTA DIAS, e não linhas. `agenda` tem uma linha por
                 POSTO: quem está em EDIÇÃO e PROJEÇÃO no mesmo domingo
                 gerava duas. Medido com o dado real de `eu_dados`:

                   linhas devolvidas ... 2 (2 postos, 1 domingo)
                   dias distintos ...... 1
                   a tela escrevia ..... "Confirme 2 dias"

                 A pessoa confirmava os dois cartões do mesmo domingo achando
                 que tinha respondido por dois compromissos — e quem tivesse
                 combinado outra coisa para "o outro dia" descobria errado. */
              ? (diasPendentes === 1 ? 'Confirme se você vai' : `Confirme ${diasPendentes} dias`)
              /* 02/10/2026 · "Tudo certo" só quando está: com a escala
                 confirmada e dias em branco na grade, o que falta fazer é o
                 título (a auditoria achou "Tudo certo por aqui" em cima de
                 "Faltam 8 dias para dizer quando você pode") */
              : proxima ? (semResposta.length ? 'Diga quando você pode' : 'Tudo certo por aqui')
              : novo ? `${primeiro}, você está no time`
              : 'Você não tem escala agora'}
          </h1>
          {/* 02/10/2026 · UMA FRASE SÓ. Eram duas ("Dois toques e a liderança
              já sabe com quem contar" e "Se não puder, avise: dá tempo de
              remanejar. Pode mudar de ideia até o dia") antes do primeiro
              botão. Fica a que tira o medo de dizer "não posso", que é a
              decisão difícil desta tela. Com a próxima escala no cartão logo
              abaixo, a frase "Sua próxima vez é..." repetia a data que o
              cartão mostra em tamanho grande: sai. */}
          {/* "TUDO CERTO" COM NOVE DIAS SEM RESPOSTA NÃO ESTÁ TUDO CERTO.
              Sem confirmação pendente, o bloco dizia "Tudo certo por aqui" e
              parava, com a grade "Quando você pode" inteira em branco três
              telas abaixo. É a resposta que a liderança usa para montar o mês
              seguinte: o bloco diz quantos dias faltam e leva até lá. */}
          {(pendentes.length || novo || !proxima || !!semResposta.length) && (
            <p className="vol-sub">
              {pendentes.length
                ? 'Se não puder, avise agora. Dá para mudar até o dia.'
                : novo ? 'É aqui que a sua escala aparece e que você avisa quando não pode.'
                : semResposta.length
                  /* com o título dizendo o que fazer, a frase só conta */
                  ? (proxima
                    ? `${cont(semResposta.length, 'dia', 'dias')} sem resposta.`
                    : `${pl(semResposta.length, 'Falta', 'Faltam')} ${cont(semResposta.length, 'dia', 'dias')} para dizer quando você pode.`)
                : 'Quando a escala do mês sair, ela aparece aqui.'}
            </p>
          )}

          {/* A PRIMEIRA VISITA NÃO PODE SER UM BECO.
              Quem acabou de ser aprovado caía numa tela que dizia "Você não
              tem escala agora" e parava ali. É o fim da jornada de entrada e
              soava como fim de linha, quando na verdade falta uma coisa e ela
              é justamente a que faz a escala existir: dizer quando dá.
              O botão só aparece quando há dias em aberto para responder. */}
          {!pendentes.length && !!semResposta.length && (
            <div className="vol-btns" style={{ marginTop: 22, maxWidth: 360 }}>
              <a className="vol-bt" href="#quando-posso"
                style={{ background: 'var(--noite)', color: '#fff', borderColor: 'var(--noite)' }}>
                Dizer quando eu posso
              </a>
            </div>
          )}

          {/* UM CARTÃO POR CULTO (02/10/2026). A data é o que decide a
              resposta, então ela vem primeiro e grande, com a hora; os postos
              vêm embaixo. Um toque responde os postos do cartão. */}
          {cartoesPend.map(g => {
            const hora = horaDoDia(g.inicio, g.evento, g.data, IGREJA.cultoHora, IGREJA.followHora);
            const quando = `${diaLongo(g.data, g.evento)}${hora ? `, ${hora}` : ''}`;
            const primeiras = g.itens.filter(i => i.primeira_vez).map(i => i.funcao);
            const novo1 = g.itens.map(novidade).find(Boolean);
            return (
              <div className="vol-pede" key={g.culto_id}>
                <div className="vol-pede-quando">{quando}</div>
                <div className="vol-pede-fn">
                  {g.itens.map(i => i.funcao).join(' · ')}
                  {novo1 && <span className="vol-novo">{novo1}</span>}
                </div>
                {/* O RECADO DO DIA CHEGA AQUI. A liderança escreve "chegar 18h,
                    tem batismo" para estas pessoas; ia só para o WhatsApp. */}
                {g.obs && <p className="vol-pede-obs">{g.obs}</p>}
                {!!primeiras.length && (
                  <p className="vol-pede-obs">
                    Primeira vez em {primeiras.join(' e ')}: chegue 30 minutos antes, alguém vai te receber.
                  </p>
                )}
                <div className="vol-btns">
                  <button className="vol-bt" disabled={ocupado === g.culto_id}
                    aria-label={`Eu vou, ${quando}`}
                    onClick={() => responderItens(g.itens, 'confirmado', g.culto_id)}>
                    <IcCheck /> Eu vou
                  </button>
                  <button className="vol-bt nao" disabled={ocupado === g.culto_id}
                    aria-label={`Não posso, ${quando}`}
                    onClick={() => responderItens(g.itens, 'recusado', g.culto_id)}>
                    Não posso
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* 107 · O DIA DO CULTO: "Cheguei" e, para quem lidera o dia, o time
            chegando. Logo abaixo do bloco escuro: no dia, é o que a pessoa veio
            fazer aqui, e o cartaz da porta abre a página neste ponto (#hoje). */}
        <HojeNoLink
          token={token} hoje={hojeLink} postos={postosHoje}
          cultoHora={IGREJA.cultoHora} followHora={IGREJA.followHora}
          aoMudar={async () => { await carregar(false); }}
          avisar={avisar} errar={errar} />

        {/* 106 · OS CONVITES PARA COBRIR. Logo abaixo do "Precisa de você":
            também pedem resposta, e o aviso no celular abre aqui (#chamadas). */}
        <ChamadasDoVoluntario
          token={token} chamadas={chamadas}
          cultoHora={IGREJA.cultoHora} followHora={IGREJA.followHora}
          aoMudar={async () => { await carregar(false); }}
          avisar={avisar} errar={errar} />

        {/* 109 · O DIRIGENTE DA SEMANA. Também pede uma coisa com prazo (três
            dias antes do culto): a Palavra e os avisos. */}
        <CronogramaNoLink token={token} cultos={cronos} hoje={hojeISO()} />

        {/* 103 · A TROCA. Logo abaixo do "Precisa de você", porque pedido de
            colega também pede resposta, e a porta do grupo abre a página aqui
            em cima (#confirmar). Só existe com a migração 103 no banco. */}
        {trocasOk && (
          <TrocaDoVoluntario
            token={token} trocas={trocas}
            vaga={vagaTroca} abrirVaga={abrirTroca} fecharVaga={() => setVagaTroca(null)}
            ofertas={ofertas.filter(o => minhasVagas.has(`${o.culto_id}\u0000${o.funcao_id}`))}
            minhasVagas={minhasVagas}
            slug={slugDaPorta || espaco?.equipe_slug || null}
            responsavel={espaco?.responsavel || null}
            cultoHora={IGREJA.cultoHora} followHora={IGREJA.followHora}
            aoMudar={async () => { await carregar(false); }}
            avisar={avisar} errar={errar} />
        )}

        {/* A PERGUNTA QUE SÓ APARECE PARA QUEM ELA MUDA ALGUMA COISA.
            Alguns postos só aceitam homem ou só mulher — não por preferência,
            por acesso: quem confere o banheiro masculino tem que poder entrar
            nele. Enquanto a pessoa não responde, o sorteio não a considera
            para esses postos, e a vaga fica vazia. Duas condições para este
            card existir: a área tem posto assim E ela está habilitada nele. */}
        {faltaDizerSexo(eu) && (
          <section className="vol-secao" id="sou">
            <div className="vol-secao-cab"><span className="rot">Falta uma coisa</span></div>
            <p className="vol-sub" style={{ marginTop: 0 }}>
              {vinculoDeste(eu)?.equipe
                ? `${vinculoDeste(eu)!.equipe} tem posto que só aceita homem ou só mulher, porque depende de poder entrar no lugar (banheiro, gabinete).`
                : 'Sua área tem posto que só aceita homem ou só mulher, porque depende de poder entrar no lugar.'}
              {' '}Sem isso a escala não te coloca nesses dias.
            </p>
            <div className="linha" style={{ marginTop: 14 }}>
              <button className="vol-bt sim" disabled={!!salvandoSexo} onClick={() => dizerSexo('M')}>
                {salvandoSexo === 'M' ? 'salvando…' : 'Sou homem'}
              </button>
              <button className="vol-bt sim" disabled={!!salvandoSexo} onClick={() => dizerSexo('F')}>
                {salvandoSexo === 'F' ? 'salvando…' : 'Sou mulher'}
              </button>
            </div>
          </section>
        )}

        {/* quem ajuda a fechar o buraco que a pessoa abriu em cima da hora */}
        {Object.entries(cobrem).map(([cid, lista]) => !!lista.length && (
          <section className="vol-secao" key={cid}>
            <div className="vol-secao-cab">
              <span className="rot">Quem pode te cobrir</span>
              <span className="vol-secao-nota">Você avisou em cima da hora</span>
            </div>
            <p className="vol-nota" style={{ marginTop: 14 }}>
              A vaga ficou aberta. Chamar alguém você mesmo resolve mais rápido
              que esperar a liderança descobrir.
            </p>
            {lista.map(c => {
              const tel = (c.telefone || '').replace(/\D/g, '');
              const zap = tel ? `https://wa.me/${tel.length <= 11 ? '55' + tel : tel}` : null;
              return (
                <div className="vol-linha" key={c.nome}>
                  <span className="vol-marca" aria-hidden="true" />
                  <span>
                    <span className="vol-linha-dia">{c.nome}</span>
                    <span className="vol-linha-fn">{c.disse_que_pode ? 'disse que pode nesse dia' : c.nivel}</span>
                  </span>
                  {zap && <a className="vol-linha-est" href={zap} target="_blank" rel="noreferrer" style={{ color: 'var(--noite)' }}>Chamar</a>}
                </div>
              );
            })}
          </section>
        ))}

        {/* 107 · COMO FOI. Depois do culto (e por sete dias), uma pergunta de
            um toque. Abaixo do que pede resposta para hoje, acima da agenda. */}
        <ComoFoiNoLink
          token={token} lista={comoFoi} equipe={equipe} artigo={espaco?.artigo}
          cultoHora={IGREJA.cultoHora} followHora={IGREJA.followHora}
          aoMudar={async () => { await carregar(false); }}
          avisar={avisar} errar={errar} />

        {/* 2. QUANDO EU SIRVO. A data é o assunto, então é ela que fica grande. */}
        {/* só quando a próxima NÃO é uma das que estão pendentes lá em cima:
            repetir o item que a pessoa está olhando, com um "confirme logo
            acima", é dizer duas vezes a mesma coisa e empurrar o resto para
            baixo. Se a próxima já está no bloco preto, a pergunta "quando eu
            sirvo" já foi respondida. */}
        {proxima && mostraProxima && (
          <section className="vol-secao">
            <div className="vol-secao-cab"><span className="rot">Sua próxima escala</span></div>
            {/* 16/09/2026: O INGRESSO. A data é o assunto, então ela é o
                maior elemento da tela, como num ingresso: o dia em número, o
                mês, o que você faz, a hora, com quem. E o botão que faltava:
                "Adicionar ao calendário", um .ics montado no aparelho, com o
                endereço e o link pessoal dentro, e um lembrete na véspera. */}
            <div className="vol-prox ingresso">
              <div className="ingresso-data" aria-hidden="true">
                <span className="ingresso-dia">{proxima.data.slice(8, 10)}</span>
                <span className="ingresso-mes">{distintivoDoDia(proxima.data, proxima.evento)}</span>
              </div>
              <div className="ingresso-corpo">
                <div className="vol-prox-fn">{proximaPostos.map(i => i.funcao).join(' · ') || proxima.funcao}</div>
                <div className="vol-prox-dia">
                  {diaLongo(proxima.data, proxima.evento)}{(() => {
                    const h = horaDoDia(proxima.inicio, proxima.evento, proxima.data, IGREJA.cultoHora, IGREJA.followHora);
                    return h ? `, ${h}` : '';
                  })()}
                </div>
                <div className="vol-prox-est">
                  {/* "Presença confirmada", e não "Você está confirmado": a
                      tela não sabe o gênero de quem lê (02/10/2026) */}
                  {est(proxima).txt === 'confirmar' ? 'Falta você confirmar, logo acima.'
                    : est(proxima).txt === 'confirmado' ? 'Presença confirmada.' : ''}
                  {novidade(proxima) ? ` Você ${novidade(proxima)} nessa escala.` : ''}
                  {/* 82 · a frase passa por `agruparQuemServe`, como a seção
                      de baixo já fazia desde a 75. Antes ela contava LINHAS
                      (`juntos`), e `eu_quem_serve` devolve uma por posto.
                      Medido com o dado real:

                        sozinha em 2 postos ..... a tela escrevia " Com ."
                        3 pessoas em 5 postos ... " Com Caio, Caio, Ana e mais 1."
                                                   (são 2 companheiros)

                      No cartão mais nobre da tela, para alguém que ela mesma
                      manda "procurar qualquer um desses nomes quando chegar". */}
                  {(() => {
                    const outros = agruparQuemServe(juntos).filter(j => !j.eu);
                    if (!outros.length) return '';
                    const nomes = outros.slice(0, 3).map(j => j.nome.split(' ')[0]).join(', ');
                    const resto = outros.length - 3;
                    return ` Com ${nomes}${resto > 0 ? ` e mais ${resto}` : ''}.`;
                  })()}
                </div>
                {proxima.obs && <p className="vol-pede-obs claro">{proxima.obs}</p>}
                <div className="ingresso-acoes">
                  <a className="ingresso-cal" download={`guia-${proxima.data}.ics`}
                     href={icsDaEscala({ data: proxima.data, funcao: proxima.funcao, equipe: equipe || 'GUIA', token,
                       /* 71 · a hora do EVENTO quando é evento. O lembrete de um
                          evento das 19:30 estava saindo com a hora do culto de
                          domingo, 10h. */
                       hora: proxima.evento ? (proxima.inicio ?? null)
                           : ehSabado(proxima.data) ? (IGREJA.followHora ?? null) : IGREJA.cultoHora,
                       obs: proxima.obs })}>
                    <IcCalendario /> Adicionar ao calendário
                  </a>
                  {/* 71 · MUDAR DE IDEIA NO DIA QUE MAIS IMPORTA.

                      "Não vou mais poder" existia só na lista "Depois disso", e
                      `restantes` exclui `proxima` de propósito — então o
                      domingo MAIS PRÓXIMO, depois de confirmado, era o único
                      que não tinha como ser desmarcado. O caminho que sobrava
                      era a grade "Quando você pode", que até a migração 71 não
                      mexia na escalação: o banco ficava com `confirmado` e
                      `indisponível` ao mesmo tempo, e a líder tinha uma pessoa
                      confirmada que não vinha.

                      O comentário da lista de baixo já dizia por que o botão
                      existe: "Plano muda; o sistema tem que deixar." */}
                  {est(proxima).txt !== 'confirmar' && (
                    <button type="button" className="ingresso-cal" disabled={ocupado === proxima.culto_id}
                      onClick={() => responderItens(proximaPostos.filter(i => i.status !== 'furou'), 'recusado', proxima.culto_id)}>
                      Não vou mais poder
                    </button>
                  )}
                  {/* 103 · pedir a um colega que fique com a vaga: ela continua
                      sua até alguém aceitar. A troca é por posto: com dois
                      postos no dia, um botão para cada, com o nome. */}
                  {trocasOk && proximaPostos.filter(i => !!i.funcao_id && i.status !== 'furou').map(i => (
                    <button type="button" className="ingresso-cal" key={'tr' + i.funcao_id} onClick={() => abrirTroca(i)}>
                      {proximaPostos.length > 1 ? `Pedir troca: ${i.funcao}` : 'Pedir troca'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 100 · O REPERTÓRIO. Pedido do Louvor: quem entra para confirmar já
            acha aqui o setlist do dia, nas três plataformas (quem não usa
            Spotify nem Deezer tem a playlist do YouTube). */}
        {!!setlists.length && (
          <section className="vol-secao" id="repertorio">
            <div className="vol-secao-cab">
              <span className="rot">Repertório</span>
              <span className="vol-secao-nota">
                {setlists.length === 1 ? '1 culto' : `${setlists.length} cultos`}
              </span>
            </div>
            {setlists.map(r => (
              <div className="vol-rep" key={r.culto_id}>
                <div className="vol-rep-dia">{diaLongo(r.data, r.evento)}</div>
                <div className="vol-btns">
                  {r.links.map(l => (
                    <a key={l.chave} className="vol-bt vol-bt-rep" href={l.url}
                      target="_blank" rel="noopener noreferrer"
                      aria-label={`Ouvir o repertório no ${l.nome}`}>
                      {l.nome}
                    </a>
                  ))}
                </div>
                {/* 02/10/2026 · tom, BPM e observações logo abaixo dos links */}
                <SetlistNoLink ordem={setlistDoCulto(r.culto_id)?.ordem || []} />
              </div>
            ))}
          </section>
        )}

        {/* 105 · A ORDEM DO CULTO: as músicas com tom, BPM e cifra, e os
            momentos com a hora de cada um, de todo ministério que publicou
            a ordem do culto em que a pessoa serve. */}
        <OrdemNoLink ordens={ordensVisiveis} />

        {/* 3. COM QUEM EU SIRVO — fase 7.

            Esta tela era um calendário. Dizia muito bem QUANDO a pessoa serve,
            O QUE ela faz e COMO avisar que não pode; sobre QUEM, dizia uma
            coisa só — o nome do líder. Numa igreja cuja home afirma que "a
            igreja não é o prédio, é a quantidade de gente que decidiu chegar
            mais cedo", a página de quem chega mais cedo não tinha gente.

            E fechava uma promessa solta: na primeira vez numa função a tela diz
            "alguém vai te receber", sem nunca dizer quem. Para quem está com
            medo, "alguém" é pior que ninguém — aqui os nomes aparecem.

            Nome e função, sem telefone: a pessoa não precisa ligar para
            ninguém, precisa saber com quem vai trabalhar. */}
        <Instalar token={token} />
        {/* 104 · ligar o aviso no celular (só aparece com as chaves no Vercel) */}
        {trocasOk && <AvisoNoCelular token={token} avisar={avisar} errar={errar} />}

        {gente.length > 1 && (
          <section className="vol-secao">
            <div className="vol-secao-cab">
              <span className="rot">Quem serve com você</span>
              <span className="vol-secao-nota">
                {gente.length - 1 === 1 ? 'mais 1 pessoa' : `mais ${gente.length - 1} pessoas`}
              </span>
            </div>
            {/* SEM CLASSE DE ESTADO NESTAS LINHAS. A primeira versão marcava
                "Você" com a classe `ok`, que pinta a marca de verde — e verde
                neste sistema quer dizer CONFIRMADO, não "este é você". Cor é
                estado; usar cor de estado como enfeite de identidade é
                exatamente o que a direção visual proíbe. Quem é você já está
                dito pela palavra "Você" e pelo primeiro lugar na lista. */}
            {gente.map(j => (
              <div className="vol-linha" key={j.nome}>
                <span className="vol-marca" aria-hidden="true" />
                <span>
                  <span className="vol-linha-dia">{j.eu ? 'Você' : j.nome}</span>
                  <span className="vol-linha-fn">{j.funcoes.join(' · ')}</span>
                </span>
                {/* quem ainda não respondeu não é problema DESTA pessoa: o
                    estado aparece sem cobrança, e só quando não é ela. */}
                {!j.eu && j.status === 'pendente' && (
                  <span className="vol-linha-est">ainda confirmando</span>
                )}
              </div>
            ))}
            <p className="vol-nota">
              Se for sua primeira vez, procure qualquer um desses nomes quando chegar.
            </p>
          </section>
        )}

        {!!gruposDepois.length && (
          <section className="vol-secao">
            <div className="vol-secao-cab">
              <span className="rot">Depois disso</span>
              {/* conta DIAS: eram as linhas (postos) que viravam "dias" */}
              {(() => {
                const n = new Set(gruposDepois.map(g => g.data)).size;
                return <span className="vol-secao-nota">{n} {n === 1 ? 'dia' : 'dias'}</span>;
              })()}
            </div>
            {gruposDepois.map(g => {
              const e = est(g.itens[0]);
              const novo1 = g.itens.map(novidade).find(Boolean);
              const comId = g.itens.filter(i => !!i.funcao_id);
              return (
                <div className={`vol-linha ${e.cls}`} key={g.chave}>
                  <span className="vol-marca" aria-hidden="true" />
                  <span>
                    <span className="vol-linha-dia">
                      {diaLongo(g.data, g.evento)}
                      {novo1 && <span className="vol-novo">{novo1}</span>}
                    </span>
                    <span className="vol-linha-fn">{g.itens.map(i => i.funcao).join(' · ')}</span>
                    {g.obs && <span className="vol-linha-obs">{g.obs}</span>}
                  </span>
                  <span className="vol-linha-est">{e.txt}</span>
                  {/* MUDAR DE IDEIA. Quem tinha respondido "não posso" ficava
                      preso: a linha dizia VOCÊ NÃO PODE e não oferecia nada.
                      Plano muda; o sistema tem que deixar. A resposta vale
                      para os postos da linha (o culto, nessa situação).

                      AS AÇÕES NA LARGURA TODA (02/10/2026). Moravam na coluna
                      do texto, que a 390px tem 226px (a da direita guarda 7rem
                      para o estado): "Não vou mais poder" e "Pedir troca"
                      nunca cabiam lado a lado, e "Consegui, posso sim"
                      quebrava em duas linhas centradas a 320px. */}
                  {g.status !== 'furou' && (
                    <span className="vol-linha-acoes">
                      <button className="vol-acao" disabled={ocupado === g.culto_id}
                        onClick={() => responderItens(g.itens, g.status === 'recusado' ? 'confirmado' : 'recusado', g.culto_id)}>
                        {g.status === 'recusado' ? 'Consegui, posso sim' : 'Não vou mais poder'}
                      </button>
                      {/* 103 · a troca, também para quem já disse que não pode;
                          é por posto, então com dois postos vai o nome */}
                      {trocasOk && comId.map(i => (
                        <button className="vol-acao" key={'tr' + i.funcao_id} onClick={() => abrirTroca(i)}>
                          {comId.length > 1 ? `Pedir troca: ${i.funcao}` : 'Pedir troca'}
                        </button>
                      ))}
                    </span>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {!!plantoes.filter(p => p.data >= hoje).length && (
          <section className="vol-secao">
            <div className="vol-secao-cab"><span className="rot">Você é o plantão</span></div>
            <p className="vol-nota" style={{ marginTop: 14 }}>
              {/* 78 · `p.evento` faltava aqui. `salvar_dia` grava plantão em culto de
                  evento também (54, 61, 66), e `eu_dados` traz `evento` no ramo do
                  plantão desde a 71 — só este chamador tinha ficado para trás, e
                  anunciava o plantão de uma quarta como "domingo". */}
              {plantoes.filter(p => p.data >= hoje).map(p => diaLongo(p.data, p.evento)).join(', ')}. Não precisa confirmar
              nada: você só entra se alguém faltar. Deixe o celular por perto.
            </p>
          </section>
        )}

        {/* 3. QUANDO EU POSSO. Eram dez linhas com dois botões cada, depois de
            três mil pixels. Agora é grade, e o que falta responder vem no topo. */}
        {/* 82 · a grade não some calada: se a leitura falhou, a tela diz isso
            em vez de parecer que não há domingos. */}
        {!domingos.length && domingosFalhou && (
          <section className="vol-bloco">
            <div className="vol-bloco-topo"><span className="rot">Quando você pode</span></div>
            <p className="dim" style={{ margin: '8px 0 12px' }}>
              Não consegui carregar os próximos domingos agora. Sua escala acima está certa;
              é só esta parte que não veio.
            </p>
            <button className="sec" onClick={() => carregar(false)}>Tentar de novo</button>
          </section>
        )}
        {!!dias.length && (
          <section className="vol-secao" id="quando-posso">
            <div className="vol-secao-cab">
              <span className="rot">Quando você pode</span>
              {/* 02/10/2026 · a contagem sobe para o cabeçalho e a frase de
                  baixo sai ("É isso que garante seu lugar na escala"): cada
                  dia que falta tem a própria marca na lista */}
              <span className="vol-secao-nota">
                {semResposta.length ? `${pl(semResposta.length, 'falta', 'faltam')} ${cont(semResposta.length, 'dia', 'dias')}` : 'tudo respondido'}
              </span>
            </div>
            {/* 103 · a agenda do ministério entra na grade */}
            {!!eventos.length && (
              <p className="vol-nota" style={{ marginTop: 14 }}>Os eventos da sua área aparecem no dia deles.</p>
            )}
            {/* "Posso em todos" só quando há mais de um mês esperando: com um
                mês só, ele faz o mesmo que o "Posso no mês" ao lado do mês, e
                dois botões para a mesma coisa é um botão a mais para ler. */}
            {porMes.filter(g => g.dias.some(d => !respostaDoDia(d))).length > 1 && (
              <div className="vol-tudo">
                <button type="button" className="vol-mes-todos" disabled={!!ocupado} onClick={() => possoTodos()}>
                  Posso em todos os {semResposta.length} dias
                </button>
              </div>
            )}
            {/* POR MÊS, E NÃO NUMA GRADE CORRIDA. 07/09/2026.
                Eram quinze datas em duas colunas sem separação nenhuma. Com o
                mês por cima, a troca de padrão (sábado de Follow que não
                existe numa semana) tem explicação, e cada mês ganha a própria
                ação em massa: é como as pessoas pensam disponibilidade, por
                viagem, por período, por mês. */}
            {porMes.map(g => {
              const faltamNoMes = g.dias.filter(d => !respostaDoDia(d));
              return (
                <div className="vol-mes" key={g.chave}>
                  <div className="vol-mes-cab">
                    <span className="vol-mes-nome">{g.rot}</span>
                    {faltamNoMes.length > 1
                      ? (
                        <button type="button" className="vol-mes-todos" disabled={!!ocupado}
                          onClick={() => possoNoMes(faltamNoMes)}>Posso no mês</button>
                      )
                      /* mês respondido fica quieto: "tudo respondido" no
                         cabeçalho da seção e em cada mês era a mesma notícia
                         três vezes (auditoria de 02/10) */
                      : faltamNoMes.length ? <span className="vol-mes-nota">falta 1</span> : null}
                  </div>
                  <div className="vol-disp">
                    {g.dias.map(d => {
                      const r = respostaDoDia(d);
                      const esc = escalaDoDia(d);
                      /* no celular estreito a data quebra em duas linhas: o
                         espaço depois do "·" não quebra, então ela quebra
                         como "sáb 03" / "· Follow", e não "sáb 03 ·" / "Follow" */
                      const rot = rotuloDoDia(d, eventosDoDia(d), diaNoMes(d)).replace(' · ', ' ·\u00a0');
                      const preso = ocupado === d || ocupado === 'todos';
                      return (
                        <div className={`vol-dia${r ? '' : ' falta'}`} key={d}>
                          <span className="vol-dia-nome">
                            <span className="vol-dia-rot">{rot}</span>
                            {/* 103 · os dias da pessoa na agenda; 02/10/2026:
                                com os postos, numa linha quieta embaixo (a
                                etiqueta em caixa quebrava a linha do sábado) */}
                            {/* a linha dos postos ocupa a largura toda, embaixo
                                da data e das respostas (ver globals.css); se
                                ainda assim quebrar, o "·" desce junto com o
                                posto seguinte, como na data */}
                            {esc.length
                              ? <span className="vol-dia-sub">{['na escala', ...new Set(esc.map(i => i.funcao))].join(' · ')}</span>
                              : dePlantao(d) ? <span className="vol-dia-sub">plantão</span> : null}
                          </span>
                          {/* 02/10/2026 · as duas respostas coladas, como uma
                              escolha só; marcada, ganha a cor (verde posso,
                              vermelho não posso) */}
                          <span className="vol-seg" role="group" aria-label={`${rot}: você pode?`}>
                            <button type="button" className={`vol-seg-bt sim${r === 'posso' ? ' on' : ''}`}
                              disabled={preso} aria-pressed={r === 'posso'}
                              onClick={() => dizerDia(d, 'posso')}>Posso</button>
                            <button type="button" className={`vol-seg-bt nao${r === 'nao' ? ' on' : ''}`}
                              disabled={preso} aria-pressed={r === 'nao'}
                              onClick={() => dizerDia(d, 'nao')}>Não posso</button>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* o relatório do dia, só para quem relata e só depois do culto */}
        {paraRelatar.map(i => (
          <section className="vol-secao" key={'rel' + i.culto_id}>
            <div className="vol-secao-cab">
              <span className="rot">Relatório de {diaCurto(i.data)}</span>
              <span className="vol-secao-nota">Você foi líder do dia</span>
            </div>
            <Relatorio item={i} token={token} aoSalvar={() => void carregar(false)} />
          </section>
        ))}

        {/* 4. COM QUEM EU SIRVO. Reference, então vem depois da ação.
            Campo sem valor não vira "A definir": some. Rótulo com buraco do
            lado é o sistema dizendo que não sabe, no lugar mais nobre. */}
        <section className="vol-secao" id="meu-perfil">
          <div className="vol-secao-cab"><span className="rot">Você na GUIA</span></div>
          <div className="vol-eq">
            {!!equipe && (
              <div className="vol-eq-linha">
                <span className="vol-eq-rot">Área</span>
                <span className="vol-eq-val">{equipe}</span>
              </div>
            )}
            {/* SEPARADOR ' · ', NÃO ', '. 06/09/2026.
                Nome de função pode ter vírgula dentro: o Connect tem
                "GABINETE, COZINHA E BANHEIROS". Com vírgula separando a lista,
                a tela da Eliete mostrava

                  RECEPÇÃO 1, GABINETE, COZINHA E BANHEIROS, SETOR A, SETOR B,
                  VISITANTES 1

                que qualquer um lê como SEIS funções. São cinco. Quem contou
                errado foi a liderança, olhando essa tela — e a conta importa,
                porque é por ela que se decide quem falta em que posto.
                O resto do sistema já separava com ' · '. */}
            {!!espaco?.funcoes?.length && (
              <div className="vol-eq-linha">
                <span className="vol-eq-rot">Você faz</span>
                {/* 103 · a função que a própria pessoa acrescentou espera a
                    liderança conferir, e a tela diz isso */}
                <span className="vol-eq-val">
                  {espaco.funcoes.map((f: any) => f.funcao + (f.conferido === false ? ' (a conferir)' : '')).join(' · ')}
                </span>
              </div>
            )}
            {!!espaco?.responsavel && (
              <div className="vol-eq-linha">
                <span className="vol-eq-rot">Seu líder</span>
                <span className="vol-eq-val">{espaco.responsavel}</span>
              </div>
            )}
            {!!nome && (
              <div className="vol-eq-linha">
                <span className="vol-eq-rot">Seu nome</span>
                <span className="vol-eq-val">{nome}</span>
              </div>
            )}
          </div>

          {/* 103 · acrescentar função pelo próprio link, que entra a conferir */}
          {trocasOk && (
            <FuncoesDoVoluntario token={token} responsavel={espaco?.responsavel || null}
              aoMudar={lerEspaco} avisar={avisar} errar={errar} />
          )}

          {espaco?.whatsapp && (
            <a className="vol-zap" target="_blank" rel="noreferrer"
              href={`https://wa.me/${espaco.whatsapp.length <= 11 ? '55' + espaco.whatsapp : espaco.whatsapp}` +
                    `?text=${encodeURIComponent(`Oi! Sou ${nome}, sirvo ${espaco.artigo === 'a' ? 'na' : 'no'} ${equipe}.`)}`}>
              Falar com {espaco.responsavel || 'a liderança'} <IcSeta />
            </a>
          )}

          {/* uma pessoa, não um cadastro por área */}
          {(outrasAreas(eu).length > 0 || organiza(eu)) && (
            <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--linha2)' }}>
              {outrasAreas(eu).length > 0 && (
                <p className="vol-nota" style={{ marginTop: 0 }}>
                  Você também serve em {outrasAreas(eu).map(v => v.equipe).join(', ')}.
                  É o mesmo cadastro.
                </p>
              )}
              {organiza(eu) && (
                <p className="vol-nota">
                  {eu?.admin ? 'Você organiza a igreja toda.' : `Você organiza ${eu?.organiza?.map(o => o.equipe).join(', ')}.`}{' '}
                  <Link href="/painel" style={{ color: 'var(--noite)' }}>Ir para o painel</Link>
                </p>
              )}
            </div>
          )}

          {espaco?.equipe_slug && (
            <div style={{ marginTop: 20 }}>
              <Link className="vol-quem" href={`/equipe/${espaco.equipe_slug}`}>Ver quem serve com você</Link>
            </div>
          )}
        </section>

        {/* 5. MANUTENÇÃO, no rodapé, que é onde manutenção mora.
            `tem_pin` sai de `eu_espaco` e chega DEPOIS da tela; enquanto não
            chegou, `espaco` é nulo e o rótulo não pode chutar — por isso passa
            null, e não false. */}
        <div className="vol-pe">
          <TrocarPin token={token} temPin={espaco ? !!espaco.tem_pin : null} />
        </div>

      </div>

      {/* A FALHA APARECE ONDE O SUCESSO APARECE — 20/09/2026.

          Auditoria de tela. O erro era renderizado aqui embaixo, DEPOIS de
          todas as seções: próxima escala, quem serve com você, quando você
          pode, perfil, rodapé. Dois a três mil pixels abaixo do botão que a
          pessoa acabou de tocar. E o sucesso sempre apareceu em barra FIXA.

          A assimetria ensina a coisa errada: "não apareceu nada, então deu
          certo". A voluntária toca "Eu vou" no 4G ruim, a gravação falha, o
          botão volta ao normal, nada muda na tela onde ela está olhando — e
          o líder vê "sem responder" no domingo.

          Agora os dois usam a mesma barra, e a cor diz qual é qual. */}
      {!!(flash || erro) && (
        <div className={`vol-flash${erro ? ' vol-flash-ruim' : ''}`} role="status">
          {erro || flash}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Trocar o PIN daqui de dentro.

   Quem abriu esta página está com o link pessoal na mão, e o link é a
   credencial mais forte do sistema — mais forte que o PIN, que existe
   justamente para quem NÃO guardou o link. Então não faz sentido pedir o PIN
   antigo: quem esqueceu ficava dependendo do organizador reenviar o link, que
   é o gargalo que o PIN foi criado para eliminar.
   Fica fechado por padrão: é manutenção, não é o assunto da página.

   "TROCAR" NÃO DESCREVE O QUE QUEM AINDA NÃO TEM PIN VAI FAZER.
   Dez das 65 pessoas do sistema estão sem PIN nenhum, e este era o único lugar
   onde elas poderiam criar um — atrás de um botão que fala de trocar uma coisa
   que elas não possuem. Quem acabou de ser cadastrada lê "Trocar meu PIN",
   entende que não é para ela, e segue sem PIN até o dia em que perde o link.
   `tem_pin` vem de `eu_espaco` (supabase/26-meu-espaco.sql) e é o que desfaz
   isso. Chega depois da primeira pintura: até chegar, `temPin` é null, que
   quer dizer NÃO SEI, e aí o rótulo continua sendo o antigo — prometer "criar"
   a quem já tem PIN é trocar um erro por outro.
--------------------------------------------------------------------------- */
function TrocarPin({ token, temPin }: { token: string; temPin: boolean | null }) {
  const criar = temPin === false;
  const [aberto, setAberto] = useState(false);
  const [pin, setPin] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [feito, setFeito] = useState(false);
  const [erro, setErro] = useState('');

  async function salvar() {
    if (salvando || pin.length !== 4) return;
    setSalvando(true); setErro('');
    const { data, error } = await sb()!.rpc('eu_trocar_pin', { p_token: token, p_pin: pin });
    const res = data as any;
    setSalvando(false);
    if (error) { setErro('Sem conexão agora. Tente de novo.'); return; }
    if (!res?.ok) {
      setErro(res?.erro === 'PIN_INVALIDO' ? 'O PIN precisa ter 4 números.'
        : 'Não consegui trocar agora. Avise quem organiza a escala.');
      return;
    }
    setPin(''); setFeito(true);
  }

  const rotulo = criar ? 'Criar meu PIN' : 'Trocar meu PIN';

  if (!aberto) return (
    <p className="dim pequeno" style={{ margin: '28px 0 0', textAlign: 'center' }}>
      <button className="btn fantasma" onClick={() => setAberto(true)}>{rotulo}</button>
    </p>
  );

  return (
    <>
      <h3 aria-level={2} style={{ marginTop: 30 }}>{rotulo}</h3>
      <p className="dim pequeno" style={{ marginTop: -6, marginBottom: 12 }}>
        O PIN é o que te deixa entrar pela lista da equipe quando você está sem este link.
        {criar
          ? ' Você ainda não tem um. Escolha 4 números que você lembre.'
          : ' Esqueceu? Escolha um novo aqui, não precisa saber o antigo.'}
      </p>
      {feito ? (
        <Aviso tom="bom">
          {criar ? 'PIN criado.' : 'PIN trocado.'} É esse que você usa da próxima vez que entrar pela lista.
        </Aviso>
      ) : (
        <div className="escalacao">
          <label htmlFor="pin-novo">{criar ? 'Seu PIN de 4 números' : 'Novo PIN de 4 números'}</label>
          <input id="pin-novo" enterKeyHint="done" value={pin} inputMode="numeric" className="campo-pin" placeholder="••••"
            disabled={salvando}
            onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setErro(''); }} />
          <p className="dim pequeno" style={{ margin: '8px 0 0' }}>
            Não use os 4 últimos números do seu telefone: o pessoal do grupo enxerga o seu número.
          </p>
          {!!erro && <Aviso tom="atencao">{erro}</Aviso>}
          <button className="pri" style={{ marginTop: 14, width: '100%' }}
            disabled={salvando || pin.length !== 4} onClick={salvar}>
            {salvando ? 'salvando…' : criar ? 'Salvar meu PIN' : 'Salvar PIN novo'}
          </button>
          <button className="btn fantasma" style={{ margin: '10px auto 0', display: 'flex' }}
            disabled={salvando} onClick={() => { setAberto(false); setPin(''); setErro(''); }}>
            cancelar
          </button>
        </div>
      )}
    </>
  );
}

