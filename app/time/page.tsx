'use client';
import Shell, { useApp, copiar } from '@/components/Shell';
import Link from 'next/link';
import { Fragment, useState } from 'react';
import {
  atualizarVoluntario, conferirVoluntario, criarVoluntario, definirHabilidade, removerVoluntario,
} from '@/lib/db';
import { Faixa } from '@/components/Faixa';
import { cont } from '@/lib/plural';
import { Aviso, Medidor, Trabalhando } from '@/components/Ui';
import { IcBusca, IcMais, IcSeta } from '@/components/Icones';
import { aviseHumano } from '@/lib/erros';
import { confirmar } from '@/lib/confirmar';
import {
  Nivel, confirmada, filaDeConferencia, funcoesAtivas,
  msgConvite, saudeDoTime,
} from '@/lib/engine';

export default function Pagina() { return <Shell><Time /></Shell>; }

const CICLO: (Nivel | null)[] = [null, 'titular', 'reserva', 'treino'];
const CLASSE: Record<string, string> = { titular: 't', reserva: 'r', treino: 'e' };
const CURTO: Record<string, string> = { titular: 'faz sozinho', reserva: 'ajuda quando falta', treino: 'aprendendo' };
/* Sigla de 4 letras do chip de área. Pegar só a primeira palavra funcionava na
   Mídia (PROJEÇÃO, FOTO), mas no Serviço do Culto todos os postos numerados
   colapsavam: LÍDER 1 e LÍDER 2 viravam "LÍDE", os quatro setores viravam
   "SETO". Quando o último pedaço é curto (1 ou 2 caracteres), ele é justamente
   o que distingue, então entra na sigla. */
/* O NOME DA FUNÇÃO NO FILTRO, SEM O PARÊNTESE.
   "TRANSMISSÃO (CORTE + PTZ)" tem 25 caracteres e sozinha empurrava a fila de
   filtros para uma segunda linha, quebrando a grade. O parêntese é detalhe
   operacional que importa na escala e não na hora de filtrar — quem procura
   quer a família, e a família é a palavra antes dele. */
function curtoF(nome: string) {
  const sem = nome.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  return sem || nome;
}

function marca(nome: string) {
  const p = nome.trim().split(/\s+/);
  const fim = p.length > 1 ? p[p.length - 1] : '';
  return fim && fim.length <= 2 ? p[0].slice(0, 3) + fim : p[0].slice(0, 4);
}

function Time() {
  const { S, recarregar, aviso, base, equipe } = useApp();
  const [nome, setNome] = useState('');
  const [tel, setTel] = useState('');
  const [novas, setNovas] = useState<Record<string, Nivel>>({});
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
  const funcoes = funcoesAtivas(S);
  const mapa = new Map(S.funcoes.map(f => [f.nome, f.id!]));
  const saude = saudeDoTime(S);

  async function adicionar() {
    if (!nome.trim()) return;
    setOcupado(true);
    try {
      await criarVoluntario(equipe!.id, nome.trim(), tel.trim(), S.config.limitePadrao, novas);
      setNome(''); setTel(''); setNovas({});
      await recarregar(); aviso(`${nome.trim().split(' ')[0]} entrou no time`);
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

  async function mudar(vid: string, campos: any) {
    try { await atualizarVoluntario(vid, campos); await recarregar(); }
    catch (e) { aviso(aviseHumano(e, 'salvar')); await recarregar(); }
  }

  async function remover(vid: string, nome: string) {
    if (!await confirmar({
      titulo: `Remover ${nome} do time?`,
      texto: 'O histórico de escalas dele some junto.',
      acao: 'Remover', perigo: true,
    })) return;
    try { await removerVoluntario(vid); await recarregar(); aviso('Removido'); }
    catch (e) { aviso(aviseHumano(e)); }
  }

  /* quem se cadastrou sozinho já entra valendo; isto só tira o destaque
     depois que o líder olhou o nível que a pessoa declarou. */
  async function conferir(vid: string, nome: string) {
    try { await conferirVoluntario(vid); await recarregar(); aviso(`${nome.split(' ')[0]} conferido`); }
    catch (e) { aviso(aviseHumano(e)); }
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
  const chave = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const alvo = chave(busca.trim());
  const ordenados = todos.filter(v =>
    (!alvo || chave(v.nome).includes(alvo)) &&
    (!porFuncao || !!v.funcoes[porFuncao]));
  const filtrando = !!alvo || !!porFuncao;

  /* TIME FALAVA A LÍNGUA VELHA. Cartão cinza, avatar colorido, h1 em Inter
     pesada — a mesma marca em dois produtos diferentes, dependendo da aba.
     Aqui a tela passa para a faixa + seção do resto do sistema. Nada de
     estrutura mudou: continua "conferir nível" no topo e a lista de pessoas
     embaixo, que é a pergunta em aberto com o Arthur e não é minha para
     responder sozinho. */
  const ativos = S.voluntarios.filter(v => v.ativo).length;
  return (
    <div className="lid">
      {ocupado && <Trabalhando />}
      {/* O h1 ERA "MÍDIA". A navegação, 30px acima, já diz Mídia. O maior texto
          da tela repetia o menor e não acrescentava um fato. Agora o título é a
          situação do time, e o placar saiu daqui porque diria o mesmo número em
          outra fonte. Ver components/Faixa.tsx. */}
      <Faixa
        titulo={S.voluntarios.length ? `${cont(ativos, 'pessoa', 'pessoas')} no time` : 'Ainda não tem time'}
        sub={S.voluntarios.length
          ? 'Quem serve, o que cada um sabe fazer e quanto cada um já pegou.'
          : 'Sem saber quem sabe fazer o quê, não existe rodízio.'}
      />
      {!S.voluntarios.length && (
        <Aviso tom="info">Comece pelas pessoas que serviram no último domingo.</Aviso>
      )}

      {/* A FILA DE CONFERÊNCIA SAIU DAQUI — arquitetura de informação, 29/08/2026.

          Esta página carregava 1.509 elementos contra 277 do /painel: era três
          a cinco vezes a mais pesada do produto, e a diferença estava toda numa
          fila que existe só enquanto tem fila. TIME é o nome de uma coisa
          permanente — quem são as pessoas — e quem ocupava o topo era um
          mutirão que some quando acaba.

          A fila virou endereço próprio, do mesmo jeito que as candidaturas já
          são: as duas são caixa de entrada gerada pelo mesmo cadastro, e só uma
          tinha página. Fica aqui a convocação, porque nível não conferido piora
          a escala de verdade — não é detalhe que possa sumir de vista. */}
      {pendentes > 0 && (
        <Link href="/time/conferir" className="lid-alerta ruim" style={{ marginTop: 'var(--e5)' }}>
          <span className="lid-alerta-n">{pendentes}</span>
          <span>
            <span className="lid-alerta-txt">
              {pendentes === 1
                ? 'pessoa esperando você conferir o nível'
                : 'níveis esperando sua conferência'}
            </span>
            <span className="dim pequeno" style={{ display: 'block', marginTop: 'var(--e1)' }}>
              Até você conferir, quem disse <strong>faz sozinho</strong> conta
              como <strong>ajuda quando falta</strong> no sorteio.
            </span>
          </span>
        </Link>
      )}

      {/* DOIS GRUPOS, NÃO DEZESSETE ETIQUETAS.
          A lista já vinha ordenada com os não conferidos primeiro, mas cada um
          deles carregava a própria etiqueta "confira" — dez vezes a mesma
          palavra, empilhada numa coluna. Etiqueta que se repete não informa
          mais, informa menos: vira textura. O nome do grupo diz uma vez o que
          a etiqueta dizia dez, e a contagem ao lado ("10 de 17") responde
          sozinha a pergunta que traz o líder aqui. */}
      {S.voluntarios.length > 5 && (
        <div className="tm-achar">
          <div className="tm-busca">
            <label htmlFor="tm-q" className="so-leitor">Procurar pessoa pelo nome</label>
            {/* a lupa não é enfeite: sem ela o campo é um fio com uma frase em
                cinza, e fio com frase em cinza é rótulo, não caixa de digitar. */}
            <IcBusca className="tm-lupa" />
            <input id="tm-q" type="search" value={busca} placeholder="Procurar pelo nome"
              autoComplete="off" enterKeyHint="search"
              onChange={e => setBusca(e.target.value)} />
            {!!busca && (
              <button type="button" className="tm-limpa" onClick={() => setBusca('')}
                aria-label="Limpar a busca">×</button>
            )}
          </div>
          {/* as funções da equipe como filtro. Só aparecem quando há mais de
              uma: com uma função só, filtrar por ela devolve a lista inteira. */}
          {funcoes.length > 1 && (
            <div className="tm-funcoes" role="group" aria-label="Filtrar por função">
              {funcoes.map(f => (
                <button key={f.nome} type="button"
                  className={`tm-f ${porFuncao === f.nome ? 'on' : ''}`}
                  aria-pressed={porFuncao === f.nome}
                  onClick={() => setPorFuncao(porFuncao === f.nome ? '' : f.nome)}>
                  {curtoF(f.nome)}
                  <i>{S.voluntarios.filter(v => v.funcoes[f.nome]).length}</i>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {filtrando && (
        <div className="tm-achou">
          <span>
            {ordenados.length === 0
              ? 'Ninguém com esse filtro'
              : `${ordenados.length} de ${todos.length}`}
            {porFuncao && <> em <b>{porFuncao}</b></>}
            {alvo && <> com <b>{busca.trim()}</b> no nome</>}
          </span>
          <button type="button" className="tm-zerar"
            onClick={() => { setBusca(''); setPorFuncao(''); }}>Ver o time todo</button>
        </div>
      )}

      {ordenados.map((v, i) => {
        const est = saude.pessoas.find(p => p.id === v.id)!;
        const novo = v.conferido === false;
        const abreGrupo = i === 0 || (ordenados[i - 1].conferido === false) !== novo;
        const noGrupo = ordenados.filter(x => (x.conferido === false) === novo).length;
        /* resumo em uma linha: as áreas da pessoa cabem em micro-chips e o
           cartão inteiro só abre quando o líder vai mexer. Antes cada pessoa
           ocupava mais de mil pixels e o Time tinha 39 mil de rolagem. */
        const areas = funcoes.filter(f => v.funcoes[f.nome]);
        return (
          <Fragment key={v.id}>
          {abreGrupo && (
            <div className="lid-secao-cab" style={{ marginTop: i === 0 ? 'var(--e6)' : 'var(--e8)' }}>
              <span className="rot">{novo ? 'Esperando sua conferência' : 'Time conferido'}</span>
              <span className="lid-secao-nota">
                {novo ? `${noGrupo} de ${ordenados.length}` : `${noGrupo} pessoa${noGrupo === 1 ? '' : 's'}`}
              </span>
            </div>
          )}
          <details className={`tm-pessoa ${novo ? 'card-novo' : ''}`} style={{ opacity: v.ativo ? 1 : .55 }}>
            <summary>
              <span className="cresce">
                <span className="pessoa-nome">{v.nome}{!v.ativo && <span className="marca-est" style={{ marginLeft: 8 }}>pausado</span>}</span>
                <span className="pessoa-areas">
                  {areas.length
                    ? areas.map(f => (
                        <i key={f.nome} className={`marca-nivel ${CLASSE[v.funcoes[f.nome]]}${confirmada(v, f.nome) ? '' : ' so-dito'}`}
                           title={`${f.nome}: ${CURTO[v.funcoes[f.nome]]}`}>{marca(f.nome)}</i>
                      ))
                    : <span className="dim peq">sem área ainda</span>}
                </span>
              </span>
              <span className="pessoa-meta">
                {/* "confira" saiu daqui: agora quem diz isso é o título do grupo,
                    uma vez. O furo continua por pessoa porque é por pessoa. */}
                {est.furos > 0 && <span className="marca-est bad">{est.furos} furo{est.furos > 1 ? 's' : ''}</span>}
                {/* limiteMes nulo = a pessoa segue o padrão da equipe. Sem
                    esse fallback a linha virava "1/" e o select ficava sem
                    opção marcada. */}
                <span className="dim peq num">{est.carga}/{v.limiteMes ?? S.config.limitePadrao}</span>
                <IcSeta className="giro" />
              </span>
            </summary>
            <div className="pessoa-corpo">
            <div className="entre">
              <div className="dim pequeno">
                {est.carga} escala{est.carga === 1 ? '' : 's'} em {S.config.janelaCarga} dias
                {est.parado > 60 && est.carga === 0 && <> · há muito tempo sem servir</>}
              </div>
              {/* AS AÇÕES DA PESSOA, NA VOZ DO LÍDER. 08/09/2026. Eram cinco
                  botões em quatro trajes (pílula verde vazada, pílula com
                  ícone, verde sólido, fantasma em caixa alta, vazado cinza),
                  em quatro linhas no celular — o ponto mais pesado do
                  sistema. Agora é a anatomia de toda ação do líder: UMA sólida
                  (conferir o nível, se a pessoa é nova; senão, mandar o link)
                  e o resto em texto, na mesma linha. */}
              {(() => {
                const tel = (v.tel || '').replace(/\D/g, '');
                const zap = tel ? `https://wa.me/${tel.length <= 11 ? '55' + tel : tel}?text=${encodeURIComponent(msgConvite(S, v.id, base))}` : null;
                const copiarLink = () => copiar(msgConvite(S, v.id, base), aviso, 'Link pessoal copiado. Mande no privado.');
                const link = zap
                  ? <a key="zap" className={novo ? 'lid-bt-txt' : 'lid-bt'} href={zap} target="_blank" rel="noopener">Enviar link no WhatsApp</a>
                  : <button key="copia" className={novo ? 'lid-bt-txt' : 'lid-bt'} onClick={copiarLink}>Copiar link pessoal</button>;
                return (
                  <div className="lid-acoes">
                    {novo && <button className="lid-bt" onClick={() => conferir(v.id, v.nome)}>Conferi, está certo</button>}
                    {link}
                    {zap && <button className="lid-bt-txt" onClick={copiarLink}>Copiar link</button>}
                    <button className="lid-bt-txt" onClick={() => mudar(v.id, { ativo: !v.ativo })}>{v.ativo ? 'Pausar' : 'Reativar'}</button>
                    <button className="lid-bt-txt perigo" onClick={() => remover(v.id, v.nome)}>Remover</button>
                  </div>
                );
              })()}
            </div>

            <div className="chips" style={{ marginTop: 14 }}>
              {funcoes.map(f => {
                const n = v.funcoes[f.nome];
                /* nível que a pessoa declarou e ninguém conferiu fica tracejado:
                   é a diferença entre "eu sei" e "o time sabe que ela sabe". */
                const sodito = !!n && !confirmada(v, f.nome);
                return (
                  <span key={f.nome} className={`chip ${n ? CLASSE[n] : 'add'}${sodito ? ' so-dito' : ''}`}
                    role="button" tabIndex={0}
                    title={sodito ? 'nível declarado pela própria pessoa, ainda não conferido' : undefined}
                    aria-disabled={!!chipSalvando}
                    style={chipSalvando === v.id + '|' + f.nome ? { opacity: .5 } : undefined}
                    onKeyDown={teclaAtiva(() => ciclar(v.id, f.nome))}
                    onClick={() => ciclar(v.id, f.nome)}>
                    {f.nome}{n ? ` · ${CURTO[n]}` : ''}{sodito ? ' ?' : ''}
                  </span>
                );
              })}
            </div>

            {/* `pessoa-campos`: alinhado pela base. Com o rótulo de duas linhas
                ("Máximo de escalas por mês") o `.linha` centrado deixava os dois
                campos 9px fora um do outro. */}
            <div className="linha pessoa-campos" style={{ marginTop: 14 }}>
              <div style={{ width: 190 }}>
                <label htmlFor={'tel-' + v.id}>WhatsApp</label>
                <input id={'tel-' + v.id} key={v.tel} defaultValue={v.tel || ''} placeholder="11999998888"
                  type="tel" inputMode="tel" autoComplete="tel" enterKeyHint="done"
                  onBlur={e => { if (e.target.value.trim() !== (v.tel || '')) void mudar(v.id, { telefone: e.target.value.trim() || null }); }} />
              </div>
              <div style={{ width: 200 }}>
                <label>Máximo de escalas por mês</label>
                <select key={String(v.limiteMes)} aria-label={`Máximo de escalas por mês de ${v.nome}`}
                  defaultValue={v.limiteMes == null ? '' : String(v.limiteMes)}
                  onChange={e => mudar(v.id, { limite_mes: e.target.value === '' ? null : +e.target.value })}>
                  <option value="">segue a equipe ({S.config.limitePadrao} por mês)</option>
                  {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} por mês</option>)}
                </select>
              </div>
              {!!v.indisponivel.length && (
                <div className="cresce">
                  <label>Avisou que não pode</label>
                  <div className="linha" style={{ gap: 'var(--e3)' }}>
                    {v.indisponivel.sort().map(d => (
                      /* data é informação, não controle: sem caixa, pela mesma
                         lei do resto da tela (tem borda, se aperta). */
                      <span key={d} className="marca-est bad">{d.slice(8, 10)}/{d.slice(5, 7)}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            </div>
          </details>
          </Fragment>
        );
      })}

      {!!S.voluntarios.length && (
        <>
          <section className="lid-secao">
          <div className="lid-secao-cab">
            <span className="rot">Onde o time é frágil</span>
            <span className="lid-secao-nota">a meta é 3 por função</span>
          </div>
            {saude.funcoes.map(f => (
              <div className="slot" key={f.nome}>
                <div className="rotulo"><span className="overline">{f.nome}</span></div>
                <Medidor valor={f.aptos} total={3} grau={f.grau as any} />
                <span className="dim pequeno num" style={{ width: 118, textAlign: 'right' }}>
                  {f.aptos} de 3 pessoa{f.aptos === 1 ? '' : 's'}
                </span>
                <span className={`marca-est ${f.grau === 'ok' ? 'ok' : f.grau === 'atencao' ? 'warn' : 'bad'}`}>
                  <span className={`ponto ${f.grau === 'ok' ? 'ok' : f.grau === 'atencao' ? 'warn' : 'bad'}`} />{f.texto}
                </span>
              </div>
            ))}
          <p className="dim pequeno">
            Abaixo de três, a escala quebra na primeira gripe. Cada mês, coloque
            alguém como <em>aprendendo</em> na função mais vermelha.
          </p>
          </section>
        </>
      )}
      {/* Cadastrar na mão virou exceção: quase todo mundo entra pelo link do
          grupo. Fica no fim e fechado, para não empurrar a lista do time para
          baixo em toda visita. */}
      <details className="bloco-extra" style={{ marginTop: 24 }}>
        <summary>
          <span className="cresce">Adicionar pessoa na mão</span>
          <span className="dim peq">quase sempre não é preciso</span>
          <IcSeta className="giro" />
        </summary>
        <div className="bloco-extra-corpo">
      <div className="legenda">
        <strong>Marque o que cada pessoa sabe fazer.</strong> Toque no nome da função para alternar o nível:
        {/* A LEGENDA ERA QUATRO BOTÕES QUE NÃO FAZEM NADA.
            Usava `.chip`, que é o controle de verdade logo acima: mesma borda,
            mesmo fundo, mesmo padding — só que o de cima cicla o nível ao toque
            e este não faz absolutamente nada. Quem tenta apertar aprende que
            caixinha não é confiável, e passa a duvidar das de cima também.
            Vira `.marca-nivel`, que é a marca colorida que a lista já usa em
            cada linha. Assim a legenda ensina a MESMA língua que a tela fala,
            em vez de imitar o botão. */}
        <div className="legenda-niveis">
          <i className="marca-nivel t">faz sozinho</i>
          <i className="marca-nivel r">ajuda quando falta</i>
          <i className="marca-nivel e">aprendendo</i>
          <i className="marca-nivel">nada</i>
        </div>
        É isso que o sorteio usa. Quem está <em>aprendendo</em> nunca cai sozinho na escala.
      </div>
      <div className="card">
        <h3 aria-level={2}>Adicionar pessoa</h3>
        <div className="grade">
          <div><label htmlFor="add-nome">Nome</label>
            <input id="add-nome" value={nome} onChange={e => setNome(e.target.value)} placeholder="como aparece no grupo do WhatsApp"
              autoCapitalize="words" autoComplete="name" enterKeyHint="next" /></div>
          <div><label htmlFor="add-tel">WhatsApp, sem ele a pessoa não entra pelo link do grupo</label>
            <input id="add-tel" value={tel} onChange={e => setTel(e.target.value)} placeholder="11999998888"
              type="tel" inputMode="tel" autoComplete="tel" enterKeyHint="done" /></div>
        </div>
        <div style={{ marginTop: 14 }}>
          <label>O que essa pessoa sabe fazer</label>
          <div className="chips">
            {funcoes.map(f => {
              const n = novas[f.nome];
              return (
                <span key={f.nome} className={`chip ${n ? CLASSE[n] : 'add'}`}
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
                  {f.nome}{n ? ` · ${CURTO[n]}` : ''}
                </span>
              );
            })}
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <button className="pri" disabled={ocupado || !nome.trim()} onClick={adicionar}><IcMais /> Adicionar ao time</button>
        </div>
      </div>
        </div>
      </details>
    </div>
  );
}

