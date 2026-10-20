import type { Metadata } from 'next';
import { og } from '@/lib/site/meta';
import Link from 'next/link';
import { IGREJA, SITE_IGREJA as SITE, canalDeConversa } from '@/lib/igreja';
import { PEQUENAS_GUIAS } from '@/lib/pequenas-guias';
import { Grupos } from '@/components/Grupos';
import { FormPequenaGuia } from '@/components/FormPequenaGuia';
import { Vozes, Arroba, Chapeu, Pil, Heroi, Passos, Claro, UmaLinha, ligaTexto } from '@/components/site/Blocos';
import { Schema } from '@/components/site/Schema';

/* =============================================================================
   /pequena-guia — O GRUPO DA SEMANA · 11/10/2026

   herói · uma perto de você (o mapa com um pino por grupo e a lista, que
   são components/Grupos.tsx, com a lógica de sempre e o desenho daqui) ·
   como funciona (em passos) · encontre a sua (o formulário, no cartão
   claro) · o fecho. O formulário grava numa planilha da igreja pela rota
   /api/pequena-guia e abre a conversa com a mensagem pronta.

   14/10/2026, no celular: uma frase sob cada título, e o fecho sai (ele
   pedia "diga onde você mora" logo depois do formulário que pede isso); o
   "Prefiro conversar direto" dele desce para baixo do formulário. Os grupos
   seguem no trilho: ali ele é a lista do mapa (o pino tocado traz o cartão),
   e o mapa mostra os doze de uma vez.

   19/10/2026, a copy final: o texto do herói (conhecido pelo nome no meio
   da semana), o botão "Encontrar a minha Pequena Guia" no formulário e o
   link "Prefiro começar pelos cultos" para quem ainda não quer um grupo.
   ============================================================================= */

export const metadata: Metadata = {
  title: 'Pequena Guia',
  description: 'Relacionamentos que fortalecem sua fé. A Pequena Guia é o grupo da GUIA Church que se reúne durante a semana, numa casa perto da sua, pra compartilhar a vida como ela é, estudar a Palavra e crescer junto.',
  alternates: { canonical: '/pequena-guia' },
  openGraph: og('igreja', '/pequena-guia', 'Pequena Guia', 'Um grupo perto de onde você mora.', '/og-pequena-guia.jpg'),
};

const PASSOS = [
  { n: '01', t: 'Chegar', d: 'Numa casa, numa noite da semana. Café, conversa, gente que você vai conhecer pelo nome.' },
  { n: '02', t: 'Compartilhar', d: 'Como foi a semana, o que está pesando, o que Deus fez. Sem roteiro de resposta certa.' },
  { n: '03', t: 'Estudar', d: 'A Palavra do domingo, de novo, agora em roda. Perguntas valem mais que respostas prontas.' },
  { n: '04', t: 'Orar', d: 'Uns pelos outros, pelo nome. É aqui que o grupo vira família.' },
];

export default function PequenaGuia() {
  const presenciais = PEQUENAS_GUIAS.filter(p => !p.online).length;
  const online = PEQUENAS_GUIAS.length - presenciais;
  const conversa = canalDeConversa('Oi! Vi o site da GUIA e quero participar de uma Pequena Guia. \nMeu nome é: \nMoro no bairro: \nMelhor dia e horário para mim: ');
  return (
    <>
      <Schema dados={{ '@context': 'https://schema.org', '@type': 'WebPage', name: 'Pequena Guia · grupos da GUIA Church', url: `${SITE}/pequena-guia`, isPartOf: { '@type': 'WebSite', name: IGREJA.nome, url: SITE } }} />

      <Heroi id="t-pg" lugar="pg-heroi" chapeu={<Chapeu forte="Pequena Guia" resto="O grupo da semana" />} titulo="Relacionamentos que fortalecem sua fé" it="sua fé" longa
             lead={<UmaLinha semFim texto="A Pequena Guia é um grupo que se reúne durante a semana, numa casa perto da sua, pra compartilhar a vida como ela é, estudar a Palavra e crescer junto. É onde você é conhecido pelo nome, no meio da semana, não só no domingo." />}
             micro={<>{presenciais} grupos na cidade{online ? `, ${online} por vídeo` : ''}. Nenhum precisa de inscrição.</>}>
        <Pil href="#encontrar">Encontrar a minha</Pil>
        <Pil href="#grupos" tom="vidro">Ver os grupos</Pil>
      </Heroi>

      <section id="grupos" className="s-faixa papel" aria-labelledby="t-grupos">
        <div className="s-in">
          <Arroba className="topo" />
          <div className="s-cab centro s-rev">
            <Vozes id="t-grupos" className="s-h2" it="você">Uma perto de você</Vozes>
            <p className="s-lead"><UmaLinha semFim texto="Escolha o dia que você pode. O mapa mostra onde cada grupo se reúne (a região, nunca a casa de ninguém)." /></p>
          </div>
          <div className="s-rev d1"><Grupos /></div>
        </div>
      </section>

      <Passos tid="t-como" titulo="Como funciona?" sub="uma noite por semana, em 4 momentos:" itens={PASSOS} />

      <Claro id="encontrar" tid="t-encontrar" titulo="Encontre uma Pequena Guia perto de você." lead={ligaTexto("Preencha seus dados e a gente aponta o grupo mais perto da sua casa. Leva um minuto.")}>
        <div className="s-miolo esq"><FormPequenaGuia /></div>
        {/* quem ainda não quer um grupo (copy final, 19/10/2026) */}
        <p className="s-aviso"><Link href="/cultos" className="s-link">Prefiro começar pelos cultos</Link></p>
        {/* a conversa direta, para quem prefere o WhatsApp ao formulário. 20/10/2026: o fecho
            que vinha depois ("Diga onde você mora...") mandava de volta para este formulário,
            uma tela acima; saiu, e a página termina no próprio formulário, como no celular */}
        <p className="s-aviso">Prefere conversar direto? <a href={conversa.href} target="_blank" rel="noreferrer" className="s-link">{conversa.rot.replace('Falar no ', 'Chamar no ')}</a></p>
      </Claro>
    </>
  );
}
