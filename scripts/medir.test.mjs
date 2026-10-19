/* A medição dos sites (lib/site/medir.ts). Roda com `npm test`.

   O que este arquivo protege, em ordem de gravidade:

     1. NENHUM LINK PESSOAL SAI PARA A MEDIÇÃO. O sistema tem a credencial de
        alguém no próprio endereço (/eu/<código>, /candidatura/<código>,
        /cronograma/<código>, /confirmar, /demandas). Se a lista de páginas
        públicas deixar passar uma dessas, o código vai parar no painel da
        Vercel e na Meta. Por isso a lista é do que ENTRA, e este teste tenta
        fazer passar cada porta do sistema;
     2. a query não sai junto (só as marcações de campanha, utm_*);
     3. cada link dispara o evento certo, e só ele (o "Já sirvo" do Church
        não é "quero servir"; o "Avisar que vou" vale mais que a regra do
        WhatsApp);
     4. a escolha da faixa de cookies expira quando deve, e escolha estragada
        conta como nenhuma (a faixa pergunta de novo, em vez de ligar o Pixel);
     5. o ID do Pixel só vale se for número.                                   */
import { paginaPublica, enderecoMedivel, eventoDoLink, escolhaValida, pixelValido, NA_META, NA_VERCEL, VALIDADE } from '../lib/site/medir.ts';

let mal = 0;
const ok = (cond, queixa) => { if (!cond) { mal++; console.error(`MAL  ${queixa}`); } };

/* ------------------------------------------- 1. as páginas que podem entrar --- */
for (const p of ['/', '/sobre', '/cultos', '/como-chegar', '/eventos', '/pequena-guia', '/ofertar', '/privacidade', '/acessar',
  '/servir', '/servir/', '/servir/onde-me-encaixo', '/servir/midia', '/servir/kids', '/servir/midia/cadastro', '/followcamp']) {
  ok(paginaPublica(p), `página pública ficou de fora: ${p}`);
}
for (const p of ['/eu', '/eu/ab12cd34ef', '/eu/ab12cd34ef/culto/2026-10-25', '/candidatura/xyz789', '/cronograma/tok123',
  '/cronogramas', '/confirmar/midia', '/cheguei/midia', '/disponibilidade/midia', '/demandas', '/demandas/admin',
  '/escala', '/painel', '/painel/candidaturas', '/time', '/time/conferir', '/ajustes', '/entrar', '/equipe/midia',
  '/followcamp/painel', '/followcamp/pagar', '/followcamp/inscricao', '/servir/midia/cadastro/extra', '/api/cron',
  '/sobre/../eu/abc', '//eu/abc', '/eu/abc?x=1']) {
  ok(!paginaPublica(p), `página do sistema passou como pública: ${p}`);
}

/* --------------------------------------------- 2. o endereço que sai, limpo --- */
ok(enderecoMedivel('https://guiachurch.com/cultos?utm_source=meta&utm_campaign=visitantes&fbclid=abc&nome=Ana')
  === 'https://guiachurch.com/cultos?utm_source=meta&utm_campaign=visitantes', 'a query não foi limpa (fica só utm_*)');
ok(enderecoMedivel('https://guiaservir.com/') === 'https://guiaservir.com/', 'a LP do Servir sem query mudou');
ok(enderecoMedivel('https://guiaservir.com/eu/ab12cd34ef?utm_source=meta') === null, 'link pessoal com utm passou');
ok(enderecoMedivel('https://guiaservir.com/candidatura/xyz') === null, 'candidatura passou');
ok(enderecoMedivel('não é endereço') === null, 'endereço inválido não virou nulo');

/* -------------------------------------------- 3. o evento de cada clique --- */
const EV = (href, aqui = 'guiachurch.com', explicito = null) => eventoDoLink(href, explicito, aqui);
ok(EV('https://wa.me/5521972976946?text=Oi') === 'whatsapp', 'WhatsApp não virou whatsapp');
ok(EV('https://wa.me/5521972976946?text=Oi', 'guiachurch.com', 'avisou_que_vai') === 'avisou_que_vai', 'o data-medir não venceu a regra');
ok(EV('https://wa.me/5521972976946', 'guiachurch.com', 'inventado') === 'whatsapp', 'data-medir desconhecido mudou o evento');
ok(EV('https://www.google.com/maps/search/?api=1&query=GUIA') === 'mapa', 'Google Maps não virou mapa');
ok(EV('https://waze.com/ul?q=Rua') === 'mapa', 'Waze não virou mapa');
ok(EV('https://www.google.com/search?q=GUIA') === null, 'busca do Google virou mapa');
ok(EV('https://guiaservir.com/') === 'quero_servir', 'o salto para a LP do Servir não contou');
ok(EV('https://guiaservir.com/servir/midia') === 'quero_servir', 'o salto para uma área não contou');
ok(EV('https://guiaservir.com/#areas') === 'quero_servir', 'o salto para as áreas não contou');
ok(EV('https://guiaservir.com/eu') === null, '"Já sirvo" virou quero servir');
ok(EV('https://guiaservir.com/acessar') === null, '"Acesso às equipes" virou quero servir');
ok(EV('https://guiaservir.com/', 'guiaservir.com') === null, 'link interno do próprio Servir virou quero servir');
ok(EV('/cultos#primeira-vez') === null, 'link interno virou evento');
ok(EV('https://instagram.com/guiachurch') === null, 'Instagram virou evento');
ok(EV('javascript:alert(1)') === null, 'endereço estranho virou evento');
for (const e of Object.keys(NA_META)) ok(typeof NA_VERCEL[e] === 'string' && NA_VERCEL[e].length > 0, `evento sem nome na Vercel: ${e}`);
ok(NA_META.pix_copiado.padrao === false, 'copiar o Pix virou evento padrão (Donate ensinaria errado o anúncio)');
ok(NA_META.avisou_que_vai.nome === 'Schedule' && NA_META.cadastro_servir.nome === 'SubmitApplication', 'eventos padrão da Meta trocados');

/* ----------------------------------------- 4. a escolha da faixa de cookies --- */
const agora = Date.UTC(2026, 9, 19, 12);
const DIA = 24 * 3600 * 1000;
ok(escolhaValida({ escolha: 'sim', em: agora - 10 * DIA }, agora) === 'sim', 'aceite recente não valeu');
ok(escolhaValida({ escolha: 'sim', em: agora - VALIDADE.sim - DIA }, agora) === null, 'aceite de mais de um ano ainda valeu');
ok(escolhaValida({ escolha: 'nao', em: agora - 30 * DIA }, agora) === 'nao', 'recusa recente não valeu');
ok(escolhaValida({ escolha: 'nao', em: agora - VALIDADE.nao - DIA }, agora) === null, 'recusa de mais de seis meses ainda valeu');
for (const estragada of [null, undefined, 'sim', 1, {}, { escolha: 'talvez', em: agora }, { escolha: 'sim' }, { escolha: 'sim', em: 'ontem' },
  { escolha: 'sim', em: NaN }, { escolha: 'sim', em: agora + 30 * DIA }]) {
  ok(escolhaValida(estragada, agora) === null, `escolha estragada valeu: ${JSON.stringify(estragada)}`);
}

/* -------------------------------------------------------------- 5. o Pixel --- */
ok(pixelValido('1234567890123456') === '1234567890123456', 'ID de 16 dígitos não valeu');
ok(pixelValido(' 123456789012345 ') === '123456789012345', 'ID com espaço em volta não valeu');
for (const ruim of ['', undefined, null, 'abc', '12345', '1234-5678-9012', '<script>', '12345678901234567890123']) {
  ok(pixelValido(ruim) === null, `ID inválido valeu: ${ruim}`);
}

if (mal) { console.error(`\nmedir: ${mal} problema(s)`); process.exit(1); }
console.log('medir: páginas, endereços, eventos, escolha e Pixel conferidos');
