/* O AVISO NO CELULAR: O ENDEREÇO E AS FRASES — 104, 01/10/2026.

   O que este arquivo exige:
     1. o servidor só manda para serviço de aviso conhecido (Google, Mozilla,
        Apple, Microsoft), e disfarce de endereço não passa. É a mesma regra
        da restrição do banco (supabase/104), que a conferência da 104 cobre
        do lado de lá;
     2. cada aviso diz o que aconteceu, com o primeiro nome, a função, o dia e
        a hora certa, e abre a página de quem recebe, no ponto certo;
     3. o lembrete diz "falta você confirmar" só quando falta.

   Roda com `npm test`. */
import { enderecoPermitido, mensagemDaTroca, mensagemDoLembrete } from '@/lib/aviso';

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => { feitas++; if (!c) { falhas++; console.log('  FALHOU:', rot, extra); } };
const eq = (a, b, rot) => ok(a === b, rot, `disse ${JSON.stringify(a)}, esperava ${JSON.stringify(b)}`);

/* 1 · o endereço */
for (const e of [
  'https://fcm.googleapis.com/fcm/send/abc:APA91b',
  'https://android.googleapis.com/gcm/send/abc',
  'https://updates.push.services.mozilla.com/wpush/v2/gAAAA',
  'https://web.push.apple.com/QGuQyavXutnMH',
  'https://wns2-par02p.notify.windows.com/w/?token=AwYAAAB',
]) ok(enderecoPermitido(e), `aceita ${e.slice(8, 40)}`);
for (const e of [
  'http://fcm.googleapis.com/fcm/send/abc',                 // sem https
  'https://fcm.googleapis.com.exemplo.com/fcm/send/abc',    // disfarce no domínio
  'https://exemplo.com/https://fcm.googleapis.com/x',       // disfarce no caminho
  'https://fcm.googleapis.com',                             // sem caminho
  'https://169.254.169.254/latest/meta-data',               // o clássico do ataque
  'https://localhost/push',
  'https://web.push.apple.com.exemplo.com/x',
  'https://' + 'a'.repeat(5) + '.push.apple.com/' + 'x'.repeat(1000),  // longo demais
  null, 42, {},
]) ok(!enderecoPermitido(e), `recusa ${String(e).slice(0, 48)}`);

/* 2 · a troca */
const base = 'https://guiaservir.com';
const vaga = { token_destino: 'abc123def456ghi789', outro: 'Bia Souza Lima', funcao: 'VOZ', data: '2026-10-04', evento: null, inicio: null };
{
  const m = mensagemDaTroca({ ...vaga, tipo: 'pedido' }, base, '10h', '19h');
  eq(m.titulo, 'Pedido de troca', 'pedido: título');
  eq(m.corpo, 'Bia pediu para você ficar com VOZ, domingo, 4 de outubro, 10h. Toque para responder.', 'pedido: o texto inteiro');
  eq(m.url, 'https://guiaservir.com/eu/abc123def456ghi789#trocas', 'pedido: abre as trocas de quem recebeu');
}
{
  const m = mensagemDaTroca({ ...vaga, tipo: 'aceita' }, base, '10h', '19h');
  eq(m.corpo, 'Bia ficou com a sua vaga de VOZ, domingo, 4 de outubro, 10h. Ela saiu da sua escala.', 'aceita: o texto inteiro');
}
{
  const m = mensagemDaTroca({ ...vaga, tipo: 'recusada', data: '2026-10-07', evento: 'Ensaio Geral', inicio: '19:30:00' }, base, '10h', '19h');
  eq(m.corpo, 'Bia não pode ficar com VOZ, Ensaio Geral · quarta, 7 de outubro, 19h30. A vaga continua sua.', 'recusada: evento com a hora dele');
}
{
  const m = mensagemDaTroca({ ...vaga, tipo: 'pedido', outro: null }, base, '10h', '19h');
  ok(m.corpo.startsWith('Um colega pediu'), 'sem nome: "Um colega"', m.corpo);
}

/* 3 · o lembrete */
const lem = { token: 'abc123def456ghi789', data: '2026-10-03', evento: null, inicio: null, funcoes: 'PROJEÇÃO · FOTO' };
{
  const m = mensagemDoLembrete({ ...lem, tipo: 'd1', pendente: true }, base, '10h', '19h');
  eq(m.titulo, 'Sua escala é amanhã', 'd1: título');
  eq(m.corpo, 'PROJEÇÃO · FOTO, sábado (Follow), 3 de outubro, 19h. Falta você confirmar.', 'd1 pendente: pede a confirmação');
  eq(m.url, 'https://guiaservir.com/eu/abc123def456ghi789#confirmar', 'pendente abre no "Precisa de você"');
}
{
  const m = mensagemDoLembrete({ ...lem, tipo: 'd3', pendente: false }, base, '10h', '19h');
  eq(m.titulo, 'Sua escala é daqui a 3 dias', 'd3: título');
  ok(!/confirmar/i.test(m.corpo) && m.url.endsWith('/eu/abc123def456ghi789'), 'confirmado: sem cobrança, abre a página', m.corpo);
}
/* nenhuma frase promete o que o sistema não faz */
for (const t of ['pedido', 'aceita', 'recusada']) {
  const m = mensagemDaTroca({ ...vaga, tipo: t }, base, '10h', '19h');
  ok(!/avisamos|avisaremos|notificamos/i.test(m.corpo), `${t}: sem promessa de aviso`);
}

if (falhas) { console.log(`aviso: ${falhas} falha(s) em ${feitas}`); process.exit(1); }
console.log(`aviso: ${feitas}/${feitas} ok`);
