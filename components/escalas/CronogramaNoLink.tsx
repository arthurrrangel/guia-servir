'use client';
/* =============================================================================
   O DIRIGENTE DA SEMANA, NO LINK DELE — 109, 03/10/2026

   O Arthur: quem preenche a Palavra é "o dirigente da semana". Quem está no
   posto de dirigente de um culto dos próximos 21 dias vê aqui o que falta do
   bloco dele (a Palavra e os avisos) e o prazo, e um botão leva ao
   formulário (/eu/<token>/culto/<data>). Tudo preenchido, o cartão fica
   pequeno: dá para conferir e mudar até o dia.

   Só aparece com a migração 109 no banco: a página só mostra isto depois que
   `eu_cronogramas` respondeu.
   ============================================================================= */
import Link from 'next/link';
import { type Folha, diaCurto, prazoDaFolha, rotuloDoPrazo } from '@/lib/cronograma';
import { diaLongo } from '@/lib/engine';

/** o que falta do bloco do dirigente, numa lista falada ("o tema e os avisos") */
export function faltaDoDirigente(f: Folha): string {
  const p = f.palavra || {};
  const itens = [!p.quem && 'quem prega', !p.tema && 'o tema', !p.leitura && 'a leitura',
                 f.avisos === null && 'os avisos'].filter(Boolean) as string[];
  return itens.length <= 1 ? itens.join('') : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

export default function CronogramaNoLink({ token, cultos, hoje }: { token: string; cultos: Folha[]; hoje: string }) {
  if (!cultos.length) return null;
  return (
    <section className="vol-secao" id="cronograma" aria-labelledby="cronograma-tit">
      <div className="vol-secao-cab">
        <span className="rot" id="cronograma-tit">Você dirige o culto</span>
      </div>
      {cultos.map(f => {
        const falta = faltaDoDirigente(f);
        const atrasado = !!falta && hoje > prazoDaFolha(f.data);
        return (
          <div className="vol-troca vol-cr" key={f.data}>
            <div className="vol-troca-fn">Dirigente</div>
            <div className="vol-troca-dia">{diaLongo(f.data)}</div>
            <p className={`vol-troca-quem${falta ? ' vol-cr-falta' : ''}`}>
              {falta
                ? <>Ainda falta: {falta}. {atrasado ? `O prazo era ${rotuloDoPrazo(f.data)}.` : `Preencha até ${rotuloDoPrazo(f.data)}.`}</>
                : 'A Palavra e os avisos estão preenchidos. Dá para mudar até o dia.'}
            </p>
            <div className="vol-btns vol-cr-btns">
              <Link className={`vol-bt${falta ? '' : ' nao'}`} href={`/eu/${token}/culto/${f.data}`}
                aria-label={`${falta ? 'Preencher' : 'Ver e mudar'} o culto de ${diaCurto(f.data)}`}>
                {falta ? 'Preencher a Palavra e os avisos' : 'Ver e mudar'}
              </Link>
            </div>
          </div>
        );
      })}
    </section>
  );
}
