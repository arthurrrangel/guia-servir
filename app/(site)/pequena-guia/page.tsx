import type { Metadata } from 'next';
import { IGREJA, SITE_IGREJA as SITE, canalDeConversa } from '@/lib/igreja';
import { PEQUENAS_GUIAS } from '@/lib/pequenas-guias';
import { Grupos } from '@/components/Grupos';
import { FormPequenaGuia } from '@/components/FormPequenaGuia';
import { Vozes, Sede, Arroba, Chapeu, Pil, Fecho, liga, ligaTexto } from '@/components/site/Blocos';
import { Fundo } from '@/components/site/Midia';
import { Schema } from '@/components/site/Schema';

/* =============================================================================
   /pequena-guia — O GRUPO DA SEMANA · 11/10/2026

   herói · uma perto de você (o mapa com um pino por grupo e a lista, que
   são components/Grupos.tsx, com a lógica de sempre e o desenho daqui) ·
   como funciona (em passos) · encontre a sua (o formulário, no cartão
   claro) · o fecho. O formulário grava numa planilha da igreja pela rota
   /api/pequena-guia e abre a conversa com a mensagem pronta.
   ============================================================================= */

export const metadata: Metadata = {
  title: 'Pequena Guia',
  description: 'Relacionamentos que fortalecem sua fé. A Pequena Guia é o grupo da GUIA Church que se reúne durante a semana, numa casa perto da sua, pra compartilhar a vida e estudar a Palavra.',
  alternates: { canonical: '/pequena-guia' },
  openGraph: { title: 'Pequena Guia · GUIA Church', description: 'Um grupo perto de onde você mora.', url: `${SITE}/pequena-guia`, images: [{ url: '/og-pequena-guia.jpg', width: 1200, height: 630 }] },
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

      <section className="s-heroi" aria-labelledby="t-pg">
        <Fundo video="pg" prioridade />
        <div className="s-in s-heroi-in">
          <Chapeu forte="Pequena Guia" resto="O grupo da semana" />
          <Vozes as="h1" id="t-pg" className="s-h1 longa" it="sua fé">Relacionamentos que fortalecem sua fé</Vozes>
          <p className="s-lead grande">{ligaTexto("Um grupo pequeno, numa casa perto da sua, pra compartilhar a vida, estudar a Palavra e crescer em comunidade.")}</p>
          <div className="s-acoes">
            <Pil href="#encontrar">Encontrar a minha</Pil>
            <Pil href="#grupos">Ver os grupos</Pil>
          </div>
          <p className="s-micro">{presenciais} grupos na cidade{online ? `, ${online} por vídeo` : ''}. Nenhum precisa de inscrição.</p>
        </div>
      </section>

      <section id="grupos" className="s-faixa papel" aria-labelledby="t-grupos">
        <div className="s-in">
          <Arroba className="topo" />
          <div className="s-cab centro s-rev">
            <Vozes id="t-grupos" className="s-h2" it="você">Uma perto de você</Vozes>
            <p className="s-lead">{ligaTexto("Escolha o dia que você pode. O mapa mostra onde cada grupo se reúne (a região, nunca a casa de ninguém).")}</p>
          </div>
          <div className="s-rev d1"><Grupos /></div>
        </div>
      </section>

      <section className="s-faixa areia" aria-labelledby="t-como">
        <div className="s-in">
          <div className="s-passos-cab s-rev">
            <h2 id="t-como" className="s-serifa">{liga("Como funciona?")}</h2>
            <p className="s-serifa it">{liga("uma noite por semana, em 4 momentos:")}</p>
          </div>
          <ol className="s-passos s-rev d1">
            {PASSOS.map(p => <li key={p.n}><b>{p.n} - {p.t}</b><p>{ligaTexto(p.d)}</p></li>)}
          </ol>
          <Sede className="base" />
        </div>
      </section>

      <section id="encontrar" className="s-faixa noite s-grao justa" aria-labelledby="t-encontrar">
        <div className="s-in">
          <div className="s-claro s-rev">
            <Sede />
            <h2 id="t-encontrar" className="s-h2 menor">{liga("Encontre uma Pequena Guia perto de você.")}</h2>
            <p className="s-lead">{ligaTexto("Preencha seus dados e a gente aponta o grupo mais perto da sua casa. Leva um minuto.")}</p>
            <div style={{ marginTop: 'clamp(24px,3vw,40px)', textAlign: 'left' }}><FormPequenaGuia /></div>
          </div>
        </div>
      </section>

      {/* depois do formulário na noite, o fecho vem no papel */}
      <Fecho tom="papel" titulo="Diga onde você mora. A gente diz qual fica perto" it="perto">
        <Pil href="#encontrar" tom="preta">Encontrar a minha</Pil>
        <Pil href={conversa.href} fora tom="contorno">Prefiro conversar direto</Pil>
      </Fecho>
    </>
  );
}
