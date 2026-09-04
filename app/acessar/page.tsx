import type { Metadata } from 'next';
import Link from 'next/link';
import { Site } from '@/components/Site';
import { Tit } from '@/components/Texto';
import { IcSeta } from '@/components/Icones';
import { SITE } from '@/lib/igreja';

/* =============================================================================
   /acessar — AS TRÊS PORTAS

   A fronteira entre o site público e o sistema. Pública, indexável, e sem
   nada do sistema dentro: pergunta quem é a pessoa e a entrega na porta
   certa. Três azulejos grandes com foto — quem chega aqui já sabe o que
   quer, e a página existe para durar oito segundos.

   A porta do voluntário aponta para /eu, que já explica e resolve (área →
   nome → PIN). /acessar/voluntario é 308 para lá.
   ============================================================================= */

export const metadata: Metadata = {
  title: 'Acesso às equipes',
  description: 'Gestor, voluntário ou quem quer começar a servir. Três caminhos, e cada um leva direto para o lugar certo.',
  alternates: { canonical: '/acessar' },
  openGraph: { title: 'Acesso às equipes · GUIA Church', description: 'Sou voluntário, sou da organização, ou quero participar.', url: `${SITE}/acessar`, type: 'website', locale: 'pt_BR' },
};

const PORTAS = [
  { href: '/eu', n: '01', t: 'Sou voluntário', d: 'Já sirvo numa equipe e quero ver a minha escala. Sem o link pessoal à mão, entra por aqui.', foto: 'equipe.webp' },
  { href: '/entrar', n: '02', t: 'Sou da organização', d: 'Administro escalas e equipes. Link por e-mail, sem senha — vale uma hora e serve uma vez.', foto: 'midia.webp' },
  { href: '/servir', n: '03', t: 'Quero participar', d: 'Ainda não sirvo e quero começar. Cada área explica o que faz; o cadastro leva um minuto.', foto: 'acolhida.webp' },
];

export default function Acessar() {
  return (
    <Site>
      <section className="casa-escuro rev">
        <div className="g g-secao primeira">
          <div className="g-grade fim">
            <div className="g-c7">
              <p className="g-rot">Acesso às equipes</p>
              <Tit as="h1" className="g-h1">Quem é você?</Tit>
            </div>
            <div className="g-c4 g-d9">
              <p className="g-corpo">Três caminhos. Escolha o seu e siga direto — nenhum deles pede cadastro para começar.</p>
            </div>
          </div>
          <div className="g-tiles tres">
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
          <div className="g-grade">
            <div className="g-c5">
              <div className="g-fixa">
                <p className="g-rot">Voluntário</p>
                <Tit className="g-h2">Você não tem senha aqui, e isso é de propósito</Tit>
                <p className="g-ed">O link é a sua chave.</p>
                <p className="g-corpo">
                  O acesso do voluntário é um link pessoal, que chega pelo WhatsApp
                  quando a escala é publicada. Ele é só seu — quem tem o link vê a
                  sua escala, então não repasse. Vale salvar nos favoritos do celular.
                </p>
              </div>
            </div>
            <div className="g-c6 g-d7">
              <ol className="g-perg">
                <li><span className="g-perg-n">01</span><div><h3 className="g-perg-q">Perdi o meu link. E agora?</h3>
                  <p className="g-perg-r">Não precisa pedir para ninguém: entre por <b>Sou voluntário</b>, escolha a sua área, ache o seu nome na lista e entre com o seu PIN de quatro números. Se ainda não tiver PIN, você cria na hora.</p></div></li>
                <li><span className="g-perg-n">02</span><div><h3 className="g-perg-q">Tentei entrar pelo e-mail e não recebi nada</h3>
                  <p className="g-perg-r">Aquela porta é da organização, não do voluntário. Se você serve numa equipe, seu caminho é o primeiro azulejo desta página.</p></div></li>
                <li><span className="g-perg-n">03</span><div><h3 className="g-perg-q">Ainda não sirvo, mas quero</h3>
                  <p className="g-perg-r">O terceiro azulejo. Você escolhe a área, se cadastra, e a liderança daquela área fala com você antes de qualquer escala.</p></div></li>
              </ol>
            </div>
          </div>
        </div>
      </section>
    </Site>
  );
}
