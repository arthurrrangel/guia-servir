/* =============================================================================
   OS DIAS QUE O HARNESS MONTA, CONTADOS A PARTIR DE HOJE — 05/10/2026.

   O demo (lib/demo.ts) monta os cultos (sábados e domingos) DESTE mês e do
   PRÓXIMO, põe o repertório no primeiro culto que vem e a ordem do culto no
   segundo. Prova de tela com a data escrita na mão vence sozinha:
   `grupos-tela` e `repertorio-tela` apontavam para 03 e 04/10/2026 e
   reprovaram na virada para a segunda, 05/10, sem nada no app ter quebrado.
   E as que contavam "o segundo culto que vem" parando no fim do mês iam
   reprovar no último fim de semana de cada mês, quando ele já é do mês
   seguinte (que o demo monta desde 30/09).

   Aqui fica a conta uma vez só, do jeito que o demo monta.
   ============================================================================= */
export const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
export const somarDias = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
export const diaDaSemana = iso => new Date(iso + 'T12:00:00Z').getUTCDay();
export const mesDe = iso => iso.slice(0, 7);

const [ano, mes] = [+hoje.slice(0, 4), +hoje.slice(5, 7)];
const mesSeguinte = mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, '0')}`;

/** os cultos montados que ainda não passaram (hoje conta), em ordem */
export const cultosQueVem = (() => {
  const out = [];
  for (let k = 0; k < 70; k++) {
    const d = somarDias(hoje, k);
    if (mesDe(d) > mesSeguinte) break;
    if (diaDaSemana(d) === 0 || diaDaSemana(d) === 6) out.push(d);
  }
  return out;
})();

/** o primeiro fim de semana que vem inteiro e dentro de um mês só (a tela
    abre um mês por vez): o sábado e o domingo seguinte */
export const fimDeSemana = (() => {
  for (const sab of cultosQueVem.filter(d => diaDaSemana(d) === 6)) {
    const dom = somarDias(sab, 1);
    if (mesDe(dom) === mesDe(sab) && cultosQueVem.includes(dom)) return { sab, dom };
  }
  return { sab: '', dom: '' };
})();
