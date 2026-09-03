import { existeFoto, type Foto } from '@/lib/imagens';

/* =============================================================================
   VAGA DE IMAGEM — o espaço reservado para a foto que ainda não existe

   Um placeholder cinza e mudo é um buraco que todo mundo esquece. Este diz
   três coisas na própria página: O QUE a foto precisa mostrar, em QUE
   proporção, e com QUE NOME o arquivo entra. Quem for fotografar no domingo
   abre o site no celular e tem a lista de produção na tela, no lugar exato
   onde cada foto vai cair.

   COMO PREENCHER, e é de propósito que seja só isto:
   1. salve o arquivo em `public/fotos/` com o nome que a vaga mostra;
   2. pronto. A vaga vira a foto sozinha.
   Nenhuma linha de página muda — o registro em lib/imagens.ts é a única
   fonte, e é ele que sabe se o arquivo já existe.

   `alt` NUNCA é opcional. Foto de igreja sem alt é a página inteira
   inacessível para quem usa leitor de tela, e o texto alternativo é também
   o que o Google lê da imagem. Quem cadastra a vaga escreve o alt junto.
   ============================================================================= */

export function Vaga({ foto, className = '' }: { foto: Foto; className?: string }) {
  const pronta = existeFoto(foto.arquivo);
  const src = `/fotos/${foto.arquivo}`;

  return (
    <figure
      className={`vaga ${className}`}
      style={{ aspectRatio: foto.proporcao, margin: 0 }}
    >
      {pronta ? (
        <img src={src} alt={foto.alt} loading="lazy" />
      ) : (
        /* aria-hidden: a vaga é um recado para quem constrói o site, não
           conteúdo da igreja. Anunciar "vaga de imagem, 3 por 2" para quem
           usa leitor de tela seria ruído sobre uma página que já funciona
           sem a foto. */
        <div className="vaga-in" aria-hidden="true">
          <span className="vaga-rot">Vaga de imagem</span>
          <p className="vaga-txt">{foto.pede}</p>
          <span className="vaga-arq">public/fotos/{foto.arquivo}</span>
        </div>
      )}
    </figure>
  );
}

/* várias vagas em linha. `quantas` só existe para escolher a grade — duas ou
   três colunas no desktop, uma no celular sempre. */
export function Vagas({ fotos, quantas = 'tres' }:
  { fotos: Foto[]; quantas?: 'duas' | 'tres' }) {
  return (
    <div className={`vagas ${quantas}`}>
      {fotos.map(f => <Vaga key={f.arquivo} foto={f} />)}
    </div>
  );
}
