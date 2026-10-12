'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { rpc } from '@/lib/publico';
import { telefoneOk } from '@/lib/nome';
import { AREAS, AREAS_ORDEM, type Area } from '@/lib/site/areas';
import { Img, Visto, Arroba, Vozes, Seta, fim, liga, ligaTexto } from './Blocos';
import type { LugarDeFoto } from '@/lib/site/fotos';
import { Trilho } from './Trilho';

/* =============================================================================
   AS PEÇAS VIVAS DA /servir · 11/10/2026

   Três componentes de cliente, porque três coisas vêm do banco ou vão para
   ele: os NÚMEROS (pessoas, áreas, postos, encontros no mês), as ÁREAS (os
   cinco cartões, com o número de postos de cada uma) e o FORMULÁRIO do fim
   (nome, WhatsApp, área), que guarda o rascunho e leva a pessoa para o
   cadastro da área, onde ela marca as funções.

   Os números e as áreas nascem no HTML com o que a copy diz (o Google e a
   prévia do WhatsApp leem números, não um vazio) e trocam pelos do banco
   assim que a RPC responde. Sem rede, a página continua inteira.
   ============================================================================= */

type Numeros = { pessoas: number; ministerios: number; postos: number; cultos_no_mes: number };
type Min = { slug: string; nome: string; descricao: string | null; postos: number; aberto: boolean; artigo: string };

const NUM_COPY: Numeros = { pessoas: 82, ministerios: 5, postos: 47, cultos_no_mes: 9 };

/* a contagem que sobe quando a faixa entra na tela */
function useContagem(alvo: number, ativo: boolean) {
  const [v, setV] = useState(alvo);
  const rodou = useRef(false);
  useEffect(() => {
    if (!ativo) return;
    if (rodou.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(alvo); return; }
    rodou.current = true;
    const t0 = performance.now(), dur = 1100;
    let id = 0;
    const passo = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      setV(Math.round(alvo * (1 - Math.pow(1 - p, 3))));
      if (p < 1) id = requestAnimationFrame(passo);
    };
    setV(0); id = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(id);
  }, [alvo, ativo]);
  return v;
}

/* os números do banco, compartilhados entre o herói, a faixa e o fim: uma
   consulta só por página, por mais que três peças perguntem */
let promessa: Promise<Numeros> | null = null;
function buscarNumeros(): Promise<Numeros> {
  if (!promessa) {
    promessa = rpc<Numeros | Numeros[]>('numeros_publicos').then(n => {
      const nd = Array.isArray(n.data) ? n.data[0] : n.data;
      if (!n.error && nd && typeof nd.pessoas === 'number') return { pessoas: nd.pessoas, ministerios: nd.ministerios, postos: nd.postos, cultos_no_mes: nd.cultos_no_mes };
      promessa = null;
      return NUM_COPY;
    }).catch(() => { promessa = null; return NUM_COPY; });
  }
  return promessa;
}
export function useNumeros() {
  const [num, setNum] = useState<Numeros>(NUM_COPY);
  useEffect(() => {
    let vivo = true;
    void buscarNumeros().then(n => { if (vivo) setNum(n); });
    return () => { vivo = false; };
  }, []);
  return num;
}

/* a frase com um número vivo dentro (herói e fecho) */
export function Numero({ campo }: { campo: keyof Numeros }) {
  const num = useNumeros();
  return <>{num[campo]}</>;
}
/* os dois círculos são da página: a home e a /servir não repetem foto */
type Circulos = [LugarDeFoto, LugarDeFoto];
export function NumerosFaixa({ circulos }: { circulos?: Circulos }) {
  const num = useNumeros();
  return <NumerosVivos num={num} circulos={circulos} />;
}

export function NumerosVivos({ num, circulos = ['home-circulo-1', 'home-circulo-2'] }: { num: Numeros; circulos?: Circulos }) {
  const faixa = useRef<HTMLDivElement>(null);
  const [ativo, setAtivo] = useState(false);
  useEffect(() => {
    const el = faixa.current; if (!el) return;
    const obs = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setAtivo(true); obs.disconnect(); } }, { rootMargin: '0px 0px -10% 0px' });
    obs.observe(el);
    const rede = setTimeout(() => setAtivo(true), 5000);
    return () => { obs.disconnect(); clearTimeout(rede); };
  }, []);
  const pessoas = useContagem(num.pessoas, ativo);
  const areas = useContagem(num.ministerios, ativo);
  const postos = useContagem(num.postos, ativo);
  const cultos = useContagem(num.cultos_no_mes, ativo);
  return (
    <div ref={faixa} className="s-num">
      <div className="s-circs s-rev" aria-hidden="true">
        <div className="s-circ a"><Img lugar={circulos[0]} sizes="(max-width: 999px) 70vw, 32vw" /></div>
        <div className="s-circ b"><Img lugar={circulos[1]} sizes="(max-width: 999px) 60vw, 28vw" /></div>
      </div>
      <div className="s-dir s-rev d1">
        <Arroba className="dir" />
        <Vozes className="s-h2 media">Números vivos</Vozes>
        <ul className="s-vivos">
          <li><span><b>{pessoas}</b> {fim(ligaTexto('pessoas servindo. Cada uma começou sem saber fazer nada.'))}</span><Visto /></li>
          <li><span><b>{areas}</b> {fim(ligaTexto('áreas abertas. Uma delas tem a sua cara.'))}</span><Visto /></li>
          <li><span><b>{postos}</b> {fim(ligaTexto('postos na escala. E sempre cabe mais um.'))}</span><Visto /></li>
          <li><span><b>{cultos}</b> {fim(ligaTexto('encontros no mês. Servir aqui é comunhão, não plantão solitário.'))}</span><Visto /></li>
        </ul>
      </div>
    </div>
  );
}

/* os cinco cartões, com o número de postos vindo do banco */
export function Areas({ compacto }: { compacto?: boolean }) {
  const [postos, setPostos] = useState<Record<string, { postos: number; aberto: boolean }>>({});
  const [extras, setExtras] = useState<Min[]>([]);
  const [rede, setRede] = useState(false);
  useEffect(() => {
    let vivo = true;
    void (async () => {
      const r = await rpc<Min[]>('ministerios_publicos');
      if (!vivo) return;
      if (r.error || !Array.isArray(r.data)) { setRede(true); return; }
      const m: Record<string, { postos: number; aberto: boolean }> = {};
      const fora: Min[] = [];
      for (const x of r.data) { m[x.slug] = { postos: x.postos, aberto: x.aberto }; if (!AREAS[x.slug]) fora.push(x); }
      setPostos(m); setExtras(fora);
    })();
    return () => { vivo = false; };
  }, []);
  const dois = (n: number) => String(n).padStart(2, '0');
  const cartao = (slug: string, a: Area, extra?: Min) => {
    const p = postos[slug]?.postos ?? extra?.postos ?? a.postos;
    const aberto = postos[slug]?.aberto ?? extra?.aberto ?? a.aberto;
    return (
      <Link key={slug} href={`/servir/${slug}`} className="s-cartao">
        <span className="s-cartao-t">{a.nome}</span>
        <span className="s-cartao-n">{dois(p)} {p === 1 ? 'posto' : 'postos'}</span>
        {!aberto && <span className="s-cartao-tag">conversa antes</span>}
        <span className="s-cartao-f">{liga(a.frase)}</span>
        {!compacto && <span className="s-cartao-d">{fim(ligaTexto(a.texto))}</span>}
        <span className="s-cartao-ir">Escolher esta área <Seta /></span>
      </Link>
    );
  };
  return (
    <>
      <Trilho className={'s-cartoes' + (AREAS_ORDEM.length + extras.length === 5 ? ' cinco' : '')} rotulo="As áreas">
        {AREAS_ORDEM.map(slug => cartao(slug, AREAS[slug]))}
        {extras.map(x => cartao(x.slug, { nome: x.nome, postos: x.postos, aberto: x.aberto, frase: x.descricao || '', texto: '', linha: '', artigo: x.artigo as Area['artigo'] }, x))}
      </Trilho>
      {rede && <p className="s-aviso" role="status">Sem conexão agora: os postos acima são os últimos conhecidos.</p>}
    </>
  );
}

/* o formulário do fim: nome, WhatsApp, área; leva ao cadastro da área */
const NAO_SEI = 'nao-sei';
export function FormServir({ escuro = true, areaInicial = '' }: { escuro?: boolean; areaInicial?: string }) {
  const router = useRouter();
  const [nome, setNome] = useState('');
  const [tel, setTel] = useState('');
  const [area, setArea] = useState(areaInicial);
  const [erro, setErro] = useState<{ nome?: string; tel?: string; area?: string }>({});
  const [indo, setIndo] = useState(false);
  const [mins, setMins] = useState<Array<{ slug: string; nome: string }>>(AREAS_ORDEM.map(s => ({ slug: s, nome: AREAS[s].nome })));

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const r = await rpc<Min[]>('ministerios_publicos');
      if (vivo && !r.error && Array.isArray(r.data) && r.data.length) setMins(r.data.map(m => ({ slug: m.slug, nome: m.nome })));
    })();
    return () => { vivo = false; };
  }, []);

  const enviar = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (indo) return;
    const n = nome.trim().replace(/\s+/g, ' ');
    const dig = tel.replace(/\D/g, '');
    const falta: typeof erro = {};
    if (!n) falta.nome = 'Escreva seu nome.';
    if (!dig) falta.tel = 'Escreva seu WhatsApp, com DDD.';
    else if (!telefoneOk(dig)) falta.tel = 'Confira o WhatsApp: DDD e número.';
    if (!area) falta.area = 'Escolha uma área, ou marque que ainda não sabe.';
    setErro(falta);
    if (Object.keys(falta).length) return;
    /* o rascunho que o cadastro da área lê (guia.cadastro.<slug>): nome e
       WhatsApp já preenchidos; com nome e sobrenome e telefone válidos o
       cadastro abre direto no passo das funções. 24h de validade. */
    const pronto = n.includes(' ') && telefoneOk(dig);
    const guardar = (slug: string) => {
      try { localStorage.setItem(`guia.cadastro.${slug}`, JSON.stringify({ em: Date.now(), passo: pronto ? 1 : 0, nome: n, tel: tel.trim(), email: '', escolhidas: [], resp: {} })); } catch {}
    };
    setIndo(true);
    if (area === NAO_SEI) { mins.forEach(m => guardar(m.slug)); router.push('/servir/onde-me-encaixo'); return; }
    guardar(area);
    router.push(`/servir/${area}/cadastro`);
  }, [indo, nome, tel, area, mins, router]);

  return (
    <form className="s-form com-fim" onSubmit={enviar} noValidate>
      <div className="s-campo">
        <label htmlFor="s-nome">Nome</label>
        <input id="s-nome" name="nome" type="text" placeholder="Nome:" autoComplete="name" value={nome}
               aria-invalid={!!erro.nome} aria-describedby={erro.nome ? 's-nome-e' : undefined}
               onChange={e => { setNome(e.target.value); if (erro.nome) setErro(x => ({ ...x, nome: undefined })); }} />
        {erro.nome && <span id="s-nome-e" className="s-campo-dica" role="alert">{erro.nome}</span>}
      </div>
      <div className="s-campo">
        <label htmlFor="s-tel">WhatsApp</label>
        <input id="s-tel" name="whatsapp" type="tel" inputMode="tel" placeholder="Whatsapp:" autoComplete="tel" value={tel}
               aria-invalid={!!erro.tel} aria-describedby={erro.tel ? 's-tel-e' : undefined}
               onChange={e => { setTel(e.target.value); if (erro.tel) setErro(x => ({ ...x, tel: undefined })); }} />
        {erro.tel && <span id="s-tel-e" className="s-campo-dica" role="alert">{erro.tel}</span>}
      </div>
      <div className="s-campo">
        <label htmlFor="s-area">Área de interesse</label>
        <select id="s-area" name="area" value={area} className={area ? '' : 'vazio'}
                aria-invalid={!!erro.area} aria-describedby={erro.area ? 's-area-e' : undefined}
                onChange={e => { setArea(e.target.value); if (erro.area) setErro(x => ({ ...x, area: undefined })); }}>
          <option value="" disabled>Área de interesse:</option>
          {mins.map(m => <option key={m.slug} value={m.slug}>{m.nome}</option>)}
          <option value={NAO_SEI}>Ainda não sei</option>
        </select>
        {erro.area && <span id="s-area-e" className="s-campo-dica" role="alert">{erro.area}</span>}
      </div>
      <button type="submit" className="s-enviar" aria-busy={indo}>{indo ? 'Abrindo…' : 'Enviar'}</button>
      <div className="s-form-fim" style={{ gridColumn: '1 / -1' }}>
        <button type="submit" className={'s-pil' + (escuro ? '' : ' preta')} aria-busy={indo}>Quero servir</button>
        <p className="s-micro">{ligaTexto("Seus dados servem só pra te chamar pra essa conversa. Nunca são publicados.")}</p>
      </div>
    </form>
  );
}
