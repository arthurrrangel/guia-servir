'use client';
/* =============================================================================
   A RESERVA DA VIRADA 2027 · 21/11/2026

   O formulário da copy ("Seus dados: nome completo, CPF, e-mail, telefone
   para contato, se você é membro ou visitante"), mais quantas pessoas vão,
   que é a regra que a copy deixou para confirmar (lib/virada.ts). As regras
   são as de lib/virada.ts, as mesmas que o servidor confere de novo.

   O QUE A TELA PODE AFIRMAR
     · "Lugar reservado" só com o banco gravado (guardado: true).
     · Banco fora (a 118 não rodou, a rede caiu): a reserva vai escrita pelo
       WhatsApp da igreja, e a tela diz que falta esse toque. Nunca diz que
       reservou o que não reservou.
     · Vagas acabaram ou a noite começou: a lista de espera é pelo WhatsApp.

   As vagas de agora vêm do GET /api/virada ao abrir: com tudo ocupado, a
   tela já abre na lista de espera; com até 30 lugares, avisa quantos restam.
   ============================================================================= */
import { useEffect, useId, useRef, useState } from 'react';
import {
  VIRADA, MAX_POR_RESERVA, VINCULOS, conferirReserva, mascaraCpf, mascaraTelefone, pessoasPorExtenso,
  whatsDaReserva, whatsDuvida, whatsListaDeEspera, type CampoDaReserva, type Reserva, type Vinculo,
} from '@/lib/virada';
import { medir } from '@/lib/site/medir-cliente';

const Visto = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m4 12.5 5 5L20 6.5" /></svg>
);
const lugares = (n: number) => (n === 1 ? '1 lugar' : `${n} lugares`);

type Fase =
  | { f: 'form' }
  | { f: 'feito'; r: Reserva; repetida?: boolean }
  | { f: 'whats'; r: Reserva }
  | { f: 'esgotado'; restantes?: number }
  | { f: 'fechada' };

/* a noite na agenda do Google: 31/12, 19h30 (22h30 UTC) até 1h do dia 1º */
const AGENDA = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
  + `&text=${encodeURIComponent(`${VIRADA.nome} · GUIA Church`)}`
  + '&dates=20261231T223000Z/20270101T040000Z'
  + `&location=${encodeURIComponent(`${VIRADA.local}, ${VIRADA.bairro}`)}`
  + `&details=${encodeURIComponent('Entre em 2027 na presença de Deus.')}`;

export default function ReservaVirada() {
  const uid = useId().replace(/:/g, '');
  const id = (c: string) => `vr-${c}-${uid}`;
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [vinculo, setVinculo] = useState<Vinculo | ''>('');
  const [pessoas, setPessoas] = useState('');
  const [isca, setIsca] = useState('');
  const [erro, setErro] = useState<{ campo: CampoDaReserva; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [fase, setFase] = useState<Fase>({ f: 'form' });
  const [restantes, setRestantes] = useState<number | null>(null);
  const caixa = useRef<HTMLDivElement | null>(null);

  /* as vagas de agora: com tudo ocupado, a tela já abre na lista de espera */
  useEffect(() => {
    let vivo = true;
    fetch('/api/virada', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        if (!vivo || !j) return;
        if (typeof j.restantes === 'number') setRestantes(j.restantes);
        if (j.aberta === false) setFase(typeof j.restantes === 'number' && j.restantes <= 0 ? { f: 'esgotado', restantes: 0 } : { f: 'fechada' });
      })
      .catch(() => { /* sem resposta: o formulário fica aberto, e a gravação confere */ });
    return () => { vivo = false; };
  }, []);

  /* a resposta toma o lugar do formulário: o foco vai para ela */
  useEffect(() => { if (fase.f !== 'form') caixa.current?.focus(); }, [fase.f]);

  const limpa = (c: CampoDaReserva) => { if (erro?.campo === c) setErro(null); };

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    const corpo = { nome, cpf, email, telefone, vinculo, pessoas: Number(pessoas) || 0, site: isca };
    const v = conferirReserva(corpo);
    if (!v.ok) {
      setErro({ campo: v.campo, texto: v.erro });
      if (v.campo) document.getElementById(id(v.campo === 'vinculo' ? 'membro' : v.campo))?.focus();
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      const r = await fetch('/api/virada', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo),
      });
      const j = await r.json().catch(() => ({}));
      if (j.ok && j.guardado) {
        if (typeof j.restantes === 'number') setRestantes(j.restantes);
        setFase({ f: 'feito', r: v.reserva, repetida: !!j.repetida });
        if (!j.repetida) medir('reserva_virada', { pessoas: String(v.reserva.pessoas) });
      } else if (j.ok) {
        setFase({ f: 'whats', r: v.reserva });
      } else if (j.esgotado) {
        setFase({ f: 'esgotado', restantes: typeof j.restantes === 'number' ? j.restantes : undefined });
      } else if (j.fechada) {
        setFase({ f: 'fechada' });
      } else {
        const campo = (j.campo || '') as CampoDaReserva;
        setErro({ campo, texto: j.erro || 'Não deu para reservar agora. Tente de novo.' });
      }
    } catch {
      /* sem rede: a reserva vai escrita pelo WhatsApp */
      setFase({ f: 'whats', r: v.reserva });
    } finally {
      setEnviando(false);
    }
  }

  if (fase.f !== 'form') {
    const r = 'r' in fase ? fase.r : null;
    const primeiro = r ? r.nome.split(' ')[0] : '';
    return (
      <div className="vr-resposta" ref={caixa} tabIndex={-1} role="status" aria-live="polite">
        {fase.f === 'feito' && r && (
          <>
            <span className="vr-ok" aria-hidden="true"><Visto /></span>
            <h3 className="vr-resp-t">{fase.repetida ? `${primeiro}, seu lugar já estava reservado` : `Lugar reservado, ${primeiro}`}</h3>
            <p className="s-lead">
              {fase.repetida
                ? 'Esse CPF já tem reserva. Para mudar alguma coisa, fale com a gente no WhatsApp.'
                : `${pessoasPorExtenso(r.pessoas)} na ${VIRADA.nome}. Te esperamos em 31 de dezembro, a partir das ${VIRADA.chegada}, no ${VIRADA.local}.`}
            </p>
            <div className="s-acoes centro">
              <a className="s-pil preta" href={AGENDA} target="_blank" rel="noreferrer">Pôr na agenda</a>
              <a className="s-pil contorno" href={whatsDuvida()} target="_blank" rel="noreferrer" data-medir="whatsapp">Dúvidas no WhatsApp</a>
            </div>
          </>
        )}
        {fase.f === 'whats' && r && (
          <>
            <h3 className="vr-resp-t">Falta um toque</h3>
            <p className="s-lead">Não conseguimos gravar sua reserva agora. Mande pelo WhatsApp da igreja, já escrita, e a gente confirma por lá.</p>
            <div className="s-acoes centro">
              <a className="s-pil preta" href={whatsDaReserva(r)} target="_blank" rel="noreferrer" data-medir="whatsapp">Enviar pelo WhatsApp</a>
            </div>
          </>
        )}
        {fase.f === 'esgotado' && (
          <>
            <h3 className="vr-resp-t">{fase.restantes ? `Só restam ${lugares(fase.restantes)}` : 'As vagas acabaram'}</h3>
            <p className="s-lead">
              {fase.restantes
                ? 'Diminua a quantidade de pessoas, ou entre na lista de espera pelo WhatsApp.'
                : 'Entre na lista de espera pelo WhatsApp: se alguém desistir, a gente te chama.'}
            </p>
            <div className="s-acoes centro">
              {!!fase.restantes && <button type="button" className="s-pil preta" onClick={() => setFase({ f: 'form' })}>Mudar a reserva</button>}
              <a className={'s-pil ' + (fase.restantes ? 'contorno' : 'preta')} href={whatsListaDeEspera()} target="_blank" rel="noreferrer" data-medir="whatsapp">Lista de espera</a>
            </div>
          </>
        )}
        {fase.f === 'fechada' && (
          <>
            <h3 className="vr-resp-t">As reservas pelo site fecharam</h3>
            <p className="s-lead">Fale com a gente no WhatsApp da igreja.</p>
            <div className="s-acoes centro">
              <a className="s-pil preta" href={whatsDuvida()} target="_blank" rel="noreferrer" data-medir="whatsapp">Falar no WhatsApp</a>
            </div>
          </>
        )}
      </div>
    );
  }

  const ajuda = (c: CampoDaReserva) => (erro?.campo === c ? `${id('e')}` : undefined);
  const dica = (c: CampoDaReserva) =>
    erro?.campo === c ? <span id={id('e')} className="s-campo-dica" role="alert">{erro.texto}</span> : null;

  return (
    <form className="s-form livre vr-form" onSubmit={enviar} noValidate>
      <div className="s-campo largo">
        <label htmlFor={id('nome')}>Nome completo</label>
        <input id={id('nome')} name="nome" type="text" autoComplete="name" value={nome} maxLength={80}
               aria-invalid={erro?.campo === 'nome'} aria-describedby={ajuda('nome')}
               onChange={e => { setNome(e.target.value); limpa('nome'); }} />
        {dica('nome')}
      </div>
      <div className="s-campo">
        <label htmlFor={id('cpf')}>CPF</label>
        <input id={id('cpf')} name="cpf" type="text" inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" value={cpf}
               aria-invalid={erro?.campo === 'cpf'} aria-describedby={ajuda('cpf')}
               onChange={e => { setCpf(mascaraCpf(e.target.value)); limpa('cpf'); }} />
        {dica('cpf')}
      </div>
      <div className="s-campo">
        <label htmlFor={id('telefone')}>Telefone para contato</label>
        <input id={id('telefone')} name="telefone" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(21) 99999-9999" value={telefone}
               aria-invalid={erro?.campo === 'telefone'} aria-describedby={ajuda('telefone')}
               onChange={e => { setTelefone(mascaraTelefone(e.target.value)); limpa('telefone'); }} />
        {dica('telefone')}
      </div>
      <div className="s-campo largo">
        <label htmlFor={id('email')}>E-mail</label>
        <input id={id('email')} name="email" type="email" inputMode="email" autoComplete="email" value={email} maxLength={254}
               aria-invalid={erro?.campo === 'email'} aria-describedby={ajuda('email')}
               onChange={e => { setEmail(e.target.value); limpa('email'); }} />
        {dica('email')}
      </div>
      <fieldset className="s-campo vr-vinculo" aria-describedby={ajuda('vinculo')}>
        <legend>Você é</legend>
        <div className="vr-opcoes">
          {VINCULOS.map(o => (
            <label key={o.v} className="vr-opcao">
              <input id={id(o.v)} type="radio" name="vinculo" value={o.v} checked={vinculo === o.v}
                     onChange={() => { setVinculo(o.v); limpa('vinculo'); }} />
              <span>{o.rot}</span>
            </label>
          ))}
        </div>
        {dica('vinculo')}
      </fieldset>
      <div className="s-campo">
        <label htmlFor={id('pessoas')}>Quantas pessoas, contando você</label>
        <select id={id('pessoas')} name="pessoas" value={pessoas} className={pessoas ? '' : 'vazio'}
                aria-invalid={erro?.campo === 'pessoas'} aria-describedby={ajuda('pessoas')}
                onChange={e => { setPessoas(e.target.value); limpa('pessoas'); }}>
          <option value="" disabled>Escolha</option>
          {Array.from({ length: MAX_POR_RESERVA }, (_, k) => k + 1).map(n => (
            <option key={n} value={n}>{n === 1 ? '1 pessoa (só eu)' : `${n} pessoas`}</option>
          ))}
        </select>
        {dica('pessoas')}
      </div>
      {/* a armadilha de robô: fora da tela e fora do Tab; gente não preenche */}
      <div className="vr-isca" aria-hidden="true">
        <label htmlFor={id('site')}>Site</label>
        <input id={id('site')} name="site" type="text" tabIndex={-1} autoComplete="off" value={isca} onChange={e => setIsca(e.target.value)} />
      </div>
      {erro && !erro.campo && <p className="s-campo-dica vr-erro-geral" role="alert">{erro.texto}</p>}
      <div className="s-acoes vr-enviar">
        <button type="submit" className="s-pil preta" aria-busy={enviando} disabled={enviando}>
          {enviando ? 'Reservando…' : 'Quero reservar meu lugar'}
        </button>
        <p className="s-micro">
          {restantes !== null && restantes > 0 && restantes <= 30
            ? `Últimos ${restantes} lugares. Capacidade limitada a ${VIRADA.capacidade} pessoas.`
            : `Capacidade limitada a ${VIRADA.capacidade} pessoas.`}
          {' '}Seus dados servem só para a sua reserva (<a href="/privacidade">privacidade</a>).
        </p>
      </div>
    </form>
  );
}
