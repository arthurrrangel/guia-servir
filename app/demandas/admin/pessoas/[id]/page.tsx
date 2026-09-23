'use client';
/* A FICHA DE UMA PESSOA, PARA QUEM ADMINISTRA · migração 94.

   "Pessoas → cadastrar, editar, ativar/desativar, vincular setor, definir
   papel, revisar permissões." Tudo isso numa tela só, na ordem em que se
   decide: quem é, o que pediu, os dados, o papel e o escopo, o que pode, o
   que fez, o link pessoal, a situação, e o histórico do cadastro.

   `/demandas/admin/pessoas/nova` é a mesma tela vazia: cadastrar é editar
   alguém que ainda não existe. Duas telas para a mesma ficha seriam duas
   ideias de "o que é uma pessoa", e a que ninguém olhasse ia envelhecer.

   A PESSOA NÃO SE DUPLICA POR AQUI. O banco recusa e-mail e telefone que já
   são de outra pessoa ativa, e recusa nome repetido até alguém confirmar
   (homônimo existe; cadastrar a mesma pessoa duas vezes sem ver, não). A
   tela mostra quem é o outro, com o link para a ficha dele, antes de deixar
   confirmar. */

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import Casca from '@/components/demandas/Casca';
import { Aviso, Bloco, Campo, Copiar, Esqueleto, Opcoes, Pill } from '@/components/demandas/Ui';
import { ajustar, bases, pessoa } from '@/lib/demandas/api';
import { confirmar } from '@/lib/confirmar';
import { PAPEIS, PERMISSOES, carimbo, dataCheia, recadoDoErro, rotPapel, soDigitos, telVisivel } from '@/lib/demandas/regras';
import type { Bases, FichaPessoa, Papel } from '@/lib/demandas/tipos';

export default function Pagina() {
  return <Casca admin><Ficha /></Casca>;
}

type Rascunho = {
  nome: string; auth_email: string; telefone: string; setor_id: string; funcao: string;
  papel: Papel; escopo_total: boolean; escopo: string[];
};
const VAZIO: Rascunho = {
  nome: '', auth_email: '', telefone: '', setor_id: '', funcao: '',
  papel: 'solicitante', escopo_total: false, escopo: [],
};

function Ficha() {
  const params = useParams<{ id: string }>();
  const id = String(params?.id || '');
  const nova = id === 'nova';
  const router = useRouter();
  const [b, setB] = useState<Bases | null>(null);
  const [f, setF] = useState<FichaPessoa | null>(null);
  const [r, setR] = useState<Rascunho>(VAZIO);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [indo, setIndo] = useState(false);
  const [homonimos, setHomonimos] = useState<{ id: string; nome: string; setor: string | null; ativo: boolean }[] | null>(null);
  const [linkVisivel, setLinkVisivel] = useState(false);

  const carregar = useCallback(async () => {
    const x = await bases();
    if (x.ok) setB({ setores: x.setores, categorias: x.categorias });
    else { setErro(recadoDoErro(x, 'carregar os setores')); return; }
    if (nova) return;
    const p = await pessoa(id);
    if (!p.ok) { setErro(p.erro === 'NAO_EXISTE' ? 'Essa pessoa não existe.' : recadoDoErro(p, 'carregar a pessoa')); return; }
    const fp = p as unknown as FichaPessoa;
    setF(fp);
    setR({
      nome: fp.pessoa.nome, auth_email: fp.pessoa.auth_email || fp.pessoa.email || '',
      telefone: telVisivel(fp.pessoa.telefone), setor_id: fp.pessoa.setor_id || '',
      funcao: fp.pessoa.funcao || '', papel: fp.pessoa.papel,
      escopo_total: !!fp.pessoa.escopo_total, escopo: (fp.pessoa.escopo || []).map(e => e.id),
    });
  }, [id, nova]);
  useEffect(() => { carregar(); }, [carregar]);

  async function enviar(d: Record<string, unknown>, feito: string) {
    setIndo(true); setErro(''); setOk('');
    const resp = await ajustar('membro', d);
    setIndo(false);
    if (!resp.ok) {
      if (resp.erro === 'HOMONIMO') { setHomonimos((resp as unknown as { quem: typeof homonimos }).quem || []); return false; }
      setErro(recadoDoErro(resp, 'salvar'));
      return false;
    }
    setHomonimos(null);
    if (nova) { router.replace(`/demandas/admin/pessoas/${resp.id}`); return true; }
    setOk(feito);
    await carregar();
    return true;
  }

  function dadosDoRascunho(): Record<string, unknown> {
    const d: Record<string, unknown> = {
      nome: r.nome.trim(), auth_email: r.auth_email.trim(), telefone: soDigitos(r.telefone),
      setor_id: r.setor_id, funcao: r.funcao.trim(), papel: r.papel,
    };
    if (r.papel === 'gestor') {
      d.escopo_total = r.escopo_total;
      if (!r.escopo_total) d.escopo = r.escopo;
    }
    return d;
  }

  if (erro && !b) return <Aviso tom="bad">{erro}</Aviso>;
  if (!b || (!nova && !f && !erro)) return <Esqueleto />;
  if (!nova && !f) {
    return (
      <>
        <Aviso tom="bad">{erro}</Aviso>
        <Link className="dm-btn" href="/demandas/admin">Voltar para Pessoas</Link>
      </>
    );
  }

  const p = f?.pessoa;
  const base = typeof window !== 'undefined' ? window.location.origin + '/demandas' : '';
  /* "Salvar" só existe habilitado quando mudou: a mesma regra do Perfil */
  const mudouDados = !!p && (
    r.nome.trim() !== p.nome || r.auth_email.trim() !== (p.auth_email || p.email || '')
    || soDigitos(r.telefone) !== soDigitos(telVisivel(p.telefone)) || r.setor_id !== (p.setor_id || '')
    || r.funcao.trim() !== (p.funcao || ''));
  const mudouPapel = !!p && (
    r.papel !== p.papel || (r.papel === 'gestor' && (r.escopo_total !== !!p.escopo_total
      || (!r.escopo_total && r.escopo.slice().sort().join() !== (p.escopo || []).map(e => e.id).sort().join()))));

  return (
    <>
      <Link className="dm-volta" href="/demandas/admin">Pessoas</Link>
      <div className="dm-cab">
        <div>
          <div className="dm-rot">{'>'} administração · {nova ? 'pessoa nova' : 'pessoa'}</div>
          <h1 style={{ marginTop: 4 }}>{nova ? 'Cadastrar pessoa' : p!.nome}</h1>
          {p ? (
            <div className="dm-quem">
              <Pill>{rotPapel(p.papel)}</Pill>
              {p.ativo === false ? <Pill tom="bad">Inativa</Pill> : <Pill tom="ok">Ativa</Pill>}
              <span>{p.origem === 'cadastro' ? 'Cadastrou-se' : 'Cadastrada pela administração'} em {dataCheia((p.criado_em || '').slice(0, 10))}</span>
            </div>
          ) : null}
        </div>
      </div>
      {erro ? <Aviso tom="bad">{erro}</Aviso> : null}
      {ok ? <Aviso tom="ok">{ok}</Aviso> : null}

      <div className="dm-duas dm-7-5">
      <div>

      {/* o pedido de papel, antes de tudo: é o que a pessoa está esperando */}
      {p?.papel_pedido ? (
        <div className="dm-card dm-precisa">
          <h3 style={{ marginBottom: 6 }}>Pediu para ser {rotPapel(p.papel_pedido)}</h3>
          <p className="dm-peq dm-mudo" style={{ marginBottom: 'var(--dm-e2)' }}>
            {PAPEIS.find(x => x.v === p.papel_pedido)?.explica}
            {p.papel_pedido_em ? ` Pedido em ${dataCheia(p.papel_pedido_em.slice(0, 10))}.` : ''}
          </p>
          <div className="dm-grade" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <button className="dm-btn dm-pri" disabled={indo} onClick={async () => {
              setIndo(true); setErro(''); setOk('');
              const x = await ajustar('pedido', { id: p.id, decisao: 'aceitar' });
              setIndo(false);
              if (!x.ok) {
                setErro(x.erro === 'SETOR_NAO_ATENDE'
                  ? 'O setor desta pessoa não atende demandas. Escolha o setor da equipe em Dados, salve, e aceite de novo.'
                  : recadoDoErro(x, 'aceitar o pedido'));
                return;
              }
              setOk('Pedido aceito.'); await carregar();
            }}>Aceitar</button>
            <button className="dm-btn" disabled={indo} onClick={async () => {
              setIndo(true); setErro(''); setOk('');
              const x = await ajustar('pedido', { id: p.id, decisao: 'recusar' });
              setIndo(false);
              if (!x.ok) { setErro(recadoDoErro(x, 'recusar o pedido')); return; }
              setOk('Pedido recusado. A pessoa continua como Membro.'); await carregar();
            }}>Recusar</button>
          </div>
        </div>
      ) : null}

      {/* ---------------------------------------------------------- dados */}
      <div className="dm-card">
        <h3 style={{ marginBottom: 'var(--dm-e2)' }}>Dados</h3>
        <div className="dm-dupla">
          <Campo rot="Nome">
            <input value={r.nome} onChange={e => setR(v => ({ ...v, nome: e.target.value }))} />
          </Campo>
          <Campo rot="E-mail" ajuda="Entra com ele e recebe os avisos nele.">
            <input type="email" inputMode="email" value={r.auth_email}
              onChange={e => setR(v => ({ ...v, auth_email: e.target.value }))} />
          </Campo>
          <Campo rot="WhatsApp" ajuda="Com DDD.">
            <input inputMode="tel" value={r.telefone} onChange={e => setR(v => ({ ...v, telefone: e.target.value }))} />
          </Campo>
          <Campo rot="Setor">
            <select value={r.setor_id} onChange={e => setR(v => ({ ...v, setor_id: e.target.value }))}>
              <option value="">Escolha</option>
              {b.setores.map(s => <option key={s.id} value={s.id}>{s.nome}{s.atende ? ' · atende' : ''}</option>)}
            </select>
          </Campo>
          <Campo rot="Função" ajuda="O que a pessoa faz. Não muda permissão.">
            <input value={r.funcao} maxLength={80} onChange={e => setR(v => ({ ...v, funcao: e.target.value }))} />
          </Campo>
        </div>

        {/* o papel mora no mesmo cartão na pessoa NOVA (cadastrar é um passo
            só), e em cartão próprio na pessoa que já existe (mudar papel é
            decisão, e não correção de dado) */}
        {nova ? <Papeis r={r} setR={setR} b={b} /> : null}

        {homonimos ? (
          <Aviso tom="warn">
            <div>
              Já existe {homonimos.length === 1 ? 'alguém' : `${homonimos.length} pessoas`} com esse nome:{' '}
              {homonimos.map((h, i) => (
                <span key={h.id}>
                  {i ? ', ' : ''}<Link href={`/demandas/admin/pessoas/${h.id}`}>{h.nome}</Link>
                  {h.setor ? ` (${h.setor}${h.ativo ? '' : ', inativa'})` : h.ativo ? '' : ' (inativa)'}
                </span>
              ))}. Se for a mesma pessoa, abra a ficha dela em vez de cadastrar de novo.
            </div>
          </Aviso>
        ) : null}

        <button className="dm-btn dm-pri" disabled={indo || !r.nome.trim() || !r.setor_id || (!nova && !mudouDados)}
          aria-busy={indo || undefined}
          onClick={() => nova
            ? enviar({ ...dadosDoRascunho(), ...(homonimos ? { confirmar_homonimo: true } : {}) }, 'Cadastrado.')
            : enviar({ id, nome: r.nome.trim(), auth_email: r.auth_email.trim(),
                       telefone: soDigitos(r.telefone), setor_id: r.setor_id, funcao: r.funcao.trim() },
                     'Dados salvos.')}>
          {nova ? (homonimos ? 'É outra pessoa: cadastrar assim mesmo' : 'Cadastrar') : 'Salvar dados'}
        </button>
      </div>

      {p ? (
        <>
          {/* ------------------------------------------------ papel e escopo */}
          <div className="dm-card">
            <h3 style={{ marginBottom: 'var(--dm-e2)' }}>Papel e escopo</h3>
            <Papeis r={r} setR={setR} b={b} />
            <button className="dm-btn dm-pri" disabled={indo || !mudouPapel} aria-busy={indo || undefined}
              onClick={() => {
                const d: Record<string, unknown> = { id, papel: r.papel };
                if (r.papel === 'gestor') {
                  d.escopo_total = r.escopo_total;
                  if (!r.escopo_total) d.escopo = r.escopo;
                }
                enviar(d, 'Papel salvo.');
              }}>Salvar papel</button>
          </div>
        </>
      ) : null}
      </div>

      {p ? (
        <aside>
          {/* ---------------------------------------------------- atividade */}
          <div className="dm-card">
            <h3>Atividade</h3>
            <div className="dm-contas dm-duas-colunas">
              <div className="dm-conta dm-leitura"><b>{f!.atividade.pediu}</b><small>pediu ({f!.atividade.pediu_abertas} em andamento)</small></div>
              <div className="dm-conta dm-leitura"><b>{f!.atividade.com_ela}</b><small>com ela agora</small></div>
              <div className="dm-conta dm-leitura"><b>{f!.atividade.concluiu}</b><small>concluiu</small></div>
              <div className="dm-conta dm-leitura"><b>{f!.atividade.acompanha}</b><small>acompanha</small></div>
            </div>
            <p className="dm-peq dm-mudo" style={{ margin: 'var(--dm-e2) 0 0' }}>
              {f!.atividade.ultima ? `Última ação: ${carimbo(f!.atividade.ultima)}.` : 'Nenhuma ação registrada ainda.'}
            </p>
          </div>

          {/* ---------------------------------------------- o que ela pode */}
          <div className="dm-card">
            <h3 style={{ marginBottom: 'var(--dm-e1)' }}>O que pode</h3>
            <ul className="dm-pode">
              {f!.permissoes.map(k => <li key={k}>{PERMISSOES[k] ?? k}</li>)}
            </ul>
          </div>

          {/* ------------------------------------------------ o link pessoal */}
          <div className="dm-card">
            <h3 style={{ marginBottom: 6 }}>Link pessoal</h3>
            <p className="dm-peq dm-mudo" style={{ marginBottom: 'var(--dm-e2)' }}>
              Entra sem senha. Vale como <b>senha</b>: mande só no privado.
            </p>
            <div className="dm-linha">
              {linkVisivel && p.token
                ? <Copiar texto={`${base}?t=${p.token}`} rot="Copiar o link" />
                : <button className="dm-btn" onClick={() => setLinkVisivel(true)}>Ver o link</button>}
              <button className="dm-btn" disabled={indo} onClick={async () => {
                const sim = await confirmar({
                  titulo: 'Trocar o link pessoal?',
                  texto: 'O link antigo para de funcionar na hora. Use quando ele foi parar onde não devia.',
                  acao: 'Trocar',
                });
                if (!sim) return;
                setIndo(true); setErro(''); setOk('');
                const x = await ajustar('link', { id });
                setIndo(false);
                if (!x.ok) { setErro(recadoDoErro(x, 'trocar o link')); return; }
                setOk('Link trocado. O antigo não entra mais.'); setLinkVisivel(false); await carregar();
              }}>Novo link</button>
            </div>
          </div>

          {/* ------------------------------------------------------ situação */}
          <div className="dm-card">
            <h3 style={{ marginBottom: 6 }}>Situação</h3>
            <p className="dm-peq dm-mudo" style={{ marginBottom: 'var(--dm-e2)' }}>
              {p.ativo === false
                ? 'Inativa: não entra, nem pelo e-mail nem pelo link. As demandas dela continuam no sistema.'
                : 'Ativa. Desativar tira o acesso na hora, e as demandas dela continuam no sistema.'}
            </p>
            {p.ativo === false ? (
              <button className="dm-btn" disabled={indo}
                onClick={() => enviar({ id, ativo: true }, 'Reativada.')}>Reativar</button>
            ) : (
              <button className="dm-btn dm-txt dm-perigo" disabled={indo} onClick={async () => {
                const sim = await confirmar({
                  titulo: `Desativar ${p.nome.split(' ')[0]}?`,
                  texto: 'Ela deixa de entrar, pelo e-mail e pelo link. Nada do que ela pediu ou atendeu é apagado.',
                  acao: 'Desativar',
                });
                if (sim) enviar({ id, ativo: false }, 'Desativada.');
              }}>Desativar</button>
            )}
          </div>

          {/* ----------------------------------------------------- histórico */}
          <details className="dm-card dm-mais" style={{ marginTop: 0 }}>
            <summary>Histórico do cadastro ({f!.historico.length})</summary>
            <ol className="dm-hist" style={{ marginTop: 'var(--dm-e2)' }}>
              {f!.historico.map((h, i) => (
                <li key={i}>
                  <div>{fraseDaPessoa(h)}</div>
                  <div className="dm-q">{carimbo(h.em)}{h.por ? ` · por ${h.por}` : ''}</div>
                </li>
              ))}
            </ol>
          </details>
        </aside>
      ) : <div />}
      </div>
    </>
  );
}

/* O PAPEL E, PARA A GESTÃO, O ESCOPO.

   Gestor precisa dizer o que acompanha: todos os setores, ou alguns. O banco
   recusa gestor sem escopo (ESCOPO_VAZIO), e a tela não deixa chegar lá sem
   mostrar a pergunta. */
function Papeis({ r, setR, b }: { r: Rascunho; setR: React.Dispatch<React.SetStateAction<Rascunho>>; b: Bases }) {
  const explica = PAPEIS.find(x => x.v === r.papel)?.explica;
  return (
    <>
      <Bloco rot="Papel" ajuda={explica}>
        <Opcoes rot="Papel" valor={r.papel} opcoes={PAPEIS.map(p => ({ v: p.v, rot: p.rot }))}
          aoMudar={v => setR(x => ({ ...x, papel: v }))} />
      </Bloco>
      {r.papel === 'gestor' ? (
        <Bloco rot="Acompanha" ajuda="O que a gestão vê, aprova e redistribui.">
          <Opcoes rot="Acompanha" valor={r.escopo_total ? 'todos' : 'alguns'}
            opcoes={[{ v: 'todos', rot: 'Todos os setores' }, { v: 'alguns', rot: 'Só alguns' }]}
            aoMudar={v => setR(x => ({ ...x, escopo_total: v === 'todos' }))} />
          {!r.escopo_total ? (
            <div style={{ marginTop: 'var(--dm-e2)' }}>
              {b.setores.map(s => (
                <label key={s.id} className="dm-caixinha">
                  <input type="checkbox" checked={r.escopo.includes(s.id)}
                    onChange={e => setR(x => ({
                      ...x,
                      escopo: e.target.checked ? [...x.escopo, s.id] : x.escopo.filter(y => y !== s.id),
                    }))} />
                  <span style={{ marginLeft: 10 }}>{s.nome}</span>
                </label>
              ))}
            </div>
          ) : null}
        </Bloco>
      ) : null}
    </>
  );
}

function fraseDaPessoa(h: { tipo: string; de: string | null; para: string | null }): string {
  switch (h.tipo) {
    case 'cadastro': return h.para === 'cadastro' ? 'Fez o próprio cadastro' : 'Cadastrada';
    case 'papel':    return `Papel: ${rotPapel(h.de)} para ${rotPapel(h.para)}`;
    case 'setor':    return `Setor: ${h.de || 'nenhum'} para ${h.para || 'nenhum'}`;
    case 'ativo':    return h.para === 'false' ? 'Desativada' : 'Reativada';
    case 'escopo':   return `Escopo: ${h.para === 'todos' ? 'todos os setores' : h.para === 'escolhidos' ? 'setores escolhidos' : h.para}`;
    case 'pedido':   return h.para ? `Pediu para ser ${rotPapel(h.para)}` : 'Pedido de papel encerrado';
    case 'contato':  return `Mudou ${h.para}`;
    case 'nome':     return `Nome: ${h.de} para ${h.para}`;
    case 'funcao':   return h.para ? `Função: ${h.para}` : 'Tirou a função';
    case 'link':     return 'Link pessoal trocado';
    default:         return h.tipo;
  }
}
