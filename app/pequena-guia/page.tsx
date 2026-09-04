import type { Metadata } from 'next';
import Link from 'next/link';
import { Site } from '@/components/Site';
import { Tit, Schema } from '@/components/Texto';
import { IcSeta } from '@/components/Icones';
import { Vaga } from '@/components/Vaga';
import { FOTOS } from '@/lib/imagens';
import { IGREJA, SITE, canalDeConversa } from '@/lib/igreja';
import { PEQUENAS_GUIAS, mapaDaPequenaGuia, MAPA_REGIAO } from '@/lib/pequenas-guias';

/* =============================================================================
   /pequena-guia — O GRUPO DA SEMANA

   O nome é da casa; o H1 carrega as palavras que existem em busca (grupo,
   igreja, Barra da Tijuca) e a página abre pelo benefício. O formulário é
   uma conversa por link: nenhum dado de visitante entra num banco que está
   no ar servindo a escala de todo mundo.

   A foto de um encontro real ainda não existe (vaga reservada, com o
   briefing). Enquanto isso o herói usa a acolhida — gente perto de gente —
   que é a única foto do acervo que diz "grupo" e não "palco".
   ============================================================================= */

export const metadata: Metadata = {
  title: 'Pequena Guia',
  description:
    'As Pequenas Guias são os grupos da GUIA Church que se encontram durante a semana, perto de onde você mora. Sem inscrição, sem custo — é só dizer onde você está.',
  alternates: { canonical: '/pequena-guia' },
  openGraph: {
    title: 'Pequena Guia · GUIA Church',
    description: 'O grupo da semana, perto de onde você mora. Uma hora, na casa de alguém.',
    url: `${SITE}/pequena-guia`, type: 'website', locale: 'pt_BR',
  },
};

const CONVITE = canalDeConversa(
  'Oi! Vi o site da GUIA e quero participar de uma Pequena Guia. ' +
  'Meu nome é: \nMoro no bairro: \nMelhor dia e horário para mim: ',
);

const PASSOS = [
  { n: '01', t: 'Chega e come alguma coisa', d: 'Café, bolo, o que tiver. Ninguém começa falando.' },
  { n: '02', t: 'Um assunto curto', d: 'A mensagem do domingo, em dez minutos.' },
  { n: '03', t: 'Conversa aberta', d: 'Quem quiser fala. Quem não quiser, ouve.' },
  { n: '04', t: 'Oração, e cada um vai para casa', d: 'Cerca de uma hora. Sem lista, sem compromisso.' },
];

export default function PequenaGuia() {
  return (
    <Site atual="/pequena-guia">
      <Schema dados={{
        '@context': 'https://schema.org', '@type': 'WebPage', name: 'Pequena Guia · grupos da GUIA Church', url: `${SITE}/pequena-guia`,
        isPartOf: { '@type': 'WebSite', name: IGREJA.nome, url: SITE },
        about: { '@type': 'Church', name: IGREJA.nome, url: SITE,
          address: { '@type': 'PostalAddress', streetAddress: IGREJA.rua, addressLocality: `${IGREJA.bairro}, ${IGREJA.cidade}`, addressRegion: IGREJA.uf, postalCode: IGREJA.cep, addressCountry: 'BR' } },
      }} />

      {/* ------------------------------------------------------------- herói */}
      <section className="casa-papel rev">
        <div className="g g-secao primeira">
          <div className="g-grade meio">
            <div className="g-c6">
              <p className="g-rot">Durante a semana</p>
              <Tit as="h1" className="g-h1">Grupos da GUIA na Barra da Tijuca</Tit>
              <p className="g-ed">A gente chama de Pequena Guia.</p>
              <p className="g-corpo">
                Um grupo pequeno de gente da igreja que se encontra uma vez por
                semana, na casa de alguém, perto de onde você mora. Uma hora,
                conversa de verdade, e ninguém é obrigado a falar.
              </p>
              <div className="g-acoes">
                <a href={CONVITE.href} target="_blank" rel="noreferrer" className="acao cheia">Quero participar <IcSeta /></a>
                <Link href="/cultos" className="acao">Prefiro começar pelo domingo</Link>
              </div>
            </div>
            <div className="g-c5 g-d8">
              <div className="g-foto alta leva">
                <img src="/fotos/acolhida.webp" alt="Pessoas da GUIA Church se cumprimentando" fetchPriority="high" />
                <div className="g-selo">1h<small>uma vez por semana · na casa de alguém</small></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------- como é um encontro */}
      <section className="casa-escuro rev">
        <div className="g g-secao">
          <div className="g-grade fim">
            <div className="g-c7">
              <p className="g-rot">Na prática</p>
              <Tit className="g-h2">Como é um encontro</Tit>
            </div>
            <div className="g-c4 g-d9">
              <p className="g-corpo">
                Sem palco, sem microfone e sem apresentação. É a diferença entre
                estar numa igreja e conhecer as pessoas dela.
              </p>
            </div>
          </div>
          <div className="g-grade" style={{ marginTop: 'clamp(40px,5vw,64px)' }}>
            <div className="g-c7">
              <ol className="g-perg">
                {PASSOS.map(p => (
                  <li key={p.n}>
                    <span className="g-perg-n">{p.n}</span>
                    <div><h3 className="g-perg-q">{p.t}</h3><p className="g-perg-r">{p.d}</p></div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="g-c4 g-d9">
              <Vaga foto={FOTOS.pgEncontro} />
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------- onde elas acontecem
          Um mapa por grupo, no bairro (nunca na casa: ver lib/pequenas-guias).
          Enquanto a lista estiver vazia, o mapa da região e o convite. */}
      <section className="casa-papel rev">
        <div className="g g-secao">
          <div className="g-grade fim">
            <div className="g-c7">
              <p className="g-rot">Onde elas acontecem</p>
              <Tit className="g-h2">{PEQUENAS_GUIAS.length ? 'Uma perto de você' : 'Espalhadas pela Barra e arredores'}</Tit>
            </div>
            <div className="g-c4 g-d9">
              <p className="g-corpo">
                {PEQUENAS_GUIAS.length
                  ? 'O mapa mostra o bairro de cada grupo. O endereço da casa a gente passa na conversa, para quem vai.'
                  : 'Os grupos se encontram em casas, e o endereço é dito na conversa, para quem vai. Diga o seu bairro e a gente aponta o mais perto.'}
              </p>
            </div>
          </div>

          {PEQUENAS_GUIAS.length ? (
            <div className="pgs">
              {PEQUENAS_GUIAS.map(pg => {
                const conv = canalDeConversa(`Oi! Vi o site da GUIA e quero ir na ${pg.nome} (${pg.dia}, ${pg.hora}). Meu nome é: `);
                return (
                  <article key={pg.nome} className="pg">
                    <div className="pg-mapa">
                      <iframe src={mapaDaPequenaGuia(pg)} title={`Mapa: ${pg.nome}, ${pg.bairro}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
                      <span className="pg-mira" aria-hidden="true" />
                    </div>
                    <div className="pg-corpo">
                      <p className="g-rot">{pg.bairro}</p>
                      <span className="pg-nome">{pg.nome}</span>
                      <span className="pg-quando">{pg.dia}, {pg.hora}</span>
                      {pg.publico && <span className="pg-nota">{pg.publico}</span>}
                      <div className="g-acoes">
                        <a href={conv.href} target="_blank" rel="noreferrer" className="acao cheia">Quero ir nessa <IcSeta /></a>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="pg-regiao">
              <iframe src={MAPA_REGIAO} title={`Mapa: ${IGREJA.bairro} e arredores`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
              <div className="mapa-cartao">
                <p className="g-rot">Sua região</p>
                <p className="g-h3">Diga o seu bairro</p>
                <p>A gente responde com o grupo mais perto — e, se não houver, o seu bairro entra na lista dos próximos.</p>
                <div className="g-acoes">
                  <a href={CONVITE.href} target="_blank" rel="noreferrer" className="acao cheia">{CONVITE.rot} <IcSeta /></a>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ---------------------------------------------------------- perguntas */}
      <section className="casa-areia rev">
        <div className="g g-secao">
          <div className="g-grade">
            <div className="g-c4">
              <div className="g-fixa">
                <p className="g-rot">Antes de perguntar</p>
                <Tit className="g-h2">O que costuma travar</Tit>
                <p className="g-ed">Dá para ir, ouvir, e voltar para casa.</p>
              </div>
            </div>
            <div className="g-c7 g-d6">
              <ol className="g-perg">
                <li><span className="g-perg-n">01</span><div><h3 className="g-perg-q">Preciso ser da igreja?</h3>
                  <p className="g-perg-r">Não. Muita gente conhece a GUIA pela Pequena Guia antes de aparecer num domingo.</p></div></li>
                <li><span className="g-perg-n">02</span><div><h3 className="g-perg-q">Tem custo?</h3>
                  <p className="g-perg-r">Nenhum. Quem recebe costuma fazer um café, e quem quiser leva alguma coisa.</p></div></li>
                <li><span className="g-perg-n">03</span><div><h3 className="g-perg-q">Vou ter que falar na frente de todo mundo?</h3>
                  <p className="g-perg-r">Não. Dá para ir, ouvir e voltar para casa sem dizer uma palavra. É comum, e ninguém estranha.</p></div></li>
                <li><span className="g-perg-n">04</span><div><h3 className="g-perg-q">E se não tiver grupo perto de mim?</h3>
                  <p className="g-perg-r">A gente diz isso na hora, em vez de deixar você esperando. Se não houver, seu bairro entra na lista dos próximos — e é assim que um grupo novo nasce.</p></div></li>
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ a conversa */}
      <section className="g-cheio rev">
        <img src="/fotos/congregacao.webp" alt="" loading="lazy" decoding="async" />
        <div className="g">
          <p className="g-rot">Achar o seu</p>
          <Tit className="g-h2">Diga onde você mora. A gente diz qual fica perto.</Tit>
          <p className="g-corpo" style={{ maxWidth: '48ch' }}>
            Sem formulário nem cadastro. A mensagem já vai montada com nome,
            bairro e o melhor dia — você só completa.
          </p>
          <div className="g-acoes">
            <a href={CONVITE.href} target="_blank" rel="noreferrer" className="acao cheia">{CONVITE.rot} <IcSeta /></a>
          </div>
        </div>
      </section>
    </Site>
  );
}
