import type { Metadata } from 'next';
import Link from 'next/link';
import { Site } from '@/components/Site';
import { Tit } from '@/components/Texto';
import { IcSeta } from '@/components/Icones';
import { IGREJA, ENDERECO_LINHA, SITE, canalDeConversa } from '@/lib/igreja';

/* =============================================================================
   /privacidade — OBRIGATÓRIA, NÃO OPCIONAL

   Não entra por gosto de arquitetura. O cadastro de voluntário coleta nome,
   telefone e e-mail; o sistema guarda escala, disponibilidade e PIN; e o link
   pessoal do voluntário é, ele mesmo, um dado que identifica a pessoa. Sem
   política publicada, a coleta é irregular — e o custo aí é jurídico, não de
   conversão.

   ESCRITA PARA SER LIDA, não para ser cumprida no papel. Um texto que ninguém
   entende cumpre a formalidade e falha no propósito da lei, que é a pessoa
   saber o que acontece com o dado dela. Cada bloco responde uma pergunta em
   linguagem de gente.

   O QUE FALTA PREENCHER está marcado no texto e listado no fim do arquivo: o
   canal de contato do titular vira WhatsApp no dia em que IGREJA.whatsapp
   tiver número; e o prazo de retenção precisa ser decidido por quem responde
   pela igreja, não por mim.
   ============================================================================= */

export const metadata: Metadata = {
  title: 'Privacidade',
  description:
    'Como a GUIA Church trata os dados de quem se cadastra para servir e de quem entra em contato pelo site. O que é coletado, por quanto tempo fica e como pedir exclusão.',
  alternates: { canonical: '/privacidade' },
  openGraph: {
    title: 'Privacidade · GUIA Church',
    description: 'O que a GUIA Church coleta, por que, e como você pede exclusão.',
    url: `${SITE}/privacidade`, type: 'website', locale: 'pt_BR',
  },
};

const CONTATO = canalDeConversa('Oi! É sobre os meus dados no site da GUIA.');

export default function Privacidade() {
  return (
    <Site>
      <section className="faixa casa-papel rev">
        <div className="casa-col">
          <p className="indice">LGPD</p>
          <Tit as="h1" className="tit">Privacidade</Tit>
          <span className="chapeu">Lei 13.709/2018 · atualizada em setembro de 2026</span>
          <p className="corpo" style={{ marginTop: 40 }}>
            Esta página explica o que a {IGREJA.nome} coleta neste site, por que
            coleta, quem tem acesso e como você pede para apagar. Se alguma
            parte não estiver clara, pergunte — a obrigação de explicar é nossa.
          </p>
        </div>
      </section>

      {/* --------------------------------------------------------- o que coleta */}
      <section className="faixa casa-escuro rev">
        <div className="casa-col">
          <p className="indice">01</p>
          <Tit>O que é coletado, e só quando você digita</Tit>
          <p className="corpo">
            Este site não pede dado nenhum de quem só está lendo. Não há
            cadastro para visitar, e as páginas públicas funcionam sem você se
            identificar.
          </p>
        </div>
        <dl className="casa-perguntas">
          <div>
            <dt>Quando você se cadastra para servir</dt>
            <dd>
              Nome completo, telefone com WhatsApp e, se você quiser informar,
              e-mail. Junto vai a área escolhida e as funções em que você tem
              interesse. É o mínimo para a liderança daquela área falar com você
              e montar a escala.
            </dd>
          </div>
          <div>
            <dt>Enquanto você serve</dt>
            <dd>
              Em quais cultos você foi escalado, se confirmou ou pediu troca, os
              dias em que você marcou indisponibilidade, e as observações que
              você mesmo escreve. Um PIN de quatro números, escolhido por você,
              protege esse espaço.
            </dd>
          </div>
          <div>
            <dt>Quando você fala com a gente pelo site</dt>
            <dd>
              Os botões de conversa deste site abrem o {IGREJA.whatsapp ? 'WhatsApp' : 'Instagram'} com
              uma mensagem já escrita. O que você manda por lá fica no aplicativo,
              sob a política dele — este site não guarda cópia da conversa.
            </dd>
          </div>
        </dl>
      </section>

      {/* ------------------------------------------------------- o link pessoal */}
      <section className="faixa casa-areia rev">
        <div className="casa-col">
          <p className="indice">02</p>
          <Tit>O seu link pessoal é um dado, e é tratado como tal</Tit>
          <p className="corpo">
            Quem serve recebe pelo WhatsApp um endereço só seu, com um código na
            própria URL. Esse endereço é a sua credencial: quem tem o link vê a
            sua escala. Por isso ele é tratado como dado pessoal, e não como um
            endereço qualquer:
          </p>
        </div>
        <div className="casa-col larga">
          <dl className="casa-dados">
            <div>
              <dt>Fora da busca</dt>
              <dd>
                As páginas de acesso pessoal saem com instrução de não indexação
                no cabeçalho da resposta e estão bloqueadas no robots.txt. Um
                código desses indexado seria a escala de uma pessoa aparecendo
                no Google.
              </dd>
            </div>
            <div>
              <dt>Prévia sem conteúdo</dt>
              <dd>
                Quando alguém encaminha o link num grupo, o WhatsApp busca a
                página para montar a prévia. A prévia é fixa e genérica: nome
                nenhum, escala nenhuma.
              </dd>
            </div>
            <div>
              <dt>Não repasse</dt>
              <dd>
                Como o link é a credencial, quem recebe o seu link entra no seu
                espaço. Se você acha que ele circulou, fale com o organizador da
                sua equipe.
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* -------------------------------------------------------- quem acessa */}
      <section className="faixa casa-escuro rev">
        <div className="casa-col">
          <p className="indice">03</p>
          <Tit>Quem tem acesso, e onde os dados ficam</Tit>
        </div>
        <dl className="casa-perguntas">
          <div>
            <dt>Dentro da igreja</dt>
            <dd>
              A liderança da sua área e a organização das escalas. O acesso é
              controlado no próprio banco de dados, por regra de permissão: um
              líder enxerga a equipe dele, não a igreja inteira.
            </dd>
          </div>
          <div>
            <dt>Onde ficam</dt>
            <dd>
              Num banco de dados hospedado no Supabase, e o site é publicado
              pela Vercel. As duas empresas atuam como operadoras: processam por
              conta da igreja e não usam esses dados para nada próprio.
            </dd>
          </div>
          <div>
            <dt>O que nunca acontece</dt>
            <dd>
              Seus dados não são vendidos, não são cedidos para terceiros e não
              alimentam publicidade. Este site não usa cookie de rastreamento
              nem pixel de rede social.
            </dd>
          </div>
          <div>
            <dt>Por quanto tempo ficam</dt>
            <dd>
              Enquanto você fizer parte de uma equipe. Quando alguém deixa de
              servir, o cadastro é encerrado e o histórico de escalas é mantido
              apenas pelo tempo necessário à organização da igreja — e apagado a
              qualquer momento, se você pedir.
            </dd>
          </div>
        </dl>
      </section>

      {/* ------------------------------------------------------- seus direitos */}
      <section className="faixa casa-papel rev">
        <div className="casa-col">
          <p className="indice">04</p>
          <Tit>O que você pode pedir, e como</Tit>
          <p className="corpo">
            A lei garante que você peça a qualquer momento: confirmação de que
            existe cadastro, acesso ao que está guardado, correção do que estiver
            errado, exclusão, e a revogação do consentimento que você deu ao se
            cadastrar. Nenhum desses pedidos tem custo, e nenhum precisa de
            justificativa.
          </p>
          <p className="corpo">
            Peça pelo canal abaixo, dizendo seu nome completo e a área em que
            você serve ou serviu. A resposta sai em até 15 dias.
          </p>
          <div className="acoes">
            <a href={CONTATO.href} target="_blank" rel="noreferrer" className="acao cheia">
              {CONTATO.rot} <IcSeta />
            </a>
          </div>
        </div>
      </section>

      <section className="faixa casa-escuro rev">
        <div className="casa-col">
          <p className="indice">Controladora</p>
          <Tit>Quem responde por isso</Tit>
          <p className="corpo">{IGREJA.nome} · {ENDERECO_LINHA}</p>
          <p className="corpo">
            Esta página é revisada quando o site muda o que coleta. A data no
            topo é a da última revisão.
          </p>
          <div className="acoes">
            <Link href="/" className="acao">Voltar ao início</Link>
          </div>
        </div>
      </section>
    </Site>
  );
}

/* PENDENTE, e é decisão de quem responde pela igreja, não minha:
   1. Prazo exato de retenção do histórico de escala depois que a pessoa sai.
      O texto diz "pelo tempo necessário", que é o que a lei aceita como
      mínimo — mas um prazo em número é melhor para todo mundo.
   2. Nome e canal do encarregado de dados (DPO). A LGPD pede o encarregado
      indicado; para entidade religiosa de pequeno porte a ANPD flexibiliza a
      indicação formal, então a página fica válida sem — mas nomear é melhor.
   3. IGREJA.whatsapp: enquanto for null, o canal do titular é o Instagram.
      Para pedido de exclusão isso funciona, mas WhatsApp é o canal certo. */
