/* =============================================================================
   O CONVITE DE CALENDÁRIO DA ESCALA · 16/09/2026

   Um arquivo .ics montado no aparelho, sem servidor: a data do culto, a
   função, o endereço da igreja e o link pessoal. No iPhone abre a prévia
   "Adicionar ao Calendário"; no Android, o app de calendário.

   Horário fixo em -03:00 (o Brasil não tem horário de verão desde 2019), duas
   horas de duração. UID estável por data e função: importar duas vezes atualiza
   o mesmo evento em vez de criar dois.
   ============================================================================= */
import { IGREJA, ENDERECO_LINHA, SITE } from './igreja';
import { minutosDaHora } from './semana';

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const dois = (n: number) => String(n).padStart(2, '0');

/** data 'AAAA-MM-DD' e hora '10h' ou '17h30' → 'AAAAMMDDTHHMMSSZ' em UTC a partir de -03:00 */
function utc(data: string, minutos: number): string {
  const [a, m, d] = data.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, d, 0, 0, 0) + (minutos + 180) * 60000);
  return `${t.getUTCFullYear()}${dois(t.getUTCMonth() + 1)}${dois(t.getUTCDate())}T${dois(t.getUTCHours())}${dois(t.getUTCMinutes())}00Z`;
}

/** `hora` null = dia inteiro (o Follow ainda não tem hora confirmada) */
export function icsDaEscala(p: { data: string; funcao: string; equipe: string; token: string; hora?: string | null; obs?: string | null }): string {
  const ini = p.hora === null ? null : (minutosDaHora(p.hora || IGREJA.cultoHora) ?? 600);
  const d8 = p.data.replace(/-/g, '');
  const quando = ini === null
    ? [`DTSTART;VALUE=DATE:${d8}`, `DTEND;VALUE=DATE:${d8}`]
    : [`DTSTART:${utc(p.data, ini)}`, `DTEND:${utc(p.data, ini + 120)}`];
  const linhas = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${IGREJA.nome}//escala//PT`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${p.data}-${p.funcao.toLowerCase().replace(/[^a-z0-9]+/g, '-')}@guiaservir.com`,
    `DTSTAMP:${utc(p.data, ini ?? 600)}`,
    ...quando,
    `SUMMARY:${esc(`${IGREJA.nome} · ${p.equipe} · ${p.funcao}`)}`,
    `LOCATION:${esc(ENDERECO_LINHA)}`,
    `DESCRIPTION:${esc(`Você está na escala de ${p.equipe} em ${p.funcao}.${p.obs ? ` ${p.obs}` : ''}\nSua escala: ${SITE}/eu/${p.token}`)}`,
    `URL:${SITE}/eu/${p.token}`,
    'BEGIN:VALARM', 'TRIGGER:-PT12H', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`Amanhã: ${p.funcao} na ${IGREJA.nome}`)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(linhas.join('\r\n'));
}
