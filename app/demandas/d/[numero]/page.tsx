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
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Casca, { recadoParaDepois, useEu } from '@/components/demandas/Casca';
import { Aviso, Bloco, CaixaDeAcao, Cabecalho, Campo, Copiar, Esqueleto, Estado, Opcoes, Pill, Prio, RascunhoDaCaixa, Secao, TextoComLinks, useEstreito } from '@/components/demandas/Ui';
import { Icone, type NomeDoIcone } from '@/components/demandas/Icone';
import { confirmar } from '@/components/demandas/Confirmar';
import { bases, mover, ver } from '@/lib/demandas/api';
import {
  HOJE, PRIORIDADES, TRAVAS, acoesDe, dataCheia, dataCurta, dataHora, diaNoRio, diasDeAtraso,
  dinheiro, iniciais, linkZap, pedidoPara, primariaDe, quando, quemManda, recado, recadoDoErro,
  rotTrava, situacao, tetoDe, type Acao,
  fraseDoEvento, dicaDeAnexo, nomeDoLink, nomeSemRepetir, nomesDosSites, recadoDeSiteNoCampo, siteDoLink, siteRecusado, umGestoUmaLinha,
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
/* as recusas que querem dizer "a ficha que você vê ficou velha" */
const CONFLITO = ['JA_TEM_DONO', 'JA_VALIDADA', 'JA_FECHADA', 'NAO_ESTA_TRAVADA', 'NAO_ESTA_PENDENTE',
                  'NAO_ESTA_FECHADA', 'NAO_ESTA_CONCLUIDA', 'FALTA_APROVACAO', 'NAO_PARTICIPA'];
/* os gestos cuja recusa aparece no próprio bloco, e não no alto da ficha */
const NO_PROPRIO_BLOCO: (Acao | '')[] = ['comentar', 'incluir', 'tirar'];

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
  /* a recusa que não muda com outra tentativa (a demanda não existe, ou não
     é de quem olha): sem "Tentar de novo", e a saída vira o gesto principal */
  const [semVolta, setSemVolta] = useState(false);
  /* a ação aberta (o formulário), ou 'mais' (a folha de ajustes do celular) */
  const [aberto, setAberto] = useState<Acao | 'mais' | ''>('');
  const [indo, setIndo] = useState(false);
  /* A RECUSA APARECE ONDE FOI O GESTO — 24/09/2026 (auditoria R11). O aviso
     vermelho morava só no alto da ficha: o comentário recusado dava o aviso
     1012px acima da tela em 390, e o botão voltava ao normal sem nada mudar
     à vista. Comentar e quem acompanha mostram a recusa no próprio bloco; os
     gestos de um toque (assumir, confirmar) levam a tela até o aviso. */
  const [erroDe, setErroDe] = useState<Acao | ''>('');
  /* celular ou desktop, para o formulário da ação abrir na folha ou no painel */
  const celular = useEstreito(1023);

  const aplicar = useCallback((r: Awaited<ReturnType<typeof ver>>) => {
    if (!r.ok) {
      setErro(recadoDoErro(r, 'abrir a demanda'));
      setSemVolta(r.erro === 'NAO_EXISTE' || r.erro === 'SEM_ACESSO');
      setV(null); return;
    }
    setErro(''); setSemVolta(false);
    setV({
      demanda: r.demanda, eu: r.eu, eventos: r.eventos, anexos: r.anexos,
      /* 94 · quem acompanha. Esta montagem campo a campo JOGAVA FORA o que não
         estivesse listado aqui. */
      participantes: r.participantes,
      eventos_total: (r as Partial<{ eventos_total: number }>).eventos_total,
    });
  }, []);
  const carregar = useCallback(async () => { aplicar(await ver(numero)); }, [numero, aplicar]);

  useEffect(() => { if (Number.isFinite(numero)) carregar(); }, [numero, carregar]);
  useEffect(() => { bases().then(x => { if (x.ok) setB({ setores: x.setores, categorias: x.categorias, anexos: x.anexos }); }); }, []);

  /* DEVOLVE SE DEU CERTO, E ISSO É O QUE SEGURA O TEXTO DA PESSOA: o ramo de
     erro devolve `false`, e a caixa não apaga o que foi escrito. */
  async function agir(acao: Acao, dados: Record<string, unknown> = {}): Promise<boolean> {
    setIndo(true); setErro(''); setErroDe('');
    const r = await mover(numero, acao, dados);
    setIndo(false);
    if (!r.ok) {
      /* A RECUSA POR CONFLITO RECARREGA A FICHA ANTES DE FALAR — 24/09/2026
         (auditoria R12). "Outra pessoa assumiu esta demanda primeiro" aparecia
         em cima de "ninguém assumiu" e do botão preto "Assumir e começar": a
         ficha era a de antes do conflito. Recarregar limpa o erro (ver
         `aplicar`), então a frase entra depois. */
      const frase = recadoDoErro(r, 'salvar');
      if (r.erro && CONFLITO.includes(r.erro)) await carregar();
      setErro(frase); setErroDe(acao);
      if (acao === 'assumir' || acao === 'validar' || acao === 'desanexar') {
        requestAnimationFrame(() => document.querySelector('.dm-aviso.dm-bad')
          ?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
      }
      return false;
    }
    setAberto('');
    /* MANDAR PARA OUTRO SETOR TIRA A DEMANDA DE QUEM MANDOU — 23/09/2026.
       Quem atende deixa de vê-la (`pode_ver`), e a ficha recarregava,
       recebia "não existe" e trocava a tela pela vermelha de erro: um acerto
       aparecendo como falha. Agora o recado diz para onde ela foi, e quem
       deixou de vê-la volta para a própria fila. */
    if (acao === 'redirecionar') {
      const depois = await ver(numero);
      const nome = (b?.setores || []).find(s => s.id === dados.setor)?.nome;
      const recado = { texto: `Demanda #${numero} foi para ${nome || 'o outro setor'}.` };
      if (!depois.ok) {
        /* a casca desta tela morre na troca: o recado vai guardado */
        recadoParaDepois(recado);
        const atende = !!ctx.eu && (ctx.eu.atende ?? ctx.eu.papel !== 'solicitante');
        router.push(atende ? '/demandas/atendimento' : '/demandas');
        return true;
      }
      ctx.toast?.(recado);
      aplicar(depois);
      return true;
    }
    await carregar();
    if (acao === 'assumir') ctx.toast?.({ texto: `Demanda #${numero} é sua. Ela está em execução.` });
    /* o "obrigado" é de quem pediu; a gestão só lê que ficou confirmado */
    if (acao === 'validar') ctx.toast?.({ texto: (v?.eu.pede ?? v?.eu.abriu) ? 'Confirmado. Obrigado por dizer.' : 'Confirmado pela gestão.' });
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

  /* UM GESTO, UMA LINHA: os fatos que o banco grava para um gesto só
     ("assumir" grava o status e o responsável; "recusar", a aprovação e o
     cancelamento) viram a linha do gesto. A regra mora em `regras.ts`, a
     mesma dos Avisos. */
  const linhas = useMemo(() => umGestoUmaLinha(eventos), [eventos]);

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

  /* O TEXTO DE CADA AÇÃO FICA GUARDADO ENQUANTO A FICHA ESTÁ ABERTA —
     24/09/2026 (auditoria R10). Um rascunho por ação: fechar e abrir de novo
     devolve o que a pessoa escreveu. E com texto escrito, Escape e o toque
     fora da folha não fecham (a regra das Escalas): tocar fora para baixar
     o teclado era o gesto que apagava o parágrafo. O "Voltar" continua
     fechando, e o rascunho continua lá. */
  const rascunhos = useRef(new Map<string, string>());
  const chaveDo = (campo?: string) => (campo ? `${aberto}:${campo}` : aberto);
  const guarda = useMemo(() => ({
    ler: (campo?: string) => rascunhos.current.get(chaveDo(campo)) || '',
    gravar: (t: string, campo?: string) => {
      if (t.trim()) rascunhos.current.set(chaveDo(campo), t); else rascunhos.current.delete(chaveDo(campo));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [aberto]);
  /* qualquer campo escrito do formulário aberto segura o Escape */
  const segurar = useCallback(() => !!aberto && aberto !== 'mais'
    && [...rascunhos.current.keys()].some(k => k === aberto || k.startsWith(`${aberto}:`)), [aberto]);

  /* e Escape fecha, porque o único jeito de desistir era achar o "Deixa pra
     lá" lá embaixo. Na folha do celular quem fecha é o <dialog>. */
  useEffect(() => {
    if (!aberto) return;
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape' && !segurar()) setAberto(''); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [aberto, segurar]);

  if (erro && !v) {
    /* a saída é a de quem olha: quem atende volta para o Atendimento */
    const atende = !!ctx.eu && (ctx.eu.atende ?? ctx.eu.papel !== 'solicitante');
    const saida = atende ? { href: '/demandas/atendimento', rot: 'Atendimento' } : { href: '/demandas', rot: 'Início' };
    return (
      <>
        <Cabecalho volta={saida} sobre={`Demanda #${Number.isFinite(numero) ? numero : ''}`}
          titulo="Não deu para abrir a demanda" />
        {/* a demanda que não existe (ou não é de quem olha) não é falha do
            sistema: aviso cinza; a falha de rede continua vermelha */}
        <Aviso tom={semVolta ? undefined : 'bad'}>{erro}</Aviso>
        <div className="dm-linha">
          {semVolta ? null : <button type="button" className="dm-btn dm-pri" onClick={carregar}>Tentar de novo</button>}
          <Link className={semVolta ? 'dm-btn dm-pri' : 'dm-btn'} href={saida.href}>Voltar para {saida.rot === 'Início' ? 'o Início' : 'o Atendimento'}</Link>
        </div>
        <span className="dm-sem-barra" hidden />
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
  /* o link colado no texto vira link pela mesma porta do anexo */
  const linkavel = (u: string) => !!siteDoLink(u) && !siteRecusado(u, b?.anexos);

  /* o que contradiz a ficha não vira botão: "Assumir e começar" quando a
     demanda já está com a pessoa (o servidor aceita, como troca de dono, mas
     aqui é ruído), e "Travar" numa demanda já travada (re-travar existe para
     trocar o motivo; o caminho é destravar e travar de novo) */
  /* quem pediu está olhando: é dele confirmar, e é ele quem responde a trava */
  const quemPediuOlha = !!(v.eu.pede ?? v.eu.abriu);
  /* CONFIRMAR O PRÓPRIO TRABALHO NÃO É CONFIRMAÇÃO — 24/09/2026 (auditoria
     R11). O servidor deixa a gestão confirmar no lugar de quem pediu (o PDF:
     "o setor solicitante ou responsável pela gestão valida"), e a gestora
     que executou a demanda via "Resolveu, obrigado" como o passo dela: um
     toque e quem pediu perdia a vez. Quem executou e não pediu não confirma. */
  const contradiz = (a: Acao) =>
    (a === 'assumir' && !!d.responsavel_id && d.responsavel_id === v.eu.id)
    || (a === 'travar' && d.status === 'travada')
    || (a === 'validar' && !quemPediuOlha && !!d.responsavel_id && d.responsavel_id === v.eu.id);
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
     recados sozinhos moram num bloco em linha no celular (uma barra fixa só
     com "Mais" era 56px de rodapé para esconder dois botões-texto).

     "REABRIR" SOZINHO NÃO ANDA COM A DEMANDA — 24/09/2026. Na encerrada
     (concluída e já confirmada, a concluída vista pela equipe, a cancelada)
     a única ação que sobrava era reabrir: o celular ganhava uma barra fixa
     só com "Mais", 288px de botão genérico no lugar das abas, e o painel do
     desktop dizia "Próximo passo · Concluída em 23/09 · Reabrir", como se
     reabrir fosse o que vem. Reabrir é a exceção: mora no cartão "Esta
     demanda", junto dos ajustes, e as abas voltam. Com "Resolveu, obrigado"
     ao lado (quem pediu decidindo), continua na barra: ali é a escolha. */
  const soReabrir = !primaria && secundarias.length > 0 && secundarias.every(a => a === 'reabrir');
  const temBarra = !!primaria || (secundarias.length > 0 && !soReabrir);
  const soAjustes = !temBarra && (ajustes.length > 0 || podeAvisar || soReabrir);

  const rotulo = (a: Acao) => {
    switch (a) {
      case 'aprovar':      return 'Aprovar';
      case 'rejeitar':     return 'Recusar';
      case 'assumir':      return 'Assumir e começar';
      case 'concluir':     return 'Concluir';
      case 'travar':       return 'Travar';
      case 'destravar':    return (v.eu.pede ?? v.eu.abriu) && d.travada_por === 'informacao' ? 'Responder e destravar' : 'Destravar';
      case 'reabrir':      return 'Reabrir';
      /* o "obrigado" é de quem pediu; a gestão confirma no lugar dele */
      /* e a líder, que responde pelo ministério sem ter aberto, confirma sem
         o "obrigado" na boca de quem não pediu */
      case 'validar':      return v.eu.abriu ? 'Resolveu, obrigado' : quemPediuOlha ? 'Confirmar que resolveu' : 'Confirmar pela gestão';
      case 'prazo':        return 'Mudar o prazo';
      case 'prioridade':   return 'Rever a prioridade';
      case 'redirecionar': return 'Mandar para outro setor';
      case 'anexar':       return 'Juntar um anexo';
      case 'cancelar':     return 'Cancelar';
      default:             return a;
    }
  };
  /* o ícone de cada ajuste: o botão-texto da coluna se lê pela palavra, e o
     ícone deixa a lista varrível de relance */
  const iconeDe = (a: Acao): NomeDoIcone | null => {
    switch (a) {
      case 'prazo':        return 'calendario';
      /* a seta de prioridade, e não o triângulo de alerta (que é o do
         aviso da trava, na mesma tela) */
      case 'prioridade':   return 'alta';
      case 'redirecionar': return 'setores';
      case 'anexar':       return 'anexos';
      case 'cancelar':     return 'fechar';
      default:             return null;
    }
  };
  /* assumir e validar gravam direto; as outras abrem o formulário */
  const tocar = (a: Acao) => (a === 'assumir' || a === 'validar' ? agir(a) : setAberto(a));
  /* a gestão confirmando no lugar de quem pediu pergunta antes: é uma vez
     só, e quem pediu perde a vez */
  const tocarPerguntando = async (a: Acao) => {
    if (a === 'validar' && !quemPediuOlha) {
      const nome = d.abriu ? d.abriu.split(' ')[0] : 'quem pediu';
      const sim = await confirmar({
        titulo: `Confirmar no lugar de ${nome}?`,
        texto: `A confirmação é de quem pediu. Depois desta, ${nome} não confirma mais.`,
        acao: 'Confirmar',
      });
      if (!sim) return;
    }
    tocar(a);
  };
  const botao = (a: Acao, classe: string) => {
    const ic = classe.includes('dm-txt') ? iconeDe(a) : null;
    return (
      <button key={a} type="button" className={classe} disabled={indo} onClick={() => tocarPerguntando(a)}>
        {ic ? <Icone nome={ic} /> : null}{rotulo(a)}
      </button>
    );
  };
  /* O PAINEL DIZ O QUE VEM, SEM PONTO FINAL — 23/09/2026. Era "Esperando
     Pedro responder." ao lado de "Com você, em 3 dias", e "Concluída em
     23/09" debaixo do rótulo "Próximo passo" quando o passo era de quem pediu
     confirmar. Frase de estado curta, sem ponto, e o passo quando há passo. */
  const estadoDoPainel =
    d.status === 'concluida'
      ? (primaria === 'validar'
           ? (quemPediuOlha ? 'Confirme se resolveu' : `Esperando ${d.abriu ? d.abriu.split(' ')[0] : 'quem pediu'} confirmar`)
         : `Concluída em ${dataCheia(d.concluida_em)}`)
    : d.status === 'cancelada' ? (d.aprovacao === 'rejeitada' ? 'Recusada pela gestão' : 'Cancelada')
    : d.falta_aprovacao ? ((v.eu.aprova ?? quemManda(v.eu.papel)) ? 'A decisão é sua' : 'Parada até a gestão aprovar')
    /* a trava dita do lado de quem olha, e não a frase do aviso de cima de
       novo (eram três "Esperando informação de quem pediu" na mesma tela) */
    : d.status === 'travada' ? (
        d.travada_por === 'informacao'
          ? ((v.eu.pede ?? v.eu.abriu) ? 'A equipe espera uma resposta sua'
             : `Esperando ${d.abriu ? d.abriu.split(' ')[0] : 'quem pediu'} responder`)
          : rotTrava(d.travada_por))
    /* "Com Maria, vence em 3 dias", e não "Com Maria, em 3 dias" (em três
       dias ela o quê?) */
    : d.responsavel_id && d.responsavel_id === v.eu.id ? `Com você${d.prazo ? `, ${vence(prazoEmPalavras(d.prazo, sit, atraso))}` : ''}`
    : d.responsavel ? `Com ${d.responsavel.split(' ')[0]}${d.prazo ? `, ${vence(prazoEmPalavras(d.prazo, sit, atraso))}` : ''}`
    : d.status === 'aberta' ? 'Ninguém assumiu ainda'
    : '';

  /* "PRÓXIMO PASSO" SÓ QUANDO O PASSO É DE QUEM OLHA. Com a demanda na mão
     de outra pessoa ("Com Pedro, em 3 dias"), os botões de quem administra
     são poderes (travar, concluir por ela), e não o passo dele: o título é
     "Ações". O mesmo vale para quem atende uma demanda travada esperando
     quem pediu ("Esperando Pedro responder"): o passo é do Pedro, e a
     resposta dele já destrava; "Destravar" ali é a exceção. Confirmar,
     decidir a aprovação e responder a trava continuam sendo o passo de quem
     olha. */
  const esperaQuemPediu = d.status === 'travada' && d.travada_por === 'informacao';
  /* e confirmar é o passo de quem pediu: para a gestão é um poder */
  const passoDeOutro = (primaria === 'validar' && !quemPediuOlha) || (primaria !== 'validar'
    && !(d.falta_aprovacao && (v.eu.aprova ?? quemManda(v.eu.papel)))
    && !(esperaQuemPediu && quemPediuOlha)
    && ((esperaQuemPediu && !quemPediuOlha) || (!!d.responsavel_id && d.responsavel_id !== v.eu.id)));
  const tituloDoPainel = !temBarra ? 'Esta demanda' : passoDeOutro ? 'Ações' : 'Próximo passo';
  /* e o botão cheio é de quem tem o passo: concluir a demanda de outra
     pessoa é um poder raro, e não o convite da tela */
  const cheio = passoDeOutro ? 'dm-btn' : 'dm-btn dm-pri';
  /* O "NÃO" DA DECISÃO AO LADO DO "SIM" — 24/09/2026 (auditoria R11). No
     celular a barra era "Mais | Aprovar", e Recusar morava na folha, junto
     dos ajustes, enquanto o aviso dizia "aprovar ou recusar nesta página".
     Quando o passo de quem olha é uma decisão (aprovar ou recusar; confirmar
     ou reabrir), a barra mostra as duas, e o resto desce para o cartão
     "Esta demanda" em linha. */
  const par: Acao | null = passoDeOutro ? null
    : primaria === 'aprovar' && secundarias.includes('rejeitar') ? 'rejeitar'
    : primaria === 'validar' && secundarias.includes('reabrir') ? 'reabrir' : null;
  const maisNaBarra = temMais && !par;
  const outrasNoCartao = soReabrir ? secundarias : par ? secundarias.filter(a => a !== par) : [];
  const cartaoEmLinha = soAjustes || (!!par && (outrasNoCartao.length > 0 || ajustes.length > 0 || podeAvisar));

  /* ---------------------------------------- o painel de ação (desktop) e a folha */
  const painel = aberto && aberto !== 'mais' ? (
    <div className="dm-painel-bloco dm-painel-form" ref={cxForm}>
      <div className="dm-folha-topo">
        <h3>{rotulo(aberto)}</h3>
        <button type="button" className="dm-btn dm-txt dm-peq" onClick={() => setAberto('')}>Voltar</button>
      </div>
      {erro ? <Aviso tom="bad">{erro}</Aviso> : null}
      <RascunhoDaCaixa.Provider value={guarda}>
        <Formulario key={aberto} aberto={aberto} d={d} b={b} eu={v.eu} indo={indo} agir={agir} anexos={v.anexos} />
      </RascunhoDaCaixa.Provider>
    </div>
  ) : (
    <>
      <div className="dm-painel-bloco">
        <h3 className="dm-painel-titulo">{tituloDoPainel}</h3>
        {estadoDoPainel ? <div className="dm-painel-estado">{estadoDoPainel}</div> : null}
        {!temAcao ? (
          <p className="dm-peq dm-mudo">
            {d.status === 'concluida' || d.status === 'cancelada'
              ? 'Já encerrada. Se precisar, escreva aqui embaixo.'
              : d.falta_aprovacao
                /* o "parada até a gestão aprovar" já é a frase de cima */
                ? 'Se precisar, escreva aqui embaixo.'
                : 'Quem toca é o setor responsável. Se precisar, escreva aqui embaixo.'}
          </p>
        ) : null}
        <div className="dm-painel-acoes">
          {primaria ? botao(primaria, `${cheio} dm-larga`) : null}
          {secundarias.map(a => botao(a, a === 'rejeitar' ? 'dm-btn dm-perigo dm-larga' : 'dm-btn dm-larga'))}
        </div>
      </div>
      {ajustes.length ? (
        <div className="dm-painel-bloco">
          <h3 className="dm-painel-titulo">Ajustes</h3>
          <div className="dm-painel-ajustes">
            {ajustes.map(a => botao(a, a === 'cancelar' ? 'dm-btn dm-txt dm-perigo' : 'dm-btn dm-txt'))}
          </div>
        </div>
      ) : null}
      {podeAvisar ? <div className="dm-painel-bloco"><Recados d={d} base={base} eu={v.eu} /></div> : null}
    </>
  );

  const pares = d.evento || d.local || d.publico || d.orcamento !== null || !!aprovacaoEmPalavras(d);

  /* a trava que ainda vale: a pergunta dela já está no aviso amarelo do
     alto, e a atividade não a repete (a linha diz "Maria travou a demanda") */
  const ultimaTrava = d.status === 'travada'
    ? linhas.map(e => e.tipo === 'status' && e.para === 'travada').lastIndexOf(true) : -1;
  /* quem olha é "Você" na atividade, como na faixa de fatos */
  const meuNome = ctx.eu?.nome || null;

  return (
    <>
      {/* 94 · A SAÍDA VOLTA PARA O PORTAL DE QUEM OLHA: quem atende, para a
          fila; quem pede, para as suas. */}
      <Cabecalho
        /* "Atendimento", o nome da seção na lateral e no alto da fila */
        volta={v.eu.atende ? { href: '/demandas/atendimento', rot: 'Atendimento' } : { href: '/demandas', rot: 'Início' }}
        /* `dm-sep`: com uma categoria longa, a linha quebrava deixando
           "Demanda #105 ·" sozinho em cima */
        sobre={<span className="dm-sep"><span className="dm-sep-in"><span className="dm-num">Demanda #{d.numero}</span><span>{d.categoria}</span></span></span>}
        titulo={d.titulo}
        meta={<>
          <Estado d={d} />
          <Prio p={d.prioridade} />
          {sit === 'atrasada' ? <Pill tom="bad">{atraso} {atraso === 1 ? 'dia' : 'dias'} de atraso</Pill> : null}
          {sit === 'parada' ? <Pill tom="warn">parada há {d.parada_dias} dias</Pill> : null}
          {/* a pílula de estado já diz "Reaberta"; quantas vezes é um fato */}
          {d.reaberturas > 0 ? <span>{d.reaberturas === 1 ? 'reaberta uma vez' : `reaberta ${d.reaberturas} vezes`}</span> : null}
        </>} />

      {erro && !aberto && !NO_PROPRIO_BLOCO.includes(erroDe) ? <Aviso tom="bad">{erro}</Aviso> : null}

      {/* ---------------------------------------------------- o que acontece

          O portão fala primeiro, em qualquer status, e diz de quem é a vez. */}
      {/* OS AVISOS TÊM UMA FORMA SÓ: o nome do estado em negrito (o mesmo
          da pílula, sem ponto) e, embaixo, o que ele quer dizer para quem
          olha. Eram "Esperando aprovação." ao lado da pílula "Aguardando
          aprovação", e a frase colada no nome. */}
      {d.falta_aprovacao ? (
        <Aviso tom="warn">
          <b>Aguardando aprovação</b>
          {/* O PORQUÊ DA APROVAÇÃO, ONDE QUEM DECIDE LÊ — 24/09/2026 (auditoria
              R12). Quem trava por aprovação escreve o motivo ("trilha
              licenciada, R$ 300"), e o banco escreve os dele ("passa do
              teto…"); a atividade esconde a nota porque ela estaria aqui, e
              aqui só havia a frase genérica. Com nota, a nota; sem ela, a
              frase. */}
          <div className="dm-aviso-mais">
            {d.travada_nota
              ? d.travada_nota
              : d.aprovacao === 'pendente'
                ? 'A gestão precisa decidir antes de esta demanda andar.'
                : 'A categoria desta demanda passou a exigir aprovação. Ela fica parada até a gestão decidir.'}
            {(v.eu.aprova ?? quemManda(v.eu.papel))
              ? <> Você pode aprovar ou recusar nesta página.</>
              : <> Quem decide é a gestão. Não há o que fazer aqui enquanto isso.</>}
          </div>
        </Aviso>
      ) : null}
      {d.status === 'travada' && !d.falta_aprovacao ? (() => {
        const respondeAqui = d.travada_por === 'informacao' && (v.eu.pede ?? v.eu.abriu) && acoes.includes('destravar');
        return (
          <Aviso tom="warn">
            <b>{rotTrava(d.travada_por)}</b>
            {d.travada_nota || respondeAqui ? (
              <div className="dm-aviso-mais">
                {d.travada_nota}
                {/* o gesto pelo nome do botão, e não "aqui embaixo": no
                    desktop o que fica embaixo é o comentário, que não destrava */}
                {respondeAqui ? <>{d.travada_nota ? ' ' : ''}Responda em “Responder e destravar” e a demanda volta a andar.</> : null}
              </div>
            ) : null}
          </Aviso>
        );
      })() : null}
      {d.status === 'concluida' ? (
        <Aviso tom="ok">
          {/* o carimbo numa linha, o que foi feito na outra, e o motivo do
              atraso com o seu rótulo (era um parêntese no meio da frase) */}
          {/* a hora relativa é peça própria, e não quebra ao meio ("há 15 /
              min" em 390) */}
          <span className="dm-sep">
            <span className="dm-sep-in">
              <b>Concluída em {dataHora(d.concluida_em)}</b>
              {quando(d.concluida_em) && quando(d.concluida_em) !== dataCheia(d.concluida_em)
                ? <span className="dm-quando">{quando(d.concluida_em)}</span> : null}
            </span>
          </span>
          {d.conclusao ? <div className="dm-aviso-mais">{d.conclusao}</div> : null}
          {d.atraso_motivo ? <div className="dm-aviso-mais"><b>Motivo do atraso:</b> {d.atraso_motivo}</div> : null}
          {/* A ETAPA 5 DO PDF: quem pediu confirma que resolveu. O botão é o
              primário do painel; confirmada, vira a frase, que é o registro
              pedido. */}
          {d.validada_em ? (
            <div className="dm-aviso-mais">
              {/* "confirmada", a palavra das outras telas (a do PDF é "validada") */}
              Confirmada{d.validada_por ? ` por ${d.validada_por}` : ''} em {dataCheia(d.validada_em)}.
            </div>
          ) : null}
        </Aviso>
      ) : null}
      {d.status === 'cancelada' ? (
        /* cinza, como a pílula: cancelada é "não vai andar", e não erro */
        <Aviso>
          {/* a recusa da gestão cancela a demanda; o aviso diz qual das duas
              foi, e o motivo sai sem o "Aprovação recusada:" que o banco põe */}
          <b>{d.aprovacao === 'rejeitada' ? 'Cancelada: a gestão recusou a aprovação' : 'Cancelada'}</b>
          {d.cancelada_motivo ? (
            <div className="dm-aviso-mais">
              {d.aprovacao === 'rejeitada' ? d.cancelada_motivo.replace(/^Aprova[çc][ãa]o recusada:\s*/i, '') : d.cancelada_motivo}
            </div>
          ) : null}
        </Aviso>
      ) : null}

      {/* ------------------------------------------ os quatro fatos que decidem */}
      <div className="dm-fatos">
        <div className="dm-fato">
          <span>Quem pediu</span>
          {/* a mesma regra das duas células: quem olha é "Você" */}
          <div>{v.eu.abriu ? 'Você' : d.abriu}<small>{d.solicitante}</small></div>
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
          <div className={sit === 'atrasada' ? 'dm-bad' : undefined}>
            {d.prazo ? dataCheia(d.prazo) : 'sem data'}
            <small>
              {d.prazo ? prazoEmPalavras(d.prazo, sit, atraso, d.status === 'concluida' ? d.concluida_em : null)
                : (d.sem_prazo_porque || 'sem justificativa')}
              {pedidoPara(d.prazo, prazoPedido)}
            </small>
          </div>
        </div>
        <div className="dm-fato">
          <span>Aberta em</span>
          <div>{dataHora(d.criada_em)}<small>{haQuanto(d.criada_em)}</small></div>
        </div>
      </div>

      <div className="dm-duas dm-ficha">
        <div>
          {/* ------------------------------------------------------- o pedido */}
          <Secao titulo="O que foi pedido">
            <div className="dm-caixa">
              <div className="dm-caixa-corpo">
                <p className="dm-texto-livre"><TextoComLinks texto={d.descricao} podeLinkar={linkavel} /></p>
                {d.objetivo ? <p className="dm-peq dm-mudo dm-depois-do-texto">Objetivo: {d.objetivo}</p> : null}
                {d.impacto ? <p className="dm-peq dm-depois-do-texto"><b>Impacto:</b> {d.impacto}</p> : null}
                {pares ? (
                  <div className="dm-pares">
                    {/* "Culto de celebração, em 12/10/2026": frase, e não dois
                        pedaços com um ponto que ficava sozinho no fim da linha */}
                    {d.evento ? <div><span>Evento</span>{d.evento}{d.evento_data ? `, em ${dataCheia(d.evento_data)}` : ''}</div> : null}
                    {d.local ? <div><span>Onde</span>{d.local}</div> : null}
                    {d.publico ? <div><span>Público</span>{d.publico}</div> : null}
                    {d.orcamento !== null ? <div><span>Orçamento</span><span className="dm-num">{dinheiro(d.orcamento)}</span></div> : null}
                    {/* o valor do banco ("pendente", "rejeitada") não é
                        frase: a tela diz o que ele quer dizer, com o verbo
                        do botão ("Recusar"), e o portão manda no "esperando" */}
                    {aprovacaoEmPalavras(d)
                      ? <div><span>Aprovação</span>{aprovacaoEmPalavras(d)}{d.aprovacao_nota ? `: ${d.aprovacao_nota}` : ''}</div>
                      : null}
                  </div>
                ) : null}
              </div>
            </div>
          </Secao>

          {v.anexos.length ? (
            <Secao titulo="Anexos" n={v.anexos.length}
              acoes={acoes.includes('anexar') ? (
                <button type="button" className="dm-btn dm-txt dm-peq" disabled={indo} onClick={() => setAberto('anexar')}>
                  <Icone nome="anexos" />Juntar um anexo
                </button>
              ) : null}>
              {/* O anexo é um LINK para a conta de alguém: o único jeito de a
                  pessoa saber para onde vai é antes de clicar (o rótulo traz
                  o site), e a ficha diz QUEM colou, quando, e se chegou
                  depois de a demanda fechar. Quem pode tirar quem diz é o
                  servidor, anexo por anexo (`posso_tirar`, migração 89). */}
              <ul className="dm-anexos dm-tabela">
                {v.anexos.map((a, i) => (
                  <li key={a.id || i}>
                    <Icone nome="link" />
                    <a className="dm-anexo-link" href={a.url} target="_blank" rel="noopener noreferrer">{a.nome}</a>
                    <span className="dm-anexo-de">
                      {a.quem ? `${a.quem} · ` : ''}{dataCurta(a.em)}
                      {a.depois_de_fechar ? <b> · juntado depois de concluída</b> : null}
                    </span>
                    {a.posso_tirar ? (
                      <button type="button" className="dm-btn dm-txt dm-peq" disabled={indo}
                        onClick={() => agir('desanexar', { anexo_id: a.id })}>Tirar</button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Secao>
          ) : null}

          <Acompanham v={v} indo={indo} agir={agir} sair={() => router.push('/demandas')}
            erro={erroDe === 'incluir' || erroDe === 'tirar' ? erro : ''} />

          {/* no celular, quando não há ação que ande com a demanda, os ajustes
              e os recados ficam num bloco em linha (o mesmo conteúdo do painel
              do desktop), e não numa barra fixa só com "Mais". Antes da
              Atividade: o painel é o contexto de agora, a atividade é o
              registro, e a caixa de escrever continua sendo a última coisa. */}
          {cartaoEmLinha ? (
            <div className="dm-painel dm-painel-linha dm-so-celular" role="group" aria-label="Esta demanda">
              <div className="dm-painel-bloco">
                <h3 className="dm-painel-titulo">Esta demanda</h3>
                {/* com a decisão na barra, o estado já está no aviso de cima */}
                {estadoDoPainel && !par ? <div className="dm-painel-estado">{estadoDoPainel}</div> : null}
                {outrasNoCartao.length ? (
                  <div className="dm-painel-acoes">
                    {outrasNoCartao.map(a => botao(a, 'dm-btn dm-larga'))}
                  </div>
                ) : null}
                {ajustes.length ? (
                  <div className="dm-painel-ajustes">
                    {ajustes.map(a => botao(a, a === 'cancelar' ? 'dm-btn dm-txt dm-perigo' : 'dm-btn dm-txt'))}
                  </div>
                ) : null}
              </div>
              {podeAvisar ? <div className="dm-painel-bloco"><Recados d={d} base={base} eu={v.eu} /></div> : null}
            </div>
          ) : null}

          {/* --------------------------------------------------------- histórico */}
          <Secao titulo="Atividade">
            <div className="dm-caixa">
              <div className="dm-caixa-corpo">
                <ul className="dm-hist">
                  {linhas.map((e, i) => (
                    <li key={i} className={marco(e.tipo) || e.marcoAbsorvido ? 'dm-marco' : ''}>
                      {/* COR SOZINHA NÃO INFORMA: o comentário interno leva a
                          palavra ao lado do carimbo, além da tarja. */}
                      <div className={e.interno ? 'dm-interno' : ''}>
                        {/* `dm-sep`: o "·" antes da hora nunca abre linha
                            quando a frase quebra no celular */}
                        <div className="dm-q dm-sep">
                          <div className="dm-sep-in">
                            <b>{frase(e, meuNome)}</b>
                            <span className="dm-quando">{quando(e.em)}</span>
                            {e.interno ? <span className="dm-quando">interno (só a equipe vê)</span> : null}
                          </div>
                        </div>
                        {/* o texto da conclusão já está no cartão verde do alto, e
                            a pergunta da trava que ainda vale, no aviso amarelo:
                            na atividade fica o gesto (quem, quando) */}
                        {e.texto && !(e.tipo === 'status' && e.para === 'concluida' && e.texto === d.conclusao)
                          && !(i === ultimaTrava && e.texto === d.travada_nota)
                          ? <div className="dm-t"><TextoComLinks texto={e.texto} podeLinkar={linkavel} /></div> : null}
                      </div>
                    </li>
                  ))}
                </ul>
                {linhas.length === 0 ? <p className="dm-mudo dm-peq">Nada ainda.</p> : null}
              </div>
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
                <div className="dm-caixa-pe dm-caixa-escrever">
                  <Escrever atende={v.eu.atende} salvando={indo} erro={erroDe === 'comentar' ? erro : ''}
                    aoEnviar={(texto, interno) => agir('comentar', { texto, interno })} />
                </div>
              ) : null}
            </div>
          </Secao>
        </div>

        {/* ------------------------------------------------- o painel (desktop) */}
        <aside className="dm-painel dm-fixa dm-so-desktop" aria-label="Ações" aria-live="polite">
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
            {par ? botao(par, par === 'rejeitar' ? 'dm-btn dm-perigo' : 'dm-btn')
              : maisNaBarra ? (
              <button type="button" className="dm-btn" disabled={indo} onClick={() => setAberto('mais')}>
                <Icone nome="mais" />Mais
              </button>
            ) : secundarias[0] ? botao(secundarias[0], secundarias[0] === 'rejeitar' ? 'dm-btn dm-perigo' : 'dm-btn') : null}
            {primaria ? botao(primaria, cheio) : null}
          </div>
          <div className="dm-barra-espaco" />
        </>
      ) : <span className="dm-sem-barra" hidden />}
      {celular && aberto ? (
        <Folha fechar={() => setAberto('')} segurar={segurar} titulo={aberto === 'mais' ? 'Esta demanda' : rotulo(aberto)}>
          {erro ? <Aviso tom="bad">{erro}</Aviso> : null}
          {aberto === 'mais' ? (
            <>
              {estadoDoPainel ? <div className="dm-painel-estado">{estadoDoPainel}</div> : null}
              {secundarias.length ? (
                <div className="dm-painel-acoes">
                  {secundarias.map(a => botao(a, a === 'rejeitar' ? 'dm-btn dm-perigo dm-larga' : 'dm-btn dm-larga'))}
                </div>
              ) : null}
              {ajustes.length ? (
                /* o fio da seção na caixa de fora: com os -10px dos ajustes,
                   ele saía 20px mais largo que o fio seguinte */
                <div className="dm-folha-secao">
                  <div className="dm-painel-ajustes">
                    {ajustes.map(a => botao(a, a === 'cancelar' ? 'dm-btn dm-txt dm-perigo' : 'dm-btn dm-txt'))}
                  </div>
                </div>
              ) : null}
              {podeAvisar ? <div className="dm-folha-secao"><Recados d={d} base={base} eu={v.eu} /></div> : null}
            </>
          ) : (
            <RascunhoDaCaixa.Provider value={guarda}>
        <Formulario key={aberto} aberto={aberto} d={d} b={b} eu={v.eu} indo={indo} agir={agir} anexos={v.anexos} />
      </RascunhoDaCaixa.Provider>
          )}
        </Folha>
      ) : null}
    </>
  );
}

/* "Aberta em 25/07/2026 às 20:52 · há 2 meses": passados 30 dias `quando`
   devolve a própria data, e a casa repetia "25/07/2026" embaixo dela
   (auditoria R10) */
function haQuanto(iso: string): string {
  const q = quando(iso);
  if (q !== dataCheia(iso)) return q;
  const dias = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  const meses = Math.max(1, Math.floor(dias / 30));
  if (meses < 12) return `há ${meses} ${meses === 1 ? 'mês' : 'meses'}`;
  const anos = Math.floor(meses / 12);
  return `há ${anos} ${anos === 1 ? 'ano' : 'anos'}`;
}

/* "em 3 dias", "vence hoje", "18 dias de atraso", "há 2 dias" */
const vence = (t: string) => (t.startsWith('em ') || t === 'amanhã' ? `vence ${t}` : t);

/* a linha "Aprovação" da tabela do pedido: "aprovada", "recusada" ou
   "esperando a gestão decidir". Pendente sem portão (a categoria deixou de
   exigir) não é linha nenhuma: não há o que esperar. */
function aprovacaoEmPalavras(d: { aprovacao?: string | null; falta_aprovacao?: boolean }): string {
  if (d.aprovacao === 'aprovada') return 'aprovada';
  if (d.aprovacao === 'rejeitada') return 'recusada';
  if (d.falta_aprovacao) return 'esperando a gestão decidir';
  return '';
}

/* A CONCLUÍDA SE MEDE PELA ENTREGA, E NÃO POR HOJE — 23/09/2026. Dizia
   "passou" para toda concluída cujo prazo ficou para trás no calendário,
   inclusive a entregue no prazo. */
function prazoEmPalavras(prazo: string, sit: ReturnType<typeof situacao>, atraso: number,
                         concluidaEm?: string | null): string {
  if (sit === 'atrasada') return `${atraso} ${atraso === 1 ? 'dia' : 'dias'} de atraso`;
  if (sit === 'hoje') return 'vence hoje';
  if (sit === 'fechada') {
    if (!concluidaEm) return '';
    const depois = Math.round((Date.parse(diaNoRio(concluidaEm)) - Date.parse(prazo.slice(0, 10))) / 86400000);
    return depois > 0 ? `entregue ${depois} ${depois === 1 ? 'dia' : 'dias'} depois do prazo` : 'entregue no prazo';
  }
  const dias = Math.round((Date.parse(prazo) - Date.parse(HOJE())) / 86400000);
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
function Folha({ titulo, fechar, segurar, children }: {
  titulo: string; fechar: () => void; children: React.ReactNode;
  /* com texto escrito, Escape e o toque fora não fecham: só o "Voltar" */
  segurar?: () => boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (typeof d.showModal === 'function' && !d.open) d.showModal();
    d.querySelector<HTMLElement>('textarea,input,select,button.dm-pri')?.focus({ preventScroll: true });
    return () => { if (d.open) d.close(); };
  }, []);
  return (
    <dialog ref={ref} className="dm-folha" onCancel={e => { e.preventDefault(); if (!segurar?.()) fechar(); }}
      onClick={e => { if (e.target === e.currentTarget && !segurar?.()) fechar(); }}>
      <div className="dm-folha-in">
        <div className="dm-folha-alca" aria-hidden="true" />
        <div className="dm-folha-topo">
          <h3>{titulo}</h3>
          <button type="button" className="dm-btn dm-txt dm-peq" onClick={fechar}>Voltar</button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

/* ------------------------------------------------------------- escrever

   A caixa de comentário fica no FIM da atividade, que é onde se responde. É
   uma linha de 44px que cresce ao focar ou quando já tem texto; o botão
   aparece com o texto. Não apaga o texto quando o servidor recusa. A
   caixinha "Só para a equipe" só existe para quem atende, porque o servidor
   ignora a chave para os outros. */
function Escrever({ atende, salvando, aoEnviar, erro }: {
  atende: boolean; salvando: boolean;
  aoEnviar: (texto: string, interno: boolean) => Promise<boolean>;
  /* a recusa do servidor, aqui, e não no alto da ficha */
  erro?: string;
}) {
  const [t, setT] = useState('');
  const [foco, setFoco] = useState(false);
  const [interno, setInterno] = useState(false);
  const teto = tetoDe('comentar');
  const aberta = foco || t.length > 0;
  const sobra = teto - t.length;
  return (
    <div className={aberta ? 'dm-escrever dm-aberta' : 'dm-escrever'}>
      {erro ? <Aviso tom="bad">{erro}</Aviso> : null}
      <Campo rot="Escrever alguma coisa">
        <textarea value={t} maxLength={teto} placeholder="Escrever um comentário…" rows={1}
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
  /* as frases de "pronta" e "pergunta" são de quem atende; quem pede
     escreve para quem atende com a dele */
  const tipo = !eu.atende ? 'lembrar'
    : d.status === 'concluida' ? 'pronta'
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
    <div className="dm-recados">
      <h3 className="dm-painel-titulo">Avisar {alvo.quem}</h3>
      <div className="dm-grade">
        {zap
          ? <a className="dm-btn dm-zap dm-larga" href={zap} target="_blank" rel="noopener noreferrer">
              <Icone nome="mensagem" />WhatsApp para {alvo.nome.split(' ')[0]}
            </a>
          : <span className="dm-peq dm-mudo">{alvo.nome || 'Essa pessoa'} não tem telefone cadastrado.</span>}
        <Copiar texto={texto} rot="Copiar o recado" classe="dm-btn dm-larga" />
      </div>
    </div>
  );
}

/* -------------------------------------------- o formulário da ação aberta */
function Formulario({ aberto, d, b, eu, indo, agir, anexos = [] }: {
  aberto: Acao | ''; d: Vista['demanda']; b: Bases | null; eu: Vista['eu']; indo: boolean;
  /* os anexos que já estão na demanda, para o nome do novo não repetir */
  anexos?: { nome: string }[];
  /* devolve `false` quando o servidor recusou, e é assim que a `CaixaDeAcao`
     sabe que NÃO pode apagar o que a pessoa escreveu */
  agir: (a: Acao, dados?: Record<string, unknown>) => Promise<boolean>;
}) {
  const guarda = useContext(RascunhoDaCaixa);
  const [motivo, setMotivo] = useState<'informacao' | 'aprovacao' | 'terceiros'>('informacao');
  const [prazo, setPrazo] = useState(d.prazo || '');
  const [prio, setPrio] = useState(d.prioridade);
  /* começa sem escolha: começava no setor de hoje, com "Mandar" ativo, e um
     toque sem mudar nada tirava o dono da demanda (o banco aceita mandar
     para o mesmo setor, e zera o responsável) */
  const [setor, setSetor] = useState('');
  const [url, setUrl] = useState('');
  const [urlErro, setUrlErro] = useState('');
  const [nomeAnexo, setNomeAnexo] = useState('');
  /* o motivo do atraso também fica guardado com o rascunho da ação */
  const [atraso, setAtrasoLocal] = useState(() => guarda?.ler('atraso') ?? '');
  const setAtraso = (x: string) => { setAtrasoLocal(x); guarda?.gravar(x, 'atraso'); };

  if (!aberto || aberto === 'comentar') return null;
  /* o "Voltar" mora no topo do painel e da folha; aqui só o que a ação
     precisa */

  if (aberto === 'concluir') {
    /* `HOJE()` E NAO `toISOString()` — 22/09/2026: das 21h do Rio a
       meia-noite a tela pedia motivo de atraso de uma demanda que vence HOJE.

       "OPCIONAL" ERA MENTIRA, E RECUSAVA TODA CONCLUSAO ATRASADA:
       `supabase/86` recusa concluir sem `atraso` quando o prazo ja passou
       (`ATRASO_PRECISA_MOTIVO`). O campo e obrigatorio quando aparece, e o
       botao so liga com os dois. */
    const tarde = !!d.prazo && d.prazo < HOJE();
    return (
      <CaixaDeAcao rot="O que foi feito" botao="Concluir" salvando={indo} teto={tetoDe('concluir')}
        dica="A conclusão precisa dizer o que foi realizado. É o que quem pediu vai ler."
        podeEnviar={!tarde || !!atraso.trim()}
        extra={tarde ? (
          <Campo rot="Por que atrasou"
            ajuda="Obrigatório quando passa do prazo. O motivo aparece em Números, em “Por que atrasa”.">
            <input value={atraso} maxLength={tetoDe('atraso')}
              onChange={e => setAtraso(e.target.value)} />
          </Campo>
        ) : null}
        aoEnviar={t => agir('concluir', { texto: t, atraso })} />
    );
  }
  if (aberto === 'travar') {
    return (
      <div className="dm-acao-form">
        {/* O SELETOR OFERECIA UMA TRAVA QUE O SERVIDOR RECUSA — 22/09/2026.
            `supabase/85` recusa `motivo = 'aprovacao'` quando a demanda JA
            foi aprovada e quem pede nao e lideranca
            (`SO_GESTOR_REABRE_APROVACAO`). `acoesDe` decide por ACAO e nunca
            por motivo; quem cobre e o seletor. */}
        {/* TRÊS OPÇÕES EMPILHADAS, E NÃO UM SELECT: "Aguardando informações
            de quem pediu" não cabia fechado em nenhuma largura de painel
            (270px de texto em 198 a 250), e a regra da casa é botão para
            poucas opções (ver `Opcoes`) */}
        <Bloco rot="Por que está travada">
          <Opcoes rot="Por que está travada" valor={motivo} empilhadas
            opcoes={TRAVAS.filter(t => t.v !== 'aprovacao'
                                   || d.aprovacao !== 'aprovada'
                                   || quemManda(eu.papel))
                         .map(t => ({ v: t.v, rot: t.rot }))}
            aoMudar={v => setMotivo(v)} />
        </Bloco>
        {/* quem lê a nota depende do motivo: a pergunta vai para quem pediu,
            o porquê da aprovação vai para a gestão, e o de terceiros fica
            no registro (24/09/2026, auditoria R12) */}
        <CaixaDeAcao rot={motivo === 'aprovacao' ? 'O que precisa ser aprovado, e por quê' : motivo === 'terceiros' ? 'Esperando o quê, e de quem' : 'O que falta, exatamente'}
          botao="Travar" salvando={indo}
          teto={tetoDe('travar')}
          dica={motivo === 'aprovacao' ? 'A gestão vai ler isto para decidir. Diga o valor e o motivo.'
            : motivo === 'terceiros' ? 'Fica no registro da demanda. Diga quem e até quando, se souber.'
            : 'Quem pediu vai ler isto. Seja específico: “qual sala?” resolve; “falta informação” não.'}
          aoEnviar={t => agir('travar', { motivo, texto: t })} />
      </div>
    );
  }
  if (aberto === 'destravar') {
    /* QUEM PEDIU RESPONDE, E A RESPOSTA É O QUE DESTRAVA — 23/09/2026. O
       formulário deixava "Destravar" ligado com a caixa vazia: a demanda
       andava sem a informação que a equipe pediu. Para quem pediu, a
       resposta é obrigatória e o botão diz o que faz; quem atende pode
       destravar sem texto (a resposta pode ter chegado por outro caminho) */
    const responde = !!(eu.pede ?? eu.abriu) && d.travada_por === 'informacao';
    /* A PERGUNTA EM CIMA DA RESPOSTA — 24/09/2026 (auditoria R10). Ela
       morava só no aviso do topo da ficha, que a folha do celular cobre e
       que já saiu da tela quando a pessoa rolou até o botão: respondia-se
       de memória. */
    return (
      <div className="dm-acao-form">
        {responde && d.travada_nota ? (
          <div className="dm-pergunta"><span>O que a equipe perguntou</span>{d.travada_nota}</div>
        ) : null}
        <CaixaDeAcao rot={responde ? 'A sua resposta' : 'O que destravou'} botao={responde ? 'Enviar resposta' : 'Destravar'}
          salvando={indo} exigeTexto={responde} teto={tetoDe('destravar')}
          aoEnviar={t => agir('destravar', { texto: t })} />
      </div>
    );
  }
  if (aberto === 'cancelar') {
    return (
      <CaixaDeAcao rot="Por que cancelar" botao="Cancelar a demanda" tom="perigo" salvando={indo} teto={tetoDe('cancelar')}
        dica="Fica no histórico. Cancelar sem motivo é perder a informação de por que não foi feito."
        aoEnviar={t => agir('cancelar', { texto: t })} />
    );
  }
  if (aberto === 'reabrir') {
    return (
      <CaixaDeAcao rot="O que não ficou resolvido" botao="Reabrir" salvando={indo} teto={tetoDe('reabrir')}
        dica="A demanda volta para execução com o histórico inteiro."
        aoEnviar={t => agir('reabrir', { texto: t })} />
    );
  }
  if (aberto === 'aprovar') {
    return (
      <CaixaDeAcao rot="Observação da aprovação (opcional)" botao="Aprovar" salvando={indo} exigeTexto={false} teto={tetoDe('aprovar')}
        dica="Depois disto o setor responsável pode começar."
        aoEnviar={t => agir('aprovar', { texto: t })} />
    );
  }
  if (aberto === 'rejeitar') {
    return (
      <CaixaDeAcao rot="Por que não aprovar" botao="Recusar" tom="perigo" salvando={indo} teto={tetoDe('rejeitar')}
        dica="A demanda é encerrada com este motivo, e quem pediu lê."
        aoEnviar={t => agir('rejeitar', { texto: t })} />
    );
  }
  if (aberto === 'prazo') {
    /* BECO SEM SAIDA GARANTIDO — 22/09/2026: `supabase/86` recusa tirar o
       prazo sem motivo (`SEM_PRAZO_PRECISA_MOTIVO`), e aqui nao havia onde
       dizer. Com o campo vazio, a caixa do porque aparece. */
    /* "tirar a data" só existe quando havia data: numa demanda sem data, o
       campo vazio é o começo, e não um pedido para tirar */
    const tirando = !prazo && !!d.prazo;
    return (
      <div className="dm-acao-form">
        <Campo rot="Novo prazo"
          ajuda={d.prazo ? 'Deixe em branco para tirar a data. Pode ser uma data no passado.' : 'Pode ser uma data no passado.'}>
          {/* SEM `min`: o servidor aceita data no passado DE PROPOSITO, e no
              seletor nativo do celular a roda nao desce abaixo do `min`. */}
          <input type="date" value={prazo} onChange={e => setPrazo(e.target.value)} />
        </Campo>
        {tirando ? (
          <CaixaDeAcao rot="Por que fica sem data" botao="Salvar sem data" salvando={indo}
            teto={tetoDe('sem_prazo')}
            dica="“Não sei quando” serve. O que não serve é sumir com a data sem dizer nada."
            aoEnviar={t => agir('prazo', { prazo: '', texto: t })} />
        ) : (
          /* "Salvar" só quando mudou, como no Perfil e na ficha da pessoa */
          <button type="button" className="dm-btn dm-pri dm-larga" disabled={indo || prazo === (d.prazo || '')}
            onClick={() => agir('prazo', { prazo })}>Salvar</button>
        )}
      </div>
    );
  }
  if (aberto === 'prioridade') {
    return (
      <div className="dm-acao-form">
        {/* os quatro botões da Nova, e não um select: o mesmo campo com o
            mesmo desenho nas duas telas */}
        <Bloco rot="Prioridade" ajuda={PRIORIDADES.find(p => p.v === prio)?.explica}>
          <Opcoes rot="Prioridade" valor={prio}
            opcoes={PRIORIDADES.map(p => ({ v: p.v, rot: p.rot }))}
            aoMudar={v => setPrio(v)} />
        </Bloco>
        {prio === 'urgente' ? (
          <CaixaDeAcao rot="O que acontece se não for feito" botao="Salvar" salvando={indo}
            teto={tetoDe('prioridade')}
            aoEnviar={t => agir('prioridade', { prioridade: prio, texto: t })} />
        ) : (
          <button type="button" className="dm-btn dm-pri dm-larga" disabled={indo || prio === d.prioridade}
            onClick={() => agir('prioridade', { prioridade: prio })}>Salvar</button>
        )}
      </div>
    );
  }
  if (aberto === 'redirecionar') {
    return (
      <div className="dm-acao-form">
        <Campo rot="Qual setor vai atender" ajuda="Só aparecem os outros setores que recebem demanda.">
          <select value={setor} onChange={e => setSetor(e.target.value)}>
            <option value="">Escolha o setor</option>
            {(b?.setores || []).filter(s => s.atende && s.id !== d.setor_responsavel_id).map(s => (
              <option key={s.id} value={s.id}>{s.nome}</option>
            ))}
          </select>
        </Campo>
        <button type="button" className="dm-btn dm-pri dm-larga" disabled={indo || !setor} onClick={() => agir('redirecionar', { setor })}>
          Mandar
        </button>
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
      if (recusado) { setUrlErro(recadoDeSiteNoCampo(recusado)); return; }
      agir('anexar', { url: u, nome: nomeAnexo.trim() || nomeSemRepetir(nomeDoLink(u), anexos.map(a => a.nome)) });
    };
    return (
      <div className="dm-acao-form">
        <Campo rot="Link do arquivo" ajuda={dicaDeAnexo(b?.anexos)} erro={urlErro || undefined}>
          <input value={url} placeholder="https://…" inputMode="url"
            aria-invalid={urlErro ? true : undefined}
            onChange={e => { setUrl(e.target.value); setUrlErro(''); }} />
        </Campo>
        {/* a lista inteira, como na Nova: "e mais 18" sem ter onde ver era
            promessa (24/09/2026, auditoria R12) */}
        {b?.anexos?.restrito && b.anexos.sites.length > 4 ? (
          <details className="dm-mais">
            <summary>Ver os sites aceitos</summary>
            <p>{nomesDosSites(b.anexos.sites).join(', ')}.</p>
          </details>
        ) : null}
        <Campo rot="Nome (opcional)" ajuda="Como o anexo aparece na demanda.">
          <input value={nomeAnexo} maxLength={120}
            placeholder={siteDoLink(url.trim()) ? nomeSemRepetir(nomeDoLink(url.trim()), anexos.map(a => a.nome)) : 'Ex.: Orçamento da loja'}
            onChange={e => setNomeAnexo(e.target.value)} />
        </Campo>
        <button type="button" className="dm-btn dm-pri dm-larga" disabled={indo || !url.trim()} onClick={juntar}>Juntar</button>
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
function Acompanham({ v, indo, agir, sair, erro }: {
  v: Vista; indo: boolean;
  agir: (a: Acao, d?: Record<string, unknown>) => Promise<boolean>;
  sair: () => void;
  erro?: string;
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
    <Secao titulo="Quem acompanha"
      acoes={pode ? (
        /* o gatilho não muda de nome ao abrir: era "Fechar" em cima e
           "Voltar" embaixo, duas palavras para fechar o mesmo
           formulário. Tocar de novo recolhe (`aria-expanded` diz o estado) */
        <button type="button" className="dm-btn dm-txt dm-peq" aria-expanded={abrindo}
          onClick={() => setAbrindo(x => !x)}>
          <Icone nome="nova" />Incluir alguém
        </button>
      ) : null}>
      {erro ? <Aviso tom="bad">{erro}</Aviso> : null}
      <div className="dm-acompanha">
        {ps.length ? ps.map(p => (
          <span key={p.id} className="dm-chip">
            <span className="dm-avatar dm-mini" aria-hidden="true">{iniciais(p.nome)}</span>
            <span>{p.nome}{p.eu ? ' (você)' : ''}</span>
            {pode || p.eu ? (
              <button type="button" className="dm-btn dm-txt dm-peq" disabled={indo}
                onClick={async () => {
                  /* sair tira o acesso de quem não pediu nem atende: pergunta
                     antes (era um toque só) */
                  const perde = p.eu && !v.eu.abriu && !v.eu.atende;
                  if (perde && !(await confirmar({
                    titulo: 'Sair desta demanda?',
                    texto: 'Você deixa de ver a demanda e de receber os avisos dela. Quem pediu ou quem atende pode incluir você de novo.',
                    acao: 'Sair',
                  }))) return;
                  const deu = await agir('tirar', { membro_id: p.id });
                  if (deu && perde) sair();
                }}>{p.eu ? 'Sair' : 'Tirar'}</button>
            ) : null}
          </span>
        )) : <span className="dm-mudo">Só quem pediu e quem atende.</span>}
      </div>
      {pode && abrindo ? (
        <form className="dm-caixa dm-acompanha-form" onSubmit={async e => {
          e.preventDefault();
          if (await agir('incluir', { quem: quem.trim() })) { setQuem(''); setAbrindo(false); }
        }}>
          <div className="dm-caixa-corpo">
            <Bloco rot="Incluir pelo">
              <Opcoes rot="Incluir pelo" valor={por}
                opcoes={[{ v: 'tel', rot: 'WhatsApp' }, { v: 'email', rot: 'E-mail' }]}
                aoMudar={x => { setPor(x); setQuem(''); }} />
            </Bloco>
            <Campo rot={por === 'tel' ? 'WhatsApp da pessoa' : 'E-mail da pessoa'} classe="dm-curto"
              ajuda="Só quem já tem cadastro. Ela passa a ver esta demanda.">
              {por === 'tel'
                ? <input key="tel" type="tel" inputMode="tel" value={quem} onChange={e => setQuem(e.target.value)} autoComplete="off" />
                : <input key="email" type="email" inputMode="email" value={quem} onChange={e => setQuem(e.target.value)} autoComplete="off" />}
            </Campo>
          </div>
          <div className="dm-caixa-pe">
            <button type="button" className="dm-btn dm-txt" onClick={() => setAbrindo(false)}>Voltar</button>
            <button className="dm-btn dm-pri" disabled={indo || !quem.trim()}>Incluir</button>
          </div>
        </form>
      ) : null}
    </Secao>
  );
}
