'use client';
import Shell, { useApp, copiar } from '@/components/Shell';
import { useState } from 'react';
import {
  atualizarVoluntario, conferirVoluntario, criarVoluntario, definirHabilidade, removerVoluntario,
} from '@/lib/db';
import { Avatar, Aviso, Medidor } from '@/components/Ui';
import { IcCopiar, IcMais, IcSeta } from '@/components/Icones';
import {
  Nivel, confirmada, declaracoesSuspeitas, filaDeConferencia, funcoesAtivas,
  msgConvite, saudeDoTime,
} from '@/lib/engine';

export default function Pagina() { return <Shell><Time /></Shell>; }

const CICLO: (Nivel | null)[] = [null, 'titular', 'reserva', 'treino'];
const CLASSE: Record<string, string> = { titular: 't', reserva: 'r', treino: 'e' };
const CURTO: Record<string, string> = { titular: 'faz sozinho', reserva: 'ajuda quando falta', treino: 'aprendendo' };
/* mesmas palavras dos botões, para a linha de texto e o controle não usarem
   vocabulário diferente para a mesma coisa */
const MINI: Record<string, string> = { titular: 'sozinho', reserva: 'ajuda', treino: 'aprende' };
/* Sigla de 4 letras do chip de área. Pegar só a primeira palavra funcionava na
   Mídia (PROJEÇÃO, FOTO), mas no Serviço do Culto todos os postos numerados
   colapsavam: LÍDER 1 e LÍDER 2 viravam "LÍDE", os quatro setores viravam
   "SETO". Quando o último pedaço é curto (1 ou 2 caracteres), ele é justamente
   o que distingue, então entra na sigla. */
function marca(nome: string) {
  const p = nome.trim().split(/\s+/);
  const fim = p.length > 1 ? p[p.length - 1] : '';
  return fim && fim.length <= 2 ? p[0].slice(0, 3) + fim : p[0].slice(0, 4);
}
/* rótulos curtos: a linha acima já explica o que a pessoa declarou, então os
   quatro botões cabem numa fileira só e a conferência vira um toque por área. */
const OPCOES: { nivel: Nivel | null; rotulo: string }[] = [
  { nivel: 'titular', rotulo: 'sozinho' },
  { nivel: 'reserva', rotulo: 'ajuda' },
  { nivel: 'treino', rotulo: 'aprende' },
  { nivel: null, rotulo: 'não faz' },
];

function Time() {
  const { S, recarregar, aviso, base, equipe } = useApp();
  const [nome, setNome] = useState('');
  const [tel, setTel] = useState('');
  const [novas, setNovas] = useState<Record<string, Nivel>>({});
  const [ocupado, setOcupado] = useState(false);
  const [chipSalvando, setChipSalvando] = useState('');
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
    } catch (e: any) { aviso('erro: ' + e.message); }
    setOcupado(false);
  }

  async function ciclar(vid: string, funcao: string) {
    const chave = vid + '|' + funcao;
    if (chipSalvando) return;                 // ignora toque duplo enquanto salva
    setChipSalvando(chave);
    const atual = S.voluntarios.find(v => v.id === vid)?.funcoes[funcao] || null;
    const prox = CICLO[(CICLO.indexOf(atual as any) + 1) % CICLO.length];
    try { await definirHabilidade(vid, mapa.get(funcao)!, prox); await recarregar(); }
    catch (e: any) { aviso('Não salvou: ' + e.message); await recarregar(); }
    setChipSalvando('');
  }
  const teclaAtiva = (fn: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); fn(); }
  };

  async function mudar(vid: string, campos: any) {
    try { await atualizarVoluntario(vid, campos); await recarregar(); }
    catch (e: any) { aviso('Não salvou: ' + e.message); await recarregar(); }
  }

  async function remover(vid: string, nome: string) {
    if (!confirm(`Remover ${nome}? O histórico dele some junto.`)) return;
    try { await removerVoluntario(vid); await recarregar(); aviso('Removido'); }
    catch (e: any) { aviso('erro: ' + e.message); }
  }

  /* quem se cadastrou sozinho já entra valendo; isto só tira o destaque
     depois que o líder olhou o nível que a pessoa declarou. */
  async function conferir(vid: string, nome: string) {
    try { await conferirVoluntario(vid); await recarregar(); aviso(`${nome.split(' ')[0]} conferido`); }
    catch (e: any) { aviso('erro: ' + e.message); }
  }

  /* o líder confere UMA área por vez: é assim que ele consegue julgar, porque
     ele conhece a área, não os 9 chips de uma pessoa de uma vez só. */
  async function conferirNivel(vid: string, funcao: string, nivel: Nivel | null) {
    const chave = vid + '|' + funcao;
    if (chipSalvando) return;
    setChipSalvando(chave);
    try { await definirHabilidade(vid, mapa.get(funcao)!, nivel); await recarregar(); }
    catch (e: any) { aviso('Não salvou: ' + e.message); await recarregar(); }
    setChipSalvando('');
  }

  const suspeitas = declaracoesSuspeitas(S);
  const fila = filaDeConferencia(S);
  /* CONTAGEM, não lista. Já escrevi `pendentes.length` aqui embaixo uma vez e a
     seção inteira sumiu em silêncio: número não tem length. */
  const pendentes = fila.reduce((a, x) => a + x.pendentes.length, 0);

  /* novos primeiro: é o que o líder precisa olhar assim que abre */
  const ordenados = [...S.voluntarios].sort(
    (a, b) => Number(a.conferido !== false) - Number(b.conferido !== false)
  );

  return (
    <>
      <div className="entre" style={{ marginBottom: 4 }}>
        <h1>Time</h1>
        {!!S.voluntarios.length && <span className="pill">{S.voluntarios.filter(v => v.ativo).length} ativos</span>}
      </div>
      {!S.voluntarios.length && (
        <Aviso tom="info">Sem saber quem sabe fazer o quê, não existe rodízio. Comece pelas pessoas que serviram no último domingo.</Aviso>
      )}

      {pendentes > 0 && (
        <div className="card conferencia">
          <div className="entre">
            <h3 style={{ margin: 0 }}>Conferir nível</h3>
            <span className="pill warn"><span className="ponto warn" />{pendentes} para conferir</span>
          </div>
          <p className="dim pequeno" style={{ marginTop: 6 }}>
            Estas pessoas se cadastraram sozinhas e escolheram o próprio nível. Enquanto ninguém confere,
            um <strong>faz sozinho</strong> declarado <strong>vale como ajuda quando falta</strong>: a pessoa entra
            na escala normal, mas o sorteio não deixa a área de pé só nela. Vá área por área, é rápido.
          </p>

          {!!suspeitas.length && (
            <details className="bloco-extra" style={{ margin: '14px 0 4px' }}>
              <summary>
                <span className="pill warn peq"><span className="ponto warn" />{suspeitas.length}</span>
                <span className="cresce">{suspeitas.length === 1 ? 'ponto de atenção' : 'pontos de atenção'}</span>
                <IcSeta className="giro" />
              </summary>
              <div className="bloco-extra-corpo" style={{ paddingTop: 12 }}>
                {suspeitas.map((sp, i) => (
                  <Aviso key={i} tom={sp.motivo === 'pilar_unico' ? 'erro' : 'atencao'}>{sp.texto}</Aviso>
                ))}
              </div>
            </details>
          )}

          {fila.map(bl => (
            <div className="area-conf" key={bl.funcao}>
              <div className="overline">{bl.funcao}</div>
              {bl.pendentes.map(p => (
                <div className="conf-linha" key={p.id}>
                  <Avatar nome={p.nome} />
                  <div className="cresce">
                    <div className="forte">{p.nome.split(' ').slice(0, 2).join(' ')}</div>
                    <div className="dim pequeno">
                      {/* curto de propósito: a regra inteira está no parágrafo
                          de cima. Repetir "valendo como ajuda quando falta até
                          você conferir" em 32 linhas seguidas não informa, só
                          faz a lista parecer o dobro do tamanho. */}
                      disse <strong>{MINI[p.declarou]}</strong>
                      {p.declarou !== p.efetivo && <> · vale <strong>{MINI[p.efetivo]}</strong></>}
                    </div>
                  </div>
                  <div className="conf-btns" role="group" aria-label={`Nível de ${p.nome} em ${bl.funcao}`}>
                    {OPCOES.map(o => (
                      <button key={o.rotulo}
                        className={`seg ${o.nivel === p.declarou ? 'on' : ''} ${o.nivel === null ? 'nao' : ''}`}
                        disabled={!!chipSalvando}
                        onClick={() => conferirNivel(p.id, bl.funcao, o.nivel)}>
                        {o.rotulo}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {ordenados.map(v => {
        const est = saude.pessoas.find(p => p.id === v.id)!;
        const novo = v.conferido === false;
        /* resumo em uma linha: as áreas da pessoa cabem em micro-chips e o
           cartão inteiro só abre quando o líder vai mexer. Antes cada pessoa
           ocupava mais de mil pixels e o Time tinha 39 mil de rolagem. */
        const areas = funcoes.filter(f => v.funcoes[f.nome]);
        return (
          <details className={`pessoa ${novo ? 'card-novo' : ''}`} key={v.id} style={{ opacity: v.ativo ? 1 : .55 }}>
            <summary>
              <Avatar nome={v.nome} />
              <span className="cresce">
                <span className="pessoa-nome">{v.nome}{!v.ativo && <span className="pill peq" style={{ marginLeft: 8 }}>pausado</span>}</span>
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
                {novo && <span className="pill warn peq">confira</span>}
                {est.furos > 0 && <span className="pill bad peq">{est.furos} furo{est.furos > 1 ? 's' : ''}</span>}
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
              <div className="linha" style={{ gap: 8 }}>
                {(() => {
                  const tel = (v.tel || '').replace(/\D/g, '');
                  const zap = tel ? `https://wa.me/${tel.length <= 11 ? '55' + tel : tel}?text=${encodeURIComponent(msgConvite(S, v.id, base))}` : null;
                  return zap
                    ? <a className="btn mini zap" href={zap} target="_blank" rel="noopener">enviar link no WhatsApp</a>
                    : null;
                })()}
                <button className="mini" onClick={() => copiar(msgConvite(S, v.id, base), aviso, 'Link pessoal copiado. Mande no privado.')}>
                  <IcCopiar /> link pessoal
                </button>
                {novo && <button className="mini verde" onClick={() => conferir(v.id, v.nome)}>conferi, está certo</button>}
                <button className="mini fantasma" onClick={() => mudar(v.id, { ativo: !v.ativo })}>{v.ativo ? 'pausar' : 'reativar'}</button>
                <button className="mini perigo" onClick={() => remover(v.id, v.nome)}>remover</button>
              </div>
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

            <div className="linha" style={{ marginTop: 14 }}>
              <div style={{ width: 190 }}>
                <label>WhatsApp</label>
                <input key={v.tel} defaultValue={v.tel || ''} placeholder="11999998888" inputMode="tel"
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
                  <div className="linha" style={{ gap: 6 }}>
                    {v.indisponivel.sort().map(d => (
                      <span key={d} className="pill bad">{d.slice(8, 10)}/{d.slice(5, 7)}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            </div>
          </details>
        );
      })}

      {!!S.voluntarios.length && (
        <>
          <h3 style={{ marginTop: 28 }}>Onde o time é frágil</h3>
          <div className="card tight">
            {saude.funcoes.map(f => (
              <div className="slot" key={f.nome}>
                <div className="rotulo"><span className="overline">{f.nome}</span></div>
                <Medidor valor={f.aptos} total={3} grau={f.grau as any} />
                <span className="dim pequeno num" style={{ width: 118, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {f.aptos} de 3 pessoa{f.aptos === 1 ? '' : 's'}
                </span>
                <span className={`pill ${f.grau === 'ok' ? 'ok' : f.grau === 'atencao' ? 'warn' : 'bad'}`}>
                  <span className={`ponto ${f.grau === 'ok' ? 'ok' : f.grau === 'atencao' ? 'warn' : 'bad'}`} />{f.texto}
                </span>
              </div>
            ))}
          </div>
          <p className="dim pequeno">
            A meta é 3 pessoas aptas por função. Abaixo disso a escala quebra na primeira gripe.
            Cada mês, coloque alguém como <em>aprendendo</em> na função mais vermelha.
          </p>
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
        <div className="legenda-niveis">
          <span className="chip t peq">faz sozinho</span>
          <span className="chip r peq">ajuda quando falta</span>
          <span className="chip e peq">aprendendo</span>
          <span className="chip add peq">nada</span>
        </div>
        É isso que o sorteio usa. Quem está <em>aprendendo</em> nunca cai sozinho na escala.
      </div>
      <div className="card">
        <h3>Adicionar pessoa</h3>
        <div className="grade">
          <div><label>Nome</label>
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="como aparece no grupo do WhatsApp" /></div>
          <div><label>WhatsApp, sem ele a pessoa não entra pelo link do grupo</label>
            <input value={tel} onChange={e => setTel(e.target.value)} placeholder="11999998888" inputMode="tel" /></div>
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
    </>
  );
}

