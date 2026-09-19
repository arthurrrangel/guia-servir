'use client';
/* A CASCA DO SEGUNDO SISTEMA.

   Topo, abas e rodapé próprios. Não é o Shell do sistema de escalas, e essa é
   a decisão inteira: a barra do líder tem as abas dele (Painel, Entradas,
   Escala, Time, Ajustes), e pendurar "Demandas" ali seria misturar as duas
   interfaces exatamente onde a pessoa olha para se localizar. Aqui as abas
   são as de demandas, e há UM link de volta para o painel.

   O `<div className="dm">` não é enfeite: é onde nascem todas as variáveis de
   cor e espaçamento desta folha. Fora dele, nada deste sistema existe. Ver o
   cabeçalho de `app/demandas/demandas.css`.

   O PORTÃO. Três estados, e cada um tem uma saída diferente:
     · sem sessão e sem link  → manda para /entrar, que já existe;
     · com sessão, mas sem cadastro em demandas → diz isso com todas as
       letras e mostra o e-mail, em vez de devolver a pessoa para o login num
       laço (ela ESTÁ logada; o login não resolveria nada);
     · identificada → o sistema.
*/

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useState } from 'react';
import { esquecerToken, quemSou } from '@/lib/demandas/api';
import { sb } from '@/lib/supabase';
import type { Eu } from '@/lib/demandas/tipos';
import { Aviso, Esqueleto } from './Ui';

/* QUEM SOU EU, UMA VEZ POR TELA — NÃO DUAS.

   `useEu` era estado por instância. A casca chamava, e as telas de lista,
   nova e ajustes chamavam de novo: DUAS idas ao banco por carga em três das
   cinco telas, para responder a mesma pergunta. Pior que o custo: as duas
   respostas podem discordar se a sessão virar no meio, e aí a casca decide o
   portão com uma e a tela decide as abas com a outra.

   O lado das escalas já tinha resolvido isso com contexto (`Shell.tsx`). Aqui
   é a mesma solução: a casca pergunta, o contexto distribui, e `useEu()`
   continua com a mesma assinatura — nenhuma tela precisou mudar. */
const Contexto = createContext<{ eu: Eu | null; carregando: boolean } | null>(null);

export function useEu() {
  const doContexto = useContext(Contexto);
  /* dentro da casca (o caso normal) o contexto responde; fora dela — um teste,
     uma tela solta — o gancho ainda funciona sozinho. */
  const [eu, setEu] = useState<Eu | null>(null);
  const [carregando, setCarregando] = useState(true);
  useEffect(() => {
    if (doContexto) return;            // a casca já perguntou
    let vivo = true;
    quemSou().then(r => {
      if (!vivo) return;
      /* TOKEN RUIM NÃO PODE SOMBREAR O LOGIN PARA SEMPRE.

         `demandas.quem()` tenta o token E DEPOIS o e-mail do JWT — mas só
         quando o token vem vazio. Um link antigo guardado no localStorage
         fazia a função devolver "não sei quem é" e o caminho do e-mail nunca
         era tentado. A pessoa via "Este link não vale mais" e não tinha saída
         nenhuma, porque `esquecerToken()` existia e nunca era chamada (uma
         ocorrência no repositório inteiro: a própria definição).

         Agora, se a resposta for negativa E houver token guardado, o token é
         descartado e a pergunta é refeita. Na segunda vez `p_token` vem
         vazio, o JWT entra, e quem tem login entra por ele. */
      if (r.ok) { setEu(r as unknown as Eu); setCarregando(false); return; }
      if (typeof window !== 'undefined' && localStorage.getItem('demandas.link')) {
        esquecerToken();
        quemSou().then(r2 => {
          if (!vivo) return;
          setEu(r2.ok ? (r2 as unknown as Eu) : null);
          setCarregando(false);
        });
        return;
      }
      setEu(null); setCarregando(false);
    });
    return () => { vivo = false; };
  }, [doContexto]);
  return doContexto ?? { eu, carregando };
}

const ABAS = (eu: Eu) => {
  const a = [{ href: '/demandas', rot: 'Demandas' }, { href: '/demandas/nova', rot: 'Nova' }];
  if (eu.papel !== 'solicitante') a.push({ href: '/demandas/numeros', rot: 'Números' });
  if (eu.papel === 'admin') a.push({ href: '/demandas/ajustes', rot: 'Ajustes' });
  return a;
};

function CascaInterna({ children }: { children: React.ReactNode }) {
  const { eu, carregando } = useEu();
  const caminho = usePathname();
  const [email, setEmail] = useState<string | null | undefined>(undefined);

  /* só perguntamos quem é a sessão quando o sistema NÃO reconheceu a pessoa:
     é a diferença entre "você não tem login" e "você tem login, mas não está
     cadastrada aqui", e as duas frases pedem coisas diferentes dela. */
  useEffect(() => {
    if (carregando || eu) return;
    const c = sb();
    if (!c) { setEmail(null); return; }
    c.auth.getSession().then(({ data }) => setEmail(data.session?.user?.email ?? null));
  }, [carregando, eu]);

  if (carregando) {
    return <div className="dm"><div className="dm-corpo"><Esqueleto /></div></div>;
  }

  if (!eu) {
    return (
      <div className="dm">
        <Topo />
        <div className="dm-corpo" style={{ maxWidth: 520 }}>
          {email === undefined ? <Esqueleto linhas={2} /> : email ? (
            <>
              <div className="dm-rot">{'>'} ainda não</div>
              <h1 style={{ margin: '6px 0 var(--dm-e3)' }}>Você não está no sistema de demandas.</h1>
              <Aviso tom="info">
                <div>
                  Você está logado como <b>{email}</b>, mas esse e-mail ainda não foi cadastrado
                  aqui. Quem administra o sistema de demandas cadastra em Ajustes, e leva um minuto.
                </div>
              </Aviso>
              <p className="dm-peq dm-mudo">
                Se você recebeu um link pessoal pelo WhatsApp, abra por ele: o link já identifica
                você sem precisar de cadastro novo.
              </p>
              <Link className="dm-btn" href="/painel">Voltar para as escalas</Link>
            </>
          ) : (
            <>
              <div className="dm-rot">{'>'} entrar</div>
              <h1 style={{ margin: '6px 0 var(--dm-e3)' }}>Entre para ver as demandas.</h1>
              <p className="dm-peq dm-mudo">
                É o mesmo e-mail e a mesma senha do GUIA Servir. Se você recebeu um link pessoal
                pelo WhatsApp, abra por ele e não precisa de senha nenhuma.
              </p>
              <Link className="dm-btn dm-pri" href="/entrar">Entrar</Link>
            </>
          )}
        </div>
        <Rodape />
      </div>
    );
  }

  return (
    <div className="dm">
      <header className="dm-topo">
        <div className="dm-topo-in">
          <Link href="/demandas" className="dm-logo">GUI{'>'}</Link>
          <div className="dm-onde dm-cresce dm-corta">
            Demandas · <b>{eu.primeiro_nome}</b>
            {eu.setor ? <span className="dm-mudo dm-setor"> · {eu.setor}</span> : null}
          </div>
          <Link href="/painel" className="dm-peq dm-mudo" style={{ textDecoration: 'none' }}>
            Escalas {'>'}
          </Link>
        </div>
        <nav className="dm-abas" aria-label="Seções de demandas">
          {ABAS(eu).map(a => (
            <Link key={a.href} href={a.href}
              aria-current={caminho === a.href ? 'page' : undefined}>{a.rot}</Link>
          ))}
        </nav>
      </header>
      <div className="dm-corpo">{children}</div>
      <Rodape />
    </div>
  );
}

function Topo() {
  return (
    <header className="dm-topo">
      <div className="dm-topo-in">
        <Link href="/demandas" className="dm-logo">GUI{'>'}</Link>
        <div className="dm-onde dm-cresce">Demandas</div>
      </div>
    </header>
  );
}

function Rodape() {
  return (
    <footer className="dm-rodape">
      GUIA Church · operacional e demandas. Toda demanda tem um setor, um prazo e um responsável.
      {' · '}<Link href="/painel">escalas</Link>
    </footer>
  );
}

/* O PROVEDOR. Pergunta "quem sou eu" UMA vez e distribui.

   Ele precisa estar por FORA de `CascaInterna` porque a casca também consome
   o contexto — quem pergunta não pode ser quem responde. O gancho continua
   funcionando sem provedor (ver `useEu`), então nada que já existia quebra. */
export default function Casca({ children }: { children: React.ReactNode }) {
  const [eu, setEu] = useState<Eu | null>(null);
  const [carregando, setCarregando] = useState(true);
  useEffect(() => {
    let vivo = true;
    const responder = (r: { ok?: boolean } | null) => {
      if (!vivo) return;
      setEu(r && r.ok ? (r as unknown as Eu) : null);
      setCarregando(false);
    };
    quemSou().then(r => {
      if (!vivo) return;
      if (r.ok) { responder(r); return; }
      /* link velho guardado sombreia o login por e-mail: descarta e repergunta */
      if (typeof window !== 'undefined' && localStorage.getItem('demandas.link')) {
        esquecerToken();
        quemSou().then(responder);
        return;
      }
      responder(null);
    });
    return () => { vivo = false; };
  }, []);
  return (
    <Contexto.Provider value={{ eu, carregando }}>
      <CascaInterna>{children}</CascaInterna>
    </Contexto.Provider>
  );
}
