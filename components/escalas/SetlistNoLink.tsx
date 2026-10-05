'use client';
import { type ItemOrdem, nomeDoPdf, siteDaCifra, tempoDoItem, urlDaLetra } from '@/lib/ordem-do-culto';
import { lerCredenciais } from '@/lib/supabase';

/* =============================================================================
   O SETLIST LOGO ABAIXO DOS LINKS DO REPERTÓRIO — 02/10/2026.

   Sugestão do ministério de Louvor: "colocar logo abaixo dos links do
   setlist" a lista com o tom e o BPM de cada música, e as observações ("Na
   música 3 vamos fazer um medley começando da ponte..."). "O mais importante
   são as informações apresentadas e não o modo como aparecem."

   Os dados são os da ordem do culto (105), que a liderança preenche em
   Escala > dia > Ordem do culto: aqui entram só as músicas, numeradas na
   ordem do culto, e a nota de cada música vira uma observação com o número
   dela. A cifra abre fora, como na ordem do culto.

   111 · 05/10/2026: o compasso ao lado do BPM, o tempo em minuto e segundo,
   e o botão "Letra", que BAIXA o PDF (o Storage manda como download, com o
   nome da música). A letra é um arquivo do armário da igreja, não um site
   de fora: não precisa de aviso de "abre fora".

   Quando a ordem do próprio ministério é só música, ela aparece inteira
   aqui e a seção "Ordem do culto" não a repete (ver a página do voluntário).
   ============================================================================= */

/** só as músicas da ordem, na ordem do culto */
export const musicasDaOrdem = (ordem: ItemOrdem[]) => ordem.filter(i => i?.t === 'musica' && !!i.titulo);

/** o botão de baixar a letra (111), ou nada */
export function BotaoDaLetra({ it }: { it: ItemOrdem }) {
  const href = it.letra ? urlDaLetra(lerCredenciais()?.url || '', it.letra, it.titulo) : '';
  if (!href) return null;
  return (
    <a className="vol-oi-cifra vol-oi-letra" href={href} download={nomeDoPdf(it.titulo)}
      aria-label={`Baixar a letra de ${it.titulo} (PDF)`}>
      Letra
    </a>
  );
}

export default function SetlistNoLink({ ordem }: { ordem: ItemOrdem[] }) {
  const mus = musicasDaOrdem(ordem);
  if (!mus.length) return null;
  const obs = mus.map((m, i) => ({ n: i + 1, m })).filter(x => !!x.m.nota);
  return (
    <div className="vol-setlist">
      <div className="vol-setlist-tit">Setlist</div>
      <ol className="vol-ordem-lista">
        {mus.map((m, i) => (
          <li className="vol-oi vol-sl" key={i}>
            <span className="vol-oi-hora">{i + 1}</span>
            <span className="vol-oi-corpo">
              <span className="vol-oi-tit">{m.titulo}</span>
              {(m.tom || m.bpm || m.compasso || tempoDoItem(m) || m.artista || m.quem) && (
                <span className="vol-oi-meta">
                  {m.tom && <>Tom <b>{m.tom}</b></>}
                  {[m.bpm ? `${m.bpm} BPM` : '', m.compasso || '', tempoDoItem(m), m.artista || '', m.quem || '']
                    .filter(Boolean)
                    .map((p, k) => <span key={k}>{m.tom || k > 0 ? ' · ' : ''}{p}</span>)}
                </span>
              )}
            </span>
            {(m.cifra || m.letra) && (
              <span className="vol-oi-acoes">
                {m.cifra && (
                  <a className="vol-oi-cifra" href={m.cifra} target="_blank" rel="noopener noreferrer"
                    aria-label={`Cifra de ${m.titulo}, no ${siteDaCifra(m.cifra)}`}>
                    Cifra
                  </a>
                )}
                <BotaoDaLetra it={m} />
              </span>
            )}
          </li>
        ))}
      </ol>
      {!!obs.length && (
        <div className="vol-setlist-obs">
          <div className="vol-setlist-tit">Observações</div>
          {obs.map(x => (
            <p key={x.n}><b>{x.n}. {x.m.titulo}:</b> {x.m.nota}</p>
          ))}
        </div>
      )}
    </div>
  );
}
