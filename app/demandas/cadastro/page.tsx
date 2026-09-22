'use client';
/* O CADASTRO · migração 94.

   "Onde os profissionais e membros dos ministérios se cadastram para
   utilizar o sistema?" Aqui, e é o mesmo lugar para todo mundo.

   O CAMINHO, EM TRÊS PASSOS

     1. o e-mail: mandamos um link. Tocar nele prova que o e-mail é da
        pessoa (é o Supabase que confirma, e a sessão só abre depois disso);
     2. nome, WhatsApp, setor e função;
     3. pronto: a pessoa cai no Início, já podendo abrir demanda.

   O link do e-mail volta por `/demandas/entrar?volta=/demandas/cadastro`, e
   não direto para cá: a porta de entrada já sabe abrir a sessão, tratar o
   link vencido e não mandar ninguém para as Escalas (`destino()`, provado
   por `demandas-porta-propria.test.mjs` com 24 cargas de ataque). Uma
   segunda cópia disso aqui seria uma segunda chance de errar.

   QUEM SE CADASTRA NASCE MEMBRO, SEMPRE. Dizer "sou líder" ou "atendo
   demandas" vira um PEDIDO, que a administração decide. Não há campo de
   papel neste formulário, e o banco recusaria se houvesse: `dem_cadastrar`
   tem a lista de chaves fechada e grava `solicitante` por conta própria.

   O SETOR É ESCOLHIDO PELA PESSOA, E ISSO NÃO ABRE NADA. Depois da 94,
   setor sem papel não é credencial: quem escolhe "Administrativo e
   financeiro" vê exatamente o que veria escolhendo "Kids", que é o que ela
   mesma pedir. */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { sb } from '@/lib/supabase';
import { cadastrar, cadastro } from '@/lib/demandas/api';
import { Aviso, Bloco, Campo, Opcoes } from '@/components/demandas/Ui';
import { recadoDoErro, soDigitos } from '@/lib/demandas/regras';
import { aviseHumano } from '@/lib/erros';
import { sugerirEmail } from '@/lib/email';
import type { Cadastro as Situacao } from '@/lib/demandas/tipos';

type Passo = 'carregando' | 'email' | 'dados' | 'ja' | 'inativo' | 'erro';

export default function Cadastro() {
  const [passo, setPasso] = useState<Passo>('carregando');
  const [info, setInfo] = useState<Extract<Situacao, { situacao: 'novo' }> | null>(null);
  const [primeiro, setPrimeiro] = useState('');
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [nome, setNome] = useState('');
  const [tel, setTel] = useState('');
  const [setor, setSetor] = useState('');
  const [funcao, setFuncao] = useState('');
  const [pedido, setPedido] = useState<'' | 'lider' | 'responsavel'>('');
  const [indo, setIndo] = useState(false);
  const [msg, setMsg] = useState<{ tom: 'ok' | 'bad' | 'warn'; t: string } | null>(null);

  useEffect(() => {
    const c = sb();
    if (!c) { setPasso('erro'); setMsg({ tom: 'bad', t: 'Este ambiente está sem configuração de acesso.' }); return; }
    c.auth.getSession().then(async ({ data }) => {
      if (!data.session) { setPasso('email'); return; }
      const r = await cadastro();
      if (!r.ok) { setPasso('erro'); setMsg({ tom: 'bad', t: recadoDoErro(r, 'abrir o cadastro') }); return; }
      const s = r as unknown as Situacao;
      if (s.situacao === 'novo') { setInfo(s); setPasso('dados'); return; }
      if (s.situacao === 'ativo') { setPrimeiro(s.primeiro_nome); setPasso('ja'); return; }
      if (s.situacao === 'inativo') { setPasso('inativo'); return; }
      setPasso('email');
    }).catch(() => { setPasso('erro'); setMsg({ tom: 'bad', t: 'Não consegui falar com o servidor. Confira a internet.' }); });
  }, []);

  async function pedirLink(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    const sug = sugerirEmail(email);
    const alvo = sug || email.trim();
    if (sug) setEmail(sug);
    setIndo(true);
    const { error } = await sb()!.auth.signInWithOtp({
      email: alvo,
      options: { emailRedirectTo: window.location.origin + '/demandas/entrar?volta=' + encodeURIComponent('/demandas/cadastro') },
    });
    setIndo(false);
    if (error) { setMsg({ tom: 'bad', t: aviseHumano(error, 'enviar o link') }); return; }
    setEnviado(true);
    setMsg({ tom: 'ok', t: `${sug ? `Corrigi o endereço para ${sug}. ` : ''}Abra seu e-mail (olhe também o spam) e toque no link. Ele traz você de volta para cá.` });
  }

  async function concluir(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    setIndo(true);
    const r = await cadastrar({
      nome: nome.trim(), telefone: soDigitos(tel), setor_id: setor,
      funcao: funcao.trim() || undefined, papel_pedido: pedido || undefined,
    });
    setIndo(false);
    if (!r.ok) {
      if (r.erro === 'JA_CADASTRADO') { setPasso('ja'); return; }
      setMsg({ tom: 'bad', t: recadoDoErro(r, 'concluir o cadastro') });
      return;
    }
    location.href = '/demandas?bemvindo=1';
  }

  const falta = [!nome.trim() && 'nome', soDigitos(tel).length < 10 && 'WhatsApp', !setor && 'setor'].filter(Boolean) as string[];
  const ministerios = (info?.setores || []).filter(s => !s.atende);
  const equipes = (info?.setores || []).filter(s => s.atende);

  return (
    <div className="dm">
      <header className="dm-topo">
        <div className="dm-topo-in">
          <Link href="/demandas" className="dm-logo">GUI{'>'}</Link>
          <div className="dm-onde dm-cresce dm-corta">Demandas</div>
        </div>
      </header>
      <div className="dm-corpo" style={{ maxWidth: 520 }}>
        <div className="dm-rot">{'>'} cadastro</div>

        {passo === 'carregando' ? (
          <h1 style={{ margin: '6px 0 var(--dm-e2)' }}>Um instante…</h1>
        ) : passo === 'email' ? (
          <>
            <h1 style={{ margin: '6px 0 var(--dm-e2)' }}>Cadastro</h1>
            <p className="dm-peq dm-mudo" style={{ marginBottom: 'var(--dm-e3)' }}>
              Primeiro, o seu e-mail. Mandamos um link para confirmar que ele é seu.
            </p>
            {msg ? <Aviso tom={msg.tom}>{msg.t}</Aviso> : null}
            <form onSubmit={pedirLink} className="dm-card">
              <Campo rot="Seu e-mail">
                <input type="email" inputMode="email" autoComplete="email" required
                  value={email} onChange={e => setEmail(e.target.value)} />
              </Campo>
              <button className="dm-btn dm-pri dm-larga" disabled={indo}>
                {indo ? 'Enviando…' : enviado ? 'Mandar de novo' : 'Receber o link'}
              </button>
            </form>
            <p className="dm-peq dm-mudo">
              Já tem cadastro? <Link href="/demandas/entrar">Entrar</Link>
            </p>
          </>
        ) : passo === 'dados' && info ? (
          <>
            <h1 style={{ margin: '6px 0 var(--dm-e2)' }}>Seu cadastro</h1>
            <p className="dm-peq dm-mudo" style={{ marginBottom: 'var(--dm-e3)' }}>
              Você entrou como <b>{info.email}</b>. Falta pouco.
            </p>
            {msg ? <Aviso tom={msg.tom}>{msg.t}</Aviso> : null}
            <form onSubmit={concluir} className="dm-card">
              <Campo rot="Nome completo">
                <input autoComplete="name" required value={nome} onChange={e => setNome(e.target.value)} />
              </Campo>
              <Campo rot="WhatsApp" ajuda="Com DDD. É por ele que a equipe fala com você.">
                <input inputMode="tel" autoComplete="tel" required value={tel} onChange={e => setTel(e.target.value)} />
              </Campo>
              <Campo rot="Setor" ajuda="O ministério ou a área onde você serve.">
                <select required value={setor} onChange={e => setSetor(e.target.value)}>
                  <option value="">Escolha</option>
                  {ministerios.length ? (
                    <optgroup label="Ministérios e áreas">
                      {ministerios.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                    </optgroup>
                  ) : null}
                  {equipes.length ? (
                    <optgroup label="Equipes que atendem demandas">
                      {equipes.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                    </optgroup>
                  ) : null}
                </select>
              </Campo>
              <Campo rot="Função (opcional)" ajuda="O que você faz. Exemplo: baterista, designer, recepção.">
                <input maxLength={80} value={funcao} onChange={e => setFuncao(e.target.value)} />
              </Campo>
              <Bloco rot="Você também…"
                ajuda={pedido
                  ? 'A administração confirma. Até lá, você já pode abrir demandas.'
                  : 'Quem só pede demandas não precisa marcar nada.'}>
                <Opcoes rot="Você também" valor={pedido} empilhadas
                  opcoes={[{ v: '', rot: 'Só vou pedir' }, { v: 'lider', rot: 'Lidero um ministério' },
                           { v: 'responsavel', rot: 'Atendo demandas' }]}
                  aoMudar={v => setPedido(v)} />
              </Bloco>
              <button className="dm-btn dm-pri dm-larga" disabled={indo || falta.length > 0}>
                {indo ? 'Salvando…' : 'Concluir cadastro'}
              </button>
              {falta.length ? (
                <p className="dm-peq dm-mudo" style={{ marginTop: 'var(--dm-e1)' }}>Falta: {falta.join(', ')}.</p>
              ) : null}
            </form>
          </>
        ) : passo === 'ja' ? (
          <>
            <h1 style={{ margin: '6px 0 var(--dm-e2)' }}>{primeiro ? `${primeiro}, você já tem cadastro.` : 'Você já tem cadastro.'}</h1>
            <Link className="dm-btn dm-pri dm-larga" href="/demandas">Ir para as minhas demandas</Link>
          </>
        ) : passo === 'inativo' ? (
          <>
            <h1 style={{ margin: '6px 0 var(--dm-e2)' }}>Este cadastro está desativado.</h1>
            <p className="dm-peq dm-mudo">Fale com quem administra as demandas para reativar.</p>
          </>
        ) : (
          <>
            <h1 style={{ margin: '6px 0 var(--dm-e2)' }}>Não deu para abrir o cadastro.</h1>
            {msg ? <Aviso tom={msg.tom}>{msg.t}</Aviso> : null}
            <button className="dm-btn" onClick={() => location.reload()}>Tentar de novo</button>
          </>
        )}
      </div>
      <footer className="dm-rodape">
        <div className="dm-peq dm-mudo">GUIA Church</div>
      </footer>
    </div>
  );
}
