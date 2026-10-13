'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { rpc } from '@/lib/publico';
import { AREAS, type Area as AreaFixa } from '@/lib/site/areas';
import { Vozes, Sede, Chapeu, Pil, fim, liga, ligaTexto } from './Blocos';
import { Fundo } from './Midia';
import { FormServir } from './Servir';
import { Trilho } from './Trilho';

/* =============================================================================
   /servir/<área> — A PÁGINA DA ÁREA · 11/10/2026

   Entre "quero servir" e o cadastro existe uma decisão, e decisão precisa
   de informação: o que a área faz, quais funções existem, quem responde.
   As funções vêm da mesma RPC que o cadastro usa (equipe_funcoes): o que a
   pessoa lê aqui é o que ela vai marcar lá. Nome, postos e responsável vêm
   de ministerios_publicos; a copy fixa (frase, convite) vem de
   lib/site/areas.ts.

   O vídeo não espera o banco: vem do slug, e o herói nasce com o pôster
   dele (13/10/2026: cada área tem o seu trecho dos vídeos da igreja).
   ============================================================================= */

type Min = { slug: string; nome: string; descricao: string | null; convite: string | null; postos: number; aberto: boolean; artigo: string; responsavel?: string | null; whatsapp?: string | null };
type Fn = { nome: string; descricao: string | null; descricao_familia: string | null; tipos: string[] };

/* ESTACIONAMENTO 1/2/3 é uma família com três vagas, não três funções */
const familia = (nome: string) => {
  const p = nome.trim().split(/\s+/); const fim = p[p.length - 1];
  return p.length > 1 && fim.length <= 2 ? p.slice(0, -1).join(' ') : nome;
};

/* as últimas palavras que vão para o itálico: o mínimo de duas, crescendo
   enquanto a primeira parte passa de 16 letras e o itálico cabe em 18 */
const CURTA = /^(o|a|e|de|da|do|em|no|na|um|uma|à|ao|pra|para|por|que|se|com)$/i;
const segundaVoz = (frase: string) => {
  const p = frase.trim().split(/\s+/);
  let k = 2;
  for (; k < p.length; k++) {
    if (p.slice(0, -k).join(' ').length <= 16) { if (p.slice(-k).join(' ').length > 18) k = 2; break; }
  }
  if (k >= p.length) k = 2;
  /* a primeira parte nunca termina em palavra curta ("Leve o culto pra /
     fora dele"): a curta desce para o itálico */
  while (k < p.length - 1 && CURTA.test(p[p.length - k - 1])) k++;
  return p.slice(-k).join(' ');
};

const VIDEO: Record<string, string> = { midia: 'midia', louvor: 'louvor', kids: 'kids', servico: 'servico', livraria: 'livraria' };

const PASSOS = [
  { n: '01', t: 'Cadastro', d: 'Marque as funções que combinam com você. Menos de um minuto.' },
  { n: '02', t: 'Conversa', d: 'Alguém da liderança fala com você pra te conhecer e te encaixar onde faz sentido.' },
  { n: '03', t: 'Time', d: 'Seu nome entra na lista da área e o seu espaço pessoal abre.' },
  { n: '04', t: 'Escala', d: 'Todo mês você diz quando pode. A escala é montada em cima disso.' },
];

export default function Area() {
  const { slug } = useParams<{ slug: string }>();
  const fixa: AreaFixa | undefined = AREAS[slug];
  const [min, setMin] = useState<Min | null>(null);
  const [fns, setFns] = useState<Fn[]>([]);
  const [fase, setFase] = useState<'carregando' | 'pronto' | 'erro' | 'rede'>('carregando');

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const [lista, funcoes] = await Promise.all([rpc<Min[]>('ministerios_publicos'), rpc<Fn[]>('equipe_funcoes', { p_slug: slug })]);
      if (!vivo) return;
      if (lista.error || funcoes.error) { setFase(fixa ? 'rede' : 'erro'); return; }
      const m = (lista.data || []).find(x => x.slug === slug) || null;
      if (!m) { setFase(fixa ? 'rede' : 'erro'); return; }
      setMin(m); setFns(funcoes.data || []);
      try { document.title = `${m.nome} · GUIA Church`; } catch {}
      setFase('pronto');
    })();
    return () => { vivo = false; };
  }, [slug, fixa]);

  const nome = min?.nome ?? fixa?.nome ?? 'Área';
  const artigo = (min?.artigo ?? fixa?.artigo ?? 'a') === 'a' ? 'na' : 'no';
  const postos = min?.postos ?? fixa?.postos;
  const aberto = min?.aberto ?? fixa?.aberto ?? true;
  const video = VIDEO[slug] ?? 'servir';
  const grupos = (() => {
    const m = new Map<string, { vagas: number; texto: string }>();
    for (const f of fns) {
      const fam = familia(f.nome); const at = m.get(fam); const texto = f.descricao_familia || f.descricao || '';
      if (at) { at.vagas++; if (!at.texto && texto) at.texto = texto; } else m.set(fam, { vagas: 1, texto });
    }
    return [...m.entries()];
  })();
  const zap = min?.whatsapp ? `https://wa.me/${min.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Oi! Quero saber mais sobre servir ${artigo} ${nome} na GUIA.`)}` : null;
  const iniciais = (min?.responsavel || '').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();

  if (fase === 'erro') {
    return (
      <section className="s-heroi curto" aria-labelledby="t-area">
        <Fundo video="servir" prioridade />
        <div className="s-in s-heroi-in">
          <Chapeu forte="Servir" resto="GUIA Church" />
          <Vozes as="h1" id="t-area" className="s-h1" it="encontrada">Área não encontrada</Vozes>
          <p className="s-lead grande">{ligaTexto("O link pode estar errado. Volte e escolha uma das áreas da lista.")}</p>
          <div className="s-acoes"><Pil href="/servir#areas">Ver as áreas</Pil></div>
        </div>
      </section>
    );
  }

  return (
    <>
      {/* o herói com o vídeo da área */}
      <section className="s-heroi" aria-labelledby="t-area">
        <Fundo video={video} prioridade />
        <div className="s-in s-heroi-in">
          <Chapeu forte="Servir" resto={`${postos ?? ''} ${postos === 1 ? 'posto' : 'postos'}${aberto ? '' : ' · conversa antes'}`} />
          {/* a segunda voz (a linha em itálico) são as últimas palavras da
              frase: duas, ou mais até a primeira parte caber numa linha do
              celular ("Faça a mensagem / chegar mais longe."). Com uma palavra
              só, o itálico ficava sozinho e a primeira parte quebrava em três */}
          <Vozes as="h1" id="t-area" className={'s-h1' + ((fixa?.frase ?? nome).length > 24 ? ' longa' : '')} it={fixa?.frase ? segundaVoz(fixa.frase) : nome} semPonto={!fixa?.frase}>{fixa?.frase ?? nome}</Vozes>
          {(() => {
            /* no celular o herói fica com a primeira frase (a foto respira em
               cima); o resto continua no computador */
            const t = fixa?.texto ?? min?.descricao ?? '';
            const i = t.search(/[.!?](\s|$)/);
            const primeira = i > 0 ? t.slice(0, i + 1) : t;
            const resto = i > 0 ? t.slice(i + 1).trim() : '';
            return <p className="s-lead grande">{resto ? <>{ligaTexto(primeira)}<span className="s-resto"> {fim(ligaTexto(resto))}</span></> : fim(ligaTexto(primeira))}</p>;
          })()}
          <div className="s-acoes">
            <Pil href={`/servir/${slug}/cadastro`} duro>Quero servir {artigo} {nome}</Pil>
            <Pil href="/servir#areas">Ver as outras áreas</Pil>
          </div>
          {fixa?.perfil && <p className="s-micro">{ligaTexto(fixa.perfil)}</p>}
        </div>
      </section>

      {/* as funções */}
      <section className="s-faixa papel" aria-labelledby="t-funcoes">
        <div className="s-in">
          <Sede className="topo" />
          <div className="s-cab centro s-rev">
            <Vozes id="t-funcoes" className="s-h2" it={nome} semPonto>{`O que se faz ${artigo} ${nome}`}</Vozes>
            <p className="s-lead">{ligaTexto("Você escolhe as suas no cadastro, até o que ainda não sabe fazer. Tem gente pra ensinar.")}</p>
          </div>
          {fase === 'carregando' && <p className="s-aviso s-centro" role="status">Carregando as funções…</p>}
          {fase === 'rede' && <p className="s-aviso s-centro" role="status">Sem conexão agora. Atualize a página pra ver as funções.</p>}
          {fase === 'pronto' && (
            <div className="s-rev d1">
              <Trilho className="s-funcoes" rotulo={`As funções ${artigo} ${nome}`}>
                {grupos.map(([fam, g], i) => (
                  <div key={fam} className="s-funcao">
                    <small>{String(i + 1).padStart(2, '0')}</small>
                    <b>{fam}</b>
                    <p>{ligaTexto(g.texto || 'A liderança explica no primeiro contato.')}</p>
                    {g.vagas > 1 && <em>{g.vagas} postos</em>}
                  </div>
                ))}
              </Trilho>
            </div>
          )}
        </div>
      </section>

      {/* como funciona */}
      <section className="s-faixa areia" aria-labelledby="t-como">
        <div className="s-in">
          <div className="s-passos-cab s-rev">
            <h2 id="t-como" className="s-serifa">{liga("Como funciona?")}</h2>
            <p className="s-serifa it">{liga("do cadastro à escala, 4 passos:")}</p>
          </div>
          <ol className="s-passos s-rev d1">
            {PASSOS.map(p => <li key={p.n}><b>{p.n} - {p.t}</b><p>{ligaTexto(p.d)}</p></li>)}
          </ol>
        </div>
      </section>

      {/* quem responde */}
      {min?.responsavel && (
        <section className="s-faixa papel justa" aria-labelledby="t-resp">
          <div className="s-in">
            <div className="s-pessoa s-rev">
              <span className="s-ini" aria-hidden="true">{iniciais}</span>
              <p className="s-selo">Quem responde por essa área</p>
              <h2 id="t-resp" className="s-h2 menor">{min.responsavel}</h2>
              <p className="s-lead">Responsável {artigo} {nome}.</p>
              {zap && <div className="s-acoes centro"><Pil href={zap} fora tom="preta">Chamar no WhatsApp</Pil></div>}
            </div>
          </div>
        </section>
      )}

      {/* o convite e o formulário */}
      <section id="quero-servir" className="s-faixa noite s-grao" aria-labelledby="t-fim">
        <div className="s-in">
          <Sede className="topo" />
          <div className="s-rev">
            <Vozes id="t-fim" className="s-h2" it="aqui">Existe um lugar para você aqui</Vozes>
            <p className="s-lead grande" style={{ marginTop: 22 }}>{fim(ligaTexto(fixa?.convite ?? min?.convite ?? 'Preenche aí embaixo e a liderança te chama pra conversar.'))}</p>
            {!aberto && <p className="s-aviso">Essa área conversa com cada pessoa antes de escalar: você preenche o cadastro e a liderança fala com você.</p>}
          </div>
          <div className="s-rev d1"><FormServir areaInicial={slug} /></div>
          <p className="s-aviso s-centro" style={{ marginTop: 28 }}>Já serve aqui? <Link href="/eu" className="s-link claro">Abrir meu espaço</Link>.</p>
        </div>
      </section>
    </>
  );
}
