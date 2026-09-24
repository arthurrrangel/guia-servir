'use client';
/* O PANORAMA · migração 96, 24/09/2026.

   O pedido do Arthur: "tenho que ter o panorama de tudo do sistema das
   demandas, a única pessoa que controla tudo". É a primeira seção da
   Administração, e só a administração a abre: `dem_panorama` responde
   SO_ADMIN para qualquer outro papel, com ou sem esta tela.

   A ORDEM É A DAS PERGUNTAS DE QUEM CONTROLA:
     1. o que só eu decido (aprovações, pedidos de papel);
     2. o que está desamparado (setor com demanda e ninguém na equipe, setor
        desligado com demanda viva, equipe que não atende nada);
     3. como a operação está agora, sem período;
     4. cada setor, com a equipe que tem;
     5. o que está esperando há mais tempo;
     6. as pessoas, quem carrega mais, e o que aconteceu por último.

   AS CONTAS SÃO AS DO RESTO DO SISTEMA. "Em aberto", "Atrasadas" e "Aprovar"
   batem com o Atendimento da administração, e a suíte da 96 confere isso no
   banco (`demandas-banco-96.test.sql`). Número de painel que não bate com a
   lista do atalho ensina a não confiar em nenhum dos dois: por isso "Na
   fila" e "A confirmar" não levam a lugar nenhum (a lista do Atendimento
   mais perto mostra outra conta), e as aprovações abrem AQUI, e não numa
   lista que mistura aprovação com o resto (auditoria R15A). */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEu } from './Casca';
import { Fila } from './Lista';
import { Aviso, Cabecalho, Esqueleto, Kpi, Kpis, Pill, Secao } from './Ui';
import { Icone } from './Icone';
import { panorama } from '@/lib/demandas/api';
import {
  agruparAvisos, carimbo, dataHora, dinheiro, fraseDoEvento, quando, recadoDoErro, umGestoUmaLinha, umOuVarios,
} from '@/lib/demandas/regras';
import type { AvisoDentro, Panorama as Dados } from '@/lib/demandas/tipos';

const PESSOAS = '/demandas/admin?secao=pessoas';

/* as linhas de uma lista, na ordem: a Fila desenha cada demanda como um
   `.dm-item`. Andando pelos filhos, e não por seletor: é DOM puro, e o mesmo
   caminho vale no navegador e no DOM de teste. */
function linhasDe(raiz: HTMLElement | null): HTMLElement[] {
  const achadas: HTMLElement[] = [];
  const andar = (n: Node) => {
    for (const c of Array.from(n.childNodes)) {
      if (c.nodeType !== 1) continue;
      const e = c as HTMLElement;
      if ((e.getAttribute('class') || '').split(' ').includes('dm-item')) achadas.push(e);
      else andar(e);
    }
  };
  if (raiz) andar(raiz);
  return achadas;
}

/* "A, B e C" */
const juntar = (xs: string[]) => xs.length <= 1 ? (xs[0] || '') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`;

/* A RESPOSTA INCOMPLETA NÃO DERRUBA A TELA. O banco manda as sete partes
   (a conferência da 96 cobra isso); um banco de antes, ou uma resposta
   cortada, virava "Cannot read properties of undefined" e a Administração
   inteira caía junto. Aqui o que faltar vira zero e lista vazia. */
function normalizar(d: Partial<Dados>): Dados {
  return {
    agora: d.agora || new Date().toISOString(),
    operacao: {
      vivas: 0, na_fila: 0, em_execucao: 0, aprovar: 0, travadas: 0, esperando_quem_pediu: 0,
      atrasadas: 0, paradas: 0, a_confirmar: 0, recebidas_30d: 0, concluidas_30d: 0, total: 0,
      ...(d.operacao || {}),
    },
    setores: d.setores || [],
    pessoas: {
      ativas: 0, sem_acesso: 0, pedidos: 0, equipe_sem_setor: 0, ...(d.pessoas || {}),
      por_papel: { admin: 0, responsavel: 0, lider: 0, solicitante: 0, ...(d.pessoas?.por_papel || {}) },
    },
    carga: d.carga || [], aprovar: d.aprovar || [], fila: d.fila || [], recentes: d.recentes || [],
  };
}

export function Panorama() {
  const ctx = useEu();
  const eu = ctx.eu;
  const [p, setP] = useState<Dados | null>(null);
  const [erro, setErro] = useState('');
  const [indo, setIndo] = useState(false);
  /* as aprovações: oito à vista, e o resto das que vieram abre aqui mesmo */
  const [todas, setTodas] = useState(false);
  /* o botão "Mostrar mais" some ao ser tocado: o foco vai para a primeira
     das que apareceram, e não para o começo da página (auditoria R15B) */
  const listaAprovar = useRef<HTMLDivElement>(null);
  const focarNaNona = useRef(false);
  useEffect(() => {
    if (!todas || !focarNaNona.current) return;
    focarNaNona.current = false;
    linhasDe(listaAprovar.current)[8]?.focus();
  }, [todas]);
  const vivo = useRef(true);

  const carregar = useCallback(async () => {
    setIndo(true);
    const r = await panorama();
    if (!vivo.current) return;
    setIndo(false);
    /* o banco sem a 96 (a tela subiu antes dele) não é "o sistema não foi
       instalado": é só o Panorama que ainda não chegou (auditoria R15B) */
    if (!r.ok) {
      setErro(r.erro === 'SEM_SISTEMA'
        ? 'O Panorama ainda não chegou a este banco. As outras seções da Administração funcionam normalmente.'
        : recadoDoErro(r, 'carregar o panorama'));
      return;
    }
    setErro('');
    setP(normalizar(r as unknown as Partial<Dados>));
  }, []);
  useEffect(() => {
    vivo.current = true;
    carregar();
    return () => { vivo.current = false; };
  }, [carregar]);
  /* voltar para a aba do navegador refaz, como o Início e o Atendimento */
  useEffect(() => {
    const f = () => { if (document.visibilityState === 'visible') carregar(); };
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, [carregar]);

  /* os últimos movimentos no formato dos avisos, para o gesto se juntar com
     a mesma função da ficha e dos Avisos */
  const grupos = useMemo(() => {
    const itens: AvisoDentro[] = (p?.recentes || []).map(a => ({ ...a, motivo: 'fila' as const, novo: false }));
    return agruparAvisos(itens).slice(0, 5);
  }, [p]);

  const hora = p ? dataHora(p.agora).split(' às ')[1] : '';
  const cabecalho = (
    <Cabecalho sobre="Administração" titulo="Panorama"
      meta={<span>Tudo o que acontece no Demandas{hora ? `, atualizado às ${hora}` : ''}. Só você vê esta tela.</span>}
      acoes={<button type="button" className="dm-btn" disabled={indo} aria-busy={indo || undefined} onClick={carregar}>Atualizar</button>} />
  );

  if (erro && !p) {
    return (
      <>
        {cabecalho}
        <Aviso tom="bad">{erro}</Aviso>
        <button type="button" className="dm-btn dm-tentar" onClick={carregar}>Tentar de novo</button>
      </>
    );
  }
  if (!p) return <>{cabecalho}<Esqueleto forma="numeros" oQue="Carregando o panorama" /></>;

  const o = p.operacao;
  const ligado = (s: Dados['setores'][number]) => s.ativo !== false;
  const semEquipe = p.setores.filter(s => ligado(s) && s.atende && s.equipe === 0 && s.vivas > 0);
  /* trabalho pendurado num setor que ninguém olha: desativado, ou que não
     atende mais, e com demanda viva (auditoria R15A) */
  const desligados = p.setores.filter(s => (!ligado(s) || !s.atende) && s.vivas > 0);
  /* o setor que atende sem ninguém e sem nada acontecendo é uma linha de
     zeros na tabela: vira uma frase embaixo dela, que diz o que importa (não
     tem equipe). Com demanda, ele fica na tabela e pede você lá em cima. */
  const parados = p.setores.filter(s => ligado(s) && s.atende && s.equipe === 0 && s.vivas === 0 && s.concluidas_30d === 0);
  const naTabela = p.setores.filter(s => !parados.includes(s));
  const OITO = 8;
  const aprovarVisiveis = todas ? p.aprovar : p.aprovar.slice(0, OITO);
  const escondidas = p.aprovar.length - aprovarVisiveis.length;
  /* o banco manda até 50, as mais antigas; mais que isso fica dito, sem
     link para uma lista com outra conta */
  const alemDasCinquenta = o.aprovar - p.aprovar.length;
  const valor = p.aprovar.reduce((t, d) => t + (Number(d.orcamento) || 0), 0);
  const decisoes = o.aprovar + p.pessoas.pedidos;
  const atencao = semEquipe.length + desligados.length + (p.pessoas.equipe_sem_setor ? 1 : 0);

  return (
    <>
      {cabecalho}
      {erro ? <Aviso tom="bad">{erro}</Aviso> : null}

      {/* ------------------------------------------- o que só você decide */}
      <Secao titulo="Para você decidir" n={decisoes || null} destaque
        sub={o.aprovar
          ? <>
              {o.aprovar} {umOuVarios(o.aprovar, 'demanda espera', 'demandas esperam')} a sua aprovação
              {valor ? <>, <span className="dm-num">{dinheiro(valor)}</span>{alemDasCinquenta > 0 ? ` nas ${p.aprovar.length} mais antigas` : ' ao todo'}</> : null}.
            </>
          : undefined}>
        {!decisoes ? (
          <div className="dm-tabela">
            <p className="dm-linha-vazia">
              <Icone nome="check" />
              <span><b>Nada esperando você.</b> Aprovações e pedidos de papel aparecem aqui.</span>
            </p>
          </div>
        ) : (
          <div className="dm-tabela">
            {aprovarVisiveis.length ? <div ref={listaAprovar}><Fila itens={aprovarVisiveis} eu={eu} tarefas semCabecalho /></div> : null}
            {escondidas > 0 || alemDasCinquenta > 0 || p.pessoas.pedidos ? (
              <div className="dm-fila">
                {escondidas > 0 ? (
                  <button type="button" className="dm-item dm-item-soma" onClick={() => { focarNaNona.current = true; setTodas(true); }}>
                    <span className="dm-c-num"><Icone nome="mais" /></span>{' '}
                    <span className="dm-c-tit"><b>Mostrar mais {escondidas}</b></span>
                  </button>
                ) : alemDasCinquenta > 0 ? (
                  <p className="dm-pano-nota">
                    E mais {alemDasCinquenta} {umOuVarios(alemDasCinquenta, 'espera', 'esperam')} aprovação depois destas. Aparecem aqui conforme as de cima forem decididas.
                  </p>
                ) : null}
                {p.pessoas.pedidos ? (
                  <Link className="dm-item dm-item-soma" href={PESSOAS}>
                    <span className="dm-c-num"><Icone nome="pessoas" /></span>{' '}
                    <span className="dm-c-tit"><b>{p.pessoas.pedidos} {umOuVarios(p.pessoas.pedidos, 'pedido de papel espera você', 'pedidos de papel esperam você')}</b></span>
                    <span className="dm-c-meta"><span className="dm-c-passo">Decidir<Icone nome="seta" /></span></span>
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </Secao>

      {/* ------------------------------------------- o que está desamparado */}
      {atencao ? (
        <Secao titulo="Precisa de atenção" n={atencao}>
          <div className="dm-tabela">
            <div className="dm-fila">
              {semEquipe.map(s => (
                <Link key={s.id} className="dm-item dm-item-soma" href="/demandas/admin/pessoas/nova">
                  <span className="dm-c-num"><Icone nome="setores" /></span>{' '}
                  <span className="dm-c-tit">
                    <b>{s.nome}: ninguém na equipe</b>
                    <span className="dm-c-ctx">{s.vivas} {umOuVarios(s.vivas, 'demanda em aberto', 'demandas em aberto')} sem quem atenda</span>
                  </span>
                  <span className="dm-c-meta"><span className="dm-c-passo">Cadastrar<Icone nome="seta" /></span></span>
                </Link>
              ))}
              {desligados.map(s => (
                <Link key={s.id} className="dm-item dm-item-soma" href="/demandas/admin?secao=setores">
                  <span className="dm-c-num"><Icone nome="setores" /></span>{' '}
                  <span className="dm-c-tit">
                    <b>{s.nome}: {ligado(s) ? 'não atende mais' : 'desativado'}</b>
                    <span className="dm-c-ctx">e ainda tem {s.vivas} {umOuVarios(s.vivas, 'demanda em aberto', 'demandas em aberto')}: mande para outro setor, ou religue este</span>
                  </span>
                  <span className="dm-c-meta"><span className="dm-c-passo">Setores<Icone nome="seta" /></span></span>
                </Link>
              ))}
              {p.pessoas.equipe_sem_setor ? (
                <Link className="dm-item dm-item-soma" href={PESSOAS}>
                  <span className="dm-c-num"><Icone nome="pessoas" /></span>{' '}
                  <span className="dm-c-tit">
                    <b>{p.pessoas.equipe_sem_setor} {umOuVarios(p.pessoas.equipe_sem_setor, 'pessoa da equipe não atende nada', 'pessoas da equipe não atendem nada')}</b>
                    <span className="dm-c-ctx">sem setor, ou num setor que não recebe demandas</span>
                  </span>
                  <span className="dm-c-meta"><span className="dm-c-passo">Acertar<Icone nome="seta" /></span></span>
                </Link>
              ) : null}
            </div>
          </div>
        </Secao>
      ) : null}

      {/* ------------------------------------------------ a operação agora */}
      <Secao titulo="A operação agora"
        sub={`Todas as demandas vivas, de todos os setores. Nos últimos 30 dias: ${o.recebidas_30d} ${umOuVarios(o.recebidas_30d, 'recebida', 'recebidas')} e ${o.concluidas_30d} ${umOuVarios(o.concluidas_30d, 'concluída', 'concluídas')}.`}>
        <Kpis colunas={6} colunasMedio={3} rot="A operação agora">
          <Kpi rot="Em aberto" valor={o.vivas} href="/demandas/atendimento?ver=fila"
            sub={o.paradas ? `${o.paradas} ${umOuVarios(o.paradas, 'parada', 'paradas')} há 7 dias ou mais` : 'em todos os estados'} />
          <Kpi rot="Na fila" valor={o.na_fila} sub="sem responsável" />
          <Kpi rot="Em execução" valor={o.em_execucao} sub="com alguém" />
          <Kpi rot="Travadas" valor={o.travadas}
            sub={o.esperando_quem_pediu ? `${o.esperando_quem_pediu} ${umOuVarios(o.esperando_quem_pediu, 'espera', 'esperam')} quem pediu` : 'fora a aprovação'} />
          <Kpi rot="Atrasadas" valor={o.atrasadas} tom="bad" href="/demandas/atendimento?ver=atrasadas"
            sub={umOuVarios(o.atrasadas, 'passou do prazo', 'passaram do prazo')} />
          <Kpi rot="A confirmar" valor={o.a_confirmar}
            sub={umOuVarios(o.a_confirmar, 'concluída sem confirmação', 'concluídas sem confirmação')} />
        </Kpis>
      </Secao>

      {/* ------------------------------------------------------- por setor */}
      <Secao titulo="Por setor" sub="Os setores que atendem, com a equipe de cada um, e os que ainda têm demanda em aberto. Concluídas: nos últimos 30 dias.">
        <div className="dm-tabela">
          <div className="dm-rola">
            <table className="dm-tab dm-empilha dm-pano-setores">
              <thead><tr>
                <th className="dm-primeira">Setor</th><th className="dm-n">Equipe</th><th className="dm-n">Na fila</th>
                <th className="dm-n">Aprovar</th><th className="dm-n">Atrasadas</th><th className="dm-n">Em aberto</th>
                <th className="dm-n">Concluídas</th>
              </tr></thead>
              <tbody>
                {naTabela.map(s => (
                  <tr key={s.id}>
                    <td className="dm-primeira">
                      {s.nome}
                      {!ligado(s) ? <> <Pill tom={s.vivas > 0 ? 'warn' : undefined}>desativado</Pill></>
                        : !s.atende ? <> <Pill tom={s.vivas > 0 ? 'warn' : undefined}>não atende</Pill></>
                        : s.equipe === 0 ? <> <Pill tom={s.vivas > 0 ? 'warn' : undefined}>sem equipe</Pill></> : null}
                    </td>
                    <td className={s.equipe ? 'dm-n' : 'dm-n dm-mudo'} data-rot="Equipe">{s.equipe}</td>
                    <td className={s.na_fila ? 'dm-n' : 'dm-n dm-mudo'} data-rot="Na fila">{s.na_fila}</td>
                    <td className={s.aprovar ? 'dm-n' : 'dm-n dm-mudo'} data-rot="Aprovar">{s.aprovar}</td>
                    <td className={s.atrasadas ? 'dm-n dm-bad' : 'dm-n dm-mudo'} data-rot="Atrasadas">{s.atrasadas}</td>
                    <td className={s.vivas ? 'dm-n' : 'dm-n dm-mudo'} data-rot="Em aberto">{s.vivas}</td>
                    <td className={s.concluidas_30d ? 'dm-n' : 'dm-n dm-mudo'} data-rot="Concluídas">{s.concluidas_30d}</td>
                  </tr>
                ))}
                {!naTabela.length ? (
                  <tr><td colSpan={7} className="dm-mudo">
                    {p.setores.length ? 'Nenhum setor com equipe ou com demanda ainda.' : 'Nenhum setor atende demandas ainda. Ligue em Setores.'}
                  </td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {parados.length ? (
            <div className="dm-pano-parados">
              <p><b>Sem equipe, e sem demanda por enquanto:</b> {juntar(parados.map(s => s.nome))}.</p>
              <Link className="dm-btn dm-peq" href="/demandas/admin/pessoas/nova">Cadastrar alguém</Link>
            </div>
          ) : null}
        </div>
      </Secao>

      {/* ------------------------------------------ o que espera há mais tempo */}
      {p.fila.length ? (
        <Secao titulo="Na fila há mais tempo" sub="Chegaram e ninguém assumiu ainda. A mais antiga primeiro.">
          <div className="dm-tabela"><Fila itens={p.fila} eu={eu} semPasso /></div>
        </Secao>
      ) : null}

      {/* ---------------------------------------------- pessoas e carga */}
      <div className="dm-dupla dm-dupla-secoes">
        <Secao titulo="Pessoas"
          sub={<>
            {p.pessoas.ativas} {umOuVarios(p.pessoas.ativas, 'pessoa com acesso', 'pessoas com acesso')}. A administração é só sua.
          </>}
          acoes={<Link className="dm-btn dm-peq" href={PESSOAS}>Abrir Pessoas</Link>}>
          <Kpis colunas={2}>
            <Kpi rot="Equipe" valor={p.pessoas.por_papel.responsavel} sub="atendem demandas" />
            <Kpi rot="Líderes" valor={p.pessoas.por_papel.lider} sub="pedem pelo ministério" />
            <Kpi rot="Membros" valor={p.pessoas.por_papel.solicitante} sub="pedem e acompanham" />
            <Kpi rot="Sem acesso" valor={p.pessoas.sem_acesso} sub="desativadas" />
          </Kpis>
        </Secao>
        <Secao titulo="Com mais demandas agora" sub="Quem está com demanda em aberto, e quantas passaram do prazo.">
          {p.carga.length ? (
            <div className="dm-tabela">
              <table className="dm-tab dm-empilha dm-pano-carga">
                <thead><tr>
                  <th className="dm-primeira">Pessoa</th><th className="dm-n">Com ela</th><th className="dm-n">Atrasadas</th>
                </tr></thead>
                <tbody>
                  {p.carga.map(c => (
                    <tr key={c.id}>
                      <td className="dm-primeira">
                        <Link href={`/demandas/admin/pessoas/${c.id}`}>{c.nome}</Link>
                        {c.setor ? <small>{c.setor}</small> : null}
                      </td>
                      <td className="dm-n" data-rot="Com ela">{c.com_ela}</td>
                      <td className={c.atrasadas ? 'dm-n dm-bad' : 'dm-n dm-mudo'} data-rot="Atrasadas">{c.atrasadas}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="dm-tabela">
              <p className="dm-linha-vazia"><span>Ninguém está com demanda em aberto agora.</span></p>
            </div>
          )}
        </Secao>
      </div>

      {/* --------------------------------------------- o que aconteceu por último */}
      <Secao titulo="Últimos movimentos" sub="O que aconteceu no sistema inteiro, o mais novo primeiro.">
        {grupos.length ? (
          <ul className="dm-avisos dm-tabela">
            {grupos.map(g => (
              <li key={g.numero} className="dm-aviso-grupo">
                <Link href={`/demandas/d/${g.numero}`}><span className="dm-num">#{g.numero}</span> {g.titulo}</Link>
                <ul>
                  {umGestoUmaLinha(g.itens).slice(0, 3).map((a, i) => (
                    <li key={`${a.em}-${i}`}>
                      <div className="dm-aviso-o-que dm-sep">
                        <div className="dm-sep-in">
                          <span>{fraseDoEvento(a, eu?.nome)}</span>
                          <span className="dm-quando" title={carimbo(a.em)}>{quando(a.em)}</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <div className="dm-tabela">
            <p className="dm-linha-vazia"><span>Nada aconteceu nos últimos 60 dias.</span></p>
          </div>
        )}
      </Secao>
    </>
  );
}
