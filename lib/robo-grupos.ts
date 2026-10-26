/* O QUE O ROBÔ DO WHATSAPP POSTA · 26/10/2026.

   Arthur, 26/10: "tá tudo liberado, eu quero tudo automatizado". A escala da
   Mídia sai sozinha nos grupos, por um robô próprio que roda no MacBook dele,
   ligado ao número da igreja como aparelho conectado (robo-whatsapp/).

   O robô não monta texto nenhum. Ele pede a este módulo, pela rota
   /api/robo/grupos, exatamente o que o "Mandar nos grupos" da Escala mostra
   ao líder: a escala inteira para o grupo geral, a parte de cada grupo para
   cada grupo, e a mesma assinatura de "mudou depois do envio" (trocar alguém
   ou abrir uma vaga pede mensagem nova; alguém confirmar, não).

   A cobrança é a do botão "Cobrar confirmação", com uma diferença: no lugar
   do nome, o @ do telefone. É o que faz o WhatsApp avisar a pessoa marcada.
   Quem não tem telefone no cadastro continua pelo nome, sem menção.

   Tudo aqui é puro: recebe o Estado, devolve texto. A rota só autentica
   (lib/robo-segredo.ts) e carrega o Estado com a mesma consulta do navegador.

   CUIDADO AO MUDAR assinaturaDoEnvio (lib/engine.ts): o robô guarda a
   assinatura de cada envio. Mudar o jeito de calcular muda a assinatura dos
   dias já mandados, e o robô manda de novo todas as escalas dos próximos
   dias, em todos os grupos (até o limite de versões do robô). */

import {
  type Estado, assinaturaDoEnvio, funcoesDoDia, gruposDoDia, horaDoDia, msgConfirmar, msgEscala,
  convidadoNoPosto,
} from './engine';

export type LinhaDoRobo = { gid: string; nome: string; texto: string; ass: string; vazio: boolean };
export type Mencao = { nome: string; telefone: string };
export type CobrancaDoRobo = { texto: string; mencoes: Mencao[]; pendentes: number };

/* O telefone no formato do WhatsApp: só dígitos, com o 55 quando o cadastro
   guardou só DDD e número (a mesma regra do link de cobrança do painel). */
export function telefoneDoWhatsApp(tel: string | null | undefined): string | null {
  const d = String(tel || '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) return '55' + d;
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d;
  return null;
}

/* postos com alguém (ou um convidado): sem nenhum, o dia não tem escala para mandar */
export function preenchidosDoDia(S: Estado, d: string): number {
  const dia = S.escalas[d];
  return funcoesDoDia(S, d).filter(f => dia?.slots?.[f.nome]?.vid || convidadoNoPosto(S, d, f.nome)).length;
}

/* as mesmas linhas do "Mandar nos grupos" (components/escalas/MandarNosGrupos.tsx) */
export function linhasDoRobo(S: Estado, d: string, link: string): LinhaDoRobo[] {
  return [
    { gid: 'geral', nome: 'Grupo geral', texto: msgEscala(S, d, { link }), ass: assinaturaDoEnvio(S, d), vazio: false },
    ...gruposDoDia(S, d).map(x => ({
      gid: x.grupo.id, nome: x.grupo.nome,
      texto: x.funcoes.length ? msgEscala(S, d, { link, grupo: x.grupo }) : '',
      ass: assinaturaDoEnvio(S, d, x.grupo), vazio: !x.funcoes.length,
    })),
  ];
}

/* a cobrança do grupo, com @telefone no lugar do nome de quem tem telefone */
export function cobrancaDoRobo(S: Estado, d: string, link: string): CobrancaDoRobo {
  const mencoes = new Map<string, Mencao>();
  const pessoas = new Set<string>();
  const texto = msgConfirmar(S, d, link, (vid) => {
    pessoas.add(vid);
    const v = S.voluntarios.find(x => x.id === vid);
    const nome = v?.nome || '';
    const tel = telefoneDoWhatsApp(v?.tel);
    if (!tel) return nome;
    mencoes.set(tel, { nome, telefone: tel });
    return '@' + tel;
  });
  return { texto, mencoes: [...mencoes.values()], pendentes: pessoas.size };
}

/* A RESPOSTA INTEIRA DA ROTA, PURA. A rota /api/robo/grupos só autentica,
   carrega o Estado e devolve isto; o teste de ponta a ponta
   (scripts/robo-whatsapp-ponta.test.mjs) passa a mesma resposta ao robô
   (robo-whatsapp/rodada.mjs) e confere o que sairia em cada grupo. Um
   contrato só: a rota e o teste não podem divergir. */
export function respostaDoRobo(
  S: Estado, data: string, equipe: { slug: string; nome: string }, link: string,
  cultoHora: string, followHora: string | null,
) {
  const dia = S.escalas[data];
  const preenchidos = preenchidosDoDia(S, data);
  return {
    ok: true as const,
    equipe,
    data,
    culto: {
      existe: !!dia,
      evento: dia?.evento || null,
      hora: horaDoDia(dia?.inicio, dia?.evento, data, cultoHora, followHora),
      postos: funcoesDoDia(S, data).length,
      preenchidos,
    },
    linhas: preenchidos ? linhasDoRobo(S, data, link) : [],
    cobranca: preenchidos ? cobrancaDoRobo(S, data, link) : null,
  };
}
