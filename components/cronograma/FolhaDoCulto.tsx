'use client';
/* =============================================================================
   A FOLHA DO CULTO — 109, 03/10/2026

   O Roteiro Mestre numa página só, no formato que o Arthur aprovou em 03/10:
   cabeçalho com o estado, A Palavra e No comando lado a lado, os horários
   no meio, Louvor e Avisos embaixo. O que falta aparece NO LUGAR, com o dono
   e o prazo ("falta · Louvor · até qui, 10/09"), e não numa lista à parte:
   quem olha a folha vê o buraco onde ele está.

   A MESMA FOLHA EM TRÊS LUGARES: a página pública (/cronograma/<token>, o
   link do grupo), o PDF (a impressão do navegador, em A4) e a página do
   dirigente. Quem decide o conteúdo é lib/cronograma.ts; aqui é só desenho.
   A folha de estilo é `folha.css`, com prefixo `fo-` (a folha vive fora da
   casca do líder, e as classes `es-` não valem aqui).
   ============================================================================= */
import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { Logo } from '@/components/Marca';
import {
  type Folha, type Pendencia, dirigenteDa, donoDoDirigente, donoDoLouvor, estadoDaFolha, horarioDaFolha,
  linhaDaMusicaNaFolha, pendenciasDaFolha, quemNoComando, rotuloDoPapel, rotuloDoPrazo, tituloDaFolha,
  direcaoDa,
} from '@/lib/cronograma';
import './folha.css';

type Props = {
  folha: Folha; hoje: string; cultoHora: string; followHora?: string | null;
  /** o carimbo do rodapé ("Atualizado em ...") */
  atualizado?: string;
};

function Falta({ dono, data, curto }: { dono: string; data: string; curto?: boolean }) {
  return (
    <span className="fo-falta">
      falta<span className="fo-falta-dono"> · {dono}{curto ? '' : ` · até ${rotuloDoPrazo(data)}`}</span>
    </span>
  );
}

function Check() {
  return (
    <svg className="fo-check" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
      <path d="M4.5 12.5 10 18 19.5 6.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function FolhaDoCulto({ folha: f, hoje, cultoHora, followHora, atualizado }: Props) {
  const est = estadoDaFolha(f, hoje);
  const pend = pendenciasDaFolha(f);
  const falta = (chave: string) => pend.find((p: Pendencia) => p.chave === chave) || null;
  const p = f.palavra || {};
  const hora = horarioDaFolha(f, cultoHora, followHora);
  const donoDir = donoDoDirigente(f);
  const passou = f.data < hoje;
  const dir = dirigenteDa(f);
  const direcao = direcaoDa(f);
  const titulo = tituloDaFolha(f.data);
  /* a folha pode estar duas vezes na página (a da tela e a do papel): os ids
     dos títulos não podem repetir */
  const uid = useId();
  const id = (k: string) => `${uid}-${k}`;

  return (
    <article className="fo" aria-label={`Cronograma do culto: ${titulo}`}>
      <header className="fo-topo">
        <Logo className="fo-logo" />
        <div className="fo-topo-dir">
          <div className="fo-rot">Cronograma do culto</div>
          <div className={`fo-estado fo-${est.tom}`}>{est.texto}</div>
        </div>
      </header>

      <h1 className="fo-titulo">{titulo}</h1>
      <p className="fo-sub">
        {[
          hora && <b key="h">{hora}</b>,
          f.palavra && <span key="c">{p.ceia ? 'Com Santa Ceia' : 'Sem Santa Ceia'}</span>,
          p.quem && <span key="q">Palavra: <b>{p.quem}</b></span>,
        ].filter(Boolean).reduce<React.ReactNode[]>((acc, x, i) => (i ? [...acc, <span key={`s${i}`} aria-hidden="true"> · </span>, x] : [x]), [])}
      </p>

      <div className="fo-duas">
        <section className="fo-bloco" aria-labelledby={id('palavra')}>
          <h2 id={id('palavra')}>A Palavra <span>{donoDir}</span></h2>
          <div className="fo-campo">
            <div className="fo-k">Tema</div>
            <div className="fo-v fo-tema">{p.tema || <Falta dono={donoDir} data={f.data} curto={passou} />}</div>
          </div>
          <div className="fo-campo">
            <div className="fo-k">Leitura</div>
            <div className="fo-v">{p.leitura || <Falta dono={donoDir} data={f.data} curto={passou} />}</div>
          </div>
          {!p.quem && (
            <div className="fo-campo">
              <div className="fo-k">Quem prega</div>
              <div className="fo-v"><Falta dono={donoDir} data={f.data} curto={passou} /></div>
            </div>
          )}
          {p.frase && (
            <div className="fo-campo">
              <div className="fo-k">Frase na tela</div>
              <div className="fo-v fo-frase">“{p.frase}”</div>
            </div>
          )}
        </section>

        <section className="fo-bloco" aria-labelledby={id('comando')}>
          <h2 id={id('comando')}>No comando <span>da escala</span></h2>
          {f.comando.length ? (
            <ul className="fo-lista">
              {f.comando.map(c => {
                const quem = quemNoComando(c);
                return (
                  <li key={c.funcaoId}>
                    <span className="fo-p">{rotuloDoPapel(c)}</span>
                    {quem
                      ? <span className="fo-n">{quem}{c.status === 'confirmado' && <><Check /><span className="fo-so-leitor"> (confirmou)</span></>}</span>
                      : <span className="fo-falta">ninguém<span className="fo-falta-dono"> · {c.equipe}</span></span>}
                  </li>
                );
              })}
            </ul>
          ) : <p className="fo-nada">Nenhum posto marcado para aparecer aqui.</p>}
        </section>
      </div>

      <section className="fo-bloco fo-crono" aria-labelledby={id('horarios')}>
        <h2 id={id('horarios')}>Cronograma <span>{direcao?.equipe || 'Produção'}</span></h2>
        {f.linha.length ? (
          <table className="fo-tab">
            <tbody>
              {f.linha.map((l, i) => (
                <tr key={`${l.h}-${i}`}>
                  <th scope="row" className="fo-h">{l.h.replace(':', 'h')}</th>
                  <td className="fo-o">{l.o}</td>
                  <td className="fo-q">{l.q || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="fo-v"><Falta dono={direcao?.equipe || 'Produção'} data={f.data} curto={passou} /></p>}
      </section>

      <div className="fo-duas">
        <section className="fo-bloco" aria-labelledby={id('louvor')}>
          <h2 id={id('louvor')}>Louvor <span>{donoDoLouvor(f)}</span></h2>
          {f.musicas.length ? (
            <ol className="fo-musicas">
              {f.musicas.map((m, i) => <li key={`${m.titulo}-${i}`}>{linhaDaMusicaNaFolha(m)}</li>)}
            </ol>
          ) : f.repertorio.length ? (
            <div className="fo-campo">
              <div className="fo-k">Músicas e tons</div>
              <div className="fo-v"><Falta dono={donoDoLouvor(f)} data={f.data} curto={passou} /></div>
            </div>
          ) : null}
          <div className="fo-campo">
            <div className="fo-k">Música final</div>
            <div className="fo-v">{f.louvor?.final || <Falta dono={donoDoLouvor(f)} data={f.data} curto={passou} />}</div>
          </div>
        </section>

        <section className="fo-bloco" aria-labelledby={id('avisos')}>
          <h2 id={id('avisos')}>Avisos <span>{dir ? 'Dirigente' : donoDir}</span></h2>
          {f.avisos === null ? (
            <p className="fo-v"><Falta dono={donoDir} data={f.data} curto={passou} /></p>
          ) : f.avisos.length === 0 ? (
            <p className="fo-nada">Sem avisos neste culto.</p>
          ) : (
            <ol className="fo-avisos">
              {f.avisos.map((a, i) => (
                <li key={`${a.texto}-${i}`}>
                  <span>{a.texto}</span>
                  {a.como && <span className="fo-como">{a.como === 'video' ? 'vídeo' : 'falado'}</span>}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <footer className="fo-pe">
        <span>GUIA Church · guiaservir.com</span>
        {atualizado && <span>{atualizado}</span>}
      </footer>
    </article>
  );
}

/** A mesma folha, só para o papel: mora no fim do <body> e é a única coisa
 *  que a impressão mostra (a regra de impressão de globals.css esconde o
 *  resto). "Salvar PDF" é `window.print()`. */
export function FolhaParaImprimir(props: Props) {
  const [montado, setMontado] = useState(false);
  useEffect(() => { setMontado(true); }, []);
  if (!montado) return null;
  return createPortal(
    <div className="impresso impresso-folha" aria-hidden="true"><FolhaDoCulto {...props} /></div>,
    document.body,
  );
}
