'use client';
import { useEffect, useRef, useState } from 'react';
import {
  type ChaveRepertorio, type Estado, type Repertorio, PLATAFORMAS, garantirDia, normalizarLinkRepertorio,
} from '@/lib/engine';
import { salvarRepertorio } from '@/lib/db';
import { aviseHumano } from '@/lib/erros';

/* =============================================================================
   O REPERTÓRIO DO DIA, NA ESCALA DO LÍDER — 01/10/2026.

   Pedido do Louvor: quem lidera monta o setlist no Spotify e no Deezer, e uma
   playlist no YouTube "para quem não usa nenhuma das duas", e cola os links
   no culto. Cada pessoa escalada vê os botões na própria página, e a mensagem
   do grupo passa a levar os links.

   COMO GRAVA. Cada campo grava sozinho ao sair dele (como o recado do dia),
   por `salvar_repertorio`, que mexe SÓ no setlist: `salvarDia` reescreve o
   dia inteiro por diferença, e colar um link não tem por que passar perto das
   escalações. Link que não é da plataforma não grava: o campo fica com o que
   foi colado, marcado, e a frase diz o que colar.

   O MINISTÉRIO VAI JUNTO, CONFERIDO NA VOLTA. O Shell não remonta a página
   quando o líder troca de ministério (ver `salvarObs`): o id do ministério é
   o de quando a gravação começou, e o estado só é tocado se ele ainda for o
   da tela.
   ============================================================================= */

type Erros = Partial<Record<ChaveRepertorio, string>>;

export default function RepertorioDoDia({ S, d, cultoId, equipeId, ocupado, pinta, aviso }: {
  S: Estado; d: string; cultoId: string; equipeId: string; ocupado: boolean;
  pinta: () => void; aviso: (t: string) => void;
}) {
  const salvo = S.escalas[d]?.repertorio || {};
  const [rascunho, setRascunho] = useState<Repertorio>({});
  const [erros, setErros] = useState<Erros>({});
  const [gravando, setGravando] = useState(false);
  const equipeRef = useRef(equipeId); equipeRef.current = equipeId;
  /* o dia ou o ministério mudou: o que estava sendo digitado era de outro */
  useEffect(() => { setRascunho({}); setErros({}); }, [d, equipeId]);

  const valor = (k: ChaveRepertorio) => rascunho[k] ?? salvo[k] ?? '';

  async function sair(k: ChaveRepertorio) {
    const digitado = rascunho[k];
    if (digitado === undefined) return;
    const r = normalizarLinkRepertorio(k, digitado);
    if (!r.ok) { setErros(e => ({ ...e, [k]: r.erro })); return; }
    setErros(e => { const n = { ...e }; delete n[k]; return n; });
    if (r.url === (salvo[k] || '')) {
      setRascunho(m => { const n = { ...m }; delete n[k]; return n; });
      return;
    }
    const novo: Repertorio = { ...salvo, [k]: r.url };
    if (!r.url) delete novo[k];
    const eq = equipeId;
    setGravando(true);
    try {
      await salvarRepertorio(cultoId, eq, novo);
      if (equipeRef.current !== eq) return;            // o líder já está em outro ministério
      const dia = garantirDia(S, d);
      if (Object.keys(novo).length) dia.repertorio = novo; else delete dia.repertorio;
      setRascunho(m => { const n = { ...m }; delete n[k]; return n; });
      pinta();
      aviso(r.url ? 'Repertório salvo' : 'Link tirado do repertório');
    } catch (e: any) {
      if (equipeRef.current !== eq) return;
      /* o que foi colado continua no campo, para tentar de novo. Os dois
         códigos que só esta função devolve são ditos aqui: `lib/erros.ts` é
         dos dois sistemas e não precisa saber de repertório. */
      const cod = String(e?.message || e);
      aviso(/LINK_INVALIDO/.test(cod)
        ? 'O banco recusou esse link. Cole o link da playlist pelo botão Compartilhar.'
        : /CULTO_INEXISTENTE/.test(cod)
          ? 'Esse culto não está mais na escala. Recarregue a tela.'
          : aviseHumano(e, 'salvar o repertório'));
    } finally {
      if (equipeRef.current === eq) setGravando(false);
    }
  }

  return (
    <div className="es-ec-repertorio" role="group" aria-labelledby={`rep-${d}`}>
      <span className="es-ec-rep-tit" id={`rep-${d}`}>Repertório</span>
      <div className="es-ec-rep-campos">
        {PLATAFORMAS.map(p => (
          <label className="es-campo" key={p.chave}>
            <span>{p.nome}</span>
            <input className="es-ctl" type="url" inputMode="url" enterKeyHint="done" autoComplete="off"
              spellCheck={false} maxLength={600} placeholder="Cole o link da playlist"
              value={valor(p.chave)} disabled={ocupado || gravando}
              aria-invalid={!!erros[p.chave]} aria-describedby={erros[p.chave] ? `rep-${d}-${p.chave}` : undefined}
              onChange={e => { const v = e.target.value; setRascunho(m => ({ ...m, [p.chave]: v })); }}
              onKeyDown={e => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                /* Esc desiste do que foi colado e volta ao salvo */
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setRascunho(m => { const n = { ...m }; delete n[p.chave]; return n; });
                  setErros(er => { const n = { ...er }; delete n[p.chave]; return n; });
                }
              }}
              onBlur={() => void sair(p.chave)} />
            {erros[p.chave] && <small className="es-erro-campo" id={`rep-${d}-${p.chave}`}>{erros[p.chave]}</small>}
          </label>
        ))}
      </div>
      <small className="es-ec-rep-nota">Vai na mensagem do grupo e na página de quem está escalado.</small>
    </div>
  );
}
