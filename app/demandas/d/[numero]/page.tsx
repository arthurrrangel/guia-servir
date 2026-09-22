'use client';
/* UMA DEMANDA.

   Três camadas, nesta ordem: o que está acontecendo AGORA (e o que destrava),
   o que foi pedido, e o histórico. O histórico fica por último de propósito —
   quem abre esta tela quer saber o que fazer, não ler o passado.

   Os botões vêm de `acoesDe`, que é o espelho testado de `dem_mover`. Nenhum
   botão é desenhado à mão aqui: se aparecer um que o servidor recusa, o teste
   da matriz quebra antes de chegar em produção. */

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Casca from '@/components/demandas/Casca';
import { Aviso, CaixaDeAcao, Campo, Copiar, Esqueleto, Pill } from '@/components/demandas/Ui';
import { bases, mover, ver } from '@/lib/demandas/api';
import {
  HOJE, PRIORIDADES, TRAVAS, acoesDe, carimbo, comoOPdfChama, dataCheia, dataCurta, diasDeAtraso,
  dinheiro, linkZap, quando, quemManda, recado, recadoDoErro, rotPrioridade, rotStatus,
  rotTrava, situacao, tetoDe, tomPill, tomPrioridade, type Acao,
} from '@/lib/demandas/regras';
import type { Bases, Vista } from '@/lib/demandas/tipos';

export default function Pagina() {
  return <Casca><Uma /></Casca>;
}

/* As ações que `acoesDe` devolve e que NÃO viram botão na grade, cada uma por
   um motivo próprio:

     comentar  — a caixa de escrever é fixa, no fim da coluna;
     validar   — mora dentro do cartão verde "Concluída" (migração 91), e a
                 regra da casa é que a grade não engorde.

   Serve para o ramo de "cartão vazio" saber contar. Ver o comentário dele. */
const FORA_DA_GRADE: Acao[] = ['comentar', 'validar'];

function Uma() {
  const params = useParams<{ numero: string }>();
  const router = useRouter();
  const numero = Number(params?.numero);
  const [v, setV] = useState<Vista | null>(null);
  const [b, setB] = useState<Bases | null>(null);
  const [erro, setErro] = useState('');
  const [aberto, setAberto] = useState<Acao | ''>('');
  const [indo, setIndo] = useState(false);
  /* a caixinha "Só para a equipe" do comentário. Mora aqui e não dentro da
     `CaixaDeAcao` porque o valor viaja no `agir`, e porque ela precisa voltar
     para desmarcada depois de gravar. */
  const [interno, setInterno] = useState(false);

  const carregar = useCallback(async () => {
    const r = await ver(numero);
    if (!r.ok) { setErro(recadoDoErro(r, 'abrir a demanda')); setV(null); return; }
    setErro(''); setV({ demanda: r.demanda, eu: r.eu, eventos: r.eventos, anexos: r.anexos });
  }, [numero]);

  useEffect(() => { if (Number.isFinite(numero)) carregar(); }, [numero, carregar]);
  useEffect(() => { bases().then(x => { if (x.ok) setB({ setores: x.setores, categorias: x.categorias }); }); }, []);

  /* DEVOLVE SE DEU CERTO, E ISSO É O QUE SEGURA O TEXTO DA PESSOA.

     `CaixaDeAcao` apagava a caixa na mesma linha em que disparava a ação, sem
     esperar resposta: toda recusa do servidor custava um texto redigitado.
     Ver o comentário do `onClick` em `components/demandas/Ui.tsx`. O ramo de
     erro devolve `false` e é o único que devolve. */
  async function agir(acao: Acao, dados: Record<string, unknown> = {}): Promise<boolean> {
    setIndo(true); setErro('');
    const r = await mover(numero, acao, dados);
    setIndo(false);
    if (!r.ok) { setErro(recadoDoErro(r, 'gravar')); return false; }
    setAberto('');
    await carregar();
    return true;
  }

  const acoes = useMemo(
    () => (v ? acoesDe(v.demanda, v.eu) : []),
    [v]);

  /* O PDF PEDE DUAS DATAS DE PRAZO, E EXISTE UMA COLUNA SÓ — 22/09/2026.

     No Detalhamento ele pede "Data desejada para conclusão" (o que QUEM PEDIU
     quer) e no Acompanhamento "Prazo definido" (o que o SETOR assumiu). No
     banco é a mesma coluna `prazo`: quando o setor muda o prazo, o pedido
     original só sobrevive como evento no histórico, e a ficha passa a mostrar
     a data do setor como se sempre tivesse sido aquela.

     Medido no efeito: a demanda pedida para 22/09 e empurrada para 28/09
     aparece igualzinha a uma pedida para 28/09. Quem pediu abre a ficha e não
     tem como saber que a sua data foi trocada, nem por quanto.

     Coluna nova para isso seria cara e redundante — o dado já desce, na mesma
     carga de `dem_ver`. O PRIMEIRO evento de tipo `prazo` guarda em `de` o
     prazo que existia antes da primeira mudança, que é exatamente a data
     pedida no nascimento. Vira parêntese na linha que já existe. */
  const prazoPedido = useMemo(() => {
    const p = v?.eventos.find(e => e.tipo === 'prazo');
    return p?.de || '';
  }, [v]);

  /* TOCAR EM "CONCLUIR" NAO MUDAVA NADA DO QUE A PESSOA ESTAVA VENDO.

     Os botoes abrem um formulario no fim de um cartao IRMAO. Nada rolava,
     nada recebia foco, nada piscava. Medido, rolando ate o botao como a
     pessoa faria e tocando:

       [Concluir]                 rolagem 887->887 | 0px de 327px visiveis (  0%)
       [Travar]                   rolagem 943->943 | 47px de 469px ( 10%)
       [Mudar o prazo]            rolagem 999->999 | 103px de 177px ( 58%)
       [Mandar para outro setor]  ...              | 196px de 196px (100%)

     A pagina nao se mexe em nenhum, e o foco fica no BODY em todos. E quanto
     mais ALTO o botao na pilha, MENOS se ve — entao "Concluir" e "Travar",
     que sao as duas acoes do dia a dia de quem atende, sao as duas piores.

     A pessoa toca em Concluir, a tela fica igual, ela toca de novo (o React
     re-renderiza o mesmo estado: igual), conclui que o botao esta morto e
     manda mensagem para quem administra. */
  const cxForm = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const n = cxForm.current;
    if (!n) return;
    n.scrollIntoView({ block: 'center', behavior: 'smooth' });
    n.querySelector<HTMLElement>('textarea,input,select')?.focus({ preventScroll: true });
  }, [aberto]);

  /* e Escape fecha, porque o unico jeito de desistir era achar o "Deixa pra
     la" la embaixo */
  useEffect(() => {
    if (!aberto) return;
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(''); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [aberto]);

  if (erro && !v) {
    /* A UNICA SAIDA OFERECIDA ERA SAIR DA TELA.

       Tres das cinco telas deste sistema ja aprenderam isto (`nova`,
       `ajustes` e `numeros`, cada uma com o comentario contando quando). As
       duas mais usadas nao tinham. Uma falha de rede no 4G da igreja e o caso
       comum, nao o excepcional, e a resposta certa para ela e "tente de
       novo", nao "volte para a lista" — que vai falhar igual. */
    return (
      <>
        <Aviso tom="bad">{erro}</Aviso>
        <div className="dm-linha">
          <button className="dm-btn dm-pri" onClick={carregar}>Tentar de novo</button>
          <Link className="dm-btn" href="/demandas">Voltar para a lista</Link>
        </div>
      </>
    );
  }
  if (!v) return <Esqueleto />;

  const d = v.demanda;
  const sit = situacao(d);
  const atraso = diasDeAtraso(d.prazo);
  /* a raiz do SISTEMA, não do site: os links que saem daqui pelo WhatsApp
     precisam cair em /demandas, e não na home da igreja */
  const base = typeof window !== 'undefined' ? window.location.origin + '/demandas' : '';

  return (
    <>
      <Link className="dm-peq dm-mudo dm-voltar" href="/demandas">{'<'} todas as demandas</Link>

      <div style={{ margin: 'var(--dm-e2) 0 var(--dm-e3)' }}>
        <div className="dm-rot">{'>'} demanda #{d.numero} · {d.grupo} · {d.categoria}</div>
        <h1 style={{ marginTop: 6 }}>{d.titulo}</h1>
        <div className="dm-linha" style={{ marginTop: 'var(--dm-e2)' }}>
          <Pill tom={tomPill(d.status)}>
            <span className={`dm-ponto ${tomPill(d.status) ? 'dm-' + tomPill(d.status) : ''}`} />
            {comoOPdfChama(d)}
          </Pill>
          <Pill tom={tomPrioridade(d.prioridade)}>{rotPrioridade(d.prioridade)}</Pill>
          {sit === 'atrasada' ? <Pill tom="bad">{atraso} {atraso === 1 ? 'dia' : 'dias'} de atraso</Pill> : null}
          {sit === 'parada' ? <Pill tom="warn">parada há {d.parada_dias} dias</Pill> : null}
          {d.reaberturas > 0 ? <Pill tom="warn">reaberta {d.reaberturas}×</Pill> : null}
        </div>
      </div>

      {erro ? <Aviso tom="bad">{erro}</Aviso> : null}

      {/* ---------------------------------------------------- o que acontece

          O PORTAO NAO TINHA UMA PALAVRA NA TELA — 22/09/2026.

          Este aviso so aparecia com `status === 'travada'`. Quando o
          administrador liga "exige aprovacao" numa categoria que ja tem
          demanda andando, o servidor passa a cobrar a aprovacao na hora
          (`falta_aprovacao`), mas a demanda continua com status `aberta` ate
          alguem mexer nela. Resultado medido: "Concluir" e "Assumir" somem da
          grade, a linha "Aprovacao" da tabela tambem some (ela so aparecia com
          `d.aprovacao` preenchido, e aqui e nulo), e NADA na tela diz por que.

          Agora o portao fala primeiro, em qualquer status, e diz de quem e a
          vez. */}
      {d.falta_aprovacao ? (
        <Aviso tom="warn">
          <div>
            <b>Esperando aprovação.</b>{' '}
            {d.aprovacao === 'pendente'
              ? 'A liderança precisa decidir antes de esta demanda andar.'
              : 'A categoria desta demanda passou a exigir aprovação. Ela fica parada até a liderança decidir.'}
            {/* "VOCÊ SERÁ AVISADO AQUI MESMO" ERA PROMESSA QUE A TELA NÃO
                CUMPRE — 22/09/2026. Esta página não recarrega sozinha: não há
                polling, não há assinatura de tempo real, e o aviso por fora
                (migração 90) é do SETOR quando a demanda chega, não de quem
                pediu quando a aprovação sai. Quem lia isso ficava com a aba
                aberta esperando uma coisa que não ia acontecer. Dizer o que
                falta e ir embora é mais honesto que prometer um aviso. */}
            {quemManda(v.eu.papel)
              ? <> Você pode aprovar ou recusar aqui ao lado.</>
              : <> Quem decide é a liderança. Não há o que fazer aqui enquanto isso.</>}
          </div>
        </Aviso>
      ) : null}
      {d.status === 'travada' && !d.falta_aprovacao ? (
        <Aviso tom="warn">
          <div>
            <b>{rotTrava(d.travada_por)}.</b>{d.travada_nota ? ` ${d.travada_nota}` : ''}
            {d.travada_por === 'informacao' && v.eu.abriu && acoes.includes('destravar')
              ? <> Responda aqui embaixo e a demanda volta a andar.</>
              : null}
          </div>
        </Aviso>
      ) : null}
      {d.status === 'concluida' ? (
        <Aviso tom="ok">
          <div>
            {/* `carimbo` e nao `quando`: o PDF pede a data de conclusao, e a
                frase relativa sozinha ("ha 3 dias") nao e data. Mesmo remedio
                da linha "Aberta" da tabela ao lado. */}
            <b>Concluída</b> em {carimbo(d.concluida_em)}. {d.conclusao}
            {d.atraso_motivo ? <> <span className="dm-mudo">(atrasou: {d.atraso_motivo})</span></> : null}
            {/* A ETAPA 5 DO PDF MORA AQUI DENTRO, E NÃO NA GRADE — 22/09/2026.

                "Solicitar → Triar → Aprovar → Executar → VALIDAR → Concluir",
                e entre as capacidades do Solicitante: "Confirmar a conclusão".
                Quem executa era quem fechava, e o sistema só sabia registrar
                discordância (`reabrir`) — a concordância não tinha onde ser
                dita, então "ninguém reabriu" contava a mesma história para a
                demanda que resolveu e para a que a pessoa desistiu de cobrar.

                Botão novo na grade, não: a grade já tem doze e a regra da casa
                é que ela não engorde. O cartão verde já é o lugar onde se lê o
                que foi feito; é ali que se responde. Depois de confirmada o
                botão some e vira a frase, que é o registro pedido.

                `Reabrir` continua na grade, onde sempre esteve: mover os dois
                para cá deixaria a grade VAZIA para quem só pode reabrir, e o
                ramo de cartão vazio passaria a anunciar "você pode escrever
                aqui embaixo" com um botão de reabrir logo acima. */}
            {d.validada_em ? (
              <div className="dm-peq dm-mudo" style={{ marginTop: 6 }}>
                Validada{d.validada_por ? ` por ${d.validada_por}` : ''} em {dataCheia(d.validada_em.slice(0, 10))}.
              </div>
            ) : acoes.includes('validar') ? (
              <div style={{ marginTop: 8 }}>
                <button className="dm-btn dm-peq" disabled={indo} onClick={() => agir('validar')}>
                  Resolveu, obrigado
                </button>
              </div>
            ) : null}
          </div>
        </Aviso>
      ) : null}
      {d.status === 'cancelada' ? (
        <Aviso tom="bad"><div><b>Cancelada.</b> {d.cancelada_motivo}</div></Aviso>
      ) : null}

      <div className="dm-dupla">
        {/* ------------------------------------------------------- o pedido */}
        <div>
          <div className="dm-card">
            <h3 style={{ marginBottom: 8 }}>O que foi pedido</h3>
            {/* `pre-wrap` sozinho nao quebra um link colado: ele e uma
                "palavra" de 139 letras e atravessa a tela. Medido: o cartao
                cresceu para 853px dentro de 320px, e a pagina NAO rolava para
                alcancar o resto. */}
            <p className="dm-texto-livre">{d.descricao}</p>
            {d.objetivo ? <p className="dm-peq dm-mudo">Objetivo: {d.objetivo}</p> : null}
            {d.impacto ? <p className="dm-peq"><b>Impacto:</b> {d.impacto}</p> : null}

            <table className="dm-tab" style={{ marginTop: 'var(--dm-e2)' }}>
              <tbody>
                <Li rot="Quem pediu" v={`${d.abriu} · ${d.solicitante}`} />
                <Li rot="Quem atende" v={d.responsavel ? `${d.responsavel} · ${d.responsavel_setor}` : `${d.responsavel_setor} (ninguém assumiu)`} />
                <Li rot="Prazo"
                  v={(d.prazo ? dataCheia(d.prazo) : `sem data — ${d.sem_prazo_porque || 'sem justificativa'}`)
                     + (prazoPedido && prazoPedido.slice(0, 10) !== (d.prazo || '').slice(0, 10)
                        ? ` (pedido para ${dataCheia(prazoPedido)})` : '')} />
                {d.evento ? <Li rot="Evento" v={`${d.evento} · ${dataCheia(d.evento_data)}`} /> : null}
                {d.local ? <Li rot="Onde" v={d.local} /> : null}
                {d.publico ? <Li rot="Público" v={d.publico} /> : null}
                {d.orcamento !== null ? <Li rot="Orçamento" v={dinheiro(d.orcamento)} /> : null}
                {d.aprovacao
                  ? <Li rot="Aprovação" v={`${d.aprovacao}${d.aprovacao_nota ? ` — ${d.aprovacao_nota}` : ''}`} />
                  : d.falta_aprovacao
                    ? <Li rot="Aprovação" v="esperando a liderança decidir" />
                    : null}
                {/* "DATA E HORÁRIO DA ABERTURA" É O PRIMEIRO ITEM DE
                    IDENTIFICAÇÃO NO PDF, e esta linha mostrava só a frase
                    relativa — que nos primeiros 30 dias nem data tem. Ver
                    `carimbo` em `regras.ts`: data, hora e a frase, na mesma
                    linha, sem elemento novo. */}
                <Li rot="Aberta" v={carimbo(d.criada_em)} />
              </tbody>
            </table>
          </div>

          {v.anexos.length ? (
            <div className="dm-card">
              <h3 style={{ marginBottom: 8 }}>Anexos</h3>
              {/* O QUE MUDOU AQUI, E POR QUE CADA COISA.

                  O anexo deste sistema e um LINK para a conta de alguem, nao
                  um arquivo guardado pela igreja. Entao o unico jeito de a
                  pessoa saber para onde vai e antes de clicar. O servidor
                  (migracao 85) passou a guardar o rotulo com o host junto, e
                  aqui aparecem as outras tres respostas que a ficha nao dava:

                  - QUEM colou. Medido: qualquer pessoa do setor podia pregar
                    um "boleto atualizado.pdf" numa compra de outra. Hoje so
                    quem atende ou quem abriu consegue, mas a ficha continuar
                    anonima seria esconder metade do conserto.
                  - SE chegou depois de a demanda fechar. Prestacao de contas
                    fechada em marco que recebe "nota fiscal REAL.pdf" em
                    setembro nao pode parecer igual ao que estava la quando a
                    decisao foi tomada.
                  - E como TIRAR. Antes nao havia nenhum caminho: nem pela
                    tela nem pelo banco. */}
              <ul className="dm-peq" style={{ margin: 0, paddingLeft: 18 }}>
                {v.anexos.map((a, i) => (
                  <li key={a.id || i} style={{ marginBottom: 6 }}>
                    <a className="dm-anexo-link" href={a.url} target="_blank" rel="noopener noreferrer">{a.nome}</a>
                    <div className="dm-mudo" style={{ fontSize: 12 }}>
                      {a.quem ? `${a.quem} · ` : ''}{dataCurta(a.em)}
                      {a.depois_de_fechar ? <b> · juntado depois de concluída</b> : null}
                      {/* QUEM PODE TIRAR QUEM DIZ E O SERVIDOR — 22/09/2026.

                          Era `v.eu.atende || v.eu.abriu`, em TODO anexo. Mas o
                          servidor aceita `pode_atender OR o anexo e meu`: quem
                          abriu e nao atende so tira o que ele mesmo colou. A
                          solicitante tocava em "tirar" no boleto que Compras
                          pregou e lia "Esse anexo nao esta mais aqui, ou nao e
                          seu para tirar."

                          A tela nao tinha como acertar sozinha: o payload
                          trazia `quem` (o NOME) e nunca o id. A migracao 89 faz
                          `dem_ver` decidir por anexo, com a MESMA expressao do
                          `desanexar`, e aqui so se obedece. */}
                      {a.posso_tirar ? (
                        <>
                          {' · '}
                          <button className="dm-btn dm-mini" disabled={indo}
                            onClick={() => agir('desanexar', { anexo_id: a.id })}>tirar</button>
                        </>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* --------------------------------------------------- o WhatsApp */}
          <Recados d={d} base={base} eu={v.eu} />
        </div>

        {/* ------------------------------------------------------- as ações */}
        <div>
          <div className="dm-card">
            <h3 style={{ marginBottom: 10 }}>O que dá para fazer</h3>
            {/* O CARTAO RENDERIZAVA VAZIO, SEM UMA PALAVRA — 22/09/2026.

                Doze `{acoes.includes(...) ? <button/> : null}` e nenhum ramo
                de saida. `comentar` e `desanexar` nao tem botao na grade,
                entao quem so pode comentar via um cartao com titulo e nada
                dentro. E nao e caso exotico: `pode_ver` da visao a TODO o
                setor solicitante, e `pode_atender` nao. Qualquer pessoa do
                setor que pediu, que nao abriu aquela demanda, caia nisso.

                A LISTA VIROU CONSTANTE NOMEADA — 22/09/2026. Ela era
                `a !== 'comentar' && a !== 'desanexar'` escrito no filtro, e
                as duas metades envelheceram no mesmo dia: `desanexar` saiu de
                `acoesDe` (quem decide e o `posso_tirar` por anexo) e `validar`
                entrou SEM botao na grade, de proposito. Esquecer de por
                `validar` aqui faria o cartao se achar cheio e nao escrever a
                frase — cartao vazio de novo, pelo caminho novo. */}
            {acoes.filter(a => !FORA_DA_GRADE.includes(a)).length === 0 ? (
              <p className="dm-peq dm-mudo" style={{ margin: 0 }}>
                {d.status === 'concluida' || d.status === 'cancelada'
                  ? 'Esta demanda já foi encerrada. Você pode escrever aqui embaixo.'
                  : d.falta_aprovacao
                    ? 'Esta demanda está parada esperando a liderança aprovar. Você pode escrever aqui embaixo.'
                    : 'Quem toca esta demanda é o setor responsável. Você acompanha e pode escrever aqui embaixo.'}
              </p>
            ) : null}
            <div className="dm-grade">
              {acoes.includes('aprovar') ? (
                <button className="dm-btn dm-pri" disabled={indo} onClick={() => setAberto('aprovar')}>Aprovar</button>
              ) : null}
              {acoes.includes('rejeitar') ? (
                <button className="dm-btn dm-perigo" disabled={indo} onClick={() => setAberto('rejeitar')}>Recusar</button>
              ) : null}
              {acoes.includes('assumir') ? (
                <button className="dm-btn dm-pri" disabled={indo} onClick={() => agir('assumir')}>Assumir e começar</button>
              ) : null}
              {acoes.includes('concluir') ? (
                <button className="dm-btn dm-pri" disabled={indo} onClick={() => setAberto('concluir')}>Concluir</button>
              ) : null}
              {acoes.includes('travar') ? (
                <button className="dm-btn" disabled={indo} onClick={() => setAberto('travar')}>Travar</button>
              ) : null}
              {acoes.includes('destravar') ? (
                <button className="dm-btn dm-pri" disabled={indo} onClick={() => setAberto('destravar')}>
                  {v.eu.abriu && d.travada_por === 'informacao' ? 'Responder e destravar' : 'Destravar'}
                </button>
              ) : null}
              {acoes.includes('reabrir') ? (
                <button className="dm-btn" disabled={indo} onClick={() => setAberto('reabrir')}>Reabrir</button>
              ) : null}
              {acoes.includes('prazo') ? (
                <button className="dm-btn" disabled={indo} onClick={() => setAberto('prazo')}>Mudar o prazo</button>
              ) : null}
              {acoes.includes('prioridade') ? (
                <button className="dm-btn" disabled={indo} onClick={() => setAberto('prioridade')}>Rever a prioridade</button>
              ) : null}
              {acoes.includes('redirecionar') ? (
                <button className="dm-btn" disabled={indo} onClick={() => setAberto('redirecionar')}>Mandar para outro setor</button>
              ) : null}
              {acoes.includes('anexar') ? (
                <button className="dm-btn" disabled={indo} onClick={() => setAberto('anexar')}>Juntar um anexo</button>
              ) : null}
              {acoes.includes('cancelar') ? (
                <button className="dm-btn dm-perigo" disabled={indo} onClick={() => setAberto('cancelar')}>Cancelar</button>
              ) : null}
            </div>
          </div>

          <div ref={cxForm}>
            <Formulario aberto={aberto} d={d} b={b} eu={v.eu} indo={indo}
              fechar={() => setAberto('')} agir={agir} />
          </div>

          {/* A DICA MANDAVA MARCAR UMA COISA QUE NÃO HAVIA COMO MARCAR.

              22/09/2026. A coluna `eventos.interno` existe desde a migração
              50, `dem_mover` aceita a chave `interno` no `comentar` (50:657),
              `dem_ver` esconde o interno de quem não atende (50:623) e a folha
              tem `.dm-hist .dm-interno`. Faltava a única coisa que faz tudo
              isso funcionar: um controle que mandasse a chave. NENHUM dos sete
              usos de `CaixaDeAcao` mandava, e esta dica pedia para "marcar
              como interno" — texto de tela apontando para um botão que não
              existe é pior que não dizer nada, porque a pessoa procura.

              Sem peça nova: `CaixaDeAcao` já aceita `extra`, que é onde o
              "Por que atrasou" do concluir mora. Só para quem atende, porque
              `dem_mover` faz `and demandas.pode_atender(m, d)` no gravar —
              oferecer a caixinha a quem pediu seria oferecer um controle que
              o servidor ignora em silêncio, que é a pior forma de recusa.

              E ela volta para desmarcada depois de gravar: uma caixinha que
              fica marcada faz o PRÓXIMO comentário sumir da vista de quem
              pediu sem ninguém perceber. */}
          <CaixaDeAcao rot="Escrever alguma coisa" botao="Comentar" salvando={indo}
            teto={tetoDe('comentar')}
            dica={v.eu.atende ? 'O que for combinação da equipe, marque aqui embaixo: quem pediu não vê.' : undefined}
            extra={v.eu.atende ? (
              <label className="dm-linha dm-peq" style={{ marginBottom: 'var(--dm-e2)' }}>
                <input type="checkbox" checked={interno} style={{ width: 'auto', minHeight: 0 }}
                  onChange={e => setInterno(e.target.checked)} />
                Só para a equipe (quem pediu não vê)
              </label>
            ) : undefined}
            aoEnviar={async t => {
              const deu = await agir('comentar', { texto: t, interno });
              if (deu) setInterno(false);
              return deu;
            }} />
        </div>
      </div>

      {/* --------------------------------------------------------- histórico */}
      <h2 style={{ margin: 'var(--dm-e4) 0 var(--dm-e2)' }}>O que já aconteceu</h2>
      <ul className="dm-hist">
        {v.eventos.map((e, i) => (
          <li key={i} className={marco(e.tipo) ? 'dm-marco' : ''}>
            {/* COR SOZINHA NÃO INFORMA — 22/09/2026.

                O comentário interno se distinguia só pela tarja da folha
                (`.dm-hist .dm-interno`: borda e fundo). Quem não enxerga cor,
                quem usa leitor de tela e quem imprime a ficha lê o comentário
                interno exatamente como lê um público — e interno é justamente
                o que NÃO pode ser confundido com o que quem pediu vai ler.

                A palavra vai ao lado do carimbo, que é onde o olho já vai
                buscar "quem e quando". */}
            <div className={e.interno ? 'dm-interno' : ''}>
              <div className="dm-q">
                {frase(e)} <span className="dm-mudo">· {quando(e.em)}</span>
                {e.interno ? <span className="dm-mudo"> · interno (só a equipe vê)</span> : null}
              </div>
              {e.texto ? <div className="dm-t">{e.texto}</div> : null}
            </div>
          </li>
        ))}
      </ul>
      {v.eventos.length === 0 ? <p className="dm-mudo dm-peq">Nada ainda.</p> : null}

      <button className="dm-btn" style={{ marginTop: 'var(--dm-e3)' }} onClick={() => router.push('/demandas')}>
        Voltar para a lista
      </button>
    </>
  );
}

function Li({ rot, v }: { rot: string; v: string }) {
  return <tr><th style={{ width: '38%', paddingTop: 10 }}>{rot}</th><td>{v}</td></tr>;
}

/* `validacao` entra como marco (migração 91): ela fecha a etapa 5 do PDF, que
   é uma decisão de pessoa, não um recado. */
const marco = (t: string) =>
  t === 'abertura' || t === 'status' || t === 'aprovacao' || t === 'reabertura'
  || t === 'validacao';

function frase(e: { tipo: string; de: string | null; para: string | null; quem: string | null }): string {
  const q = e.quem ? e.quem.split(' ')[0] : 'alguém';
  switch (e.tipo) {
    case 'abertura':    return `${q} abriu a demanda`;
    case 'status':      return `${q} mudou de ${rotStatus((e.de || 'aberta') as never)} para ${rotStatus((e.para || 'aberta') as never)}`;
    case 'responsavel': return e.para ? `${q} passou para ${e.para}` : `${q} soltou o responsável`;
    case 'setor':       return `${q} mandou de ${e.de} para ${e.para}`;
    case 'prazo':       return `${q} mudou o prazo${e.de ? ` de ${dataCurta(e.de)}` : ''} para ${e.para ? dataCurta(e.para) : 'sem data'}`;
    case 'prioridade':  return `${q} mudou a prioridade de ${e.de} para ${e.para}`;
    case 'aprovacao':   return `${q} marcou a aprovação como ${e.para}`;
    case 'reabertura':  return `${q} reabriu`;
    case 'anexo':       return `${q} juntou um anexo`;
    case 'comentario':  return `${q} escreveu`;
    /* "confirmou que resolveu" e nao "validou": a palavra do PDF e de
       processo, e quem le esta linha e a pessoa que pediu. */
    case 'validacao':   return `${q} confirmou que resolveu`;
    default:            return `${q}: ${e.tipo}`;
  }
}

/* ---------------------------------------------------------------- recados */
function Recados({ d, base, eu }: {
  d: Vista['demanda']; base: string; eu: Vista['eu'];
}) {
  const alvo = eu.atende
    ? { nome: d.abriu, tel: d.abriu_telefone, quem: 'quem pediu' }
    : { nome: d.responsavel || '', tel: d.resp_telefone, quem: 'quem atende' };
  const tipo = d.status === 'concluida' ? 'pronta'
    : d.status === 'travada' && d.travada_por === 'informacao' ? 'pergunta'
    : 'mudou';
  const texto = recado(d, base, tipo as never);
  const zap = linkZap(alvo.tel, texto);
  if (!zap && !alvo.nome) return null;
  return (
    <div className="dm-card">
      <h3 style={{ marginBottom: 6 }}>Avisar {alvo.quem}</h3>
      <p className="dm-peq dm-mudo">O recado já vem escrito, com o link direto desta demanda.</p>
      <div className="dm-linha">
        {zap
          ? <a className="dm-btn dm-zap" href={zap} target="_blank" rel="noopener noreferrer">
              Mandar para {alvo.nome.split(' ')[0]}
            </a>
          : <span className="dm-peq dm-mudo">{alvo.nome || 'Essa pessoa'} não tem telefone cadastrado.</span>}
        <Copiar texto={texto} rot="Copiar o recado" />
      </div>
    </div>
  );
}

/* -------------------------------------------- o formulário da ação aberta */
function Formulario({ aberto, d, b, eu, indo, fechar, agir }: {
  aberto: Acao | ''; d: Vista['demanda']; b: Bases | null; eu: Vista['eu']; indo: boolean;
  fechar: () => void;
  /* devolve `false` quando o servidor recusou, e é assim que a `CaixaDeAcao`
     sabe que NÃO pode apagar o que a pessoa escreveu */
  agir: (a: Acao, dados?: Record<string, unknown>) => Promise<boolean>;
}) {
  const [motivo, setMotivo] = useState<'informacao' | 'aprovacao' | 'terceiros'>('informacao');
  const [prazo, setPrazo] = useState(d.prazo || '');
  const [prio, setPrio] = useState(d.prioridade);
  const [setor, setSetor] = useState(d.setor_responsavel_id);
  const [url, setUrl] = useState('');
  const [atraso, setAtraso] = useState('');

  if (!aberto || aberto === 'comentar') return null;
  const fecha = <button className="dm-btn dm-peq" onClick={fechar}>Deixa pra lá</button>;

  if (aberto === 'concluir') {
    /* `HOJE()` E NAO `toISOString()` — 22/09/2026.

       `new Date().toISOString()` e SEMPRE UTC. Das 21h do Rio a meia-noite a
       tela pedia motivo de atraso de uma demanda que vence HOJE. O servidor
       usa `demandas.hoje()`, que e o dia do Rio; `HOJE()` e o mesmo remedio
       deste lado, e ja estava neste arquivo para outras contas. */
    const tarde = !!d.prazo && d.prazo < HOJE();
    /* "OPCIONAL" ERA MENTIRA, E RECUSAVA TODA CONCLUSAO ATRASADA.

       `supabase/86` recusa concluir sem `atraso` quando o prazo ja passou:
       `ATRASO_PRECISA_MOTIVO`. O campo aparecia JUSTAMENTE porque a demanda
       esta atrasada, dizia "Opcional", e o botao ficava habilitado so com a
       conclusao preenchida. Toda conclusao atrasada era recusada uma vez.

       O "Deixa pra la" tambem sumia quando `tarde`, porque o `extra` e um so:
       era ou o campo ou o botao de fechar. Agora sao os dois. */
    return (
      <CaixaDeAcao rot="O que foi feito" botao="Concluir" salvando={indo} teto={tetoDe('concluir')}
        dica="A conclusão precisa dizer o que foi realizado. É o que quem pediu vai ler."
        podeEnviar={!tarde || !!atraso.trim()}
        extra={tarde ? (
          <>
            <Campo rot="Por que atrasou"
              ajuda="Obrigatório: esta demanda passou do prazo, e o servidor não conclui sem isto.">
              <input value={atraso} maxLength={tetoDe('atraso')}
                onChange={e => setAtraso(e.target.value)} />
            </Campo>
            {fecha}
          </>
        ) : fecha}
        aoEnviar={t => agir('concluir', { texto: t, atraso })} />
    );
  }
  if (aberto === 'travar') {
    return (
      <div className="dm-card">
        {/* O SELETOR OFERECIA UMA TRAVA QUE O SERVIDOR RECUSA — 22/09/2026.

            `supabase/85` recusa `motivo = 'aprovacao'` quando a demanda JA foi
            aprovada e quem pede nao e lideranca: `SO_GESTOR_REABRE_APROVACAO`.
            Estado normalissimo — demanda aprovada, em execucao, quem atende
            quer devolver para a lideranca. `acoesDe` nao tem como cobrir, ela
            decide por ACAO e nunca por motivo. Quem cobre e o seletor. */}
        <Campo rot="Por que está travada">
          <select value={motivo} onChange={e => setMotivo(e.target.value as never)}>
            {TRAVAS.filter(t => t.v !== 'aprovacao'
                             || d.aprovacao !== 'aprovada'
                             || quemManda(eu.papel))
                   .map(t => <option key={t.v} value={t.v}>{t.rot}</option>)}
          </select>
        </Campo>
        <CaixaDeAcao rot="O que falta, exatamente" botao="Travar" salvando={indo}
          teto={tetoDe('travar')}
          dica="Quem pediu vai ler isto. Seja específico: “qual sala?” resolve; “falta informação” não."
          extra={fecha}
          aoEnviar={t => agir('travar', { motivo, texto: t })} />
      </div>
    );
  }
  if (aberto === 'destravar') {
    return (
      <CaixaDeAcao rot={eu.abriu ? 'A sua resposta' : 'O que destravou'} botao="Destravar"
        salvando={indo} exigeTexto={false} extra={fecha} teto={tetoDe('destravar')}
        aoEnviar={t => agir('destravar', { texto: t })} />
    );
  }
  if (aberto === 'cancelar') {
    return (
      <CaixaDeAcao rot="Por que cancelar" botao="Cancelar a demanda" tom="perigo" salvando={indo} teto={tetoDe('cancelar')}
        dica="Fica no histórico. Cancelar sem motivo é perder a informação de por que não foi feito."
        extra={fecha} aoEnviar={t => agir('cancelar', { texto: t })} />
    );
  }
  if (aberto === 'reabrir') {
    return (
      <CaixaDeAcao rot="O que não ficou resolvido" botao="Reabrir" salvando={indo} teto={tetoDe('reabrir')}
        dica="A demanda volta para execução com o histórico inteiro." extra={fecha}
        aoEnviar={t => agir('reabrir', { texto: t })} />
    );
  }
  if (aberto === 'aprovar') {
    return (
      <CaixaDeAcao rot="Observação da aprovação" botao="Aprovar" salvando={indo} exigeTexto={false} teto={tetoDe('aprovar')}
        dica="Depois disto o setor responsável pode começar." extra={fecha}
        aoEnviar={t => agir('aprovar', { texto: t })} />
    );
  }
  if (aberto === 'rejeitar') {
    return (
      <CaixaDeAcao rot="Por que não aprovar" botao="Recusar" tom="perigo" salvando={indo} teto={tetoDe('rejeitar')}
        dica="A demanda é encerrada com este motivo, e quem pediu lê." extra={fecha}
        aoEnviar={t => agir('rejeitar', { texto: t })} />
    );
  }
  if (aberto === 'prazo') {
    /* BECO SEM SAIDA GARANTIDO — 22/09/2026.

       `supabase/86` recusa tirar o prazo sem motivo: `SEM_PRAZO_PRECISA_MOTIVO`,
       que a tela traduz como "Para tirar o prazo, diga por que". So que aqui
       nao havia NENHUM campo de texto, entao nao havia onde dizer.

       E nao era caso de borda: `prazo` nasce com `d.prazo || ''`, entao numa
       demanda SEM prazo bastava abrir o formulario e tocar em Gravar, sem ter
       mexido em nada, para cair no erro sem saida.

       `/demandas/nova` ja tinha o par "Nao tenho data" + "Por que nao tem
       data". Esta tela nao tinha recebido o par. */
    const tirando = !prazo;
    return (
      <div className="dm-card">
        <Campo rot="Novo prazo"
          ajuda="Deixe em branco para tirar a data. O registro retroativo é aceito: data no passado vale.">
          {/* SEM `min`: a 89 deixou registrado por que. O servidor aceita data
              no passado DE PROPOSITO ("a lampada queimou semana passada, poe
              ai"), e no seletor nativo do celular a roda nao desce abaixo do
              `min` — nao existe "digitar". */}
          <input type="date" value={prazo} onChange={e => setPrazo(e.target.value)} />
        </Campo>
        {tirando ? (
          <CaixaDeAcao rot="Por que fica sem data" botao="Gravar sem data" salvando={indo}
            teto={tetoDe('sem_prazo')} extra={fecha}
            dica="“Não sei quando” serve. O que não serve é sumir com a data sem dizer nada."
            aoEnviar={t => agir('prazo', { prazo: '', texto: t })} />
        ) : (
          <div className="dm-linha">
            <button className="dm-btn dm-pri dm-cresce" disabled={indo}
              onClick={() => agir('prazo', { prazo })}>Gravar</button>
            {fecha}
          </div>
        )}
      </div>
    );
  }
  if (aberto === 'prioridade') {
    return (
      <div className="dm-card">
        <Campo rot="Prioridade" ajuda={PRIORIDADES.find(p => p.v === prio)?.explica}>
          <select value={prio} onChange={e => setPrio(e.target.value as never)}>
            {PRIORIDADES.map(p => <option key={p.v} value={p.v}>{p.rot}</option>)}
          </select>
        </Campo>
        {prio === 'urgente' ? (
          <CaixaDeAcao rot="O que acontece se não for feito" botao="Gravar" salvando={indo} extra={fecha}
            teto={tetoDe('prioridade')}
            aoEnviar={t => agir('prioridade', { prioridade: prio, texto: t })} />
        ) : (
          <div className="dm-linha">
            <button className="dm-btn dm-pri dm-cresce" disabled={indo}
              onClick={() => agir('prioridade', { prioridade: prio })}>Gravar</button>
            {fecha}
          </div>
        )}
      </div>
    );
  }
  if (aberto === 'redirecionar') {
    return (
      <div className="dm-card">
        <Campo rot="Qual setor vai atender" ajuda="Só aparecem os setores que recebem demanda.">
          <select value={setor} onChange={e => setSetor(e.target.value)}>
            {(b?.setores || []).filter(s => s.atende).map(s => (
              <option key={s.id} value={s.id}>{s.nome}</option>
            ))}
          </select>
        </Campo>
        <div className="dm-linha">
          <button className="dm-btn dm-pri dm-cresce" disabled={indo} onClick={() => agir('redirecionar', { setor })}>
            Mandar
          </button>
          {fecha}
        </div>
      </div>
    );
  }
  if (aberto === 'anexar') {
    return (
      <div className="dm-card">
        <Campo rot="Link do arquivo">
          <input value={url} placeholder="https://…" onChange={e => setUrl(e.target.value)} />
        </Campo>
        <div className="dm-linha">
          <button className="dm-btn dm-pri dm-cresce" disabled={indo || !url.trim()}
            onClick={() => agir('anexar', { url: url.trim(), nome: url.trim().split('/').pop() })}>Juntar</button>
          {fecha}
        </div>
      </div>
    );
  }
  return null;
}
