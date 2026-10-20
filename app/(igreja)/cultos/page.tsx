import type { Metadata } from 'next';
import Link from 'next/link';
import { Simbolo } from '@/components/Marca';
import { IGREJA, SITE_IGREJA as SITE, canalDeConversa } from '@/lib/igreja';
import { MOMENTOS } from '@/lib/site/domingo';
import { Vozes, Sede, Chapeu, Pil, Seta, fim, Sep, Perguntas, UmaLinha, liga, ligaTexto } from '@/components/site/Blocos';
import { Fundo } from '@/components/site/Midia';
import Scrub, { type Foto } from '@/components/site/Scrub';
import { Schema } from '@/components/site/Schema';
import ProximoCulto from '@/components/site/ProximoCulto';

/* =============================================================================
   /cultos — A PÁGINA QUE TIRA ALGUÉM DE CASA · 11/10/2026

   Responde quando e o que esperar, na forma da apresentação.

   13/10/2026: herói, domingo (em capítulos) e mensagem em vídeo.

   14/10/2026, NO CELULAR: cada ação uma vez e um bloco só de dúvidas: o
   cartão "É a sua primeira vez?" abre as perguntas de "Antes de sair de
   casa", que no computador são uma faixa própria.

   19/10/2026, A COPY FINAL: herói · como é um domingo aqui (os quatro
   momentos da home, com os textos dela, no lugar do roteiro com horas) ·
   é a sua primeira vez (o texto novo) · antes de sair de casa · ao vivo ·
   escolha o seu próximo passo (culto ou Pequena Guia, no lugar do "Vem
   domingo"). Saíram duas faixas que repetiam páginas inteiras: o "como
   chegar" (é a página /como-chegar, e o "Vou participar" leva lá) e o
   Follow (é a agenda, /eventos#follow). As três fichas do cartão "primeira
   vez" (ao chegar, durante o culto, com crianças) também: o texto novo diz
   as duas primeiras, e as crianças viraram uma pergunta.

   20/10/2026, A CAMADA DE CIMA: o herói anda com o scroll por um domingo
   inteiro, nos quatro momentos da copy (acolhida, louvor, Palavra, oração e
   saída), cada um sobre uma foto de verdade do fotógrafo da igreja, e
   pousa em "Um domingo para pertencer". A faixa "como é um domingo aqui?"
   (o vídeo em capítulos, que a home continua tendo) sai: o herói É o
   domingo, com os mesmos quatro textos. O "próximo passo" deixa os dois
   cartões e vira duas linhas de índice.
   ============================================================================= */

/* o domingo em quatro momentos, nas fotos do Drive (scripts/site-fotos-drive.py) */
const DOMINGO: Foto[] = [
  { l: '/site/cultos-1-l.webp', p: '/site/cultos-1-p.webp', a: 0, b: 0, alt: 'Uma mulher sorrindo na entrada da igreja, recebendo quem chega' },
  { l: '/site/cultos-2-l.webp', p: '/site/cultos-2-p.webp', a: 0.2, b: 0.28, alt: 'A igreja adorando, de pé, durante o louvor' },
  { l: '/site/cultos-3-l.webp', p: '/site/cultos-3-p.webp', a: 0.4, b: 0.48, alt: 'O pastor no púlpito, durante a mensagem' },
  { l: '/site/cultos-4-l.webp', p: '/site/cultos-4-p.webp', a: 0.58, b: 0.66, alt: 'Pessoas orando de olhos fechados, lado a lado' },
  { l: '/site/cultos-5-l.webp', p: '/site/cultos-5-p.webp', a: 0.74, b: 0.82, alt: 'O pastor de braços abertos diante da igreja' },
];

export const metadata: Metadata = {
  title: 'Cultos',
  description: `Um domingo para pertencer: culto aos ${IGREJA.cultoDia.toLowerCase()}s, às ${IGREJA.cultoHora}, na ${IGREJA.rua}, ${IGREJA.bairro}. Como é, o que esperar na primeira vez e qual é o próximo passo.`,
  alternates: { canonical: '/cultos' },
  openGraph: { siteName: 'GUIA Church', type: 'website', locale: 'pt_BR', title: 'Um domingo para pertencer · GUIA Church', description: `${IGREJA.cultoDia}, ${IGREJA.cultoHora}, ${IGREJA.bairro}.`, url: `${SITE}/cultos`, images: [{ url: '/og-cultos.jpg', width: 1200, height: 630 }] },
};

const PERGUNTAS = [
  { q: 'Quanto tempo dura?', r: 'Cerca de uma hora e meia. Começa às 10h e, lá pelas 11h30, estamos no café.' },
  { q: 'Como me visto?', r: 'Como você estiver confortável. Não existe roupa certa pra encontrar com Deus.' },
  { q: 'Tem estacionamento?', r: 'Tem. A equipe orienta onde parar; chegue com dez minutos de antecedência.' },
  { q: 'E as crianças?', r: 'A GUIA Kids (o espaço das crianças) recebe do berçário aos 12 anos, com segurança, cuidado e linguagem pra cada idade. Você assiste ao culto tranquilo.' },
  { q: 'Preciso dar alguma coisa?', r: 'Não. A oferta é de quem já é de casa e quer. Visitante vem pra receber.' },
  { q: 'Vou ter que falar na frente?', r: 'Nunca. Ninguém vai te pôr em pé nem pedir pra se apresentar.' },
  { q: 'E se eu quiser conversar com alguém?', r: 'Procura qualquer pessoa de camisa GUIA na saída, ou chama a gente no WhatsApp antes de vir.' },
];

/* escolha o seu próximo passo (copy final, 19/10/2026) */
const PASSO = [
  { t: 'Participe de um culto', d: 'Venha conhecer a GUIA, celebrar com a gente e viver um domingo em comunidade.', href: '/como-chegar', ir: 'Vou participar' },
  { t: 'Conheça uma Pequena Guia', d: 'Se você quer relacionamentos mais próximos e continuar a caminhada durante a semana, tem um grupo perto de você.', href: '/pequena-guia', ir: 'Encontrar uma Pequena Guia' },
];

export default function Cultos() {
  const conversa = canalDeConversa('Oi! Vou pela primeira vez no culto da GUIA e queria uma orientação. ');
  return (
    <>
      <Schema dados={{
        '@context': 'https://schema.org', '@type': 'Event',
        name: `Culto de domingo · ${IGREJA.nome}`, description: 'Culto público semanal, aberto a visitantes.',
        eventSchedule: { '@type': 'Schedule', byDay: 'https://schema.org/Sunday', startTime: '10:00', scheduleTimezone: 'America/Sao_Paulo' },
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', isAccessibleForFree: true,
        organizer: { '@type': 'Church', name: IGREJA.nome, url: SITE },
        location: { '@type': 'Place', name: IGREJA.nome, address: { '@type': 'PostalAddress', streetAddress: IGREJA.rua, addressLocality: `${IGREJA.bairro}, ${IGREJA.cidade}`, addressRegion: IGREJA.uf, postalCode: IGREJA.cep, addressCountry: 'BR' } },
      }} />
      <Schema dados={{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: PERGUNTAS.map(p => ({ '@type': 'Question', name: p.q, acceptedAnswer: { '@type': 'Answer', text: p.r } })) }} />

      {/* o herói: um domingo inteiro, nos quatro momentos da copy, foto a foto */}
      <Scrub
        rotulo="Cultos"
        fotos={DOMINGO}
        faixas={MOMENTOS.map((m, i) => ({
          rotulo: `${m.n} · ${m.t}`, texto: m.d,
          a: [0.0, 0.22, 0.42, 0.6][i], b: [0.19, 0.39, 0.57, 0.73][i], sobe: i % 2 === 1, baixo: true,
        }))}
        pouso={{ titulo: 'Um domingo para pertencer', it: 'para pertencer', sub: 'Louvor, Palavra e uma comunidade que recebe você pelo nome. Se é a sua primeira vez, a gente te espera na porta.', a: 0.77 }}
        chapeu={<Chapeu forte="Cultos" resto={`${IGREJA.cultoDia}, ${IGREJA.cultoHora}`} />}
        micro={<p className="s-micro">Próximo culto: <ProximoCulto /><Sep />{IGREJA.rua}</p>}
      >
        <Pil href="/como-chegar">Como chegar</Pil>
        <Pil href="#ao-vivo" tom="vidro">Assistir ao vivo</Pil>
      </Scrub>

      {/* é a sua primeira vez? */}
      <section id="primeira-vez" className="s-faixa noite s-grao justa" aria-labelledby="t-primeira">
        <div className="s-in">
          <div className="s-claro s-rev">
            <Sede />
            <h2 id="t-primeira" className="s-h2 menor">{'É a sua primeira vez?'}</h2>
            {/* "Chega... e fala": a copy dizia "fale", e a frase misturava
                os dois tratamentos (o "chega" é o mesmo do resto do site) */}
            <p className="s-lead"><UmaLinha texto="Chega uns minutos mais cedo e fala na porta. Alguém te acompanha, te mostra a casa e te apresenta quem precisar. Você não vai precisar achar nada sozinho." semFim /></p>
            {/* 19/10/2026: a ação vem antes das perguntas. O "Vou visitar" da
                home cai aqui, e no celular as perguntas empurravam o botão
                para fora da tela de quem acabou de chegar */}
            <div className="s-acoes centro">
              <Pil href={conversa.href} fora tom="contorno" medir="avisou_que_vai">Avisar que vou</Pil>
            </div>
            {/* no celular: as perguntas de "Antes de sair de casa" aqui dentro */}
            <div className="s-abre so-celular">
              {PERGUNTAS.map(p => (
                <details key={p.q}><summary>{liga(p.q)}</summary><div><p>{fim(ligaTexto(p.r))}</p></div></details>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* perguntas (no celular, dentro do "É a sua primeira vez?") */}
      <section className="s-faixa areia s-grao so-largo" aria-labelledby="t-faq">
        <Simbolo className="s-canto" />
        <div className="s-in">
          <h2 id="t-faq" className="s-faq-t s-rev">{liga("Antes de sair de casa")}</h2>
          <div className="s-rev d1"><Perguntas itens={PERGUNTAS} /></div>
        </div>
      </section>

      {/* ao vivo (o /tv e o /guia-church-tv antigos caem aqui) */}
      <section id="ao-vivo" className="s-fecho s-rev" aria-labelledby="t-vivo">
        <Fundo video="mensagem" />
        <div className="s-in">
          <Chapeu forte="Ao vivo" resto={`${IGREJA.cultoDia}, ${IGREJA.cultoHora}`} />
          <Vozes id="t-vivo" className="s-h2 media" it="domingo">A mensagem de domingo</Vozes>
          <p className="s-lead"><UmaLinha semFim texto={IGREJA.youtube ? `Ao vivo todo ${IGREJA.cultoDia.toLowerCase()}, às ${IGREJA.cultoHora}, e pra ver de novo quando quiser.` : `Toda semana, em ${IGREJA.instagramArroba}. Pra quem está longe, viajando ou ainda conhecendo a igreja.`} /></p>
          <div className="s-acoes centro">
            {IGREJA.youtube
              ? <Pil href={IGREJA.youtube} fora>Assistir no canal <Seta /></Pil>
              : <Pil href={IGREJA.instagram} fora>Acompanhar no Instagram <Seta /></Pil>}
          </div>
        </div>
      </section>

      {/* escolha o seu próximo passo */}
      <section className="s-faixa papel" aria-labelledby="t-fim">
        <div className="s-in">
          <Sede className="topo" />
          <div className="s-cab centro s-rev">
            <Vozes id="t-fim" className="s-h2" it="próximo passo">Escolha o seu próximo passo</Vozes>
          </div>
          <div className="s-cartoes duas lista indice simples s-rev d1" role="group" aria-label="O seu próximo passo">
            {PASSO.map(p => (
              <Link key={p.t} href={p.href} className="s-cartao">
                <span className="s-cartao-t medio">{liga(p.t)}</span>
                <span className="s-cartao-d">{fim(ligaTexto(p.d))}</span>
                <span className="s-cartao-ir">{p.ir} <Seta /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
