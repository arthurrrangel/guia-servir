'use client';
/* O LIMITE DE ERRO DO ANDAR DE CIMA.

   `app/error.tsx` cobre o que quebra DENTRO do layout raiz. Ele não cobre o
   que quebra NO layout raiz — e é justamente ali que moram `Medidas` e
   `Transicao`, que rodam em toda página do produto.

   Fazer só um dos dois deixa metade do caso descoberto, e a metade descoberta
   é a pior: um erro no layout derruba tudo de uma vez, em todas as rotas.

   Este arquivo substitui o documento inteiro, então precisa trazer `<html>` e
   `<body>` próprios — nenhum layout sobreviveu para fornecê-los. E por isso
   mesmo ele não pode depender de NADA: sem CSS da casa (a folha pode ser
   exatamente o que falhou), sem componente, sem fonte. Só estilo em linha. */

export default function ErroGlobal({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{
        margin: 0, minHeight: '100vh', display: 'grid', placeItems: 'center',
        background: '#fff', color: '#252525', padding: '32px 20px', textAlign: 'center',
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      }}>
        <div style={{ maxWidth: 420 }}>
          <p style={{ margin: 0, fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', opacity: .6 }}>
            Alguma coisa quebrou
          </p>
          <h1 style={{ margin: '10px 0 0', fontSize: 28, lineHeight: 1.2 }}>Não foi você.</h1>
          <p style={{ margin: '12px 0 0', fontSize: 17, lineHeight: 1.6, opacity: .85 }}>
            O site parou antes de conseguir desenhar a página. Recarregar
            costuma resolver; se não resolver, avise quem organiza a igreja e
            mande o código aqui de baixo.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 22 }}>
            <button onClick={reset} style={{
              minHeight: 44, padding: '0 20px', border: 0, borderRadius: 8,
              background: '#252525', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer',
            }}>Tentar de novo</button>
            <a href="/" style={{
              minHeight: 44, padding: '0 20px', display: 'inline-flex', alignItems: 'center',
              border: '1px solid rgba(37,37,37,.22)', borderRadius: 8,
              color: 'inherit', textDecoration: 'none', fontSize: 15, fontWeight: 600,
            }}>Ir para o começo</a>
          </div>
          {error?.digest ? (
            <p style={{ margin: '20px 0 0', fontSize: 12, opacity: .55, fontFamily: 'ui-monospace,Menlo,monospace' }}>
              código: {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
