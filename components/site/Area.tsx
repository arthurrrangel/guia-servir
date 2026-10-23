'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { rpc } from '@/lib/publico';
import { AREAS, type Area as AreaFixa } from '@/lib/site/areas';
import { Vozes, Sede, Chapeu, Pil, Heroi, Passos, UmaLinha, fim, ligaTexto, faixaInteira } from './Blocos';
import type { LugarDeFoto } from '@/lib/site/fotos';
import { FormServir } from './Servir';
import { lp } from '@/lib/site/sites';
import { gradeQueFecha } from '@/lib/site/grade';

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

   14/10/2026, no celular: as funções em lista (o nome e os postos numa
   linha, a primeira frase embaixo; o carrossel mostrava uma de oito) e uma
   frase sob cada título. O computador segue com os cartões.
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

/* 20/10/2026: o herói de cada área é a foto de quem serve nela (as mesmas
   do herói do Guia Servir, no registro lib/site/fotos.ts); uma área nova sem
   foto fica com o vídeo "servir" */
const FOTO: Record<string, LugarDeFoto> = { midia: 'servir-midia', louvor: 'servir-louvor', kids: 'servir-kids', servico: 'servir-connect', livraria: 'servir-livraria' };

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
      /* só a área que não tem copy fixa troca o título (o do servidor era
         o genérico "Servir"); as cinco já nascem com "Mídia: Faça a mensagem
         chegar longe", que diz mais que "Mídia" */
      if (!fixa) { try { document.title = `${m.nome} · GUIA Servir`; } catch {} }
      setFase('pronto');
    })();
    return () => { vivo = false; };
  }, [slug, fixa]);

  const nome = min?.nome ?? fixa?.nome ?? 'Área';
  const artigo = (min?.artigo ?? fixa?.artigo ?? 'a') === 'a' ? 'na' : 'no';
  const postos = min?.postos ?? fixa?.postos;
  const aberto = min?.aberto ?? fixa?.aberto ?? true;
  const grupos = (() => {
    const m = new Map<string, { vagas: number; texto: string }>();
    for (const f of fns) {
      const fam = familia(f.nome); const at = m.get(fam); const texto = f.descricao_familia || f.descricao || '';
      if (at) { at.vagas++; if (!at.texto && texto) at.texto = texto; } else m.set(fam, { vagas: 1, texto });
    }
    return [...m.entries()];
  })();
  /* a grade das funções (três ou mais): as colunas que fecham as linhas em cada
     tela e, quando nenhuma fecha (7 = 4 + 3), onde começa a última linha */
  const grade = grupos.length > 2 ? {
    g: gradeQueFecha(grupos.length, [5, 4, 3]),
    m: gradeQueFecha(grupos.length, [4, 3]),
    t: gradeQueFecha(grupos.length, [3, 2]),
  } : null;
  const zap = min?.whatsapp ? `https://wa.me/${min.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Oi! Quero saber mais sobre servir ${artigo} ${nome} na GUIA.`)}` : null;
  const iniciais = (min?.responsavel || '').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();

  if (fase === 'erro') {
    return (
      <Heroi id="t-area" video="servir" curto chapeu={<Chapeu forte="Servir" resto="GUIA Church" />} titulo="Área não encontrada" it="encontrada"
             lead={ligaTexto("O link pode estar errado. Volte e escolha uma das áreas da lista.")}>
        <Pil href={lp('#areas')}>Ver as áreas</Pil>
      </Heroi>
    );
  }

  /* no celular o herói fica com a primeira frase (a foto respira em cima);
     o resto continua no computador */
  const texto = fixa?.texto ?? min?.descricao ?? '';
  const corte = texto.search(/[.!?](\s|$)/);
  const primeira = corte > 0 ? texto.slice(0, corte + 1) : texto;
  const resto = corte > 0 ? texto.slice(corte + 1).trim() : '';

  return (
    <>
      {/* o herói com a foto da área (ou o vídeo, para uma área sem foto). A
          segunda voz (a linha em itálico) são as últimas palavras da frase:
          duas, ou mais até a primeira parte caber numa linha do celular
          ("Faça a mensagem / chegar mais longe."). Com uma palavra só, o
          itálico ficava sozinho e a primeira parte quebrava em três */}
      <Heroi id="t-area" lugar={FOTO[slug]} video={FOTO[slug] ? undefined : 'servir'}
             chapeu={<Chapeu forte="Servir" resto={`${postos ?? ''} ${postos === 1 ? 'posto' : 'postos'}${aberto ? '' : ' · conversa antes'}`} />}
             titulo={fixa?.frase ?? nome} it={fixa?.frase ? segundaVoz(fixa.frase) : nome} semPonto={!fixa?.frase} longa={(fixa?.frase ?? nome).length > 24}
             lead={resto ? <>{ligaTexto(primeira)}<span className="s-resto"> {fim(ligaTexto(resto))}</span></> : fim(ligaTexto(primeira))}
             micro={fixa?.perfil ? ligaTexto(fixa.perfil) : undefined}>
        <Pil href={`/servir/${slug}/cadastro`} duro>Quero servir {artigo} {nome}</Pil>
        <Pil href={lp('#areas')} tom="vidro">Ver as outras áreas</Pil>
      </Heroi>

      {/* as funções */}
      <section className="s-faixa papel" aria-labelledby="t-funcoes">
        <div className="s-in">
          <Sede className="topo" />
          <div className="s-cab centro s-rev">
            <Vozes id="t-funcoes" className="s-h2" it={nome} semPonto>{`O que se faz ${artigo} ${nome}`}</Vozes>
            <p className="s-lead"><UmaLinha semFim texto="Você escolhe as suas no cadastro, até o que ainda não sabe fazer. Tem gente pra ensinar." /></p>
          </div>
          {fase === 'carregando' && <p className="s-aviso s-centro" role="status">Carregando as funções…</p>}
          {fase === 'rede' && <p className="s-aviso s-centro" role="status">Sem conexão agora. Atualize a página pra ver as funções.</p>}
          {fase === 'pronto' && (
            <div className="s-rev d1">
              {/* com uma ou duas funções (a Livraria), os cartões ficam no centro, não encostados à esquerda.
                  21/10/2026: com três ou mais, a grade escolhe o número de colunas que fecha as
                  linhas (8 = 4 + 4, 9 = 3 + 3 + 3, 10 = 5 + 5); as colunas automáticas davam 5 + 3 e
                  5 + 4, com a última linha cheia de buracos */}
              <div className={'s-funcoes lista' + (grupos.length <= 2 ? ' poucas' : '')} role="group" aria-label={`As funções ${artigo} ${nome}`}
                   data-cols={grade ? '' : undefined}
                   style={grade ? { '--cols2': grade.g.c * 2, '--cols-m2': grade.m.c * 2, '--cols-t2': grade.t.c * 2 } as React.CSSProperties : undefined}>
                {grupos.map(([fam, g], i) => {
                  /* o primeiro cartão da última linha, quando ela não fecha, começa
                     deslocado para a linha ficar no centro (uma por tela: g ≥ 1180,
                     m 1000 a 1179, t 760 a 999) */
                  const ini = grade ? (['g', 'm', 't'] as const).filter(k => grade[k].ini?.i === i) : [];
                  return (
                    <div key={fam} className="s-funcao" {...Object.fromEntries(ini.map(k => [`data-ini-${k}`, '']))}
                         style={ini.length ? Object.fromEntries(ini.map(k => [`--ini-${k}`, grade![k].ini!.t])) as React.CSSProperties : undefined}>
                      <small>{String(i + 1).padStart(2, '0')}</small>
                      <b>{faixaInteira(fam)}</b>
                      <p><UmaLinha semFim estreita texto={g.texto || 'A liderança explica no primeiro contato.'} /></p>
                      {g.vagas > 1 && <em>{g.vagas} postos</em>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* como funciona */}
      <Passos tid="t-como" titulo="Como funciona?" sub="do cadastro à escala, quatro passos:" itens={PASSOS} sede={false} />

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

      {/* o convite e o formulário: o fecho com o formulário dentro */}
      <section id="quero-servir" className="s-faixa noite s-grao s-fim" aria-labelledby="t-fim">
        <div className="s-in">
          <Sede className="topo" />
          <div className="s-centro s-rev">
            <Vozes id="t-fim" className="s-h2" it="aqui">Existe um lugar para você aqui</Vozes>
            <p className="s-lead grande"><UmaLinha texto={fixa?.convite ?? min?.convite ?? 'Preenche aí embaixo e a liderança te chama pra conversar.'} /></p>
            {!aberto && <p className="s-aviso">Essa área conversa com cada pessoa antes de escalar: você preenche o cadastro e a liderança fala com você.</p>}
          </div>
          <div className="s-rev d1"><FormServir areaInicial={slug} /></div>
          {/* /eu é sistema (outra folha de estilo): link duro, não <Link> */}
          <p className="s-aviso s-centro">Já serve aqui? <a href="/eu" className="s-link claro">Abrir meu espaço</a>.</p>
        </div>
      </section>
    </>
  );
}
