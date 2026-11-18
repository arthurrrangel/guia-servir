'use client';
/* =============================================================================
   O LINK PESSOAL DA INSCRIÇÃO — 19/10/2026 (migração 114), carnê livre 18/11/2026

   O Arthur: "preciso conseguir registrar com mais precisão os pagantes nesse
   formato de carnê" e "de quem paga por cartão ou pix [...] o sistema ir
   acompanhando tudo e tendo controle". Esta tela é a parte da pessoa:

     1. a situação: quanto é, quanto a organização já confirmou, quanto está
        em conferência e quanto falta (e, no carnê, o prazo: 03/01);
     2. pagar. À vista: o que falta, no Pix com QR (o código do pagamento vai
        no txid) ou, na inscrição inteira, no link do cartão da Stone. No
        carnê (18/11, o Arthur: "deixar ela escolher a quantia"): quanto a
        pessoa quiser, no Pix, um sinal e depois o resto, quantas vezes
        quiser até 03/01. Sem plano e sem parcela fixa (lib/followcamp-
        carne.ts). A ficha à vista pode passar para o carnê daqui mesmo;
     3. o comprovante de cada pagamento: foto (reduzida aqui mesmo, para
        caber no celular de quem manda e no banco) ou PDF. Ele vai para o
        pagamento certo, na ficha certa, pelo link.

   O QUE ESTA TELA PODE AFIRMAR: "confirmado" só o que a organização conferiu.
   O que a pessoa mandou fica "em conferência". Nunca "pagamento aprovado".

   O pagamento em andamento (o código e o valor) fica na sessão por 3 horas:
   se a aba for descartada enquanto a pessoa está no app do banco, ela volta
   para o MESMO código, e o comprovante cai no mesmo pagamento.
   ============================================================================= */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import qrcode from 'qrcode-generator';
import { pixCopiaECola } from '@/lib/pix';
import { PIX_CHAVE, PIX_NOME, PIX_CIDADE } from '@/lib/oferta';
import { FC27, carneAberto, codigoFC27, codigoLegivel, linkCartaoDe, linkWhatsApp, soDigitos, type LinkCartao } from '@/lib/followcamp';
import { contaDaFicha, diaMes, minimoDoPagamento, centavos, PRAZO_DO_CARNE } from '@/lib/followcamp-carne';
import { conferirValorDoCarne, referenteDa } from '@/lib/followcamp-minha';
import type { Minha as MinhaDados, MeuPagamento } from '@/lib/followcamp-banco';
import s from './pagar.module.css';
import m from './minha.module.css';

const CHAVE_TEMA = 'fc27-tema';
const TEMA_ANTES = `try{var t=localStorage.getItem('${'fc27-tema'}');var d=document.currentScript&&document.currentScript.parentElement;if(d&&(t==='dark'||t==='light'))d.setAttribute('data-tema',t==='dark'?'escuro':'claro')}catch(e){}`;
const ANDAMENTO_VALE = 3 * 60 * 60 * 1000;

const reais = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

type Andamento = { codigo: string; valor: number; meio: 'pixdireto' | 'cartaoLink'; criado: number };

const ROTULO_FORMA: Record<string, string> = {
  pix_direto: 'Pix', link_stone: 'Cartão (Stone)', pix_stone: 'Pix (Stone)', cartao_stone: 'Cartão (Stone)', dinheiro: 'Dinheiro',
};

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

const paraBase64 = (b: Blob) => new Promise<string>((ok, mal) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(',')[1] || '');
  r.onerror = () => mal(new Error('leitura'));
  r.readAsDataURL(b);
});

/** Foto: reduzida a 1600 px em JPEG (um print de banco cabe em ~200 KB). PDF: como veio, até 3 MB. */
async function prepararArquivo(f: File): Promise<{ base64: string } | { erro: string }> {
  if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
    if (f.size > 3_000_000) return { erro: 'O PDF passa de 3 MB. Mande um print do comprovante.' };
    return { base64: await paraBase64(f) };
  }
  try {
    const bmp = await createImageBitmap(f);
    const escala = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * escala)), h = Math.max(1, Math.round(bmp.height * escala));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', 0.82));
    if (!blob) throw new Error('jpeg');
    return { base64: await paraBase64(blob) };
  } catch {
    if (/^image\/(jpeg|png|webp)$/.test(f.type) && f.size <= 3_000_000) return { base64: await paraBase64(f) };
    return { erro: 'Não consegui ler essa foto. Tire um print do comprovante e mande o print.' };
  }
}

export default function Minha({ token, dados, temPix, links }: { token: string; dados: MinhaDados; temPix: boolean; links: readonly LinkCartao[] }) {
  const router = useRouter();
  const [tema, setTema] = useState<'claro' | 'escuro' | null>(null);
  const [sistemaEscuro, setSistemaEscuro] = useState(false);
  /* o carnê: um sinal ou uma parte (o valor digitado) ou tudo o que falta */
  const [modo, setModo] = useState<'parte' | 'tudo'>('parte');
  const [valorDig, setValorDig] = useState('');
  const [valorMal, setValorMal] = useState(false);
  /* a ficha à vista pedindo o carnê: o aviso antes de confirmar, e o que já virou */
  const [pedindoCarne, setPedindoCarne] = useState(false);
  const [virouCarne, setVirouCarne] = useState(false);
  const [andamento, setAndamento] = useState<Andamento | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const chaveAndamento = `fc27-minha-${token}`;

  useEffect(() => {
    try {
      const t = localStorage.getItem(CHAVE_TEMA);
      if (t === 'dark' || t === 'light') setTema(t === 'dark' ? 'escuro' : 'claro');
    } catch { /* ok */ }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setSistemaEscuro(mq.matches);
    const f = (e: MediaQueryListEvent) => setSistemaEscuro(e.matches);
    mq.addEventListener?.('change', f);
    try {
      const a = JSON.parse(sessionStorage.getItem(chaveAndamento) || 'null') as Andamento | null;
      if (a && /^FC27[A-HJ-NP-Z2-9]{8}$/.test(a.codigo) && Date.now() - a.criado < ANDAMENTO_VALE) setAndamento(a);
    } catch { /* ok */ }
    return () => mq.removeEventListener?.('change', f);
  }, [chaveAndamento]);

  const escuro = tema ? tema === 'escuro' : sistemaEscuro;
  function trocarTema() {
    const novo = escuro ? 'claro' : 'escuro';
    setTema(novo);
    try { localStorage.setItem(CHAVE_TEMA, novo === 'escuro' ? 'dark' : 'light'); } catch { /* ok */ }
  }

  /* ------------------------------------------------------- a página fora --- */
  if (!dados.ok) {
    const texto = dados.erro === 'CANCELADA'
      ? 'Esta inscrição foi cancelada. Se foi engano, fale com a organização.'
      : dados.erro === 'FORA_DO_AR'
        ? 'O sistema está fora do ar agora. Tente de novo em instantes.'
        : 'Este link não é de nenhuma inscrição. Confira se ele veio inteiro na mensagem.';
    return (
      <div className={s.raiz} data-tema={tema ?? undefined} suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: TEMA_ANTES }} />
        <Topo titulo="Minha inscrição" sub={`${FC27.tema} · ${FC27.quando}`} escuro={escuro} trocarTema={trocarTema} />
        <main className={s.coluna}>
          <section className={`${s.painel} ${s.pixCab}`}>
            <h2>{dados.erro === 'FORA_DO_AR' ? 'Fora do ar' : dados.erro === 'CANCELADA' ? 'Inscrição cancelada' : 'Link inválido'}</h2>
            <p>{texto}</p>
            <div className={s.acoes}>
              <a className={`${s.btn} ${s.zap}`} href={linkWhatsApp('Oi! Preciso de ajuda com o link da minha inscrição no Follow Camp 2027.')} target="_blank" rel="noopener">Falar com a organização</a>
            </div>
          </section>
        </main>
      </div>
    );
  }

  /* ------------------------------------------------------------- a conta --- */
  const agora = new Date(dados.agora);
  const f = dados.ficha;
  const conta = contaDaFicha(f, dados.pagamentos, agora);
  const referente = referenteDa(f);
  const carne = conta.carne || virouCarne;
  const aberto = carneAberto(agora);
  const ate = diaMes(PRAZO_DO_CARNE);
  const falta = conta.falta ?? 0;
  const nadaPago = conta.pago + conta.conferindo === 0;
  /* só o link que a Stone diz que ainda abre (a página manda a lista já conferida) */
  const link = carne ? null : linkCartaoDe(referente, agora, links);
  const podeCartao = !!link && nadaPago && conta.total != null && centavos(link.valor) === conta.total;

  /* o carnê: de PARCELA_MIN até o que falta; faltando menos, só o que falta */
  const minimo = minimoDoPagamento(falta);
  const soTudo = carne && falta > 0 && minimo === falta;
  const escolhido = valorDig ? parseInt(valorDig, 10) : 0;
  const aPagar = !carne || soTudo || modo === 'tudo' ? falta : escolhido;

  const estado: { rot: string; tom: 'ok' | 'aviso' | 'ruim' | 'neutro' } =
    conta.total == null ? { rot: 'Valor a confirmar', tom: 'neutro' }
    : conta.quitado ? { rot: 'Quitada', tom: 'ok' }
    : conta.vencido ? { rot: 'Prazo do carnê vencido', tom: 'ruim' }
    : conta.falta === 0 && conta.conferindo > 0 ? { rot: 'Em conferência', tom: 'neutro' }
    : carne && !nadaPago ? { rot: 'Carnê em dia', tom: 'ok' }
    : carne ? { rot: 'Falta o sinal', tom: 'aviso' }
    : { rot: 'Em aberto', tom: 'aviso' };

  function guardarAndamento(a: Andamento | null) {
    setAndamento(a);
    try {
      if (a) sessionStorage.setItem(chaveAndamento, JSON.stringify(a));
      else sessionStorage.removeItem(chaveAndamento);
    } catch { /* ok */ }
  }

  async function entrarNoCarne() {
    setErro(null); setOk(null); setOcupado('carne');
    try {
      const r = await fetch('/api/followcamp/minha', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, carne: true }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) { setErro(j?.erro || 'Não deu certo agora. Tente de novo em instantes.'); setOcupado(null); return; }
      setOk('Pronto: a inscrição está no carnê. Escolha quanto vai pagar agora.');
      setPedindoCarne(false);
      setVirouCarne(true);
      router.refresh();
    } catch {
      setErro('Sem conexão. Confira a internet e tente de novo.');
    }
    setOcupado(null);
  }

  function comecar(meio: 'pixdireto' | 'cartaoLink') {
    setErro(null); setOk(null); setValorMal(false);
    let valor = falta;
    if (meio === 'cartaoLink' && link) valor = centavos(link.valor);
    else if (carne) {
      /* o mesmo recado que o servidor daria, antes de gerar o Pix */
      const v = conferirValorDoCarne(aPagar, falta);
      if (!v.ok) {
        setErro(v.erro);
        if (modo === 'parte' && !soTudo) { setValorMal(true); document.getElementById('fc-valor')?.focus(); }
        return;
      }
      valor = v.dados;
    }
    if (valor <= 0) return;
    guardarAndamento({ codigo: codigoFC27(), valor, meio, criado: Date.now() });
  }

  async function enviar(codigo: string, valor: number, meio: 'pixdireto' | 'cartaoLink', arquivo: File | null) {
    setErro(null); setOk(null); setOcupado(codigo);
    try {
      let corpo: Record<string, unknown> = { token, codigo, meio, valor: valor / 100 };
      if (arquivo) {
        const a = await prepararArquivo(arquivo);
        if ('erro' in a) { setErro(a.erro); setOcupado(null); return; }
        corpo = { ...corpo, arquivo: a.base64 };
      } else {
        corpo = { ...corpo, semArquivo: true };
      }
      const r = await fetch('/api/followcamp/comprovante', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) { setErro(j?.erro || 'Não deu certo agora. Tente de novo em instantes.'); setOcupado(null); return; }
      setOk(arquivo
        ? 'Comprovante enviado. A organização confere no extrato e o pagamento aparece aqui como confirmado.'
        : 'Aviso enviado. Quando puder, mande o comprovante por aqui mesmo, na lista de pagamentos.');
      if (andamento?.codigo === codigo) guardarAndamento(null);
      router.refresh();
    } catch {
      setErro('Sem conexão. Confira a internet e tente de novo.');
    }
    setOcupado(null);
  }

  const pix = andamento && andamento.meio === 'pixdireto' && temPix
    ? pixCopiaECola({ chave: PIX_CHAVE, nome: PIX_NOME, cidade: PIX_CIDADE, valor: andamento.valor / 100, txid: andamento.codigo })
    : null;

  const semComprovante = dados.pagamentos.filter(p => !p.conferido && p.comprovantes === 0 && p.codigo);

  return (
    <div className={s.raiz} data-tema={tema ?? undefined} suppressHydrationWarning>
      <script dangerouslySetInnerHTML={{ __html: TEMA_ANTES }} />
      <Topo titulo="Minha inscrição" sub={f.campista} escuro={escuro} trocarTema={trocarTema} />

      <main className={s.coluna}>
        {/* o recado de erro (role=alert) e o de sucesso (role=status) já são
            anunciados pelo leitor de tela: uma região viva a mais repetiria */}
        {/* 1 · a situação */}
        <section className={s.painel} aria-labelledby="fc-situacao">
          <div className={m.cabeca}>
            <h2 id="fc-situacao" className={m.h2}>Situação</h2>
            <span className={m.estado} data-tom={estado.tom}>{estado.rot}</span>
          </div>
          <ul className={`${s.resumo} ${m.valores}`}>
            <li><span>Inscrição{f.irmao ? ' (com desconto de irmão)' : ''}</span><strong>{conta.total != null ? reais(conta.total) : 'a confirmar'}</strong></li>
            <li><span>Confirmado pela organização</span><strong>{reais(conta.pago)}</strong></li>
            {conta.conferindo > 0 && <li><span>Em conferência</span><strong>{reais(conta.conferindo)}</strong></li>}
            <li><span>Falta pagar</span><strong>{conta.falta != null ? reais(conta.falta) : 'a confirmar'}</strong></li>
            {carne && !conta.quitado && conta.total != null && <li><span>Prazo do carnê</span><strong>até {ate}</strong></li>}
          </ul>
        </section>

        {erro && <p className={s.erro} role="alert">{erro}</p>}
        {ok && <p className={m.ok} role="status">{ok}</p>}

        {/* 2 · pagar no carnê: quanto quiser, até 03/01 */}
        {carne && falta > 0 && !andamento && (
          <section className={s.painel} aria-labelledby="fc-pagar">
            <h2 id="fc-pagar" className={s.cabecaPasso}><span>1</span>{soTudo ? 'Pagar o que falta' : 'Quanto você vai pagar agora?'}</h2>
            <p className={s.ajuda}>
              {aberto
                ? `No carnê você paga no Pix quanto quiser, quantas vezes quiser: ${nadaPago ? 'um sinal agora' : 'uma parte agora'} e o resto até ${ate}. A cada pagamento, mande o comprovante por aqui.`
                : `O prazo do carnê era ${ate}. Pague o que falta no Pix e mande o comprovante por aqui.`}
            </p>
            {!soTudo && (
              <fieldset className={s.opcoes}>
                <legend>Quanto pagar agora</legend>
                <div>
                  <label className={s.opcao} data-marcada={modo === 'parte'}>
                    <input type="radio" name="fc-quanto" value="parte" checked={modo === 'parte'} onChange={() => { setModo('parte'); setValorMal(false); setErro(null); }} />
                    <span className={s.bola} aria-hidden="true" />
                    <span className={s.opNome}>{nadaPago ? 'Um sinal' : 'Uma parte'}</span>
                    <span className={s.opPreco}>{modo === 'parte' && escolhido > 0 ? reais(escolhido) : ''}</span>
                    <span className={s.opDica}>Você escolhe o valor: de {reais(minimo)} a {reais(falta)}.</span>
                  </label>
                  {modo === 'parte' && (
                    <div className={`${s.extra} ${s.campo}`}>
                      <label htmlFor="fc-valor">Valor deste pagamento</label>
                      <input id="fc-valor" inputMode="numeric" autoComplete="off"
                        value={valorDig ? reais(escolhido) : ''} placeholder="R$ 0,00"
                        aria-invalid={valorMal || undefined}
                        onChange={e => {
                          setValorDig(soDigitos(e.target.value).replace(/^0+/, '').slice(0, 7));
                          /* corrigiu o campo do recado: o recado sai (como em Pagar.tsx) */
                          if (valorMal) { setValorMal(false); setErro(null); }
                        }} />
                    </div>
                  )}
                </div>
                <label className={s.opcao} data-marcada={modo === 'tudo'}>
                  <input type="radio" name="fc-quanto" value="tudo" checked={modo === 'tudo'} onChange={() => { setModo('tudo'); setValorMal(false); setErro(null); }} />
                  <span className={s.bola} aria-hidden="true" />
                  <span className={s.opNome}>Tudo o que falta</span>
                  <span className={s.opPreco}>{reais(falta)}</span>
                </label>
              </fieldset>
            )}
            <div className={s.total}><span>Valor</span><strong>{reais(aPagar)}</strong></div>
            <div className={s.acoes}>
              {temPix && <button type="button" className={`${s.btn} ${s.fogo}`} onClick={() => comecar('pixdireto')}>Pagar no Pix</button>}
            </div>
            {!temPix && <p className={s.nota}>O Pix pelo site está fora do ar agora. Fale com a organização no WhatsApp.</p>}
          </section>
        )}

        {/* 2 · pagar à vista: o que falta, inteiro */}
        {!carne && falta > 0 && !andamento && (
          <section className={s.painel} aria-labelledby="fc-pagar">
            <h2 id="fc-pagar" className={s.cabecaPasso}><span>1</span>Pagar</h2>
            <div className={s.total}><span>Valor</span><strong>{reais(falta)}</strong></div>
            <div className={s.acoes}>
              {temPix && <button type="button" className={`${s.btn} ${s.fogo}`} onClick={() => comecar('pixdireto')}>Pagar no Pix</button>}
              {podeCartao && link && (
                <button type="button" className={`${s.btn} ${s.claro}`} onClick={() => comecar('cartaoLink')}>
                  Pagar no cartão ({reais(centavos(link.valor))}{link.parcelas > 1 ? ` em até ${link.parcelas}x` : ' à vista'})
                </button>
              )}
              {aberto && !pedindoCarne && (
                <button type="button" className={s.link} onClick={() => { setPedindoCarne(true); setErro(null); setOk(null); }}>Prefiro pagar em partes no carnê</button>
              )}
            </div>
            {pedindoCarne && (
              <>
                <p className={s.nota}>
                  No carnê você paga no Pix quanto quiser, quantas vezes quiser: um sinal agora e o resto até {ate}.
                  {podeCartao ? ' O cartão fica só para quem paga tudo de uma vez.' : ''} Depois de passar para o carnê, voltar para à vista é com a organização.
                </p>
                <div className={s.acoes}>
                  <button type="button" className={`${s.btn} ${s.claro}`} onClick={() => void entrarNoCarne()} disabled={ocupado === 'carne'}>
                    {ocupado === 'carne' ? 'Salvando…' : 'Quero pagar no carnê'}
                  </button>
                  <button type="button" className={s.link} onClick={() => setPedindoCarne(false)}>Voltar</button>
                </div>
              </>
            )}
            {!temPix && <p className={s.nota}>O Pix pelo site está fora do ar agora. Fale com a organização no WhatsApp.</p>}
          </section>
        )}

        {/* 3 · o pagamento em andamento */}
        {andamento && (
          <section className={`${s.painel} ${s.pixCab}`} aria-labelledby="fc-andamento">
            <h2 id="fc-andamento">{andamento.meio === 'pixdireto' ? 'Pague no Pix' : 'Pague no cartão'}</h2>
            <p>Código do pagamento: <b className={m.codigo}>{codigoLegivel(andamento.codigo)}</b></p>
            <strong className={s.pixValor}>{reais(andamento.valor)}</strong>
            {pix && (
              <>
                <QR texto={pix} rotulo={`QR Code do Pix de ${reais(andamento.valor)}`} />
                <p className={s.codigo}>{pix}</p>
                <div className={s.acoes}>
                  <button type="button" className={`${s.btn} ${s.claro}`} onClick={() => {
                    navigator.clipboard?.writeText(pix).then(() => setCopiado(true), () => setCopiado(false));
                  }}>{copiado ? 'Copiado' : 'Copiar o Pix copia e cola'}</button>
                </div>
              </>
            )}
            {andamento.meio === 'cartaoLink' && link && (
              <div className={s.acoes}>
                <a className={`${s.btn} ${s.fogo}`} href={link.url} target="_blank" rel="noopener noreferrer">Abrir o pagamento no cartão</a>
              </div>
            )}
            <p className={s.nota}>Pagou? Mande o comprovante (print ou PDF): ele vai direto para a sua inscrição.</p>
            <div className={s.acoes}>
              {/* o <label> abre o seletor de arquivo pelo próprio navegador (o
                  clique por script é barrado no iPhone fora do toque) */}
              <label className={`${s.btn} ${s.zap} ${m.botaoArquivo}`} aria-disabled={ocupado === andamento.codigo || undefined}>
                <input className={m.arquivo} type="file" accept="image/*,application/pdf" disabled={ocupado === andamento.codigo}
                  onChange={e => { const a = e.target.files?.[0]; e.target.value = ''; if (a) void enviar(andamento.codigo, andamento.valor, andamento.meio, a); }} />
                {ocupado === andamento.codigo ? 'Enviando…' : 'Mandar o comprovante'}
              </label>
              <button type="button" className={s.link} disabled={ocupado === andamento.codigo}
                onClick={() => void enviar(andamento.codigo, andamento.valor, andamento.meio, null)}>
                Paguei, mando o comprovante depois
              </button>
              <button type="button" className={s.link} onClick={() => guardarAndamento(null)}>Cancelar este pagamento</button>
            </div>
          </section>
        )}

        {/* 4 · os pagamentos */}
        {dados.pagamentos.length > 0 && (
          <section className={s.painel} aria-labelledby="fc-pagamentos">
            <h2 id="fc-pagamentos" className={m.h2}>Pagamentos</h2>
            <ul className={m.lista}>
              {dados.pagamentos.map((p: MeuPagamento, i) => (
                <li key={`${p.codigo ?? 'x'}-${i}`}>
                  <div>
                    <strong>{reais(centavos(Number(p.valor)))}</strong>
                    <span className={m.sub}>{dataBr(p.pago_em)} · {ROTULO_FORMA[p.forma] || p.forma}{p.comprovantes > 0 ? ' · comprovante enviado' : ''}</span>
                  </div>
                  <span className={m.estado} data-tom={p.conferido ? 'ok' : 'neutro'}>{p.conferido ? 'Confirmado' : 'Em conferência'}</span>
                </li>
              ))}
            </ul>
            {semComprovante.length > 0 && (
              <>
                <p className={s.nota}>Falta o comprovante de {semComprovante.length === 1 ? 'um pagamento' : `${semComprovante.length} pagamentos`}. Mande para a organização conferir mais rápido.</p>
                <div className={s.acoes}>
                  {semComprovante.map(p => (
                    <label key={p.codigo} className={`${s.btn} ${s.claro} ${m.botaoArquivo}`} aria-disabled={ocupado === p.codigo || undefined}>
                      <input className={m.arquivo} type="file" accept="image/*,application/pdf" disabled={ocupado === p.codigo}
                        onChange={e => {
                          const a = e.target.files?.[0]; e.target.value = '';
                          if (a && p.codigo) void enviar(p.codigo, centavos(Number(p.valor)), p.forma === 'link_stone' ? 'cartaoLink' : 'pixdireto', a);
                        }} />
                      {ocupado === p.codigo ? 'Enviando…' : `Mandar o comprovante de ${reais(centavos(Number(p.valor)))} (${dataBr(p.pago_em)})`}
                    </label>
                  ))}
                </div>
              </>
            )}
          </section>
        )}
      </main>
      <p className={s.rodape}>
        Dúvidas? <a href={linkWhatsApp(`Oi! Sou da inscrição de ${f.campista} no Follow Camp 2027.`)} target="_blank" rel="noopener">Fale com a organização</a>. Guarde este link: ele é só seu. <a href="/privacidade">Privacidade</a>
      </p>
    </div>
  );
}

function Topo({ titulo, sub, escuro, trocarTema }: { titulo: string; sub: string; escuro: boolean; trocarTema: () => void }) {
  return (
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
      <h1 className={s.titulo}>{titulo}</h1>
      <p className={s.subtitulo}>{sub}</p>
    </header>
  );
}
