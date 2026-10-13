import { Video } from './Video';

/* =============================================================================
   PÔSTER + VÍDEO · 13/10/2026

   O Arthur pediu menos foto e mais vídeo ("use mais os vídeos que te mandei
   somente"; "use apenas as fotos melhores"). Cada lugar do site que tinha
   foto de enfeite agora tem um trecho próprio dos três vídeos da igreja
   (scripts/site-videos.py grava em public/site/v/). Duas peças:

   <Fundo video="cultos" />   herói e faixa de ponta a ponta: o pôster em
                              <picture> (deitado no computador, em pé no
                              celular) e o vídeo por cima, no mesmo enquadre
                              (os dois cobrem a caixa a partir do centro, o
                              fade não pula).
   <Quadro video="gente" />   o quadro 4:5 (ou o círculo) dentro da seção.

   O pôster é o primeiro quadro do trecho: sem vídeo (reduzir movimento,
   economia de dados, iPhone em modo de economia) a página fica com uma foto
   que é do próprio vídeo, não uma imagem de outro lugar.
   ============================================================================= */

const V = (id: string, f: string) => `/site/v/${id}-${f}`;
const TAM = { l: [1280, 720], p: [720, 1280], v: [720, 900], q: [640, 640] } as const;

export function Fundo({ video, prioridade, alt = '' }: { video: string; prioridade?: boolean; alt?: string }) {
  return (
    <>
      <picture>
        <source media="(orientation: portrait)" srcSet={`${V(video, 'p')}.webp`} width={TAM.p[0]} height={TAM.p[1]} />
        <img
          src={`${V(video, 'l')}.webp`} width={TAM.l[0]} height={TAM.l[1]} alt={alt}
          loading={prioridade ? 'eager' : 'lazy'} decoding="async" fetchPriority={prioridade ? 'high' : undefined}
        />
      </picture>
      <Video largo={V(video, 'l')} retrato={V(video, 'p')} perto={!prioridade} className="s-heroi-video" />
    </>
  );
}

export function Quadro({ video, formato = 'v', className = '', alt = '' }:
  { video: string; formato?: 'v' | 'q'; className?: string; alt?: string }) {
  const [w, h] = TAM[formato];
  return (
    <div className={`s-quadro ${formato} ${className}`.trim()}>
      <img src={`${V(video, formato)}.webp`} width={w} height={h} alt={alt} loading="lazy" decoding="async" />
      <Video src={V(video, formato)} perto className="s-quadro-video" />
    </div>
  );
}
