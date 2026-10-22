/* =============================================================================
   O RELÓGIO DA CASA · 22/10/2026

   O culto é domingo às 10h e o Follow, sábado às 19h, no horário de Brasília,
   não no do aparelho. A contagem do Follow (components/follow/Contagem.tsx) e o
   "Próximo culto" (components/site/ProximoCulto.tsx) faziam a conta no fuso do
   aparelho: em Manaus (uma hora a menos), em Lisboa ou num aparelho com o fuso
   errado, a contagem e o "hoje" saíam fora do lugar. O resto do repositório já
   conta em America/Sao_Paulo (lib/engine.ts, lib/chegada.ts). O Brasil não tem
   horário de verão desde 2019: o fuso da casa é -03:00, fixo.

   A conta é feita no "relógio de parede" do Rio: um Date cujos campos UTC
   (getUTCDay, getUTCHours...) são a hora de Brasília; o instante de verdade
   volta pelo deslocamento inverso. Funções puras, testadas com o aparelho em
   quatro fusos (scripts/relogio-da-casa.test.mjs).
   ============================================================================= */
import { IGREJA } from '@/lib/igreja';

const FUSO_MIN = -3 * 60;
const parede = (instante: Date) => new Date(instante.getTime() + FUSO_MIN * 60000);
const doRelogio = (p: Date) => new Date(p.getTime() - FUSO_MIN * 60000);
/* a data por extenso do relógio de parede (os campos UTC já são os do Rio) */
const porExtenso = (p: Date) => p.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', timeZone: 'UTC' });

/* ------------------------------------------------------------- o Follow */
const HORA_FOLLOW = 19, DURACAO_FOLLOW_MIN = 90;

/** o próximo Follow (sábado, 19h no Rio) e se ele está acontecendo agora (19h às 20h30) */
export function proximoFollow(agora: Date): { quando: Date; agoraMesmo: boolean } {
  const p = parede(agora);
  const d = new Date(p);
  d.setUTCHours(HORA_FOLLOW, 0, 0, 0);
  const dia = d.getUTCDay();                           /* 6 = sábado */
  let falta = (6 - dia + 7) % 7;
  const fimDeHoje = new Date(d); fimDeHoje.setUTCMinutes(DURACAO_FOLLOW_MIN);
  if (dia === 6) {
    if (p >= d && p < fimDeHoje) return { quando: doRelogio(d), agoraMesmo: true };
    if (p >= fimDeHoje) falta = 7;
  }
  d.setUTCDate(d.getUTCDate() + falta);
  return { quando: doRelogio(d), agoraMesmo: false };
}

/** a linha da contagem: o número em negrito ("Faltam 2 dias e 17h.") e o dia ("Sábado, 24 de outubro.") */
export function textoDaContagem(agora: Date): { forte: string; resto: string } {
  const { quando, agoraMesmo } = proximoFollow(agora);
  const data = porExtenso(parede(quando));
  if (agoraMesmo) return { forte: 'Acontecendo agora.', resto: `Começou às ${IGREJA.followHora}, hoje, ${data}.` };
  const min = Math.max(0, Math.round((quando.getTime() - agora.getTime()) / 60000));
  const dias = Math.floor(min / 1440), horas = Math.floor((min % 1440) / 60), mins = min % 60;
  let forte: string;
  if (dias >= 1) forte = `${dias === 1 ? 'Falta 1 dia' : `Faltam ${dias} dias`} e ${horas}h.`;
  else if (horas >= 1) forte = `${horas === 1 ? 'Falta 1h' : `Faltam ${horas}h`} e ${String(mins).padStart(2, '0')} min.`;
  else forte = mins === 1 ? 'Falta 1 min.' : `Faltam ${mins} min.`;
  const hoje = dias === 0 && parede(quando).getUTCDate() === parede(agora).getUTCDate();
  /* a hora já está no título da seção ("Todo sábado às 19h"): aqui só o dia */
  return { forte, resto: `${hoje ? 'Hoje' : 'Sábado'}, ${data}.` };
}

/* --------------------------------------------------------- o culto de domingo */
/* depois do meio-dia de domingo (o culto é das 10h ao meio-dia), o próximo é o da outra semana */
const FIM_DO_CULTO_H = 12;

/** "Domingo, 25 de outubro · 10h" (ou "Hoje, 25 de outubro · 10h" no domingo de manhã) */
export function textoDoProximoCulto(agora: Date): string {
  const d = parede(agora);
  const dia = d.getUTCDay();
  let falta = (7 - dia) % 7;
  if (dia === 0 && d.getUTCHours() >= FIM_DO_CULTO_H) falta = 7;
  d.setUTCDate(d.getUTCDate() + falta);
  /* data e hora não se separam no "·" (o Chrome quebra depois do ponto) */
  const j = ' ·⁠ ';
  return falta === 0 ? `Hoje, ${porExtenso(d)}${j}${IGREJA.cultoHora}` : `${IGREJA.cultoDia}, ${porExtenso(d)}${j}${IGREJA.cultoHora}`;
}
