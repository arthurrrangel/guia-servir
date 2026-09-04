import type { Metadata } from 'next';
import { cartao } from '@/lib/meta';
import Link from 'next/link';
import { Site } from '@/components/Site';
import { Tit } from '@/components/Texto';
import { Perguntas } from '@/components/Perguntas';
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
  ...cartao({ titulo: 'Privacidade', descricao: 'O que a GUIA Church coleta, por que, e como você pede exclusão.', caminho: '/privacidade' }),
};

const CONTATO = canalDeConversa('Oi! É sobre os meus dados no site da GUIA.');

const COLETA = [
  { q: 'Quando você se cadastra para servir',
    r: 'Nome completo, telefone com WhatsApp e, se quiser, e-mail. Junto vai a área escolhida e as funções de interesse. É o mínimo para a liderança daquela área falar com você e montar a escala.' },
  { q: 'Enquanto você serve',
    r: 'Em quais cultos você foi escalado, se confirmou ou pediu troca, os dias em que marcou indisponibilidade, e as observações que você mesmo escreve. Um PIN de quatro números, escolhido por você, protege esse espaço.' },
  { q: 'Quando você fala com a gente pelo site',
    r: `Os botões de conversa abrem o ${IGREJA.whatsapp ? 'WhatsApp' : 'Instagram'} com uma mensagem já escrita. O que você manda por lá fica no aplicativo, sob a política dele. Este site não guarda cópia da conversa.` },
];
const LINK = [
  { q: 'Fora da busca',
    r: 'As páginas de acesso pessoal saem com instrução de não indexação e estão bloqueadas no robots.txt. Um código desses indexado seria a escala de uma pessoa aparecendo no Google.' },
  { q: 'Prévia sem conteúdo',
    r: 'Quando alguém encaminha o link num grupo, o WhatsApp busca a página para montar a prévia. A prévia é fixa e genérica: nome nenhum, escala nenhuma.' },
  { q: 'Não repasse',
    r: 'Como o link é a credencial, quem recebe o seu link entra no seu espaço. Se você acha que ele circulou, fale com o organizador da sua equipe.' },
];
const ACESSO = [
  { q: 'Quem tem acesso',
    r: 'A liderança da sua área e a organização das escalas. O acesso é controlado no próprio banco de dados, por regra de permissão: um líder enxerga a equipe dele, não a igreja inteira.' },
  { q: 'Onde os dados ficam',
    r: 'Num banco de dados hospedado no Supabase; o site é publicado pela Vercel. As duas atuam como operadoras: processam por conta da igreja e não usam esses dados para nada próprio.' },
  { q: 'O que nunca acontece',
    r: 'Seus dados não são vendidos, não são cedidos a terceiros e não alimentam publicidade. Não há cookie de rastreamento nem pixel de rede social. A única exceção são os mapas do Google nas páginas Como chegar e Pequena Guia: ao abri-las, o Google pode gravar cookies próprios, sob a política dele.' },
  { q: 'Por quanto tempo ficam',
    r: 'Enquanto você fizer parte de uma equipe. Quando alguém deixa de servir, o cadastro é encerrado e o histórico de escalas é mantido só pelo tempo necessário à organização da igreja, e apagado a qualquer momento, se você pedir.' },
];

export default function Privacidade() {
  return (
    <Site>
      <section className="casa-papel rev">
        <div className="g g-secao primeira">
          <div className="c">
            <p className="g-rot">LGPD · Lei 13.709/2018</p>
            <Tit as="h1" className="g-h1">Privacidade</Tit>
            <p className="g-ed">O que a gente guarda, e por quê.</p>
            <p className="g-rot" style={{ marginTop: 28, marginBottom: 0 }}>Atualizada em setembro de 2026</p>
          </div>
        </div>
      </section>

      <section className="casa-escuro rev">
        <div className="g g-secao">
          <div className="c">
            <p className="g-rot">01</p>
            <Tit className="g-h2">O que é coletado</Tit>
            <p className="g-ed">Só quando você digita.</p>
          </div>
          <div className="c-media c-bloco grande"><Perguntas itens={COLETA} /></div>
        </div>
      </section>

      <section className="casa-areia rev">
        <div className="g g-secao">
          <div className="c">
            <p className="g-rot">02</p>
            <Tit className="g-h2">O seu link pessoal é um dado</Tit>
            <p className="g-ed">Quem tem o link vê a sua escala.</p>
          </div>
          <div className="c-media c-bloco grande"><Perguntas itens={LINK} /></div>
        </div>
      </section>

      <section className="casa-papel rev">
        <div className="g g-secao">
          <div className="c">
            <p className="g-rot">03</p>
            <Tit className="g-h2">Quem acessa, e onde fica</Tit>
          </div>
          <div className="c-media c-bloco grande"><Perguntas itens={ACESSO} /></div>
        </div>
      </section>

      <section className="casa-escuro rev">
        <div className="g g-secao">
          <div className="c">
            <p className="g-rot">04</p>
            <Tit className="g-h2">O que você pode pedir</Tit>
            <p className="g-ed">Acesso, correção, exclusão. Sem custo, sem justificativa.</p>
            <p className="g-corpo">Diga seu nome completo e a área em que você serve ou serviu. A resposta sai em até 15 dias.</p>
            <p className="g-rot" style={{ marginTop: 36 }}>Controladora</p>
            <p className="g-h3">{IGREJA.nome}</p>
            <p className="g-corpo" style={{ marginTop: 8 }}>{ENDERECO_LINHA}</p>
            <div className="g-acoes">
              <a href={CONTATO.href} target="_blank" rel="noreferrer" className="acao cheia">{CONTATO.rot} <IcSeta /></a>
            </div>
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
