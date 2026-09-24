'use client';
/* ABRIR UMA DEMANDA.

   Esta é a tela que decide se o sistema vive. O documento lista dezoito
   campos; se os dezoito aparecerem de uma vez num celular, ninguém abre a
   segunda demanda. Então: cinco perguntas visíveis, o resto atrás de "mais
   detalhes", e a categoria já resolve sozinha o setor que atende, se precisa
   de aprovação e a data sugerida.

   O aviso do que falta aparece ANTES de enviar, com as mesmas palavras das
   regras do banco. Quem manda continua sendo o banco: se a tela esquecer uma
   regra, o CHECK recusa e a frase traduzida aparece igual. */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Casca, { useEu } from '@/components/demandas/Casca';
import { Aviso, Bloco, Cabecalho, Campo, Copiar, Esqueleto, Opcoes } from '@/components/demandas/Ui';
import { Icone } from '@/components/demandas/Icone';
import { depoisDoToque } from '@/components/demandas/toque';
import { abrir, bases } from '@/lib/demandas/api';
import {
  HOJE, PRIORIDADES, camposQueFaltam, dataCheia, dicaDeAnexo, linkZap, nomeDoLink, nomeSemRepetir, nomesDosSites, prazoSugerido,
  rascunhoVazio, recadoDeSiteNoCampo, recadoDoErro, quemManda, siteDoLink, siteRecusado, type Rascunho,
} from '@/lib/demandas/regras';
import type { Bases, Categoria, Prioridade } from '@/lib/demandas/tipos';

export default function Pagina() {
  return <Casca><Nova /></Casca>;
}

type Pronta = {
  numero: number; precisa_aprovacao: boolean;
  setor_responsavel?: string; contato?: { nome: string; telefone: string | null } | null;
};

/* ------------------------------------------------ o pedido começado e não enviado

   "Rascunho" é o primeiro dos onze status do documento, e é o único que não
   vira estado no banco: um rascunho é justamente o pedido que AINDA NÃO virou
   linha. Criar o estado do lado de lá daria a alguém uma demanda que ninguém
   consegue ver, atender ou fechar, e um número gasto por um pedido que talvez
   nunca exista.

   O defeito medido é o do celular: cinco campos visíveis, treze atrás da
   gaveta, a pessoa é interrompida no meio (uma ligação, o navegador
   descartando a aba em segundo plano, a tela apagando), volta, e está tudo em
   branco. Não há aviso, não há volta, e o trabalho não existia em lugar
   nenhum para poder ser recuperado. Na segunda vez que isso acontece, ela não
   abre a terceira demanda.

   A CHAVE MORA NO ESPAÇO DE DEMANDAS, e isso não é detalhe: `demandas.link`
   já segue a regra em `lib/demandas/api.ts`, e usar uma chave `escala.*` aqui
   daria a um sistema o poder de limpar o estado do outro.

   Toda leitura e toda escrita passam por try/catch: em aba anônima, com
   cookies de site bloqueados ou com a cota estourada, `localStorage` LANÇA em
   vez de devolver nulo. Uma tela de abrir demanda que morre porque o navegador
   não quis guardar um rascunho seria um defeito muito pior que o que isto
   conserta. */
const K_RASCUNHO = 'demandas.rascunho';

type Anexo = { nome: string; url: string };
type Guardado = { r: Rascunho; anexos: Anexo[]; semData: boolean };

/* Os campos que moram atrás de "mais detalhes". Restaurar um deles com a
   gaveta fechada seria guardar o trabalho da pessoa e escondê-lo dela: ela
   leria "continuei de onde você parou" olhando para um formulário onde o
   orçamento que ela digitou não aparece. É o mesmo defeito que fez a gaveta
   abrir sozinha quando a categoria exige orçamento, dois passos adiante. */
const NA_GAVETA = ['evento', 'evento_data', 'local', 'publico', 'objetivo',
                   'orcamento', 'setor_solicitante'] as const;
const usouAGaveta = (g: Guardado) =>
  g.anexos.length > 0 || NA_GAVETA.some(k => (g.r[k] || '').trim() !== '');

/* `prioridade` fica de fora porque nasce em 'normal' e nunca fica vazia:
   contá-la faria todo formulário virgem parecer um rascunho começado, e a
   linha "Você tinha um pedido começado" apareceria para quem nunca digitou
   nada. */
const temAlgumaCoisa = (r: Rascunho, anexos: Anexo[]) =>
  anexos.length > 0 ||
  Object.entries(r).some(([k, v]) => k !== 'prioridade' && typeof v === 'string' && v.trim() !== '');

function esquecerRascunho() {
  try { localStorage.removeItem(K_RASCUNHO); } catch { /* sem localStorage, nada a esquecer */ }
}

function guardarRascunho(g: Guardado) {
  try { localStorage.setItem(K_RASCUNHO, JSON.stringify(g)); } catch { /* cota cheia ou aba anônima */ }
}

function lerRascunho(): Guardado | null {
  let cru: string | null = null;
  try { cru = localStorage.getItem(K_RASCUNHO); } catch { return null; }
  if (!cru) return null;
  try {
    const g = JSON.parse(cru);
    if (!g || typeof g !== 'object' || !g.r || typeof g.r !== 'object') { esquecerRascunho(); return null; }
    /* o `...rascunhoVazio()` na frente é o que impede um rascunho gravado por
       uma versão anterior da tela de chegar sem campo novo e derrubar o
       formulário num `r.titulo.trim()` sobre `undefined` */
    return {
      r: { ...rascunhoVazio(), ...g.r },
      anexos: Array.isArray(g.anexos) ? g.anexos.filter((a: Anexo) => a && a.url) : [],
      semData: !!g.semData,
    };
  } catch { esquecerRascunho(); return null; }
}

function Nova() {
  const { eu } = useEu();
  const [b, setB] = useState<Bases | null>(null);
  const [r, setR] = useState<Rascunho>(rascunhoVazio());
  const [anexos, setAnexos] = useState<{ nome: string; url: string }[]>([]);
  const [anexoUrl, setAnexoUrl] = useState('');
  const [anexoNome, setAnexoNome] = useState('');
  const [anexoErro, setAnexoErro] = useState('');
  const [mais, setMais] = useState(false);
  const [semData, setSemData] = useState(false);
  const [erro, setErro] = useState('');
  const [indo, setIndo] = useState(false);
  const [pronta, setPronta] = useState<Pronta | null>(null);
  const [tentou, setTentou] = useState(false);
  /* ENVIAR COM CAMPO FALTANDO TEM QUE DAR RETORNO À VISTA — 23/09/2026.
     Medido em 390: a página ficava no topo, o aviso nascia em 995px (abaixo
     da dobra e atrás da barra fixa) e o foco ficava no botão; o toque
     parecia não fazer nada. Cada tentativa leva o aviso para o meio da tela
     e põe o foco nele, que o leitor de tela anuncia. */
  const [tentativa, setTentativa] = useState(0);
  const avisoFalta = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!tentativa) return;
    /* o foco vai para o PRIMEIRO campo que falta, que é onde a pessoa vai
       agir (em 390 o título e a categoria ficavam duas telas acima do
       aviso); sem campo para apontar, vai para o aviso */
    /* por lista de tags, e não por seletor de atributo (o dublê de DOM dos
       testes de tela só entende a primeira forma) */
    const primeiro = [...document.querySelectorAll<HTMLElement>('input,select,textarea')]
      .find(c => c.getAttribute('aria-invalid') === 'true');
    const alvo = primeiro || avisoFalta.current;
    if (!alvo) return;
    alvo.scrollIntoView({ block: 'center', behavior: 'smooth' });
    alvo.focus({ preventScroll: true });
  }, [tentativa]);
  const [erroBase, setErroBase] = useState('');
  const [tinhaRascunho, setTinhaRascunho] = useState(false);
  const [digitando, setDigitando] = useState(false);
  const campoDeTexto = (el: EventTarget | null) => {
    const t = (el as HTMLElement | null)?.tagName;
    return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT';
  };

  /* RESTAURAR NO EFEITO, E NÃO NO INICIALIZADOR DO `useState`.

     Ler `localStorage` dentro de `useState(() => …)` parece mais direto e é
     um defeito: esta é uma tela do App Router, o servidor renderiza o HTML
     primeiro, e lá `localStorage` não existe. O formulário sairia vazio do
     servidor e preenchido no cliente, que é a definição de erro de
     hidratação. No efeito, o React já terminou de casar as duas árvores. */
  useEffect(() => {
    const g = lerRascunho();
    if (!g) return;
    setR(g.r); setAnexos(g.anexos); setSemData(g.semData);
    if (usouAGaveta(g)) setMais(true);
    setTinhaRascunho(true);
  }, []);

  /* Gravar e esquecer são o MESMO efeito de propósito: assim o formulário que
     a pessoa esvaziou à mão apaga o rascunho sozinho, sem botão para isso, e
     não fica um guardado fantasma que ressuscita texto que ela já tirou.

     ELE RODA JUNTO COM O DE CIMA NO COMMIT DE MONTAGEM, e nessa passada ainda
     enxerga o formulário vazio: chega a chamar `esquecerRascunho()` sobre o
     rascunho que o efeito de cima acabou de ler. Escrevi uma trava de
     primeira passada para evitar isso e o teste provou que ela não segurava
     nada, porque o `setR` de cima muda `r` e este efeito roda de novo no
     commit seguinte, gravando tudo de volta. Tirei a trava: guarda que não dá
     para provar é enfeite que ensina a confiar no que não foi medido. O custo
     que sobra é uma escrita desperdiçada por abertura de formulário. */
  useEffect(() => {
    if (temAlgumaCoisa(r, anexos)) guardarRascunho({ r, anexos, semData });
    else esquecerRascunho();
  }, [r, anexos, semData]);

  function descartarRascunho() {
    esquecerRascunho();
    setR(rascunhoVazio()); setAnexos([]); setSemData(false);
    setTentou(false); setTinhaRascunho(false);
  }

  /* O ERRO DE `bases()` ERA DESCARTADO AQUI TAMBÉM — 20/09/2026.

     Esta é, pelo comentário do próprio arquivo, "a tela que decide se o
     sistema vive". Com a chamada falhando, `b` ficava nulo, o
     `return <Esqueleto />` vencia, e a pessoa via barras cinza animadas para
     sempre: sem texto, sem botão, sem "tentar de novo". */
  const carregar = useCallback(() => {
    setErroBase('');
    bases().then(x => {
      if (x.ok) setB({ setores: x.setores, categorias: x.categorias, anexos: x.anexos });
      else setErroBase(recadoDoErro(x, 'carregar os setores e categorias'));
    });
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const cat = useMemo(() => b?.categorias.find(c => c.id === r.categoria_id), [b, r.categoria_id]);
  const setorDaCat = useMemo(
    () => b?.setores.find(s => s.id === cat?.setor_id)?.nome || '',
    [b, cat]);
  const grupos = useMemo(() => {
    const m = new Map<string, Categoria[]>();
    (b?.categorias || []).forEach(c => { if (!m.has(c.grupo)) m.set(c.grupo, []); m.get(c.grupo)!.push(c); });
    return [...m.entries()];
  }, [b]);

  const manda = quemManda(eu?.papel);
  const temSetor = !!(r.setor_solicitante || eu?.setor_id);
  const faltas = camposQueFaltam(r, temSetor, cat);
  const falta = faltas.map(x => x.texto);
  /* depois do primeiro "Enviar", cada campo que falta fica vermelho e diz o
     que falta, e o aviso de baixo vira o resumo */
  const faltaEm = (...campos: string[]) => {
    if (!tentou) return undefined;
    const x = faltas.find(f => campos.includes(f.campo));
    return x ? (x.frase ?? `Falta ${x.texto}.`) : undefined;
  };

  /* a categoria sugere a data; se a pessoa já mexeu no campo, não atropela */
  /* A DATA SUGERIDA ACOMPANHA A CATEGORIA — 24/09/2026 (auditoria R13).
     `v.prazo ||` não distinguia a data que a pessoa escolheu da que a
     categoria anterior sugeriu: trocar "Criação de vídeo" (04/10) por
     "Publicação nas redes" deixava 04/10 ao lado de "costuma levar 3
     dias". A data que veio de sugestão troca com a categoria; a escolhida
     pela pessoa fica. */
  const prazoDaCategoria = useRef('');
  function escolherCategoria(id: string) {
    const c = b?.categorias.find(x => x.id === id);
    const sugerido = semData ? '' : prazoSugerido(c);
    const escolhida = !!r.prazo && r.prazo !== prazoDaCategoria.current;
    if (!escolhida) prazoDaCategoria.current = sugerido;
    setR(v => ({ ...v, categoria_id: id, prazo: escolhida ? v.prazo : sugerido }));
  }

  async function enviar() {
    setTentou(true);
    if (falta.length) {
      setErro('');
      /* o que falta dentro da gaveta fechada (a data do evento, o valor)
         abre a gaveta, para o campo poder ser marcado e receber o foco */
      if (faltas.some(f => f.campo === 'evento' || f.campo === 'evento_data' || f.campo === 'orcamento')) setMais(true);
      setTentativa(t => t + 1);
      return;
    }
    setIndo(true); setErro('');
    const x = await abrir({ ...r, sem_prazo_porque: semData ? r.sem_prazo_porque : '' }, anexos);
    setIndo(false);
    if (!x.ok) {
      setErro(recadoDoErro(x, 'abrir a demanda'));
      /* a recusa aparece à vista: nascia no alto da página, 1016px acima da
         tela em 390, e o botão só voltava de "Enviando…" (24/09/2026, R12) */
      requestAnimationFrame(() => document.querySelector('.dm-aviso.dm-bad')
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
      return;
    }
    /* o rascunho só morre quando o banco confirmou o número. Limpar antes do
       `ok` é perder o texto inteiro numa falha de rede, que é o caso comum no
       4G da igreja e exatamente o que este guardado existe para cobrir. */
    esquecerRascunho();
    setTinhaRascunho(false);
    setPronta(x as unknown as Pronta);
  }

  if (erroBase && !b) {
    return (
      <>
        <Cabecalho sobre="Nova demanda" titulo="O que você precisa?" />
        <Aviso tom="bad">{erroBase}</Aviso>
        <button type="button" className="dm-btn dm-tentar" onClick={carregar}>Tentar de novo</button>
      </>
    );
  }
  if (!b) return <Esqueleto />;

  if (pronta) {
    /* a raiz do SISTEMA, não do site: os links que saem daqui pelo WhatsApp
       precisam cair em /demandas, e não na home da igreja */
    const base = typeof window !== 'undefined' ? window.location.origin + '/demandas' : '';
    const texto =
      `Demanda #${pronta.numero} · ${r.titulo}\n` +
      `${eu?.setor || 'Um setor'} pediu para ${pronta.setor_responsavel || setorDaCat}.\n` +
      `${base}/d/${pronta.numero}`;
    const zap = linkZap(pronta.contato?.telefone, texto);
    return (
      <div className="dm-leitura dm-pronta">
        <Cabecalho sobre="Pronto" titulo={`Demanda #${pronta.numero} registrada`} />

        {pronta.precisa_aprovacao ? (
          <Aviso tom="warn">
            Esta categoria <b>precisa de aprovação</b> antes de alguém executar. Ela já está na
            fila da gestão e ninguém consegue começar antes disso.
          </Aviso>
        ) : (
          <Aviso tom="ok">
            Foi para <b>{pronta.setor_responsavel || setorDaCat}</b>. Você acompanha pela lista.
          </Aviso>
        )}

        <div className="dm-caixa">
          {/* com aprovação pendente, chamar a equipe é chamar quem ainda não
              pode começar (24/09/2026, auditoria R13): o cartão diz o que vem */}
          {pronta.precisa_aprovacao ? (
            <div className="dm-caixa-corpo">
              <h2 className="dm-caixa-titulo">O que vem agora</h2>
              <p className="dm-peq dm-mudo">
                Quando a gestão aprovar, a demanda vai para {pronta.setor_responsavel || setorDaCat || 'o setor responsável'}, e você recebe o aviso.
              </p>
            </div>
          ) : (
          <div className="dm-caixa-corpo">
            <h2 className="dm-caixa-titulo">Avisar quem vai atender</h2>
            <p className="dm-peq dm-mudo dm-antes-do-botao">
              O sistema não manda WhatsApp sozinho. Ele escreve o recado; você toca uma vez e envia.
            </p>
            <div className="dm-linha dm-linha-botoes">
              {zap
                ? <a className="dm-btn dm-zap" href={zap} target="_blank" rel="noopener noreferrer">
                    <Icone nome="mensagem" />Mandar para {pronta.contato!.nome.split(' ')[0]}
                  </a>
                : <span className="dm-peq dm-mudo">Ninguém desse setor tem telefone cadastrado ainda.</span>}
              <Copiar texto={texto} rot="Copiar o recado" classe="dm-btn" />
            </div>
          </div>
          )}
          <div className="dm-caixa-pe">
            <button type="button" className="dm-btn" onClick={() => {
              setPronta(null); setR(rascunhoVazio()); setAnexos([]); setSemData(false); setTentou(false);
            }}>Abrir outra</button>
            <Link className="dm-btn dm-pri" href={`/demandas/d/${pronta.numero}`}>Ver a demanda</Link>
          </div>
        </div>
      </div>
    );
  }

  const resumoDoPedido = r.prazo
    ? <>Pedindo para {dataCheia(r.prazo)}{setorDaCat ? `, para ${setorDaCat}` : ''}.</>
    : setorDaCat ? <>Para {setorDaCat}.</> : null;
  /* NA BARRA DO CELULAR, DUAS LINHAS QUE NÃO SE COMEM — 24/09/2026. A frase
     inteira ao lado do botão cortava o destino em 320 e 360 ("Pedindo para
     27/09/2026, para…"). Aqui o setor numa linha e a data na outra, cada uma
     com a própria reticência: a data nunca some, e o setor se reconhece pelo
     começo. */
  const resumoDaBarra = setorDaCat || r.prazo ? (
    <>
      {setorDaCat ? <span className="dm-resumo-setor">{setorDaCat}</span> : null}
      {r.prazo ? <span>Para {dataCheia(r.prazo)}</span> : null}
    </>
  ) : null;

  return (
    <>
      <Cabecalho volta={{ href: '/demandas', rot: 'Início', soCelular: true }} sobre="Nova demanda" titulo="O que você precisa?"
        meta={<span>A categoria decide para qual setor vai, se precisa de aprovação e o prazo sugerido.</span>} />
      {erro ? <Aviso tom="bad">{erro}</Aviso> : null}

      {/* UMA LINHA, E SÓ UMA. A tentação aqui é uma caixa com "Recuperar" e
          "Começar do zero", e isso seria pôr uma pergunta na frente de quem
          só queria continuar. Os campos já voltam preenchidos; a linha existe
          para a pessoa entender POR QUE eles estão preenchidos, e para ter
          como jogar fora o que ficou. */}
      {tinhaRascunho ? (
        <Aviso tom="info">
          <div className="dm-entre">
            <span>Você tinha um pedido começado. Continuei de onde você parou.</span>
            <button type="button" className="dm-btn dm-peq" onClick={descartarRascunho}>Descartar</button>
          </div>
        </Aviso>
      ) : null}

      {/* `digitando` só com campo de texto em foco: tocar num botão (a
          prioridade, "Não tenho data", a gaveta) escondia a barra de enviar
          (medido em 23/09/2026) */}
      <div className="dm-duas dm-duas-form"
        onFocus={e => { if (campoDeTexto(e.target)) setDigitando(true); }}
        onBlur={e => {
          /* O TOQUE EM "ENVIAR" SE PERDIA — 24/09/2026 (auditoria R13). Com um
             campo em foco, a barra fixa some e o "Enviar" aparece no fim do
             formulário; o toque nele tirava o foco, o bloco sumia, a página
             encurtava 114px e o dedo terminava em outro lugar: no Android, o
             primeiro toque nunca enviava. Trocar de um campo para outro não
             muda nada, e sair para um botão espera o toque terminar (no
             mouse, o botão subir: ver `toque.ts`). */
          if (campoDeTexto(e.target) && !campoDeTexto(e.relatedTarget)) depoisDoToque(() => setDigitando(false));
        }}>
      <div>
      <div className="dm-caixa">
        <div className="dm-caixa-corpo">
        <Campo rot="Título" falta={faltaEm('titulo')}>
          {/* OS TETOS APARECEM ANTES DO TOQUE, E NÃO DEPOIS: `maxLength` faz
              o navegador parar no limite do banco (200 no título, 20 mil na
              descrição, 120 no evento), e os campos sem teto no banco ganham
              teto aqui pelo mesmo motivo da `CaixaDeAcao`: texto colado sem
              limite pesa em toda abertura daquela ficha, para sempre. */}
          <input maxLength={200} value={r.titulo} onChange={e => setR(v => ({ ...v, titulo: e.target.value }))}
            placeholder="Ex.: Arte para o culto de celebração" />
        </Campo>

        <Campo rot="Categoria" falta={faltaEm('categoria_id')}
          /* no desktop o painel da direita já diz para onde vai (e o
             rodapé repete): a ajuda do campo volta a dizer o que ele faz. No
             celular, sem painel, é a ajuda que diz o destino */
          ajuda={cat
            ? <>
                <span className="dm-so-celular">
                  Vai para {setorDaCat}{cat.exige_aprovacao ? ' e precisa de aprovação antes de começar' : ''}.
                </span>
                <span className="dm-so-desktop">Define qual setor vai atender.</span>
              </>
            : 'Define qual setor vai atender.'}>
          <select value={r.categoria_id} onChange={e => escolherCategoria(e.target.value)}>
            <option value="">Escolha</option>
            {grupos.map(([g, cs]) => (
              <optgroup key={g} label={g}>
                {cs.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </optgroup>
            ))}
          </select>
        </Campo>

        <Campo rot="O que precisa ser feito" falta={faltaEm('descricao')}>
          <textarea maxLength={20000} value={r.descricao} onChange={e => setR(v => ({ ...v, descricao: e.target.value }))} />
        </Campo>
        </div>

        <div className="dm-caixa-corpo dm-caixa-divisa">
        {!semData ? (
          <Campo rot="Para quando" classe="dm-data" falta={faltaEm('prazo')}
            ajuda={cat?.prazo_padrao_dias ? `${setorDaCat} costuma levar ${cat.prazo_padrao_dias} dias.` : undefined}>
            {/* SEM `min`: NO CELULAR ELE NÃO ERA UM AVISO, ERA UMA PORTA
                TRANCADA — 22/09/2026. No seletor nativo de iOS e Android não
                existe digitar: a roda não desce abaixo do `min`, e "a lâmpada
                queimou semana passada, põe aí" é o caso normal. A tela AVISA
                que a data já passou, e deixa seguir. */}
            <input type="date" value={r.prazo}
              onChange={e => setR(v => ({ ...v, prazo: e.target.value }))} />
            {r.prazo && r.prazo < HOJE() ? (
              <small className="dm-aviso-campo">
                Essa data já passou. Se for um registro do que já aconteceu, pode seguir.
              </small>
            ) : null}
          </Campo>
        ) : (
          <Campo rot="Por que não tem data" falta={faltaEm('prazo')}
            ajuda="Toda demanda precisa de uma data ou de um porquê. Sem isso ela some no meio das outras.">
            <input maxLength={500} value={r.sem_prazo_porque}
              onChange={e => setR(v => ({ ...v, sem_prazo_porque: e.target.value }))}
              placeholder="Ex.: Depende da agenda do pastor" />
          </Campo>
        )}
        {/* UMA CAIXINHA, E NÃO UM BOTÃO-TEXTO — 23/09/2026: "Não tenho data"
            era texto solto entre o campo e o rótulo de baixo, sem borda,
            ícone ou sublinhado, e ninguém adivinhava que era tocável. Marcada,
            a data vira "Por que não tem data"; desmarcada, volta. */}
        <label className="dm-caixinha dm-sem-data">
          <input type="checkbox" checked={semData}
            onChange={() => { setSemData(x => !x); setR(v => ({ ...v, prazo: '', sem_prazo_porque: '' })); }} />
          Não tenho data
        </label>

        {/* `Bloco` E NÃO `Campo`, E ISSO É UM CONSERTO, NÃO ESTILO: um
            `<label>` com quatro `<button>` dentro fazia o toque na palavra
            "Prioridade" marcar "Baixa" (medido). `Opcoes` já traz
            `role="group"` e `aria-label`. */}
        <Bloco rot="Prioridade" ajuda={PRIORIDADES.find(p => p.v === r.prioridade)?.explica}>
          <Opcoes rot="Prioridade" valor={r.prioridade}
            opcoes={PRIORIDADES.map(p => ({ v: p.v as Prioridade, rot: p.rot }))}
            aoMudar={v => setR(x => ({ ...x, prioridade: v }))} />
        </Bloco>

        {r.prioridade === 'urgente' ? (
          <Campo rot="O que acontece se não for feito" falta={faltaEm('impacto')}
            ajuda="Obrigatório quando é urgente.">
            <input maxLength={2000} value={r.impacto} onChange={e => setR(v => ({ ...v, impacto: e.target.value }))}
              placeholder="Ex.: Sem isso o culto de domingo não tem som" />
          </Campo>
        ) : null}
        </div>
      </div>

      {/* O CAMPO OBRIGATÓRIO MORAVA DENTRO DA GAVETA FECHADA — 22/09/2026.
          Quando a categoria EXIGE orçamento, a gaveta abre sozinha: o campo
          obrigatório não pode estar escondido. */}
      <button type="button" className="dm-gaveta" aria-expanded={mais || !!cat?.exige_orcamento}
        onClick={() => setMais(x => !x)}>
        {mais || cat?.exige_orcamento ? 'Esconder os detalhes' : 'Evento, local, orçamento e anexos'}
      </button>

      {mais || cat?.exige_orcamento ? (
        <div className="dm-caixa">
          <div className="dm-caixa-corpo">
          {manda ? (
            <Campo rot="Quem está pedindo" ajuda="Quem é da gestão pode abrir em nome de outro setor.">
              <select value={r.setor_solicitante || eu?.setor_id || ''}
                onChange={e => setR(v => ({ ...v, setor_solicitante: e.target.value }))}>
                {/* 94 · gestor com escopo pede em nome dos setores que acompanha
                    (e do próprio); o banco recusa os outros com
                    SETOR_FORA_DO_ESCOPO, então a lista não os oferece. */}
                {b.setores
                  .filter(s => eu?.papel !== 'gestor' || eu?.escopo_total !== false
                    || s.id === eu?.setor_id || (eu?.escopo || []).includes(s.nome))
                  .map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </Campo>
          ) : null}

          <div className="dm-dupla">
            <Campo rot="Evento relacionado" ajuda="Se tiver evento, a data dele é obrigatória." falta={faltaEm('evento')}>
              <input maxLength={120} value={r.evento} onChange={e => setR(v => ({ ...v, evento: e.target.value }))} />
            </Campo>
            <Campo rot="Data do evento" classe="dm-data" falta={faltaEm('evento_data')}>
              <input type="date" value={r.evento_data}
                onChange={e => setR(v => ({ ...v, evento_data: e.target.value }))} />
            </Campo>
            <Campo rot="Onde vai acontecer">
              <input maxLength={200} value={r.local} onChange={e => setR(v => ({ ...v, local: e.target.value }))} />
            </Campo>
            {/* "…envolvido" quebrava em duas linhas na coluna de 187px (1024)
                e descia o campo abaixo do vizinho */}
            <Campo rot="Público ou ministério">
              <input maxLength={200} value={r.publico} onChange={e => setR(v => ({ ...v, publico: e.target.value }))} />
            </Campo>
          </div>

          <Campo rot="Objetivo" ajuda="O para quê, quando não é óbvio pela descrição.">
            <input maxLength={4000} value={r.objetivo} onChange={e => setR(v => ({ ...v, objetivo: e.target.value }))} />
          </Campo>

          {/* O ORÇAMENTO ERA INALCANÇÁVEL EM 31 DAS 43 CATEGORIAS: o campo só
              existia nas que EXIGEM valor, e o documento pede o orçamento
              "quando possível", que é decisão de quem pede. A obrigatoriedade
              continua sendo da categoria, cobrada pelo servidor
              (`ORCAMENTO_OBRIGATORIO`, migração 86). */}
          <Campo rot="Orçamento estimado (R$)" classe="dm-numero" falta={faltaEm('orcamento')}
            ajuda={cat?.exige_orcamento
              ? 'Esta categoria exige o valor. Sem número, a aprovação trava esperando.'
              : 'Quando der para estimar. Ajuda quem decide a comparar pedidos.'}>
            <input inputMode="decimal" value={r.orcamento}
              onChange={e => setR(v => ({ ...v, orcamento: e.target.value }))} />
          </Campo>

          {/* 95 · A LISTA DE SITES AVISA AQUI, E NÃO DEPOIS DE ENVIAR: o banco
              recusa a demanda inteira quando um anexo é de site fora da lista
              (`SITE_NAO_PERMITIDO`). A regra é a mesma do banco, lida por
              `dem_bases`; quem decide continua sendo ele. */}
          {/* O LINK, O NOME E SÓ ENTÃO "JUNTAR" — 24/09/2026 (auditoria R13): o
              nome aparecia embaixo do botão que o consome. Sem link colado, o
              "Juntar" fica ao lado do campo, como antes; com link, ele desce
              para depois do nome (que só aparece aí: quem não quer nomear não
              vê o campo). */}
          <Campo rot="Anexos" ajuda={dicaDeAnexo(b?.anexos)}>
            <div className="dm-linha dm-criar">
              <input className="dm-ctl dm-cresce" value={anexoUrl} placeholder="https://…" inputMode="url"
                aria-invalid={anexoErro ? true : undefined}
                onChange={e => { setAnexoUrl(e.target.value); setAnexoErro(''); }} />
              {anexoUrl.trim() ? null : <button type="button" className="dm-btn" disabled>Juntar</button>}
            </div>
          </Campo>
          {anexoErro ? <p className="dm-peq dm-erro-campo" role="alert">{anexoErro}</p> : null}
          {anexoUrl.trim() ? (
            <div className="dm-linha dm-criar dm-anexo-nome">
              <Campo rot="Nome do anexo (opcional)">
                <input value={anexoNome} maxLength={120}
                  placeholder={siteDoLink(anexoUrl.trim()) ? nomeSemRepetir(nomeDoLink(anexoUrl.trim()), anexos.map(x => x.nome)) : 'Ex.: Orçamento da loja'}
                  onChange={e => setAnexoNome(e.target.value)} />
              </Campo>
              <button type="button" className="dm-btn" onClick={() => {
                const url = anexoUrl.trim();
                if (!siteDoLink(url)) { setAnexoErro('Cole o link inteiro, começando com https://'); return; }
                const recusado = siteRecusado(url, b?.anexos);
                if (recusado) { setAnexoErro(recadoDeSiteNoCampo(recusado)); return; }
                setAnexos(a => [...a, { nome: anexoNome.trim() || nomeSemRepetir(nomeDoLink(url), a.map(x => x.nome)), url }]);
                setAnexoUrl(''); setAnexoNome(''); setAnexoErro('');
              }}>Juntar</button>
            </div>
          ) : null}
          {b?.anexos?.restrito && b.anexos.sites.length ? (
            <details className="dm-mais">
              <summary>Ver os sites aceitos</summary>
              <p>{nomesDosSites(b.anexos.sites).join(', ')}.</p>
            </details>
          ) : null}
          {anexos.length ? (
            <ul className="dm-anexos dm-anexos-novos">
              {anexos.map((a, i) => (
                <li key={i}>
                  <Icone nome="link" />
                  <span className="dm-anexo-link">{a.nome}</span>
                  {/* `dm-peq` e não um `minHeight: 26` em linha: estilo em
                      linha vencia o piso de 44px da folha e deixava o alvo em
                      26px, num gesto de CORREÇÃO. 20/09/2026. */}
                  <button type="button" className="dm-btn dm-txt dm-peq"
                    onClick={() => setAnexos(x => x.filter((_, j) => j !== i))}>Tirar</button>
                </li>
              ))}
            </ul>
          ) : null}
          </div>
        </div>
      ) : null}

      {/* o resumo, em vermelho como os campos: com uma falta só, o campo
          marcado já diz tudo (e o foco está nele); o resumo fica para duas ou
          mais, e para a que não tem campo na tela (o setor de quem pede) */}
      {tentou && (falta.length > 1 || faltas.some(f => f.campo === 'setor')) ? (
        <div ref={avisoFalta} tabIndex={-1}>
          <Aviso tom="bad">
            {falta.length === 1 ? 'Falta' : 'Falta preencher'}: {falta.join('; ')}.
          </Aviso>
        </div>
      ) : null}

      {/* no desktop o botão fecha a coluna do formulário; no celular ele vai
          na barra fixa do rodapé, com a frase-resumo, e sai da frente
          enquanto a pessoa digita (o teclado já cobre metade da tela) */}
      {/* a ação primária à direita, como no rodapé de toda caixa de
          formulário, com a frase-resumo antes dela */}
      <div className={digitando ? 'dm-enviar' : 'dm-so-desktop dm-enviar'}>
        {resumoDoPedido ? <span className="dm-peq dm-mudo dm-cresce">{resumoDoPedido}</span> : null}
        {/* e o botão em linha não tira o foco do campo ao ser tocado: o
            layout não muda debaixo do dedo */}
        <button type="button" className="dm-btn dm-pri" disabled={indo} onClick={enviar} aria-busy={indo || undefined}
          onMouseDown={e => e.preventDefault()}>
          {indo ? 'Enviando…' : 'Enviar a demanda'}
        </button>
      </div>
      </div>

      {/* a coluna de contexto: o que a categoria decide, ao vivo. O mesmo
          painel da coluna direita da ficha (rótulo pequeno em caixa alta,
          sem faixa de cabeçalho): a coluna da direita é uma peça só no
          produto inteiro */}
      <aside className="dm-painel dm-fixa dm-so-desktop" aria-label="O que acontece com este pedido">
        <div className="dm-painel-bloco">
          <h3 className="dm-painel-titulo">O que acontece com este pedido</h3>
          {cat ? (
            <div className="dm-pares dm-uma-coluna">
              <div><span>Vai para</span>{setorDaCat || 'nenhum setor ainda'}</div>
              <div><span>Aprovação</span>{cat.exige_aprovacao ? 'precisa da gestão antes de começar' : 'não precisa'}</div>
              <div><span>Prazo sugerido</span>{cat.prazo_padrao_dias ? `${dataCheia(prazoSugerido(cat))} (${cat.prazo_padrao_dias} dias)` : 'sem sugestão'}</div>
              <div><span>Orçamento</span>{cat.exige_orcamento ? 'obrigatório nesta categoria' : 'quando der para estimar'}</div>
              <div><span>Anexos</span>{dicaDeAnexo(b?.anexos)}</div>
            </div>
          ) : (
            /* o subtítulo da tela já explica o que a categoria decide */
            <p className="dm-peq dm-mudo">Aparece aqui assim que você escolher a categoria.</p>
          )}
        </div>
      </aside>
      </div>

      {!digitando ? (
        <div className="dm-barra-acao dm-barra-enviar">
          <span className="dm-cresce">{resumoDaBarra}</span>
          <button type="button" className="dm-btn dm-pri" disabled={indo} onClick={enviar} aria-busy={indo || undefined}>
            {indo ? 'Enviando…' : 'Enviar a demanda'}
          </button>
        </div>
      ) : null}
      <div className="dm-barra-espaco" />
    </>
  );
}

/* `nomeDoLink` mora em `regras.ts` desde 24/09/2026: a ficha usa a mesma */
