import type { Metadata } from 'next';
import { og } from '@/lib/site/meta';
import { lp } from '@/lib/site/sites';
import { Vozes, Sede, Chapeu, Pil, Seta, Heroi, fim, inteiro, liga, ligaTexto } from '@/components/site/Blocos';

/* =============================================================================
   /acessar — A PORTA DAS EQUIPES · 11/10/2026
   Três caminhos, nenhum pede cadastro: o voluntário (/eu), a organização
   (/entrar) e quem ainda não serve (/servir). Tudo que é sistema fica do
   outro lado dessas portas; esta página só aponta.
   14/10/2026, no celular: os três caminhos cabem na primeira tela (eram de
   588 a 1.391 px, com a primeira tela só de título): herói mais baixo, sem
   o segundo título ("Escolha o seu caminho" repetia o "Três caminhos" do
   herói) e cada caminho numa linha, com o que ele abre embaixo.
   ============================================================================= */
export const metadata: Metadata = {
  title: 'Acesso às equipes',
  description: 'Sou voluntário, sou da organização ou quero participar: três caminhos, nenhum pede cadastro.',
  alternates: { canonical: '/acessar' },
  openGraph: og('servir', '/acessar', 'Acesso às equipes', 'Sou voluntário, sou da organização ou quero participar: três caminhos, nenhum pede cadastro.', '/og-acessar.jpg'),
};

const PORTAS = [
  { href: '/eu', n: '01', t: 'Sou voluntário', f: 'Ver a minha escala', d: 'Escolha a sua área, ache o seu nome e entre com o PIN de quatro números. Sem PIN, você cria na hora.', duro: true },
  { href: '/entrar', n: '02', t: 'Sou da organização', f: 'Administrar escalas e equipes', d: 'A porta da liderança: entra com o e-mail cadastrado e recebe o link de acesso.', duro: true },
  { href: lp(), n: '03', t: 'Quero participar', f: 'Começar a servir numa área', d: 'Você escolhe a área, se cadastra, e a liderança fala com você antes de qualquer escala.', duro: false },
];

const DUVIDAS = [
  { q: 'Perdi o meu link. E agora?', r: 'Entre por “Sou voluntário”, escolha a sua área, ache o seu nome e entre com o seu PIN de quatro números. Sem PIN, você cria na hora.' },
  { q: 'Tentei entrar pelo e-mail e não recebi nada', r: 'Aquela porta é da organização. Se você serve numa equipe, o seu caminho é o primeiro: “Sou voluntário”.' },
  { q: 'Ainda não sirvo, mas quero', r: 'O terceiro caminho. Você escolhe a área, se cadastra, e a liderança fala com você antes de qualquer escala.' },
];

export default function Acessar() {
  return (
    <>
      <Heroi id="t-ac" video="acessar" curto porta chapeu={<Chapeu forte="Acesso às equipes" resto="GUIA Church" />} titulo="Quem é você?" it="você?" semPonto
             lead={ligaTexto("Três caminhos. Nenhum pede cadastro.")} />

      <section className="s-faixa papel curta-celular" aria-labelledby="t-portas">
        <div className="s-in">
          <Sede className="topo" />
          <div className="s-cab centro s-rev so-largo">
            <Vozes id="t-portas" className="s-h2 media" it="caminho">Escolha o seu caminho</Vozes>
          </div>
          <div className="s-cartoes tres lista sem-n s-rev d1" role="group" aria-label="Os três caminhos">
            {PORTAS.map(p => (
              <a key={p.href} href={p.href} className="s-cartao">
                <span className="s-cartao-n">{p.n}</span>
                <span className="s-cartao-t medio">{p.t}</span>
                <span className="s-cartao-f">{liga(p.f)}</span>
                <span className="s-cartao-d">{fim(ligaTexto(inteiro(p.d)))}</span>
                <span className="s-cartao-ir">Entrar <Seta /></span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="s-faixa areia" aria-labelledby="t-chave">
        <div className="s-in">
          <div className="s-cab centro s-rev">
            <Vozes id="t-chave" className="s-h2 media" it="chave">O link é a sua chave</Vozes>
            <p className="s-lead">{ligaTexto("Aqui ninguém tem senha. Quem serve entra pela área, pelo nome e pelo PIN de quatro números.")}</p>
          </div>
          <div className="s-abre s-rev d1">
            {DUVIDAS.map((d, i) => <details key={d.q} open={i === 0}><summary>{liga(inteiro(d.q))}</summary><div><p>{fim(ligaTexto(inteiro(d.r)))}</p></div></details>)}
          </div>
          <div className="s-acoes centro s-cartoes-acoes">
            <Pil href="/eu" duro tom="preta">Abrir meu espaço</Pil>
          </div>
        </div>
      </section>
    </>
  );
}
