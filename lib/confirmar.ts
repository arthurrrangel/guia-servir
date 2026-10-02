/* =============================================================================
   confirmar() — A ÚLTIMA PEÇA DE INTERFACE QUE NÃO ERA DESTE PRODUTO
   FASE 9, 29/08/2026

   O DEFEITO
   Sete decisões do produto eram tomadas dentro de um `confirm()` do
   navegador. Entre elas, a mais grave que existe aqui:

       "Apagar o ministério Mídia? Todo o time, funções e escalas dele somem.
        Não dá para desfazer."

   Essa caixa é desenhada pelo sistema operacional. Ela vem na fonte do
   sistema, com CANTO ARREDONDADO e SOMBRA — as duas únicas coisas que a
   identidade deste produto proíbe por escrito —, com o endereço do site
   impresso em cima ("guiaservir.com diz:") e sem nenhuma hierarquia: a
   pergunta, a consequência e o aviso de irreversibilidade saem no mesmo
   tamanho, no mesmo peso e na mesma cor, num parágrafo só.

   É literalmente o "componente aleatório colocado posteriormente" — só que
   nem foi colocado: foi herdado por omissão, no momento de maior risco do
   produto.

   POR QUE ISTO NÃO É "MAIS UM COMPONENTE"
   A tentação numa fase de consolidação é não criar nada. Mas aqui não se está
   somando: sete caixas estrangeiras viram UMA peça do sistema. E o ganho não
   é ser mais bonito — é poder separar o que a caixa nativa obriga a juntar:

       pergunta      → título, na voz da marca
       consequência  → corpo, em Inter
       irreversível  → cor de estado, que neste sistema significa estado e
                       nunca enfeite

   POR QUE <dialog> NATIVO, E NÃO UM MODAL EM REACT
   `showModal()` entrega de graça, e sem eu escrever uma linha: prisão de
   foco, Escape, `inert` no resto da página, camada superior acima de qualquer
   z-index e devolução do foco a quem chamou. Modal caseiro erra pelo menos um
   desses quatro — e errar acessibilidade para ganhar estilo seria trocar um
   defeito visível por um invisível. Aqui o navegador continua fazendo o
   comportamento; o que muda é só o desenho, que é o que estava errado.

   POR QUE IMPERATIVO, E NÃO UM PROVIDER
   Os sete lugares já são `async` e já dizem `if (!confirm(x)) return;`. Com
   promessa, a troca é uma palavra por chamada — nenhum componente muda de
   forma, nenhum estado novo entra em sete árvores de render. Menos risco é
   parte do argumento.

   O QUE NÃO MUDA: Escape, clique fora e o botão de cancelar têm o mesmo
   efeito, que é NÃO fazer. E o foco nasce no cancelar, nunca no confirmar —
   quem aperta Enter por reflexo tem que sair vivo disso.
   ============================================================================= */

export type Confirmacao = {
  /** A pergunta. Curta, com o nome próprio dentro: "Apagar o ministério Mídia?" */
  titulo: string;
  /** O que acontece de verdade. Uma ou duas frases, sem ameaça. */
  texto?: string;
  /** O rótulo do botão que faz. Um verbo, nunca "OK". */
  acao?: string;
  /** Some junto, não volta. Acende a cor de estado e a linha de irreversível. */
  perigo?: boolean;
};

let caixa: HTMLDialogElement | null = null;
let resolver: ((v: boolean) => void) | null = null;

function fechar(v: boolean) {
  const r = resolver; resolver = null;
  document.body.style.removeProperty('overflow');
  if (caixa?.open) caixa.close();
  r?.(v);
}

function montar(): HTMLDialogElement {
  const d = document.createElement('dialog');
  /* 30/09/2026 · A ROUPA DAS ESCALAS NOVAS. As telas do líder passaram a
     morar em `.es` (components/escalas/escalas.css), e os resets de lá
     desmontariam as classes antigas (`.dlg`, `.btn`), como aconteceu com o
     Demandas em 23/09. O comportamento é o mesmo; as classes são as de lá, e
     o desistir passou a "Voltar", como no Demandas: a mesma palavra para o
     mesmo gesto nos dois sistemas. */
  d.className = 'es-dialogo';
  d.innerHTML = `
    <form method="dialog" class="es-dialogo-corpo">
      <h2 class="es-dialogo-titulo"></h2>
      <p class="es-dialogo-texto"></p>
      <p class="es-dialogo-sem-volta">Não dá para desfazer.</p>
      <div class="es-dialogo-btns">
        <button type="button" class="es-btn" data-nao autofocus>Voltar</button>
        <button type="button" class="es-btn es-pri" data-sim>Confirmar</button>
      </div>
    </form>`;

  d.querySelector<HTMLButtonElement>('[data-nao]')!.onclick = () => fechar(false);
  d.querySelector<HTMLButtonElement>('[data-sim]')!.onclick = () => fechar(true);

  /* Escape dispara `cancel` antes de `close`. Sem isto a promessa ficaria
     pendurada para sempre e o botão que chamou nunca destravava. */
  d.addEventListener('cancel', e => { e.preventDefault(); fechar(false); });

  /* clique no ::backdrop chega como clique no próprio <dialog> (o miolo é o
     .es-dialogo-corpo). Fora = voltar, igual ao Escape. */
  d.addEventListener('click', e => { if (e.target === d) fechar(false); });

  /* O diálogo nasce DENTRO da casca (`.es`), onde moram os tokens e as
     classes dele. Em `document.body` ele ficaria sem roupa nenhuma. */
  (document.querySelector('.es') ?? document.body).appendChild(d);
  return d;
}

/* =============================================================================
   decidir() — QUANDO HÁ MAIS DE UM JEITO DE FAZER · 02/10/2026

   `confirmar()` pergunta sim ou não. Mudar alguém de posto num dia montado
   tem duas respostas boas (trocar os dois de lugar, ou passar só a pessoa) e
   uma de desistir. Duas perguntas de sim ou não em sequência obrigariam a
   pessoa a adivinhar o que vem na segunda; aqui as saídas aparecem juntas,
   cada uma com o que acontece de verdade escrito embaixo.

   O mesmo `<dialog>` nativo, pelos mesmos motivos (foco preso, Escape, fundo
   inerte, camada acima de qualquer barra), mas outro elemento: o de
   `confirmar()` fica intocado. Escape, clique fora e "Voltar" devolvem null.
   O foco nasce no "Voltar", como lá.
   ============================================================================= */
export type Saida = { v: string; rot: string; sub?: string; pri?: boolean };
export type Decisao = { titulo: string; texto?: string; saidas: Saida[] };

let caixaD: HTMLDialogElement | null = null;
let resolverD: ((v: string | null) => void) | null = null;

function fecharD(v: string | null) {
  const r = resolverD; resolverD = null;
  document.body.style.removeProperty('overflow');
  if (caixaD?.open) caixaD.close();
  r?.(v);
}

function montarD(): HTMLDialogElement {
  const d = document.createElement('dialog');
  d.className = 'es-dialogo es-decidir';
  d.innerHTML = `
    <form method="dialog" class="es-dialogo-corpo">
      <h2 class="es-dialogo-titulo"></h2>
      <p class="es-dialogo-texto"></p>
      <div class="es-dialogo-saidas"></div>
      <div class="es-dialogo-btns">
        <button type="button" class="es-btn" data-nao autofocus>Voltar</button>
      </div>
    </form>`;
  d.querySelector<HTMLButtonElement>('[data-nao]')!.onclick = () => fecharD(null);
  d.addEventListener('cancel', e => { e.preventDefault(); fecharD(null); });
  d.addEventListener('click', e => { if (e.target === d) fecharD(null); });
  (document.querySelector('.es') ?? document.body).appendChild(d);
  return d;
}

export function decidir(c: Decisao): Promise<string | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);
  if (resolverD) fecharD(null);
  caixaD ??= montarD();
  const d = caixaD;
  /* reancorar a cada chamada: a casca é por página (ver `confirmar`) */
  const pai = document.querySelector('.es') ?? document.body;
  if (d.parentNode !== pai) pai.appendChild(d);

  d.querySelector('.es-dialogo-titulo')!.textContent = c.titulo;
  const txt = d.querySelector<HTMLParagraphElement>('.es-dialogo-texto')!;
  txt.textContent = c.texto || '';
  txt.hidden = !c.texto;

  /* as saídas: um botão por jeito de fazer, com o efeito por extenso. Texto
     entra por textContent, nunca por innerHTML: nome de pessoa é dado. */
  const lista = d.querySelector<HTMLDivElement>('.es-dialogo-saidas')!;
  lista.replaceChildren(...c.saidas.map(s => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `es-btn es-saida${s.pri ? ' es-pri' : ''}`;
    b.dataset.saida = s.v;
    const rot = document.createElement('span');
    rot.className = 'es-saida-rot';
    rot.textContent = s.rot;
    b.appendChild(rot);
    if (s.sub) {
      const sub = document.createElement('span');
      sub.className = 'es-saida-sub';
      sub.textContent = s.sub;
      b.appendChild(sub);
    }
    b.onclick = () => fecharD(s.v);
    return b;
  }));

  return new Promise<string | null>(res => {
    resolverD = res;
    document.body.style.overflow = 'hidden';
    d.showModal();
    d.querySelector<HTMLButtonElement>('[data-nao]')!.focus();
  });
}

export function confirmar(c: Confirmacao): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false);

  /* duas perguntas ao mesmo tempo não deveriam acontecer — as sete chamadas
     são `await` dentro de handlers. Se acontecer, a de trás responde "não"
     em vez de sumir sem resposta. */
  if (resolver) fechar(false);

  caixa ??= montar();
  const d = caixa;

  /* REANCORAR A CADA CHAMADA — 21/09/2026.

     `caixa` é de módulo: ela nasce uma vez e vive enquanto a aba viver. Desde
     que o diálogo passou a ser pendurado na casca (`.dm` em 21/09, `.es` em
     30/09), isso virou um defeito: a casca é renderizada POR PÁGINA (cada
     tela do líder chama `<Shell>`), então toda navegação entre telas destrói
     o nó que segura o diálogo. Medido no Chromium, no Demandas:

       dialogoAindaConectado: false
       depoisDeDesmontar: "InvalidStateError: Failed to execute 'showModal'
                           on 'HTMLDialogElement': The element is not in a
                           Document."

     Um `confirmar()` que levanta deixa a promessa pendurada e o botão travado
     para sempre, sem mensagem nenhuma.

     `appendChild` de um nó que já existe MOVE, não duplica: reancorar é uma
     linha e cobre também o caminho de ir do Painel para a Escala e voltar. */
  const pai = document.querySelector('.es') ?? document.body;
  if (d.parentNode !== pai) pai.appendChild(d);

  d.querySelector('.es-dialogo-titulo')!.textContent = c.titulo;

  const txt = d.querySelector<HTMLParagraphElement>('.es-dialogo-texto')!;
  txt.textContent = c.texto || '';
  txt.hidden = !c.texto;

  d.querySelector<HTMLParagraphElement>('.es-dialogo-sem-volta')!.hidden = !c.perigo;
  const sim = d.querySelector<HTMLButtonElement>('[data-sim]')!;
  sim.textContent = c.acao || 'Confirmar';
  /* o que apaga fica vermelho; o resto, a ação cheia de sempre */
  sim.classList.toggle('es-perigo', !!c.perigo);

  return new Promise<boolean>(res => {
    resolver = res;
    document.body.style.overflow = 'hidden';
    d.showModal();
    /* showModal foca o primeiro focável; `autofocus` no cancelar garante que
       seja ele mesmo depois de o conteúdo ter sido trocado. */
    d.querySelector<HTMLButtonElement>('[data-nao]')!.focus();
  });
}

/* =============================================================================
   escrever() — UM NOME QUE NÃO ESTÁ NA LISTA · 02/10/2026 (108)

   O posto do Louvor que é de um convidado ("Guest", "Guest Rafa") ou de
   alguém de outro ministério precisa de um texto, e um <select> não aceita
   texto. Esta é a terceira peça da mesma família: o mesmo <dialog> nativo,
   pelos mesmos motivos (foco preso, Escape, fundo inerte, camada acima de
   qualquer barra), com um campo e os textos que o ministério já usou como
   atalhos (tocar num deles preenche o campo; Salvar confirma).

   O foco nasce no CAMPO, e não no Voltar como nos outros dois: aqui a ação é
   escrever, e nada se apaga sem querer (Escape, clique fora e Voltar devolvem
   null; Enter salva, e campo vazio não salva).
   ============================================================================= */
export type Escrita = {
  titulo: string; texto?: string; rotulo: string;
  valor?: string; dica?: string; sugestoes?: string[]; acao?: string; max?: number;
};

let caixaE: HTMLDialogElement | null = null;
let resolverE: ((v: string | null) => void) | null = null;

function fecharE(v: string | null) {
  const r = resolverE; resolverE = null;
  document.body.style.removeProperty('overflow');
  if (caixaE?.open) caixaE.close();
  r?.(v);
}

function montarE(): HTMLDialogElement {
  const d = document.createElement('dialog');
  d.className = 'es-dialogo es-escrever';
  d.innerHTML = `
    <form class="es-dialogo-corpo" novalidate>
      <h2 class="es-dialogo-titulo"></h2>
      <p class="es-dialogo-texto"></p>
      <label class="es-campo es-escrever-campo">
        <span data-rotulo></span>
        <input class="es-ctl" type="text" autocomplete="off" autocapitalize="words" enterkeyhint="done" spellcheck="false" />
        <small data-dica></small>
      </label>
      <div class="es-escrever-sugestoes" role="group" aria-label="Usados antes"></div>
      <div class="es-dialogo-btns">
        <button type="button" class="es-btn" data-nao>Voltar</button>
        <button type="submit" class="es-btn es-pri" data-sim>Salvar</button>
      </div>
    </form>`;
  const form = d.querySelector<HTMLFormElement>('form')!;
  const campo = d.querySelector<HTMLInputElement>('input')!;
  form.addEventListener('submit', e => {
    e.preventDefault();
    const v = campo.value.trim().replace(/\s+/g, ' ');
    if (!v) { campo.focus(); return; }
    fecharE(v);
  });
  d.querySelector<HTMLButtonElement>('[data-nao]')!.onclick = () => fecharE(null);
  d.addEventListener('cancel', e => { e.preventDefault(); fecharE(null); });
  d.addEventListener('click', e => { if (e.target === d) fecharE(null); });
  (document.querySelector('.es') ?? document.body).appendChild(d);
  return d;
}

export function escrever(c: Escrita): Promise<string | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);
  if (resolverE) fecharE(null);
  caixaE ??= montarE();
  const d = caixaE;
  /* reancorar a cada chamada: a casca é por página (ver `confirmar`) */
  const pai = document.querySelector('.es') ?? document.body;
  if (d.parentNode !== pai) pai.appendChild(d);

  d.querySelector('.es-dialogo-titulo')!.textContent = c.titulo;
  const txt = d.querySelector<HTMLParagraphElement>('.es-dialogo-texto')!;
  txt.textContent = c.texto || '';
  txt.hidden = !c.texto;
  d.querySelector('[data-rotulo]')!.textContent = c.rotulo;
  const dica = d.querySelector<HTMLElement>('[data-dica]')!;
  dica.textContent = c.dica || '';
  dica.hidden = !c.dica;
  const campo = d.querySelector<HTMLInputElement>('input')!;
  campo.value = c.valor || '';
  campo.maxLength = c.max || 60;
  d.querySelector<HTMLButtonElement>('[data-sim]')!.textContent = c.acao || 'Salvar';

  /* os textos já usados: um toque preenche o campo. Texto entra por
     textContent, nunca por innerHTML: nome de pessoa é dado. */
  const lista = d.querySelector<HTMLDivElement>('.es-escrever-sugestoes')!;
  const sug = [...new Set((c.sugestoes || []).map(s => s.trim()).filter(Boolean))].slice(0, 6);
  lista.replaceChildren(...sug.map(s => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'es-ficha';
    b.textContent = s;
    b.onclick = () => { campo.value = s; campo.focus(); };
    return b;
  }));
  lista.hidden = !sug.length;

  return new Promise<string | null>(res => {
    resolverE = res;
    document.body.style.overflow = 'hidden';
    d.showModal();
    campo.focus();
    campo.select();
  });
}
