/* =============================================================================
   A ESCALA DO MÊS EM PDF — 103 (Fase 1 do estudo do ServoApp), 01/10/2026

   O líder imprime ou salva em PDF a escala do mês, para pendurar no mural,
   mandar a quem não usa o link ou guardar. A categoria tem (Escala Church,
   HubEscala); aqui faltava.

   O PDF é o do próprio navegador ("Salvar como PDF" no Chrome, "Imprimir"
   e compartilhar no iPhone): nenhuma biblioteca a mais, nenhum arquivo
   gerado no servidor, e a escala impressa é exatamente a que o líder está
   vendo. Este arquivo monta O QUE sai no papel; quem desenha é
   components/escalas/ImprimirMes.tsx. `scripts/imprimir.test.mjs` cobre.

   O QUE SAI, POR DIA: o título do dia (com o nome do evento e a hora), cada
   posto do dia com quem está nele, o plantão e o recado. Quem avisou que não
   pode NÃO aparece como escalado: no papel, a vaga dele está aberta, porque
   é isso que ela está.
   ============================================================================= */
import { type Estado, diasDoMes, funcoesDoDia, nomeDe, diaLongo, horaDoDia, MESES } from './engine';

export type PostoImpresso = { funcao: string; quem: string; aberta: boolean; nota: string };
export type DiaImpresso = {
  data: string; titulo: string; postos: PostoImpresso[]; plantao: string[]; obs: string;
};

export function escalaDoMesParaImprimir(
  S: Estado, ano: number, mes: number, cultoHora: string, followHora?: string | null,
): { titulo: string; dias: DiaImpresso[]; montados: number } {
  const dias: DiaImpresso[] = [];
  let montados = 0;
  for (const data of diasDoMes(S, ano, mes)) {
    const dia = S.escalas[data];
    const h = horaDoDia(dia?.inicio ?? null, dia?.evento ?? null, data, cultoHora, followHora);
    const titulo = `${diaLongo(data, dia?.evento ?? null)}${h ? `, ${h}` : ''}`;
    const postos = funcoesDoDia(S, data).map(f => {
      const sl = dia?.slots?.[f.nome];
      const nome = sl?.vid ? nomeDe(S, sl.vid) : '';
      if (!sl?.vid || !nome) return { funcao: f.nome, quem: 'falta alguém', aberta: true, nota: '' };
      if (sl.status === 'recusado') return { funcao: f.nome, quem: 'falta alguém', aberta: true, nota: `${nome} não pode` };
      return { funcao: f.nome, quem: nome, aberta: false, nota: sl.status === 'furou' ? 'faltou' : '' };
    });
    if (postos.some(p => !p.aberta || p.nota)) montados++;
    dias.push({
      data, titulo, postos,
      plantao: (dia?.plantao || []).map(v => nomeDe(S, v)).filter(Boolean),
      obs: (dia?.obs || '').trim(),
    });
  }
  return { titulo: `Escala de ${MESES[mes - 1]} de ${ano}`, dias, montados };
}
