'use client';
import { useEffect, useState } from 'react';

/* =============================================================================
   INSTALAR COMO APP · o link pessoal vira um ícone no celular

   16/09/2026. O problema real de hoje de manhã: "cada pessoa tem que guardar o
   link dela". Favorito ninguém acha; mensagem no WhatsApp some no rolo. Ícone
   na tela inicial a pessoa acha.

   Três aparelhos, três caminhos:
   · Android e desktop com Chrome/Edge: o navegador avisa que dá para instalar
     (beforeinstallprompt); o botão daqui abre a caixa nativa.
   · iPhone/iPad: não existe aviso; o caminho é Compartilhar → Adicionar à
     Tela de Início. A instrução aparece só ali.
   · Já instalado (display-mode: standalone): nada aparece.

   A página troca o manifesto pelo dela ANTES de qualquer coisa (props.token),
   para que o app instalado abra direto no link pessoal, e registra o service
   worker, que é o que deixa a segunda abertura instantânea.

   "Agora não" guarda a escolha no aparelho por 30 dias: convite que insiste
   vira banner de propaganda.
   ============================================================================= */

const K_DEPOIS = 'escala.instalar-depois';

type EventoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

export default function Instalar({ token }: { token: string }) {
  const [evento, setEvento] = useState<EventoInstalar | null>(null);
  const [modo, setModo] = useState<'nada' | 'chrome' | 'ios'>('nada');

  useEffect(() => {
    /* 1. o manifesto desta pessoa */
    try {
      let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
      if (!link) { link = document.createElement('link'); link.rel = 'manifest'; document.head.appendChild(link); }
      link.href = `/eu/manifest?t=${encodeURIComponent(token)}`;
    } catch {}

    /* 2. o service worker (só onde existe; sem ele o site funciona igual) */
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    /* 3. em que aparelho estamos, e se já é app */
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;
    let depois = 0;
    try { depois = Number(localStorage.getItem(K_DEPOIS) || 0); } catch {}
    if (depois && Date.now() - depois < 30 * 24 * 3600 * 1000) return;

    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) && !/CriOS|FxiOS/.test(navigator.userAgent);
    if (ios) setModo('ios');

    const aoPoder = (e: Event) => { e.preventDefault(); setEvento(e as EventoInstalar); setModo('chrome'); };
    window.addEventListener('beforeinstallprompt', aoPoder);
    return () => window.removeEventListener('beforeinstallprompt', aoPoder);
  }, [token]);

  if (modo === 'nada') return null;

  const agoraNao = () => { try { localStorage.setItem(K_DEPOIS, String(Date.now())); } catch {} setModo('nada'); };
  const instalar = async () => {
    if (!evento) return;
    await evento.prompt();
    const r = await evento.userChoice.catch(() => ({ outcome: 'dismissed' as const }));
    if (r.outcome === 'accepted') setModo('nada'); else agoraNao();
  };

  return (
    <div className="instalar" role="region" aria-label="Instalar como app">
      <div className="instalar-txt">
        <span className="instalar-t">Sua escala na tela do celular</span>
        <span className="instalar-d">
          {modo === 'chrome'
            ? 'Vira um ícone, abre direto na sua página, sem procurar o link.'
            : 'No Safari, toque em Compartilhar e depois em "Adicionar à Tela de Início". Vira um ícone que abre direto aqui.'}
        </span>
      </div>
      <div className="instalar-acoes">
        {modo === 'chrome' && <button type="button" className="vol-bt" onClick={instalar}>Instalar</button>}
        <button type="button" className="instalar-depois" onClick={agoraNao}>Agora não</button>
      </div>
    </div>
  );
}
