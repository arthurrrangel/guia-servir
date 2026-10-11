import type { Metadata } from 'next';
import { SITE_IGREJA as SITE } from '@/lib/igreja';
import { Vozes, Sede, Chapeu, Pil, Img } from '@/components/site/Blocos';

/* =============================================================================
   /acessar — A PORTA DAS EQUIPES · 11/10/2026
   Três caminhos, nenhum pede cadastro: o voluntário (/eu), a organização
   (/entrar) e quem ainda não serve (/servir). Tudo que é sistema fica do
   outro lado dessas portas; esta página só aponta.
   ============================================================================= */
export const metadata: Metadata = {
  title: 'Acesso às equipes',
  description: 'Sou voluntário, sou da organização ou quero participar: três caminhos, nenhum pede cadastro.',
  alternates: { canonical: '/acessar' },
  openGraph: { title: 'Acesso às equipes · GUIA Church', url: `${SITE}/acessar`, images: [{ url: '/og-acessar.jpg', width: 1200, height: 630 }] },
};

const PORTAS = [
  { href: '/eu', n: '01', t: 'Sou voluntário', f: 'Ver a minha escala', d: 'Escolha a sua área, ache o seu nome e entre com o PIN de quatro números. Sem PIN, você cria na hora.', duro: true },
  { href: '/entrar', n: '02', t: 'Sou da organização', f: 'Administrar escalas e equipes', d: 'A porta da liderança: entra com o e-mail cadastrado e recebe o link de acesso.', duro: true },
  { href: '/servir', n: '03', t: 'Quero participar', f: 'Começar a servir numa área', d: 'Você escolhe a área, se cadastra, e a liderança fala com você antes de qualquer escala.', duro: false },
];

const DUVIDAS = [
  { q: 'Perdi o meu link. E agora?', r: 'Entre por "Sou voluntário", escolha a sua área, ache o seu nome e entre com o seu PIN de quatro números. Sem PIN, você cria na hora.' },
  { q: 'Tentei entrar pelo e-mail e não recebi nada', r: 'Aquela porta é da organização. Se você serve numa equipe, o seu caminho é o primeiro: "Sou voluntário".' },
  { q: 'Ainda não sirvo, mas quero', r: 'O terceiro caminho. Você escolhe a área, se cadastra, e a liderança fala com você antes de qualquer escala.' },
];

export default function Acessar() {
  return (
    <>
      <section className="s-heroi curto" aria-labelledby="t-ac">
        <Img lugar="home-circulo-2" prioridade />
        <div className="s-in s-heroi-in">
          <Chapeu forte="Acesso às equipes" resto="GUIA Church" />
          <Vozes as="h1" id="t-ac" className="s-h1" it="você" semPonto>Quem é você?</Vozes>
          <p className="s-lead grande">Três caminhos. Nenhum pede cadastro.</p>
        </div>
      </section>

      <section className="s-faixa papel" aria-labelledby="t-portas">
        <div className="s-in">
          <Sede className="topo" />
          <div className="s-cab centro s-rev">
            <Vozes id="t-portas" className="s-h2 media" it="caminho">Escolha o seu caminho</Vozes>
          </div>
          <div className="s-cartoes tres s-rev d1">
            {PORTAS.map(p => (
              <a key={p.href} href={p.href} className="s-cartao">
                <span className="s-cartao-n">{p.n}</span>
                <span className="s-cartao-t" style={{ fontSize: 'clamp(26px,2.4vw,34px)' }}>{p.t}</span>
                <span className="s-cartao-f">{p.f}</span>
                <span className="s-cartao-d">{p.d}</span>
                <span className="s-cartao-ir">Entrar</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="s-faixa areia" aria-labelledby="t-chave">
        <div className="s-in">
          <div className="s-cab centro s-rev">
            <Vozes id="t-chave" className="s-h2 media" it="chave">Você não tem senha aqui. O link é a sua chave</Vozes>
          </div>
          <div className="s-abre s-rev d1">
            {DUVIDAS.map((d, i) => <details key={d.q} open={i === 0}><summary>{d.q}</summary><div><p>{d.r}</p></div></details>)}
          </div>
          <div className="s-acoes centro" style={{ marginTop: 'clamp(28px,4vw,48px)' }}>
            <Pil href="/eu" duro tom="preta">Abrir meu espaço</Pil>
          </div>
        </div>
      </section>
    </>
  );
}
