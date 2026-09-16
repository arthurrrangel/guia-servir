'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { sbPublico as sb } from '@/lib/supabase';
import { IcSeta } from '@/components/Icones';
import { Agora } from '@/components/Agora';
import { fotoDaArea, fotoDaAreaCelular, focoDaArea } from '@/lib/fotos';
import { Schema } from '@/components/Texto';
import Movimento from '@/components/Movimento';
import { Barra, Rodape } from '@/components/Site';
import PassoFixo from '@/components/PassoFixo';
import { AreasCarregando } from '@/components/Tela';
import { IGREJA, SITE, MAPA as MAPA_SCHEMA } from '@/lib/igreja';
import ProximoCulto from '@/components/ProximoCulto';
import Abertura from '@/components/Abertura';
import { src as cria, alt as criaAlt, video as criaVideo, fontes } from '@/lib/criativos';
import { descricaoPublica } from '@/lib/areas-publicas';

/* =============================================================================
   A HOME · TRÊS TELAS

   16/09/2026. A versão anterior tinha vinte blocos empilhados: no celular
   dava 5.981px de rolagem (sete telas) para dizer o que cabe em três. Era o
   desktop empilhado, não uma página desenhada para o polegar: o mesmo cartão
   escuro com foto repetido sete vezes, uma faixa de números que não decide
   nada para quem visita, e a sigla presa ao scroll gastando três telas.

   O QUE A HOME RESOLVE, E SÓ ISSO
   Um visitante no celular quer três respostas (quando, onde, como é) e um
   passo (ir, assistir, achar um grupo, servir). Cada tela responde uma coisa:

     1. HERÓI      pessoas, a próxima coisa que acontece, um botão.
     2. CAMINHOS   "o que você quer fazer": quatro portas, lista de toque.
     3. ROSTOS     as áreas com foto vertical, num rolo de polegar, e o fecho.

   O que saiu daqui continua existindo onde pertence: a sigla em /sobre, o
   campus e a transmissão dentro de "Visitar" e "Assistir", os números no
   painel do organizador. A barra fixa de próximo passo (components/PassoFixo)
   fica embaixo do polegar em toda página pública.

   NADA DE TÍTULO PALAVRA POR PALAVRA. A revelação por seção (.rev) fica; a
   por palavra saiu: era o efeito que todo site tem, e no celular ela atrasava
   o primeiro texto que a pessoa lê.
   ============================================================================= */

type Min = {
  slug: string; nome: string; descricao: string | null;
  convite: string | null; postos: number; aberto: boolean; artigo: string;
};

/* Os quatro caminhos, na ordem da decisão: tirar alguém de casa vem antes de
   qualquer outra coisa; servir é de quem já decidiu ficar. */
const CAMINHOS = [
  { href: '/cultos', t: 'Visitar no domingo', d: null, nota: 'Tem alguém na porta.' },
  { href: '/guia-church-tv', t: 'Assistir ao vivo', d: `${IGREJA.cultoDia}, ${IGREJA.cultoHora}, pela ${IGREJA.canalNome}.`, nota: null },
  { href: '/pequena-guia', t: 'Achar uma Pequena Guia', d: 'Um grupo perto de você, durante a semana.', nota: null },
  { href: '/servir', t: 'Servir na GUIA', d: 'Cinco áreas. Ninguém começou sabendo.', nota: null },
];

export default function Casa() {
  const [mins, setMins] = useState<Min[]>([]);
  const [fase, setFase] = useState<'carregando' | 'pronto' | 'rede'>('carregando');
  const [solida, setSolida] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const fio = useRef<HTMLDivElement>(null);
  const filme = useRef<HTMLVideoElement>(null);
  const VIDEO = criaVideo('heroi');

  /* O VÍDEO DO HERÓI RESPEITA "REDUZIR MOVIMENTO": quem pediu isso no
     aparelho vê a foto de capa parada, não um loop. E fora da tela ele pausa,
     para não gastar bateria decodificando o que ninguém está vendo. */
  useEffect(() => {
    const v = filme.current; if (!v) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { v.removeAttribute('autoplay'); v.pause(); return; }
    const obs = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) void v.play().catch(() => {}); else v.pause(); }));
    obs.observe(v);
    return () => obs.disconnect();
  }, []);

  /* O LINK DE ACESSO DO ORGANIZADOR CAÍA AQUI E MORRIA.
     O email volta para o endereço do site com o token no fragmento
     (#access_token=…). A home fala com o banco pelo cliente PÚBLICO, que não
     olha para a URL de propósito. Quem reencaminha é o navegador, aqui. É rede
     de segurança: o caminho principal é o emailRedirectTo apontando para
     /entrar. */
  useEffect(() => {
    const h = window.location.hash;
    if (/[#&](access_token|error_code|error_description)=/.test(h)) {
      window.location.replace('/entrar' + h);
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const s = sb();
      if (!s) { if (vivo) setFase('rede'); return; }
      const lista = await s.rpc('ministerios_publicos');
      if (!vivo) return;
      if (lista.error) { setFase('rede'); return; }
      setMins((lista.data || []) as Min[]);
      setFase('pronto');
    })();
    return () => { vivo = false; };
  }, []);

  /* A REVELAÇÃO POR SEÇÃO. O observador marca .rev → .visto quando a seção
     entra; a rolagem também revela (uma rolagem rápida saltava seções entre
     dois quadros do observador); e uma rede de 1,2s revela o que sobrou.
     Conteúdo invisível é pior que conteúdo sem animação. Reobserva quando as
     áreas chegam do banco, porque o rolo de rostos entra no DOM depois. */
  useEffect(() => {
    const r = raiz.current; if (!r) return;
    const parado = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    r.classList.add('js-rev');
    const revelaTudo = () => r.querySelectorAll('.rev:not(.visto)').forEach(e => e.classList.add('visto'));
    if (parado) { r.classList.add('nao-anima'); revelaTudo(); return; }

    const obs = new IntersectionObserver(
      es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visto'); obs.unobserve(e.target); } }),
      { rootMargin: '0px 0px 25% 0px' },
    );
    const pendentes = Array.from(r.querySelectorAll<HTMLElement>('.rev:not(.visto)'));
    pendentes.forEach(e => obs.observe(e));

    let pedindo = false;
    const varre = () => {
      pedindo = false;
      const limite = window.innerHeight * 1.25;
      for (let i = pendentes.length - 1; i >= 0; i--) {
        const e = pendentes[i];
        if (e.classList.contains('visto')) { pendentes.splice(i, 1); continue; }
        const rect = e.getBoundingClientRect();
        if (rect.top < limite) {
          if (rect.bottom < 0) e.style.transition = 'none';
          e.classList.add('visto'); obs.unobserve(e); pendentes.splice(i, 1);
        }
      }
      if (!pendentes.length) window.removeEventListener('scroll', aoRolar);
    };
    const aoRolar = () => { if (!pedindo) { pedindo = true; requestAnimationFrame(varre); } };
    window.addEventListener('scroll', aoRolar, { passive: true });
    const rede = setTimeout(varre, 1200);
    return () => { obs.disconnect(); clearTimeout(rede); window.removeEventListener('scroll', aoRolar); };
  }, [fase]);

  /* barra opaca depois do herói e o fio de progresso, num handler só, em rAF */
  useEffect(() => {
    let pedindo = false;
    const medir = () => {
      pedindo = false;
      const y = window.scrollY, h = window.innerHeight;
      setSolida(y > h * 0.78);
      const total = document.documentElement.scrollHeight - h;
      if (fio.current) fio.current.style.setProperty('--p', String(total > 0 ? Math.min(1, y / total) : 0));
    };
    const aoRolar = () => { if (!pedindo) { pedindo = true; requestAnimationFrame(medir); } };
    medir();
    window.addEventListener('scroll', aoRolar, { passive: true });
    window.addEventListener('resize', aoRolar, { passive: true });
    return () => { window.removeEventListener('scroll', aoRolar); window.removeEventListener('resize', aoRolar); };
  }, []);

  return (
    <div ref={raiz} data-movimento>
      <Movimento semRevelar />
      <Abertura />
      {/* A ENTIDADE. O endereço diz "guiaservir"; o que o Google lê como
          identidade é este bloco. Nada aqui é escrito à mão: sai de
          lib/igreja.ts, a mesma fonte de /como-chegar e do rodapé. */}
      <Schema dados={{
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebSite', '@id': `${SITE}/#site`,
            url: SITE, name: IGREJA.nome, inLanguage: 'pt-BR',
            publisher: { '@id': `${SITE}/#igreja` },
          },
          {
            '@type': 'Church', '@id': `${SITE}/#igreja`,
            name: IGREJA.nome, slogan: IGREJA.frase, url: SITE,
            image: `${SITE}/og.jpg`, hasMap: MAPA_SCHEMA,
            sameAs: [IGREJA.instagram, ...(IGREJA.youtube ? [IGREJA.youtube] : [])],
            address: {
              '@type': 'PostalAddress',
              streetAddress: IGREJA.rua,
              addressLocality: `${IGREJA.bairro}, ${IGREJA.cidade}`,
              addressRegion: IGREJA.uf, postalCode: IGREJA.cep, addressCountry: 'BR',
            },
            openingHoursSpecification: [{
              '@type': 'OpeningHoursSpecification',
              dayOfWeek: 'https://schema.org/Sunday', opens: '10:00', closes: '12:00',
            }],
          },
        ],
      }} />
      <div className="progresso" ref={fio} style={{ color: solida ? 'var(--noite)' : '#fff' }} aria-hidden="true" />

      <a href="#conteudo" className="pular">Pular para o conteúdo</a>
      <Barra inicio solida={solida} />

      <main id="conteudo" style={{ maxWidth: 'none', margin: 0, padding: 0 }}>
      {/* ------------------------------------------------------- 1 · HERÓI
          Pessoas de ponta a ponta. No celular o corte é vertical, feito à
          mão, com o rosto em cima e o texto embaixo, na zona do polegar. */}
      <section className="casa-heroi h-heroi rev visto">
        {VIDEO ? (
          <video ref={filme} className="casa-heroi-foto" autoPlay muted loop playsInline
                 poster={cria('heroi')} preload="metadata" aria-hidden="true" tabIndex={-1}>
            <source src={VIDEO} type="video/mp4" />
          </video>
        ) : (
          <picture>
            {fontes('heroi').map((f, i) => <source key={i} media={f.media} type={f.type} srcSet={f.srcSet} />)}
            <img className="casa-heroi-foto" src={cria('heroi')} alt={criaAlt('heroi')} fetchPriority="high" decoding="async" />
          </picture>
        )}
        <div className="casa-heroi-in h-in">
          {/* a pílula viva: a próxima coisa que acontece na igreja, calculada
              no aparelho (lib/semana.ts), com a ação certa para o momento */}
          <Agora pill />
          <h1 className="h-h1">Existe um lugar para você</h1>
          <p className="h-frase">{IGREJA.frase}.</p>
          <div className="acoes h-acoes">
            <Link href="/cultos" className="acao cheia">Quero conhecer</Link>
            <Link href="/servir" className="g-link claro">Quero servir</Link>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------- 2 · CAMINHOS
          A pergunta que a home responde: o que você quer fazer? Quatro portas
          numa lista de toque (linha inteira tocável, 72px de altura). No
          desktop, as mesmas quatro lado a lado. A data do domingo é de
          verdade, calculada no aparelho. */}
      <section className="caminhos-sec rev" aria-labelledby="caminhos-t">
        <div className="g">
          <div className="c">
            <p className="g-rot">Por onde começar</p>
            <h2 id="caminhos-t" className="g-h2 h-h2">O que você quer fazer?</h2>
          </div>
          <nav className="caminhos" aria-label="Caminhos">
            {CAMINHOS.map((c, i) => (
              <Link key={c.href} href={c.href} className="caminho">
                <span className="caminho-n" aria-hidden="true">0{i + 1}</span>
                <span className="caminho-txt">
                  <span className="caminho-t">{c.t}</span>
                  <span className="caminho-d">
                    {i === 0 ? <><ProximoCulto /> · {IGREJA.bairro}. {c.nota}</> : c.d}
                  </span>
                </span>
                <IcSeta />
              </Link>
            ))}
          </nav>
        </div>
      </section>

      {/* ----------------------------------------------------- 3 · ROSTOS
          A igreja não é o prédio. As áreas com foto vertical e a pessoa no
          centro: no celular, um rolo de polegar com encaixe; no desktop, a
          fileira. Toca e vai para a área. */}
      <section id="areas" className="rostos-sec casa-papel rev" aria-labelledby="rostos-t">
        <div className="g">
          <div className="c">
            <p className="g-rot">Servir</p>
            <h2 id="rostos-t" className="g-h2 h-h2">A igreja não é o prédio</h2>
            <p className="g-ed">São pessoas que chegaram mais cedo.</p>
          </div>
        </div>

        {fase === 'carregando' && <div className="g"><AreasCarregando /></div>}
        {fase === 'rede' && (
          <p className="g-corpo c">Não consegui carregar as áreas agora. Atualize a página.</p>
        )}
        {fase === 'pronto' && !mins.length && (
          <p className="g-corpo c">As áreas aparecem aqui assim que a liderança abrir as vagas.</p>
        )}
        {fase === 'pronto' && !!mins.length && (
          <div className="rostos" role="list" aria-label="Áreas para servir">
            {mins.map(m => {
              const cel = fotoDaAreaCelular(m.slug);
              return (
                <Link key={m.slug} href={`/servir/${m.slug}`} className="rosto" role="listitem">
                  <picture>
                    {cel && <source media="(max-width: 899px)" type="image/avif" srcSet={cel.avif} />}
                    {cel && <source media="(max-width: 899px)" srcSet={cel.webp} />}
                    <img src={fotoDaArea(m.slug)} alt="" loading="lazy" decoding="async"
                         style={{ objectPosition: focoDaArea(m.slug) }} />
                  </picture>
                  <span className="rosto-txt">
                    <span className="rosto-nome">{m.nome}</span>
                    <span className="rosto-selo">
                      {m.postos} {m.postos === 1 ? 'posto' : 'postos'}{!m.aberto && ' · conversa antes'}
                    </span>
                    {descricaoPublica(m.slug, m.descricao) && (
                      <span className="rosto-desc">{descricaoPublica(m.slug, m.descricao)}</span>
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
        <div className="g g-acoes centro g-acoes-fecha">
          <Link href="/servir" className="acao cheia">Ver todas as áreas <IcSeta /></Link>
        </div>
      </section>

      {/* --------------------------------------------------------- FECHO */}
      <section className="g-cheio centro fecho rev">
        <img src={cria('fecho')} alt={criaAlt('fecho')} loading="lazy" decoding="async" />
        <div className="g">
          <p className="g-rot">Sempre cabe mais um</p>
          <h2 className="g-h2 h-h2">Ninguém aqui começou sabendo.</h2>
          <div className="g-acoes">
            <Link href="/servir" className="acao cheia">Encontrar minha área <IcSeta /></Link>
            <Link href="/eu" className="g-link claro">Já sirvo · abrir meu espaço</Link>
          </div>
        </div>
      </section>
      </main>

      <Rodape />
      <PassoFixo />
    </div>
  );
}
