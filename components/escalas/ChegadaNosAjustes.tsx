'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { copiar } from '@/components/Shell';
import { hojeISO, linkDoVoluntario } from '@/lib/engine';
import { presencasDoDia } from '@/lib/db';

/* =============================================================================
   A CHEGADA NO DIA, NOS AJUSTES — 107, 02/10/2026

   Não há o que ligar: o "Cheguei" só aparece para quem está na escala, no
   dia do culto, e o "Como foi" só depois de servir. Esta seção diz que isso
   existe e entrega as duas ferramentas de levar as pessoas até o botão: o
   cartaz com QR para a porta (ou a sala dos voluntários) e o recado do dia
   para o grupo, com o link do ministério (nunca o de alguém).

   SÓ APARECE COM A 107 NO BANCO: um cartaz impresso antes disso mandaria a
   pessoa para uma página sem o botão. A pergunta é a mesma da tela de Escala
   (`presencas_do_dia`); falhou, a seção não existe e o índice não a mostra.
   ============================================================================= */

export function recadoDaChegada(link: string): string {
  return `Bom dia! Chegou para servir hoje? Marque aqui, é um toque: ${link}`;
}

export default function ChegadaNosAjustes({ equipeId, slug, base, aviso, aoSaber }: {
  equipeId: string; slug: string; base: string; aviso: (t: string) => void;
  aoSaber: (existe: boolean) => void;
}) {
  const [existe, setExiste] = useState(false);
  /* quem pergunta é a página (o índice): a função muda a cada desenho dela,
     e não pode refazer a pergunta ao banco por isso */
  const avisa = useRef(aoSaber); avisa.current = aoSaber;
  useEffect(() => {
    let vivo = true;
    presencasDoDia(equipeId, hojeISO()).then(
      () => { if (vivo) { setExiste(true); avisa.current(true); } },
      () => { if (vivo) { setExiste(false); avisa.current(false); } },
    );
    return () => { vivo = false; };
  }, [equipeId]);

  if (!existe) return null;
  const link = linkDoVoluntario(base, slug, 'cheguei');
  return (
    <section className="es-caixa" id="chegada">
      <div className="es-caixa-cab">
        <h2>Chegada no dia</h2>
        <span className="es-peq es-mudo">O &ldquo;Cheguei&rdquo; e o &ldquo;Como foi&rdquo; no link de quem serve</span>
      </div>
      <div className="es-caixa-corpo es-aj-pilha">
        <p className="es-prosa">
          No dia do culto, quem está na escala vê o botão <b>Cheguei</b> no próprio link. A Escala do
          dia mostra quem já chegou, e quem lidera o dia marca quem esqueceu de tocar.
        </p>
        <p className="es-prosa">
          Depois do culto, cada pessoa pode contar <b>como foi</b>: foi bom, foi puxado ou teve
          problema. Só a liderança lê, no Painel e no dia da Escala.
        </p>
        <div className="es-linha">
          <Link className="es-btn" href="/ajustes/cartaz-de-chegada">Cartaz com QR para a porta</Link>
          <button type="button" className="es-btn es-txt" disabled={!link}
            onClick={() => copiar(recadoDaChegada(link), aviso, 'Recado copiado. Cole no grupo no dia do culto.')}>
            Copiar o recado do dia
          </button>
        </div>
      </div>
    </section>
  );
}
