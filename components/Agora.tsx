'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { IcSeta } from './Icones';
import { DIAS_URL, fraseDoAgora, proxima, type Ocorrencia } from '@/lib/semana';
import { IGREJA, canalDeConversa } from '@/lib/igreja';
import { wazeDaPequenaGuia } from '@/lib/pequenas-guias';

/* =============================================================================
   AGORA — a linha viva do herói e a ação que vai com ela

   O site v3 abre falando da PRÓXIMA coisa que acontece na igreja, calculada
   no aparelho da pessoa (lib/semana.ts). Até montar, mostra o culto de
   domingo, que é verdade sempre. A ação principal muda com o evento:
   grupo com endereço público → Waze; grupo sem → a conversa; culto → como
   chegar. Uma ação, a certa para o momento.

   A linha tem altura reservada nos dois estados: o texto troca, a página não
   pula.
   ============================================================================= */

export function Agora({ pill }: { pill?: boolean } = {}) {
  const [o, setO] = useState<Ocorrencia | null>(null);
  useEffect(() => {
    const tique = () => setO(proxima(new Date()));
    tique();
    /* muda sozinho quando a hora passa (a aba fica aberta no domingo de manhã) */
    const t = setInterval(tique, 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const f = o ? fraseDoAgora(o) : { quando: `${IGREJA.cultoDia}, ${IGREJA.cultoHora}`, oque: 'Culto de domingo' };

  let acao: { href: string; rot: string; fora?: boolean } = { href: '/como-chegar', rot: 'Como chegar' };
  if (o?.evento.tipo === 'grupo' && o.evento.grupo) {
    const g = o.evento.grupo;
    const waze = wazeDaPequenaGuia(g);
    if (g.online) acao = { href: `/pequena-guia?dia=${DIAS_URL[o.evento.dia]}`, rot: 'Ver o grupo' };
    else if (waze) acao = { href: waze, rot: 'Ir de Waze', fora: true };
    else acao = { href: canalDeConversa(`Oi! Vi o site da GUIA e quero ir na ${g.nome} (${g.dia}, ${g.hora}). Meu nome é: `).href, rot: 'Quero ir nessa', fora: true };
  } else if (o?.evento.tipo === 'follow') {
    acao = { href: '/cultos#follow', rot: 'Sobre o Follow' };
  }

  /* a versão compacta: uma pílula acima do título do herói, no lugar do
     rótulo fixo — o "agora" da igreja como o anúncio de um produto */
  if (pill) {
    const dentro = (
      <>
        <span className="agora-pill-pt" aria-hidden="true" />
        <span className="agora-pill-q">{f.quando}</span>
        <span className="agora-pill-o">{f.oque}</span>
        <IcSeta />
      </>
    );
    return acao.fora
      ? <a href={acao.href} target="_blank" rel="noreferrer" className="agora-pill" aria-live="polite">{dentro}</a>
      : <Link href={acao.href} className="agora-pill" aria-live="polite">{dentro}</Link>;
  }

  /* 14/09/2026: só existe <Agora pill /> no site. O ramo sem `pill` que ficava
     aqui usava sete classes que nunca existiram na folha (agora-vivo,
     agora-linha, agora-quando, agora-sep, agora-oque, agora-onde, agora-acoes)
     e uma âncora #semana que não corresponde a id nenhum. Sairia sem estilo se
     alguém ligasse. Ramo morto, apagado. */
  return null;
}
