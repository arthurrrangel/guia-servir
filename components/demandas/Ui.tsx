'use client';
/* AS PEÇAS · terceira versão, 23/09/2026.

   Poucas de propósito, e todas com o mesmo desenho: o cabeçalho de página, a
   seção, a faixa de números, o campo, o estado vazio, a pílula de estado.
   Uma tela nova se monta com elas, e é isso que faz as telas parecerem o
   mesmo produto: a regra de espaçamento, de tipo e de cor mora aqui e na
   folha, e não em cada página.

   O comportamento de cada uma não mudou nesta versão; os comentários que
   contam por que cada uma é como é continuam aqui, junto dela. */

import Link from 'next/link';
import { Children, cloneElement, createContext, isValidElement, useContext, useEffect, useState } from 'react';
import { comoOPdfChama, type EstadoDoPDF } from '@/lib/demandas/regras';
import { Icone, type NomeDoIcone } from './Icone';

type Tom = 'ok' | 'warn' | 'bad' | 'info';

const ICONE_DO_TOM: Record<Tom, NomeDoIcone> = { ok: 'ok', warn: 'alerta', bad: 'erro', info: 'info' };

export function Aviso({ tom, children }: { tom?: Tom; children: React.ReactNode }) {
  /* leitor de tela: erro interrompe, o resto é gentil. Um aviso que aparece
     depois de uma ação e não é anunciado deixa a pessoa cega sem saber o que
     aconteceu. Sem tom, o aviso é neutro (cinza), como a pílula de
     "Cancelada": o vermelho é de atraso e urgência, e só. */
  return (
    <div className={`dm-aviso ${tom ? `dm-${tom}` : ''}`} role={tom === 'bad' ? 'alert' : 'status'}>
      <Icone nome={tom ? ICONE_DO_TOM[tom] : 'info'} />
      <div>{children}</div>
    </div>
  );
}

export function Pill({ tom, children }: { tom?: Tom; children: React.ReactNode }) {
  return <span className={`dm-pill ${tom ? 'dm-' + tom : ''}`}>{children}</span>;
}

/* O TOM DE CADA ESTADO, UM SÓ PARA O SISTEMA INTEIRO.

   A pílula dizia a cor pela COLUNA `status` (`tomPill`): "Aguardando
   aprovação", "Aguardando informações" e "Aguardando terceiros" saíam da
   mesma trava com o mesmo âmbar, e "Em execução" e "Aprovada" saíam sem cor
   nenhuma, iguais a "Aberta". Agora o tom vem do NOME que o documento dá ao
   estado (`comoOPdfChama`), que é o que a pessoa lê:

     verde    Concluída                      acabou
     azul     Em execução · Aprovada         anda, e alguém está com ela
     âmbar    Aguardando … · Reaberta        parou esperando alguém
     cinza    Aberta · Cancelada             ninguém pegou, ou não vai andar

   Vermelho não é estado: é ATRASO e URGÊNCIA, que moram em pílulas próprias.
   Assim o vermelho continua querendo dizer uma coisa só. */
export function tomDoEstado(n: EstadoDoPDF): Tom | undefined {
  switch (n) {
    case 'Concluída': return 'ok';
    case 'Em execução': case 'Aprovada': return 'info';
    case 'Aguardando aprovação': case 'Aguardando informações': case 'Aguardando terceiros': case 'Reaberta':
      return 'warn';
    default: return undefined;
  }
}

/* A PRIORIDADE NÃO É ESTADO, E NÃO USA A COR DE ESTADO — 23/09/2026.

   "Alta" saía numa pílula âmbar ao lado de "Aguardando aprovação", também
   âmbar: a mesma cor dizendo duas coisas na mesma coluna, contra a regra de
   que o tom quer dizer a mesma coisa em qualquer tela. A prioridade ganhou
   forma própria, sem fundo: uma seta (alta) ou duas (urgente), e só a
   urgente é vermelha, porque vermelho é atraso e urgência. Baixa e normal
   não aparecem: é o que se espera de toda demanda. */
export function Prio({ p }: { p: string | null | undefined }) {
  if (p !== 'alta' && p !== 'urgente') return null;
  return (
    <span className={`dm-prio ${p === 'urgente' ? 'dm-prio-urgente' : ''}`}>
      <Icone nome={p === 'urgente' ? 'urgente' : 'alta'} />
      {p === 'urgente' ? 'Urgente' : 'Alta'}
    </span>
  );
}

/* a pílula de estado de uma demanda: o ponto e o nome do documento */
export function Estado({ d }: { d: Parameters<typeof comoOPdfChama>[0] }) {
  const nome = comoOPdfChama(d);
  const t = tomDoEstado(nome);
  return (
    <Pill tom={t}>
      <span className={`dm-ponto ${t ? 'dm-' + t : ''}`} />
      {nome}
    </Pill>
  );
}

/* O CAMPO VESTE O CONTROLE SOZINHO.

   Todo `input`, `select` e `textarea` filho direto de um `Campo` recebe a
   classe `dm-ctl`, que é quem desenha o controle nesta folha. Sem isto, cada
   tela teria que lembrar da classe em cada campo, e o campo esquecido
   voltaria a vestir a roupa do outro sistema (52px, canto reto). Caixinha e
   rádio ficam como estão: eles não são campo de texto. */
const CONTROLES = new Set(['input', 'select', 'textarea']);
function vestir(filhos: React.ReactNode, invalido?: boolean): React.ReactNode {
  return Children.map(filhos, c => {
    if (!isValidElement(c) || typeof c.type !== 'string' || !CONTROLES.has(c.type)) return c;
    const p = c.props as { className?: string; type?: string };
    if (c.type === 'input' && (p.type === 'checkbox' || p.type === 'radio')) return c;
    const tem = (p.className || '').split(' ').includes('dm-ctl');
    if (tem && !invalido) return c;
    return cloneElement(c as React.ReactElement<{ className?: string; 'aria-invalid'?: boolean }>, {
      className: tem ? p.className : p.className ? `${p.className} dm-ctl` : 'dm-ctl',
      ...(invalido ? { 'aria-invalid': true } : {}),
    });
  });
}

export function Campo({ rot, ajuda, erro, falta, classe, children }: {
  rot: string; ajuda?: React.ReactNode; children: React.ReactNode;
  /* o recado de recusa da própria tela (site fora da lista, link torto):
     abaixo do campo, em vermelho, anunciado */
  erro?: string;
  /* o que falta neste campo, depois de tocar em Enviar: o campo fica
     vermelho (`aria-invalid`) e a frase embaixo. Sem `role="alert"`: quem
     anuncia é o resumo do formulário, uma vez só, e não cada campo */
  falta?: string;
  /* `dm-curto` e `dm-data` limitam a largura fora do celular: um campo de
     e-mail com 1000px é ruído */
  classe?: 'dm-curto' | 'dm-data' | 'dm-numero';
}) {
  return (
    <label className={classe ? `dm-campo ${classe}` : 'dm-campo'}>
      <span>{rot}</span>
      {vestir(children, !!(erro || falta))}
      {erro ? <small className="dm-erro-campo" role="alert">{erro}</small> : null}
      {falta && !erro ? <small className="dm-erro-campo">{falta}</small> : null}
      {ajuda ? <small>{ajuda}</small> : null}
    </label>
  );
}

/** O mesmo desenho do `Campo`, SEM o `<label>`.

    UM `<label>` ROTULA O PRIMEIRO DESCENDENTE ROTULAVEL, E ISSO E UM
    DEFEITO QUANDO O CONTEUDO E UM GRUPO — 21/09/2026.

    `<Campo rot="Prioridade"><Opcoes …/></Campo>` punha quatro `<button>`
    dentro de um `<label>`. Tocar na palavra "Prioridade" ativava o PRIMEIRO
    deles. Medido, clicando no pixel do rotulo e em nenhum botao:

      prioridade ANTES : Baixa:false Normal:true Alta:false Urgente:false
      rotulo achado    : {"x":38,"y":828,"txt":"Prioridade"}
      prioridade DEPOIS: Baixa:true  Normal:false …

    A pessoa encosta o polegar na palavra enquanto rola, e a demanda urgente
    que ela ia abrir sai como "Baixa". Nada avisa, e a prioridade errada muda
    a ordem da fila.

    `Opcoes` ja traz `role="group"` e `aria-label`, entao o grupo se rotula
    sozinho: o `<label>` nao estava fazendo falta nenhuma, so estrago. */
export function Bloco({ rot, ajuda, children }: {
  rot: string; ajuda?: string; children: React.ReactNode;
}) {
  return (
    <div className="dm-campo">
      <span>{rot}</span>
      {children}
      {ajuda ? <small>{ajuda}</small> : null}
    </div>
  );
}

/** Escolha de poucas opções: botão em vez de select. Um toque, não dois. */
export function Opcoes<T extends string>({ valor, opcoes, aoMudar, rot, empilhadas }: {
  valor: T; opcoes: { v: T; rot: string }[]; aoMudar: (v: T) => void; rot: string;
  /** uma por linha: para rótulos que são frase ("Lidero um ministério"), que
      em três colunas de 80px quebram em duas linhas dentro do botão */
  empilhadas?: boolean;
}) {
  /* A GRADE DECIDE PELA LARGURA DO LUGAR ONDE MORA, E NÃO DA JANELA —
     23/09/2026: os cinco papéis da ficha da pessoa viravam cinco colunas a
     partir de 760px de janela, mas em 1024 a coluna da ficha tem 392px, e
     "Administração" atravessava a borda do botão e entrava em "Gestão". A
     caixa de fora é o contêiner que a folha mede. */
  return (
    <div className="dm-opcoes-caixa">
      <div className={empilhadas ? 'dm-opcoes dm-empilhadas' : 'dm-opcoes'} role="group" aria-label={rot}>
        {opcoes.map(o => (
          <button key={o.v} type="button" aria-pressed={valor === o.v} onClick={() => aoMudar(o.v)}>
            {o.rot}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ a página */

/* O CABEÇALHO DE TODA TELA: de onde vim, o que é isto, o título, os fatos e
   as ações. Uma peça só, para o título estar sempre no mesmo lugar, do mesmo
   tamanho, com as ações sempre à direita (e embaixo dele no celular). */
export function Cabecalho({ volta, sobre, titulo, meta, acoes, lado }: {
  /* `soCelular`: a volta que no desktop repetiria a lateral (Números é item
     de primeiro nível dela; no celular a porta de Números é o Atendimento) */
  volta?: { href: string; rot: string; soCelular?: boolean };
  sobre?: React.ReactNode; titulo: React.ReactNode; meta?: React.ReactNode;
  acoes?: React.ReactNode;
  /* o que vem antes do título, na mesma linha (o avatar do perfil) */
  lado?: React.ReactNode;
}) {
  return (
    <header className="dm-cab">
      {volta ? <Link className={volta.soCelular ? 'dm-volta dm-so-celular' : 'dm-volta'} href={volta.href}>{volta.rot}</Link> : null}
      <div className="dm-cab-linha">
        <div className={lado ? 'dm-cab-txt dm-com-lado' : 'dm-cab-txt'}>
          {lado}
          <div className="dm-cresce">
            {sobre ? <div className="dm-rot">{sobre}</div> : null}
            <h1 className="dm-cab-titulo">{titulo}</h1>
            {/* `dm-sep`: os fatos separados por ponto, e o ponto nunca fica
                sozinho no começo da linha quando o celular quebra */}
            {meta ? <div className="dm-cab-meta dm-sep"><div className="dm-sep-in">{meta}</div></div> : null}
          </div>
        </div>
        {acoes ? <div className="dm-cab-acoes">{acoes}</div> : null}
      </div>
    </header>
  );
}

/* A SEÇÃO: título, conta, uma linha de explicação e as ações dela. Seção não
   é caixa: a caixa (`dm-caixa`, `dm-tabela`) vai dentro, só quando há uma
   superfície de verdade. */
export function Secao({ titulo, n, sub, acoes, children, tom, destaque }: {
  titulo: React.ReactNode; n?: number | null; sub?: React.ReactNode; acoes?: React.ReactNode;
  children: React.ReactNode;
  tom?: 'bad';
  /* o selo preto é "isto espera você" (Precisa de você, Pedidos de papel,
     avisos novos); a conta comum ("Histórico do cadastro 2") é cinza */
  destaque?: boolean;
}) {
  return (
    <section className="dm-secao">
      <div className="dm-secao-cab">
        <div className="dm-cresce">
          <h2 className="dm-secao-titulo">
            {titulo}
            {n != null ? <span className={`dm-quantos ${n === 0 ? 'dm-zero' : tom === 'bad' ? 'dm-bad' : destaque ? 'dm-destaque' : ''}`}>{n}</span> : null}
          </h2>
          {sub ? <p className="dm-secao-sub">{sub}</p> : null}
        </div>
        {acoes ? <div className="dm-linha">{acoes}</div> : null}
      </div>
      {children}
    </section>
  );
}

/* A FAIXA DE NÚMEROS: uma superfície, fios entre as casas. A casa que leva a
   uma lista é link, e o zero sai em cinza, para o olho pular o que não pede
   nada. */
export function Kpis({ children, rot, colunas, colunasMedio }: {
  children: React.ReactNode; rot?: string;
  /* quantas casas por linha a partir de 720px; sem dizer, uma linha só com
     todas. No celular são sempre duas. */
  colunas?: number;
  /* entre 720 e 1279px, quando a linha inteira não cabe (seis números de
     158px em 1280 cabem; em 1024, três por linha) */
  colunasMedio?: number;
}) {
  const n = colunas ?? Math.max(1, Children.toArray(children).length);
  const estilo: Record<string, number> = { '--dm-n': n };
  if (colunasMedio) estilo['--dm-n-medio'] = colunasMedio;
  return (
    <div className="dm-kpis" role={rot ? 'group' : undefined} aria-label={rot}
      style={estilo as React.CSSProperties}>
      {children}
    </div>
  );
}
export function Kpi({ rot, valor, sub, href, tom, destaque }: {
  rot: string; valor: React.ReactNode; sub?: React.ReactNode; href?: string;
  /* `bad`: o número em vermelho quando não é zero (atrasadas) */
  tom?: 'bad';
  /* o ponto preto antes do rótulo: "isto espera você" */
  destaque?: boolean;
}) {
  const zero = valor === 0 || valor === '0' || valor === '0%';
  /* "sem dados" (a média que ainda não tem nenhuma medida) em cinza e no
     corpo do texto, na mesma altura dos números ao lado */
  const semDado = valor === 'sem dados';
  const mods = `${zero || semDado ? 'dm-zero' : tom === 'bad' ? 'dm-bad' : ''} ${semDado ? 'dm-sem-dado' : ''} ${destaque && !zero ? 'dm-destaque' : ''}`;
  const corpo = (
    <>
      <span className="dm-kpi-rot">{rot}</span>
      <span className="dm-kpi-valor">{valor}</span>
      {sub ? <span className="dm-kpi-sub">{sub}</span> : null}
    </>
  );
  return href
    ? <Link className={`dm-kpi ${mods}`} href={href}>{corpo}</Link>
    : <div className={`dm-kpi ${mods}`}>{corpo}</div>;
}

/* O esqueleto e `aria-hidden` de proposito: forma piscando nao tem o que
   dizer a quem nao ve. So que ele era a UNICA coisa na tela enquanto a lista
   carregava, e com a rede lenta isso dava 2,5 segundos de silencio absoluto
   para quem usa leitor de tela. Medido: `aria-live`, `role=status`,
   `role=alert` e `aria-busy` — nenhum, em nenhum momento.

   Uma linha visualmente escondida e anunciada resolve. Ela e `status` e nao
   `alert`: carregar nao interrompe ninguem. */
export function Esqueleto({ linhas = 4, oQue = 'Carregando', forma = 'texto' }: {
  linhas?: number; oQue?: string;
  /* a forma do que vem: a lista carrega como linhas de tabela, a ficha como
     título, faixa de fatos e corpo, os números como a faixa de números. Um
     esqueleto genérico dizia "alguma coisa vem aí"; o da forma diz o quê. */
  forma?: 'texto' | 'lista' | 'ficha' | 'numeros';
}) {
  let corpo: React.ReactNode;
  if (forma === 'lista') {
    corpo = Array.from({ length: linhas > 4 ? linhas : 5 }).map((_, i) => (
      <div key={i} className="dm-esq-linha">
        <div style={{ width: 36 }} /><div style={{ width: `${56 - (i % 3) * 10}%` }} />
        <div style={{ width: 96, marginLeft: 'auto' }} />
      </div>
    ));
  } else if (forma === 'ficha') {
    corpo = (
      <>
        <div style={{ height: 14, width: 180, marginBottom: 12 }} />
        <div style={{ height: 28, width: '62%', marginBottom: 24 }} />
        <div className="dm-esq-fatos"><div /><div /><div /><div /></div>
        <div style={{ height: 180, marginTop: 24 }} />
      </>
    );
  } else if (forma === 'numeros') {
    corpo = (
      <>
        <div className="dm-esq-fatos"><div /><div /><div /><div /></div>
        <div style={{ height: 220, marginTop: 24 }} />
      </>
    );
  } else {
    corpo = Array.from({ length: linhas }).map((_, i) => (
      <div key={i} style={{ height: i === 0 ? 28 : 64, marginBottom: 12, width: i === 0 ? '40%' : i === linhas - 1 ? '70%' : '100%' }} />
    ));
  }
  return (
    <>
      <span role="status" className="dm-so-leitor">{oQue}…</span>
      <div className={`dm-esqueleto ${forma === 'lista' ? 'dm-em-caixa' : ''}`} aria-hidden="true">{corpo}</div>
    </>
  );
}

/* O ESTADO VAZIO É QUIETO, E DIZ SE É BOA NOTÍCIA.

   "O setor está em dia." e "Você ainda não abriu nenhuma demanda" não são a
   mesma frase: a primeira é boa notícia e ganha o visto verde; `filtro` é
   "ninguém com esse filtro" e ganha a lupa; o resto, a lista. `solto` é o
   vazio que não mora dentro de uma tabela e precisa da própria moldura. */
export function Vazio({ titulo, tom, solto, children }: {
  titulo: string; tom?: 'bom' | 'filtro'; solto?: boolean; children?: React.ReactNode;
}) {
  return (
    <div className={`dm-vazio dm-centro ${tom === 'bom' ? 'dm-bom' : ''} ${solto ? 'dm-solto' : ''}`}>
      <span className="dm-vazio-ico"><Icone nome={tom === 'bom' ? 'check' : tom === 'filtro' ? 'busca' : 'lista'} /></span>
      {/* título é título: sem ponto final, como todos os outros do sistema
          (a frase de cada tela continua escrita com ponto, e a peça tira) */}
      <h3>{titulo.replace(/\.$/, '')}</h3>
      {children ? <div>{children}</div> : null}
    </div>
  );
}

/* A FITA QUE ROLA DE LADO DIZ QUE ROLA.

   Com sete grupos de categoria, a última aba era cortada na borda da tela
   ("Administrativo e financei") e parecia defeito, e não continuação. O
   gancho mede a fita e marca `data-mais-antes` / `data-mais-depois`; a folha
   esmaece a borda do lado que tem mais. Sem medida (servidor, teste), nada
   é marcado. Também rola a aba escolhida para dentro da vista. */
export function useFitaQueRola<E extends HTMLElement>() {
  const [el, setEl] = useState<E | null>(null);
  useEffect(() => {
    if (!el || typeof window === 'undefined') return;
    const medir = () => {
      const antes = el.scrollLeft > 2;
      const depois = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
      if (antes) el.setAttribute('data-mais-antes', ''); else el.removeAttribute('data-mais-antes');
      if (depois) el.setAttribute('data-mais-depois', ''); else el.removeAttribute('data-mais-depois');
    };
    /* a aba escolhida é filha direta da fita; procura andando pelos filhos, e
       não com seletor de atributo (o DOM do teste de telas só entende nome
       de tag, e isto aqui não precisa de mais que isso) */
    let aberta: HTMLElement | null = null;
    for (const c of Array.from(el.childNodes || [])) {
      const e = c as HTMLElement;
      if (e.nodeType === 1 && (e.getAttribute('aria-pressed') === 'true' || e.getAttribute('aria-current') === 'page')) {
        aberta = e; break;
      }
    }
    if (aberta && el.scrollWidth > el.clientWidth && typeof aberta.scrollIntoView === 'function') {
      const r = aberta.offsetLeft + aberta.offsetWidth;
      if (r > el.clientWidth) el.scrollLeft = r - el.clientWidth + 24;
    }
    medir();
    el.addEventListener('scroll', medir, { passive: true });
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(medir) : null;
    ro?.observe(el);
    return () => { el.removeEventListener('scroll', medir); ro?.disconnect(); };
  }, [el]);
  return setEl;
}

/* ---------------------------------------------------------------- sub-abas

   As vistas de UMA tela (Atender: esperando você, com você...; Categorias:
   os grupos). Abas com fio embaixo, em qualquer largura; no celular a fita
   rola de lado e sangra até a borda. O número entra num selo: preto na aba
   aberta, cinza quando é zero, vermelho quando é a vista de atrasadas e há.
   `null` no número é "ainda não sei" e sai como um ponto. */
export function Subabas<T extends string>({ rot, valor, itens, aoMudar, fichas }: {
  rot: string; valor: T;
  /* `destaque`: a conta é "isto espera você", e o selo é preto (com a aba
     escolhida ou não); as outras contas são cinza, e a aba escolhida se diz
     pelo fio e pelo peso, e não pelo selo */
  itens: { v: T; rot: string; n?: number | null; bad?: boolean; destaque?: boolean }[];
  aoMudar: (v: T) => void;
  /* `fichas`: um FILTRO (os grupos de categoria), e não as vistas de uma
     tela. No desktop vira fichas que quebram linha, todas à vista: a fita
     de abas escondia "Administrativo e financeiro" atrás do esmaecimento, e
     com mouse ninguém rola de lado. No celular continua a fita. */
  fichas?: boolean;
}) {
  const fita = useFitaQueRola<HTMLDivElement>();
  return (
    <div className={fichas ? 'dm-subabas dm-fichas' : 'dm-subabas'} role="group" aria-label={rot} ref={fita}>
      {itens.map(i => (
        <button key={i.v} type="button" aria-pressed={valor === i.v} onClick={() => aoMudar(i.v)}>
          {i.rot}
          {i.n !== undefined ? (
            <span className={`dm-quantos ${i.n === null ? '' : i.n === 0 ? 'dm-zero' : i.bad ? 'dm-bad' : i.destaque ? 'dm-destaque' : ''}`}
              aria-label={i.n === null ? 'carregando' : `${i.n}`}>
              {i.n === null ? '·' : i.n}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/* O interruptor: 44px de alvo e o rótulo do que ele CONTROLA ("Exige
   aprovação"), e não do valor atual ("Não exige"), que se lê como estado e
   não como toque. */
export function Interruptor({ ligado, rot, aoMudar, disabled, aria }: {
  ligado: boolean; rot: string; aoMudar: (v: boolean) => void; disabled?: boolean;
  /* numa tabela o texto visível é curto ("Exige"); o leitor de tela precisa
     do nome completo do que o interruptor controla e de qual linha é */
  aria?: string;
}) {
  return (
    <button type="button" role="switch" aria-checked={ligado} className="dm-interruptor"
      aria-label={aria} disabled={disabled} onClick={() => aoMudar(!ligado)}>
      {rot}
    </button>
  );
}

/* a tela é estreita? Decide o que se monta (folha em vez de painel na
   ficha; cartões em vez de tabela na configuração), e não só como se pinta.
   Sem `matchMedia` (o teste de telas, o servidor), vale largo. */
export function useEstreito(maxPx: number): boolean {
  const [estreito, setEstreito] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(`(max-width: ${maxPx}px)`);
    const f = () => setEstreito(mq.matches);
    f();
    mq.addEventListener?.('change', f);
    return () => mq.removeEventListener?.('change', f);
  }, [maxPx]);
  return estreito;
}

/* O toast: o sucesso que muda de tela ou some da tela ("Demanda #113
   assumida", "Dados salvos"). Um só; fica 4s (6 com botão); erro nunca é
   toast, porque toast some. Quem mostra é a Casca; quem pede é `useEu().toast`. */
export type ToastPedido = { texto: string; ver?: string; desfazer?: () => void; rotDesfazer?: string };
export function Toast({ t, fechar }: { t: ToastPedido; fechar: () => void }) {
  useEffect(() => {
    const i = setTimeout(fechar, t.ver || t.desfazer ? 6000 : 4000);
    return () => clearTimeout(i);
  }, [t, fechar]);
  return (
    <div className="dm-toast" role="status" aria-live="polite">
      <Icone nome="check" />
      <span>{t.texto}</span>
      {t.ver ? <a href={t.ver}>Ver</a> : null}
      {t.desfazer ? <button type="button" onClick={() => { t.desfazer?.(); fechar(); }}>{t.rotDesfazer || 'Desfazer'}</button> : null}
    </div>
  );
}

/* Caixa de texto que vira ação: o padrão de "concluir", "travar", "cancelar".
   O botão só liga quando há texto, porque o banco vai recusar vazio de
   qualquer jeito e é melhor a pessoa ver isso antes de tocar. */
/* O RASCUNHO DA CAIXA DE AÇÃO — 24/09/2026 (auditoria R10). Esc, o toque
   fora da folha ou o "Voltar" desmontavam a caixa e o texto ia junto: quem
   tocava fora da folha para baixar o teclado perdia o parágrafo. Quem monta
   a caixa pode guardar o texto fora dela (a ficha guarda um por ação), e a
   caixa nasce com ele. Sem guardião, a caixa é como sempre foi. */
export const RascunhoDaCaixa = createContext<{ ler: () => string; gravar: (t: string) => void } | null>(null);

export function CaixaDeAcao({ rot, dica, botao, tom, exigeTexto = true, salvando, aoEnviar, extra,
                             teto = 4000, podeEnviar = true }: {
  rot: string; dica?: string; botao: string;
  tom?: 'pri' | 'perigo'; exigeTexto?: boolean; salvando?: boolean;
  /* DEVOLVE `false` QUANDO O SERVIDOR RECUSOU — e a caixa não apaga nada.
     Ver o comentário do `onClick`. Quem não tem o que responder devolve
     `void`, e aí a caixa limpa como antes. */
  aoEnviar: (texto: string) => void | boolean | Promise<void | boolean>;
  extra?: React.ReactNode; teto?: number;
  /* O BOTAO SO OLHAVA O TEXTAREA, E HAVIA CAMPO OBRIGATORIO FORA DELE.

     "Concluir" numa demanda atrasada precisa do motivo do atraso, que mora no
     `extra`. O botao ficava habilitado so com a conclusao preenchida, a pessoa
     tocava, e o servidor recusava com ATRASO_PRECISA_MOTIVO. Quem monta a
     caixa sabe o que mais e obrigatorio; esta porta e para ele dizer. */
  podeEnviar?: boolean;
}) {
  const guarda = useContext(RascunhoDaCaixa);
  const [t, setTLocal] = useState(() => guarda?.ler() ?? '');
  const setT = (x: string) => { setTLocal(x); guarda?.gravar(x); };
  /* O TETO NAO E ZELO, E O QUE IMPEDE A FICHA DE FICAR PESADA PARA SEMPRE.

     Esta peca e uma so e serve sete usos: comentar, concluir, travar,
     cancelar, reabrir, aprovar e recusar. Nenhum deles tinha limite, e
     medido: um comentario de 49.600 letras entrou pela porta de verdade, e
     outro de 200.000 pela RPC. Dali em diante `dem_ver` desce isso para
     TODA pessoa que abrir aquela demanda, no 4G da igreja, para sempre, e
     ninguem liga o lento ao comentario.

     A migracao 86 pos o teto no banco. Aqui ele aparece ANTES do toque: o
     contador so surge perto do fim, porque um contador sempre visivel numa
     caixa de comentario e ruido que ninguem pediu. */
  const sobra = teto - t.length;
  return (
    <div className="dm-acao-form">
      <Campo rot={rot} ajuda={dica}>
        <textarea value={t} maxLength={teto} onChange={e => setT(e.target.value)} />
      </Campo>
      {sobra < 300
        ? <div className="dm-peq dm-mudo" role="status">{sobra} letra{sobra === 1 ? '' : 's'} restante{sobra === 1 ? '' : 's'}</div>
        : null}
      {extra}
      {/* A CAIXA APAGAVA O TEXTO ANTES DE SABER SE DEU CERTO — 22/09/2026.

          Era `onClick={() => { aoEnviar(t.trim()); setT(''); }}`: dispara e
          limpa, na mesma linha, sem esperar resposta nenhuma. Em QUALQUER
          recusa do servidor — concluir, cancelar, reabrir, aprovar, recusar,
          destravar, travar — a pessoa lê o aviso vermelho com a caixa VAZIA e
          tem que redigitar o que já tinha escrito.

          E não é caso raro: é justamente o caminho dos erros que esta entrega
          está consertando. `ATRASO_PRECISA_MOTIVO` num texto de conclusão de
          800 letras, `SO_GESTOR_REABRE_APROVACAO` numa trava, `FALTA_APROVACAO`
          num concluir. Quanto mais a pessoa escreveu, mais caro sai o erro, e
          a segunda tentativa vem pior que a primeira porque ninguém redigita
          com o mesmo cuidado.

          Agora a limpeza espera a promessa e só acontece quando não foi
          recusa. `false` é o único valor que segura o texto: assim quem não
          responde nada (`void`) continua limpando, como antes. */}
      <button type="button" className={`dm-btn dm-${tom || 'pri'} dm-larga`}
        disabled={salvando || !podeEnviar || (exigeTexto && !t.trim())}
        onClick={async () => { if (await aoEnviar(t.trim()) !== false) setT(''); }}>
        {salvando ? 'Salvando…' : botao}
      </button>
    </div>
  );
}

/** Copia para a área de transferência e diz que copiou — ou que não copiou.

    O `catch {}` VAZIO ERA UM BOTÃO QUE MENTE — 19/09/2026.

    A versão anterior tentava `navigator.clipboard.writeText` e engolia a
    falha. Quando falhava, o rótulo simplesmente não mudava: a pessoa tocava,
    nada acontecia, nada explicava, e ela ia colar uma área de transferência
    vazia no grupo do WhatsApp.

    E falha com frequência: `navigator.clipboard` exige contexto seguro e,
    em vários navegadores, gesto do usuário reconhecido — dentro de um
    `async` que já cedeu a vez, o gesto pode ter expirado. É por isso que o
    `copiar()` do outro sistema (`components/Shell.tsx`) tem o plano B com
    `execCommand` e avisa quando os dois falham. Aqui faltava.

    Três estados agora, e o terceiro é o que importa: copiou, não copiou, e
    o texto à mostra para a pessoa selecionar com o dedo. */
export function Copiar({ texto, rot = 'Copiar', classe = 'dm-btn dm-peq' }: { texto: string; rot?: string; classe?: string }) {
  const [fase, setFase] = useState<'' | 'feito' | 'falhou'>('');
  useEffect(() => {
    if (fase !== 'feito') return;
    const i = setTimeout(() => setFase(''), 1800);
    return () => clearTimeout(i);
  }, [fase]);

  async function tentar() {
    try { await navigator.clipboard.writeText(texto); setFase('feito'); return; } catch { /* plano B */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = texto; ta.readOnly = true;
      ta.style.position = 'fixed'; ta.style.left = '-9999px'; ta.style.top = '0';
      document.body.appendChild(ta); ta.select();
      const deu = document.execCommand('copy');
      ta.remove();
      setFase(deu ? 'feito' : 'falhou');
    } catch { setFase('falhou'); }
  }

  if (fase === 'falhou') {
    return (
      <span className="dm-copiar-falhou">
        <span className="dm-peq dm-mudo">Não consegui copiar. Selecione e copie:</span>
        <textarea className="dm-copiar-cru" readOnly rows={3} value={texto}
          onFocus={e => e.currentTarget.select()} />
      </span>
    );
  }
  return (
    <button type="button" className={classe} onClick={tentar}>
      <Icone nome={fase === 'feito' ? 'check' : 'copiar'} />
      {fase === 'feito' ? 'Copiado' : rot}
    </button>
  );
}
