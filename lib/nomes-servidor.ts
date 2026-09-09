/* =============================================================================
   O NOME INTEIRO DE QUEM SERVE — 09/09/2026

   POR QUE ESTE ARQUIVO EXISTE. A lista de /equipe/<área> monta-se com a RPC
   `equipe_time`, e essa função devolve `split_part(nome, ' ', 1)`: só o
   primeiro nome. O sobrenome nunca chega ao navegador — não é a tela que
   corta, é o banco que não manda. A migração 42 conserta isso na origem, mas
   ela depende de alguém abrir o SQL Editor, e ficou dois dias sem rodar
   enquanto a Joice esperava resposta sobre os dois CLAUDIO da Connect.

   Então o nome inteiro passa a vir por aqui: o servidor da própria página
   lê `voluntarios.nome` e entrega à tela um mapa `id → nome`. Sobe junto com
   o deploy, não depende de ninguém abrir painel nenhum.

   O QUE ISTO EXPÕE, DITO EM VOZ ALTA. Exatamente o que a migração 42 exporia:
   o nome completo de quem serve numa área, para quem abre /equipe/<área>.
   Não é um dado novo tornado público — é a decisão do Arthur (09/09) de que a
   lista mostra o nome inteiro de todo mundo, implementada pelo caminho que não
   depende de migração. `/equipe/` está em Disallow no robots.txt: a página
   circula por link dentro da equipe, não é indexada.

   POR QUE `SUPABASE_SERVICE_ROLE` E NÃO A CHAVE ANÔNIMA. Porque a tabela
   `voluntarios` não é legível por `anon` — testado em 09/09, devolve
   `permission denied for table voluntarios`, e é assim que tem que ser. A
   chave de serviço já existe no projeto (é a mesma que o cron usa) e nunca sai
   do servidor: este módulo não é importado por nenhum componente 'use client'.

   O RAIO DE ALCANCE, PROPOSITALMENTE CURTO. Uma consulta, duas colunas,
   filtro por igualdade (nada é concatenado em SQL), slug validado por regex
   antes de virar parâmetro. Se a chave faltar, se a rede cair, se o slug for
   estranho — devolve `{}`, e a tela mostra o primeiro nome, que é o
   comportamento de hoje. Falhar aqui não quebra a página.

   QUANDO A MIGRAÇÃO 42 RODAR, este arquivo vira redundante: `equipe_time`
   passa a mandar `nome_completo` e a tela prefere esse campo. Aí é só apagar
   `lib/nomes-servidor.ts`, voltar `page.tsx` a 'use client' e seguir.
   ============================================================================= */

const SUPA_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qjtcaijhgldypudzyafz.supabase.co';

/* slugs são chave de URL: letras minúsculas, dígitos e hífen. Qualquer outra
   coisa não é slug nosso e não vira consulta. */
const SLUG_OK = /^[a-z0-9-]{1,40}$/;

/** `id do voluntário → nome inteiro`, para a área do slug. `{}` em qualquer falha. */
export async function nomesDaEquipe(slug: string): Promise<Record<string, string>> {
  const chave = process.env.SUPABASE_SERVICE_ROLE;
  if (!chave || !SLUG_OK.test(slug)) return {};

  const cab = { apikey: chave, Authorization: `Bearer ${chave}` };
  const opc = { headers: cab, next: { revalidate: 60 } } as const;

  try {
    const re = await fetch(`${SUPA_URL}/rest/v1/equipes?slug=eq.${slug}&select=id`, opc);
    if (!re.ok) return {};
    const equipe = (await re.json())?.[0];
    if (!equipe?.id) return {};

    const rv = await fetch(
      `${SUPA_URL}/rest/v1/voluntarios?equipe_id=eq.${equipe.id}&ativo=is.true&select=id,nome`,
      opc,
    );
    if (!rv.ok) return {};

    const mapa: Record<string, string> = {};
    for (const l of (await rv.json()) as { id: string; nome: string }[]) {
      const n = (l?.nome || '').trim();
      if (l?.id && n) mapa[l.id] = n;
    }
    return mapa;
  } catch {
    return {};
  }
}
