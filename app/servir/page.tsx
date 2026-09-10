'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { sbPublico as sb } from '@/lib/supabase';
import { IcSeta } from '@/components/Icones';
import { Site } from '@/components/Site';
import { Tit } from '@/components/Texto';
import { AreasCarregando, Vazio } from '@/components/Tela';
import { fotoDaArea } from '@/lib/fotos';
import { src as cria, alt as criaAlt } from '@/lib/criativos';
import { canalDeConversa } from '@/lib/igreja';
import { descricaoPublica } from '@/lib/areas-publicas';

/* =============================================================================
   /servir — ONDE A JORNADA COMEÇA

   Antes, "Quero servir" caía direto num formulário. A pessoa nem sabia o que
   existia e já estava digitando o telefone. Cadastro é o quarto passo de uma
   decisão, não o primeiro.

   Esta página faz uma coisa só: mostrar o que existe e deixar escolher. Sem
   campo, sem login, sem explicação longa. Quem já sabe onde quer servir
   clica e segue; quem não sabe lê três linhas por área e decide.

   O CASCO (04/09/2026): esta é a página para onde TODO botão "Quero servir"
   do site aponta, e ela vestia o casco das telas internas — outra barra,
   outro título, outra voz. A pessoa saía de um site e caía num sistema.
   Agora ela usa o casco público (barra, rodapé, grade editorial), e só a
   partir da área escolhida (/servir/[slug]) o fluxo afunila e a navegação
   some de propósito. A lógica de dados não mudou uma linha.

   SOBRE QUANTAS ÁREAS APARECEM AQUI
   Aparece o que o banco tem, e o banco tem o que tem líder, funções e alguém
   para responder. Publicar uma área sem dono é pior que não publicar: a
   pessoa se cadastra, ninguém procura ela, e ela não volta. Abrir área nova
   é um insert e um responsável, não uma mudança de código.
   ============================================================================= */

type Min = {
  slug: string; nome: string; descricao: string | null;
  convite: string | null; postos: number; aberto: boolean; artigo: string;
};

export default function Servir() {
  const [mins, setMins] = useState<Min[]>([]);
  const [fase, setFase] = useState<'carregando' | 'pronto' | 'rede'>('carregando');

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const s = sb(); if (!s) { if (vivo) setFase('rede'); return; }
      const { data, error } = await s.rpc('ministerios_publicos');
      if (!vivo) return;
      if (error) { setFase('rede'); return; }
      setMins((data || []) as Min[]);
      setFase('pronto');
    })();
    return () => { vivo = false; };
  }, []);

  return (
    <Site atual="/servir" escuro>
      {/* ------------------------------------------------------------- herói */}
      <section className="g-cheio alta centro rev">
        <img src={cria('servir')} alt={criaAlt('servir')} fetchPriority="high" />
        <div className="g">
          <p className="g-rot">Servir</p>
          <Tit as="h1" className="g-h1">Encontre seu lugar para servir</Tit>
          {/* O texto de apoio é do Arthur, palavra por palavra (10/09/2026). Ele
              o escreveu como um parágrafo só, e é aqui que ele cabe inteiro: o
              `.g-ed` do herói tem 56ch. O `.g-ed` do `.g-cab` lá embaixo tem
              22ch — slot de etiqueta curta, não de frase. Não quebre em duas. */}
          <p className="g-ed">Deus colocou dons e talentos em cada pessoa. Na GUIA, você pode usá-los para cuidar de pessoas, fortalecer a comunidade e contribuir para o Reino. Escolha uma área de serviço, preencha o formulário e nossa equipe entrará em contato para apresentar os próximos passos.</p>
          <div className="g-acoes">
            <a href="#areas" className="acao cheia">Ver as áreas <IcSeta /></a>
            <Link href="/servir/onde-me-encaixo" className="g-link claro">Não sei qual é a minha</Link>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ as áreas */}
      <section id="areas" className="casa-papel rev" aria-label="As áreas">
        <div className="g g-secao">
          <div className="g-cab">
            <div className="g-cab-txt">
              <p className="g-rot">As áreas</p>
              {/* o h2 é a mesma frase dele, usada como título. A linha de apoio
                  que existia aqui ("...nossa equipe entra em contato...") era
                  uma segunda versão da promessa, em outro tempo verbal; agora a
                  promessa é dita uma vez só, no herói, como ele escreveu. */}
              <Tit className="g-h2">Escolha uma área de serviço</Tit>
            </div>
          </div>
          <div className="c-bloco grande">
            {fase === 'carregando' && <AreasCarregando />}
            {fase === 'rede' && (
              <Vazio
                titulo="Sem conexão agora"
                texto="Não consegui carregar as áreas. Atualize a página, ou fale com quem te chamou para servir."
                acao={{ href: '/', rot: 'Voltar ao início' }}
              />
            )}
            {/* banco sem área publicada: a página diz isso em vez de ficar com
                o título e nada embaixo (08/09/2026) */}
            {fase === 'pronto' && !mins.length && (
              <Vazio
                titulo="Nenhuma área aberta agora"
                texto="As áreas aparecem aqui assim que a liderança abrir as vagas. Enquanto isso, fale com a gente."
                acao={{ href: canalDeConversa('Oi! Vi o site da GUIA e quero servir. Em que área posso ajudar?').href, rot: 'Falar com a gente' }}
              />
            )}
            {fase === 'pronto' && mins.length > 0 && (
              <div className="casa-areas centro rente">
                {mins.map(m => (
                  <Link key={m.slug} href={`/servir/${m.slug}`} className="casa-area corte">
                    <img src={fotoDaArea(m.slug)} alt="" loading="lazy" />
                    <span className="casa-area-nome">{m.nome}</span>
                    {descricaoPublica(m.slug, m.descricao) && <p className="casa-area-desc">{descricaoPublica(m.slug, m.descricao)}</p>}
                    <span className="casa-area-selo">
                      {/* FUNÇÃO é o tipo de trabalho (CÂMERA), POSTO é uma posição
                          dele na escala (CÂMERA 1). O campo conta postos. */}
                      {m.postos} {m.postos === 1 ? 'posto' : 'postos'}
                      {!m.aberto && ' · conversa antes'}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ quem já serve */}
      <section className="casa-areia rev">
        <div className="g g-secao justa">
          <div className="c">
            <p className="g-rot">Já serve na GUIA?</p>
            <Tit className="g-h2">Seu espaço tem sua escala, seus dias e seu líder</Tit>
            <div className="g-acoes">
              <Link href="/eu" className="acao cheia">Acessar meu espaço <IcSeta /></Link>
            </div>
          </div>
        </div>
      </section>
    </Site>
  );
}
