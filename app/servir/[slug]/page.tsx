'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { sbPublico as sb } from '@/lib/supabase';
import { IcSeta } from '@/components/Icones';
import { Tela, Carregando, Vazio, Pessoa } from '@/components/Tela';
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

  if (fase === 'carregando') return (
    <Tela volta="/servir" voltaRot="Áreas"><main className="tela-corpo"><Carregando /></main></Tela>
  );
  if (fase !== 'pronto' || !min) return (
    <Tela volta="/servir" voltaRot="Áreas">
      <main className="tela-corpo">
        <Vazio
          titulo={fase === 'erro' ? 'Área não encontrada' : 'Sem conexão agora'}
          texto={fase === 'erro'
            ? 'O link pode estar errado. Volte e escolha uma das áreas da lista.'
            : 'Atualize a página. O endereço continua valendo.'}
          acao={{ href: '/servir', rot: 'Ver as áreas' }}
        />
      </main>
    </Tela>
  );

  const na = min.artigo === 'a' ? 'na' : 'no';

  return (
    <Tela volta="/servir" voltaRot="Áreas">
      {/* --- a área, em foto e uma frase --- */}
      <section className="porta-hero">
        <img
          className="porta-hero-foto"
          src={fotoDaArea(min.slug)}
          style={{ objectPosition: focoDaArea(min.slug) }}
          alt=""
          fetchPriority="high"
        />
        <div className="porta-hero-in">
          <nav className="migalha claro" aria-label="Onde você está">
            <Link href="/servir">Servir</Link>
            <span aria-hidden="true">›</span>
            <b aria-current="page">{min.nome}</b>
          </nav>
          <h1 style={{ marginTop: 18 }}>{min.nome}</h1>
          {min.descricao && <p className="porta-hero-sub">{min.descricao}</p>}
        </div>
      </section>

      <main className="tela-corpo tela-estreita entra" style={{ paddingTop: 'var(--e7)' }}>
        {/* --- onde você pode servir --- */}
        <div style={{ textAlign: 'center' }}>
          <span className="rot">Onde você pode servir</span>
          {/* A TELA MANDAVA FAZER UMA COISA QUE ELA NÃO OFERECE.
              Dizia "Marque uma ou mais" numa lista de leitura: os itens têm
              cursor:default e não recebem clique. Quem chega pela primeira vez
              lê a instrução, tenta tocar, nada acontece, e a conclusão possível
              é que o site está quebrado. A marcação existe — só que no passo 2
              do cadastro, que é a tela seguinte. Agora esta lista diz o que ela
              é, e diz onde a escolha acontece. */}
          <p className="area-intro" style={{ margin: '20px auto 0', fontSize: 'var(--t-corpo)', lineHeight: 1.72, color: 'var(--cinza)' }}>
            Estas são as funções da área. Você escolhe as suas no cadastro — e dá para
            escolher função que você ainda não sabe fazer, tem gente para ensinar.
          </p>
        </div>

        <div style={{ marginTop: 'var(--e6)' }}>
          {grupos.map(([fam, g]) => (
            <div key={fam} className="escolha" style={{ cursor: 'default' }}>
              <span className="escolha-txt">
                <span className="escolha-nome">{fam}</span>
                <p className="escolha-desc">
                  {g.texto || 'A liderança explica no primeiro contato.'}
                </p>
              </span>
              {/* "vaga" é posto VAZIO. Aqui o número é quantas posições a
                  função tem, cheias ou não — então a palavra é posto. */}
              {g.vagas > 1 && <span className="escolha-fim">{g.vagas} postos</span>}
            </div>
          ))}
        </div>

        {/* --- como funciona: cinco tempos, e o que acontece em cada um --- */}
        <div style={{ marginTop: 'var(--e8)', textAlign: 'center' }}>
          <span className="rot">Como funciona</span>
        </div>
        <ol className="estados" style={{ margin: 'var(--e6) auto 0' }}>
          {/* OS MESMOS QUATRO da home e do acompanhamento. Eram cinco aqui, e
              todos apareciam marcados como concluídos antes de a pessoa dar o
              primeiro: a lista dizia "feito" sobre coisas que não aconteceram.

              Nenhum vem marcado. Esta lista é um aviso do que vem pela frente,
              não uma barra de progresso: quem está lendo ainda está decidindo,
              e o passo 1 termina no cadastro, que é justamente o botão lá
              embaixo. Marcar antes é contar uma coisa que não aconteceu. O
              primeiro "feito" aparece na tela de acompanhamento, depois do
              envio. */}
          <li>
            <span className="estados-bola">1</span>
            <span className="estados-txt"><b>Escolha a área e se cadastre</b><span>Marca as funções que combinam com você e preenche o cadastro. Menos de um minuto.</span></span>
          </li>
          <li>
            <span className="estados-bola">2</span>
            <span className="estados-txt"><b>Converse com a liderança</b><span>Uma conversa para te conhecer e te encaixar onde faz sentido.</span></span>
          </li>
          <li>
            <span className="estados-bola">3</span>
            <span className="estados-txt"><b>Entre no time</b><span>Seu nome passa a aparecer na lista da área, e seu espaço pessoal abre.</span></span>
          </li>
          <li>
            <span className="estados-bola">4</span>
            <span className="estados-txt"><b>Receba sua escala</b><span>Todo mês você diz quando pode, e a escala é montada em cima disso.</span></span>
          </li>
        </ol>

        {/* --- quem vai falar com você --- */}
        {min.responsavel && (
          <div style={{ marginTop: 'var(--e8)' }}>
            <div style={{ textAlign: 'center', marginBottom: 'var(--e4)' }}>
              <span className="rot">Quem responde por essa área</span>
            </div>
            <Pessoa
              nome={min.responsavel}
              papel={`Responsável ${na} ${min.nome}`}
              zap={min.whatsapp}
              texto={`Oi! Quero saber mais sobre servir ${na} ${min.nome} na GUIA.`}
            />
          </div>
        )}

        {/* --- a ação, uma só --- */}
        <div style={{ textAlign: 'center', marginTop: 'var(--e8)' }}>
          {min.convite && (
            <p style={{ margin: '0 auto var(--e5)', maxWidth: '46ch', fontSize: 'var(--t-corpo)', lineHeight: 1.7, color: 'var(--cinza)' }}>
              {min.convite}
            </p>
          )}
          <Link href={`/servir/${min.slug}/cadastro`} className="acao cheia">
            Quero servir {na} {min.nome} <IcSeta />
          </Link>
          {!min.aberto && (
            <p style={{ margin: 'var(--e4) auto 0', maxWidth: '42ch', fontSize: 'var(--t-apoio)', lineHeight: 1.65, color: 'var(--cinza)' }}>
              Essa área conversa com cada pessoa antes de escalar. Você preenche o
              cadastro e a liderança fala com você.
            </p>
          )}
          <div style={{ marginTop: 'var(--e7)', paddingTop: 'var(--e5)', borderTop: '1px solid var(--linha)' }}>
            <span className="rot">Já serve {na} {min.nome}?</span>
            <div style={{ marginTop: 'var(--e4)' }}>
              <Link href="/eu" className="acao">Acessar meu espaço <IcSeta /></Link>
            </div>
          </div>
        </div>
      </main>
    </Tela>
  );
}
