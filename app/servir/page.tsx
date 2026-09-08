'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { sbPublico as sb } from '@/lib/supabase';
import { IcSeta } from '@/components/Icones';
import { Site } from '@/components/Site';
import { Tit } from '@/components/Texto';
import { Cabecalho } from '@/components/Pagina';
import { Chevron } from '@/components/Marca';
import { Vazio } from '@/components/Tela';

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

   V3 (08/09/2026): as áreas deixaram de ser cartões com foto e viraram um
   ÍNDICE em tipo grande — nome, o que faz, quantos postos, o chevron. Sem
   foto obrigatória, e a comparação entre áreas fica numa coluna só.

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
      <Cabecalho criativo="servir" rot="Servir" titulo="Encontre seu lugar" ed="Todo trabalho importa."
        acoes={<>
          <a href="#areas" className="acao cheia">Ver as áreas <IcSeta /></a>
          <Link href="/servir/onde-me-encaixo" className="g-link claro">Não sei qual é a minha</Link>
        </>} />

      {/* ------------------------------------------------------------ as áreas */}
      <section id="areas" className="casa-papel rev" aria-label="As áreas">
        <div className="g g-secao">
          <div className="g-cab">
            <div className="g-cab-txt">
              <p className="g-rot">As áreas</p>
              <Tit className="g-h2">Escolha uma e veja o que ela faz</Tit>
              <p className="g-ed">O cadastro leva um minuto.</p>
            </div>
          </div>
          <div className="c-bloco grande">
            {fase === 'carregando' && (
              <ol className="ind" aria-label="Carregando as áreas" aria-busy="true">
                {[0, 1, 2, 3, 4].map(i => <li key={i} className="ind-i esqueleto" />)}
              </ol>
            )}
            {fase === 'rede' && (
              <Vazio
                titulo="Sem conexão agora"
                texto="Não consegui carregar as áreas. Atualize a página, ou fale com quem te chamou para servir."
                acao={{ href: '/', rot: 'Voltar ao início' }}
              />
            )}
            {fase === 'pronto' && (
              <ol className="ind">
                {mins.map((m, i) => (
                  <li key={m.slug} className="ind-i">
                    <Link href={`/servir/${m.slug}`} className="ind-a">
                      <span className="ind-n" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                      <span>
                        <span className="ind-t">{m.nome}</span>
                        {m.descricao && <span className="ind-d">{m.descricao}</span>}
                        <span className="ind-s">
                          {/* FUNÇÃO é o tipo de trabalho (CÂMERA), POSTO é uma posição
                              dele na escala (CÂMERA 1). O campo conta postos. */}
                          {m.postos} {m.postos === 1 ? 'posto' : 'postos'}
                          {!m.aberto && ' · conversa antes'}
                        </span>
                      </span>
                      <span className="ind-chev" aria-hidden="true"><Chevron /></span>
                    </Link>
                  </li>
                ))}
              </ol>
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
