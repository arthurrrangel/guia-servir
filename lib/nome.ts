/* =============================================================================
   O NOME COMO ELE APARECE — 09/09/2026

   Um em cada cinco cadastros da Connect foi digitado com CAPS LOCK ligado:
   JOICE, SANDRA, SELMA, CLAUDIO, EMILIO, MURILO, ao lado de Alexandre, Allyne
   e Andréia. Ninguém errou nada — o formulário aceita o que a pessoa digita, e
   deve aceitar. Mas numa lista, uma linha que grita ao lado de outra que não
   grita lê-se como defeito, e o defeito ficou maior agora que a lista mostra o
   nome inteiro: "CLAUDIO FERREIRA DA SILVA" tem o dobro do peso visual de
   "Claudio Ferreira da Silva".

   A REGRA, de propósito curta: só mexe em nome que está INTEIRO em maiúsculas.
   Qualquer nome que já tenha uma minúscula volta exatamente como veio — é lá
   que moram os casos que nenhuma regra acerta (d'Ávila, McDonald, Jr., nomes
   de outras línguas), e nesses o certo é não tocar.

   Isto é APARÊNCIA, não dado: `voluntarios.nome` continua guardando o que a
   pessoa escreveu. Se ela quiser mudar, muda no cadastro.
   ============================================================================= */

/* preposições de nome brasileiro: descem no meio, sobem no começo
   ("Da Silva" no começo é sobrenome de gente que assina assim) */
const PARTICULAS = new Set(['da', 'de', 'do', 'das', 'dos', 'e', 'di', 'del', 'van', 'von', 'y']);

/** O nome pronto para a tela. Devolve intacto tudo que não esteja todo em caixa alta. */
export function emNome(n: string | null | undefined): string {
  const t = (n || '').trim();
  if (!t || t !== t.toLocaleUpperCase('pt-BR')) return t;
  return t
    .split(/\s+/)
    .map((p, i) => {
      const b = p.toLocaleLowerCase('pt-BR');
      if (i > 0 && PARTICULAS.has(b)) return b;
      return b.charAt(0).toLocaleUpperCase('pt-BR') + b.slice(1);
    })
    .join(' ');
}

/* =============================================================================
   A RÉGUA DO TELEFONE, EM UM LUGAR SÓ — 20/09/2026.

   A lei mora no banco: `supabase/06-auto-cadastro.sql:88` e as oito migrações
   que copiaram a mesma linha recusam com TELEFONE_INVALIDO fora de 10..13
   dígitos. Três lugares no app repetiam a régua à mão, e um deles discordava:

     lib/pedido-pequena-guia.ts:29      10..13   ✓
     app/time/page.tsx:118              10..13   ✓
     app/servir/[slug]/cadastro         >= 10    ✗ sem teto

   Quem digitava 14 ou mais no cadastro público via "Continuar" ligado,
   preenchia os três passos e só tomava TELEFONE_INVALIDO no envio final, com
   o formulário inteiro para trás. A única das quatro que mentia.

   Os limites: 10 é DDD + oito dígitos (fixo antigo); 13 é 55 + DDD + nove. */
export const TEL_MIN = 10;
export const TEL_MAX = 13;
export const telefoneOk = (digitos: string) =>
  digitos.length >= TEL_MIN && digitos.length <= TEL_MAX;
