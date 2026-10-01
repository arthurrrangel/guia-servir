'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Estado, GrupoZap } from '@/lib/engine';
import { funcaoNoGrupo } from '@/lib/engine';
import { confirmar } from '@/lib/confirmar';
import { IcCheck } from '@/components/Icones';

/* =============================================================================
   GRUPOS POR ÁREA, NOS AJUSTES — 01/10/2026

   O ministério que tem um grupo do WhatsApp para cada área (banda, vocal,
   som) diz aqui quais funções vão para cada um. A Escala usa isso em
   "Mandar nos grupos": cada grupo recebe só a parte dele.

   COMO GRAVA. Pela mesma `gravar()` do resto dos Ajustes, que manda a
   configuração inteira. Cada gesto grava sozinho (marcar uma função, dar nome,
   tirar ou criar um grupo): não há botão "salvar" para esquecer de apertar.

   QUANDO GRAVAR FALHA (auditoria adversarial de 01/10/2026). A primeira
   versão remontava a seção inteira numa falha: apagava o nome que o líder
   digitava em "Mais um grupo", jogava o foco no topo da página e, com a caixa
   "Tirar o grupo" aberta, gravava depois uma lista velha. Agora nada remonta:
   - o gesto que falhou volta ao que está salvo, e só ele; o campo em que a
     pessoa digita e o foco ficam onde estavam;
   - se já houver um gesto mais novo no ar, a falha do antigo não desfaz o
     novo (a mesma regra dos seletores da página);
   - quando não há mais nada no ar, a lista mostra o que o banco tem, mesmo
     que duas gravações tenham terminado fora de ordem;
   - o aviso diz o que aconteceu de verdade: não salvou e voltou ao salvo.

   POR QUE GRAVA O ID DA FUNÇÃO. Renomear "TECLADO" para "TECLAS" não pode
   tirar a função do grupo em silêncio. O nome fica como segunda chave só
   para linha antiga sem id (o harness).
   ============================================================================= */

const novoId = () => 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const limpar = (t: string) => t.trim().replace(/\s+/g, ' ');
/* "Mídia · Projeção" e "midia · projecao" são o mesmo grupo para quem lê */
const chaveNome = (t: string) => limpar(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
const mesmoNome = (a: string, b: string) => chaveNome(a) === chaveNome(b);

function doSalvo(S: Estado): GrupoZap[] {
  return (Array.isArray(S.config.grupos) ? S.config.grupos : [])
    .filter(g => g && typeof g.nome === 'string' && Array.isArray(g.funcoes))
    .map(g => ({ id: g.id || 'nome:' + limpar(g.nome), nome: g.nome, funcoes: [...g.funcoes] }));
}

export default function GruposPorArea({ S, gravar, aviso }: {
  S: Estado;
  gravar: (mudancas: Record<string, any>) => Promise<boolean>;
  aviso: (t: string) => void;
}) {
  const [grupos, setGrupos] = useState<GrupoZap[]>(() => doSalvo(S));
  /* a lista de agora, para dois gestos seguidos (dar nome e já marcar uma
     função) não trabalharem sobre a mesma foto velha */
  const atual = useRef(grupos);
  /* a última lista que se SABE estar no banco: a relida dele, ou a que uma
     gravação acabou de confirmar. Não é o mesmo que `S.config`, que pode
     ficar velho quando a releitura depois de gravar falha (auditoria 2) */
  const confirmado = useRef(grupos);
  /* cada gesto ganha um número; só a confirmação de um gesto MAIS NOVO que
     o último confirmado vale: duas respostas que chegam invertidas não
     podem pôr a lista velha por cima da nova (auditoria 3) */
  const seq = useRef(0);
  const seqConfirmado = useRef(0);
  const noAr = useRef(0);
  const refRaiz = useRef<HTMLDivElement | null>(null);
  const sRef = useRef(S); sRef.current = S;
  /* o nome que está sendo digitado em cada grupo, até sair do campo */
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [novo, setNovo] = useState('');
  const refNovo = useRef<HTMLInputElement | null>(null);

  const funcoes = useMemo(() => S.funcoes.filter(f => f.ativa !== false), [S.funcoes]);
  const soNoGeral = funcoes.filter(f => !grupos.some(g => funcaoNoGrupo(g, f)));

  /* nada no ar: a tela mostra o que o banco tem (inclusive depois de duas
     gravações que terminaram fora de ordem) */
  const salvoJson = JSON.stringify(S.config.grupos ?? null);
  /* sobe quando a última gravação termina: força uma conferência DEPOIS do
     desenho que já tem a configuração relida do banco */
  const [assentou, setAssentou] = useState(0);
  const mostrar = (lista: GrupoZap[]) => {
    if (JSON.stringify(lista) === JSON.stringify(atual.current)) return;
    atual.current = lista; setGrupos(lista);
  };
  /* o banco foi relido: isso é a verdade */
  useEffect(() => {
    confirmado.current = doSalvo(sRef.current);
    if (!noAr.current) mostrar(confirmado.current);
  }, [salvoJson]); // eslint-disable-line react-hooks/exhaustive-deps
  /* a última gravação terminou: mostra o que se sabe que está no banco */
  useEffect(() => {
    if (assentou && !noAr.current) mostrar(confirmado.current);
  }, [assentou]); // eslint-disable-line react-hooks/exhaustive-deps

  async function mandar(lista: GrupoZap[]) {
    atual.current = lista; setGrupos(lista);
    const meu = ++seq.current;
    noAr.current++;
    const ok = await gravar({ grupos: lista });
    if (ok && meu > seqConfirmado.current) { seqConfirmado.current = meu; confirmado.current = lista; }
    noAr.current--;
    if (!noAr.current) setAssentou(n => n + 1);
    if (ok) return;
    /* a falha só volta atrás (e só avisa) se este ainda era o último gesto:
       com um mais novo no ar, ele já leva esta mudança junto */
    if (atual.current !== lista) return;
    atual.current = confirmado.current; setGrupos(confirmado.current);
    aviso('Não deu para salvar os grupos agora: a lista voltou ao que está salvo. Tente de novo quando tiver sinal.');
  }

  function alternar(id: string, chave: string, nome: string) {
    const g = atual.current.find(x => x.id === id);
    if (!g) return;
    const tem = g.funcoes.includes(chave) || g.funcoes.includes(nome);
    const funcoesNovas = tem
      ? g.funcoes.filter(x => x !== chave && x !== nome)
      : [...g.funcoes, chave];
    void mandar(atual.current.map(x => x.id === id ? { ...x, funcoes: funcoesNovas } : x));
  }

  /* o grupo que já tem esse nome (para o aviso dizer o nome que está lá) */
  const repetido = (nome: string, menos?: string) =>
    atual.current.find(x => x.id !== menos && mesmoNome(x.nome, nome));

  function renomear(id: string) {
    const digitado = nomes[id];
    if (digitado === undefined) return;
    const nome = limpar(digitado);
    const antes = atual.current.find(x => x.id === id)?.nome ?? '';
    setNomes(m => { const n = { ...m }; delete n[id]; return n; });
    if (!nome || nome === antes) return;                 // grupo sem nome não existe
    const igual = repetido(nome, id);
    if (igual) { aviso(`Já existe o grupo ${igual.nome}. O nome voltou ao que era.`); return; }
    void mandar(atual.current.map(x => x.id === id ? { ...x, nome } : x));
  }

  async function tirar(g: GrupoZap) {
    if (!await confirmar({
      titulo: `Tirar o grupo ${g.nome}?`,
      texto: 'As funções dele continuam na escala e no grupo geral. Só deixam de ter mensagem própria.',
      acao: 'Tirar o grupo', perigo: true,
    })) return;
    /* a lista de DEPOIS da caixa: se algo falhou ou mudou enquanto ela
       estava aberta, tira daquilo, e não de uma foto de antes */
    void mandar(atual.current.filter(x => x.id !== g.id));
    /* o grupo some com o botão que tinha o foco: o foco fica na seção, e
       não num campo (no celular, campo focado abre o teclado longe da vista) */
    window.requestAnimationFrame(() => refRaiz.current?.focus({ preventScroll: true }));
  }

  function criar(e: React.FormEvent) {
    e.preventDefault();
    const nome = limpar(novo);
    if (!nome) { refNovo.current?.focus(); return; }
    const igual = repetido(nome);
    if (igual) { aviso(`Já existe o grupo ${igual.nome}.`); refNovo.current?.focus(); return; }
    void mandar([...atual.current, { id: novoId(), nome, funcoes: [] }]);
    setNovo('');
  }

  return (
    <div className="es-gz" ref={refRaiz} tabIndex={-1}>
      {grupos.map(g => {
        const marcadas = funcoes.filter(f => funcaoNoGrupo(g, f)).length;
        return (
          <div className="es-gz-grupo" key={g.id} role="group" aria-label={`Grupo ${g.nome}`}>
            <label className="es-campo es-gz-nome">
              <span>Nome do grupo</span>
              <input className="es-ctl" value={nomes[g.id] ?? g.nome} enterKeyHint="done" maxLength={40}
                onChange={e => { const v = e.target.value; setNomes(m => ({ ...m, [g.id]: v })); }}
                onKeyDown={e => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  /* Esc desiste do nome digitado e volta ao que estava */
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setNomes(m => { const n = { ...m }; delete n[g.id]; return n; });
                  }
                }}
                onBlur={() => renomear(g.id)} />
            </label>
            <p className={marcadas ? 'es-gz-rot' : 'es-gz-rot es-gz-falta'} id={`gz-${g.id}`}>
              {marcadas
                ? `${marcadas} ${marcadas === 1 ? 'função vai' : 'funções vão'} para este grupo`
                : 'Nenhuma função marcada: este grupo não aparece em Mandar nos grupos'}
            </p>
            <div className="es-gz-fns" role="group" aria-labelledby={`gz-${g.id}`}>
              {funcoes.map(f => {
                const chave = f.id || f.nome;
                const on = funcaoNoGrupo(g, f);
                return (
                  <button type="button" key={chave} className="es-gz-fn" aria-pressed={on}
                    onClick={() => alternar(g.id, chave, f.nome)}>
                    {on && <IcCheck />}{f.nome}
                  </button>
                );
              })}
            </div>
            {/* a saída destrutiva fica no fim do grupo, depois do que ele é,
                e não entre o nome e as funções */}
            <div className="es-gz-pe">
              <button type="button" className="es-btn es-txt es-peq es-perigo"
                onClick={() => void tirar(g)}>Tirar o grupo</button>
            </div>
          </div>
        );
      })}

      <form className="es-gz-novo" onSubmit={criar}>
        <label className="es-campo">
          <span>{grupos.length ? 'Mais um grupo' : 'Primeiro grupo'}</span>
          <input ref={refNovo} className="es-ctl" value={novo} maxLength={40} enterKeyHint="done"
            placeholder="Nome do grupo, ex.: Banda"
            onChange={e => setNovo(e.target.value)} />
        </label>
        <button type="submit" className="es-btn" disabled={!novo.trim()}>Adicionar grupo</button>
      </form>

      {!!grupos.length && !!soNoGeral.length && (
        <p className="es-gz-geral">
          <b>Só no grupo geral:</b> {soNoGeral.map(f => f.nome).join(', ')}.
        </p>
      )}
    </div>
  );
}
