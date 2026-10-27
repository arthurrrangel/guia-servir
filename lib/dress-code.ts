/* O DRESS CODE DO LOUVOR · 116 · 26/10/2026.

   O líder do Louvor pediu, e o Arthur trouxe: "definir previamente o padrão
   de vestimenta dos voluntários escalados em cada culto". Cores (uma ou
   várias, em combinações), o estilo, orientações e imagens de inspiração.
   "O objetivo é que ninguém precise ficar perguntando no grupo quais roupas
   ou cores deverá utilizar."

   Aqui fica a parte pura, dos dois lados (a tela do líder, a página de quem
   serve, a do link do grupo, a mensagem do WhatsApp e a rota da IA), testada
   em scripts/dress-code.test.mjs. O banco confere o mesmo formato em
   `dress_code_valido` (migração 116): o que esta folha aceita, o banco aceita.

   OS TIPOS, OS ESTILOS E A MENSAGEM MORAM NO MOTOR (lib/engine.ts), que
   monta a mensagem do grupo e a assinatura do envio: o motor não importa
   nada (os testes dele rodam no Node puro), e esta folha reexporta. */

import {
  type CombinacaoDoDress, type CorDoDress, type DressCode, type EstiloDoDress, type ImagemDoDress,
  ESTILOS, LIMITES_DO_DRESS, caminhoDoDressValido, lerDressCode, linhasDoDressCode, linkDoDressCode, nomeDoEstilo,
  parteDaAssinaturaDoDress,
} from './engine';
export type { CombinacaoDoDress, CorDoDress, DressCode, EstiloDoDress, ImagemDoDress };
export { ESTILOS, lerDressCode, linhasDoDressCode, linkDoDressCode, nomeDoEstilo, parteDaAssinaturaDoDress };
/* o que a tela edita e manda gravar: sem id, versão e hora (o banco põe) */
export type RascunhoDoDress = Omit<DressCode, 'v' | 'id' | 'atualizado_em'>;

export const MINISTERIOS_COM_DRESS = ['louvor'];
export const temDressCode = (slug: string | null | undefined) => !!slug && MINISTERIOS_COM_DRESS.includes(slug);

export const LIMITES = LIMITES_DO_DRESS;
export const ARMARIO = 'dress-code';

/* A PALETA. As cores que um ministério de louvor usa de verdade: neutros,
   terrosos, azuis, verdes, vinhos e rosas, e alguns de destaque. O nome é o
   que vai na mensagem do grupo (hex não diz nada a ninguém). */
export const PALETA: CorDoDress[] = [
  { hex: '#111111', nome: 'Preto' },
  { hex: '#ffffff', nome: 'Branco' },
  { hex: '#f1ede4', nome: 'Off-white' },
  { hex: '#c9c9c9', nome: 'Cinza-claro' },
  { hex: '#5a5c63', nome: 'Cinza-chumbo' },
  { hex: '#e3d5bd', nome: 'Bege' },
  { hex: '#d2b48c', nome: 'Areia' },
  { hex: '#b5763a', nome: 'Caramelo' },
  { hex: '#6b4429', nome: 'Marrom' },
  { hex: '#c0583b', nome: 'Terracota' },
  { hex: '#d1a22c', nome: 'Mostarda' },
  { hex: '#6b6e3a', nome: 'Verde-oliva' },
  { hex: '#4b5d3a', nome: 'Verde-musgo' },
  { hex: '#a7b89a', nome: 'Verde-sálvia' },
  { hex: '#1f7a5a', nome: 'Verde-esmeralda' },
  { hex: '#1f2a44', nome: 'Azul-marinho' },
  { hex: '#2850a8', nome: 'Azul-royal' },
  { hex: '#9cc3e6', nome: 'Azul-claro' },
  { hex: '#4b6584', nome: 'Jeans' },
  { hex: '#5e1a2a', nome: 'Vinho' },
  { hex: '#c62828', nome: 'Vermelho' },
  { hex: '#d4a5a5', nome: 'Rosa-antigo' },
  { hex: '#f2c4ce', nome: 'Rosa-claro' },
  { hex: '#b9a3d6', nome: 'Lilás' },
  { hex: '#e07b39', nome: 'Laranja' },
  { hex: '#f3e3a1', nome: 'Amarelo-claro' },
  { hex: '#c9a54a', nome: 'Dourado' },
  { hex: '#bfc3c8', nome: 'Prata' },
];

const HEX = /^#[0-9a-f]{6}$/;
/* no nome da cor, nenhum caractere de controle: nem os de C1 nem as quebras
   do Unicode, que o `[[:cntrl:]]` do banco também recusa */
// eslint-disable-next-line no-control-regex
const CONTROLE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
// eslint-disable-next-line no-control-regex
const CONTROLE_MENOS_QUEBRA = /[\u0001-\u0009\u000b-\u001f\u007f]/;

export const caminhoValido = caminhoDoDressValido;

/* o mesmo que o banco aceita (dress_code_valido), para a tela não mandar o
   que vai voltar recusado. `equipeId`: as imagens só da pasta do ministério */
export function rascunhoValido(r: RascunhoDoDress, equipeId: string): { ok: true } | { ok: false; erro: string } {
  if (!Array.isArray(r.combinacoes) || r.combinacoes.length < 1) return { ok: false, erro: 'Escolha ao menos uma cor.' };
  if (r.combinacoes.length > LIMITES.combinacoes) return { ok: false, erro: `No máximo ${LIMITES.combinacoes} combinações.` };
  for (const c of r.combinacoes) {
    if (!Array.isArray(c.cores) || c.cores.length < 1) return { ok: false, erro: 'Toda combinação precisa de ao menos uma cor.' };
    if (c.cores.length > LIMITES.cores) return { ok: false, erro: `No máximo ${LIMITES.cores} cores por combinação.` };
    for (const cor of c.cores) {
      if (!HEX.test(cor.hex)) return { ok: false, erro: 'Uma das cores não é válida.' };
      const nome = (cor.nome || '').trim();
      if (!nome || nome.length > LIMITES.nomeDaCor || CONTROLE.test(cor.nome)) return { ok: false, erro: 'Dê um nome a cada cor (até 30 letras).' };
    }
  }
  if (r.estilo !== null && !ESTILOS.some(e => e.chave === r.estilo)) return { ok: false, erro: 'Estilo desconhecido.' };
  if ((r.orientacoes || '').length > LIMITES.orientacoes) return { ok: false, erro: `As orientações passam de ${LIMITES.orientacoes} letras.` };
  if (CONTROLE_MENOS_QUEBRA.test(r.orientacoes || '')) return { ok: false, erro: 'As orientações têm um caractere estranho.' };
  if (r.imagens.length > LIMITES.imagens) return { ok: false, erro: `No máximo ${LIMITES.imagens} imagens.` };
  const vistos = new Set<string>();
  for (const im of r.imagens) {
    if (!caminhoValido(im.caminho) || im.caminho.split('/')[0] !== equipeId) return { ok: false, erro: 'Uma das imagens não é deste ministério.' };
    if (vistos.has(im.caminho)) return { ok: false, erro: 'Imagem repetida.' };
    vistos.add(im.caminho);
  }
  return { ok: true };
}

/* reaproveitar: o que se copia de um culto para outro (as mesmas imagens) */
export const rascunhoDe = (d: DressCode): RascunhoDoDress => ({
  combinacoes: d.combinacoes.map(c => ({ cores: c.cores.map(k => ({ ...k })) })),
  estilo: d.estilo, orientacoes: d.orientacoes, imagens: d.imagens.map(i => ({ ...i })),
});
export const rascunhoVazio = (): RascunhoDoDress => ({ combinacoes: [{ cores: [] }], estilo: null, orientacoes: '', imagens: [] });

/* ===================================================== as imagens */

/** Um UUID v4, também sem `crypto.randomUUID`, que só existe em contexto
    seguro (http na rede local, iOS antes do 15.4 não têm): o caminho da
    imagem precisa do formato que o armário confere, e o atalho que estava
    aqui montava o primeiro grupo com 11 letras (achado da revisão). */
export function uuidV4(c: Pick<Crypto, 'getRandomValues'> & { randomUUID?: () => string } | undefined = globalThis.crypto): string {
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const urlDaImagem = (supabaseUrl: string, caminho: string) =>
  `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${ARMARIO}/${caminho}`;

export function caminhoNovoDaImagem(equipeId: string, ext: 'webp' | 'jpg' | 'png', id: string): string {
  return `${equipeId.toLowerCase()}/${id.toLowerCase()}.${ext}`;
}

/* ===================================================== as cores */

const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
/** A cor da paleta mais perto (o nome sugerido para uma cor personalizada). */
export function corMaisProxima(hex: string): CorDoDress {
  if (!HEX.test(hex)) return PALETA[0];
  const [r, g, b] = rgb(hex);
  let melhor = PALETA[0], dist = Infinity;
  for (const c of PALETA) {
    const [r2, g2, b2] = rgb(c.hex);
    /* distância com o peso do olho (verde pesa mais, azul menos) */
    const d = 2 * (r - r2) ** 2 + 4 * (g - g2) ** 2 + 3 * (b - b2) ** 2;
    if (d < dist) { dist = d; melhor = c; }
  }
  return melhor;
}
/** Texto legível sobre a amostra: escuro nas cores claras, claro nas escuras. */
export function tintaSobre(hex: string): '#111111' | '#ffffff' {
  if (!HEX.test(hex)) return '#111111';
  const [r, g, b] = rgb(hex).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? '#111111' : '#ffffff';
}
/** Amostra que some no fundo branco da tela pede contorno. */
export const amostraClara = (hex: string) => HEX.test(hex) && rgb(hex).every(v => v > 225);

/* ===================================================== reaproveitar */

/** Os dress codes de cultos anteriores a `d`, do mais novo para o mais velho,
    sem repetir o mesmo conjunto (a mesma cor e estilo em três domingos vira
    uma opção só). */
export function dressCodesAnteriores(escalas: Record<string, { dressCode?: DressCode | null } | undefined>, d: string, limite = 8)
  : { data: string; dress: DressCode }[] {
  const out: { data: string; dress: DressCode }[] = [];
  const vistos = new Set<string>();
  for (const data of Object.keys(escalas).filter(x => x < d).sort().reverse()) {
    const dress = escalas[data]?.dressCode;
    if (!dress) continue;
    const chave = JSON.stringify([dress.combinacoes, dress.estilo, dress.orientacoes, dress.imagens.map(i => i.caminho)]);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    out.push({ data, dress });
    if (out.length >= limite) break;
  }
  return out;
}

/* ===================================================== a IA */

const semLinks = (t: string) => t.replace(/https?:\/\/\S+/g, ' ').replace(/\s+/g, ' ').trim();

/** O pedido ao gerador de imagens. Roupas sem gente (flat lay / cabide):
    nada de rosto, corpo ou marca, que é onde os filtros dos geradores
    barram, e é o que serve de referência para a equipe. Em inglês: é a
    língua em que esses modelos seguem melhor as instruções.

    AS ORIENTAÇÕES DO LÍDER VÊM LOGO DEPOIS DA CENA, COMO REGRA PARA AS DUAS
    ROUPAS, E O ESTILO SÓ PREENCHE O QUE ELAS NÃO DIZEM. As provas em
    produção (27/10/2026):
      · no fim, entre aspas e como "notas", o gerador passou por cima delas:
        com "Calça comprida; camisa lisa sem estampa." e o Esporte fino,
        desenhou bermuda nas duas opções;
      · como regra, mas com "opções" soltas, uma roupa seguiu a regra e a
        outra o estilo: com o Casual e "Camisa social de manga longa; calça
        comprida; sapato, sem tênis.", saiu uma camisa social com sapato e
        uma camiseta com tênis.
    A cena pede duas roupas, de homem e de mulher (a equipe tem os dois).
    As regras não mandam na cena: sem gente, sem texto e sem marca continua. */
export function promptDaInspiracao(r: Pick<RascunhoDoDress, 'combinacoes' | 'estilo' | 'orientacoes'>, combinacao = 0): string {
  const c = r.combinacoes[Math.min(Math.max(combinacao, 0), r.combinacoes.length - 1)] || { cores: [] };
  const cores = c.cores.map(k => `${k.nome.trim()} (${k.hex})`).join(', ');
  const estilo = ESTILOS.find(e => e.chave === r.estilo)?.ingles
    || 'modest, modern church worship team outfit (shirt or blouse, full-length trousers or a knee-length or longer skirt or dress, clean shoes)';
  const notas = semLinks(r.orientacoes || '').replace(/"/g, "'").slice(0, 220);
  return [
    'Editorial flat lay photograph of two complete outfits for church worship team members, side by side (one for a man, one for a woman), laid out neatly on a clean light neutral surface, soft natural daylight, high detail.',
    notas ? `MANDATORY clothing rules from the team leader, written in Brazilian Portuguese: "${notas}". Understand them and apply every rule to BOTH outfits and to every garment in the image; they take priority over the style below.` : '',
    `Color palette strictly limited to: ${cores || 'neutral tones'}. Use these colors as the main garment colors.`,
    notas ? `Style, only for what the rules above do not specify: ${estilo}.` : `Style: ${estilo}.`,
    'Modest and appropriate for a church service.',
    'No people, no faces, no hands, no mannequins with faces, no text, no letters, no logos, no brand names.',
  ].filter(Boolean).join(' ');
}

/* ===================================================== o que as portas devolvem */

/** Um culto com dress code na página de quem serve (`eu_dress_codes`). */
export type DressDoLink = { culto_id: string; data: string; evento: string | null; inicio: string | null; equipe: string; dress: DressCode };
export function dressDoLink(x: unknown): DressDoLink[] {
  if (!Array.isArray(x)) return [];
  const out: DressDoLink[] = [];
  for (const r of x) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const dress = lerDressCode(o.dress);
    const data = typeof o.data === 'string' ? o.data.slice(0, 10) : '';
    if (!dress || typeof o.culto_id !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data)) continue;
    out.push({
      culto_id: o.culto_id, data, dress,
      evento: typeof o.evento === 'string' && o.evento ? o.evento : null,
      inicio: typeof o.inicio === 'string' && o.inicio ? o.inicio : null,
      equipe: typeof o.equipe === 'string' ? o.equipe : '',
    });
  }
  return out.sort((a, b) => a.data.localeCompare(b.data) || (a.inicio || '').localeCompare(b.inicio || ''));
}

/** A página do link do grupo (`dress_code_publico`). */
export type DressPublico = { data: string; evento: string | null; inicio: string | null; equipe: string; dress: DressCode };
export function dressPublico(x: unknown): DressPublico | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  if (o.ok !== true) return null;
  const dress = lerDressCode(o.dress);
  const data = typeof o.data === 'string' ? o.data.slice(0, 10) : '';
  if (!dress || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;
  return {
    data, dress,
    evento: typeof o.evento === 'string' && o.evento ? o.evento : null,
    inicio: typeof o.inicio === 'string' && o.inicio ? o.inicio : null,
    equipe: typeof o.equipe === 'string' ? o.equipe : '',
  };
}
/** O id do link (/dress/<id>): o mesmo formato que o banco gera. */
export const idDoDressValido = (id: unknown): id is string =>
  typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
/** A linha que o WhatsApp mostra embaixo do título do link. */
export function resumoDoDress(d: DressCode): string {
  const cores = d.combinacoes.map(c => c.cores.map(k => k.nome).join(' + ')).join(' ou ');
  const estilo = nomeDoEstilo(d.estilo);
  return [cores, estilo].filter(Boolean).join(' · ');
}
