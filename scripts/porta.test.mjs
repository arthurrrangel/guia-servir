/* A REGRA DE SALTO DA PORTA DO LINK DO GRUPO — 01/10/2026.

   O link da escala no grupo (guiaservir.com/confirmar/<ministério>) precisa
   achar a pessoa no endereço em que ela abriu a própria página: o app roda em
   guiaservir.com e em escalas.guiaservir.com, e o armazenamento do navegador é
   separado por endereço. Um bilhete num cookie de .guiaservir.com diz onde.

   A primeira versão saltava às cegas pelos endereços e entrava em laço quando
   um redirecionamento perdia o marcador. Aqui a regra é testada sem os
   domínios de verdade: no máximo um salto, nunca de volta para onde já foi,
   e a porta da equipe no endereço principal quando ninguém conhece a pessoa. */
import { proximoPassoDaPorta as P } from '../lib/meu-token.ts';
let n = 0, f = 0;
const ok = (c, nome, extra) => { n++; if (c) console.log('  PASS  ' + nome); else { f++; console.log('  FAIL  ' + nome + (extra ? '\n        ' + extra : '')); } };
const EQ = 'https://guiaservir.com/equipe/louvor?ir=confirmar';

ok(P('a', '', 'e', 'louvor', 'confirmar') === 'https://escalas.guiaservir.com/confirmar/louvor#h=a.e',
   'conhecido no outro endereço: um salto, levando quem já foi visitado', P('a', '', 'e', 'louvor', 'confirmar'));
ok(P('e', '#h=a.e', 'e', 'louvor', 'confirmar') === EQ,
   'chegou ao endereço do bilhete e não achou (armazenamento limpo): PIN, sem voltar', P('e', '#h=a.e', 'e', 'louvor', 'confirmar'));
ok(P('a', '#h=a.e', 'e', 'louvor', 'confirmar') === EQ,
   'redirecionamento que traz de volta: o marcador impede o laço');
ok(P('e', '#h=a', 'a', 'louvor', 'confirmar') === EQ,
   'nunca salta de volta para um endereço já visitado');
ok(P('a', '', '', 'louvor', 'confirmar') === EQ, 'ninguém conhecido: direto para o PIN, sem salto às cegas');
ok(P('a', '', 'a', 'louvor', 'confirmar') === EQ, 'bilhete apontando para cá mesmo (e nada guardado aqui): PIN');
ok(P('a', '', 'z', 'louvor', 'confirmar') === EQ, 'código desconhecido no bilhete é ignorado');
ok(P('a', '#h=../../evil.com', 'e', 'louvor', 'confirmar').startsWith('https://escalas.guiaservir.com/'),
   'lixo no marcador não vira endereço');
ok(P('', '', 'e', 'louvor', 'confirmar') === '/equipe/louvor?ir=confirmar', 'fora dos endereços da igreja (desenvolvimento): porta local, sem salto');
ok(P('e', '', 'a', 'louvor', 'disponibilidade') === 'https://guiaservir.com/disponibilidade/louvor#h=e.a',
   'o link de disponibilidade salta para o mesmo destino');
ok(P('a', '', 'e', 'música', 'confirmar').includes('/confirmar/m%C3%BAsica#h=a.e'), 'o ministério vai codificado no endereço');
/* O CASO DA AUDITORIA 3: o destino responde 308 de volta para a raiz (como o
   www já faz) e o fragmento volta como saiu. Com o fragmento que o próprio
   código produz, a raiz não salta de novo. */
{
  const salto = P('a', '', 'e', 'louvor', 'confirmar');
  const fragmento = salto.slice(salto.indexOf('#'));
  ok(P('a', fragmento, 'e', 'louvor', 'confirmar') === EQ,
     'destino que redireciona de volta: a raiz recebe o fragmento e vai para o PIN, sem laço', fragmento);
}
/* qualquer sequência de saltos termina em no máximo 2 páginas */
for (const ini of ['a', 'e']) for (const onde of ['a', 'e', '']) {
  let aqui = ini, hash = '', passos = 0, url = '';
  while (passos < 5) {
    url = P(aqui, hash, onde, 'louvor', 'confirmar'); passos++;
    const m = /^https:\/\/(escalas\.)?guiaservir\.com\/confirmar\/louvor(#.*)$/.exec(url);
    if (!m) break;
    /* pior caso: todo salto volta para a raiz por redirecionamento do servidor */
    aqui = 'a'; hash = m[2];
  }
  ok(passos <= 2 && url.includes('/equipe/louvor'), `de "${ini}" com bilhete "${onde || 'nenhum'}": termina na porta da equipe em ${passos} passo(s)`, url);
}
console.log(`\nporta: ${n - f}/${n} ok`);
process.exit(f ? 1 : 0);
