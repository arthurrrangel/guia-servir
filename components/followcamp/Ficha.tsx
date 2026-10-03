'use client';
/* =============================================================================
   A FICHA DE INSCRIÇÃO DO FOLLOW CAMP 2027 — 02/10/2026

   Quatro blocos, na ordem em que a família tem a informação à mão: quem vai,
   saúde, quem responde por ele (responsável se for menor no dia do Camp,
   contato de emergência se não for) e a inscrição (irmão, pagamento, imagem,
   termo). As regras são as de lib/followcamp-ficha.ts, as mesmas da rota.

   O QUE ESTA TELA PODE AFIRMAR. "Ficha enviada" só quando a rota disse que a
   linha está na planilha. Se não está, a tela diz "falta um passo" e manda a
   ficha inteira pelo WhatsApp da organização: a pessoa vê o que acontece.

   O rascunho fica na sessão do navegador (a aba pode ser descartada enquanto
   a pessoa vai ao WhatsApp procurar o CPF da mãe). Some quando a ficha sai.
   ============================================================================= */
import { useEffect, useMemo, useRef, useState } from 'react';
import { FC27, LOTES, loteVigente, valorIrmaos, emReais, linkWhatsApp, limpaNome } from '@/lib/followcamp';
import {
  SEXOS, CAMISAS, PARENTESCOS, PAGAMENTOS, TEXTO_MAX, IDADE_MIN, IDADE_MAX,
  lerData, idadeEm, mascaraData, mascaraCpf, mascaraCelular, conferirFicha, termoDe, textoImagem,
  TEXTO_LGPD, O_QUE_LEVAR, mensagemDaFicha, mensagemDeAviso, whatsDaConfirmacao, formataCelular, primeiroNome,
  type Ficha as FichaT,
} from '@/lib/followcamp-ficha';
import s from './pagar.module.css';

type Fase = 'form' | 'enviada' | 'falta';

type Rascunho = {
  campista: string; nascimento: string; sexo: string; camisa: string; whatsCampista: string;
  alergias: string; saude: string;
  respNome: string; respCpf: string; respWhats: string; respParentesco: string;
  emergNome: string; emergWhats: string;
  temIrmao: string; irmao: string; pagamento: string; imagem: string;
  termo: boolean; lgpd: boolean;
};

const VAZIO: Rascunho = {
  campista: '', nascimento: '', sexo: '', camisa: '', whatsCampista: '',
  alergias: '', saude: '',
  respNome: '', respCpf: '', respWhats: '', respParentesco: '',
  emergNome: '', emergWhats: '',
  temIrmao: 'nao', irmao: '', pagamento: '', imagem: '',
  termo: false, lgpd: false,
};

const CHAVE_TEMA = 'fc27-tema';
const CHAVE_RASCUNHO = 'fc27-ficha-rascunho';
const CHAVE_ULTIMA = 'fc27-ficha-ultima';
const TEMA_ANTES = `try{var t=localStorage.getItem('fc27-tema');var d=document.currentScript&&document.currentScript.parentElement;if(d&&(t==='dark'||t==='light'))d.setAttribute('data-tema',t==='dark'?'escuro':'claro')}catch(e){}`;

const Check = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);
/* balão de conversa genérico (não o logotipo de nenhum aplicativo) */
const Balao = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.5 11.5a8 8 0 0 1-11.7 7.1L3.5 20l1.4-4.9A8 8 0 1 1 20.5 11.5z" /><path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" /></svg>
);

/** Rádio em pílula: um grupo com rótulo de verdade (legend) e foco no grupo. */
function Pilulas({ id, rotulo, opcoes, valor, mudar, invalido, dica }: {
  id: string; rotulo: string; opcoes: readonly { id: string; rot: string }[]; valor: string;
  mudar: (v: string) => void; invalido: boolean; dica?: string;
}) {
  return (
    <fieldset id={id} className={s.grupo} tabIndex={-1} aria-invalid={invalido || undefined}>
      <legend className={s.rotuloGrupo}>{rotulo}</legend>
      {dica && <p className={s.ajuda}>{dica}</p>}
      <div className={s.pilulas}>
        {opcoes.map(o => (
          <label key={o.id} className={s.pilula} data-marcada={valor === o.id}>
            <input type="radio" name={id} value={o.id} checked={valor === o.id} onChange={() => mudar(o.id)} />
            {o.rot}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function Ficha() {
  const [tema, setTema] = useState<'claro' | 'escuro' | null>(null);
  const [sistemaEscuro, setSistemaEscuro] = useState(false);
  const [agora, setAgora] = useState<Date | null>(null);
  const [fase, setFase] = useState<Fase>('form');
  const [r, setR] = useState<Rascunho>(VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [campoMal, setCampoMal] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [enviada, setEnviada] = useState<FichaT | null>(null);
  const [pagarNoSite, setPagarNoSite] = useState(false);
  const [anuncio, setAnuncio] = useState('');
  const caixa = useRef<HTMLDivElement>(null);
  const restaurado = useRef(false);

  /* tema: a mesma chave e o mesmo botão da página do Camp */
  useEffect(() => {
    try {
      const t = localStorage.getItem(CHAVE_TEMA);
      if (t === 'dark') setTema('escuro');
      else if (t === 'light') setTema('claro');
    } catch { /* sem armazenamento: segue o sistema */ }
    setAgora(new Date());
    const relogio = setInterval(() => setAgora(new Date()), 60_000);
    const m = window.matchMedia?.('(prefers-color-scheme: dark)');
    let desliga = () => {};
    if (m) {
      setSistemaEscuro(m.matches);
      const muda = (e: MediaQueryListEvent) => setSistemaEscuro(e.matches);
      m.addEventListener?.('change', muda);
      desliga = () => m.removeEventListener?.('change', muda);
    }
    /* o rascunho volta da sessão */
    try {
      const salvo = JSON.parse(sessionStorage.getItem(CHAVE_RASCUNHO) || 'null');
      if (salvo && typeof salvo === 'object') setR({ ...VAZIO, ...salvo, termo: false, lgpd: false });
    } catch { /* sem sessão: começa vazio */ }
    restaurado.current = true;
    return () => { clearInterval(relogio); desliga(); };
  }, []);

  /* guarda o rascunho a cada mudança (o aceite do termo não: ele é dado na hora) */
  useEffect(() => {
    if (!restaurado.current || fase !== 'form') return;
    try {
      const { termo: _t, lgpd: _l, ...resto } = r;
      sessionStorage.setItem(CHAVE_RASCUNHO, JSON.stringify(resto));
    } catch { /* ok */ }
  }, [r, fase]);

  const escuro = tema ? tema === 'escuro' : sistemaEscuro;
  function trocarTema() {
    const novo = escuro ? 'claro' : 'escuro';
    setTema(novo);
    try { localStorage.setItem(CHAVE_TEMA, novo === 'escuro' ? 'dark' : 'light'); } catch { /* ok */ }
  }

  /* troca de fase: foco no título e anúncio para leitor de tela */
  useEffect(() => {
    if (fase === 'form') return;
    setAnuncio(fase === 'enviada' ? 'Ficha enviada.' : 'Falta um passo: mande a ficha no WhatsApp.');
    window.scrollTo({ top: 0 });
    requestAnimationFrame(() => {
      const h = caixa.current?.querySelector<HTMLElement>('h2');
      h?.setAttribute('tabindex', '-1');
      h?.focus({ preventScroll: true });
    });
    /* pagar pelo site só aparece se algum meio estiver ligado */
    fetch('/api/followcamp/meios', { cache: 'no-store' })
      .then(x => (x.ok ? x.json() : null))
      .then(j => setPagarNoSite(!!(j && (j.pix || j.cartao || j.cartaoLink || j.pixDireto))))
      .catch(() => {});
  }, [fase]);

  const muda = <K extends keyof Rascunho>(k: K, v: Rascunho[K], campo?: string) => {
    setR(x => ({ ...x, [k]: v }));
    if (campo && campoMal === campo) { setErro(null); setCampoMal(null); }
  };

  /* idade no dia do Camp, ao vivo: decide responsável x contato de emergência */
  const nasc = lerData(r.nascimento);
  const idade = nasc ? idadeEm(nasc) : null;
  const naFaixa = idade !== null && idade >= IDADE_MIN && idade <= IDADE_MAX;
  const menor = naFaixa && idade! < 18;
  const quem = primeiroNome(r.campista) || 'o campista';

  const lote = agora ? loteVigente(agora) : LOTES[0];
  const valor = lote ? (r.temIrmao === 'sim' ? valorIrmaos(lote.valor) : lote.valor) : null;

  /* o termo que aparece é o mesmo texto que vai para a planilha */
  const termo = useMemo(() => termoDe({
    campista: limpaNome(r.campista) || 'o campista',
    menor,
    responsavel: menor && limpaNome(r.respNome) ? {
      nome: limpaNome(r.respNome), cpf: r.respCpf.replace(/\D+/g, ''),
      whats: { area_code: '', number: '' }, parentesco: 'Mãe',
    } : null,
    emergencia: !menor && limpaNome(r.emergNome) ? { nome: limpaNome(r.emergNome), whats: { area_code: '', number: '' } } : null,
  }), [r.campista, r.respNome, r.respCpf, r.emergNome, menor]);

  function apontar(msg: string, campo: string) {
    setErro(msg);
    setCampoMal(campo);
    const el = campo ? document.getElementById(campo) : null;
    if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }

  async function enviar() {
    if (ocupado) return;
    const corpo = { ...r, site: (document.getElementById('fc-site') as HTMLInputElement | null)?.value || '' };
    const v = conferirFicha(corpo);
    if (!v.ok) { apontar(v.erro, v.campo); return; }
    setErro(null); setCampoMal(null); setOcupado(true);
    try {
      const resp = await fetch('/api/followcamp/ficha', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo),
      });
      const j = await resp.json().catch(() => null);
      if (!resp.ok || !j?.ok) {
        if (j?.campo) apontar(j.erro, j.campo);
        else setErro(j?.erro || 'Não deu certo agora. Tente de novo em instantes.');
        setOcupado(false);
        return;
      }
      setEnviada(v.ficha);
      try {
        sessionStorage.removeItem(CHAVE_RASCUNHO);
        /* a página de pagamento já abre com o campista preenchido */
        sessionStorage.setItem(CHAVE_ULTIMA, JSON.stringify({ campista: v.ficha.campista, irmao: v.ficha.irmao }));
      } catch { /* ok */ }
      setFase(j.guardado ? 'enviada' : 'falta');
    } catch {
      setErro('Sem conexão. Confira a internet e tente de novo: o que você preencheu continua aqui.');
    }
    setOcupado(false);
  }

  /* irmão: recomeça com o responsável e o pagamento, e o irmão já marcado */
  function inscreverIrmao() {
    if (!enviada) return;
    setR(x => ({
      ...VAZIO,
      respNome: x.respNome, respCpf: x.respCpf, respWhats: x.respWhats, respParentesco: x.respParentesco,
      emergNome: x.emergNome, emergWhats: x.emergWhats,
      pagamento: x.pagamento, temIrmao: 'sim', irmao: enviada.campista,
    }));
    setEnviada(null);
    setFase('form');
    setPagarNoSite(false);
    window.scrollTo({ top: 0 });
    requestAnimationFrame(() => document.getElementById('fc-campista')?.focus({ preventScroll: true }));
  }

  const inv = (id: string) => campoMal === id || undefined;

  /* -------------------------------------------------------------- telas --- */
  const zapCompleto = enviada ? linkWhatsApp(mensagemDaFicha(enviada)) : '';
  const zapAviso = enviada ? linkWhatsApp(mensagemDeAviso(enviada)) : '';
  const numeroConfirmacao = enviada ? whatsDaConfirmacao(enviada) : null;

  return (
    <div className={s.raiz} data-tema={tema ?? undefined} suppressHydrationWarning>
      <script dangerouslySetInnerHTML={{ __html: TEMA_ANTES }} />
      <header className={s.topo}>
        <div className={s.barra}>
          <a className={s.voltar} href="/followcamp">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
            Página do Camp
          </a>
          <button className={s.tema} type="button" onClick={trocarTema} aria-label={escuro ? 'Usar tema claro' : 'Usar tema escuro'}>
            {escuro
              ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" /></svg>
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>}
          </button>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={s.logo} src="/followcamp/a/logo.webp" width={1108} height={579} alt="Follow Camp 2027" />
        <h1 className={s.titulo}>Ficha de inscrição</h1>
        <p className={s.subtitulo}>{FC27.tema} · {FC27.quando}</p>
      </header>

      <main className={s.coluna}>
        <div className={s.vivo} aria-live="polite">{anuncio}</div>
        <div ref={caixa}>
          {fase === 'form' && (
            <section className={s.painel} aria-label="Ficha de inscrição">
              <p className={s.nota} style={{ marginTop: 0 }}>Leva uns cinco minutos. Se for menor de 18, o responsável preenche junto.</p>

              {/* 1 · quem vai */}
              <div className={s.passo} style={{ marginTop: 18 }}>
                <h2 className={s.cabecaPasso}><span>1</span>Quem vai</h2>
                <div className={s.campo}>
                  <label htmlFor="fc-campista">Nome completo do campista</label>
                  <input id="fc-campista" autoComplete="off" value={r.campista} maxLength={80} aria-invalid={inv('fc-campista')}
                    onChange={e => muda('campista', e.target.value, 'fc-campista')} />
                </div>
                <div className={s.campo}>
                  <label htmlFor="fc-nasc">Data de nascimento</label>
                  <input id="fc-nasc" inputMode="numeric" autoComplete="off" placeholder="dd/mm/aaaa" value={r.nascimento} aria-invalid={inv('fc-nasc')}
                    aria-describedby="fc-nasc-idade"
                    onChange={e => muda('nascimento', mascaraData(e.target.value), 'fc-nasc')} />
                  <p id="fc-nasc-idade" className={idade !== null && !naFaixa ? s.avisoCampo : s.ajudaCampo} aria-live="polite">
                    {idade === null ? ' ' : naFaixa ? `${idade} anos no dia do Camp${menor ? ' (menor: o responsável preenche o bloco 3)' : ''}`
                      : `${idade} anos no dia do Camp: o Follow Camp é de ${IDADE_MIN} a ${IDADE_MAX} anos.`}
                  </p>
                </div>
                <Pilulas id="fc-sexo" rotulo="Sexo" opcoes={SEXOS} valor={r.sexo} invalido={campoMal === 'fc-sexo'}
                  dica="Os dormitórios são divididos por gênero." mudar={v => muda('sexo', v, 'fc-sexo')} />
                <Pilulas id="fc-camisa" rotulo="Tamanho da camisa oficial" opcoes={CAMISAS.map(c => ({ id: c, rot: c }))} valor={r.camisa}
                  invalido={campoMal === 'fc-camisa'} mudar={v => muda('camisa', v, 'fc-camisa')} />
                <div className={s.campo}>
                  <label htmlFor="fc-whats">WhatsApp do campista{menor ? ' (opcional)' : ''}</label>
                  <input id="fc-whats" inputMode="tel" autoComplete="tel-national" placeholder="(21) 99999-9999" value={r.whatsCampista} aria-invalid={inv('fc-whats')}
                    onChange={e => muda('whatsCampista', mascaraCelular(e.target.value), 'fc-whats')} />
                </div>
              </div>

              {/* 2 · saúde */}
              <div className={s.passo}>
                <h2 className={s.cabecaPasso}><span>2</span>Saúde</h2>
                <p className={s.ajuda}>Deixe em branco o que não tiver.</p>
                <div className={s.campo}>
                  <label htmlFor="fc-alergias">Alergia ou restrição alimentar</label>
                  <textarea id="fc-alergias" rows={2} maxLength={TEXTO_MAX} value={r.alergias} aria-invalid={inv('fc-alergias')}
                    placeholder="Ex.: não come carne, alergia a camarão" onChange={e => muda('alergias', e.target.value, 'fc-alergias')} />
                </div>
                <div className={s.campo}>
                  <label htmlFor="fc-saude">Problema de saúde ou remédio de uso contínuo</label>
                  <textarea id="fc-saude" rows={2} maxLength={TEXTO_MAX} value={r.saude} aria-invalid={inv('fc-saude')}
                    placeholder="Ex.: asma, usa bombinha" onChange={e => muda('saude', e.target.value, 'fc-saude')} />
                </div>
              </div>

              {/* 3 · responsável ou contato de emergência */}
              <div className={s.passo}>
                <h2 className={s.cabecaPasso}><span>3</span>{!naFaixa ? 'Responsável ou contato' : menor ? 'Responsável' : 'Contato de emergência'}</h2>
                {!naFaixa && <p className={s.ajuda}>Preencha a data de nascimento: menor de 18 no dia do Camp precisa do responsável.</p>}
                {naFaixa && menor && (
                  <>
                    <p className={s.ajuda}>Quem autoriza a viagem e recebe a confirmação da vaga.</p>
                    <div className={s.campo}>
                      <label htmlFor="fc-resp-nome">Nome completo do responsável</label>
                      <input id="fc-resp-nome" autoComplete="name" value={r.respNome} maxLength={80} aria-invalid={inv('fc-resp-nome')}
                        onChange={e => muda('respNome', e.target.value, 'fc-resp-nome')} />
                    </div>
                    <div className={s.dupla}>
                      <div className={s.campo}>
                        <label htmlFor="fc-resp-cpf">CPF do responsável</label>
                        <input id="fc-resp-cpf" inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" value={r.respCpf} aria-invalid={inv('fc-resp-cpf')}
                          onChange={e => muda('respCpf', mascaraCpf(e.target.value), 'fc-resp-cpf')} />
                      </div>
                      <div className={s.campo}>
                        <label htmlFor="fc-resp-whats">WhatsApp do responsável</label>
                        <input id="fc-resp-whats" inputMode="tel" autoComplete="tel-national" placeholder="(21) 99999-9999" value={r.respWhats} aria-invalid={inv('fc-resp-whats')}
                          onChange={e => muda('respWhats', mascaraCelular(e.target.value), 'fc-resp-whats')} />
                      </div>
                    </div>
                    <Pilulas id="fc-resp-par" rotulo="Parentesco" opcoes={PARENTESCOS.map(p => ({ id: p, rot: p }))} valor={r.respParentesco}
                      invalido={campoMal === 'fc-resp-par'} mudar={v => muda('respParentesco', v, 'fc-resp-par')} />
                  </>
                )}
                {naFaixa && !menor && (
                  <>
                    <p className={s.ajuda}>Alguém para a equipe avisar se precisar.</p>
                    <div className={s.dupla}>
                      <div className={s.campo}>
                        <label htmlFor="fc-emerg-nome">Nome completo</label>
                        <input id="fc-emerg-nome" autoComplete="off" value={r.emergNome} maxLength={80} aria-invalid={inv('fc-emerg-nome')}
                          onChange={e => muda('emergNome', e.target.value, 'fc-emerg-nome')} />
                      </div>
                      <div className={s.campo}>
                        <label htmlFor="fc-emerg-whats">WhatsApp</label>
                        <input id="fc-emerg-whats" inputMode="tel" autoComplete="off" placeholder="(21) 99999-9999" value={r.emergWhats} aria-invalid={inv('fc-emerg-whats')}
                          onChange={e => muda('emergWhats', mascaraCelular(e.target.value), 'fc-emerg-whats')} />
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* 4 · inscrição */}
              <div className={s.passo}>
                <h2 className={s.cabecaPasso}><span>4</span>Inscrição</h2>
                <Pilulas id="fc-tem-irmao" rotulo="Tem irmão se inscrevendo também?" opcoes={[{ id: 'nao', rot: 'Não' }, { id: 'sim', rot: 'Sim' }]}
                  valor={r.temIrmao} invalido={campoMal === 'fc-tem-irmao'} dica="Irmãos têm 10% de desconto cada um."
                  mudar={v => muda('temIrmao', v, 'fc-tem-irmao')} />
                {r.temIrmao === 'sim' && (
                  <div className={s.campo}>
                    <label htmlFor="fc-irmao">Nome completo do irmão</label>
                    <input id="fc-irmao" autoComplete="off" value={r.irmao} maxLength={80} aria-invalid={inv('fc-irmao')}
                      onChange={e => muda('irmao', e.target.value, 'fc-irmao')} />
                  </div>
                )}
                <Pilulas id="fc-pag" rotulo="Como vai pagar?" opcoes={PAGAMENTOS} valor={r.pagamento} invalido={campoMal === 'fc-pag'}
                  mudar={v => muda('pagamento', v, 'fc-pag')} />
                <Pilulas id="fc-imagem" rotulo="Uso de imagem" opcoes={[{ id: 'sim', rot: 'Autorizo' }, { id: 'nao', rot: 'Não autorizo' }]}
                  valor={r.imagem} invalido={campoMal === 'fc-imagem'} dica={textoImagem({ campista: limpaNome(r.campista), menor })}
                  mudar={v => muda('imagem', v, 'fc-imagem')} />

                <div className={s.termo} aria-labelledby="fc-termo-titulo">
                  <h3 id="fc-termo-titulo">{menor ? 'Termo de autorização do responsável' : 'Declaração'}</h3>
                  <p>{termo}</p>
                </div>
                <label className={s.aceite} data-marcada={r.termo} aria-invalid={inv('fc-termo')}>
                  <input id="fc-termo" type="checkbox" checked={r.termo} onChange={e => muda('termo', e.target.checked, 'fc-termo')} />
                  <span className={s.caixaAceite} aria-hidden="true"><Check /></span>
                  <span>{menor ? 'Sou o responsável e autorizo' : 'Declaro que é verdade'}</span>
                </label>
                <label className={s.aceite} data-marcada={r.lgpd} aria-invalid={inv('fc-lgpd')}>
                  <input id="fc-lgpd" type="checkbox" checked={r.lgpd} onChange={e => muda('lgpd', e.target.checked, 'fc-lgpd')} />
                  <span className={s.caixaAceite} aria-hidden="true"><Check /></span>
                  <span>{TEXTO_LGPD} <a href="/privacidade" target="_blank" rel="noopener">Privacidade</a></span>
                </label>
              </div>

              {/* a isca: fora da tela e fora do leitor; humano não preenche */}
              <input id="fc-site" name="site" tabIndex={-1} autoComplete="off" aria-hidden="true" className={s.isca} defaultValue="" />

              <div className={s.total} aria-live="polite">
                <span>Valor</span>
                <strong>{valor !== null ? emReais(valor) : 'a confirmar'}</strong>
              </div>
              {valor === null && <p className={s.nota}>O 1º lote terminou. A organização confirma o valor do próximo lote no WhatsApp.</p>}
              {erro && <p className={s.erro} role="alert">{erro}</p>}
              <div className={s.acoes}>
                <button type="button" className={`${s.btn} ${s.fogo}`} onClick={enviar} disabled={ocupado}>
                  {ocupado ? 'Enviando…' : 'Enviar ficha'}
                </button>
              </div>
            </section>
          )}

          {fase !== 'form' && enviada && (
            <section className={`${s.painel} ${s.pixCab}`}>
              {fase === 'enviada' ? (
                <>
                  <div className={s.selo}><Check /></div>
                  <h2>Ficha enviada</h2>
                  <p>A confirmação da vaga chega no WhatsApp{numeroConfirmacao ? ` ${formataCelular(numeroConfirmacao)}` : ''}.</p>
                </>
              ) : (
                <>
                  <div className={`${s.selo} ${s.seloNeutro}`}><Balao /></div>
                  <h2>Falta um passo</h2>
                  <p>Mande a ficha para a organização no WhatsApp. Ela só chega quando você enviar a mensagem.</p>
                  <div className={s.acoes}>
                    <a className={`${s.btn} ${s.zap}`} href={zapCompleto} target="_blank" rel="noopener">Enviar a ficha no WhatsApp</a>
                  </div>
                </>
              )}
              <ul className={s.resumo}>
                <li><span>Campista</span><strong>{enviada.campista}</strong></li>
                <li><span>Valor</span><strong>{valor !== null ? emReais(valor) : 'a confirmar'}</strong></li>
                <li><span>Pagamento</span><strong>{PAGAMENTOS.find(p => p.id === enviada.pagamento)?.rot}</strong></li>
              </ul>
              <div className={s.acoes}>
                {pagarNoSite
                  ? <a className={`${s.btn} ${fase === 'enviada' ? s.fogo : s.claro}`} href="/followcamp/pagar">Pagar agora</a>
                  : fase === 'enviada' && <a className={`${s.btn} ${s.zap}`} href={zapAviso} target="_blank" rel="noopener">Combinar o pagamento no WhatsApp</a>}
                <button type="button" className={`${s.btn} ${s.claro}`} onClick={inscreverIrmao}>Inscrever um irmão</button>
              </div>
              {!enviada.irmao && <p className={s.nota}>Com irmão, os dois têm 10% de desconto: a organização acerta o valor desta ficha.</p>}
              <p className={s.nota}><b>O que levar:</b> {O_QUE_LEVAR}</p>
              <div className={s.acoes}><a className={s.link} href="/followcamp">Voltar para o Camp</a></div>
            </section>
          )}
        </div>
      </main>
      <p className={s.rodape}>
        Os dados da ficha vão para a organização do Follow Camp. <a href="/privacidade">Privacidade</a>
      </p>
    </div>
  );
}
