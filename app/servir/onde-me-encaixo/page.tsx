'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { sbPublico as sb } from '@/lib/supabase';
import { IcSeta } from '@/components/Icones';
import { Tela, Cabeca, Carregando, Vazio } from '@/components/Tela';

/* =============================================================================
   /servir/onde-me-encaixo — O DEGRAU QUE FALTAVA

   O DEFEITO, DITO SEM RODEIO: a informação que resolve a decisão estava
   trancada atrás da decisão.

   /servir mostra cinco portas com três linhas cada e pede uma escolha. O que
   cada área REALMENTE faz — projetar a letra, receber quem chega, cuidar do
   som, ficar com as crianças — só aparece depois que a pessoa já escolheu uma
   e abriu a página dela. Quem já sabe que é bom de câmera atravessa isso sem
   sentir. Quem só quer ajudar precisa entrar e sair de cinco páginas para
   descobrir o que existe, e a maioria não faz isso: fecha.

   E é justamente essa pessoa que o alvo da igreja descreve — a que sai de
   espectadora para participante. Por definição, ela é a que não sabe qual área
   é a dela.

   POR QUE NÃO É UM QUESTIONÁRIO
   O caminho fácil aqui era três perguntas de personalidade ("bastidor ou
   frente?") mapeadas para áreas. Duas coisas impedem:

   1. O mapa teria que ser inventado por mim. Dizer que quem é tímido serve na
      Mídia é conhecimento da igreja que ninguém me deu, e sair inventando isso
      é o mesmo erro de escrever a doutrina de cabeça.
   2. Ele quebraria no primeiro ministério novo. Abrir área aqui é um insert
      com um responsável, não uma mudança de código — um mapa fixo obrigaria a
      mexer no código toda vez, e o site passaria a mentir em silêncio até
      alguém lembrar.

   O QUE ESTA PÁGINA FAZ
   Vira o eixo. A lista de áreas é organizada pelo organograma da igreja; a
   pessoa nova pensa em TAREFA. Então aqui aparece o trabalho de verdade — as
   funções de todas as áreas, com as palavras que a própria liderança escreveu
   no banco — e cada bloco leva para a área dele. Nada é inventado, nada
   precisa ser mantido à mão, e área nova aparece sozinha.

   E ELA NÃO É UM PORTÃO. Fica como porta lateral em /servir, nunca no meio do
   caminho: a lista completa continua a um clique, aqui e lá. Guia que atrapalha
   quem já decidiu tira mais gente do que traz.
   ============================================================================= */

type Min = {
  slug: string; nome: string; descricao: string | null;
  postos: number; aberto: boolean; artigo: string;
};
type Fn = { nome: string; descricao: string | null; descricao_familia: string | null };
type Bloco = Min & { trabalhos: { nome: string; texto: string }[] };

/* ESTACIONAMENTO 1/2/3 é uma família com três vagas, não três trabalhos
   diferentes. Mesma regra da página da área, para as duas telas contarem a
   mesma coisa. */
const familia = (nome: string) => {
  const p = nome.trim().split(/\s+/); const fim = p[p.length - 1];
  return p.length > 1 && fim.length <= 2 ? p.slice(0, -1).join(' ') : nome;
};

export default function OndeMeEncaixo() {
  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [fase, setFase] = useState<'carregando' | 'pronto' | 'rede'>('carregando');

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const s = sb(); if (!s) { if (vivo) setFase('rede'); return; }
      const { data, error } = await s.rpc('ministerios_publicos');
      if (!vivo) return;
      if (error) { setFase('rede'); return; }
      const mins = (data || []) as Min[];

      /* uma chamada por área, em paralelo. São cinco: o custo é um round-trip,
         e em troca nenhuma linha desta página é escrita à mão. */
      const fns = await Promise.all(
        mins.map(async m => {
          try {
            const r = await s.rpc('equipe_funcoes', { p_slug: m.slug });
            return r.error ? [] : ((r.data || []) as Fn[]);
          } catch { return [] as Fn[]; }
        }),
      );
      if (!vivo) return;

      setBlocos(mins.map((m, i) => {
        const mapa = new Map<string, string>();
        for (const f of fns[i]) {
          const fam = familia(f.nome);
          const texto = f.descricao_familia || f.descricao || '';
          if (!mapa.has(fam) || (!mapa.get(fam) && texto)) mapa.set(fam, texto);
        }
        return { ...m, trabalhos: [...mapa.entries()].map(([nome, texto]) => ({ nome, texto })) };
      }));
      setFase('pronto');
    })();
    return () => { vivo = false; };
  }, []);

  return (
    <Tela volta="/servir" voltaRot="Áreas">
      <main className="tela-corpo">
        <Cabeca
          rot="Onde eu me encaixo"
          titulo="Não sei onde me encaixo"
          apoio="É a resposta mais comum, e não atrapalha nada. Abaixo está o que se faz de verdade em cada área. Não o nome do time, o trabalho."
        />

        {/* AS TRÊS TRAVAS, RESPONDIDAS ANTES DA LISTA.
            Nenhuma delas é perguntada em voz alta, e as três seguram a pessoa
            no lugar. Se não forem respondidas aqui, ela responde sozinha — e a
            resposta que ela inventa é sempre a pior. */}
        <dl className="casa-perguntas onde-travas" style={{ marginTop: 'var(--e7)' }}>
          <div>
            <dt>Preciso saber fazer alguma coisa?</dt>
            <dd>
              Não. Existe um nível para quem está aprendendo, e ele conta: a escala sabe
              que você é novo e não deixa a área de pé só na sua mão. Ninguém aqui começou sabendo.
            </dd>
          </div>
          <div>
            <dt>Quanto tempo isso vai tomar?</dt>
            <dd>
              Todo mês você diz os dias em que pode, e a escala é montada em cima disso.
              Não é toda semana, e não é você quem caça substituto quando não pode.
            </dd>
          </div>
          <div>
            <dt>E se eu escolher errado?</dt>
            <dd>
              Escolher aqui não te compromete com nada. Depois do cadastro vem uma conversa
              com a liderança da área, e é nela que se decide onde você encaixa melhor,
              inclusive se for em outra área.
            </dd>
          </div>
        </dl>

        {fase === 'carregando' && <Carregando o="Carregando o que cada área faz" />}
        {fase === 'rede' && (
          <Vazio
            titulo="Sem conexão agora"
            texto="Não consegui carregar as áreas. Atualize a página, ou fale com quem te chamou para servir."
            acao={{ href: '/servir', rot: 'Ver as áreas' }}
          />
        )}

        {fase === 'pronto' && (
          <div className="entra">
            <div className="onde-cab-lista">
              <span className="rot">O que se faz em cada área</span>
              <span className="onde-nota">Toque na área para ver tudo sobre ela</span>
            </div>

            {blocos.map(b => (
              <section className="onde-area" key={b.slug}>
                <div className="onde-topo">
                  <div>
                    <Link href={`/servir/${b.slug}`} className="onde-nome">{b.nome}</Link>
                    {b.descricao && <p className="onde-desc">{b.descricao}</p>}
                  </div>
                  <Link href={`/servir/${b.slug}`} className="onde-ir">
                    {b.aberto ? 'Ver e entrar' : 'Ver a área'} <IcSeta />
                  </Link>
                </div>

                {b.trabalhos.length > 0 && (
                  <div className="onde-fns">
                    {b.trabalhos.map(t => (
                      <div className="onde-fn" key={t.nome}>
                        <b>{t.nome}</b>
                        {t.texto && <p>{t.texto}</p>}
                      </div>
                    ))}
                  </div>
                )}
                {!b.aberto && (
                  <p className="onde-fechada">
                    Esta área tem uma conversa antes de qualquer cadastro.
                  </p>
                )}
              </section>
            ))}

            {/* FECHO: tira o peso, não convence. E devolve a lista completa —
                esta página é atalho, nunca funil. */}
            <div className="onde-fecho">
              <p>
                Continua em dúvida entre duas? Escolha qualquer uma das duas. A conversa
                com a liderança existe exatamente para isso, e mudar de área depois é
                normal aqui.
              </p>
              <Link href="/servir" className="acao">Ver as áreas lado a lado <IcSeta /></Link>
            </div>
          </div>
        )}
      </main>
    </Tela>
  );
}
