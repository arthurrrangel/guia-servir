/* =============================================================================
   A VIRADA 2027 · 21/11/2026

   O Arthur mandou a copy da landing page (Virada_2027_landing_page.pdf) e
   pediu "fazer essa landing page no dominio da guia - ID VISUAL DA IGREJA COM
   QR PRA INSCRICAO CAINDO NA LP". A página mora em guiachurch.com/virada
   (app/(igreja)/virada) e o QR impresso aponta para ela.

   Este arquivo é lido pela TELA e pelo SERVIDOR: as regras do formulário são
   as mesmas dos dois lados, e o servidor confere de novo tudo o que chega
   (app/api/virada). Quem guarda a reserva e conta as vagas é o banco
   (supabase/118-a-virada-2027-tem-reserva.sql).

   O QUE A COPY DEIXOU EM ABERTO, E COMO FICOU ATÉ ELE DECIDIR
     · "Quantas pessoas posso reservar? [Confirmar regra]": uma reserva por
       família, até 6 pessoas contando quem reserva; cada pessoa conta nas 150
       (o jantar é por pessoa). Mudar é mudar MAX_POR_RESERVA aqui e a linha
       do evento no banco (virada.eventos).
     · "Reserve até [data de encerramento das reservas]": sem a data, a
       reserva pelo site fecha quando as vagas acabam ou quando a noite
       começa (`fechaEm`). A frase só entra na página com a data dele.
     · "[Inserir endereço completo]" e "Como chego até lá? [Inserir
       estacionamento...]": ficam fora da página até ele mandar. Nada de
       endereço achado na internet numa página da igreja.
     · "Dúvidas: [inserir e-mail ou WhatsApp de contato]": o WhatsApp da
       igreja (lib/igreja.ts), o mesmo de todas as páginas.
   ============================================================================= */
import { IGREJA } from './igreja';
import { cpfValido, emailValido, limpaNome, soDigitos } from './followcamp';

export const VIRADA = {
  slug: 'virada-2027',
  nome: 'Virada 2027',
  data: '2026-12-31',
  dataLonga: '31 de dezembro de 2026',
  chegada: '19h30',
  local: 'Espaço Bethel',
  bairro: 'Barra de Guaratiba',
  capacidade: 150,
  /* a noite começa às 19h30: depois disso o site não reserva mais */
  fechaEm: '2026-12-31T19:30:00-03:00',
} as const;
export const MAX_POR_RESERVA = 6;

export type Vinculo = 'membro' | 'visitante';
export const VINCULOS: ReadonlyArray<{ v: Vinculo; rot: string }> = [
  { v: 'membro', rot: 'Sou membro' },
  { v: 'visitante', rot: 'Sou visitante' },
];

export type Reserva = { nome: string; cpf: string; email: string; telefone: string; vinculo: Vinculo; pessoas: number };
export type CampoDaReserva = 'nome' | 'cpf' | 'email' | 'telefone' | 'vinculo' | 'pessoas' | '';
export type Conferida = { ok: true; reserva: Reserva } | { ok: false; erro: string; campo: CampoDaReserva };

/** O site ainda reserva? Depois que a noite começa, não. */
export const reservaAberta = (agora = Date.now()) => agora < Date.parse(VIRADA.fechaEm);

/** Telefone brasileiro com DDD, só os dígitos: celular (11, começa em 9) ou
 *  fixo (10, começa de 2 a 5). Aceita o 55 do país na frente. */
export function telefoneDe(s: string): string | null {
  let d = soDigitos(s);
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  if (Number(d.slice(0, 2)) < 11 || d[1] === '0') return null;
  if (d.length === 11 && d[2] !== '9') return null;
  if (d.length === 10 && !/[2-5]/.test(d[2])) return null;
  return d;
}

/** O nome como a pessoa escreveu, aparado; '' quando falta ou não é nome. */
function erroDoNome(n: string): string | null {
  if (!n) return 'Escreva seu nome completo.';
  if (!/^[\p{L}][\p{L}'’ .-]*[\p{L}.]$/u.test(n)) return 'O nome só pode ter letras.';
  if (n.split(' ').filter(p => p.replace(/[.'’-]/g, '').length >= 2).length < 2) return 'Escreva nome e sobrenome.';
  return null;
}

/** Confere o que o formulário mandou. A primeira falta volta com o campo,
 *  para a tela apontar onde está. */
export function conferirReserva(corpo: unknown): Conferida {
  const o = (corpo && typeof corpo === 'object' ? corpo : {}) as Record<string, unknown>;
  const txt = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : '');
  const nome = limpaNome(txt('nome'));
  const eNome = erroDoNome(nome);
  if (eNome) return { ok: false, erro: eNome, campo: 'nome' };
  const cpf = soDigitos(txt('cpf'));
  if (!cpf) return { ok: false, erro: 'Escreva seu CPF.', campo: 'cpf' };
  if (!cpfValido(cpf)) return { ok: false, erro: 'Confira o CPF: os números não batem.', campo: 'cpf' };
  const email = txt('email').trim().toLowerCase();
  if (!email) return { ok: false, erro: 'Escreva seu e-mail.', campo: 'email' };
  if (!emailValido(email)) return { ok: false, erro: 'Confira o e-mail.', campo: 'email' };
  const telefone = telefoneDe(txt('telefone'));
  if (!soDigitos(txt('telefone'))) return { ok: false, erro: 'Escreva um telefone para contato, com DDD.', campo: 'telefone' };
  if (!telefone) return { ok: false, erro: 'Confira o telefone: DDD e número.', campo: 'telefone' };
  const vinculo = txt('vinculo');
  if (vinculo !== 'membro' && vinculo !== 'visitante') return { ok: false, erro: 'Diga se você é membro ou visitante.', campo: 'vinculo' };
  const p = typeof o.pessoas === 'number' ? o.pessoas : Number(txt('pessoas'));
  if (!Number.isInteger(p) || p < 1 || p > MAX_POR_RESERVA) {
    return { ok: false, erro: `Escolha quantas pessoas vão, de 1 a ${MAX_POR_RESERVA}.`, campo: 'pessoas' };
  }
  return { ok: true, reserva: { nome, cpf, email, telefone, vinculo, pessoas: p } };
}

/* ------------------------------------------------------------- formatos --- */
export function mascaraCpf(bruto: string): string {
  const x = soDigitos(bruto).slice(0, 11);
  return x.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
}
export function mascaraTelefone(bruto: string): string {
  let x = soDigitos(bruto);
  if (x.length >= 12 && x.startsWith('55')) x = x.slice(2);
  x = x.slice(0, 11);
  if (x.length <= 2) return x;
  if (x.length <= 6) return `(${x.slice(0, 2)}) ${x.slice(2)}`;
  if (x.length <= 10) return `(${x.slice(0, 2)}) ${x.slice(2, 6)}-${x.slice(6)}`;
  return `(${x.slice(0, 2)}) ${x.slice(2, 7)}-${x.slice(7)}`;
}
export const pessoasPorExtenso = (n: number) => (n === 1 ? '1 pessoa' : `${n} pessoas`);

/* ------------------------------------------------------------- WhatsApp --- */
const wa = (texto: string) => (IGREJA.whatsapp ? `https://wa.me/${IGREJA.whatsapp}?text=${encodeURIComponent(texto)}` : IGREJA.instagram);

/** Dúvida sobre a noite: o WhatsApp da igreja, com a frase já escrita. */
export const whatsDuvida = () => wa(`Oi! Tenho uma dúvida sobre a ${VIRADA.nome}.`);

/** A reserva inteira, quando o banco não gravou: a pessoa manda pelo
 *  WhatsApp e a administração lança no painel. */
export function whatsDaReserva(r: Reserva): string {
  return wa([
    `Quero reservar meu lugar na ${VIRADA.nome} (${VIRADA.dataLonga}).`,
    `Nome: ${r.nome}`,
    `CPF: ${mascaraCpf(r.cpf)}`,
    `E-mail: ${r.email}`,
    `Telefone: ${mascaraTelefone(r.telefone)}`,
    `${r.vinculo === 'membro' ? 'Sou membro' : 'Sou visitante'} · ${pessoasPorExtenso(r.pessoas)}`,
  ].join('\n'));
}

/** As vagas acabaram: a lista de espera é pelo WhatsApp. */
export const whatsListaDeEspera = () => wa(`Oi! As vagas da ${VIRADA.nome} acabaram no site. Quero entrar na lista de espera.`);

/** Depois de reservar: chamar alguém para ir junto. Abre o WhatsApp da
 *  própria pessoa (sem número), com o convite e o endereço da página. */
export const whatsConvite = () => `https://wa.me/?text=${encodeURIComponent(
  `Vamos juntos na ${VIRADA.nome} da GUIA Church? 31 de dezembro, às ${VIRADA.chegada}, no ${VIRADA.local}. A reserva é grátis: https://guiachurch.com/virada`)}`;

/* ------------------------------------------------------- a contagem --- */
/* 21/11/2026, "mais comercial, chamativo": quanto falta, no calendário de
   Brasília (o Brasil não tem horário de verão desde 2019: -03:00 o ano todo).
   Conta dias de calendário, não blocos de 24 h: no dia 30, à noite, falta 1
   dia, e não "é hoje". */
const BRASILIA = -3 * 3600e3;
const INICIO = Date.parse(VIRADA.fechaEm);                       /* 31/12, 19h30 */
const FIM = Date.parse('2027-01-01T01:00:00-03:00');             /* o fim do brinde */
const diaDe = (ms: number) => Math.floor((ms + BRASILIA) / 86400e3);

export type Contagem =
  | { fase: 'antes'; dias: number }   /* faltam N dias (N >= 1) */
  | { fase: 'hoje' }                  /* 31/12, antes das 19h30 */
  | { fase: 'agora' }                 /* das 19h30 à 1h */
  | { fase: 'depois' };

export function contagemDaVirada(agora: number): Contagem {
  if (agora >= FIM) return { fase: 'depois' };
  if (agora >= INICIO) return { fase: 'agora' };
  const dias = diaDe(INICIO) - diaDe(agora);
  return dias >= 1 ? { fase: 'antes', dias } : { fase: 'hoje' };
}

/** O relógio do ingresso: dias, horas, minutos e segundos até as 19h30 do
 *  dia 31; null quando a noite já começou. */
export function relogioDaVirada(agora: number): { d: number; h: number; m: number; s: number } | null {
  const falta = Math.floor((INICIO - agora) / 1000);
  if (falta <= 0) return null;
  return { d: Math.floor(falta / 86400), h: Math.floor((falta % 86400) / 3600), m: Math.floor((falta % 3600) / 60), s: falta % 60 };
}

/** A frase da contagem: a parte em negrito e a palavra em itálico (a segunda
 *  voz da casa). Depois da noite, a data (o que é verdade sempre). */
export function fraseDaContagem(c: Contagem): { texto: string; it: string } {
  switch (c.fase) {
    case 'antes': return c.dias === 1 ? { texto: 'Falta 1 dia', it: 'dia' } : { texto: `Faltam ${c.dias} dias`, it: 'dias' };
    case 'hoje': return { texto: 'É hoje', it: 'hoje' };
    case 'agora': return { texto: 'Está acontecendo', it: 'acontecendo' };
    default: return { texto: '31 de dezembro', it: 'dezembro' };
  }
}

/** A linha das vagas, quando o banco diz quantas restam. Até 30, a urgência
 *  é o número; zero, esgotou. */
export function fraseDasVagas(restantes: number): string {
  if (restantes <= 0) return 'Esgotado. Entre na lista de espera.';
  if (restantes <= 30) return restantes === 1 ? 'Último lugar' : `Últimos ${restantes} lugares`;
  return `Restam ${restantes} de ${VIRADA.capacidade} lugares`;
}
