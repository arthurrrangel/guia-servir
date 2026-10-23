/* =============================================================================
   AUDITORIA · OS DADOS ESTRUTURADOS (o JSON-LD que o Google lê) (23/10/2026)

   Cada página da igreja, do Servir e do Follow leva um ou mais blocos
   application/ld+json (Schema.tsx): a igreja, os cultos e eventos, as
   perguntas frequentes, a oferta. Ninguém vê; o Google usa para mostrar
   horário, endereço e eventos na busca. Confere, rota por rota:

     A. todo bloco é JSON válido, com @context do schema.org;
     B. a igreja: nome, endereço completo (rua, bairro, estado, CEP, país) e
        o mesmo endereço e CEP que a página mostra;
     C. cada evento: nome, início em data ISO com fuso, lugar com endereço
        (ou on-line), e a hora do início igual à da página (domingo 10h,
        sábado 19h, o Follow Camp de 05 a 10 de fevereiro); evento com data
        no passado é aviso;
     D. as perguntas frequentes: cada pergunta e resposta do JSON-LD existe
        na página, com o mesmo texto (o Google pede o conteúdo à vista);
     E. todo endereço (url, @id, image, sameAs) é https, do domínio certo
        para o site da página, e as imagens do próprio site existem.

     PORTA=3800 node scripts/auditoria-dados-estruturados.mjs
   Sai com 1 se A a E acharem erro (os avisos não reprovam).
   ============================================================================= */
import { chromium } from 'playwright';
import { rotear, ROTAS_SITE } from './_rpc-mock.mjs';
const B = `http://localhost:${process.env.PORTA || 3700}`;
const ROTAS = ROTAS_SITE.filter(r => r !== '/rota-que-nao-existe');
const DOMINIO = r => r === '/follow' ? 'guiafollow.com' : (r.startsWith('/servir') || r === '/acessar') ? 'guiaservir.com' : 'guiachurch.com';
const DOMINIOS = ['guiachurch.com', 'guiaservir.com', 'guiafollow.com'];
const norm = s => String(s || '').replace(/[⁠ ​]/g, ' ').replace(/\s+/g, ' ').trim();
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await ctx.route('**', r => rotear(r, B));
let erros = 0, avisos = 0;
const tipos = {};

function nos(d) { /* achata @graph e objetos aninhados com @type */
  const out = [];
  const anda = x => {
    if (Array.isArray(x)) { x.forEach(anda); return; }
    if (!x || typeof x !== 'object') return;
    if (x['@type']) out.push(x);
    for (const [k, v] of Object.entries(x)) if (k !== '@context') anda(v);
  };
  anda(d); return out;
}
const tipo = n => [].concat(n['@type']).join('/');
const urls = (x, out = []) => {
  if (Array.isArray(x)) x.forEach(v => urls(v, out));
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { if (['url', '@id', 'image', 'sameAs', 'hasMap', 'logo', 'contentUrl'].includes(k)) [].concat(v).forEach(u => typeof u === 'string' && out.push([k, u])); urls(v, out); }
  return out;
};

for (const rota of ROTAS) {
  const p = await ctx.newPage();
  await p.goto(B + rota, { waitUntil: 'networkidle', timeout: 60000 });
  await p.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
  const pag = await p.evaluate(() => ({
    blocos: [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => s.textContent),
    texto: document.body.innerText,
  }));
  const texto = norm(pag.texto);
  const mal = [], av = [];
  const todos = [];
  pag.blocos.forEach((t, i) => {
    let d; try { d = JSON.parse(t); } catch (e) { mal.push(`bloco ${i + 1} não é JSON (${e.message.slice(0, 40)})`); return; }
    if (!/schema\.org/.test(String(d['@context'] || ''))) mal.push(`bloco ${i + 1} sem @context do schema.org`);
    todos.push(d);
  });
  const lista = todos.flatMap(nos);
  for (const n of lista) tipos[tipo(n)] = (tipos[tipo(n)] || 0) + 1;
  /* B. a igreja */
  for (const n of lista.filter(n => /Church|Organization|PlaceOfWorship/.test(tipo(n)) && n.address)) {
    const a = n.address;
    for (const k of ['streetAddress', 'addressLocality', 'addressRegion', 'postalCode', 'addressCountry']) if (!a[k]) mal.push(`${tipo(n)} sem address.${k}`);
    if (a.streetAddress && !texto.includes(norm(a.streetAddress))) mal.push(`${tipo(n)}: a rua «${a.streetAddress}» não aparece na página`);
    if (a.postalCode && a.postalCode !== '22793-390') mal.push(`${tipo(n)}: CEP ${a.postalCode} diferente de 22793-390`);
    if (!n.name) mal.push(`${tipo(n)} sem name`);
  }
  /* C. os eventos */
  for (const n of lista.filter(n => /Event/.test(tipo(n)))) {
    const nome = n.name || '(sem nome)';
    if (!n.name) mal.push('Event sem name');
    if (!n.startDate) mal.push(`Event «${nome}» sem startDate`);
    else {
      const ok = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z))?$/.test(n.startDate);
      if (!ok) mal.push(`Event «${nome}»: startDate «${n.startDate}» fora do ISO com fuso`);
      else {
        const h = n.startDate.includes('T') ? n.startDate.slice(11, 16) : null;
        const quando = new Date(n.startDate);
        if (!isNaN(quando) && quando < new Date(Date.now() - 864e5)) av.push(`Event «${nome}» com início no passado (${n.startDate})`);
        if (/Celebra|domingo|Culto/i.test(nome) && h && h !== '10:00') mal.push(`Event «${nome}» às ${h}, a página diz 10h`);
        if (/^Follow\b(?! Camp)/i.test(nome) && h && h !== '19:00') mal.push(`Event «${nome}» às ${h}, a página diz 19h`);
        if (/Camp/i.test(nome) && !/^2027-02-05/.test(n.startDate)) mal.push(`Event «${nome}» começa em ${n.startDate}, a página diz 05/02/2027`);
        if (/Camp/i.test(nome) && n.endDate && !/^2027-02-10/.test(n.endDate)) mal.push(`Event «${nome}» termina em ${n.endDate}, a página diz 10/02/2027`);
      }
    }
    if (!n.location) mal.push(`Event «${nome}» sem location`);
    else { const l = [].concat(n.location)[0]; if (/Place/.test(tipo(l)) && !l.address) mal.push(`Event «${nome}»: Place sem address`); }
    for (const k of ['description', 'image', 'eventStatus', 'eventAttendanceMode', 'organizer']) if (!n[k]) av.push(`Event «${nome}» sem ${k} (recomendado)`);
  }
  /* D. as perguntas frequentes à vista, com o mesmo texto. As mesmas palavras
     na mesma ordem, sem contar a pontuação: no /como-chegar o endereço fica
     numa linha própria na tela e, na frase do JSON-LD, ganha o ponto final
     (23/10/2026, o primeiro uso desta régua: o único "erro" era esse ponto) */
  const semPont = s => norm(s).replace(/[.,:;!?…«»"“”'’()]/g, ' ').replace(/\s+/g, ' ').trim();
  const textoSemPont = semPont(pag.texto);
  for (const n of lista.filter(n => /FAQPage/.test(tipo(n)))) {
    for (const q of [].concat(n.mainEntity || [])) {
      const pergunta = semPont(q.name), resposta = semPont(q.acceptedAnswer?.text);
      if (!pergunta || !resposta) { mal.push('Question sem name ou acceptedAnswer.text'); continue; }
      if (!textoSemPont.includes(pergunta)) mal.push(`pergunta fora da página: «${pergunta.slice(0, 50)}»`);
      if (!textoSemPont.includes(resposta)) mal.push(`resposta diferente da página: «${resposta.slice(0, 60)}»`);
    }
  }
  /* E. os endereços */
  const dom = DOMINIO(rota);
  for (const [k, u] of todos.flatMap(d => urls(d))) {
    if (!/^https:\/\//.test(u)) { mal.push(`${k} não é https: ${u.slice(0, 60)}`); continue; }
    const host = new URL(u).host.replace(/^www\./, '');
    if (DOMINIOS.includes(host)) {
      if (['url', '@id'].includes(k) && host !== dom && !/#(igreja|site|org)/.test(u) && !lista.some(n => /Church|Organization|WebSite/.test(tipo(n)) && (n.url === u || n['@id'] === u))) av.push(`${k} em ${host} numa página do ${dom}: ${u.slice(0, 70)}`);
      if (['image', 'logo', 'contentUrl'].includes(k)) {
        const caminho = new URL(u).pathname;
        const st = await p.evaluate(async c => (await fetch(c, { method: 'HEAD' })).status, caminho).catch(() => 0);
        if (st !== 200) mal.push(`${k} ${caminho} responde ${st}`);
      }
    }
  }
  erros += mal.length; avisos += av.length;
  const resumo = `${pag.blocos.length} bloco(s): ${[...new Set(lista.map(tipo))].join(', ')}`;
  console.log(`${mal.length ? 'MAL' : 'ok '} ${rota.padEnd(26)} ${resumo}${mal.length ? ' · ' + [...new Set(mal)].join('; ') : ''}${av.length ? ' · avisos: ' + [...new Set(av)].join('; ') : ''}`);
  await p.close();
}
await b.close();
console.log(`\ntipos: ${Object.entries(tipos).map(([t, n]) => `${t} ×${n}`).join(', ')}`);
console.log(erros ? `${erros} erro(s) nos dados estruturados, ${avisos} aviso(s)` : `dados estruturados certos em ${ROTAS.length} rotas (${avisos} aviso(s))`);
process.exit(erros ? 1 : 0);
