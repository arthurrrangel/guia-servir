'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import { pixCopiaECola } from '@/lib/pix';
import {
  TIPOS, TEM_PIX, PIX_CHAVE, PIX_NOME, PIX_CIDADE,
  txidDe, valorDeDigitos, emReais, valorInvalido, type TipoOferta,
} from '@/lib/oferta';
import { IGREJA, canalDeConversa } from '@/lib/igreja';
import { IcCheck, IcSeta } from '@/components/Icones';

/* =============================================================================
   OFERTAR — a tela

   Três toques até o fim: o tipo, o valor, o meio de pagamento. É o desenho
   inteiro, e ele é curto de propósito: isto roda no escuro, com a igreja
   cantando, numa janela de três minutos. Cada campo a mais aqui é gente que
   desiste no meio.

   O PEDIDO DE ORAÇÃO NÃO ESTÁ NESTA TELA. Ele aparece depois que o pagamento
   acontece, sozinho, opcional, com o aviso de privacidade ao lado — os
   porquês estão em lib/oferta.ts e são de lei e de pastoral, não de layout.

   O QR É O SEGUNDO CAMINHO, NÃO O PRIMEIRO. Quem está no celular não escaneia
   a própria tela: copia o código e cola no app do banco. O QR existe para
   quem abriu a página no computador e vai pagar pelo telefone.
   ============================================================================= */

type Fase = 'escolher' | 'pix' | 'fim';

/** O QR desenhado como SVG a partir da matriz de módulos. SVG e não imagem
 *  porque ele precisa crescer até a largura do celular sem borrar, e porque
 *  assim o arquivo nasce com o tema da página. */
function QR({ texto, rotulo }: { texto: string; rotulo: string }) {
  const { n, caminho } = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(texto, 'Byte');
    q.make();
    const n = q.getModuleCount();
    /* um <path> só, em vez de um <rect> por módulo: 49×49 daria 2401 nós no
       DOM e o celular sente */
    let caminho = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) if (q.isDark(r, c)) caminho += `M${c} ${r}h1v1h-1z`;
    }
    return { n, caminho };
  }, [texto]);

  /* a zona de silêncio de 4 módulos é obrigatória: sem ela o leitor não acha
     as bordas do código */
  const b = 4;
  return (
    <svg className="of-qr" viewBox={`${-b} ${-b} ${n + b * 2} ${n + b * 2}`}
      role="img" aria-label={rotulo} shapeRendering="crispEdges">
      <rect x={-b} y={-b} width={n + b * 2} height={n + b * 2} fill="#ffffff" />
      <path d={caminho} fill="#101010" />
    </svg>
  );
}

/** Quem volta do checkout do adquirente chega em ?fim=1&t=<tipo>&v=<valor>.
 *
 *  ESTES VALORES VÊM DA URL, ou seja qualquer pessoa pode digitá-los. Servem SÓ
 *  para a tela de agradecimento saber o que escrever: nada é gravado, nada é
 *  confirmado, nenhum dinheiro muda de lugar por causa deles. Quem prova que a
 *  oferta aconteceu é o extrato do adquirente e o do banco.
 *
 *  Lido no navegador e não no servidor de propósito: `searchParams` numa página
 *  de servidor a tornaria dinâmica, e esta precisa sair do CDN (ver a nota em
 *  app/ofertar/page.tsx). */
function lerVolta(): { tipo: TipoOferta; valor: number; pendente: boolean } | null {
  if (typeof window === 'undefined') return null;
  const q = new URLSearchParams(window.location.search);
  if (q.get('fim') !== '1') return null;
  const t = q.get('t');
  if (t !== 'dizimo' && t !== 'oferta') return null;
  const v = Number(q.get('v'));
  return { tipo: t, valor: Number.isFinite(v) && v > 0 && v < 1e6 ? v : 0, pendente: q.get('p') === '1' };
}

/** `temCartao` vem do SERVIDOR (app/ofertar/page.tsx), não de uma variável de
 *  ambiente pública: é só um booleano dizendo se existe credencial de
 *  adquirente configurada. O token nunca chega aqui. */
export function Ofertar({ temCartao = false }: { temCartao?: boolean }) {
  const [volta, setVolta] = useState<ReturnType<typeof lerVolta>>(null);
  const [tipo, setTipo] = useState<TipoOferta | null>(null);
  const [digitos, setDigitos] = useState('');
  const [fase, setFase] = useState<Fase>('escolher');
  const [erro, setErro] = useState<string | null>(null);
  const [copiou, setCopiou] = useState(false);
  const [indo, setIndo] = useState(false);
  const [txid, setTxid] = useState('');
  const campo = useRef<HTMLInputElement>(null);
  const caixa = useRef<HTMLDivElement>(null);

  /* Ao trocar de passo, a página continua rolada onde estava — e em 390px o
     botão de copiar nasce abaixo da dobra, atrás do cabeçalho. Num celular no
     escuro, um botão que existe mas não está à vista é um botão que não
     existe. O passo novo sobe para o topo, respeitando a barra fixa pelo
     `scroll-margin-top` da folha.

     Só depois da primeira pintura e só quando o passo muda: na carga inicial
     a página tem que abrir onde o navegador abriu. */
  const passoAnterior = useRef<Fase>('escolher');
  useEffect(() => {
    if (passoAnterior.current === fase) return;
    passoAnterior.current = fase;
    caixa.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [fase]);

  /* a volta do adquirente, depois da hidratação: na montagem, não na
     renderização, senão o HTML do servidor e o do cliente divergem */
  useEffect(() => {
    const v = lerVolta();
    if (!v) return;
    setVolta(v);
    setTipo(v.tipo);
    setDigitos(String(Math.round(v.valor * 100)));
    setFase('fim');
  }, []);

  const valor = valorDeDigitos(digitos);
  const rotuloTipo = TIPOS.find(t => t.id === tipo)?.rot ?? '';

  /* o código só é montado quando há tipo, valor e chave — e é remontado a cada
     centavo digitado, o que custa nada porque não há rede no caminho */
  const codigo = useMemo(() => {
    if (!TEM_PIX || !tipo || !txid || valorInvalido(valor)) return '';
    try {
      return pixCopiaECola({ chave: PIX_CHAVE, nome: PIX_NOME, cidade: PIX_CIDADE, valor, txid });
    } catch {
      return '';
    }
  }, [tipo, txid, valor]);

  /** Antes de seguir, o que falta tem que estar dito em voz alta, não
   *  adivinhado por um botão apagado. */
  function conferir(): boolean {
    if (!tipo) { setErro('Escolha entre dízimo e oferta.'); return false; }
    const mal = valorInvalido(valor);
    if (mal) { setErro(mal); campo.current?.focus(); return false; }
    setErro(null);
    return true;
  }

  function irParaPix() {
    if (!conferir()) return;
    /* o txid nasce AQUI e não a cada tecla: se ele mudasse enquanto a pessoa
       digita, o código copiado poderia não ser o código do QR na tela */
    setTxid(txidDe(tipo!));
    setCopiou(false);
    setFase('pix');
  }

  /* O cartão, o Apple Pay e o Google Pay saem daqui. A tela NÃO fala com o
     adquirente: pede ao nosso servidor uma URL de checkout e vai para lá. A
     credencial fica do lado de lá o tempo todo (lib/checkout.ts).

     `indo` não é enfeite: sem ele, dois toques no botão abrem duas sessões de
     pagamento, e a pessoa pode acabar pagando duas vezes. */
  async function irParaCartao() {
    if (indo || !conferir()) return;
    setIndo(true);
    const meu = txidDe(tipo!);
    try {
      const r = await fetch('/api/ofertar/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ valor, tipo, txid: meu }),
      });
      const j = await r.json().catch(() => null);
      if (j?.ok && j.url) { window.location.href = j.url; return; }
      setErro(j?.erro || 'Não consegui abrir o pagamento por cartão. Tente o Pix.');
    } catch {
      setErro('Sem conexão para abrir o pagamento por cartão. Tente o Pix.');
    }
    setIndo(false);
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiou(true);
    } catch {
      /* clipboard bloqueado (iOS antigo, página sem contexto seguro): seleciona
         o texto para a pessoa copiar com o dedo, em vez de não fazer nada */
      const el = document.getElementById('of-codigo');
      if (el) {
        const r = document.createRange();
        r.selectNodeContents(el);
        const s = window.getSelection();
        s?.removeAllRanges();
        s?.addRange(r);
      }
      setErro('Não consegui copiar sozinho. O código está selecionado: toque e segure para copiar.');
    }
  }

  /* ------------------------------------------------------------------- fim */
  if (fase === 'fim') {
    return (
      <div className="of of-fim" ref={caixa}>
        <Fim tipo={tipo} valor={valor} pendente={!!volta?.pendente} />
      </div>
    );
  }

  /* ------------------------------------------------------------------- pix */
  if (fase === 'pix') {
    return (
      <div className="of" ref={caixa}>
        <p className="g-rot">{rotuloTipo} · {emReais(valor)}</p>
        <h2 className="g-h2">Copie o código e cole no app do seu banco.</h2>

        <button type="button" className="acao cheia of-copiar" onClick={copiar}>
          {copiou ? <><IcCheck /> Código copiado</> : 'Copiar código Pix'}
        </button>

        {/* o código fica visível e selecionável: quando a cópia automática
            falha, é por aqui que a pessoa resolve sozinha.

            NÃO É <textarea>. Era, e com `rows` fixo ele cortava o código ao
            meio em 390px — 141 caracteres ocupam três linhas no desktop e
            quase cinco no celular, e nenhum número de linhas serve aos dois.
            Um parágrafo cresce sozinho, e `user-select:all` faz um toque só
            selecionar o código inteiro. */}
        <p id="of-codigo" className="of-codigo">{codigo}</p>

        <div className="of-ou"><span>ou aponte a câmera</span></div>
        <QR texto={codigo} rotulo={`QR code Pix de ${emReais(valor)} para ${rotuloTipo.toLowerCase()}`} />

        {erro && <p className="g-form-erro" role="alert">{erro}</p>}

        <button type="button" className="acao cheia" onClick={() => setFase('fim')}>
          Já ofertei <IcSeta />
        </button>
        <button type="button" className="acao" onClick={() => { setFase('escolher'); setErro(null); }}>
          Voltar e mudar o valor
        </button>
      </div>
    );
  }

  /* -------------------------------------------------------------- escolher */
  return (
    <div className="of" ref={caixa}>
      <p className="g-ed">Leva menos de um minuto, e você decide o valor.</p>

      <fieldset className="of-tipo">
        <legend className="g-rot">O que você está entregando</legend>
        {TIPOS.map(t => (
          <button key={t.id} type="button"
            className={`of-tipo-bt${tipo === t.id ? ' on' : ''}`}
            aria-pressed={tipo === t.id}
            onClick={() => { setTipo(t.id); setErro(null); }}>
            <span className="of-tipo-rot">{t.rot}</span>
            <span className="of-tipo-dica">{t.dica}</span>
          </button>
        ))}
      </fieldset>

      <label className="of-valor">
        <span className="g-rot">Valor</span>
        {/* o valor entra pela direita, como numa maquininha: a pessoa digita
            3-5-0-7-5 e vê R$ 350,75 se formando, sem procurar a vírgula num
            teclado de celular */}
        <span className="of-valor-box">
          <span className={`of-valor-cx${valor ? '' : ' vazio'}`} aria-hidden="true">
            {valor ? emReais(valor) : 'R$ 0,00'}
          </span>
          <input ref={campo} className="of-valor-in" inputMode="numeric" autoComplete="off"
            value={digitos} aria-label={`Valor em reais: ${emReais(valor)}`}
            onChange={e => { setDigitos(e.target.value.replace(/\D+/g, '').slice(0, 9)); setErro(null); }} />
        </span>
      </label>

      {erro && <p className="g-form-erro" role="alert">{erro}</p>}

      {/* A ORDEM NÃO É ESTÉTICA, É DINHEIRO DA IGREJA. Pix custa a tarifa do
          banco; cartão custa 3 a 5 por cento do que a pessoa deu, todo mês,
          para sempre. Em R$10 mil de oferta são ~R$400 que deixam de virar
          trabalho da igreja. Por isso o Pix é o botão cheio e vem primeiro.

          E o cartão fica logo abaixo, visível, sem pegadinha: para quem tem
          Apple Pay na mão são três segundos, e oferta que não acontece custa
          mais caro que taxa de adquirente. */}
      <div className="of-meios">
        {TEM_PIX ? (
          <button type="button" className="acao cheia" onClick={irParaPix}>
            Pix
          </button>
        ) : (
          <p className="g-form-nota">
            O Pix está sendo configurado. Por enquanto, fale com a gente pelo{' '}
            <a href={canalDeConversa().href}>{canalDeConversa().rot.replace('Falar no ', '')}</a>.
          </p>
        )}

        {temCartao && (
          <button type="button" className="acao" onClick={irParaCartao} disabled={indo}>
            {indo ? 'Abrindo…' : 'Apple Pay, Google Pay ou cartão'}
          </button>
        )}
      </div>

      <p className="g-form-nota dim">
        {IGREJA.nome} é uma igreja: dízimos e ofertas sustentam o trabalho dela.
        Nada aqui é cobrança, e você decide o valor.
      </p>
    </div>
  );
}

/* =============================================================================
   DEPOIS DE PAGAR

   É aqui, e só aqui, que a tela pergunta se a pessoa quer oração. Sozinho,
   opcional, com o aviso do lado — que é o que a LGPD chama de consentimento
   específico e destacado, e o que a decência chama de não misturar as coisas.

   O campo ainda NÃO GRAVA EM LUGAR NENHUM: ele monta a mensagem e abre o canal
   da igreja. Guardar pedido de oração em banco é uma decisão que precisa de
   dono, prazo de descarte e regra de quem lê, e nenhuma dessas três existe
   hoje. Enquanto não existirem, o pedido vai para uma pessoa, não para uma
   tabela.
   ============================================================================= */
function Fim({ tipo, valor, pendente = false }:
  { tipo: TipoOferta | null; valor: number; pendente?: boolean }) {
  const [causa, setCausa] = useState('');
  const rot = TIPOS.find(t => t.id === tipo)?.rot ?? 'Oferta';
  const canal = canalDeConversa(
    `Oi! Ofertei agora pelo site (${rot.toLowerCase()}).\n\nQueria oração por: ${causa.trim()}`,
  );
  return (
    <>
      {/* PENDENTE NÃO É PAGO. Boleto e alguns cartões voltam como "em
          análise", e escrever "recebemos" ali seria a tela mentir para a
          pessoa sobre o dinheiro dela. */}
      <p className="of-selo" aria-hidden="true"><IcCheck /></p>
      <h2 className="g-h2">{pendente ? 'Estamos aguardando a confirmação.' : 'Recebemos. Obrigado.'}</h2>
      <p className="g-ed">
        {pendente
          ? `Seu ${rot.toLowerCase()}${valor ? ` de ${emReais(valor)}` : ''} foi enviado e o banco ainda está confirmando. Assim que cair, está tudo certo.`
          : `${rot}${valor ? ` de ${emReais(valor)}` : ''}. Que Deus multiplique o que você semeou.`}
      </p>

      <hr className="of-linha" />

      <label className="of-oracao">
        <span className="g-rot">Quer que a gente ore por algo?</span>
        <span className="g-form-nota dim">
          Opcional. O que você escrever vai para a equipe de oração da igreja pelo{' '}
          {canal.rot.replace('Falar no ', '')}, não fica guardado neste site, e
          ninguém precisa saber que veio junto de uma oferta.
        </span>
        <textarea className="of-causa" rows={3} maxLength={500} value={causa}
          placeholder="Pode escrever à vontade."
          onChange={e => setCausa(e.target.value)} />
      </label>

      {causa.trim().length > 2 ? (
        <a className="acao cheia" href={canal.href} target="_blank" rel="noopener noreferrer">
          Enviar o pedido <IcSeta />
        </a>
      ) : (
        <a className="acao" href="/">Voltar para o início</a>
      )}
    </>
  );
}
