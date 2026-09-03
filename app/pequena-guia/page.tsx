import type { Metadata } from 'next';
import Link from 'next/link';
import { Site } from '@/components/Site';
import { Tit, Schema } from '@/components/Texto';
import { IcSeta } from '@/components/Icones';
import { IGREJA, SITE, canalDeConversa } from '@/lib/igreja';
import { Vaga } from '@/components/Vaga';
import { FOTOS } from '@/lib/imagens';

/* =============================================================================
   /pequena-guia — O GRUPO DA SEMANA

   O NOME É DA CASA, NÃO DO MERCADO. "Pequena Guia" é como a igreja chama, e é
   o nome que fica — mas quem chega de fora nunca ouviu isso na vida, e
   ninguém digita "pequena guia" no Google. Duas consequências que a página
   inteira respeita:

   1. Ela abre pelo BENEFÍCIO e só depois pelo nome. "Um grupo pequeno que se
      encontra durante a semana" é o que a pessoa entende; "Pequena Guia" é o
      que ela aprende.
   2. O H1 carrega as palavras que existem em busca — grupo, igreja, Barra da
      Tijuca — junto do nome da casa. Um H1 só com o nome interno seria uma
      página que só é encontrada por quem já sabe que ela existe.

   O FORMULÁRIO É UMA CONVERSA, NÃO UMA TABELA. A escolha é deliberada:
   guardar nome, telefone e bairro de visitante exigiria tabela nova, RLS nova
   e política de retenção nova num banco que está no ar servindo a escala de
   todo mundo — risco desproporcional para um fluxo que hoje termina numa
   pessoa respondendo no WhatsApp de qualquer jeito. A mensagem já sai
   estruturada, o dado nasce onde vai ser usado, e não existe base de dados de
   visitante para vazar. Quando houver volume que justifique, vira tabela.
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

export default function PequenaGuia() {
  return (
    <Site atual="/pequena-guia">
      <Schema dados={{
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Pequena Guia · grupos da GUIA Church',
        url: `${SITE}/pequena-guia`,
        isPartOf: { '@type': 'WebSite', name: IGREJA.nome, url: SITE },
        about: {
          '@type': 'Church', name: IGREJA.nome, url: SITE,
          address: {
            '@type': 'PostalAddress',
            streetAddress: IGREJA.rua,
            addressLocality: `${IGREJA.bairro}, ${IGREJA.cidade}`,
            addressRegion: IGREJA.uf, postalCode: IGREJA.cep, addressCountry: 'BR',
          },
        },
      }} />

      <section className="faixa casa-papel">
        <div className="casa-col">
          <p className="indice">Durante a semana</p>
          <Tit as="h1" className="tit">Grupos da GUIA Church na Barra da Tijuca</Tit>
          <span className="chapeu">A gente chama de Pequena Guia</span>
          <p className="corpo" style={{ marginTop: 40 }}>
            Um grupo pequeno de gente da igreja que se encontra uma vez por
            semana, na casa de alguém, perto de onde você mora. Uma hora,
            conversa de verdade, e ninguém é obrigado a falar.
          </p>
          <div className="acoes">
            <a href={CONVITE.href} target="_blank" rel="noreferrer" className="acao cheia">
              Quero participar <IcSeta />
            </a>
          </div>
        </div>
        <div className="casa-col larga" style={{ marginTop: 64 }}>
          <Vaga foto={FOTOS.pgEncontro} />
        </div>
      </section>

      {/* --------------------------------------------------- como é um encontro */}
      <section className="faixa casa-escuro">
        <div className="casa-col">
          <p className="indice">Na prática</p>
          <Tit>Como é um encontro</Tit>
          <p className="corpo">
            Sem palco, sem microfone e sem apresentação. É a diferença entre
            estar numa igreja e conhecer as pessoas dela.
          </p>
        </div>
        <div className="casa-col larga">
          <ol className="casa-tira" aria-label="Como é um encontro">
            <li><b>01</b> Chega e come alguma coisa</li>
            <li><b>02</b> Um assunto curto</li>
            <li><b>03</b> Conversa aberta</li>
            <li><b>04</b> Oração, e cada um vai para casa</li>
          </ol>
          <p className="casa-tira-nota">
            Cerca de uma hora. Você pode ir uma vez para ver como é — ninguém
            assina nada.
          </p>
          <div style={{ maxWidth: 460, margin: '48px auto 0' }}>
            <Vaga foto={FOTOS.pgRoda} />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ perguntas */}
      <section className="faixa casa-areia">
        <div className="casa-col">
          <p className="indice">Antes de perguntar</p>
          <Tit>O que costuma travar</Tit>
          <p className="editorial">Dá para ir, ouvir, e voltar para casa.</p>
        </div>
        <dl className="casa-perguntas">
          <div>
            <dt>Preciso ser da igreja?</dt>
            <dd>Não. Muita gente conhece a GUIA pela Pequena Guia antes de aparecer num domingo.</dd>
          </div>
          <div>
            <dt>Tem custo?</dt>
            <dd>Nenhum. Quem recebe costuma fazer um café, e quem quiser leva alguma coisa.</dd>
          </div>
          <div>
            <dt>Vou ter que falar na frente de todo mundo?</dt>
            <dd>Não. Dá para ir, ouvir e voltar para casa sem dizer uma palavra. É comum, e ninguém estranha.</dd>
          </div>
          <div>
            <dt>E se não tiver grupo perto de mim?</dt>
            <dd>
              A gente diz isso na hora, em vez de deixar você esperando. Se não
              houver, seu bairro entra na lista dos próximos — e é assim que um
              grupo novo nasce.
            </dd>
          </div>
        </dl>
      </section>

      {/* -------------------------------------------------------- a conversa */}
      <section className="faixa casa-escuro">
        <div className="casa-col">
          <p className="indice">Achar o seu</p>
          <Tit>Diga onde você mora, a gente diz qual fica perto</Tit>
          <p className="corpo">
            Não tem formulário nem cadastro. Manda uma mensagem com{' '}
            <b style={{ fontWeight: 500 }}>seu nome, seu bairro e o melhor dia da semana</b> —
            a mensagem já vai montada, você só completa. Alguém responde com os
            grupos que fazem sentido para você.
          </p>
          <div className="acoes">
            <a href={CONVITE.href} target="_blank" rel="noreferrer" className="acao cheia">
              {CONVITE.rot} <IcSeta />
            </a>
            <Link href="/cultos" className="acao">Prefiro começar pelo domingo</Link>
          </div>
        </div>
      </section>
    </Site>
  );
}
