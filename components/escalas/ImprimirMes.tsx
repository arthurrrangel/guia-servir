'use client';
/* =============================================================================
   A FOLHA DA ESCALA DO MÊS, SÓ PARA O PAPEL — 103, 01/10/2026

   Fica no fim do <body> (portal), escondida na tela, e é a ÚNICA coisa que
   sai na impressão: a regra de impressão em globals.css esconde todo o resto
   (`body > *:not(.impresso)`). Por isso o botão "Salvar em PDF" da Escala
   é só `window.print()`: o navegador abre a janela de imprimir, e "Salvar
   como PDF" está nela (no iPhone, Imprimir e depois compartilhar).

   O conteúdo vem de `escalaDoMesParaImprimir` (lib/imprimir.ts).
   ============================================================================= */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Estado } from '@/lib/engine';
import { escalaDoMesParaImprimir } from '@/lib/imprimir';
import { IGREJA } from '@/lib/igreja';

export default function ImprimirMes({ S, ano, mes, equipe }: { S: Estado; ano: number; mes: number; equipe: string }) {
  const [montado, setMontado] = useState(false);
  useEffect(() => { setMontado(true); }, []);
  if (!montado) return null;
  const folha = escalaDoMesParaImprimir(S, ano, mes, IGREJA.cultoHora, IGREJA.followHora);
  const hoje = new Date();
  const gerada = `${String(hoje.getDate()).padStart(2, '0')}/${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}`;
  return createPortal(
    <div className="impresso" aria-hidden="true">
      <header className="impresso-cab">
        <div className="impresso-igreja">GUIA Church · {equipe}</div>
        <h1 className="impresso-tit">{folha.titulo}</h1>
      </header>
      {!folha.montados && <p className="impresso-vazio">Nenhum culto deste mês foi montado ainda.</p>}
      <div className="impresso-dias">
        {folha.dias.map(d => (
          <section className="impresso-dia" key={d.data}>
            <h2 className="impresso-dia-tit">{d.titulo}</h2>
            <table className="impresso-tab">
              <tbody>
                {d.postos.map(p => (
                  <tr key={p.funcao}>
                    <th scope="row">{p.funcao}</th>
                    <td className={p.aberta ? 'impresso-aberta' : ''}>
                      {p.quem}{p.nota && <span className="impresso-nota"> ({p.nota})</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!!d.plantao.length && <p className="impresso-extra"><b>Plantão:</b> {d.plantao.join(', ')}</p>}
            {!!d.obs && <p className="impresso-extra"><b>Recado:</b> {d.obs}</p>}
          </section>
        ))}
      </div>
      <footer className="impresso-pe">Gerada em {gerada} · guiaservir.com</footer>
    </div>,
    document.body,
  );
}
