/* Prepara as ações do relatório de quinta, sem banco nem envio.
   A entrada já foi filtrada por cobrarDoDia para UM dia de UMA equipe.
   Agrupar por vínculo preserva homônimos e reúne só os postos pendentes;
   os contadores e os avisos de vaga/recusa/furo continuam com o chamador. */
type Pendente = { funcao: string; vid: string };
type Pessoa = { id: string; nome: string; tel?: string; token?: string };
type Contexto = { onde: string; dia: string; site: string };

/* Mesmo formato que a rota já usava, inclusive o prefixo para telefone
   brasileiro e a ausência de link quando não há telefone. */
const linkZap = (tel?: string, texto?: string) => {
  const n = String(tel || '').replace(/\D/g, '');
  return n ? `https://wa.me/${n.length <= 11 ? '55' + n : n}${texto ? `?text=${encodeURIComponent(texto)}` : ''}` : null;
};

export function linhasDaCobranca(
  pendentes: readonly Pendente[], pessoas: readonly Pessoa[], contexto: Contexto,
): string {
  const porVinculo = new Map<string, { vid: string; funcoes: string[] }>();
  for (const { funcao, vid } of pendentes) {
    const pessoa = porVinculo.get(vid);
    if (pessoa) pessoa.funcoes.push(funcao);
    else porVinculo.set(vid, { vid, funcoes: [funcao] });
  }
  return [...porVinculo.values()].map(({ vid, funcoes }) => {
    const v = pessoas.find(x => x.id === vid);
    const fn = funcoes.join(' e ');
    const texto = `${(v?.nome || '').trim()}, você está na escala d${contexto.onde} (${contexto.dia}) em ${fn}. Confirma? ${contexto.site}/eu/${v?.token}`;
    const zap = linkZap(v?.tel, texto);
    return `• ${v?.nome ?? ''} — ${fn}\n  ${zap ? `1 toque: ${zap}` : `sem telefone: ${contexto.site}/eu/${v?.token}`}`;
  }).join('\n\n');
}
