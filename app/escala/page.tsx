'use client';
import Shell, { useApp, copiar } from '@/components/Shell';
import { useEffect, useRef, useState } from 'react';
import { mudarStatus, salvarDia, salvarDias } from '@/lib/db';
import { Aviso, Escolha } from '@/components/Ui';
import { aviseHumano } from '@/lib/erros';
import {
  candidatos, cultosDoMes, fmtDia, funcoesAtivas, funcoesDoDia, garantirDia, gerarDia, gerarMes,
  hojeISO, MESES, msgColeta, msgConfirmar, msgEscala, nomeDe, problemas, respostaDe, respostasDoDia,
  resumoDia, Status, sugerirPlantao, tipoDoDia, SITUACOES, Estado,
} from '@/lib/engine';

/* =============================================================================
   A ESCALA

   O QUE A TELA ANTIGA FAZIA DE ERRADO, MEDIDO E NÃO SUPOSTO

   1. O CULTO QUE IMPORTA FICAVA NO FIM. Nove cultos em ordem de data, sete já
      passados, e o próximo era o oitavo cartão. O líder abria a escala e
      rolava por sete domingos mortos para chegar naquilo que ele veio fazer.
      Agora o que ainda vem fica em cima, em ordem de data, e o que passou fica
      recolhido embaixo: continua a um toque, some do caminho.

   2. NO CELULAR NÃO DAVA PARA LER QUEM ESTAVA ESCALADO. Avatar colorido +
      select + dois botões de ícone dividiam 390px, e o nome saía cortado em
      "William Si", "Maria Edu", "João Vict". O avatar mostrava duas letras do
      nome que ele mesmo estava cortando. Saiu; o nome ficou inteiro.

   3. O LÍDER NÃO CONSEGUIA REGISTRAR O QUE ACONTECEU. Mudar a situação de
      alguém (confirmou, não pôde, furou) só existia no painel, e só para o
      próximo culto. Aqui, onde ele olha a escala, não tinha. O banco confirma:
      0 furos marcados em 92 escalações. Agora quem e situação moram na mesma
      linha, em todos os cultos.

   4. COBRAR CONFIRMAÇÃO NÃO TINHA BOTÃO. 50 das 64 escalações futuras estão
      pendentes. Existia cobrança individual (no painel) e cobrança de
      DISPONIBILIDADE do mês (aqui), que é outra pergunta. Cobrar a confirmação
      de um domingo, no grupo, de uma vez, não existia em lugar nenhum, e é o
      que o líder faz na terça de manhã.

   5. VERMELHO NO PASSADO. Um domingo vivido aparecia com "5/9 confirmados" em
      vermelho. Vermelho tem que querer dizer "o culto corre risco", não "cinco
      pessoas não apertaram um botão num app três semanas atrás". Dia que
      passou agora conta o que aconteceu, e só grita se alguém furou.

   6. ÍCONE SEM NOME. Estrela e cadeado, sem rótulo, com `title` que no celular
      não existe. E o cadeado ativo era preto sobre preto: invisível. Viraram
      palavras: travar / travado, 1ª vez.

   O QUE FOI PRESERVADO INTEIRO: o motor e todas as ações que já funcionavam.
   Sortear o mês, sortear o dia, trocar, travar, marcar primeira vez, recado,
   plantão, e o retrato local que restaura a tela quando o save falha, que é a
   coisa que impede o líder de publicar uma escala que o banco nunca recebeu.
   ============================================================================= */

const ehFollow = (d: string) => tipoDoDia(d) === 'follow';
const nomeDia = (d: string) => (ehFollow(d) ? 'Follow, sábado' : 'domingo');

export default function Pagina() { return <Shell><Escala /></Shell>; }

function Escala() {
  const { S, recarregar, aviso, base, equipe } = useApp();
  const hoje = hojeISO();
  const semFuncoes = funcoesAtivas(S).length === 0;

  /* Quando o save falha, o recarregar de recuperação costuma falhar junto
     (a causa é a mesma: rede). Sem restaurar o retrato local, a tela seguia
     mostrando uma escala que o banco nunca recebeu — e o líder publicava. */
  const retrato = (datas: string[]) =>
    datas.map(d => [d, S.escalas[d] ? JSON.parse(JSON.stringify(S.escalas[d])) : null] as const);
  async function falhou(e: any, snap: ReturnType<typeof retrato>) {
    const est = await recarregar();
    if (!est) for (const [d, dia] of snap) { if (dia) S.escalas[d] = dia; else delete S.escalas[d]; }
    aviso(aviseHumano(e, 'salvar'));
  }

  const [ano, setAno] = useState(+hoje.slice(0, 4));
  const [mes, setMes] = useState(+hoje.slice(5, 7));
  const [ocupado, setOcupado] = useState(false);
  const [verPassado, setVerPassado] = useState(false);
  const dias = cultosDoMes(ano, mes);
  const futuros = dias.filter(d => d >= hoje);
  const passados = dias.filter(d => d < hoje);
  const proximo = futuros[0];
  const rolou = useRef(false);

  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get('m');
    if (m && /^\d{4}-\d{2}$/.test(m)) { setAno(+m.slice(0, 4)); setMes(+m.slice(5, 7)); }
  }, []);
  useEffect(() => {
    if (rolou.current || !window.location.hash) return;
    const el = document.getElementById(window.location.hash.slice(1));
    if (el) { rolou.current = true; el.scrollIntoView({ block: 'start' }); }
  });

  function mover(n: number) {
    let m = mes + n, a = ano;
    if (m > 12) { m = 1; a++; } if (m < 1) { m = 12; a--; }
    setMes(m); setAno(a); setVerPassado(false);
  }

  /* ------------------------------------------------------------- as ações
     Nenhuma mudou. São as mesmas funções da tela anterior, na mesma ordem,
     com as mesmas confirmações e o mesmo retrato de recuperação. */
  async function gerarTudo() {
    if (semFuncoes) { aviso('Este ministério ainda não tem funções. Crie em Ajustes.'); return; }
    if (!futuros.length) { aviso('Esse mês já passou inteiro'); return; }
    if (!confirm(futuros.length === 1
      ? `Isso remonta o único culto de ${MESES[mes - 1]} que ainda não passou. Quem você travou e quem já confirmou não mudam. Seguir?`
      : `Isso remonta os ${futuros.length} cultos de ${MESES[mes - 1]} que ainda não passaram (domingos e sábados do Follow). Quem você travou e quem já confirmou não mudam. Seguir?`)) return;
    setOcupado(true);
    const snap = retrato(futuros);
    try {
      const r = gerarMes(S, ano, mes, hoje);
      await salvarDias(S, futuros, equipe!.id);
      await recarregar();
      const v = r.reduce((a, x) => a + x.vagas.length, 0);
      aviso(v ? `Pronto, mas faltou gente em ${v} ${v === 1 ? 'função' : 'funções'}` : 'Mês montado, sem buracos');
    } catch (e: any) { await falhou(e, snap); }
    setOcupado(false);
  }

  async function gerarUm(d: string) {
    if (semFuncoes) { aviso('Este ministério ainda não tem funções. Crie em Ajustes.'); return; }
    if (d < hoje && !confirm('Esse culto já passou. Sortear de novo apaga quem furou nele. Seguir mesmo assim?')) return;
    setOcupado(true);
    const snap = retrato([d]);
    try {
      const r = gerarDia(S, d);
      await salvarDia(S, d, equipe!.id); await recarregar();
      aviso(r.vagas.length ? `Faltou gente em ${r.vagas.join(', ')}` : 'Dia montado');
    } catch (e: any) { await falhou(e, snap); }
    setOcupado(false);
  }

  async function trocar(d: string, funcao: string, vid: string) {
    const atual = S.escalas[d]?.slots?.[funcao];
    /* trocar ou limpar alguém que JÁ respondeu apaga essa resposta: avisar antes */
    if (atual?.vid && atual.status && atual.status !== 'pendente' && atual.vid !== vid) {
      const nome = nomeDe(S, atual.vid).split(' ')[0];
      const oQue = atual.status === 'confirmado' ? `${nome} já CONFIRMOU esse dia`
        : atual.status === 'furou' ? `${nome} está marcado como FUROU (isso conta no histórico)`
        : `${nome} avisou que não pode`;
      if (!confirm(`${oQue}. Trocar apaga essa resposta. Seguir?`)) return;
    }
    setOcupado(true);
    const snap = retrato([d]);
    try {
      const dia = garantirDia(S, d);
      if (!vid) delete dia.slots[funcao];
      else dia.slots[funcao] = { vid, status: 'pendente', fixo: true };
      await salvarDia(S, d, equipe!.id); await recarregar();
    } catch (e: any) { await falhou(e, snap); }
    setOcupado(false);
  }

  /* A situação de quem já está escalado. Existia só no painel, e só para o
     próximo culto: era por isso que o banco tinha 0 furos marcados. */
  async function situacao(d: string, funcao: string, st: Status) {
    const dia = S.escalas[d];
    const f = S.funcoes.find(x => x.nome === funcao);
    if (!dia?.cultoId || !f?.id) return;
    setOcupado(true);
    const snap = retrato([d]);
    try { await mudarStatus(dia.cultoId, f.id, st); await recarregar(); }
    catch (e: any) { await falhou(e, snap); }
    setOcupado(false);
  }

  async function travar(d: string, funcao: string) {
    const dia = garantirDia(S, d);
    if (!dia.slots[funcao]) return;
    setOcupado(true);
    const snap = retrato([d]);
    dia.slots[funcao].fixo = !dia.slots[funcao].fixo;
    try { await salvarDia(S, d, equipe!.id); await recarregar(); aviso(dia.slots[funcao]?.fixo ? 'Travado: o sorteio não mexe' : 'Destravado'); }
    catch (e: any) { await falhou(e, snap); }
    setOcupado(false);
  }

  /* marca ESTE domingo como a primeira vez da pessoa na função: ela recebe no
     link a instrução de chegar mais cedo. É por dia, não é nível fixo. */
  async function marcarPrimeira(d: string, funcao: string) {
    const dia = garantirDia(S, d);
    const sl = dia.slots[funcao];
    if (!sl?.vid) return;
    setOcupado(true);
    const snap = retrato([d]);
    sl.primeiraVez = !sl.primeiraVez;
    try { await salvarDia(S, d, equipe!.id); await recarregar(); aviso(dia.slots[funcao]?.primeiraVez ? 'Marcado como 1ª vez: a pessoa vai chegar mais cedo' : 'Tirada a marca de 1ª vez'); }
    catch (e: any) { await falhou(e, snap); }
    setOcupado(false);
  }

  async function salvarObs(d: string, txt: string) {
    if (ocupado) return;               // nunca concorre com sorteio/troca em voo
    setOcupado(true);
    const snap = retrato([d]);
    garantirDia(S, d).obs = txt;
    try { await salvarDia(S, d, equipe!.id); await recarregar(); aviso('Recado salvo'); }
    catch (e: any) { await falhou(e, snap); }
    setOcupado(false);
  }

  async function novoPlantao(d: string) {
    setOcupado(true);
    const snap = retrato([d]);
    const dia = garantirDia(S, d);
    dia.plantao = sugerirPlantao(S, d, Math.max(1, S.config.plantaoQtd));
    try { await salvarDia(S, d, equipe!.id); await recarregar(); }
    catch (e: any) { await falhou(e, snap); }
    setOcupado(false);
  }

  /* ------------------------------------------------------------- o placar
     Um número para o mês, e é o que decide se o culto acontece. Vaga primeiro;
     sem vaga, quantos ainda não responderam. */
  const contas = futuros.reduce((a, d) => {
    if (!S.escalas[d]) { a.aMontar++; return a; }
    const r = resumoDia(S, d);
    a.vagas += r.vagas.length; a.pendentes += r.pendentes; a.furos += r.furos;
    return a;
  }, { vagas: 0, pendentes: 0, furos: 0, aMontar: 0 });

  const placar = contas.aMontar === futuros.length && futuros.length
    ? { n: futuros.length, un: '', rot: futuros.length === 1 ? 'culto a montar' : 'cultos a montar' }
    : contas.vagas ? { n: contas.vagas, un: '', rot: contas.vagas === 1 ? 'vaga sem ninguém' : 'vagas sem ninguém' }
    : contas.pendentes ? { n: contas.pendentes, un: '', rot: 'ainda não confirmaram' }
    : futuros.length ? { n: 0, un: '', rot: 'tudo confirmado' }
    : null;
  const urge = contas.vagas > 0 || contas.furos > 0;

  return (
    <div className="lid">
      {/* ---------------------------------------------------------- a faixa */}
      <div className={`lid-faixa ${urge ? 'fogo' : ''}`}>
        <div className="lid-faixa-in">
          <div className="lid-faixa-txt">
            <span className="rot">Escala</span>
            <div className="esc-mes">
              <button className="esc-seta" aria-label="Mês anterior" onClick={() => mover(-1)}>‹</button>
              <h1>{MESES[mes - 1]} {ano}</h1>
              <button className="esc-seta" aria-label="Próximo mês" onClick={() => mover(1)}>›</button>
            </div>
            <p className="lid-faixa-sub">
              {!futuros.length ? 'Esse mês já passou inteiro. Use as setas para ir para o próximo.'
                : contas.aMontar === futuros.length ? 'Nada montado ainda. O sorteio respeita quem não pode e quem já serviu.'
                : contas.vagas ? 'Vaga sem ninguém é o que faz o culto não acontecer. É por onde começar.'
                : contas.pendentes ? 'A escala está de pé. Falta a confirmação de quem foi escalado.'
                : 'Mês fechado.'}
            </p>
            <div className="lid-faixa-acoes">
              <button className="lid-bt" disabled={ocupado || !S.voluntarios.length || semFuncoes} onClick={gerarTudo}>
                Montar o mês inteiro
              </button>
              <button className="lid-bt-txt" onClick={() => copiar(msgColeta(S, ano, mes, base), aviso, 'Pedido copiado. Cole no grupo.')}>
                Pedir a disponibilidade
              </button>
            </div>
            {/* O BOTÃO QUE REESCREVE O MÊS NÃO DIZIA O QUE IA FAZER.
                O motor é cuidadoso — quem confirmou e quem foi travado são
                intocáveis, quem recusou não volta a ser sorteado. Só que essa
                garantia estava no comentário do engine, não na tela. O líder
                com pressa lê "Montar o mês inteiro" e a pergunta honesta dele
                é "isso apaga o que a Malu já confirmou?". Sem resposta, ou ele
                não aperta, ou aperta com medo. As duas são caras.

                Isto não é aviso de perigo: é o contrário. É a frase que
                transforma um botão assustador num botão seguro. */}
            <p className="esc-oquefaz">
              Montar e sortear preenchem só o que está vazio: <strong>quem já confirmou e quem
              você travou não se mexe</strong>, e quem avisou que não pode não volta no sorteio.
              Os botões de pedir, copiar e cobrar deixam um texto pronto para você colar no
              grupo — <strong>nada é enviado daqui</strong>.
            </p>
          </div>
          {placar && (
            <div className="lid-placar">
              <b>{placar.n}</b>
              <span>{placar.rot}</span>
            </div>
          )}
        </div>
      </div>

      {semFuncoes && (
        <div style={{ marginTop: 'var(--e5)' }}>
          <Aviso tom="atencao">
            Este ministério ainda não tem <strong>funções</strong> (PROJEÇÃO, VOCAL, RECEPÇÃO…). Sem elas não há o que sortear.
            Crie as funções em <strong>Ajustes → Funções</strong> e depois volte aqui.
          </Aviso>
        </div>
      )}
      {!S.voluntarios.length && (
        <div style={{ marginTop: 'var(--e5)' }}>
          <Aviso tom="atencao">Time vazio. Cadastre as pessoas na aba <strong>Time</strong> antes de montar qualquer coisa.</Aviso>
        </div>
      )}

      {/* A FITA DE DOMINGOS SAIU. Ela existia para pular para um dia no meio
          de nove cartões em ordem de data. Com o próximo em cima e o passado
          recolhido, a lista tem dois a cinco itens e a fita virava uma segunda
          cópia dela, com os mesmos números. Duas listas do mesmo mês, uma
          delas só para navegar na outra, é complexidade que eu mesmo tinha
          acabado de criar. */}

      {/* ---------------------------------------------------- o que ainda vem */}
      {futuros.map(d => (
        <DiaCard key={d} d={d} aberto={d === proximo} passado={false}
          {...{ S, ocupado, semFuncoes, aviso, gerarUm, trocar, situacao, travar, marcarPrimeira, salvarObs, novoPlantao }} />
      ))}

      {/* ------------------------------------------------------ o que passou
          Recolhido. É referência: o líder vem aqui para registrar um furo ou
          conferir o que aconteceu, não para trabalhar. */}
      {!!passados.length && (
        <section className="lid-secao">
          <div className="lid-secao-cab">
            <span className="rot">Já passaram</span>
            <button className="lid-bt-txt" onClick={() => setVerPassado(v => !v)}>
              {verPassado ? 'esconder' : `ver ${passados.length}`}
            </button>
          </div>
          {verPassado && passados.map(d => (
            <DiaCard key={d} d={d} aberto={false} passado
              {...{ S, ocupado, semFuncoes, aviso, gerarUm, trocar, situacao, travar, marcarPrimeira, salvarObs, novoPlantao }} />
          ))}
        </section>
      )}
    </div>
  );
}

/* =========================================================================
   UM CULTO
   ========================================================================= */

/* ============================================================================
   AS PROPS DESTES TRÊS COMPONENTES ERAM `any` — auditoria 29/08/2026.

   `DiaCard`, `Postos` e `Posto` são os três componentes mais complexos da tela
   mais complexa do produto, e os três recebiam `{ ...treze coisas }: any`.
   Com `any` no lugar do contrato, renomear uma prop não quebra a compilação —
   quebra a tela, em produção, na mão do líder.

   E já havia um sintoma: a chamada passa `hoje` e `base` para o `DiaCard`, que
   nunca destrutura nem usa nenhum dos dois. Duas props sendo carregadas por
   toda a árvore sem destino. Com o tipo declarado, o compilador aponta isso na
   hora em vez de deixar passar por mais um ano.
   ============================================================================ */
type FnDoDia = ReturnType<typeof funcoesDoDia>[number];

/* as ações que a tela empresta para os filhos. Todas assíncronas, todas
   começando pela data — é a assinatura real das funções lá em cima. */
type AcoesDoDia = {
  ocupado: boolean;
  semFuncoes: boolean;
  aviso: (t: string) => void;
  gerarUm: (d: string) => Promise<void>;
  trocar: (d: string, funcao: string, vid: string) => Promise<void>;
  situacao: (d: string, funcao: string, st: Status) => Promise<void>;
  travar: (d: string, funcao: string) => Promise<void>;
  marcarPrimeira: (d: string, funcao: string) => Promise<void>;
  salvarObs: (d: string, txt: string) => Promise<void>;
  novoPlantao: (d: string) => Promise<void>;
};

type PropsDiaCard = AcoesDoDia & {
  d: string; aberto: boolean; passado: boolean; S: Estado;
};
type PropsCorpo = AcoesDoDia & {
  d: string; passado: boolean; S: Estado; dia: any; doDia: FnDoDia[];
  probs: ReturnType<typeof problemas>; preenchidos: number;
};
type PropsPosto = Pick<AcoesDoDia, 'ocupado' | 'trocar' | 'situacao' | 'travar' | 'marcarPrimeira'> & {
  d: string; f: FnDoDia; S: Estado; dia: any;
};

function DiaCard({ d, aberto, passado, S, ocupado, semFuncoes, aviso, gerarUm, trocar, situacao, travar, marcarPrimeira, salvarObs, novoPlantao }: PropsDiaCard) {
  const dia = S.escalas[d];
  const doDia = funcoesDoDia(S, d);
  const r = dia ? resumoDia(S, d) : null;
  const probs = dia ? problemas(S, d) : [];
  const preenchidos = doDia.filter((f: any) => dia?.slots?.[f.nome]?.vid).length;
  const semConfirmar = r ? r.pendentes : 0;

  /* O RESUMO DA LINHA FECHADA muda de pergunta conforme o tempo do culto.
     Antes era sempre "N/M confirmados", em vermelho, inclusive num domingo
     vivido há três semanas — vermelho sobre uma coisa que ninguém mais pode
     mudar é o jeito mais rápido de ensinar o líder a ignorar a cor. */
  const resumo = !doDia.length ? { tom: '', txt: 'sem funções neste dia' }
    : passado
      ? r && r.furos ? { tom: 'ruim', txt: r.furos === 1 ? '1 pessoa furou' : `${r.furos} pessoas furaram` }
        : r && r.confirmados ? { tom: '', txt: `${r.confirmados} de ${r.preenchidos} confirmaram` }
        : { tom: '', txt: 'aconteceu' }
    : !dia || !preenchidos ? { tom: 'pend', txt: 'a montar' }
    : r && r.vagas.length ? { tom: 'ruim', txt: r.vagas.length === 1 ? '1 vaga sem ninguém' : `${r.vagas.length} vagas sem ninguém` }
    : r && r.furos ? { tom: 'ruim', txt: `${r.furos} furou` }
    : semConfirmar ? { tom: 'pend', txt: semConfirmar === 1 ? '1 a confirmar' : `${semConfirmar} a confirmar` }
    : { tom: 'ok', txt: 'tudo confirmado' };

  return (
    <details className={`esc-dia ${resumo.tom}`} id={`d${d}`} open={aberto} style={{ scrollMarginTop: 96 }}>
      <summary>
        <span className="lid-marca" aria-hidden="true" />
        <span>
          <span className="esc-dia-nome">{nomeDia(d)}, {fmtDia(d)}</span>
          <span className="esc-dia-sub">
            {passado ? 'já passou' : preenchidos ? `${preenchidos} de ${doDia.length} postos` : `${doDia.length} postos`}
          </span>
        </span>
        <span className="esc-dia-est">{resumo.txt}</span>
      </summary>

      <div className="esc-corpo">
        <Corpo {...{ d, passado, S, dia, doDia, r, probs, preenchidos, ocupado, semFuncoes, aviso,
          gerarUm, trocar, situacao, travar, marcarPrimeira, salvarObs, novoPlantao }} />
      </div>
    </details>
  );
}

function Corpo({ d, passado, S, dia, doDia, probs, preenchidos, ocupado, semFuncoes, aviso,
  gerarUm, trocar, situacao, travar, marcarPrimeira, salvarObs, novoPlantao }: PropsCorpo) {
  const cobranca = msgConfirmar(S, d);

  return (
    <>
      {/* AS AÇÕES DO DIA. Copiar a escala é a que o líder usa toda semana, e
          por isso é a sólida. Cobrar só aparece quando há quem cobrar. */}
      <div className="esc-acoes">
        <button className="lid-bt" onClick={() => copiar(msgEscala(S, d), aviso, 'Escala copiada. Cole no grupo.')}>
          Copiar a escala
        </button>
        <button className="lid-bt-txt" disabled={ocupado || !S.voluntarios.length || semFuncoes} onClick={() => gerarUm(d)}>
          {preenchidos ? 'Sortear de novo' : 'Sortear este dia'}
        </button>
        {!passado && !!cobranca && (
          <button className="lid-bt-txt" onClick={() => copiar(cobranca, aviso, 'Cobrança copiada. Cole no grupo.')}>
            Cobrar quem falta confirmar
          </button>
        )}
      </div>

      {/* OS PROBLEMAS APONTAM PARA A LINHA. Eram frases soltas: o líder lia
          "Fulano está em PROJEÇÃO e ILUMINAÇÃO ao mesmo tempo" e caçava as
          duas linhas numa lista de nove. Agora o texto leva até lá. */}
      {probs.map((p: any, i: number) => (
        <div key={i} className={`esc-prob ${p.grau === 'erro' ? 'ruim' : 'pend'}`}>
          <span className="esc-prob-marca" aria-hidden="true" />
          <span>
            {p.texto}
            {!!p.foco?.length && (
              <a className="esc-prob-ir" href={`#p${d}-${slugFn(p.foco[0])}`}>ir para {p.foco[0]}</a>
            )}
          </span>
        </div>
      ))}

      {!passado && doDia.length > 0 && preenchidos === 0 && (
        <p className="esc-nota">
          Ninguém escalado ainda. <strong>Sortear</strong> preenche tudo de uma vez respeitando
          quem avisou que não pode e quem já serviu recentemente.
        </p>
      )}

      {/* quem respondeu posso/não posso neste dia: é o que decide a escolha */}
      {!passado && <Disponibilidade d={d} S={S} aviso={aviso} />}

      {/* Relatório que o líder ESCALADO escreveu no fim daquele culto. Aqui é
          só leitura: quem viveu o dia é quem escreve, no link dele. */}
      {(dia?.relatorio || dia?.problemas) && (
        <div className="esc-relato">
          <span className="esc-mini">Relatório de quem liderou o dia</span>
          {dia.relatorio && <p>{dia.relatorio}</p>}
          {dia.problemas && <p><strong>Problemas:</strong> {dia.problemas}</p>}
          {dia.relatadoEm && <span className="esc-relato-quando">enviado em {new Date(dia.relatadoEm).toLocaleString('pt-BR')}</span>}
        </div>
      )}

      {/* recado ACIMA da escala: escreve o aviso antes de montar e publicar.
          Ele vai na mensagem do grupo E na tela de quem está escalado. */}
      <label className="esc-recado">
        <span className="esc-mini">Recado deste dia</span>
        <input enterKeyHint="done" defaultValue={dia?.obs || ''} disabled={ocupado}
          placeholder="ex: chegar 18h, tem batismo antes do culto"
          onBlur={e => { if (e.target.value !== (dia?.obs || '')) void salvarObs(d, e.target.value); }} />
        <span className="esc-recado-nota">
          Vai na mensagem do grupo e no link de quem está escalado.
        </span>
      </label>

      {/* ------------------------------------------------------- os postos */}
      <div className="esc-postos">
        {doDia.map((f: any) => (
          <Posto key={f.nome} {...{ d, f, S, dia, ocupado, trocar, situacao, travar, marcarPrimeira }} />
        ))}
      </div>

      {/* plantão embaixo, sozinho */}
      <div className="esc-plantao">
        <span className="esc-mini">Plantão, quem entra se alguém faltar</span>
        <div className="esc-plantao-in">
          <span className={dia?.plantao?.length ? 'esc-plantao-nomes' : 'esc-plantao-vazio'}>
            {dia?.plantao?.length ? dia.plantao.map((p: string) => nomeDe(S, p)).join(', ') : 'ninguém ainda'}
          </span>
          <button className="lid-bt-txt" disabled={ocupado || !S.voluntarios.length || semFuncoes} onClick={() => novoPlantao(d)}>
            sugerir
          </button>
        </div>
      </div>
    </>
  );
}

/* nome de função vira âncora: PROJEÇÃO -> projecao */
const slugFn = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');


function Posto({ d, f, S, dia, ocupado, trocar, situacao, travar, marcarPrimeira }: PropsPosto) {
  const slot = dia?.slots?.[f.nome];
  const st: Status = (slot?.status || 'pendente') as Status;
  const lista = candidatos(S, f.nome, d, { excluirOcupados: false, ignorarLimite: true, incluirTreino: true });
  /* se o ocupante atual deixou de ser candidato (pausado, marcou indisponível,
     perdeu a habilidade), ele sumiria do select e a linha pareceria vazia. */
  const opcoes = slot?.vid && !lista.some((c: any) => c.id === slot.vid)
    ? [{ id: slot.vid, nome: nomeDe(S, slot.vid), nivel: '', carga: 0, forcado: true } as any, ...lista]
    : lista;

  const tom = !slot?.vid ? 'ruim'
    : st === 'confirmado' ? 'ok' : st === 'recusado' || st === 'furou' ? 'ruim' : 'pend';

  return (
    <div className={`esc-posto ${tom}`} id={`p${d}-${slugFn(f.nome)}`}>
      <span className="lid-marca" aria-hidden="true" />
      <div className="esc-posto-in">
        <span className="esc-fn">{f.nome}</span>

        {/* O NOME OCUPA A LINHA INTEIRA e é só o nome. O contexto que ajuda a
            ESCOLHER (nível, carga, se a pessoa disse que pode) vive dentro da
            lista, que é onde ele é usado. */}
        <Escolha
          classe="esc-quem" valor={slot?.vid || ''} vazio={!slot?.vid} desabilitado={ocupado}
          rotulo={`Quem faz ${f.nome} em ${fmtDia(d)}`}
          mostra={slot?.vid ? nomeDe(S, slot.vid) : 'precisa de alguém'}
          aoMudar={v => trocar(d, f.nome, v)}>
          <option value="">precisa de alguém</option>
          {opcoes.map((c: any) => {
            /* quem já disse que pode neste dia vem marcado: é a informação
               que decide a escolha */
            const vol = S.voluntarios.find((v: any) => v.id === c.id);
            const resp = vol ? respostaDe(vol, d) : 'mudo';
            const marca = resp === 'posso' ? 'pode · ' : resp === 'nao' ? 'avisou que não · ' : '';
            return (
              <option key={c.id} value={c.id}>
                {c.forcado ? `${c.nome} (não está mais disponível)`
                  : `${marca}${c.nome} · ${c.nivel} · ${c.carga} escala${c.carga === 1 ? '' : 's'}/${S.config.janelaCarga}d`}
              </option>
            );
          })}
        </Escolha>

        {/* travar e 1ª vez viraram palavras. Eram dois ícones sem rótulo, e o
            cadeado ativo ficava preto sobre preto. */}
        {slot?.vid && (
          <div className="esc-tags">
            <button className={`esc-tag ${slot.fixo ? 'on' : ''}`} disabled={ocupado} onClick={() => travar(d, f.nome)}>
              {slot.fixo ? 'travado' : 'travar'}
            </button>
            <button className={`esc-tag ${slot.primeiraVez ? 'on' : ''}`} disabled={ocupado} onClick={() => marcarPrimeira(d, f.nome)}>
              1ª vez
            </button>
            {slot.fixo && <span className="esc-tag-nota">o sorteio não mexe</span>}
            {slot.primeiraVez && <span className="esc-tag-nota">chega 30 min mais cedo</span>}
          </div>
        )}
      </div>

      {/* A SITUAÇÃO. Não existia nesta tela: só no painel e só para o próximo
          culto. É por isso que o banco tem 0 furos marcados em 92 escalações. */}
      {slot?.vid && (
        <Escolha
          classe="esc-sit" valor={st} desabilitado={ocupado || !dia?.cultoId}
          rotulo={`Situação de ${nomeDe(S, slot.vid)} em ${f.nome}`}
          mostra={SITUACOES.find(s => s.v === st)?.rot || st}
          aoMudar={v => situacao(d, f.nome, v as Status)}>
          {SITUACOES.map(s => <option key={s.v} value={s.v}>{s.rot}</option>)}
        </Escolha>
      )}
    </div>
  );
}

/* quem respondeu posso / não posso neste dia */
function Disponibilidade({ d, S, aviso }: any) {
  const rp = respostasDoDia(S, d);
  if (!rp.total) return null;
  return (
    <details className="esc-disp">
      <summary>
        <span><b>{rp.posso.length}</b> podem</span>
        <span><b>{rp.nao.length}</b> não</span>
        <span className={rp.mudo.length ? 'falta' : ''}><b>{rp.mudo.length}</b> sem responder</span>
        <span className="esc-disp-ver">ver nomes</span>
      </summary>
      <div className="esc-disp-corpo">
        <div><span className="esc-mini">Podem</span><p>{rp.posso.map((v: any) => v.nome).join(', ') || 'ninguém'}</p></div>
        <div><span className="esc-mini">Não podem</span><p>{rp.nao.map((v: any) => v.nome).join(', ') || 'ninguém'}</p></div>
        <div><span className="esc-mini">Não responderam</span><p>{rp.mudo.map((v: any) => v.nome).join(', ') || 'ninguém'}</p></div>
        {!!rp.mudo.length && (
          <button className="lid-bt-txt" style={{ marginTop: 14 }}
            onClick={() => copiar(
              `Pessoal, quem ainda não respondeu a disponibilidade de ${fmtDia(d)}: ${rp.mudo.map((v: any) => v.nome.split(' ')[0]).join(', ')}. Entrem no link de vocês e marquem posso ou não posso, é rapidinho.`,
              aviso, 'Cobrança copiada. Cole no grupo.')}>
            Cobrar quem não respondeu
          </button>
        )}
      </div>
    </details>
  );
}
