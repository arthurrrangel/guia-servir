'use client';

import { apagarEscolha } from '@/lib/site/medir-cliente';

/* "Cookies" no pé: apaga a escolha da faixa e recarrega, e a faixa pergunta
   de novo (a LGPD pede que retirar o aceite seja tão fácil quanto dar). Só
   aparece quando existe Pixel no build (components/site/Pe.tsx). */
export default function RevisarCookies() {
  return (
    <button type="button" className="s-pe-botao" onClick={() => { apagarEscolha(); location.reload(); }}>
      Cookies
    </button>
  );
}
