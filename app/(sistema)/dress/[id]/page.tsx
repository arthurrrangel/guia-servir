'use client';
/* =============================================================================
   /dress/<id> — O DRESS CODE PELO LINK DO GRUPO · 116, 26/10/2026

   A mensagem da escala do Louvor leva as cores e este link. Quem toca vê,
   sem login, as cores em amostras (com o nome), o estilo, as orientações e
   as imagens de inspiração, e abre cada imagem inteira. "O objetivo é que
   ninguém precise ficar perguntando no grupo quais roupas ou cores deverá
   utilizar."

   O id não diz a data e não se adivinha; a página não tem nome nem
   telefone de ninguém. Ela lê de novo a cada abertura: o líder pode mudar
   as cores até o dia, e o link do grupo é o mesmo. Vale até uma semana
   depois do culto (`dress_code_publico`).

   Na língua da página de quem serve (a barra, o papel, o chapéu), com a
   mesma peça de /eu/<token> (components/DressCodeVisual.tsx).
   ============================================================================= */
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import DressCodeVisual from '@/components/DressCodeVisual';
import { Logo } from '@/components/Marca';
import { type DressPublico, dressPublico, idDoDressValido } from '@/lib/dress-code';
import { diaLongo, horaDoDia } from '@/lib/engine';
import { IGREJA } from '@/lib/igreja';
import { SUPA_URL, rpc } from '@/lib/publico';

type Fase = 'carregando' | 'ok' | 'invalido' | 'rede';

export default function PaginaDoDressCode() {
  const { id } = useParams<{ id: string }>();
  const [fase, setFase] = useState<Fase>('carregando');
  const [x, setX] = useState<DressPublico | null>(null);

  const ler = useCallback(async () => {
    const idl = (id || '').toLowerCase();
    if (!idDoDressValido(idl)) { setFase('invalido'); return; }
    const r = await rpc('dress_code_publico', { p_id: idl });
    if (r.error) {
      /* 4xx: a porta não existe ou recusou (é link que não vale); sem
         resposta ou 5xx: é a rede, e vale tentar de novo */
      const st = r.error.status || 0;
      setFase(st >= 400 && st < 500 ? 'invalido' : 'rede');
      return;
    }
    const lido = dressPublico(r.data);
    if (!lido) { setFase('invalido'); return; }
    setX(lido); setFase('ok');
    try {
      const dia = diaLongo(lido.data, lido.evento);
      document.title = `Dress code · ${dia.charAt(0).toUpperCase()}${dia.slice(1)} · GUIA Servir`;
    } catch { /* o título do servidor fica */ }
  }, [id]);
  useEffect(() => { void ler(); }, [ler]);

  const hora = x ? horaDoDia(x.inicio, x.evento, x.data, IGREJA.cultoHora, IGREJA.followHora) : null;

  return (
    <div className="vol">
      <div className="vol-barra" role="banner">
        <div className="vol-barra-in">
          <Link href="/" aria-label="GUIA Servir"><Logo className="logo" titulo="GUIA Servir" /></Link>
        </div>
      </div>
      <div className="vol-in" role="main">
        {fase === 'carregando' && (
          <div className="vol-chamada" aria-busy="true">
            <span className="rot">Dress code</span>
            <h1>Carregando</h1>
          </div>
        )}
        {fase === 'invalido' && (
          <div className="vol-chamada" role="alert">
            <span className="rot">Dress code</span>
            <h1>Este link não abre um dress code</h1>
            <p className="vol-sub">
              Confira se o link veio inteiro. Ele vale até uma semana depois do culto; se continuar, peça o link de novo no grupo.
            </p>
          </div>
        )}
        {fase === 'rede' && (
          <div className="vol-chamada" role="alert">
            <span className="rot">Dress code</span>
            <h1>Sem conexão agora</h1>
            <p className="vol-sub">Não consegui carregar o dress code. Tente de novo quando o sinal voltar.</p>
            <div className="vol-btns" style={{ maxWidth: 360 }}>
              <button type="button" className="vol-bt" style={{ background: 'var(--noite)', color: '#fff', borderColor: 'var(--noite)' }}
                onClick={() => { setFase('carregando'); void ler(); }}>Tentar de novo</button>
            </div>
          </div>
        )}
        {fase === 'ok' && x && (
          <>
            <header className="dc-cab">
              <span className="rot">Dress code{x.equipe ? ` · ${x.equipe}` : ''}</span>
              <h1>{diaLongo(x.data, x.evento)}</h1>
              {hora && <p className="vol-sub">{x.evento ? `Começa às ${hora}` : `Culto às ${hora}`}</p>}
            </header>
            <DressCodeVisual dress={x.dress} supabaseUrl={SUPA_URL} />
            <p className="dc-pe">Quem está escalado neste culto também vê isto no próprio link.</p>
          </>
        )}
      </div>
    </div>
  );
}
