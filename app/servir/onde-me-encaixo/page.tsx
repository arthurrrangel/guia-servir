'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { sbPublico as sb } from '@/lib/supabase';
import { IcSeta } from '@/components/Icones';
import { Site } from '@/components/Site';
import { Tit } from '@/components/Texto';
import { Perguntas } from '@/components/Perguntas';
import { Carregando, Vazio } from '@/components/Tela';

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

   O CASCO (05/09/2026): passou para a gramática das páginas públicas. As três
   travas viraram a lista de perguntas do site (dobrada no celular, aberta no
   desktop); cada área é um item da mesma lista, com as funções em cartões.
   Trinta e poucas funções empilhadas eram dez telas no celular; agora são
   cinco linhas, e cada uma abre no toque.
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

/* AS TRÊS TRAVAS, RESPONDIDAS ANTES DA LISTA. Nenhuma delas é perguntada em
   voz alta, e as três seguram a pessoa no lugar. Se não forem respondidas
   aqui, ela responde sozinha, e a resposta que ela inventa é sempre a pior. */
const TRAVAS = [
  { q: 'Preciso saber fazer alguma coisa?', r: 'Não. Existe um nível para quem está aprendendo, e ele conta: a escala sabe que você é novo e não deixa a área de pé só na sua mão. Ninguém aqui começou sabendo.' },
  { q: 'Quanto tempo isso vai tomar?', r: 'Todo mês você diz os dias em que pode, e a escala é montada em cima disso. Não é toda semana, e não é você quem caça substituto quando não pode.' },
  { q: 'E se eu escolher errado?', r: 'Escolher aqui não te compromete com nada. Depois do cadastro vem uma conversa com a liderança da área, e é nela que se decide onde você encaixa melhor, inclusive se for em outra área.' },
];

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

  /* cada área vira um item da lista de perguntas: o nome é a pergunta, e o
     corpo é a descrição, as funções em cartões e o caminho para a área */
  const itens = blocos.map(b => ({
    q: b.nome,
    corpo: (
      <>
        {b.descricao && <p className="qa-r">{b.descricao}</p>}
        {b.trabalhos.length > 0 && (
          <div className="cartoes livre">
            {b.trabalhos.map(t => (
              <div className="cartao" key={t.nome}>
                <p className="cartao-t fn">{t.nome}</p>
                {t.texto && <p className="cartao-d">{t.texto}</p>}
              </div>
            ))}
          </div>
        )}
        <div className="g-acoes">
          <Link href={`/servir/${b.slug}`} className="acao">
            {b.aberto ? 'Ver e entrar' : 'Ver a área'} <IcSeta />
          </Link>
        </div>
        {!b.aberto && <p className="g-nota">Esta área conversa com cada pessoa antes de qualquer cadastro.</p>}
      </>
    ),
  }));

  return (
    <Site atual="/servir">
      {/* ------------------------------------------------------------- herói */}
      <section className="g-cheio alta centro rev">
        <img src="/fotos/recepcao.webp" alt="Duas pessoas da equipe de recepção conversando na porta da igreja" fetchPriority="high" />
        <div className="g">
          <p className="g-rot">Servir</p>
          <Tit as="h1" className="g-h1">Não sei onde me encaixo</Tit>
          <p className="g-ed">É a resposta mais comum.</p>
          <div className="g-acoes">
            <a href="#areas" className="acao cheia">Ver o que se faz <IcSeta /></a>
            <Link href="/servir" className="acao">Ver as áreas lado a lado</Link>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- as travas */}
      <section className="casa-areia rev">
        <div className="g g-secao">
          <div className="c">
            <p className="g-rot">Antes de escolher</p>
            <Tit className="g-h2">Três dúvidas comuns</Tit>
          </div>
          <div className="c-media c-bloco grande"><Perguntas itens={TRAVAS} /></div>
        </div>
      </section>

      {/* ------------------------------------------------ o trabalho, por área */}
      <section id="areas" className="casa-papel rev" aria-label="O que se faz em cada área">
        <div className="g g-secao">
          <div className="c">
            <p className="g-rot">O que se faz em cada área</p>
            <Tit className="g-h2">O trabalho, não o nome do time</Tit>
            <p className="g-ed">Com as palavras de quem lidera cada área.</p>
          </div>
          <div className="c-larga c-bloco grande">
            {fase === 'carregando' && <Carregando o="Carregando o que cada área faz" />}
            {fase === 'rede' && (
              <Vazio
                titulo="Sem conexão agora"
                texto="Não consegui carregar as áreas. Atualize a página, ou fale com quem te chamou para servir."
                acao={{ href: '/servir', rot: 'Ver as áreas' }}
              />
            )}
            {fase === 'pronto' && <Perguntas itens={itens} className="qa-areas" />}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- fecho
          Tira o peso, não convence. E devolve a lista completa: esta página é
          atalho, nunca funil. */}
      <section className="g-cheio centro fecho rev">
        <img src="/fotos/congregacao.webp" alt="" loading="lazy" decoding="async" />
        <div className="g">
          <p className="g-rot">Em dúvida entre duas?</p>
          <Tit className="g-h2">Escolha qualquer uma das duas.</Tit>
          <p className="g-ed menor">A conversa com a liderança existe para isso, e mudar de área depois é normal aqui.</p>
          <div className="g-acoes">
            <Link href="/servir" className="acao cheia">Ver as áreas <IcSeta /></Link>
          </div>
        </div>
      </section>
    </Site>
  );
}
