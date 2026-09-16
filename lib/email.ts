/* =============================================================================
   ERRO DE DIGITAÇÃO NO E-MAIL, PEGO ANTES DE GASTAR UM E-MAIL

   16/09/2026. Cada pedido de link de acesso é um e-mail que o Supabase manda,
   e o projeto tem cota de e-mails por hora. A Monik pediu o link para
   "hotmail.comm": um e-mail que não chega a ninguém e gasta a cota de todo
   mundo. Só sugere quando a troca é óbvia; nunca bloqueia um domínio que a
   gente não conhece (um e-mail corporativo estranho é válido).
   ============================================================================= */
export function sugerirEmail(bruto: string): string | null {
  const e = bruto.trim().toLowerCase();
  const arroba = e.lastIndexOf('@');
  if (arroba < 1 || arroba === e.length - 1) return null;
  const usuario = e.slice(0, arroba);
  const antes = e.slice(arroba + 1);
  const dominio = antes
    .replace(/\.(comm|con|cpm|ocm|cim)$/, '.com')
    .replace(/\.(comm|con|cpm|ocm|cim)\.br$/, '.com.br')
    .replace(/^(gmal|gamil|gmial|gnail|gmaill|gmai|gmil)\./, 'gmail.')
    .replace(/^(hotmal|hotmial|hotmaill|hotmai|homail|hotmil)\./, 'hotmail.')
    .replace(/^(outlok|outloo|outlokk|outllok)\./, 'outlook.')
    .replace(/^(yaho|yahho|yahooo)\./, 'yahoo.');
  return dominio === antes ? null : `${usuario}@${dominio}`;
}
