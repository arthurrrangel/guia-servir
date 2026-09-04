'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { sbPublico as sb } from '@/lib/supabase';
import { IcSeta } from '@/components/Icones';
import { Site } from '@/components/Site';
import { Tit } from '@/components/Texto';
import { Carregando, Vazio } from '@/components/Tela';
import { fotoDaArea } from '@/lib/fotos';

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
    <Site atual="/servir">
      {/* ------------------------------------------------------------- herói */}
      <section className="g-cheio alta centro rev">
        <img src="/fotos/midia.webp" alt="Equipe Creative na mesa de transmissão do culto" fetchPriority="high" />
        <div className="g">
          <p className="g-rot">Servir</p>
          <Tit as="h1" className="g-h1">Encontre seu lugar</Tit>
          <p className="g-ed">Todo trabalho importa.</p>
          <div className="g-acoes">
            <a href="#areas" className="acao cheia">Ver as áreas <IcSeta /></a>
            <Link href="/servir/onde-me-encaixo" className="acao">Não sei qual é a minha</Link>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ as áreas */}
      <section id="areas" className="casa-papel rev" aria-label="As áreas">
        <div className="g g-secao">
          <div className="c">
            <p className="g-rot">As áreas</p>
            <Tit className="g-h2">Escolha uma e veja o que ela faz</Tit>
            <p className="g-ed">O cadastro leva um minuto.</p>
          </div>
          <div className="c-bloco grande">
            {fase === 'carregando' && <Carregando o="Carregando as áreas" />}
            {fase === 'rede' && (
              <Vazio
                titulo="Sem conexão agora"
                texto="Não consegui carregar as áreas. Atualize a página, ou fale com quem te chamou para servir."
                acao={{ href: '/', rot: 'Voltar ao início' }}
              />
            )}
            {fase === 'pronto' && (
              <div className="casa-areas centro rente">
                {mins.map(m => (
                  <Link key={m.slug} href={`/servir/${m.slug}`} className="casa-area corte">
                    <img src={fotoDaArea(m.slug)} alt="" loading="lazy" />
                    <span className="casa-area-nome">{m.nome}</span>
                    {m.descricao && <p className="casa-area-desc">{m.descricao}</p>}
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
