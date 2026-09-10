'use client';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
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
  /* só depois de tentar ler o rascunho é que se pode começar a gravar, senão o
     primeiro render (com tudo vazio) apaga o que estava guardado */
  const leuRascunho = useRef(false);

  /* =========================================================================
     O RASCUNHO — 10/09/2026

     A tela de "sem conexão" prometia, com estas palavras, "O que você já
     preencheu continua aqui" (é o texto do Vazio, mais abaixo). Não continuava:
     nada era guardado, e um F5 no meio do wizard zerava os quatro passos. Numa
     igreja, no celular, em pé depois do culto, F5 acontece.

     Guarda por SLUG, porque o rascunho da Mídia não é o do Connect. Apaga no
     envio bem-sucedido — deixar dado de contato parado no aparelho depois que
     ele já cumpriu a função é lixo com nome e telefone dentro, ainda mais em
     celular emprestado. Envelhece em 24h pelo mesmo motivo.
     ========================================================================= */
  const K_RASCUNHO = `guia.cadastro.${slug}`;

  useEffect(() => {
    try {
      const cru = localStorage.getItem(K_RASCUNHO);
      if (cru) {
        const d = JSON.parse(cru);
        if (d && Date.now() - (d.em || 0) < 24 * 60 * 60 * 1000) {
          if (typeof d.nome === 'string') setNome(d.nome);
          if (typeof d.tel === 'string') setTel(d.tel);
          if (typeof d.email === 'string') setEmail(d.email);
          if (Array.isArray(d.escolhidas)) setEscolhidas(d.escolhidas);
          if (d.resp && typeof d.resp === 'object') setResp(d.resp);
          if (typeof d.passo === 'number') setPasso(Math.min(Math.max(d.passo, 0), 3));
        } else {
          localStorage.removeItem(K_RASCUNHO);
        }
      }
    } catch {}
    leuRascunho.current = true;
  }, [K_RASCUNHO]);

  useEffect(() => {
    if (!leuRascunho.current) return;
    try {
      const vazio = !nome && !tel && !email && !escolhidas.length && !Object.keys(resp).length;
      if (vazio) return;
      localStorage.setItem(K_RASCUNHO,
        JSON.stringify({ em: Date.now(), passo, nome, tel, email, escolhidas, resp }));
    } catch {}
  }, [K_RASCUNHO, passo, nome, tel, email, escolhidas, resp]);

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

  /* A ALTURA DO RODAPÉ FIXO, MEDIDA. O `.wiz` precisa reservar embaixo
     exatamente o que o rodapé ocupa, e o rodapé muda de altura conforme a
     frase do que está faltando aparece, some, ou quebra em duas linhas. Um
     número no CSS não acompanha isso: o que estava lá era 104px contra 119
     reais, e a diferença cobria o último campo. O observador devolve a medida
     a cada mudança de tamanho, inclusive quando o teclado do celular muda a
     largura disponível e a frase reflui. */
  const pe = useRef<HTMLDivElement>(null);
  /* `fase` NA LISTA DE DEPENDÊNCIAS NÃO É ZELO, É O QUE FAZ FUNCIONAR. Escrevi
     este efeito com `[]` e ele não mediu nada: enquanto `fase` é 'carregando'
     a função retorna cedo, o rodapé não existe no DOM, e `pe.current` é nulo
     no único momento em que o efeito rodava. A variável ficava vazia e o CSS
     caía no valor de partida — ou seja, o conserto não consertava e a medição
     é que mostrou isso. */
  useEffect(() => {
    const el = pe.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const medir = () => document.documentElement.style
      .setProperty('--wiz-pe', `${Math.ceil(el.getBoundingClientRect().height)}px`);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => { ro.disconnect(); document.documentElement.style.removeProperty('--wiz-pe'); };
  }, [fase]);

  /* E-MAIL PASSA A SER OBRIGATÓRIO. 07/09/2026, a pedido do Arthur.
     Era opcional desde o começo, com o argumento de que o WhatsApp basta para
     a liderança falar com a pessoa. Passa a ser exigido porque o cadastro
     deixou de ser só "como te chamo" e virou a base de quem serve na casa: um
     telefone muda quando a pessoa troca de número e a linha se perde; o e-mail
     é a segunda âncora.

     A validação é a mesma que o banco aplica (`EMAIL_INVALIDO` já existia na
     RPC): pede arroba e um ponto depois dela. Não vale mais que isso — quem
     escreve errado de propósito escreve `a@a.aa` — mas pega o erro real, que é
     digitar o nome sem o domínio. */
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

  const podeAvancar = (() => {
    if (passo === 0) return nome.trim().includes(' ') && soTel(tel).length >= 10 && emailOk;
    if (passo === 1) return escolhidas.length > 0;
    if (passo === 2) return perguntas.every(q => !q.obrigatoria || (resp[q.id] || '').trim() !== '');
    return true;
  })();

  /* BOTÃO CINZA NÃO É RESPOSTA.
     "Continuar" nascia desligado e a tela não dizia por quê. A pessoa escreve
     o primeiro nome, aperta, não acontece nada, aperta de novo, e conclui que
     o site está quebrado — quando faltava o sobrenome. Um botão que não pode
     ser apertado tem a obrigação de dizer o que está faltando, com a mesma
     clareza com que diria "pronto". */
  const oQueFalta = (() => {
    if (podeAvancar) return '';
    if (passo === 0) {
      const faltas = [];
      if (!nome.trim()) faltas.push('seu nome');
      else if (!nome.trim().includes(' ')) faltas.push('seu sobrenome');
      if (soTel(tel).length < 10) faltas.push(soTel(tel).length ? 'o WhatsApp completo, com DDD' : 'seu WhatsApp com DDD');
      /* U+2060 (word joiner) depois do hífen: "e-mail" não quebra em "e-" /
         "mail" no rodapé estreito. Invisível, sem glifo — o hífen que não
         quebra (U+2011) dependeria da fonte licenciada ter o caractere. */
      if (!emailOk) faltas.push(email.trim() ? 'o e-\u2060mail completo' : 'seu e-\u2060mail');
      /* três faltas numa lista com "e" entre todas vira ladainha: "Falta seu
         nome e seu WhatsApp com DDD e seu e-mail". Vírgula nas primeiras, "e"
         só na última, que é como se escreve em português. */
      const lista = faltas.length > 2
        ? `${faltas.slice(0, -1).join(', ')} e ${faltas[faltas.length - 1]}`
        : faltas.join(' e ');
      return 'Falta ' + lista + '.';
    }
    if (passo === 1) return 'Marque pelo menos uma coisa que você quer fazer.';
    if (passo === 2) {
      const n = perguntas.filter(q => q.obrigatoria && (resp[q.id] || '').trim() === '').length;
      return n === 1 ? 'Falta responder uma pergunta marcada com *.'
        : `Faltam responder ${n} perguntas marcadas com *.`;
    }
    return '';
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
    const limpaRascunho = () => { try { localStorage.removeItem(K_RASCUNHO); } catch {} };
    /* MINISTÉRIO SEM PORTÃO — depende da migração 43.
       Hoje `candidatar` não lê `equipes.exige_aprovacao`: toda pessoa que
       chega pelo site vira candidatura pendente, inclusive nas áreas que o
       próprio site anuncia como abertas (Connect, Mídia, Livraria). A migração
       43 conserta isso na origem e faz a função devolver `pendente:false` com
       o token pessoal, igual ao `inscrever`. Este ramo já está aqui para que,
       no instante em que ela rodar, quem se cadastra numa área aberta entre
       direto no seu espaço em vez de esperar numa fila. Enquanto não roda, ele
       simplesmente nunca é escolhido. */
    if (r?.ok && r.pendente === false && r.token) {
      limpaRascunho();
      try { localStorage.setItem('escala.meu-token', r.token); } catch {}
      location.href = `/eu/${r.token}`; return;
    }
    if (r?.ok && r.token) { limpaRascunho(); location.href = `/candidatura/${r.token}`; return; }
    /* JA_CANDIDATOU devolve o token da candidatura que já existe: em vez de um
       erro seco, leva a pessoa para o acompanhamento dela. */
    if (r?.erro === 'JA_CANDIDATOU' && r.token) { limpaRascunho(); location.href = `/candidatura/${r.token}`; return; }
    const m: Record<string, string> = {
      NOME_INCOMPLETO: 'Escreva seu nome e sobrenome.',
      TELEFONE_INVALIDO: 'Confira o WhatsApp, com DDD, só números.',
      EMAIL_INVALIDO: 'Confira o e-\u2060mail, ou deixe em branco.',
      SEM_AREA: 'Escolha pelo menos uma coisa que você quer fazer.',
      JA_NO_TIME: 'Esse WhatsApp já está no time desta área. Abra a sua página pela lista da equipe.',
      MUITOS_CADASTROS: 'Muita gente se cadastrando agora. Tente de novo daqui a pouco.',
    };
    setErro(m[r?.erro] || 'Não consegui enviar. Tente de novo, ou fale com a liderança da área.');
    setOcupado(false);
  }, [ocupado, slug, nome, tel, email, funcoesReais, resp, K_RASCUNHO]);

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
    /* `cad` é só a roupa (05/09/2026): a cabeça centrada, o título na mesma
       letra das outras páginas públicas, a coluna do formulário estreita no
       desktop. Os quatro passos, os campos e o envio são os mesmos. */
    <div className="porta wiz cad">
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
      {/* <main> sem o estilo global de main (largura e padding são do .porta):
          a página não tinha marco principal e o axe acusava em todo passo. */}
      <main style={{ maxWidth: 'none', margin: 0, padding: 0 }}>
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
        {/* `erro`, não `bad`: `.aviso.bad` nunca existiu no CSS, e o único
            aviso de falha do funil saía no cinza de recado. */}
        {erro && <div className="aviso erro" role="alert">{erro}</div>}

        {passo === 0 && (
          <>
            <h2>Quem é você?</h2>
            <p className="dim pequeno">Entra no cadastro da igreja e fica visível para a liderança. Não vai para mais lugar nenhum.</p>
            <label htmlFor="w-nome">Nome completo</label>
            {/* Três campos, três teclados diferentes. Sem type/inputMode o
                celular abre o mesmo teclado de letras nos três e a pessoa
                tem que achar o "123" para digitar o próprio telefone.
                enterKeyHint="next" põe "próximo" na tecla de baixo à
                direita: dá para preencher a ficha inteira sem tirar o
                polegar do teclado. */}
            <input id="w-nome" value={nome} autoComplete="name" placeholder="nome e sobrenome"
              autoCapitalize="words" enterKeyHint="next" maxLength={80}
              onChange={e => setNome(e.target.value)} />
            <label htmlFor="w-tel">WhatsApp com DDD</label>
            <input id="w-tel" value={tel} type="tel" inputMode="tel" autoComplete="tel" placeholder="21999998888"
              enterKeyHint="next"
              onChange={e => setTel(soTel(e.target.value))} />
            <p className="dim peq">É por aqui que a liderança fala com você.</p>
            <label htmlFor="w-mail">E-{"\u2060"}mail</label>
            <input id="w-mail" value={email} type="email" inputMode="email" autoComplete="email" placeholder="seu@email.com"
              autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="done" maxLength={120}
              onChange={e => setEmail(e.target.value)} />
            <p className="dim peq">Fica no cadastro da igreja, junto com o seu nome.</p>
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
                  <input enterKeyHint="done" id={`q-${q.id}`} maxLength={200} value={resp[q.id] || ''}
                    onChange={e => setResp(r => ({ ...r, [q.id]: e.target.value }))} />
                )}
                {q.tipo === 'numero' && (
                  <input enterKeyHint="done" id={`q-${q.id}`} inputMode="numeric" maxLength={6} value={resp[q.id] || ''}
                    onChange={e => setResp(r => ({ ...r, [q.id]: e.target.value.replace(/\D/g, '') }))} />
                )}
                {q.tipo === 'texto_longo' && (
                  <textarea id={`q-${q.id}`} rows={3} maxLength={1000} value={resp[q.id] || ''}
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
              {email && <><dt>E-{"\u2060"}mail</dt><dd>{email}</dd></>}
              <dt>Área</dt><dd>{min!.nome}</dd>
              <dt>Quer fazer</dt><dd>{escolhidas.join(', ')}</dd>
              {/* Fragment, não <span display:contents>: o span não é filho
                  válido de <dl>, e cada <dt> dentro dele virava
                  `first-of-type` do próprio span — a regra que zera a margem
                  do primeiro item zerava a de TODOS os das perguntas, e o
                  resumo perdia o respiro entre uma pergunta e outra. */}
              {perguntas.filter(q => (resp[q.id] || '').trim()).map(q => (
                <Fragment key={q.id}>
                  <dt>{q.texto}</dt><dd>{(resp[q.id] || '').split('|').join(', ')}</dd>
                </Fragment>
              ))}
            </dl>
            {/* A ÚLTIMA TELA ANTES DE APERTAR ERA A MAIS MUDA.
                O aviso do que acontece depois só aparecia para ministério que
                conversa antes; nas outras áreas a pessoa apertava "Enviar meu
                cadastro" sem nenhuma frase por perto dizendo o que ela estava
                acionando. A garantia existia — "nada aqui vira escala sem a
                liderança falar com você" — mas lá no topo da página, três
                rolagens acima, no celular. Garantia que a pessoa não está
                lendo no instante em que decide não é garantia. */}
            {/* Um <p> só dentro do .aviso. A caixa é flex (ícone + texto) e o
                texto solto com <strong> e interpolações virava SEIS colunas:
                "da" numa coluna de 17px, o "não" isolado numa de 27px, 163px
                de altura. Medido pela auditoria de 07/09. */}
            <div className="aviso" style={{ marginTop: 14 }}>
              <p style={{ margin: 0 }}>
                {min!.aberto
                  ? <>Ao enviar, a liderança {min!.artigo === 'a' ? 'da' : 'do'} {min!.nome} recebe
                      seu cadastro e chama você no WhatsApp. Você <strong>não</strong> entra na escala
                      agora: primeiro alguém fala com você. Na tela seguinte abre um link para você
                      acompanhar. Guarde esse link.</>
                  : <>Esta área conversa com cada pessoa antes de escalar. Ao enviar, a liderança
                      recebe seu cadastro e chama você no WhatsApp para essa conversa. Na tela
                      seguinte abre um link para você acompanhar. Guarde esse link.</>}
              </p>
            </div>
          </>
        )}
      </section>
      </main>

      {/* rodapé fixo: no celular o botão não pode sumir atrás do teclado.
          A altura dele é MEDIDA e devolvida ao `.wiz` como `--wiz-pe`, porque o
          104px que estava no CSS venceu quando este rodapé ganhou a frase do
          que está faltando: 119px reais contra 104 reservados, e os 15px de
          diferença cobriam o último campo do passo. Ver a nota no globals. */}
      <div className="wiz-pe" ref={pe}>
        {!!oQueFalta && <span className="wiz-falta" role="status">{oQueFalta}</span>}
        {/* `.btn` vazado, não `.claro`: `.claro` é o nome antigo do botão
            principal e Voltar saía IDÊNTICO a Continuar — dois botões pretos,
            e o de voltar era o maior. */}
        {passo > 0 && (
          <button type="button" className="btn" disabled={ocupado}
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
            {/* "Enviar cadastro": com "meu", o rótulo em caixa alta e entreletra
                quebrava em duas linhas a 390 e 360 e o botão ficava 4px mais
                alto que o Voltar ao lado. O resumo acima já diz de quem é. */}
            {ocupado ? 'enviando…' : 'Enviar cadastro'}
          </button>
        )}
      </div>
    </div>
  );
}

