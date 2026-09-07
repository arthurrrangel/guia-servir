import type { ReactNode } from 'react';

/* =============================================================================
   A FAIXA — o cabeçalho de toda tela do líder, num lugar só

   07/09/2026. Sete telas montavam a própria faixa à mão, e a prancha de contato
   mostrou o preço: sete alturas diferentes (226 a 465px no celular), o placar
   ora à direita ora embaixo de tudo, de zero a três ações, e em três telas o
   `h1` era o NOME DO MINISTÉRIO — a mesma palavra que a navegação já mostra
   30px acima. O maior texto da tela repetindo o menor.

   E o `rot` (a legenda em caixa alta acima do título) dizia "Time", "Escala",
   "Ajustes": o nome da aba, que a aba já diz. Três vezes a mesma palavra na
   mesma dobra: navegação, legenda, e no celular a barra de baixo.

   A REGRA, AGORA ESCRITA EM COMPONENTE E NÃO EM INTENÇÃO:
     h1      diz a SITUAÇÃO quando existe uma ("Alguém não pode no Follow",
             "17 pessoas no time"); diz o assunto quando não existe
             ("Ajustes"). Nunca o ministério. Nunca o nome da aba com legenda.
     sub     uma linha, e só quando acrescenta um fato que o h1 e o placar não
             dizem. Frase que repete o número do placar em palavras não entra.
     placar  o único número da tela. Mesmo lugar em todas: colado no título no
             celular, coluna da direita no desktop.
     ações   no máximo uma sólida e uma de texto, lado a lado. Três ações
             empilhadas no celular eram 171px de botão para dois links.

   O componente não decide o conteúdo, decide a FORMA. É o que faz sete telas
   parecerem o mesmo produto sem que alguém tenha que lembrar de sete regras.
============================================================================= */

type Placar = { n: ReactNode; rot: string };

type Props = {
  /** a situação, ou o assunto. Aceita nó para o caso do mês com setas. */
  titulo: ReactNode;
  sub?: ReactNode;
  placar?: Placar | null;
  /** a ação sólida */
  acao?: ReactNode;
  /** a ação de texto, ao lado da sólida */
  extra?: ReactNode;
  /** algo que precisa ficar abaixo das ações (a ajuda recolhida da /escala) */
  rodape?: ReactNode;
  /** a faixa escura: só quando há algo que ameaça o culto */
  urgente?: boolean;
};

export function Faixa({ titulo, sub, placar, acao, extra, rodape, urgente }: Props) {
  return (
    <div className={`lid-faixa${urgente ? ' fogo' : ''}`}>
      <div className="lid-faixa-in">
        <div className="lid-faixa-txt faixa-cab">
          <h1>{titulo}</h1>
          {placar && (
            <div className="lid-placar">
              <b>{placar.n}</b>
              <span>{placar.rot}</span>
            </div>
          )}
          {sub && <p className="lid-faixa-sub">{sub}</p>}
          {(acao || extra) && (
            <div className="lid-faixa-acoes">
              {acao}
              {extra}
            </div>
          )}
          {rodape}
        </div>
      </div>
    </div>
  );
}
