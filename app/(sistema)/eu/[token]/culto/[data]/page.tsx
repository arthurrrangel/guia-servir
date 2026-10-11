'use client';
/* =============================================================================
   /eu/<token>/culto/<data> — O DIRIGENTE PREENCHE O BLOCO DELE · 109, 03/10/2026

   O Arthur: quem preenche a Palavra é "o dirigente da semana". Sem login: o
   link pessoal é a credencial, e o banco confere, a cada gravação, que o dono
   do link está no posto de dirigente DESTE culto e não disse que não pode.

   Dois blocos, cada um com o seu "Salvar": a Palavra (quem prega, tema,
   leitura, frase na tela, Santa Ceia) e os avisos (ou "não tem aviso"). Embaixo,
   a folha inteira do culto, só para ler: os horários dizem quando o dirigente
   entra.

   Se a liderança gravou o mesmo bloco no meio (MUDOU), a tela passa a mostrar
   o que está salvo e diz isso: ninguém apaga o trabalho do outro.
   ============================================================================= */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Logo } from '@/components/Marca';
import FolhaDoCulto from '@/components/cronograma/FolhaDoCulto';
import { faltaDoDirigente } from '@/components/escalas/CronogramaNoLink';
import {
  type Aviso, type Folha, type Palavra, TETO, antesDoBloco, avisosParaGravar, erroDoCronograma, folhaDoBanco,
  palavraParaGravar, prazoDaFolha, rotuloDaAtualizacao, rotuloDoPrazo, semCronogramaNoBanco, tituloDaFolha,
} from '@/lib/cronograma';
import { euCronogramas, euSalvarBloco } from '@/lib/cronograma-banco';
import { aviseHumano } from '@/lib/erros';
import { hojeISO } from '@/lib/engine';
import { IGREJA } from '@/lib/igreja';

type Fase = 'carregando' | 'ok' | 'link' | 'nao-dirige' | 'rede' | 'sem-109';
type AvisoEditado = { texto: string; como: '' | 'falado' | 'video'; k: number };
let chave = 0;

export default function PaginaDoDirigente() {
  const { token, data } = useParams<{ token: string; data: string }>();
  const hoje = hojeISO();
  const [fase, setFase] = useState<Fase>('carregando');
  const [folha, setFolha] = useState<Folha | null>(null);
  const [palavra, setPalavra] = useState<Palavra>({});
  const [avisos, setAvisos] = useState<AvisoEditado[]>([]);
  const [gravando, setGravando] = useState<'' | 'palavra' | 'avisos'>('');
  const [flash, setFlash] = useState('');
  const [erro, setErro] = useState('');

  const comecar = (f: Folha) => {
    setFolha(f);
    setPalavra({ ...(f.palavra || {}) });
    setAvisos(f.avisos && f.avisos.length
      ? f.avisos.map(a => ({ texto: a.texto, como: a.como || '', k: ++chave }))
      : [{ texto: '', como: 'falado', k: ++chave }]);
  };

  const ler = useCallback(async () => {
    try {
      let lista: Folha[];
      if (process.env.NODE_ENV === 'development' && new URLSearchParams(window.location.search).has('demo')) {
        const { euCronogramasDemo } = await import('@/lib/demo');
        lista = euCronogramasDemo().map(folhaDoBanco).filter(Boolean) as Folha[];
      } else {
        lista = await euCronogramas(token);
      }
      const f = lista.find(x => x.data === data);
      if (!f) { setFase('nao-dirige'); return; }
      comecar(f); setFase('ok');
    } catch (e: any) {
      if (semCronogramaNoBanco(e)) setFase('sem-109');
      else if (/link inv/i.test(e?.message || '')) setFase('link');
      else setFase('rede');
    }
  }, [token, data]);
  useEffect(() => { void ler(); }, [ler]);

  const avisar = (m: string) => { setErro(''); setFlash(m); window.setTimeout(() => setFlash(x => (x === m ? '' : x)), 4200); };
  const errar = (m: string) => { setFlash(''); setErro(m); };

  async function salvar(bloco: 'palavra' | 'avisos') {
    if (!folha || gravando) return;
    const valor = bloco === 'palavra'
      ? palavraParaGravar(palavra)
      : avisosParaGravar(avisos.map(a => (a.como ? { texto: a.texto, como: a.como } : { texto: a.texto })));
    setGravando(bloco);
    try {
      /* no harness (?demo) a folha vem da fixture, mas gravar vai ao banco
         como sempre: o teste de tela intercepta e confere o pedido */
      const r = await euSalvarBloco(token, data, bloco, valor, antesDoBloco(folha, bloco));
      if (r.ok) {
        const n: Folha = { ...folha, autoria: { ...folha.autoria } };
        if (bloco === 'palavra') n.palavra = (r.valor as Palavra) || null; else n.avisos = (r.valor as Aviso[]) ?? [];
        if (r.autoria) { n.autoria[bloco] = r.autoria; n.atualizadoEm = r.autoria.em; }
        comecar(n);
        avisar(bloco === 'avisos' && !(r.valor as Aviso[])?.length ? 'Salvo: sem avisos neste culto.' : 'Salvo. A liderança já vê.');
        return;
      }
      if (r.erro === 'MUDOU') {
        const n: Folha = { ...folha };
        if (bloco === 'palavra') n.palavra = (r.atual as Palavra) || null; else n.avisos = Array.isArray(r.atual) ? (r.atual as Aviso[]) : null;
        comecar(n);
        errar('A liderança mudou isto agora. A tela já mostra o que está salvo.');
        return;
      }
      errar(erroDoCronograma(r));
    } catch (e) {
      errar(semCronogramaNoBanco(e) ? 'O cronograma não está ligado agora. Tente mais tarde.' : aviseHumano(e, 'salvar'));
    } finally {
      setGravando('');
    }
  }

  const barra = (
    <div className="vol-barra" role="banner">
      <div className="vol-barra-in">
        <Link href="/" aria-label="GUIA Church"><Logo className="logo" /></Link>
        <Link className="vol-quem" href={`/eu/${token}`}>Minha escala</Link>
      </div>
    </div>
  );
  const estado = (rot: string, titulo: string, texto: string, botao?: React.ReactNode) => (
    <div className="vol">{barra}
      <div className="vol-in" role="main"><div className="vol-chamada">
        <span className="rot">{rot}</span><h1>{titulo}</h1><p className="vol-sub">{texto}</p>
        {botao && <div className="vol-btns" style={{ maxWidth: 360 }}>{botao}</div>}
      </div></div>
    </div>
  );

  if (fase === 'carregando') return estado('Você dirige o culto', 'Carregando', '');
  if (fase === 'link') return estado('Espaço do voluntário', 'Esse link não vale', 'Links pessoais são únicos e podem ter vindo cortados pelo WhatsApp.',
    <Link className="vol-bt" href="/eu" style={{ background: 'var(--noite)', color: '#fff', borderColor: 'var(--noite)' }}>Achar meu link</Link>);
  if (fase === 'rede') return estado('Você dirige o culto', 'Sem conexão agora', 'Seu link continua valendo. Tente de novo quando o sinal voltar.',
    <button type="button" className="vol-bt" style={{ background: 'var(--noite)', color: '#fff', borderColor: 'var(--noite)' }}
      onClick={() => { setFase('carregando'); void ler(); }}>Tentar de novo</button>);
  if (fase === 'sem-109') return estado('Você dirige o culto', 'O cronograma ainda não está ligado', 'Assim que a liderança ligar, o formulário aparece aqui.');
  if (fase === 'nao-dirige' || !folha) return estado('Você dirige o culto', 'Este culto não está com você',
    'Você não está como dirigente deste culto, ou ele já passou. Se acha que é engano, fale com a liderança.',
    <Link className="vol-bt" href={`/eu/${token}`} style={{ background: 'var(--noite)', color: '#fff', borderColor: 'var(--noite)' }}>Ver minha escala</Link>);

  const falta = faltaDoDirigente(folha);
  const atrasado = !!falta && hoje > prazoDaFolha(folha.data);
  const mudar = (k: 'quem' | 'tema' | 'leitura' | 'frase') => (e: { target: { value: string } }) => setPalavra(p => ({ ...p, [k]: e.target.value }));
  const cheios = avisos.filter(a => a.texto.trim()).length;

  return (
    <div className="vol">
      {barra}
      <div className="vol-in entra" role="main">
        <div className={`vol-chamada${falta ? ' age' : ''}`}>
          <span className="rot">Você dirige o culto</span>
          <h1>{tituloDaFolha(folha.data)}</h1>
          <p className="vol-sub">
            {falta
              ? <>Ainda falta: {falta}. {atrasado ? `O prazo era ${rotuloDoPrazo(folha.data)}: preencha assim que puder.` : `Preencha até ${rotuloDoPrazo(folha.data)}.`}</>
              : 'Tudo preenchido. Dá para mudar até o dia, e a liderança vê na hora.'}
          </p>
        </div>

        <section className="vol-secao" id="palavra" aria-labelledby="palavra-tit">
          <div className="vol-secao-cab"><span className="rot" id="palavra-tit">A Palavra</span></div>
          <form className="vol-cr-form" noValidate onSubmit={e => { e.preventDefault(); void salvar('palavra'); }}>
            <label htmlFor="d-quem">Quem prega</label>
            <input id="d-quem" autoComplete="off" enterKeyHint="next" maxLength={TETO.quem} placeholder="ex: Pr. Altomir Rangel"
              value={palavra.quem || ''} onChange={mudar('quem')} />
            <label htmlFor="d-tema">Tema</label>
            <input id="d-tema" autoComplete="off" enterKeyHint="next" maxLength={TETO.tema} placeholder="O tema da mensagem"
              value={palavra.tema || ''} onChange={mudar('tema')} />
            <label htmlFor="d-leitura">Leitura bíblica</label>
            <input id="d-leitura" autoComplete="off" enterKeyHint="next" maxLength={TETO.leitura} placeholder="ex: Gênesis 32:30"
              value={palavra.leitura || ''} onChange={mudar('leitura')} />
            <label htmlFor="d-frase">Frase na tela (se tiver)</label>
            <textarea id="d-frase" rows={3} maxLength={TETO.frase} value={palavra.frase || ''} onChange={mudar('frase')}
              aria-describedby="d-frase-dica" />
            <small className="vol-cr-dica" id="d-frase-dica">A frase que a Mídia projeta depois da leitura.</small>
            <label className="vol-cr-caixa">
              <input type="checkbox" checked={!!palavra.ceia} onChange={e => setPalavra(p => ({ ...p, ceia: e.target.checked }))} />
              <span>Este culto tem Santa Ceia</span>
            </label>
            <div className="vol-btns vol-cr-btns">
              <button type="submit" className="vol-bt" disabled={!!gravando} aria-busy={gravando === 'palavra' || undefined}>
                {gravando === 'palavra' ? 'Salvando…' : 'Salvar a Palavra'}
              </button>
            </div>
          </form>
        </section>

        <section className="vol-secao" id="avisos" aria-labelledby="avisos-tit">
          <div className="vol-secao-cab"><span className="rot" id="avisos-tit">Avisos</span>
            <span className="vol-secao-nota">{folha.avisos === null ? 'em ordem, do primeiro ao último' : folha.avisos.length ? `${folha.avisos.length} salvos` : 'sem avisos'}</span></div>
          <form className="vol-cr-form" noValidate onSubmit={e => { e.preventDefault(); void salvar('avisos'); }}>
            <ol className="vol-cr-avisos">
              {avisos.map((a, i) => (
                <li key={a.k} className="vol-cr-aviso">
                  <input id={`d-a-${a.k}`} autoComplete="off" maxLength={TETO.aviso} aria-label={`Aviso ${i + 1}`}
                    placeholder={i === 0 ? 'ex: Batismo no domingo 25' : 'Outro aviso'} value={a.texto}
                    onChange={e => setAvisos(x => x.map((y, j) => (j === i ? { ...y, texto: e.target.value } : y)))} />
                  <select aria-label={`Como é o aviso ${i + 1}`} value={a.como}
                    onChange={e => setAvisos(x => x.map((y, j) => (j === i ? { ...y, como: e.target.value as AvisoEditado['como'] } : y)))}>
                    <option value="falado">falado</option>
                    <option value="video">vídeo</option>
                    <option value="">sem dizer</option>
                  </select>
                  <button type="button" className="vol-acao vol-cr-tira" aria-label={`Tirar o aviso ${i + 1}`}
                    onClick={() => setAvisos(x => x.filter((_, j) => j !== i))}>Tirar</button>
                </li>
              ))}
            </ol>
            {avisos.length < TETO.avisos && (
              <button type="button" className="vol-acao" onClick={() => {
                const k = ++chave;
                setAvisos(x => [...x, { texto: '', como: 'falado', k }]);
                window.requestAnimationFrame(() => document.getElementById(`d-a-${k}`)?.focus());
              }}>Acrescentar aviso</button>
            )}
            <div className="vol-btns vol-cr-btns">
              <button type="submit" className="vol-bt" disabled={!!gravando} aria-busy={gravando === 'avisos' || undefined}>
                {gravando === 'avisos' ? 'Salvando…' : cheios ? 'Salvar os avisos' : 'Salvar: não tem aviso neste culto'}
              </button>
            </div>
          </form>
        </section>

        <section className="vol-secao vol-cr-folha" aria-labelledby="folha-tit">
          <div className="vol-secao-cab"><span className="rot" id="folha-tit">O culto inteiro</span>
            <span className="vol-secao-nota">só para ler</span></div>
          <FolhaDoCulto folha={folha} hoje={hoje} cultoHora={IGREJA.cultoHora} followHora={IGREJA.followHora}
            atualizado={rotuloDaAtualizacao(folha.atualizadoEm) || undefined} />
        </section>
      </div>
      {!!(flash || erro) && (
        <div className={`vol-flash${erro ? ' vol-flash-ruim' : ''}`} role="status">{erro || flash}</div>
      )}
    </div>
  );
}
