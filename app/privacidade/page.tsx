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
      <section className="casa-papel rev">
        <div className="g g-secao primeira">
          <div className="g-grade fim">
            <div className="g-c7">
              <p className="g-rot">LGPD · Lei 13.709/2018</p>
              <Tit as="h1" className="g-h1">Privacidade</Tit>
              <p className="g-ed">O que a gente guarda, e por quê.</p>
            </div>
            <div className="g-c4 g-d9">
              <p className="g-corpo">
                Esta página explica o que a {IGREJA.nome} coleta neste site, por que
                coleta, quem tem acesso e como você pede para apagar. Se alguma
                parte não estiver clara, pergunte — a obrigação de explicar é nossa.
              </p>
              <p className="g-rot" style={{ marginTop: 20 }}>Atualizada em setembro de 2026</p>
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- 01 · coleta */}
      <section className="casa-escuro rev">
        <div className="g g-secao">
          <div className="g-grade">
            <div className="g-c4"><div className="g-fixa">
              <p className="g-rot">01</p>
              <Tit className="g-h2">O que é coletado, e só quando você digita</Tit>
              <p className="g-corpo">Este site não pede dado nenhum de quem só está lendo. Não há cadastro para visitar.</p>
            </div></div>
            <div className="g-c7 g-d6">
              <ol className="g-perg">
                <li><span className="g-perg-n">a</span><div><h3 className="g-perg-q">Quando você se cadastra para servir</h3>
                  <p className="g-perg-r">Nome completo, telefone com WhatsApp e, se você quiser informar, e-mail. Junto vai a área escolhida e as funções em que você tem interesse. É o mínimo para a liderança daquela área falar com você e montar a escala.</p></div></li>
                <li><span className="g-perg-n">b</span><div><h3 className="g-perg-q">Enquanto você serve</h3>
                  <p className="g-perg-r">Em quais cultos você foi escalado, se confirmou ou pediu troca, os dias em que você marcou indisponibilidade, e as observações que você mesmo escreve. Um PIN de quatro números, escolhido por você, protege esse espaço.</p></div></li>
                <li><span className="g-perg-n">c</span><div><h3 className="g-perg-q">Quando você fala com a gente pelo site</h3>
                  <p className="g-perg-r">Os botões de conversa abrem o {IGREJA.whatsapp ? 'WhatsApp' : 'Instagram'} com uma mensagem já escrita. O que você manda por lá fica no aplicativo, sob a política dele — este site não guarda cópia da conversa.</p></div></li>
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------- 02 · o link pessoal */}
      <section className="casa-areia rev">
        <div className="g g-secao">
          <div className="g-grade">
            <div className="g-c4"><div className="g-fixa">
              <p className="g-rot">02</p>
              <Tit className="g-h2">O seu link pessoal é um dado, e é tratado como tal</Tit>
              <p className="g-corpo">Quem serve recebe pelo WhatsApp um endereço só seu, com um código na própria URL. Esse endereço é a sua credencial: quem tem o link vê a sua escala.</p>
            </div></div>
            <div className="g-c7 g-d6">
              <ol className="g-perg">
                <li><span className="g-perg-n">a</span><div><h3 className="g-perg-q">Fora da busca</h3>
                  <p className="g-perg-r">As páginas de acesso pessoal saem com instrução de não indexação no cabeçalho da resposta e estão bloqueadas no robots.txt. Um código desses indexado seria a escala de uma pessoa aparecendo no Google.</p></div></li>
                <li><span className="g-perg-n">b</span><div><h3 className="g-perg-q">Prévia sem conteúdo</h3>
                  <p className="g-perg-r">Quando alguém encaminha o link num grupo, o WhatsApp busca a página para montar a prévia. A prévia é fixa e genérica: nome nenhum, escala nenhuma.</p></div></li>
                <li><span className="g-perg-n">c</span><div><h3 className="g-perg-q">Não repasse</h3>
                  <p className="g-perg-r">Como o link é a credencial, quem recebe o seu link entra no seu espaço. Se você acha que ele circulou, fale com o organizador da sua equipe.</p></div></li>
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------- 03 · quem acessa */}
      <section className="casa-papel rev">
        <div className="g g-secao">
          <div className="g-grade">
            <div className="g-c4"><div className="g-fixa">
              <p className="g-rot">03</p>
              <Tit className="g-h2">Quem tem acesso, e onde os dados ficam</Tit>
            </div></div>
            <div className="g-c7 g-d6">
              <ol className="g-perg">
                <li><span className="g-perg-n">a</span><div><h3 className="g-perg-q">Dentro da igreja</h3>
                  <p className="g-perg-r">A liderança da sua área e a organização das escalas. O acesso é controlado no próprio banco de dados, por regra de permissão: um líder enxerga a equipe dele, não a igreja inteira.</p></div></li>
                <li><span className="g-perg-n">b</span><div><h3 className="g-perg-q">Onde ficam</h3>
                  <p className="g-perg-r">Num banco de dados hospedado no Supabase, e o site é publicado pela Vercel. As duas empresas atuam como operadoras: processam por conta da igreja e não usam esses dados para nada próprio.</p></div></li>
                <li><span className="g-perg-n">c</span><div><h3 className="g-perg-q">O que nunca acontece</h3>
                  <p className="g-perg-r">Seus dados não são vendidos, não são cedidos para terceiros e não alimentam publicidade. Este site não usa cookie de rastreamento nem pixel de rede social. A única exceção é o mapa da página <Link href="/como-chegar" style={{ color: 'inherit' }}>Como chegar</Link>, que é do Google: ao abri-la, o Google pode gravar cookies próprios, sob a política dele — e ele só carrega quando a página chega perto do mapa.</p></div></li>
                <li><span className="g-perg-n">d</span><div><h3 className="g-perg-q">Por quanto tempo ficam</h3>
                  <p className="g-perg-r">Enquanto você fizer parte de uma equipe. Quando alguém deixa de servir, o cadastro é encerrado e o histórico de escalas é mantido apenas pelo tempo necessário à organização da igreja — e apagado a qualquer momento, se você pedir.</p></div></li>
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------- 04 · seus direitos */}
      <section className="casa-escuro rev">
        <div className="g g-secao">
          <div className="g-grade meio">
            <div className="g-c6">
              <p className="g-rot">04</p>
              <Tit className="g-h2">O que você pode pedir, e como</Tit>
              <p className="g-corpo">
                A lei garante que você peça a qualquer momento: confirmação de que
                existe cadastro, acesso ao que está guardado, correção do que estiver
                errado, exclusão, e a revogação do consentimento que você deu ao se
                cadastrar. Nenhum desses pedidos tem custo, e nenhum precisa de
                justificativa.
              </p>
              <p className="g-corpo">Peça pelo canal ao lado, dizendo seu nome completo e a área em que você serve ou serviu. A resposta sai em até 15 dias.</p>
            </div>
            <div className="g-c5 g-d8">
              <p className="g-rot">Controladora</p>
              <p className="g-h3">{IGREJA.nome}</p>
              <p className="g-corpo" style={{ marginTop: 8 }}>{ENDERECO_LINHA}</p>
              <div className="g-acoes">
                <a href={CONTATO.href} target="_blank" rel="noreferrer" className="acao cheia">{CONTATO.rot} <IcSeta /></a>
                <Link href="/" className="acao">Voltar ao início</Link>
              </div>
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
