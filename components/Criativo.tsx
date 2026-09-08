import { CRIATIVOS, razao, type IdCriativo } from '@/lib/criativos';
import { Chevron } from './Marca';

/* =============================================================================
   O CRIATIVO — a imagem quando existe, o painel da marca quando não

   Ver lib/criativos.ts. Componente de servidor: não tem estado, não tem
   efeito. `fundo` é o modo "atrás do texto" (cobre a seção, com véu);
   sem `fundo` ele é um bloco com a proporção do lugar.

   O painel da marca não é placeholder cinza: é a retícula do site com o
   chevron da GUIA em traço fino, na cor do lugar. Em produção ele tem que
   parecer decisão, porque é o que a pessoa vê até o criativo chegar. Em
   desenvolvimento, e só nele, aparece uma etiqueta com o nome do lugar e o
   tamanho esperado, para o Arthur saber o que produzir.
   ============================================================================= */

type Props = {
  id: IdCriativo;
  fundo?: boolean;
  className?: string;
  /** a primeira imagem da página carrega antes de tudo */
  prioridade?: boolean;
};

export function Criativo({ id, fundo, className = '', prioridade }: Props) {
  const c = CRIATIVOS[id];
  const dev = process.env.NODE_ENV === 'development';
  const classe = `cria ${fundo ? 'cria-fundo' : 'cria-bloco'} ${c.arquivo ? 'com' : 'vazio'} ${className}`.trim();

  if (c.arquivo) {
    return (
      <div className={classe} style={fundo ? undefined : { aspectRatio: razao(c.proporcao) }}>
        <img src={c.arquivo} alt={c.alt} style={{ objectPosition: c.foco || '50% 45%' }}
          loading={prioridade ? 'eager' : 'lazy'} fetchPriority={prioridade ? 'high' : undefined} decoding="async" />
      </div>
    );
  }

  return (
    <div className={classe} style={fundo ? undefined : { aspectRatio: razao(c.proporcao) }} aria-hidden="true">
      {/* o chevron oficial (components/Marca.tsx), em linha fina */}
      <Chevron className="cria-marca" traco />
      {dev && <span className="cria-rot">{id} · {c.proporcao} · {c.largura}px</span>}
    </div>
  );
}
