'use client';
/* SETORES E CATEGORIAS: A CONFIGURAÇÃO DO SISTEMA · migração 94.

   Estas peças moravam em `app/demandas/ajustes/page.tsx`, na mesma tela da
   lista de gente. Com a administração separada da interface comum (o pedido:
   "não misture isso com a interface do usuário comum"), elas passaram para
   cá sem mudar uma linha de comportamento, e `app/demandas/admin/page.tsx`
   as monta. Os comentários de cada uma continuam contando por que ela é
   como é.

   A FORMA, 23/09/2026. Cada linha editável é uma tabela a partir de 720px e
   um cartão por linha abaixo disso (a tabela de cinco colunas com controles
   não cabe em 390 e virava rolagem lateral com botões cortados). Os "Sim/Não"
   e "Exige/Não exige" viraram interruptores com o rótulo do que controlam;
   o select de destino perdeu o nome repetido embaixo; os campos soltos
   usam a mesma vestimenta dos campos com rótulo (`dm-campo-solto`). O que
   cada controle FAZ não mudou. */

import { useEffect, useState } from 'react';
import { Aviso, Interruptor, Subabas, useEstreito } from './Ui';
import { confirmar } from '@/lib/confirmar';
import type { Bases, Categoria, Setor } from '@/lib/demandas/tipos';

/* O TETO DE GASTO POR SETOR, QUE ATE A 92 NAO EXISTIA.

   A quarta auditoria mediu o furo: `exige_aprovacao` mora na CATEGORIA, e
   quem pede escolhe a categoria. Um pedido de R$ 999.999,99 numa categoria
   que não exige aprovação nasce aberto, é assumido e concluído por uma
   pessoa só, e o histórico não registra aprovação nenhuma. O rastro fica
   perfeito, e não há nada para rastrear.

   Vazio quer dizer SEM TETO, que é o comportamento de sempre. Quem escolhe
   o número é quem administra, e por isso ele mora aqui e não no código.

   Setor que não recebe demanda não tem teto de gasto para aplicar: a célula
   fica muda em vez de oferecer um campo que não decide nada. */
export function Teto({ s, indo, salvar }: {
  s: Setor; indo: boolean;
  salvar: (o: 'setor', d: Record<string, unknown>) => Promise<boolean>;
}) {
  const guardado = s.teto_sem_aprovacao == null ? '' : String(s.teto_sem_aprovacao).replace('.', ',');
  const [v, setV] = useState(guardado);
  /* o valor do servidor manda: sem isto, salvar e recarregar deixava a
     célula mostrando o que a pessoa digitou mesmo quando o banco recusou */
  useEffect(() => { setV(guardado); }, [guardado]);
  if (!s.atende) return <span className="dm-peq dm-mudo">não atende</span>;
  return (
    <div className="dm-linha">
      <span className="dm-peq dm-mudo">R$</span>
      <input className="dm-campo-solto dm-estreito" inputMode="decimal"
        aria-label={`Aprovar acima de, em ${s.nome}`}
        placeholder="sem teto" value={v} onChange={e => setV(e.target.value)}
        disabled={indo} />
      {v !== guardado ? (
        <button className="dm-btn dm-peq dm-pri" disabled={indo}
          onClick={() => salvar('setor', { id: s.id, teto_sem_aprovacao: v.trim() })}>
          Salvar
        </button>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- setores */
export function Setores({ b, indo, salvar }: {
  b: Bases; indo: boolean; salvar: (o: 'setor', d: Record<string, unknown>) => Promise<boolean>;
}) {
  const [nome, setNome] = useState('');
  const [atende, setAtende] = useState(false);
  const estreito = useEstreito(719);

  /* DESATIVAR SETOR PEDE CONFIRMAÇÃO · 20/09/2026.

     Auditoria de tela. Era um toque, sem pergunta, ao lado de um "Sim/Não"
     que é um toggle inócuo. E desativar um setor o tira dos seletores de
     "Vai para", de "Quem está pedindo" e de "Mandar para outro setor" · sem
     que esta tela ofereça "Reativar". O lado das escalas pede confirmação
     para coisas menores. */
  const desativar = async (s: Setor) => {
    const ok = await confirmar({
      titulo: `Desativar o setor ${s.nome}?`,
      texto: 'Ele some das listas de quem pede e de quem atende, e as demandas que já estão nele continuam lá.',
      acao: 'Desativar',
    });
    if (ok) salvar('setor', { id: s.id, ativo: false });
  };
  const recebe = (s: Setor, rot: string) => (
    <Interruptor ligado={s.atende} rot={rot} aria={`Recebe demanda, ${s.nome}`} disabled={indo}
      aoMudar={v => salvar('setor', { id: s.id, atende: v })} />
  );

  return (
    <>
      {/* "MINISTÉRIO" É A PALAVRA DO OUTRO SISTEMA, E ELA ESTAVA EXPLICANDO
          UM SETOR, 22/09/2026.

          A frase era "Ministério que só pede fica com isso desligado", dentro
          da aba SETORES, para explicar o que é um setor que não atende.
          Ministério é o vocabulário do GUIA Servir; aqui a unidade se chama
          setor, e é o que está escrito no cabeçalho da coluna, no seletor de
          cadastro, no "Vai para" das categorias e em `SEM_PERMISSAO_DB`.

          A regra do dono é que os dois sistemas não se encostam, e o
          vocabulário é justamente onde eles se encostam sem ninguém notar:
          `regras.ts:598` conta que a mesma palavra já tinha vazado uma vez,
          pela tradução de erro. Uma explicação que usa a palavra do outro
          sistema para definir a deste ensina o nome errado a quem está
          montando o cadastro. */}
      <Aviso tom="info">
        <div>
          <b>Recebe demanda</b> ligado quer dizer que o setor pode receber pedidos. Setor que só pede
          fica desligado, assim ninguém manda uma demanda para um lugar que não vai olhar.
          <br />
          <b>Aprovar acima de</b> é o valor a partir do qual a demanda espera a liderança, mesmo
          que a categoria não exija. Em branco: sem teto.
        </div>
      </Aviso>
      <div className="dm-card">
        <h3>Novo setor</h3>
        <div className="dm-linha dm-criar">
          <input className="dm-campo-solto dm-cresce" placeholder="Nome do setor" aria-label="Nome do setor novo"
            value={nome} onChange={e => setNome(e.target.value)} />
          <button className="dm-btn dm-pri" disabled={indo || !nome.trim()}
            onClick={async () => { if (await salvar('setor', { nome, atende })) { setNome(''); setAtende(false); } }}>
            Criar
          </button>
        </div>
        <div style={{ marginTop: 'var(--dm-e1)' }}><Interruptor ligado={atende} rot="Recebe demanda" aoMudar={setAtende} /></div>
      </div>
      {estreito ? (
        <div className="dm-cartoes">
          {b.setores.map(s => (
            <div key={s.id} className="dm-cartao-linha">
              <h3>{s.nome}</h3>
              <div className="dm-cartao-campos">
                <div className="dm-cartao-campo">{recebe(s, s.atende ? 'Recebe demanda' : 'Só pede')}</div>
                <div className="dm-cartao-campo"><span>Aprovar acima de</span><Teto s={s} indo={indo} salvar={salvar} /></div>
              </div>
              <div>
                <button className="dm-btn dm-txt dm-perigo" disabled={indo} onClick={() => desativar(s)}>Desativar</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="dm-card">
          <table className="dm-tab">
            <thead><tr><th>Setor</th><th>Recebe demanda</th><th>Aprovar acima de</th><th><span className="dm-so-leitor">Situação</span></th></tr></thead>
            <tbody>
              {b.setores.map(s => (
                <tr key={s.id}>
                  <td><b>{s.nome}</b></td>
                  <td>{recebe(s, s.atende ? 'Sim' : 'Não')}</td>
                  <td><Teto s={s} indo={indo} salvar={salvar} /></td>
                  <td className="dm-n">
                    <button className="dm-btn dm-txt dm-perigo dm-peq" disabled={indo} onClick={() => desativar(s)}>Desativar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------- categorias */
export function Categorias({ b, indo, salvar }: {
  b: Bases; indo: boolean; salvar: (o: 'categoria', d: Record<string, unknown>) => Promise<boolean>;
}) {
  const grupos = [...new Set(b.categorias.map(c => c.grupo))];
  const [g, setG] = useState(grupos[0] || '');
  const [nova, setNova] = useState('');
  const doGrupo = b.categorias.filter(c => c.grupo === g);
  const estreito = useEstreito(719);

  const destino = (c: Categoria) => (
    <select className="dm-campo-solto" value={c.setor_id || ''} disabled={indo}
      aria-label={`Vai para, ${c.nome}`}
      onChange={e => salvar('categoria', { id: c.id, setor_id: e.target.value })}>
      <option value="">Nenhum</option>
      {b.setores.filter(s => s.atende).map(s => (
        <option key={s.id} value={s.id}>{s.nome}</option>
      ))}
    </select>
  );
  const aprovacao = (c: Categoria, rot: string) => (
    <Interruptor ligado={c.exige_aprovacao} rot={rot} aria={`Exige aprovação, ${c.nome}`} disabled={indo}
      aoMudar={v => salvar('categoria', { id: c.id, exige_aprovacao: v })} />
  );
  /* A COLUNA QUE FALTAVA, E TRES CAMADAS DEPENDIAM DELA · 22/09/2026.

     `exige_orcamento` existe desde a migração 50, `dem_ajustar` aceita o
     campo, `/demandas/nova` exige o valor quando ele está ligado e a
     migração 86 passou a cobrar no banco. Esta tela não tinha controle
     nenhum: as categorias que exigem orçamento só podiam ter sido marcadas
     por SQL direto, e não havia como desmarcar.

     O comentário da 86 dizia "a tela de Ajustes deixa ligar". Não deixava. */
  const orcamento = (c: Categoria, rot: string) => (
    <Interruptor ligado={c.exige_orcamento} rot={rot} aria={`Exige orçamento, ${c.nome}`} disabled={indo}
      aoMudar={v => salvar('categoria', { id: c.id, exige_orcamento: v })} />
  );
  const prazo = (c: Categoria) => (
    <div className="dm-linha">
      <input className="dm-campo-solto dm-estreito" type="number" min={0} inputMode="numeric"
        aria-label={`Dias sugeridos, ${c.nome}`}
        defaultValue={c.prazo_padrao_dias ?? ''} disabled={indo}
        onBlur={e => {
          const v = e.target.value.trim();
          const antigo = c.prazo_padrao_dias ?? '';
          if (String(v) === String(antigo)) return;
          salvar('categoria', { id: c.id, prazo_padrao_dias: v });
        }} />
      <span className="dm-peq dm-mudo">dias</span>
    </div>
  );

  return (
    <>
      <Aviso tom="info">
        <div>
          Aqui mora a <b>triagem</b>. A categoria decide sozinha qual setor atende, se precisa de
          aprovação e quantos dias sugerir de prazo. Mudar uma linha muda o destino de toda demanda
          futura daquele tipo, e não mexe nas que já existem.
        </div>
      </Aviso>

      <Subabas rot="Grupo" valor={g} itens={grupos.map(x => ({ v: x, rot: x }))} aoMudar={setG} />

      {/* O ADMINISTRADOR NÃO PODIA CRIAR CATEGORIA PELA TELA.

          "Criar categorias" é a PRIMEIRA capacidade que o documento dá ao
          Administrador, e esta tela só sabia editar: as quatro chamadas a
          `salvar('categoria', …)` passavam sempre `{ id: c.id, … }`, não havia
          campo de nome e não havia botão de criar. Categoria nova só nascia
          por SQL direto no banco, o que significa que a igreja dependia de
          alguém com acesso ao Supabase para registrar um tipo de pedido novo.

          O banco sempre permitiu: `dem_ajustar('categoria', {…})` SEM `id` faz
          insert, com `on conflict (grupo, nome) do update set ativa = true`,
          ou seja, recriar uma categoria desativada a reativa em vez de
          duplicar.

          É a mesma linha de criação que a aba Setores já tem, copiada para
          cá. Sem seletor de grupo: o grupo aberto é o que está no `aria-pressed`
          logo acima, e a categoria nasce nele. Um seletor aqui repetiria, com
          duas maneiras de responder, a pergunta que a tira de cima já
          respondeu. */}
      <div className="dm-card">
        <h3>Nova categoria em {g || 'nenhum grupo'}</h3>
        <div className="dm-linha dm-criar">
          <input className="dm-campo-solto dm-cresce" value={nova} placeholder="Nome da categoria"
            aria-label={`Nome da categoria nova em ${g}`}
            onChange={e => setNova(e.target.value)} />
          <button className="dm-btn dm-pri" disabled={indo || !nova.trim() || !g}
            onClick={async () => {
              if (await salvar('categoria', { grupo: g, nome: nova.trim() })) setNova('');
            }}>Criar</button>
        </div>
        {/* A FRASE DIZ O QUE ACONTECE SE ELA FICAR SEM SETOR, E ISSO É MEDIDO.

            `dem_abrir` resolve o destino com
            `coalesce(setor_responsavel, c.setor_id, v_setor)`: categoria sem
            setor não recusa a demanda, ela DEVOLVE o pedido para o setor de
            quem pediu. Criar a categoria e esquecer de apontar o destino não
            dá erro nenhum, e o pedido fica dando voltas no próprio setor sem
            ninguém entender por quê. */}
        <p className="dm-peq dm-mudo" style={{ margin: '8px 0 0' }}>
          Nasce sem setor e sem aprovação. Sem setor, a demanda volta para quem pediu:
          aponte o destino na linha dela, aqui embaixo.
        </p>
      </div>

      {estreito ? (
        <div className="dm-cartoes">
          {doGrupo.map(c => (
            <div key={c.id} className="dm-cartao-linha">
              <h3>{c.nome}</h3>
              <div className="dm-cartao-campos">
                <div className="dm-cartao-campo"><span>Vai para</span>{destino(c)}</div>
                <div className="dm-cartao-campo"><span>Prazo sugerido</span>{prazo(c)}</div>
                <div className="dm-cartao-campo">{aprovacao(c, 'Exige aprovação')}</div>
                <div className="dm-cartao-campo">{orcamento(c, 'Exige orçamento')}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="dm-card">
          <table className="dm-tab">
            <thead><tr>
              <th>Categoria</th><th>Vai para</th><th>Aprovação</th><th>Orçamento</th><th>Prazo</th>
            </tr></thead>
            <tbody>
              {doGrupo.map(c => (
                <tr key={c.id}>
                  <td><b>{c.nome}</b></td>
                  <td>{destino(c)}</td>
                  {/* na tabela o interruptor fica sem texto: o cabeçalho da
                      coluna diz o que ele controla e `aria` leva o nome
                      completo para o leitor de tela */}
                  <td>{aprovacao(c, '')}</td>
                  <td>{orcamento(c, '')}</td>
                  <td>{prazo(c)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
