'use client';
import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { type Estado, fmtDia, garantirDia, sitePublico } from '@/lib/engine';
import {
  type CombinacaoDoDress, type CorDoDress, type DressCode, type EstiloDoDress, type RascunhoDoDress,
  ESTILOS, LIMITES, PALETA, amostraClara, corMaisProxima, dressCodesAnteriores, linhasDoDressCode, linkDoDressCode,
  nomeDoEstilo, rascunhoDe, rascunhoValido, tintaSobre, urlDaImagem,
} from '@/lib/dress-code';
import { enviarImagemDoDress, gerarInspiracao, salvarDressCode } from '@/lib/db';
import { erroDaImagem, prepararImagem } from '@/lib/dress-code-imagem';
import { erroDaGeracao } from '@/lib/dress-code-ia';
import { lerCredenciais } from '@/lib/supabase';
import { aviseHumano } from '@/lib/erros';
import { confirmar } from '@/lib/confirmar';
import { copiar } from '@/components/Shell';
import { IcCheck, IcCopiar, IcMais, IcX } from '@/components/Icones';
import { Aviso } from '@/components/escalas/Pecas';

/* =============================================================================
   O DRESS CODE DO CULTO, NA ESCALA DO LÍDER DO LOUVOR — 116 · 26/10/2026

   O pedido do líder do Louvor: definir antes como quem está escalado se
   veste, para "ninguém precisar ficar perguntando no grupo quais roupas ou
   cores deverá utilizar". Aparece só no Louvor (o banco confere o mesmo em
   `dress_code_ligado`), em culto que já está no banco e que ainda não passou.

   FECHADO, o bloco mostra o que está valendo (as cores, o estilo, as
   miniaturas) e as saídas: editar, ver a página do link e copiar o link.
   Sem dress code, "Definir o dress code" e, se houver, "Repetir o de dd/mm".

   ABERTO, um formulário só, de cima para baixo, na ordem em que se pensa:
     · as CORES: uma combinação ou até três ("ou" na mensagem: quem serve
       escolhe uma). A paleta abre dentro da combinação marcada; toque na cor
       entra, toque de novo sai. "Outra cor" abre o seletor do aparelho, com
       o nome da cor da paleta mais perto já escrito (o nome é o que vai para
       o grupo, e dá para mudar);
     · o ESTILO, opcional, e as ORIENTAÇÕES, até 400 letras;
     · as INSPIRAÇÕES, até 8: fotos do aparelho (ficam leves aqui mesmo,
       antes de subir: lib/dress-code-imagem.ts) ou geradas por IA a partir
       das cores (a rota /api/dress-code/gerar guarda a imagem e o banco
       conta 12 por dia). Cada uma troca ou sai. A foto escolhida aparece na
       hora e só sobe para o armário quando a pessoa salva;
     · como fica na mensagem do grupo, recolhido.

   GRAVAR é `salvar_dress_code`, com a versão que a tela abriu: se outra
   pessoa da liderança salvou no meio, o banco devolve a dela, a tela mostra
   o aviso e o rascunho continua ali, para salvar por cima ou desistir.

   O MINISTÉRIO VAI JUNTO, CONFERIDO NA VOLTA, como no repertório: o Shell
   não remonta a página quando o líder troca de ministério.
   ============================================================================= */

type Local = { blob: Blob; ext: 'webp' | 'jpg'; url: string };
type ImagemNaTela = { chave: string; caminho?: string; ia?: boolean; local?: Local };
type Edicao = { combinacoes: CombinacaoDoDress[]; estilo: EstiloDoDress | null; orientacoes: string; imagens: ImagemNaTela[] };

let contador = 0;
const novaChave = () => `im${++contador}`;
const edicaoDe = (r: RascunhoDoDress): Edicao => ({
  combinacoes: r.combinacoes.length ? r.combinacoes.map(c => ({ cores: c.cores.map(k => ({ ...k })) })) : [{ cores: [] }],
  estilo: r.estilo, orientacoes: r.orientacoes || '',
  imagens: r.imagens.map(i => ({ chave: novaChave(), caminho: i.caminho, ia: i.ia })),
});
const edicaoVazia = (): Edicao => ({ combinacoes: [{ cores: [] }], estilo: null, orientacoes: '', imagens: [] });
const assinatura = (e: Edicao | null) => (e ? JSON.stringify([
  e.combinacoes.map(c => c.cores.map(k => k.hex + k.nome)), e.estilo, e.orientacoes, e.imagens.map(i => i.caminho || i.chave),
]) : '');
const emTexto = (d: Pick<DressCode, 'combinacoes'>) => d.combinacoes.map(c => c.cores.map(k => k.nome).join(' + ')).join(' ou ');
/* o que o banco recusa sai antes: no texto das orientações, a quebra de
   linha fica (e as do Unicode viram ela); no nome da cor, nenhum caractere
   de controle, nem os de C1 (o `[[:cntrl:]]` do banco pega) */
// eslint-disable-next-line no-control-regex
const limparTexto = (t: string) => t.replace(/\t/g, ' ').replace(/[\u2028\u2029]/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '');
// eslint-disable-next-line no-control-regex
const limparNome = (t: string) => t.replace(/[\t\n\r\u2028\u2029]/g, ' ').replace(/[\u0000-\u001f\u007f-\u009f]/g, '');

function fraseDoErro(cod: string): string {
  switch (cod) {
    case 'SEM_PERMISSAO': return 'Só a liderança do Louvor define o dress code.';
    case 'SO_LOUVOR': return 'O dress code é do Louvor.';
    case 'CULTO_INEXISTENTE': return 'Esse culto não está mais na escala. Recarregue a tela.';
    case 'INVALIDO': return 'O banco recusou o dress code. Confira as cores, os nomes e as imagens.';
    default: return 'Não consegui salvar o dress code. Tente de novo.';
  }
}
function fraseDaExcecao(e: unknown, oQue: string): string {
  const o = (e || {}) as { code?: string; message?: string };
  /* sem a 116 no banco, a função não existe: dito com palavras. Só pelo
     código: o nome da conferência (`culto_obs_dress_code_ok`) também tem
     "dress_code", e não quer dizer que falta a 116 */
  if (o.code === 'PGRST202' || o.code === '42883') {
    return 'O dress code ainda não foi ligado no banco. Avise quem cuida do sistema.';
  }
  return aviseHumano(e, oQue);
}

export default function DressCodeDoDia({ S, d, cultoId, equipeId, base, ocupado, pinta, aviso }: {
  S: Estado; d: string; cultoId: string; equipeId: string; base: string; ocupado: boolean;
  pinta: () => void; aviso: (t: string) => void;
}) {
  const salvo = S.escalas[d]?.dressCode || null;
  const [ed, setEd] = useState<Edicao | null>(null);
  const edRef = useRef<Edicao | null>(null);
  const mudar = (e: Edicao | null) => { edRef.current = e; setEd(e); };
  const [ativa, setAtiva] = useState(0);
  const [outra, setOutra] = useState<{ hex: string; nome: string; mexeu: boolean } | null>(null);
  const [erro, setErro] = useState('');
  const [gravando, setGravando] = useState(false);
  const [preparando, setPreparando] = useState(0);
  const [gerando, setGerando] = useState(false);
  const [paraIa, setParaIa] = useState(0);
  const [restam, setRestam] = useState<number | null>(null);
  const [conflito, setConflito] = useState<{ atual: DressCode | null } | null>(null);
  /* a versão que estava salva quando o formulário abriu (o MUDOU do banco) */
  const antesRef = useRef<DressCode | null>(null);
  const inicioRef = useRef('');
  /* cada abertura do formulário é uma sessão: a resposta de algo que estava
     indo (foto, IA, gravação) para uma sessão que já fechou é ignorada */
  const sessaoRef = useRef(0);
  const urls = useRef(new Set<string>());
  const trocarRef = useRef<string | null>(null);
  const inputFotos = useRef<HTMLInputElement | null>(null);
  const inputTroca = useRef<HTMLInputElement | null>(null);
  const secaoRef = useRef<HTMLElement | null>(null);
  const tituloEd = useRef<HTMLSpanElement | null>(null);
  const focar = useRef<'editor' | 'secao' | null>(null);
  const equipeRef = useRef(equipeId); equipeRef.current = equipeId;

  const supabase = lerCredenciais()?.url || '';
  const site = sitePublico(base);
  const anteriores = dressCodesAnteriores(S.escalas, d, 6);
  const travado = ocupado || gravando;
  const idc = (x: string) => `dc-${d}-${x}`;

  const soltar = (im?: ImagemNaTela) => {
    if (im?.local) { URL.revokeObjectURL(im.local.url); urls.current.delete(im.local.url); }
  };
  const soltarTudo = () => { for (const u of urls.current) URL.revokeObjectURL(u); urls.current.clear(); };

  /* o dia ou o ministério mudou: o formulário era de outro culto */
  useEffect(() => {
    sessaoRef.current++;
    soltarTudo();
    edRef.current = null; setEd(null);
    setAtiva(0); setOutra(null); setErro(''); setGravando(false); setPreparando(0); setGerando(false);
    setConflito(null); setRestam(null);
  }, [d, equipeId]);
  useEffect(() => () => { sessaoRef.current++; soltarTudo(); }, []);
  /* o foco vai para onde a pessoa está: o título do formulário ao abrir, e o
     primeiro botão do bloco ao fechar (o teclado não cai no começo da página) */
  useEffect(() => {
    if (!focar.current || gravando) return;
    const alvo = focar.current; focar.current = null;
    if (alvo === 'editor') tituloEd.current?.focus();
    else secaoRef.current?.querySelector<HTMLElement>('.es-linha > .es-btn:not(:disabled)')?.focus();
  }, [ed, gravando]);

  const vivo = (eq: string, sessao: number) => equipeRef.current === eq && sessaoRef.current === sessao;

  function abrir(r: RascunhoDoDress | null) {
    sessaoRef.current++;
    soltarTudo();
    antesRef.current = salvo;
    const e = r ? edicaoDe(r) : edicaoVazia();
    mudar(e);
    inicioRef.current = assinatura(e);
    setAtiva(0); setOutra(null); setErro(''); setConflito(null); setParaIa(0); setPreparando(0); setGerando(false);
    focar.current = 'editor';
  }
  function fecharJa() {
    sessaoRef.current++;
    soltarTudo();
    mudar(null);
    setOutra(null); setErro(''); setConflito(null); setPreparando(0); setGerando(false); setGravando(false);
    focar.current = 'secao';
  }
  async function cancelar() {
    if (ed && assinatura(ed) !== inicioRef.current
      && !await confirmar({ titulo: 'Descartar o que você mudou?', texto: 'As cores, as orientações e as imagens que você mexeu agora não foram salvas.', acao: 'Descartar' })) return;
    fecharJa();
  }
  async function repetir(a: { data: string; dress: DressCode }) {
    const e = edRef.current;
    if (e && assinatura(e) !== inicioRef.current
      && !await confirmar({ titulo: `Trocar pelo dress code de ${fmtDia(a.data)}?`, texto: 'O que você já escolheu aqui sai, e entram as cores, o estilo, as orientações e as imagens daquele culto.', acao: 'Trocar' })) return;
    if (!edRef.current) { abrir(rascunhoDe(a.dress)); return; }
    /* o rascunho é outro: o que ainda estava a caminho (foto, IA) era do de
       antes e não entra neste (o botão já fica desligado enquanto há algo a
       caminho; isto é a segunda trava) */
    sessaoRef.current++;
    setPreparando(0); setGerando(false);
    for (const im of edRef.current.imagens) soltar(im);
    const novo = edicaoDe(rascunhoDe(a.dress));
    mudar(novo);
    setAtiva(0); setOutra(null); setErro(''); setParaIa(0);
    aviso(`Copiado o dress code de ${fmtDia(a.data)}. Confira e salve.`);
  }

  /* ------------------------------------------------------------ as cores */
  function comCombinacoes(f: (cs: CombinacaoDoDress[]) => void) {
    const e = edRef.current; if (!e) return;
    const cs = e.combinacoes.map(c => ({ cores: c.cores.map(k => ({ ...k })) }));
    f(cs);
    mudar({ ...e, combinacoes: cs });
  }
  function alternar(cor: CorDoDress) {
    const e = edRef.current; if (!e) return;
    const c = e.combinacoes[ativa]; if (!c) return;
    if (!c.cores.some(k => k.hex === cor.hex) && c.cores.length >= LIMITES.cores) {
      setErro(`No máximo ${LIMITES.cores} cores em cada combinação.`); return;
    }
    setErro('');
    comCombinacoes(cs => {
      const alvo = cs[ativa];
      const i = alvo.cores.findIndex(k => k.hex === cor.hex);
      if (i >= 0) alvo.cores.splice(i, 1); else alvo.cores.push({ ...cor });
    });
  }
  function tirarCor(ci: number, hex: string) {
    setErro('');
    comCombinacoes(cs => { cs[ci].cores = cs[ci].cores.filter(k => k.hex !== hex); });
  }
  function acrescentarOutra() {
    const e = edRef.current; if (!e || !outra) return;
    const nome = outra.nome.trim();
    const c = e.combinacoes[ativa]; if (!c) return;
    if (!nome) { setErro('Dê um nome para a cor: é ele que vai na mensagem do grupo.'); return; }
    if (nome.length > LIMITES.nomeDaCor) { setErro(`O nome da cor passa de ${LIMITES.nomeDaCor} letras.`); return; }
    if (c.cores.some(k => k.hex === outra.hex)) { setErro('Essa cor já está nesta combinação.'); return; }
    if (c.cores.length >= LIMITES.cores) { setErro(`No máximo ${LIMITES.cores} cores em cada combinação.`); return; }
    setErro('');
    comCombinacoes(cs => { cs[ativa].cores.push({ hex: outra.hex.toLowerCase(), nome }); });
    setOutra(null);
  }
  function novaCombinacao() {
    const e = edRef.current; if (!e || e.combinacoes.length >= LIMITES.combinacoes) return;
    comCombinacoes(cs => { cs.push({ cores: [] }); });
    setAtiva(e.combinacoes.length); setOutra(null); setErro('');
  }
  function tirarCombinacao(ci: number) {
    const e = edRef.current; if (!e) return;
    comCombinacoes(cs => { cs.splice(ci, 1); if (!cs.length) cs.push({ cores: [] }); });
    setAtiva(a => Math.max(0, Math.min(a === ci ? ci - 1 : a > ci ? a - 1 : a, e.combinacoes.length - 2)));
    setParaIa(0); setOutra(null); setErro('');
  }

  /* ------------------------------------------------------- as inspirações */
  async function escolherFotos(ev: ChangeEvent<HTMLInputElement>, trocar: string | null) {
    const arqs = [...(ev.target.files || [])];
    ev.target.value = '';                      // escolher a mesma foto de novo também vale
    const e0 = edRef.current;
    if (!e0 || !arqs.length) return;
    const eq = equipeId, sessao = sessaoRef.current;
    const vagas = LIMITES.imagens - e0.imagens.length + (trocar ? 1 : 0);
    const usar = arqs.slice(0, Math.max(0, vagas));
    let recado = arqs.length > usar.length
      ? `Cabem ${LIMITES.imagens} imagens: ${arqs.length - usar.length === 1 ? 'uma ficou de fora' : `${arqs.length - usar.length} ficaram de fora`}.`
      : '';
    setErro('');
    setPreparando(n => n + usar.length);
    const prontas: ImagemNaTela[] = [];
    for (const a of usar) {
      try {
        const p = await prepararImagem(a);
        const url = URL.createObjectURL(p.blob);
        urls.current.add(url);
        prontas.push({ chave: novaChave(), local: { blob: p.blob, ext: p.ext, url } });
      } catch (e) {
        recado = erroDaImagem(String((e as Error)?.message || e));
      } finally {
        if (vivo(eq, sessao)) setPreparando(n => Math.max(0, n - 1));
      }
    }
    if (!vivo(eq, sessao) || !edRef.current) { prontas.forEach(soltar); return; }
    const atual = edRef.current;
    let imgs = [...atual.imagens];
    if (trocar) {
      const i = imgs.findIndex(x => x.chave === trocar);
      const nova = prontas.shift();
      if (i >= 0 && nova) { soltar(imgs[i]); imgs.splice(i, 1, nova); }
      else if (nova) prontas.unshift(nova);
    }
    const cabem = Math.max(0, LIMITES.imagens - imgs.length);
    prontas.slice(cabem).forEach(soltar);
    if (prontas.length > cabem && !recado) recado = `Cabem ${LIMITES.imagens} imagens: o resto ficou de fora.`;
    imgs = [...imgs, ...prontas.slice(0, cabem)];
    mudar({ ...atual, imagens: imgs });
    if (recado) setErro(recado);
  }
  function tirarImagem(chave: string) {
    const e = edRef.current; if (!e) return;
    soltar(e.imagens.find(i => i.chave === chave));
    mudar({ ...e, imagens: e.imagens.filter(i => i.chave !== chave) });
    setErro('');
  }
  function pedirTroca(chave: string) {
    trocarRef.current = chave;
    inputTroca.current?.click();
  }
  async function gerar() {
    const e0 = edRef.current; if (!e0 || gerando) return;
    const comCor = e0.combinacoes.filter(c => c.cores.length);
    if (!comCor.length) { setErro('Escolha as cores antes de gerar: a imagem sai delas.'); return; }
    if (e0.imagens.length >= LIMITES.imagens) { setErro(`Já são ${LIMITES.imagens} imagens. Tire uma para gerar outra.`); return; }
    const escolhida = e0.combinacoes[paraIa];
    const alvo = escolhida && escolhida.cores.length ? comCor.indexOf(escolhida) : 0;
    const eq = equipeId, sessao = sessaoRef.current;
    setGerando(true); setErro('');
    try {
      const r = await gerarInspiracao(eq, { combinacoes: comCor, estilo: e0.estilo, orientacoes: e0.orientacoes, imagens: [] }, Math.max(0, alvo));
      if (!vivo(eq, sessao)) return;
      if (!r.ok) { setErro(erroDaGeracao(r.erro)); if (r.erro === 'LIMITE') setRestam(0); return; }
      setRestam(r.restam);
      const atual = edRef.current; if (!atual) return;
      if (atual.imagens.length >= LIMITES.imagens) { setErro(`A imagem ficou pronta, mas já são ${LIMITES.imagens}. Tire uma e gere de novo.`); return; }
      mudar({ ...atual, imagens: [...atual.imagens, { chave: novaChave(), caminho: r.caminho, ia: true }] });
      aviso('Imagem gerada. Ela entra no dress code quando você salvar.');
    } catch {
      if (vivo(eq, sessao)) setErro(erroDaGeracao(null));
    } finally {
      if (vivo(eq, sessao)) setGerando(false);
    }
  }

  /* -------------------------------------------------------------- gravar */
  async function salvar() {
    const e0 = edRef.current; if (!e0 || gravando) return;
    const vazia = e0.combinacoes.findIndex(c => !c.cores.length);
    if (vazia >= 0) {
      setAtiva(vazia);
      setErro(e0.combinacoes.length > 1
        ? `A combinação ${vazia + 1} está sem cor. Escolha as cores dela ou tire a combinação.`
        : 'Escolha ao menos uma cor.');
      return;
    }
    if (preparando > 0) { setErro('Espere as fotos terminarem de carregar.'); return; }
    if (gerando) { setErro('Espere a imagem da IA ficar pronta.'); return; }
    const eq = equipeId, sessao = sessaoRef.current, antes = antesRef.current;
    setGravando(true); setErro('');
    try {
      /* 1 · as fotos novas sobem para o armário (as que já subiram não sobem
         de novo, nem numa segunda tentativa) */
      const pend = e0.imagens.filter(i => !i.caminho && i.local);
      let imgs = e0.imagens;
      if (pend.length) {
        const rs = await Promise.allSettled(pend.map(i => enviarImagemDoDress(eq, i.local!.blob, i.local!.ext)));
        if (!vivo(eq, sessao)) return;
        const subiu = new Map<string, string>();
        let falha = '';
        rs.forEach((r, k) => {
          if (r.status === 'fulfilled') subiu.set(pend[k].chave, r.value);
          else if (!falha) falha = String((r.reason as Error)?.message || r.reason);
        });
        const atual = edRef.current || e0;
        imgs = atual.imagens.map(i => (subiu.has(i.chave) ? { ...i, caminho: subiu.get(i.chave) } : i));
        mudar({ ...atual, imagens: imgs });
        if (falha) { setErro(erroDaImagem(falha)); return; }
      }
      /* 2 · o que o banco recebe */
      const r: RascunhoDoDress = {
        combinacoes: e0.combinacoes, estilo: e0.estilo, orientacoes: e0.orientacoes,
        imagens: imgs.filter(i => i.caminho).map(i => (i.ia ? { caminho: i.caminho!, ia: true } : { caminho: i.caminho! })),
      };
      const v = rascunhoValido(r, eq);
      if (!v.ok) { setErro(v.erro); return; }
      const res = await salvarDressCode(cultoId, eq, r, antes);
      if (!vivo(eq, sessao)) return;
      const dia = garantirDia(S, d);
      if (res.ok) {
        if (res.dress) dia.dressCode = res.dress; else delete dia.dressCode;
        pinta();
        aviso(antes ? 'Dress code atualizado. A mensagem do grupo já sai com ele.' : 'Dress code salvo. A mensagem do grupo já sai com ele.');
        fecharJa();
        return;
      }
      if (res.erro === 'MUDOU') {
        /* a tela passa a mostrar o que está salvo; o rascunho fica, e o
           próximo "Salvar" vai por cima da versão nova, de olhos abertos */
        if (res.atual) dia.dressCode = res.atual; else delete dia.dressCode;
        antesRef.current = res.atual ?? null;
        setConflito({ atual: res.atual ?? null });
        pinta();
        return;
      }
      setErro(fraseDoErro(res.erro));
    } catch (e) {
      if (vivo(eq, sessao)) setErro(fraseDaExcecao(e, 'salvar o dress code'));
    } finally {
      if (vivo(eq, sessao)) setGravando(false);
    }
  }
  async function tirar() {
    const atual = antesRef.current;
    if (!atual) return;
    if (!await confirmar({
      titulo: 'Tirar o dress code deste culto?',
      texto: 'As cores e as inspirações saem da página de quem serve e da mensagem do grupo, e o link que já foi para o grupo deixa de abrir. As imagens continuam guardadas.',
      acao: 'Tirar o dress code', perigo: true,
    })) return;
    const eq = equipeId, sessao = sessaoRef.current;
    setGravando(true); setErro('');
    try {
      const res = await salvarDressCode(cultoId, eq, null, atual);
      if (!vivo(eq, sessao)) return;
      const dia = garantirDia(S, d);
      if (res.ok) { delete dia.dressCode; pinta(); aviso('Dress code tirado deste culto.'); fecharJa(); return; }
      if (res.erro === 'MUDOU') {
        if (res.atual) dia.dressCode = res.atual; else delete dia.dressCode;
        antesRef.current = res.atual ?? null;
        setConflito({ atual: res.atual ?? null });
        pinta();
        return;
      }
      setErro(fraseDoErro(res.erro));
    } catch (e) {
      if (vivo(eq, sessao)) setErro(fraseDaExcecao(e, 'tirar o dress code'));
    } finally {
      if (vivo(eq, sessao)) setGravando(false);
    }
  }

  /* ------------------------------------------------------------- a tela */
  const link = salvo ? linkDoDressCode(site, salvo.id) : '';
  const srcDe = (im: ImagemNaTela) => im.local?.url || (im.caminho ? urlDaImagem(supabase, im.caminho) : '');

  /* FECHADO */
  if (!ed) {
    const ultimo = anteriores[0];
    return (
      <section className="es-ec-dc" aria-labelledby={idc('tit')} ref={secaoRef}>
        <div className="es-ec-dc-cab">
          <span className="es-ec-rep-tit" id={idc('tit')}>Dress code</span>
          {salvo && <span className="es-ec-dc-nota">vai na mensagem do grupo e no link de quem serve</span>}
        </div>
        {salvo ? (
          <div className="es-ec-dc-resumo">
            <ul className="es-ec-dc-linhas" aria-label="Cores">
              {salvo.combinacoes.map((c, i) => (
                <li className="es-ec-dc-linha" key={i}>
                  {/* os espaços entre as peças são de verdade: o leitor de tela
                      lia "Verde-águaouPreto" como uma palavra só */}
                  {i > 0 && <><span className="es-ec-dc-ou">ou</span>{' '}</>}
                  <span className="es-ec-dc-pontos" aria-hidden="true">
                    {c.cores.map(k => (
                      <span key={k.hex} className={`es-ec-dc-ponto${amostraClara(k.hex) ? ' es-ec-dc-ponto-claro' : ''}`} style={{ background: k.hex }} />
                    ))}
                  </span>{' '}
                  <span className="es-ec-dc-nomes">{c.cores.map(k => k.nome).join(' + ')}</span>
                </li>
              ))}
            </ul>
            {(salvo.estilo || salvo.orientacoes) && (
              <p className="es-ec-dc-ori">{[nomeDoEstilo(salvo.estilo), salvo.orientacoes.replace(/\s*\n\s*/g, ' ')].filter(Boolean).join(' · ')}</p>
            )}
            {!!salvo.imagens.length && (
              <ul className="es-ec-dc-minis" aria-label={salvo.imagens.length === 1 ? '1 inspiração' : `${salvo.imagens.length} inspirações`}>
                {salvo.imagens.map(im => (
                  <li key={im.caminho}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={urlDaImagem(supabase, im.caminho)} alt="" loading="lazy" decoding="async" />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="es-ec-dc-vazio">
            As cores e as inspirações de roupa deste culto. Quem está escalado vê no próprio link, e a mensagem do grupo leva as cores e o link das imagens.
          </p>
        )}
        <div className="es-linha">
          {salvo ? (
            <>
              <button type="button" className="es-btn es-peq" disabled={travado} onClick={() => abrir(rascunhoDe(salvo))}>
                Editar o dress code
              </button>
              <a className="es-btn es-txt es-peq" href={link} target="_blank" rel="noopener noreferrer">Ver a página</a>
              <button type="button" className="es-btn es-txt es-peq" onClick={() => void copiar(link, aviso, 'Link do dress code copiado.')}>
                <IcCopiar />Copiar o link
              </button>
            </>
          ) : (
            <>
              <button type="button" className="es-btn es-peq" disabled={travado} onClick={() => abrir(null)}>
                Definir o dress code
              </button>
              {ultimo && (
                <button type="button" className="es-btn es-txt es-peq" disabled={travado} onClick={() => abrir(rascunhoDe(ultimo.dress))}
                  aria-label={`Repetir o dress code de ${fmtDia(ultimo.data)}: ${emTexto(ultimo.dress)}`}>
                  Repetir o de {fmtDia(ultimo.data)}
                </button>
              )}
            </>
          )}
        </div>
      </section>
    );
  }

  /* ABERTO */
  const comCor = ed.combinacoes.filter(c => c.cores.length);
  const previa: DressCode | null = comCor.length
    ? { v: 1, id: salvo?.id || '', combinacoes: comCor, estilo: ed.estilo, orientacoes: ed.orientacoes, imagens: ed.imagens.filter(i => i.caminho || i.local).map(i => ({ caminho: i.caminho || '' })) }
    : null;
  const linhas = previa ? linhasDoDressCode(previa, null) : [];
  if (previa) {
    linhas.push(`${previa.imagens.length ? 'Cores e inspirações' : 'Ver as cores'}: ${salvo ? linkDoDressCode(site, salvo.id) : `${site.replace(/^https?:\/\//, '')}/dress/… (o link nasce quando você salva)`}`);
  }
  const combinacaoAtiva = ed.combinacoes[ativa] || ed.combinacoes[0];
  /* a combinação da IA: a escolhida, se tem cor; senão a primeira que tem */
  const valorParaIa = ed.combinacoes[paraIa]?.cores.length ? paraIa : Math.max(0, ed.combinacoes.findIndex(c => c.cores.length));
  const cheias = ed.imagens.length >= LIMITES.imagens;

  const paleta = (
    <div className="es-ec-dc-escolha">
      <div className="es-ec-dc-paleta" role="group" aria-label={ed.combinacoes.length > 1 ? `Cores da combinação ${ativa + 1}` : 'Cores'}>
        {PALETA.map(cor => {
          const tem = combinacaoAtiva.cores.some(k => k.hex === cor.hex);
          return (
            <button type="button" key={cor.hex} className="es-ec-dc-tinta" aria-pressed={tem} title={cor.nome} aria-label={cor.nome}
              disabled={travado} onClick={() => alternar(cor)}>
              <span className={`es-ec-dc-tinta-bola ${amostraClara(cor.hex) ? 'es-ec-dc-ponto-claro' : ''}`} style={{ background: cor.hex, color: tintaSobre(cor.hex) }}>
                {tem && <IcCheck />}
              </span>
            </button>
          );
        })}
      </div>
      {outra ? (
        <div className="es-ec-dc-outra" role="group" aria-label="Outra cor">
          <label className="es-ec-dc-seletor-rot">
            <span className="es-so-leitor">Escolher a cor</span>
            <input type="color" className="es-ec-dc-seletor" value={outra.hex} disabled={travado}
              onChange={e => {
                const hex = e.target.value.toLowerCase();
                setOutra(o => (o ? { ...o, hex, nome: o.mexeu ? o.nome : corMaisProxima(hex).nome } : o));
              }} />
          </label>
          <label className="es-campo es-ec-dc-outra-nome">
            <span>Nome da cor</span>
            <input className="es-ctl" maxLength={LIMITES.nomeDaCor} value={outra.nome} disabled={travado} enterKeyHint="done"
              autoComplete="off" placeholder="ex: Verde-água"
              onChange={e => { const nome = limparNome(e.target.value); setOutra(o => (o ? { ...o, nome, mexeu: true } : o)); }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); acrescentarOutra(); } }} />
          </label>
          <span className="es-ec-dc-outra-acoes">
            <button type="button" className="es-btn es-peq" disabled={travado} onClick={acrescentarOutra}>Acrescentar</button>
            <button type="button" className="es-btn es-txt es-peq" disabled={travado} onClick={() => setOutra(null)}>Fechar</button>
          </span>
        </div>
      ) : (
        <button type="button" className="es-btn es-txt es-peq es-ec-dc-mais" disabled={travado}
          onClick={() => setOutra({ hex: '#7f9cb3', nome: corMaisProxima('#7f9cb3').nome, mexeu: false })}>
          <IcMais />Outra cor
        </button>
      )}
    </div>
  );

  return (
    <section className="es-ec-dc" aria-labelledby={idc('tit')} ref={secaoRef}>
      <div className="es-ec-dc-cab">
        <span className="es-ec-rep-tit" id={idc('tit')} ref={tituloEd} tabIndex={-1}>
          {salvo ? 'Editar o dress code' : 'Definir o dress code'}
        </span>
      </div>
      <form className="es-ec-dc-ed" aria-labelledby={idc('tit')} aria-busy={gravando || undefined}
        onSubmit={e => { e.preventDefault(); void salvar(); }}>

        {anteriores.length > 0 && (
          <div className="es-ec-dc-parte" role="group" aria-labelledby={idc('ant')}>
            <span className="es-ec-dc-rot" id={idc('ant')}>Repetir de um culto anterior</span>
            <div className="es-fichas">
              {anteriores.map(a => (
                <button type="button" key={a.data} className="es-ficha" disabled={travado || gerando || preparando > 0} onClick={() => void repetir(a)}
                  aria-label={`${fmtDia(a.data)}: ${emTexto(a.dress)}`}>
                  <span className="es-ec-dc-pontos" aria-hidden="true">
                    {a.dress.combinacoes[0].cores.map(k => (
                      <span key={k.hex} className={`es-ec-dc-ponto es-ec-dc-ponto-peq ${amostraClara(k.hex) ? 'es-ec-dc-ponto-claro' : ''}`} style={{ background: k.hex }} />
                    ))}
                  </span>
                  {fmtDia(a.data)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* AS CORES */}
        <div className="es-ec-dc-parte" role="group" aria-labelledby={idc('cores')}>
          <span className="es-ec-dc-rot" id={idc('cores')}>Cores</span>
          <p className="es-ec-dc-dica">
            Toque numa cor para escolher, e de novo para tirar. Mais de uma combinação vira &ldquo;ou&rdquo; na mensagem: quem serve escolhe uma.
          </p>
          <ol className="es-ec-dc-combs">
            {ed.combinacoes.map((c, ci) => {
              const eAtiva = ci === ativa;
              return (
                <li key={ci} className={`es-ec-dc-comb ${eAtiva && ed.combinacoes.length > 1 ? 'es-ec-dc-comb-ativa' : ''}`}>
                  {ed.combinacoes.length > 1 && (
                    <div className="es-ec-dc-comb-cab">
                      <span className="es-ec-dc-comb-tit">Combinação {ci + 1}{ci > 0 ? ' (ou)' : ''}</span>
                      <span className="es-ec-dc-comb-acoes">
                        {!eAtiva && (
                          <button type="button" className="es-btn es-txt es-peq" disabled={travado} onClick={() => { setAtiva(ci); setOutra(null); setErro(''); }}>
                            Mudar as cores
                          </button>
                        )}
                        <button type="button" className="es-btn es-txt es-peq es-perigo" disabled={travado} onClick={() => tirarCombinacao(ci)}
                          aria-label={`Tirar a combinação ${ci + 1}`}>
                          Tirar
                        </button>
                      </span>
                    </div>
                  )}
                  {c.cores.length ? (
                    <ul className="es-ec-dc-escolhidas" aria-label={ed.combinacoes.length > 1 ? `Cores da combinação ${ci + 1}` : 'Cores escolhidas'}>
                      {c.cores.map(k => (
                        <li key={k.hex}>
                          <button type="button" className="es-ec-dc-escolhida" disabled={travado} onClick={() => tirarCor(ci, k.hex)}
                            aria-label={`Tirar ${k.nome}`}>
                            <span className={`es-ec-dc-ponto${amostraClara(k.hex) ? ' es-ec-dc-ponto-claro' : ''}`} style={{ background: k.hex }} aria-hidden="true" />
                            <span className="es-ec-dc-escolhida-nome">{k.nome}</span>
                            <IcX />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="es-ec-dc-sem">Nenhuma cor ainda.</p>
                  )}
                  {eAtiva && paleta}
                </li>
              );
            })}
          </ol>
          {ed.combinacoes.length < LIMITES.combinacoes && (
            <span className="es-linha">
              <button type="button" className="es-btn es-txt es-peq" disabled={travado || !ed.combinacoes[ed.combinacoes.length - 1].cores.length}
                onClick={novaCombinacao}>
                <IcMais />Outra combinação
              </button>
            </span>
          )}
        </div>

        {/* O ESTILO E AS ORIENTAÇÕES */}
        <div className="es-ec-dc-parte" role="group" aria-labelledby={idc('estilo')}>
          <span className="es-ec-dc-rot" id={idc('estilo')}>Estilo</span>
          <div className="es-fichas">
            <button type="button" className="es-ficha" aria-pressed={ed.estilo === null} disabled={travado}
              onClick={() => { const e0 = edRef.current; if (e0) mudar({ ...e0, estilo: null }); }}>Sem estilo</button>
            {ESTILOS.map(es => (
              <button type="button" key={es.chave} className="es-ficha" aria-pressed={ed.estilo === es.chave} disabled={travado}
                onClick={() => { const e0 = edRef.current; if (e0) mudar({ ...e0, estilo: es.chave }); }}>{es.nome}</button>
            ))}
          </div>
        </div>
        <label className="es-campo es-ec-dc-campo">
          <span>Orientações</span>
          <textarea className="es-ctl" rows={3} maxLength={LIMITES.orientacoes} value={ed.orientacoes} disabled={travado}
            placeholder="ex: camisa lisa, sem estampa; calça escura; tênis branco ou sapato"
            aria-describedby={idc('ori')}
            onChange={e => { const e0 = edRef.current; if (e0) mudar({ ...e0, orientacoes: limparTexto(e.target.value).slice(0, LIMITES.orientacoes) }); }} />
          <small id={idc('ori')}>Opcional. {ed.orientacoes.length}/{LIMITES.orientacoes}</small>
        </label>

        {/* AS INSPIRAÇÕES */}
        <div className="es-ec-dc-parte" role="group" aria-labelledby={idc('insp')}>
          <span className="es-ec-dc-rot" id={idc('insp')}>
            Inspirações{ed.imagens.length ? ` · ${ed.imagens.length} de ${LIMITES.imagens}` : ''}
          </span>
          <p className="es-ec-dc-dica">
            Fotos de referência do celular ou geradas por IA a partir das cores (sem pessoas). A foto aparece aqui na hora e sobe quando você salva.
          </p>
          {(ed.imagens.length > 0 || preparando > 0 || gerando) && (
            <ul className="es-ec-dc-imgs">
              {ed.imagens.map((im, i) => (
                <li className="es-ec-dc-img" key={im.chave}>
                  <span className="es-ec-dc-foto">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={srcDe(im)} alt={`Inspiração ${i + 1}${im.ia ? ', gerada por IA' : ''}`} decoding="async" />
                    {(im.ia || !im.caminho) && <span className="es-ec-dc-selo">{im.ia ? 'IA' : 'Nova'}</span>}
                  </span>
                  <span className="es-ec-dc-img-acoes">
                    <button type="button" className="es-btn es-txt es-peq" disabled={travado || preparando > 0}
                      onClick={() => pedirTroca(im.chave)} aria-label={`Trocar a inspiração ${i + 1}`}>Trocar</button>
                    <button type="button" className="es-btn es-txt es-peq es-perigo" disabled={travado}
                      onClick={() => tirarImagem(im.chave)} aria-label={`Tirar a inspiração ${i + 1}`}>Tirar</button>
                  </span>
                </li>
              ))}
              {Array.from({ length: preparando }, (_, k) => (
                <li className="es-ec-dc-img" key={`p${k}`} aria-hidden="true">
                  <span className="es-ec-dc-foto es-ec-dc-espera">Preparando a foto…</span>
                </li>
              ))}
              {gerando && (
                <li className="es-ec-dc-img" key="ia">
                  <span className="es-ec-dc-foto es-ec-dc-espera">Gerando com IA… leva até meio minuto</span>
                </li>
              )}
            </ul>
          )}
          <div className="es-ec-dc-acoes">
            <input ref={inputFotos} type="file" accept="image/jpeg,image/png,image/webp" multiple className="es-ec-dc-arquivo" tabIndex={-1} aria-hidden="true"
              onChange={e => void escolherFotos(e, null)} />
            <input ref={inputTroca} type="file" accept="image/jpeg,image/png,image/webp" className="es-ec-dc-arquivo" tabIndex={-1} aria-hidden="true"
              onChange={e => { const t = trocarRef.current; trocarRef.current = null; void escolherFotos(e, t); }} />
            <button type="button" className="es-btn es-peq" disabled={travado || cheias || preparando > 0}
              onClick={() => inputFotos.current?.click()}>
              Enviar fotos
            </button>
            <button type="button" className="es-btn es-peq" disabled={travado || gerando || cheias || !comCor.length}
              aria-describedby={idc('ia')} aria-busy={gerando || undefined} onClick={() => void gerar()}>
              Gerar com IA
            </button>
            {comCor.length > 1 && (
              <label className="es-ec-dc-para">
                <span>com a</span>
                <select className="es-ctl es-estreito" value={valorParaIa} disabled={travado || gerando}
                  onChange={e => setParaIa(Number(e.target.value))}>
                  {ed.combinacoes.map((c, ci) => (c.cores.length
                    ? <option key={ci} value={ci}>combinação {ci + 1}</option> : null))}
                </select>
              </label>
            )}
          </div>
          <p className="es-ec-dc-dica" id={idc('ia')} aria-live="polite">
            {!comCor.length ? 'Escolha as cores para gerar com IA.'
              : restam === null ? `A IA gera até ${LIMITES.iaPorDia} imagens por dia para o ministério.`
                : restam > 0 ? `${restam === 1 ? 'Resta 1 imagem' : `Restam ${restam} imagens`} por IA nas próximas 24 horas.`
                  : 'O limite de imagens por IA das últimas 24 horas acabou. Envie uma foto.'}
          </p>
        </div>

        {/* COMO VAI NA MENSAGEM DO GRUPO */}
        {previa && (
          <details className="es-ec-dc-msg">
            <summary>Como vai na mensagem do grupo</summary>
            <pre className="es-msg">{linhas.join('\n')}</pre>
          </details>
        )}

        {conflito && (
          <Aviso tom="warn">
            <b>Outra pessoa da liderança {conflito.atual ? 'salvou um dress code' : 'tirou o dress code'} deste culto agora há pouco.</b>{' '}
            {conflito.atual ? `O que está salvo: ${emTexto(conflito.atual)}. ` : ''}
            Salvar de novo troca pelo seu; Cancelar fica com o que está salvo.
          </Aviso>
        )}
        {erro && <p className="es-erro-campo es-ec-dc-erro" role="alert">{erro}</p>}

        <div className="es-ec-dc-pe">
          <button type="submit" className="es-btn es-pri es-peq" disabled={travado || gerando || preparando > 0} aria-busy={gravando || undefined}>
            {gravando ? 'Salvando…' : conflito ? 'Salvar o meu' : 'Salvar o dress code'}
          </button>
          <button type="button" className="es-btn es-txt es-peq" disabled={gravando} onClick={() => void cancelar()}>Cancelar</button>
          {antesRef.current && (
            <button type="button" className="es-btn es-txt es-peq es-perigo es-ec-dc-tirar" disabled={travado}
              onClick={() => void tirar()}>
              Tirar o dress code
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
