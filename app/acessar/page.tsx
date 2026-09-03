import type { Metadata } from 'next';
import Link from 'next/link';
import { Site } from '@/components/Site';
import { Tit } from '@/components/Texto';
import { IcSeta } from '@/components/Icones';
import { SITE } from '@/lib/igreja';

/* =============================================================================
   /acessar — AS TRÊS PORTAS

   A fronteira entre o site público e o sistema não é um domínio: é esta
   página. Ela é pública e indexável, e não mostra escala, nome de voluntário
   nem nada do sistema. Faz uma coisa só: pergunta quem é a pessoa e a entrega
   na porta certa.

   Uma pergunta, três cartões, oito segundos. Sem formulário, sem senha, sem
   explicação longa — quem chega aqui já sabe o que quer, e o trabalho da
   página é não atrapalhar.

   POR QUE A PORTA DO VOLUNTÁRIO APONTA PARA /eu, E NÃO PARA UMA PÁGINA NOVA.
   A arquitetura previa /acessar/voluntario como uma página explicando o link
   pessoal. Ao abrir o código, /eu já FAZ isso e faz melhor: além de explicar,
   ela resolve — lista as áreas, leva à lista da equipe, e a pessoa entra com
   o PIN. Criar uma segunda página para explicar o que a primeira já resolve
   seria acrescentar um passo entre a pessoa e a escala dela.

   O endereço /acessar/voluntario existe assim mesmo, como redirecionamento
   permanente para /eu (ver next.config.mjs). O endereço da arquitetura
   funciona, e quem digita cai onde o trabalho acontece.
   ============================================================================= */

export const metadata: Metadata = {
  title: 'Acesso às equipes',
  description:
    'Gestor, voluntário ou quem quer começar a servir. Três caminhos, e cada um leva direto para o lugar certo.',
  alternates: { canonical: '/acessar' },
  openGraph: {
    title: 'Acesso às equipes · GUIA Church',
    description: 'Sou gestor, sou voluntário, ou quero participar.',
    url: `${SITE}/acessar`, type: 'website', locale: 'pt_BR',
  },
};

export default function Acessar() {
  return (
    <Site>
      <section className="faixa casa-papel">
        <div className="casa-col">
          <p className="indice">Acesso às equipes</p>
          <Tit as="h1" className="tit">Quem é você?</Tit>
          <p className="corpo" style={{ marginTop: 32 }}>
            Três caminhos. Escolha o seu e siga direto — nenhum deles pede
            cadastro para começar.
          </p>
        </div>

        <div className="casa-col larga" style={{ marginTop: 56 }}>
          <div>
            {/* ------------------------------------------------ sou voluntário
                Primeiro cartão de propósito: é a porta usada toda semana. Nas
                outras duas a pessoa entra uma vez na vida; nesta, sempre. */}
            <Link href="/eu" className="escolha">
              <span className="escolha-txt">
                <span className="escolha-nome">Sou voluntário</span>
                <p className="escolha-desc">
                  Já sirvo numa equipe e quero ver a minha escala. Se você tem o
                  link pessoal que chegou no WhatsApp, é só abrir — este caminho
                  é para quando você não está com ele à mão.
                </p>
              </span>
              <span className="escolha-fim" aria-hidden="true"><IcSeta /></span>
            </Link>

            {/* ---------------------------------------------------- sou gestor */}
            <Link href="/entrar" className="escolha">
              <span className="escolha-txt">
                <span className="escolha-nome">Sou da organização</span>
                <p className="escolha-desc">
                  Administro escalas e equipes. Você recebe um link por e-mail —
                  não existe senha. O link vale por uma hora e serve uma vez.
                </p>
              </span>
              <span className="escolha-fim" aria-hidden="true"><IcSeta /></span>
            </Link>

            {/* --------------------------------------------- quero participar */}
            <Link href="/servir" className="escolha">
              <span className="escolha-txt">
                <span className="escolha-nome">Quero participar</span>
                <p className="escolha-desc">
                  Ainda não sirvo e quero começar. Cada área explica o que faz
                  antes de você decidir, e o cadastro leva menos de um minuto.
                </p>
              </span>
              <span className="escolha-fim" aria-hidden="true"><IcSeta /></span>
            </Link>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ o link pessoal, explicado
          Fica AQUI, e não numa página só dele, porque é a dúvida que aparece
          nesta tela: a pessoa procura "entrar", não acha campo de senha, e
          precisa entender por quê antes de concluir que o sistema quebrou. */}
      <section className="faixa casa-escuro">
        <div className="casa-col">
          <p className="indice">Voluntário</p>
          <Tit>Você não tem senha aqui, e isso é de propósito</Tit>
          <p className="corpo">
            O acesso do voluntário é um <b style={{ fontWeight: 500 }}>link pessoal</b>, que
            chega pelo WhatsApp quando a escala é publicada. Ele é só seu — quem
            tem o link vê a sua escala, então não repasse. Vale salvar nos
            favoritos do celular.
          </p>
        </div>
        <dl className="casa-perguntas">
          <div>
            <dt>Perdi o meu link. E agora?</dt>
            <dd>
              Não precisa pedir para ninguém: entre por <b style={{ fontWeight: 500 }}>Sou
              voluntário</b>, escolha a sua área, ache o seu nome na lista e entre
              com o seu PIN de quatro números. Se ainda não tiver PIN, você cria
              na hora.
            </dd>
          </div>
          <div>
            <dt>Tentei entrar pelo e-mail e não recebi nada</dt>
            <dd>
              Aquela porta é da organização, não do voluntário. Se você serve
              numa equipe, seu caminho é o primeiro cartão desta página.
            </dd>
          </div>
          <div>
            <dt>Ainda não sirvo, mas quero</dt>
            <dd>
              O terceiro cartão. Você escolhe a área, se cadastra, e a liderança
              daquela área fala com você antes de qualquer escala.
            </dd>
          </div>
        </dl>
      </section>
    </Site>
  );
}
