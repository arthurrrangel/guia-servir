import type { Metadata } from 'next';
import Link from 'next/link';
import { cartao } from '@/lib/meta';
import { Site } from '@/components/Site';
import { Tit } from '@/components/Texto';
import { Perguntas } from '@/components/Perguntas';
import { IcSeta } from '@/components/Icones';

/* =============================================================================
   /acessar — AS TRÊS PORTAS

   A fronteira entre o site público e o sistema. Pública, indexável, e sem
   nada do sistema dentro: pergunta quem é a pessoa e a entrega na porta
   certa. Três azulejos iguais com foto, e três perguntas de quem se perdeu.

   A porta do voluntário aponta para /eu, que já explica e resolve (área →
   nome → PIN). /acessar/voluntario é 308 para lá.
   ============================================================================= */

export const metadata: Metadata = {
  title: 'Acesso às equipes',
  description: 'Gestor, voluntário ou quem quer começar a servir. Três caminhos, e cada um leva direto para o lugar certo.',
  alternates: { canonical: '/acessar' },
  ...cartao({ titulo: 'Acesso às equipes', descricao: 'Sou voluntário, sou da organização, ou quero participar.', caminho: '/acessar', imagem: 'acessar' }),
};

const PORTAS = [
  { href: '/eu', n: '01', t: 'Sou voluntário', d: 'Ver a minha escala.', foto: 'equipe.webp' },
  { href: '/entrar', n: '02', t: 'Sou da organização', d: 'Administrar escalas e equipes.', foto: 'midia.webp' },
  { href: '/servir', n: '03', t: 'Quero participar', d: 'Começar a servir numa área.', foto: 'acolhida.webp' },
];

const PERGUNTAS = [
  { q: 'Perdi o meu link. E agora?',
    r: 'Entre por Sou voluntário, escolha a sua área, ache o seu nome e entre com o seu PIN de quatro números. Sem PIN, você cria na hora.' },
  { q: 'Tentei entrar pelo e-mail e não recebi nada',
    r: 'Aquela porta é da organização. Se você serve numa equipe, o seu caminho é o primeiro azulejo.' },
  { q: 'Ainda não sirvo, mas quero',
    r: 'O terceiro azulejo. Você escolhe a área, se cadastra, e a liderança fala com você antes de qualquer escala.' },
];

export default function Acessar() {
  return (
    <Site>
      <section className="casa-escuro rev">
        <div className="g g-secao primeira">
          <div className="c">
            <p className="g-rot">Acesso às equipes</p>
            <Tit as="h1" className="g-h1">Quem é você?</Tit>
            <p className="g-ed">Três caminhos. Nenhum pede cadastro.</p>
          </div>
          <div className="g-tiles tres c-larga c-bloco grande">
            {PORTAS.map(p => (
              <Link key={p.href} href={p.href} className="g-tile">
                <img src={`/fotos/${p.foto}`} alt="" loading="lazy" decoding="async" />
                <span className="g-tile-seta" aria-hidden="true"><IcSeta /></span>
                <span className="g-tile-l" style={{ fontFamily: 'var(--fonte-editorial)', fontStyle: 'italic', fontWeight: 200, letterSpacing: '-.02em' }}>{p.n}</span>
                <span><span className="g-tile-t">{p.t}</span><span className="g-tile-d">{p.d}</span></span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="casa-areia rev">
        <div className="g g-secao">
          <div className="c">
            <p className="g-rot">Voluntário</p>
            <Tit className="g-h2">Você não tem senha aqui</Tit>
            <p className="g-ed">O link é a sua chave.</p>
          </div>
          <div className="c-media c-bloco grande">
            <Perguntas itens={PERGUNTAS} />
          </div>
        </div>
      </section>
    </Site>
  );
}
