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
