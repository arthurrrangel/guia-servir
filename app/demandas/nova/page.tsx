'use client';
/* ABRIR UMA DEMANDA.

   Esta é a tela que decide se o sistema vive. O documento lista dezoito
   campos; se os dezoito aparecerem de uma vez num celular, ninguém abre a
   segunda demanda. Então: cinco perguntas visíveis, o resto atrás de "mais
   detalhes", e a categoria já resolve sozinha o setor que atende, se precisa
   de aprovação e a data sugerida.

   O aviso do que falta aparece ANTES de enviar, com as mesmas palavras das
   regras do banco. Quem manda continua sendo o banco: se a tela esquecer uma
   regra, o CHECK recusa e a frase traduzida aparece igual. */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Casca, { useEu } from '@/components/demandas/Casca';
import { Aviso, Bloco, Campo, Copiar, Esqueleto, Opcoes } from '@/components/demandas/Ui';
import { abrir, bases } from '@/lib/demandas/api';
import {
  PRIORIDADES, dataCheia, linkZap, oQueFalta, prazoSugerido, rascunhoVazio,
  recadoDoErro, quemManda, type Rascunho,
} from '@/lib/demandas/regras';
import type { Bases, Categoria, Prioridade } from '@/lib/demandas/tipos';

export default function Pagina() {
  return <Casca><Nova /></Casca>;
}

type Pronta = {
  numero: number; precisa_aprovacao: boolean;
  setor_responsavel?: string; contato?: { nome: string; telefone: string | null } | null;
};

function Nova() {
  const { eu } = useEu();
  const [b, setB] = useState<Bases | null>(null);
  const [r, setR] = useState<Rascunho>(rascunhoVazio());
  const [anexos, setAnexos] = useState<{ nome: string; url: string }[]>([]);
  const [anexoUrl, setAnexoUrl] = useState('');
  const [mais, setMais] = useState(false);
  const [semData, setSemData] = useState(false);
  const [erro, setErro] = useState('');
  const [indo, setIndo] = useState(false);
  const [pronta, setPronta] = useState<Pronta | null>(null);
  const [tentou, setTentou] = useState(false);
  const [erroBase, setErroBase] = useState('');

  /* O ERRO DE `bases()` ERA DESCARTADO AQUI TAMBÉM — 20/09/2026.

     Esta é, pelo comentário do próprio arquivo, "a tela que decide se o
     sistema vive". Com a chamada falhando, `b` ficava nulo, o
     `return <Esqueleto />` vencia, e a pessoa via barras cinza animadas para
     sempre: sem texto, sem botão, sem "tentar de novo". */
  const carregar = useCallback(() => {
    setErroBase('');
    bases().then(x => {
      if (x.ok) setB({ setores: x.setores, categorias: x.categorias });
      else setErroBase(recadoDoErro(x, 'carregar os setores e categorias'));
    });
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const cat = useMemo(() => b?.categorias.find(c => c.id === r.categoria_id), [b, r.categoria_id]);
  const setorDaCat = useMemo(
    () => b?.setores.find(s => s.id === cat?.setor_id)?.nome || '',
    [b, cat]);
  const grupos = useMemo(() => {
    const m = new Map<string, Categoria[]>();
    (b?.categorias || []).forEach(c => { if (!m.has(c.grupo)) m.set(c.grupo, []); m.get(c.grupo)!.push(c); });
    return [...m.entries()];
  }, [b]);

  const manda = quemManda(eu?.papel);
  const temSetor = !!(r.setor_solicitante || eu?.setor_id);
  const falta = oQueFalta(r, temSetor);

  /* a categoria sugere a data; se a pessoa já mexeu no campo, não atropela */
  function escolherCategoria(id: string) {
    const c = b?.categorias.find(x => x.id === id);
    setR(v => ({
      ...v, categoria_id: id,
      prazo: v.prazo || (semData ? '' : prazoSugerido(c)),
    }));
  }

  async function enviar() {
    setTentou(true);
    if (falta.length) { setErro(''); return; }
    setIndo(true); setErro('');
    const x = await abrir({ ...r, sem_prazo_porque: semData ? r.sem_prazo_porque : '' }, anexos);
    setIndo(false);
    if (!x.ok) { setErro(recadoDoErro(x, 'abrir a demanda')); return; }
    setPronta(x as unknown as Pronta);
  }

  if (erroBase && !b) {
    return (
      <>
        <div className="dm-rot">{'>'} nova demanda</div>
        <Aviso tom="bad">{erroBase}</Aviso>
        <button className="dm-btn" onClick={carregar} style={{ marginTop: 'var(--dm-e2)' }}>
          Tentar de novo
        </button>
      </>
    );
  }
  if (!b) return <Esqueleto />;

  if (pronta) {
    /* a raiz do SISTEMA, não do site: os links que saem daqui pelo WhatsApp
     precisam cair em /demandas, e não na home da igreja */
  const base = typeof window !== 'undefined' ? window.location.origin + '/demandas' : '';
    const texto =
      `Demanda #${pronta.numero} — ${r.titulo}\n` +
      `${eu?.setor || 'Um setor'} pediu para ${pronta.setor_responsavel || setorDaCat}.\n` +
      `${base}/d/${pronta.numero}`;
    const zap = linkZap(pronta.contato?.telefone, texto);
    return (
      <>
        <div className="dm-rot">{'>'} pronto</div>
        <h1 style={{ margin: '6px 0 var(--dm-e3)' }}>Demanda #{pronta.numero} registrada.</h1>

        {pronta.precisa_aprovacao ? (
          <Aviso tom="warn">
            <div>
              Esta categoria <b>precisa de aprovação</b> antes de alguém executar. Ela já está na
              fila da liderança e ninguém consegue começar antes disso.
            </div>
          </Aviso>
        ) : (
          <Aviso tom="ok">
            <div>Foi para <b>{pronta.setor_responsavel || setorDaCat}</b>. Você acompanha pela lista.</div>
          </Aviso>
        )}

        <div className="dm-card">
          <h3 style={{ marginBottom: 6 }}>Avisar quem vai atender</h3>
          <p className="dm-peq dm-mudo">
            O sistema não manda WhatsApp sozinho. Ele escreve o recado; você toca uma vez e envia.
          </p>
          <div className="dm-linha">
            {zap
              ? <a className="dm-btn dm-zap" href={zap} target="_blank" rel="noopener noreferrer">
                  Mandar para {pronta.contato!.nome.split(' ')[0]}
                </a>
              : <span className="dm-peq dm-mudo">Ninguém desse setor tem telefone cadastrado ainda.</span>}
            <Copiar texto={texto} rot="Copiar o recado" />
          </div>
        </div>

        <div className="dm-linha">
          <Link className="dm-btn dm-pri" href={`/demandas/d/${pronta.numero}`}>Ver a demanda</Link>
          <button className="dm-btn" onClick={() => {
            setPronta(null); setR(rascunhoVazio()); setAnexos([]); setSemData(false); setTentou(false);
          }}>Abrir outra</button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="dm-rot">{'>'} nova demanda</div>
      <h1 style={{ margin: '6px 0 var(--dm-e3)' }}>O que você precisa?</h1>

      {erro ? <Aviso tom="bad">{erro}</Aviso> : null}

      <div className="dm-card">
        <Campo rot="Título" ajuda="Uma linha que já diga do que se trata.">
          {/* OS TETOS APARECEM ANTES DO TOQUE, E NÃO DEPOIS.

              O banco cobra 200 no título, 20 mil na descrição e 120 no evento
              desde a migração 52, e a tela só dizia isso DEPOIS de tocar em
              "Enviar" — `tentou` só vira `true` dentro de `enviar()`. Digita-se
              300 letras, toca-se, e só aí o sistema conta que o limite era 200.
              `maxLength` faz o navegador parar no limite, que é a forma mais
              barata de a regra existir para quem está digitando.

              Os campos sem teto no banco ganham teto aqui pelo mesmo motivo da
              `CaixaDeAcao`: texto colado sem limite pesa em toda abertura
              daquela ficha, para sempre. */}
          <input maxLength={200} value={r.titulo} onChange={e => setR(v => ({ ...v, titulo: e.target.value }))}
            placeholder="Arte para o culto de celebração" />
        </Campo>

        <Campo rot="Categoria"
          ajuda={cat
            ? `Vai para ${setorDaCat}${cat.exige_aprovacao ? ' e precisa de aprovação antes de começar' : ''}.`
            : 'A categoria decide qual setor atende. Ninguém precisa triar.'}>
          <select value={r.categoria_id} onChange={e => escolherCategoria(e.target.value)}>
            <option value="">Escolha</option>
            {grupos.map(([g, cs]) => (
              <optgroup key={g} label={g}>
                {cs.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </optgroup>
            ))}
          </select>
        </Campo>

        <Campo rot="O que precisa ser feito"
          ajuda="Quanto mais claro aqui, menos ida e volta depois.">
          <textarea maxLength={20000} value={r.descricao} onChange={e => setR(v => ({ ...v, descricao: e.target.value }))} />
        </Campo>

        {!semData ? (
          <Campo rot="Para quando"
            ajuda={cat?.prazo_padrao_dias ? `${setorDaCat} costuma levar ${cat.prazo_padrao_dias} dias.` : undefined}>
            <input type="date" value={r.prazo} onChange={e => setR(v => ({ ...v, prazo: e.target.value }))} />
          </Campo>
        ) : (
          <Campo rot="Por que não tem data"
            ajuda="Toda demanda precisa de uma data ou de um porquê. Sem isso ela some no meio das outras.">
            <input maxLength={500} value={r.sem_prazo_porque}
              onChange={e => setR(v => ({ ...v, sem_prazo_porque: e.target.value }))}
              placeholder="Depende da agenda do pastor" />
          </Campo>
        )}
        <button className="dm-btn dm-peq" style={{ marginTop: -8, marginBottom: 'var(--dm-e3)' }}
          onClick={() => { setSemData(x => !x); setR(v => ({ ...v, prazo: '', sem_prazo_porque: '' })); }}>
          {semData ? 'Tenho uma data' : 'Não tenho data'}
        </button>

        {/* `Bloco` E NÃO `Campo`, E ISSO É UM CONSERTO, NÃO ESTILO.

            `Campo` é um `<label>`, e um `<label>` ativa o primeiro descendente
            rotulável. Com quatro `<button>` dentro, tocar na palavra
            "Prioridade" marcava "Baixa". Medido, clicando no pixel do rótulo:

              ANTES : Baixa:false Normal:true
              DEPOIS: Baixa:true  Normal:false

            A pessoa encosta o polegar na palavra enquanto rola e a demanda
            urgente sai como Baixa, sem aviso nenhum — e a prioridade errada
            muda a ordem da fila. `Opcoes` já traz `role="group"` e
            `aria-label`, então o rótulo continua anunciado. */}
        <Bloco rot="Prioridade" ajuda={PRIORIDADES.find(p => p.v === r.prioridade)?.explica}>
          <Opcoes rot="Prioridade" valor={r.prioridade}
            opcoes={PRIORIDADES.map(p => ({ v: p.v as Prioridade, rot: p.rot }))}
            aoMudar={v => setR(x => ({ ...x, prioridade: v }))} />
        </Bloco>

        {r.prioridade === 'urgente' ? (
          <Campo rot="O que acontece se não for feito"
            ajuda="Urgente sem impacto escrito é só ansiedade. Com o impacto, a liderança consegue comparar.">
            <input maxLength={2000} value={r.impacto} onChange={e => setR(v => ({ ...v, impacto: e.target.value }))}
              placeholder="Sem isso o culto de domingo não tem som" />
          </Campo>
        ) : null}
      </div>

      <button type="button" className="dm-gaveta" aria-expanded={mais}
        onClick={() => setMais(x => !x)} style={{ marginBottom: 'var(--dm-e2)' }}>
        {mais ? 'Esconder os detalhes' : 'Evento, local, orçamento e anexos'}
      </button>

      {mais ? (
        <div className="dm-card">
          {manda ? (
            <Campo rot="Quem está pedindo" ajuda="Como liderança, você pode abrir em nome de outro setor.">
              <select value={r.setor_solicitante || eu?.setor_id || ''}
                onChange={e => setR(v => ({ ...v, setor_solicitante: e.target.value }))}>
                {b.setores.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </Campo>
          ) : null}

          <div className="dm-dupla">
            <Campo rot="Evento relacionado" ajuda="Se tiver evento, a data dele é obrigatória.">
              <input maxLength={120} value={r.evento} onChange={e => setR(v => ({ ...v, evento: e.target.value }))} />
            </Campo>
            <Campo rot="Data do evento">
              <input type="date" value={r.evento_data}
                onChange={e => setR(v => ({ ...v, evento_data: e.target.value }))} />
            </Campo>
            <Campo rot="Onde vai acontecer">
              <input maxLength={200} value={r.local} onChange={e => setR(v => ({ ...v, local: e.target.value }))} />
            </Campo>
            <Campo rot="Público ou ministério envolvido">
              <input maxLength={200} value={r.publico} onChange={e => setR(v => ({ ...v, publico: e.target.value }))} />
            </Campo>
          </div>

          <Campo rot="Objetivo" ajuda="O para quê, quando não é óbvio pela descrição.">
            <input maxLength={4000} value={r.objetivo} onChange={e => setR(v => ({ ...v, objetivo: e.target.value }))} />
          </Campo>

          {cat?.exige_orcamento ? (
            <Campo rot="Orçamento estimado (R$)"
              ajuda="Quando dá para estimar. Sem número, a aprovação trava esperando.">
              <input inputMode="decimal" value={r.orcamento}
                onChange={e => setR(v => ({ ...v, orcamento: e.target.value.replace(',', '.') }))} />
            </Campo>
          ) : null}

          <Campo rot="Anexos"
            ajuda="Cole o link do arquivo (Drive, Fotos, o que for). Guardar arquivo aqui fica para depois; link resolve hoje.">
            <div className="dm-linha">
              <input className="dm-cresce" value={anexoUrl} placeholder="https://…"
                onChange={e => setAnexoUrl(e.target.value)}
                style={{ minHeight: 46, padding: '10px 12px', border: '1px solid var(--dm-linha2)', borderRadius: 'var(--dm-r)', background: 'var(--dm-card3)' }} />
              <button className="dm-btn" disabled={!anexoUrl.trim()} onClick={() => {
                setAnexos(a => [...a, { nome: nomeDoLink(anexoUrl), url: anexoUrl.trim() }]);
                setAnexoUrl('');
              }}>Juntar</button>
            </div>
          </Campo>
          {anexos.length ? (
            <ul className="dm-peq" style={{ margin: 0, paddingLeft: 18 }}>
              {anexos.map((a, i) => (
                <li key={i}>
                  {a.nome}{' '}
                  {/* `dm-mini` (36px) e não um `minHeight: 26` em linha:
                      estilo em linha vencia o piso de 44px da folha e deixava
                      o alvo em 26px, num gesto de CORREÇÃO — o pior lugar
                      para errar o toque. 20/09/2026, auditoria de tela. */}
                  <button className="dm-btn dm-mini"
                    onClick={() => setAnexos(x => x.filter((_, j) => j !== i))}>tirar</button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {tentou && falta.length ? (
        <Aviso tom="warn">
          <div>
            Falta {falta.length === 1 ? '' : 'preencher'}: {falta.join('; ')}.
          </div>
        </Aviso>
      ) : null}

      <button className="dm-btn dm-pri dm-larga" disabled={indo} onClick={enviar}>
        {indo ? 'Enviando…' : 'Enviar a demanda'}
      </button>
      {r.prazo ? (
        <p className="dm-peq dm-mudo dm-centro" style={{ marginTop: 'var(--dm-e2)' }}>
          Pedindo para {dataCheia(r.prazo)}{setorDaCat ? `, para ${setorDaCat}` : ''}.
        </p>
      ) : null}
    </>
  );
}

function nomeDoLink(u: string): string {
  try {
    const p = new URL(u.trim());
    const fim = p.pathname.split('/').filter(Boolean).pop();
    return decodeURIComponent(fim || p.hostname);
  } catch { return 'anexo'; }
}
