'use client';
/* =============================================================================
   /ajustes/cartaz-de-chegada — O CARTAZ DA PORTA (107, 02/10/2026)

   Uma folha para imprimir e colar na porta da igreja ou na sala dos
   voluntários: quem aponta a câmera abre o próprio link no "Cheguei". O QR
   leva o endereço do MINISTÉRIO (/cheguei/<ministério>), nunca o de alguém:
   o cartaz fica na parede, à vista de todos. Quem abre num celular que já
   conhece cai direto no botão; num celular novo, acha o nome e digita o PIN.

   Impressão: só a folha sai no papel (a casca do sistema some no @media
   print), em A5 de pé ou na metade de uma A4.
   ============================================================================= */
import Shell, { useApp, copiar } from '@/components/Shell';
import Link from 'next/link';
import { useMemo } from 'react';
import qrcode from 'qrcode-generator';
import { Cab, Aviso } from '@/components/escalas/Pecas';
import { linkDoVoluntario } from '@/lib/engine';
import { recadoDaChegada } from '@/components/escalas/ChegadaNosAjustes';

export default function Pagina() { return <Shell><Cartaz /></Shell>; }

/** O QR desenhado como SVG a partir da matriz de módulos, como o do Pix em
 *  components/Ofertar.tsx (copiado e não importado: lá ele é parte da
 *  página de ofertas, e mexer nela por causa da escala não vale o risco). */
function QR({ texto, rotulo }: { texto: string; rotulo: string }) {
  const { n, caminho } = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(texto, 'Byte');
    q.make();
    const n = q.getModuleCount();
    let caminho = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) if (q.isDark(r, c)) caminho += `M${c} ${r}h1v1h-1z`;
    }
    return { n, caminho };
  }, [texto]);
  /* a zona de silêncio de 4 módulos é obrigatória: sem ela o leitor não acha
     as bordas do código */
  const b = 4;
  return (
    <svg className="cz-qr" viewBox={`${-b} ${-b} ${n + b * 2} ${n + b * 2}`}
      role="img" aria-label={rotulo} shapeRendering="crispEdges">
      <rect x={-b} y={-b} width={n + b * 2} height={n + b * 2} fill="#ffffff" />
      <path d={caminho} fill="#101010" />
    </svg>
  );
}

function Cartaz() {
  const { base, equipe, aviso } = useApp();
  const link = linkDoVoluntario(base, equipe?.slug, 'cheguei');
  const curto = link.replace(/^https?:\/\//, '');

  return (
    <>
      <Cab rot="Ajustes" titulo="Cartaz de chegada"
        meta="Para a porta da igreja ou a sala dos voluntários: quem aponta a câmera abre o próprio link no Cheguei." />

      {!link ? (
        <Aviso tom="warn">Este ministério ainda não tem endereço. Recarregue a página.</Aviso>
      ) : (
        <>
          <div className="es-linha cz-acoes">
            <button type="button" className="es-btn es-pri" onClick={() => window.print()}>Imprimir</button>
            <button type="button" className="es-btn es-txt"
              onClick={() => copiar(recadoDaChegada(link), aviso, 'Recado copiado. Cole no grupo no dia do culto.')}>
              Copiar o recado do dia
            </button>
            <Link className="es-btn es-txt" href="/ajustes#chegada">Voltar aos ajustes</Link>
          </div>

          <article className="cz-folha" aria-label={`Cartaz de chegada do ${equipe?.nome || 'ministério'}`}>
            <span className="cz-min">{equipe?.nome || 'GUIA'}</span>
            <h2 className="cz-tit">Chegou para servir?</h2>
            <p className="cz-sub">Aponte a câmera do celular e toque em <b>Cheguei</b>.</p>
            <QR texto={link} rotulo={`Código QR para ${curto}`} />
            <p className="cz-link">{curto}</p>
            <p className="cz-nota">
              Abre o seu link. Num celular novo, é só achar o seu nome e digitar o seu PIN.
            </p>
          </article>
        </>
      )}

      <style>{`
        .cz-acoes{margin:0 0 20px}
        .cz-folha{
          box-sizing:border-box;width:100%;max-width:520px;margin:0 auto 32px;padding:40px 32px 32px;
          display:grid;justify-items:center;gap:12px;text-align:center;
          background:#fff;color:#101010;border:1px solid rgba(16,16,16,.18);border-radius:12px;
        }
        .cz-min{font-size:13px;line-height:18px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#555}
        .cz-tit{margin:0;font-size:34px;line-height:40px;font-weight:700;letter-spacing:-.02em;text-wrap:balance}
        .cz-sub{margin:0;font-size:18px;line-height:26px;max-width:28ch}
        .cz-qr{width:min(100%,300px);height:auto;margin:8px 0}
        .cz-link{margin:0;font-size:16px;line-height:22px;font-weight:600;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
        .cz-nota{margin:0;font-size:14px;line-height:20px;color:#555;max-width:34ch}
        @media print{
          @page{size:A5 portrait;margin:12mm}
          body *{visibility:hidden !important}
          .cz-folha,.cz-folha *{visibility:visible !important}
          .cz-folha{position:absolute;left:0;top:0;width:100%;max-width:none;margin:0;border:0;padding:0}
          .cz-tit{font-size:30pt;line-height:1.15}
          .cz-sub{font-size:15pt}
          .cz-qr{width:75mm}
        }
      `}</style>
    </>
  );
}
