/** @type {import('next').NextConfig} */

/* AS DUAS OPÇÕES QUE ESTAVAM AQUI FORAM DESLIGADAS EM 27/08/2026.
   `typescript.ignoreBuildErrors` e `eslint.ignoreDuringBuilds` faziam o build
   ficar verde por definição: um erro de tipo passava direto e ia para o ar.
   A hora de desligar era exatamente agora, quando `tsc --noEmit` já dava zero
   erro e o custo era nenhum. Mantidas ligadas, o preço só apareceria no dia
   em que houvesse algo a esconder. */

const nextConfig = {
  /* O harness de design roda `next dev` ao mesmo tempo em que eu rodo
     `next build` para conferir o deploy. Com o mesmo distDir, o build apaga os
     chunks que o dev está servindo e a tela quebra no meio da revisão. */
  distDir: process.env.NEXT_DIST_DIR || '.next',
};
export default nextConfig;
