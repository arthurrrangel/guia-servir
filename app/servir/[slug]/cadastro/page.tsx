'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { sbPublico as sb } from '@/lib/supabase';
import {IcSeta} from '@/components/Icones';
import { Logo } from '@/components/Marca';
import { Tela, Carregando, Vazio } from '@/components/Tela';

/* =============================================================================
   QUERO SERVIR — o wizard  (§5 a §10)

   A regra da §5 é literal: "não apresentar imediatamente um formulário
   gigante". Então são quatro passos, um assunto por tela, e o passo só avança
   quando o que ele pede está preenchido.

   Mobile-first de verdade (§33): a maioria vai abrir isso pelo celular, em pé,
   depois do culto. Alvo de toque grande, uma coluna, o botão de avançar fixo
   no rodapé para não sumir atrás do teclado, e nada que exija duas mãos.

   As perguntas vêm de `perguntas_publicas` — configuráveis por ministério, no
   banco, como a §8 pede. As funções vêm de `equipe_funcoes`, a MESMA RPC que a
   página do ministério usa: o texto que a pessoa leu antes de clicar é o
   mesmo que ela lê aqui.
   ============================================================================= */

type Fn = { nome: string; descricao: string | null; descricao_familia: string | null; tipos: string[] };
type Pergunta = {
  id: string; texto: string; ajuda: string | null;
  tipo: 'texto' | 'texto_longo' | 'escolha' | 'multipla' | 'sim_nao' | 'numero';
  opcoes: string[]; obrigatoria: boolean;
};
type Min = { slug: string; nome: string; convite: string | null; aberto: boolean; artigo: string };

const PASSOS = ['Você', 'Onde servir', 'Perguntas', 'Conferir'];

/* ESTACIONAMENTO 1, 2 e 3 sao POSICOES da escala, nao trabalhos diferentes:
   a descricao das tres e identica. Mostrar as tres para quem esta decidindo
   onde servir e pedir uma escolha que nao existe. Sufixo de ate 2 caracteres
   e posicao: mesma regra ja usada em /equipe e na tela da area. */
const familia = (nome: string) => {
  const p = nome.trim().split(/\s+/);
  const fim = p[p.length - 1];
  return p.length > 1 && fim.length <= 2 ? p.slice(0, -1).join(' ') : nome;
};

export default function Servir() {
  const { slug } = useParams<{ slug: string }>();
  const [min, setMin] = useState<Min | null>(null);
  const [fns, setFns] = useState<Fn[]>([]);
  const [perguntas, setPerguntas] = useState<Pergunta[]>([]);
  const [fase, setFase] = useState<'carregando' | 'ok' | 'erro' | 'rede'>('carregando');

  const [passo, setPasso] = useState(0);
  const [nome, setNome] = useState('');
  const [tel, setTel] = useState('');
  const [email, setEmail] = useState('');
  /* guarda FAMILIAS. Na hora de enviar, cada familia vira todas as posicoes
     dela: quem topa o estacionamento topa qualquer uma das tres vagas. */
  const [escolhidas, setEscolhidas] = useState<string[]>([]);
  const [resp, setResp] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const s = sb(); if (!s) { if (vivo) setFase('rede'); return; }
      const [lista, funcoes, qs] = await Promise.all([
        s.rpc('ministerios_publicos'),
        s.rpc('equipe_funcoes', { p_slug: slug }),
        s.rpc('perguntas_publicas', { p_slug: slug }),
      ]);
      if (!vivo) return;
      if (lista.error || funcoes.error) { setFase('rede'); return; }
      const m = ((lista.data || []) as Min[]).find(x => x.slug === slug);
      if (!m) { setFase('erro'); return; }
      setMin(m); setFns((funcoes.data || []) as Fn[]);
      setPerguntas((qs.data || []) as Pergunta[]);
      try { document.title = `Quero servir · ${m.nome}`; } catch {}
      setFase('ok');
    })();
    return () => { vivo = false; };
  }, [slug]);

  const grupos = (() => {
    const m = new Map<string, { nomes: string[]; texto: string }>();
    for (const f of fns) {
      const fam = familia(f.nome);
      const texto = f.descricao_familia || f.descricao || '';
      const at = m.get(fam);
      if (at) { at.nomes.push(f.nome); if (!at.texto && texto) at.texto = texto; }
      else m.set(fam, { nomes: [f.nome], texto });
    }
    return [...m.entries()];
  })();

  const marcar = (n: string) =>
    setEscolhidas(a => a.includes(n) ? a.filter(x => x !== n) : [...a, n]);

  /* familia escolhida -> todas as posicoes dela vao para o banco */
  const funcoesReais = escolhidas.flatMap(fam =>
    grupos.find(([f]) => f === fam)?.[1].nomes ?? []);

  const marcarMultipla = (id: string, op: string) => {
    const atual = (resp[id] || '').split('|').filter(Boolean);
    const novo = atual.includes(op) ? atual.filter(x => x !== op) : [...atual, op];
    setResp(r => ({ ...r, [id]: novo.join('|') }));
  };

  /* só dígitos, e no máximo 13: o banco recusa acima disso e é melhor a tela
     não deixar a pessoa digitar o que vai ser rejeitado */
  const soTel = (v: string) => v.replace(/\D/g, '').slice(0, 13);

  const podeAvancar = (() => {
    if (passo === 0) return nome.trim().includes(' ') && soTel(tel).length >= 10;
    if (passo === 1) return escolhidas.length > 0;
    if (passo === 2) return perguntas.every(q => !q.obrigatoria || (resp[q.id] || '').trim() !== '');
    return true;
  })();

  const enviar = useCallback(async () => {
    if (ocupado) return;
    setOcupado(true); setErro('');
    const { data, error } = await sb()!.rpc('candidatar', {
      p_slug: slug, p_nome: nome, p_tel: tel, p_email: email,
      p_funcoes: funcoesReais, p_respostas: resp,
    });
    const r = data as any;
    if (error) { setErro('Sem conexão agora. Tente de novo, nada foi perdido.'); setOcupado(false); return; }
    if (r?.ok && r.token) { location.href = `/candidatura/${r.token}`; return; }
    /* JA_CANDIDATOU devolve o token da candidatura que já existe: em vez de um
       erro seco, leva a pessoa para o acompanhamento dela. */
    if (r?.erro === 'JA_CANDIDATOU' && r.token) { location.href = `/candidatura/${r.token}`; return; }
    const m: Record<string, string> = {
      NOME_INCOMPLETO: 'Escreva seu nome e sobrenome.',
      TELEFONE_INVALIDO: 'Confira o WhatsApp, com DDD, só números.',
      EMAIL_INVALIDO: 'Confira o e-mail, ou deixe em branco.',
      SEM_AREA: 'Escolha pelo menos uma coisa que você quer fazer.',
      JA_NO_TIME: 'Esse WhatsApp já está no time desta área. Abra a sua página pela lista da equipe.',
      MUITOS_CADASTROS: 'Muita gente se cadastrando agora. Tente de novo daqui a pouco.',
    };
    setErro(m[r?.erro] || 'Não consegui enviar. Tente de novo, ou fale com a liderança da área.');
    setOcupado(false);
  }, [ocupado, slug, nome, tel, email, funcoesReais, resp]);

  if (fase !== 'ok') return (
    <Tela volta="/servir" voltaRot="Áreas">
      <main className="tela-corpo">
        {fase === 'carregando'
          ? <Carregando o="Preparando o cadastro" />
          : <Vazio
              titulo={fase === 'erro' ? 'Área não encontrada' : 'Sem conexão agora'}
              texto={fase === 'erro'
                ? 'O link pode estar errado. Volte e escolha uma das áreas.'
                : 'Atualize a página. O que você já preencheu continua aqui.'}
              acao={{ href: '/servir', rot: 'Ver as áreas' }} />}
      </main>
    </Tela>
  );

  return (
    <div className="porta wiz">
      <header className="tela-topo">
        <Link href="/" className="marca-link" aria-label="GUIA Church">
          <Logo className="logo" />
        </Link>
        {/* a saída é a área de onde a pessoa veio, não a home: sair no meio do
            cadastro e cair na primeira tela do site é perder o contexto todo */}
        <Link href={`/servir/${slug}`} className="tela-volta"><IcSeta />{min!.nome}</Link>
      </header>

      {/* A TELA PRECISA TER TÍTULO.
          A auditoria pegou esta tela sem nenhum h1: o formulário abria direto
          no h2 da primeira pergunta. Quem chega aqui por um link direto não
          tinha como saber de que área é o cadastro, e leitor de tela começava
          a página no meio da hierarquia. O h1 é fixo nas quatro etapas; quem
          muda é o h2 de cada passo. */}
      <div className="wiz-cabeca">
        <nav className="migalha" aria-label="Onde você está">
          <Link href="/servir">Servir</Link>
          <span aria-hidden="true">›</span>
          <Link href={`/servir/${slug}`}>{min!.nome}</Link>
          <span aria-hidden="true">›</span>
          <b aria-current="page">Cadastro</b>
        </nav>
        <h1>Cadastro {min!.artigo === 'a' ? 'na' : 'no'} {min!.nome}</h1>
        <p className="wiz-cabeca-sub">
          Quatro passos rápidos. Nada aqui vira escala sem a liderança falar com você.
        </p>
      </div>

      {/* onde estou: a §26 quer que ninguém nunca fique sem saber */}
      <ol className="wiz-passos" aria-label="Etapas do cadastro">
        {PASSOS.map((p, i) => (
          <li key={p} className={i === passo ? 'agora' : i < passo ? 'feito' : ''}>
            <span className="wiz-bola">{i < passo ? '✓' : i + 1}</span>
            <span className="wiz-rot">{p}</span>
          </li>
        ))}
      </ol>

      <section className="wiz-corpo">
        {erro && <div className="aviso bad" role="alert">{erro}</div>}

        {passo === 0 && (
          <>
            <h2>Quem é você?</h2>
            <p className="dim pequeno">Só o essencial. Nada disso vai para lugar nenhum além da liderança da área.</p>
            <label htmlFor="w-nome">Nome completo</label>
            <input id="w-nome" value={nome} autoComplete="name" placeholder="nome e sobrenome"
              onChange={e => setNome(e.target.value)} />
            <label htmlFor="w-tel">WhatsApp com DDD</label>
            <input id="w-tel" value={tel} inputMode="tel" autoComplete="tel" placeholder="21999998888"
              onChange={e => setTel(soTel(e.target.value))} />
            <p className="dim peq">É por aqui que a liderança fala com você.</p>
            <label htmlFor="w-mail">E-mail <span className="dim">(opcional)</span></label>
            <input id="w-mail" value={email} inputMode="email" autoComplete="email" placeholder="seu@email.com"
              onChange={e => setEmail(e.target.value)} />
          </>
        )}

        {passo === 1 && (
          <>
            <h2>O que combina com você?</h2>
            <p className="dim pequeno">
              Pode marcar mais de uma. E pode marcar algo que você ainda não sabe fazer, 
              tem gente para ensinar.
            </p>
            <div className="wiz-opcoes">
              {grupos.map(([fam, g]) => {
                const on = escolhidas.includes(fam);
                return (
                  <button key={fam} type="button" className={`wiz-op ${on ? 'on' : ''}`}
                    aria-pressed={on} onClick={() => marcar(fam)}>
                    <span className="wiz-op-marca" aria-hidden="true">{on ? '✓' : ''}</span>
                    <span className="cresce">
                      <span className="wiz-op-nome">
                        {fam}
                        {g.nomes.length > 1 &&
                          <span className="peq mudo-pill" style={{ marginLeft: 8, fontWeight: 400 }}>
                            {g.nomes.length} posições
                          </span>}
                      </span>
                      {g.texto && <span className="wiz-op-desc">{g.texto}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {passo === 2 && (
          <>
            <h2>Só mais algumas coisas</h2>
            <p className="dim pequeno">Ajuda a liderança a te encaixar no lugar certo.</p>
            {perguntas.length === 0 && <p className="dim">Esta área não tem perguntas. Pode seguir.</p>}
            {perguntas.map(q => (
              <div key={q.id} className="wiz-q">
                <label htmlFor={`q-${q.id}`}>
                  {q.texto}{q.obrigatoria && <span className="wiz-obr" aria-label="obrigatória"> *</span>}
                </label>
                {q.ajuda && <p className="dim peq" style={{ margin: '2px 0 8px' }}>{q.ajuda}</p>}

                {q.tipo === 'texto' && (
                  <input id={`q-${q.id}`} value={resp[q.id] || ''}
                    onChange={e => setResp(r => ({ ...r, [q.id]: e.target.value }))} />
                )}
                {q.tipo === 'numero' && (
                  <input id={`q-${q.id}`} inputMode="numeric" value={resp[q.id] || ''}
                    onChange={e => setResp(r => ({ ...r, [q.id]: e.target.value.replace(/\D/g, '') }))} />
                )}
                {q.tipo === 'texto_longo' && (
                  <textarea id={`q-${q.id}`} rows={3} value={resp[q.id] || ''}
                    onChange={e => setResp(r => ({ ...r, [q.id]: e.target.value }))} />
                )}
                {q.tipo === 'sim_nao' && (
                  <div className="wiz-chips">
                    {['Sim', 'Não'].map(o => (
                      <button key={o} type="button"
                        className={`wiz-chip ${resp[q.id] === o ? 'on' : ''}`}
                        aria-pressed={resp[q.id] === o}
                        onClick={() => setResp(r => ({ ...r, [q.id]: o }))}>{o}</button>
                    ))}
                  </div>
                )}
                {q.tipo === 'escolha' && (
                  <div className="wiz-chips">
                    {q.opcoes.map(o => (
                      <button key={o} type="button"
                        className={`wiz-chip ${resp[q.id] === o ? 'on' : ''}`}
                        aria-pressed={resp[q.id] === o}
                        onClick={() => setResp(r => ({ ...r, [q.id]: o }))}>{o}</button>
                    ))}
                  </div>
                )}
                {q.tipo === 'multipla' && (
                  <div className="wiz-chips">
                    {q.opcoes.map(o => {
                      const on = (resp[q.id] || '').split('|').includes(o);
                      return (
                        <button key={o} type="button" className={`wiz-chip ${on ? 'on' : ''}`}
                          aria-pressed={on} onClick={() => marcarMultipla(q.id, o)}>{o}</button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {passo === 3 && (
          <>
            <h2>Confira antes de enviar</h2>
            <dl className="wiz-resumo">
              <dt>Nome</dt><dd>{nome}</dd>
              <dt>WhatsApp</dt><dd>{tel}</dd>
              {email && <><dt>E-mail</dt><dd>{email}</dd></>}
              <dt>Área</dt><dd>{min!.nome}</dd>
              <dt>Quer fazer</dt><dd>{escolhidas.join(', ')}</dd>
              {perguntas.filter(q => (resp[q.id] || '').trim()).map(q => (
                <span key={q.id} style={{ display: 'contents' }}>
                  <dt>{q.texto}</dt><dd>{(resp[q.id] || '').split('|').join(', ')}</dd>
                </span>
              ))}
            </dl>
            {!min!.aberto && (
              <div className="aviso" style={{ marginTop: 14 }}>
                Esta área conversa com cada pessoa antes de escalar. Você envia agora e a
                liderança fala com você.
              </div>
            )}
          </>
        )}
      </section>

      {/* rodapé fixo: no celular o botão não pode sumir atrás do teclado */}
      <div className="wiz-pe">
        {passo > 0 && (
          <button type="button" className="btn claro" disabled={ocupado}
            onClick={() => { setPasso(p => p - 1); setErro(''); window.scrollTo(0, 0); }}>
            Voltar
          </button>
        )}
        {passo < 3 ? (
          <button type="button" className="btn pri cresce" disabled={!podeAvancar}
            onClick={() => { setPasso(p => p + 1); setErro(''); window.scrollTo(0, 0); }}>
            Continuar <IcSeta />
          </button>
        ) : (
          <button type="button" className="btn pri cresce" disabled={ocupado} onClick={enviar}>
            {ocupado ? 'enviando…' : 'Enviar meu cadastro'}
          </button>
        )}
      </div>
    </div>
  );
}

