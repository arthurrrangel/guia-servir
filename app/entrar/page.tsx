'use client';
import '@/components/escalas/escalas.css';
import '@/components/escalas/tela-ajustes.css';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { sb, lerCredenciais } from '@/lib/supabase';
import { Conexao } from '@/components/Shell';
import { Aviso } from '@/components/escalas/Pecas';
import { IcSeta } from '@/components/Icones';
import { aviseHumano } from '@/lib/erros';
import { sugerirEmail } from '@/lib/email';
import { Logo } from '@/components/Marca';

/* PARA ONDE O LOGIN DEVOLVE A PESSOA — 82d.

   Eram três `location.href = '/painel'` escritos à mão. `/painel` é o painel
   das ESCALAS, e quem chegava das DEMANDAS fazia login e era despejado noutro
   sistema, sem volta. Medido em produção por quem usa: "to entrando no sistema
   de demandas e ta direcionando pro painel das escalas".

   A porta de login é UMA no site inteiro, de propósito: duas criariam dois
   clientes de sessão disputando a mesma chave no localStorage, e é assim que
   se derruba o login do líder (o motivo inteiro está em `lib/demandas/api.ts`).
   O que ela não pode é decidir sozinha em que sistema a pessoa vai parar.

   `?volta=` resolve, e a validação NÃO é zelo: sem ela isto vira
   redirecionamento aberto, e um link `/entrar?volta=https://site-falso` levaria
   alguém que acabou de digitar a senha para fora do site logo depois de
   digitá-la. Por isso só passa caminho interno:

     · precisa começar com UMA barra   -> bloqueia `https://...`
     · não pode começar com `//`       -> bloqueia `//site-falso`, que o
                                          navegador lê como protocolo-relativo
     · não pode ter `\`                -> alguns navegadores normalizam para `/`
     · qualquer outra coisa            -> cai no padrão, o painel das escalas */
/* e o link que chega por e-mail precisa CARREGAR o destino, senão ele traz a
   pessoa de volta para `/entrar` sem `?volta=` e o padrão a joga no painel
   das escalas — o mesmo defeito, um passo adiante. */
function voltaNaUrl(): string {
  const d = destinoDoLogin();
  return d === '/painel' ? '' : '?volta=' + encodeURIComponent(d);
}

function destinoDoLogin(): string {
  const PADRAO = '/painel';
  if (typeof window === 'undefined') return PADRAO;
  try {
    const v = new URL(window.location.href).searchParams.get('volta') || '';
    if (!v.startsWith('/')) return PADRAO;
    if (v.startsWith('//') || v.includes('\\')) return PADRAO;
    return v;
  } catch { return PADRAO; }
}

/* o tom da mensagem na língua das peças novas. O estado continua dizendo
   'erro' | 'bom' | 'atencao', escrito por quem manda a mensagem (ver `tom`);
   aqui só se traduz na hora de desenhar. */
const TOM_DO_AVISO = { erro: 'bad', atencao: 'warn', bom: 'ok' } as const;

/* A PORTA (30/09/2026). A mesma moldura da porta das Demandas: fundo cinza,
   uma caixa no meio com a marca no alto e o formulário dentro. Toda tela
   desta rota (carregando, entrando, sem conexão, escolher a senha, entrar)
   nasce nela, então nada pula de lugar quando uma vira a outra. */
function Moldura({ children, ocupada }: { children: React.ReactNode; ocupada?: boolean }) {
  return (
    <div className="es es-porta es-aj-fundo">
      <main className="es-porta-caixa es-aj-porta" aria-busy={ocupada || undefined}>
        <div className="es-porta-topo">
          {/* A marca era um desenho parado. Esta é a única tela do produto sem
              barra, sem migalha e sem nada por baixo: quem tocasse em "Sou da
              organização" por engano, no celular, não tinha nenhuma saída na
              página — só o gesto de voltar do navegador, que muita gente não
              usa. A marca vira a saída, que é onde todo mundo procura primeiro. */}
          <Link href="/" className="es-marca" aria-label="GUIA Church, voltar para o site">
            <Logo className="es-logo" />
          </Link>
        </div>
        {children}
      </main>
    </div>
  );
}

export default function Entrar() {
  const [pronto, setPronto] = useState(false);
  const [temConexao, setTem] = useState(false);
  /* 18/09/2026: `criar` é o terceiro modo. Pedido do Arthur: "no login do
     organizador tem que ter opção de cadastrar senha". Quem organiza nunca
     teve senha: entrava só pelo link do email, e o email é a parte frágil
     (cota por hora, spam, "Outros"). O caminho: a pessoa pede aqui um link de
     definição de senha, o link volta para ESTA tela com `type=recovery` no
     fragmento, e a tela mostra o campo de senha nova em vez de mandar para o
     painel. Quem já está dentro troca a senha em Ajustes → Quem organiza. */
  const [modo, setModo] = useState<'link' | 'senha' | 'criar'>('link');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [recuperando, setRecuperando] = useState(false);
  const [novaSenha, setNovaSenha] = useState('');
  /* O tom do aviso era decidido por `msg.startsWith('Erro')`. Isso parou de
     funcionar no instante em que as mensagens deixaram de começar com a
     palavra "Erro" — e o modo de falhar era silencioso e ao contrário: um
     login recusado apareceria com o ✓ verde de sucesso. Quem manda a
     mensagem agora manda o tom junto. */
  const [msg, setMsg] = useState('');
  const [tom, setTom] = useState<'erro' | 'bom' | 'atencao'>('bom');
  const [carregando, setCarregando] = useState(false);
  const [entrando, setEntrando] = useState(false);

  useEffect(() => {
    /* O FRAGMENTO PRECISA SER LIDO ANTES DO CLIENTE EXISTIR.

       O supabase-js consome o #access_token durante a inicialização e limpa a
       URL com replaceState. Depois disso não dá mais para saber se a pessoa
       chegou por link nem por que o link falhou: some a única evidência.
       Então lemos o fragmento primeiro, na mão, e só depois criamos o cliente.

       O link expirado não é caso raro: a própria tela promete "vale por uma
       hora e serve uma vez só". Quem volta no dia seguinte MERECE ler isso,
       não um formulário em branco que parece nunca ter recebido nada. */
    const frag = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const temToken = !!frag.get('access_token');
    const erroLink = frag.get('error_code') || frag.get('error');
    /* link de "criar senha": a sessão abre igual, mas o destino é o campo de
       senha nova, não o painel. O supabase-js apaga o fragmento logo em
       seguida, então isto é lido aqui, antes dele. */
    const eRecuperacao = temToken && frag.get('type') === 'recovery';
    if (temToken) setEntrando(true);

    /* "entrando…" não pode ser um estado do qual não se sai. Abrir a sessão
       fala com o servidor de auth; se a rede cair no meio, sem este teto a
       pessoa fica olhando reticências para sempre, sem formulário e sem
       explicação. Doze segundos e ela volta para uma tela onde pode agir. */
    const teto = temToken ? window.setTimeout(() => {
      setEntrando(false); setTom('erro');
      setMsg('Demorou demais para abrir a sessão. Confira a internet e peça um link novo abaixo.');
    }, 12000) : 0;

    setTem(!!lerCredenciais());
    const s = sb();
    /* se a checagem de sessão falhar, o certo é ficar no formulário de login:
       é o que já está na tela. Sem o .catch isso virava rejeição sem dono. */
    if (s) s.auth.getSession()
      .then(({ data }) => {
        clearTimeout(teto);
        if (data.session && eRecuperacao) { setEntrando(false); setRecuperando(true); return; }
        if (data.session) { location.href = destinoDoLogin(); return; }
        /* chegou com token e mesmo assim não virou sessão: falhar calado aqui
           seria o pior dos mundos, porque a pessoa acabou de fazer tudo certo. */
        if (temToken) {
          setEntrando(false); setTom('erro');
          setMsg('O link chegou até aqui mas não abriu a sessão. Peça um link novo abaixo.');
        }
      })
      .catch(() => { clearTimeout(teto); setEntrando(false); });

    if (erroLink && !temToken) {
      setTom('erro');
      setMsg(erroLink.includes('expired')
        ? 'Esse link já venceu. Eles valem uma hora e servem uma vez só. Peça outro abaixo.'
        : 'Esse link não vale mais. Peça outro abaixo.');
    }
    setPronto(true);
    return () => clearTimeout(teto);
  }, []);

  if (!pronto) return <Moldura ocupada><p className="es-porta-sub">…</p></Moldura>;
  if (!temConexao) return <div className="es es-porta es-aj-fundo es-aj-conexao"><Conexao aoSalvar={() => location.reload()} /></div>;
  /* Enquanto a sessão está sendo aberta, o formulário some. Deixá-lo na tela
     convida a pessoa a pedir OUTRO link no meio do processo, e o segundo
     pedido invalida o primeiro: ela se tranca fora sozinha. */
  if (entrando) return (
    <Moldura ocupada>
      <div className="es-aj-porta-cab">
        <div className="es-rot">Espaço do organizador</div>
        <h1>Entrando…</h1>
      </div>
    </Moldura>
  );

  async function porLink(e: React.FormEvent) {
    e.preventDefault(); setMsg('');
    /* 16/09/2026: cada pedido de link é um e-mail, e o projeto tem cota de
       e-mails por hora. Um endereço com erro de digitação (a Monik pediu com
       "hotmail.comm") gasta a cota de todo mundo e não chega a ninguém. Os
       erros mais comuns são pegos aqui, antes de gastar. */
    const sug = sugerirEmail(email);
    /* 16/09/2026, segunda captura da Monik: ela viu a sugestão, e continuou
       com "hotmail.comm" no campo. Sugerir e devolver a tarefa não funcionou;
       a correção é óbvia, então a tela corrige, manda para o endereço certo
       e diz que corrigiu. O campo passa a mostrar o endereço usado. */
    const alvo = sug || email.trim();
    if (sug) setEmail(sug);
    setCarregando(true);
    /* O DESTINO É /entrar, NÃO A RAIZ.
       Era window.location.origin, e a raiz é a home: uma página que fala com o
       banco pelo cliente público, que por contrato não olha para token nenhum
       na URL. O link voltava, a home carregava, e nada acontecia. Aqui é a
       única tela que cria o cliente do líder, que persiste sessão e lê o
       fragmento. O link tem que voltar para cá. */
    const { error } = await sb()!.auth.signInWithOtp({
      email: alvo, options: { emailRedirectTo: window.location.origin + '/entrar' + voltaNaUrl() },
    });
    setCarregando(false);
    setTom(error ? 'erro' : 'bom');
    setMsg(error ? aviseHumano(error, 'enviar o link')
      : `${sug ? `Corrigi o endereço para ${sug} e mandei o link. ` : 'Pronto. '}Abra seu email (olhe também o spam ou "Outros") e clique no link para entrar. O link vale por uma hora e serve uma vez só.`);
  }

  async function porSenha(e: React.FormEvent) {
    e.preventDefault(); setCarregando(true); setMsg('');
    const { error } = await sb()!.auth.signInWithPassword({ email: email.trim(), password: senha });
    setCarregando(false);
    if (error) { setTom('erro'); setMsg(aviseHumano(error, 'entrar')); } else location.href = destinoDoLogin();
  }

  /* pede o link que volta para cá com type=recovery. É o mesmo canal do link
     de acesso (um email), com a mesma correção de endereço digitado errado.
     Serve para criar a primeira senha e para trocar uma esquecida: para o
     servidor as duas coisas são a mesma. */
  async function porCriar(e: React.FormEvent) {
    e.preventDefault(); setMsg('');
    const sug = sugerirEmail(email);
    const alvo = sug || email.trim();
    if (sug) setEmail(sug);
    setCarregando(true);
    const { error } = await sb()!.auth.resetPasswordForEmail(alvo, {
      redirectTo: window.location.origin + '/entrar' + voltaNaUrl(),
    });
    setCarregando(false);
    setTom(error ? 'erro' : 'bom');
    setMsg(error ? aviseHumano(error, 'enviar o link')
      : `${sug ? `Corrigi o endereço para ${sug} e mandei o link. ` : 'Pronto. '}Abra seu email (olhe também o spam ou "Outros") e clique no link: você volta para esta tela para escolher a senha. O link vale por uma hora.`);
  }

  /* a sessão já está aberta pelo link; só falta gravar a senha */
  async function definirSenha(e: React.FormEvent) {
    e.preventDefault(); setMsg('');
    if (novaSenha.length < 8) { setTom('atencao'); setMsg('A senha precisa ter pelo menos 8 caracteres.'); return; }
    setCarregando(true);
    const { error } = await sb()!.auth.updateUser({ password: novaSenha });
    setCarregando(false);
    if (error) { setTom('erro'); setMsg(aviseHumano(error, 'salvar a senha')); return; }
    location.href = destinoDoLogin();
  }

  if (recuperando) return (
    <Moldura>
      <div className="es-aj-porta-cab">
        <div className="es-rot">Espaço do organizador</div>
        <h1>Escolha sua senha</h1>
        <p className="es-porta-sub">
          Da próxima vez você entra com email e senha, sem esperar link.
        </p>
      </div>
      <form onSubmit={definirSenha}>
        <label className="es-campo" htmlFor="ent-nova">
          <span>Senha nova</span>
          <input className="es-ctl" id="ent-nova" type="password" required minLength={8} autoComplete="new-password"
            enterKeyHint="go" value={novaSenha} onChange={e => setNovaSenha(e.target.value)}
            placeholder="pelo menos 8 caracteres" />
        </label>
        <button className="es-btn es-pri es-larga" type="submit" disabled={carregando}>
          {carregando ? 'aguarde…' : 'Salvar senha e entrar'}
        </button>
      </form>
      {msg && <Aviso tom={TOM_DO_AVISO[tom]}>{msg}</Aviso>}
    </Moldura>
  );

  const enviar = modo === 'link' ? porLink : modo === 'senha' ? porSenha : porCriar;

  return (
    <Moldura>
      <div className="es-aj-porta-cab">
        <div className="es-rot">Espaço do organizador</div>
        <h1>{modo === 'criar' ? 'Criar senha' : 'Entrar'}</h1>
        <p className="es-porta-sub">
          {modo === 'criar'
            ? 'Vale para a primeira senha e para trocar uma esquecida. Você recebe um link por email e escolhe a senha aqui.'
            : 'Voluntário não entra por aqui: ele usa o link pessoal que você manda.'}
        </p>
      </div>

      <form onSubmit={enviar}>
        <label className="es-campo" htmlFor="ent-email">
          <span>Seu email</span>
          {/* autoCapitalize="off" não é preciosismo: sem ele o iPhone escreve
              "Voce@email.com" com V maiúsculo e o login falha sem dizer por quê.
              enterKeyHint troca o "return" do teclado por "ir" — a tecla que
              manda o formulário sem a pessoa ter que fechar o teclado e
              procurar o botão embaixo dele. */}
          <input className="es-ctl" id="ent-email" type="email" required autoComplete="email" value={email}
            inputMode="email" autoCapitalize="off" autoCorrect="off" spellCheck={false}
            enterKeyHint="go"
            onChange={e => setEmail(e.target.value)} placeholder="voce@email.com" />
        </label>
        {modo === 'senha' && (
          <label className="es-campo" htmlFor="ent-senha">
            <span>Sua senha</span>
            <input className="es-ctl" id="ent-senha" type="password" required autoComplete="current-password" enterKeyHint="go" value={senha} onChange={e => setSenha(e.target.value)} />
          </label>
        )}
        <button className="es-btn es-pri es-larga" type="submit" disabled={carregando}>
          {carregando ? 'aguarde…' : modo === 'link' ? 'Receber link de acesso' : modo === 'senha' ? 'Entrar' : 'Receber link para criar senha'}
        </button>
      </form>
      {msg && <Aviso tom={TOM_DO_AVISO[tom]}>{msg}</Aviso>}
      {/* duas saídas de texto, uma por linha. "Criar senha" aparece nos dois
          modos de entrar: quem chegou pelo link e quem esqueceu a senha
          precisam da mesma porta. */}
      <div className="es-aj-trocas">
        {modo !== 'link' && (
          <button type="button" className="es-btn es-txt" onClick={() => { setModo('link'); setMsg(''); }}>
            <span>Prefiro receber um link no email</span><IcSeta />
          </button>
        )}
        {modo !== 'senha' && (
          <button type="button" className="es-btn es-txt" onClick={() => { setModo('senha'); setMsg(''); }}>
            <span>Prefiro entrar com senha</span><IcSeta />
          </button>
        )}
        {modo !== 'criar' && (
          <button type="button" className="es-btn es-txt" onClick={() => { setModo('criar'); setMsg(''); }}>
            <span>{modo === 'senha' ? 'Esqueci ou ainda não tenho senha' : 'Criar ou trocar minha senha'}</span><IcSeta />
          </button>
        )}
      </div>
      <p className="es-porta-pe">GUIA Church</p>
    </Moldura>
  );
}
