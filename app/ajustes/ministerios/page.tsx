'use client';
import Shell, { useApp } from '@/components/Shell';
import Link from 'next/link';
import { useState } from 'react';
import { atualizarEquipe, criarEquipe, removerEquipe } from '@/lib/equipes';
import { aviseHumano } from '@/lib/erros';
import { Aviso } from '@/components/Ui';

/* =============================================================================
   /ajustes/ministerios — O QUE VALE PARA A CASA INTEIRA

   ESTA PÁGINA NASCEU DE UMA CONTRADIÇÃO MEDIDA — arquitetura de informação,
   29/08/2026.

   O topo de /ajustes promete, em voz alta:

       "Tudo nesta página vale só para este ministério.
        Os outros seguem com os ajustes deles."

   E 4.300px abaixo dessa frase morava a seção "Ministérios", que renomeia,
   cria, abre e APAGA qualquer ministério da igreja — com todo o time, as
   funções e as escalas dele junto, sem desfazer. O controle mais destrutivo do
   produto inteiro vivia dentro da única página que garante não sair do próprio
   ministério.

   Não é questão de organização: a página mentia. Quem lê o cabeçalho e rola
   até o fim está autorizado a achar que nada ali alcança os outros — e a rolar
   com a confiança de quem não precisa ler o botão.

   Então o escopo virou endereço. /ajustes é do ministério aberto e agora só
   fala dele; o que alcança a casa inteira mora aqui, atrás de um clique, com o
   aviso onde ele é lido: antes da lista, não depois do estrago.
   ============================================================================= */

export default function Pagina() { return <Shell><Ministerios /></Shell>; }

function Ministerios() {
  const { aviso, equipe, equipes, recarregarEquipes, trocarEquipe } = useApp();
  const [nova, setNova] = useState('');
  const [gravando, setGravando] = useState(false);

  async function renomear(id: string, atual: string, valor: string) {
    const v = valor.trim();
    if (!v || v === atual) return;
    try { await atualizarEquipe(id, { nome: v }); await recarregarEquipes(); aviso('Salvo'); }
    catch (e) { aviso(aviseHumano(e, 'salvar')); }
  }

  async function apagar(id: string, nome: string) {
    if (!confirm(`Apagar o ministério ${nome}? Todo o time, funções e escalas dele somem. Não dá para desfazer.`)) return;
    try {
      await removerEquipe(id);
      const lista = await recarregarEquipes();
      if (id === equipe?.id) {
        if (lista[0]) trocarEquipe(lista[0].id, lista);
        else { try { localStorage.removeItem('escala.equipe'); } catch {} location.reload(); return; }
      }
      aviso('Apagado');
    } catch (e) { aviso(aviseHumano(e)); }
  }

  async function criar() {
    setGravando(true);
    try {
      const eq = await criarEquipe(nova.trim());
      setNova('');
      const l = await recarregarEquipes();
      trocarEquipe(eq.id, l);
      aviso('Ministério criado');
    } catch (e) { aviso(aviseHumano(e)); }
    setGravando(false);
  }

  return (
    <div className="lid">
      <div className="lid-faixa">
        <div className="lid-faixa-in"><div className="lid-faixa-txt">
          <span className="rot">Ministérios</span>
          <h1>A casa inteira</h1>
          <p className="lid-faixa-sub">
            Esta é a única página que alcança os outros ministérios. Cada um tem time,
            funções e escala próprios, e a escala automática do dia 26 monta todos.
          </p>
        </div>
        <div className="lid-placar">
          <b>{equipes.length}</b>
          <span>{equipes.length === 1 ? 'ministério' : 'ministérios'}</span>
        </div>
        </div>
      </div>

      {/* O AVISO VEM ANTES DA LISTA. Depois dela seria post-mortem. */}
      <div style={{ marginTop: 'var(--e5)' }}>
        <Aviso tom="atencao">
          Apagar um ministério leva junto <strong>o time, as funções e todas as escalas</strong> dele,
          e não dá para desfazer. Para só parar de usar um, tire as funções dele em Ajustes — os
          dados continuam lá.
        </Aviso>
      </div>

      <section className="lid-secao">
        <div className="lid-secao-cab">
          <span className="rot">Os ministérios da igreja</span>
          <span className="lid-secao-nota">O nome salva ao sair do campo</span>
        </div>
        <div className="ajt-lista">
          {equipes.map(e => (
            <div className="ajt-item" key={e.id}>
              <input enterKeyHint="done" className="ajt-nome" key={e.nome} defaultValue={e.nome}
                aria-label={`nome do ministério ${e.nome}`}
                onBlur={ev => void renomear(e.id, e.nome, ev.target.value)} />
              <span className="ajt-sub">{e.id === equipe?.id ? 'aberto agora' : ''}</span>
              <div className="ajt-acoes">
                {e.id !== equipe?.id &&
                  <button className="lid-bt-txt" onClick={() => trocarEquipe(e.id)}>abrir</button>}
                <button className="lid-bt-txt perigo" aria-label={`apagar ${e.nome}`}
                  disabled={equipes.length < 2}
                  onClick={() => void apagar(e.id, e.nome)}>apagar</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="lid-secao">
        <div className="lid-secao-cab"><span className="rot">Abrir um novo</span></div>
        <p className="dim pequeno" style={{ marginTop: -4 }}>
          O ministério nasce vazio: depois dele vêm as funções e o time, nessa ordem.
        </p>
        <div className="linha" style={{ marginTop: 12 }}>
          <input enterKeyHint="done" value={nova} onChange={e => setNova(e.target.value)}
            aria-label="nome do novo ministério"
            placeholder="novo ministério (ex: Louvor)" style={{ maxWidth: 260 }} />
          <button disabled={gravando || !nova.trim()} onClick={() => void criar()}>Criar ministério</button>
        </div>
      </section>

      <p className="lid-pe">
        <Link href="/ajustes">‹ Voltar aos ajustes de {equipe?.nome}</Link>
      </p>
    </div>
  );
}
