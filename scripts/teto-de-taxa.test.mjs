/* =============================================================================
   O TETO DAS DUAS PORTAS ANÔNIMAS

   20/09/2026. Cobra o contrato de `lib/teto-de-taxa.ts`: quantas passam,
   quando começa a recusar, quando volta a deixar, e que um IP não gasta o
   passe do outro.

   O caso mais importante é o último: um teto que zera sozinho no meio da
   janela, ou que conta todo mundo no mesmo balde, é pior que nenhum — o
   primeiro não protege e o segundo derruba gente inocente.
   ============================================================================= */
import { passe, deQuem, zerar } from '@/lib/teto-de-taxa';

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => { feitas++; if (!c) { falhas++; console.log('  FALHOU:', rot, extra); } };

const req = (cab) => new Request('https://exemplo.invalido/', { headers: cab });

/* 1) de quem é o pedido */
{
  ok(deQuem(req({ 'x-forwarded-for': '203.0.113.7' })) === '203.0.113.7', 'lê o x-forwarded-for');
  ok(deQuem(req({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1, 10.0.0.2' })) === '203.0.113.7',
     'com cadeia de proxies, fica com o primeiro',
     deQuem(req({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' })));
  ok(deQuem(req({ 'x-forwarded-for': '  203.0.113.7  ' })) === '203.0.113.7', 'e tira o espaço');
  ok(deQuem(req({ 'x-real-ip': '198.51.100.4' })) === '198.51.100.4', 'cai no x-real-ip quando não há xff');
  ok(deQuem(req({})) === 'sem-ip', 'sem cabeçalho nenhum, todo mundo divide o mesmo balde');
  ok(deQuem(req({ 'x-forwarded-for': '   ' })) === 'sem-ip', 'cabeçalho vazio também');
}

/* 2) o contrato do balde */
{
  zerar();
  const t0 = 1_000_000;
  for (let i = 1; i <= 3; i++) {
    ok(passe('a', 3, 60, t0).ok, `passe ${i} de 3 entra`);
  }
  const quarto = passe('a', 3, 60, t0);
  ok(!quarto.ok, 'o quarto é recusado');
  ok(quarto.esperar === 60, 'e diz quantos segundos faltam', String(quarto.esperar));
}
{
  zerar();
  const t0 = 2_000_000;
  for (let i = 0; i < 3; i++) passe('b', 3, 60, t0);
  ok(!passe('b', 3, 60, t0 + 59_000).ok, 'aos 59 segundos ainda recusa');
  ok(passe('b', 3, 60, t0 + 59_000).esperar === 1, 'e o Retry-After nunca é zero',
     String(passe('b', 3, 60, t0 + 59_000).esperar));
  ok(passe('b', 3, 60, t0 + 60_000).ok, 'aos 60 a janela virou e ele passa');
  ok(passe('b', 3, 60, t0 + 60_000).ok, 'e a contagem recomeçou do zero');
}
{
  /* O CASO QUE IMPORTA: um IP não pode gastar o passe do outro. */
  zerar();
  const t0 = 3_000_000;
  for (let i = 0; i < 3; i++) passe('ip1', 3, 60, t0);
  ok(!passe('ip1', 3, 60, t0).ok, 'ip1 estourou');
  ok(passe('ip2', 3, 60, t0).ok, 'e ip2 continua livre');
}
{
  /* e o oposto: o mesmo IP em rotas diferentes tem baldes diferentes, porque
     a chave leva o prefixo da rota */
  zerar();
  const t0 = 4_000_000;
  for (let i = 0; i < 3; i++) passe('pg:1.2.3.4', 3, 60, t0);
  ok(!passe('pg:1.2.3.4', 3, 60, t0).ok, 'a pequena-guia estourou para este IP');
  ok(passe('oferta:1.2.3.4', 6, 60, t0).ok, 'e a oferta, que é outra porta, segue livre');
}

/* 3) os limites que as duas rotas de verdade usam */
{
  zerar();
  const t0 = 5_000_000;
  /* oferta: 6 por minuto. Quem oferta erra o valor, volta e tenta de novo —
     seis é folgado para isso e fecha o laço de `for` num terminal. */
  for (let i = 1; i <= 6; i++) ok(passe('oferta:x', 6, 60, t0).ok, `oferta: tentativa ${i} passa`);
  ok(!passe('oferta:x', 6, 60, t0).ok, 'oferta: a sétima no mesmo minuto é barrada');
}
{
  zerar();
  const t0 = 6_000_000;
  for (let i = 1; i <= 3; i++) ok(passe('pg:x', 3, 60, t0).ok, `pequena-guia: tentativa ${i} passa`);
  ok(!passe('pg:x', 3, 60, t0).ok, 'pequena-guia: a quarta no mesmo minuto é barrada');
}

/* 4) a poda não pode apagar balde vivo */
{
  zerar();
  const t0 = 7_000_000;
  /* enche acima do limiar de poda com baldes VENCIDOS, e um vivo no meio */
  for (let i = 0; i < 5200; i++) passe('velho' + i, 1, 60, t0);
  passe('vivo', 3, 3600, t0);
  /* uma chamada depois da janela dos velhos dispara a poda */
  passe('gatilho', 1, 60, t0 + 120_000);
  const r = passe('vivo', 3, 3600, t0 + 120_000);
  ok(r.ok, 'o balde vivo sobreviveu à poda');
  const r2 = passe('vivo', 3, 3600, t0 + 120_000);
  ok(r2.ok, 'e ele ainda tem o terceiro passe');
  ok(!passe('vivo', 3, 3600, t0 + 120_000).ok,
     'ou seja: a contagem dele NÃO foi zerada pela poda');
}

/* 5) A PODA TEM QUE LIMITAR O MAPA, E NÃO CUSTAR CARO NA ROTA QUENTE.

   A primeira versão só apagava balde EXPIRADO e varria o mapa inteiro em toda
   requisição acima do limiar. Com muitos IPs VIVOS — que é o tráfego que este
   módulo existe para conter — nada era apagado, o mapa crescia sem teto, e a
   varredura virava o amplificador do próprio ataque. Medido antes da
   correção: 2.000 chamadas com ~20 mil IPs vivos levaram 468 ms; com o mapa
   vazio, 1 ms. */
{
  zerar();
  const t0 = 8_000_000;
  /* 30 mil IPs VIVOS, janela longa: acima do teto de 20 mil, e nenhum deles
     expira, então a poda por expiração não tem o que apagar. */
  const antes = Date.now();
  for (let i = 0; i < 30000; i++) passe('vivo' + i, 5, 3600, t0 + i);
  const encher = Date.now() - antes;
  ok(encher < 4000, 'encher o mapa acima do teto não custa uma ordenação por inserção',
     `30.000 inserções levaram ${encher} ms`);
  console.log(`  [medida] 30.000 inserções com o mapa acima do teto: ${encher} ms`);

  const marca = Date.now();
  for (let i = 0; i < 5000; i++) passe('quente', 1e9, 3600, t0 + 40000 + i);
  const levou = Date.now() - marca;
  ok(levou < 300, 'e a rota quente não paga varredura do mapa a cada chamada',
     `5.000 chamadas levaram ${levou} ms`);
  console.log(`  [medida] 5.000 chamadas no mesmo balde: ${levou} ms`);

  /* o que importa depois de tudo isso: um IP novo ainda é atendido E contado,
     ou seja, o limitador continua limitando com o mapa cheio */
  for (let i = 0; i < 3; i++) {
    ok(passe('novo', 3, 60, t0 + 90000).ok, `com o mapa cheio, o passe ${i + 1} do IP novo entra`);
  }
  ok(!passe('novo', 3, 60, t0 + 90000).ok, 'e o quarto dele é barrado como sempre');
}

if (falhas) { console.log(`\nteto-de-taxa: ${falhas} falha(s) em ${feitas}\n`); process.exit(1); }
console.log(`\nteto-de-taxa: ${feitas}/${feitas} ok\n`);
