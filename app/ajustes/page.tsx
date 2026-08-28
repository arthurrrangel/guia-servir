'use client';
import Shell, { useApp, copiar } from '@/components/Shell';
import { Escolha } from '@/components/Ui';
import { useEffect, useRef, useState } from 'react';
import {
  addLider, listarLideres, removerFuncao, removerLider, salvarConfig, salvarFuncoes,
  souOrganizadorGeral, type LinhaLider,
} from '@/lib/db';
import { atualizarEquipe, criarEquipe, removerEquipe } from '@/lib/equipes';
import { funcoesAtivas } from '@/lib/engine';

export default function Pagina() { return <Shell><Ajustes /></Shell>; }

function Ajustes() {
  const { S, recarregar, aviso, base, equipe, equipes, recarregarEquipes, trocarEquipe } = useApp();
  const [novaEquipe, setNovaEquipe] = useState('');
  const [nova, setNova] = useState('');
  const [lideres, setLideres] = useState<LinhaLider[]>([]);
  const [novoLider, setNovoLider] = useState('');
  /* null = "todos os ministérios" */
  const [equipeDoLider, setEquipeDoLider] = useState<string>('');
  const [geral, setGeral] = useState(false);
  const [gravando, setGravando] = useState(false);
  useEffect(() => { listarLideres().then(setLideres).catch(() => {}); }, []);
  useEffect(() => { souOrganizadorGeral().then(setGeral).catch(() => {}); }, []);
  async function recarregarLideres() { try { setLideres(await listarLideres()); } catch {} }

  /* duas edições em sequência não podem se atropelar: o ref acumula
     as mudanças já pedidas, mesmo antes do recarregar voltar */
  const cfgRef = useRef({ ...S.config });
  useEffect(() => { cfgRef.current = { ...S.config }; }, [S.config]);
  async function cfg(chave: string, valor: any) {
    cfgRef.current = { ...cfgRef.current, [chave]: valor };
    try { await salvarConfig(equipe!.id, cfgRef.current); await recarregar(); aviso('Salvo'); }
    catch (e: any) { aviso('Não salvou: ' + e.message); await recarregar(); }
  }
  async function fn(id: string, campos: any) {
    const f = S.funcoes.find(x => x.id === id)!;
    try { await salvarFuncoes(equipe!.id, [{ ...f, ...campos }]); await recarregar(); }
    catch (e: any) { aviso('erro: ' + e.message); }
  }
  async function addFn() {
    const nome = nova.trim().toUpperCase();
    if (!nome || gravando) return;
    if (S.funcoes.some(f => f.nome.toUpperCase() === nome)) { aviso('Já existe uma função com esse nome'); return; }
    setGravando(true);
    try {
      await salvarFuncoes(equipe!.id, [{ nome, simultanea: true, ordem: S.funcoes.length + 1, ativa: true }]);
      setNova(''); await recarregar(); aviso('Função criada');
    } catch (e: any) { aviso('Não salvou: ' + e.message); }
    setGravando(false);
  }
  async function delFn(id: string, nome: string) {
    if (!confirm(`Apagar ${nome}? Some das escalas antigas também.`)) return;
    try { await removerFuncao(id); await recarregar(); aviso('Apagada'); }
    catch (e: any) { aviso('erro: ' + e.message); }
  }

  const linkGrupo = equipe ? `${base}/equipe/${equipe.slug}` : '';
  const kit = equipe
    ? `📌 *ESCALA, ${equipe.nome.toUpperCase()}*\n`
    + `_Comece por aqui. Leva 1 minuto e é uma vez só._\n\n`
    + `👉 ${linkGrupo}\n\n`
    + `*PASSO A PASSO*\n`
    + `1️⃣ Abra o link acima\n`
    + `2️⃣ Toque no seu nome na lista\n`
    + `3️⃣ Digite os 4 últimos números do seu WhatsApp\n`
    + `4️⃣ Salve a página nos favoritos do celular\n\n`
    + `*DEPOIS, É SÓ ISSO*\n`
    + `✅ *Foi escalado?* Toque em "Confirmo" ou em "Não posso"\n`
    + `📅 *Antes da escala do mês?* Marque os domingos em que você já sabe que não vai dar\n\n`
    + `_Não achou seu nome na lista? Me chama no privado que eu te cadastro._`
    : '';

  /* AJUSTES FALAVA OUTRA LÍNGUA. Sete cartões cinza empilhados, h1 em Inter
     pesada, fundo cinza — enquanto /painel e /escala já eram faixa preta,
     Raleway leve e seção separada por fio. Era a mesma marca em dois produtos.
     Aqui a tela passa para a língua do resto: nada mudou de função. */
  return (
    <div className="lid">
      <div className="lid-faixa">
        <div className="lid-faixa-in"><div className="lid-faixa-txt">
          <span className="rot">Ajustes</span>
          <h1>{equipe?.nome}</h1>
          <p className="lid-faixa-sub">Tudo nesta página vale só para este ministério. Os outros seguem com os ajustes deles.</p>
        </div></div>
      </div>

      <section className="lid-secao" id="grupo">
        <div className="lid-secao-cab">
          <span className="rot">O grupo no WhatsApp</span>
          <span className="lid-secao-nota">Cole uma vez e fixe</span>
        </div>
        <p className="dim pequeno" style={{ marginTop: -4 }}>
          <strong>O que fazer:</strong> copie a mensagem abaixo, cole no grupo do ministério e
          <strong> fixe</strong> ela lá. A partir daí cada pessoa entra sozinha pelo link, acha o próprio
          nome e confirma, você não manda link no privado de ninguém.
        </p>
        <label>Link de convite do grupo (opcional, só para você guardar)</label>
        <input key={equipe?.whatsapp_grupo || ''} defaultValue={equipe?.whatsapp_grupo || ''}
          placeholder="https://chat.whatsapp.com/..."
          onBlur={async e => {
            const v = e.target.value.trim();
            if (v !== (equipe?.whatsapp_grupo || '')) {
              try { await atualizarEquipe(equipe!.id, { whatsapp_grupo: v || null }); await recarregarEquipes(); aviso('Salvo'); }
              catch (err: any) { aviso('Não salvou: ' + err.message); }
            }
          }} />
        <div style={{ height: 14 }} />
        <label>Mensagem para fixar no grupo (prévia)</label>
        <div className="msg-preview">{kit}</div>
        <div className="linha" style={{ marginTop: 10 }}>
          <button className="pri" onClick={() => copiar(kit, aviso, 'Copiado. Cole e fixe no grupo da equipe.')}>Copiar mensagem do grupo</button>
          <a className="btn" href={linkGrupo} target="_blank" rel="noopener">abrir a página da equipe</a>
        </div>
      </section>

      <section className="lid-secao">
        <div className="lid-secao-cab">
          <span className="rot">Regras do rodízio</span>
          <span className="lid-secao-nota">Valem para o sorteio automático</span>
        </div>
        <div className="grade">
          <div>
            <label>Máximo de escalas por pessoa por mês</label>
            <select key={S.config.limitePadrao} aria-label="Máximo de escalas por pessoa por mês" defaultValue={S.config.limitePadrao} onChange={e => cfg('limitePadrao', +e.target.value)}>
              {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} por mês</option>)}
            </select>
          </div>
          <div>
            <label>Plantonistas por domingo</label>
            <select key={S.config.plantaoQtd} aria-label="Plantonistas por domingo" defaultValue={S.config.plantaoQtd} onChange={e => cfg('plantaoQtd', +e.target.value)}>
              {[0, 1, 2, 3].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label>Prazo para confirmar</label>
            <input key={S.config.prazoConfirmacao} aria-label="Prazo para confirmar" defaultValue={S.config.prazoConfirmacao} onBlur={e => cfg('prazoConfirmacao', e.target.value)} />
          </div>
          <div>
            <label>Equilibrar a carga olhando</label>
            <select key={S.config.janelaCarga} aria-label="Equilibrar a carga olhando" defaultValue={S.config.janelaCarga} onChange={e => cfg('janelaCarga', +e.target.value)}>
              {[30, 60, 90, 120, 180].map(n => <option key={n} value={n}>últimos {n} dias</option>)}
            </select>
          </div>
        </div>
      </section>

      <section className="lid-secao">
        <div className="lid-secao-cab">
          <span className="rot">Texto do aviso mensal</span>
        </div>
        <label>Como você começa o aviso</label>
        <input key={S.config.saudacao} aria-label="Como você começa o aviso" defaultValue={S.config.saudacao} onBlur={e => cfg('saudacao', e.target.value)} />
        <div style={{ height: 14 }} />
        <label>Como você termina ({'{PRAZO}'} vira o prazo acima)</label>
        <textarea key={S.config.rodape} aria-label="Como você termina o aviso" defaultValue={S.config.rodape} rows={3} onBlur={e => cfg('rodape', e.target.value)} />
      </section>

      <section className="lid-secao">
        <div className="lid-secao-cab">
          <span className="rot">Funções</span>
        </div>
        <p className="dim pequeno" style={{ marginTop: -4 }}>
          <strong>Durante o culto</strong> impede a mesma pessoa de pegar duas ao mesmo tempo.
          <strong> Depois do culto</strong> (como edição) pode acumular.
        </p>
        {/* ERA UMA TABELA DE QUATRO COLUNAS, com um controle em cada célula:
            input, select, botão e botão. Num celular de 390px isso rendia 36
            caixas com borda numa tela só, o nome cortado em "ILUMINAÇÃ(" e o
            select inteiro reduzido a um "(". Tabela de quatro controles não
            cabe em 390px por mais bem estilizada que esteja.
            Vira a mesma linha do resto do sistema: nome em cima, o que ele é
            embaixo, ações no fim, separados por fio. */}
        <div className="ajt-lista">
          {S.funcoes.map(f => (
            <div className={`ajt-item ${f.ativa ? '' : 'off'}`} key={f.id}>
              <input className="ajt-nome" key={f.nome} defaultValue={f.nome} aria-label="nome da função"
                onBlur={e => e.target.value !== f.nome && fn(f.id!, { nome: e.target.value.toUpperCase() })} />
              <Escolha valor={f.simultanea ? '1' : '0'} rotulo="quando acontece" classe="ajt-quando"
                mostra={f.simultanea ? 'durante o culto' : 'depois do culto'}
                aoMudar={v => fn(f.id!, { simultanea: v === '1' })}>
                <option value="1">durante o culto</option>
                <option value="0">depois do culto</option>
              </Escolha>
              <div className="ajt-acoes">
                <button className="lid-bt-txt" onClick={() => fn(f.id!, { ativa: !f.ativa })}>
                  {f.ativa ? 'ocultar' : 'reativar'}
                </button>
                <button className="lid-bt-txt perigo" aria-label={`apagar ${f.nome}`}
                  onClick={() => delFn(f.id!, f.nome)}>apagar</button>
              </div>
            </div>
          ))}
        </div>
        <div className="linha" style={{ marginTop: 14 }}>
          <input value={nova} onChange={e => setNova(e.target.value)} placeholder="nova função (ex: SOM)" style={{ maxWidth: 240 }} />
          <button disabled={gravando || !nova.trim()} onClick={addFn}>Criar função</button>
        </div>
      </section>

      <section className="lid-secao">
        <div className="lid-secao-cab">
          <span className="rot">Quem organiza</span>
        </div>
        <p className="dim pequeno" style={{ marginTop: -4 }}>
          Só estes emails abrem a área do organizador. Cada um enxerga apenas o ministério que
          organiza: quem cuida da Mídia não vê o Serviço do Culto, e vice-versa.
          Quem está como <strong>todos</strong> enxerga tudo e é quem dá e tira acesso.
          Voluntário não precisa estar aqui, ele usa o link pessoal.
        </p>
        <div className="ajt-lista">
          {lideres.map(l => (
            <div className="ajt-item" key={l.email + (l.equipe_id || 'tudo')}>
              <span className="ajt-nome estatico">{l.email}</span>
              <span className="ajt-sub">
                {l.equipe_id
                  ? (equipes.find(q => q.id === l.equipe_id)?.nome || 'ministério removido')
                  : 'todos os ministérios'}
              </span>
              <div className="ajt-acoes">
                <button className="lid-bt-txt perigo" disabled={!geral || lideres.length < 2}
                  onClick={async () => {
                    if (!confirm(`Tirar o acesso de ${l.email}?`)) return;
                    try { await removerLider(l.email, l.equipe_id); await recarregarLideres(); aviso('Removido'); }
                    catch (err: any) { aviso('erro: ' + err.message); }
                  }}>tirar acesso</button>
              </div>
            </div>
          ))}
        </div>
        {geral ? (
          <div className="linha" style={{ marginTop: 14 }}>
            <input value={novoLider} onChange={e => setNovoLider(e.target.value)} type="email"
              placeholder="email do organizador" style={{ maxWidth: 260 }} />
            <select aria-label="Qual ministério essa pessoa organiza" value={equipeDoLider}
              onChange={e => setEquipeDoLider(e.target.value)} style={{ maxWidth: 220 }}>
              <option value="">todos os ministérios</option>
              {equipes.map(q => <option key={q.id} value={q.id}>só {q.nome}</option>)}
            </select>
            <button disabled={!novoLider.includes('@') || gravando} onClick={async () => {
              setGravando(true);
              try {
                await addLider(novoLider, equipeDoLider || null);
                setNovoLider(''); await recarregarLideres(); aviso('Acesso liberado');
              } catch (err: any) { aviso('Não salvou: ' + err.message); }
              setGravando(false);
            }}>Liberar acesso</button>
          </div>
        ) : (
          <p className="dim pequeno" style={{ marginTop: 12 }}>
            Só quem organiza todos os ministérios pode liberar ou tirar acesso.
          </p>
        )}
      </section>

      <section className="lid-secao" id="equipes">
        <div className="lid-secao-cab">
          <span className="rot">Ministérios</span>
        </div>
        <p className="dim pequeno" style={{ marginTop: -4 }}>
          Cada ministério tem time, funções e escala próprios. A escala automática do dia 26 monta todos.
        </p>
        <div className="ajt-lista">
          {equipes.map(e => (
            <div className="ajt-item" key={e.id}>
              <input className="ajt-nome" key={e.nome} defaultValue={e.nome} aria-label="nome do ministério"
                onBlur={async ev => {
                  const v = ev.target.value.trim();
                  if (v && v !== e.nome) { try { await atualizarEquipe(e.id, { nome: v }); await recarregarEquipes(); aviso('Salvo'); } catch (err: any) { aviso('Não salvou: ' + err.message); } }
                }} />
              <span className="ajt-sub">{e.id === equipe?.id ? 'aberto agora' : ''}</span>
              <div className="ajt-acoes">
                {e.id !== equipe?.id &&
                  <button className="lid-bt-txt" onClick={() => trocarEquipe(e.id)}>abrir</button>}
                <button className="lid-bt-txt perigo" aria-label={`apagar ${e.nome}`} disabled={equipes.length < 2}
                  onClick={async () => {
                    if (!confirm(`Apagar o ministério ${e.nome}? Todo o time, funções e escalas dele somem. Não dá para desfazer.`)) return;
                    try {
                      await removerEquipe(e.id);
                      const lista = await recarregarEquipes();
                      if (e.id === equipe?.id) {
                        if (lista[0]) trocarEquipe(lista[0].id, lista);
                        else { try { localStorage.removeItem('escala.equipe'); } catch {} location.reload(); return; }
                      }
                      aviso('Apagado');
                    }
                    catch (err: any) { aviso('Não deu: ' + err.message); }
                  }}>apagar</button>
              </div>
            </div>
          ))}
        </div>
        <div className="linha" style={{ marginTop: 12 }}>
          <input value={novaEquipe} onChange={e => setNovaEquipe(e.target.value)} placeholder="novo ministério (ex: Louvor)" style={{ maxWidth: 260 }} />
          <button disabled={gravando || !novaEquipe.trim()} onClick={async () => {
            setGravando(true);
            try { const eq = await criarEquipe(novaEquipe.trim()); setNovaEquipe(''); const l = await recarregarEquipes(); trocarEquipe(eq.id, l); aviso('Ministério criado, agora crie as funções e cadastre o time'); }
            catch (err: any) { aviso('Não deu: ' + err.message); }
            setGravando(false);
          }}>Criar ministério</button>
        </div>
      </section>

      <section className="lid-secao">
        <div className="lid-secao-cab">
          <span className="rot">As cinco regras</span>
        </div>
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
          <li><strong>Quem não pode, acha o substituto.</strong> Você não caça substituto.</li>
          <li><strong>Confirmação é ativa.</strong> Ver a mensagem não é confirmar.</li>
          <li><strong>Ninguém em duas funções ao mesmo tempo.</strong> O sistema bloqueia.</li>
          <li><strong>Buraco vai publicado.</strong> Vaga escondida vira furo no domingo.</li>
          <li><strong>Toda função precisa de 3 pessoas.</strong> Menos que isso é dependência.</li>
        </ol>
      </section>

      <p className="lid-pe">{funcoesAtivas(S).length} funções ativas · {S.voluntarios.length} pessoas cadastradas</p>
    </div>
  );
}

