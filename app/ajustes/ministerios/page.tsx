'use client';
import Shell, { useApp } from '@/components/Shell';
import Link from 'next/link';
import { useState } from 'react';
import { atualizarEquipe, criarEquipe, removerEquipe } from '@/lib/equipes';
import { aviseHumano } from '@/lib/erros';
import { Cab, Aviso, Secao, Pilula } from '@/components/escalas/Pecas';
import { IcSeta } from '@/components/Icones';
import { confirmar } from '@/lib/confirmar';
import { cont } from '@/lib/plural';

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
  const [aberto, setAberto] = useState<string | null>(null);

  async function renomear(id: string, atual: string, valor: string) {
    const v = valor.trim();
    if (!v || v === atual) return;
    try { await atualizarEquipe(id, { nome: v }); await recarregarEquipes(); aviso('Salvo'); }
    catch (e) { aviso(aviseHumano(e, 'salvar')); }
  }

  async function apagar(id: string, nome: string) {
    if (!await confirmar({
      titulo: `Apagar o ministério ${nome}?`,
      texto: 'Todo o time, as funções e as escalas dele somem junto.',
      acao: 'Apagar o ministério', perigo: true,
    })) return;
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
    <>
      <Cab rot="Ajustes" titulo="Ministérios da igreja"
        meta="Esta é a única página que alcança os outros ministérios. Cada um tem time, funções e escala próprios, e a escala automática do dia 26 monta todos." />

      <div className="es-aj-coluna">
        {/* O AVISO VEM ANTES DA LISTA. Depois dela seria post-mortem. */}
        <Aviso tom="warn">
          Apagar um ministério leva junto <b>o time, as funções e todas as escalas</b> dele,
          e não dá para desfazer. Para só parar de usar um, tire as funções dele em Ajustes. Os
          dados continuam lá.
        </Aviso>

        <Secao titulo={cont(equipes.length, 'ministério', 'ministérios')}>
          {/* MESMA LINHA DO /ajustes E DO /time: fechada diz o nome e o estado;
              aberta mostra renomear e apagar. "Abrir" (trocar de ministério) é a
              ação que a pessoa mais usa aqui e fica visível na linha fechada; o
              "apagar" de um ministério inteiro — que leva time, funções e
              escalas — deixa de ser um link permanente a 80px do dedo.

              08/09: não é <details>. Botão dentro de <summary> é interativo
              aninhado em interativo (o axe acusou, e leitor de tela anuncia os
              dois como um só). Quem abre e fecha é o botão "Editar"
              (aria-expanded); "Abrir" é irmão dele na mesma linha, não filho. */}
          <div className="es-fila">
            {equipes.map(e => {
              const estaAberto = aberto === e.id;
              return (
                <div className={estaAberto ? 'es-aj-min es-aj-aberta' : 'es-aj-min'} key={e.id}>
                  <div className="es-item es-so-tit">
                    <span className="es-c-tit"><b>{e.nome}</b></span>
                    <span className="es-c-acao">
                      {e.id === equipe?.id
                        ? <Pilula>aberto agora</Pilula>
                        : <button type="button" className="es-btn es-peq" onClick={() => trocarEquipe(e.id)}>Abrir</button>}
                      <button type="button" className="es-btn es-txt es-peq" aria-expanded={estaAberto} aria-controls={`min-${e.id}`}
                        aria-label={`Editar ${e.nome}`}
                        onClick={() => setAberto(a => (a === e.id ? null : e.id))}>
                        Editar<IcSeta />
                      </button>
                    </span>
                  </div>
                  {estaAberto && (
                    <div className="es-aj-min-corpo" id={`min-${e.id}`}>
                      <label className="es-campo">
                        <span>Nome</span>
                        <input className="es-ctl" enterKeyHint="done" key={e.nome} defaultValue={e.nome}
                          aria-label={`nome do ministério ${e.nome}`}
                          onBlur={ev => void renomear(e.id, e.nome, ev.target.value)} />
                        <small>O nome salva ao sair do campo.</small>
                      </label>
                      <div className="es-linha es-aj-acoes">
                        <button className="es-btn es-txt es-peq es-perigo" aria-label={`apagar ${e.nome}`}
                          disabled={equipes.length < 2}
                          onClick={() => void apagar(e.id, e.nome)}>Apagar este ministério</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Secao>

        <section className="es-caixa">
          <div className="es-caixa-cab"><h3>Abrir um novo</h3></div>
          <div className="es-caixa-corpo es-aj-pilha">
            <p className="es-prosa">
              O ministério nasce vazio: depois dele vêm as funções e o time, nessa ordem.
            </p>
            <label className="es-campo">
              <span>Nome do novo ministério</span>
              <input className="es-ctl" enterKeyHint="done" value={nova} onChange={e => setNova(e.target.value)}
                aria-label="nome do novo ministério"
                placeholder="ex: Louvor" />
            </label>
          </div>
          <div className="es-caixa-pe">
            <button className="es-btn es-pri" disabled={gravando || !nova.trim()} onClick={() => void criar()}>Criar ministério</button>
          </div>
        </section>

        <Link href="/ajustes" className="es-btn es-txt es-aj-volta"><IcSeta dir="e" />Voltar aos ajustes de {equipe?.nome}</Link>
      </div>
    </>
  );
}
