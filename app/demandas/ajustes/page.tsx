'use client';
/* AJUSTES — só para quem administra.

   Três coisas, e a ordem é a de quem está montando o sistema pela primeira
   vez: as pessoas (sem elas ninguém entra), os setores e as categorias.

   A tela de categorias é a mais importante e a menos óbvia: é ali que mora a
   triagem. Mudar "Compra de equipamentos" para outro setor muda o destino de
   toda compra futura, sem tocar em código. Por isso cada linha diz, em
   palavras, o que aquela configuração faz.

   O link pessoal de cada pessoa é uma CREDENCIAL: quem tem o link entra como
   ela. Por isso ele fica escondido atrás de um toque e a tela avisa que é
   para mandar no privado, nunca em grupo. */

import { useCallback, useEffect, useState } from 'react';
import Casca, { useEu } from '@/components/demandas/Casca';
import { Aviso, Campo, Copiar, Esqueleto } from '@/components/demandas/Ui';
import { ajustar, bases, pessoas } from '@/lib/demandas/api';
import { recadoDoErro, soDigitos } from '@/lib/demandas/regras';
import { confirmar } from '@/lib/confirmar';
import type { Bases, Membro, Papel } from '@/lib/demandas/tipos';

export default function Pagina() {
  return <Casca><Ajustes /></Casca>;
}

const PAPEIS: { v: Papel; rot: string; explica: string }[] = [
  { v: 'solicitante', rot: 'Pede',      explica: 'Abre demanda e acompanha as próprias.' },
  { v: 'responsavel', rot: 'Atende',    explica: 'Assume, muda prazo e conclui o que cai no setor dela.' },
  { v: 'gestor',      rot: 'Lidera',    explica: 'Vê tudo, aprova, recusa e redistribui.' },
  { v: 'admin',       rot: 'Administra', explica: 'Tudo isso e mais esta tela.' },
];

function Ajustes() {
  const { eu } = useEu();
  const [b, setB] = useState<Bases | null>(null);
  const [ms, setMs] = useState<Membro[] | null>(null);
  const [aba, setAba] = useState<'gente' | 'setores' | 'categorias'>('gente');
  const [erro, setErro] = useState('');
  const [indo, setIndo] = useState(false);

  const recarregar = useCallback(async () => {
    const [x, p] = await Promise.all([bases(), pessoas()]);
    /* O ERRO DE `bases()` ERA DESCARTADO, E A TELA FICAVA EM ESQUELETO ETERNO.

       20/09/2026, auditoria de tela. Só o `if (x.ok)` existia: quando a
       chamada falhava, `b` continuava nulo para sempre, o `return <Esqueleto/>`
       mais abaixo vencia, e o `{erro && <Aviso/>}` NUNCA era alcançado. A
       pessoa ficava olhando três barras cinza animadas, sem texto, sem botão
       e sem saber que recarregar é o único gesto possível. */
    if (x.ok) setB({ setores: x.setores, categorias: x.categorias });
    else setErro(recadoDoErro(x, 'carregar os ajustes'));
    if (p.ok) setMs(p.membros); else setErro(recadoDoErro(p, 'carregar as pessoas'));
  }, []);
  useEffect(() => { recarregar(); }, [recarregar]);

  async function salvar(o: 'setor' | 'categoria' | 'membro', d: Record<string, unknown>) {
    setIndo(true); setErro('');
    const r = await ajustar(o, d);
    setIndo(false);
    if (!r.ok) { setErro(recadoDoErro(r, 'salvar')); return false; }
    await recarregar();
    return true;
  }

  if (eu && eu.papel !== 'admin') {
    return <Aviso tom="bad">Esta tela é de quem administra o sistema.</Aviso>;
  }
  /* erro ANTES do esqueleto: sem isto, falha de rede vira barra cinza eterna */
  if (erro && (!b || !ms)) {
    return (
      <>
        <div className="dm-rot">{'>'} ajustes</div>
        <Aviso tom="bad">{erro}</Aviso>
        <button className="dm-btn" onClick={() => { setErro(''); recarregar(); }}
          style={{ marginTop: 'var(--dm-e2)' }}>Tentar de novo</button>
      </>
    );
  }
  if (!b || !ms) return <Esqueleto />;

  return (
    <>
      <div className="dm-rot">{'>'} ajustes</div>
      <h1 style={{ margin: '6px 0 var(--dm-e3)' }}>Como o sistema está montado</h1>
      {erro ? <Aviso tom="bad">{erro}</Aviso> : null}

      <div className="dm-opcoes" role="group" aria-label="Seção" style={{ marginBottom: 'var(--dm-e3)' }}>
        {([['gente', `Gente (${ms.length})`], ['setores', `Setores (${b.setores.length})`],
           ['categorias', `Categorias (${b.categorias.length})`]] as const).map(([v, r]) => (
          <button key={v} type="button" aria-pressed={aba === v} onClick={() => setAba(v)}>{r}</button>
        ))}
      </div>

      {aba === 'gente' ? <Gente ms={ms} b={b} indo={indo} salvar={salvar} /> : null}
      {aba === 'setores' ? <Setores b={b} indo={indo} salvar={salvar} /> : null}
      {aba === 'categorias' ? <Categorias b={b} indo={indo} salvar={salvar} /> : null}
    </>
  );
}

/* ------------------------------------------------------------------ gente */
function Gente({ ms, b, indo, salvar }: {
  ms: Membro[]; b: Bases; indo: boolean;
  salvar: (o: 'membro', d: Record<string, unknown>) => Promise<boolean>;
}) {
  const [novo, setNovo] = useState({ nome: '', telefone: '', auth_email: '', setor_id: '', papel: 'solicitante' as Papel });
  const [mostrando, setMostrando] = useState<string | null>(null);
  /* a raiz do SISTEMA, não do site: os links que saem daqui pelo WhatsApp
     precisam cair em /demandas, e não na home da igreja */
  const base = typeof window !== 'undefined' ? window.location.origin + '/demandas' : '';

  return (
    <>
      <div className="dm-card">
        <h3 style={{ marginBottom: 10 }}>Cadastrar alguém</h3>
        <div className="dm-dupla">
          <Campo rot="Nome"><input value={novo.nome} onChange={e => setNovo(v => ({ ...v, nome: e.target.value }))} /></Campo>
          <Campo rot="WhatsApp" ajuda="Com DDD. É por onde os avisos saem.">
            <input inputMode="tel" value={novo.telefone}
              onChange={e => setNovo(v => ({ ...v, telefone: e.target.value }))} />
          </Campo>
          <Campo rot="Setor">
            <select value={novo.setor_id} onChange={e => setNovo(v => ({ ...v, setor_id: e.target.value }))}>
              <option value="">Escolha</option>
              {b.setores.map(s => <option key={s.id} value={s.id}>{s.nome}{s.atende ? ' · atende' : ''}</option>)}
            </select>
          </Campo>
          <Campo rot="O que faz" ajuda={PAPEIS.find(p => p.v === novo.papel)?.explica}>
            <select value={novo.papel} onChange={e => setNovo(v => ({ ...v, papel: e.target.value as Papel }))}>
              {PAPEIS.map(p => <option key={p.v} value={p.v}>{p.rot}</option>)}
            </select>
          </Campo>
        </div>
        <Campo rot="E-mail do login (opcional)"
          ajuda="Só para quem vai entrar com senha. Tem que ser o mesmo e-mail do GUIA Servir, senão a senha não confere. Quem não tiver entra pelo link pessoal.">
          <input type="email" value={novo.auth_email}
            onChange={e => setNovo(v => ({ ...v, auth_email: e.target.value }))} />
        </Campo>
        <button className="dm-btn dm-pri dm-larga" disabled={indo || !novo.nome.trim() || !novo.setor_id}
          onClick={async () => {
            if (await salvar('membro', { ...novo, telefone: soDigitos(novo.telefone) })) {
              setNovo({ nome: '', telefone: '', auth_email: '', setor_id: '', papel: 'solicitante' });
            }
          }}>Cadastrar</button>
      </div>

      <Aviso tom="warn">
        <div>
          O link pessoal é uma <b>senha</b>: quem tiver o link entra como aquela pessoa.
          Mande no privado, nunca em grupo.
        </div>
      </Aviso>

      <div className="dm-card">
        <table className="dm-tab">
          <thead><tr><th>Quem</th><th>Setor</th><th>Faz</th><th>Link</th></tr></thead>
          <tbody>
            {ms.map(m => (
              <tr key={m.id} style={{ opacity: m.ativo === false ? .5 : 1 }}>
                <td>
                  <b>{m.nome}</b>
                  {m.auth_email ? <div className="dm-peq dm-mudo">{m.auth_email}</div> : null}
                  {m.telefone ? <div className="dm-peq dm-mudo">{m.telefone}</div> : null}
                </td>
                <td>
                  {/* SEM `<option value="">`, O NAVEGADOR MOSTRA O PRIMEIRO.

                      Membro sem setor aparecia exibindo o primeiro setor da
                      lista, que não é o dele. Quem administra lê a tela e
                      conclui que o cadastro está certo, e o `SEM_SETOR` que o
                      servidor devolve na hora de abrir demanda fica sem
                      explicação. */}
                  <select value={m.setor_id || ''} disabled={indo}
                    onChange={e => salvar('membro', { id: m.id, setor_id: e.target.value })}
                    style={{ maxWidth: 150 }}>
                    <option value="">— sem setor —</option>
                    {b.setores.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                  </select>
                </td>
                <td>
                  <select value={m.papel} disabled={indo}
                    onChange={e => salvar('membro', { id: m.id, papel: e.target.value })}
                    >
                    {PAPEIS.map(p => <option key={p.v} value={p.v}>{p.rot}</option>)}
                  </select>
                </td>
                <td>
                  {mostrando === m.id
                    ? <Copiar texto={`${base}?t=${m.token}`} rot="Copiar o link" />
                    : <button className="dm-btn dm-peq" onClick={() => setMostrando(m.id)}>Ver o link</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- setores */
function Setores({ b, indo, salvar }: {
  b: Bases; indo: boolean; salvar: (o: 'setor', d: Record<string, unknown>) => Promise<boolean>;
}) {
  const [nome, setNome] = useState('');
  const [atende, setAtende] = useState(false);
  return (
    <>
      <Aviso tom="info">
        <div>
          <b>Atende</b> quer dizer que o setor pode RECEBER demanda. Ministério que só pede fica
          com isso desligado — assim ninguém manda uma demanda para um lugar que não vai olhar.
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
          <thead><tr><th>Setor</th><th>Recebe demanda</th><th>Ativo</th></tr></thead>
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
                <td>
                  {/* DESATIVAR SETOR PEDE CONFIRMAÇÃO — 20/09/2026.

                      Auditoria de tela. Era um toque, sem pergunta, ao lado
                      de um "Sim/Não" que é um toggle inócuo. E desativar um
                      setor o tira dos seletores de "Vai para", de "Quem está
                      pedindo" e de "Mandar para outro setor" — sem que esta
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
function Categorias({ b, indo, salvar }: {
  b: Bases; indo: boolean; salvar: (o: 'categoria', d: Record<string, unknown>) => Promise<boolean>;
}) {
  const grupos = [...new Set(b.categorias.map(c => c.grupo))];
  const [g, setG] = useState(grupos[0] || '');
  const [nova, setNova] = useState('');
  const doGrupo = b.categorias.filter(c => c.grupo === g);
  const nomeSetor = (id: string | null) => b.setores.find(s => s.id === id)?.nome || '—';

  return (
    <>
      <Aviso tom="info">
        <div>
          Aqui mora a <b>triagem</b>. A categoria decide sozinha qual setor atende, se precisa de
          aprovação e quantos dias sugerir de prazo. Mudar uma linha muda o destino de toda demanda
          futura daquele tipo — e não mexe nas que já existem.
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
                    <option value="">— nenhum —</option>
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
                {/* A COLUNA QUE FALTAVA, E TRES CAMADAS DEPENDIAM DELA — 22/09/2026.

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
