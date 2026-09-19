'use client';
/* A TELA DE QUANDO NÓS QUEBRAMOS.

   `app/not-found.tsx` já existia e é bem feita — mas 404 é o erro que a
   PESSOA causa. Faltava a outra metade: o erro que NÓS causamos.

   Sem este arquivo, qualquer exceção durante a renderização de um componente
   de cliente — e são 46 arquivos com `'use client'`, incluindo as quatro
   telas de liderança e a tela do voluntário — sobe até a raiz e o Next mostra
   a tela padrão dele em produção: "Application error: a client-side exception
   has occurred". Fundo branco, fonte do sistema, sem botão, sem recarregar,
   sem dizer o que fazer, em inglês.

   O cenário concreto é domingo de manhã, 9h, o organizador do Louvor no
   celular. Se o erro for determinístico — um dado nulo que a ponte deixou
   passar —, ele nunca mais entra, e ninguém fica sabendo, porque o
   `console.warn` de `lib/erros.ts` morre no aparelho dele.

   Por isso o `digest` está na tela. Ele é o identificador que o Next gera
   para cada erro e que aparece no log da Vercel: é a única coisa que liga o
   "quebrou aqui" da pessoa à linha que quebrou. Uma pessoa consegue mandar
   seis caracteres por WhatsApp; ninguém manda uma pilha de chamadas.

   ESTE ARQUIVO É BURRO DE PROPÓSITO. Ele não importa `lib/erros`, não importa
   componente nenhum, não busca nada. Um limite de erro que pode lançar não é
   um limite de erro. */

export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main style={{
      minHeight: '70vh', display: 'grid', placeItems: 'center',
      padding: '32px 20px', textAlign: 'center',
    }}>
      <div style={{ maxWidth: 420 }}>
        <p style={{
          margin: 0, fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase',
          opacity: .6,
        }}>Alguma coisa quebrou</p>
        <h1 style={{ margin: '10px 0 0', fontSize: 'clamp(24px,5vw,32px)', lineHeight: 1.2 }}>
          Não foi você.
        </h1>
        <p style={{ margin: '12px 0 0', fontSize: 17, lineHeight: 1.6, opacity: .85 }}>
          Esta tela parou no meio. Tentar de novo costuma resolver; se não
          resolver, avise quem organiza a igreja e mande o código aqui de baixo.
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
    </main>
  );
}
