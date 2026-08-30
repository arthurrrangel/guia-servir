'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { sb, lerCredenciais } from '@/lib/supabase';
import { Conexao } from '@/components/Shell';
import { Logo } from '@/components/Marca';
import { Aviso } from '@/components/Ui';
import { aviseHumano } from '@/lib/erros';

export default function Entrar() {
  const [pronto, setPronto] = useState(false);
  const [temConexao, setTem] = useState(false);
  const [modo, setModo] = useState<'link' | 'senha'>('link');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  /* O tom do aviso era decidido por `msg.startsWith('Erro')`. Isso parou de
     funcionar no instante em que as mensagens deixaram de começar com a
     palavra "Erro" — e o modo de falhar era silencioso e ao contrário: um
     login recusado apareceria com o ✓ verde de sucesso. Quem manda a
     mensagem agora manda o tom junto. */
  const [msg, setMsg] = useState('');
  const [tom, setTom] = useState<'erro' | 'bom'>('bom');
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
        if (data.session) { location.href = '/painel'; return; }
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

  if (!pronto) return <div className="carregando">…</div>;
  if (!temConexao) return <Conexao aoSalvar={() => location.reload()} />;
  /* Enquanto a sessão está sendo aberta, o formulário some. Deixá-lo na tela
     convida a pessoa a pedir OUTRO link no meio do processo, e o segundo
     pedido invalida o primeiro: ela se tranca fora sozinha. */
  if (entrando) return <div className="carregando">entrando…</div>;

  async function porLink(e: React.FormEvent) {
    e.preventDefault(); setCarregando(true); setMsg('');
    /* O DESTINO É /entrar, NÃO A RAIZ.
       Era window.location.origin, e a raiz é a home: uma página que fala com o
       banco pelo cliente público, que por contrato não olha para token nenhum
       na URL. O link voltava, a home carregava, e nada acontecia. Aqui é a
       única tela que cria o cliente do líder, que persiste sessão e lê o
       fragmento. O link tem que voltar para cá. */
    const { error } = await sb()!.auth.signInWithOtp({
      email: email.trim(), options: { emailRedirectTo: window.location.origin + '/entrar' },
    });
    setCarregando(false);
    setTom(error ? 'erro' : 'bom');
    setMsg(error ? aviseHumano(error, 'enviar o link')
      : 'Pronto. Abra seu email e clique no link para entrar. O link vale por uma hora e serve uma vez só.');
  }

  async function porSenha(e: React.FormEvent) {
    e.preventDefault(); setCarregando(true); setMsg('');
    const { error } = await sb()!.auth.signInWithPassword({ email: email.trim(), password: senha });
    setCarregando(false);
    if (error) { setTom('erro'); setMsg(aviseHumano(error, 'entrar')); } else location.href = '/painel';
  }

  return (
    /* A PORTA DA FRENTE FALAVA A LÍNGUA VELHA. Fundo cinza, cartão branco
       flutuando no meio com sombra, tudo em Inter — enquanto atrás dela o
       sistema inteiro é papel branco, Raleway e fio de 1px. Era a primeira
       coisa que o líder via, e prometia outro produto.

       Sem cartão: o formulário é o conteúdo da página, não um objeto pousado
       sobre ela. O que separa é o mesmo fio de sempre. */
    <main className="lid entrada">
      <div className="entrada-marca">
        {/* A marca era um desenho parado. Esta é a única tela do produto sem
            barra, sem migalha e sem nada por baixo: quem tocasse em "Sou da
            organização" por engano, no celular, não tinha nenhuma saída na
            página — só o gesto de voltar do navegador, que muita gente não
            usa. A marca vira a saída, que é onde todo mundo procura primeiro. */}
        <Link href="/" className="marca-link" aria-label="Voltar para o site da GUIA Church">
          <Logo className="logo entrada-logo" />
        </Link>
        <span className="rot">Espaço do organizador</span>
        <h1 className="entrada-titulo">Entrar</h1>
        <p className="entrada-sub">
          Voluntário não entra por aqui: ele usa o link pessoal que você manda.
        </p>
      </div>

      <form onSubmit={modo === 'link' ? porLink : porSenha}>
        <label htmlFor="ent-email">Seu email</label>
        {/* autoCapitalize="off" não é preciosismo: sem ele o iPhone escreve
            "Voce@email.com" com V maiúsculo e o login falha sem dizer por quê.
            enterKeyHint troca o "return" do teclado por "ir" — a tecla que
            manda o formulário sem a pessoa ter que fechar o teclado e
            procurar o botão embaixo dele. */}
        <input id="ent-email" type="email" required autoComplete="email" value={email}
          inputMode="email" autoCapitalize="off" autoCorrect="off" spellCheck={false}
          enterKeyHint="go"
          onChange={e => setEmail(e.target.value)} placeholder="voce@email.com" />
        {modo === 'senha' && (
          <>
            <div style={{ height: 12 }} />
            <label htmlFor="ent-senha">Sua senha</label>
            <input id="ent-senha" type="password" required autoComplete="current-password" enterKeyHint="go" value={senha} onChange={e => setSenha(e.target.value)} />
          </>
        )}
        <button className="lid-bt entrada-bt" type="submit" disabled={carregando}>
          {carregando ? 'aguarde…' : modo === 'link' ? 'Receber link de acesso' : 'Entrar'}
        </button>
      </form>
      {msg && <div style={{ marginTop: 18 }}><Aviso tom={tom}>{msg}</Aviso></div>}
      <button className="lid-bt-txt entrada-troca" onClick={() => { setModo(modo === 'link' ? 'senha' : 'link'); setMsg(''); }}>
        {modo === 'link' ? 'prefiro entrar com senha' : 'prefiro receber um link no email'}
      </button>
    </main>
  );
}
