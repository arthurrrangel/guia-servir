'use client';
/* =============================================================================
   "COMO FOI", NO LINK DO VOLUNTÁRIO — 107, 02/10/2026

   Depois de servir, uma pergunta: como foi? Três respostas de um toque (foi
   bom, foi puxado, teve problema) e, se a pessoa quiser, uma nota. Só a
   liderança do ministério lê, e a tela diz isso antes de a pessoa escrever.

   A pergunta só aparece quando o culto passou (no dia, uma hora e meia depois
   de começar) e por até sete dias. Quem respondeu vê a resposta numa linha,
   com "Mudar". Só aparece com a migração 107 no banco: `eu_como_foi` tem de
   ter respondido.
   ============================================================================= */
import { useState } from 'react';
import { sbPublico as sb } from '@/lib/supabase';
import { aviseHumano } from '@/lib/erros';
import { diaLongo } from '@/lib/engine';
import {
  type ComoFoiMeu, type RespostaComoFoi, COMO_FOI, NOTA_MAX, ROTULO_COMO_FOI, erroAoContar, perguntaAberta,
} from '@/lib/chegada';

type Props = {
  token: string;
  lista: ComoFoiMeu[];
  equipe: string;
  /* o artigo do nome do ministério ("a" Mídia, "o" Louvor), de `eu_espaco` */
  artigo?: string | null;
  cultoHora: string; followHora?: string | null;
  agora?: Date;
  aoMudar: () => Promise<void> | void;
  avisar: (msg: string) => void;
  errar: (msg: string) => void;
};

export default function ComoFoiNoLink(p: Props) {
  /* o culto cuja resposta está aberta para mudar ou para ganhar nota */
  const [editando, setEditando] = useState<string | null>(null);
  const [notas, setNotas] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState('');
  const agora = p.agora || new Date();
  const visiveis = p.lista.filter(c => perguntaAberta(c, agora, p.cultoHora, p.followHora));
  if (!visiveis.length) return null;
  const abertas = visiveis.filter(c => !c.resposta || editando === c.culto_id);
  const respondidas = visiveis.filter(c => !!c.resposta && editando !== c.culto_id);
  /* "da Mídia", "do Louvor": o artigo é dado do banco (`equipes.artigo`),
     porque não há regra de terminação confiável em português. Sem ele, a
     frase não arrisca o gênero. */
  const quem = p.equipe && (p.artigo === 'a' || p.artigo === 'o')
    ? `a liderança ${p.artigo === 'a' ? 'da' : 'do'} ${p.equipe}` : 'a liderança';

  async function enviar(c: ComoFoiMeu, resposta: RespostaComoFoi | null, texto: string | null, fim: boolean) {
    setOcupado(c.culto_id);
    const { data, error } = await sb()!.rpc('eu_como_foi_responder', {
      p_token: p.token, p_culto: c.culto_id, p_resposta: resposta, p_texto: texto,
    });
    setOcupado('');
    if (error) { p.errar(aviseHumano(error, 'enviar')); return; }
    const r = data as any;
    if (!r?.ok) { p.errar(erroAoContar(r)); await p.aoMudar(); return; }
    if (resposta === null) { setEditando(null); p.avisar('Apagado.'); }
    else if (fim) { setEditando(null); p.avisar('Obrigado por contar.'); }
    /* a primeira escolha deixa a nota aberta: escrever é opcional */
    else setEditando(c.culto_id);
    await p.aoMudar();
  }

  return (
    <section className="vol-secao" id="como-foi" aria-labelledby="como-foi-tit">
      <div className="vol-secao-cab">
        <span className="rot" id="como-foi-tit">Como foi</span>
        {abertas.some(c => !c.resposta) && (
          <span className="vol-secao-nota">Só {quem} lê</span>
        )}
      </div>

      {abertas.map(c => {
        const nota = notas[c.culto_id] ?? c.texto ?? '';
        const idNota = `nota-${c.culto_id}`;
        return (
          <div className="vol-troca vol-comofoi" key={c.culto_id}>
            <div className="vol-troca-fn">{c.funcoes.join(' · ') || 'Você serviu'}</div>
            <div className="vol-troca-dia">{diaLongo(c.data, c.evento)}</div>
            <p className="vol-troca-quem" id={`q-${c.culto_id}`}>Como foi servir?</p>
            <div className="vol-btns vol-comofoi-ops" role="group" aria-labelledby={`q-${c.culto_id}`}>
              {COMO_FOI.map(o => (
                <button key={o.v} type="button" className={`vol-bt ${c.resposta === o.v ? '' : 'nao'}`}
                  aria-pressed={c.resposta === o.v} disabled={ocupado === c.culto_id}
                  onClick={() => void enviar(c, o.v, nota.trim() ? nota : null, false)}>
                  {o.rot}
                </button>
              ))}
            </div>
            {!!c.resposta && (
              <div className="vol-comofoi-nota">
                <label htmlFor={idNota}>Quer contar mais? (se quiser)</label>
                <textarea id={idNota} className="vol-comofoi-texto" rows={3} maxLength={NOTA_MAX} value={nota}
                  placeholder={c.resposta === 'problema' ? 'O que aconteceu?' : 'Escreva aqui'}
                  onChange={e => setNotas({ ...notas, [c.culto_id]: e.target.value })} />
                <small className="vol-comofoi-conta">Só {quem} lê. {nota.length}/{NOTA_MAX}</small>
                <div className="vol-troca-acoes">
                  <button type="button" className="vol-acao" disabled={ocupado === c.culto_id}
                    onClick={() => void enviar(c, c.resposta, nota.trim() ? nota : null, true)}>
                    {nota.trim() ? 'Enviar a nota' : 'Pronto'}
                  </button>
                  <button type="button" className="vol-acao" disabled={ocupado === c.culto_id}
                    onClick={() => void enviar(c, null, null, true)}>
                    Apagar minha resposta
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {respondidas.map(c => (
        <div className="vol-linha" key={c.culto_id}>
          <span className="vol-marca" aria-hidden="true" />
          <span>
            <span className="vol-linha-dia">{diaLongo(c.data, c.evento)}</span>
            <span className="vol-linha-fn">Você contou: {ROTULO_COMO_FOI[c.resposta!]}{c.texto ? ' · com nota' : ''}</span>
          </span>
          <button type="button" className="vol-acao" onClick={() => setEditando(c.culto_id)}>
            Mudar
          </button>
        </div>
      ))}
    </section>
  );
}
