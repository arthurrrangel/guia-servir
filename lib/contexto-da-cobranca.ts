/* Contexto de UM ministério na cobrança de UMA data. A união de datas pode
   conter eventos de outras equipes; seus nomes não pertencem a este estado. */
import { cultosAte, fmtDia, tipoDoDia, type Estado } from './engine';

export function contextoDaCobranca(S: Pick<Estado, 'escalas'>, data: string) {
  const nomeEvento = S.escalas[data]?.evento;
  const rotulo = nomeEvento ? `${nomeEvento} · ${fmtDia(data)}`
    : tipoDoDia(data) === 'follow' ? `Follow sáb ${fmtDia(data)}` : `domingo ${fmtDia(data)}`;
  /* O calendário é o mesmo da união de datas da rota. A ausência de evento
     próprio em dia útil não transforma o evento alheio em culto regular. */
  const regular = cultosAte(data, 0).length > 0;
  return { nomeEvento, rotulo, regular };
}
