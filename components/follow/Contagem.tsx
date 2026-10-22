'use client';

import { useEffect, useState } from 'react';
import { IGREJA } from '@/lib/igreja';
import { textoDaContagem } from '@/lib/site/relogio';

/* =============================================================================
   A CONTAGEM ATÉ O PRÓXIMO FOLLOW · 19/10/2026, na língua da casa em 20/10

   O elemento vivo da seção "Quando e onde": quanto falta para sábado às 19h,
   no horário de Brasília (lib/site/relogio.ts; até 22/10, no relógio do
   aparelho). No servidor e até montar, mostra o que é verdade sempre ("Todo
   sábado, às 19h"), para não divergir na hidratação; depois atualiza a cada
   meio minuto, e só escreve quando o texto muda. Durante o culto (sábado, das
   19h às 20h30) diz que está acontecendo. Sai como a linha de apoio da seção
   (.s-lead): o número em negrito, a data em seguida.
   ============================================================================= */
/* 22/10/2026: a conta é no relógio da casa, não no do aparelho (lib/site/relogio.ts):
   em Manaus ou num aparelho com o fuso errado a contagem saía uma hora fora */
export const texto = textoDaContagem;

export default function Contagem() {
  const [t, setT] = useState<{ forte: string; resto: string } | null>(null);
  useEffect(() => {
    let ultimo = '';
    const roda = () => {
      const n = textoDaContagem(new Date());
      const chave = n.forte + n.resto;
      if (chave !== ultimo) { ultimo = chave; setT(n); }
    };
    roda();
    const id = setInterval(roda, 30000);
    return () => clearInterval(id);
  }, []);
  return (
    <p className="s-lead" aria-live="off">
      {t ? <><b className="s-b">{t.forte}</b> {t.resto}</> : <>{`Todo sábado, às ${IGREJA.followHora}. Não precisa de inscrição.`}</>}
    </p>
  );
}
