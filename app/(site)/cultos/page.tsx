import type { Metadata } from 'next';
import { Simbolo } from '@/components/Marca';
import { IGREJA, SITE_IGREJA as SITE, MAPA, MAPA_EMBED, ROTA_WAZE, canalDeConversa } from '@/lib/igreja';
import { MODOS } from '@/lib/chegar';
import { Vozes, Sede, Arroba, Chapeu, Pil, Seta, fim, Sep, Perguntas, liga, ligaTexto } from '@/components/site/Blocos';
import { Fundo, Quadro } from '@/components/site/Midia';
import { Domingo } from '@/components/site/Domingo';
import { Trilho } from '@/components/site/Trilho';
import { Schema } from '@/components/site/Schema';
import ProximoCulto from '@/components/site/ProximoCulto';

/* =============================================================================
   /cultos — A PÁGINA QUE TIRA ALGUÉM DE CASA · 11/10/2026

   Responde quando, onde e o que esperar, numa página só, na forma da
   apresentação: herói · como é um domingo (o roteiro, com as horas) · é a
   sua primeira vez (o cartão claro) · como chegar (os três modos e o mapa)
   · ao vivo · o Follow · perguntas · vem domingo.

   13/10/2026: herói, domingo (em capítulos), mensagem e Follow em vídeo.
   ============================================================================= */

export const metadata: Metadata = {
  title: 'Cultos',
  description: `Um domingo para pertencer: culto aos ${IGREJA.cultoDia.toLowerCase()}s, às ${IGREJA.cultoHora}, na ${IGREJA.rua}, ${IGREJA.bairro}. Como é, como chegar e o que esperar na primeira vez.`,
  alternates: { canonical: '/cultos' },
  openGraph: { title: 'Um domingo para pertencer · GUIA Church', description: `${IGREJA.cultoDia}, ${IGREJA.cultoHora}, ${IGREJA.bairro}.`, url: `${SITE}/cultos`, images: [{ url: '/og-cultos.jpg', width: 1200, height: 630 }] },
};

const ROTEIRO = [
  { h: '09h45', t: 'Chegada', d: 'A equipe recebe você na porta, orienta o estacionamento e mostra onde fica tudo. Se é a primeira vez, diga: a gente te acompanha.' },
  { h: '10h00', t: 'Louvor', d: 'A banda conduz a igreja a adorar. Pode cantar, pode só ouvir. Ninguém olha pra você.' },
  { h: '10h30', t: 'Palavra', d: 'Uma mensagem da Bíblia pra vida real, de quarenta minutos. Dá pra anotar no celular.' },
  { h: '11h20', t: 'Oração e saída', d: 'Oramos uns pelos outros. Depois tem café, conversa e a livraria na saída.' },
];

const PRIMEIRA = [
  { q: 'Ao chegar', r: 'A equipe Connect recebe você, apresenta os espaços e responde o que precisar. É só dizer que é a primeira vez.' },
  { q: 'Durante o culto', r: 'Louvor, uma mensagem baseada na Bíblia e uma comunidade que valoriza relacionamento, generosidade e serviço.' },
  { q: 'Com crianças', r: 'A GUIA Kids recebe do berçário aos 12 anos, com segurança, cuidado e linguagem pra cada idade. Você assiste ao culto tranquilo.' },
];

const PERGUNTAS = [
  { q: 'Quanto tempo dura?', r: 'Cerca de uma hora e meia. Começa às 10h e, lá pelas 11h30, estamos no café.' },
  { q: 'Como me visto?', r: 'Como você está confortável. Não existe roupa certa pra encontrar com Deus.' },
  { q: 'Tem estacionamento?', r: 'Tem. A equipe orienta onde parar; chegue com dez minutos de antecedência.' },
  { q: 'Preciso dar alguma coisa?', r: 'Não. A oferta é de quem já é de casa e quer. Visitante vem pra receber.' },
  { q: 'Vou ter que falar na frente?', r: 'Nunca. Ninguém vai te pôr em pé nem pedir pra se apresentar.' },
  { q: 'E se eu quiser conversar com alguém?', r: 'Procura qualquer pessoa de camisa GUIA na saída, ou chama a gente no WhatsApp antes de vir.' },
];

export default function Cultos() {
  const conversa = canalDeConversa('Oi! Vou pela primeira vez no culto da GUIA e queria uma orientação. ');
  const followHora = IGREJA.followHora;
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
      <Schema dados={{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [...PRIMEIRA, ...PERGUNTAS].map(p => ({ '@type': 'Question', name: p.q, acceptedAnswer: { '@type': 'Answer', text: p.r } })) }} />

      {/* herói */}
      <section className="s-heroi" aria-labelledby="t-cultos">
        <Fundo video="cultos" prioridade />
        <div className="s-in s-heroi-in">
          <Chapeu forte="Cultos" resto={`${IGREJA.cultoDia}, ${IGREJA.cultoHora}`} />
          <Vozes as="h1" id="t-cultos" className="s-h1" it="para pertencer">Um domingo para pertencer</Vozes>
          <p className="s-lead grande">{ligaTexto("Louvor, Palavra e uma comunidade que recebe você pelo nome.")}<span className="s-resto"> {ligaTexto("Se é a sua primeira vez, a gente te espera na porta.")}</span></p>
          <div className="s-acoes">
            <Pil href="#como-chegar">Como chegar</Pil>
            <Pil href="#ao-vivo">Assistir ao vivo</Pil>
          </div>
          <p className="s-micro">Próximo culto: <ProximoCulto /><Sep />{IGREJA.rua}</p>
        </div>
      </section>

      {/* o roteiro do domingo */}
      <section className="s-faixa areia" aria-labelledby="t-roteiro">
        <div className="s-in">
          <div className="s-passos-cab s-rev">
            <h2 id="t-roteiro" className="s-serifa">{liga("Como é um domingo?")}</h2>
            <p className="s-serifa it">{liga("da porta ao café, em 4 momentos:")}</p>
          </div>
          {/* o mesmo vídeo em capítulos da home, aqui com o horário de cada momento */}
          <div className="s-rev d1"><Domingo itens={ROTEIRO.map(p => ({ n: p.h, t: p.t, d: p.d }))} rotulo="O roteiro do domingo" /></div>
          <Sede className="base" />
        </div>
      </section>

      {/* é a sua primeira vez? */}
      <section id="primeira-vez" className="s-faixa noite s-grao justa" aria-labelledby="t-primeira">
        <div className="s-in">
          <div className="s-claro s-rev">
            <Sede />
            <h2 id="t-primeira" className="s-h2 menor">{'É a sua primeira\u00a0vez?'}</h2>
            <p className="s-lead">{ligaTexto("Você será recebido por uma equipe preparada pra ajudar em cada etapa. Ninguém fica perdido na GUIA.")}</p>
            <div className="s-qa">
              {PRIMEIRA.map(p => <div key={p.q}><b>{p.q}</b><p>{ligaTexto(p.r)}</p></div>)}
            </div>
            <div className="s-acoes centro">
              <Pil href="#como-chegar" tom="preta">Como chegar</Pil>
              <Pil href={conversa.href} fora tom="contorno">Avisar que vou</Pil>
            </div>
          </div>
        </div>
      </section>

      {/* como chegar */}
      <section id="como-chegar" className="s-faixa papel" aria-labelledby="t-chegar">
        <div className="s-in">
          <Arroba className="topo" />
          <div className="s-cab centro s-rev">
            <Vozes id="t-chegar" className="s-h2" it="gente">Como chegar até a gente</Vozes>
            <p className="s-lead"><span style={{ whiteSpace: 'nowrap' }}>{IGREJA.rua}</span>, {IGREJA.bairro}, <span style={{ whiteSpace: 'nowrap' }}>{IGREJA.cidade}.</span></p>
            <div className="s-acoes centro">
              <Pil href={MAPA} fora tom="preta">Traçar rota no Maps</Pil>
              <Pil href={ROTA_WAZE} fora tom="contorno">Abrir no Waze</Pil>
            </div>
          </div>
          <div className="s-rev d1">
            <Trilho className="s-cartoes tres" rotulo="Os modos de chegar">
              {MODOS.map(m => (
                <div key={m.n} className="s-cartao">
                  <span className="s-cartao-n">{m.n}</span>
                  <span className="s-cartao-t" style={{ fontSize: 'clamp(26px,2.4vw,34px)' }}>{liga(m.t)}</span>
                  <span className="s-cartao-d">{fim(ligaTexto(m.d))}{m.endereco && <><br /><b style={{ fontWeight: 600, color: '#fff' }}>{m.endereco}</b></>}{m.d2 && <><br />{fim(ligaTexto(m.d2))}</>}</span>
                </div>
              ))}
            </Trilho>
          </div>
          <div className="s-mapa s-rev" style={{ marginTop: 'clamp(16px,2vw,24px)' }}>
            <iframe src={MAPA_EMBED} title={`Mapa: ${IGREJA.nome}, ${IGREJA.rua}, ${IGREJA.bairro}`} loading="lazy" allowFullScreen={false} referrerPolicy="no-referrer-when-downgrade" />
            <div className="s-mapa-cartao">
              <span className="s-selo">{IGREJA.cultoDia}, {IGREJA.cultoHora}</span>
              <b className="s-h3">{IGREJA.rua}</b>
              <span className="s-micro">{fim(`${IGREJA.bairro}, ${IGREJA.cidade} · ${IGREJA.cep}`)}</span>
              <div className="s-acoes">
                <Pil href={MAPA} fora>Maps</Pil>
                <Pil href={ROTA_WAZE} fora>Waze</Pil>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ao vivo */}
      <section id="ao-vivo" className="s-fecho s-rev" aria-labelledby="t-vivo">
        <Fundo video="mensagem" />
        <div className="s-in">
          <Chapeu forte="Ao vivo" resto={`${IGREJA.cultoDia}, ${IGREJA.cultoHora}`} />
          <Vozes id="t-vivo" className="s-h2 media" it="domingo">A mensagem de domingo</Vozes>
          <p className="s-lead">{IGREJA.youtube ? `Ao vivo todo ${IGREJA.cultoDia.toLowerCase()}, às ${IGREJA.cultoHora}, e pra ver de novo quando quiser.` : `Toda semana, em ${IGREJA.instagramArroba}. Pra quem está longe, viajando ou ainda conhecendo a igreja.`}</p>
          <div className="s-acoes centro">
            {IGREJA.youtube
              ? <Pil href={IGREJA.youtube} fora>Assistir no canal <Seta /></Pil>
              : <Pil href={IGREJA.instagram} fora>Acompanhar no Instagram <Seta /></Pil>}
          </div>
        </div>
      </section>

      {/* o Follow */}
      <section id="follow" className="s-faixa papel" aria-labelledby="t-follow">
        <div className="s-in">
          <div className="s-duas inv">
            <Quadro video="follow" className="s-rev" />
            <div className="s-rev d1">
              <Chapeu forte="Follow" resto={followHora ? `Sábado, ${followHora}` : 'Sábado'} />
              <Vozes className="s-h2 media" it="jovens" >O culto de jovens</Vozes>
              <p className="s-lead">{ligaTexto("Todo sábado à noite, a geração que está chegando adora, ouve e se encontra. Mesma casa, mesma fé, outra energia.")}</p>
              <div className="s-acoes" style={{ marginTop: 26 }}>
                <Pil href="/eventos#follow" tom="preta">Sobre o Follow</Pil>
                <Pil href="/followcamp" duro tom="contorno">Follow Camp 2027</Pil>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* perguntas */}
      <section className="s-faixa areia s-grao" aria-labelledby="t-faq">
        <Simbolo className="s-canto" />
        <div className="s-in">
          <h2 id="t-faq" className="s-faq-t s-rev">{liga("Antes de sair de casa")}</h2>
          <div className="s-rev d1"><Perguntas itens={PERGUNTAS} /></div>
        </div>
      </section>

      {/* vem domingo */}
      <section className="s-faixa noite s-grao" aria-labelledby="t-fim">
        <div className="s-in s-centro">
          <Sede className="topo" />
          <div className="s-rev">
            <Vozes id="t-fim" className="s-h2" it="domingo">Vem domingo</Vozes>
            <p className="s-lead grande" style={{ margin: '22px auto 0' }}>{ligaTexto(`${IGREJA.cultoDia}, ${IGREJA.cultoHora}. Chega a hora que der. Tem alguém na porta esperando você.`)}</p>
          </div>
          <div className="s-acoes centro s-rev d1" style={{ marginTop: 'clamp(28px,4vw,52px)' }}>
            <Pil href="#como-chegar">Como chegar</Pil>
            <Pil href="/pequena-guia">Conhecer uma Pequena Guia</Pil>
          </div>
        </div>
      </section>
    </>
  );
}
