'use client';
/* A ADMINISTRAÇÃO · migração 94.

   Separada da interface comum, com topo próprio (a faixa escura de
   `Casca admin`), e com quatro seções: Pessoas, Setores, Categorias e
   Anexos (a lista de sites aceitos, migração 95).

   PESSOAS é a base central que o pedido cobrou: "uma pessoa deve existir uma
   única vez na base". A lista mostra todo mundo, ativo e inativo, com papel,
   setor e função; cada linha abre a ficha da pessoa, onde se edita, muda o
   papel, define o escopo, desativa e se lê o histórico. Os pedidos de papel
   (quem se cadastrou e disse "sou líder" ou "atendo demandas") ficam no topo,
   porque são a única coisa daqui que alguém está esperando.

   Nada disto é segurança: `dem_pessoas`, `dem_pessoa` e `dem_ajustar`
   respondem SO_ADMIN para qualquer outro papel, com ou sem esta tela. */

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Casca, { useEu } from '@/components/demandas/Casca';
import { Categorias, Setores } from '@/components/demandas/Configuracao';
import { Aviso, Cabecalho, Esqueleto, Pill, Secao, Vazio } from '@/components/demandas/Ui';
import { Icone } from '@/components/demandas/Icone';
import { ajustar, ajustarAnexos, bases, pessoas } from '@/lib/demandas/api';
import { PAPEIS, iniciais, nomeDoSite, recadoDoErro, rotPapel } from '@/lib/demandas/regras';
import type { Bases, Membro, RegraDeAnexo } from '@/lib/demandas/tipos';

export default function Pagina() {
  /* `useSearchParams` na casca e aqui pede o Suspense na pré-renderização */
  return <Suspense fallback={null}><Casca admin><Administracao /></Casca></Suspense>;
}

type Secao = 'pessoas' | 'setores' | 'categorias' | 'anexos';
const SECOES: [Secao, string][] = [
  ['pessoas', 'Pessoas'], ['setores', 'Setores'], ['categorias', 'Categorias'], ['anexos', 'Anexos'],
];

function Administracao() {
  const ctx = useEu();
  const eu = ctx.eu;
  const [b, setB] = useState<Bases | null>(null);
  const [ms, setMs] = useState<Membro[] | null>(null);
  const busca = useSearchParams();
  /* a seção vem da URL: as abas da faixa preta são links, e "Portal" também.
     Fora da lista, fica em Pessoas. */
  const pedida = busca?.get('secao') as Secao | null;
  const secao: Secao = pedida && SECOES.some(([v]) => v === pedida) ? pedida : 'pessoas';
  const [erro, setErro] = useState('');
  const [indo, setIndo] = useState(false);

  const recarregar = useCallback(async () => {
    const [x, p] = await Promise.all([bases(), pessoas()]);
    /* o erro de cada chamada aparece: sem isto a tela ficava em esqueleto
       eterno quando uma das duas falhava (a mesma armadilha que os Ajustes
       antigos pagaram em 20/09) */
    if (x.ok) setB({ setores: x.setores, categorias: x.categorias, anexos: x.anexos });
    else setErro(recadoDoErro(x, 'carregar os setores'));
    if (p.ok) setMs(p.membros); else setErro(recadoDoErro(p, 'carregar as pessoas'));
  }, []);
  useEffect(() => { if (eu?.papel === 'admin') recarregar(); }, [eu, recarregar]);

  /* 24/09/2026 (auditoria R11): Setores e Categorias salvavam em silêncio,
     e a recusa aparecia no alto da página, 1750px acima do select em 390,
     com o select voltando sozinho ao valor antigo. Agora o acerto diz
     "Salvo" e a recusa leva a tela até o aviso. */
  async function salvar(o: 'setor' | 'categoria', d: Record<string, unknown>) {
    setIndo(true); setErro('');
    const r = await ajustar(o, d);
    setIndo(false);
    if (!r.ok) {
      setErro(recadoDoErro(r, 'salvar'));
      requestAnimationFrame(() => document.querySelector('.dm-aviso.dm-bad')
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
      return false;
    }
    await recarregar();
    ctx.toast?.({ texto: o === 'setor' ? 'Setor salvo.' : 'Categoria salva.' });
    return true;
  }

  const rotSecao = SECOES.find(([v]) => v === secao)?.[1] || 'Pessoas';
  if (erro && (!b || !ms)) {
    return (
      <>
        <Cabecalho sobre="Administração" titulo={rotSecao} />
        <Aviso tom="bad">{erro}</Aviso>
        <button type="button" className="dm-btn dm-tentar" onClick={() => { setErro(''); recarregar(); }}>Tentar de novo</button>
      </>
    );
  }
  if (!b || !ms) return <Esqueleto forma="lista" />;

  const ativas = ms.filter(m => m.ativo !== false).length, inativas = ms.filter(m => m.ativo === false).length;
  const SUB: Record<Secao, string> = {
    pessoas: '',
    setores: 'Quem recebe demanda e o teto de gasto sem aprovação de cada setor.',
    categorias: 'A triagem: para qual setor cada tipo de pedido vai, e o que ele exige.',
    anexos: 'Quais links entram como anexo nas demandas.',
  };
  /* AS QUATRO SEÇÕES COM A MESMA BORDA DIREITA — 23/09/2026. O limite de
     largura morava só em Setores e Categorias (a tabela de cinco colunas não
     esticava até 1.280px), e a borda pulava de 1.327 para 1.399 ao trocar de
     aba em 1440. Agora o limite é da página inteira, cabeçalho junto. */
  return (
    <div className="dm-limite">
      <Cabecalho sobre="Administração" titulo={rotSecao}
        meta={secao === 'pessoas'
          /* "1 ativa", e não "1 ativas": visto em produção, com a base de uma pessoa só */
          ? <span className="dm-num">{contar(ativas, 'ativa', 'ativas')} · {contar(inativas, 'inativa', 'inativas')}</span>
          : <span>{SUB[secao]}</span>}
        acoes={secao === 'pessoas' ? (
          /* um preto por tela: enquanto há pedido de papel esperando, o
             primário é "Aceitar", e "Nova pessoa" fica em contorno */
          <Link className={ms.some(m => m.papel_pedido) ? 'dm-btn' : 'dm-btn dm-pri'} href="/demandas/admin/pessoas/nova">
            <Icone nome="nova" />Nova pessoa
          </Link>
        ) : null} />
      {erro ? <Aviso tom="bad">{erro}</Aviso> : null}

      {secao === 'pessoas' ? <Pessoas ms={ms} b={b} recarregar={recarregar} /> : null}
      {secao === 'setores' ? <Setores b={b} indo={indo} salvar={salvar} /> : null}
      {secao === 'categorias' ? <Categorias b={b} indo={indo} salvar={salvar} /> : null}
      {secao === 'anexos'
        ? <Anexos regra={b.anexos} trocar={anexos => setB(x => (x ? { ...x, anexos } : x))}
            toast={ctx.toast} />
        : null}
    </div>
  );
}

/* ------------------------------------------------------------------ anexos

   A LISTA DE SITES · migração 95. Ligada, só entra anexo de site da lista (e
   dos subdomínios dele); quem pede vê a lista antes de colar o link. O banco
   limpa o que se cola (`https://www.site.com/x` vira `site.com`) e recusa
   o que não é site, o domínio de país inteiro e o site onde qualquer pessoa
   publica página. Tirar é reversível: o recado traz "Desfazer". */
function Anexos({ regra, trocar, toast }: {
  regra?: RegraDeAnexo; trocar: (r: RegraDeAnexo) => void;
  toast?: (t: { texto: string; desfazer?: () => void }) => void;
}) {
  const [site, setSite] = useState('');
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState('');
  const [feito, setFeito] = useState<{ txt: string; desfaz?: string } | null>(null);

  if (!regra) {
    return <Aviso tom="warn">A lista de sites chega com a atualização do banco. Recarregue daqui a pouco.</Aviso>;
  }

  async function pedir(d: { restrito?: boolean; incluir?: string; tirar?: string },
                       ok: { txt: string; desfaz?: string }) {
    setIndo(true); setErro(''); setFeito(null);
    const r = await ajustarAnexos(d);
    setIndo(false);
    if (!r.ok) {
      setErro(r.erro === 'SITE_ABERTO' && r.site
        ? `Em ${r.site} qualquer pessoa publica página. Inclua o endereço exato, como igreja.${r.site}.`
        : recadoDoErro(r, 'salvar'));
      return false;
    }
    trocar({ restrito: r.restrito, sites: r.sites });
    /* o sucesso vira toast (com Desfazer quando é tirar um site); sem toast
       (fora da casca, num teste), fica o aviso em linha */
    if (toast) {
      toast({ texto: ok.txt, desfazer: ok.desfaz ? () => { pedir({ incluir: ok.desfaz }, { txt: `${ok.desfaz} voltou para a lista.` }); } : undefined });
    } else setFeito(ok);
    return true;
  }

  return (
    <>
      {erro ? <Aviso tom="bad">{erro}</Aviso> : null}
      {feito ? (
        <Aviso tom="ok">
          <div className="dm-entre">
            <span>{feito.txt}</span>
            {feito.desfaz ? (
              <button type="button" className="dm-btn dm-peq" disabled={indo}
                onClick={() => pedir({ incluir: feito.desfaz }, { txt: `${feito.desfaz} voltou para a lista.` })}>
                Desfazer
              </button>
            ) : null}
          </div>
        </Aviso>
      ) : null}

      <div className="dm-config">
        <section className="dm-config-sec">
          <div className="dm-config-lado">
            <h2>Quais links entram</h2>
            <p>
              {regra.restrito
                ? 'Link de outro site é recusado, e quem pede vê os sites aceitos antes de colar.'
                : 'Qualquer link https entra como anexo.'}
            </p>
          </div>
          <div className="dm-config-corpo">
            <div className="dm-seg" role="group" aria-label="Quais links entram como anexo">
              <button type="button" aria-pressed={!regra.restrito} disabled={indo}
                onClick={() => { if (regra.restrito) pedir({ restrito: false }, { txt: 'Qualquer site entra de novo.' }); }}>
                Qualquer site
              </button>
              <button type="button" aria-pressed={regra.restrito} disabled={indo}
                onClick={() => { if (!regra.restrito) pedir({ restrito: true }, { txt: 'Agora só entram os sites da lista.' }); }}>
                Só os da lista
              </button>
            </div>
          </div>
        </section>

        <section className="dm-config-sec">
          <div className="dm-config-lado">
            <h2>{contar(regra.sites.length, 'site na lista', 'sites na lista')}</h2>
            <p>Pode colar o link inteiro: fica só o site. Vale também para os subdomínios dele.</p>
          </div>
          <div className="dm-config-corpo">
            <form className="dm-linha dm-criar" onSubmit={async e => {
              e.preventDefault();
              const v = site.trim();
              if (!v) return;
              if (await pedir({ incluir: v }, { txt: 'Site incluído.' })) setSite('');
            }}>
              <input className="dm-ctl dm-cresce" value={site} placeholder="Ex.: drive.google.com" aria-label="Site a incluir"
                inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={e => setSite(e.target.value)} />
              <button type="submit" className="dm-btn dm-pri" disabled={indo || !site.trim()}>Incluir</button>
            </form>
            {regra.sites.length === 0 ? (
              <Vazio titulo="Nenhum site na lista." solto>
                {regra.restrito ? 'Com a lista ligada e vazia, nenhum anexo entra.' : 'Inclua os sites antes de ligar a lista.'}
              </Vazio>
            ) : (
              /* pelo NOME do serviço, e não pelo domínio: "OneDrive" era o
                 primeiro (1drv.ms) e o décimo oitavo (onedrive.live.com) */
              <ul className="dm-sites dm-tabela">
                {porNome(regra.sites).map(x => (
                  <li key={x}>
                    <Icone nome="link" />
                    <span className="dm-cresce">
                      {nomeDoSite(x) !== x ? <><b>{nomeDoSite(x)}</b> <span className="dm-mudo">{x}</span></> : <b>{x}</b>}
                    </span>
                    <button type="button" className="dm-btn dm-peq dm-txt" disabled={indo}
                      aria-label={`Tirar ${x} da lista`}
                      onClick={() => pedir({ tirar: x }, { txt: `${x} saiu da lista.`, desfaz: x })}>Tirar</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

const contar = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function porNome(sites: string[]): string[] {
  return sites.slice().sort((a, b) =>
    nomeDoSite(a).localeCompare(nomeDoSite(b), 'pt-BR') || a.localeCompare(b, 'pt-BR'));
}

/* ------------------------------------------------------------------ pessoas */
function Pessoas({ ms, b, recarregar }: { ms: Membro[]; b: Bases; recarregar: () => Promise<void> }) {
  const [busca, setBusca] = useState('');
  const [situ, setSitu] = useState<'ativas' | 'inativas' | 'todas'>('ativas');
  const [papel, setPapel] = useState('');
  const [setor, setSetor] = useState('');
  /* no celular papel e setor ficam atrás de "Filtros": dois selects de 50%
     cortavam "Todos os setor…" em 390 e ficavam idênticos em 320 ("Todos
     os …" e "Todos os …"). Filtro ligado mantém os dois à vista. */
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const nomeSetor = (id: string | null) => b.setores.find(s => s.id === id)?.nome || 'sem setor';

  const pedidos = ms.filter(m => m.ativo !== false && m.papel_pedido);
  const vistas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const soDig = t.replace(/\D/g, '');
    return ms.filter(m =>
      (situ === 'todas' || (situ === 'ativas' ? m.ativo !== false : m.ativo === false))
      && (!papel || m.papel === papel)
      && (!setor || m.setor_id === setor)
      && (!t || m.nome.toLowerCase().includes(t)
          || (m.auth_email || '').includes(t) || (m.email || '').includes(t)
          || (!!soDig && soDig.length >= 4 && (m.telefone || '').includes(soDig))));
  }, [ms, busca, situ, papel, setor]);

  const filtrado = !!busca || !!papel || !!setor || situ !== 'ativas';
  return (
    <>
      {pedidos.length ? <Pedidos pedidos={pedidos} nomeSetor={nomeSetor} recarregar={recarregar} /> : null}

      {/* os filtros numa linha só no desktop: situação à esquerda; papel,
          setor e a busca à direita. No celular: a busca em cima, a situação e
          "Filtros" embaixo, e papel e setor só quando pedidos. */}
      <div className={`dm-ferramentas dm-filtros ${filtrosAbertos || papel || setor ? 'dm-filtrando' : ''}`}>
        <div className="dm-seg" role="group" aria-label="Situação">
          {([['ativas', 'Ativas'], ['inativas', 'Inativas'], ['todas', 'Todas']] as const).map(([v, r]) => (
            <button key={v} type="button" aria-pressed={situ === v} onClick={() => setSitu(v)}>{r}</button>
          ))}
        </div>
        <button type="button" className="dm-btn dm-filtros-toggle" aria-expanded={filtrosAbertos || !!papel || !!setor}
          onClick={() => setFiltrosAbertos(x => !x)}>
          <Icone nome="filtro" /><span>Filtros</span>
          {papel || setor ? <span className="dm-selo">{(papel ? 1 : 0) + (setor ? 1 : 0)}</span> : null}
        </button>
        <div className="dm-ferramentas-dir">
          <select aria-label="Papel" value={papel} onChange={e => setPapel(e.target.value)} className="dm-ctl dm-filtro">
            <option value="">Todos os papéis</option>
            {PAPEIS.map(p => <option key={p.v} value={p.v}>{p.rot}</option>)}
          </select>
          <select aria-label="Setor" value={setor} onChange={e => setSetor(e.target.value)} className="dm-ctl dm-filtro dm-filtro-setor">
            <option value="">Todos os setores</option>
            {b.setores.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
          <label className="dm-busca dm-aberta">
            <Icone nome="busca" />
            <input type="search" aria-label="Procurar pessoa" placeholder="Nome, e-mail ou telefone"
              value={busca} onChange={e => setBusca(e.target.value)} />
          </label>
        </div>
      </div>

      {vistas.length === 0 ? (
        <div className="dm-tabela">
          <Vazio titulo="Ninguém com esse filtro." tom="filtro">
            Tire um filtro, ou cadastre a pessoa.
            {filtrado ? (
              <div>
                <button type="button" className="dm-btn dm-peq"
                  onClick={() => { setBusca(''); setPapel(''); setSetor(''); setSitu('ativas'); }}>Tirar os filtros</button>
              </div>
            ) : null}
          </Vazio>
        </div>
      ) : (
        <div className="dm-pessoas">
          <div className="dm-pessoa dm-pessoas-cab" aria-hidden="true">
            <span className="dm-p-nome">Nome</span>
            <span className="dm-p-papel">Papel</span>
            <span className="dm-p-setor">Setor</span>
            <span className="dm-p-funcao">Função</span>
          </div>
          {vistas.map(m => (
            <Link key={m.id} href={`/demandas/admin/pessoas/${m.id}`}
              className={m.ativo === false ? 'dm-pessoa dm-inativa' : 'dm-pessoa'}>
              <span className="dm-p-nome">
                <span className="dm-avatar" aria-hidden="true">{iniciais(m.nome)}</span>
                <span>
                  <b>{m.nome}</b>
                  <small>{m.auth_email || m.email || 'sem e-mail'}{m.origem === 'cadastro' ? ' · cadastro próprio' : ''}</small>
                </span>
              </span>
              <span className="dm-p-papel">
                <Pill>{rotPapel(m.papel)}</Pill>
                {/* inativa é cinza (não é erro), e o pedido de papel é âmbar:
                    parado esperando a decisão de alguém, como "Aguardando" */}
                {/* "Sem acesso", e não "Inativa": na linha de uma pessoa a
                    palavra não diz o gênero de ninguém (o filtro e a conta
                    concordam com "pessoas") */}
                {m.ativo === false ? <Pill>Sem acesso</Pill> : null}
                {m.papel_pedido ? <Pill tom="warn">Quer ser {rotPapel(m.papel_pedido)}</Pill> : null}
              </span>
              {/* setor e função num bloco só no celular (recuado como o
                  nome, e o ponto nunca sozinho no começo da linha); no
                  desktop o bloco some e cada um é a sua coluna */}
              <span className="dm-p-onde dm-sep">
                <span className="dm-sep-in">
                  <span className="dm-p-setor">{nomeSetor(m.setor_id)}</span>
                  <span className="dm-p-funcao">{m.funcao || ''}</span>
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}


/* OS PEDIDOS DE PAPEL: quem se cadastrou dizendo que lidera um ministério ou
   que atende demandas. A pessoa já usa o sistema como Membro; o que espera
   aqui é só o papel maior, e ele só vem com um toque do administrador. */
function Pedidos({ pedidos, nomeSetor, recarregar }: {
  pedidos: Membro[]; nomeSetor: (id: string | null) => string; recarregar: () => Promise<void>;
}) {
  const [indo, setIndo] = useState('');
  const [erro, setErro] = useState('');
  const ctx = useEu();
  async function decidir(m: Membro, decisao: 'aceitar' | 'recusar') {
    setIndo(m.id); setErro('');
    const r = await ajustar('pedido', { id: m.id, decisao });
    setIndo('');
    if (!r.ok) {
      setErro(r.erro === 'SETOR_NAO_ATENDE'
        ? `${m.nome.split(' ')[0]} está num setor que não atende demandas. Abra a ficha e acerte o setor antes de aceitar.`
        : recadoDoErro(r, 'decidir o pedido'));
      return;
    }
    await recarregar();
    /* a linha some da lista; o recado diz o que aconteceu com quem
       (24/09/2026, auditoria R12) */
    const nome = m.nome.split(' ')[0];
    ctx.toast?.({ texto: decisao === 'aceitar'
      ? `${nome} agora é ${rotPapel(m.papel_pedido)}.`
      : `Pedido de ${nome} recusado. Continua como Membro.` });
  }
  return (
    <Secao titulo="Pedidos de papel" n={pedidos.length} destaque sub="Quem se cadastrou pedindo para liderar ou atender. Até decidir, a pessoa usa o sistema como Membro.">
      {erro ? <Aviso tom="bad">{erro}</Aviso> : null}
      <div className="dm-tabela">
        {pedidos.map(m => (
          <div key={m.id} className="dm-pedido">
            <div>
              <Link className="dm-item-tit" href={`/demandas/admin/pessoas/${m.id}`}>{m.nome}</Link>
              <div className="dm-item-baixo dm-sep">
                <div className="dm-sep-in">
                  <Pill tom="warn">Quer ser {rotPapel(m.papel_pedido)}</Pill>
                  <span>{nomeSetor(m.setor_id)}</span>
                  {m.funcao ? <span>{m.funcao}</span> : null}
                </div>
              </div>
            </div>
            {/* o mesmo par, na mesma ordem, da ficha da pessoa e do rodapé da
                ficha da demanda: o secundário antes, o primário no fim */}
            <div className="dm-linha dm-par-cel">
              <button type="button" className="dm-btn" disabled={!!indo} onClick={() => decidir(m, 'recusar')}>Recusar</button>
              <button type="button" className="dm-btn dm-pri" disabled={!!indo} onClick={() => decidir(m, 'aceitar')}>Aceitar</button>
            </div>
          </div>
        ))}
      </div>
    </Secao>
  );
}
