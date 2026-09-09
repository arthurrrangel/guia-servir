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
