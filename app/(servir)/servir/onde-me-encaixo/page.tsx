import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE } from '@/lib/igreja';
import { lp } from '@/lib/site/sites';
import { AREAS, AREAS_ORDEM } from '@/lib/site/areas';
import { Vozes, Sede, Chapeu, Pil, Heroi, Fecho, UmaLinha, fim, liga, ligaTexto } from '@/components/site/Blocos';
import { Areas } from '@/components/site/Servir';
import { Schema } from '@/components/site/Schema';

/* =============================================================================
   /servir/onde-me-encaixo — PARA QUEM NÃO SABE ESCOLHER · 11/10/2026

   "Não sei onde me encaixo" é a resposta mais comum de quem quer servir.
   Esta página responde em três perguntas abertas, mostra o trabalho de
   cada área (não o nome do time) e tira o medo de escolher errado.
   14/10/2026, no celular: as cinco áreas em lista, cada uma com para quem
   ela é (a lista de perfis embaixo repetia as cinco e sai), e uma frase sob
   cada título.
   19/10/2026, a copy final: "Três dúvidas comuns", com as respostas que o
   Arthur marcou para manter (o nível de quem está aprendendo, a escala que
   não depende de caçar substituto) e a nova da terceira.
   ============================================================================= */

export const metadata: Metadata = {
  title: 'Não sei onde me encaixo',
  description: 'É a resposta mais comum. Três dúvidas comuns e o que se faz em cada área de voluntários da GUIA Church.',
  alternates: { canonical: '/servir/onde-me-encaixo' },
  openGraph: { title: 'Não sei onde me encaixo · GUIA Servir', url: `${SITE}/servir/onde-me-encaixo`, siteName: 'GUIA Servir', images: [{ url: '/og-encaixo.jpg?v=20261020', width: 1200, height: 630 }] },
};

const DUVIDAS = [
  { q: 'Preciso saber fazer alguma coisa?', r: ['Não. Existe um nível pra quem está aprendendo, e ele conta: a escala sabe que você é novo e não deixa a área de pé só na sua mão. Ninguém aqui começou sabendo.'] },
  { q: 'Quanto tempo isso vai tomar?', r: ['Todo mês você diz os dias em que pode, e a escala é montada em cima disso. Não é toda semana, e não é você quem caça substituto quando não pode.'] },
  { q: 'E se eu escolher errado?', r: ['Escolher aqui não te compromete com nada. Se a área não for a sua cara, a gente conversa e você troca.'] },
];

export default function OndeMeEncaixo() {
  return (
    <>
      <Schema dados={{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: DUVIDAS.map(d => ({ '@type': 'Question', name: d.q, acceptedAnswer: { '@type': 'Answer', text: d.r.join(' ') } })) }} />

      {/* o herói: um plano de cada área (a câmera, o palco, a Kids, a porta, a Bíblia) */}
      <Heroi id="t-enc" video="encaixe" curto chapeu={<Chapeu forte="Servir" resto="GUIA Church" />} titulo="Não sei onde me encaixo" it="me encaixo"
             lead={<UmaLinha semFim texto="É a resposta mais comum. E tem um caminho: três dúvidas, cinco áreas e uma conversa." />}>
        <Pil href="#areas">Ver as áreas</Pil>
        <Pil href={lp('#quero-servir')} tom="vidro">Deixar a liderança me ajudar</Pil>
      </Heroi>

      <section className="s-faixa papel" aria-labelledby="t-duvidas">
        <div className="s-in">
          <Sede className="topo" />
          <div className="s-cab centro s-rev">
            <Vozes id="t-duvidas" className="s-h2 media" it="comuns">Três dúvidas comuns</Vozes>
          </div>
          <div className="s-abre s-rev d1">
            {DUVIDAS.map((d, i) => (
              <details key={d.q} open={i === 0}>
                <summary>{liga(d.q)}</summary>
                <div>{d.r.map(p => <p key={p}>{fim(ligaTexto(p))}</p>)}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section id="areas" className="s-faixa areia" aria-labelledby="t-areas">
        <div className="s-in">
          <div className="s-cab centro s-rev">
            <Vozes id="t-areas" className="s-h2 media" it="time">O trabalho, não o nome do time</Vozes>
            <p className="s-lead"><span className="s-resto">{ligaTexto("Com as palavras de quem lidera cada área.")} </span>{ligaTexto("Clique numa pra ver as funções.")}</p>
          </div>
          <div className="s-rev d1"><Areas perfil /></div>
          <ul className="s-faq depois s-rev so-largo">
            {AREAS_ORDEM.map(s => <li key={s}><p><b>{AREAS[s].nome}.</b> {ligaTexto(AREAS[s].perfil ?? "")} <Link href={`/servir/${s}`} className="s-link">Ver as funções</Link></p></li>)}
          </ul>
        </div>
      </section>

      <Fecho titulo="Em dúvida entre duas? Escolha qualquer uma das duas" it="duas" lead="A conversa com a liderança existe pra isso, e mudar depois é simples. O que custa caro é ficar parado.">
        <Pil href={lp('#quero-servir')}>Quero servir</Pil>
        <Pil href="/servir/servico" tom="vidro">Começar pelo Connect</Pil>
      </Fecho>
    </>
  );
}
