/* =============================================================================
   TROCA, FUNÇÃO NOVA E AGENDA NO LINK DO VOLUNTÁRIO — 103, 01/10/2026

   O que a tela diz sobre os três recursos novos mora aqui, e não dentro do
   componente, pelo motivo de sempre neste repositório: regra que decide o
   que a pessoa lê não pode viver solta num `.tsx` onde nenhum teste alcança.
   `scripts/trocas.test.mjs` tem a tabela verdade.

   As frases seguem a regra da tela do voluntário: dizer o que aconteceu e o
   que fazer, sem prometer o que o sistema não faz. O sistema NÃO avisa
   ninguém sozinho (ainda não há aviso no celular): por isso nenhuma frase
   diz "avisamos". Quem pediu vê a resposta no próprio link; o botão do
   WhatsApp existe para a pessoa avisar o colega com a mão dela.
   ============================================================================= */
import { diaLongo, horaDoDia, MESES } from './engine';

export type Nivel = 'titular' | 'reserva' | 'treino';

/* uma linha de `eu_trocas` */
export type Troca = {
  id: string; papel: 'pedi' | 'me_pediram';
  culto_id: string; data: string; inicio: string | null; evento: string | null;
  funcao_id: string; funcao: string; outro: string | null;
  status: 'aberta' | 'aceita' | 'recusada' | 'cancelada' | 'expirada';
  impede: string | null; criado_em: string; respondido_em: string | null;
};

/* uma linha de `eu_troca_candidatos` (sem telefone, de propósito) */
export type Candidato = {
  voluntario_id: string; nome: string; nivel: Nivel; disse_que_pode: boolean; ja_pedi: boolean;
};

/* uma linha de `eu_eventos` */
export type Evento = {
  culto_id: string; data: string; evento: string; inicio: string | null; fim: string | null;
  escalado: boolean; resposta: 'posso' | 'nao' | null;
};

/* uma linha de `eu_funcoes` */
export type FuncaoDaArea = {
  funcao_id: string; nome: string; ordem: number; descricao: string | null;
  nivel: Nivel | null; confirmado: boolean | null; pode_pedir: boolean;
  exige_sexo: 'M' | 'F' | null; sem_niveis: boolean;
};

/* a vaga para a qual a pessoa está pedindo troca */
export type Vaga = {
  culto_id: string; funcao_id: string; funcao: string; data: string;
  evento?: string | null; inicio?: string | null;
};

const primeiroNome = (n: string | null | undefined) => (n || '').trim().split(/\s+/)[0] || 'A pessoa';

/* O NÍVEL NAS PALAVRAS DA TELA DO VOLUNTÁRIO. É o mesmo par que a tela do
   líder usa em "Esperando sua conferência": quem disse "faz sozinho" conta
   como "ajuda quando falta" até alguém conferir. */
export const NIVEL_EM_PALAVRAS: Record<Nivel, string> = {
  titular: 'faz sozinho', reserva: 'ajuda quando falta', treino: 'está aprendendo',
};
/* e na primeira pessoa, para a escolha de quem acrescenta função */
export const NIVEL_EU: Record<Nivel, string> = {
  titular: 'Faço sozinho', reserva: 'Ajudo quando falta', treino: 'Estou aprendendo',
};
export const NIVEL_EU_EXPLICA: Record<Nivel, string> = {
  titular: 'seguro a função sem ninguém do lado',
  reserva: 'faço com alguém do lado',
  treino: 'nunca fiz, quero aprender',
};

/* "Pedro, domingo, 5 de outubro, 10h" — a vaga numa frase, com a hora certa
   do evento quando é evento (a regra de `horaDoDia`) */
export function quandoDaVaga(
  v: { data: string; evento?: string | null; inicio?: string | null },
  cultoHora: string, followHora?: string | null,
): string {
  const h = horaDoDia(v.inicio ?? null, v.evento ?? null, v.data, cultoHora, followHora);
  return `${diaLongo(v.data, v.evento ?? null)}${h ? `, ${h}` : ''}`;
}

/* ------------------------------------------------------- por que não dá
   Os códigos são os de `troca_impede` (supabase/103). Dois pontos de vista:
   o de quem recebeu o pedido (eu) e o de quem pediu, falando do colega. */
export function motivoParaMim(m: string | null | undefined, exigeSexo?: string | null): string {
  switch (m) {
    case 'INDISPONIVEL': return 'Você marcou que não pode nesse dia.';
    case 'JA_ESCALADO':  return 'Você já está na escala desse dia.';
    case 'NAO_FAZ':      return 'Essa função não está mais entre as suas.';
    case 'SEXO':         return exigeSexo === 'M' ? 'Esse posto é só para homens.'
                              : exigeSexo === 'F' ? 'Esse posto é só para mulheres.'
                              : 'Esse posto é só para homens ou só para mulheres.';
    case 'INATIVO':      return 'Seu lugar nessa área está pausado.';
    case 'OUTRA_AREA':
    case 'CULTO':        return 'Esse pedido não pode mais ser aceito.';
    case 'REGRA':        return 'A escala não deixou essa troca. Fale com a liderança.';
    default:             return m ? 'Esse pedido não pode ser aceito agora.' : '';
  }
}

export function motivoDoColega(m: string | null | undefined, nome: string | null | undefined): string {
  const p = primeiroNome(nome);
  switch (m) {
    case 'INDISPONIVEL': return `${p} avisou que não pode nesse dia.`;
    case 'JA_ESCALADO':  return `${p} já está na escala desse dia.`;
    case 'NAO_FAZ':      return `${p} não faz essa função.`;
    case 'SEXO':         return `${p} não pode nesse posto.`;
    case 'INATIVO':      return `${p} está com o lugar pausado.`;
    case 'OUTRA_AREA':   return `${p} é de outra área.`;
    default:             return m ? `${p} não pode ficar com essa vaga.` : '';
  }
}

/* --------------------------------------------- o que a resposta do banco diz */
type Volta = { ok?: boolean; erro?: string; motivo?: string; status?: string } | null | undefined;

export function erroAoPedir(r: Volta, nome: string | null | undefined, responsavel?: string | null): string {
  if (!r || r.ok) return '';
  const lider = (responsavel || '').trim() || 'a liderança';
  switch (r.erro) {
    case 'NAO_E_SUA':         return 'Essa vaga não está mais com você. Recarregue a página.';
    case 'TRAVADO':           return `A liderança travou essa vaga. Para trocar, fale com ${lider}.`;
    case 'JA_PASSOU':         return 'Esse dia já passou.';
    case 'CULTO_INEXISTENTE': return 'Esse culto não existe mais. Recarregue a página.';
    case 'MUITOS_PEDIDOS':    return 'Você já fez muitos pedidos. Espere uma resposta ou desista de algum antes.';
    case 'NAO_PODE':          return motivoDoColega(r.motivo, nome);
    default:                  return 'Não consegui pedir agora. Tente de novo.';
  }
}

export function erroAoResponder(r: Volta, exigeSexo?: string | null): string {
  if (!r || r.ok) return '';
  switch (r.erro) {
    case 'NAO_E_SEU':       return 'Esse pedido não é para você.';
    case 'NAO_ESTA_ABERTA': return 'Esse pedido já foi respondido ou a pessoa desistiu.';
    case 'JA_PASSOU':       return 'Esse dia já passou.';
    case 'MUDOU':           return 'A vaga mudou de mão antes do seu aceite. Nada mudou na sua escala.';
    case 'TRAVADO':         return 'A liderança travou essa vaga. Ela não pode ser trocada.';
    case 'NAO_PODE':        return motivoParaMim(r.motivo, exigeSexo);
    default:                return 'Não consegui responder agora. Tente de novo.';
  }
}

export function erroAoAcrescentar(r: Volta): string {
  if (!r || r.ok) return '';
  switch (r.erro) {
    case 'JA_TEM':             return 'Essa função já está com você.';
    case 'FUNCAO_INVALIDA':    return 'Essa função não é da sua área.';
    case 'NIVEL_INVALIDO':     return 'Escolha o quanto você já faz.';
    case 'SEXO':               return 'Essa função é de um posto só para homens ou só para mulheres.';
    case 'SEXO_NAO_INFORMADO': return 'Essa função pede que você diga se é homem ou mulher. Responda em "Falta uma coisa", no alto da página.';
    case 'MUITAS_A_CONFERIR':  return 'Você já tem muitas funções esperando a liderança conferir. Espere a conferência.';
    default:                   return 'Não consegui acrescentar agora. Tente de novo.';
  }
}

export function erroAoRetirar(r: Volta): string {
  if (!r || r.ok) return '';
  switch (r.erro) {
    case 'CONFERIDA': return 'Essa função já foi conferida. Para tirar, fale com a liderança.';
    case 'ULTIMA':    return 'Essa é a sua única função. Acrescente a certa antes de tirar esta.';
    case 'NAO_TEM':   return 'Essa função já não está com você.';
    default:          return 'Não consegui tirar agora. Tente de novo.';
  }
}

/* ------------------------------------------------- o que a seção mostra
   Pedido recebido e aberto: pede resposta. Pedido feito e aberto: espera.
   Pedido feito e respondido nos últimos três dias: a notícia, uma vez.
   Cancelado e vencido não são notícia para ninguém: somem. */
export function separarTrocas(trocas: Troca[]) {
  const porData = (a: Troca, b: Troca) => a.data.localeCompare(b.data) || a.criado_em.localeCompare(b.criado_em);
  const recebidas = trocas.filter(t => t.papel === 'me_pediram' && t.status === 'aberta').sort(porData);
  const minhasAbertas = trocas.filter(t => t.papel === 'pedi' && t.status === 'aberta').sort(porData);
  const respostas = trocas
    .filter(t => t.papel === 'pedi' && (t.status === 'aceita' || t.status === 'recusada'))
    .sort(porData);
  return { recebidas, minhasAbertas, respostas };
}

/* --------------------------------------------- a agenda dentro da grade
   A grade "Quando você pode" é dos sábados e domingos (eu_proximos_domingos).
   Os eventos do ministério entram nela, no dia deles, com o nome e a hora.
   A resposta continua sendo por DIA (`eu_disponibilidade`), como sempre. */
export function diasDaGrade(domingos: string[], eventos: Pick<Evento, 'data'>[]): string[] {
  return [...new Set([...domingos, ...eventos.map(e => e.data)])].sort();
}

const SEMANA_CURTA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
/* o rótulo de um dia da grade, já dentro do grupo do mês: "qua 08 · Ensaio
   Geral, 19h30". Sábado e domingo sem evento seguem o rótulo de sempre. */
export function rotuloDoDia(d: string, eventosDoDia: Pick<Evento, 'evento' | 'inicio'>[], rotuloComum: string): string {
  if (!eventosDoDia.length) return rotuloComum;
  const dt = new Date(d + 'T12:00:00Z');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  const nomes = eventosDoDia.map(e => {
    const h = horaDoDia(e.inicio, e.evento, d, '', null);
    return `${e.evento}${h ? `, ${h}` : ''}`;
  }).join(' · ');
  const fds = dt.getUTCDay() === 0 || dt.getUTCDay() === 6;
  return fds ? `${rotuloComum} · ${nomes}` : `${SEMANA_CURTA[dt.getUTCDay()]} ${dd} · ${nomes}`;
}

/* ------------------------------------------------ o recado do WhatsApp
   Sem telefone: `wa.me/?text=` abre o WhatsApp para a pessoa escolher o
   contato. O link do recado é a porta do ministério (/confirmar/<slug>), que
   abre a página do colega no aparelho dele, onde o pedido está esperando. */
export function recadoDaTroca(nomeColega: string | null | undefined, vaga: Vaga, quando: string, linkPorta: string): string {
  const p = primeiroNome(nomeColega);
  return `Oi, ${p}! Pedi pelo GUIA Servir para você ficar no meu lugar em ${vaga.funcao}, ${quando}. `
       + `Se puder, é só aceitar na sua página: ${linkPorta}`;
}
export const linkDoWhatsSemNumero = (texto: string) => `https://wa.me/?text=${encodeURIComponent(texto)}`;

/* mês curto para a etiqueta do PDF e de onde mais precisar */
export const mesCurto = (s: string) => MESES[+s.slice(5, 7) - 1].slice(0, 3);
