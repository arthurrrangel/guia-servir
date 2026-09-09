/* =============================================================================
   O PEDIDO "QUERO ENCONTRAR UMA PEQUENA GUIA" — os cinco campos e a validação

   Um lugar só, usado pelo formulário (components/FormPequenaGuia.tsx) e pela
   rota (app/api/pequena-guia/route.ts): o navegador valida para responder na
   hora, o servidor valida de novo porque não confia em navegador. As duas
   pontas leem as mesmas regras daqui.
   ============================================================================= */
export const DIAS_PEDIDO = ['Terça', 'Quarta', 'Quinta', 'Qualquer dia'] as const;
export type DiaPedido = typeof DIAS_PEDIDO[number];

export type Pedido = {
  nome: string; telefone: string; cep: string; idade: number; dia: DiaPedido;
};

export const soDigitos = (s: string) => s.replace(/\D+/g, '');

/* devolve o pedido limpo, ou a mensagem do primeiro campo errado */
export function validar(corpo: unknown): { pedido: Pedido } | { erro: string; campo: string } {
  const b = (corpo && typeof corpo === 'object' ? corpo : {}) as Record<string, unknown>;
  const str = (k: string) => (typeof b[k] === 'string' ? (b[k] as string).trim() : '');

  if (str('site')) return { erro: 'Pedido não aceito.', campo: 'site' }; /* a isca */

  const nome = str('nome').replace(/\s+/g, ' ');
  if (nome.length < 2 || nome.length > 80) return { erro: 'Escreva seu nome.', campo: 'nome' };

  const telefone = soDigitos(str('telefone'));
  if (telefone.length < 10 || telefone.length > 13) return { erro: 'Telefone com DDD, por exemplo (21) 99999-9999.', campo: 'telefone' };

  const cep = soDigitos(str('cep'));
  if (cep.length !== 8) return { erro: 'CEP com oito números, por exemplo 22793-000.', campo: 'cep' };

  const idade = Number(str('idade'));
  if (!Number.isInteger(idade) || idade < 5 || idade > 110) return { erro: 'Idade em anos, só o número.', campo: 'idade' };

  const dia = str('dia') as DiaPedido;
  if (!DIAS_PEDIDO.includes(dia)) return { erro: 'Escolha o melhor dia da semana.', campo: 'dia' };

  return { pedido: { nome, telefone, cep, idade, dia } };
}


/* a mensagem que abre a conversa (WhatsApp) ou que a pessoa copia */
export function mensagemDoPedido(p: Pedido): string {
  return [
    'Oi! Quero encontrar uma Pequena Guia perto de mim.',
    `Nome: ${p.nome}`,
    `Telefone: ${p.telefone}`,
    `CEP: ${p.cep.slice(0, 5)}-${p.cep.slice(5)}`,
    `Idade: ${p.idade}`,
    `Melhor dia: ${p.dia}`,
  ].join('\n');
}
