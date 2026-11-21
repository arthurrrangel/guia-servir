'use client';
/* =============================================================================
   O PAINEL DA VIRADA 2027 · 21/11/2026 (migração 118)

   Na Administração das Demandas, como o do Follow Camp: a mesma porta (link
   pessoal ou e-mail) e a mesma pessoa única (96). /virada/reservas leva para
   cá. A ordem é a das perguntas de quem organiza:
     1. quantas pessoas vão e quantos lugares restam (os números);
     2. quem reservou, com o telefone e a planilha para a porta;
     3. lançar a reserva que chegou fora do site (WhatsApp, telefone, porta),
        que conta nas vagas como as do site.
   Cancelar não apaga: a reserva fica marcada e o lugar volta para a conta.
   ============================================================================= */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Aviso, Cabecalho, Campo, Esqueleto, Kpi, Kpis, Secao, Vazio, useEstreito } from '@/components/demandas/Ui';
import { lerReservas, lancarReserva, cancelarReserva, type DadosDaVirada } from '@/lib/virada-painel-api';
import { csvDasReservas, dataHoraBr, nomeDoArquivo, resumoDe, type ReservaBanco } from '@/lib/virada-painel';
import { MAX_POR_RESERVA, VIRADA, mascaraCpf, mascaraTelefone, telefoneDe } from '@/lib/virada';
import { cpfValido, soDigitos } from '@/lib/followcamp';
import s from './painel.module.css';

function recado(r: { ok: boolean; erro?: string; restantes?: number }): string {
  if (r.ok) return '';
  switch (r.erro) {
    case 'SEM_SISTEMA': return 'O painel ainda não está ligado: falta rodar a migração 118 no Supabase.';
    case 'SO_ADMIN': return 'Só a administração abre o painel da Virada.';
    case 'SEM_ACESSO': return 'Sua sessão saiu. Entre de novo pelo portal.';
    case 'ESGOTADO': return typeof r.restantes === 'number' && r.restantes > 0 ? `Não cabe: restam ${r.restantes} lugares.` : 'Não cabe: as vagas acabaram.';
    case 'PESSOAS': return `Escolha de 1 a ${MAX_POR_RESERVA} pessoas.`;
    case 'SEM_NOME': return 'Escreva o nome de quem reservou.';
    case 'CPF_INVALIDO': return 'Confira o CPF.';
    case 'TELEFONE_INVALIDO': return 'Confira o telefone: DDD e número.';
    case 'CPF_REPETIDO': return 'Esse CPF já tem outra reserva ativa.';
    case 'RESERVA_INEXISTENTE': return 'Essa reserva não existe mais. Atualize o painel.';
    default: return 'Não deu certo agora. Tente de novo.';
  }
}

function baixar(nome: string, conteudo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const zap = (tel: string | null) => (tel && tel.length === 11 ? `https://wa.me/55${tel}` : null);
const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const vinculoDe = (v: string | null) => (v === 'membro' ? 'Membro' : v === 'visitante' ? 'Visitante' : '');
const origemDe = (r: ReservaBanco) => (r.origem === 'site' ? 'pelo site' : `lançada${r.lancada_por ? ` por ${r.lancada_por}` : ''}`);
const pessoasDe = (n: number) => (n === 1 ? '1 pessoa' : `${n} pessoas`);

/* o telefone abre o WhatsApp da pessoa quando é celular */
function Fone({ tel }: { tel: string | null }) {
  if (!tel) return <span className={s.mudo}>sem telefone</span>;
  const z = zap(tel);
  return z ? <a href={z} target="_blank" rel="noreferrer">{mascaraTelefone(tel)}</a> : <>{mascaraTelefone(tel)}</>;
}

export default function Painel() {
  const [dados, setDados] = useState<DadosDaVirada | null>(null);
  const [erro, setErro] = useState('');
  const [feito, setFeito] = useState('');
  const [indo, setIndo] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [f, setF] = useState({ nome: '', telefone: '', cpf: '', vinculo: '', pessoas: '1' });
  const [falta, setFalta] = useState<Record<string, string>>({});
  /* no celular, cartões em vez da tabela (como o painel do Follow Camp): seis
     colunas em 390 px espremiam o nome e partiam o e-mail letra por letra */
  const estreito = useEstreito(760);

  const ler = useCallback(async () => {
    const r = await lerReservas();
    if (!r.ok) { setErro(recado(r)); return; }
    setErro(''); setDados({ eu: r.eu, agora: r.agora, evento: r.evento, reservas: r.reservas || [] });
  }, []);
  useEffect(() => { void ler(); }, [ler]);

  const capacidade = dados?.evento?.capacidade ?? VIRADA.capacidade;
  const resumo = useMemo(() => resumoDe(dados?.reservas || [], capacidade), [dados, capacidade]);
  const lista = useMemo(() => {
    const q = semAcento(busca.trim());
    const qd = soDigitos(busca);
    return [...(dados?.reservas || [])]
      .filter(r => !q || semAcento(r.nome).includes(q) || (qd.length >= 3 && ((r.telefone || '').includes(qd) || (r.cpf || '').includes(qd))))
      .sort((a, b) => (a.cancelada_em ? 1 : 0) - (b.cancelada_em ? 1 : 0) || b.criada_em.localeCompare(a.criada_em));
  }, [dados, busca]);

  async function alternar(r: ReservaBanco) {
    const cancelar = !r.cancelada_em;
    if (cancelar && !window.confirm(`Cancelar a reserva de ${r.nome} (${r.pessoas === 1 ? '1 pessoa' : `${r.pessoas} pessoas`})? O lugar volta para a conta.`)) return;
    setIndo(r.id); setFeito('');
    const res = await cancelarReserva(r.id, cancelar, cancelar ? 'cancelada no painel' : undefined);
    setIndo(null);
    if (!res.ok) { setErro(recado(res)); return; }
    setFeito(cancelar ? `Reserva de ${r.nome} cancelada.` : `Reserva de ${r.nome} de volta.`);
    await ler();
  }

  async function lancar(e: React.FormEvent) {
    e.preventDefault();
    const falta: Record<string, string> = {};
    if (f.nome.trim().length < 3) falta.nome = 'Escreva o nome.';
    if (soDigitos(f.telefone) && !telefoneDe(f.telefone)) falta.telefone = 'Confira o telefone: DDD e número.';
    if (soDigitos(f.cpf) && !cpfValido(f.cpf)) falta.cpf = 'Confira o CPF.';
    setFalta(falta);
    if (Object.keys(falta).length) return;
    setIndo('lancar'); setFeito('');
    const res = await lancarReserva({
      nome: f.nome.trim(), telefone: telefoneDe(f.telefone) || '', cpf: soDigitos(f.cpf),
      vinculo: f.vinculo || null, pessoas: Number(f.pessoas),
    });
    setIndo(null);
    if (!res.ok) { setErro(recado(res as { ok: false; erro?: string; restantes?: number })); return; }
    setErro('');
    setFeito(res.repetida ? `Esse CPF já tinha reserva (${f.nome.trim()}): nada foi duplicado.` : `Reserva de ${f.nome.trim()} lançada.`);
    setF({ nome: '', telefone: '', cpf: '', vinculo: '', pessoas: '1' });
    await ler();
  }

  return (
    <div className={s.painel}>
      <Cabecalho sobre="Reservas" titulo={VIRADA.nome}
        meta={<span>31 de dezembro, {VIRADA.chegada} · {VIRADA.local}, {VIRADA.bairro}</span>}
        acoes={dados ? <button type="button" className="dm-btn dm-peq" onClick={() => baixar(nomeDoArquivo(), csvDasReservas(dados.reservas))}>Baixar planilha</button> : null} />

      {erro && <Aviso tom="bad">{erro}</Aviso>}
      {feito && <Aviso tom="ok">{feito}</Aviso>}

      {!dados ? (erro ? null : <Esqueleto linhas={6} oQue="Carregando as reservas" />) : (
        <>
          <Kpis rot="A noite em números" colunas={4}>
            <Kpi rot="Pessoas" valor={resumo.pessoas} sub={`de ${capacidade} lugares`} destaque />
            <Kpi rot="Restam" valor={resumo.restantes} tom={resumo.restantes === 0 ? 'bad' : undefined} sub={resumo.restantes === 0 ? 'esgotado' : 'lugares'} />
            <Kpi rot="Reservas" valor={resumo.reservas} sub={resumo.canceladas ? `${resumo.canceladas} cancelada${resumo.canceladas === 1 ? '' : 's'}` : 'famílias e pessoas'} />
            <Kpi rot="Visitantes" valor={resumo.visitantes} sub={`${resumo.membros} membros${resumo.semVinculo ? ` · ${resumo.semVinculo} sem dizer` : ''}`} />
          </Kpis>

          <Secao titulo="Quem reservou" n={resumo.reservas}
            acoes={<input className={s.busca} type="search" value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Nome, telefone ou CPF" aria-label="Buscar nas reservas" />}>
            {!lista.length ? (
              <Vazio titulo={busca ? 'Nada com essa busca' : 'Ninguém reservou ainda'} tom={busca ? 'filtro' : undefined} />
            ) : estreito ? (
              <ul className={s.cartoes}>
                {lista.map(r => (
                  <li key={r.id} className={s.cartao} data-reserva="" data-cancelada={r.cancelada_em ? '' : undefined}>
                    <div className={s.cartaoTopo}>
                      <span className={s.nome}>{r.nome}</span>
                      <span className={s.pessoas}>{pessoasDe(r.pessoas)}</span>
                    </div>
                    <div className={s.cartaoValores}>
                      <Fone tel={r.telefone} />
                      <span className={s.cpf}>{r.cpf ? mascaraCpf(r.cpf) : <span className={s.mudo}>sem CPF</span>}</span>
                    </div>
                    <small className={s.sub}>
                      {[vinculoDe(r.vinculo), r.email || '', `${dataHoraBr(r.criada_em)}, ${origemDe(r)}`,
                        r.cancelada_em ? `cancelada em ${dataHoraBr(r.cancelada_em)}` : ''].filter(Boolean).join(' · ')}
                    </small>
                    <div className={s.cartaoFim}>
                      <button type="button" className={`dm-btn dm-txt dm-peq${r.cancelada_em ? '' : ' dm-perigo'}`} disabled={indo === r.id}
                        onClick={() => alternar(r)}>{r.cancelada_em ? 'Desfazer' : 'Cancelar'}</button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="dm-tabela">
                <table className={`dm-tab ${s.tab}`}>
                  <thead>
                    <tr><th>Nome</th><th className={s.num}>Pessoas</th><th>Telefone</th><th>CPF</th><th>Reservou</th><th className="dm-fim"><span className="dm-so-leitor">Ações</span></th></tr>
                  </thead>
                  <tbody>
                    {lista.map(r => (
                      <tr key={r.id} data-reserva="" data-cancelada={r.cancelada_em ? '' : undefined}>
                        <td>
                          <span className={s.nome}>{r.nome}</span>
                          <small className={s.sub}>
                            {[vinculoDe(r.vinculo), r.email || '',
                              r.cancelada_em ? `cancelada em ${dataHoraBr(r.cancelada_em)}` : ''].filter(Boolean).join(' · ')}
                          </small>
                        </td>
                        <td className={s.num}>{r.pessoas}</td>
                        <td><Fone tel={r.telefone} /></td>
                        <td className={s.cpf}>{r.cpf ? mascaraCpf(r.cpf) : <span className={s.mudo}>sem CPF</span>}</td>
                        <td>{dataHoraBr(r.criada_em)}<small className={s.sub}>{origemDe(r)}</small></td>
                        <td className="dm-fim">
                          <button type="button" className={`dm-btn dm-txt dm-peq${r.cancelada_em ? '' : ' dm-perigo'}`} disabled={indo === r.id}
                            onClick={() => alternar(r)}>{r.cancelada_em ? 'Desfazer' : 'Cancelar'}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Secao>

          <Secao titulo="Lançar reserva" sub="A que chegou pelo WhatsApp, por telefone ou na porta. Conta nas vagas como as do site.">
            <form className={s.lancar} onSubmit={lancar} noValidate>
              <Campo rot="Nome" falta={falta.nome}>
                <input type="text" value={f.nome} maxLength={80} onChange={e => setF(x => ({ ...x, nome: e.target.value }))} />
              </Campo>
              <Campo rot="Telefone" falta={falta.telefone} classe="dm-curto">
                <input type="tel" inputMode="tel" value={f.telefone} placeholder="(21) 99999-9999"
                  onChange={e => setF(x => ({ ...x, telefone: mascaraTelefone(e.target.value) }))} />
              </Campo>
              <Campo rot="CPF (se tiver)" falta={falta.cpf} classe="dm-curto">
                <input type="text" inputMode="numeric" value={f.cpf} placeholder="000.000.000-00"
                  onChange={e => setF(x => ({ ...x, cpf: mascaraCpf(e.target.value) }))} />
              </Campo>
              <Campo rot="Membro ou visitante" classe="dm-curto">
                <select value={f.vinculo} onChange={e => setF(x => ({ ...x, vinculo: e.target.value }))}>
                  <option value="">Não disse</option>
                  <option value="membro">Membro</option>
                  <option value="visitante">Visitante</option>
                </select>
              </Campo>
              <Campo rot="Pessoas" classe="dm-numero">
                <select value={f.pessoas} onChange={e => setF(x => ({ ...x, pessoas: e.target.value }))}>
                  {Array.from({ length: MAX_POR_RESERVA }, (_, k) => k + 1).map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </Campo>
              <div className={s.fimLancar}>
                <button type="submit" className="dm-btn dm-pri" disabled={indo === 'lancar'}>{indo === 'lancar' ? 'Lançando…' : 'Lançar reserva'}</button>
              </div>
            </form>
          </Secao>
        </>
      )}
    </div>
  );
}
