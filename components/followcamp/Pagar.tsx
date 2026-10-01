'use client';
/* =============================================================================
   O PAGAMENTO DO FOLLOW CAMP 2027 — 01/10/2026

   Três jeitos de pagar, e cada um só aparece se estiver ligado de verdade:

     Pix pela Stone   o QR nasce aqui na tela, e a tela pergunta ao servidor a
                      cada 4 s se o dinheiro caiu. Quando cai, ela diz que caiu.
     Cartão           link da Stone, até 12x com o juro por conta de quem paga.
                      O número do cartão é digitado na página da Stone.
     Pix direto       o BR Code montado aqui mesmo com a chave da igreja
                      (lib/pix.ts). Sem taxa, mas ninguém confirma sozinho: a
                      pessoa manda o comprovante no WhatsApp com o código.

   ANTES DE QUALQUER UM, O NOME DO CAMPISTA. Um pagamento que não diz de quem é
   vira comprovante para conferir no WhatsApp: no extrato aparece quem pagou
   (muitas vezes o pai), não quem vai acampar.

   O QUE ESTA TELA PODE AFIRMAR. "Pagamento confirmado" só aparece quando a
   Stone disse `paid`. A volta do cartão diz o que a Stone disse ao mandar a
   pessoa de volta, e o Pix direto nunca diz "recebemos": ele não falou com
   banco nenhum.
   ============================================================================= */
import { useEffect, useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import { pixCopiaECola } from '@/lib/pix';
import { PIX_CHAVE, PIX_NOME, PIX_CIDADE, valorDeDigitos } from '@/lib/oferta';
import {
  FC27, LOTES, ROTULO, PARCELA_MIN, PARCELA_MAX, loteVigente, carneAberto, valorIrmaos, emReais,
  conferirPedido, conferirPagador, codigoFC27, codigoLegivel, mensagemWhatsApp, linkWhatsApp,
  CODIGO_OK, soDigitos, limpaNome, type Referente,
} from '@/lib/followcamp';
import s from './pagar.module.css';

type Meio = 'pix' | 'cartao' | 'pixdireto';
type Fase = 'form' | 'pix' | 'pago' | 'pixdireto' | 'voltaCartao';
type Estado = 'aguardando' | 'pago' | 'expirado' | 'falhou' | 'desconhecido';

type Tentativa = {
  codigo: string; campista: string; referente: Referente; irmao: string; valor: number; meio: Meio;
};

type PixAtivo = { pedido: string; assinatura: string; copiaECola: string; expiraEm: number };

const CHAVE_TEMA = 'fc27-tema';
const CHAVE_TENTATIVA = 'fc27-ultima-tentativa';
const CHAVE_PIX = 'fc27-pix-em-andamento';

/* Pinta o tema escolhido na página do Camp ANTES de o React chegar, sem clarão.
   Roda uma vez, dentro do <div> raiz, que tem suppressHydrationWarning. */
const TEMA_ANTES = `try{var t=localStorage.getItem('${'fc27-tema'}');var d=document.currentScript&&document.currentScript.parentElement;if(d&&(t==='dark'||t==='light'))d.setAttribute('data-tema',t==='dark'?'escuro':'claro')}catch(e){}`;

function QR({ texto, rotulo }: { texto: string; rotulo: string }) {
  const { n, caminho } = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(texto, 'Byte');
    q.make();
    const n = q.getModuleCount();
    let caminho = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) caminho += `M${c} ${r}h1v1h-1z`;
    return { n, caminho };
  }, [texto]);
  const b = 4;
  return (
    <svg className={s.qr} viewBox={`${-b} ${-b} ${n + b * 2} ${n + b * 2}`} role="img" aria-label={rotulo} shapeRendering="crispEdges">
      <rect x={-b} y={-b} width={n + b * 2} height={n + b * 2} fill="#ffffff" />
      <path d={caminho} fill="#101010" />
    </svg>
  );
}

const Cartao = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M3 10h18M7 15h4" /></svg>
);

const Check = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);

function formataCpf(d: string) {
  const x = soDigitos(d).slice(0, 11);
  return x.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
}
function formataCelular(d: string) {
  let x = soDigitos(d);
  /* +55 colado do contato do celular: tira o país antes de cortar em 11 */
  if (x.length >= 12 && x.startsWith('55')) x = x.slice(2);
  x = x.slice(0, 11);
  if (x.length <= 2) return x;
  if (x.length <= 7) return `(${x.slice(0, 2)}) ${x.slice(2)}`;
  return `(${x.slice(0, 2)}) ${x.slice(2, 7)}-${x.slice(7)}`;
}
function mmss(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

export default function Pagar({ temPagarme, temPixDireto }: { temPagarme: boolean; temPixDireto: boolean }) {
  const [tema, setTema] = useState<'claro' | 'escuro' | null>(null);
  const [sistemaEscuro, setSistemaEscuro] = useState(false);
  const [agora, setAgora] = useState<Date | null>(null);
  const [fase, setFase] = useState<Fase>('form');

  const [campista, setCampista] = useState('');
  const [referente, setReferente] = useState<Referente | null>(null);
  const [irmao, setIrmao] = useState('');
  const [parcelaDig, setParcelaDig] = useState('');
  const [meio, setMeio] = useState<Meio | null>(null);
  const [pNome, setPNome] = useState('');
  const [pCpf, setPCpf] = useState('');
  const [pEmail, setPEmail] = useState('');
  const [pCel, setPCel] = useState('');

  const [erro, setErro] = useState<string | null>(null);
  const [campoMal, setCampoMal] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [tentativa, setTentativa] = useState<Tentativa | null>(null);
  const [pix, setPix] = useState<PixAtivo | null>(null);
  const [estado, setEstado] = useState<Estado>('aguardando');
  const [resta, setResta] = useState(0);
  const [copiou, setCopiou] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState('');
  const caixa = useRef<HTMLDivElement>(null);

  /* tema: o mesmo botão e a mesma chave da página do Camp. O script em linha
     do <div> raiz (lá embaixo) já pinta antes de o React chegar; aqui o React
     só passa a saber o que já está na tela */
  useEffect(() => {
    try {
      const t = localStorage.getItem(CHAVE_TEMA);
      if (t === 'dark') setTema('escuro');
      else if (t === 'light') setTema('claro');
    } catch { /* sem armazenamento: segue o sistema */ }
    setAgora(new Date());
    /* a data anda com a aba aberta: uma aba aberta em 03/11 não pode gerar
       Pix do 1º lote em 04/11 */
    const relogio = setInterval(() => setAgora(new Date()), 60_000);
    const m = window.matchMedia?.('(prefers-color-scheme: dark)');
    let desliga = () => {};
    if (m) {
      setSistemaEscuro(m.matches);
      const muda = (e: MediaQueryListEvent) => setSistemaEscuro(e.matches);
      m.addEventListener?.('change', muda);
      desliga = () => m.removeEventListener?.('change', muda);
    }
    /* volta pelo botão "voltar" do navegador depois de ir à Stone: a página
       vem do cache com o botão travado em "Um instante…" */
    const volta = (e: PageTransitionEvent) => { if (e.persisted) setOcupado(false); };
    window.addEventListener('pageshow', volta);
    return () => { clearInterval(relogio); desliga(); window.removeEventListener('pageshow', volta); };
  }, []);

  /* o ícone mostra para onde o botão LEVA: no escuro (escolhido ou do sistema), o sol */
  const escuro = tema ? tema === 'escuro' : sistemaEscuro;
  function trocarTema() {
    const novo = escuro ? 'claro' : 'escuro';
    setTema(novo);
    try { localStorage.setItem(CHAVE_TEMA, novo === 'escuro' ? 'dark' : 'light'); } catch { /* ok */ }
  }

  /* duas voltas possíveis ao abrir a página:
     1. do cartão: ?fim=cartao&c=FC27XXXXXXXX. A URL só escreve a tela; quem
        prova o pagamento é o painel da Stone.
     2. de um Pix em andamento (a aba foi descartada enquanto a pessoa estava no
        app do banco): o pedido volta da sessão e a consulta recomeça, em vez de
        a pessoa cair num formulário vazio e gerar OUTRO Pix. */
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('fim') === 'cartao') {
      const c = q.get('c') || '';
      if (!CODIGO_OK.test(c)) return;
      let t: Tentativa | null = null;
      try {
        const salvo = JSON.parse(sessionStorage.getItem(CHAVE_TENTATIVA) || 'null');
        if (salvo && salvo.codigo === c) t = salvo;
      } catch { /* sem a tentativa salva, a tela mostra só o código */ }
      setTentativa(t ?? { codigo: c, campista: '', referente: 'inscricao', irmao: '', valor: 0, meio: 'cartao' });
      setFase('voltaCartao');
      return;
    }
    try {
      const salvo = JSON.parse(sessionStorage.getItem(CHAVE_PIX) || 'null') as { pix: PixAtivo; tentativa: Tentativa } | null;
      if (salvo?.pix?.pedido && salvo.tentativa && Date.now() < salvo.pix.expiraEm + 15 * 60 * 1000) {
        setTentativa(salvo.tentativa);
        setPix(salvo.pix);
        setEstado('aguardando');
        setFase('pix');
      }
    } catch { /* sessão indisponível: segue do formulário */ }
  }, []);

  /* foco e anúncio a cada troca de fase: quem usa leitor de tela precisa saber
     que a tela mudou */
  useEffect(() => {
    if (fase === 'form') return;
    setAnuncio(fase === 'pix' ? 'Pix gerado. Copie o código ou leia o QR no app do banco.'
      : fase === 'pago' ? 'Pagamento confirmado.'
      : fase === 'pixdireto' ? 'Pix direto gerado. Depois de pagar, mande o comprovante no WhatsApp.'
      : 'Pagamento pelo cartão enviado.');
    requestAnimationFrame(() => {
      const h = caixa.current?.querySelector<HTMLElement>('h2');
      h?.setAttribute('tabindex', '-1');
      h?.focus({ preventScroll: false });
    });
  }, [fase]);

  const lote = agora ? loteVigente(agora) : LOTES[0];
  const carne = agora ? carneAberto(agora) : true;
  const cheio = (lote ?? LOTES[0]).valor;
  const parcela = valorDeDigitos(parcelaDig);
  const valor = referente === 'inscricao' ? cheio : referente === 'irmaos' ? valorIrmaos(cheio) : referente === 'parcela' ? parcela : 0;
  const algumMeio = temPagarme || temPixDireto;

  /* o aviso sai quando a pessoa mexe no campo que ele apontava: aviso velho
     em cima de campo já corrigido faz parecer que a correção não pegou */
  function corrigiu(campo: string) {
    if (campoMal === campo) { setErro(null); setCampoMal(null); }
  }

  function mal(msg: string, campo: string | null = null) {
    setErro(msg);
    setCampoMal(campo);
    if (campo) document.getElementById(campo)?.focus();
    return false;
  }

  /** Confere o que a tela sabe conferir, com a data DO CLIQUE. */
  function conferirTudo(): boolean {
    const r = conferirPedido({ campista, referente: referente ?? '', irmao, parcela }, new Date());
    if (!r.ok) {
      const campo = /campista/.test(r.erro) ? 'fc-campista' : /irmão/.test(r.erro) ? 'fc-irmao' : /parcela|valor/i.test(r.erro) ? 'fc-parcela' : null;
      return mal(r.erro, campo);
    }
    if (!meio) return mal('Escolha como você quer pagar.');
    if (meio === 'pix') {
      const p = conferirPagador({ nome: pNome, cpf: pCpf, email: pEmail, celular: pCel });
      if (!p.ok) {
        const campo = /CPF/.test(p.erro) ? 'fc-cpf' : /e-mail/.test(p.erro) ? 'fc-email' : /celular/.test(p.erro) ? 'fc-cel' : 'fc-pnome';
        return mal(p.erro, campo);
      }
    }
    setErro(null);
    setCampoMal(null);
    return true;
  }

  function guardar(t: Tentativa) {
    setTentativa(t);
    try { sessionStorage.setItem(CHAVE_TENTATIVA, JSON.stringify(t)); } catch { /* ok */ }
  }

  async function seguir() {
    if (ocupado) return;
    if (!conferirTudo() || !referente || !meio) return;
    const base = { campista: limpaNome(campista), referente, irmao: limpaNome(irmao), meio };

    if (meio === 'pixdireto') {
      /* o Pix direto não passa pelo servidor: o código nasce aqui, e por isso
         ele nunca é "confirmado" por esta tela */
      const codigo = codigoFC27();
      try {
        pixCopiaECola({ chave: PIX_CHAVE, nome: PIX_NOME, cidade: PIX_CIDADE, valor, txid: codigo });
      } catch {
        mal('O Pix direto não está disponível agora. Use outra forma, ou fale com a organização.');
        return;
      }
      guardar({ ...base, codigo, valor });
      setCopiou(null);
      setFase('pixdireto');
      return;
    }

    setOcupado(true);
    try {
      const corpo: Record<string, unknown> = { campista, referente, irmao, parcela };
      if (meio === 'pix') corpo.pagador = { nome: pNome, cpf: pCpf, email: pEmail, celular: pCel };
      const r = await fetch(meio === 'pix' ? '/api/followcamp/pix' : '/api/followcamp/cartao', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok || !CODIGO_OK.test(String(j.codigo || ''))) {
        mal(j?.erro || 'Não deu certo agora. Tente de novo em instantes.');
        setOcupado(false);
        return;
      }
      /* o código e o valor que valem são os que o SERVIDOR devolveu */
      const t: Tentativa = { ...base, codigo: j.codigo, valor: Number(j.valor) || valor };
      guardar(t);
      if (meio === 'cartao') {
        window.location.assign(j.url);
        return; /* a tela fica "ocupada" até o navegador sair; `pageshow` destrava na volta */
      }
      const expira = j.expiraEm ? Date.parse(j.expiraEm) : NaN;
      const ativo: PixAtivo = {
        pedido: j.pedido, assinatura: j.assinatura, copiaECola: j.copiaECola,
        expiraEm: Number.isFinite(expira) ? expira : Date.now() + 30 * 60 * 1000,
      };
      try { sessionStorage.setItem(CHAVE_PIX, JSON.stringify({ pix: ativo, tentativa: t })); } catch { /* ok */ }
      setPix(ativo);
      setEstado('aguardando');
      setCopiou(null);
      setFase('pix');
    } catch {
      mal('Sem conexão. Confira a internet e tente de novo.');
    }
    setOcupado(false);
  }

  /* "Já caiu?" a cada 4 s com a aba visível, e na hora em que a aba volta a
     ficar visível (a pessoa voltou do app do banco). Quem decide que o Pix
     expirou ou falhou é o SERVIDOR; a tela continua perguntando até 10 min
     depois do prazo, porque o pagamento pode cair no último minuto. */
  useEffect(() => {
    if (fase !== 'pix' || !pix) return;
    let vivo = true;
    let espera: ReturnType<typeof setTimeout> | null = null;
    let relogio: ReturnType<typeof setInterval> | null = null;
    const parar = () => { vivo = false; if (espera) clearTimeout(espera); if (relogio) clearInterval(relogio); };
    async function perguntar() {
      if (!vivo) return;
      if (espera) { clearTimeout(espera); espera = null; }
      let proxima = 4000;
      if (document.visibilityState === 'visible') {
        try {
          const r = await fetch(`/api/followcamp/pix?pedido=${encodeURIComponent(pix!.pedido)}&a=${encodeURIComponent(pix!.assinatura)}`, { cache: 'no-store' });
          if (r.status === 429) proxima = Math.max(4000, (Number(r.headers.get('Retry-After')) || 10) * 1000);
          const j = await r.json().catch(() => null);
          const e = (j?.estado || 'desconhecido') as Estado;
          if (!vivo) return;
          if (e === 'pago') {
            parar();
            setEstado('pago');
            try { sessionStorage.removeItem(CHAVE_PIX); } catch { /* ok */ }
            setFase('pago');
            return;
          }
          if (e === 'falhou' || e === 'expirado') { parar(); setEstado(e); return; }
        } catch { /* rede caiu: tenta de novo na próxima volta */ }
      }
      if (Date.now() > pix!.expiraEm + 10 * 60 * 1000) { parar(); setEstado('expirado'); return; }
      espera = setTimeout(perguntar, proxima);
    }
    const visivel = () => { if (document.visibilityState === 'visible') perguntar(); };
    document.addEventListener('visibilitychange', visivel);
    espera = setTimeout(perguntar, 2500);
    relogio = setInterval(() => setResta(pix.expiraEm - Date.now()), 1000);
    setResta(pix.expiraEm - Date.now());
    return () => { parar(); document.removeEventListener('visibilitychange', visivel); };
  }, [fase, pix]);

  async function copiar(texto: string, qual: string, idElemento: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiou(qual);
      setErro(null);
      setAnuncio(qual === 'chave' ? 'Chave Pix copiada.' : 'Código Pix copiado. Cole no app do seu banco.');
    } catch {
      const el = document.getElementById(idElemento);
      if (el) {
        const r = document.createRange();
        r.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(r);
      }
      setErro('Não consegui copiar sozinho. O texto está selecionado: toque e segure para copiar.');
    }
  }

  function recomecar() {
    setFase('form');
    setPix(null);
    setEstado('aguardando');
    setErro(null);
    setOcupado(false);
    try { sessionStorage.removeItem(CHAVE_PIX); } catch { /* ok */ }
    try { window.history.replaceState(null, '', '/followcamp/pagar'); } catch { /* ok */ }
    requestAnimationFrame(() => document.getElementById('fc-campista')?.focus());
  }

  const codigoDireto = useMemo(() => {
    if (fase !== 'pixdireto' || !tentativa) return '';
    try {
      return pixCopiaECola({ chave: PIX_CHAVE, nome: PIX_NOME, cidade: PIX_CIDADE, valor: tentativa.valor, txid: tentativa.codigo });
    } catch { return ''; }
  }, [fase, tentativa]);

  /* --------------------------------------------------------------- render --- */
  const resumo = tentativa && (
    <ul className={s.resumo}>
      {tentativa.campista && <li><span>Campista</span><strong>{tentativa.campista}</strong></li>}
      {tentativa.campista && <li><span>Pagamento</span><strong>{ROTULO[tentativa.referente]}</strong></li>}
      {tentativa.referente === 'irmaos' && tentativa.irmao && <li><span>Irmão inscrito</span><strong>{tentativa.irmao}</strong></li>}
      {tentativa.valor > 0 && <li><span>Valor</span><strong>{emReais(tentativa.valor)}</strong></li>}
      <li><span>Código</span><strong>{codigoLegivel(tentativa.codigo)}</strong></li>
    </ul>
  );
  const zapDoFim = tentativa && tentativa.campista
    ? linkWhatsApp(mensagemWhatsApp({ campista: tentativa.campista, ref: tentativa.referente, valor: tentativa.valor, codigo: tentativa.codigo, meio: tentativa.meio, irmao: tentativa.irmao }))
    : linkWhatsApp(`Oi! Paguei a inscrição do Follow Camp 2027. Código: ${tentativa ? codigoLegivel(tentativa.codigo) : ''}`);

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
        <h1 className={s.titulo}>Pagar inscrição</h1>
        <p className={s.subtitulo}>{FC27.tema} · {FC27.quando}</p>
      </header>

      <main className={s.coluna}>
        <div className={s.vivo} aria-live="polite">{anuncio}</div>
        <div ref={caixa}>
          {!algumMeio && fase === 'form' && (
            <section className={`${s.painel} ${s.emBreve}`}>
              <h2>O pagamento pelo site abre em breve</h2>
              <p>Até lá, fale com a organização no WhatsApp: {FC27.whatsappTexto}.</p>
              <div className={s.acoes}>
                <a className={`${s.btn} ${s.zap}`} href={linkWhatsApp('Oi! Quero pagar a inscrição do Follow Camp 2027.')} target="_blank" rel="noopener">Falar no WhatsApp</a>
              </div>
            </section>
          )}

          {algumMeio && fase === 'form' && (
            <section className={s.painel} aria-label="Dados do pagamento">
              <div className={s.passo}>
                <h2 className={s.cabecaPasso}><span>1</span>Quem é o campista</h2>
                <div className={s.campo}>
                  <label htmlFor="fc-campista">Nome completo do campista</label>
                  <input id="fc-campista" autoComplete="off" value={campista} maxLength={80}
                    aria-invalid={campoMal === 'fc-campista' || undefined}
                    onChange={e => { setCampista(e.target.value); corrigiu('fc-campista'); }} />
                </div>
              </div>

              <div className={s.passo}>
                <h2 className={s.cabecaPasso}><span>2</span>O que você está pagando</h2>
                <fieldset className={s.opcoes}>
                  <legend>O que você está pagando</legend>
                  {([
                    { id: 'inscricao' as const, nome: ROTULO.inscricao, preco: lote ? emReais(cheio) : '', dica: lote ? `${lote.nome}, até 3 de novembro.` : '1º lote encerrado. O valor do próximo lote ainda não saiu.', fechado: !lote },
                    { id: 'irmaos' as const, nome: 'Inscrição com desconto de irmãos', preco: lote ? emReais(valorIrmaos(cheio)) : '', dica: '10% de desconto para cada irmão, quando dois ou mais se inscrevem.', fechado: !lote },
                    { id: 'parcela' as const, nome: ROTULO.parcela, preco: '', dica: carne ? `Você escolhe o valor, de ${emReais(PARCELA_MIN)} a ${emReais(PARCELA_MAX)}. Quitação até 3 de janeiro.` : 'O Carnê Follow fechou em 3 de janeiro.', fechado: !carne },
                  ]).map(o => (
                    <div key={o.id}>
                      <label className={s.opcao} data-marcada={referente === o.id} aria-disabled={o.fechado || undefined}>
                        <input type="radio" name="fc-ref" value={o.id} checked={referente === o.id} disabled={o.fechado}
                          onChange={() => { setReferente(o.id); setErro(null); }} />
                        <span className={s.bola} aria-hidden="true" />
                        <span className={s.opNome}>{o.nome}</span>
                        <span className={s.opPreco}>{o.preco}</span>
                        <span className={s.opDica}>{o.dica}</span>
                      </label>
                      {o.id === 'irmaos' && referente === 'irmaos' && (
                        <div className={`${s.extra} ${s.campo}`}>
                          <label htmlFor="fc-irmao">Nome do irmão inscrito</label>
                          <input id="fc-irmao" autoComplete="off" value={irmao} maxLength={80}
                            aria-invalid={campoMal === 'fc-irmao' || undefined}
                            onChange={e => { setIrmao(e.target.value); corrigiu('fc-irmao'); }} />
                        </div>
                      )}
                      {o.id === 'parcela' && referente === 'parcela' && (
                        <div className={`${s.extra} ${s.campo}`}>
                          <label htmlFor="fc-parcela">Valor desta parcela</label>
                          <input id="fc-parcela" inputMode="numeric" autoComplete="off"
                            value={parcelaDig ? emReais(parcela) : ''} placeholder="R$ 0,00"
                            aria-invalid={campoMal === 'fc-parcela' || undefined}
                            onChange={e => { setParcelaDig(soDigitos(e.target.value).slice(0, 7)); corrigiu('fc-parcela'); }} />
                        </div>
                      )}
                    </div>
                  ))}
                </fieldset>
              </div>

              <div className={s.passo}>
                <h2 className={s.cabecaPasso}><span>3</span>Como você quer pagar</h2>
                <fieldset className={s.opcoes}>
                  <legend>Como você quer pagar</legend>
                  {([
                    temPagarme && { id: 'pix' as const, nome: 'Pix', dica: 'O QR aparece aqui na tela, e a confirmação chega em segundos.' },
                    temPagarme && { id: 'cartao' as const, nome: 'Cartão de crédito', dica: 'Em até 12x, com os juros do parcelamento por conta de quem paga. Você digita o cartão na página da Stone.' },
                    temPixDireto && { id: 'pixdireto' as const, nome: 'Pix direto na conta da igreja', dica: 'Sem taxa. Depois de pagar, mande o comprovante no WhatsApp com o código do pagamento.' },
                  ].filter(Boolean) as { id: Meio; nome: string; dica: string }[]).map(o => (
                    <label key={o.id} className={s.opcao} data-marcada={meio === o.id}>
                      <input type="radio" name="fc-meio" value={o.id} checked={meio === o.id}
                        onChange={() => { setMeio(o.id); setErro(null); }} />
                      <span className={s.bola} aria-hidden="true" />
                      <span className={s.opNome}>{o.nome}</span>
                      <span className={s.opPreco} />
                      <span className={s.opDica}>{o.dica}</span>
                    </label>
                  ))}
                </fieldset>

                {meio === 'pix' && (
                  <div className={s.passo} style={{ marginTop: 6 }}>
                    <p className={s.ajuda}>Dados de quem está pagando. A Stone exige estes quatro para gerar o Pix.</p>
                    <div className={s.campo}>
                      <label htmlFor="fc-pnome">Nome completo</label>
                      <input id="fc-pnome" autoComplete="name" value={pNome} maxLength={80}
                        aria-invalid={campoMal === 'fc-pnome' || undefined} onChange={e => { setPNome(e.target.value); corrigiu('fc-pnome'); }} />
                    </div>
                    <div className={s.dupla}>
                      <div className={s.campo}>
                        <label htmlFor="fc-cpf">CPF</label>
                        <input id="fc-cpf" inputMode="numeric" autoComplete="off" value={pCpf} placeholder="000.000.000-00"
                          aria-invalid={campoMal === 'fc-cpf' || undefined} onChange={e => { setPCpf(formataCpf(e.target.value)); corrigiu('fc-cpf'); }} />
                      </div>
                      <div className={s.campo}>
                        <label htmlFor="fc-cel">Celular com DDD</label>
                        <input id="fc-cel" inputMode="tel" autoComplete="tel-national" value={pCel} placeholder="(21) 99999-9999"
                          aria-invalid={campoMal === 'fc-cel' || undefined} onChange={e => { setPCel(formataCelular(e.target.value)); corrigiu('fc-cel'); }} />
                      </div>
                    </div>
                    <div className={s.campo}>
                      <label htmlFor="fc-email">E-mail</label>
                      <input id="fc-email" type="email" inputMode="email" autoComplete="email" value={pEmail} maxLength={254}
                        aria-invalid={campoMal === 'fc-email' || undefined} onChange={e => { setPEmail(e.target.value); corrigiu('fc-email'); }} />
                    </div>
                    <p className={s.nota}>Esses dados vão direto para a Stone, que processa o pagamento. O site não guarda nenhum deles.</p>
                  </div>
                )}
              </div>

              <div className={s.total} aria-live="polite">
                <span>Total</span>
                <strong>{valor > 0 ? emReais(valor) : 'R$ 0,00'}</strong>
              </div>
              {erro && <p className={s.erro} role="alert">{erro}</p>}
              <div className={s.acoes}>
                <button type="button" className={`${s.btn} ${s.fogo}`} onClick={seguir} disabled={ocupado}>
                  {ocupado ? 'Um instante…' : meio === 'cartao' ? 'Ir para o pagamento com cartão' : meio === 'pixdireto' ? 'Gerar o Pix direto' : 'Gerar o Pix'}
                </button>
              </div>
            </section>
          )}

          {fase === 'pix' && pix && tentativa && (
            <section className={s.painel}>
              <div className={s.pixCab}>
                <h2>Pague com Pix</h2>
                <p>Copie o código e cole no app do banco, ou leia o QR.</p>
                <strong className={s.pixValor}>{emReais(tentativa.valor)}</strong>
              </div>
              {estado === 'aguardando' || estado === 'desconhecido' ? (
                <>
                  <QR texto={pix.copiaECola} rotulo={`QR do Pix de ${emReais(tentativa.valor)}`} />
                  <div className={s.acoes}>
                    <button type="button" className={`${s.btn} ${s.fogo}`} onClick={() => copiar(pix.copiaECola, 'codigo', 'fc-codigo')}>
                      {copiou === 'codigo' ? 'Código copiado' : 'Copiar o código Pix'}
                    </button>
                  </div>
                  <p id="fc-codigo" className={s.codigo}>{pix.copiaECola}</p>
                  <p className={s.estado}><span className={s.gira} aria-hidden="true" />Esperando o pagamento…</p>
                  <span className={s.relogio}>{resta > 0 ? `Este Pix vale por mais ${mmss(resta)}` : 'Conferindo…'}</span>
                </>
              ) : (
                <>
                  <p className={s.erro} role="alert">
                    {estado === 'expirado' ? 'Este Pix passou do prazo e a Stone não registrou o pagamento.' : 'A Stone não confirmou este Pix.'}
                    {' '}Se você já pagou, não pague de novo: fale com a organização com o código {codigoLegivel(tentativa.codigo)}.
                  </p>
                  <div className={s.acoes}>
                    <a className={`${s.btn} ${s.zap}`} href={linkWhatsApp(`Oi! Paguei um Pix do Follow Camp 2027 e a tela não confirmou. Código: ${codigoLegivel(tentativa.codigo)}`)} target="_blank" rel="noopener">Falar com a organização</a>
                    <button type="button" className={`${s.btn} ${s.claro}`} onClick={recomecar}>Não paguei: gerar outro Pix</button>
                  </div>
                </>
              )}
              {erro && <p className={s.erro} role="alert">{erro}</p>}
              {resumo}
              {(estado === 'aguardando' || estado === 'desconhecido') && (
                <>
                  <p className={s.nota}>Se você já pagou este Pix, espere a confirmação aqui e não gere outro.</p>
                  <div className={s.acoes}><button type="button" className={s.link} onClick={recomecar}>Não paguei: voltar e mudar algo</button></div>
                </>
              )}
            </section>
          )}

          {fase === 'pago' && tentativa && (
            <section className={`${s.painel} ${s.pixCab}`}>
              <div className={s.selo}><Check /></div>
              <h2>Pagamento confirmado</h2>
              <p>A Stone confirmou o Pix. Guarde o código abaixo.</p>
              {resumo}
              <div className={s.acoes}>
                <a className={`${s.btn} ${s.zap}`} href={zapDoFim} target="_blank" rel="noopener">Avisar no WhatsApp</a>
                <a className={`${s.btn} ${s.claro}`} href="/followcamp">Voltar para o Camp</a>
              </div>
            </section>
          )}

          {fase === 'pixdireto' && tentativa && (
            <section className={s.painel}>
              <div className={s.pixCab}>
                <h2>Pix direto</h2>
                <p>Na conta da igreja, sem taxa. Pague no app do banco e depois mande o comprovante.</p>
                <strong className={s.pixValor}>{emReais(tentativa.valor)}</strong>
              </div>
              {codigoDireto ? (
                <>
                  <QR texto={codigoDireto} rotulo={`QR do Pix de ${emReais(tentativa.valor)}`} />
                  <div className={s.acoes}>
                    <button type="button" className={`${s.btn} ${s.fogo}`} onClick={() => copiar(codigoDireto, 'codigo', 'fc-codigo-direto')}>
                      {copiou === 'codigo' ? 'Código copiado' : 'Copiar o código Pix'}
                    </button>
                  </div>
                  <p id="fc-codigo-direto" className={s.codigo}>{codigoDireto}</p>
                  <div className={s.chave}>
                    <div><span>Ou use a chave</span><strong id="fc-chave">{PIX_CHAVE}</strong></div>
                    <button type="button" onClick={() => copiar(PIX_CHAVE, 'chave', 'fc-chave')}>{copiou === 'chave' ? 'Copiada' : 'Copiar'}</button>
                  </div>
                </>
              ) : <p className={s.erro}>O Pix direto não está disponível agora. Fale com a organização.</p>}
              {erro && <p className={s.erro} role="alert">{erro}</p>}
              {resumo}
              <div className={s.acoes}>
                <a className={`${s.btn} ${s.zap}`} href={zapDoFim} target="_blank" rel="noopener">Mandar o comprovante</a>
              </div>
              <p className={s.nota}>Este pagamento não é confirmado sozinho: a organização confere o comprovante com o extrato. Mande o comprovante com o código acima.</p>
              <div className={s.acoes}><button type="button" className={s.link} onClick={recomecar}>Voltar e mudar algo</button></div>
            </section>
          )}

          {fase === 'voltaCartao' && tentativa && (
            <section className={`${s.painel} ${s.pixCab}`}>
              <div className={`${s.selo} ${s.seloNeutro}`}><Cartao /></div>
              <h2>Pagamento pelo cartão enviado</h2>
              <p>A Stone confirma por e-mail para quem pagou. Se o pagamento ficar em análise, a confirmação pode levar alguns minutos. Guarde o código abaixo.</p>
              {resumo}
              <div className={s.acoes}>
                <a className={`${s.btn} ${s.zap}`} href={zapDoFim} target="_blank" rel="noopener">Avisar no WhatsApp</a>
                <a className={`${s.btn} ${s.claro}`} href="/followcamp">Voltar para o Camp</a>
              </div>
            </section>
          )}
        </div>
      </main>
      <p className={s.rodape}>
        Pagamentos processados pela Stone. O site não guarda CPF, cartão nem e-mail. <a href="/privacidade">Privacidade</a>
      </p>
    </div>
  );
}
