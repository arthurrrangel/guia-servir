import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_IGREJA as SITE } from '@/lib/igreja';
import { AREAS, AREAS_ORDEM } from '@/lib/site/areas';
import { Vozes, Sede, Chapeu, Pil, Img, Seta, fim } from '@/components/site/Blocos';
import { Areas } from '@/components/site/Servir';
import { Schema } from '@/components/site/Schema';

/* =============================================================================
   /servir/onde-me-encaixo — PARA QUEM NÃO SABE ESCOLHER · 11/10/2026

   "Não sei onde me encaixo" é a resposta mais comum de quem quer servir.
   Esta página responde em três perguntas abertas, mostra o trabalho de
   cada área (não o nome do time) e tira o medo de escolher errado.
   ============================================================================= */

export const metadata: Metadata = {
  title: 'Não sei onde me encaixo',
  description: 'É a resposta mais comum. Três perguntas, o que se faz em cada área e por que escolher errado não existe.',
  alternates: { canonical: '/servir/onde-me-encaixo' },
  openGraph: { title: 'Não sei onde me encaixo · GUIA Church', url: `${SITE}/servir/onde-me-encaixo`, images: [{ url: '/og-servir.jpg', width: 1200, height: 630 }] },
};

const DUVIDAS = [
  { q: 'Preciso saber fazer alguma coisa?', r: ['Não. Todo posto da GUIA é ocupado por alguém que um dia não sabia. Você marca no cadastro até o que ainda não sabe fazer, e cada área tem gente que ensina no próprio serviço.', 'O que precisa existir é vontade de chegar mais cedo.'] },
  { q: 'Quanto tempo isso vai tomar?', r: ['Depende do posto. Alguns chegam às 8h30, outros entram junto com a igreja. Todo mês você diz os dias em que pode, e a escala é montada em cima disso, nunca ao contrário.', 'Ninguém é escalado num dia que não marcou.'] },
  { q: 'E se eu escolher errado?', r: ['A conversa com a liderança existe exatamente pra isso. E mudar de área não é recomeçar do zero: é se encontrar no lugar certo.', 'Escolhe a que parece mais com você. O resto se ajusta andando.'] },
];

export default function OndeMeEncaixo() {
  return (
    <>
      <Schema dados={{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: DUVIDAS.map(d => ({ '@type': 'Question', name: d.q, acceptedAnswer: { '@type': 'Answer', text: d.r.join(' ') } })) }} />

      <section className="s-heroi curto" aria-labelledby="t-enc">
        <Img lugar="encaixe-heroi" prioridade retrato />
        <div className="s-in s-heroi-in">
          <Chapeu forte="Servir" resto="GUIA Church" />
          <Vozes as="h1" id="t-enc" className="s-h1" it="encaixo">Não sei onde me encaixo</Vozes>
          <p className="s-lead grande">É a resposta mais comum. E tem um caminho: três perguntas, cinco áreas e uma conversa.</p>
          <div className="s-acoes">
            <Pil href="#areas">Ver o que se faz em cada área</Pil>
            <Pil href="/servir#quero-servir">Deixar a liderança me ajudar</Pil>
          </div>
        </div>
      </section>

      <section className="s-faixa papel" aria-labelledby="t-duvidas">
        <div className="s-in">
          <Sede className="topo" />
          <div className="s-cab centro s-rev">
            <Vozes id="t-duvidas" className="s-h2 media" it="escolher">Três perguntas antes de escolher</Vozes>
          </div>
          <div className="s-abre s-rev d1">
            {DUVIDAS.map((d, i) => (
              <details key={d.q} open={i === 0}>
                <summary>{d.q}</summary>
                <div>{d.r.map(p => <p key={p}>{fim(p)}</p>)}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section id="areas" className="s-faixa areia" aria-labelledby="t-areas">
        <div className="s-in">
          <div className="s-cab centro s-rev">
            <Vozes id="t-areas" className="s-h2 media" it="time">O trabalho, não o nome do time</Vozes>
            <p className="s-lead">Com as palavras de quem lidera cada área. Clique numa pra ver as funções.</p>
          </div>
          <div className="s-rev d1"><Areas /></div>
          <ul className="s-faq s-rev" style={{ marginTop: 'clamp(28px,4vw,52px)' }}>
            {AREAS_ORDEM.map(s => <li key={s}><p><b>{AREAS[s].nome}.</b> {AREAS[s].perfil} <Link href={`/servir/${s}`} className="s-link">Ver as funções</Link></p></li>)}
          </ul>
        </div>
      </section>

      <section className="s-faixa noite s-grao" aria-labelledby="t-duas">
        <div className="s-in s-centro">
          <Sede className="topo" />
          <div className="s-rev">
            <Vozes id="t-duas" className="s-h2" it="duas">Em dúvida entre duas? Escolha qualquer uma das duas</Vozes>
            <p className="s-lead grande" style={{ margin: '22px auto 0' }}>A conversa com a liderança existe pra isso, e mudar depois é simples. O que custa caro é ficar parado.</p>
          </div>
          <div className="s-acoes centro s-rev d1" style={{ marginTop: 'clamp(28px,4vw,52px)' }}>
            <Pil href="/servir#quero-servir">Quero servir <Seta /></Pil>
            <Pil href="/servir/servico">Começar pelo Connect</Pil>
          </div>
        </div>
      </section>
    </>
  );
}
