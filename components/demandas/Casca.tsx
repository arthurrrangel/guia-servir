'use client';
/* A CASCA DO SEGUNDO SISTEMA · terceira versão, 23/09/2026.

   A FORMA. Um produto, não um site: no desktop (a partir de 1024px) uma
   barra lateral fixa com a marca, "Nova demanda", as seções, a
   administração para quem administra e, no pé, quem sou (que leva ao
   perfil). No celular a navegação desce para uma barra de abas no rodapé,
   do jeito que o polegar alcança, e o alto da tela fica com a marca.

   As duas navegações são a MESMA pergunta ("onde estou, para onde vou"), mas
   não as mesmas respostas, e isso é de propósito: a lateral tem espaço para
   Números e para a Administração; a barra do celular tem cinco lugares e
   cinco abas (Início, Atender, Nova, Avisos, Perfil), medidas em 320px.

   A ficha e a Nova escondem a barra de abas do celular: as duas têm a
   própria barra fixa no rodapé (a ação da demanda, o "Enviar"), e duas
   barras fixas empilhadas comiam 128px de uma tela de 640. A ficha sem
   gesto nenhum (concluída, cancelada) não tem barra, e aí as abas voltam.

   ====================================================== 82d ================
   NENHUM LINK PARA AS ESCALAS. A REGRA É DO ARTHUR, EM 21/09:
   "sistema de demanda tem que ser um sistema totalmente desconectado com
   sistema de escalas". Nenhum destino desta casca sai de /demandas, e
   `demandas-porta-propria.test.mjs` reprova quem apontar para a porta ou
   para o painel do outro sistema.

   O `<div className="dm">` não é enfeite: é onde nascem todas as variáveis de
   cor e espaçamento desta folha. Fora dele, nada deste sistema existe. Ver o
   cabeçalho de `app/demandas/demandas.css`.

   O PORTÃO. Três estados, e cada um tem uma saída diferente:
     · sem sessão e sem link  → a porta, com Entrar e Cadastre-se;
     · com sessão, mas sem cadastro em demandas → diz isso com todas as
       letras e mostra o e-mail, em vez de devolver a pessoa para o login num
       laço (ela ESTÁ logada; o login não resolveria nada);
     · identificada → o sistema.
*/

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ehRecusaDeIdentidade, esquecerToken, quemSou } from '@/lib/demandas/api';
import { iniciais, rotPapel } from '@/lib/demandas/regras';
import { sb } from '@/lib/supabase';
import type { Eu } from '@/lib/demandas/tipos';
import { Icone, type NomeDoIcone } from './Icone';
import { Porta } from './Porta';
import { Aviso, Esqueleto, Toast, Vazio, useFitaQueRola, type ToastPedido } from './Ui';

/* QUEM SOU EU, UMA VEZ POR TELA — NÃO DUAS.

   `useEu` era estado por instância. A casca chamava, e as telas de lista,
   nova e ajustes chamavam de novo: DUAS idas ao banco por carga em três das
   cinco telas, para responder a mesma pergunta. Pior que o custo: as duas
   respostas podem discordar se a sessão virar no meio, e aí a casca decide o
   portão com uma e a tela decide as abas com a outra.

   A casca pergunta, o contexto distribui, e `useEu()` continua com a mesma
   assinatura. */
type Ctx = {
  eu: Eu | null; carregando: boolean; semSistema?: boolean;
  /* 94 · a tela de avisos zera o contador da casca quando a pessoa os abre.
     Sem isto o número continuava na barra até a próxima carga, dizendo que
     havia coisa nova sobre o que ela acabou de ler. */
  zerarAvisos?: () => void;
  /* o perfil salva nome e telefone; sem isto a lateral continuava com o nome
     antigo até recarregar */
  ajustarEu?: (p: Partial<Eu>) => void;
  /* o toast: o sucesso que muda de tela ou some da tela. Quem mostra é a
     casca, para ele sobreviver à troca de página que o motivou. */
  toast?: (t: ToastPedido) => void;
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
         era tentado. Agora, se a resposta for negativa E houver token
         guardado, o token é descartado e a pergunta é refeita. */
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

const atendeDe = (eu: Eu) => eu.atende ?? eu.papel !== 'solicitante';

/* AS ABAS DO CELULAR, DESDE A MIGRAÇÃO 94.

   "Quem sou, onde estou, minhas demandas, o que precisa da minha atenção,
   qual é o próximo passo." Cada aba é uma dessas respostas:

     Início        quem sou, o que espera por mim, minhas demandas
     Atender       só para quem atende: a fila, o que está comigo
     Nova          o próximo passo mais comum
     Avisos        o que mudou desde a última vez (com o número)
     Perfil        meus dados, o que posso fazer, sair

   "Atender", e não "Atendimento": medido em 22/09 com a Inter, a barra de
   quem atende escondia "Perfil" (onde mora o Sair) em 320 e em 360, os dois
   celulares mais comuns da igreja. A página continua se chamando Atendimento
   no título; a aba diz o que se faz lá.

   A ADMINISTRAÇÃO NÃO ESTÁ AQUI, DE PROPÓSITO. O pedido foi "não misture
   isso com a interface do usuário comum". No celular quem administra chega
   lá pelo Perfil e pelo Início; no desktop, pela lateral, separada das
   seções e só para quem administra. */
type Aba = { href: string; rot: string; icone: NomeDoIcone; n?: number };
const ABAS = (eu: Eu): Aba[] => {
  const a: Aba[] = [{ href: '/demandas', rot: 'Início', icone: 'inicio' }];
  if (atendeDe(eu)) a.push({ href: '/demandas/atendimento', rot: 'Atender', icone: 'atender' });
  a.push({ href: '/demandas/nova', rot: 'Nova', icone: 'nova' });
  a.push({ href: '/demandas/avisos', rot: 'Avisos', icone: 'avisos', n: eu.avisos || 0 });
  a.push({ href: '/demandas/perfil', rot: 'Perfil', icone: 'perfil' });
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

/* ------------------------------------------------------------- a lateral */

type ItemLateral = { href: string; rot: string; icone: NomeDoIcone; n?: number; ativo: boolean };

function Item({ i }: { i: ItemLateral }) {
  return (
    <Link className="dm-nav-item" href={i.href} aria-current={i.ativo ? 'page' : undefined}>
      <Icone nome={i.icone} />
      <span>{i.rot}</span>
      {i.n ? <span className="dm-nav-n" aria-label={`${i.n} ${i.n === 1 ? 'novo' : 'novos'}`}>{i.n > 99 ? '99+' : i.n}</span> : null}
    </Link>
  );
}

function nomeCurto(nome: string): string {
  const p = (nome || '').trim().split(/\s+/).filter(Boolean);
  return p.length > 2 ? `${p[0]} ${p[p.length - 1]}` : p.join(' ');
}

function QuemSou({ eu, ativo }: { eu: Eu; ativo: boolean }) {
  return (
    <Link className="dm-eu" href="/demandas/perfil" aria-current={ativo ? 'page' : undefined}>
      <span className="dm-avatar" aria-hidden="true">{iniciais(eu.nome)}</span>
      <span className="dm-eu-txt">
        {/* primeiro e último nome: o nome inteiro virava "Maria Aparecida
            Gonçal…" em toda largura de desktop */}
        <b>{nomeCurto(eu.nome)}</b>
        {/* o setor, que é o que distingue a pessoa aqui; o papel já está
            nas seções da lateral ("Administração" logo acima), e
            "Administração · Tecnologia…" saía cortado em todo desktop */}
        <small>{eu.setor || rotPapel(eu.papel)}</small>
      </span>
    </Link>
  );
}

function Lateral({ eu, caminho }: { eu: Eu; caminho: string }) {
  const atende = atendeDe(eu);
  const itens: ItemLateral[] = [
    { href: '/demandas', rot: 'Início', icone: 'inicio', ativo: abaAtual(caminho, '/demandas', atende) },
  ];
  if (atende) {
    itens.push({ href: '/demandas/atendimento', rot: 'Atendimento', icone: 'atender',
                 ativo: caminho.startsWith('/demandas/atendimento') || (caminho.startsWith('/demandas/d/') && atende) });
    itens.push({ href: '/demandas/numeros', rot: 'Números', icone: 'numeros', ativo: caminho.startsWith('/demandas/numeros') });
  }
  itens.push({ href: '/demandas/avisos', rot: 'Avisos', icone: 'avisos', n: eu.avisos || 0, ativo: caminho === '/demandas/avisos' });
  return (
    <aside className="dm-lateral" aria-label="Navegação">
      <div className="dm-lateral-topo">
        <div className="dm-marca">
          <Link href="/demandas" className="dm-logo" aria-label="Demandas, início">GUI{'>'}</Link>
          <span className="dm-marca-nome">Demandas</span>
        </div>
      </div>
      <div className="dm-lateral-nova">
        <Link className="dm-btn dm-pri" href="/demandas/nova" aria-current={caminho === '/demandas/nova' ? 'page' : undefined}>
          <Icone nome="nova" />Nova demanda
        </Link>
      </div>
      <nav className="dm-nav" aria-label="Seções">
        {itens.map(i => <Item key={i.href} i={i} />)}
      </nav>
      <div className="dm-lateral-pe">
        {eu.papel === 'admin' ? (
          <Item i={{ href: '/demandas/admin', rot: 'Administração', icone: 'admin', ativo: caminho.startsWith('/demandas/admin') }} />
        ) : null}
        <QuemSou eu={eu} ativo={caminho === '/demandas/perfil'} />
      </div>
    </aside>
  );
}

/* AS SEÇÕES DA ADMINISTRAÇÃO. A seção vem da URL (`?secao=`), e
   `/demandas/admin` sem nada é "pessoas". `useSearchParams` pede o Suspense
   na pré-renderização; sem ele o build reprova a página inteira. Fica aqui,
   em volta só da navegação, para as outras telas não pagarem por uma
   leitura que só a administração faz. */
const SECOES_ADMIN: { v: string; rot: string; icone: NomeDoIcone }[] = [
  { v: 'pessoas', rot: 'Pessoas', icone: 'pessoas' }, { v: 'setores', rot: 'Setores', icone: 'setores' },
  { v: 'categorias', rot: 'Categorias', icone: 'categorias' }, { v: 'anexos', rot: 'Anexos', icone: 'anexos' },
];
function SecoesDaAdministracao({ caminho, secaoAberta, forma }: {
  caminho: string; secaoAberta: string | null; forma: 'lateral' | 'fita';
}) {
  /* a ficha de uma pessoa é filha de Pessoas */
  const secao = caminho === '/demandas/admin' ? (secaoAberta || 'pessoas')
    : caminho.startsWith('/demandas/admin/pessoas') ? 'pessoas' : '';
  const fita = useFitaQueRola<HTMLElement>();
  return (
    <nav className={`${forma === 'lateral' ? 'dm-nav dm-adm-faixa' : 'dm-subabas dm-adm-fita'}`} aria-label="Seções da administração"
      ref={forma === 'fita' ? fita : undefined}>
      {SECOES_ADMIN.map(x => (
        <Link key={x.v} className={forma === 'lateral' ? 'dm-nav-item' : undefined}
          href={x.v === 'pessoas' ? '/demandas/admin' : `/demandas/admin?secao=${x.v}`}
          aria-current={secao === x.v ? 'page' : undefined}>
          {forma === 'lateral' ? <Icone nome={x.icone} /> : null}
          {forma === 'lateral' ? <span>{x.rot}</span> : x.rot}
        </Link>
      ))}
    </nav>
  );
}
function SecoesPelaUrl({ caminho, forma }: { caminho: string; forma: 'lateral' | 'fita' }) {
  const busca = useSearchParams();
  return <SecoesDaAdministracao caminho={caminho} secaoAberta={busca?.get('secao') ?? null} forma={forma} />;
}
function Secoes({ caminho, forma }: { caminho: string; forma: 'lateral' | 'fita' }) {
  return (
    <Suspense fallback={<SecoesDaAdministracao caminho={caminho} secaoAberta={null} forma={forma} />}>
      <SecoesPelaUrl caminho={caminho} forma={forma} />
    </Suspense>
  );
}

function LateralDaAdministracao({ eu, caminho }: { eu: Eu; caminho: string }) {
  return (
    <aside className="dm-lateral dm-lateral-adm" aria-label="Navegação da administração">
      <div className="dm-lateral-topo">
        <div className="dm-marca">
          <Link href="/demandas" className="dm-logo" aria-label="Demandas, início">GUI{'>'}</Link>
          <span className="dm-marca-nome">Demandas</span>
        </div>
      </div>
      <Link className="dm-nav-item dm-nav-voltar" href="/demandas">
        <Icone nome="portal" /><span>Voltar ao portal</span>
      </Link>
      <div>
        <div className="dm-nav-grupo">Administração</div>
        <Secoes caminho={caminho} forma="lateral" />
      </div>
      <div className="dm-lateral-pe">
        <QuemSou eu={eu} ativo={false} />
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------- o portão */

function CascaInterna({ children, admin }: { children: React.ReactNode; admin?: boolean }) {
  const ctx = useEu() as Ctx;
  const { eu, carregando } = ctx;
  const semSistema = !!ctx.semSistema;
  const caminho = usePathname() || '/demandas';
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

  /* SEM SESSÃO, DIRETO PARA A PORTA, E COM O CAMINHO DE VOLTA — 23/09/2026.
     Havia uma tela no meio ("Entre para ver as suas demandas") com a mesma
     frase da porta e um "Entrar" que não guardava de onde a pessoa vinha:
     quem abria a ficha #105 pelo WhatsApp sem sessão tocava em Entrar, fazia
     o login e caía no Início, e não na #105. Agora a casca leva à porta com
     `?volta=`; a porta só aceita o que, normalizado, continua em
     `/demandas` (ver `destino()` em `app/demandas/entrar/page.tsx`). */
  const router = useRouter();
  const semSessao = !carregando && !eu && !semSistema && email === null;
  useEffect(() => {
    if (!semSessao) return;
    const aqui = caminho + (typeof window !== 'undefined' ? window.location.search : '');
    router.replace('/demandas/entrar' + (aqui === '/demandas' ? '' : '?volta=' + encodeURIComponent(aqui)));
  }, [semSessao, caminho, router]);

  if (carregando) {
    return (
      <div className="dm dm-casca">
        <aside className="dm-lateral" aria-hidden="true">
          <div className="dm-lateral-topo">
            <div className="dm-marca"><span className="dm-logo">GUI{'>'}</span><span className="dm-marca-nome">Demandas</span></div>
          </div>
        </aside>
        <main className="dm-corpo"><Esqueleto forma="lista" /></main>
      </div>
    );
  }

  if (!eu) {
    /* O SISTEMA NÃO ESTÁ INSTALADO NESTE AMBIENTE.

       Este ramo vem antes do de "não cadastrado" porque ele é a causa, e o
       outro era o sintoma vestido de instrução. Medido em produção em
       20/09/2026: o schema `demandas` não existia naquele banco, e a tela
       mandava o dono do sistema procurar um cadastro que não podia existir.
       Aqui não há o que a pessoa possa fazer sozinha, então a tela não finge
       que há: diz o que falta. */
    if (semSistema) {
      return (
        <Porta>
          <div className="dm-rot">Indisponível</div>
          <h1>O sistema de demandas ainda não foi instalado</h1>
          <p className="dm-auth-sub">
            As telas estão no ar, mas o banco deste ambiente ainda não tem as tabelas de demandas.
          </p>
          <Aviso tom="warn">
            Não é cadastro faltando, e não há nada que você possa fazer por aqui: falta aplicar
            a migração do banco. Quem administra aplica <b>supabase/50-demandas.sql</b> e as seguintes.
          </Aviso>
        </Porta>
      );
    }
    if (email === undefined) return <Porta><Esqueleto linhas={3} /></Porta>;
    if (email) {
      /* 94 · A FRASE MANDAVA PROCURAR O ADMINISTRADOR, E AGORA HÁ UMA PORTA.
         O cadastro é da própria pessoa, com o e-mail com que ela ACABOU de
         entrar, e a tela aponta para ele. */
      return (
        <Porta>
          <div className="dm-rot">Cadastro</div>
          <h1>Falta só o seu cadastro</h1>
          <p className="dm-auth-sub">
            Você entrou como <b>{email}</b>. Leva um minuto: nome, WhatsApp e setor.
          </p>
          <Link className="dm-btn dm-pri dm-larga" href="/demandas/cadastro">Fazer meu cadastro</Link>
        </Porta>
      );
    }
    /* A PORTA PRÓPRIA — 22/09/2026. `/demandas/entrar` não tem a rota do
       outro sistema em lugar nenhum, e só aceita `?volta=` que comece com
       `/demandas`. Enquanto o `router.replace` de cima leva para lá, fica a
       moldura da porta; o link, só para leitor de tela, diz para onde a
       tela está indo. */
    return (
      <Porta>
        <Esqueleto linhas={3} oQue="Abrindo a entrada" />
        <Link className="dm-so-leitor" href="/demandas/entrar">Entrar</Link>
      </Porta>
    );
  }

  const toast = ctx.toastAtual && ctx.fecharToast ? <Toast t={ctx.toastAtual} fechar={ctx.fecharToast} /> : null;

  /* 94 · A ADMINISTRAÇÃO É OUTRA SALA.

     Mesmo portão, outra navegação: a lateral troca as seções do portal pelas
     da administração, com "Voltar ao portal" no alto (no celular, o topo diz
     "Portal" e as quatro seções viram uma fita). Quem não administra nem vê o
     conteúdo: a tela diz que a área é restrita. Isso é CLAREZA; a tranca de
     verdade é do banco, e cada função da administração (`dem_pessoas`,
     `dem_pessoa`, `dem_ajustar`) responde `SO_ADMIN` para qualquer outro
     papel, com ou sem esta tela. */
  if (admin) {
    return (
      <div className="dm dm-casca dm-adm">
        <LateralDaAdministracao eu={eu} caminho={caminho} />
        <header className="dm-topo">
          <Link className="dm-topo-volta" href="/demandas"><Icone nome="voltar" />Portal</Link>
          <span className="dm-topo-sala">Administração</span>
        </header>
        <main className="dm-corpo">
          {eu.papel === 'admin' ? (
            <>
              <div className="dm-so-celular"><Secoes caminho={caminho} forma="fita" /></div>
              {children}
            </>
          ) : (
            <Vazio titulo="Esta área é de quem administra o sistema." solto>
              Área restrita. Seu acesso no portal continua o mesmo.
              <div><Link className="dm-btn" href="/demandas">Voltar ao portal</Link></div>
            </Vazio>
          )}
        </main>
        {toast}
      </div>
    );
  }

  /* A Nova tem barra fixa própria no rodapé do celular (o "Enviar"). A
     ficha também, QUANDO há gesto: sem gesto (concluída, cancelada, só
     leitura) as abas voltam, e quem abriu não fica sem saída. Quem avisa é
     a ficha, com a marca `.dm-sem-barra`; enquanto ela carrega, as abas
     ficam escondidas, para não piscarem antes da barra (ver o CSS). */
  const semAbas = caminho === '/demandas/nova';
  const naFicha = caminho.startsWith('/demandas/d/');
  const atende = atendeDe(eu);
  return (
    <div className={`dm dm-casca ${semAbas ? '' : 'dm-com-abas'} ${naFicha ? 'dm-na-ficha' : ''}`}>
      <Lateral eu={eu} caminho={caminho} />
      <header className="dm-topo">
        <Link href="/demandas" className="dm-marca" aria-label="Demandas, início">
          <span className="dm-logo" aria-hidden="true">GUI{'>'}</span>
          <span className="dm-marca-nome">Demandas</span>
        </Link>
        <Link className="dm-topo-eu" href="/demandas/perfil" aria-label={`Perfil de ${eu.primeiro_nome || eu.nome}`}>
          <span className="dm-avatar" aria-hidden="true">{iniciais(eu.nome)}</span>
        </Link>
      </header>
      <main className="dm-corpo">{children}</main>
      {!semAbas ? (
        <nav className="dm-abas" aria-label="Seções de demandas">
          {ABAS(eu).map(a => (
            <Link key={a.href} className="dm-aba" href={a.href}
              aria-current={abaAtual(caminho, a.href, atende) ? 'page' : undefined}>
              {a.href === '/demandas/nova'
                ? <span className="dm-aba-nova"><Icone nome="nova" /></span>
                : <Icone nome={a.icone} />}
              {a.rot}
              {/* o número é contado pelo servidor (`dem_quem_sou.avisos`) e
                  lido por leitor de tela como frase, não como "3" solto */}
              {a.n ? <span className="dm-aba-n" aria-label={`${a.n} ${a.n === 1 ? 'novo' : 'novos'}`}>{a.n > 99 ? '99+' : a.n}</span> : null}
            </Link>
          ))}
        </nav>
      ) : null}
      {toast}
    </div>
  );
}

/* O PROVEDOR. Pergunta "quem sou eu" UMA vez e distribui.

   Ele precisa estar por FORA de `CascaInterna` porque a casca também consome
   o contexto — quem pergunta não pode ser quem responde. O gancho continua
   funcionando sem provedor (ver `useEu`), então nada que já existia quebra. */
/* O RECADO QUE ATRAVESSA A TROCA DE TELA — 23/09/2026. Cada tela monta a
   própria casca (o `layout.tsx` só repassa), então um recado pedido logo
   antes de `router.push` morria com a casca de origem: quem mandava uma
   demanda para outro setor caía na fila sem recado nenhum, e a demanda só
   tinha sumido. Guardado aqui, ele aparece na casca de destino, uma vez. */
const RECADO = 'demandas.recado';
export function recadoParaDepois(t: { texto: string; ver?: string }) {
  try { sessionStorage.setItem(RECADO, JSON.stringify({ texto: t.texto, ver: t.ver })); } catch { /* sem armazenamento */ }
}

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
  /* o recado que atravessou a troca de tela (ver `recadoParaDepois`) */
  useEffect(() => {
    try {
      const guardado = sessionStorage.getItem(RECADO);
      if (!guardado) return;
      sessionStorage.removeItem(RECADO);
      const t = JSON.parse(guardado) as { texto?: string; ver?: string };
      if (t && typeof t.texto === 'string') setToast({ texto: t.texto, ver: typeof t.ver === 'string' ? t.ver : undefined });
    } catch { /* sem armazenamento, sem recado: a tela de destino continua certa */ }
  }, []);
  return (
    <Contexto.Provider value={{ eu, carregando, semSistema, zerarAvisos, ajustarEu,
                                toast: pedirToast, toastAtual: toast, fecharToast }}>
      <CascaInterna admin={admin}>{children}</CascaInterna>
    </Contexto.Provider>
  );
}
