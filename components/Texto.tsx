/* =============================================================================
   O TÍTULO QUE MONTA PALAVRA POR PALAVRA

   Componente de SERVIDOR de propósito (nenhum hook, nenhum 'use client'): as
   páginas públicas novas são server components, e o título precisa sair
   pronto no HTML — é ele que o Google e a prévia do WhatsApp leem.

   A quebra em <span> tem que existir no HTML do servidor. Se fosse feita num
   efeito, a primeira pintura sairia com o texto inteiro e depois piscaria.

   10/10/2026: a home, que tinha uma cópia própria disto, passou a importar
   daqui (o dia chegou junto com a identidade nova).
   ============================================================================= */

/* AS DUAS VOZES — 10/10/2026, a identidade nova (ApresentaSite.pdf).
   O título termina numa palavra em serifa itálica, com ponto final:
   "Existe um lugar / para você.", "Deus se alegra com o seu servir.",
   "Escolha por onde começar.". A regra vale para todo h1 e para os .g-h2
   do site público, e só quando a última palavra é uma palavra comum em
   caixa baixa: "Somos GUIA", "Follow" e "Como chegar até a gente?" não
   ganham itálico à toa (o "?" já fecha; sigla e nome não viram serifa).
   O ponto é desenhado pelo CSS (.pal.it.pt::after): a copy fica intacta
   no HTML, e quem lê por leitor de tela ouve o texto como foi escrito. */
const comum = (p: string) => /^[a-zà-ú]+[.,:;!?]?$/.test(p) && !/[!?]$/.test(p);
export function Tit({ children, className = 'tit', as: Tag = 'h2', id, vozes }:
  { children: string; className?: string; as?: 'h1' | 'h2' | 'h3'; id?: string; vozes?: boolean }) {
  const pals = children.split(' ');
  const duas = vozes ?? (Tag === 'h1' || /\bg-h[12]\b/.test(className));
  const ult = pals.length - 1;
  const italica = duas && pals.length >= 2 && comum(pals[ult]);
  const ponto = italica && !/[.,:;]$/.test(pals[ult]);
  return (
    <Tag className={className} id={id}>
      {pals.map((p, i) => (
        /* o espaço fica FORA do span, como nó de texto entre eles. Dentro, o
           navegador descarta o espaço final de um inline-block e as palavras
           saem coladas. */
        <span key={i}>
          <span className={'pal' + (italica && i === ult ? ' it' + (ponto ? ' pt' : '') : '')} style={{ ['--i' as string]: i }}>{p}</span>
          {i < ult ? ' ' : ''}
        </span>
      ))}
    </Tag>
  );
}

/* JSON-LD. Sempre por este componente, nunca por dangerouslySetInnerHTML
   escrito à mão em cada página: um `<` sem escape dentro de um campo de texto
   fecha o script e quebra a página inteira, e é o tipo de erro que só aparece
   quando alguém edita a descrição meses depois. */
export function Schema({ dados }: { dados: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(dados).replace(/</g, '\\u003c'),
      }}
    />
  );
}

/* AS PALAVRAS QUE ACENDEM COM A ROLAGEM. Cada palavra é um span; o CSS
   (.luz .pal) liga a opacidade à posição na tela com animation-timeline:
   view() — sem JavaScript, e onde o navegador não sabe fazer isso as
   palavras nascem acesas. É o versículo de /sobre. */
export function Luz({ children, className = '' }: { children: string; className?: string }) {
  const pals = children.split(' ');
  return (
    <span className={'luz ' + className}>
      {pals.map((p, i) => (
        <span key={i}><span className="lz">{p}</span>{i < pals.length - 1 ? ' ' : ''}</span>
      ))}
    </span>
  );
}
