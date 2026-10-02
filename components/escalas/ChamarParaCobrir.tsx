'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type Estado, horaDoDia, diaLongo } from '@/lib/engine';
import {
  type CandidatoDaVaga, type ChamadaDoLider, ESTADO_DA_CHAMADA,
  chamadosDaVaga, detalheDoCandidato, erroAoChamar, linkDoWhats, marcadosDeInicio,
  recadoDaChamada, resultadoDeChamar, vagasAbertas,
} from '@/lib/chamadas';
import { cancelarChamadas, chamadasDoDia, chamarCandidatos, chamarParaCobrir } from '@/lib/db';
import { aviseHumano } from '@/lib/erros';
import { IGREJA } from '@/lib/igreja';
import { PRINCIPAL } from '@/lib/meu-token';
import { Pilula, type Tom } from '@/components/escalas/Pecas';

/* =============================================================================
   CHAMAR QUEM PODE COBRIR A VAGA, NA ESCALA DO LÍDER — 106, 02/10/2026.

   Fase 4 do estudo do ServoApp. Embaixo dos postos do dia, cada vaga aberta
   (ninguém, ou quem estava disse que não pode) ganha "Chamar quem pode". A
   lista vem do banco (`chamar_candidatos`): as regras do sorteio, quem disse
   que pode primeiro, depois quem serviu menos no mês. Os três primeiros vêm
   marcados; o líder ajusta e chama.

   Cada pessoa chamada recebe o convite no próprio link, e o aviso no celular
   quando ligou (104). Para quem não ligou, a linha de cada chamado tem o
   WhatsApp com o recado pronto e o link pessoal dela. A primeira que aceita
   fica com a vaga, confirmada; os outros convites fecham sozinhos.

   SÓ APARECE COM A 106 NO BANCO: a seção pergunta `chamadas_do_dia` ao abrir
   e some se a pergunta falhar. Ninguém é chamado sem o líder tocar.

   SEM POLLING: a seção relê os chamados ao abrir o dia, depois de cada ação
   e quando a janela volta a ter foco. Quem aceitou aparece com "Atualizar a
   escala", que relê o dia inteiro.
   ============================================================================= */

const avisarChamados = (ids: string[]) => {
  if (!ids.length) return;
  try {
    void fetch('/api/aviso/chamada', {
      method: 'POST', headers: { 'content-type': 'application/json' }, keepalive: true,
      body: JSON.stringify({ chamadas: ids.slice(0, 10) }),
    }).catch(() => {});
  } catch { /* o aviso é um extra */ }
};

const TOM: Record<string, Tom> = { aberta: 'warn', aceita: 'ok', recusada: 'neutro', preenchida: 'neutro', cancelada: 'neutro', expirada: 'neutro' };

export default function ChamarParaCobrir({ S, d, cultoId, equipeId, ocupado, aviso, recarregar }: {
  S: Estado; d: string; cultoId: string; equipeId: string; ocupado: boolean;
  aviso: (t: string) => void; recarregar: () => Promise<unknown>;
}) {
  const [chamadas, setChamadas] = useState<ChamadaDoLider[] | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);         // funcao_id da vaga escolhendo
  const [cands, setCands] = useState<CandidatoDaVaga[] | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [gravando, setGravando] = useState(false);
  const equipeRef = useRef(equipeId); equipeRef.current = equipeId;

  const ler = useCallback(async () => {
    const eq = equipeId;
    try {
      const l = await chamadasDoDia(eq, d);
      if (equipeRef.current === eq) setChamadas(l);
    } catch {
      /* banco sem a 106 (ou sem rede): a seção não aparece */
      if (equipeRef.current === eq) setChamadas(null);
    }
  }, [equipeId, d]);

  useEffect(() => { setAberta(null); setCands(null); void ler(); }, [ler]);
  useEffect(() => {
    const volta = () => { if (document.visibilityState === 'visible') void ler(); };
    document.addEventListener('visibilitychange', volta);
    return () => document.removeEventListener('visibilitychange', volta);
  }, [ler]);

  if (chamadas === null) return null;
  const vagas = vagasAbertas(S, d);
  /* quem aceitou depois que a tela carregou: a vaga ainda aparece aberta aqui */
  const aceitas = chamadas.filter(c => c.status === 'aceita' && vagas.some(f => f.id === c.funcao_id));
  if (!vagas.length && !aceitas.length) return null;

  const dia = S.escalas[d];
  const hora = horaDoDia(dia?.inicio ?? null, dia?.evento ?? null, d, IGREJA.cultoHora, IGREJA.followHora);
  const quando = `${diaLongo(d, dia?.evento ?? null)}${hora ? `, ${hora}` : ''}`;
  const travado = ocupado || gravando;

  async function escolher(funcaoId: string) {
    if (aberta === funcaoId) { setAberta(null); setCands(null); return; }
    setAberta(funcaoId); setCands(null);
    const eq = equipeId;
    try {
      const l = await chamarCandidatos(cultoId, funcaoId);
      if (equipeRef.current !== eq) return;
      setCands(l); setMarcados(new Set(marcadosDeInicio(l)));
    } catch (e: any) {
      if (equipeRef.current !== eq) return;
      setAberta(null); aviso(aviseHumano(e, 'buscar quem pode'));
    }
  }

  async function chamar(funcaoId: string) {
    const ids = [...marcados];
    const eq = equipeId;
    setGravando(true);
    try {
      const r = await chamarParaCobrir(cultoId, funcaoId, ids);
      if (equipeRef.current !== eq) return;
      if (!r?.ok) { aviso(erroAoChamar(r)); await ler(); return; }
      avisarChamados(r.chamadas || []);
      const nomes = new Map((cands || []).map(c => [c.voluntario_id, c.nome]));
      aviso(resultadoDeChamar((r.chamadas || []).length,
        (r.recusados || []).map(x => ({ nome: nomes.get(x.voluntario_id) || '', motivo: x.motivo }))));
      setAberta(null); setCands(null);
      await ler();
    } catch (e: any) {
      if (equipeRef.current === eq) aviso(aviseHumano(e, 'chamar'));
    } finally {
      if (equipeRef.current === eq) setGravando(false);
    }
  }

  async function parar(funcaoId: string) {
    const eq = equipeId;
    setGravando(true);
    try {
      const r = await cancelarChamadas(cultoId, funcaoId);
      if (equipeRef.current !== eq) return;
      if (!r?.ok) aviso(erroAoChamar(r));
      else aviso(r.canceladas === 1 ? '1 convite cancelado' : `${r.canceladas || 0} convites cancelados`);
      await ler();
    } catch (e: any) {
      if (equipeRef.current === eq) aviso(aviseHumano(e, 'cancelar'));
    } finally {
      if (equipeRef.current === eq) setGravando(false);
    }
  }

  async function atualizar() {
    setGravando(true);
    try { await recarregar(); await ler(); } finally { setGravando(false); }
  }

  return (
    <section className="es-ec-chamar" aria-labelledby={`cham-${d}`}>
      <div className="es-ec-ordem-cab">
        <span className="es-ec-rep-tit" id={`cham-${d}`}>Chamar quem pode cobrir</span>
        <span className="es-ec-ordem-resumo">
          {vagas.length === 1 ? '1 vaga aberta' : `${vagas.length} vagas abertas`}
        </span>
      </div>

      {!!aceitas.length && (
        <div className="es-ec-cv-aceitas" role="status">
          <span>
            {aceitas.map(c => {
              const f = S.funcoes.find(x => x.id === c.funcao_id);
              return `${c.nome.split(/\s+/)[0]} aceitou ${f?.nome || 'a vaga'}`;
            }).join('; ')}.
          </span>
          <button type="button" className="es-btn es-peq" disabled={travado} onClick={() => void atualizar()}>
            Atualizar a escala
          </button>
        </div>
      )}

      <ul className="es-ec-cv-lista">
        {vagas.map(f => {
          const dela = chamadosDaVaga(chamadas, cultoId, f.id!);
          const abertas = dela.filter(c => c.status === 'aberta');
          const escolhendo = aberta === f.id;
          return (
            <li className="es-ec-cv" key={f.id}>
              <div className="es-ec-cv-linha">
                <span className="es-ec-cv-fn">{f.nome}</span>
                <span className="es-ec-cv-est">
                  {dela.length ? `${dela.length} ${dela.length === 1 ? 'chamado' : 'chamados'}` : 'ninguém chamado ainda'}
                </span>
                <span className="es-ec-cv-acoes">
                  {!!abertas.length && (
                    <button type="button" className="es-btn es-txt es-peq" disabled={travado} onClick={() => void parar(f.id!)}>
                      Parar de chamar
                    </button>
                  )}
                  <button type="button" className="es-btn es-peq" disabled={travado} aria-expanded={escolhendo}
                    onClick={() => void escolher(f.id!)}>
                    {dela.length ? 'Chamar mais' : 'Chamar quem pode'}
                  </button>
                </span>
              </div>

              {!!dela.length && (
                <ul className="es-ec-cv-chamados">
                  {dela.map(c => {
                    const v = S.voluntarios.find(x => x.id === c.voluntario_id);
                    const zap = c.status === 'aberta' && v?.token
                      ? linkDoWhats(v.tel, recadoDaChamada(c.nome, f.nome, quando, PRINCIPAL, v.token)) : null;
                    return (
                      <li className="es-ec-cv-chamado" key={c.id}>
                        <span className="es-ec-cv-nome">{c.nome}</span>
                        <Pilula tom={TOM[c.status]}>{ESTADO_DA_CHAMADA[c.status]}</Pilula>
                        {zap && (
                          <a className="es-btn es-txt es-peq" href={zap} target="_blank" rel="noopener noreferrer"
                            aria-label={`Avisar ${c.nome.split(/\s+/)[0]} no WhatsApp`}>
                            WhatsApp
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {escolhendo && (
                <div className="es-ec-cv-escolha">
                  {cands === null && <p className="es-ec-ordem-vazia" role="status">Procurando quem pode...</p>}
                  {cands !== null && !cands.length && (
                    <p className="es-ec-ordem-vazia">
                      Ninguém mais pode cobrir {f.nome} nesse dia: quem faz a função já está em outro posto,
                      avisou que não pode, ou está pausado.
                    </p>
                  )}
                  {cands !== null && !!cands.length && (
                    <fieldset className="es-ec-cv-pessoas">
                      <legend className="es-ec-cv-legenda">Quem chamar para {f.nome}</legend>
                      {cands.map(c => (
                        <label className="es-ec-cv-pessoa" key={c.voluntario_id}>
                          <input type="checkbox" checked={marcados.has(c.voluntario_id)} disabled={travado}
                            onChange={e => {
                              const n = new Set(marcados);
                              if (e.target.checked) n.add(c.voluntario_id); else n.delete(c.voluntario_id);
                              setMarcados(n);
                            }} />
                          <span className="es-ec-cv-pessoa-txt">
                            <span className="es-ec-cv-nome">{c.nome}</span>
                            <small>{detalheDoCandidato(c)}</small>
                          </span>
                        </label>
                      ))}
                    </fieldset>
                  )}
                  <div className="es-linha">
                    {!!cands?.length && (
                      <button type="button" className="es-btn es-pri es-peq" disabled={travado || !marcados.size || marcados.size > 10}
                        onClick={() => void chamar(f.id!)}>
                        {marcados.size === 1 ? 'Chamar 1 pessoa' : `Chamar ${marcados.size} pessoas`}
                      </button>
                    )}
                    <button type="button" className="es-btn es-txt es-peq" disabled={gravando}
                      onClick={() => { setAberta(null); setCands(null); }}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
