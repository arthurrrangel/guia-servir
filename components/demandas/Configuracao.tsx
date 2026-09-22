'use client';
/* SETORES E CATEGORIAS: A CONFIGURAÇÃO DO SISTEMA · migração 94.

   Estas peças moravam em `app/demandas/ajustes/page.tsx`, na mesma tela da
   lista de gente. Com a administração separada da interface comum (o pedido:
   "não misture isso com a interface do usuário comum"), elas passaram para
   cá sem mudar uma linha de comportamento, e `app/demandas/admin/page.tsx`
   as monta. Os comentários de cada uma continuam contando por que ela é
   como é. */

import { useEffect, useState } from 'react';
import { Aviso } from './Ui';
import { confirmar } from '@/lib/confirmar';
import type { Bases, Setor } from '@/lib/demandas/tipos';

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
      <input inputMode="decimal" aria-label={`Aprovar acima de, em ${s.nome}`}
        placeholder="sem teto" value={v} onChange={e => setV(e.target.value)}
        disabled={indo}
        style={{ width: 96, minHeight: 44, padding: '0 8px', border: '1px solid var(--dm-linha2)', borderRadius: 'var(--dm-r)', background: 'var(--dm-card3)' }} />
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
          <b>Atende</b> quer dizer que o setor pode RECEBER demanda. Setor que só pede fica
          com isso desligado, assim ninguém manda uma demanda para um lugar que não vai olhar.
          <br />
          <b>Aprovar acima de</b> é o valor a partir do qual a demanda espera a liderança, mesmo
          que a categoria não exija. Em branco: sem teto.
        </div>
      </Aviso>
      <div className="dm-card">
        <div className="dm-linha">
          <input className="dm-cresce" placeholder="Nome do setor" value={nome}
            onChange={e => setNome(e.target.value)}
            style={{ minHeight: 46, padding: '0 12px', border: '1px solid var(--dm-linha2)', borderRadius: 'var(--dm-r)', background: 'var(--dm-card3)' }} />
          <button className="dm-btn" aria-pressed={atende} onClick={() => setAtende(x => !x)}>
            {atende ? 'Atende' : 'Só pede'}
          </button>
          <button className="dm-btn dm-pri" disabled={indo || !nome.trim()}
            onClick={async () => { if (await salvar('setor', { nome, atende })) { setNome(''); setAtende(false); } }}>
            Criar
          </button>
        </div>
      </div>
      <div className="dm-card">
        <table className="dm-tab">
          <thead><tr><th>Setor</th><th>Recebe demanda</th><th>Aprovar acima de</th><th>Ativo</th></tr></thead>
          <tbody>
            {b.setores.map(s => (
              <tr key={s.id}>
                <td><b>{s.nome}</b></td>
                <td>
                  <button className="dm-btn dm-peq" disabled={indo}
                    onClick={() => salvar('setor', { id: s.id, atende: !s.atende })}>
                    {s.atende ? 'Sim' : 'Não'}
                  </button>
                </td>
                <td><Teto s={s} indo={indo} salvar={salvar} /></td>
                <td>
                  {/* DESATIVAR SETOR PEDE CONFIRMAÇÃO · 20/09/2026.

                      Auditoria de tela. Era um toque, sem pergunta, ao lado
                      de um "Sim/Não" que é um toggle inócuo. E desativar um
                      setor o tira dos seletores de "Vai para", de "Quem está
                      pedindo" e de "Mandar para outro setor" · sem que esta
                      tela ofereça "Reativar". O lado das escalas pede
                      confirmação para coisas menores. */}
                  <button className="dm-btn dm-peq" disabled={indo}
                    onClick={async () => {
                      const ok = await confirmar({
                        titulo: `Desativar o setor ${s.nome}?`,
                        texto: 'Ele some das listas de quem pede e de quem atende, e as demandas que já estão nele continuam lá.',
                        acao: 'Desativar',
                      });
                      if (ok) salvar('setor', { id: s.id, ativo: false });
                    }}>Desativar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
  const nomeSetor = (id: string | null) => b.setores.find(s => s.id === id)?.nome || 'sem setor';

  return (
    <>
      <Aviso tom="info">
        <div>
          Aqui mora a <b>triagem</b>. A categoria decide sozinha qual setor atende, se precisa de
          aprovação e quantos dias sugerir de prazo. Mudar uma linha muda o destino de toda demanda
          futura daquele tipo, e não mexe nas que já existem.
        </div>
      </Aviso>

      <div className="dm-opcoes" style={{ marginBottom: 'var(--dm-e2)' }}>
        {grupos.map(x => (
          <button key={x} type="button" aria-pressed={g === x} onClick={() => setG(x)}>{x}</button>
        ))}
      </div>

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
        <div className="dm-linha">
          <input className="dm-cresce" value={nova} placeholder={`Nome da categoria em ${g}`}
            aria-label={`Nome da categoria nova em ${g}`}
            onChange={e => setNova(e.target.value)}
            style={{ minHeight: 46, padding: '0 12px', border: '1px solid var(--dm-linha2)', borderRadius: 'var(--dm-r)', background: 'var(--dm-card3)' }} />
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
          Nasce em <b>{g || 'nenhum grupo'}</b>, sem setor e sem aprovação. Sem setor, a demanda
          volta para quem pediu: aponte o destino na linha dela, aqui embaixo.
        </p>
      </div>

      <div className="dm-card">
        <table className="dm-tab">
          <thead><tr>
            <th>Categoria</th><th>Vai para</th><th>Aprovação</th><th>Orçamento</th><th>Prazo</th>
          </tr></thead>
          <tbody>
            {doGrupo.map(c => (
              <tr key={c.id}>
                <td><b>{c.nome}</b></td>
                <td>
                  <select value={c.setor_id || ''} disabled={indo}
                    onChange={e => salvar('categoria', { id: c.id, setor_id: e.target.value })}
                    style={{ maxWidth: 170 }}>
                    <option value="">Nenhum</option>
                    {b.setores.filter(s => s.atende).map(s => (
                      <option key={s.id} value={s.id}>{s.nome}</option>
                    ))}
                  </select>
                  <div className="dm-peq dm-mudo">{nomeSetor(c.setor_id)}</div>
                </td>
                <td>
                  <button className="dm-btn dm-peq" disabled={indo}
                    onClick={() => salvar('categoria', { id: c.id, exige_aprovacao: !c.exige_aprovacao })}>
                    {c.exige_aprovacao ? 'Exige' : 'Não exige'}
                  </button>
                </td>
                {/* A COLUNA QUE FALTAVA, E TRES CAMADAS DEPENDIAM DELA · 22/09/2026.

                    `exige_orcamento` existe desde a migração 50, `dem_ajustar`
                    aceita o campo, `/demandas/nova` exige o valor quando ele
                    está ligado e a migração 86 passou a cobrar no banco. Esta
                    tela não tinha controle nenhum: as categorias que exigem
                    orçamento só podiam ter sido marcadas por SQL direto, e não
                    havia como desmarcar.

                    O comentário da 86 dizia "a tela de Ajustes deixa ligar".
                    Não deixava. */}
                <td>
                  <button className="dm-btn dm-peq" disabled={indo}
                    onClick={() => salvar('categoria', { id: c.id, exige_orcamento: !c.exige_orcamento })}>
                    {c.exige_orcamento ? 'Exige' : 'Não exige'}
                  </button>
                </td>
                <td className="dm-n">
                  <input type="number" min={0} defaultValue={c.prazo_padrao_dias ?? ''} disabled={indo}
                    onBlur={e => {
                      const v = e.target.value.trim();
                      const antigo = c.prazo_padrao_dias ?? '';
                      if (String(v) === String(antigo)) return;
                      salvar('categoria', { id: c.id, prazo_padrao_dias: v });
                    }}
                    style={{ width: 72, textAlign: 'right' }} />
                  <span className="dm-peq dm-mudo"> dias</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
