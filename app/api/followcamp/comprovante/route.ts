/* =============================================================================
   /api/followcamp/comprovante — o pagamento e o comprovante pelo link pessoal
   (19/10/2026, migração 114)

   POST { token, codigo, meio, valor, titular?, arquivo? (base64), semArquivo? }

   · com `arquivo`: guarda o comprovante no pagamento do código (e cria o
     aviso A CONFERIR, se ainda não existe), sempre na ficha do link;
   · com `semArquivo: true`: só o aviso ("paguei, mando o comprovante depois").

   O servidor confere tudo de novo (lib/followcamp-minha.ts): o referente sai
   da ficha, o valor não passa do que falta, o cartão só no valor do link, o
   arquivo é foto ou PDF até 3 MB. Nada de dado no log. Quem confirma o
   dinheiro continua sendo a organização, no painel.
   ============================================================================= */
import { NextResponse } from 'next/server';
import { bancoLigado, gravarComprovante, informarPagamento, lerMinha } from '@/lib/followcamp-banco';
import { conferirArquivo, conferirPagamentoDoLink } from '@/lib/followcamp-minha';
import { TOKEN_OK } from '@/lib/followcamp-cobranca';
import { passe, deQuem } from '@/lib/teto-de-taxa';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const SEM_CACHE = { 'Cache-Control': 'no-store' };
const ERROS: Record<string, string> = {
  LINK_INVALIDO: 'Este link não é de nenhuma inscrição.',
  CODIGO_INVALIDO: 'Código do pagamento inválido.',
  CODIGO_DE_OUTRA_FICHA: 'Este código é de outra inscrição. Recarregue a página e gere o pagamento de novo.',
  LIMITE: 'Este pagamento já tem 3 comprovantes. Se precisar trocar, fale com a organização.',
  TIPO_INVALIDO: 'O comprovante precisa ser uma foto (JPG, PNG ou WEBP) ou um PDF.',
  ARQUIVO_INVALIDO: 'Não consegui ler esse arquivo. Mande um print ou o PDF do comprovante.',
  ARQUIVO_GRANDE: 'O arquivo passa de 3 MB. Mande um print do comprovante.',
};
const falha = (erro: string, status: number) => NextResponse.json({ ok: false, erro }, { status, headers: SEM_CACHE });

export async function POST(req: Request) {
  const p = passe('fc27comprovante:' + deQuem(req), 30, 600);
  if (!p.ok) return NextResponse.json({ ok: false, erro: 'Muitos envios deste aparelho agora. Espere um instante.' }, { status: 429, headers: { 'Retry-After': String(p.esperar), ...SEM_CACHE } });

  let corpo: Record<string, unknown> = {};
  try { const j = await req.json(); if (j && typeof j === 'object') corpo = j as Record<string, unknown>; } catch {
    return falha('Pedido inválido. Se o arquivo for grande, mande um print do comprovante.', 400);
  }
  const token = String(corpo.token ?? '');
  if (!TOKEN_OK.test(token)) return falha(ERROS.LINK_INVALIDO, 400);
  const semArquivo = corpo.semArquivo === true;
  const arq = semArquivo ? null : conferirArquivo(corpo.arquivo);
  if (arq && !arq.ok) return falha(arq.erro, 400);
  if (!bancoLigado()) return falha('O sistema está fora do ar. Tente de novo em instantes.', 503);

  const m = await lerMinha(token);
  if (!m.ok) {
    if (m.erro === 'FORA_DO_AR') return falha('O sistema está fora do ar. Tente de novo em instantes.', 503);
    return falha(m.erro === 'CANCELADA' ? 'Esta inscrição foi cancelada. Fale com a organização.' : ERROS.LINK_INVALIDO, 404);
  }
  const v = conferirPagamentoDoLink(corpo, m.ficha, m.pagamentos);
  if (!v.ok) return falha(v.erro, 400);

  const pedido = {
    ficha_token: token, codigo: v.dados.codigo, meio: v.dados.meio, referente: v.dados.referente,
    valor: v.dados.valor, titular: v.dados.titular || null, campista: m.ficha.campista,
  };
  const r = arq && arq.ok
    ? await gravarComprovante({ ...pedido, dados: arq.dados.base64 })
    : v.dados.repetido
      ? { ok: true as const }
      : await informarPagamento(pedido);
  if (!r.ok) {
    if (!r.erro) console.error('[followcamp-comprovante] o banco não gravou:', r.motivo);
    return falha((r.erro && ERROS[r.erro]) || 'Não deu certo agora. Tente de novo em instantes.', r.erro ? 400 : 503);
  }
  return NextResponse.json({ ok: true, ...(typeof r.comprovantes === 'number' ? { comprovantes: r.comprovantes } : {}) }, { headers: SEM_CACHE });
}
