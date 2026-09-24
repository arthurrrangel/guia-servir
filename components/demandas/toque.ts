/* O FIM DO TOQUE · 24/09/2026 (auditoria R14).

   Sair de um campo de digitar muda a tela: no celular as barras de baixo
   voltam, e na Nova o "Enviar" em linha dá lugar à barra fixa. Se a mudança
   acontece no meio do toque, o dedo solta em outro lugar e o toque se perde
   (a R14 mediu seis de seis perdidos rente ao pé: "Incluir", "Salvar" do
   Perfil, resultado da busca; o dedo soltava em "Avisos").

   O foco sai no `mousedown`. No celular o toque gera `mousedown`, `mouseup`
   e `click` de uma vez só, e um `setTimeout(…, 0)` já cai depois dos três.
   No mouse, o botão pode ficar apertado por meio segundo, e o `setTimeout`
   cairia no meio. Então quem muda a tela ao sair de um campo chama
   `depoisDoToque`: se há botão apertado, espera ele subir; senão, vai no
   próximo instante. Não há estado que fique preso: o `mouseup` que se perde
   fora da janela tem prazo. */

let apertado = false;
let vigiando = false;

/** Liga o vigia uma vez, antes do primeiro toque (a casca chama ao montar). */
export function vigiarOToque() {
  if (vigiando || typeof window === 'undefined') return;
  vigiando = true;
  window.addEventListener('mousedown', () => { apertado = true; }, true);
  window.addEventListener('mouseup', () => { apertado = false; }, true);
  window.addEventListener('blur', () => { apertado = false; });
}

/** Roda `fn` quando o toque em curso terminar (ou já, no próximo instante). */
export function depoisDoToque(fn: () => void) {
  vigiarOToque();
  if (!apertado) { setTimeout(fn, 0); return; }
  let feito = false;
  const vai = () => {
    if (feito) return;
    feito = true;
    window.removeEventListener('mouseup', vai, true);
    clearTimeout(prazo);
    /* o `click` vem logo depois do `mouseup`, no mesmo instante */
    setTimeout(fn, 0);
  };
  window.addEventListener('mouseup', vai, true);
  const prazo = setTimeout(vai, 4000);
}

/** Campo onde se digita (o teclado do celular abre): não é caixinha, data ou lista. */
export function campoDeDigitar(t: EventTarget | null) {
  const n = t as HTMLInputElement | null;
  if (!n || !n.tagName) return false;
  if (n.tagName === 'TEXTAREA') return true;
  return n.tagName === 'INPUT' && ['text', 'search', 'email', 'tel', 'url', 'number', 'password'].includes(n.type);
}
