/* QUE DIA A TELA DIZ PARA A PESSOA — 21/09/2026, migração 71.

   Este é o teste da frase que manda alguém sair de casa num dia. Ela estava
   solta dentro de `app/eu/[token]/page.tsx` e escrevia:

       ehSabado(s) ? 'sábado (Follow)' : 'domingo'

   Tudo que não é sábado virava "domingo". E evento esporádico, por
   construção, NUNCA cai num domingo nem no sábado de Follow — `culto_guarda`
   recusa os dois com `DIA_DE_CULTO` (supabase/54, reforçado na 69). Quer
   dizer: TODO evento caía no `else` e era anunciado como domingo.

   Medido em 21/09 num banco nascido do repositório: evento da Mídia numa
   QUARTA, 07/10, e a tela da voluntária dizia "domingo, 7 de outubro", sem o
   nome do evento. A tela da líder acerta isso desde a 54.

   A tabela verdade abaixo é a regra inteira. O bloco do fim é o que impede
   que esses casos voltem a ser decorativos: ele varre 400 dias e cobra a
   PROPRIEDADE (nenhum dia com evento pode ser chamado de domingo se não for
   domingo), em vez de confiar nos exemplos que eu escolhi.

   Roda com `npm test`. */

import { diaLongo, ehSabadoDeCulto, paraTesteDeDia } from '@/lib/engine';

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => { feitas++; if (!c) { falhas++; console.log('  FALHOU:', rot, extra); } };
const eq = (a, b, rot) => ok(a === b, rot, `disse ${JSON.stringify(a)}, esperava ${JSON.stringify(b)}`);

/* ------------------------------------------- 1) dia sem evento: é o culto
   Sem evento a data é um culto da igreja, e a igreja só tem dois: o domingo
   e o sábado do Follow. Aqui a regra antiga continua valendo, e tem que
   continuar: não é isso que estava errado. */
{
  eq(diaLongo('2026-10-04'), 'domingo, 4 de outubro', 'domingo sem evento e domingo');
  eq(diaLongo('2026-10-10'), 'sábado (Follow), 10 de outubro', 'sabado sem evento e o Follow');
  eq(diaLongo('2026-01-04'), 'domingo, 4 de janeiro', 'primeiro mes do ano');
  eq(diaLongo('2026-12-27'), 'domingo, 27 de dezembro', 'ultimo mes do ano');
}

/* ------------------------------------ 2) dia com evento: o dia de verdade
   ESTE É O CASO QUE ESTAVA VERMELHO. As cinco datas abaixo são os cinco dias
   da semana em que `criar_evento` aceita marcar evento. Antes da 71, as
   cinco liam "domingo". */
{
  eq(diaLongo('2026-10-07', 'Ensaio Geral'), 'Ensaio Geral · quarta, 7 de outubro',
     'QUARTA com evento e quarta — era este o defeito medido');
  eq(diaLongo('2026-10-05', 'Reunião de Líderes'), 'Reunião de Líderes · segunda, 5 de outubro',
     'segunda com evento e segunda');
  eq(diaLongo('2026-10-06', 'Gravação'), 'Gravação · terça, 6 de outubro',
     'terca com evento e terca');
  eq(diaLongo('2026-10-08', 'Culto de Oração'), 'Culto de Oração · quinta, 8 de outubro',
     'quinta com evento e quinta');
  eq(diaLongo('2026-10-09', 'Vigília'), 'Vigília · sexta, 9 de outubro',
     'sexta com evento e sexta');
}

/* --------------------------- 3) o nome do evento aparece, e aparece antes
   A pessoa abre a tela e lê uma frase. Se o nome do evento vier depois da
   data, ou não vier, ela não sabe para o que está sendo chamada. */
{
  ok(diaLongo('2026-10-07', 'Ensaio Geral').startsWith('Ensaio Geral'),
     'o nome do evento e a PRIMEIRA coisa da frase', diaLongo('2026-10-07', 'Ensaio Geral'));
  ok(!diaLongo('2026-10-04').includes('·'),
     'e dia sem evento nao ganha separador sobrando', diaLongo('2026-10-04'));

  /* `evento` chega do banco como `text null`. Null e string vazia têm que
     cair no mesmo lugar que "não tem evento", senão a tela escreve
     " · domingo, 4 de outubro" com um ponto solto na frente. */
  eq(diaLongo('2026-10-04', null), 'domingo, 4 de outubro', 'evento null e dia sem evento');
  eq(diaLongo('2026-10-04', undefined), 'domingo, 4 de outubro', 'evento ausente e dia sem evento');
  eq(diaLongo('2026-10-04', ''), 'domingo, 4 de outubro', 'evento vazio e dia sem evento');
}

/* ----------------------------------------------- 4) o fuso não muda o dia
   A data vem do banco como 'AAAA-MM-DD', sem hora. Se a leitura escorregar
   um dia, um domingo vira "sábado (Follow)" no celular de quem está no Acre:
   dia errado E rótulo errado, na mesma frase.

   São DUAS camadas protegendo isso, e elas não se separam por comportamento:
   os acessores `getUTC*` e a leitura ao meio-dia UTC. Medido sabotando uma
   de cada vez:

     · trocar `getUTCDay/getUTCDate/getUTCMonth` por `getDay/getDate/
       getMonth`  ->  o caso abaixo REPROVA (Kiritimati lê 5 de outubro)
     · tirar o `T12:00:00Z` de `noMeioDia`                ->  passa VERDE

   Então o caso do fuso mede os acessores, e só eles. A segunda camada não
   tem como ser vista de fora — por isso o caso seguinte olha para ela
   diretamente, pelo `paraTesteDeDia`. Isso está escrito aqui em vez de eu
   fingir que um caso cobre os dois. */
{
  const original = process.env.TZ;
  const frases = new Set();
  for (const tz of ['America/Rio_Branco', 'America/Noronha', 'UTC', 'Pacific/Kiritimati']) {
    process.env.TZ = tz;
    frases.add(diaLongo('2026-10-04'));
    frases.add(diaLongo('2026-10-07', 'Ensaio Geral'));
  }
  process.env.TZ = original;
  ok(frases.size === 2,
     'a frase e a mesma do Acre a Kiritimati: o fuso do celular nao move o dia',
     [...frases].join(' | '));

  /* A CAMADA DE BAIXO, olhada de frente. Ela existe para que o dia continue
     certo mesmo se alguém escrever `dt.getDate()` numa linha nova. */
  const d = paraTesteDeDia.noMeioDia('2026-10-04');
  ok(d.getUTCHours() === 12,
     'a data e lida ao MEIO-DIA UTC, nao a meia-noite',
     `leu as ${d.getUTCHours()}h UTC`);
  ok(d.getUTCFullYear() === 2026 && d.getUTCMonth() === 9 && d.getUTCDate() === 4,
     'e e o dia que o banco mandou, nao o de antes nem o de depois',
     d.toISOString());
  /* a folga é o que faz a camada valer: 12h para cada lado cobre o Brasil
     inteiro (UTC-2 a UTC-5) com sobra, mesmo com acessor local */
  ok(d.getTime() - Date.parse('2026-10-04T00:00:00Z') === 12 * 3600000,
     'a folga e de 12h para cada lado, que cobre o Brasil inteiro');
}

/* ===================================== 5) O INVARIANTE, e sem ele o resto é
   decorativo.

   Os casos acima são datas que EU escolhi. Se alguém trocar o vetor
   `DIAS_DA_SEMANA` por um que erra só em novembro, ou voltar o `else` para
   'domingo' mas deixar quarta passando, eles podem continuar verdes.

   Este bloco varre 400 dias corridos — mais de um ano, com virada de ano,
   fevereiro e horário de verão pelo caminho — e cobra duas propriedades que
   valem para TODA data:

     a) com evento, o dia da semana escrito tem que ser o dia da semana que a
        data realmente é;
     b) sem evento, a frase só pode ser uma das duas que a igreja tem. */
{
  const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const DIA_MS = 86400000;
  let errosA = 0, errosB = 0, primeiroA = '', primeiroB = '';
  let comEvento = 0, semEvento = 0;

  for (let i = 0; i < 400; i++) {
    const dt = new Date(Date.parse('2026-01-01T12:00:00Z') + i * DIA_MS);
    const iso = dt.toISOString().slice(0, 10);
    const dow = dt.getUTCDay();

    /* (a) com evento: o rótulo tem que casar com o calendário */
    const com = diaLongo(iso, 'X');
    comEvento++;
    if (!com.startsWith(`X · ${DIAS[dow]}, ${dt.getUTCDate()} de `)) {
      errosA++; if (!primeiroA) primeiroA = `${iso} (dow=${dow}) -> ${com}`;
    }

    /* (b) sem evento: só existem dois cultos */
    const sem = diaLongo(iso);
    semEvento++;
    const esperado = ehSabadoDeCulto(iso) ? 'sábado (Follow)' : 'domingo';
    if (!sem.startsWith(`${esperado}, `)) {
      errosB++; if (!primeiroB) primeiroB = `${iso} (dow=${dow}) -> ${sem}`;
    }
  }

  ok(comEvento === 400 && semEvento === 400, 'a varredura cobriu os 400 dias',
     `${comEvento}/${semEvento}`);
  ok(errosA === 0,
     'em 400 dias, TODO evento e chamado pelo dia da semana que ele e',
     `${errosA} erro(s), o primeiro: ${primeiroA}`);
  ok(errosB === 0,
     'em 400 dias, todo dia SEM evento e domingo ou o sabado do Follow',
     `${errosB} erro(s), o primeiro: ${primeiroB}`);

  /* E O CASO QUE PEGA O DEFEITO ORIGINAL DE FRENTE: quantos dos 400 dias com
     evento seriam chamados de "domingo"? Antes da 71: 400 de 400. Agora tem
     que ser exatamente os 57 domingos do período — e nenhum desses 57 pode
     existir de verdade, porque `culto_guarda` recusa evento em domingo. */
  let chamadosDeDomingo = 0;
  for (let i = 0; i < 400; i++) {
    const dt = new Date(Date.parse('2026-01-01T12:00:00Z') + i * DIA_MS);
    if (diaLongo(dt.toISOString().slice(0, 10), 'X').includes('· domingo,')) chamadosDeDomingo++;
  }
  const domingosDeVerdade = Array.from({ length: 400 }, (_, i) =>
    new Date(Date.parse('2026-01-01T12:00:00Z') + i * DIA_MS).getUTCDay()).filter(d => d === 0).length;
  ok(chamadosDeDomingo === domingosDeVerdade,
     'nenhum dia com evento e chamado de domingo sem ser domingo (era 400 de 400)',
     `${chamadosDeDomingo} chamados de domingo, ${domingosDeVerdade} domingos de verdade`);
}

if (falhas) { console.log(`\ndia-longo: ${falhas} falha(s) em ${feitas}\n`); process.exit(1); }
console.log(`\ndia-longo: ${feitas}/${feitas} ok\n`);
