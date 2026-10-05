'use client';
import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { type Estado, type ItemOrdem, garantirDia, horaDoDia } from '@/lib/engine';
import {
  type ErrosDoItem, type MusicaDoBanco, type Rascunho, COMPASSOS, MAX_ITENS, TETO, TONS_MAIORES, TONS_MENORES,
  DICA_DO_BANCO, acharNoBanco, caminhoNovoDaLetra, completarDoBanco, conferirConteudoDoPdf, conferirPdf, detalhesDaMusica, dicaDaMusica,
  duracaoTotal, historicoDaMusica, horarios, itemDa111, itemDaTela, minutosDe, rascunhoDe, rascunhoVazio, relogio,
  resumoDaOrdem, tamanhoLegivel, tempoDoItem, urlDaLetra,
} from '@/lib/ordem-do-culto';
import { enviarLetra, musicasDoMinisterio, ordemAceitaExtras, salvarOrdem } from '@/lib/db';
import { lerCredenciais } from '@/lib/supabase';
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

   111 · 05/10/2026, pedido do Louvor: o COMPASSO ao lado do BPM, a DURAÇÃO em
   minuto e segundo, e a LETRA EM PDF. A letra sobe para o armário do Storage
   quando a pessoa toca em "Salvar" (escolher o arquivo só confere tipo e
   tamanho), e a ordem guarda o caminho dela. A música que volta ao culto
   traz a letra da última vez pelo banco de músicas: o PDF sobe uma vez por
   música. Sem a 111 no banco, nada disso aparece e a duração fica em
   minutos, como era (ver `ordemAceitaExtras`).
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

/** um id que não se adivinha, para o nome do PDF no armário */
function novoId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16); c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** a frase do envio que não deu certo, pelo código de `enviarLetra` */
function fraseDoEnvio(e: unknown): string {
  const cod = String((e as any)?.message || e);
  if (/LETRA_GRANDE/.test(cod)) return 'Esse PDF passou de 10 MB. Diminua o arquivo e salve de novo.';
  if (/LETRA_NAO_PDF/.test(cod)) return 'O armário só aceita PDF. Escolha o PDF da letra.';
  if (/LETRA_SEM_PERMISSAO/.test(cod)) return 'Seu acesso não envia letra para este ministério.';
  return 'Não consegui enviar o PDF. Confira a conexão e salve de novo.';
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
  /* 111 · o PDF escolhido, que ainda não subiu (sobe no "Salvar") */
  const [arquivo, setArquivo] = useState<File | null>(null);
  /* cada escolha de PDF tem um número: a conferência do conteúdo leva um
     instante, e a resposta de uma escolha antiga (ou de um formulário que já
     fechou) não pode trazer o arquivo de volta */
  const escolha = useRef(0);
  /* 111 · o banco aceita compasso, segundos e letra? Pergunta uma vez; uma
     ordem que já tem algum deles responde sozinha (o banco aceitou) */
  const [aceita, setAceita] = useState(false);
  const extras = aceita || lista.some(itemDa111);
  /* "Tirar da ordem" pede um segundo toque: o item some com a cifra, a nota e
     tudo, e não tem desfazer */
  const [confirmaTirar, setConfirmaTirar] = useState(false);
  /* quem abriu o formulário recebe o foco de volta quando ele fecha: o
     teclado não pode cair no começo da página */
  const voltarPara = useRef<HTMLElement | null>(null);
  const secaoRef = useRef<HTMLElement | null>(null);
  const [banco, setBanco] = useState<MusicaDoBanco[]>([]);
  const equipeRef = useRef(equipeId); equipeRef.current = equipeId;

  /* o dia ou o ministério mudou: o que estava sendo digitado era de outro.
     O "gravando" também zera: a resposta do que estava indo é ignorada (o
     ministério é conferido na volta), e sem isto a ordem do outro ficava
     travada até recarregar a página */
  useEffect(() => {
    setAberto(null); setRascunho(null); setErros({}); setDaUltimaVez(''); setConfirmaTirar(false); setArquivo(null);
    setGravando(false); escolha.current++;
  }, [d, equipeId]);
  useEffect(() => {
    let vivo = true;
    void lerBanco(equipeId).then(b => { if (vivo && equipeRef.current === equipeId) setBanco(b); });
    return () => { vivo = false; };
  }, [equipeId]);
  useEffect(() => {
    let vivo = true;
    void ordemAceitaExtras().then(v => { if (vivo) setAceita(v); });
    return () => { vivo = false; };
  }, []);

  const inicio = minutosDe(horaDoDia(dia?.inicio ?? null, dia?.evento ?? null, d, IGREJA.cultoHora, IGREJA.followHora));
  const horas = horarios(lista, inicio);
  const resumo = resumoDaOrdem(lista, inicio);
  const travado = ocupado || gravando;
  const base = lerCredenciais()?.url || '';

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
        ? (extras ? 'O banco recusou a ordem. Confira o tom, o BPM, o compasso, a duração e o link da cifra.'
                  : 'O banco recusou a ordem. Confira o tom, o BPM e o link da cifra.')
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
    setAberto(i); setRascunho(r); setErros({}); setDaUltimaVez(''); setConfirmaTirar(false); setArquivo(null);
    escolha.current++;
  }
  function fechar() {
    setAberto(null); setRascunho(null); setErros({}); setDaUltimaVez(''); setConfirmaTirar(false); setArquivo(null);
    escolha.current++;
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
    const novo = { ...completarDoBanco(rascunho, m, extras), titulo: m.titulo };
    const trouxe = (['tom', 'bpm', 'cifra', 'artista', 'compasso', 'min', 'seg', 'letra'] as const)
      .some(k => novo[k] !== rascunho[k]);
    if (trouxe || novo.titulo !== rascunho.titulo) setRascunho(novo);
    setDaUltimaVez(dicaDaMusica(m, trouxe));
  }

  async function salvarItem() {
    if (!rascunho) return;
    const r = itemDaTela(rascunho, extras ? 'segundos' : 'minutos');
    if (!r.ok) { setErros(r.erros); return; }
    let item = r.item;
    /* 111 · o PDF escolhido sobe ANTES da ordem: a ordem só aponta para um
       arquivo que já está no armário. Subiu e a ordem não gravou (rede, ou
       MUDOU)? O caminho fica no formulário, e o próximo "Salvar" não manda o
       mesmo PDF de novo. */
    if (arquivo && extras && item.t === 'musica') {
      const problema = conferirPdf(arquivo);
      if (problema) { setErros({ letra: problema }); return; }
      const eq = equipeId;
      setGravando(true);
      let caminho = '';
      try {
        caminho = await enviarLetra(caminhoNovoDaLetra(eq, novoId()), arquivo);
      } catch (e) {
        setGravando(false);
        if (equipeRef.current === eq) setErros({ letra: fraseDoEnvio(e) });
        return;
      }
      if (equipeRef.current !== eq) { setGravando(false); return; }
      item = { ...item, letra: caminho };
      setRascunho(rr => (rr ? { ...rr, letra: caminho } : rr));
      setArquivo(null);
    }
    const nova = [...lista];
    if (aberto === 'novo') nova.push(item);
    else if (typeof aberto === 'number') nova[aberto] = item;
    if (await gravar(nova, aberto === 'novo' ? `${item.titulo} entrou na ordem` : 'Ordem salva')) fechar();
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
    const chaveDoErro = (k === 'seg' ? 'min' : k) as keyof ErrosDoItem;
    if (erros[chaveDoErro]) setErros(er => { const n = { ...er }; delete n[chaveDoErro]; return n; });
  };
  /* 111 · o PDF escolhido: confere na hora (tipo, tamanho e o conteúdo) e
     espera o Salvar */
  async function escolherPdf(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    e.target.value = '';                       // escolher o mesmo arquivo de novo também avisa
    if (!f) return;
    const n = ++escolha.current;
    const problema = conferirPdf(f) ?? await conferirConteudoDoPdf(f);
    if (n !== escolha.current) return;         // veio outra escolha, ou o formulário fechou
    if (problema) { setErros(er => ({ ...er, letra: problema })); return; }
    setArquivo(f);
    setErros(er => { const n2 = { ...er }; delete n2.letra; return n2; });
  }
  function tirarLetra() {
    escolha.current++;
    setArquivo(null);
    setRascunho(r => (r ? { ...r, letra: '' } : r));
    setErros(er => { const n = { ...er }; delete n.letra; return n; });
  }
  const idc = (k: string) => `ord-${d}-${k}`;

  const musica = rascunho?.t === 'musica';
  const formulario = rascunho && (
    <form className="es-ec-of" aria-label={aberto === 'novo' ? (musica ? 'Nova música' : 'Novo momento') : `Editar ${lista[aberto as number]?.titulo || ''}`}
      noValidate
      onSubmit={e => { e.preventDefault(); void salvarItem(); }}
      onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); fechar(); } }}>
      <div className="es-ec-of-campos">
        <label className="es-campo es-ec-of-largo" htmlFor={idc('titulo')}>
          <span id={idc('r-titulo')}>{musica ? 'Música' : 'Momento'}</span>
          <input className="es-ctl" id={idc('titulo')} aria-labelledby={idc('r-titulo')} autoFocus autoComplete="off" enterKeyHint="done"
            maxLength={TETO.titulo + 20} list={musica && banco.length ? idc('banco') : undefined}
            placeholder={musica ? 'Nome da música' : 'Abertura, oração, avisos, palavra...'}
            value={rascunho.titulo} onChange={mudar('titulo')} onBlur={completar}
            aria-invalid={!!erros.titulo} aria-describedby={erros.titulo ? idc('e-titulo') : musica && banco.length > 0 ? idc('ultima') : undefined} />
          {/* a linha embaixo do nome EXISTE desde que o formulário abre (com o
              banco de músicas) e só troca de texto: nada se mexe no meio do
              toque em "Salvar" ou "Cancelar" */}
          {erros.titulo
            ? <small className="es-erro-campo" id={idc('e-titulo')}>{erros.titulo}</small>
            : musica && banco.length > 0
              ? <small id={idc('ultima')}>{daUltimaVez || DICA_DO_BANCO}</small>
              : null}
        </label>
        {musica && (
          <label className="es-campo" htmlFor={idc('artista')}>
            <span id={idc('r-artista')}>Artista</span>
            <input className="es-ctl" id={idc('artista')} aria-labelledby={idc('r-artista')} autoComplete="off" enterKeyHint="done" maxLength={TETO.artista + 20}
              value={rascunho.artista} onChange={mudar('artista')} />
          </label>
        )}
        {musica && (
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
        {musica && (
          <label className={`es-campo${extras ? ' es-ec-of-meio' : ''}`} htmlFor={idc('bpm')}>
            <span id={idc('r-bpm')}>BPM</span>
            <input className="es-ctl" id={idc('bpm')} aria-labelledby={idc('r-bpm')} inputMode="numeric" autoComplete="off" enterKeyHint="done" maxLength={3}
              placeholder="72" value={rascunho.bpm} onChange={mudar('bpm')}
              aria-invalid={!!erros.bpm} aria-describedby={erros.bpm ? idc('e-bpm') : undefined} />
            {erros.bpm && <small className="es-erro-campo" id={idc('e-bpm')}>{erros.bpm}</small>}
          </label>
        )}
        {/* 111 · o compasso, ao lado do BPM (no celular também) */}
        {musica && extras && (
          <label className="es-campo es-ec-of-meio" htmlFor={idc('compasso')}>
            <span id={idc('r-compasso')}>Compasso</span>
            <select className="es-ctl" id={idc('compasso')} aria-labelledby={idc('r-compasso')} value={rascunho.compasso} onChange={mudar('compasso')}>
              <option value="">sem compasso</option>
              {/* o compasso salvo que não está na lista aparece também */}
              {rascunho.compasso && !COMPASSOS.includes(rascunho.compasso) &&
                <option value={rascunho.compasso}>{rascunho.compasso}</option>}
              {COMPASSOS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        )}
        {extras ? (
          /* 111 · a duração em minuto e segundo: dois campos de número, que
             o teclado do celular abre sem ":" */
          <div className="es-campo" role="group" aria-labelledby={idc('r-tempo')}>
            <span id={idc('r-tempo')}>Duração</span>
            <div className="es-ec-of-tempo">
              <input className="es-ctl" id={idc('min')} aria-label="Minutos" inputMode="numeric" autoComplete="off" enterKeyHint="done" maxLength={3}
                placeholder={musica ? '4' : '10'} value={rascunho.min} onChange={mudar('min')}
                aria-invalid={!!erros.min} aria-describedby={erros.min ? idc('e-min') : undefined} />
              <span className="es-ec-of-tempo-sep" aria-hidden="true">:</span>
              <input className="es-ctl" id={idc('seg')} aria-label="Segundos" inputMode="numeric" autoComplete="off" enterKeyHint="done" maxLength={2}
                placeholder="00" value={rascunho.seg} onChange={mudar('seg')}
                aria-invalid={!!erros.min} aria-describedby={erros.min ? idc('e-min') : undefined} />
            </div>
            {erros.min && <small className="es-erro-campo" id={idc('e-min')}>{erros.min}</small>}
          </div>
        ) : (
          <label className="es-campo" htmlFor={idc('min')}>
            <span id={idc('r-min')}>Duração (min)</span>
            <input className="es-ctl" id={idc('min')} aria-labelledby={idc('r-min')} inputMode="numeric" autoComplete="off" enterKeyHint="done" maxLength={3}
              placeholder={musica ? '5' : '10'} value={rascunho.min} onChange={mudar('min')}
              aria-invalid={!!erros.min} aria-describedby={erros.min ? idc('e-min') : undefined} />
            {erros.min && <small className="es-erro-campo" id={idc('e-min')}>{erros.min}</small>}
          </label>
        )}
        <label className={`es-campo${musica && !extras ? ' es-ec-of-largo' : ''}`} htmlFor={idc('quem')}>
          <span id={idc('r-quem')}>{musica ? 'Lead' : 'Quem'}</span>
          <input className="es-ctl" id={idc('quem')} aria-labelledby={idc('r-quem')} autoComplete="off" enterKeyHint="done" maxLength={TETO.quem + 10}
            value={rascunho.quem} onChange={mudar('quem')} />
        </label>
        {musica && (
          <label className="es-campo es-ec-of-largo" htmlFor={idc('cifra')}>
            <span id={idc('r-cifra')}>Link da cifra</span>
            <input className="es-ctl" id={idc('cifra')} aria-labelledby={idc('r-cifra')} type="url" inputMode="url" autoComplete="off" spellCheck={false}
              enterKeyHint="done" maxLength={600} placeholder="Cole o link da página da cifra"
              value={rascunho.cifra} onChange={mudar('cifra')}
              aria-invalid={!!erros.cifra} aria-describedby={erros.cifra ? idc('e-cifra') : undefined} />
            {erros.cifra && <small className="es-erro-campo" id={idc('e-cifra')}>{erros.cifra}</small>}
          </label>
        )}
        {/* 111 · a letra em PDF: escolher confere o arquivo; o "Salvar" sobe
            e grava. Quem serve no culto baixa pelo próprio link. */}
        {musica && extras && (
          <div className="es-campo es-ec-of-largo" role="group" aria-labelledby={idc('r-letra')}>
            <span id={idc('r-letra')}>Letra (PDF)</span>
            <div className="es-ec-of-letra">
              {arquivo ? (
                <span className="es-ec-of-letra-nome">{arquivo.name} · {tamanhoLegivel(arquivo.size)}</span>
              ) : rascunho.letra ? (
                <a className="es-ec-of-letra-nome" href={urlDaLetra(base, rascunho.letra)} target="_blank" rel="noopener noreferrer">
                  Letra salva
                </a>
              ) : null}
              {/* os botões num grupo só: no celular o nome fica em cima e os
                  dois embaixo, juntos (o "Tirar" não cai sozinho de linha) */}
              <span className="es-ec-of-letra-acoes">
                <input type="file" accept="application/pdf,.pdf" id={idc('letra')} className="es-ec-of-arquivo"
                  aria-labelledby={idc('r-letra') + ' ' + idc('b-letra')} aria-describedby={idc('d-letra')}
                  aria-invalid={!!erros.letra} onChange={e => void escolherPdf(e)} disabled={travado} />
                <label htmlFor={idc('letra')} id={idc('b-letra')} className="es-btn es-peq">
                  {arquivo || rascunho.letra ? 'Trocar o PDF' : 'Escolher PDF'}
                </label>
                {(arquivo || rascunho.letra) && (
                  <button type="button" className="es-btn es-txt es-peq" onClick={tirarLetra} disabled={travado}>Tirar</button>
                )}
              </span>
            </div>
            <small id={idc('d-letra')} className={erros.letra ? 'es-erro-campo' : undefined}>
              {erros.letra || (arquivo ? 'Sobe quando você salvar.' : 'Até 10 MB. Quem serve no culto baixa pelo próprio link.')}
            </small>
          </div>
        )}
        <label className={`es-campo ${musica && !extras ? 'es-ec-of-largo' : 'es-ec-of-cheio'}`} htmlFor={idc('nota')}>
          {/* 02/10/2026: "Observação", a palavra do Louvor; na página de quem
              serve e na mensagem, a da música vira as Observações do setlist */}
          <span id={idc('r-nota')}>Observação</span>
          <input className="es-ctl" id={idc('nota')} aria-labelledby={idc('r-nota')} autoComplete="off" enterKeyHint="done" maxLength={TETO.nota + 20}
            placeholder={musica ? 'ex: medley com a ponte de outra música' : 'ex: ceia, batismo, apresentação'}
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
              resumo.totalSeg ? duracaoTotal(resumo.totalSeg) + (resumo.semTempo ? ' (sem contar o que está sem duração)' : '') : null,
              resumo.fim !== null ? `termina ${relogio(resumo.fim)}` : null].filter(Boolean).join(' · ')}
          </span>
        )}
      </div>

      {lista.length === 0 && aberto === null && (
        <p className="es-ec-ordem-vazia">
          {extras
            ? 'As músicas com tom, BPM, compasso, cifra e a letra em PDF, e os momentos do culto com o tempo de cada um. Quem serve neste culto vê no próprio link.'
            : 'As músicas com tom, BPM e cifra, e os momentos do culto com o tempo de cada um. Quem serve neste culto vê no próprio link.'}
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
                      it.quem || null, tempoDoItem(it) || null, it.cifra ? 'com cifra' : null,
                      it.letra ? 'com letra' : null].filter(Boolean).join(' · ')}
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
