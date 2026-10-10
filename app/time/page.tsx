'use client';
import Shell, { useApp, copiar } from '@/components/Shell';
import Link from 'next/link';
import { Fragment, useState } from 'react';
import {
  atualizarVoluntario, conferirVoluntario, criarVoluntario, definirHabilidade, limparPinDe, removerVoluntario,
} from '@/lib/db';
import { cont, pl } from '@/lib/plural';
import {
  Cab, Kpis, Kpi, Secao, Pilula, Aviso, Vazio, Fio, Dobra, Tom, tomCls,
} from '@/components/escalas/Pecas';
import { IcBusca, IcMais, IcSeta, IcX } from '@/components/Icones';
import { aviseHumano } from '@/lib/erros';
import { confirmar } from '@/lib/confirmar';
import {
  Nivel, SEXOS, confirmada, esperaLiberacao, filaDeConferencia, funcoesAtivas, hojeISO,
  msgConvite, pendenciasDeSexo, saudeDoTime,
} from '@/lib/engine';
import { telefoneOk } from '@/lib/nome';
import { PRINCIPAL } from '@/lib/meu-token';

/* =============================================================================
   O TIME

   Quem serve, o que cada um sabe fazer e quanto cada um já pegou. Na língua
   do Financeiro e do Demandas desde 30/09/2026: a situação no título, os
   números que decidem numa faixa, a busca e as funções como ferramenta, as
   pessoas numa fila com colunas (pessoa, carga, situação), e o diagnóstico
   das funções numa tabela. Cor só na pílula, no número e no aviso.
   ============================================================================= */

/* O TOM DE UMA FUNÇÃO NO DIAGNÓSTICO (30/09/2026). O motor diz "crítico"
   para duas coisas diferentes: falta gente que saiba fazer, e falta o líder
   conferir quem disse que sabe. Vermelho no sistema é falta de gente; a
   conferência que espera o líder é âmbar, como a casa "A conferir" logo
   acima. ILUMINAÇÃO com 5 pessoas e ninguém conferido aparecia com a barra
   cheia em vermelho, e o líder ia atrás de voluntário quando o que faltava
   era ele conferir. */
function tomDaFuncao(f: { grau: string; aptos: number; titulares: number; declarados: number }): Tom {
  if (f.grau === 'ok') return 'ok';
  if (f.aptos <= 1) return 'bad';                               // ninguém ou uma pessoa só
  if (f.titulares === 0 && f.declarados === 0) return 'bad';    // ninguém segura sozinho
  return 'warn';                                                // espera conferência, ou sem folga
}

export default function Pagina() { return <Shell><Time /></Shell>; }

const CICLO: (Nivel | null)[] = [null, 'titular', 'reserva', 'treino'];
const CURTO: Record<string, string> = { titular: 'faz sozinho', reserva: 'ajuda quando falta', treino: 'aprendendo' };
/* O NOME DA FUNÇÃO NO FILTRO, SEM O PARÊNTESE.
   "TRANSMISSÃO (CORTE + PTZ)" tem 25 caracteres e sozinha empurrava a fila de
   filtros para uma segunda linha, quebrando a grade. O parêntese é detalhe
   operacional que importa na escala e não na hora de filtrar — quem procura
   quer a família, e a família é a palavra antes dele. */
function curtoF(nome: string) {
  const sem = nome.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  return sem || nome;
}

/* as colunas da fila de pessoas no desktop: nada em `auto` (ver a fila em
   escalas.css), para a coluna Pessoa não andar de uma linha para outra */
/* Pessoa, Carga e a seta. A situação (aguardando, pausado, furos) mora
   junto do nome desde 30/09/2026: é exceção, e numa coluna própria deixava
   o cabeçalho "Situação" em cima de 12 células vazias de 17. */
const COLUNAS = { '--es-cols': 'minmax(0,1fr) 96px 24px' } as React.CSSProperties;

function Time() {
  const { S, recarregar, aviso, base, equipe } = useApp();
  const [nome, setNome] = useState('');
  const [tel, setTel] = useState('');
  const [novas, setNovas] = useState<Record<string, Nivel>>({});
  const [novoSexo, setNovoSexo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [chipSalvando, setChipSalvando] = useState('');
  /* BUSCA E FILTRO — 07/09/2026.
     A lista nasceu com 17 pessoas e sem nenhuma forma de encontrar alguém: só
     rolagem e leitura. O Connect tem 16 postos, e a pergunta que o líder faz
     nesta tela não é "quem está no time" — é "quem sabe fazer PROJEÇÃO" e
     "cadê a Amanda". As duas exigiam varrer a página inteira lendo etiqueta
     por etiqueta. É o defeito que não aparece com poucos e inviabiliza a tela
     quando o time cresce, que é justamente o objetivo do produto. */
  const [busca, setBusca] = useState('');
  const [porFuncao, setPorFuncao] = useState('');
  /* A PESSOA ABERTA (30/09/2026). A linha resume a pessoa, e o painel só abre
     quando o líder vai mexer: quando cada pessoa vinha aberta, ocupava mais
     de mil pixels e o Time tinha 39 mil de rolagem. Era um <details> por
     pessoa; agora a linha é um botão da fila e o painel nasce logo abaixo
     dela. Várias podem ficar abertas ao mesmo tempo, como antes. O conjunto
     mora aqui, e não na linha,
     porque quem é conferido troca de grupo ("Esperando sua conferência" para
     "Time conferido") e continua aberto, como o <details> continuava quando a
     lista era uma só. */
  const [abertas, setAbertas] = useState<Set<string>>(() => new Set());
  const alternar = (id: string) => setAbertas(s => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const funcoes = funcoesAtivas(S);
  const mapa = new Map(S.funcoes.map(f => [f.nome, f.id!]));
  const saude = saudeDoTime(S);

  async function adicionar() {
    if (!nome.trim()) return;
    setOcupado(true);
    try {
      const novoId = await criarVoluntario(equipe!.id, nome.trim(), tel.trim(), S.config.limitePadrao, novas);
      /* o sexo vai num segundo passo de propósito. A RPC `criar_voluntario`
         existe para identidade, vínculo e habilidades caírem numa transação
         só; sexo não é nada disso, e mudar a assinatura dela obrigaria a
         migrar o cadastro público junto. Se este passo falhar, a pessoa nasce
         sem sexo e o aviso do topo desta tela cobra — que é exatamente o que
         já acontece com quem foi cadastrado antes desta regra existir. */
      if (novoSexo) { try { await atualizarVoluntario(novoId, { sexo: novoSexo }); } catch {} }
      setNome(''); setTel(''); setNovas({}); setNovoSexo('');
      await recarregar(); aviso(`${nome.trim()} entrou no time`);
    } catch (e) { aviso(aviseHumano(e)); }
    setOcupado(false);
  }

  async function ciclar(vid: string, funcao: string) {
    const chave = vid + '|' + funcao;
    if (chipSalvando) return;                 // ignora toque duplo enquanto salva
    setChipSalvando(chave);
    const atual = S.voluntarios.find(v => v.id === vid)?.funcoes[funcao] || null;
    const prox = CICLO[(CICLO.indexOf(atual as any) + 1) % CICLO.length];
    try { await definirHabilidade(vid, mapa.get(funcao)!, prox); await recarregar(); }
    catch (e) { aviso(aviseHumano(e, 'salvar')); await recarregar(); }
    setChipSalvando('');
  }
  const teclaAtiva = (fn: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); fn(); }
  };

  /* GRAVAÇÃO SEM SINAL NENHUM — 20/09/2026, auditoria de frontend.

     Esta função grava nome, telefone, teto e sexo, e não dizia nada: nem
     enquanto grava, nem quando termina. A pessoa mudava o teto de alguém,
     tocava fora, e a tela ficava igual. Sem saber se salvou, o líder ou
     desiste ou faz de novo — e fazer de novo numa gravação que deu certo é
     como nascem os toques duplos.

     `ciclar`, vinte linhas acima, já fazia certo com `chipSalvando`. Aqui
     faltava. O erro já falava; o silêncio era só do caminho que dá certo. */
  async function mudar(vid: string, campos: any) {
    setOcupado(true);
    try { await atualizarVoluntario(vid, campos); await recarregar(); aviso('Salvo'); }
    catch (e) { aviso(aviseHumano(e, 'salvar')); await recarregar(); }
    setOcupado(false);
  }

  /* O TELEFONE NÃO É TEXTO LIVRE: É CHAVE.
     O banco tem uma unique em (equipe_id, tel_norm(telefone)) que só alcança
     quem tem 10 dígitos ou mais, e a entrada pela lista da equipe confere os 4
     últimos dígitos do número. Um número quebrado digitado aqui não reclama na
     hora: ele escapa por baixo da unique — duas linhas da mesma pessoa passam
     a conviver — e some da conferência de 4 dígitos. Quem descobre é a própria
     pessoa, no domingo, sem conseguir entrar.
     A régua é a mesma do cadastro público (supabase/06-auto-cadastro.sql, que
     recusa abaixo de 10 e acima de 13): dígito, e só dígito, é o que conta.
     Vazio continua salvando — apagar o número de alguém é decisão legítima da
     liderança, e vazio não entra na unique nem na conferência. */
  async function salvarTelefone(vid: string, atual: string, campo: HTMLInputElement) {
    const texto = campo.value.trim();
    if (texto === atual) return;
    const dig = texto.replace(/\D/g, '');
    if (texto && !telefoneOk(dig)) {
      /* devolver o valor anterior é o que impede a tela de mentir: sem isso o
         campo continua mostrando o número recusado, e o líder sai da página
         achando que salvou. */
      campo.value = atual;
      aviso('WhatsApp com DDD, de 10 a 13 números. Não salvei.');
      return;
    }
    await mudar(vid, { telefone: texto || null });
  }

  /* 19/09/2026: o texto daqui dizia "O histórico de escalas dele some junto",
     e isso deixou de ser verdade. A migração 52 pôs um gatilho que RECUSA
     apagar quem já serviu — porque o mesmo botão resolvia duas coisas muito
     diferentes: limpar um cadastro errado (certo, e continua funcionando) e
     jogar fora três anos da Letícia (irreversível, e ninguém quer).
     Quem tem histórico sai por "Pausar", que está na linha ao lado. */
  async function remover(vid: string, nome: string) {
    if (!await confirmar({
      titulo: `Remover ${nome} do time?`,
      texto: 'Só dá para remover quem ainda não serviu nenhuma vez: é para limpar cadastro errado. Quem já tem escala no histórico sai por "Pausar".',
      acao: 'Remover', perigo: true,
    })) return;
    try { await removerVoluntario(vid); await recarregar(); aviso('Removido'); }
    catch (e) { aviso(aviseHumano(e)); }
  }

  /* ===================================================================== 76
     DESTRAVAR O PIN DE ALGUÉM DA PRÓPRIA ÁREA.

     O PIN existe para quem NÃO guardou o link: a pessoa vai em
     /servir/<ministério>, escolhe o nome, prova os quatro últimos dígitos do
     telefone e cria um PIN que vale dali em diante. Só que `eu_trocar_pin`,
     na tela pessoal, não pede o PIN antigo — e isso está certo, porque quem
     abriu aquela tela já tem o link, que é a credencial mais forte.

     O que não existia era a volta. Medido em 21/09: alguém abre o link da
     Maria (ela mostrou a escala no celular, mandou no grupo da família) e
     toca "Criar meu PIN". Meses depois a Maria perde o link, vai em
     /servir/louvor, digita os quatro dígitos DELA e recebe:

         "Você já criou seu PIN. Entre com ele."

     Ela nunca criou. E nada no sistema limpava `pin_hash`: nem o GRANT do
     organizador (a coluna é credencial e está fora de tudo desde a 52), nem
     função nenhuma. A pessoa ficava trancada para sempre.

     Não é só o caso do engano: é qualquer um que esqueceu o PIN.

     `pin_limpar` (migração 76) não devolve o link — quem quiser mandar o
     link manda pelo botão ao lado, que é outro ato e já existia. Ela só
     devolve à pessoa a porta de /servir/<ministério>. */
  /* ONDE A PESSOA CRIA O PIN NOVO, COM O ENDEREÇO INTEIRO (01/10/2026). O aviso
     dizia "Ela já pode criar outro em /servir": de /servir até o nome dela são
     quatro telas (área, "Já sirvo aqui", ministério, lista), e o "Ela" valia
     para João também. Agora o aviso diz o endereço da lista da equipe, que é
     onde ela toca no próprio nome, e chama a pessoa pelo nome. */
  const ondeCriaPin = `${PRINCIPAL.replace(/^https?:\/\//, '')}/equipe/${equipe?.slug || ''}`;
  async function limparPin(vid: string, nome: string) {
    if (!await confirmar({
      titulo: `Apagar o PIN de ${nome}?`,
      texto: `Use quando a pessoa esqueceu o PIN ou diz que nunca criou um. Ela cria outro na hora em ${ondeCriaPin}, tocando no próprio nome e confirmando os quatro últimos números do WhatsApp. O link pessoal não muda.`,
      acao: 'Apagar o PIN',
    })) return;
    try {
      const r = await limparPinDe(vid);
      if (!r.ok) { aviso(r.erro === 'SEM_PERMISSAO' ? 'Essa pessoa não é da sua área.' : 'Não consegui apagar agora.'); return; }
      /* a frase diz o que ACONTECEU, e os dois casos são diferentes: quem não
         tinha PIN nenhum não foi destravado de nada, e dizer "PIN apagado"
         ali faria o organizador achar que resolveu um problema que continua
         de pé. */
      const primeiro = nome.trim().split(/\s+/)[0];
      aviso(r.tinha_pin
        ? `PIN de ${nome} apagado. ${primeiro} cria outro em ${ondeCriaPin}, tocando no próprio nome.`
        : `${nome} não tinha PIN. O problema é outro: confira o telefone cadastrado.`);
      await recarregar();
    } catch (e) { aviso(aviseHumano(e)); }
  }

  /* quem se cadastrou sozinho já entra valendo; isto só tira o destaque
     depois que o líder olhou o nível que a pessoa declarou. */
  async function conferir(vid: string, nome: string) {
    try { await conferirVoluntario(vid); await recarregar(); aviso(`${nome} conferido`); }
    catch (e) { aviso(aviseHumano(e)); }
  }

  /* "Adicionar pessoa", no alto, leva ao formulário que já existe no fim da
     tela: abre a dobra, rola até ela e põe o cursor no nome. */
  function abrirAdicionar() {
    const d = document.getElementById('adicionar') as HTMLDetailsElement | null;
    if (!d) return;
    d.open = true;
    d.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.getElementById('add-nome')?.focus({ preventScroll: true });
  }

  const fila = filaDeConferencia(S);
  /* CONTAGEM, não lista. Já escrevi `pendentes.length` aqui embaixo uma vez e a
     seção inteira sumiu em silêncio: número não tem length. */
  const pendentes = fila.reduce((a, x) => a + x.pendentes.length, 0);

  /* novos primeiro: é o que o líder precisa olhar assim que abre */
  const todos = [...S.voluntarios].sort(
    (a, b) => Number(a.conferido !== false) - Number(b.conferido !== false)
  );
  /* sem acento e sem caixa: quem procura "giovana" acha "Giovana", e quem
     procura "rosalem" acha pelo sobrenome — busca que só casa o começo do
     primeiro nome não serve para lista de gente. */
  const chave = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const alvo = chave(busca.trim());
  const ordenados = todos.filter(v =>
    (!alvo || chave(v.nome).includes(alvo)) &&
    (!porFuncao || !!v.funcoes[porFuncao]));
  const filtrando = !!alvo || !!porFuncao;

  const ativos = S.voluntarios.filter(v => v.ativo).length;
  /* 18/09/2026. A regra do prédio (posto que só aceita homem ou só mulher) é
     aplicada pelo motor e pelo banco, em silêncio. Silêncio aqui é vaga vazia
     sem ninguém entender por quê, então a tela diz a frase inteira: quem falta
     informar, e qual posto ficou sem gente. */
  const temExigencia = funcoesAtivas(S).some(f => f.exigeSexo);
  const pend = pendenciasDeSexo(S);
  /* O QUE AINDA DÁ PARA TROCAR, UMA LINHA POR PESSOA E POSTO (30/09/2026).
     O aviso mandava "troque na aba Escala" listando também cultos que já
     passaram, e repetia o nome a cada data: "Giovana em APOIO (06/09),
     Giovana em APOIO (20/09), Giovana em APOIO (11/10)...". Agora conta só
     de hoje em diante e junta as datas de cada pessoa no mesmo posto. */
  const hoje = hojeISO();
  const errados: { nome: string; funcao: string; datas: string[] }[] = [];
  for (const x of pend.escaladosErrados) {
    if (x.data < hoje) continue;
    const g = errados.find(e => e.nome === x.nome && e.funcao === x.funcao);
    if (g) g.datas.push(x.data); else errados.push({ nome: x.nome, funcao: x.funcao, datas: [x.data] });
  }
  const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  const emLista = (xs: string[]) => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`;
  const temAviso = !S.voluntarios.length || !!pend.semSexo.length
    || !!pend.postosSemNinguem.length || !!errados.length;

  /* DOIS GRUPOS: quem espera a sua conferência e o time conferido, cada um
     numa seção. Desde 30/09/2026 a linha diz a situação da pessoa numa
     pílula ao lado do nome, só quando há o que dizer. */
  /* 102 · TRÊS, COM QUEM ESPERA LIBERAÇÃO NO ALTO. Quem se cadastrou pela
     lista e ninguém liberou não aparece na lista da equipe nem entra no
     sorteio, e a tela chamava isso de "pausado" quando a pessoa já tinha o
     nível conferido: o Elias esperou um mês no Louvor assim. */
  const liberar = ordenados.filter(esperaLiberacao);
  const esperando = ordenados.filter(v => !esperaLiberacao(v) && v.conferido === false);
  const conferidos = ordenados.filter(v => !esperaLiberacao(v) && v.conferido !== false);

  /* OS NÚMEROS DA FAIXA: só o que esta tela já calcula. Frágil é a função
     que não está "ok" no diagnóstico lá de baixo; o vermelho fica para
     a que tem falta de gente (ver `tomDaFuncao`). */
  const inativos = S.voluntarios.length - ativos;
  const frageis = saude.funcoes.filter(f => f.grau !== 'ok').length;
  /* a casa conta pelo MESMO critério da tabela lá embaixo: vermelha é falta
     de gente, âmbar é o resto (espera conferência, um titular só, sem
     folga). Contar "menos de 3 pessoas" dava "3 com pouca gente" em cima de
     uma tabela com uma só vermelha (auditoria de 30/09/2026, rodada 3). */
  const vermelhas = saude.funcoes.filter(f => tomDaFuncao(f) === 'bad').length;
  const ambar = saude.funcoes.filter(f => tomDaFuncao(f) === 'warn').length;
  const furos = saude.pessoas.reduce((a, p) => a + p.furos, 0);

  /* A SITUAÇÃO DA PESSOA, numa pílula só e no tom fixo do sistema: fora da
     escala primeiro, depois o furo (que é por pessoa), e só então o grupo.

     "pausado" descreve uma DECISÃO da liderança, e depois da migração 63 a
     maior parte dos inativos nunca foi ativada: quem já está no sistema e se
     cadastra numa segunda área aberta nasce esperando liberação, porque a
     porta anônima deixou de criar vínculo ativo em identidade que ela não
     criou. Chamar isso de "pausado" manda a líder procurar uma decisão que
     ninguém tomou.

     O SINAL É `conferido`, E ELE NÃO É PERFEITO: não existe coluna dizendo
     "já esteve ativo". Daqui para frente ele acerta sempre, porque a tela só
     deixa conferir quem está ativo (ver as ações, abaixo). Para trás, alguém
     pausado antes de ser conferido aparece como "aguardando". Errar para esse
     lado é barato: as duas palavras pedem a mesma ação da líder, que é
     decidir se a pessoa entra. */
  /* A PÍLULA SÓ QUANDO ACRESCENTA (30/09/2026). "esperando conferência"
     aparecia em sete das dez linhas do grupo "Esperando sua conferência", e
     "conferido" em todas as do "Time conferido": o título do grupo já diz, e
     a repetição era o que a decisão de 08/09 tinha tirado. Fica a pílula do
     que difere do grupo: aguardando, pausado, furos. */
  const situacao = (ativo: boolean, aguardando: boolean, nFuros: number): { tom: Tom; txt: string } | null =>
    !ativo ? (aguardando ? { tom: 'warn', txt: 'aguardando' } : { tom: 'neutro', txt: 'pausado' })
    : nFuros > 0 ? { tom: 'bad', txt: `${nFuros} ${pl(nFuros, 'furo', 'furos')}` }
    : null;

  /* a fila de um grupo: a linha abre a pessoa logo abaixo dela */
  const listaDe = (grupo: typeof ordenados, noGrupoDeLiberar = false) => (
    <div className="es-fila es-colunas" style={COLUNAS}>
      <div className="es-fila-cab" aria-hidden="true">
        <span>Pessoa</span><span className="es-n">Carga</span><span />
      </div>
      {grupo.map(v => {
        const est = saude.pessoas.find(p => p.id === v.id)!;
        const novo = v.conferido === false;
        const aberta = abertas.has(v.id);
        const areas = funcoes.filter(f => v.funcoes[f.nome]);
        /* limiteMes nulo = a pessoa segue o padrão da equipe. Sem esse
           fallback a linha virava "1/" e o select ficava sem opção marcada. */
        const limite = v.limiteMes ?? S.config.limitePadrao;
        const aguardando = esperaLiberacao(v);
        /* no grupo "Esperando liberação" o título já diz: a pílula só repetiria */
        const sit0 = situacao(v.ativo, aguardando, est.furos);
        const sit = noGrupoDeLiberar && sit0?.txt === 'aguardando' ? null : sit0;
        return (
          <Fragment key={v.id}>
            <button type="button" className="es-item es-tm-linha" onClick={() => alternar(v.id)}
              aria-expanded={aberta} aria-controls={`pessoa-${v.id}`}>
              <span className="es-c-tit">
                <span className="es-tm-nome">
                  <b>{v.nome}</b>
                  {sit && <Pilula tom={sit.tom}>{sit.txt}</Pilula>}
                </span>
                {areas.length
                  ? <span className="es-etqs">
                      {areas.map(f => (
                        <span key={f.nome} className="es-etq"
                          title={`${f.nome}: ${CURTO[v.funcoes[f.nome]]}${confirmada(v, f.nome) ? '' : ', a conferir'}`}>
                          {curtoF(f.nome)}
                        </span>
                      ))}
                    </span>
                  : <small>sem área ainda</small>}
              </span>
              <span className="es-c-meta">
                <span className="es-c-num"
                  title={`${cont(est.carga, 'escala', 'escalas')} em ${S.config.janelaCarga} dias; até ${limite} por mês`}>
                  <span className="es-tm-so-pilha">carga </span>{est.carga}/{limite}
                </span>
              </span>
              <span className="es-c-acao"><IcSeta /></span>
            </button>
            {aberta && (
              <div className="es-tm-aberta" id={`pessoa-${v.id}`}>
                <div className="es-caixa">
                  <div className="es-caixa-cab">
                    <p className="es-peq es-mudo">
                      {aguardando
                        ? <>Ainda não aparece na lista da equipe nem entra no sorteio.</>
                        : <>
                            {est.carga} escala{est.carga === 1 ? '' : 's'} em {S.config.janelaCarga} dias
                            {est.parado > 60 && est.carga === 0 && <> · há muito tempo sem servir</>}
                          </>}
                    </p>
                    {/* AS AÇÕES DA PESSOA, NA VOZ DO LÍDER. 08/09/2026. Eram
                        cinco botões em quatro trajes, em quatro linhas no
                        celular. A anatomia continua a de toda ação do líder:
                        UMA em destaque (conferir o nível, se a pessoa é nova;
                        senão, mandar o link) e o resto em texto, na mesma
                        linha. Desde 30/09 o destaque é contorno: a única ação
                        cheia desta tela é "Conferir níveis", no alto. */}
                    {(() => {
                      const tel = (v.tel || '').replace(/\D/g, '');
                      const zap = tel ? `https://wa.me/${tel.length <= 11 ? '55' + tel : tel}?text=${encodeURIComponent(msgConvite(S, v.id, base))}` : null;
                      const copiarLink = () => copiar(msgConvite(S, v.id, base), aviso, 'Link pessoal copiado. Mande no privado.');
                      const link = zap
                        ? <a key="zap" className={novo ? 'es-btn es-txt' : 'es-btn'} href={zap} target="_blank" rel="noopener">Enviar link no WhatsApp</a>
                        : <button key="copia" type="button" className={novo ? 'es-btn es-txt' : 'es-btn'} onClick={copiarLink}>Copiar link pessoal</button>;
                      /* QUEM NÃO ESTÁ ATIVO NÃO TEM LINK QUE FUNCIONE. `eu_dados`
                         exige `and v.ativo`, então mandar o link pessoal para quem
                         está inativo entrega a frase "Link invalido" — e antes da
                         migração 63 isso era raro, porque quase ninguém nascia
                         inativo. Depois dela é o caminho comum: toda pessoa que já
                         existe no sistema e se cadastra numa segunda área aberta
                         chega assim. Então o cartão de quem está inativo oferece só
                         o que resolve: liberar. Conferir o nível vem DEPOIS, e isso
                         também torna inalcançável pela tela o estado
                         "conferido mas nunca ativado", que é o que faria a marca de
                         cima dizer "pausado" para quem nunca entrou.
                         102: o estado já existia, de antes desta regra (o Elias, no
                         Louvor, desde 04/09). Desde a 102 quem decide entre Liberar e
                         Reativar é `liberado_em`, e não `conferido`. */
                      if (!v.ativo) return (
                        <div className="es-linha es-tm-acoes">
                          <button type="button" className="es-btn" onClick={() => mudar(v.id, { ativo: true })}>{aguardando ? 'Liberar' : 'Reativar'}</button>
                          <button type="button" className="es-btn es-txt es-perigo" onClick={() => remover(v.id, v.nome)}>Remover</button>
                        </div>
                      );
                      return (
                        <div className="es-linha es-tm-acoes">
                          {novo && <button type="button" className="es-btn" onClick={() => conferir(v.id, v.nome)}>Conferi, está certo</button>}
                          {link}
                          {zap && <button type="button" className="es-btn es-txt" onClick={copiarLink}>Copiar link</button>}
                          <button type="button" className="es-btn es-txt" onClick={() => limparPin(v.id, v.nome)}>Apagar PIN</button>
                          <button type="button" className="es-btn es-txt" onClick={() => mudar(v.id, { ativo: false })}>Pausar</button>
                          <button type="button" className="es-btn es-txt es-perigo" onClick={() => remover(v.id, v.nome)}>Remover</button>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="es-caixa-corpo es-tm-pilha">
                    {/* ================================================== 81
                        O QUE A LÍDER ESTÁ LIBERANDO.

                        Este cadastro veio pelo formulário público com um
                        telefone que o sistema JÁ conhecia, então o vínculo
                        nasceu colado na identidade dessa pessoa — e quem
                        digitou o nome foi quem preencheu o formulário.

                        Quase sempre é a própria pessoa entrando numa segunda
                        área, e aí não há nada a fazer além de conferir. Mas foi
                        por aqui que a cadeia medida na migração 81 passou:
                        anônimo se inscreve com o telefone de alguém, a líder
                        clica "Liberar" sem nada na tela dizer que o nome
                        diverge, e o link pessoal da vítima sai pela porta do
                        PIN.

                        O banco já segura o passo seguinte (o PIN espera alguém
                        conferir). Este aviso existe para que a líder saiba o
                        que está olhando ANTES de conferir, que é o momento em
                        que a decisão é dela. Os dois nomes aparecem lado a lado
                        quando divergem, porque é a divergência que ela precisa
                        julgar. */}
                    {v.identidadeReivindicada && (
                      <Aviso tom="warn">
                        {v.nomeDaPessoa && v.nomeDaPessoa.trim().toLowerCase() !== v.nome.trim().toLowerCase() ? (
                          <>Este cadastro usou o WhatsApp de <b>{v.nomeDaPessoa}</b>, que já está no sistema,
                          mas o nome digitado foi <b>{v.nome}</b>. Confirme com {v.nomeDaPessoa.split(' ')[0]} antes
                          de conferir: conferir é o que libera o acesso dela ao link pessoal.</>
                        ) : (
                          <>Este cadastro veio pelo formulário público com um WhatsApp que o sistema já
                          conhecia. Se for a mesma pessoa entrando nesta área, toque em &ldquo;Conferi, está
                          certo&rdquo;: é isso que libera o acesso dela pelo PIN.</>
                        )}
                      </Aviso>
                    )}

                    <div className="es-campo">
                      <span>O que sabe fazer</span>
                      <div className="es-tm-niveis">
                        {funcoes.map(f => {
                          const n = v.funcoes[f.nome];
                          /* nível que a pessoa declarou e ninguém conferiu fica
                             tracejado: é a diferença entre "eu sei" e "o time
                             sabe que ela sabe". */
                          const sodito = !!n && !confirmada(v, f.nome);
                          return (
                            <span key={f.nome} className={'es-tm-nivel' + (n ? ' es-tm-tem' : '') + (sodito ? ' es-tm-dito' : '')}
                              role="button" tabIndex={0}
                              title={sodito ? 'nível declarado pela própria pessoa, ainda não conferido' : undefined}
                              aria-disabled={!!chipSalvando}
                              aria-busy={chipSalvando === v.id + '|' + f.nome || undefined}
                              onKeyDown={teclaAtiva(() => ciclar(v.id, f.nome))}
                              onClick={() => ciclar(v.id, f.nome)}>
                              {f.nome}{n ? <small> · {CURTO[n]}</small> : ''}{sodito ? ' ?' : ''}
                            </span>
                          );
                        })}
                      </div>
                      <small>Toque na função para trocar o nível. O &ldquo;?&rdquo; marca o que a pessoa declarou e ninguém conferiu.</small>
                    </div>

                    <div className="es-tm-campos">
                      <label className="es-campo" htmlFor={'tel-' + v.id}>
                        <span>WhatsApp</span>
                        <input className="es-ctl" id={'tel-' + v.id} key={v.tel} defaultValue={v.tel || ''} placeholder="11999998888"
                          type="tel" inputMode="tel" autoComplete="tel" enterKeyHint="done"
                          onBlur={e => void salvarTelefone(v.id, v.tel || '', e.target)} />
                      </label>
                      {/* 18/09/2026: só aparece onde serve para alguma coisa. Se
                          nenhum posto desta área tem exigência, perguntar o sexo
                          de todo mundo seria coletar dado por coletar. */}
                      {temExigencia && (
                        <label className="es-campo">
                          <span>Homem ou mulher</span>
                          <select className="es-ctl" key={String(v.sexo)} aria-label={`Homem ou mulher: ${v.nome}`}
                            defaultValue={v.sexo || ''}
                            onChange={e => mudar(v.id, { sexo: e.target.value || null })}>
                            <option value="">não informado</option>
                            {SEXOS.map(x => <option key={x.v} value={x.v}>{x.rot}</option>)}
                          </select>
                        </label>
                      )}
                      <label className="es-campo">
                        <span>Máximo de escalas por mês</span>
                        <select className="es-ctl" key={String(v.limiteMes)} aria-label={`Máximo de escalas por mês de ${v.nome}`}
                          defaultValue={v.limiteMes == null ? '' : String(v.limiteMes)}
                          onChange={e => mudar(v.id, { limite_mes: e.target.value === '' ? null : +e.target.value })}>
                          <option value="">segue a equipe ({S.config.limitePadrao} por mês)</option>
                          {/* 10/10/2026 · ATÉ 10, NÃO ATÉ 5. Com o Follow no sábado o mês
                              tem 8 a 10 cultos, e quem é FIXO num posto (Hugo na
                              transmissão, Dudu e Dourado nas câmeras) serve em todos. Com o
                              teto em 5, o sorteio do dia 26 tirava essa pessoa do posto a
                              partir do sexto culto e o líder tinha de recolocar à mão todo
                              mês. Valor fora da lista (gravado direto no banco) aparece
                              como está, em vez de a tela mostrar "segue a equipe" e mentir. */}
                          {Array.from(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, ...(v.limiteMes != null ? [v.limiteMes] : [])]))
                            .sort((a, b) => a - b)
                            .map(n => <option key={n} value={n}>{n === 10 ? '10 por mês (todo culto)' : `${n} por mês`}</option>)}
                        </select>
                      </label>
                    </div>

                    {!!v.indisponivel.length && (
                      <div className="es-campo">
                        <span>Avisou que não pode</span>
                        {/* data é informação, não controle: etiqueta quieta, sem
                            borda (o que tem borda, se aperta) */}
                        <div className="es-etqs">
                          {v.indisponivel.sort().map(d => (
                            <span key={d} className="es-etq es-num">{d.slice(8, 10)}/{d.slice(5, 7)}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </Fragment>
        );
      })}
    </div>
  );

  return (
    <>
      {ocupado && <Fio />}
      {/* O título é a situação do time, não o nome do ministério: a lateral já
          diz de onde é. */}
      <Cab
        rot="Time"
        titulo={S.voluntarios.length ? `${cont(ativos, 'pessoa', 'pessoas')} no time` : 'Ainda não tem time'}
        meta={S.voluntarios.length
          ? 'Quem serve, o que cada um sabe fazer e quanto cada um já pegou.'
          : 'Sem saber quem sabe fazer o quê, não existe rodízio.'}
        acoes={<>
          <button type="button" className="es-btn" onClick={abrirAdicionar}><IcMais />Adicionar pessoa</button>
          {/* A FILA DE CONFERÊNCIA SAIU DAQUI (arquitetura de informação,
              29/08/2026). Esta página carregava 1.509 elementos contra 277 do
              /painel, e a diferença estava toda numa fila que existe só
              enquanto tem fila. TIME é o nome de uma coisa permanente (quem
              são as pessoas), e a fila virou endereço próprio, do mesmo jeito
              que as candidaturas já são. Fica aqui a convocação, porque nível
              não conferido piora a escala de verdade: a ação cheia da tela e o
              número na faixa. */}
          {pendentes > 0 && <Link href="/time/conferir" className="es-btn es-pri">Conferir níveis</Link>}
        </>}
      />

      {!!S.voluntarios.length && (
        <div className="es-secao">
          <Kpis n={4}>
            <Kpi rot="Pessoas ativas" valor={ativos} de={S.voluntarios.length}
              sub={inativos ? `${inativos} fora da escala` : 'ninguém fora da escala'} tom={ativos ? '' : 'zero'} />
            <Kpi rot="A conferir" valor={pendentes} destaque={pendentes > 0}
              sub={pendentes ? `${pl(pendentes, 'nível', 'níveis')} esperando você` : 'tudo conferido'}
              tom={pendentes ? 'warn' : 'zero'} />
            <Kpi rot="Funções frágeis" valor={frageis} de={saude.funcoes.length}
              sub={/* a linha explica o número inteiro, não um pedaço dele: "7" com
                     "3 com menos de 3 pessoas" embaixo deixava quatro sem
                     explicação (duas rodadas de auditoria, 30/09/2026) */
                !frageis ? 'todas de pé'
                : vermelhas && ambar ? `${vermelhas} com falta de gente, ${ambar} ${pl(ambar, 'pede', 'pedem')} atenção`
                : vermelhas ? (vermelhas === 1 ? 'com falta de gente' : 'todas com falta de gente')
                : ambar === 1 ? 'pede atenção' : 'todas pedem atenção'}
              tom={vermelhas ? 'bad' : ambar ? 'warn' : 'zero'} />
            <Kpi rot="Furos" valor={furos} sub={`nos últimos ${S.config.janelaCarga} dias`} tom={furos ? 'bad' : 'zero'} />
          </Kpis>
        </div>
      )}

      {temAviso && (
        <div className="es-secao">
          {!S.voluntarios.length && (
            <Aviso tom="info">Comece pelas pessoas que serviram no último domingo.</Aviso>
          )}
          {!!pend.semSexo.length && (
            <Aviso tom="warn">
              {cont(pend.semSexo.length, 'pessoa está', 'pessoas estão')} sem informar se é homem ou
              mulher, e por isso {pend.semSexo.length === 1 ? 'fica' : 'ficam'} de fora dos postos que
              exigem: {pend.semSexo.map(p => p.nome).join(', ')}. Abra a pessoa e informe no campo
              ao lado do WhatsApp.
            </Aviso>
          )}
          {!!pend.postosSemNinguem.length && (
            <Aviso tom="bad">
              {pend.postosSemNinguem.map(p => `${p.nome} (só ${p.exigeSexo === 'M' ? 'homens' : 'mulheres'})`).join(' e ')}
              {pend.postosSemNinguem.length === 1 ? ' não tem' : ' não têm'} ninguém que possa entrar.
              Essa vaga não vai preencher sozinha.
            </Aviso>
          )}
          {!!errados.length && (
            <Aviso tom="warn">
              Tem gente escalada onde não pode entrar, de antes desta regra existir:{' '}
              {errados.slice(0, 4).map(g => `${g.nome} em ${g.funcao} (${emLista(g.datas.map(ddmm))})`).join('; ')}
              {errados.length > 4 ? `; e mais ${errados.length - 4}` : ''}.
              Ninguém foi tirado da escala: troque na aba Escala.
            </Aviso>
          )}
        </div>
      )}

      {S.voluntarios.length > 5 && (
        <div className="es-secao es-tm-achar">
          <div className="es-busca">
            {/* a lupa não é enfeite: sem ela o campo é um fio com uma frase em
                cinza, e fio com frase em cinza é rótulo, não caixa de digitar. */}
            <IcBusca />
            <label htmlFor="tm-q" className="es-so-leitor">Procurar pessoa pelo nome</label>
            <input id="tm-q" type="search" value={busca} placeholder="Procurar pelo nome"
              autoComplete="off" enterKeyHint="search"
              onChange={e => setBusca(e.target.value)} />
            {!!busca && (
              <button type="button" className="es-tm-limpa" onClick={() => setBusca('')}
                aria-label="Limpar a busca"><IcX /></button>
            )}
          </div>
          {/* as funções da equipe como filtro. Só aparecem quando há mais de
              uma: com uma função só, filtrar por ela devolve a lista inteira. */}
          {funcoes.length > 1 && (
            <div className="es-fichas" role="group" aria-label="Filtrar por função">
              {funcoes.map(f => (
                <button key={f.nome} type="button" className="es-ficha"
                  aria-pressed={porFuncao === f.nome}
                  onClick={() => setPorFuncao(porFuncao === f.nome ? '' : f.nome)}>
                  {curtoF(f.nome)}
                  <span className="es-num">{S.voluntarios.filter(v => v.funcoes[f.nome]).length}</span>
                </button>
              ))}
            </div>
          )}
          {filtrando && !!ordenados.length && (
            <div className="es-linha">
              <span className="es-peq es-dim">
                {`${ordenados.length} de ${todos.length}`}
                {porFuncao && <> em <b>{porFuncao}</b></>}
                {alvo && <> com <b>{busca.trim()}</b> no nome</>}
              </span>
              <button type="button" className="es-btn es-txt es-peq"
                onClick={() => { setBusca(''); setPorFuncao(''); }}>Ver o time todo</button>
            </div>
          )}
        </div>
      )}

      {filtrando && !ordenados.length && (
        <div className="es-secao">
          <Vazio titulo="Ninguém com esse filtro" icone={<IcBusca />} solto>
            {porFuncao && <>em <b>{porFuncao}</b></>}
            {porFuncao && alvo && ' '}
            {alvo && <>com <b>{busca.trim()}</b> no nome</>}
            <div>
              <button type="button" className="es-btn"
                onClick={() => { setBusca(''); setPorFuncao(''); }}>Ver o time todo</button>
            </div>
          </Vazio>
        </div>
      )}

      {!!liberar.length && (
        <Secao id="liberar" titulo="Esperando liberação" n={liberar.length}
          sub="Se cadastraram pela lista da equipe. Até você liberar, o nome não aparece na lista nem entra no sorteio.">
          {listaDe(liberar, true)}
        </Secao>
      )}

      {!!esperando.length && (
        <Secao titulo="Esperando sua conferência" n={esperando.length}
          sub={pendentes > 0
            ? <>Até você conferir, quem disse <b>faz sozinho</b> conta como <b>ajuda quando falta</b> no sorteio.</>
            : undefined}>
          {listaDe(esperando)}
        </Secao>
      )}

      {!!conferidos.length && (
        <Secao titulo="Time conferido" sub={cont(conferidos.length, 'pessoa', 'pessoas')}>
          {listaDe(conferidos)}
        </Secao>
      )}

      {!!S.voluntarios.length && (
        <Secao titulo="Onde o time é frágil"
          sub={<>A meta é 3 por função. Abaixo de três, a escala quebra na primeira gripe. Cada mês,
            coloque alguém como <em>aprendendo</em> na função mais vermelha.</>}>
          <div className="es-caixa">
            <table className="es-tab es-empilha es-tm-frageis">
              <thead>
                <tr>
                  <th>Função</th>
                  <th className="es-n">Pessoas</th>
                  <th className="es-tm-c-med" aria-hidden="true" />
                  <th className="es-tm-c-est">Situação</th>
                </tr>
              </thead>
              <tbody>
                {saude.funcoes.map(f => {
                  const tom = tomDaFuncao(f);
                  return (
                    <tr key={f.nome}>
                      <td className="es-primeira">{f.nome}</td>
                      <td className="es-n" data-rot="Pessoas">{f.aptos} de 3</td>
                      <td className="es-tm-c-med" data-rot="Meta">
                        <span className={'es-tm-medidor' + (tom === 'ok' ? '' : tomCls(tom))} aria-hidden="true">
                          <span style={{ width: `${Math.min(100, Math.round((f.aptos / 3) * 100))}%` }} />
                        </span>
                      </td>
                      {/* a pílula diz o veredito curto: "ninguém conferido: só o
                          que se declararam" fica "ninguém conferido", porque
                          pílula não quebra linha */}
                      <td className="es-tm-c-est" data-rot="Situação">
                        <Pilula tom={tom}>{f.texto.split(':')[0]}</Pilula>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Secao>
      )}

      {/* Cadastrar na mão virou exceção: quase todo mundo entra pelo link do
          grupo. Fica no fim e fechado, para não empurrar a lista do time para
          baixo em toda visita; o "Adicionar pessoa" do alto abre e traz até
          aqui. */}
      <div className="es-secao">
        <Dobra titulo="Adicionar pessoa na mão" nota="quase sempre não é preciso" id="adicionar">
          <div className="es-tm-pilha">
            <div className="es-dupla">
              <label className="es-campo" htmlFor="add-nome">
                <span>Nome</span>
                <input className="es-ctl" id="add-nome" value={nome} onChange={e => setNome(e.target.value)}
                  placeholder="como aparece no grupo do WhatsApp"
                  autoCapitalize="words" autoComplete="name" enterKeyHint="next" />
              </label>
              <label className="es-campo" htmlFor="add-tel">
                <span>WhatsApp</span>
                <input className="es-ctl" id="add-tel" value={tel} onChange={e => setTel(e.target.value)} placeholder="11999998888"
                  type="tel" inputMode="tel" autoComplete="tel" enterKeyHint="done" />
                <small>Sem ele a pessoa não entra pelo link do grupo.</small>
              </label>
            </div>
            {temExigencia && (
              <label className="es-campo es-curto" htmlFor="add-sexo">
                <span>Homem ou mulher</span>
                <select className="es-ctl" id="add-sexo" value={novoSexo} onChange={e => setNovoSexo(e.target.value)}>
                  <option value="">não informado</option>
                  {SEXOS.map(x => <option key={x.v} value={x.v}>{x.rot}</option>)}
                </select>
                <small>Esta área tem posto que só aceita um.</small>
              </label>
            )}
            {/* A LEGENDA É TEXTO. Ela já foi quatro botões que não faziam nada
                (o mesmo desenho do controle de verdade), e quem tentava
                apertar aprendia a desconfiar dos de cima. */}
            <div className="es-campo">
              <span>O que essa pessoa sabe fazer</span>
              <div className="es-tm-niveis">
                {funcoes.map(f => {
                  const n = novas[f.nome];
                  return (
                    <span key={f.nome} className={'es-tm-nivel' + (n ? ' es-tm-tem' : '')}
                      role="button" tabIndex={0}
                      onKeyDown={teclaAtiva(() => {
                        const prox = CICLO[(CICLO.indexOf(n || null) + 1) % CICLO.length];
                        const c = { ...novas }; if (prox) c[f.nome] = prox; else delete c[f.nome];
                        setNovas(c);
                      })}
                      onClick={() => {
                        const prox = CICLO[(CICLO.indexOf(n || null) + 1) % CICLO.length];
                        const c = { ...novas }; if (prox) c[f.nome] = prox; else delete c[f.nome];
                        setNovas(c);
                      }}>
                      {f.nome}{n ? <small> · {CURTO[n]}</small> : ''}
                    </span>
                  );
                })}
              </div>
              <small>
                Toque no nome da função para alternar o nível: faz sozinho, ajuda quando falta,
                aprendendo e nada. É isso que o sorteio usa. Quem está aprendendo nunca cai sozinho
                na escala.
              </small>
            </div>
            <div className="es-linha">
              <button type="button" className="es-btn" disabled={ocupado || !nome.trim()} onClick={adicionar}>
                <IcMais />Adicionar ao time
              </button>
            </div>
          </div>
        </Dobra>
      </div>
    </>
  );
}
