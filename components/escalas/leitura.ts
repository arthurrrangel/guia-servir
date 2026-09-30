/* =============================================================================
   A LEITURA DE UM CULTO EM DUAS PALAVRAS · 30/09/2026

   O mesmo culto era dito de quatro jeitos: "4 sem responder" no Painel,
   "3 a confirmar" na Escala, "Sem resposta" na faixa de números e "coberto"
   na visão da igreja, com "tudo confirmado" na linha do dia. Quem lê o Painel
   e depois a Escala não deveria ter que traduzir. Uma função, uma frase por
   estado, e o tom da mesma régua do motor (`classificar`, lib/engine.ts):

     sem ninguém · furou · não pode   falta gente     bad
     sem resposta                     espera          warn
     tudo confirmado                  de pé           ok

   A situação de UMA pessoa continua com as palavras do seletor (`SITUACOES`:
   "falta confirmar", "confirmou"...): lá é a resposta dela, aqui é a soma.
============================================================================= */
import { classificar } from '@/lib/engine';
import { pl } from '@/lib/plural';
import { Tom, tomDaSituacao } from './Pecas';

export function leituraDoDia(n: { vagas: number; furos: number; recusados: number; pendentes: number }): { tom: Tom; txt: string } {
  const tom = tomDaSituacao(classificar(n));
  if (n.vagas > 0) return { tom, txt: `${n.vagas} sem ninguém` };
  if (n.furos > 0) return { tom, txt: `${n.furos} ${pl(n.furos, 'furou', 'furaram')}` };
  if (n.recusados > 0) return { tom, txt: `${n.recusados} ${pl(n.recusados, 'não pode', 'não podem')}` };
  if (n.pendentes > 0) return { tom, txt: `${n.pendentes} sem resposta` };
  return { tom, txt: 'tudo confirmado' };
}
