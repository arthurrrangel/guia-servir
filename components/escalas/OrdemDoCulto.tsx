'use client';
import { useEffect, useRef, useState } from 'react';
import { type Estado, type ItemOrdem, garantirDia, horaDoDia } from '@/lib/engine';
import {
  type ErrosDoItem, type MusicaDoBanco, type Rascunho, MAX_ITENS, TETO, TONS_MAIORES, TONS_MENORES,
  DICA_DO_BANCO, acharNoBanco, completarDoBanco, detalhesDaMusica, dicaDaMusica, duracao, historicoDaMusica, horarios, itemDaTela,
  minutosDe, rascunhoDe, rascunhoVazio, relogio, resumoDaOrdem,
} from '@/lib/ordem-do-culto';
import { musicasDoMinisterio, salvarOrdem } from '@/lib/db';
import { aviseHumano } from '@/lib/erros';
import { IGREJA } from '@/lib/igreja';
import { IcSeta } from '@/components/Icones';

/* =============================================================================
   A ORDEM DO CULTO, NA ESCALA DO LÍDER — 105, 02/10/2026.

   Fase 3 do estudo do ServoApp: as músicas com tom, BPM e cifra, e os
   momentos do culto com o tempo de cada um. Aparece com o repertório ligado,
   embaixo dos links das playlists, e quem serve no culto vê no próprio link.

   COMO GRAVA. Cada item se edita num formulário pequeno, e "Salvar" grava a
   ordem inteira por `salvar_ordem`, que mexe SÓ na ordem. Subir, descer e
   tirar gravam na hora. Vai junto a ordem que a tela tinha: se outro líder
   salvou no meio, o banco devolve a dele (MUDOU), a tela passa a mostrá-la e
   diz isso, e nada de ninguém some.

   O BANCO DE MÚSICAS NASCE SOZINHO. O nome da música sugere as que o
   ministério já tocou (`musicas_do_ministerio`), e escolher uma traz o tom,
   o BPM, o artista e a cifra da última vez, só nos campos vazios. Ninguém
   cadastra música: montar o culto é o cadastro.

   A HORA DE CADA ITEM não é guardada: é a hora do culto mais a duração de
   tudo que vem antes. Mudou a ordem, mudou a hora, sem ninguém refazer conta.

   O MINISTÉRIO VAI JUNTO, CONFERIDO NA VOLTA, como no repertório: o Shell não
   remonta a página quando o líder troca de ministério.
   ============================================================================= */

/* o banco de músicas é um por ministério, e a página tem um dia aberto por
   vez: guardado aqui, um dia que abre não pergunta de novo ao banco */
const bancos = new Map<string, Promise<MusicaDoBanco[]>>();
function lerBanco(equipeId: string, deNovo = false) {
  if (deNovo || !bancos.has(equipeId)) {
    bancos.set(equipeId, musicasDoMinisterio(equipeId).catch(() => { bancos.delete(equipeId); return []; }));
  }
  return bancos.get(equipeId)!;
}

type Aberto = number | 'novo' | null;

export default function OrdemDoCulto({ S, d, cultoId, equipeId, ocupado, pinta, aviso }: {
  S: Estado; d: string; cultoId: string; equipeId: string; ocupado: boolean;
  pinta: () => void; aviso: (t: string) => void;
}) {
  const dia = S.escalas[d];
  const lista: ItemOrdem[] = dia?.ordem || [];
  const [aberto, setAberto] = useState<Aberto>(null);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [erros, setErros] = useState<ErrosDoItem>({});
  const [daUltimaVez, setDaUltimaVez] = useState('');
  const [gravando, setGravando] = useState(false);
  /* "Tirar da ordem" pede um segundo toque: o item some com a cifra, a nota e
     tudo, e não tem desfazer */
  const [confirmaTirar, setConfirmaTirar] = useState(false);
  /* quem abriu o formulário recebe o foco de volta quando ele fecha: o
     teclado não pode cair no começo da página */
  const voltarPara = useRef<HTMLElement | null>(null);
  const secaoRef = useRef<HTMLElement | null>(null);
  const [banco, setBanco] = useState<MusicaDoBanco[]>([]);
  const equipeRef = useRef(equipeId); equipeRef.current = equipeId;

  /* o dia ou o ministério mudou: o que estava sendo digitado era de outro */
  useEffect(() => { setAberto(null); setRascunho(null); setErros({}); setDaUltimaVez(''); setConfirmaTirar(false); }, [d, equipeId]);
  useEffect(() => {
    let vivo = true;
    void lerBanco(equipeId).then(b => { if (vivo && equipeRef.current === equipeId) setBanco(b); });
    return () => { vivo = false; };
  }, [equipeId]);

  const inicio = minutosDe(horaDoDia(dia?.inicio ?? null, dia?.evento ?? null, d, IGREJA.cultoHora, IGREJA.followHora));
  const horas = horarios(lista, inicio);
  const resumo = resumoDaOrdem(lista, inicio);
  const travado = ocupado || gravando;

  async function gravar(nova: ItemOrdem[], ok: string): Promise<boolean> {
    const antes = S.escalas[d]?.ordem || [];
    const eq = equipeId;
    setGravando(true);
    try {
      const r = await salvarOrdem(cultoId, eq, nova, antes);
      if (equipeRef.current !== eq) return false;       // o líder já está em outro ministério
      const alvo = garantirDia(S, d);
      if (r.ok) {
        if (r.ordem.length) alvo.ordem = r.ordem; else delete alvo.ordem;
        pinta(); aviso(ok);
        void lerBanco(eq, true).then(b => { if (equipeRef.current === eq) setBanco(b); });
        return true;
      }
      /* outro líder salvou antes: a tela passa a mostrar a ordem dele. O
         formulário aberto fecha: a posição que ele editava pode ser agora a
         de outro item, e salvar ali trocaria a música errada */
      if (r.mudou.length) alvo.ordem = r.mudou; else delete alvo.ordem;
      if (aberto !== null) fechar();
      pinta();
      aviso('Outra pessoa da liderança mudou esta ordem agora há pouco. A tela já mostra a versão dela: refaça a sua mudança.');
      return false;
    } catch (e: any) {
      if (equipeRef.current !== eq) return false;
      const cod = String(e?.message || e);
      aviso(/ORDEM_INVALIDA/.test(cod)
        ? 'O banco recusou a ordem. Confira o tom, o BPM e o link da cifra.'
        : /CULTO_INEXISTENTE/.test(cod)
          ? 'Esse culto não está mais na escala. Recarregue a tela.'
          : aviseHumano(e, 'salvar a ordem do culto'));
      return false;
    } finally {
      if (equipeRef.current === eq) setGravando(false);
    }
  }

  function abrir(i: Aberto, r: Rascunho) {
    voltarPara.current = document.activeElement as HTMLElement | null;
    setAberto(i); setRascunho(r); setErros({}); setDaUltimaVez(''); setConfirmaTirar(false);
  }
  function fechar() {
    setAberto(null); setRascunho(null); setErros({}); setDaUltimaVez(''); setConfirmaTirar(false);
    focoPendente.current = true;
  }
  /* o foco volta DEPOIS que a tela redesenhou sem o formulário (e sem o
     "gravando"): antes disso o botão ainda está desabilitado, ou nem existe */
  const focoPendente = useRef(false);
  useEffect(() => {
    if (!focoPendente.current || aberto !== null || gravando) return;
    focoPendente.current = false;
    const el = voltarPara.current;
    /* o botão que abriu pode ter saído da tela (a linha tirada, o
       "Acrescentar" que some com o formulário aberto): vale o primeiro da seção */
    if (el && el.isConnected && !(el as HTMLButtonElement).disabled) el.focus();
    else secaoRef.current?.querySelector<HTMLButtonElement>('.es-linha > .es-btn:not(:disabled)')?.focus();
  }, [aberto, gravando, lista.length]);

  /* escolheu (ou digitou) uma música que o ministério já tocou: traz o jeito
     da última vez para os campos que ainda estão vazios */
  function completar() {
    if (!rascunho || rascunho.t !== 'musica') return;
    const m = acharNoBanco(banco, rascunho.titulo);
    if (!m) { setDaUltimaVez(''); return; }
    /* o nome como o ministério já escreve ("mar aberto" vira "Mar Aberto"):
       a mesma música não vira duas no banco por causa de maiúscula */
    const novo = { ...completarDoBanco(rascunho, m), titulo: m.titulo };
    const trouxe = novo.tom !== rascunho.tom || novo.bpm !== rascunho.bpm || novo.cifra !== rascunho.cifra || novo.artista !== rascunho.artista;
    if (trouxe || novo.titulo !== rascunho.titulo) setRascunho(novo);
    setDaUltimaVez(dicaDaMusica(m, trouxe));
  }

  async function salvarItem() {
    if (!rascunho) return;
    const r = itemDaTela(rascunho);
    if (!r.ok) { setErros(r.erros); return; }
    const nova = [...lista];
    if (aberto === 'novo') nova.push(r.item);
    else if (typeof aberto === 'number') nova[aberto] = r.item;
    if (await gravar(nova, aberto === 'novo' ? `${r.item.titulo} entrou na ordem` : 'Ordem salva')) fechar();
  }
  async function tirar(i: number) {
    const it = lista[i];
    if (await gravar(lista.filter((_, k) => k !== i), `${it.titulo} saiu da ordem`)) fechar();
  }
  async function mover(i: number, para: -1 | 1) {
    const j = i + para;
    if (j < 0 || j >= lista.length) return;
    const nova = [...lista];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    await gravar(nova, 'Ordem salva');
  }

  const mudar = (k: keyof Rascunho) => (e: { target: { value: string } }) => {
    const v = e.target.value;
    setRascunho(r => (r ? { ...r, [k]: v } : r));
    if (erros[k as keyof ErrosDoItem]) setErros(er => { const n = { ...er }; delete n[k as keyof ErrosDoItem]; return n; });
  };
  const idc = (k: string) => `ord-${d}-${k}`;

  const formulario = rascunho && (
    <form className="es-ec-of" aria-label={aberto === 'novo' ? (rascunho.t === 'musica' ? 'Nova música' : 'Novo momento') : `Editar ${lista[aberto as number]?.titulo || ''}`}
      noValidate
      onSubmit={e => { e.preventDefault(); void salvarItem(); }}
      onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); fechar(); } }}>
      <div className="es-ec-of-campos">
        <label className="es-campo es-ec-of-largo" htmlFor={idc('titulo')}>
          <span id={idc('r-titulo')}>{rascunho.t === 'musica' ? 'Música' : 'Momento'}</span>
          <input className="es-ctl" id={idc('titulo')} aria-labelledby={idc('r-titulo')} autoFocus autoComplete="off" enterKeyHint="done"
            maxLength={TETO.titulo + 20} list={rascunho.t === 'musica' && banco.length ? idc('banco') : undefined}
            placeholder={rascunho.t === 'musica' ? 'Nome da música' : 'Abertura, oração, avisos, palavra...'}
            value={rascunho.titulo} onChange={mudar('titulo')} onBlur={completar}
            aria-invalid={!!erros.titulo} aria-describedby={erros.titulo ? idc('e-titulo') : rascunho.t === 'musica' && banco.length > 0 ? idc('ultima') : undefined} />
          {/* a linha embaixo do nome EXISTE desde que o formulário abre (com o
              banco de músicas) e só troca de texto: nada se mexe no meio do
              toque em "Salvar" ou "Cancelar" */}
          {erros.titulo
            ? <small className="es-erro-campo" id={idc('e-titulo')}>{erros.titulo}</small>
            : rascunho.t === 'musica' && banco.length > 0
              ? <small id={idc('ultima')}>{daUltimaVez || DICA_DO_BANCO}</small>
              : null}
        </label>
        {rascunho.t === 'musica' && (
          <label className="es-campo" htmlFor={idc('artista')}>
            <span id={idc('r-artista')}>Artista</span>
            <input className="es-ctl" id={idc('artista')} aria-labelledby={idc('r-artista')} autoComplete="off" enterKeyHint="done" maxLength={TETO.artista + 20}
              value={rascunho.artista} onChange={mudar('artista')} />
          </label>
        )}
        {rascunho.t === 'musica' && (
          <label className="es-campo" htmlFor={idc('tom')}>
            <span id={idc('r-tom')}>Tom</span>
            <select className="es-ctl" id={idc('tom')} aria-labelledby={idc('r-tom')} value={rascunho.tom} onChange={mudar('tom')}>
              <option value="">sem tom</option>
              {/* a grafia salva que não está na lista (Db, D#...) aparece também */}
              {rascunho.tom && !TONS_MAIORES.includes(rascunho.tom) && !TONS_MENORES.includes(rascunho.tom) &&
                <option value={rascunho.tom}>{rascunho.tom}</option>}
              <optgroup label="Maior">{TONS_MAIORES.map(t => <option key={t} value={t}>{t}</option>)}</optgroup>
              <optgroup label="Menor">{TONS_MENORES.map(t => <option key={t} value={t}>{t}</option>)}</optgroup>
            </select>
          </label>
        )}
        {rascunho.t === 'musica' && (
          <label className="es-campo" htmlFor={idc('bpm')}>
            <span id={idc('r-bpm')}>BPM</span>
            <input className="es-ctl" id={idc('bpm')} aria-labelledby={idc('r-bpm')} inputMode="numeric" autoComplete="off" enterKeyHint="done" maxLength={3}
              placeholder="72" value={rascunho.bpm} onChange={mudar('bpm')}
              aria-invalid={!!erros.bpm} aria-describedby={erros.bpm ? idc('e-bpm') : undefined} />
            {erros.bpm && <small className="es-erro-campo" id={idc('e-bpm')}>{erros.bpm}</small>}
          </label>
        )}
        <label className="es-campo" htmlFor={idc('min')}>
          <span id={idc('r-min')}>Duração (min)</span>
          <input className="es-ctl" id={idc('min')} aria-labelledby={idc('r-min')} inputMode="numeric" autoComplete="off" enterKeyHint="done" maxLength={3}
            placeholder={rascunho.t === 'musica' ? '5' : '10'} value={rascunho.min} onChange={mudar('min')}
            aria-invalid={!!erros.min} aria-describedby={erros.min ? idc('e-min') : undefined} />
          {erros.min && <small className="es-erro-campo" id={idc('e-min')}>{erros.min}</small>}
        </label>
        <label className={`es-campo${rascunho.t === 'musica' ? ' es-ec-of-largo' : ''}`} htmlFor={idc('quem')}>
          <span id={idc('r-quem')}>{rascunho.t === 'musica' ? 'Quem conduz' : 'Quem'}</span>
          <input className="es-ctl" id={idc('quem')} aria-labelledby={idc('r-quem')} autoComplete="off" enterKeyHint="done" maxLength={TETO.quem + 10}
            value={rascunho.quem} onChange={mudar('quem')} />
        </label>
        {rascunho.t === 'musica' && (
          <label className="es-campo es-ec-of-largo" htmlFor={idc('cifra')}>
            <span id={idc('r-cifra')}>Link da cifra</span>
            <input className="es-ctl" id={idc('cifra')} aria-labelledby={idc('r-cifra')} type="url" inputMode="url" autoComplete="off" spellCheck={false}
              enterKeyHint="done" maxLength={600} placeholder="Cole o link da página da cifra"
              value={rascunho.cifra} onChange={mudar('cifra')}
              aria-invalid={!!erros.cifra} aria-describedby={erros.cifra ? idc('e-cifra') : undefined} />
            {erros.cifra && <small className="es-erro-campo" id={idc('e-cifra')}>{erros.cifra}</small>}
          </label>
        )}
        <label className={`es-campo ${rascunho.t === 'musica' ? 'es-ec-of-largo' : 'es-ec-of-cheio'}`} htmlFor={idc('nota')}>
          {/* 02/10/2026: "Observação", a palavra do Louvor; na página de quem
              serve e na mensagem, a da música vira as Observações do setlist */}
          <span id={idc('r-nota')}>Observação</span>
          <input className="es-ctl" id={idc('nota')} aria-labelledby={idc('r-nota')} autoComplete="off" enterKeyHint="done" maxLength={TETO.nota + 20}
            placeholder={rascunho.t === 'musica' ? 'ex: medley com a ponte de outra música' : 'ex: ceia, batismo, apresentação'}
            value={rascunho.nota} onChange={mudar('nota')} />
        </label>
      </div>
      <div className="es-linha">
        <button type="submit" className="es-btn es-pri es-peq" disabled={travado} aria-busy={gravando || undefined}>Salvar</button>
        <button type="button" className="es-btn es-txt es-peq" onClick={fechar} disabled={gravando}>Cancelar</button>
        {typeof aberto === 'number' && (
          <button type="button" className="es-btn es-txt es-perigo es-peq" disabled={travado}
            onClick={() => { if (confirmaTirar) void tirar(aberto); else setConfirmaTirar(true); }}>
            {confirmaTirar ? 'Tirar mesmo' : 'Tirar da ordem'}
          </button>
        )}
      </div>
    </form>
  );

  return (
    <section className="es-ec-ordem" aria-labelledby={`ord-${d}`} ref={secaoRef}>
      <div className="es-ec-ordem-cab">
        <span className="es-ec-rep-tit" id={`ord-${d}`}>Ordem do culto</span>
        {lista.length > 0 && (
          <span className="es-ec-ordem-resumo">
            {[resumo.musicas ? (resumo.musicas === 1 ? '1 música' : `${resumo.musicas} músicas`)
                : (lista.length === 1 ? '1 momento' : `${lista.length} momentos`),
              resumo.total ? duracao(resumo.total) + (resumo.semTempo ? ' (sem contar o que está sem duração)' : '') : null,
              resumo.fim !== null ? `termina ${relogio(resumo.fim)}` : null].filter(Boolean).join(' · ')}
          </span>
        )}
      </div>

      {lista.length === 0 && aberto === null && (
        <p className="es-ec-ordem-vazia">
          As músicas com tom, BPM e cifra, e os momentos do culto com o tempo de cada um. Quem serve neste culto vê no próprio link.
        </p>
      )}

      {lista.length > 0 && (
        <ol className="es-ec-ordem-lista">
          {lista.map((it, i) => (
            <li className="es-ec-oi" key={`${i}-${it.titulo}`}>
              <span className="es-ec-oi-hora">{horas[i] !== null ? relogio(horas[i] as number) : ''}</span>
              {/* a linha inteira abre o item (no celular é o único jeito: o
                  botão escrito "Editar" só aparece com espaço sobrando) */}
              <button type="button" className="es-ec-oi-abre" disabled={travado || aberto !== null}
                aria-expanded={aberto === i} onClick={() => abrir(i, rascunhoDe(it))}>
                <span className="es-ec-oi-corpo">
                  <span className="es-ec-oi-tit">{it.titulo}{it.artista ? <span className="es-ec-oi-art"> · {it.artista}</span> : null}</span>
                  <span className="es-ec-oi-meta">
                    {[it.t === 'momento' ? 'Momento' : detalhesDaMusica(it) || 'Música',
                      it.quem || null, it.min ? duracao(it.min) : null, it.cifra ? 'com cifra' : null].filter(Boolean).join(' · ')}
                  </span>
                  {it.nota && <span className="es-ec-oi-nota">{it.nota}</span>}
                </span>
                <span className="es-ec-oi-editar">Editar</span>
              </button>
              <span className="es-ec-oi-acoes">
                <button type="button" className="es-btn es-txt es-icone es-peq" aria-label={`Subir ${it.titulo}`}
                  disabled={travado || i === 0 || aberto !== null} onClick={() => void mover(i, -1)}>
                  <IcSeta className="es-ec-oi-sobe" />
                </button>
                <button type="button" className="es-btn es-txt es-icone es-peq" aria-label={`Descer ${it.titulo}`}
                  disabled={travado || i === lista.length - 1 || aberto !== null} onClick={() => void mover(i, 1)}>
                  <IcSeta className="es-ec-oi-desce" />
                </button>
              </span>
              {aberto === i && formulario}
            </li>
          ))}
        </ol>
      )}

      {aberto === 'novo' && formulario}

      {aberto === null && (
        <div className="es-linha">
          <button type="button" className="es-btn es-peq" disabled={travado || lista.length >= MAX_ITENS}
            onClick={() => abrir('novo', rascunhoVazio('musica'))}>
            Acrescentar música
          </button>
          <button type="button" className="es-btn es-peq" disabled={travado || lista.length >= MAX_ITENS}
            onClick={() => abrir('novo', rascunhoVazio('momento'))}>
            Acrescentar momento
          </button>
        </div>
      )}

      {banco.length > 0 && (
        <datalist id={idc('banco')}>
          {banco.map(m => <option key={m.titulo} value={m.titulo}>{historicoDaMusica(m)}</option>)}
        </datalist>
      )}
    </section>
  );
}
