import { IGREJA, SITE_FOLLOW, SITE_IGREJA } from '@/lib/igreja';
import { FC27 } from '@/lib/followcamp';
import { proximasOcorrencias } from '@/lib/site/relogio';

/* =============================================================================
   OS EVENTOS NO JSON-LD (o que o Google lê) · 23/10/2026

   A auditoria dos dados estruturados (scripts/auditoria-dados-estruturados.mjs)
   achou três eventos que o Google não aceita: o culto de domingo (/cultos e
   /eventos) e o Follow (/follow e /eventos) iam só com a agenda semanal do
   schema.org (eventSchedule), sem data de início, e o Follow Camp ia sem lugar.
   O Google pede, de todo evento, nome, data de início e lugar.

   Agora cada encontro semanal sai como as suas próximas ocorrências, cada uma
   com início e fim no horário de Brasília (lib/site/relogio.ts), e as páginas
   que os mostram se refazem uma vez por dia (revalidate), para as datas não
   ficarem no passado entre um deploy e outro. Nada aqui aparece na tela.

   Só fatos que o site já diz: o culto às 10h com "cerca de uma hora e meia"
   (a pergunta "Quanto tempo dura?" do /cultos: às 11h30, o café); o Follow no
   sábado às 19h, com uma hora e meia; o endereço de lib/igreja.ts; o Follow
   Camp de 05 a 10 de fevereiro de 2027 no Espaço Bethel, em Barra de
   Guaratiba (RJ), como dizem a página do Camp e a ficha de autorização
   (lib/followcamp-ficha.ts). A rua do Espaço Bethel o site não diz, e não
   entra.
   ============================================================================= */

const DOMINGO = 0, SABADO = 6;
const DURACAO_CULTO_MIN = 90, DURACAO_FOLLOW_MIN = 90;
/** quantas semanas à frente vão para o JSON-LD da página do encontro */
export const SEMANAS = 6;

export const ENDERECO_DA_CASA = {
  '@type': 'PostalAddress', streetAddress: IGREJA.rua, addressLocality: `${IGREJA.bairro}, ${IGREJA.cidade}`,
  addressRegion: IGREJA.uf, postalCode: IGREJA.cep, addressCountry: 'BR',
} as const;
const NA_CASA = { '@type': 'Place', name: IGREJA.nome, address: ENDERECO_DA_CASA } as const;
const A_IGREJA = { '@type': 'Church', name: IGREJA.nome, url: SITE_IGREJA } as const;
const PRESENCIAL = {
  eventStatus: 'https://schema.org/EventScheduled',
  eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
  isAccessibleForFree: true,
} as const;

/** os próximos cultos de domingo, um evento por domingo */
export function cultosDeDomingo(agora: Date, n = SEMANAS) {
  return proximasOcorrencias(agora, DOMINGO, IGREJA.cultoHora, DURACAO_CULTO_MIN, n).map(datas => ({
    '@type': 'Event', name: `Culto de domingo · ${IGREJA.nome}`,
    description: 'Culto público semanal, aberto a visitantes.',
    ...datas, ...PRESENCIAL,
    url: `${SITE_IGREJA}/cultos`, image: [`${SITE_IGREJA}/og-cultos.jpg`],
    location: NA_CASA, organizer: A_IGREJA,
  }));
}

/** os próximos Follows (sábado), um evento por sábado; nenhum se o Follow estiver sem hora */
export function follows(agora: Date, n = SEMANAS) {
  if (!IGREJA.followHora) return [];
  return proximasOcorrencias(agora, SABADO, IGREJA.followHora, DURACAO_FOLLOW_MIN, n).map(datas => ({
    '@type': 'Event', name: 'Follow',
    description: `O culto de jovens da GUIA Church: louvor, uma palavra pra vida real e gente da sua idade. Todo sábado, ${IGREJA.followHora}, na ${IGREJA.bairro}.`,
    ...datas, ...PRESENCIAL,
    url: SITE_FOLLOW, image: [`${SITE_FOLLOW}/follow/og.jpg`],
    location: NA_CASA, organizer: A_IGREJA,
  }));
}

/** o Follow Camp: as datas de lib/followcamp.ts (o dia inteiro, sem hora) e o lugar */
export function followCamp() {
  return {
    '@type': 'Event', name: FC27.nome, startDate: FC27.inicio, endDate: FC27.fim, ...PRESENCIAL, isAccessibleForFree: false,
    url: `${SITE_IGREJA}/followcamp`,
    location: { '@type': 'Place', name: 'Espaço Bethel', address: { '@type': 'PostalAddress', addressLocality: 'Barra de Guaratiba, Rio de Janeiro', addressRegion: 'RJ', addressCountry: 'BR' } },
    organizer: A_IGREJA,
  };
}
