import { Chevron } from './Marca';
import { IGREJA } from '@/lib/igreja';

/* =============================================================================
   LETREIRO — a faixa que corre

   Uma linha de rótulos em caixa alta que desliza devagar, de ponta a ponta,
   entre duas seções. É o elemento mais "site de produto" desta página, e
   entra sem trazer vocabulário de fora porque é feito só do que a identidade
   já tem: o rótulo pequeno com tracking largo e o chevron como separador.

   Função, não enfeite: ele repete as três respostas de quem nunca veio —
   quando, onde, quanto tempo — num formato que o olho lê sem parar de rolar.

   O texto é duplicado (a segunda cópia com aria-hidden) para o laço fechar
   sem emenda. Em prefers-reduced-motion a animação não existe e a primeira
   cópia fica parada — continua legível, só não anda. Passar o ponteiro por
   cima pausa: quem quer ler, lê.
   ============================================================================= */

const ITENS = [
  `${IGREJA.cultoDia}, ${IGREJA.cultoHora}`,
  IGREJA.rua,
  IGREJA.bairro,
  IGREJA.nome,
  IGREJA.frase,
];

function Faixa({ escondida = false }: { escondida?: boolean }) {
  return (
    <span className="letreiro-faixa" aria-hidden={escondida || undefined}>
      {ITENS.map((t, i) => (
        <span key={i} className="letreiro-item">
          {t}
          <span className="letreiro-chev" aria-hidden="true"><Chevron /></span>
        </span>
      ))}
    </span>
  );
}

export function Letreiro({ escuro = false }: { escuro?: boolean }) {
  return (
    <div className={'letreiro' + (escuro ? ' escuro' : '')} role="marquee" aria-label="Domingo, 10h, Barra da Tijuca">
      <div className="letreiro-trilho">
        <Faixa />
        <Faixa escondida />
      </div>
    </div>
  );
}
