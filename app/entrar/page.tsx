'use client';
import { useEffect, useState } from 'react';
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
    <main style={{ maxWidth: 420, paddingTop: 'clamp(40px, 12vh, 110px)' }}>
      {/* Primeira tela que o líder vê: é onde a marca aparece inteira, com o
          mesmo tracking largo da logo da igreja. */}
      <div className="centro entrada-marca">
        {/* a marca de verdade, e um h1: a auditoria pegou esta tela sem
            nenhum título. O "ESCALA / MÍDIA" era um wordmark inventado, e
            ainda dizia Mídia numa tela que serve as cinco áreas. */}
        <Logo className="logo entrada-logo" />
        <h1 className="entrada-titulo">Área do organizador</h1>
        <p className="dim pequeno" style={{ marginTop: 16 }}>
          Área do organizador da escala. Voluntário não entra aqui: ele usa o link pessoal que você manda.
        </p>
      </div>

      <div className="card" style={{ boxShadow: 'var(--sombra-alta)' }}>
        <form onSubmit={modo === 'link' ? porLink : porSenha}>
          <label>Seu email</label>
          <input type="email" required autoComplete="email" value={email}
            onChange={e => setEmail(e.target.value)} placeholder="voce@email.com" />
          {modo === 'senha' && (
            <>
              <div style={{ height: 12 }} />
              <label>Sua senha</label>
              <input type="password" required autoComplete="current-password" value={senha} onChange={e => setSenha(e.target.value)} />
            </>
          )}
          <div style={{ height: 16 }} />
          <button className="pri grande" type="submit" disabled={carregando}>
            {carregando ? 'aguarde…' : modo === 'link' ? 'Receber link de acesso' : 'Entrar'}
          </button>
        </form>
        {msg && <div style={{ marginTop: 14 }}><Aviso tom={msg.startsWith('Erro') ? 'erro' : 'bom'}>{msg}</Aviso></div>}
        <div className="centro" style={{ marginTop: 12 }}>
          <button className="mini fantasma" onClick={() => { setModo(modo === 'link' ? 'senha' : 'link'); setMsg(''); }}>
            {modo === 'link' ? 'prefiro entrar com senha' : 'prefiro receber um link no email'}
          </button>
        </div>
      </div>
    </main>
  );
}
