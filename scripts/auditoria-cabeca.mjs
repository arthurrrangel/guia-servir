/* =============================================================================
   AUDITORIA · O <HEAD> QUE OS ROBÔS LEEM (22/10/2026)

   O título, a descrição, o canonical e a imagem de compartilhamento têm que
   estar no <head> do HTML que chega, para o navegador, para o Googlebot (que
   executa JavaScript: o Next 15 manda os metadados de página dinâmica por
   streaming no fim do <body> para ele, e o Google ignora canonical no
   <body>) e para quem monta a prévia do link (WhatsApp, Facebook). Em cada
   rota pública, com os três agentes:

     · <title>, meta description, link canonical e og:image dentro do <head>;
     · o canonical absoluto, no domínio certo do site (guiachurch.com,
       guiaservir.com, guiafollow.com) e no caminho da própria página.

     PORTA=3800 node scripts/auditoria-cabeca.mjs
   Sai com 1 se alguma rota falhar.
   ============================================================================= */
const B = `http://localhost:${process.env.PORTA || 3700}`;
const ROTAS = [
  ['/', 'guiachurch.com', '/'], ['/cultos', 'guiachurch.com', '/cultos'], ['/como-chegar', 'guiachurch.com', '/como-chegar'],
  ['/eventos', 'guiachurch.com', '/eventos'], ['/pequena-guia', 'guiachurch.com', '/pequena-guia'], ['/sobre', 'guiachurch.com', '/sobre'],
  ['/ofertar', 'guiachurch.com', '/ofertar'], ['/privacidade', 'guiachurch.com', '/privacidade'],
  ['/servir', 'guiaservir.com', '/'], ['/servir/midia', 'guiaservir.com', '/servir/midia'], ['/servir/louvor', 'guiaservir.com', '/servir/louvor'],
  ['/servir/kids', 'guiaservir.com', '/servir/kids'], ['/servir/servico', 'guiaservir.com', '/servir/servico'], ['/servir/livraria', 'guiaservir.com', '/servir/livraria'],
  ['/servir/onde-me-encaixo', 'guiaservir.com', '/servir/onde-me-encaixo'], ['/acessar', 'guiaservir.com', '/acessar'],
  ['/follow', 'guiafollow.com', '/'],
];
const AGENTES = {
  navegador: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  googlebot: 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  whatsapp: 'WhatsApp/2.23.20.0 A',
};
let ruins = 0;
for (const [rota, dominio, caminho] of ROTAS) {
  const linha = [];
  let ok = true;
  for (const [nome, ua] of Object.entries(AGENTES)) {
    const h = await (await fetch(B + rota, { headers: { 'user-agent': ua } })).text();
    const fim = h.indexOf('</head>');
    const cab = fim > 0 ? h.slice(0, fim) : '';
    const tem = re => re.test(cab);
    const canon = (cab.match(/<link rel="canonical" href="([^"]*)"/) || [])[1] || '';
    let canonOk = false;
    try { const u = new URL(canon); canonOk = u.hostname === dominio && (u.pathname === caminho || (caminho === '/' && u.pathname === '')); } catch {}
    const faltam = [!tem(/<title>[^<]+<\/title>/) && 'title', !tem(/<meta name="description" content="[^"]+"/) && 'description', !canon && 'canonical', canon && !canonOk && `canonical ${canon}`, !tem(/<meta property="og:image" content="https?:\/\/[^"]+"/) && 'og:image'].filter(Boolean);
    if (faltam.length) ok = false;
    linha.push(`${nome} ${faltam.length ? 'FALTA NO <head>: ' + faltam.join(', ') : 'ok'}`);
  }
  if (!ok) ruins++;
  console.log(`${ok ? 'ok ' : 'MAL'} ${rota.padEnd(26)} ${linha.join(' · ')}`);
}
console.log(ruins ? `\n${ruins} rota(s) com o <head> incompleto` : '\no <head> completo em todas as rotas, para os três agentes');
process.exit(ruins ? 1 : 0);
