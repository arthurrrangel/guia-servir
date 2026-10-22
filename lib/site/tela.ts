/* =============================================================================
   A ALTURA QUE SE VÊ · 21/10/2026

   O herói do celular mede a tela: a foto ocupa a altura visível e a frase e as
   pílulas moram embaixo, acima da barra do navegador. A conta era 100svh, que
   em todo navegador é a altura visível com as barras abertas. No Safari 26
   (iOS 26) não é mais: 100svh vale a tela inteira (956 pt num iPhone Pro Max),
   enquanto a página começa embaixo da barra de status e a barra flutuante do
   Safari cobre o pé. Sobram ~800 pt à vista, e o herói contava 956: a frase
   da home ficou atrás da barra (o print do Arthur, 21/10, reconstruído no
   pixel com 100svh = 956) e as pílulas dos heróis de foto, abaixo da tela.

   Este script roda em linha, antes de o herói ser desenhado: compara uma régua
   de 100svh com a innerHeight (a altura visível, com a barra aberta) e, se a
   régua passa, grava --s-tela no <html> com a altura visível. A folha usa
   --s-alt, que é --s-tela quando existe e 100svh (100vh nos navegadores
   antigos) quando não. Nos navegadores em que as duas medidas batem (Chrome,
   Safari até o 18, computador) nada muda.

   Só recalcula quando a largura muda (girar o celular). A barra que encolhe
   ao rolar e o teclado mudam a altura, mas não podem mexer no herói: seria a
   página pulando embaixo do dedo.
   ============================================================================= */
/* 21/10/2026: o mesmo script marca <html class="s-pre"> (há JS, o React ainda
   vai hidratar): com isso o herói que anda com o scroll já nasce com a altura
   de scroll (app/site.css, "A DISTÂNCIA DESDE A PRIMEIRA PINTURA") */
export const TELA_JS = `(function(){try{var d=document.documentElement,w=-1;d.classList.add('s-pre');
function medir(){var r=document.createElement('div');
r.style.cssText='position:absolute;top:0;left:0;width:1px;height:100svh;visibility:hidden;pointer-events:none';
d.appendChild(r);var s=r.getBoundingClientRect().height;d.removeChild(r);
var h=window.innerHeight;w=window.innerWidth;
if(s>0&&h>0&&h<s-1)d.style.setProperty('--s-tela',h+'px');else d.style.removeProperty('--s-tela');}
medir();window.addEventListener('resize',function(){if(window.innerWidth!==w)medir();});
}catch(e){}})();`;
