/* =============================================================================
   O TETO DAS DUAS PORTAS ANÔNIMAS

   20/09/2026. Cobra o contrato de `lib/teto-de-taxa.ts`: quantas passam,
   quando começa a recusar, quando volta a deixar, e que um IP não gasta o
   passe do outro.

   O caso mais importante é o último: um teto que zera sozinho no meio da
   janela, ou que conta todo mundo no mesmo balde, é pior que nenhum — o
   primeiro não protege e o segundo derruba gente inocente.
   ============================================================================= */
import { passe, deQuem, zerar, tamanho } from '@/lib/teto-de-taxa';

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

/* 4) a VARREDURA DE EXPIRADOS não pode apagar balde vivo.
      (o despejo por teto de entradas é outro mecanismo, e está no bloco 5) */
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
     'ou seja: a contagem dele NÃO foi zerada pela varredura de expirados');

  /* E O QUE ESTE CASO **NÃO** PROVA, para o rótulo não prometer demais:
     ele exercita a varredura de EXPIRADOS, que nunca toca balde vivo. O
     despejo por TETO DE ENTRADAS, do bloco 5, é outra coisa e pode sim
     derrubar um balde vivo — inclusive o de alguém que já estourou, que volta
     a passar dentro da janela dele. Isso é a escolha assumida em
     lib/teto-de-taxa.ts, e um caso que diz "a contagem nunca é zerada" sem
     essa ressalva vira uma promessa falsa na próxima leitura. */
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

/* 6) `zerar()` TEM QUE ZERAR TAMBÉM O RELÓGIO DA PODA.

   `proximaPoda` é estado de módulo. Se `zerar()` só limpasse o mapa, um bloco
   que usa instantes ALTOS deixaria a varredura desligada para o bloco
   seguinte que usa instantes mais baixos — e as asserções do bloco seguinte
   continuariam passando, porque nenhuma delas olha o tamanho do mapa. O teste
   viraria decorativo por causa da ORDEM DOS BLOCOS, que é a última coisa em
   que alguém repara ao acrescentar um caso.

   Este bloco roda DEPOIS do 5 (que usa t0 = 8.000.000) com um t0 bem menor,
   de propósito: é exatamente o cenário que expõe o defeito. */
{
  zerar();
  const t0 = 100_000;                     // muito menor que o do bloco 5
  for (let i = 0; i < 5200; i++) passe('exp' + i, 1, 60, t0);
  /* ainda DENTRO da janela deles: a varredura roda mas não acha vencido */
  ok(tamanho() >= 5200, 'os 5200 baldes estão no mapa, todos vivos', String(tamanho()));

  /* O CASO QUE DISCRIMINA, E POR QUE ELE PRECISA OLHAR O TAMANHO.

     A primeira versão deste caso media pelo retorno de `passe`, e passava com
     a poda desligada. O motivo: `passe` trata balde vencido preguiçosamente
     (`if (!b || b.ate <= agora)` reinicia na hora), então varrer ou não
     varrer dá EXATAMENTE a mesma resposta a quem chama. A varredura é sobre
     MEMÓRIA, e memória só se mede olhando o tamanho do mapa.

     Sem o reset de `proximaPoda`, o valor deixado pelo bloco 5
     (t0 = 8.000.000) é maior que qualquer instante daqui, a varredura nunca
     roda, e os 5200 vencidos ficam no mapa para sempre. */
  /* agora DEPOIS da janela: uma chamada qualquer dispara a varredura */
  passe('gatilho', 1, 60, t0 + 120_000);
  ok(tamanho() < 100,
     'a varredura limpou os 5200 vencidos (se não, `zerar()` não zerou o relógio da poda)',
     `sobraram ${tamanho()} baldes`);
  ok(passe('vivo6', 3, 3600, t0 + 120_000).ok, 'e um balde novo continua passando');
}

if (falhas) { console.log(`\nteto-de-taxa: ${falhas} falha(s) em ${feitas}\n`); process.exit(1); }
console.log(`\nteto-de-taxa: ${feitas}/${feitas} ok\n`);
