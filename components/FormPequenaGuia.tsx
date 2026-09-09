'use client';
import { useId, useState } from 'react';
import Link from 'next/link';
import { IcSeta } from '@/components/Icones';
import { IGREJA, canalDeConversa } from '@/lib/igreja';
import { DIAS_PEDIDO, mensagemDoPedido, validar, type Pedido } from '@/lib/pedido-pequena-guia';

/* =============================================================================
   "QUERO ENCONTRAR UMA PEQUENA GUIA" — o formulário

   08/09/2026, pedido do Arthur: nome, telefone, CEP, idade e o melhor dia da
   semana. Ao enviar, duas coisas, nesta ordem:

   1. POST /api/pequena-guia — grava uma linha na planilha da igreja (quando a
      planilha estiver configurada na Vercel; ver a rota). É o registro
      organizado que ele pediu.
   2. A conversa. Com o WhatsApp da igreja em lib/igreja.ts, a mensagem já vai
      pronta com os cinco campos. Sem ele (hoje o canal é o Instagram, onde
      não existe mensagem pronta), a tela mostra a mensagem montada com um
      botão de copiar, e o botão do canal.

   A TELA DIZ O QUE ACONTECEU DE VERDADE, sem assustar. São quatro finais
   possíveis (guardou ou não × tem WhatsApp ou não) e cada um tem a sua frase.
   Quando NADA foi guardado, a tela não diz "enviado com sucesso" — mas também
   não diz "falhou": ela diz o que a pessoa tem que fazer agora, que é mandar
   a mensagem pronta pelo canal. É o passo que entrega o pedido de verdade.

   O que NÃO acontece: nenhum dado entra no banco do sistema de escala.
   ============================================================================= */

type Campos = { nome: string; telefone: string; cep: string; idade: string; dia: string; site: string };
const VAZIO: Campos = { nome: '', telefone: '', cep: '', idade: '', dia: '', site: '' };

type Fim = { pedido: Pedido; guardado: boolean };

/* máscaras leves, só para a pessoa ver que digitou certo; a validação real
   olha os dígitos */
const mascaraTelefone = (v: string) => {
  const d = v.replace(/\D+/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};
const mascaraCep = (v: string) => {
  const d = v.replace(/\D+/g, '').slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};

export function FormPequenaGuia() {
  const id = useId();
  const [c, setC] = useState<Campos>(VAZIO);
  const [erro, setErro] = useState<{ campo: string; msg: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [fim, setFim] = useState<Fim | null>(null);
  const [copiado, setCopiado] = useState(false);

  const muda = (k: keyof Campos) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    let v = e.target.value;
    if (k === 'telefone') v = mascaraTelefone(v);
    if (k === 'cep') v = mascaraCep(v);
    if (k === 'idade') v = v.replace(/\D+/g, '').slice(0, 3);
    setC(prev => ({ ...prev, [k]: v }));
    if (erro?.campo === k) setErro(null);
  };

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const v = validar(c);
    if ('erro' in v) {
      setErro({ campo: v.campo, msg: v.erro });
      document.getElementById(`${id}-${v.campo}`)?.focus();
      return;
    }
    setEnviando(true);
    let guardado = false;
    try {
      const r = await fetch('/api/pequena-guia', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(c),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro({ campo: j.campo || 'nome', msg: j.erro || 'Não deu para enviar. Confira os campos.' }); setEnviando(false); return; }
      guardado = !!j.guardado;
    } catch { /* sem rede: a conversa ainda é o caminho */ }
    setEnviando(false);
    /* a conversa NÃO abre sozinha: window.open depois de um await é o que os
       bloqueadores de pop-up do celular barram. A tela final oferece o botão,
       e o toque da pessoa é o gesto que o navegador respeita. */
    setFim({ pedido: v.pedido, guardado });
  }

  async function copiar(texto: string) {
    try { await navigator.clipboard.writeText(texto); setCopiado(true); setTimeout(() => setCopiado(false), 2400); } catch { /* sem clipboard: a caixa é selecionável */ }
  }

  if (fim) {
    const msg = mensagemDoPedido(fim.pedido);
    const canal = canalDeConversa(msg);
    const temZap = !!IGREJA.whatsapp;
    const primeiro = fim.pedido.nome.split(' ')[0];
    return (
      <div className="g-form-fim" role="status" aria-live="polite">
        <p className="g-rot">{fim.guardado ? 'Recebemos' : 'Quase lá'}</p>
        <p className="g-h3">
          {fim.guardado
            ? `Obrigado, ${primeiro}. A equipe vai te chamar para apontar a Pequena Guia mais perto de você.`
            : temZap
              ? `Obrigado, ${primeiro}. Falta um toque: a sua mensagem já está pronta para o WhatsApp.`
              : `Obrigado, ${primeiro}. A sua mensagem está pronta: mande pelo nosso canal e a equipe aponta a Pequena Guia mais perto de você.`}
        </p>
        {(!fim.guardado || temZap) && <pre className="g-form-msg">{msg}</pre>}
        <div className="g-acoes centro">
          {temZap || !fim.guardado
            ? <a href={canal.href} target="_blank" rel="noreferrer" className="acao cheia">{fim.guardado ? 'Adiantar no WhatsApp' : canal.rot} <IcSeta /></a>
            : <a href={canal.href} target="_blank" rel="noreferrer" className="g-link">Adiantar a conversa pelo {canal.rot.replace('Falar no ', '')}</a>}
          {(!fim.guardado || temZap) && (
            <button type="button" className="g-link" onClick={() => copiar(msg)}>{copiado ? 'Copiado' : 'Copiar a mensagem'}</button>
          )}
        </div>
      </div>
    );
  }

  const campo = (k: keyof Campos) => ({
    id: `${id}-${k}`, name: k, value: c[k], onChange: muda(k),
    'aria-invalid': erro?.campo === k || undefined,
    'aria-describedby': erro?.campo === k ? `${id}-erro` : undefined,
  });

  return (
    <form className="g-form" onSubmit={enviar} noValidate>
      <div className="g-form-grade">
        <label className="g-form-campo g-form-largo">
          <span className="g-rot">Nome</span>
          <input {...campo('nome')} type="text" autoComplete="name" placeholder="Como você se chama" maxLength={80} />
        </label>
        <label className="g-form-campo">
          <span className="g-rot">Telefone</span>
          <input {...campo('telefone')} type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(21) 99999-9999" />
        </label>
        <label className="g-form-campo">
          <span className="g-rot">CEP</span>
          <input {...campo('cep')} type="text" inputMode="numeric" autoComplete="postal-code" placeholder="22793-000" />
        </label>
        <label className="g-form-campo">
          <span className="g-rot">Idade</span>
          <input {...campo('idade')} type="text" inputMode="numeric" placeholder="Em anos" />
        </label>
        <label className="g-form-campo">
          <span className="g-rot">Melhor dia da semana</span>
          <select {...campo('dia')}>
            <option value="">Escolher</option>
            {DIAS_PEDIDO.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        {/* a isca: fora da tela e fora da ordem de tabulação; gente não vê,
            robô preenche, e o servidor recusa */}
        <label className="g-form-isca" aria-hidden="true">
          Site<input {...campo('site')} type="text" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {erro && <p id={`${id}-erro`} className="g-form-erro" role="alert">{erro.msg}</p>}
      <div className="g-acoes centro g-form-pe">
        <button type="submit" className="acao cheia" disabled={enviando}>
          {enviando ? 'Enviando…' : 'Quero encontrar uma Pequena Guia'} <IcSeta />
        </button>
      </div>
      <p className="g-form-nota">
        Seus dados servem só para te apontar uma Pequena Guia e nunca são publicados. <Link href="/privacidade">Como cuidamos deles</Link>.
      </p>
    </form>
  );
}
