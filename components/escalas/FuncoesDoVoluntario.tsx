'use client';
/* =============================================================================
   ACRESCENTAR FUNÇÃO PELO PRÓPRIO LINK — 103, 01/10/2026

   O ServoApp deixa o voluntário acrescentar função ao próprio perfil; aqui
   ela entra do jeito que o cadastro já entra: com o nível que a pessoa diz,
   NÃO conferida, e a pessoa volta para "Esperando sua conferência" na tela
   do líder. Até o líder conferir, "faço sozinho" vale como "ajudo quando
   falta" no sorteio, e "estou aprendendo" não entra sozinho. Isso está dito
   na tela, para ninguém achar que já é titular.

   Tirar só o que a própria pessoa declarou e ninguém conferiu: o conferido
   é decisão da liderança, e só ela desfaz.
   ============================================================================= */
import { useEffect, useState } from 'react';
import { sbPublico as sb } from '@/lib/supabase';
import { aviseHumano } from '@/lib/erros';
import {
  type FuncaoDaArea, type Nivel,
  NIVEL_EU, NIVEL_EU_EXPLICA, NIVEL_EM_PALAVRAS, erroAoAcrescentar, erroAoRetirar,
} from '@/lib/trocas';

const NIVEIS: Nivel[] = ['titular', 'reserva', 'treino'];

export default function FuncoesDoVoluntario({ token, responsavel, aoMudar, avisar, errar }: {
  token: string; responsavel: string | null;
  aoMudar: () => Promise<void> | void;
  avisar: (msg: string) => void; errar: (msg: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [funcoes, setFuncoes] = useState<FuncaoDaArea[] | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [escolhida, setEscolhida] = useState('');
  const [nivel, setNivel] = useState<Nivel | ''>('');
  const [ocupado, setOcupado] = useState('');
  const lider = (responsavel || '').trim() || 'A liderança';

  async function carregar() {
    const { data, error } = await sb()!.rpc('eu_funcoes', { p_token: token });
    if (error) { setFalhou(true); return; }
    setFalhou(false);
    setFuncoes((data || []) as FuncaoDaArea[]);
  }
  useEffect(() => { if (aberto && funcoes === null) void carregar(); }, [aberto]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!aberto) return (
    <div className="vol-func-abrir">
      <button type="button" className="vol-acao" onClick={() => setAberto(true)}>Acrescentar função</button>
    </div>
  );

  const semNiveis = !!funcoes?.[0]?.sem_niveis;
  const livres = (funcoes || []).filter(f => f.pode_pedir);
  const aConferir = (funcoes || []).filter(f => f.nivel && f.confirmado === false);
  const soDeUmSexo = (funcoes || []).filter(f => !f.nivel && !f.pode_pedir && f.exige_sexo);
  const sel = livres.find(f => f.funcao_id === escolhida) || null;
  const nivelFinal: Nivel | '' = semNiveis ? 'titular' : nivel;

  async function acrescentar() {
    if (!sel || !nivelFinal) return;
    setOcupado('add');
    const { data, error } = await sb()!.rpc('eu_funcao_adicionar',
      { p_token: token, p_funcao_id: sel.funcao_id, p_nivel: nivelFinal });
    setOcupado('');
    if (error) { errar(aviseHumano(error, 'acrescentar')); return; }
    const r = data as any;
    if (!r?.ok) { errar(erroAoAcrescentar(r)); return; }
    /* curto: a barra de baixo é caixa alta. O que muda até a conferência
       está escrito no painel, logo acima do botão. */
    avisar(nivelFinal === 'treino'
      ? `${sel.nome} entrou como aprendendo, a conferir.`
      : `${sel.nome} entrou na sua lista, a conferir.`);
    setEscolhida(''); setNivel('');
    await carregar();
    await aoMudar();
  }

  async function tirar(f: FuncaoDaArea) {
    setOcupado(f.funcao_id);
    const { data, error } = await sb()!.rpc('eu_funcao_retirar', { p_token: token, p_funcao_id: f.funcao_id });
    setOcupado('');
    if (error) { errar(aviseHumano(error, 'tirar')); return; }
    const r = data as any;
    if (!r?.ok) { errar(erroAoRetirar(r)); return; }
    avisar(`${f.nome} saiu da sua lista.`);
    await carregar();
    await aoMudar();
  }

  return (
    <div className="vol-troca-painel vol-func" role="group" aria-label="Acrescentar função">
      <div className="vol-troca-fn">Acrescentar função</div>
      <p className="vol-troca-quem">
        {semNiveis
          ? `Marque a função que você já faz. ${lider} confere.`
          : `Escolha a função e o quanto você já faz. ${lider} confere; até lá, você só entra nela quando faltar alguém.`}
      </p>
      {falhou && <p className="vol-troca-motivo" role="status">Não consegui carregar as funções agora. Feche e abra de novo.</p>}
      {!falhou && funcoes === null && <p className="vol-troca-quem" role="status">Carregando as funções da sua área…</p>}
      {!!funcoes && !livres.length && (
        <p className="vol-troca-quem" role="status">Você já está em todas as funções que pode acrescentar na sua área.</p>
      )}

      {!!livres.length && (
        <div className="vol-func-lista">
          {livres.map(f => (
            <button type="button" key={f.funcao_id} className="vol-func-op" aria-pressed={escolhida === f.funcao_id}
              onClick={() => { setEscolhida(escolhida === f.funcao_id ? '' : f.funcao_id); setNivel(''); }}>
              <span className="vol-func-nome">{f.nome}</span>
              {f.descricao && <span className="vol-func-desc">{f.descricao}</span>}
            </button>
          ))}
        </div>
      )}

      {sel && !semNiveis && (
        <div className="vol-func-nivel" role="group" aria-label={`O quanto você faz ${sel.nome}`}>
          <div className="vol-troca-fn">O quanto você faz {sel.nome}</div>
          <div className="vol-func-niveis">
            {NIVEIS.map(n => (
              <button type="button" key={n} className={`vol-dia-bt ${nivel === n ? 'on' : ''}`} aria-pressed={nivel === n}
                onClick={() => setNivel(n)}>
                {NIVEL_EU[n]}
              </button>
            ))}
          </div>
          {nivel && <p className="vol-troca-quem">{NIVEL_EU[nivel]}: {NIVEL_EU_EXPLICA[nivel]}.</p>}
        </div>
      )}

      {sel && (
        <div className="vol-btns">
          <button className="vol-bt" disabled={!nivelFinal || ocupado === 'add'} onClick={acrescentar}>
            {ocupado === 'add' ? 'Acrescentando…' : sel.nome.length <= 16 ? `Acrescentar ${sel.nome}` : 'Acrescentar esta função'}
          </button>
        </div>
      )}

      {!!aConferir.length && (
        <div className="vol-func-conferir">
          <div className="vol-troca-fn">Esperando a liderança conferir</div>
          {aConferir.map(f => (
            <div className="vol-linha pend" key={f.funcao_id}>
              <span className="vol-marca" aria-hidden="true" />
              <span>
                <span className="vol-linha-dia">{f.nome}</span>
                <span className="vol-linha-fn">{semNiveis ? 'você disse que faz' : `você disse: ${NIVEL_EM_PALAVRAS[f.nivel as Nivel]}`}</span>
              </span>
              <button type="button" className="vol-acao" disabled={!!ocupado} onClick={() => tirar(f)}>Tirar</button>
            </div>
          ))}
        </div>
      )}

      {!!soDeUmSexo.length && (
        <p className="vol-nota">
          {soDeUmSexo.map(f => `${f.nome} é só para ${f.exige_sexo === 'M' ? 'homens' : 'mulheres'}`).join('. ')}.
        </p>
      )}

      <button type="button" className="vol-acao" onClick={() => { setAberto(false); setEscolhida(''); setNivel(''); }}>Fechar</button>
    </div>
  );
}
