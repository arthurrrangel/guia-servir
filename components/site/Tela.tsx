import { TELA_JS } from '@/lib/site/tela';

/* a altura visível do celular, medida antes do herói ser desenhado
   (lib/site/tela.ts): o primeiro filho do casco de cada site */
export default function Tela() {
  return <script dangerouslySetInnerHTML={{ __html: TELA_JS }} />;
}
