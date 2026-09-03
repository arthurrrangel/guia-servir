/** @type {import('next').NextConfig} */

/* AS DUAS OPÇÕES QUE ESTAVAM AQUI FORAM DESLIGADAS EM 27/08/2026.
   `typescript.ignoreBuildErrors` e `eslint.ignoreDuringBuilds` faziam o build
   ficar verde por definição: um erro de tipo passava direto e ia para o ar.
   A hora de desligar era exatamente agora, quando `tsc --noEmit` já dava zero
   erro e o custo era nenhum. Mantidas ligadas, o preço só apareceria no dia
   em que houvesse algo a esconder. */

/* CABEÇALHOS DE SEGURANÇA
   Em 29/08/2026 a produção mandava exatamente UM: o strict-transport-security
   que a Vercel põe sozinha. Todo o resto ficava no padrão do navegador — o que
   funciona hoje e é o navegador que decide amanhã.

   Importa mais aqui do que num site comum por um motivo: o link pessoal do
   voluntário É a credencial dele. /eu/<token> não pede senha; quem tem o
   endereço tem a conta. Um endereço que é senha não pode vazar por Referer nem
   ser aberto dentro do quadro de outra pessoa.

   frame-ancestors 'none' em vez de X-Frame-Options: o cabeçalho antigo não tem
   como dizer "nenhum" de forma padronizada (DENY é de fato, mas via CSP é a
   forma que os navegadores modernos leem). Só isso de CSP — uma política de
   script completa exigiria nonce em cada <script> do Next e quebraria calada
   no primeiro chunk novo. Meia CSP mal feita é pior que nenhuma. */
const CABECALHOS = [
  /* o endereço da página nunca sai daqui para outro site */
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  /* nada de adivinhar tipo: um .json não vira script porque alguém pediu */
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  /* ninguém coloca o painel do líder dentro de um quadro para roubar o clique */
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Frame-Options', value: 'DENY' },
  /* o produto não usa nenhuma dessas: desligar é mais barato que confiar */
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
];

/* =============================================================================
   NÃO-INDEXAÇÃO POR ROTA — a tarefa que a decisão de um domínio criou

   Enquanto o site público da igreja morava em outro endereço, o índice era
   resolvido pelo DNS: guiaservir.com inteiro ficava fora da busca e pronto.
   Com tudo no mesmo domínio, essa separação some, e o índice passa a depender
   de regra por rota. Um `noindex` global agora esconderia a igreja inteira.

   POR QUE CABEÇALHO, E NÃO SÓ A META TAG. As telas do sistema são componentes
   de cliente: a meta `robots` só existe depois que o JavaScript roda. Robô
   que lê o HTML e vai embora não a vê. O cabeçalho HTTP chega antes do
   primeiro byte de HTML e vale para qualquer resposta — inclusive para as que
   nem chegam a renderizar.

   POR QUE AQUI, E NÃO NUM MIDDLEWARE. Middleware faria o mesmo trabalho
   custando uma invocação de edge em cada request. `headers()` é estático,
   entra na configuração da borda no build e não roda código nenhum em
   produção. Menos peça, mesmo resultado.

   E FICA REGISTRADO O QUE MIDDLEWARE **NÃO** RESOLVERIA AQUI: a arquitetura
   pedia "middleware que nega por padrão". Este app não guarda sessão em
   cookie — o login do gestor vive no localStorage do navegador, por desenho do
   supabase-js. O servidor não enxerga esse estado, então um middleware não
   teria como distinguir gestor de estranho: ele bloquearia todo mundo ou
   ninguém. Quem de fato nega por padrão aqui é o RLS do banco, que já está
   fechado por permissão de invocador — e é uma trava mais forte, porque vale
   também para quem chama a API do Supabase direto, sem passar pelo site.
   ============================================================================= */
const NAO_INDEXAR = { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' };

/* O link pessoal do voluntário é o caso extremo: o token na URL é a
   credencial dela. Além de não indexar, `noimageindex` impede que qualquer
   imagem da página vire resultado, e `nosnippet` impede trecho em cache. */
const NAO_INDEXAR_NUNCA = { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, nosnippet, noimageindex' };

const ROTAS_FECHADAS = [
  '/entrar', '/entrar/:caminho+',
  '/painel', '/painel/:caminho+',
  '/escala', '/escala/:caminho+',
  '/time', '/time/:caminho+',
  '/ajustes', '/ajustes/:caminho+',
  /* lista de nomes por equipe, e convite de uso único */
  '/equipe/:caminho+',
  '/candidatura/:caminho+',
];

const nextConfig = {
  /* O harness de design roda `next dev` ao mesmo tempo em que eu rodo
     `next build` para conferir o deploy. Com o mesmo distDir, o build apaga os
     chunks que o dev está servindo e a tela quebra no meio da revisão. */
  distDir: process.env.NEXT_DIST_DIR || '.next',
  async headers() {
    return [
      { source: '/:caminho*', headers: CABECALHOS },
      /* mais específico depois: no Next, todos os blocos que casam são
         aplicados, e o último a definir a mesma chave vence. */
      ...ROTAS_FECHADAS.map(source => ({ source, headers: [NAO_INDEXAR] })),
      { source: '/eu', headers: [NAO_INDEXAR] },
      { source: '/eu/:caminho+', headers: [NAO_INDEXAR_NUNCA] },
    ];
  },
  async redirects() {
    return [
      /* O endereço que a arquitetura previu para a porta do voluntário. A
         página que ele descreve já existe e é melhor: /eu não só explica o
         link pessoal como resolve — lista as áreas, leva à lista da equipe e
         entra com o PIN. Criar uma segunda página para explicar o que a
         primeira resolve seria pôr um degrau entre a pessoa e a escala dela.
         O endereço fica válido; quem digita cai onde o trabalho acontece. */
      { source: '/acessar/voluntario', destination: '/eu', permanent: true },
      /* atalhos que a arquitetura usou em rascunho e que alguém vai digitar */
      { source: '/tv', destination: '/guia-church-tv', permanent: true },
      { source: '/pequenos-grupos', destination: '/pequena-guia', permanent: true },
      { source: '/pg', destination: '/pequena-guia', permanent: true },
      { source: '/contato', destination: '/como-chegar', permanent: false },
    ];
  },
};
export default nextConfig;
