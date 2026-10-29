'use client';
/* =============================================================================
   O LINK PESSOAL DA INSCRIÇÃO — 19/10/2026 (migração 114)

   O Arthur: "preciso conseguir registrar com mais precisão os pagantes nesse
   formato de carnê" e "de quem paga por cartão ou pix [...] o sistema ir
   acompanhando tudo e tendo controle". Esta tela é a parte da pessoa:

     1. a situação: quanto é, quanto a organização já confirmou, quanto está
        em conferência e quanto falta (e, no carnê, cada parcela com a data);
     2. o plano do carnê, uma vez: 1, 2 ou 3 parcelas iguais (lib/followcamp-
        carne.ts decide as datas e os valores);
     3. pagar: Pix com QR (o código do pagamento vai no txid) ou, na inscrição
        inteira, o link do cartão da Stone;
     4. o comprovante: foto (reduzida aqui mesmo, para caber no celular de
        quem manda e no banco) ou PDF. Ele vai para o pagamento certo, na ficha
        certa, pelo link.

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
import { FC27, codigoFC27, codigoLegivel, linkCartaoDe, linkWhatsApp, type LinkCartao } from '@/lib/followcamp';
import { contaDaFicha, diaMes, maxParcelas, planoDe, centavos, type EstadoParcela } from '@/lib/followcamp-carne';
import { referenteDa } from '@/lib/followcamp-minha';
import type { Minha as MinhaDados, MeuPagamento } from '@/lib/followcamp-banco';
import s from './pagar.module.css';
import m from './minha.module.css';

const CHAVE_TEMA = 'fc27-tema';
const TEMA_ANTES = `try{var t=localStorage.getItem('${'fc27-tema'}');var d=document.currentScript&&document.currentScript.parentElement;if(d&&(t==='dark'||t==='light'))d.setAttribute('data-tema',t==='dark'?'escuro':'claro')}catch(e){}`;
const ANDAMENTO_VALE = 3 * 60 * 60 * 1000;

const reais = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

type Andamento = { codigo: string; valor: number; meio: 'pixdireto' | 'cartaoLink'; criado: number };

const ROTULO_ESTADO: Record<EstadoParcela, string> = { paga: 'Paga', conferindo: 'Em conferência', aberta: 'Em aberto', vencida: 'Vencida' };
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
  const [escolha, setEscolha] = useState<number | null>(null);
  const [querCarne, setQuerCarne] = useState(false);
  const [valorOpcao, setValorOpcao] = useState<'proxima' | 'tudo'>('proxima');
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
  const max = maxParcelas(agora);
  const carne = conta.carne || querCarne;
  const precisaPlano = carne && !conta.plano && conta.total != null && max > 0;
  /* só o link que a Stone diz que ainda abre (a página manda a lista já conferida) */
  const link = conta.carne ? null : linkCartaoDe(referente, agora, links);
  const podeCartao = !!link && conta.pago + conta.conferindo === 0 && conta.total != null && centavos(link.valor) === conta.total;

  const prox = conta.situacao?.proxima ?? null;
  const valorProxima = prox ? prox.falta : conta.falta ?? 0;
  const valorTudo = conta.falta ?? 0;
  const aPagar = carne && conta.plano && valorOpcao === 'proxima' ? valorProxima : valorTudo;

  const estado: { rot: string; tom: 'ok' | 'aviso' | 'ruim' | 'neutro' } =
    conta.quitado ? { rot: 'Quitada', tom: 'ok' }
    : conta.situacao?.atrasada ? { rot: 'Parcela vencida', tom: 'ruim' }
    : precisaPlano ? { rot: 'Falta escolher o plano do carnê', tom: 'aviso' }
    : conta.falta === 0 && conta.conferindo > 0 ? { rot: 'Em conferência', tom: 'neutro' }
    : conta.situacao ? { rot: 'Em dia', tom: 'ok' }
    : { rot: 'Em aberto', tom: 'aviso' };

  function guardarAndamento(a: Andamento | null) {
    setAndamento(a);
    try {
      if (a) sessionStorage.setItem(chaveAndamento, JSON.stringify(a));
      else sessionStorage.removeItem(chaveAndamento);
    } catch { /* ok */ }
  }

  async function escolherPlano() {
    if (!escolha) { setErro('Escolha em quantas parcelas.'); return; }
    setErro(null); setOk(null); setOcupado('plano');
    try {
      const r = await fetch('/api/followcamp/minha', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, parcelas: escolha }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) { setErro(j?.erro || 'Não deu certo agora. Tente de novo em instantes.'); setOcupado(null); return; }
      setOk('Plano escolhido.');
      setQuerCarne(false);
      router.refresh();
    } catch {
      setErro('Sem conexão. Confira a internet e tente de novo.');
    }
    setOcupado(null);
  }

  function comecar(meio: 'pixdireto' | 'cartaoLink') {
    setErro(null); setOk(null);
    const valor = meio === 'cartaoLink' && link ? centavos(link.valor) : aPagar;
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

  const planoSimulado = (n: number) => (conta.total != null ? planoDe(conta.total, n, agora) : null);
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
          <ul className={s.resumo}>
            <li><span>Inscrição{f.irmao ? ' (com desconto de irmão)' : ''}</span><strong>{conta.total != null ? reais(conta.total) : 'a confirmar'}</strong></li>
            <li><span>Confirmado pela organização</span><strong>{reais(conta.pago)}</strong></li>
            {conta.conferindo > 0 && <li><span>Em conferência</span><strong>{reais(conta.conferindo)}</strong></li>}
            <li><span>Falta pagar</span><strong>{conta.falta != null ? reais(conta.falta) : 'a confirmar'}</strong></li>
          </ul>
          {conta.situacao && (
            <ol className={m.parcelas} aria-label="Parcelas do carnê">
              {conta.situacao.parcelas.map(p => (
                <li key={p.numero} data-estado={p.estado}>
                  <span className={m.pNum}>{p.numero}ª</span>
                  <span className={m.pData}>vence {diaMes(p.vencimento)}</span>
                  <strong className={m.pValor}>{reais(p.valor)}</strong>
                  <span className={m.pEstado}>{ROTULO_ESTADO[p.estado]}{p.estado === 'aberta' || p.estado === 'vencida' ? (p.falta < p.valor ? ` · faltam ${reais(p.falta)}` : '') : ''}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {erro && <p className={s.erro} role="alert">{erro}</p>}
        {ok && <p className={m.ok} role="status">{ok}</p>}

        {/* 2 · o plano do carnê */}
        {precisaPlano && (
          <section className={s.painel} aria-labelledby="fc-plano">
            <h2 id="fc-plano" className={s.cabecaPasso}><span>1</span>Em quantas parcelas?</h2>
            <p className={s.ajuda}>Parcelas iguais, no Pix. Cada uma vence no dia 10, e a última até 03/01. Dá para pagar antes.</p>
            <fieldset className={s.opcoes}>
              <legend>Número de parcelas</legend>
              {Array.from({ length: max }, (_, i) => i + 1).map(n => {
                const pl = planoSimulado(n);
                if (!pl) return null;
                return (
                  <label key={n} className={s.opcao} data-marcada={escolha === n}>
                    <input type="radio" name="fc-parcelas" value={n} checked={escolha === n} onChange={() => setEscolha(n)} />
                    <span className={s.bola} aria-hidden="true" />
                    <span className={s.opNome}>{n === 1 ? 'Uma vez' : `${n} parcelas`}</span>
                    <span className={s.opPreco}>{n === 1 ? reais(pl[0].valor) : `${n}× ${reais(pl[0].valor)}`}</span>
                    <span className={s.opDica}>{pl.map(p => `${diaMes(p.vencimento)}: ${reais(p.valor)}`).join(' · ')}</span>
                  </label>
                );
              })}
            </fieldset>
            <div className={s.acoes}>
              <button type="button" className={`${s.btn} ${s.fogo}`} onClick={escolherPlano} disabled={ocupado === 'plano'}>
                {ocupado === 'plano' ? 'Salvando…' : 'Confirmar o plano'}
              </button>
              {querCarne && <button type="button" className={s.link} onClick={() => setQuerCarne(false)}>Voltar</button>}
            </div>
          </section>
        )}

        {/* 3 · pagar */}
        {!precisaPlano && (conta.falta ?? 0) > 0 && !andamento && (
          <section className={s.painel} aria-labelledby="fc-pagar">
            <h2 id="fc-pagar" className={s.cabecaPasso}><span>1</span>Pagar</h2>
            {carne && conta.plano && prox && valorProxima !== valorTudo && (
              <fieldset className={s.opcoes}>
                <legend>Quanto pagar agora</legend>
                <label className={s.opcao} data-marcada={valorOpcao === 'proxima'}>
                  <input type="radio" name="fc-quanto" checked={valorOpcao === 'proxima'} onChange={() => setValorOpcao('proxima')} />
                  <span className={s.bola} aria-hidden="true" />
                  <span className={s.opNome}>Parcela {prox.numero}{prox.estado === 'vencida' ? ' (vencida)' : ''}</span>
                  <span className={s.opPreco}>{reais(valorProxima)}</span>
                  <span className={s.opDica}>vence {diaMes(prox.vencimento)}</span>
                </label>
                <label className={s.opcao} data-marcada={valorOpcao === 'tudo'}>
                  <input type="radio" name="fc-quanto" checked={valorOpcao === 'tudo'} onChange={() => setValorOpcao('tudo')} />
                  <span className={s.bola} aria-hidden="true" />
                  <span className={s.opNome}>Tudo o que falta</span>
                  <span className={s.opPreco}>{reais(valorTudo)}</span>
                </label>
              </fieldset>
            )}
            <div className={s.total}><span>Valor</span><strong>{reais(aPagar)}</strong></div>
            <div className={s.acoes}>
              {temPix && <button type="button" className={`${s.btn} ${s.fogo}`} onClick={() => comecar('pixdireto')}>Pagar no Pix</button>}
              {podeCartao && link && (
                <button type="button" className={`${s.btn} ${s.claro}`} onClick={() => comecar('cartaoLink')}>
                  Pagar no cartão ({reais(centavos(link.valor))}{link.parcelas > 1 ? ` em até ${link.parcelas}x` : ' à vista'})
                </button>
              )}
              {!carne && max > 0 && conta.pago + conta.conferindo === 0 && (
                <button type="button" className={s.link} onClick={() => setQuerCarne(true)}>Prefiro parcelar no carnê</button>
              )}
            </div>
            {!temPix && <p className={s.nota}>O Pix pelo site está fora do ar agora. Fale com a organização no WhatsApp.</p>}
          </section>
        )}

        {/* 3b · o pagamento em andamento */}
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
