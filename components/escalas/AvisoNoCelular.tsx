'use client';
/* =============================================================================
   LIGAR O AVISO NO CELULAR — 104, 01/10/2026

   O cartão do link do voluntário que liga o aviso do próprio navegador
   (web push): pedido de troca, resposta da troca, e o lembrete 3 dias e 1
   dia antes da escala. Grátis, sem app de loja.

   QUANDO APARECE, E QUANDO NÃO:
     · sem as chaves do aviso no Vercel (`/api/aviso/chave` devolve null):
       não aparece. Nada aqui promete o que o servidor ainda não manda;
     · iPhone fora do app instalado: o iOS só entrega aviso para a página na
       Tela de Início (iOS 16.4+). O cartão diz isso, e só isso;
     · navegador sem aviso: não aparece;
     · aviso bloqueado pela pessoa: diz onde liberar.

   Desligar tira ESTE vínculo deste aparelho e não cancela a inscrição do
   navegador: a mesma pessoa pode servir em duas áreas, com dois links, no
   mesmo celular, e o outro link continua avisando.
   ============================================================================= */
import { useEffect, useState } from 'react';
import { sbPublico as sb } from '@/lib/supabase';

type Estado = 'nada' | 'ios-instalar' | 'bloqueado' | 'desligado' | 'ligado';

/* a chave pública vem em base64url; o navegador quer os bytes */
function bytesDaChave(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

export default function AvisoNoCelular({ token, avisar, errar }: {
  token: string; avisar: (m: string) => void; errar: (m: string) => void;
}) {
  const [estado, setEstado] = useState<Estado>('nada');
  const [chave, setChave] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      let k = '';
      try { k = ((await (await fetch('/api/aviso/chave', { cache: 'no-store' })).json())?.chave) || ''; } catch {}
      if (!vivo || !k) return;
      setChave(k);
      const nav = navigator as Navigator & { standalone?: boolean };
      const ios = /iPhone|iPad|iPod/.test(nav.userAgent);
      const instalado = window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
      if (ios && !instalado) { setEstado('ios-instalar'); return; }
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
      if (Notification.permission === 'denied') { setEstado('bloqueado'); return; }
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          const { data } = await sb()!.rpc('eu_aviso_estado', { p_token: token, p_endpoint: sub.endpoint });
          if (!vivo) return;
          if ((data as any)?.ligado) { setEstado('ligado'); return; }
        }
      } catch { /* sem como perguntar: oferece ligar */ }
      if (vivo) setEstado('desligado');
    })();
    return () => { vivo = false; };
  }, [token]);

  async function ligar() {
    if (ocupado) return;
    setOcupado(true);
    try {
      /* o pedido de permissão vem PRIMEIRO, ainda dentro do toque: o iPhone
         recusa o pedido que chega depois de uma espera */
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setEstado(perm === 'denied' ? 'bloqueado' : 'desligado');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      const assinar = () => reg.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: bytesDaChave(chave) as BufferSource,
      });
      try { if (!sub) sub = await assinar(); }
      catch {
        /* inscrição antiga com outra chave: refaz */
        const velha = await reg.pushManager.getSubscription();
        if (velha) await velha.unsubscribe();
        sub = await assinar();
      }
      const j = sub!.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      const { data, error } = await sb()!.rpc('eu_aviso_ligar', {
        p_token: token, p_endpoint: j.endpoint, p_p256dh: j.keys?.p256dh, p_auth: j.keys?.auth,
      });
      if (error || !(data as any)?.ok) { errar('Não consegui ligar o aviso neste celular. Tente de novo.'); return; }
      setEstado('ligado');
      avisar('Aviso ligado neste celular.');
    } catch {
      errar('Não consegui ligar o aviso neste celular. Tente de novo.');
    } finally {
      setOcupado(false);
    }
  }

  async function desligar() {
    if (ocupado) return;
    setOcupado(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sb()!.rpc('eu_aviso_desligar', { p_token: token, p_endpoint: sub.endpoint });
      setEstado('desligado');
      avisar('Aviso desligado neste celular.');
    } catch {
      errar('Não consegui desligar agora. Tente de novo.');
    } finally {
      setOcupado(false);
    }
  }

  if (estado === 'nada') return null;
  return (
    <div className="instalar" role="region" aria-label="Aviso no celular" id="aviso-no-celular">
      <div className="instalar-txt">
        <span className="instalar-t">{estado === 'ligado' ? 'Aviso ligado neste celular' : 'Aviso no celular'}</span>
        <span className="instalar-d">
          {estado === 'ligado'
            ? 'Você recebe aviso quando um colega pede troca com você e um lembrete 3 dias e 1 dia antes da sua escala.'
            : estado === 'ios-instalar'
              ? 'No iPhone, o aviso funciona com esta página na Tela de Início: toque em Compartilhar, depois em "Adicionar à Tela de Início", abra pelo ícone e ligue o aviso aqui.'
              : estado === 'bloqueado'
                ? 'O aviso está bloqueado neste navegador. Para ligar, libere as notificações deste site nas configurações do navegador e volte aqui.'
                : 'Receba um aviso quando um colega pedir troca com você e um lembrete 3 dias e 1 dia antes da sua escala.'}
        </span>
      </div>
      {(estado === 'desligado' || estado === 'ligado') && (
        <div className="instalar-acoes">
          {estado === 'desligado'
            ? <button type="button" className="vol-bt" disabled={ocupado} onClick={ligar}>{ocupado ? 'Ligando…' : 'Ligar aviso'}</button>
            : <button type="button" className="instalar-depois" disabled={ocupado} onClick={desligar}>Desligar</button>}
        </div>
      )}
    </div>
  );
}
