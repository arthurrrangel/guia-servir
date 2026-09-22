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
import { useCallback, useEffect, useMemo, useState } from 'react';
import Casca, { useEu } from '@/components/demandas/Casca';
import { Aviso, Bloco, Campo, Copiar, Esqueleto, Opcoes } from '@/components/demandas/Ui';
import { abrir, bases } from '@/lib/demandas/api';
import {
  HOJE, PRIORIDADES, dataCheia, linkZap, oQueFalta, prazoSugerido, rascunhoVazio,
  recadoDoErro, quemManda, type Rascunho,
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
  const [mais, setMais] = useState(false);
  const [semData, setSemData] = useState(false);
  const [erro, setErro] = useState('');
  const [indo, setIndo] = useState(false);
  const [pronta, setPronta] = useState<Pronta | null>(null);
  const [tentou, setTentou] = useState(false);
  const [erroBase, setErroBase] = useState('');
  const [tinhaRascunho, setTinhaRascunho] = useState(false);

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
      if (x.ok) setB({ setores: x.setores, categorias: x.categorias });
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
  const falta = oQueFalta(r, temSetor, cat);

  /* a categoria sugere a data; se a pessoa já mexeu no campo, não atropela */
  function escolherCategoria(id: string) {
    const c = b?.categorias.find(x => x.id === id);
    setR(v => ({
      ...v, categoria_id: id,
      prazo: v.prazo || (semData ? '' : prazoSugerido(c)),
    }));
  }

  async function enviar() {
    setTentou(true);
    if (falta.length) { setErro(''); return; }
    setIndo(true); setErro('');
    const x = await abrir({ ...r, sem_prazo_porque: semData ? r.sem_prazo_porque : '' }, anexos);
    setIndo(false);
    if (!x.ok) { setErro(recadoDoErro(x, 'abrir a demanda')); return; }
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
        <div className="dm-rot">{'>'} nova demanda</div>
        <Aviso tom="bad">{erroBase}</Aviso>
        <button className="dm-btn" onClick={carregar} style={{ marginTop: 'var(--dm-e2)' }}>
          Tentar de novo
        </button>
      </>
    );
  }
  if (!b) return <Esqueleto />;

  if (pronta) {
    /* a raiz do SISTEMA, não do site: os links que saem daqui pelo WhatsApp
     precisam cair em /demandas, e não na home da igreja */
  const base = typeof window !== 'undefined' ? window.location.origin + '/demandas' : '';
    const texto =
      `Demanda #${pronta.numero} — ${r.titulo}\n` +
      `${eu?.setor || 'Um setor'} pediu para ${pronta.setor_responsavel || setorDaCat}.\n` +
      `${base}/d/${pronta.numero}`;
    const zap = linkZap(pronta.contato?.telefone, texto);
    return (
      <>
        <div className="dm-rot">{'>'} pronto</div>
        <h1 style={{ margin: '6px 0 var(--dm-e3)' }}>Demanda #{pronta.numero} registrada.</h1>

        {pronta.precisa_aprovacao ? (
          <Aviso tom="warn">
            <div>
              Esta categoria <b>precisa de aprovação</b> antes de alguém executar. Ela já está na
              fila da liderança e ninguém consegue começar antes disso.
            </div>
          </Aviso>
        ) : (
          <Aviso tom="ok">
            <div>Foi para <b>{pronta.setor_responsavel || setorDaCat}</b>. Você acompanha pela lista.</div>
          </Aviso>
        )}

        <div className="dm-card">
          <h3 style={{ marginBottom: 6 }}>Avisar quem vai atender</h3>
          <p className="dm-peq dm-mudo">
            O sistema não manda WhatsApp sozinho. Ele escreve o recado; você toca uma vez e envia.
          </p>
          <div className="dm-linha">
            {zap
              ? <a className="dm-btn dm-zap" href={zap} target="_blank" rel="noopener noreferrer">
                  Mandar para {pronta.contato!.nome.split(' ')[0]}
                </a>
              : <span className="dm-peq dm-mudo">Ninguém desse setor tem telefone cadastrado ainda.</span>}
            <Copiar texto={texto} rot="Copiar o recado" />
          </div>
        </div>

        <div className="dm-linha">
          <Link className="dm-btn dm-pri" href={`/demandas/d/${pronta.numero}`}>Ver a demanda</Link>
          <button className="dm-btn" onClick={() => {
            setPronta(null); setR(rascunhoVazio()); setAnexos([]); setSemData(false); setTentou(false);
          }}>Abrir outra</button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="dm-rot">{'>'} nova demanda</div>
      <h1 style={{ margin: '6px 0 var(--dm-e3)' }}>O que você precisa?</h1>

      {erro ? <Aviso tom="bad">{erro}</Aviso> : null}

      {/* UMA LINHA, E SÓ UMA. A tentação aqui é uma caixa com "Recuperar" e
          "Começar do zero", e isso seria pôr uma pergunta na frente de quem
          só queria continuar. Os campos já voltam preenchidos; a linha existe
          para a pessoa entender POR QUE eles estão preenchidos, e para ter
          como jogar fora o que ficou. */}
      {tinhaRascunho ? (
        <p className="dm-peq dm-mudo" role="status" style={{ margin: '0 0 var(--dm-e2)' }}>
          Você tinha um pedido começado. Continuei de onde você parou.{' '}
          <button className="dm-btn dm-mini" onClick={descartarRascunho}>Descartar</button>
        </p>
      ) : null}

      <div className="dm-card">
        <Campo rot="Título">
          {/* OS TETOS APARECEM ANTES DO TOQUE, E NÃO DEPOIS.

              O banco cobra 200 no título, 20 mil na descrição e 120 no evento
              desde a migração 52, e a tela só dizia isso DEPOIS de tocar em
              "Enviar" — `tentou` só vira `true` dentro de `enviar()`. Digita-se
              300 letras, toca-se, e só aí o sistema conta que o limite era 200.
              `maxLength` faz o navegador parar no limite, que é a forma mais
              barata de a regra existir para quem está digitando.

              Os campos sem teto no banco ganham teto aqui pelo mesmo motivo da
              `CaixaDeAcao`: texto colado sem limite pesa em toda abertura
              daquela ficha, para sempre. */}
          <input maxLength={200} value={r.titulo} onChange={e => setR(v => ({ ...v, titulo: e.target.value }))}
            placeholder="Arte para o culto de celebração" />
        </Campo>

        <Campo rot="Categoria"
          ajuda={cat
            ? `Vai para ${setorDaCat}${cat.exige_aprovacao ? ' e precisa de aprovação antes de começar' : ''}.`
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

        <Campo rot="O que precisa ser feito">
          <textarea maxLength={20000} value={r.descricao} onChange={e => setR(v => ({ ...v, descricao: e.target.value }))} />
        </Campo>

        {!semData ? (
          <Campo rot="Para quando"
            ajuda={cat?.prazo_padrao_dias ? `${setorDaCat} costuma levar ${cat.prazo_padrao_dias} dias.` : undefined}>
            {/* O `min` SAIU: NO CELULAR ELE NÃO ERA UM AVISO, ERA UMA PORTA
                TRANCADA — 22/09/2026.

                A versão anterior deste comentário dizia que "quem precisa
                registrar o retroativo digita a data e o servidor aceita". No
                seletor nativo de iOS e Android NÃO EXISTE digitar: a roda
                simplesmente não desce abaixo do `min`. A igreja usa celular.

                Ou seja: a migração 88 tirou a guarda do banco justamente
                porque "a lâmpada do corredor queimou semana passada, põe aí no
                sistema" é o caso normal, e a tela continuou impedindo. O banco
                aceita e a tela recusa é a mesma família de defeito de botão
                morto, virada do avesso.

                O erro de digitação que o `min` queria pegar continua pego, e
                agora de um jeito que não tranca ninguém: a tela AVISA que a
                data escolhida já passou, e deixa seguir. */}
            <input type="date" value={r.prazo}
              onChange={e => setR(v => ({ ...v, prazo: e.target.value }))} />
            {r.prazo && r.prazo < HOJE() ? (
              <small style={{ color: 'var(--dm-warn, inherit)' }}>
                Essa data já passou. Se for um registro do que já aconteceu, pode seguir.
              </small>
            ) : null}
          </Campo>
        ) : (
          <Campo rot="Por que não tem data"
            ajuda="Toda demanda precisa de uma data ou de um porquê. Sem isso ela some no meio das outras.">
            <input maxLength={500} value={r.sem_prazo_porque}
              onChange={e => setR(v => ({ ...v, sem_prazo_porque: e.target.value }))}
              placeholder="Depende da agenda do pastor" />
          </Campo>
        )}
        <button className="dm-btn dm-peq" style={{ marginTop: -8, marginBottom: 'var(--dm-e3)' }}
          onClick={() => { setSemData(x => !x); setR(v => ({ ...v, prazo: '', sem_prazo_porque: '' })); }}>
          {semData ? 'Tenho uma data' : 'Não tenho data'}
        </button>

        {/* `Bloco` E NÃO `Campo`, E ISSO É UM CONSERTO, NÃO ESTILO.

            `Campo` é um `<label>`, e um `<label>` ativa o primeiro descendente
            rotulável. Com quatro `<button>` dentro, tocar na palavra
            "Prioridade" marcava "Baixa". Medido, clicando no pixel do rótulo:

              ANTES : Baixa:false Normal:true
              DEPOIS: Baixa:true  Normal:false

            A pessoa encosta o polegar na palavra enquanto rola e a demanda
            urgente sai como Baixa, sem aviso nenhum — e a prioridade errada
            muda a ordem da fila. `Opcoes` já traz `role="group"` e
            `aria-label`, então o rótulo continua anunciado. */}
        <Bloco rot="Prioridade" ajuda={PRIORIDADES.find(p => p.v === r.prioridade)?.explica}>
          <Opcoes rot="Prioridade" valor={r.prioridade}
            opcoes={PRIORIDADES.map(p => ({ v: p.v as Prioridade, rot: p.rot }))}
            aoMudar={v => setR(x => ({ ...x, prioridade: v }))} />
        </Bloco>

        {r.prioridade === 'urgente' ? (
          <Campo rot="O que acontece se não for feito"
            ajuda="Obrigatório quando é urgente.">
            <input maxLength={2000} value={r.impacto} onChange={e => setR(v => ({ ...v, impacto: e.target.value }))}
              placeholder="Sem isso o culto de domingo não tem som" />
          </Campo>
        ) : null}
      </div>

      {/* O CAMPO OBRIGATÓRIO MORAVA DENTRO DA GAVETA FECHADA — 22/09/2026.

          Quem escolhe uma categoria de Compras preenche tudo, toca em Enviar e
          lê "Falta preencher: o valor estimado" sobre um campo que não está na
          tela, e nada abre a gaveta. Quando a categoria EXIGE orçamento, a
          gaveta abre sozinha: o campo obrigatório não pode estar escondido. */}
      <button type="button" className="dm-gaveta" aria-expanded={mais || !!cat?.exige_orcamento}
        onClick={() => setMais(x => !x)} style={{ marginBottom: 'var(--dm-e2)' }}>
        {mais || cat?.exige_orcamento ? 'Esconder os detalhes' : 'Evento, local, orçamento e anexos'}
      </button>

      {mais || cat?.exige_orcamento ? (
        <div className="dm-card">
          {manda ? (
            <Campo rot="Quem está pedindo" ajuda="Como liderança, você pode abrir em nome de outro setor.">
              <select value={r.setor_solicitante || eu?.setor_id || ''}
                onChange={e => setR(v => ({ ...v, setor_solicitante: e.target.value }))}>
                {b.setores.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </Campo>
          ) : null}

          <div className="dm-dupla">
            <Campo rot="Evento relacionado" ajuda="Se tiver evento, a data dele é obrigatória.">
              <input maxLength={120} value={r.evento} onChange={e => setR(v => ({ ...v, evento: e.target.value }))} />
            </Campo>
            <Campo rot="Data do evento">
              <input type="date" value={r.evento_data}
                onChange={e => setR(v => ({ ...v, evento_data: e.target.value }))} />
            </Campo>
            <Campo rot="Onde vai acontecer">
              <input maxLength={200} value={r.local} onChange={e => setR(v => ({ ...v, local: e.target.value }))} />
            </Campo>
            <Campo rot="Público ou ministério envolvido">
              <input maxLength={200} value={r.publico} onChange={e => setR(v => ({ ...v, publico: e.target.value }))} />
            </Campo>
          </div>

          <Campo rot="Objetivo" ajuda="O para quê, quando não é óbvio pela descrição.">
            <input maxLength={4000} value={r.objetivo} onChange={e => setR(v => ({ ...v, objetivo: e.target.value }))} />
          </Campo>

          {/* O ORÇAMENTO ERA INALCANÇÁVEL EM 31 DAS 43 CATEGORIAS.

              O campo vivia dentro de `{cat?.exige_orcamento ? … : null}`, ou
              seja: só existia nas 12 categorias que EXIGEM valor (Compras,
              Reembolso, Reserva financeira, Solicitação de pagamento,
              Alimentação, Transporte). Nas outras 31 não havia onde escrever
              um número, mesmo quando havia número para escrever, e o
              documento pede duas coisas que isso quebra: "anexos, imagens,
              orçamentos ou documentos" no detalhamento, e a regra "demandas
              de compra devem conter orçamento estimado, QUANDO POSSÍVEL".
              "Quando possível" é decisão de quem pede, não de quem cadastrou
              a categoria.

              Tirar a condição não acrescenta nada à primeira tela: o campo já
              morava dentro da gaveta de detalhes, que nasce fechada. A
              obrigatoriedade continua sendo da categoria, cobrada pelo
              servidor (`ORCAMENTO_OBRIGATORIO`, migração 86); aqui muda só a
              ajuda, que diz o que aquele valor faz naquela categoria. */}
          <Campo rot="Orçamento estimado (R$)"
            ajuda={cat?.exige_orcamento
              ? 'Esta categoria exige o valor. Sem número, a aprovação trava esperando.'
              : 'Quando der para estimar. Ajuda quem decide a comparar pedidos.'}>
            <input inputMode="decimal" value={r.orcamento}
              onChange={e => setR(v => ({ ...v, orcamento: e.target.value.replace(',', '.') }))} />
          </Campo>

          <Campo rot="Anexos"
            ajuda="Cole o link do arquivo (Drive, Fotos, o que for). Guardar arquivo aqui fica para depois; link resolve hoje.">
            <div className="dm-linha">
              <input className="dm-cresce" value={anexoUrl} placeholder="https://…"
                onChange={e => setAnexoUrl(e.target.value)}
                style={{ minHeight: 46, padding: '10px 12px', border: '1px solid var(--dm-linha2)', borderRadius: 'var(--dm-r)', background: 'var(--dm-card3)' }} />
              <button className="dm-btn" disabled={!anexoUrl.trim()} onClick={() => {
                setAnexos(a => [...a, { nome: nomeDoLink(anexoUrl), url: anexoUrl.trim() }]);
                setAnexoUrl('');
              }}>Juntar</button>
            </div>
          </Campo>
          {anexos.length ? (
            <ul className="dm-peq" style={{ margin: 0, paddingLeft: 18 }}>
              {anexos.map((a, i) => (
                <li key={i}>
                  {a.nome}{' '}
                  {/* `dm-mini` (36px) e não um `minHeight: 26` em linha:
                      estilo em linha vencia o piso de 44px da folha e deixava
                      o alvo em 26px, num gesto de CORREÇÃO — o pior lugar
                      para errar o toque. 20/09/2026, auditoria de tela. */}
                  <button className="dm-btn dm-mini"
                    onClick={() => setAnexos(x => x.filter((_, j) => j !== i))}>tirar</button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {tentou && falta.length ? (
        <Aviso tom="warn">
          <div>
            Falta {falta.length === 1 ? '' : 'preencher'}: {falta.join('; ')}.
          </div>
        </Aviso>
      ) : null}

      <button className="dm-btn dm-pri dm-larga" disabled={indo} onClick={enviar}>
        {indo ? 'Enviando…' : 'Enviar a demanda'}
      </button>
      {r.prazo ? (
        <p className="dm-peq dm-mudo dm-centro" style={{ marginTop: 'var(--dm-e2)' }}>
          Pedindo para {dataCheia(r.prazo)}{setorDaCat ? `, para ${setorDaCat}` : ''}.
        </p>
      ) : null}
    </>
  );
}

function nomeDoLink(u: string): string {
  try {
    const p = new URL(u.trim());
    const fim = p.pathname.split('/').filter(Boolean).pop();
    return decodeURIComponent(fim || p.hostname);
  } catch { return 'anexo'; }
}
