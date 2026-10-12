import type { Metadata } from 'next';
import Link from 'next/link';
import { IGREJA, SITE_IGREJA as SITE } from '@/lib/igreja';
import { PEQUENAS_GUIAS } from '@/lib/pequenas-guias';
import { Vozes, Sede, Arroba, Chapeu, Pil, Img, Seta } from '@/components/site/Blocos';
import { Schema } from '@/components/site/Schema';
import ProximoCulto from '@/components/site/ProximoCulto';

/* =============================================================================
   /eventos — A AGENDA · 11/10/2026

   O grupo "Eventos" da barra (tela 1 da apresentação) precisava de uma
   página: o que acontece na semana (Celebração, Follow, Pequenas Guias) e
   o que acontece no ano (Follow Camp 2027). Datas que mudam vivem em
   lib/igreja.ts e lib/pequenas-guias.ts; esta página só as mostra.
   ============================================================================= */

export const metadata: Metadata = {
  title: 'Eventos',
  description: `O que acontece na GUIA Church: Celebração aos ${IGREJA.cultoDia.toLowerCase()}s às ${IGREJA.cultoHora}, Follow aos sábados${IGREJA.followHora ? ` às ${IGREJA.followHora}` : ''}, Pequenas Guias durante a semana e o Follow Camp 2027.`,
  alternates: { canonical: '/eventos' },
  openGraph: { title: 'Eventos · GUIA Church', url: `${SITE}/eventos`, images: [{ url: '/og-cultos.jpg', width: 1200, height: 630 }] },
};

export default function Eventos() {
  const presenciais = PEQUENAS_GUIAS.filter(p => !p.online).length;
  const AGENDA = [
    { href: '/cultos', lugar: 'cultos-heroi', t: 'Celebração', n: `${IGREJA.cultoDia}, ${IGREJA.cultoHora}`, d: 'O culto de domingo: louvor, Palavra, oração e café. A porta de entrada da igreja.' },
    { href: '#follow', lugar: 'evento-follow', t: 'Follow', n: IGREJA.followHora ? `Sábado, ${IGREJA.followHora}` : 'Sábado', d: 'O culto de jovens. Mesma casa, mesma fé, outra energia.' },
    { href: '/pequena-guia', lugar: 'pg-heroi', t: 'Pequenas Guias', n: 'Terça a quinta', d: `${presenciais} grupos pela cidade, numa casa perto da sua. O lugar da semana.` },
  ] as const;
  return (
    <>
      <Schema dados={{
        '@context': 'https://schema.org', '@type': 'ItemList', name: 'Agenda da GUIA Church',
        itemListElement: [
          { '@type': 'Event', name: 'Celebração', eventSchedule: { '@type': 'Schedule', byDay: 'https://schema.org/Sunday', startTime: '10:00', scheduleTimezone: 'America/Sao_Paulo' }, location: { '@type': 'Place', name: IGREJA.nome, address: IGREJA.rua } },
          { '@type': 'Event', name: 'Follow', eventSchedule: { '@type': 'Schedule', byDay: 'https://schema.org/Saturday', startTime: '19:00', scheduleTimezone: 'America/Sao_Paulo' }, location: { '@type': 'Place', name: IGREJA.nome, address: IGREJA.rua } },
          { '@type': 'Event', name: 'Follow Camp 2027', startDate: '2027-02-05', endDate: '2027-02-10', url: `${SITE}/followcamp` },
        ],
      }} />

      <section className="s-heroi" aria-labelledby="t-ev">
        <Img lugar="eventos-heroi" prioridade retrato />
        <div className="s-in s-heroi-in">
          <Chapeu forte="Eventos" resto={IGREJA.nome} />
          <Vozes as="h1" id="t-ev" className="s-h1" it="semana">O que acontece na semana</Vozes>
          <p className="s-lead grande">Domingo é o centro. Mas a vida da igreja não cabe num dia só.</p>
          <div className="s-acoes">
            <Pil href="/cultos">Ver os cultos</Pil>
            <Pil href="/followcamp" duro>Follow Camp 2027</Pil>
          </div>
          <p className="s-micro">Próximo culto: <ProximoCulto /></p>
        </div>
      </section>

      <section className="s-faixa papel" aria-labelledby="t-agenda">
        <div className="s-in">
          <Sede className="topo" />
          <div className="s-cab centro s-rev">
            <Vozes id="t-agenda" className="s-h2" it="semana">A agenda da semana</Vozes>
            <p className="s-lead">Três encontros fixos. Nenhum precisa de inscrição.</p>
          </div>
          <div className="s-cartoes tres s-rev d1">
            {AGENDA.map(a => (
              a.href.startsWith('#')
                ? <a key={a.t} href={a.href} className="s-cartao foto"><Img lugar={a.lugar} sizes="(max-width: 759px) 100vw, 33vw" /><span className="s-cartao-corpo"><span className="s-cartao-t">{a.t}</span><span className="s-cartao-n">{a.n}</span><span className="s-cartao-d">{a.d}</span><span className="s-cartao-ir">Saber mais <Seta /></span></span></a>
                : <Link key={a.t} href={a.href} className="s-cartao foto"><Img lugar={a.lugar} sizes="(max-width: 759px) 100vw, 33vw" /><span className="s-cartao-corpo"><span className="s-cartao-t">{a.t}</span><span className="s-cartao-n">{a.n}</span><span className="s-cartao-d">{a.d}</span><span className="s-cartao-ir">Saber mais <Seta /></span></span></Link>
            ))}
          </div>
        </div>
      </section>

      <section id="follow" className="s-faixa noite s-grao" aria-labelledby="t-follow">
        <div className="s-in">
          <Arroba className="topo" />
          <div className="s-duas inv">
            <div className="s-foto h s-rev"><Img lugar="evento-follow" sizes="(max-width: 999px) 90vw, 40vw" /></div>
            <div className="s-rev d1">
              <Chapeu forte="Follow" resto={IGREJA.followHora ? `Sábado, ${IGREJA.followHora}` : 'Sábado'} />
              <Vozes className="s-h2 media" it="jovens">O culto de jovens</Vozes>
              <p className="s-lead">Todo sábado à noite, a geração que está chegando adora, ouve a Palavra e se encontra. Não precisa ser de igreja. Não precisa conhecer ninguém. Vem como está.</p>
              <div className="s-acoes" style={{ marginTop: 26 }}>
                <Pil href="/cultos#como-chegar">Como chegar</Pil>
                <Pil href={IGREJA.instagram} fora>{IGREJA.instagramArroba}</Pil>
              </div>
            </div>
          </div>
          <Sede className="base" />
        </div>
      </section>

      <section id="camp" className="s-faixa areia" aria-labelledby="t-camp">
        <div className="s-in">
          <div className="s-duas">
            <div className="s-rev">
              <Chapeu forte="Follow Camp 2027" resto="05 a 10 de fevereiro" />
              <Vozes className="s-h2 media" it="juntos">Seis dias fora da rotina, juntos</Vozes>
              <p className="s-lead">O acampamento do Follow. Inscrição, pagamento e as regras estão na página do retiro.</p>
              <div className="s-acoes" style={{ marginTop: 26 }}>
                <Pil href="/followcamp" duro tom="preta">Ir para a página do Camp</Pil>
              </div>
            </div>
            <div className="s-foto h s-rev d1"><Img lugar="evento-camp" sizes="(max-width: 999px) 90vw, 40vw" /></div>
          </div>
        </div>
      </section>

      <section className="s-fecho s-rev" aria-labelledby="t-fim">
        <Img lugar="fecho" retrato />
        <div className="s-in">
          <Vozes id="t-fim" className="s-h2 media" it="está">Vem como você está</Vozes>
          <p className="s-lead">Domingo, sábado ou na semana: tem um lugar pra você em cada um.</p>
          <div className="s-acoes centro">
            <Pil href="/cultos">Ver os cultos</Pil>
            <Pil href="/pequena-guia">Encontrar uma Pequena Guia</Pil>
          </div>
        </div>
      </section>
    </>
  );
}
