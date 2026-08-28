'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { sbPublico as sb } from '@/lib/supabase';
import { IcSeta } from '@/components/Icones';
import { Tela, Cabeca, Carregando, Vazio } from '@/components/Tela';

/* =============================================================================
   /eu — A PORTA DO ESPAÇO DO VOLUNTÁRIO

   Quem já serve tinha que descobrir sozinho que o caminho era achar o próprio
   nome numa lista dentro da página da equipe. Isso não é porta, é atalho de
   quem construiu o sistema.

   Agora existe um endereço curto para dizer no grupo e escrever num aviso:
   guiaservir.com/eu. Uma pergunta só — em que área você serve — e a partir
   dali a pessoa acha o nome e entra com o PIN.

   Por que não pedir o telefone aqui: sem sessão, um campo de telefone que
   responde "existe / não existe" vira consulta aberta de cadastro para
   qualquer um com a chave pública. A lista por equipe já é pública por
   desenho (a escala é afixada na parede), e o PIN é o que protege o que é
   pessoal. Manter a mesma porta é mais seguro do que abrir uma nova.
   ============================================================================= */

type Min = { slug: string; nome: string; postos: number };

export default function PortaDoEspaco() {
  const [mins, setMins] = useState<Min[]>([]);
  const [fase, setFase] = useState<'carregando' | 'pronto' | 'rede'>('carregando');

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const s = sb(); if (!s) { if (vivo) setFase('rede'); return; }
      const { data, error } = await s.rpc('ministerios_publicos');
      if (!vivo) return;
      if (error) { setFase('rede'); return; }
      setMins((data || []) as Min[]); setFase('pronto');
    })();
    return () => { vivo = false; };
  }, []);

  return (
    <Tela volta="/" voltaRot="Início">
      <main className="tela-corpo tela-estreita">
        <Cabeca
          rot="Espaço do voluntário"
          titulo="Acessar meu espaço"
          apoio="Sua escala, seus dias e seu líder. Comece dizendo em que área você serve."
        />

        {fase === 'carregando' && <Carregando o="Carregando as áreas" />}
        {fase === 'rede' && (
          <Vazio titulo="Sem conexão agora"
                 texto="Não consegui carregar as áreas. Atualize a página."
                 acao={{ href: '/', rot: 'Voltar ao início' }} />
        )}

        {fase === 'pronto' && (
          <>
            <div>
              {mins.map(m => (
                <Link key={m.slug} href={`/equipe/${m.slug}`} className="escolha">
                  <span className="escolha-txt">
                    <span className="escolha-nome">{m.nome}</span>
                    <p className="escolha-desc">Ache seu nome na lista e entre com seu PIN.</p>
                  </span>
                  <span className="escolha-fim" aria-hidden="true"><IcSeta /></span>
                </Link>
              ))}
            </div>

            <div style={{ textAlign: 'center', marginTop: 'var(--e7)' }}>
              <span className="rot">Ainda não tenho PIN</span>
              <p style={{ margin: '20px auto 0', maxWidth: '46ch', fontSize: 'var(--t-ui)', lineHeight: 1.7, color: 'var(--cinza)' }}>
                Sem problema. Ache seu nome na lista da sua área e crie o PIN na
                hora, com quatro números.
              </p>
            </div>

            <div style={{ textAlign: 'center', marginTop: 'var(--e6)' }}>
              <span className="rot">Não sirvo ainda</span>
              <p style={{ margin: '20px auto 26px', maxWidth: '44ch', fontSize: 'var(--t-ui)', lineHeight: 1.7, color: 'var(--cinza)' }}>
                Existe lugar. Veja as áreas e escolha por onde começar.
              </p>
              <Link href="/servir" className="acao">Quero servir <IcSeta /></Link>
            </div>
          </>
        )}
      </main>
    </Tela>
  );
}
