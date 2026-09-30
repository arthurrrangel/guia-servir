'use client';
import Shell, { useApp, copiar } from '@/components/Shell';
import Link from 'next/link';
import { IcSeta } from '@/components/Icones';
import { Cab, Aviso, Dobra, Fio, Pilula } from '@/components/escalas/Pecas';
import { useEffect, useRef, useState } from 'react';
import {
  addLider, definirMinhaSenha, listarLideres, removerFuncao, removerLider, salvarConfig, salvarFuncoes,
  souOrganizadorGeral, type LinhaLider,
} from '@/lib/db';
import { atualizarEquipe } from '@/lib/equipes';
import { funcoesAtivas } from '@/lib/engine';
import { aviseHumano } from '@/lib/erros';
import { confirmar } from '@/lib/confirmar';
import { cont } from '@/lib/plural';

/* a ordem é a da página, não a alfabética: o índice é um mapa dela. */
const SECOES = [
  { id: 'grupo', rot: 'Grupo no WhatsApp' },
  { id: 'regras', rot: 'Regras do rodízio' },
  { id: 'aviso', rot: 'Texto do aviso' },
  { id: 'funcoes', rot: 'Funções' },
  { id: 'organiza', rot: 'Quem organiza' },
  { id: 'ministerios', rot: 'Outros ministérios' },
];

export default function Pagina() { return <Shell><Ajustes /></Shell>; }

function Ajustes() {
  /* qual seção está na tela. IntersectionObserver e não `scroll`: o cálculo
     de posição a cada pixel de rolagem é o jeito caro de responder uma
     pergunta que o navegador já sabe responder de graça.
     O recorte -45%/-50% faz a seção "ativa" ser a que cruza a faixa do meio
     da tela, e não a que encosta no topo — senão o índice troca de item antes
     de a pessoa estar lendo a seção nova. */
  /* nasce na primeira: com a página no topo, nenhuma seção cruzou a faixa do
     meio ainda, e um índice sem nenhum item aceso lê como quebrado. */
  const [ondeEstou, setOndeEstou] = useState(SECOES[0].id);
  /* O ITEM CLICADO ACENDE NA HORA (30/09/2026). As duas últimas seções são
     curtas e ficam no fim: pular para "Quem organiza" deixava a faixa do meio
     da tela na seção vizinha, e o índice acendia a vizinha, não a escolhida.
     O clique acende o item e cala o observador até a pessoa mexer na página
     de novo (roda, toque ou tecla); aí ele volta a mandar. */
  const travado = useRef(false);
  useEffect(() => {
    const alvos = SECOES.map(x => document.getElementById(x.id)).filter(Boolean) as HTMLElement[];
    if (!alvos.length) return;
    /* NO TOPO, A PRIMEIRA (30/09/2026). O cabeçalho novo é baixo e a primeira
       seção costuma vir dobrada: com a página no topo, a faixa do meio da tela
       já cai na segunda, e o índice nascia aceso em "Regras do rodízio" sem a
       pessoa ter rolado nada. No topo, como no fim, não há dúvida. */
    const noTopo = () => scrollY <= 0;
    const obs = new IntersectionObserver(entradas => {
      if (travado.current || noTopo()) return;
      const vis = entradas.filter(e => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) setOndeEstou(vis.target.id);
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
    alvos.forEach(a => obs.observe(a));
    /* A ÚLTIMA SEÇÃO NUNCA ACENDIA. Ela é curta e fica no fim: com a página
       rolada até o fim, a faixa do meio da tela ainda cai na seção anterior, e
       o índice ficava marcando "Quem organiza" com "Outros ministérios" na
       tela. No fim da rolagem não há dúvida sobre onde a pessoa está. */
    const noFim = () => {
      if (travado.current) return;
      if (noTopo()) { setOndeEstou(SECOES[0].id); return; }
      if (scrollY + innerHeight >= document.body.scrollHeight - 6) {
        setOndeEstou(SECOES[SECOES.length - 1].id);
      }
    };
    const soltar = () => { travado.current = false; };
    addEventListener('scroll', noFim, { passive: true });
    addEventListener('wheel', soltar, { passive: true });
    addEventListener('touchstart', soltar, { passive: true });
    addEventListener('keydown', soltar);
    noFim();
    return () => {
      obs.disconnect(); removeEventListener('scroll', noFim);
      removeEventListener('wheel', soltar); removeEventListener('touchstart', soltar); removeEventListener('keydown', soltar);
    };
  }, []);

  const { S, recarregar, aviso, base, equipe, equipes, recarregarEquipes } = useApp();
  const [nova, setNova] = useState('');
  const [lideres, setLideres] = useState<LinhaLider[]>([]);
  const [novoLider, setNovoLider] = useState('');
  /* null = "todos os ministérios" */
  const [equipeDoLider, setEquipeDoLider] = useState<string>('');
  const [geral, setGeral] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [minhaSenha, setMinhaSenha] = useState('');
  /* DOIS `catch` VAZIOS QUE MENTIAM PARA O DONO DO SISTEMA — 20/09/2026.

     Auditoria de tela. Com falha de rede na carga:
       · `lideres` ficava `[]` — o cabeçalho passava a dizer "0 com acesso" e
         a lista sumia, como se ninguém tivesse acesso ao produto;
       · `geral` ficava `false` — o formulário de liberar acesso sumia e a
         tela imprimia "Só quem organiza todos os ministérios pode liberar ou
         tirar acesso" PARA O ORGANIZADOR GERAL.

     É a mesma família que o /painel já tinha nomeado: vazio por falha e vazio
     de verdade desenhados iguais. Aqui o estrago é pior, porque a frase acusa
     a pessoa de não ter o cargo que ela tem. */
  const [falhouLista, setFalhouLista] = useState(false);
  const [falhouGeral, setFalhouGeral] = useState(false);
  useEffect(() => { listarLideres().then(l => { setLideres(l); setFalhouLista(false); })
    .catch(() => setFalhouLista(true)); }, []);
  useEffect(() => { souOrganizadorGeral().then(g => { setGeral(g); setFalhouGeral(false); })
    .catch(() => setFalhouGeral(true)); }, []);
  async function recarregarLideres() { try { setLideres(await listarLideres()); } catch {} }

  /* duas edições em sequência não podem se atropelar: o ref acumula
     as mudanças já pedidas, mesmo antes do recarregar voltar */
  const cfgRef = useRef({ ...S.config });
  useEffect(() => { cfgRef.current = { ...S.config }; }, [S.config]);
  async function cfg(chave: string, valor: any) {
    cfgRef.current = { ...cfgRef.current, [chave]: valor };
    try { await salvarConfig(equipe!.id, cfgRef.current); await recarregar(); aviso('Salvo'); }
    catch (e) { aviso(aviseHumano(e, 'salvar')); await recarregar(); }
  }
  /* mesma correção de `mudar` em /time: gravava em silêncio, sem indicador
     em voo e sem confirmação no fim. `cfg`, logo acima, já dizia 'Salvo'. */
  async function fn(id: string, campos: any) {
    const f = S.funcoes.find(x => x.id === id)!;
    setGravando(true);
    try { await salvarFuncoes(equipe!.id, [{ ...f, ...campos }]); await recarregar(); aviso('Salvo'); }
    catch (e) { aviso(aviseHumano(e)); }
    setGravando(false);
  }
  async function addFn() {
    const nome = nova.trim().toUpperCase();
    if (!nome || gravando) return;
    if (S.funcoes.some(f => f.nome.toUpperCase() === nome)) { aviso('Já existe uma função com esse nome'); return; }
    setGravando(true);
    try {
      await salvarFuncoes(equipe!.id, [{ nome, simultanea: true, ordem: S.funcoes.length + 1, ativa: true }]);
      setNova(''); await recarregar(); aviso('Função criada');
    } catch (e) { aviso(aviseHumano(e, 'salvar')); }
    setGravando(false);
  }
  async function delFn(id: string, nome: string) {
    if (!await confirmar({
      titulo: `Apagar a função ${nome}?`,
      texto: 'Ela some das escalas antigas também.',
      acao: 'Apagar', perigo: true,
    })) return;
    try { await removerFuncao(id); await recarregar(); aviso('Apagada'); }
    catch (e) { aviso(aviseHumano(e)); }
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

  /* A CONFIGURAÇÃO DO DEMANDAS (30/09/2026). No desktop, o índice fixo à
     esquerda e as seções à direita, em largura de leitura; no celular, o
     índice vira uma fita que rola de lado e as seções empilham. Cada seção é
     uma caixa com o título em cima. Nada mudou de função: o que salvava ao
     sair do campo continua salvando ao sair do campo. */
  return (
    <>
      {gravando && <Fio />}
      <Cab rot="Ajustes" titulo="Ajustes deste ministério"
        meta="Tudo aqui vale só para este ministério. Os outros seguem com os deles." />

      <div className="es-aj-grade">
        {/* O ÍNDICE — 07/09/2026.
            Esta página tem 2.995px e seis assuntos que não se parecem: o grupo
            do WhatsApp, as regras do sorteio, o texto do aviso, as funções, quem
            organiza e os outros ministérios. Sem índice, achar "funções" é rolar
            procurando um título — e quem chega aqui já sabe o que veio fazer.
            Índice e não abas: aba esconde, e o líder que veio mexer nas funções
            costuma sair mexendo também no aviso. Aqui tudo continua na página,
            e ele chega em um toque. */}
        <nav className="es-aj-indice" aria-label="Seções dos ajustes">
          {SECOES.map(x => (
            <a key={x.id} href={'#' + x.id} className="es-nav-item"
               aria-current={ondeEstou === x.id ? 'true' : undefined}
               onClick={() => { travado.current = true; setOndeEstou(x.id); }}>{x.rot}</a>
          ))}
        </nav>

        <div className="es-aj-secoes">
          {/* DOBRADA QUANDO JÁ CUMPRIU O PAPEL — fase 8.
              Esta seção tem 783px e existe para uma ação única: copiar a mensagem
              e fixar no grupo. Se o time JÁ TEM GENTE, a mensagem já foi colada —
              foi por ela que as pessoas entraram. Continuar servindo 783px de
              instrução de primeiro dia para quem está no terceiro mês é a
              definição de gaveta de tralha.
              O sinal é comportamental, não uma marcação que alguém precisa lembrar
              de fazer: gente no time prova que o link circulou. */}
          <Dobra id="grupo" titulo="O grupo no WhatsApp" aberta={!S.voluntarios.length}
            nota={S.voluntarios.length ? 'Já em uso · abrir para copiar de novo' : 'Cole uma vez e fixe'}>
            <div className="es-aj-pilha">
              {/* 05/09 — a instrução tinha 132 caracteres de justificativa depois da
                  ação. Quem chega aqui quer saber O QUE FAZER, e a razão ("você não
                  manda link no privado de ninguém") ele descobre sozinho no momento
                  em que a primeira pessoa entra pelo link. Fica a ação. */}
              <p className="es-prosa">
                Copie a mensagem, cole no grupo do ministério e <b>fixe</b>.
                Cada pessoa entra sozinha por ali.
              </p>
              <label className="es-campo">
                <span>Link de convite do grupo</span>
                {/* endereço, não frase: sem inputMode="url" o iPhone abre teclado de
                    texto com corretor ligado e a primeira letra maiúscula — colar um
                    link e ver "Https://" é o resultado. */}
                <input className="es-ctl" enterKeyHint="done" key={equipe?.whatsapp_grupo || ''} defaultValue={equipe?.whatsapp_grupo || ''}
                  type="url" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false}
                  placeholder="https://chat.whatsapp.com/..."
                  onBlur={async e => {
                    const v = e.target.value.trim();
                    if (v !== (equipe?.whatsapp_grupo || '')) {
                      try { await atualizarEquipe(equipe!.id, { whatsapp_grupo: v || null }); await recarregarEquipes(); aviso('Salvo'); }
                      catch (err) { aviso(aviseHumano(err, 'salvar')); }
                    }
                  }} />
                <small>Opcional, só para você guardar.</small>
              </label>
              <div className="es-campo">
                <span>Mensagem para fixar no grupo (prévia)</span>
                <pre className="es-msg">{kit}</pre>
              </div>
              <div className="es-linha es-linha-botoes">
                <button className="es-btn es-pri" onClick={() => copiar(kit, aviso, 'Copiado. Cole e fixe no grupo da equipe.')}>Copiar mensagem do grupo</button>
                <a className="es-btn" href={linkGrupo} target="_blank" rel="noopener">Abrir a página da equipe</a>
              </div>
            </div>
          </Dobra>

          <section className="es-caixa" id="regras">
            <div className="es-caixa-cab">
              <h3>Regras do rodízio</h3>
              <span className="es-peq es-mudo">Valem para o sorteio automático</span>
            </div>
            <div className="es-caixa-corpo">
              <div className="es-dupla es-aj-campos">
                <label className="es-campo">
                  <span>Máximo de escalas por pessoa por mês</span>
                  <select className="es-ctl" key={S.config.limitePadrao} aria-label="Máximo de escalas por pessoa por mês" defaultValue={S.config.limitePadrao} onChange={e => cfg('limitePadrao', +e.target.value)}>
                    {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} por mês</option>)}
                  </select>
                </label>
                <label className="es-campo">
                  <span>Plantonistas por domingo</span>
                  <select className="es-ctl" key={S.config.plantaoQtd} aria-label="Plantonistas por domingo" defaultValue={S.config.plantaoQtd} onChange={e => cfg('plantaoQtd', +e.target.value)}>
                    {[0, 1, 2, 3].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <label className="es-campo">
                  <span>Prazo para confirmar</span>
                  {/* campo de texto livre sem nenhuma pista do formato esperado: o
                      valor entra literalmente na frase "Confirma no seu link até
                      ___?" que vai para o WhatsApp. O exemplo mostra a forma. */}
                  {/* `inputMode="text"` DE PROPÓSITO: o prazo aqui é uma palavra
                      ("quinta-feira") que entra numa frase, não uma data, e o
                      teclado certo é o de texto. O medidor de celular acusa
                      "prazo" sem calendário, e respeita quem declara. */}
                  <input className="es-ctl" inputMode="text" enterKeyHint="done" key={S.config.prazoConfirmacao} aria-label="Prazo para confirmar"
                    placeholder="ex: quinta-feira"
                    defaultValue={S.config.prazoConfirmacao} onBlur={e => cfg('prazoConfirmacao', e.target.value)} />
                </label>
                <label className="es-campo">
                  <span>Equilibrar a carga olhando</span>
                  <select className="es-ctl" key={S.config.janelaCarga} aria-label="Equilibrar a carga olhando" defaultValue={S.config.janelaCarga} onChange={e => cfg('janelaCarga', +e.target.value)}>
                    {[30, 60, 90, 120, 180].map(n => <option key={n} value={n}>últimos {n} dias</option>)}
                  </select>
                </label>
              </div>
            </div>
          </section>

          <section className="es-caixa" id="aviso">
            <div className="es-caixa-cab">
              <h3>Texto do aviso mensal</h3>
            </div>
            <div className="es-caixa-corpo">
              <div className="es-aj-campos">
                <label className="es-campo">
                  <span>Como você começa o aviso</span>
                  <input className="es-ctl" enterKeyHint="done" key={S.config.saudacao} aria-label="Como você começa o aviso" defaultValue={S.config.saudacao} onBlur={e => cfg('saudacao', e.target.value)} />
                </label>
                <label className="es-campo">
                  <span>Como você termina</span>
                  <textarea className="es-ctl" key={S.config.rodape} aria-label="Como você termina o aviso" defaultValue={S.config.rodape} rows={3} onBlur={e => cfg('rodape', e.target.value)} />
                  <small>{'{PRAZO}'} vira o prazo acima.</small>
                </label>
              </div>
            </div>
          </section>

          <section className="es-caixa" id="funcoes">
            <div className="es-caixa-cab">
              <h3>Funções</h3>
            </div>
            <div className="es-caixa-corpo">
              <p className="es-prosa">
                <b>Durante o culto</b> impede a mesma pessoa de pegar duas ao mesmo tempo.
                <b> Depois do culto</b> (como edição) pode acumular.
              </p>
            </div>
            {/* ERA UMA TABELA DE QUATRO COLUNAS, com um controle em cada célula:
                input, select, botão e botão. Num celular de 390px isso rendia 36
                caixas com borda numa tela só, o nome cortado em "ILUMINAÇÃ(" e o
                select inteiro reduzido a um "(". Tabela de quatro controles não
                cabe em 390px por mais bem estilizada que esteja.
                Vira a mesma linha do resto do sistema: nome em cima, o que ele é
                embaixo, ações no fim, separados por fio. */}
            {/* NOVE LINHAS, TRINTA E SEIS CONTROLES. 07/09/2026. Cada função mostrava,
                o tempo todo, um campo editável, um seletor e dois botões de texto —
                e um deles era "apagar". Nove "apagar" permanentes numa tela é
                poluição e é risco: o dedo que rola encontra um botão destrutivo a
                cada 80px. E a pessoa que abre esta página quer LER a lista de
                funções; editar é exceção.

                A linha fechada mostra o nome e quando acontece; abrir a linha
                revela o campo, os seletores e as duas ações. Nove linhas
                legíveis, e o "apagar" só existe para quem abriu de propósito a
                função que quer apagar. */}
            <div className="es-fila es-aj-fila">
              {S.funcoes.map(f => (
                <details className="es-aj-fn" key={f.id}>
                  <summary className="es-item es-so-tit">
                    <span className="es-c-tit">
                      <b>{f.nome}</b>
                      <small>
                        {f.simultanea ? 'durante o culto' : 'depois do culto'}
                        {f.exigeSexo === 'M' ? ' · só homens' : f.exigeSexo === 'F' ? ' · só mulheres' : ''}
                      </small>
                    </span>
                    <span className="es-c-acao">
                      {!f.ativa && <Pilula>oculta</Pilula>}
                      <IcSeta />
                    </span>
                  </summary>
                  <div className="es-aj-fn-corpo">
                    <div className="es-dupla es-aj-campos">
                      <label className="es-campo es-aj-inteiro">
                        <span>Nome</span>
                        <input className="es-ctl" enterKeyHint="done" key={f.nome} defaultValue={f.nome} aria-label="nome da função"
                          onBlur={e => e.target.value !== f.nome && fn(f.id!, { nome: e.target.value.toUpperCase() })} />
                      </label>
                      <label className="es-campo">
                        <span>Quando acontece</span>
                        <select className="es-ctl" value={f.simultanea ? '1' : '0'} aria-label="quando acontece"
                          onChange={e => fn(f.id!, { simultanea: e.target.value === '1' })}>
                          <option value="1">durante o culto</option>
                          <option value="0">depois do culto</option>
                        </select>
                      </label>
                      {/* 18/09/2026: a regra do PRÉDIO, não da pessoa. "Mulher não
                          pode acessar banheiro masculino e nem sala dos pastores"
                          (liderança do Connect). Isso não é saber fazer, é poder
                          entrar, e por isso mora no posto: vale para todo mundo de
                          uma vez, inclusive para quem se cadastrar amanhã. */}
                      <label className="es-campo">
                        <span>Quem pode entrar</span>
                        <select className="es-ctl" value={f.exigeSexo || ''} aria-label="quem pode entrar neste posto"
                          onChange={e => fn(f.id!, { exigeSexo: (e.target.value || undefined) as 'M' | 'F' | undefined })}>
                          <option value="">qualquer pessoa</option>
                          <option value="M">só homens</option>
                          <option value="F">só mulheres</option>
                        </select>
                      </label>
                    </div>
                    <div className="es-linha es-aj-acoes">
                      <button className="es-btn es-txt es-peq" onClick={() => fn(f.id!, { ativa: !f.ativa })}>
                        {f.ativa ? 'Ocultar da escala' : 'Reativar'}
                      </button>
                      <button className="es-btn es-txt es-peq es-perigo" aria-label={`apagar ${f.nome}`}
                        onClick={() => delFn(f.id!, f.nome)}>Apagar</button>
                    </div>
                  </div>
                </details>
              ))}
            </div>
            <div className="es-caixa-corpo es-caixa-divisa">
              <div className="es-linha es-criar">
                <input className="es-ctl" enterKeyHint="done" value={nova} onChange={e => setNova(e.target.value)} aria-label="Nome da nova função" placeholder="nova função (ex: SOM)" />
                <button className="es-btn" disabled={gravando || !nova.trim()} onClick={addFn}>Criar função</button>
              </div>
            </div>
          </section>

          {/* DOBRADA POR CADÊNCIA — fase 8. Liberar e tirar acesso acontece quando
              alguém entra ou sai da liderança: duas ou três vezes por ano. Seção
              rara aberta por padrão empurra para baixo a que se usa toda semana. */}
          <Dobra id="organiza" titulo="Quem organiza"
            nota={falhouLista ? 'não consegui carregar a lista' : `${lideres.length} com acesso`}>
            <div className="es-aj-pilha">
              <p className="es-prosa">
                Só estes emails abrem o espaço do organizador, e cada um vê apenas o
                ministério que organiza. Quem está como <b>todos</b> vê tudo
                e dá acesso aos outros. Voluntário não entra aqui: ele usa o link pessoal.
              </p>
              {falhouLista ? (
                <Aviso tom="bad">Não consegui carregar a lista. Recarregue a página.</Aviso>
              ) : lideres.length > 0 && (
                <div className="es-fila">
                  {lideres.map(l => (
                    <div className="es-item es-so-tit" key={l.email + (l.equipe_id || 'tudo')}>
                      <span className="es-c-tit">
                        <b>{l.email}</b>
                        <small>
                          {l.equipe_id
                            ? (equipes.find(q => q.id === l.equipe_id)?.nome || 'ministério removido')
                            : 'todos os ministérios'}
                        </small>
                      </span>
                      <span className="es-c-acao">
                        {/* UM BOTÃO APAGADO SEM MOTIVO É UM BECO.
                            `disabled` tinha duas causas — não ser organizador geral, e
                            ser o último acesso da lista — e nenhuma delas aparecia na
                            tela. O organizador geral via "tirar acesso" morto no único
                            líder que restava e não tinha como saber por quê. O title
                            diz a razão de cada caso; a trava do último acesso continua,
                            porque tirar o último é se trancar do lado de fora. */}
                        <button className="es-btn es-txt es-peq es-perigo" disabled={!geral || lideres.length < 2}
                          title={!geral ? 'Só quem organiza todos os ministérios pode tirar acesso'
                            : lideres.length < 2 ? 'Este é o único acesso. Libere outro antes de tirar este, ou ninguém entra.'
                            : undefined}
                          onClick={async () => {
                            if (!await confirmar({
                              titulo: `Tirar o acesso de ${l.email}?`, acao: 'Tirar acesso',
                            })) return;
                            try { await removerLider(l.email, l.equipe_id); await recarregarLideres(); aviso('Removido'); }
                            catch (err) { aviso(aviseHumano(err)); }
                          }}>Tirar acesso</button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {geral ? (
                <div className="es-linha es-criar es-aj-liberar">
                  {/* aria-label, não só placeholder: placeholder some no instante em
                      que a pessoa começa a digitar, e some para sempre para quem usa
                      leitor de tela. Campo sem nome é campo que só quem construiu
                      entende. */}
                  <input className="es-ctl" enterKeyHint="done" value={novoLider} onChange={e => setNovoLider(e.target.value)} type="email"
                    aria-label="Email de quem vai organizar"
                    inputMode="email" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
                    placeholder="email do organizador" />
                  <select className="es-ctl" aria-label="Qual ministério essa pessoa organiza" value={equipeDoLider}
                    onChange={e => setEquipeDoLider(e.target.value)}>
                    <option value="">todos os ministérios</option>
                    {equipes.map(q => <option key={q.id} value={q.id}>só {q.nome}</option>)}
                  </select>
                  <button className="es-btn" disabled={!novoLider.includes('@') || gravando} onClick={async () => {
                    setGravando(true);
                    try {
                      await addLider(novoLider, equipeDoLider || null);
                      setNovoLider(''); await recarregarLideres(); aviso('Acesso liberado');
                    } catch (err) { aviso(aviseHumano(err, 'salvar')); }
                    setGravando(false);
                  }}>Liberar acesso</button>
                </div>
              ) : falhouGeral ? (
                <Aviso tom="bad">Não consegui conferir se você organiza todos os ministérios. Recarregue a página.</Aviso>
              ) : (
                <p className="es-peq es-mudo">Só quem organiza todos os ministérios pode liberar ou tirar acesso.</p>
              )}
              {/* 18/09/2026: a senha de quem está logado. Até aqui organizador só
                  entrava pelo link do email; agora pode escolher uma senha e usar
                  "Prefiro entrar com senha" na tela de entrar. Quem não está logado
                  cria a senha pela própria tela de entrar ("Criar ou trocar minha
                  senha"), que manda um link. */}
              <div className="es-aj-senha">
                <h4 className="es-caixa-titulo">Sua senha</h4>
                <p className="es-prosa">
                  Você entra por um link no email. Se preferir senha, escolha uma aqui: da
                  próxima vez, toque em <b>Prefiro entrar com senha</b> na tela de entrar.
                </p>
                <form className="es-linha es-criar" onSubmit={async e => {
                  e.preventDefault();
                  if (minhaSenha.length < 8 || gravando) return;
                  setGravando(true);
                  try { await definirMinhaSenha(minhaSenha); setMinhaSenha(''); aviso('Senha salva. Da próxima vez, entre com email e senha.'); }
                  catch (err) { aviso(aviseHumano(err, 'salvar a senha')); }
                  setGravando(false);
                }}>
                  <input className="es-ctl" type="password" value={minhaSenha} onChange={e => setMinhaSenha(e.target.value)}
                    aria-label="Senha nova" autoComplete="new-password" minLength={8} enterKeyHint="done"
                    placeholder="pelo menos 8 caracteres" />
                  <button className="es-btn" type="submit" disabled={minhaSenha.length < 8 || gravando}>Salvar senha</button>
                </form>
              </div>
            </div>
          </Dobra>

          {/* MINISTÉRIOS SAIU DAQUI — arquitetura de informação, 29/08/2026.
              O cabeçalho desta página promete "tudo aqui vale só para este
              ministério", e logo abaixo morava o botão que APAGA outro ministério
              inteiro, com time, funções e escalas. A promessa era falsa a 4.300px
              de distância dela mesma. O que alcança a casa inteira mudou de
              endereço; aqui fica só o link. */}
          <section className="es-caixa" id="ministerios">
            <div className="es-caixa-cab">
              <h3>Outros ministérios</h3>
              <span className="es-peq es-mudo">Fora do alcance desta página</span>
            </div>
            <div className="es-caixa-corpo">
              <div className="es-entre es-aj-outros">
                <p className="es-prosa">
                  Criar, renomear ou apagar ministério mexe na casa inteira e por isso mora
                  em outro lugar.
                </p>
                <Link className="es-btn" href="/ajustes/ministerios">Abrir os ministérios da igreja</Link>
              </div>
            </div>
          </section>

          {/* AS CINCO REGRAS SAÍRAM DAQUI — fase 8, 29/08/2026.
              Não eram um ajuste: não se configura nada nelas. É o contrato de como
              a escala funciona, e duas delas são promessa AO líder ("você não caça
              substituto", "o sistema bloqueia"). Documentação guardada na gaveta de
              configuração é documentação que ninguém acha — e quem mais precisa
              delas é justamente quem nunca vai abrir esta página. Foram para o
              /painel: fechadas para quem já roda a escala, abertas na primeira vez. */}

          <p className="es-peq es-mudo">{cont(funcoesAtivas(S).length, 'função ativa', 'funções ativas')} · {cont(S.voluntarios.length, 'pessoa cadastrada', 'pessoas cadastradas')}</p>
        </div>
      </div>
    </>
  );
}
