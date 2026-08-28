'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { sb, lerCredenciais } from '@/lib/supabase';
import { Conexao } from '@/components/Shell';
import { Logo } from '@/components/Marca';
import { Aviso } from '@/components/Ui';

export default function Entrar() {
  const [pronto, setPronto] = useState(false);
  const [temConexao, setTem] = useState(false);
  const [modo, setModo] = useState<'link' | 'senha'>('link');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [msg, setMsg] = useState('');
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    setTem(!!lerCredenciais());
    const s = sb();
    /* se a checagem de sessão falhar, o certo é ficar no formulário de login:
       é o que já está na tela. Sem o .catch isso virava rejeição sem dono. */
    if (s) s.auth.getSession()
      .then(({ data }) => { if (data.session) location.href = '/painel'; })
      .catch(() => {});
    setPronto(true);
  }, []);

  if (!pronto) return <div className="carregando">…</div>;
  if (!temConexao) return <Conexao aoSalvar={() => location.reload()} />;

  async function porLink(e: React.FormEvent) {
    e.preventDefault(); setCarregando(true); setMsg('');
    const { error } = await sb()!.auth.signInWithOtp({
      email: email.trim(), options: { emailRedirectTo: window.location.origin },
    });
    setCarregando(false);
    setMsg(error ? 'Erro: ' + error.message : 'Pronto. Abra seu email e clique no link para entrar.');
  }

  async function porSenha(e: React.FormEvent) {
    e.preventDefault(); setCarregando(true); setMsg('');
    const { error } = await sb()!.auth.signInWithPassword({ email: email.trim(), password: senha });
    setCarregando(false);
    if (error) setMsg('Erro: ' + error.message); else location.href = '/painel';
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
        <span className="rot">Área do organizador</span>
        <h1 className="entrada-titulo">Entrar</h1>
        <p className="entrada-sub">
          Voluntário não entra por aqui: ele usa o link pessoal que você manda.
        </p>
      </div>

      <form onSubmit={modo === 'link' ? porLink : porSenha}>
        <label>Seu email</label>
        {/* autoCapitalize="off" não é preciosismo: sem ele o iPhone escreve
            "Voce@email.com" com V maiúsculo e o login falha sem dizer por quê.
            enterKeyHint troca o "return" do teclado por "ir" — a tecla que
            manda o formulário sem a pessoa ter que fechar o teclado e
            procurar o botão embaixo dele. */}
        <input type="email" required autoComplete="email" value={email}
          inputMode="email" autoCapitalize="off" autoCorrect="off" spellCheck={false}
          enterKeyHint="go"
          onChange={e => setEmail(e.target.value)} placeholder="voce@email.com" />
        {modo === 'senha' && (
          <>
            <div style={{ height: 12 }} />
            <label>Sua senha</label>
            <input type="password" required autoComplete="current-password" enterKeyHint="go" value={senha} onChange={e => setSenha(e.target.value)} />
          </>
        )}
        <button className="lid-bt entrada-bt" type="submit" disabled={carregando}>
          {carregando ? 'aguarde…' : modo === 'link' ? 'Receber link de acesso' : 'Entrar'}
        </button>
      </form>
      {msg && <div style={{ marginTop: 18 }}><Aviso tom={msg.startsWith('Erro') ? 'erro' : 'bom'}>{msg}</Aviso></div>}
      <button className="lid-bt-txt entrada-troca" onClick={() => { setModo(modo === 'link' ? 'senha' : 'link'); setMsg(''); }}>
        {modo === 'link' ? 'prefiro entrar com senha' : 'prefiro receber um link no email'}
      </button>
    </main>
  );
}
