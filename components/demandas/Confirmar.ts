/* O DIÁLOGO DE CONFIRMAÇÃO DO DEMANDAS · 23/09/2026.

   Até aqui o Demandas usava `lib/confirmar.ts`, que é das Escalas: o
   comportamento é bom (o <dialog> nativo dá prisão de foco, Escape e `inert`
   de graça), mas a roupa é a de lá, com as classes de lá (`.dlg`, `.btn`), e
   dentro de `.dm` os resets desta folha a desmontavam. Medido em 1440: canto
   0 e sem sombra, o texto (15,5px) maior que o título (14px) e colado nele,
   o "Desativar" com o rótulo encostado na borda do preto, e o botão de
   desistir escrito "Cancelar", quando "Cancelar" é o verbo que cancela uma
   demanda, em vermelho. Desistir é "Voltar", no sistema inteiro.

   A regra do dono é que os dois sistemas não se encostam, e o arquivo das
   Escalas não muda por causa deste. Então o Demandas tem o dele: a mesma
   ideia (imperativo, uma promessa por pergunta, o foco nasce no "Voltar",
   Escape e clique fora respondem "não"), com as classes e os tokens
   daqui. O desenho mora em `demandas.css`, em "o diálogo". */

export type Confirmacao = {
  /** A pergunta, com o nome próprio dentro: "Desativar o setor Mídia?" */
  titulo: string;
  /** O que acontece de verdade. Uma ou duas frases, sem ameaça. */
  texto?: string;
  /** O verbo do botão que faz. Nunca "OK". */
  acao?: string;
  /** Não volta: o botão fica vermelho e aparece "Não dá para desfazer." */
  perigo?: boolean;
  /** Tira alguma coisa do ar, mas volta (desativar): o botão fica vermelho,
      sem a frase de que não dá para desfazer, que ali seria mentira. */
  vermelho?: boolean;
};

let caixa: HTMLDialogElement | null = null;
let resolver: ((v: boolean) => void) | null = null;

function fechar(v: boolean) {
  const r = resolver; resolver = null;
  document.body.style.removeProperty('overflow');
  if (caixa?.open) caixa.close();
  r?.(v);
}

/* montado com `createElement`, e não com `innerHTML`: nada do que vem de
   quem chama (o título tem o nome de uma pessoa) vira marcação */
function no<K extends keyof HTMLElementTagNameMap>(tag: K, classe: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

function montar(): HTMLDialogElement {
  const d = no('dialog', 'dm-dialogo');
  const corpo = no('form', 'dm-dialogo-corpo');
  corpo.method = 'dialog';
  const titulo = no('h2', 'dm-dialogo-titulo');
  const texto = no('p', 'dm-dialogo-texto');
  /* o nome e a descrição do diálogo, para o leitor de tela anunciar a
     pergunta ao abrir */
  titulo.id = 'dm-dialogo-titulo'; texto.id = 'dm-dialogo-texto';
  d.setAttribute('aria-labelledby', titulo.id);
  d.setAttribute('aria-describedby', texto.id);
  const semVolta = no('p', 'dm-dialogo-sem-volta', 'Não dá para desfazer.');
  const btns = no('div', 'dm-dialogo-btns');
  const nao = no('button', 'dm-btn', 'Voltar');
  nao.type = 'button'; nao.autofocus = true; nao.dataset.nao = '';
  const sim = no('button', 'dm-btn dm-pri', 'Confirmar');
  sim.type = 'button'; sim.dataset.sim = '';
  btns.append(nao, sim);
  corpo.append(titulo, texto, semVolta, btns);
  d.append(corpo);

  nao.onclick = () => fechar(false);
  sim.onclick = () => fechar(true);
  /* Escape dispara `cancel` antes de `close`: sem isto a promessa ficaria
     pendurada e o botão que chamou nunca destravava */
  d.addEventListener('cancel', e => { e.preventDefault(); fechar(false); });
  /* o clique no fundo chega como clique no próprio <dialog>: fora é "não" */
  d.addEventListener('click', e => { if (e.target === d) fechar(false); });
  return d;
}

export function confirmar(c: Confirmacao): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false);
  /* duas perguntas ao mesmo tempo: a de trás responde "não" em vez de sumir */
  if (resolver) fechar(false);

  caixa ??= montar();
  const d = caixa;
  /* dentro de `.dm`, para herdar a letra e os tokens; reancorado a cada
     chamada, porque cada tela renderiza a própria `.dm` e a da tela anterior
     deixa de existir (o mesmo cuidado de `lib/confirmar.ts`) */
  const pai = document.querySelector('.dm') ?? document.body;
  if (d.parentNode !== pai) pai.appendChild(d);

  d.querySelector('.dm-dialogo-titulo')!.textContent = c.titulo;
  const txt = d.querySelector<HTMLParagraphElement>('.dm-dialogo-texto')!;
  txt.textContent = c.texto || '';
  txt.hidden = !c.texto;
  d.querySelector<HTMLParagraphElement>('.dm-dialogo-sem-volta')!.hidden = !c.perigo;
  const sim = d.querySelector<HTMLButtonElement>('[data-sim]')!;
  sim.textContent = c.acao || 'Confirmar';
  sim.className = c.perigo || c.vermelho ? 'dm-btn dm-pri dm-perigo' : 'dm-btn dm-pri';

  return new Promise<boolean>(res => {
    resolver = res;
    document.body.style.overflow = 'hidden';
    d.showModal();
    d.querySelector<HTMLButtonElement>('[data-nao]')?.focus();
  });
}
