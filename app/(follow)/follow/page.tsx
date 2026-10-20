import { IGREJA, MAPA, SITE_FOLLOW, SITE_IGREJA, canalDeConversa } from '@/lib/igreja';
import { naIgreja } from '@/lib/site/sites';
import { PIXEL } from '@/lib/site/medir-cliente';
import { Schema } from '@/components/site/Schema';
import RevisarCookies from '@/components/site/RevisarCookies';
import HeroFotos, { type Foto } from '@/components/follow/HeroFotos';
import Contagem from '@/components/follow/Contagem';

/* =============================================================================
   GUIA FOLLOW · guiafollow.com · 19 e 20/10/2026

   A página do culto de jovens, construída com a skill site-de-10k do Arthur
   e o pacote de design do projeto (claude/follow-site-10k-pacote-de-design):
   a premissa é casa (quem chega é recebido como família, com Jesus no
   centro), a página é uma chegada, e pousa na frase dele, "Um lugar para
   todos". Cada linha de texto aqui veio do pacote ao pé da letra.

   O HERO (components/follow/HeroFotos.tsx) anda com o scroll sobre cinco
   fotos de verdade do Follow (scripts/follow-fotos.py: Drive da igreja,
   07.02 e 28.02 de 2026, tratamento do fotógrafo). Nada gerado por IA: o
   Arthur reprovou o vídeo gerado em 20/10 e pediu os materiais reais. Duas
   faixas de legenda, uma foto em silêncio (os braços abertos) e o pouso
   com a única chamada da página: avisar que vai, pelo WhatsApp da igreja
   (medido como avisou_que_vai). Abaixo, só o que quem nunca foi precisa:
   as quatro perguntas, quando e onde (com a contagem até o próximo
   sábado), o Follow Camp e o fecho. Sem formulário.

   O FOLLOW CAMP continua em guiachurch.com/followcamp (o pagamento usa
   sessionStorage do domínio); daqui é um link inteiro.
   ============================================================================= */

const CONVERSA = canalDeConversa('Oi! Quero ir no Follow no sábado.');
const CAMP = `${SITE_IGREJA}/followcamp`;

/* as cinco fotos, na ordem do scroll: cada uma entra com fusão entre a e b */
const FOTOS: Foto[] = [
  { l: '/follow/f1-l.webp', p: '/follow/f1-p.webp', a: 0, b: 0, alt: 'Jovens conversando nos sofás antes do Follow' },
  { l: '/follow/f2-l.webp', p: '/follow/f2-p.webp', a: 0.18, b: 0.26, alt: 'Três jovens rindo na entrada do Follow' },
  { l: '/follow/f3-l.webp', p: '/follow/f3-p.webp', a: 0.36, b: 0.44, alt: 'Jovens em adoração, de mãos levantadas' },
  { l: '/follow/f4-l.webp', p: '/follow/f4-p.webp', a: 0.60, b: 0.68, alt: 'Ministro de louvor de braços abertos diante do telão' },
  { l: '/follow/f5-l.webp', p: '/follow/f5-p.webp', a: 0.74, b: 0.82, alt: 'A sala do Follow cheia, todo mundo de pé' },
];

/* o chevron da marca, que se traça quando a seção chega (components/follow/Vida.tsx) */
function Chev() {
  return (
    <svg className="f-chev" viewBox="0 0 64 32" aria-hidden="true">
      <path pathLength={100} d="M6 4l16 12L6 28" />
      <path pathLength={100} d="M34 4l16 12-16 12" />
    </svg>
  );
}

function AvisarQueVou({ className = '' }: { className?: string }) {
  return <a href={CONVERSA.href} target="_blank" rel="noreferrer" className={`f-btn ${className}`.trim()} data-medir="avisou_que_vai">Avisar que vou</a>;
}

export default function Follow() {
  return (
    <>
      <Schema dados={{
        '@context': 'https://schema.org', '@type': 'Event', name: 'Follow',
        description: 'O culto de jovens da GUIA Church. Todo sábado, 19h, na Barra da Tijuca.',
        url: SITE_FOLLOW, eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', isAccessibleForFree: true,
        eventSchedule: { '@type': 'Schedule', byDay: 'https://schema.org/Saturday', startTime: '19:00', scheduleTimezone: 'America/Sao_Paulo' },
        location: { '@type': 'Place', name: IGREJA.nome, address: { '@type': 'PostalAddress', streetAddress: IGREJA.rua, addressLocality: IGREJA.cidade, addressRegion: IGREJA.uf, postalCode: IGREJA.cep, addressCountry: 'BR' } },
        organizer: { '@type': 'Organization', name: IGREJA.nome, url: SITE_IGREJA },
      }} />

      <header className="f-topo">
        <a href="#conteudo" className="f-marca" aria-label="Follow">FO<b aria-hidden="true">{'>>'}</b>OW</a>
        <span className="f-quando-topo">Sábado · {IGREJA.followHora}</span>
        <AvisarQueVou />
      </header>

      <HeroFotos
        fotos={FOTOS}
        faixas={[
          { texto: 'Vem como você está.', a: 0, b: 0.26 },
          { texto: 'Jesus no centro. Uma família em volta.', a: 0.38, b: 0.62, sobe: true },
        ]}
        pouso={{ titulo: 'Um lugar para todos.', sub: `Follow. Todo sábado, ${IGREJA.followHora}, na ${IGREJA.nome}, ${IGREJA.bairro}.`, a: 0.76 }}
      >
        <AvisarQueVou />
        <a href={MAPA} target="_blank" rel="noreferrer" className="f-btn linha">Como chegar</a>
      </HeroFotos>

      <section className="f-secao" id="primeira-vez" aria-labelledby="t-pv">
        <div className="f-in">
          <Chev />
          <p className="f-chapeu f-rev"><b>Primeira vez?</b></p>
          <h2 id="t-pv" className="f-h2 f-rev" style={{ '--d': '.06s' } as React.CSSProperties}>Não precisa ser de igreja. <i>Não precisa conhecer ninguém.</i></h2>
          <dl className="f-perguntas">
            <div className="f-pergunta f-rev"><dt>Não sou de igreja.</dt><dd>Vem assim mesmo. <strong>O Follow é pra quem está chegando.</strong></dd></div>
            <div className="f-pergunta f-rev" style={{ '--d': '.08s' } as React.CSSProperties}><dt>Vou sozinho.</dt><dd>Avisa que vai e <strong>a gente te espera na porta.</strong></dd></div>
            <div className="f-pergunta f-rev" style={{ '--d': '.16s' } as React.CSSProperties}><dt>O que eu visto?</dt><dd>O que você já estava usando.</dd></div>
            <div className="f-pergunta f-rev" style={{ '--d': '.24s' } as React.CSSProperties}><dt>Quanto tempo dura?</dt><dd>Mais ou menos uma hora e meia.</dd></div>
          </dl>
        </div>
      </section>

      <section className="f-secao painel" id="quando" aria-labelledby="t-quando">
        <div className="f-in">
          <Chev />
          <div className="f-quando">
            <div>
              <p className="f-chapeu f-rev"><b>Quando e onde</b></p>
              <h2 id="t-quando" className="f-hora f-rev" style={{ '--d': '.06s' } as React.CSSProperties}>Sábado, {IGREJA.followHora}<small>Não precisa de inscrição</small></h2>
              <p className="f-endereco f-rev" style={{ '--d': '.12s' } as React.CSSProperties}><strong>{IGREJA.nome}</strong>{IGREJA.rua}<br />{IGREJA.bairro}, {IGREJA.cidade}</p>
              <div className="f-acoes f-rev" style={{ '--d': '.18s' } as React.CSSProperties}>
                <a href={MAPA} target="_blank" rel="noreferrer" className="f-btn linha">Abrir no mapa</a>
                <AvisarQueVou />
              </div>
            </div>
            <Contagem />
          </div>
        </div>
      </section>

      <section className="f-secao" id="camp" aria-labelledby="t-camp">
        <div className="f-in">
          <div className="f-camp f-rev">
            <div>
              <p className="f-chapeu"><b>Follow Camp 2027</b> 05 a 10 de fevereiro</p>
              <h2 id="t-camp">Seis dias fora da rotina, juntos.</h2>
              <p>O acampamento do Follow. Inscrição, pagamento e as regras estão na página do retiro.</p>
            </div>
            <a href={CAMP} className="f-btn linha">Ir para a página do Camp</a>
          </div>
        </div>
      </section>

      <section className="f-secao f-fecho" id="vem" aria-labelledby="t-vem">
        <div className="f-in">
          <Chev />
          <h2 id="t-vem" className="f-h2 f-rev">E se um culto pudesse mudar <i>toda a sua vida?</i></h2>
          <p className="f-lead f-rev" style={{ '--d': '.08s' } as React.CSSProperties}>Sábado tem Follow. A gente te espera.</p>
          <div className="f-acoes f-rev" style={{ '--d': '.16s' } as React.CSSProperties}>
            <AvisarQueVou />
            <a href={IGREJA.instagram} target="_blank" rel="noreferrer" className="f-btn linha">{IGREJA.instagramArroba}</a>
          </div>
        </div>
      </section>

      <footer className="f-pe">
        <div className="f-in">
          <p><strong>Follow · {IGREJA.nome}</strong>{IGREJA.rua}, {IGREJA.bairro}, {IGREJA.cidade}</p>
          <nav aria-label="Mais">
            <a href={naIgreja('/')}>GUIA Church</a>
            <a href={IGREJA.instagram} target="_blank" rel="noreferrer">Instagram</a>
            <a href={naIgreja('/privacidade')}>Privacidade</a>
            {PIXEL && <RevisarCookies />}
          </nav>
        </div>
      </footer>
    </>
  );
}
