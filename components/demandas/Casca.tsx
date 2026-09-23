'use client';
/* A CASCA DO SEGUNDO SISTEMA.

   Topo, abas e rodapé próprios. Não é o Shell do sistema de escalas, e essa é
   a decisão inteira: a barra do líder tem as abas dele (Painel, Entradas,
   Escala, Time, Ajustes), e pendurar "Demandas" ali seria misturar as duas
   interfaces exatamente onde a pessoa olha para se localizar. Aqui as abas
   são as de demandas, e MAIS NADA.

   ====================================================== 82d ================
   NENHUM LINK PARA AS ESCALAS. A REGRA É DO ARTHUR, EM 21/09:
   "sistema de demanda tem que ser um sistema totalmente desconectado com
   sistema de escalas".

   Eram SEIS pontos de vazamento, todos neste arquivo (nenhum outro lugar do
   sistema de demandas tocava nas escalas, e as escalas nunca linkaram para
   cá):

     · "Escalas >" no canto do topo, em toda tela;
     · "· escalas" no rodapé, em toda tela;
     · "Voltar para as escalas" no estado SEM_SISTEMA;
     · "Voltar para as escalas" no estado "não está cadastrado";
     · o botão Entrar, que caía no login das escalas e não voltava;
     · a frase "é o mesmo e-mail e a mesma senha do GUIA Servir", que
       ensinava a conexão em palavras mesmo sem link.

   Os cinco primeiros saíram. O sexto virou `/entrar?volta=/demandas`, porque
   a porta de login é UMA no site inteiro e duplicá-la criaria dois clientes
   de sessão brigando pela mesma chave (o motivo está escrito em
   `lib/demandas/api.ts`, e derrubaria o login do líder). O que não pode é ela
   despejar a pessoa noutro sistema, e agora ela devolve para cá.

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
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ehRecusaDeIdentidade, esquecerToken, quemSou } from '@/lib/demandas/api';
import { rotPapel } from '@/lib/demandas/regras';
import { sb } from '@/lib/supabase';
import type { Eu } from '@/lib/demandas/tipos';
import { Aviso, Esqueleto, Toast, type ToastPedido } from './Ui';

/* QUEM SOU EU, UMA VEZ POR TELA — NÃO DUAS.

   `useEu` era estado por instância. A casca chamava, e as telas de lista,
   nova e ajustes chamavam de novo: DUAS idas ao banco por carga em três das
   cinco telas, para responder a mesma pergunta. Pior que o custo: as duas
   respostas podem discordar se a sessão virar no meio, e aí a casca decide o
   portão com uma e a tela decide as abas com a outra.

   O lado das escalas já tinha resolvido isso com contexto (`Shell.tsx`). Aqui
   é a mesma solução: a casca pergunta, o contexto distribui, e `useEu()`
   continua com a mesma assinatura — nenhuma tela precisou mudar. */
type Ctx = {
  eu: Eu | null; carregando: boolean; semSistema?: boolean;
  /* 94 · a tela de avisos zera o contador da casca quando a pessoa os abre.
     Sem isto o número continuava no topo até a próxima carga, dizendo que
     havia coisa nova sobre o que ela acabou de ler. */
  zerarAvisos?: () => void;
  /* o perfil salva nome e telefone; sem isto o topo continuava com o nome
     antigo até recarregar */
  ajustarEu?: (p: Partial<Eu>) => void;
  /* o toast: o sucesso que muda de tela ou some da tela. Quem mostra é a
     casca, para ele sobreviver à troca de página que o motivou. */
  toast?: (t: ToastPedido) => void;
  /* o toast em cima da tela agora (a casca desenha dentro de `.dm`, para a
     fonte e os tokens valerem nele) */
  toastAtual?: ToastPedido | null;
  fecharToast?: () => void;
};
const Contexto = createContext<Ctx | null>(null);


export function useEu(): Ctx {
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
      if (ehRecusaDeIdentidade(r) && typeof window !== 'undefined'
          && localStorage.getItem('demandas.link')) {
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

/* AS ABAS, DESDE A MIGRAÇÃO 94.

   "Quem sou, onde estou, minhas demandas, o que precisa da minha atenção,
   qual é o próximo passo." Cada aba é uma dessas respostas:

     Início        quem sou, o que espera por mim, minhas demandas
     Atendimento   só para quem atende: a fila, o que está comigo
     Nova          o próximo passo mais comum
     Avisos        o que mudou desde a última vez (com o número)
     Perfil        meus dados, o que posso fazer, sair

   Números saiu da barra e mora dentro do Atendimento: é pergunta de quem
   atende, e cinco abas é o que cabe em 320px sem rolar (com "Atender" no
   lugar de "Atendimento", e isso é medido: `demandas-celular.mjs` reprova
   a barra que rola).

   A ADMINISTRAÇÃO NÃO ESTÁ AQUI, DE PROPÓSITO. O pedido foi "não misture
   isso com a interface do usuário comum". Quem administra chega lá por um
   cartão no Início e pelo Perfil; a barra é a mesma para todo mundo. */
type AbaCasca = { href: string; rot: string; n?: number };
const ABAS = (eu: Eu): AbaCasca[] => {
  const a: AbaCasca[] = [{ href: '/demandas', rot: 'Início' }];
  /* `atende` vem do servidor desde a 94; num banco na 93, vale a regra antiga */
  /* "Atender", e não "Atendimento": medido em 22/09 com a Inter, a barra de
     quem atende media 362px e escondia "Perfil" (onde mora o Sair) em 320 e
     em 360, os dois celulares mais comuns da igreja. A página continua se
     chamando Atendimento no título; a aba diz o que se faz lá. */
  if (eu.atende ?? eu.papel !== 'solicitante') a.push({ href: '/demandas/atendimento', rot: 'Atender' });
  a.push({ href: '/demandas/nova', rot: 'Nova' });
  a.push({ href: '/demandas/avisos', rot: 'Avisos', n: eu.avisos || 0 });
  a.push({ href: '/demandas/perfil', rot: 'Perfil' });
  return a;
};

/* "ONDE ESTOU" NAS TELAS FILHAS — 23/09/2026.

   A ficha e Números não tinham aba marcada: nenhuma das cinco palavras dizia
   de onde a pessoa veio. A ficha é filha de Atender para quem atende e do
   Início para quem pede; Números é filha de Atender. A aba mãe fica marcada. */
function abaAtual(caminho: string, href: string, atende: boolean): boolean {
  if (caminho === href) return true;
  const filhaDeAtender = caminho.startsWith('/demandas/numeros') || (caminho.startsWith('/demandas/d/') && atende);
  const filhaDoInicio = caminho.startsWith('/demandas/d/') && !atende;
  if (href === '/demandas/atendimento') return filhaDeAtender;
  if (href === '/demandas') return filhaDoInicio;
  return false;
}

/* AS SEÇÕES DA ADMINISTRAÇÃO MORAM NA BARRA, e não no corpo como uma fileira
   de botões com cara de campo. É a mesma casca em preto: a "outra sala" fica
   dita sem outra estrutura. */
const SECOES_ADMIN: { v: string; rot: string }[] = [
  { v: 'pessoas', rot: 'Pessoas' }, { v: 'setores', rot: 'Setores' },
  { v: 'categorias', rot: 'Categorias' }, { v: 'anexos', rot: 'Anexos' },
];

/* a faixa preta: as quatro seções, com a aberta marcada. A seção vem da URL
   (`?secao=`), e `/demandas/admin` sem nada é "pessoas". */
function SecoesDaAdministracao({ caminho, secaoAberta }: { caminho: string; secaoAberta: string | null }) {
  const secao = caminho === '/demandas/admin' ? (secaoAberta || 'pessoas') : '';
  return (
    <nav className="dm-abas" aria-label="Seções da administração">
      {SECOES_ADMIN.map(x => (
        <Link key={x.v} href={x.v === 'pessoas' ? '/demandas/admin' : `/demandas/admin?secao=${x.v}`}
          aria-current={secao === x.v ? 'page' : undefined}>{x.rot}</Link>
      ))}
    </nav>
  );
}
function SecoesDaAdministracaoPelaUrl({ caminho }: { caminho: string }) {
  const busca = useSearchParams();
  return <SecoesDaAdministracao caminho={caminho} secaoAberta={busca?.get('secao') ?? null} />;
}

/* A LINHA DA LOGO SE RECOLHE AO ROLAR (celular). Enquanto a pessoa lê, ficam
   só as abas: 44px de topo fixo em vez de 114. Rolar para cima devolve a
   linha. Oito linhas de JavaScript, ouvinte passivo; no desktop a folha
   ignora a classe. */
function useRecolhida(): boolean {
  const [recolhida, setRecolhida] = useState(false);
  useEffect(() => {
    let ultimo = window.scrollY;
    const f = () => {
      const y = window.scrollY;
      const desce = y > ultimo + 2, sobe = y < ultimo - 2;
      ultimo = y;
      if (desce && y > 64) setRecolhida(true);
      else if (sobe || y <= 8) setRecolhida(false);
    };
    window.addEventListener('scroll', f, { passive: true });
    return () => window.removeEventListener('scroll', f);
  }, []);
  return recolhida;
}

function CascaInterna({ children, admin }: { children: React.ReactNode; admin?: boolean }) {
  const ctx = useEu() as Ctx;
  const { eu, carregando } = ctx;
  const semSistema = !!ctx.semSistema;
  const caminho = usePathname();
  const recolhida = useRecolhida();
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
    return <div className="dm"><Topo /><main className="dm-corpo"><Esqueleto /></main></div>;
  }

  if (!eu) {
    return (
      <div className="dm">
        <Topo />
        <div className="dm-corpo" style={{ maxWidth: 520 }}>
          {/* O SISTEMA NÃO ESTÁ INSTALADO NESTE AMBIENTE.

              Este ramo vem antes do de "não cadastrado" porque ele é a causa,
              e o outro era o sintoma vestido de instrução. Medido em produção
              em 20/09/2026: o schema `demandas` não existe naquele banco, e a
              tela mandava o dono do sistema procurar, em Ajustes, um cadastro
              que não podia existir.

              Aqui não há o que a pessoa possa fazer sozinha, então a tela não
              finge que há: diz o que falta e devolve para onde ela consegue
              trabalhar. */}
          {semSistema ? (
            <>
              <div className="dm-rot">{'>'} indisponível</div>
              <h1 style={{ margin: '6px 0 var(--dm-e3)' }}>
                O sistema de demandas ainda não foi instalado.
              </h1>
              <Aviso tom="warn">
                <div>
                  As telas estão no ar, mas o banco deste ambiente ainda não tem as tabelas
                  de demandas. Não é cadastro faltando, e não há nada que você possa fazer
                  por aqui: falta aplicar a migração do banco.
                </div>
              </Aviso>
              <p className="dm-peq dm-mudo">
                Se você administra o sistema, aplique <b>supabase/50-demandas.sql</b> e as
                migrações seguintes no banco deste ambiente.
              </p>
            </>
          ) : email === undefined ? <Esqueleto linhas={2} /> : email ? (
            /* 94 · A FRASE MANDAVA PROCURAR O ADMINISTRADOR, E AGORA HÁ UMA PORTA.

               Até a 93 isto dizia "Quem administra o sistema de demandas
               cadastra em Ajustes": o único jeito de existir aqui era alguém
               digitar a pessoa. Agora o cadastro é da própria pessoa, com o
               e-mail com que ela ACABOU de entrar, e a tela aponta para ele. */
            <>
              <div className="dm-rot">{'>'} falta o cadastro</div>
              <h1 style={{ margin: '6px 0 var(--dm-e3)' }}>Falta só o seu cadastro.</h1>
              <p className="dm-peq dm-mudo" style={{ marginBottom: 'var(--dm-e3)' }}>
                Você entrou como <b>{email}</b>. Leva um minuto: nome, WhatsApp e setor.
              </p>
              <Link className="dm-btn dm-pri dm-larga" href="/demandas/cadastro">Fazer meu cadastro</Link>
            </>
          ) : (
            <>
              <div className="dm-rot">{'>'} entrar</div>
              <h1 style={{ margin: '6px 0 var(--dm-e3)' }}>Entre para ver as suas demandas.</h1>
              <p className="dm-peq dm-mudo">
                Recebeu um link pessoal pelo WhatsApp? Abra por ele e não precisa de senha.
              </p>
              {/* A PORTA PRÓPRIA — 22/09/2026, e o `?volta=` não bastava.

                  Em 82d isto virou `/entrar?volta=%2Fdemandas`, e o login
                  passou a devolver a pessoa para cá. Medido em produção:
                  funciona. E não resolveu o problema, porque `/entrar` É A
                  TELA DO OUTRO SISTEMA — "ESPAÇO DO ORGANIZADOR", "voluntário
                  não entra por aqui". Quem tocava neste botão já tinha
                  entrado no sistema de escalas, mesmo voltando depois.

                  A frase que fechou a questão, depois de um dia inteiro
                  repetindo: "nesse entrar eu entro diretamente pro sistema de
                  escalas cara". Ele estava certo e eu estava consertando o
                  destino do login em vez da porta.

                  `/demandas/entrar` não tem a string `/painel` em lugar
                  nenhum, e só aceita `?volta=` que comece com `/demandas`. */}
              <div className="dm-grade" style={{ marginTop: 'var(--dm-e3)' }}>
                <Link className="dm-btn dm-pri" href="/demandas/entrar">Entrar</Link>
                <Link className="dm-btn" href="/demandas/cadastro">Primeira vez? Cadastre-se</Link>
              </div>
            </>
          )}
        </div>
        <Rodape />
      </div>
    );
  }

  /* 94 · A ADMINISTRAÇÃO É OUTRA SALA.

     Mesmo portão (quem não entrou vai para o login; quem não tem cadastro vai
     para o cadastro), outro topo: a faixa escura, o nome da sala e a saída
     para o portal. E quem não administra nem vê o conteúdo: a tela diz que a
     área é restrita. Isso é CLAREZA; a tranca de verdade é do banco, e cada
     função da administração (`dem_pessoas`, `dem_pessoa`, `dem_ajustar`)
     responde `SO_ADMIN` para qualquer outro papel, com ou sem esta tela. */
  const atende = eu.atende ?? eu.papel !== 'solicitante';

  if (admin) {
    return (
      <div className={recolhida ? 'dm dm-recolhida' : 'dm'}>
        <header className="dm-topo dm-adm-faixa">
          <div className="dm-topo-in">
            <Link href="/demandas" className="dm-logo" aria-label="Portal de demandas"><span>GUI{'>'}</span></Link>
            {/* `useSearchParams` (a seção aberta) pede o Suspense na
                pré-renderização; sem ele o build reprova a página inteira.
                Fica aqui, em volta só da faixa, para as outras telas não
                pagarem por uma leitura que só a administração faz. */}
            <Suspense fallback={<SecoesDaAdministracao caminho={caminho} secaoAberta={null} />}>
              <SecoesDaAdministracaoPelaUrl caminho={caminho} />
            </Suspense>
            {/* "Portal", e não "Voltar ao portal": em 320px a frase comia a
                barra */}
            <div className="dm-quem-sou"><Link href="/demandas">Portal</Link></div>
          </div>
        </header>
        <main className="dm-corpo">
          {eu.papel === 'admin' ? children : (
            <div className="dm-card dm-quieto dm-vazio dm-centro">
              <div className="dm-rot">{'>'} área restrita</div>
              <h3>Esta área é de quem administra o sistema.</h3>
              <p className="dm-peq dm-mudo" style={{ marginBottom: 'var(--dm-e3)' }}>
                Seu acesso no portal continua o mesmo.
              </p>
              <Link className="dm-btn" href="/demandas">Voltar ao portal</Link>
            </div>
          )}
        </main>
        <Rodape links={[{ href: '/demandas', rot: 'Portal' }]} />
        {ctx.toastAtual && ctx.fecharToast ? <Toast t={ctx.toastAtual} fechar={ctx.fecharToast} /> : null}
      </div>
    );
  }

  const links: { href: string; rot: string }[] = [];
  if (atende) links.push({ href: '/demandas/numeros', rot: 'Números' });
  if (eu.papel === 'admin') links.push({ href: '/demandas/admin', rot: 'Administração' });

  return (
    <div className={recolhida ? 'dm dm-recolhida' : 'dm'}>
      <header className="dm-topo">
        <div className="dm-topo-in">
          <Link href="/demandas" className="dm-logo" aria-label="Início"><span>GUI{'>'}</span></Link>
          <nav className="dm-abas" aria-label="Seções de demandas">
            {ABAS(eu).map(a => (
              <Link key={a.href} href={a.href}
                aria-current={abaAtual(caminho, a.href, atende) ? 'page' : undefined}>
                {a.rot}
                {/* o número é contado pelo servidor (`dem_quem_sou.avisos`) e
                    lido por leitor de tela como frase, não como "3" solto */}
                {a.n ? <span className="dm-selo" aria-label={`${a.n} ${a.n === 1 ? 'novo' : 'novos'}`}>{a.n > 99 ? '99+' : a.n}</span> : null}
              </Link>
            ))}
          </nav>
          {/* quem sou, num lugar fixo: nome, papel e setor. O nome do sistema
              não aparece (a logo já diz). */}
          <div className="dm-quem-sou">
            <b>{eu.primeiro_nome}</b>
            <span>{rotPapel(eu.papel)}{eu.setor ? ` · ${eu.setor}` : ''}</span>
          </div>
        </div>
      </header>
      <main className="dm-corpo">{children}</main>
      <Rodape links={links} />
      {ctx.toastAtual && ctx.fecharToast ? <Toast t={ctx.toastAtual} fechar={ctx.fecharToast} /> : null}
    </div>
  );
}

function Topo() {
  return (
    <header className="dm-topo">
      <div className="dm-topo-in">
        <Link href="/demandas" className="dm-logo" aria-label="Demandas"><span>GUI{'>'}</span></Link>
        <div className="dm-quem-sou"><span>Demandas</span></div>
      </div>
    </header>
  );
}

/* o rodapé é o único lugar do desktop que repete as portas de Números e da
   Administração; no celular elas moram no Início e no Perfil */
function Rodape({ links = [] }: { links?: { href: string; rot: string }[] }) {
  return (
    <footer className="dm-rodape">
      <span>GUIA Church</span>
      {links.length ? (
        <span className="dm-rodape-links">
          {links.map(l => <Link key={l.href} href={l.href}>{l.rot}</Link>)}
        </span>
      ) : null}
    </footer>
  );
}

/* O PROVEDOR. Pergunta "quem sou eu" UMA vez e distribui.

   Ele precisa estar por FORA de `CascaInterna` porque a casca também consome
   o contexto — quem pergunta não pode ser quem responde. O gancho continua
   funcionando sem provedor (ver `useEu`), então nada que já existia quebra. */
export default function Casca({ children, admin }: { children: React.ReactNode; admin?: boolean }) {
  const [eu, setEu] = useState<Eu | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [semSistema, setSemSistema] = useState(false);
  useEffect(() => {
    let vivo = true;
    const responder = (r: { ok?: boolean; erro?: string } | null) => {
      if (!vivo) return;
      setEu(r && r.ok ? (r as unknown as Eu) : null);
      setSemSistema(!!r && !r.ok && r.erro === 'SEM_SISTEMA');
      setCarregando(false);
    };
    quemSou().then(r => {
      if (!vivo) return;
      if (r.ok) { responder(r); return; }
      /* link velho guardado sombreia o login por e-mail: descarta e repergunta.
         Só quando a recusa é de IDENTIDADE — ver `ehRecusaDeIdentidade`. */
      if (ehRecusaDeIdentidade(r) && typeof window !== 'undefined'
          && localStorage.getItem('demandas.link')) {
        esquecerToken();
        quemSou().then(responder);
        return;
      }
      responder(r);
    });
    return () => { vivo = false; };
  }, []);
  const zerarAvisos = () => setEu(e => (e ? { ...e, avisos: 0 } : e));
  const ajustarEu = (p: Partial<Eu>) => setEu(e => (e ? { ...e, ...p } : e));
  const [toast, setToast] = useState<ToastPedido | null>(null);
  const pedirToast = useCallback((t: ToastPedido) => setToast(t), []);
  const fecharToast = useCallback(() => setToast(null), []);
  return (
    <Contexto.Provider value={{ eu, carregando, semSistema, zerarAvisos, ajustarEu,
                                toast: pedirToast, toastAtual: toast, fecharToast }}>
      <CascaInterna admin={admin}>{children}</CascaInterna>
    </Contexto.Provider>
  );
}
