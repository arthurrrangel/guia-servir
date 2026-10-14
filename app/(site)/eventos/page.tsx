import type { Metadata } from 'next';
import Link from 'next/link';
import { IGREJA, SITE_IGREJA as SITE } from '@/lib/igreja';
import { PEQUENAS_GUIAS } from '@/lib/pequenas-guias';
import { Vozes, Sede, Arroba, Chapeu, Pil, Seta, Fecho, UmaLinha, liga, ligaTexto } from '@/components/site/Blocos';
import { Fundo, Quadro } from '@/components/site/Midia';
import { Schema } from '@/components/site/Schema';
import ProximoCulto from '@/components/site/ProximoCulto';

/* =============================================================================
   /eventos — A AGENDA · 11/10/2026

   O grupo "Eventos" da barra (tela 1 da apresentação) precisava de uma
   página: o que acontece na semana (Celebração, Follow, Pequenas Guias) e
   o que acontece no ano (Follow Camp 2027). Datas que mudam vivem em
   lib/igreja.ts e lib/pequenas-guias.ts; esta página só as mostra.
   14/10/2026, no celular: a agenda em lista (o dia e a hora na linha do
   nome, uma frase embaixo) e uma frase sob cada título.
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
    { href: '/cultos', t: 'Celebração', n: `${IGREJA.cultoDia}, ${IGREJA.cultoHora}`, d: 'O culto de domingo: louvor, Palavra, oração e café. A porta de entrada da igreja.' },
    { href: '#follow', t: 'Follow', n: IGREJA.followHora ? `Sábado, ${IGREJA.followHora}` : 'Sábado', d: 'O culto de jovens. Mesma casa, mesma fé, outra energia.' },
    { href: '/pequena-guia', t: 'Pequenas Guias', n: 'Terça a quinta', d: `${presenciais} grupos pela cidade, numa casa perto da sua. O lugar da semana.` },
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
        <Fundo video="eventos" prioridade />
        <div className="s-in s-heroi-in">
          <Chapeu forte="Eventos" resto={IGREJA.nome} />
          <Vozes as="h1" id="t-ev" className="s-h1" it="na semana">O que acontece na semana</Vozes>
          <p className="s-lead grande">{ligaTexto("Domingo é o centro. Mas a vida da igreja não cabe num dia só.")}</p>
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
            <p className="s-lead">{ligaTexto("Três encontros fixos. Nenhum precisa de inscrição.")}</p>
          </div>
          <div className="s-rev d1">
            <div className="s-cartoes tres agenda lista" role="group" aria-label="A agenda da semana">
              {/* sem foto (13/10/2026): o dia e a hora são o assunto da agenda */}
              {AGENDA.map(a => {
                const miolo = <><span className="s-cartao-t">{liga(a.t)}</span><span className="s-cartao-n">{a.n}</span><span className="s-cartao-d"><UmaLinha texto={a.d} semFim /></span><span className="s-cartao-ir">Saber mais <Seta /></span></>;
                return a.href.startsWith('#')
                  ? <a key={a.t} href={a.href} className="s-cartao">{miolo}</a>
                  : <Link key={a.t} href={a.href} className="s-cartao">{miolo}</Link>;
              })}
            </div>
          </div>
        </div>
      </section>

      <section id="follow" className="s-faixa noite s-grao" aria-labelledby="t-follow">
        <div className="s-in">
          <Arroba className="topo" />
          <div className="s-duas inv">
            <Quadro video="follow" className="s-rev" />
            <div className="s-rev d1">
              <Chapeu forte="Follow" resto={IGREJA.followHora ? `Sábado, ${IGREJA.followHora}` : 'Sábado'} />
              <Vozes className="s-h2 media" it="jovens">O culto de jovens</Vozes>
              <p className="s-lead"><UmaLinha semFim texto="Todo sábado à noite, a geração que está chegando adora, ouve a Palavra e se encontra. Não precisa ser de igreja. Não precisa conhecer ninguém. Vem como está." /></p>
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
          {/* sem a foto antiga (não veio material do acampamento): o texto no centro */}
          <div className="s-so-texto s-rev">
            <Chapeu forte="Follow Camp 2027" resto="05 a 10 de fevereiro" />
            <Vozes className="s-h2 media" it="juntos">Seis dias fora da rotina, juntos</Vozes>
            <p className="s-lead"><UmaLinha semFim texto="O acampamento do Follow. Inscrição, pagamento e as regras estão na página do retiro." /></p>
            <div className="s-acoes">
              <Pil href="/followcamp" duro tom="preta">Ir para a página do Camp</Pil>
            </div>
          </div>
        </div>
      </section>

      <Fecho titulo="Vem como você está" it="está" lead="Domingo, sábado ou na semana: tem um lugar pra você em cada um.">
        <Pil href="/cultos">Ver os cultos</Pil>
        <Pil href="/pequena-guia">Encontrar uma Pequena Guia</Pil>
      </Fecho>
    </>
  );
}
