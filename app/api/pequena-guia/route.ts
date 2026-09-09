/* =============================================================================
   POST /api/pequena-guia — o pedido "quero encontrar uma Pequena Guia"

   08/09/2026, pedido do Arthur: o formulário da /pequena-guia (nome, telefone,
   CEP, idade, melhor dia) precisa ficar registrado numa planilha organizada,
   além de abrir a conversa. Este é o único lugar por onde o dado passa.

   PARA ONDE VAI: uma planilha do Google, por um Apps Script publicado como
   app da web. A URL dele mora na variável de ambiente PLANILHA_PEQUENA_GUIA_URL
   (painel da Vercel), nunca no código nem no navegador: o visitante fala com
   /api/pequena-guia, e é o servidor que fala com a planilha. Sem a variável,
   a rota responde `guardado:false` e a tela segue pelo canal de conversa —
   nada quebra, e a tela diz a verdade sobre o que aconteceu.

   O QUE NÃO ENTRA: o banco do sistema de escala. A decisão registrada em
   app/pequena-guia/page.tsx continua valendo — dado de visitante não mora ao
   lado da escala de todo mundo.

   PROTEÇÕES, na medida: validação estrita dos cinco campos (o Apps Script
   recebe só o que passou), um campo-isca (`site`) que humano não vê e robô
   preenche, e um teto de 8s na chamada à planilha para o visitante nunca
   ficar esperando um servidor do Google.

   O SCRIPT QUE VAI NA PLANILHA (Extensões → Apps Script; Implantar → App da
   web; Executar como: eu; Acesso: qualquer pessoa):

     function doPost(e) {
       var d = JSON.parse(e.postData.contents);
       var s = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
       s.appendRow([new Date(), d.nome, d.telefone, d.cep, d.idade, d.dia, d.origem]);
       return ContentService.createTextOutput(JSON.stringify({ ok: true }))
         .setMimeType(ContentService.MimeType.JSON);
     }

   Cabeçalho da planilha, linha 1: Data · Nome · Telefone · CEP · Idade ·
   Melhor dia · Origem.
   ============================================================================= */
import { NextResponse } from 'next/server';
import { validar } from '@/lib/pedido-pequena-guia';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let corpo: unknown;
  try { corpo = await req.json(); } catch { return NextResponse.json({ ok: false, erro: 'Pedido inválido.' }, { status: 400 }); }

  const v = validar(corpo);
  if ('erro' in v) return NextResponse.json({ ok: false, erro: v.erro, campo: v.campo }, { status: 400 });

  const url = process.env.PLANILHA_PEQUENA_GUIA_URL;
  if (!url) return NextResponse.json({ ok: true, guardado: false, motivo: 'planilha não configurada' });

  try {
    const ctl = new AbortController();
    const teto = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(url, {
      method: 'POST', redirect: 'follow', signal: ctl.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...v.pedido, origem: 'site', quando: new Date().toISOString() }),
    });
    clearTimeout(teto);
    /* o Apps Script responde 200 com {ok:true}; qualquer outra coisa é falha */
    let ok = r.ok;
    try { const j = await r.json(); ok = ok && j?.ok !== false; } catch { /* corpo não-JSON: fica o status */ }
    return NextResponse.json({ ok: true, guardado: ok, motivo: ok ? undefined : `planilha respondeu ${r.status}` });
  } catch (e) {
    return NextResponse.json({ ok: true, guardado: false, motivo: e instanceof Error && e.name === 'AbortError' ? 'planilha demorou' : 'planilha fora do ar' });
  }
}
