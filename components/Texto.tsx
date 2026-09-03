/* =============================================================================
   O TÍTULO QUE MONTA PALAVRA POR PALAVRA

   Componente de SERVIDOR de propósito (nenhum hook, nenhum 'use client'): as
   páginas públicas novas são server components, e o título precisa sair
   pronto no HTML — é ele que o Google e a prévia do WhatsApp leem.

   A quebra em <span> tem que existir no HTML do servidor. Se fosse feita num
   efeito, a primeira pintura sairia com o texto inteiro e depois piscaria.

   A home tem uma cópia própria disto dentro de `app/page.tsx`. Ela não foi
   trocada por esta de propósito: a home está no ar e funcionando, e unificar
   o componente exigiria mexer num arquivo de 591 linhas para ganhar nada que
   a pessoa veja. Se um dia a home for editada por outro motivo, é o momento
   de apagar a cópia de lá e importar daqui.
   ============================================================================= */

export function Tit({ children, className = 'tit', as: Tag = 'h2' }:
  { children: string; className?: string; as?: 'h1' | 'h2' | 'h3' }) {
  const pals = children.split(' ');
  return (
    <Tag className={className}>
      {pals.map((p, i) => (
        /* o espaço fica FORA do span, como nó de texto entre eles. Dentro, o
           navegador descarta o espaço final de um inline-block e as palavras
           saem coladas. */
        <span key={i}>
          <span className="pal" style={{ ['--i' as string]: i }}>{p}</span>
          {i < pals.length - 1 ? ' ' : ''}
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
