'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { sbPublico as sb } from '@/lib/supabase';
import { IcSeta } from '@/components/Icones';
import { Site } from '@/components/Site';
import { Tit } from '@/components/Texto';
import { Carregando, Vazio, linkZap } from '@/components/Tela';
import { fotoDaArea, focoDaArea } from '@/lib/fotos';

/* =============================================================================
   /servir/[slug] — A ÁREA

   O passo que faltava. Entre "quero servir" e o formulário existe uma
   decisão, e essa decisão precisa de informação: o que a área faz, quais
   funções existem, o que se espera de quem entra e quem vai falar com você.

   Antes esta página era /ministerios/<slug> e o formulário era /servir/<slug>.
   Os nomes contavam a história ao contrário: quem clica em "servir" espera a
   área, não o formulário. Agora /servir/<slug> é a área e o formulário mora
   em /servir/<slug>/cadastro. /ministerios/<slug> continua funcionando e
   manda para cá, porque esse link já foi para grupo de WhatsApp.

   As funções vêm da mesma RPC que o formulário usa, então o texto que a
   pessoa lê aqui é literalmente o que ela vai ver na hora de marcar. Se
   fosse copiado, os dois divergiriam no primeiro ajuste.

   O CASCO (05/09/2026): a pessoa vinha de /servir, que já falava a língua do
   site, e caía aqui numa tela do sistema interno: outra barra, outro tipo,
   tudo à esquerda. Era o "fora do lugar" mais visível do funil. Agora a área
   usa a mesma gramática das outras páginas públicas: herói centrado com a
   foto da área, as funções em cartões, os quatro passos, quem responde, e o
   fecho com o convite. A lógica de dados não mudou uma linha.
   ============================================================================= */

type Min = {
  slug: string; nome: string; descricao: string | null; convite: string | null;
  postos: number; aberto: boolean; artigo: string;
  responsavel?: string | null; whatsapp?: string | null;
};
type Fn = { nome: string; descricao: string | null; descricao_familia: string | null; tipos: string[] };

/* ESTACIONAMENTO 1/2/3 é uma família com três vagas, não três funções. Quem
   está decidindo se serve não precisa saber que existem três posições. */
const familia = (nome: string) => {
  const p = nome.trim().split(/\s+/); const fim = p[p.length - 1];
  return p.length > 1 && fim.length <= 2 ? p.slice(0, -1).join(' ') : nome;
};

/* OS MESMOS QUATRO da home e do acompanhamento. Nenhum vem marcado: esta
   lista é um aviso do que vem pela frente, não uma barra de progresso. O
   primeiro "feito" aparece na tela de acompanhamento, depois do envio. */
const PASSOS = [
  { t: 'Cadastro', d: 'Você marca as funções que combinam com você e preenche o cadastro. Menos de um minuto.' },
  { t: 'Conversa', d: 'A liderança fala com você para te conhecer e te encaixar onde faz sentido.' },
  { t: 'Time', d: 'Seu nome passa a aparecer na lista da área, e seu espaço pessoal abre.' },
  { t: 'Escala', d: 'Todo mês você diz quando pode, e a escala é montada em cima disso.' },
];

export default function Area() {
  const { slug } = useParams<{ slug: string }>();
  const [min, setMin] = useState<Min | null>(null);
  const [fns, setFns] = useState<Fn[]>([]);
  const [fase, setFase] = useState<'carregando' | 'pronto' | 'erro' | 'rede'>('carregando');

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const s = sb(); if (!s) { if (vivo) setFase('rede'); return; }
      const [lista, funcoes] = await Promise.all([
        s.rpc('ministerios_publicos'),
        s.rpc('equipe_funcoes', { p_slug: slug }),
      ]);
      if (!vivo) return;
      if (lista.error || funcoes.error) { setFase('rede'); return; }
      const m = ((lista.data || []) as Min[]).find(x => x.slug === slug) || null;
      if (!m) { setFase('erro'); return; }
      setMin(m); setFns((funcoes.data || []) as Fn[]);
      try { document.title = `${m.nome} · GUIA Church`; } catch {}
      setFase('pronto');
    })();
    return () => { vivo = false; };
  }, [slug]);

  const grupos = (() => {
    const m = new Map<string, { vagas: number; texto: string }>();
    for (const f of fns) {
      const fam = familia(f.nome);
      const at = m.get(fam);
      const texto = f.descricao_familia || f.descricao || '';
      if (at) { at.vagas++; if (!at.texto && texto) at.texto = texto; }
      else m.set(fam, { vagas: 1, texto });
    }
    return [...m.entries()];
  })();

  /* A FOTO NÃO ESPERA O BANCO. Ela vem do slug, então o herói já nasce com
     a imagem certa enquanto o nome e as funções chegam. Quem abre a página
     vê a área, não uma tela em branco com um pulso. */
  const foto = fotoDaArea(slug);
  const foco = focoDaArea(slug);

  if (fase !== 'pronto' || !min) return (
    <Site atual="/servir">
      <section className="g-cheio alta centro rev">
        <img src={foto} style={{ objectPosition: foco }} alt="" fetchPriority="high" />
        <div className="g">
          <p className="g-rot">Servir</p>
          {fase === 'carregando'
            ? <Carregando o="Carregando a área" />
            : (
              <>
                <Tit as="h1" className="g-h1">{fase === 'erro' ? 'Área não encontrada' : 'Sem conexão agora'}</Tit>
                <p className="g-ed menor">
                  {fase === 'erro'
                    ? 'O link pode estar errado. Volte e escolha uma das áreas da lista.'
                    : 'Atualize a página. O endereço continua valendo.'}
                </p>
                <div className="g-acoes">
                  <Link href="/servir" className="acao cheia">Ver as áreas <IcSeta /></Link>
                </div>
              </>
            )}
        </div>
      </section>
    </Site>
  );

  const na = min.artigo === 'a' ? 'na' : 'no';
  const zap = linkZap(min.whatsapp, `Oi! Quero saber mais sobre servir ${na} ${min.nome} na GUIA.`);
  const iniciais = (min.responsavel || '').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();

  return (
    <Site atual="/servir">
      {/* ------------------------------------------------------------- herói */}
      <section className="g-cheio alta centro rev">
        <img src={foto} style={{ objectPosition: foco }} alt="" fetchPriority="high" />
        <div className="g">
          <p className="g-rot">Servir</p>
          <Tit as="h1" className="g-h1">{min.nome}</Tit>
          {min.descricao && <p className="g-ed menor">{min.descricao}</p>}
          <div className="g-acoes">
            <Link href={`/servir/${min.slug}/cadastro`} className="acao cheia">Quero servir {na} {min.nome} <IcSeta /></Link>
            <Link href="/servir" className="acao">Ver todas as áreas</Link>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- as funções */}
      <section className="casa-papel rev">
        <div className="g g-secao">
          <div className="c">
            <p className="g-rot">Onde você pode servir</p>
            <Tit className="g-h2">{`O que se faz ${na} ${min.nome}`}</Tit>
            <p className="g-ed">Você escolhe as suas no cadastro.</p>
            {/* A TELA MANDAVA FAZER UMA COISA QUE ELA NÃO OFERECE. Dizia "Marque
                uma ou mais" numa lista de leitura. A marcação existe, mas no
                passo 2 do cadastro. Aqui a lista diz o que ela é, e onde a
                escolha acontece. */}
            <p className="g-corpo">Pode escolher o que você ainda não sabe fazer. Tem gente para ensinar.</p>
          </div>
          <div className="cartoes livre resumo c-bloco grande">
            {grupos.map(([fam, g], i) => (
              <div key={fam} className="cartao">
                <span className="cartao-n">{String(i + 1).padStart(2, '0')}</span>
                <p className="cartao-t fn">{fam}</p>
                <p className="cartao-d">{g.texto || 'A liderança explica no primeiro contato.'}</p>
                {/* "vaga" é posto VAZIO. Aqui o número é quantas posições a
                    função tem, cheias ou não. Então a palavra é posto. */}
                {g.vagas > 1 && <span className="cartao-s">{g.vagas} postos</span>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------- como funciona */}
      <section className="casa-escuro retic rev">
        <div className="g g-secao">
          <div className="c">
            <p className="g-rot">Como funciona</p>
            <Tit className="g-h2">Do cadastro à escala</Tit>
            <p className="g-ed">Quatro passos.</p>
          </div>
          <ol className="cartoes quatro c-bloco grande">
            {PASSOS.map((p, i) => (
              <li key={p.t} className="cartao">
                <span className="cartao-n">{i + 1}</span>
                <p className="cartao-t">{p.t}</p>
                <p className="cartao-d">{p.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------------------------------------- quem vai falar com você */}
      {min.responsavel && (
        <section className="casa-areia rev">
          <div className="g g-secao">
            <div className="c">
              <p className="g-rot">Quem responde por essa área</p>
              <span className="g-ini" aria-hidden="true">{iniciais}</span>
              <Tit className="g-h2 nome">{min.responsavel}</Tit>
              <p className="g-ed">Responsável {na} {min.nome}.</p>
              {zap && (
                <div className="g-acoes">
                  <a href={zap} target="_blank" rel="noreferrer" className="acao cheia">Chamar no WhatsApp <IcSeta /></a>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------- fecho */}
      <section className="g-cheio centro fecho rev">
        <img src="/fotos/palco.webp" alt="" loading="lazy" decoding="async" />
        <div className="g">
          <p className="g-rot">O convite</p>
          <Tit className="g-h2">Existe um lugar para você aqui.</Tit>
          {min.convite && <p className="g-ed menor">{min.convite}</p>}
          <div className="g-acoes">
            <Link href={`/servir/${min.slug}/cadastro`} className="acao cheia">Quero servir {na} {min.nome} <IcSeta /></Link>
            <Link href="/eu" className="acao">Já sirvo aqui</Link>
          </div>
          {!min.aberto && (
            <p className="g-nota">Essa área conversa com cada pessoa antes de escalar. Você preenche o cadastro e a liderança fala com você.</p>
          )}
        </div>
      </section>
    </Site>
  );
}
