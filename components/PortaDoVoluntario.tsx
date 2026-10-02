'use client';
import { useEffect } from 'react';
import { sbPublico as sb } from '@/lib/supabase';
import {
  PRINCIPAL, codigoDaOrigem, esquecerOnde, lembrarVinculo, ondeConhece, proximoPassoDaPorta, tokenDoMinisterio, ultimoToken,
} from '@/lib/meu-token';

/* =============================================================================
   A PORTA DO LINK QUE VAI NO GRUPO — 01/10/2026

   A mensagem da escala vai para o grupo do WhatsApp com UM link por
   ministério: guiaservir.com/confirmar/louvor. Ele não carrega o token de
   ninguém (o token é a chave da pessoa, e o grupo inteiro leria). Quem abre
   cai aqui, e esta página decide para onde mandar:

     1. o aparelho já abriu a página desta pessoa NESTE ministério, neste
        endereço: direto para /eu/<token>, na confirmação (ou nos dias, se o
        link for o de disponibilidade). Zero toque.
     2. o aparelho só conhece um token antigo, sem saber de que ministério:
        pergunta ao banco (`eu_espaco`, pública, só com o token) de qual é.
        Se for deste, vai direto e passa a lembrar.
     3. o bilhete de `.guiaservir.com` diz que o aparelho conhece alguém
        deste ministério no OUTRO endereço da igreja: um salto até lá, que
        resolve pelo armazenamento de lá. Um salto só: `#h=` leva quem já foi
        visitado (códigos de lib/meu-token, nunca um endereço), e o fragmento
        sobrevive a redirecionamento do servidor.
     4. nada disso: a porta da equipe, no endereço principal, onde a pessoa
        acha o nome e entra com o PIN. Depois de entrar, a porta a leva ao
        mesmo ponto da página, e o vínculo fica guardado onde os links do
        grupo apontam.

   A primeira versão saltava às cegas pelos três endereços antes do PIN: três
   cargas de página para quem o aparelho não conhecia (o caso mais comum) e
   laço infinito se um redirecionamento perdesse o `?h=` (auditoria de
   01/10/2026). Agora só salta quem o bilhete diz que é conhecido do outro lado.

   Nunca fica parada: a pergunta ao banco tem 2,5 s; a porta inteira, 6 s. E o
   link "Se não abrir sozinho, toque aqui" está na página desde o primeiro
   byte, sem depender de JavaScript.
   ============================================================================= */

/* 107 · `cheguei`: o cartaz da porta da igreja e o recado do dia, que abrem
   a página da pessoa no "Cheguei" (#hoje) */
export type ParaOnde = 'confirmar' | 'disponibilidade' | 'cheguei';
export const ANCORA: Record<ParaOnde, string> = { confirmar: '#confirmar', disponibilidade: '#quando-posso', cheguei: '#hoje' };
const MARCA: Record<ParaOnde, string> = { confirmar: 'c', disponibilidade: 'd', cheguei: 'h' };

export default function PortaDoVoluntario({ slug, para, base = '' }: {
  slug: string; para: ParaOnde;
  /* o endereço principal, quando o servidor sabe que a página está num dos
     endereços da igreja: o link de reserva já nasce apontando para lá */
  base?: string;
}) {
  const daEquipe = `/equipe/${encodeURIComponent(slug)}?ir=${para}`;

  useEffect(() => {
    let vivo = true;
    const ir = (url: string) => { if (vivo) { vivo = false; location.replace(url); } };
    const aqui = codigoDaOrigem();
    const portaDaEquipe = () => ir(aqui ? PRINCIPAL + daEquipe : daEquipe);
    const paraEu = (t: string) => ir(`/eu/${t}?porta=${MARCA[para]}&m=${encodeURIComponent(slug)}${ANCORA[para]}`);
    const relogio = window.setTimeout(portaDaEquipe, 6000);

    (async () => {
      const t = tokenDoMinisterio(slug);
      if (t) return paraEu(t);
      const u = ultimoToken();
      if (u) {
        try {
          const r: any = await Promise.race([
            sb()!.rpc('eu_espaco', { p_token: u }),
            new Promise(ok => window.setTimeout(() => ok(null), 2500)),
          ]);
          if (r?.data?.ok && r.data.equipe_slug === slug) { lembrarVinculo(u, slug); return paraEu(u); }
        } catch {}
      }
      /* o bilhete dizia "aqui" e aqui não há ninguém (armazenamento limpo):
         ele sai, para a próxima abertura não saltar à toa */
      esquecerOnde(slug);
      ir(proximoPassoDaPorta(aqui, location.hash, ondeConhece(slug), slug, para));
    })();
    return () => { vivo = false; window.clearTimeout(relogio); };
  }, [slug, para, daEquipe]);

  return (
    <main className="porta-vol">
      <p className="porta-vol-txt" role="status">
        {para === 'disponibilidade' ? 'Abrindo os seus dias…' : para === 'cheguei' ? 'Abrindo o seu dia…' : 'Abrindo a sua escala…'}
      </p>
      <p className="porta-vol-sub"><a href={base + daEquipe}>Se não abrir sozinho, toque aqui</a></p>
      <style>{`
        .porta-vol{min-height:70vh;display:grid;place-content:center;gap:12px;padding:24px 16px;
          text-align:center;font-family:var(--fonte);color:var(--ink);background:var(--bg)}
        .porta-vol-txt{font-size:17px;line-height:24px;font-weight:600;margin:0}
        .porta-vol-sub{font-size:15px;line-height:22px;margin:0}
        .porta-vol .porta-vol-sub a{color:var(--ink);text-decoration:underline;text-underline-offset:3px}
      `}</style>
    </main>
  );
}
