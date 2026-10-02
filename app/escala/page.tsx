'use client';
import Shell, { useApp, copiar } from '@/components/Shell';
import { useEffect, useRef, useState } from 'react';
import { apagarEvento, criarEvento, mudarStatus, salvarDia, salvarDias } from '@/lib/db';
import { Cab, Kpis, Kpi, Secao, Pilula, Aviso, Dobra, Escolha, Fio, tomDoStatus, Tom } from '@/components/escalas/Pecas';
import { leituraDoDia } from '@/components/escalas/leitura';
import { rolarAte } from '@/components/escalas/ancora';
import { IcCopiar, IcDado, IcEnviar, IcSeta, IcSino } from '@/components/Icones';
import { aviseHumano } from '@/lib/erros';
import { confirmar } from '@/lib/confirmar';
import {
  candidatos, cargaDoMes, diaLongo, diasDoMes, esqueceOsDias, fmtDia, fmtLongo, funcoesAtivas, funcoesDoDia, garantirDia, gerarDia, gerarMes,
  hojeISO, MESES, metaFuncao, msgColeta, msgConfirmar, msgEscala, nomeDe, ocupadoNoDia, problemas, respostaDe,
  respostasDoDia, resumoDia, Status, sugerirPlantao, tipoDoDia, SITUACOES, Estado, porqueNaoPode,
  gruposValidos, linkDoVoluntario,
} from '@/lib/engine';
import MandarNosGrupos from '@/components/escalas/MandarNosGrupos';
import RepertorioDoDia from '@/components/escalas/RepertorioDoDia';
import OrdemDoCulto from '@/components/escalas/OrdemDoCulto';
import ImprimirMes from '@/components/escalas/ImprimirMes';
import { pl, cont } from '@/lib/plural';

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
      palavras: "fixo" e "1ª vez", cada uma uma ficha que acende.

   O QUE FOI PRESERVADO INTEIRO: o motor e todas as ações que já funcionavam.
   Sortear o mês, sortear o dia, trocar, travar, marcar primeira vez, recado,
   plantão, e o retrato local que restaura a tela quando o save falha, que é a
   coisa que impede o líder de publicar uma escala que o banco nunca recebeu.

   A SUPERFÍCIE, 30/09/2026. A tela passou para a língua do Financeiro e do
   Demandas, a mesma do /painel (ver components/escalas/Pecas.tsx):

     . o mês é o título, com as setas coladas nele, e a faixa de números diz
       o mês de longe: cultos a montar, postos sem ninguém, sem resposta,
       furos. "Montar o mês inteiro" é a única ação cheia da tela;
     . cada culto é uma caixa que abre, com a pílula do estado na linha
       fechada, no tom da régua do motor (`classificar`);
     . dentro, cada posto é uma linha: função, pessoa, situação e as marcas;
     . ao lado, o mês em pessoas e o evento esporádico.

   Nenhuma ação mudou com isso: o que mudou foi marcação, classe e texto.
   ============================================================================= */

const ehFollow = (d: string) => tipoDoDia(d) === 'follow';
const nomeDia = (d: string) => (ehFollow(d) ? 'Follow, sábado' : 'domingo');

export default function Pagina() { return <Shell><Escala /></Shell>; }

/* o mês em que a tela abre: o de hoje, se ainda tem culto por vir; senão, o
   seguinte. Mesma conta de dias da lista (`diasDoMes`, com os eventos). */
function mesDeAbrir(S: Estado, hoje: string): { ano: number; mes: number } {
  const a = +hoje.slice(0, 4), m = +hoje.slice(5, 7);
  if (diasDoMes(S, a, m).some(d => d >= hoje)) return { ano: a, mes: m };
  return m === 12 ? { ano: a + 1, mes: 1 } : { ano: a, mes: m + 1 };
}

function Escala() {
  const { S, recarregar, pinta, aviso, base, equipe } = useApp();
  const hoje = hojeISO();
  const semFuncoes = funcoesAtivas(S).length === 0;

  /* Quando o save falha, o recarregar de recuperação costuma falhar junto
     (a causa é a mesma: rede). Sem restaurar o retrato local, a tela seguia
     mostrando uma escala que o banco nunca recebeu — e o líder publicava. */
  const retrato = (datas: string[]) =>
    datas.map(d => [d, S.escalas[d] ? JSON.parse(JSON.stringify(S.escalas[d])) : null] as const);
  async function falhou(e: any, snap: ReturnType<typeof retrato>) {
    const est = await recarregar();
    if (!est) {
      for (const [d, dia] of snap) { if (dia) S.escalas[d] = dia; else delete S.escalas[d]; }
      /* O CACHE DE DATAS PRECISA SABER QUE `S.escalas` MUDOU POR FORA.

         `lib/engine.ts` documenta esta linha como o chamador de
         `esqueceOsDias`, com o código copiado no comentário — e o chamador
         não existia. O cache só reconta quando o NÚMERO de dias muda; trocar
         um dia por outro mantém a contagem e o cache fica apontando para uma
         lista velha. Medido: com três dias e uma troca (apaga um, entra
         outro), `paradoGeral` foi de 7 para 24 e `escalasNoMes` contou 2 em
         vez de 3 — ou seja, a pessoa passa do teto do mês sem nada quebrar.

         Hoje o SELO salva por acidente, porque todo caminho até aqui passou
         antes por `gerarDia`. Proteção por acidente não é proteção. */
      esqueceOsDias(S);
    }
    aviso(aviseHumano(e, 'salvar'));
  }

  /* O MÊS DE ABRIR É O DO PRÓXIMO CULTO (30/09/2026).

     A tela abria sempre no mês de hoje. No dia 30/09, com os cultos de
     setembro todos passados, ela dizia "Esse mês já passou inteiro. Use as
     setas para ir para o próximo", enquanto o Painel, um toque antes, mandava
     "Monte a escala de outubro". O líder que obedecia ao painel caía no mês
     errado e precisava descobrir a seta. Agora: se o mês de hoje ainda tem
     culto por vir (domingo, Follow ou evento), abre nele; se não tem, abre no
     seguinte. O `?m=` de um link continua mandando (efeito logo abaixo). */
  const [ano, setAno] = useState(() => mesDeAbrir(S, hoje).ano);
  const [mes, setMes] = useState(() => mesDeAbrir(S, hoje).mes);
  const [ocupado, setOcupado] = useState(false);
  const [verPassado, setVerPassado] = useState(false);
  /* EVENTO ESPORÁDICO (migração 54) — o que não está na programação fixa. */
  const [abrirEvento, setAbrirEvento] = useState(false);
  const [evData, setEvData] = useState('');
  const [evHora, setEvHora] = useState('');
  const [evNome, setEvNome] = useState('');
  /* `diasDoMes` e não `cultosDoMes`: desde a 54 os eventos esporádicos entram
     na lista junto com os domingos e os sábados de Follow. */
  const dias = diasDoMes(S, ano, mes);
  const futuros = dias.filter(d => d >= hoje);
  const passados = dias.filter(d => d < hoje);
  const proximo = futuros[0];
  /* O DIA DO LINK NASCE ABERTO (30/09/2026). Os links do Painel levam a
     `#d<data>` (e os avisos, a `#p<data>-<posto>`), mas só o próximo culto
     nascia aberto: quem tocava em "Domingo, 11 de outubro" caía numa linha
     fechada e ainda precisava abrir. */
  const [diaDoLink, setDiaDoLink] = useState('');
  const rolou = useRef(false);
  useEffect(() => {
    const m = /^#[dp](\d{4}-\d{2}-\d{2})/.exec(window.location.hash);
    if (m) setDiaDoLink(m[1]);
    /* o endereço pode mudar com a tela aberta (um link para outro dia na
       mesma página). Se o alvo já está à vista, num dia aberto, o navegador
       resolve sozinho; se o dia está fechado ou é de outro mês, a tela abre
       o dia (e o mês) e a rolagem espera por ele, como na chegada. */
    const mudou = () => {
      const h = /^#[dp]((\d{4})-(\d{2})-\d{2})/.exec(window.location.hash);
      if (!h) return;
      const alvo = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
      if (alvo && (alvo as HTMLDetailsElement).open !== false && alvo.closest('details')?.open) return;
      const a = +h[2], ms = +h[3];
      if (ms < 1 || ms > 12 || a < 2020 || a > 2100) return;   // o mesmo filtro do `?m=`
      rolou.current = false;
      setAno(a); setMes(ms);
      setDiaDoLink(h[1]);
    };
    window.addEventListener('hashchange', mudou);
    return () => window.removeEventListener('hashchange', mudou);
  }, []);

  useEffect(() => {
    /* `?m=` VEM DE FORA E PRECISA SER CONFERIDO, NÃO SÓ RECONHECIDO.

       A regex antiga (`\d{4}-\d{2}`) aceitava a FORMA e não o VALOR: `2026-13`
       passava, `2026-00` passava, `0000-01` passava. Com `?m=2026-13` a tela
       mostrava o ano sem nome de mês, o diálogo perguntava "Remontar os 9
       cultos de undefined?" e a lista dizia "domingo, 03/13". Um toque em
       "Montar" mandaria `insert into cultos (data) values ('2026-13-03')`, que
       o Postgres recusa com 22008 — um código que ninguém traduziu.

       Não é ataque: é um link colado errado, ou um `?m=` de outro sistema. A
       resposta certa é ignorar o parâmetro e abrir no mês de hoje, que é o que
       a tela faz quando não vem `?m=` nenhum. */
    const m = new URLSearchParams(window.location.search).get('m');
    if (m && /^\d{4}-\d{2}$/.test(m)) {
      const a = +m.slice(0, 4), s = +m.slice(5, 7);
      if (s >= 1 && s <= 12 && a >= 2020 && a <= 2100) { setAno(a); setMes(s); return; }
    }
    /* sem `?m=`, o dia do link diz o mês: `/escala#d2026-11-01` abria em
       outubro, e a rolagem ficava pendente até o líder ir a novembro por
       conta própria, quando a página pulava 358px (auditoria de 30/09/2026) */
    const h = /^#[dp](\d{4})-(\d{2})-\d{2}/.exec(window.location.hash);
    if (h) {
      const a = +h[1], s = +h[2];
      if (s >= 1 && s <= 12 && a >= 2020 && a <= 2100) { setAno(a); setMes(s); }
    }
  }, []);
  /* a rolagem espera o dia do link abrir: `#p<data>-<posto>` só existe
     dentro do dia aberto, e o dia aberto muda a altura da página. Rolar
     antes deixava o sábado 31/10 no pé da tela a 1440px (auditoria de
     30/09/2026). O resto está em `components/escalas/ancora.ts`. */
  useEffect(() => {
    if (rolou.current || !window.location.hash) return;
    const m = /^#[dp](\d{4}-\d{2}-\d{2})/.exec(window.location.hash);
    if (m && diaDoLink !== m[1]) return;
    if (rolarAte(decodeURIComponent(window.location.hash.slice(1)))) rolou.current = true;
  });

  async function criarOEvento() {
    if (!equipe?.id) { aviso('Escolha o ministério no topo antes.'); return; }
    setOcupado(true);
    try {
      const r = await criarEvento(equipe.id, evData, evNome.trim(), evHora || null);
      /* leva a tela para o mês do evento, senão a pessoa cria e não vê nada
         porque o evento caiu em outro mês */
      setAno(+r.data.slice(0, 4)); setMes(+r.data.slice(5, 7));
      setEvNome(''); setEvData(''); setEvHora(''); setAbrirEvento(false);
      await recarregar();
      aviso(`${r.nome} entrou na escala. Agora é só montar.`);
    } catch (e) { aviso(aviseHumano(e, 'salvar')); }
    finally { setOcupado(false); }
  }

  async function tirarOEvento(cultoId: string, nome: string) {
    if (!await confirmar({
      titulo: `Tirar ${nome} da escala?`,
      texto: 'A escala montada para esse evento sai junto. Os domingos não são afetados.',
      acao: 'Tirar', perigo: true,
    })) return;
    setOcupado(true);
    try { await apagarEvento(cultoId); await recarregar(); aviso('Evento removido'); }
    catch (e) { aviso(aviseHumano(e, 'salvar')); }
    finally { setOcupado(false); }
  }

  /* A AÇÃO CHEIA NÃO DISPARA LOGO DEPOIS DE TROCAR DE MÊS (30/09/2026). No
     mês que já passou, o botão cheio leva ao mês de hoje; no lugar dele, no
     mês novo, nasce "Montar o mês inteiro". Um duplo clique de costume
     chegava a outubro e já abria "Remontar os 8 cultos". */
  const trocouEm = useRef(0);
  function irPara(a: number, m: number) {
    setMes(m); setAno(a); setVerPassado(false);
    trocouEm.current = Date.now();
    rolou.current = true;   // trocar de mês à mão encerra a âncora do endereço
  }
  function mover(n: number) {
    let m = mes + n, a = ano;
    if (m > 12) { m = 1; a++; } if (m < 1) { m = 12; a--; }
    irPara(a, m);
  }
  const deHoje = mesDeAbrir(S, hoje);
  /* do mês passado direto para o de hoje (um link velho de janeiro pedia
     oito cliques até outubro), e o foco vai para o título do mês novo: quem
     usa teclado ou leitor de tela ouve para onde foi */
  function irParaHoje() {
    irPara(deHoje.ano, deHoje.mes);
    requestAnimationFrame(() => document.getElementById('titulo-do-mes')?.focus());
  }

  /* ------------------------------------------------------------- as ações
     Nenhuma mudou. São as mesmas funções da tela anterior, na mesma ordem,
     com as mesmas confirmações e o mesmo retrato de recuperação. */
  async function gerarTudo() {
    if (semFuncoes) { aviso('Este ministério ainda não tem funções. Crie em Ajustes.'); return; }
    if (!futuros.length) { aviso('Esse mês já passou inteiro'); return; }
    if (!await confirmar({
      titulo: futuros.length === 1
        ? `Remontar o único culto de ${MESES[mes - 1]} que ainda não passou?`
        : `Remontar os ${futuros.length} cultos de ${MESES[mes - 1]} que ainda não passaram?`,
      texto: futuros.length === 1
        ? 'Quem está fixo e quem já confirmou não mudam.'
        : 'Domingos e sábados do Follow. Quem está fixo e quem já confirmou não mudam.',
      acao: 'Remontar',
    })) return;
    setOcupado(true);
    const snap = retrato(futuros);
    try {
      const r = gerarMes(S, ano, mes, hoje);
      pinta(); await salvarDias(S, futuros, equipe!.id);
      await recarregar();
      const v = r.reduce((a, x) => a + x.vagas.length, 0);
      aviso(v ? `Pronto, mas faltou gente em ${v} ${v === 1 ? 'função' : 'funções'}` : 'Mês montado, sem buracos');
    } catch (e: any) { await falhou(e, snap); }
    setOcupado(false);
  }

  async function gerarUm(d: string) {
    if (semFuncoes) { aviso('Este ministério ainda não tem funções. Crie em Ajustes.'); return; }
    if (d < hoje && !await confirmar({
      titulo: 'Esse culto já passou. Sortear de novo?',
      texto: 'Sortear de novo apaga quem furou nele.',
      acao: 'Sortear mesmo assim', perigo: true,
    })) return;
    setOcupado(true);
    const snap = retrato([d]);
    try {
      const r = gerarDia(S, d);
      pinta(); await salvarDia(S, d, equipe!.id); await recarregar();
      aviso(r.vagas.length ? `Faltou gente em ${r.vagas.join(', ')}` : 'Dia montado');
    } catch (e: any) { await falhou(e, snap); }
    setOcupado(false);
  }

  async function trocar(d: string, funcao: string, vid: string) {
    const atual = S.escalas[d]?.slots?.[funcao];
    /* 16/09/2026: o banco RECUSA duas coisas que a lista deixava escolher
       (ela mostra quem já está em outra função, de propósito, para o líder
       ver o time inteiro): a pessoa em duas funções simultâneas no mesmo
       culto, e a pessoa que avisou que não pode no dia. A recusa vinha como
       "Não consegui salvar", sem motivo; foi assim que o João Victor a viu
       na Mídia. Agora a tela diz o motivo antes de tentar, com as mesmas
       regras do banco (fn_conflito_simultaneo e fn_indisponivel). */
    if (vid && vid !== atual?.vid) {
      const vol = S.voluntarios.find(v => v.id === vid);
      if (vol && respostaDe(vol, d) === 'nao') {
        aviso(`${nomeDe(S, vid)} avisou que não pode nesse dia. Escolha outra pessoa.`); return;
      }
      const outra = ocupadoNoDia(S, d, vid, funcao);
      if (outra && metaFuncao(S, funcao).simultanea && metaFuncao(S, outra).simultanea) {
        aviso(`${nomeDe(S, vid)} já está em ${outra} nesse mesmo culto. Tire de lá antes, ou escolha outra pessoa.`); return;
      }
      /* 18/09/2026: a regra do prédio (fn_sexo_do_posto). A lista nem oferece
         quem não pode, então isto só pega o caminho de fora da lista; mas a
         regra que o banco aplica tem que ter voz na tela, senão vira "não
         consegui salvar" de novo. */
      const porque = vol ? porqueNaoPode(S, vol, funcao) : '';
      if (porque) { aviso(porque); return; }
    }
    /* trocar ou limpar alguém que JÁ respondeu apaga essa resposta: avisar antes */
    if (atual?.vid && atual.status && atual.status !== 'pendente' && atual.vid !== vid) {
      /* 09/09/2026: era o primeiro nome, e a igreja tem dois CLAUDIO e duas
         LUCIENE. Este aviso decide se o líder apaga a resposta de alguém — é o
         pior lugar possível para um nome ambíguo. */
      const nome = nomeDe(S, atual.vid);
      const oQue = atual.status === 'confirmado' ? `${nome} já CONFIRMOU esse dia`
        : atual.status === 'furou' ? `${nome} está marcado como FUROU (isso conta no histórico)`
        : `${nome} avisou que não pode`;
      if (!await confirmar({
        titulo: `${oQue}.`, texto: 'Trocar apaga essa resposta.', acao: 'Trocar',
      })) return;
    }
    setOcupado(true);
    const snap = retrato([d]);
    try {
      const dia = garantirDia(S, d);
      if (!vid) delete dia.slots[funcao];
      else dia.slots[funcao] = { vid, status: 'pendente', fixo: true };
      pinta(); await salvarDia(S, d, equipe!.id); await recarregar();
    } catch (e: any) { await falhou(e, snap); }
    setOcupado(false);
  }

  /* A situação de quem já está escalado. Existia só no painel, e só para o
     próximo culto: era por isso que o banco tinha 0 furos marcados. */
  async function situacao(d: string, funcao: string, st: Status) {
    const dia = S.escalas[d];
    const f = S.funcoes.find(x => x.nome === funcao);
    /* o id de quem a TELA acredita estar na vaga vai junto: se a escala mudou
       por baixo, a gravação recusa em vez de marcar o nome errado */
    const vid = dia?.slots?.[funcao]?.vid;
    if (!dia?.cultoId || !f?.id || !vid) return;
    setOcupado(true);
    const snap = retrato([d]);
    /* pinta o novo status na hora; a gravacao segue por baixo */
    if (dia.slots?.[funcao]) { dia.slots[funcao].status = st; pinta(); }
    try { await mudarStatus(dia.cultoId, f.id, vid, st); await recarregar(); }
    catch (e: any) { await falhou(e, snap); }
    setOcupado(false);
  }

  async function travar(d: string, funcao: string) {
    const dia = garantirDia(S, d);
    if (!dia.slots[funcao]) return;
    setOcupado(true);
    const snap = retrato([d]);
    dia.slots[funcao].fixo = !dia.slots[funcao].fixo;
    try { pinta(); await salvarDia(S, d, equipe!.id); await recarregar(); aviso(dia.slots[funcao]?.fixo ? 'Fixo: o sorteio não mexe neste posto' : 'Solto: o sorteio pode trocar'); }
    catch (e: any) { await falhou(e, snap); }
    setOcupado(false);
  }

  /* marca ESTE domingo como a primeira vez da pessoa na função: ela recebe no
     link a instrução de chegar mais cedo. É por dia, não é nível fixo. */
  async function marcarPrimeira(d: string, funcao: string) {
    const dia = garantirDia(S, d);
    const sl = dia.slots[funcao];
    /* idem: `return` mudo vira aviso. Ver a nota em /painel. */
    if (!sl?.vid) { aviso('Essa vaga está sem ninguém: escolha a pessoa antes de marcar a 1ª vez.'); return; }
    setOcupado(true);
    const snap = retrato([d]);
    sl.primeiraVez = !sl.primeiraVez;
    try { pinta(); await salvarDia(S, d, equipe!.id); await recarregar(); aviso(dia.slots[funcao]?.primeiraVez ? 'Marcado como 1ª vez: a pessoa vai chegar mais cedo' : 'Tirada a marca de 1ª vez'); }
    catch (e: any) { await falhou(e, snap); }
    setOcupado(false);
  }

  /* O RECADO SUMIA EM SILÊNCIO — 20/09/2026, auditoria de frontend.

     Esta função começava com `if (ocupado) return;`, e o `return` era mudo: a
     pessoa escrevia o recado, tocava em outro botão, o `onBlur` disparava, a
     função voltava sem fazer nada e o texto continuava no campo como se
     tivesse sido salvo. Sumia no próximo `recarregar`.

     E não é caso raro: o campo é `disabled={ocupado}`, então o blur só
     acontece com `ocupado` ligado quando é o PRÓPRIO toque no outro botão que
     liga `ocupado` — que é exatamente a sequência natural de "escrevo o
     recado e mando montar o dia".

     A guarda em si está certa e fica: `salvarObs` escreve no mesmo dia que o
     sorteio, e as duas gravações correndo juntas disputam as mesmas linhas.
     O que muda é que o recado agora ESPERA em vez de sumir: fica guardado num
     ref e é gravado assim que o que está em voo terminar. */
  /* O `equipeId` VAI JUNTO, E ISSO NÃO É ZELO — 20/09/2026, reauditoria.

     O Shell renderiza `<main>{children}</main>` SEM `key`, então esta tela
     não remonta quando o líder troca de ministério, e o botão de trocar não
     é `disabled={ocupado}` (o Shell não conhece esse estado). Se a troca cair
     na janela em que `ocupado` está ligado, o despejo lá embaixo chamaria
     `salvarObs` lendo `equipe!.id` JÁ TROCADO: o recado da Mídia entraria no
     `culto_obs` do Louvor, e a Mídia nunca o receberia.

     Guardar o id junto e descartar o pendente quando ele muda é a correção
     inteira. Descartar e não gravar no lugar errado: o texto ainda está no
     campo, e o líder que voltar ao ministério dele o encontra. */
  const recadoEmEspera = useRef<{ d: string; txt: string; eq: string; eraEvento: boolean } | null>(null);

  async function salvarObs(d: string, txt: string) {
    if (ocupado) {
      recadoEmEspera.current = { d, txt, eq: equipe?.id || '', eraEvento: !!S.escalas[d]?.evento };
      return;
    }
    setOcupado(true);

    /* GRAVAR UM RECADO PODIA APAGAR A ESCALA DO DIA — 21/09/2026, 3ª auditoria.

       `salvarDia` grava o DIA INTEIRO por diferença: ele lê as escalações que
       estão no banco e apaga tudo que não estiver em `p_slots`. E `p_slots`
       sai de `S.escalas[d].slots`, que para um dia AUSENTE do estado local é
       vazio, porque `garantirDia` acabou de criar o dia do zero.

       Ou seja: escrever o recado num dia que esta aba ainda não carregou
       mandava `p_slots: []` e apagava a escala daquele dia. Reproduzido com as
       funções puras: `plano.apagar` com todas as linhas, `inserir` vazio.

       O dia existir no banco e não no estado local não é hipótese: o robô das
       3h monta o mês, outro líder do mesmo ministério grava, e a aba aberta
       desde ontem não sabe. E o campo de recado é renderizado nesses dias,
       porque a lista de dias vem do calendário, não de `S.escalas`.

       Recarregar antes é o conserto barato e certo: a gravação passa a
       enxergar o que existe, e o recado entra ao lado da escala em vez de por
       cima dela. Custa uma ida ao banco no único caso em que ela é
       necessária. */
    if (!S.escalas[d]) {
      const est = await recarregar();
      if (!est) {
        aviso('Não consegui carregar esse dia para salvar o recado sem apagar a escala. Tente de novo.');
        setOcupado(false);
        return;
      }
    }

    const snap = retrato([d]);
    garantirDia(S, d).obs = txt;
    try { pinta(); await salvarDia(S, d, equipe!.id); await recarregar(); aviso('Recado salvo'); }
    catch (e: any) { await falhou(e, snap); }
    setOcupado(false);
  }

  /* o despejo do que ficou esperando. Roda quando `ocupado` cai, que é o
     único instante em que gravar é seguro. */
  useEffect(() => {
    if (ocupado) return;
    const p = recadoEmEspera.current;
    if (!p) return;
    recadoEmEspera.current = null;
    /* trocou de ministério enquanto o recado esperava: o dia e o texto são de
       outro time, e gravá-los aqui é pior que perdê-los */
    if (p.eq !== (equipe?.id || '')) return;
    /* SEM ESTA GUARDA E COM ELA LARGA DEMAIS: OS DOIS ERRADOS.

       A intenção é legítima: se o dia sumiu do estado (um evento removido por
       `tirarOEvento`), `garantirDia` o recriaria e `salvarDia` criaria um
       culto regular numa quinta que não tem culto nenhum.

       Mas `!S.escalas[p.d]` sozinho é largo demais: `montarEstado` NÃO
       materializa domingo regular só porque ele existe em `cultos` (é a regra
       escrita em lib/ponte.ts), então um domingo ainda não montado também
       cai aqui. E o campo de recado é renderizado nesses dias. Ou seja:
       escrever o recado num domingo ainda não montado e tocar noutro botão
       perdia o texto, e perdia MUDO — exatamente a classe de defeito que esta
       espera existe para matar. Pelo caminho direto o mesmo recado grava,
       porque `salvarObs` chama `garantirDia`.

       Agora a guarda é só o caso do evento removido, e o que ela recusa é
       dito, não engolido. */
    if (!S.escalas[p.d] && p.eraEvento) {
      aviso('Aquele dia saiu da escala enquanto eu salvava. O recado não foi gravado.');
      return;
    }
    void salvarObs(p.d, p.txt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ocupado, equipe?.id]);

  async function novoPlantao(d: string) {
    setOcupado(true);
    const snap = retrato([d]);
    const dia = garantirDia(S, d);
    dia.plantao = sugerirPlantao(S, d, Math.max(1, S.config.plantaoQtd));
    try { pinta(); await salvarDia(S, d, equipe!.id); await recarregar(); }
    catch (e: any) { await falhou(e, snap); }
    setOcupado(false);
  }

  /* ------------------------------------------------------------- as contas
     O que decide se o culto acontece, somado no mês: cultos sem ninguém
     escalado, postos sem ninguém, quem não respondeu e quem furou. É a faixa
     de números logo abaixo do título. */
  /* "A MONTAR" É NÃO TER NINGUÉM ESCALADO, não é o dia não existir. Um
     evento esporádico nasce com o dia criado e os postos vazios: pela
     existência do dia, os dez postos dele entravam em "Postos sem ninguém"
     enquanto a linha do próprio dia dizia "a montar" (30/09/2026). A régua
     é a do Painel e da linha do dia: montado é ter alguém numa vaga. */
  const contas = futuros.reduce((a, d) => {
    const x = S.escalas[d];
    if (!x || !Object.values(x.slots || {}).some((s: any) => s?.vid)) { a.aMontar++; return a; }
    const r = resumoDia(S, d);
    a.vagas += r.vagas.length; a.pendentes += r.pendentes; a.furos += r.furos; a.recusados += r.recusados;
    return a;
  }, { vagas: 0, pendentes: 0, furos: 0, recusados: 0, aMontar: 0 });
  /* QUEM NÃO PODE TAMBÉM É FALTA DE GENTE (30/09/2026). As pílulas dos dias
     já seguiam a régua do motor e pintavam de vermelho o dia com alguém que
     avisou que não vai; a faixa e a frase do mês não somavam os recusados, e
     outubro aparecia com sete dias vermelhos e "Postos sem ninguém 0, Furos
     0, falta a confirmação". A casa agora é "Não podem" (avisaram + furaram),
     como no Painel. */
  const naoPodem = contas.recusados + contas.furos;

  const nomeMes = MESES[mes - 1];
  const montados = futuros.length - contas.aMontar;
  /* 103 · o PDF do mês só aparece quando há alguém escalado em algum dia */
  const temEscalado = dias.some(d => Object.values(S.escalas[d]?.slots || {}).some(sl => !!sl?.vid));

  return (
    <>
      {ocupado && <Fio />}
      {/* 103 · a folha que só existe no papel (portal no fim do body) */}
      <ImprimirMes S={S} ano={ano} mes={mes} equipe={equipe?.nome || ''} />
      {/* ------------------------------------------------------- o cabeçalho
          O mês é o título e as setas moram coladas nele: um par só, que não
          se separa. A frase embaixo diz o estado do mês. "Montar o mês
          inteiro" é a única ação cheia da tela; os botões de cada dia são
          contorno ou texto. */}
      <Cab
        comSetas
        idTitulo="titulo-do-mes"
        rot="Escala"
        titulo={<>
          {`${nomeMes.charAt(0).toUpperCase()}${nomeMes.slice(1)} de ${ano}`}
          <span className="es-setas">
            <button className="es-btn es-icone es-peq" aria-label="Mês anterior" onClick={() => mover(-1)}><IcSeta dir="e" /></button>
            <button className="es-btn es-icone es-peq" aria-label="Próximo mês" onClick={() => mover(1)}><IcSeta /></button>
          </span>
        </>}
        meta={!futuros.length ? 'Esse mês já passou inteiro.'
          : contas.aMontar === futuros.length ? 'Nada montado ainda. O sorteio respeita quem não pode e quem já serviu.'
          : contas.vagas ? 'Vaga sem ninguém é o que faz o culto não acontecer. É por onde começar.'
          : naoPodem ? 'Tem gente que não pode. Troque ou sorteie de novo os dias em vermelho.'
          : contas.pendentes ? 'Falta a confirmação de quem foi escalado.'
          : 'Mês fechado.'}
        acoes={<>
          {/* 103 · a escala do mês em PDF: a janela de imprimir do navegador,
              com "Salvar como PDF". Sai só a folha (ImprimirMes), nada da tela. */}
          {temEscalado && (
            <button className="es-btn es-txt" onClick={() => window.print()}>Salvar em PDF</button>
          )}
          <button className="es-btn" onClick={() => copiar(msgColeta(S, ano, mes, base, linkDoVoluntario(base, equipe?.slug, 'disponibilidade')), aviso, 'Pedido copiado. Cole no grupo.')}>
            Pedir a disponibilidade
          </button>
          {/* mês que já passou inteiro não tem o que montar: a ação cheia
              leva para o seguinte, em vez de um botão que só responde
              "esse mês já passou" */}
          {futuros.length
            ? <button className="es-btn es-pri" disabled={ocupado || !S.voluntarios.length || semFuncoes}
                onClick={() => { if (Date.now() - trocouEm.current > 700) void gerarTudo(); }}>
                Montar o mês inteiro
              </button>
            : <button className="es-btn es-pri" onClick={irParaHoje}>Ir para {MESES[deHoje.mes - 1]}</button>}
        </>}
      />

      {semFuncoes && (
        <Aviso tom="warn">
          Este ministério ainda não tem <b>funções</b> (PROJEÇÃO, VOCAL, RECEPÇÃO…). Sem elas não há o que sortear.
          Crie as funções em <b>Ajustes → Funções</b> e depois volte aqui.
        </Aviso>
      )}
      {!S.voluntarios.length && (
        <Aviso tom="warn">Time vazio. Cadastre as pessoas na aba <b>Time</b> antes de montar qualquer coisa.</Aviso>
      )}

      {/* A FAIXA DE NÚMEROS só existe com culto por vir: num mês que já
          passou ela seria uma fileira de zeros sem decisão nenhuma. A ajuda
          recolhida continua logo embaixo: é material de primeira vez, e
          fechada custa zero a quem já sabe. */}
      <div className="es-ec-topo">
        {!!futuros.length && (
          <Kpis n={4}>
            {/* SEM FRAÇÃO AQUI (30/09/2026): "0/8" no alto da tela se lê como
                progresso, e zero de oito parecia "nada feito" justo quando o
                mês estava inteiro montado. As quatro casas desta faixa contam
                o que falta, e zero é bom em todas; o total vai por escrito. */}
            <Kpi rot="Cultos a montar" valor={contas.aMontar}
              sub={!contas.aMontar ? (futuros.length === 1 ? 'o culto está montado' : `os ${futuros.length} estão montados`)
                : !montados ? `nenhum dos ${futuros.length} montado ainda`
                : `${montados} de ${futuros.length} já ${pl(montados, 'montado', 'montados')}`}
              tom={contas.aMontar ? '' : 'zero'}
              rotulo={`Cultos a montar: ${contas.aMontar} de ${futuros.length}`} />
            <Kpi rot="Postos sem ninguém" valor={contas.vagas}
              sub={contas.vagas ? 'é por onde começar' : 'nos cultos montados'}
              tom={contas.vagas ? 'bad' : 'zero'} />
            <Kpi rot="Sem resposta" valor={contas.pendentes}
              sub={contas.pendentes ? 'esperando confirmar' : 'ninguém devendo'}
              tom={contas.pendentes ? 'warn' : 'zero'} />
            <Kpi rot="Não podem" valor={naoPodem}
              sub={naoPodem
                ? [contas.recusados ? `${contas.recusados} ${pl(contas.recusados, 'avisou', 'avisaram')}` : '',
                   contas.furos ? `${contas.furos} ${pl(contas.furos, 'furou', 'furaram')}` : ''].filter(Boolean).join(' · ')
                : 'ninguém desmarcou'}
              tom={naoPodem ? 'bad' : 'zero'} />
          </Kpis>
        )}
        <Dobra titulo="O que esses botões fazem">
          <p className="es-prosa">
            {/* "preenchem só o que está vazio" não era verdade: o sorteio
                refaz todo posto que não está fixo nem confirmado (`gerarDia`,
                em lib/engine.ts). Corrigido em 30/09/2026. */}
            Montar e sortear refazem os postos, <b>menos quem já confirmou e
            quem está fixo</b>. Pedir, copiar e cobrar geram um texto para você
            colar no grupo. <b>Nada é enviado daqui.</b>
          </p>
        </Dobra>
      </div>

      {/* A FITA DE DOMINGOS SAIU. Ela existia para pular para um dia no meio
          de nove cartões em ordem de data. Com o próximo em cima e o passado
          recolhido, a lista tem dois a cinco itens e a fita virava uma segunda
          cópia dela, com os mesmos números. Duas listas do mesmo mês, uma
          delas só para navegar na outra, é complexidade que eu mesmo tinha
          acabado de criar. */}

      {/* A LISTA E O PESO, LADO A LADO. A lista de dias é leitura, e alargar
          a caixa do dia não ajuda ninguém: o que cabe do lado é conteúdo de
          outra natureza (o mês em pessoas, o evento esporádico). Abaixo de
          1100px o trilho desce para depois da lista, na ordem do DOM. */}
      <div className="es-duas es-secao">
        <div className="es-pilha">
          {/* -------------------------------------------------- o que ainda vem */}
          {!!futuros.length && (
            <Secao titulo="Próximos cultos">
              <div className="es-ec-dias">
                {futuros.map(d => (
                  <DiaCard key={d} d={d} aberto={d === proximo || d === diaDoLink} passado={false}
                    {...{ S, ocupado, semFuncoes, aviso, gerarUm, trocar, situacao, travar, marcarPrimeira, salvarObs, novoPlantao, tirarOEvento }} />
                ))}
              </div>
            </Secao>
          )}

          {/* ---------------------------------------------------- o que passou
              Recolhido. É referência: o líder vem aqui para registrar um furo
              ou conferir o que aconteceu, não para trabalhar. */}
          {!!passados.length && (
            <Secao titulo="Já passaram"
              acoes={
                <button className="es-btn es-txt es-peq" aria-expanded={verPassado} onClick={() => setVerPassado(v => !v)}>
                  {verPassado ? 'Esconder' : `Ver ${passados.length}`}
                </button>
              }>
              {verPassado && (
                <div className="es-ec-dias">
                  {passados.map(d => (
                    <DiaCard key={d} d={d} aberto={false} passado
                      {...{ S, ocupado, semFuncoes, aviso, gerarUm, trocar, situacao, travar, marcarPrimeira, salvarObs, novoPlantao, tirarOEvento }} />
                  ))}
                </div>
              )}
            </Secao>
          )}
        </div>

        <div className="es-pilha">
          <MesEmPessoas S={S} ano={ano} mes={mes} />

          {/* ===================================================== EVENTO ESPORÁDICO

              O que não está na programação fixa: o GUIA Empreendedor numa quinta,
              um ensaio geral num sábado. Depois de criado, o dia entra na lista
              como qualquer domingo e "Montar" sorteia com as MESMAS regras.

              Fica fechado por padrão e no trilho porque é o caminho raro: o
              comum é montar o mês. Um formulário aberto em cima competiria com
              o botão que a pessoa veio usar.

              É a dobra da casa escrita à mão, e não a peça `Dobra`, por um
              motivo só: `criarOEvento` FECHA a dobra depois de criar
              (`setAbrirEvento(false)`), e para isso o `open` precisa seguir o
              estado nos dois sentidos, o que pede o `onToggle` aqui. */}
          <details className="es-dobra" open={abrirEvento}
            onToggle={e => setAbrirEvento((e.currentTarget as HTMLDetailsElement).open)}>
            <summary><span>Adicionar evento esporádico</span></summary>
            <div className="es-dobra-corpo es-ec-evento">
              <p className="es-ec-dica">
                Para o que não é domingo nem Follow: um GUIA Empreendedor, um ensaio,
                uma conferência. Depois de criado ele aparece na lista com os outros
                dias, e o sorteio respeita quem avisou que não pode e quem já serviu
                demais no mês.
              </p>
              <label className="es-campo es-curto">
                <span>O que é</span>
                <input className="es-ctl" value={evNome} maxLength={80} placeholder="GUIA Empreendedor"
                  onChange={e => setEvNome(e.target.value)} />
              </label>
              <label className="es-campo es-data">
                <span>Dia</span>
                <input className="es-ctl" type="date" value={evData} min={hoje}
                  onChange={e => setEvData(e.target.value)} />
              </label>
              <label className="es-campo es-data">
                <span>Hora</span>
                <input className="es-ctl" type="time" value={evHora} onChange={e => setEvHora(e.target.value)} />
                <small>Opcional.</small>
              </label>
              {/* BOTÃO CINZA QUE NÃO DIZ O QUE FALTA É UM BECO.

                  Com o nome preenchido e a data em branco o botão ficava cinza e
                  nada na vizinhança dizia qual dos três campos estava faltando.
                  Medido nos dois tamanhos de tela. A pessoa toca, não acontece
                  nada, e não há como descobrir o porquê a não ser adivinhando.

                  E O RÓTULO PAROU DE ECOAR O QUE FOI DIGITADO. Ele era
                  `Criar "{nome}"`, então em 390px um nome longo quebrava em duas
                  linhas e o botão ia de 53px para 72px de altura, empurrando tudo
                  o que estava abaixo para baixo enquanto a pessoa digitava.
                  Medido: 292x53 vazio, 292x72 com "Conferencia de Missoes…". O
                  nome já está no campo logo acima; repeti-lo no botão custava um
                  layout que pula e não acrescentava nada. */}
              {(() => {
                const falta = [
                  evNome.trim().length < 2 ? 'o nome' : null,
                  !evData ? 'o dia' : null,
                ].filter(Boolean);
                return (
                  <div className="es-linha">
                    <button className="es-btn" disabled={ocupado || falta.length > 0}
                      onClick={criarOEvento}>
                      {ocupado ? 'Criando…' : 'Criar o evento'}
                    </button>
                    {falta.length > 0 && (
                      <p className="es-ec-falta" role="status">
                        Falta {falta.join(' e ')}.
                      </p>
                    )}
                  </div>
                );
              })()}
              <p className="es-ec-dica">
                O evento é <b>deste ministério</b> ({equipe?.nome || 'o do topo'}) e
                só aparece para quem organiza ele.
              </p>
            </div>
          </details>
        </div>
      </div>
    </>
  );
}

/* =============================================================================
   O MÊS EM PESSOAS

   A tela inteira olha um culto por vez, e por isso não responde as duas
   perguntas que decidem se uma escala é justa: quem está indo em TODOS, e quem
   não vai servir nenhuma vez. O motor equilibra carga ao sortear, mas o líder
   trava, troca e remonta na mão — e é exatamente aí que o equilíbrio se desfaz
   sem ninguém ver.

   A FORMA É UMA FITA POR PESSOA, NÃO UMA GRADE. Uma grade cultos × funções tem
   42 células com a demo de hoje: legível no desktop, impossível no celular, e
   ela responde "quem faz o quê" — que a lista abaixo já responde melhor. A
   pergunta daqui é outra e é de repetição, então a unidade é a PESSOA e cada
   culto do mês vira um traço: cheio se ela entra, vazio se não. Seis traços
   numa linha de 200px cabem no celular e mostram o padrão sem ler número
   nenhum. Quem tem a fita toda cheia salta aos olhos antes de qualquer rótulo.

   Os traços são decorativos para quem lê com leitor de tela: quem carrega o
   fato é o número ao lado e a lista de datas escondida. Desenho não pode ser
   a única via de uma informação.

   30/09/2026: o alarme saiu do nome e foi para a pílula. Nome em vermelho
   dizia "tem algo errado com esta pessoa", e o que está errado é a escala:
   "em todos" (quem sustenta o mês sozinho) e "acima do limite". As duas
   pílulas são azuis, o tom de "fato a saber": vermelho no sistema é falta de
   gente no culto, e âmbar é resposta que não veio; carga pesada não é
   nenhum dos dois. As duas frases de rodapé que repetiam esses nomes saíram
   junto, porque a pílula já diz a mesma coisa na linha de cada um.
============================================================================= */
function MesEmPessoas({ S, ano, mes }: { S: Estado; ano: number; mes: number }) {
  const [verZerados, setVerZerados] = useState(false);
  const m = cargaDoMes(S, ano, mes);
  /* mês sem nada montado não tem peso para mostrar, e um painel vazio ao lado
     da lista é pior que painel nenhum */
  if (!m.montados.length) return null;

  const marca = (id: string) =>
    m.emTodos.some(x => x.id === id) ? 'todos'
      : m.acimaDoLimite.some(x => x.id === id) ? 'acima' : '';

  return (
    <Secao titulo="O mês em pessoas"
      sub={<>
        {cont(m.escalados.length, 'pessoa entra', 'pessoas entram')} nos{' '}
        {cont(m.montados.length, 'culto montado', 'cultos montados')} de {MESES[mes - 1]}.
      </>}>
      <div className="es-caixa">
        <ol className="es-ec-peso">
          {m.escalados.map(p => {
            const mc = marca(p.id);
            return (
              <li key={p.id} className="es-ec-pessoa">
                <span className="es-ec-pessoa-nome">
                  {p.nome}
                  {mc === 'todos' && <Pilula tom="info">em todos</Pilula>}
                  {mc === 'acima' && <Pilula tom="info">acima do limite</Pilula>}
                </span>
                <span className="es-ec-fita" aria-hidden="true">
                  {m.montados.map(d => (
                    <i key={d} className={p.dias.includes(d) ? 'es-ec-traco es-ec-cheio' : 'es-ec-traco'} />
                  ))}
                </span>
                <span className="es-ec-pessoa-n">{p.n}</span>
                <span className="es-so-leitor">
                  {cont(p.n, 'culto', 'cultos')} em {MESES[mes - 1]}: {p.dias.map(fmtDia).join(', ')}
                </span>
              </li>
            );
          })}
        </ol>

        {!!m.zerados.length && (
          <div className="es-ec-peso-pe">
            <button className="es-btn es-txt es-peq" onClick={() => setVerZerados(v => !v)}
              aria-expanded={verZerados}>
              {cont(m.zerados.length, 'pessoa não entra', 'pessoas não entram')} em nenhum
            </button>
            {verZerados && <p>{m.zerados.map(p => p.nome).join(' · ')}</p>}
          </div>
        )}
      </div>
    </Secao>
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
  /* evento esporádico (54): só existe para o dia que TEM evento */
  tirarOEvento: (cultoId: string, nome: string) => Promise<void>;
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

function DiaCard({ d, aberto, passado, S, ocupado, semFuncoes, aviso, gerarUm, trocar, situacao, travar, marcarPrimeira, salvarObs, novoPlantao, tirarOEvento }: PropsDiaCard) {
  const dia = S.escalas[d];
  const doDia = funcoesDoDia(S, d);
  const r = dia ? resumoDia(S, d) : null;
  const probs = dia ? problemas(S, d) : [];
  const preenchidos = doDia.filter((f: any) => dia?.slots?.[f.nome]?.vid).length;
  const semConfirmar = r ? r.pendentes : 0;

  /* O RESUMO DA LINHA FECHADA muda de pergunta conforme o tempo do culto.
     Antes era sempre "N/M confirmados", em vermelho, inclusive num domingo
     vivido há três semanas — vermelho sobre uma coisa que ninguém mais pode
     mudar é o jeito mais rápido de ensinar o líder a ignorar a cor.

     30/09/2026: o tom virou o da pílula do sistema, e a cascata do culto por
     vir passou a seguir a régua do motor (`classificar`: vaga, furo ou quem
     não pode = falta gente; sem resposta = espera). Ela não olhava o "não
     pode": um domingo com alguém que avisou que não vai saía "6 a confirmar"
     em âmbar aqui, e "1 não pode" em vermelho no Painel e no selo da aba
     Escala, para o mesmo dia. "A montar" é neutro, como "não montada" no
     Painel: ainda não há juízo a fazer sobre um dia sem ninguém escalado.
     As palavras da soma são as de `components/escalas/leitura.ts`, as mesmas
     do Painel ("sem resposta", e não "a confirmar"). */
  const resumo: { tom: Tom; txt: string } = !doDia.length ? { tom: 'neutro', txt: 'sem funções neste dia' }
    : passado
      ? r && r.furos ? { tom: 'bad', txt: r.furos === 1 ? '1 pessoa furou' : `${r.furos} pessoas furaram` }
        : r && r.confirmados ? { tom: 'neutro', txt: `${r.confirmados} de ${r.preenchidos} ${pl(r.confirmados, 'confirmou', 'confirmaram')}` }
        : { tom: 'neutro', txt: 'aconteceu' }
    : !dia || !preenchidos ? { tom: 'neutro', txt: 'a montar' }
    : r ? leituraDoDia({ vagas: r.vagas.length, furos: r.furos, recusados: r.recusados, pendentes: semConfirmar })
    : { tom: 'neutro', txt: 'a montar' };

  /* O NOME DO DIA. O culto como a tela sempre chamou ("domingo", "Follow,
     sábado"), com a data por extenso, como no título do Painel. O evento
     leva o próprio nome, o dia da semana de verdade e a hora: `nomeDia` só
     conhece sábado e domingo, e chamava de "domingo" um evento numa quarta
     (o defeito que `diaLongo` já corrigiu na tela do voluntário, na 71). */
  const nome = nomeDia(d);
  const titulo = dia?.evento
    ? `${diaLongo(d, dia.evento)}${dia.inicio ? ` · ${String(dia.inicio).slice(0, 5)}` : ''}`
    : `${nome.charAt(0).toUpperCase()}${nome.slice(1)}, ${fmtLongo(d)}`;

  return (
    <details className="es-ec-dia" id={`d${d}`} open={aberto}>
      <summary>
        <b className="es-ec-dia-tit">{titulo}</b>
        <span className="es-ec-dia-sub">
          {preenchidos ? `${preenchidos} de ${cont(doDia.length, 'posto', 'postos')}` : cont(doDia.length, 'posto', 'postos')}
        </span>
        <span className="es-ec-dia-est"><Pilula tom={resumo.tom}>{resumo.txt}</Pilula></span>
      </summary>

      <div className="es-ec-dia-corpo">
        <Corpo {...{ d, passado, S, dia, doDia, r, probs, preenchidos, ocupado, semFuncoes, aviso,
          gerarUm, trocar, situacao, travar, marcarPrimeira, salvarObs, novoPlantao, tirarOEvento }} />
        {/* tirar o evento fica DENTRO do dia, e não na lista de cima: quem
            quer remover está olhando para ele. E só aparece em evento — o
            domingo não se apaga por aqui (a RPC recusa, e a tela também não
            oferece). */}
        {dia?.evento && dia?.cultoId && !passado && (
          <div className="es-linha es-ec-tirar">
            <button className="es-btn es-txt es-peq es-perigo" disabled={ocupado}
              onClick={() => tirarOEvento(dia.cultoId!, dia.evento!)}>
              Tirar {dia.evento} da escala
            </button>
          </div>
        )}
      </div>
    </details>
  );
}

function Corpo({ d, passado, S, dia, doDia, probs, preenchidos, ocupado, semFuncoes, aviso,
  gerarUm, trocar, situacao, travar, marcarPrimeira, salvarObs, novoPlantao }: PropsCorpo) {
  /* 01/10/2026: toda mensagem que vai para o grupo fecha com o link do
     ministério (nunca o de alguém), que leva cada pessoa à própria página */
  const { base, equipe, pinta } = useApp();
  const link = linkDoVoluntario(base, equipe?.slug);
  const cobranca = msgConfirmar(S, d, link);
  /* dia que já passou não se manda: lá "Copiar a escala" volta a ser a de
     contorno, como sempre foi */
  const temGrupos = !passado && gruposValidos(S).length > 0;
  const [mandar, setMandar] = useState(false);

  return (
    <>
      {/* AS AÇÕES DO DIA. Copiar a escala é a que o líder usa toda semana, e
          por isso é a de contorno, a mais forte do dia, QUANDO HÁ ESCALA. Num
          dia vazio (todo mês novo nasce assim) a mais forte oferecia copiar
          uma escala que não existe e a única ação que mudava algo, sortear,
          era a secundária 57px abaixo. Auditoria de 07/09: hierarquia
          invertida no estado em que o líder mais precisa de direção. No
          vazio, sortear é a de contorno e copiar espera, desligado. Cobrar só
          aparece quando há quem cobrar. Nenhuma é cheia: a ação cheia da tela
          é "Montar o mês inteiro", no alto. */}
      <div className="es-linha">
        {preenchidos ? (
          <>
            {/* MANDAR NOS GRUPOS (01/10/2026). Com grupos por área nos
                Ajustes, mandar por grupo vira a ação de contorno do dia e
                copiar a escala inteira desce para texto; sem grupos, fica
                como sempre foi, e "Mandar nos grupos" aparece em texto para
                quem ainda não sabe que dá. */}
            {temGrupos && (
              <button className="es-btn es-peq" aria-expanded={mandar} aria-controls={mandar ? `mg${d}` : undefined}
                onClick={() => setMandar(v => !v)}>
                <IcEnviar />Mandar nos grupos
              </button>
            )}
            <button className={`es-btn es-peq${temGrupos ? ' es-txt' : ''}`}
              onClick={() => copiar(msgEscala(S, d, { link }), aviso, 'Escala copiada. Cole no grupo.')}>
              <IcCopiar />Copiar a escala
            </button>
            {!temGrupos && !passado && (
              <button className="es-btn es-txt es-peq" aria-expanded={mandar} aria-controls={mandar ? `mg${d}` : undefined}
                onClick={() => setMandar(v => !v)}>
                <IcEnviar />Mandar nos grupos
              </button>
            )}
            <button className="es-btn es-txt es-peq" disabled={ocupado || !S.voluntarios.length || semFuncoes} onClick={() => gerarUm(d)}>
              <IcDado />Sortear de novo
            </button>
          </>
        ) : (
          <>
            <button className="es-btn es-peq" disabled={ocupado || !S.voluntarios.length || semFuncoes} onClick={() => gerarUm(d)}>
              <IcDado />Sortear este dia
            </button>
            <button className="es-btn es-txt es-peq" disabled><IcCopiar />Copiar a escala</button>
          </>
        )}
        {!passado && !!cobranca && (
          <button className="es-btn es-txt es-peq" onClick={() => copiar(cobranca, aviso, 'Cobrança copiada. Cole no grupo.')}>
            <IcSino />Cobrar confirmação
          </button>
        )}
      </div>

      {mandar && !passado && !!preenchidos && !!equipe && (
        <MandarNosGrupos S={S} d={d} base={base} slug={equipe.slug} equipeId={equipe.id}
          aviso={aviso} id={`mg${d}`} />
      )}

      {/* OS PROBLEMAS APONTAM PARA A LINHA. Eram frases soltas: o líder lia
          "Fulano está em PROJEÇÃO e ILUMINAÇÃO ao mesmo tempo" e caçava as
          duas linhas numa lista de nove. Agora o texto leva até lá. */}
      {!!probs.length && (
        <div className="es-ec-probs">
          {probs.map((p: any, i: number) => (
            <Aviso key={i} tom={p.grau === 'erro' ? 'bad' : 'warn'}>
              {p.texto}
              {!!p.foco?.length && (
                <>{' '}<a className="es-ec-ir" href={`#p${d}-${slugFn(p.foco[0])}`}>ir para {p.foco[0]}</a></>
              )}
            </Aviso>
          ))}
        </div>
      )}

      {!passado && doDia.length > 0 && preenchidos === 0 && (
        <p className="es-ec-nota">
          Ninguém escalado ainda. <b>Sortear</b> preenche tudo de uma vez.
        </p>
      )}

      {/* quem respondeu posso/não posso neste dia: é o que decide a escolha */}
      {!passado && <Disponibilidade d={d} S={S} aviso={aviso} />}

      {/* Relatório que o líder ESCALADO escreveu no fim daquele culto. Aqui é
          só leitura: quem viveu o dia é quem escreve, no link dele. */}
      {(dia?.relatorio || dia?.problemas) && (
        <div className="es-caixa es-ec-relato">
          <span className="es-ec-rot">Relatório de quem liderou o dia</span>
          {dia.relatorio && <p>{dia.relatorio}</p>}
          {dia.problemas && <p><b>Problemas:</b> {dia.problemas}</p>}
          {dia.relatadoEm && <small>enviado em {new Date(dia.relatadoEm).toLocaleString('pt-BR')}</small>}
        </div>
      )}

      {/* recado ACIMA da escala: escreve o aviso antes de montar e publicar.
          Ele vai na mensagem do grupo E na tela de quem está escalado. */}
      <label className="es-campo es-ec-recado">
        <span>Recado deste dia</span>
        {/* UMA LINHA, COMO SEMPRE FOI: com `textarea`, o Enter gravava uma
            quebra que a mensagem do grupo mantinha e a tela do voluntário
            juntava (auditoria de 30/09/2026). O Enter aqui é "pronto". */}
        <input className="es-ctl" enterKeyHint="done" defaultValue={dia?.obs || ''} disabled={ocupado}
          placeholder="ex: chegar 18h, tem batismo"
          onBlur={e => { if (e.target.value !== (dia?.obs || '')) void salvarObs(d, e.target.value); }} />
        <small>Vai na mensagem do grupo e no link de quem está escalado.</small>
      </label>

      {/* O REPERTÓRIO (01/10/2026): com ele ligado nos Ajustes, o setlist do
          culto. Só em dia que já tem culto no banco (o link mora nele) e que
          ainda não passou. */}
      {!!S.config.repertorio && !passado && !!dia?.cultoId && !!equipe?.id && (
        <RepertorioDoDia S={S} d={d} cultoId={dia.cultoId} equipeId={equipe.id}
          ocupado={ocupado} pinta={pinta} aviso={aviso} />
      )}

      {/* 105 · A ORDEM DO CULTO (02/10/2026): as músicas com tom, BPM e cifra, e
          os momentos com a duração. Mesma regra do repertório: com ele ligado,
          em dia que tem culto no banco e que ainda não passou. */}
      {!!S.config.repertorio && !passado && !!dia?.cultoId && !!equipe?.id && (
        <OrdemDoCulto S={S} d={d} cultoId={dia.cultoId} equipeId={equipe.id}
          ocupado={ocupado} pinta={pinta} aviso={aviso} />
      )}

      {/* ------------------------------------------------------- os postos
          Uma linha por posto, e o plantão fecha a lista. */}
      <div className="es-fila es-ec-postos">
        {doDia.map((f: any) => (
          <Posto key={f.nome} {...{ d, f, S, dia, ocupado, trocar, situacao, travar, marcarPrimeira }} />
        ))}
        <div className="es-ec-posto es-ec-plantao">
          <span className="es-ec-fn">Plantão</span>
          <span className="es-ec-quem">
            {dia?.plantao?.length
              ? <b className="es-ec-plantao-nomes">{dia.plantao.map((p: string) => nomeDe(S, p)).join(', ')}</b>
              : <span className="es-ec-plantao-vazio">ninguém ainda</span>}
          </span>
          <span className="es-ec-extra">
            <span className="es-ec-sit"><Pilula tom="info">entra se alguém faltar</Pilula></span>
            <span className="es-ec-marcas">
              <button className="es-btn es-txt es-peq" disabled={ocupado || !S.voluntarios.length || semFuncoes} onClick={() => novoPlantao(d)}>
                Sugerir
              </button>
            </span>
          </span>
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

  /* A COR MORA NA SITUAÇÃO, NÃO NA LINHA (30/09/2026). O fio colorido à
     esquerda de cada posto saiu: a pílula da situação já diz confirmou /
     falta confirmar / não pode, e a vaga sem ninguém é o campo tracejado.
     Sem pessoa não há situação, e a pílula some. */
  return (
    <div className="es-ec-posto" id={`p${d}-${slugFn(f.nome)}`}>
      <span className="es-ec-fn">{f.nome}</span>

      {/* O NOME OCUPA A LINHA INTEIRA e é só o nome. O contexto que ajuda a
          ESCOLHER (nível, carga, se a pessoa disse que pode) vive dentro da
          lista, que é onde ele é usado. */}
      <span className="es-ec-quem">
        <Escolha
          forma="campo" valor={slot?.vid || ''} vazia={!slot?.vid} desabilitado={ocupado}
          rotulo={`Quem faz ${f.nome} em ${fmtLongo(d)}`}
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
      </span>

      {slot?.vid && (
        <span className="es-ec-extra">
          {/* A SITUAÇÃO. Não existia nesta tela: só no painel e só para o
              próximo culto. É por isso que o banco tem 0 furos marcados em 92
              escalações. */}
          <span className="es-ec-sit">
            <Escolha
              forma="pill" tom={tomDoStatus(st)} valor={st} desabilitado={ocupado || !dia?.cultoId}
              rotulo={`Situação de ${nomeDe(S, slot.vid)} em ${f.nome}`}
              mostra={SITUACOES.find(s => s.v === st)?.rot || st}
              aoMudar={v => situacao(d, f.nome, v as Status)}>
              {SITUACOES.map(s => <option key={s.v} value={s.v}>{s.rot}</option>)}
            </Escolha>
          </span>

          {/* fixo e 1ª vez são fichas que acendem (`aria-pressed`). Eram dois
              ícones sem rótulo, e o cadeado ativo ficava preto sobre preto. */}
          <span className="es-ec-marcas">
            <button className="es-ficha" aria-pressed={!!slot.fixo} disabled={ocupado} onClick={() => travar(d, f.nome)}>
              fixo
            </button>
            <button className="es-ficha" aria-pressed={!!slot.primeiraVez} disabled={ocupado} onClick={() => marcarPrimeira(d, f.nome)}>
              1ª vez
            </button>
          </span>
          {(slot.fixo || slot.primeiraVez || !!slot.trocouDe) && (
            <span className="es-ec-notas">
              {slot.fixo && <span>o sorteio não mexe</span>}
              {slot.primeiraVez && <span>chega 30 min mais cedo</span>}
              {/* 103 · a vaga passou por troca aceita no link do voluntário:
                  o líder vê de quem veio, sem precisar ter feito nada */}
              {!!slot.trocouDe && <span>trocou com {nomeDe(S, slot.trocouDe) || 'um colega'}</span>}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

/* quem respondeu posso / não posso neste dia. Fechada, é uma linha de
   contagem; aberta, os nomes e a cobrança de quem não respondeu. */
function Disponibilidade({ d, S, aviso }: any) {
  const rp = respostasDoDia(S, d);
  if (!rp.total) return null;
  return (
    <details className="es-dobra">
      <summary>
        <span className="es-ec-disp-linha">
          <b className="es-ec-disp-tit">Disponibilidade</b>
          <span><b>{rp.posso.length}</b> {pl(rp.posso.length, 'pode', 'podem')}</span>
          <span><b>{rp.nao.length}</b> {pl(rp.nao.length, 'não pode', 'não podem')}</span>
          {rp.mudo.length
            ? <Pilula tom="warn">{rp.mudo.length} não {pl(rp.mudo.length, 'informou', 'informaram')}</Pilula>
            : <span><b>0</b> não informaram</span>}
        </span>
      </summary>
      <div className="es-dobra-corpo es-ec-disp-corpo">
        <div className="es-ec-grupo"><span className="es-ec-rot">Podem</span><p>{rp.posso.map((v: any) => v.nome).join(', ') || 'ninguém'}</p></div>
        <div className="es-ec-grupo"><span className="es-ec-rot">Não podem</span><p>{rp.nao.map((v: any) => v.nome).join(', ') || 'ninguém'}</p></div>
        <div className="es-ec-grupo"><span className="es-ec-rot">Não responderam</span><p>{rp.mudo.map((v: any) => v.nome).join(', ') || 'ninguém'}</p></div>
        {!!rp.mudo.length && (
          <div className="es-linha">
            <button className="es-btn es-peq"
              onClick={() => copiar(
                `Pessoal, quem ainda não respondeu a disponibilidade de ${fmtDia(d)}: ${rp.mudo.map((v: any) => v.nome).join(', ')}. Entrem no link de vocês e marquem posso ou não posso, é rapidinho.`,
                aviso, 'Cobrança copiada. Cole no grupo.')}>
              <IcCopiar />Cobrar quem não respondeu
            </button>
          </div>
        )}
      </div>
    </details>
  );
}
