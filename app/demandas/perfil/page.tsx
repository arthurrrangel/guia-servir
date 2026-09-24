'use client';
/* O PERFIL · migração 94.

   Quem sou, o que posso, os meus dados, e sair. A forma é a de uma tela de
   configuração (23/09/2026): cada assunto numa faixa, com o nome e a
   explicação à esquerda e o conteúdo à direita no desktop, empilhados no
   celular. Nada de cartão por assunto.

   A pessoa muda o NOME, o WHATSAPP e a FUNÇÃO. Papel, setor e e-mail não
   se mudam daqui, e a tela diz isso em uma linha em vez de esconder: quem
   procura onde trocar de setor precisa saber com quem falar. Isso não é
   enfeite de interface, é o banco: `dem_perfil` tem a lista de chaves
   FECHADA e recusa a chamada inteira se vier `papel`, `setor_id`, `ativo`
   ou qualquer outra coisa (CAMPO_NAO_PERMITIDO). É o ataque "usuário
   tentando alterar o próprio papel para admin", e a conferência da 94 o
   executa.

   O que a pessoa PODE é pedir outro papel. O pedido fica anotado e quem
   decide é a administração; até lá nada muda. */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Casca, { useEu } from '@/components/demandas/Casca';
import { Aviso, Cabecalho, Campo, Pill } from '@/components/demandas/Ui';
import { Icone } from '@/components/demandas/Icone';
import { esquecerToken, perfil } from '@/lib/demandas/api';
import { PAPEIS, PERMISSOES, dataCheia, iniciais, recadoDoErro, rotPapel, soDigitos, telDoBanco, telVisivel } from '@/lib/demandas/regras';
import { sb } from '@/lib/supabase';
import type { Eu } from '@/lib/demandas/tipos';

export default function Pagina() {
  return <Casca><Perfil /></Casca>;
}


function Perfil() {
  const ctx = useEu();
  const eu = ctx.eu;
  const [nome, setNome] = useState('');
  const [tel, setTel] = useState('');
  const [funcao, setFuncao] = useState('');
  const [indo, setIndo] = useState(false);
  const [msg, setMsg] = useState<{ tom: 'ok' | 'bad'; t: string } | null>(null);

  /* os campos seguem os DADOS, e não o objeto: a casca troca o objeto ao
     voltar para a aba (a conta de avisos), e isto apagava o que a pessoa
     estava digitando (24/09/2026, auditoria R14) */
  useEffect(() => {
    if (!eu) return;
    setNome(eu.nome || ''); setTel(telVisivel(eu.telefone)); setFuncao(eu.funcao || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eu?.nome, eu?.telefone, eu?.funcao]);

  if (!eu) return null;

  async function salvar(d: Parameters<typeof perfil>[0], feito: string) {
    setIndo(true); setMsg(null);
    const r = await perfil(d);
    setIndo(false);
    if (!r.ok) { setMsg({ tom: 'bad', t: recadoDoErro(r, 'salvar') }); return; }
    ctx.ajustarEu?.(r as unknown as Partial<Eu>);
    ctx.toast?.({ texto: feito });
  }

  async function sair() {
    esquecerToken();
    try { await sb()?.auth.signOut(); } catch { /* sem sessão, já está fora */ }
    location.href = '/demandas/entrar';
  }

  const mudou = nome.trim() !== (eu.nome || '') || telDoBanco(tel) !== telDoBanco(eu.telefone)
    || funcao.trim() !== (eu.funcao || '');
  /* o que dá para pedir: o próximo passo do lado de quem pede (líder) e o de
     quem atende (equipe). Gestão e administração não se pedem por aqui: são
     designadas por quem administra. */
  const podePedir = (['lider', 'responsavel'] as const).filter(p => p !== eu.papel)
    .filter(() => eu.papel === 'solicitante' || eu.papel === 'lider' || eu.papel === 'responsavel');

  return (
    <div className="dm-leitura">
      <Cabecalho
        lado={<span className="dm-avatar dm-grande" aria-hidden="true">{iniciais(eu.nome)}</span>}
        sobre="Perfil" titulo={eu.nome}
        meta={<>
          <Pill>{rotPapel(eu.papel)}</Pill>
          {eu.setor ? <span>{eu.setor}</span> : null}
          {eu.criado_em ? <span>desde {dataCheia(eu.criado_em)}</span> : null}
        </>} />
      {msg ? <Aviso tom={msg.tom}>{msg.t}</Aviso> : null}

      <div className="dm-config">
        <section className="dm-config-sec">
          <div className="dm-config-lado">
            <h2>Seus dados</h2>
            <p>É por eles que a equipe encontra e fala com você.</p>
          </div>
          {/* O FORMULÁRIO É UMA CAIXA COM RODAPÉ, como a ficha da pessoa na
              administração: a ação primária no rodapé, à direita, e os campos
              ocupando a caixa (com teto de 440px, a borda dos campos e a do
              botão não batiam). Era um "Salvar" pequeno solto embaixo. */}
          <div className="dm-config-corpo">
            <div className="dm-caixa">
              <div className="dm-caixa-corpo">
                <Campo rot="Nome">
                  <input value={nome} autoComplete="name" onChange={e => setNome(e.target.value)} />
                </Campo>
                <Campo rot="WhatsApp" ajuda="Com DDD. É por ele que a equipe fala com você.">
                  <input type="tel" inputMode="tel" autoComplete="tel" value={tel} onChange={e => setTel(e.target.value)} />
                </Campo>
                <Campo rot="Função" ajuda="O que você faz. Exemplo: baterista, designer, recepção.">
                  <input value={funcao} maxLength={80} onChange={e => setFuncao(e.target.value)} />
                </Campo>
                <div className="dm-pares dm-uma-coluna dm-dado-fixo">
                  <div><span>E-mail</span>{eu.email || 'sem e-mail'}</div>
                </div>
              </div>
              <div className="dm-caixa-pe">
                <span className="dm-cresce dm-peq dm-mudo">Setor, papel e e-mail quem muda é a administração.</span>
                <button type="button" className="dm-btn dm-pri" disabled={indo || !mudou || !nome.trim()} aria-busy={indo || undefined}
                  onClick={() => salvar({ nome: nome.trim(), telefone: soDigitos(tel), funcao: funcao.trim() }, 'Dados salvos.')}>
                  {indo ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="dm-config-sec">
          <div className="dm-config-lado">
            <h2>O que você pode</h2>
            <p>{PAPEIS.find(p => p.v === eu.papel)?.explica}</p>
          </div>
          <div className="dm-config-corpo">
            <ul className="dm-pode">
              {(eu.permissoes || []).map(k => <li key={k}><Icone nome="check" />{PERMISSOES[k] ?? k}</li>)}
            </ul>
            {eu.papel === 'gestor' && !eu.escopo_total && eu.escopo?.length ? (
              <p className="dm-peq dm-mudo dm-depois-da-lista">
                Setores que você acompanha: {eu.escopo.join(', ')}.
              </p>
            ) : null}
          </div>
        </section>

        {eu.papel_pedido ? (
          <section className="dm-config-sec">
            <div className="dm-config-lado">
              <h2>Pedido de papel</h2>
              <p>A administração decide. Até lá, nada muda.</p>
            </div>
            <div className="dm-config-corpo">
              <p className="dm-antes-do-botao">
                Você pediu para atuar como <b>{rotPapel(eu.papel_pedido)}</b>.
              </p>
              <button type="button" className="dm-btn" disabled={indo}
                onClick={() => salvar({ papel_pedido: '' }, 'Pedido cancelado.')}>Cancelar pedido</button>
            </div>
          </section>
        ) : podePedir.length ? (
          <section className="dm-config-sec">
            <div className="dm-config-lado">
              <h2>Pedir outro papel</h2>
              <p>A administração confirma. Até lá, nada muda.</p>
            </div>
            <div className="dm-config-corpo">
              <div className="dm-linha">
                {podePedir.map(p => (
                  <button type="button" key={p} className="dm-btn dm-larga-cel" disabled={indo}
                    onClick={() => salvar({ papel_pedido: p }, 'Pedido enviado para a administração.')}>
                    {/* um verbo, porque o toque já manda o pedido (no cadastro,
                        "Lidero um ministério" é uma OPÇÃO que se marca antes de
                        enviar; aqui é o gesto), e curto para uma linha em 320 */}
                    {p === 'lider' ? 'Pedir para liderar' : 'Pedir para atender'}
                  </button>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {eu.papel === 'admin' ? (
          <section className="dm-config-sec">
            <div className="dm-config-lado">
              <h2>Administração</h2>
              <p>Pessoas, setores, categorias e anexos.</p>
            </div>
            <div className="dm-config-corpo">
              <Link className="dm-btn" href="/demandas/admin"><Icone nome="admin" />Abrir a administração</Link>
            </div>
          </section>
        ) : null}

        <section className="dm-config-sec">
          <div className="dm-config-lado">
            <h2>Sessão</h2>
            <p>Sai deste aparelho. O link pessoal e o e-mail continuam valendo.</p>
          </div>
          <div className="dm-config-corpo">
            <button type="button" className="dm-btn" onClick={sair}><Icone nome="sair" />Sair do sistema</button>
          </div>
        </section>
      </div>
    </div>
  );
}
