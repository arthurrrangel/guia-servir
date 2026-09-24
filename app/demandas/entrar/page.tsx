'use client';
/* A PORTA DO SISTEMA DE DEMANDAS — 22/09/2026.

   POR QUE ESTA TELA EXISTE, NAS PALAVRAS DE QUEM PEDIU

     "Eu to entrando no sistema de demandas e ta direcionando pro painel das
      escalas, lembre se o sistema de demanda nao tem nada ver com o sistema
      de escalas."

     "SISTEMA DE DEMANDA TEM QUE SER UM SISTEMA TOTALMENTE DESCONECTADO COM
      SISTEMA DE ESCALAS."

     "nesse entrar eu entro diretamente pro sistema de escalas cara"

   E O QUE EU TINHA FEITO ATE AQUI, QUE ERA MEIO CONSERTO

   A migracao 82d trocou tres `location.href = '/painel'` escritos a mao por
   `destinoDoLogin()`, que le `?volta=`. O botao "Entrar" da casca de demandas
   passou a apontar para `/entrar?volta=%2Fdemandas`, e o login passou a
   devolver a pessoa para ca. Medi em producao, agora: funciona.

   E NAO RESOLVE O PROBLEMA DELE. Porque `/entrar` E A TELA DO OUTRO SISTEMA:

     ESPAÇO DO ORGANIZADOR
     Entrar
     Voluntário não entra por aqui: ele usa o link pessoal que você manda.

   Quem clica em "Entre para ver as demandas" e cai nisso ja entrou no sistema
   de escalas, mesmo que dois segundos depois seja devolvido. Ele reclamou
   disso o dia inteiro e eu fiquei consertando o DESTINO do login em vez da
   PORTA. "Consertei o redirecionamento" nao e "consertei o que ele viu".

   O QUE ESTA TELA NAO FAZ, E ESSA E A DEFINICAO DELA

     · nao manda ninguem para o painel do outro sistema, em nenhum caminho,
       nem por engano. Isso nao se afirma num comentario: quem prova e
       `scripts/demandas-porta-propria.test.mjs`, que le ESTE arquivo, tira
       os comentarios, e reprova se sobrar a rota do outro sistema no codigo.
       (Ela aparece aqui em cima, na prosa, porque e o defeito que esta tela
       existe para matar — e por isso o teste ignora comentario.);
     · nao fala em escala, ministerio, voluntario, equipe nem organizador;
     · nao importa nada de `components/Shell`, `components/Marca` nem de
       `app/entrar`: ela usa as pecas de `components/demandas/`, que e o que
       `scripts/demandas-css.test.mjs` e `demandas-vazamento.mjs` vigiam.

   O QUE ELA COMPARTILHA, DE PROPOSITO

   O cliente Supabase e a conta de autenticacao. Isso NAO e o acoplamento que
   ele proibiu: e o mesmo Postgres, e a pessoa tem um email so. O que ele
   proibiu e um sistema aparecer dentro do outro, e isso acaba aqui.

   A TERCEIRA PORTA, QUE E A MELHOR E QUASE NINGUEM USA

   Quem recebe o link pessoal pelo WhatsApp (`/demandas?t=...`) nao precisa de
   nada disto. A tela diz isso em primeiro lugar, porque e o caminho mais
   curto e o unico que funciona para quem nao tem email cadastrado. */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { sb } from '@/lib/supabase';
import { Aviso, Campo } from '@/components/demandas/Ui';
import { Porta } from '@/components/demandas/Porta';
import { Icone } from '@/components/demandas/Icone';
import { aviseHumano as aviseHumanoCru } from '@/lib/erros';
import { sugerirEmail } from '@/lib/email';
import { semTravessao } from '@/lib/demandas/regras';

/* as frases de `lib/erros.ts` são das duas casas; aqui saem sem travessão */
const aviseHumano = (e: unknown, oQueFazia?: string) => semTravessao(aviseHumanoCru(e, oQueFazia));

/* PARA ONDE ESTA PORTA DEVOLVE

   `/demandas`, e so. O parametro existe para quem chegou de uma ficha
   especifica voltar para ELA depois do login.

   A PRIMEIRA VERSAO JULGAVA A STRING CRUA, E ERA FURADA — 22/09/2026, noite.

   Ela fazia `v.startsWith('/demandas')` e devolvia `v` inteiro. A quarta
   auditoria mediu num navegador de verdade o que acontece com

       /demandas/entrar?volta=%2Fdemandas%2F..%2Fpainel

   `destino()` aprovava (comeca com `/demandas`), `location.href` recebia a
   string, e o NAVEGADOR normalizava `..` antes de navegar: a pessoa caia em
   `/painel`, que e a tela do outro sistema. Exatamente o defeito que esta tela
   existe para matar, refeito por dentro. Tab e quebra de linha no meio
   (`/demandas\t/../painel`) tambem passavam, porque o algoritmo WHATWG remove
   esses caracteres ANTES de normalizar — entao nem filtrar `..` resolveria.

   A REGRA AGORA: normalizar primeiro, julgar depois. `new URL(v, origem)` faz
   exatamente o que o navegador vai fazer, e o que sobra e o caminho de
   verdade. Se a origem mudou, nao e nosso. Se o caminho nao e `/demandas` nem
   comeca com `/demandas/`, nao e nosso. E o que volta e o caminho JA
   normalizado, nao a string que a pessoa mandou.

   Quem prova isto nao e este comentario: `scripts/demandas-porta-propria.test.mjs`
   ARRANCA esta funcao do arquivo e a EXECUTA com as cargas de ataque. A versao
   anterior do teste procurava a grafia `startsWith('/demandas')` no arquivo, e
   por isso ficou verde com o furo aberto por dois dias. */
const CASA = '/demandas';

function destino(): string {
  if (typeof window === 'undefined') return CASA;
  try {
    const v = new URL(window.location.href).searchParams.get('volta') || '';
    if (!v) return CASA;
    const u = new URL(v, window.location.origin);
    if (u.origin !== window.location.origin) return CASA;
    if (u.pathname !== CASA && !u.pathname.startsWith(CASA + '/')) return CASA;
    return u.pathname + u.search + u.hash;
  } catch { return CASA; }
}

/* o `?volta=` que viaja no link do email, para o link tambem voltar para ca */
function voltaNaUrl(): string {
  const d = destino();
  return d === CASA ? '' : '?volta=' + encodeURIComponent(d);
}

export default function EntrarNasDemandas() {
  const [modo, setModo] = useState<'link' | 'senha' | 'criar'>('link');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [recuperando, setRecuperando] = useState(false);
  const [entrando, setEntrando] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [msg, setMsg] = useState('');
  /* o tom vem junto com a mensagem, e nao deduzido do texto dela: a outra
     porta ja passou por isso, e um login recusado aparecia com o visto verde */
  const [tom, setTom] = useState<'bad' | 'ok' | 'warn'>('ok');

  useEffect(() => {
    /* o fragmento e lido ANTES de o cliente existir: o supabase-js consome o
       `#access_token` na inicializacao e limpa a URL, e depois disso nao da
       mais para saber se a pessoa chegou por link nem por que ele falhou */
    const frag = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const temToken = !!frag.get('access_token');
    const erroLink = frag.get('error_code') || frag.get('error');
    const eRecuperacao = temToken && frag.get('type') === 'recovery';
    if (temToken) setEntrando(true);

    /* "entrando..." nao pode ser um estado do qual nao se sai */
    const teto = temToken ? window.setTimeout(() => {
      setEntrando(false); setTom('bad');
      setMsg('Demorou demais para abrir a sessão. Confira a internet e peça um link novo aqui embaixo.');
    }, 12000) : 0;

    const s = sb();
    if (!s) {
      setTom('bad');
      setMsg('Este ambiente está sem configuração de acesso. Quem administra o sistema resolve isso.');
      return;
    }
    s.auth.getSession()
      .then(({ data }) => {
        clearTimeout(teto);
        if (data.session && eRecuperacao) { setEntrando(false); setRecuperando(true); return; }
        if (data.session) { location.href = destino(); return; }
        if (temToken) {
          setEntrando(false); setTom('bad');
          setMsg('O link abriu mas a sessão não ficou de pé. Peça um link novo aqui embaixo.');
          return;
        }
        if (erroLink) {
          setTom('warn');
          setMsg(/expired|invalid/i.test(erroLink)
            ? 'Esse link já venceu ou já foi usado. Peça um novo aqui embaixo.'
            : 'Não consegui entrar por esse link. Peça um novo aqui embaixo.');
          return;
        }
        /* O LINK PESSOAL RECUSADO — 24/09/2026 (auditoria R14). Quem abria
           um link trocado caía aqui lendo "entre pelo link", que era o que
           acabara de fazer. A casca deixa a marca ao descartar o link. */
        try {
          const marca = Number(sessionStorage.getItem('demandas.linkRecusado') || 0);
          sessionStorage.removeItem('demandas.linkRecusado');
          /* só a marca de agora: a de uma hora atrás é de outra história */
          if (marca && Date.now() - marca < 60000) {
            setTom('warn');
            setMsg('Esse link pessoal não vale mais: foi trocado ou chegou incompleto. Entre com o seu e-mail aqui embaixo, ou peça um link novo a quem administra as demandas.');
          }
        } catch { /* sem armazenamento: fica a porta de sempre */ }
      })
      .catch(() => { clearTimeout(teto); setEntrando(false); });
  }, []);

  async function porLink(e: React.FormEvent) {
    e.preventDefault(); setMsg('');
    const sug = sugerirEmail(email);
    const alvo = sug || email.trim();
    if (sug) setEmail(sug);
    setCarregando(true);
    /* o link volta para ESTA tela, e nao para a outra porta */
    const { error } = await sb()!.auth.signInWithOtp({
      email: alvo,
      options: { emailRedirectTo: window.location.origin + '/demandas/entrar' + voltaNaUrl() },
    });
    setCarregando(false);
    setTom(error ? 'bad' : 'ok');
    setMsg(error ? aviseHumano(error, 'enviar o link')
      : `${sug ? `Corrigi o endereço para ${sug} e mandei o link. ` : 'Pronto. '}`
        + 'Abra seu email (olhe também o spam ou "Outros") e toque no link. '
        + 'Ele vale por uma hora e serve uma vez só.');
  }

  async function porSenha(e: React.FormEvent) {
    e.preventDefault(); setCarregando(true); setMsg('');
    const { error } = await sb()!.auth.signInWithPassword({ email: email.trim(), password: senha });
    setCarregando(false);
    if (error) { setTom('bad'); setMsg(aviseHumano(error, 'entrar')); return; }
    location.href = destino();
  }

  async function porCriar(e: React.FormEvent) {
    e.preventDefault(); setMsg('');
    const sug = sugerirEmail(email);
    const alvo = sug || email.trim();
    if (sug) setEmail(sug);
    setCarregando(true);
    const { error } = await sb()!.auth.resetPasswordForEmail(alvo, {
      redirectTo: window.location.origin + '/demandas/entrar' + voltaNaUrl(),
    });
    setCarregando(false);
    setTom(error ? 'bad' : 'ok');
    setMsg(error ? aviseHumano(error, 'enviar o link')
      : `${sug ? `Corrigi o endereço para ${sug} e mandei o link. ` : 'Pronto. '}`
        + 'Abra seu email e toque no link: você volta para esta tela para escolher a senha.');
  }

  async function definirSenha(e: React.FormEvent) {
    e.preventDefault(); setMsg('');
    if (novaSenha.length < 8) {
      setTom('warn'); setMsg('A senha precisa ter pelo menos 8 caracteres.'); return;
    }
    setCarregando(true);
    const { error } = await sb()!.auth.updateUser({ password: novaSenha });
    setCarregando(false);
    if (error) { setTom('bad'); setMsg(aviseHumano(error, 'salvar a senha')); return; }
    location.href = destino();
  }

  /* --------------------------------------------------------- a moldura */
  const moldura = (titulo: string, sub: React.ReactNode, corpo: React.ReactNode) => (
    <Porta>
      <h1>{titulo}</h1>
      <p className="dm-auth-sub">{sub}</p>
      {msg ? <Aviso tom={tom}>{msg}</Aviso> : null}
      {corpo}
    </Porta>
  );

  if (entrando) {
    return moldura('Entrando…', 'Abrindo a sua sessão. Leva um instante.', null);
  }

  if (recuperando) {
    return moldura(
      'Escolha sua senha',
      'Depois disto você entra direto, sem esperar e-mail.',
      <form onSubmit={definirSenha} className="dm-auth-form">
        <Campo rot="Senha nova" ajuda="Pelo menos 8 caracteres.">
          <input type="password" autoComplete="new-password" value={novaSenha}
            onChange={e => setNovaSenha(e.target.value)} />
        </Campo>
        <button className="dm-btn dm-pri dm-larga" disabled={carregando}>
          {carregando ? 'Salvando…' : 'Salvar e entrar'}
        </button>
      </form>,
    );
  }

  return moldura(
    'Entrar nas demandas',
    <>
      Recebeu um <b>link pessoal</b> pelo WhatsApp? Abra por ele, sem senha: é o caminho mais curto.
    </>,
    <>
      {modo === 'link' ? (
        <form onSubmit={porLink} className="dm-auth-form">
          <Campo rot="Seu e-mail" ajuda="Mandamos um link que entra sem senha.">
            <input type="email" inputMode="email" autoComplete="email" required
              value={email} onChange={e => setEmail(e.target.value)} />
          </Campo>
          <button className="dm-btn dm-pri dm-larga" disabled={carregando}>
            {carregando ? 'Enviando…' : 'Receber link de acesso'}
          </button>
        </form>
      ) : modo === 'senha' ? (
        <form onSubmit={porSenha} className="dm-auth-form">
          <Campo rot="Seu e-mail">
            <input type="email" inputMode="email" autoComplete="email" required
              value={email} onChange={e => setEmail(e.target.value)} />
          </Campo>
          <Campo rot="Senha">
            <input type="password" autoComplete="current-password" required
              value={senha} onChange={e => setSenha(e.target.value)} />
          </Campo>
          <button className="dm-btn dm-pri dm-larga" disabled={carregando}>
            {carregando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      ) : (
        <form onSubmit={porCriar} className="dm-auth-form">
          <Campo rot="Seu e-mail" ajuda="Mandamos um link para você escolher a senha.">
            <input type="email" inputMode="email" autoComplete="email" required
              value={email} onChange={e => setEmail(e.target.value)} />
          </Campo>
          <button className="dm-btn dm-pri dm-larga" disabled={carregando}>
            {carregando ? 'Enviando…' : 'Criar ou trocar minha senha'}
          </button>
        </form>
      )}

      {/* os outros caminhos: cada um com a seta do fim, que é o que diz
          "isto leva a algum lugar" num botão sem borda */}
      <div className="dm-auth-alt">
        {modo !== 'link'
          ? <button type="button" className="dm-btn dm-txt" onClick={() => { setModo('link'); setMsg(''); }}>
              <span>Entrar por link no e-mail</span><Icone nome="seta" />
            </button>
          : null}
        {modo !== 'senha'
          ? <button type="button" className="dm-btn dm-txt" onClick={() => { setModo('senha'); setMsg(''); }}>
              <span>Prefiro entrar com senha</span><Icone nome="seta" />
            </button>
          : null}
        {modo !== 'criar'
          ? <button type="button" className="dm-btn dm-txt" onClick={() => { setModo('criar'); setMsg(''); }}>
              <span>Criar ou trocar minha senha</span><Icone nome="seta" />
            </button>
          : null}
      </div>
      {/* 94 · A PORTA DE QUEM AINDA NÃO EXISTE AQUI: o cadastro é da própria
          pessoa, e a entrada aponta para ele. */}
      <p className="dm-auth-pe">
        Primeira vez aqui? <Link href="/demandas/cadastro">Faça seu cadastro</Link>
      </p>
    </>,
  );
}
