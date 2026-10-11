'use client';
/* A FICHA DE UMA PESSOA, PARA QUEM ADMINISTRA · migração 94.

   "Pessoas → cadastrar, editar, ativar/desativar, vincular setor, definir
   papel, revisar permissões." Tudo isso numa tela só, na ordem em que se
   decide: quem é, o que pediu, os dados, o papel, o que pode, o
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
import Casca, { useEu } from '@/components/demandas/Casca';
import { Aviso, Bloco, Cabecalho, Campo, Copiar, Esqueleto, Kpi, Kpis, Opcoes, Pill, Secao } from '@/components/demandas/Ui';
import { Icone } from '@/components/demandas/Icone';
import { ajustar, bases, guardarToken, meuToken, pessoa } from '@/lib/demandas/api';
import { confirmar } from '@/components/demandas/Confirmar';
import { sb } from '@/lib/supabase';
import { PAPEIS, PAPEIS_QUE_SE_DAO, PERMISSOES, carimbo, dataCheia, iniciais, recadoDoErro, rotPapel, soDigitos, telVisivel } from '@/lib/demandas/regras';
import type { Bases, FichaPessoa, Papel } from '@/lib/demandas/tipos';

export default function Pagina() {
  return <Casca admin><Ficha /></Casca>;
}

type Rascunho = {
  nome: string; auth_email: string; telefone: string; setor_id: string; funcao: string;
  papel: Papel;
};
const VAZIO: Rascunho = {
  nome: '', auth_email: '', telefone: '', setor_id: '', funcao: '',
  papel: 'solicitante',
};
/* 96 · Pessoas é uma seção da administração com endereço próprio: o
   `/demandas/admin` sem nada é o Panorama */
const PESSOAS = '/demandas/admin?secao=pessoas';

/* E-MAIL NÃO TEM ESPAÇO NEM CARACTERE INVISÍVEL. Colado do WhatsApp, ele
   chega com espaço de largura zero, marca de direção ou espaço duro no meio,
   e o banco (96) recusa com EMAIL_INVALIDO: um e-mail assim nunca casaria com
   o do link de entrada (auditoria R15B). A tela tira antes de mandar, e o
   banco continua recusando o que sobrar. */
const semInvisiveis = (t: string) => t.replace(/[\s\p{Cf}]/gu, '');

function Ficha() {
  const params = useParams<{ id: string }>();
  const id = String(params?.id || '');
  const nova = id === 'nova';
  const router = useRouter();
  const [b, setB] = useState<Bases | null>(null);
  const [f, setF] = useState<FichaPessoa | null>(null);
  const [r, setR] = useState<Rascunho>(VAZIO);
  const [erro, setErro] = useState('');
  /* O ACERTO É TOAST, E A RECUSA VEM À VISTA — 24/09/2026 (auditoria R12).
     "Papel salvo." e as recusas nasciam no alto da ficha, fora da tela em 390
     e em 1024: a pessoa salvava lá embaixo e nada mudava à vista. Agora o
     acerto é o toast (o mesmo de Setores e Categorias) e a recusa leva a
     tela até o aviso. */
  const ctx = useEu();
  const setOk = (t: string) => { if (t) ctx.toast?.({ texto: t }); };
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
    });
  }, [id, nova]);
  useEffect(() => { carregar(); }, [carregar]);

  async function enviar(d: Record<string, unknown>, feito: string) {
    setIndo(true); setErro(''); setOk('');
    const resp = await ajustar('membro', d);
    setIndo(false);
    if (!resp.ok) {
      if (resp.erro === 'HOMONIMO') { setHomonimos((resp as unknown as { quem: typeof homonimos }).quem || []); return false; }
      /* 96 · o banco pede a confirmação do e-mail de entrar da administração
         mesmo quando a tela não achou que mudou (a ficha estava velha) */
      if (resp.erro === 'CONFIRMAR_LOGIN' && !d.confirmar_login) {
        if (await confirmarLogin(String(d.auth_email || ''))) return enviar({ ...d, confirmar_login: true }, feito);
        return false;
      }
      setErro(recadoDoErro(resp, 'salvar'));
      requestAnimationFrame(() => document.querySelector('.dm-aviso.dm-bad')
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
      return false;
    }
    setHomonimos(null);
    if (nova) { router.replace(`/demandas/admin/pessoas/${resp.id}`); return true; }
    /* 96 · quem troca o PRÓPRIO e-mail de entrar e entrou por e-mail não
       entra mais com a sessão de agora (o banco procura o e-mail velho): sai
       já, e a porta de entrada abre com o e-mail novo escrito (R15B) */
    if (d.confirmar_login && f?.pessoa.id && f.pessoa.id === ctx.eu?.id && !meuToken()) {
      try {
        sessionStorage.setItem('demandas.loginTrocado',
          JSON.stringify({ email: String(d.auth_email || ''), em: Date.now() }));
      } catch { /* sem armazenamento: a porta abre sem o e-mail escrito */ }
      try { await sb()?.auth.signOut(); } catch { /* sem sessão, já está fora */ }
      location.href = '/demandas/entrar';
      return true;
    }
    setOk(feito);
    await carregar();
    return true;
  }

  /* 96 · A ADMINISTRAÇÃO NÃO SE TRANCA PARA FORA. Ela é uma pessoa só: com o
     e-mail de entrar escrito errado, não há outra administração para
     consertar pela tela (auditoria R15A). O banco pede a confirmação
     (CONFIRMAR_LOGIN) e a tela a faz aqui, com o e-mail novo à vista. */
  async function confirmarLogin(novo: string) {
    const e = semInvisiveis(novo).toLowerCase();
    /* quem entrou pelo link continua dentro; quem entrou pelo e-mail sai
       ao salvar, porque a sessão é do e-mail velho */
    return confirmar({
      titulo: 'Trocar o e-mail com que você entra?',
      texto: meuToken()
        ? `Ao salvar, a entrada por e-mail passa a ser só por ${e}. Aqui você continua dentro, pelo link pessoal. Confira letra por letra: com o e-mail errado, a entrada por e-mail não funciona.`
        : `Ao salvar, a entrada por e-mail passa a ser só por ${e}, e você sai deste aparelho para entrar de novo por ele. Confira letra por letra: com o e-mail errado, você só entra pelo link pessoal.`,
      acao: 'Trocar e salvar',
    });
  }

  function dadosDoRascunho(): Record<string, unknown> {
    const d: Record<string, unknown> = {
      nome: r.nome.trim(), auth_email: semInvisiveis(r.auth_email), telefone: soDigitos(r.telefone),
      setor_id: r.setor_id, funcao: r.funcao.trim(), papel: r.papel,
    };
    return d;
  }

  /* sem os setores a ficha não monta; a falha tem título e saída, e não
     uma faixa vermelha solta */
  if (erro && !b) {
    return (
      <>
        <Cabecalho volta={{ href: PESSOAS, rot: 'Pessoas' }} sobre="Administração" titulo={nova ? 'Cadastrar pessoa' : 'Pessoa'} />
        <Aviso tom="bad">{erro}</Aviso>
        <button type="button" className="dm-btn dm-tentar" onClick={() => { setErro(''); carregar(); }}>Tentar de novo</button>
      </>
    );
  }
  if (!b || (!nova && !f && !erro)) return <Esqueleto forma="ficha" />;
  if (!nova && !f) {
    return (
      <>
        <Cabecalho volta={{ href: PESSOAS, rot: 'Pessoas' }} sobre="Administração" titulo="Pessoa" />
        <Aviso tom="bad">{erro}</Aviso>
        {/* a pessoa que não existe não volta com outra tentativa; a falha de
            rede volta (24/09/2026, auditoria R13) */}
        <div className="dm-linha">
          {erro === 'Essa pessoa não existe.' ? null
            : <button type="button" className="dm-btn dm-pri" onClick={() => { setErro(''); carregar(); }}>Tentar de novo</button>}
          <Link className="dm-btn" href={PESSOAS}>Voltar para Pessoas</Link>
        </div>
      </>
    );
  }

  const p = f?.pessoa;
  const base = typeof window !== 'undefined' ? window.location.origin + '/demandas' : '';
  /* "Salvar" só existe habilitado quando mudou: a mesma regra do Perfil */
  const mudouDados = !!p && (
    r.nome.trim() !== p.nome || semInvisiveis(r.auth_email) !== (p.auth_email || p.email || '')
    || soDigitos(r.telefone) !== soDigitos(telVisivel(p.telefone)) || r.setor_id !== (p.setor_id || '')
    || r.funcao.trim() !== (p.funcao || ''));
  const mudouPapel = !!p && r.papel !== p.papel;
  /* 96 · a administração é de uma pessoa só: na ficha dela, o papel não se
     troca e o acesso não se desliga (o banco recusaria com ULTIMO_ADMIN).
     Só a ATIVA: uma administração antiga, sem acesso, é histórico, e a
     ficha dela diz "Sem acesso" com o Reativar (que o banco recusa com
     ADMIN_UNICO enquanto houver a atual, e a frase diz por quê). */
  const administra = p?.papel === 'admin' && p?.ativo !== false;
  /* a ficha de quem está usando a tela: o link novo dela precisa voltar */
  const souEu = !!p && !!ctx.eu?.id && ctx.eu.id === p.id;
  const loginAntes = (p?.auth_email || p?.email || '').trim().toLowerCase();
  const loginAgora = semInvisiveis(r.auth_email).toLowerCase();
  const mudouLogin = administra && loginAgora !== loginAntes;

  /* o mesmo limite de largura das quatro seções da administração: a borda
     direita não pula ao abrir uma pessoa */
  return (
    <div className="dm-limite">
      <Cabecalho volta={{ href: PESSOAS, rot: 'Pessoas' }}
        lado={p ? <span className="dm-avatar dm-grande" aria-hidden="true">{iniciais(p.nome)}</span> : null}
        sobre={nova ? 'Administração · Pessoa nova' : 'Administração · Pessoa'}
        titulo={nova ? 'Cadastrar pessoa' : p!.nome}
        meta={p ? <>
          <Pill>{rotPapel(p.papel)}</Pill>
          {/* com acesso é o normal e não ganha pílula; sem acesso é cinza, e
              não vermelho (vermelho é atraso e urgência, e só). "Sem acesso", e
              não "Inativa": a palavra não diz o gênero de ninguém */}
          {p.ativo === false ? <Pill>Sem acesso</Pill> : null}
          <span>{p.origem === 'cadastro' ? 'Fez o próprio cadastro' : 'Cadastro feito pela administração'} em {dataCheia(p.criado_em || '')}</span>
        </> : <span>A pessoa entra com o e-mail cadastrado aqui.</span>} />
      {erro ? <Aviso tom="bad">{erro}</Aviso> : null}

      <div className="dm-duas">
      <div>

      {/* o pedido de papel, antes de tudo: é o que a pessoa está esperando */}
      {p?.papel_pedido ? (
        <div className="dm-caixa dm-bloco-pedido">
          <div className="dm-caixa-corpo">
            <h2 className="dm-caixa-titulo">Quer ser {rotPapel(p.papel_pedido)}</h2>
            <p className="dm-peq dm-mudo">
              {PAPEIS.find(x => x.v === p.papel_pedido)?.explica}
              {p.papel_pedido_em ? ` Pedido em ${dataCheia(p.papel_pedido_em)}.` : ''}
            </p>
          </div>
          {/* o mesmo par da lista de Pessoas: Aceitar primário, Recusar em
              contorno; no celular o primário toma a linha */}
          <div className="dm-caixa-pe">
            <button type="button" className="dm-btn" disabled={indo} onClick={async () => {
              setIndo(true); setErro(''); setOk('');
              const x = await ajustar('pedido', { id: p.id, decisao: 'recusar' });
              setIndo(false);
              if (!x.ok) { setErro(recadoDoErro(x, 'recusar o pedido')); return; }
              setOk('Pedido recusado. A pessoa continua como Membro.'); await carregar();
            }}>Recusar</button>
            <button type="button" className="dm-btn dm-pri" disabled={indo} onClick={async () => {
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
          </div>
        </div>
      ) : null}

      {/* ---------------------------------------------------------- dados */}
      <Secao titulo="Dados">
        <div className="dm-caixa">
          <div className="dm-caixa-corpo">
            <div className="dm-dupla">
              <Campo rot="Nome">
                <input value={r.nome} onChange={e => setR(v => ({ ...v, nome: e.target.value }))} />
              </Campo>
              <Campo rot="E-mail" ajuda="Entra com ele e recebe os avisos nele.">
                <input type="email" inputMode="email" value={r.auth_email}
                  onChange={e => setR(v => ({ ...v, auth_email: e.target.value }))} />
              </Campo>
              <Campo rot="WhatsApp" ajuda="Com DDD.">
                <input type="tel" inputMode="tel" value={r.telefone} onChange={e => setR(v => ({ ...v, telefone: e.target.value }))} />
              </Campo>
              <Campo rot="Setor">
                {/* os mesmos dois grupos do cadastro: fechado, o campo mostra só
                    o nome ("Comunicação"), e não "Comunicação · atende" */}
                <select value={r.setor_id} onChange={e => setR(v => ({ ...v, setor_id: e.target.value }))}>
                  <option value="">Escolha</option>
                  {b.setores.some(s => !s.atende) ? (
                    <optgroup label="Ministérios e áreas">
                      {b.setores.filter(s => !s.atende).map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                    </optgroup>
                  ) : null}
                  {b.setores.some(s => s.atende) ? (
                    <optgroup label="Equipes que atendem demandas">
                      {b.setores.filter(s => s.atende).map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                    </optgroup>
                  ) : null}
                </select>
              </Campo>
              <Campo rot="Função" ajuda="O que a pessoa faz. Não muda permissão.">
                <input value={r.funcao} maxLength={80} onChange={e => setR(v => ({ ...v, funcao: e.target.value }))} />
              </Campo>
            </div>

            {/* o papel mora no mesmo bloco na pessoa NOVA (cadastrar é um passo
                só), e em bloco próprio na pessoa que já existe (mudar papel é
                decisão, e não correção de dado) */}
            {nova ? <Papeis r={r} setR={setR} /> : null}

            {homonimos ? (
              <Aviso tom="warn">
                Já existe {homonimos.length === 1 ? 'alguém' : `${homonimos.length} pessoas`} com esse nome:{' '}
                {homonimos.map((h, i) => (
                  <span key={h.id}>
                    {i ? ', ' : ''}<Link href={`/demandas/admin/pessoas/${h.id}`}>{h.nome}</Link>
                    {h.setor ? ` (${h.setor}${h.ativo ? '' : ', sem acesso'})` : h.ativo ? '' : ' (sem acesso)'}
                  </span>
                ))}. Se for a mesma pessoa, abra a ficha que já existe em vez de cadastrar de novo.
              </Aviso>
            ) : null}
          </div>
          <div className="dm-caixa-pe">
            <button type="button" className="dm-btn dm-pri" disabled={indo || !r.nome.trim() || !r.setor_id || (!nova && !mudouDados)}
              aria-busy={indo || undefined}
              onClick={async () => {
                if (nova) {
                  enviar({ ...dadosDoRascunho(), ...(homonimos ? { confirmar_homonimo: true } : {}) }, 'Cadastrado.');
                  return;
                }
                const d: Record<string, unknown> = { id, nome: r.nome.trim(), auth_email: semInvisiveis(r.auth_email),
                  telefone: soDigitos(r.telefone), setor_id: r.setor_id, funcao: r.funcao.trim() };
                /* a administração sem e-mail de entrar: recusado aqui, com a
                   frase do banco (LOGIN_VAZIO), sem ir até ele; trocado, a
                   pergunta vem antes de gravar */
                if (administra && !loginAgora) {
                  setErro(recadoDoErro({ ok: false, erro: 'LOGIN_VAZIO' }, 'salvar'));
                  requestAnimationFrame(() => document.querySelector('.dm-aviso.dm-bad')
                    ?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
                  return;
                }
                if (mudouLogin) {
                  if (!(await confirmarLogin(loginAgora))) return;
                  d.confirmar_login = true;
                }
                enviar(d, 'Dados salvos.');
              }}>
              {nova ? (homonimos ? 'É outra pessoa: cadastrar assim mesmo' : 'Cadastrar') : 'Salvar dados'}
            </button>
          </div>
        </div>
      </Secao>

      {p && administra ? (
        /* ---------------------------------------- o papel de quem administra */
        <Secao titulo="Papel">
          <div className="dm-caixa">
            <div className="dm-caixa-corpo">
              <p className="dm-adm-unica"><b>Administração</b> é de uma pessoa só. Ela vê tudo, aprova, e cuida
                de pessoas, setores, categorias e anexos. O papel não muda de mão por esta tela.</p>
            </div>
          </div>
        </Secao>
      ) : p ? (
        /* ------------------------------------------------------------ papel */
        <Secao titulo="Papel">
          <div className="dm-caixa">
            <div className="dm-caixa-corpo">
              <Papeis r={r} setR={setR} />
            </div>
            <div className="dm-caixa-pe">
              <button type="button" className="dm-btn dm-pri" disabled={indo || !mudouPapel} aria-busy={indo || undefined}
                onClick={() => enviar({ id, papel: r.papel }, 'Papel salvo.')}>Salvar papel</button>
            </div>
          </div>
        </Secao>
      ) : null}
      </div>

      {p ? (
        <aside className="dm-coluna-lado">
          {/* ---------------------------------------------------- atividade */}
          <Secao titulo="Atividade"
            sub={f!.atividade.ultima ? `Última ação: ${carimbo(f!.atividade.ultima)}.` : 'Nenhuma ação registrada ainda.'}>
            {/* quatro zeros de 28px não dizem nada que a frase de cima já não
                diga ("Nenhuma ação registrada ainda") */}
            {f!.atividade.pediu || f!.atividade.com_ela || f!.atividade.concluiu || f!.atividade.acompanha ? (
              <Kpis colunas={2}>
                <Kpi rot="Pediu" valor={f!.atividade.pediu} sub={`${f!.atividade.pediu_abertas} em andamento`} />
                <Kpi rot="Atendendo agora" valor={f!.atividade.com_ela} />
                <Kpi rot="Concluiu" valor={f!.atividade.concluiu} />
                <Kpi rot="Acompanha" valor={f!.atividade.acompanha} />
              </Kpis>
            ) : null}
          </Secao>

          {/* ---------------------------------------------- o que ela pode */}
          <Secao titulo="O que pode">
            <ul className="dm-pode">
              {f!.permissoes.map(k => <li key={k}><Icone nome="check" />{PERMISSOES[k] ?? k}</li>)}
            </ul>
          </Secao>

          {/* ------------------------------------------------ o link pessoal */}
          <Secao titulo="Link pessoal" sub={<>Entra sem senha. Vale como <b>senha</b>: mande só no privado.</>}>
            <div className="dm-linha">
              {linkVisivel && p.token
                ? <Copiar texto={`${base}?t=${p.token}`} rot="Copiar o link" classe="dm-btn" />
                : <button type="button" className="dm-btn" onClick={() => setLinkVisivel(true)}>Ver o link</button>}
              <button type="button" className="dm-btn dm-txt" disabled={indo} onClick={async () => {
                const sim = await confirmar(souEu ? {
                  titulo: 'Trocar o seu link pessoal?',
                  texto: 'O link antigo para de funcionar na hora, em todo aparelho que entrou por ele. Neste aparelho você continua dentro.',
                  acao: 'Trocar',
                } : {
                  titulo: 'Trocar o link pessoal?',
                  texto: 'O link antigo para de funcionar na hora. Use quando ele foi parar onde não devia.',
                  acao: 'Trocar',
                });
                if (!sim) return;
                /* 96 · quem troca o PRÓPRIO link e entrou por ele perderia a
                   sessão na mesma hora (auditoria R15A): o banco devolve o link
                   novo só nesse caso, e esta tela o guarda no lugar do antigo.
                   Quem entrou pelo e-mail continua pelo e-mail. */
                const antes = souEu ? meuToken() : null;
                setIndo(true); setErro(''); setOk('');
                const x = await ajustar('link', { id });
                setIndo(false);
                if (!x.ok) {
                  setErro(recadoDoErro(x, 'trocar o link'));
                  requestAnimationFrame(() => document.querySelector('.dm-aviso.dm-bad')
                    ?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
                  return;
                }
                if (souEu && antes && x.token) guardarToken(x.token);
                setOk('Link trocado. O antigo não entra mais.'); setLinkVisivel(false); await carregar();
              }}>Novo link</button>
            </div>
          </Secao>

          {/* ------------------------------------------------------ situação */}
          <Secao titulo="Situação"
            sub={administra
              ? 'Com acesso. A administração não se desativa.'
              : p.ativo === false
              ? 'Sem acesso: não entra, nem pelo e-mail nem pelo link. As demandas continuam no sistema.'
              : 'Com acesso. Desativar tira o acesso na hora, e as demandas continuam no sistema.'}>
            {administra ? null : p.ativo === false ? (
              <button type="button" className="dm-btn" disabled={indo}
                onClick={() => enviar({ id, ativo: true }, 'O acesso voltou.')}>Reativar</button>
            ) : (
              <button type="button" className="dm-btn dm-perigo" disabled={indo} onClick={async () => {
                const sim = await confirmar({
                  titulo: `Desativar ${p.nome.split(' ')[0]}?`,
                  texto: 'O acesso acaba na hora, pelo e-mail e pelo link. Nada do que foi pedido ou atendido é apagado.',
                  acao: 'Desativar',
                  vermelho: true,
                });
                if (sim) enviar({ id, ativo: false }, 'Acesso desligado.');
              }}>Desativar</button>
            )}
          </Secao>

          {/* ----------------------------------------------------- histórico */}
          <Secao titulo="Histórico do cadastro" n={f!.historico.length}>
            <details className="dm-mais dm-mais-caixa">
              <summary>Ver o histórico</summary>
              <ol className="dm-hist">
                {f!.historico.map((h, i) => (
                  <li key={i}>
                    <div className="dm-q"><b>{fraseDaPessoa(h)}</b></div>
                    <div className="dm-q">{carimbo(h.em)}{h.por ? ` · por ${h.por}` : ''}</div>
                  </li>
                ))}
              </ol>
            </details>
          </Secao>
        </aside>
      ) : <div />}
      </div>
    </div>
  );
}


/* O PAPEL · 96: TRÊS, E SÓ TRÊS.

   A Gestão foi desligada (o banco recusa com SEM_GESTAO) e a administração é
   de uma pessoa só (ADMIN_UNICO): o seletor oferece Membro, Líder e Equipe. */
function Papeis({ r, setR }: { r: Rascunho; setR: React.Dispatch<React.SetStateAction<Rascunho>> }) {
  const explica = PAPEIS.find(x => x.v === r.papel)?.explica;
  return (
    <Bloco rot="Papel" ajuda={explica}>
      <Opcoes rot="Papel" valor={r.papel} opcoes={PAPEIS_QUE_SE_DAO.map(p => ({ v: p.v, rot: p.rot }))}
        aoMudar={v => setR(x => ({ ...x, papel: v }))} />
    </Bloco>
  );
}

function fraseDaPessoa(h: { tipo: string; de: string | null; para: string | null }): string {
  switch (h.tipo) {
    case 'cadastro': return h.para === 'cadastro' ? 'Fez o próprio cadastro' : 'Cadastro feito pela administração';
    case 'papel':    return `Papel: ${rotPapel(h.de)} para ${rotPapel(h.para)}`;
    case 'setor':    return `Setor: ${h.de || 'nenhum'} para ${h.para || 'nenhum'}`;
    case 'ativo':    return h.para === 'false' ? 'Acesso desligado' : 'Acesso religado';
    case 'escopo':   return `Escopo: ${h.para === 'todos' ? 'todos os setores' : h.para === 'escolhidos' ? 'setores escolhidos' : h.para}`;
    case 'pedido':   return h.para ? `Pediu para ser ${rotPapel(h.para)}` : 'Pedido de papel encerrado';
    case 'contato':  return `Mudou ${h.para}`;
    case 'nome':     return `Nome: ${h.de} para ${h.para}`;
    case 'funcao':   return h.para ? `Função: ${h.para}` : 'Tirou a função';
    case 'link':     return 'Link pessoal trocado';
    default:         return h.tipo;
  }
}
