'use client';
/* =============================================================================
   /cronograma/<token> — A FOLHA DO CULTO PELO LINK DO GRUPO · 109, 03/10/2026

   Quem recebe o link no grupo abre a folha inteira, sem login, e salva o PDF
   num toque ("Salvar PDF" abre a impressão do navegador; no iPhone,
   Imprimir e depois compartilhar). O token não diz a data e não se
   adivinha; a folha não tem telefone de ninguém.

   A folha é lida de novo a cada abertura: ela muda até o dia do culto, e o
   link do grupo é o mesmo do primeiro envio ao último.
   ============================================================================= */
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import FolhaDoCulto, { FolhaParaImprimir } from '@/components/cronograma/FolhaDoCulto';
import { type Folha, rotuloDaAtualizacao, semCronogramaNoBanco, tituloDaFolha } from '@/lib/cronograma';
import { folhaPublica } from '@/lib/cronograma-banco';
import { hojeISO } from '@/lib/engine';
import { IGREJA } from '@/lib/igreja';

type Fase = 'carregando' | 'ok' | 'invalido' | 'rede';

export default function PaginaDaFolha() {
  const { token } = useParams<{ token: string }>();
  const [fase, setFase] = useState<Fase>('carregando');
  const [folha, setFolha] = useState<Folha | null>(null);

  const ler = useCallback(async () => {
    /* harness de design: import dinâmico, fora do build de produção */
    if (process.env.NODE_ENV === 'development' && new URLSearchParams(window.location.search).has('demo')) {
      const { cronogramaDemo } = await import('@/lib/demo');
      const f = cronogramaDemo(new URLSearchParams(window.location.search).get('demo') || '');
      if (f) { setFolha(f); setFase('ok'); } else setFase('invalido');
      return;
    }
    if (!/^[0-9a-f]{18}$/.test(token || '')) { setFase('invalido'); return; }
    try {
      const r = await folhaPublica(token);
      if (r.ok) { setFolha(r.folha); setFase('ok'); try { document.title = `Cronograma · ${tituloDaFolha(r.folha.data)} · GUIA Church`; } catch {} }
      else setFase('invalido');
    } catch (e) {
      setFase(semCronogramaNoBanco(e) ? 'invalido' : 'rede');
    }
  }, [token]);
  useEffect(() => { void ler(); }, [ler]);

  const hoje = hojeISO();
  const atualizado = rotuloDaAtualizacao(folha?.atualizadoEm) || undefined;

  return (
    <main className="fo-pagina">
      {fase === 'carregando' && <div className="fo-pagina-msg" aria-busy="true">Carregando o cronograma…</div>}
      {fase === 'invalido' && (
        <div className="fo-pagina-msg" role="alert">
          <h1>Este link não abre um cronograma</h1>
          <p>Confira se o link veio inteiro. Se continuar, peça o link de novo no grupo.</p>
        </div>
      )}
      {fase === 'rede' && (
        <div className="fo-pagina-msg" role="alert">
          <h1>Sem conexão agora</h1>
          <p>Não consegui carregar o cronograma.</p>
          <button type="button" className="fo-botao" onClick={() => { setFase('carregando'); void ler(); }}>Tentar de novo</button>
        </div>
      )}
      {fase === 'ok' && folha && (
        <>
          <div className="fo-barra">
            <button type="button" className="fo-botao" onClick={() => window.print()}>Salvar PDF</button>
          </div>
          <FolhaDoCulto folha={folha} hoje={hoje} cultoHora={IGREJA.cultoHora} followHora={IGREJA.followHora} atualizado={atualizado} />
          <FolhaParaImprimir folha={folha} hoje={hoje} cultoHora={IGREJA.cultoHora} followHora={IGREJA.followHora} atualizado={atualizado} />
        </>
      )}
    </main>
  );
}
