'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { sbPublico as sb } from '@/lib/supabase';
import { IcSeta } from '@/components/Icones';
import { Tela, Cabeca, Carregando, Vazio } from '@/components/Tela';
import { fotoDaArea } from '@/lib/fotos';

/* =============================================================================
   /servir — ONDE A JORNADA COMEÇA

   Antes, "Quero servir" caía direto num formulário. A pessoa nem sabia o que
   existia e já estava digitando o telefone. Cadastro é o quarto passo de uma
   decisão, não o primeiro.

   Esta tela faz uma coisa só: mostrar o que existe e deixar escolher. Sem
   campo, sem login, sem explicação longa. Quem já sabe onde quer servir
   clica e segue; quem não sabe lê três linhas por área e decide.

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
    <Tela volta="/" voltaRot="Início">
      <main className="tela-corpo">
        <Cabeca
          rot="Servir"
          titulo="Encontre seu lugar"
          apoio="Todo trabalho importa. Escolha uma área para ver o que ela faz, quais funções existem e como entrar."
        />

        {/* a tese da página, e não um enfeite: ela responde a pergunta que a
            pessoa não faz em voz alta, que é "servir é coisa de quem sobra
            tempo?". Vem do texto da casa. */}
        <blockquote className="versiculo" style={{ margin: '0 auto var(--e7)' }}>
          Serviço é característica de liderança no Reino. Quem serve se torna
          protagonista e agente de mudança na sociedade.
          <cite>GUIA Church</cite>
        </blockquote>

        {fase === 'carregando' && <Carregando o="Carregando as áreas" />}
        {fase === 'rede' && (
          <Vazio
            titulo="Sem conexão agora"
            texto="Não consegui carregar as áreas. Atualize a página, ou fale com quem te chamou para servir."
            acao={{ href: '/', rot: 'Voltar ao início' }}
          />
        )}

        {fase === 'pronto' && (
          <>
            <div className="grade">
              {mins.map(m => (
                <Link key={m.slug} href={`/servir/${m.slug}`} className="casa-area">
                  <img src={fotoDaArea(m.slug)} alt="" loading="lazy" />
                  <span className="casa-area-nome">{m.nome}</span>
                  {m.descricao && <p className="casa-area-desc">{m.descricao}</p>}
                  <span className="casa-area-selo">
                    {/* CONTAVA POSTO E ESCREVIA "FUNÇÃO".
                        O campo é `postos`, e a tela seguinte agrupa posto em
                        família: a Mídia dizia "9 funções" aqui e listava 7
                        itens lá. Quem contou, contou errado por causa da
                        gente. As duas palavras existem e querem dizer coisas
                        diferentes: FUNÇÃO é o tipo de trabalho (CÂMERA),
                        POSTO é uma posição dele na escala (CÂMERA 1). */}
                    {m.postos} {m.postos === 1 ? 'posto' : 'postos'}
                    {!m.aberto && ' · conversa antes'}
                  </span>
                </Link>
              ))}
            </div>

            {/* quem já serve não veio para cá, mas chega aqui por engano o
                tempo todo. Uma linha, no fim, sem competir com o resto. */}
            <div style={{ textAlign: 'center', marginTop: 'var(--e7)' }}>
              <span className="rot">Já serve na GUIA?</span>
              <p style={{ margin: '20px auto 26px', maxWidth: '44ch', fontSize: 'var(--t-ui)', lineHeight: 1.7, color: 'var(--cinza)' }}>
                Seu espaço tem sua escala, seus dias e seu líder.
              </p>
              <Link href="/eu" className="acao">Acessar meu espaço <IcSeta /></Link>
            </div>
          </>
        )}
      </main>
    </Tela>
  );
}
