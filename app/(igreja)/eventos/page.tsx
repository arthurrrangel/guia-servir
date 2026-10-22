import type { Metadata } from 'next';
import { og } from '@/lib/site/meta';
import { IGREJA, SITE_IGREJA as SITE } from '@/lib/igreja';
import { PEQUENAS_GUIAS } from '@/lib/pequenas-guias';
import { noFollow } from '@/lib/site/sites';
import { Vozes, Sede, Arroba, Chapeu, Pil, Seta, Heroi, Fecho, FaixaCamp, Ir, UmaLinha, ligaTexto } from '@/components/site/Blocos';
import { FC27 } from '@/lib/followcamp';
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
  openGraph: og('igreja', '/eventos', 'Eventos', undefined, '/og-eventos.jpg'),
};

export default function Eventos() {
  const presenciais = PEQUENAS_GUIAS.filter(p => !p.online).length;
  const AGENDA = [
    { href: '/cultos', t: 'Celebração', n: `${IGREJA.cultoDia}, ${IGREJA.cultoHora}`, d: 'O culto de domingo: louvor, Palavra, oração e café. A porta de entrada da igreja.' },
    /* 20/10/2026: o Follow tem site próprio; a linha leva até ele, não até a faixa logo abaixo */
    { href: noFollow('/'), t: 'Follow', n: IGREJA.followHora ? `Sábado, ${IGREJA.followHora}` : 'Sábado', d: 'O culto de jovens. Mesma casa, mesma fé, outra energia.' },
    { href: '/pequena-guia', t: 'Pequenas Guias', n: 'Terça a quinta', d: `${presenciais} grupos pela cidade, numa casa perto da sua. O lugar da semana.` },
  ] as const;
  return (
    <>
      <Schema dados={{
        '@context': 'https://schema.org', '@type': 'ItemList', name: 'Agenda da GUIA Church',
        itemListElement: [
          { '@type': 'Event', name: 'Celebração', eventSchedule: { '@type': 'Schedule', byDay: 'https://schema.org/Sunday', startTime: '10:00', scheduleTimezone: 'America/Sao_Paulo' }, location: { '@type': 'Place', name: IGREJA.nome, address: IGREJA.rua } },
          { '@type': 'Event', name: 'Follow', eventSchedule: { '@type': 'Schedule', byDay: 'https://schema.org/Saturday', startTime: '19:00', scheduleTimezone: 'America/Sao_Paulo' }, location: { '@type': 'Place', name: IGREJA.nome, address: IGREJA.rua } },
          { '@type': 'Event', name: FC27.nome, startDate: FC27.inicio, endDate: FC27.fim, url: `${SITE}/followcamp` },
        ],
      }} />

      <Heroi id="t-ev" lugar="eventos-heroi" chapeu={<Chapeu forte="Eventos" resto={IGREJA.nome} />} titulo="O que acontece na semana" it="na semana"
             lead={ligaTexto("Domingo é o centro. Mas a vida da igreja não cabe num dia só.")} micro={<>Próximo culto: <ProximoCulto /></>}>
        <Pil href="/cultos">Ver os cultos</Pil>
        <Pil href="/followcamp" duro tom="vidro">{FC27.nome}</Pil>
      </Heroi>

      <section className="s-faixa papel" aria-labelledby="t-agenda">
        <div className="s-in">
          <Sede className="topo" />
          <div className="s-cab centro s-rev">
            <Vozes id="t-agenda" className="s-h2" it="semana">A agenda da semana</Vozes>
            <p className="s-lead">{ligaTexto("Três encontros fixos. Nenhum precisa de inscrição.")}</p>
          </div>
          <div className="s-rev d1">
            <div className="s-cartoes tres lista indice" role="group" aria-label="A agenda da semana">
              {AGENDA.map(a => {
                /* o nome sem o liga(), como nas portas da home: "Pequenas Guias" pode
                   quebrar em duas linhas na coluna do nome (21/10/2026; colado, ele
                   alargava só a sua linha e as colunas da agenda saíam desalinhadas) */
                const miolo = <><span className="s-cartao-t">{a.t}</span><span className="s-cartao-n">{a.n}</span><span className="s-cartao-d"><UmaLinha texto={a.d} semFim /></span><span className="s-cartao-ir">Saber mais <Seta /></span></>;
                return <Ir key={a.t} href={a.href} className="s-cartao">{miolo}</Ir>;
              })}
            </div>
          </div>
        </div>
      </section>

      <section id="follow" className="s-faixa noite s-grao" aria-labelledby="t-follow">
        <div className="s-in">
          <Arroba className="topo" />
          <div className="s-duas inv">
            {/* 20/10/2026: a foto do Follow (a mesma do site dele, guiafollow.com) */}
            <div className="s-foto v s-rev"><img src="/follow/f3-p.webp" width={1080} height={1920} alt="Jovens em adoração no Follow, de mãos levantadas" loading="lazy" decoding="async" style={{ '--foco': '50% 40%' } as React.CSSProperties} /></div>
            <div className="s-rev d1">
              <Chapeu forte="Follow" resto={IGREJA.followHora ? `Sábado, ${IGREJA.followHora}` : 'Sábado'} />
              <Vozes id="t-follow" className="s-h2 media" it="jovens">O culto de jovens</Vozes>
              <p className="s-lead"><UmaLinha semFim texto="Todo sábado à noite, a geração que está chegando adora, ouve a Palavra e se encontra. Não precisa ser de igreja. Não precisa conhecer ninguém. Vem como está." /></p>
              {/* 20/10/2026: o Follow tem site próprio; o rótulo é o da porta da home */}
              <div className="s-acoes">
                <Pil href={noFollow('/')}>Vou no Follow</Pil>
                <Pil href={IGREJA.instagram} fora tom="vidro">{IGREJA.instagramArroba}</Pil>
              </div>
            </div>
          </div>
          <Sede className="base" />
        </div>
      </section>

      <FaixaCamp href="/followcamp" />

      <Fecho titulo="Vem como você está" it="está" lead="Domingo, sábado ou na semana: tem um lugar pra você em cada um.">
        <Pil href="/cultos">Ver os cultos</Pil>
        <Pil href="/pequena-guia" tom="vidro">Encontrar uma Pequena Guia</Pil>
      </Fecho>
    </>
  );
}
