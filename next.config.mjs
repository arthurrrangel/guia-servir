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

const nextConfig = {
  /* O harness de design roda `next dev` ao mesmo tempo em que eu rodo
     `next build` para conferir o deploy. Com o mesmo distDir, o build apaga os
     chunks que o dev está servindo e a tela quebra no meio da revisão. */
  distDir: process.env.NEXT_DIST_DIR || '.next',
  async headers() {
    return [{ source: '/:caminho*', headers: CABECALHOS }];
  },
};
export default nextConfig;
