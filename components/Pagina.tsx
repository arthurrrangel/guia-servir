import type { ReactNode } from 'react';
import { Tit } from './Texto';
import { Chevron } from './Marca';
import { Criativo } from './Criativo';
import type { IdCriativo } from '@/lib/criativos';

/* =============================================================================
   O CABEÇALHO E O FECHO DAS PÁGINAS INTERNAS — site v3, 08/09/2026

   Antes cada página abria com uma foto de ponta a ponta e o texto centrado
   em cima dela (.g-cheio.alta.centro), e fechava com outra foto. Oito
   páginas, dezesseis fotos obrigatórias — e o Arthur pediu para esquecer as
   fotos e deixar espaço para criativos novos.

   Agora todas abrem com o MESMO cabeçalho da home, encurtado: fundo escuro
   (o criativo do lugar, quando existir), texto à esquerda, o chevron da
   marca em traço na coluna da direita. É uma casa só: quem sai da home e
   entra em /cultos reconhece a arquitetura antes de ler. Institucional é
   isso — a mesma voz em todas as portas, não uma foto diferente em cada uma.

   O fecho é o da home (.fecho-v3): frase centrada, o criativo `fecho` atrás.
   ============================================================================= */

type CabecalhoProps = {
  criativo: IdCriativo;
  rot: ReactNode;
  titulo: ReactNode;
  ed?: ReactNode;
  acoes?: ReactNode;
  /** conteúdo extra abaixo do texto (estado de carregamento, por exemplo) */
  children?: ReactNode;
  /** o h1 é sempre o título; `semTitulo` quando a página ainda não tem nome (carregando) */
  semTitulo?: boolean;
};

export function Cabecalho({ criativo, rot, titulo, ed, acoes, children, semTitulo }: CabecalhoProps) {
  return (
    <section className="pag-cab casa-escuro rev visto">
      <Criativo id={criativo} fundo prioridade />
      <div className="pag-cab-selo" aria-hidden="true"><Chevron traco /></div>
      <div className="g pag-cab-in">
        <p className="g-rot pag-cab-rot">{rot}</p>
        {!semTitulo && (typeof titulo === 'string'
          ? <Tit as="h1" className="pag-h1">{titulo}</Tit>
          : <h1 className="pag-h1">{titulo}</h1>)}
        {ed && <p className="g-ed pag-ed">{ed}</p>}
        {acoes && <div className="g-acoes pag-cab-acoes">{acoes}</div>}
        {children}
      </div>
    </section>
  );
}

type FechoProps = {
  rot: ReactNode;
  titulo: ReactNode;
  ed?: ReactNode;
  acoes?: ReactNode;
  nota?: ReactNode;
  criativo?: IdCriativo;
};

export function Fecho({ rot, titulo, ed, acoes, nota, criativo = 'fecho' }: FechoProps) {
  return (
    <section className="fecho-v3 casa-escuro rev">
      <Criativo id={criativo} fundo />
      <div className="g">
        <p className="g-rot">{rot}</p>
        {typeof titulo === 'string' ? <Tit className="g-h2">{titulo}</Tit> : <h2 className="g-h2">{titulo}</h2>}
        {ed && <p className="g-ed">{ed}</p>}
        {acoes && <div className="g-acoes">{acoes}</div>}
        {nota && <p className="g-nota fecho-nota">{nota}</p>}
      </div>
    </section>
  );
}
