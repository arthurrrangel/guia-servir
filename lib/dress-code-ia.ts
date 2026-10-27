/* AS IMAGENS DE INSPIRAÇÃO GERADAS POR IA · 116 · 26/10/2026.

   O corpo de /api/dress-code/gerar (app/api/dress-code/gerar/route.ts),
   separado da rota para o teste executar de verdade, com um banco e um
   gerador de mentira (scripts/dress-code-ia.test.mjs).

   POST com o JWT da liderança (Authorization: Bearer <access_token>) e
   { equipe, rascunho: { combinacoes, estilo, orientacoes }, combinacao }.
     1. o banco decide se pode, como quem chamou: dress_code_pode_gerar
        confere a liderança, o Louvor e a conta de 12 imagens por ministério
        a cada 24 horas (o gerador custa por imagem). Antes de gerar: tentar
        de novo também conta;
     2. o pedido ao gerador sai do rascunho (lib/dress-code.ts): roupas sem
        gente, sem texto e sem marca;
     3. a imagem vai para o armário do ministério (dress-code/<ministério>/
        <uuid>.<ext>) pela chave do servidor, e volta o caminho. A tela
        mostra a imagem antes de o líder gravar o dress code; se ele desistir,
        o arquivo fica no armário, como as enviadas.
   Sem nada além do que precisa: a resposta não diz por que o gerador falhou
   (o registro do servidor diz). */
import { type CombinacaoDoDress, type EstiloDoDress, ESTILOS, LIMITES_DO_DRESS } from '@/lib/engine';
import { promptDaInspiracao } from '@/lib/dress-code';

const SEM_CACHE = { 'Cache-Control': 'no-store' };
const responde = (corpo: unknown, status = 200) => Response.json(corpo, { status, headers: SEM_CACHE });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX = /^#[0-9a-f]{6}$/;
// eslint-disable-next-line no-control-regex
const CONTROLE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Banco = { rpc: (fn: string, args: Record<string, unknown>) => any; storage: any };
export type Gerado = { bytes: Uint8Array; tipo: string };
export type DepsDaGeracao = {
  /* o banco como o líder que chamou (o JWT dele): é o banco que decide */
  comoQuemChamou: (jwt: string) => Banco | null;
  /* o banco com a chave do servidor: só para guardar a imagem no armário */
  doServidor: () => Banco | null;
  gerar: (prompt: string, sinal: AbortSignal) => Promise<Gerado>;
  novoId: () => string;
  log?: (...x: unknown[]) => void;
};

const EXT: Record<string, 'webp' | 'png' | 'jpg'> = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' };

/* o rascunho que chega: só cores, estilo e orientações, no formato do banco */
export function lerPedidoDaGeracao(x: unknown): { equipe: string; combinacoes: CombinacaoDoDress[]; estilo: EstiloDoDress | null; orientacoes: string; combinacao: number } | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const o = x as Record<string, any>;
  if (typeof o.equipe !== 'string' || !UUID.test(o.equipe)) return null;
  const r = o.rascunho;
  if (!r || typeof r !== 'object' || !Array.isArray(r.combinacoes) || !r.combinacoes.length || r.combinacoes.length > LIMITES_DO_DRESS.combinacoes) return null;
  const combinacoes: CombinacaoDoDress[] = [];
  for (const c of r.combinacoes) {
    if (!c || !Array.isArray(c.cores) || !c.cores.length || c.cores.length > LIMITES_DO_DRESS.cores) return null;
    const cores = [];
    for (const k of c.cores) {
      if (!k || typeof k.hex !== 'string' || !HEX.test(k.hex) || typeof k.nome !== 'string') return null;
      const nome = k.nome.trim();
      if (!nome || nome.length > LIMITES_DO_DRESS.nomeDaCor || CONTROLE.test(nome)) return null;
      cores.push({ hex: k.hex, nome });
    }
    combinacoes.push({ cores });
  }
  const estilo = r.estilo === null || r.estilo === undefined ? null : ESTILOS.some(e => e.chave === r.estilo) ? r.estilo : undefined;
  if (estilo === undefined) return null;
  const orientacoes = typeof r.orientacoes === 'string' ? r.orientacoes.slice(0, LIMITES_DO_DRESS.orientacoes) : '';
  const combinacao = Number.isInteger(o.combinacao) && o.combinacao >= 0 && o.combinacao < combinacoes.length ? o.combinacao : 0;
  return { equipe: o.equipe.toLowerCase(), combinacoes, estilo, orientacoes, combinacao };
}

export async function atenderGeracao(req: Request, deps: DepsDaGeracao): Promise<Response> {
  const m = /^Bearer\s+([\w-]+\.[\w-]+\.[\w-]+)$/.exec(req.headers.get('authorization') || '');
  if (!m) return responde({ ok: false, erro: 'SEM_LOGIN' }, 401);
  const bruto = await req.text().catch(() => '');
  if (!bruto || bruto.length > 20_000) return responde({ ok: false, erro: 'PEDIDO_INVALIDO' }, 400);
  let json: unknown;
  try { json = JSON.parse(bruto); } catch { return responde({ ok: false, erro: 'PEDIDO_INVALIDO' }, 400); }
  const ped = lerPedidoDaGeracao(json);
  if (!ped) return responde({ ok: false, erro: 'PEDIDO_INVALIDO' }, 400);

  /* 1 · o banco decide (e conta), como quem chamou */
  const banco = deps.comoQuemChamou(m[1]);
  if (!banco) return responde({ ok: false, erro: 'SEM_BANCO' }, 503);
  let pode: { ok?: boolean; erro?: string; restam?: number } | null = null;
  try {
    const r = await banco.rpc('dress_code_pode_gerar', { p_equipe: ped.equipe });
    if (r.error) {
      /* JWT vencido ou de outro projeto: o PostgREST recusa antes da função */
      const cod = String(r.error.code || '');
      if (cod === 'PGRST301' || cod === 'PGRST302' || /jwt/i.test(String(r.error.message || ''))) return responde({ ok: false, erro: 'SEM_LOGIN' }, 401);
      if (cod === 'PGRST202' || cod === '42883') return responde({ ok: false, erro: 'SEM_116' }, 503);
      return responde({ ok: false, erro: 'BANCO' }, 502);
    }
    pode = r.data;
  } catch { return responde({ ok: false, erro: 'BANCO' }, 502); }
  if (!pode?.ok) {
    const erro = pode?.erro || 'SEM_PERMISSAO';
    return responde({ ok: false, erro }, erro === 'LIMITE' ? 429 : 403);
  }

  /* 2 · o gerador, com prazo (a função da Vercel tem 60 s) */
  const prompt = promptDaInspiracao(ped, ped.combinacao);
  let img: Gerado;
  try {
    img = await deps.gerar(prompt, AbortSignal.timeout(50_000));
  } catch (e) {
    deps.log?.('dress-code: o gerador falhou:', (e as Error)?.name, String((e as Error)?.message || e).slice(0, 300));
    const msg = String((e as Error)?.message || e);
    const tempo = (e as Error)?.name === 'TimeoutError' || /abort|timeout/i.test(msg);
    const recusou = /moderation|safety|content.?policy|blocked/i.test(msg);
    return responde({ ok: false, erro: tempo ? 'IA_TEMPO' : recusou ? 'IA_RECUSOU' : 'IA_INDISPONIVEL' }, 502);
  }
  const ext = EXT[img.tipo];
  if (!ext || !img.bytes?.length || img.bytes.length > LIMITES_DO_DRESS.bytes) return responde({ ok: false, erro: 'IA_INDISPONIVEL' }, 502);

  /* 3 · o armário do ministério */
  const servidor = deps.doServidor();
  if (!servidor) return responde({ ok: false, erro: 'SEM_BANCO' }, 503);
  const caminho = `${ped.equipe}/${deps.novoId().toLowerCase()}.${ext}`;
  try {
    const up = await servidor.storage.from('dress-code').upload(caminho, img.bytes, { contentType: img.tipo, upsert: false, cacheControl: '31536000' });
    if (up.error) { deps.log?.('dress-code: o armário recusou:', String(up.error.message || up.error).slice(0, 200)); return responde({ ok: false, erro: 'ARMARIO' }, 502); }
  } catch (e) {
    deps.log?.('dress-code: o armário falhou:', String((e as Error)?.message || e).slice(0, 200));
    return responde({ ok: false, erro: 'ARMARIO' }, 502);
  }
  return responde({ ok: true, caminho, ia: true, restam: typeof pode.restam === 'number' ? pode.restam : null });
}

/* a mensagem para cada erro, na tela do líder */
export function erroDaGeracao(codigo: string | null | undefined): string {
  switch (codigo) {
    case 'LIMITE': return `Chegou ao limite de ${LIMITES_DO_DRESS.iaPorDia} imagens geradas em 24 horas. Envie uma foto, ou tente amanhã.`;
    case 'SEM_PERMISSAO': return 'Só a liderança do Louvor gera imagens.';
    case 'SO_LOUVOR': return 'O dress code é do Louvor.';
    case 'SEM_LOGIN': return 'Sua sessão venceu. Entre de novo.';
    case 'IA_TEMPO': return 'A geração demorou demais. Tente de novo.';
    case 'IA_RECUSOU': return 'O gerador recusou este pedido. Mude as orientações e tente de novo.';
    case 'IA_INDISPONIVEL': return 'A geração por IA não está disponível agora. Envie uma foto de referência.';
    case 'ARMARIO': return 'A imagem foi gerada, mas não consegui guardar. Tente de novo.';
    case 'SEM_116': return 'A geração por IA ainda não foi ligada no banco. Avise quem cuida do sistema.';
    case 'SEM_BANCO': return 'A geração por IA não está disponível agora. Envie uma foto de referência.';
    default: return 'Não consegui gerar a imagem agora. Tente de novo em instantes.';
  }
}
