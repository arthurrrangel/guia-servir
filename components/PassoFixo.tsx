'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IcSeta } from './Icones';
import { IGREJA, CULTO_QUANDO } from '@/lib/igreja';
import { minutosDaHora } from '@/lib/semana';

/* =============================================================================
   O PRÓXIMO PASSO, DEBAIXO DO POLEGAR

   16/09/2026. No celular, a página inteira pode rolar sete telas e a única
   ação que importa ficar lá em cima, no herói, fora do alcance. Esta barra
   fica fixa no rodapé da tela (só até 899px: no desktop a barra do topo já
   faz esse papel) e diz uma coisa só, a certa para o momento:

     · de segunda a sábado   "Domingo, 21 de setembro · 10h"  →  Como chegar
     · no domingo, no culto  "Ao vivo agora"                  →  Assistir
     · quem já serve         "Sua escala"                     →  Abrir

   O terceiro estado é o que faz o site reconhecer a pessoa: o aparelho que
   já entrou uma vez pelo link pessoal ou pelo PIN guarda o token
   (escala.meu-token), e a partir daí a home vira a porta da escala dela.

   Ela aparece depois da primeira tela: sobre o herói, que já tem o próprio
   botão embaixo, seria uma segunda ação disputando o mesmo lugar. E some
   onde atrapalha: na oferta, na página pessoal e nas telas do organizador.
   O <html> ganha `.com-passo` para o rodapé não terminar escondido atrás.
   ============================================================================= */

const K_TOKEN = 'escala.meu-token';

/* onde a barra NÃO entra: já é a tela da ação, ou é tela de sistema */
const FORA = [/^\/eu/, /^\/ofertar/, /^\/entrar/, /^\/acessar/, /^\/painel/, /^\/escala/, /^\/time/, /^\/ajustes/, /^\/candidatura/, /^\/equipe/, /^\/ministerios/, /^\/servir\/[^/]+\/cadastro/];

/* "Domingo, 10h" em cima, curto, e a data com a rua embaixo: a linha de cima
   nunca precisa cortar, e a de baixo pode. */
function proximoDomingo(agora: Date): { rot: string; data: string; aoVivo: boolean } {
  const d = new Date(agora);
  const dia = d.getDay();
  const ini = minutosDaHora(IGREJA.cultoHora) ?? 600;
  const min = agora.getHours() * 60 + agora.getMinutes();
  /* ao vivo: domingo, da hora do culto até duas horas depois */
  if (dia === 0 && min >= ini && min < ini + 120) return { rot: 'Ao vivo agora', data: '', aoVivo: true };
  let falta = (7 - dia) % 7;
  if (dia === 0 && min >= ini + 120) falta = 7;
  d.setDate(d.getDate() + falta);
  const f = d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
  return { rot: falta === 0 ? `Hoje, ${IGREJA.cultoHora}` : `${IGREJA.cultoDia}, ${IGREJA.cultoHora}`, data: f, aoVivo: false };
}

export default function PassoFixo() {
  const caminho = usePathname() || '/';
  const [token, setToken] = useState('');
  const [ver, setVer] = useState(false);
  const [culto, setCulto] = useState<{ rot: string; data: string; aoVivo: boolean }>({ rot: CULTO_QUANDO, data: '', aoVivo: false });
  const fora = FORA.some(r => r.test(caminho));

  useEffect(() => {
    if (fora) return;
    try { setToken(localStorage.getItem(K_TOKEN) || ''); } catch {}
    const tique = () => setCulto(proximoDomingo(new Date()));
    tique();
    const t = setInterval(tique, 60 * 1000);
    document.documentElement.classList.add('com-passo');
    let pedindo = false;
    const medir = () => { pedindo = false; setVer(window.scrollY > window.innerHeight * 0.6); };
    const aoRolar = () => { if (!pedindo) { pedindo = true; requestAnimationFrame(medir); } };
    medir();
    window.addEventListener('scroll', aoRolar, { passive: true });
    return () => {
      clearInterval(t);
      window.removeEventListener('scroll', aoRolar);
      document.documentElement.classList.remove('com-passo');
    };
  }, [fora]);

  if (fora) return null;

  const rua = IGREJA.rua.split(',')[0];
  let rot = culto.rot, sub = culto.data ? `${culto.data} · ${rua}` : `${rua} · ${IGREJA.bairro}`, href = '/como-chegar', acao = 'Como chegar';
  if (token) { rot = 'Sua escala'; sub = 'Confirmar, avisar, ver o mês'; href = `/eu/${token}`; acao = 'Abrir'; }
  else if (culto.aoVivo) { sub = `Culto de ${IGREJA.cultoDia.toLowerCase()} · ${IGREJA.canalNome}`; href = '/guia-church-tv'; acao = 'Assistir'; }

  return (
    <div className={'passo-fixo' + (ver ? ' ver' : '')} aria-hidden={!ver}>
      <div className="passo-fixo-txt">
        <span className="passo-fixo-rot">{rot}</span>
        <span className="passo-fixo-sub">{sub}</span>
      </div>
      <Link href={href} className="acao cheia passo-fixo-bt" tabIndex={ver ? 0 : -1}>{acao} <IcSeta /></Link>
    </div>
  );
}
