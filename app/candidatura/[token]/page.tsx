'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { sbPublico as sb } from '@/lib/supabase';
import { Logo } from '@/components/Marca';
import { IcSeta, IcCheck } from '@/components/Icones';
import { fotoDaArea, focoDaArea } from '@/lib/fotos';

/* =============================================================================
   /candidatura/[token] — ONDE EU ESTOU

   "Formulário enviado com sucesso" é o pior fim possível para um cadastro de
   voluntário: a pessoa acabou de se oferecer para alguma coisa e não sabe se
   alguém viu, quem vai falar com ela, nem quando.

   Esta é uma página que a pessoa guarda e volta nela durante dias. Por isso
   responde sempre as mesmas três perguntas, na mesma ordem:

     onde estou   passo N de 4, com os quatro visíveis
     o que agora  a única coisa que depende dela, se depender
     e depois     o que vem, para não parecer que acabou

   TRÊS COISAS QUE MUDARAM DEPOIS DE RODAR A JORNADA DE VERDADE

   1. A tela se contradizia. No segundo seguinte ao envio, o topo dizia
      "Recebemos seu cadastro" e a lista logo abaixo marcava "Cadastro
      enviado" como passo FUTURO, escrevendo "Passo 1 de 6". A lista era um
      array fixo aqui no arquivo, e o número vinha do banco: dois donos para
      a mesma verdade.

   2. A jornada era contada de três jeitos: quatro passos na home, cinco na
      página da área, seis aqui. Agora o número vem do banco (`etapa_de` de
      `etapa_total`) e as três telas contam a mesma coisa.

   3. Aprovada, a pessoa lia "a liderança vai te mandar o seu link pessoal" —
      enquanto o link já existia no banco. Agora ele é entregue aqui.
   ============================================================================= */

type Status = {
  ok: boolean; erro?: string;
  status: string; etapa: number; etapa_de: number; etapa_total: number;
  titulo: string; texto: string; proximo_passo: string;
  nome: string; equipe: string; equipe_slug: string; funcoes: string[]; artigo: string;
  responsavel: string | null; whatsapp: string | null;
  tem_quem_falar: boolean; link_pessoal: string | null;
};

/* Os quatro tempos, do jeito que acontecem. Os rótulos são daqui porque são
   linguagem de tela; QUAL deles está valendo vem do banco. */
const CAMINHO = [
  { rot: 'Cadastro enviado', txt: 'Suas informações chegaram para quem organiza a área.' },
  { rot: 'Conversa com a liderança', txt: 'Uma conversa rápida para te conhecer e ver onde você se encaixa.' },
  { rot: 'Entrada no time', txt: 'Seu nome passa a aparecer na lista da área.' },
  { rot: 'Primeira escala', txt: 'Você diz os dias em que pode, e recebe sua escala.' },
];

export default function Candidatura() {
  const { token } = useParams<{ token: string }>();
  const [d, setD] = useState<Status | null>(null);
  const [fase, setFase] = useState<'carregando' | 'ok' | 'erro' | 'rede'>('carregando');

  const carregar = useCallback(async () => {
    const s = sb(); if (!s) { setFase('rede'); return; }
    const { data, error } = await s.rpc('candidatura_status', { p_token: token });
    if (error) { setFase('rede'); return; }
    const r = data as Status;
    if (!r?.ok) { setFase('erro'); return; }
    setD(r);
    try { document.title = `Meu caminho · ${r.equipe}`; } catch {}
    setFase('ok');
  }, [token]);

  useEffect(() => { void carregar(); }, [carregar]);

  const Barra = () => (
    <div className="vol-barra">
      <div className="vol-barra-in">
        <Link href="/" aria-label="GUIA Church"><Logo className="logo" /></Link>
        <Link className="vol-quem" href="/servir">Ver as áreas</Link>
      </div>
    </div>
  );

  if (fase === 'carregando') return (
    <div className="vol"><Barra />
      <div className="vol-in"><div className="vol-chamada">
        <span className="rot">Seu cadastro</span><h1>Carregando</h1>
      </div></div>
    </div>
  );

  if (fase !== 'ok' || !d) return (
    <div className="vol"><Barra />
      <div className="vol-in"><div className="vol-chamada">
        <span className="rot">Seu cadastro</span>
        <h1>{fase === 'erro' ? 'Esse link não vale' : 'Sem conexão agora'}</h1>
        <p className="vol-sub">
          {fase === 'erro'
            ? 'Links são únicos e podem ter vindo cortados pelo WhatsApp. Você pode se cadastrar de novo, é rápido.'
            : 'Atualize a página. O link continua valendo.'}
        </p>
        <div className="vol-btns" style={{ maxWidth: 340 }}>
          <Link href="/servir" className="vol-bt" style={{ background: 'var(--noite)', color: '#fff', borderColor: 'var(--noite)' }}>
            Ver as áreas
          </Link>
        </div>
      </div></div>
    </div>
  );

  const encerrada = d.etapa === 0;
  const na = d.artigo === 'a' ? 'na' : 'no';
  const primeiro = (d.nome || '').split(' ')[0];
  const zap = d.whatsapp
    ? `https://wa.me/${d.whatsapp.length <= 11 ? '55' + d.whatsapp : d.whatsapp}` +
      `?text=${encodeURIComponent(`Oi! Sou ${d.nome}, me cadastrei ${na} ${d.equipe} pelo site da GUIA.`)}`
    : null;

  return (
    <div className="vol">
      <Barra />

      {/* a área que a pessoa escolheu, para ela reconhecer onde está */}
      <section className="porta-hero porta-hero-min">
        <img className="porta-hero-foto" src={fotoDaArea(d.equipe_slug)}
          style={{ objectPosition: focoDaArea(d.equipe_slug) }} alt="" />
        <div className="porta-hero-in">
          <span className="rot" style={{ color: 'rgba(255,255,255,.6)' }}>
            {primeiro}, seu caminho {na} {d.equipe}
          </span>
          <h1 style={{ marginTop: 18 }}>{d.titulo}</h1>
          <p className="porta-hero-sub">{d.texto}</p>
        </div>
      </section>

      <div className="vol-in">

        {/* 1. O QUE ACONTECE AGORA. A pergunta que a pessoa abriu a página
            para responder, então vem antes de tudo. */}
        <section className="vol-secao" style={{ marginTop: 'var(--e6)' }}>
          <div className="vol-secao-cab">
            <span className="rot">O que acontece agora</span>
            {!encerrada && <span className="vol-secao-nota">Passo {d.etapa_de} de {d.etapa_total}</span>}
          </div>
          <p style={{ margin: '20px 0 0', fontSize: 'var(--d-lead)', lineHeight: 1.6, maxWidth: '46ch' }}>
            {d.proximo_passo}
          </p>

          {/* AQUI A JORNADA FECHA: aprovada, o espaço é entregue na hora, e
              não por um recado que alguém precisa lembrar de mandar. */}
          {d.link_pessoal && (
            <div className="vol-btns" style={{ marginTop: 24, maxWidth: 400 }}>
              <Link href={`/eu/${d.link_pessoal}`} className="vol-bt"
                style={{ background: 'var(--noite)', color: '#fff', borderColor: 'var(--noite)' }}>
                <IcCheck /> Abrir meu espaço
              </Link>
            </div>
          )}
          {/* QUAL PÁGINA GUARDAR MUDA AQUI. Enquanto a candidatura anda, o
              endereço que importa é este. Depois de aprovada, é o espaço
              pessoal: mandar salvar "esta página" ao lado de um botão que leva
              para outra era apontar para o lugar errado no único momento em
              que a pessoa presta atenção no endereço. */}
          {d.link_pessoal ? (
            <p className="vol-nota">
              O endereço que abre ali é seu e de mais ninguém. Salve nos favoritos:
              é por ele que você entra daqui em diante.
            </p>
          ) : !encerrada && (
            <p className="vol-nota">
              Guarde este link. É por ele que você acompanha, e ele continua valendo.
            </p>
          )}

          {zap && !d.link_pessoal && (
            <a className="vol-zap" href={zap} target="_blank" rel="noreferrer">
              Falar com {d.responsavel} <IcSeta />
            </a>
          )}
          {!d.tem_quem_falar && !d.link_pessoal && !encerrada && (
            <p className="vol-nota">
              Você vai ser procurado pelo WhatsApp que cadastrou. Não precisa fazer
              mais nada agora.
            </p>
          )}
        </section>

        {/* 2. ONDE ESTOU. Quatro tempos, e o número vem do banco: a tela não
            inventa mais a própria contagem. */}
        {!encerrada && (
          <section className="vol-secao">
            <div className="vol-secao-cab"><span className="rot">Onde você está</span></div>
            {CAMINHO.map((e, i) => {
              const n = i + 1;
              const cls = n < d.etapa_de ? 'ok' : n === d.etapa_de ? 'pend' : '';
              return (
                <div className={`vol-linha ${cls}`} key={e.rot}>
                  <span className="vol-marca" aria-hidden="true" />
                  <span>
                    <span className="vol-linha-dia">{e.rot}</span>
                    <span className="vol-linha-fn" style={{ textTransform: 'none', letterSpacing: 0, fontSize: 'var(--t-apoio)' }}>
                      {e.txt}
                    </span>
                  </span>
                  <span className="vol-linha-est">
                    {n < d.etapa_de ? 'feito' : n === d.etapa_de ? 'agora' : ''}
                  </span>
                </div>
              );
            })}
          </section>
        )}

        {/* 3. O QUE EU MANDEI. Fecha a dúvida "será que foi?" sem exigir nada. */}
        <section className="vol-secao">
          <div className="vol-secao-cab"><span className="rot">O que você enviou</span></div>
          <div className="vol-eq" style={{ paddingTop: 8 }}>
            <div className="vol-eq-linha">
              <span className="vol-eq-rot">Área</span>
              <span className="vol-eq-val">{d.equipe}</span>
            </div>
            <div className="vol-eq-linha">
              <span className="vol-eq-rot">Onde quer servir</span>
              <span className="vol-eq-val">{d.funcoes?.length ? d.funcoes.join(', ') : 'A definir na conversa'}</span>
            </div>
            <div className="vol-eq-linha">
              <span className="vol-eq-rot">Seu nome</span>
              <span className="vol-eq-val">{d.nome}</span>
            </div>
          </div>
        </section>

        {encerrada && (
          <div style={{ marginTop: 'var(--e6)' }}>
            <Link href="/servir" className="vol-bt"
              style={{ background: 'var(--noite)', color: '#fff', borderColor: 'var(--noite)', display: 'inline-flex' }}>
              Ver as outras áreas
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
