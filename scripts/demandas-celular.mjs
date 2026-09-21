/* O SISTEMA DE DEMANDAS MEDIDO NO TAMANHO DE CELULAR.

   Abrir a tela e achar bonito não é auditoria. Esta mede, em cada tela e em
   cada papel, as coisas que quebram a leitura no celular e que o olho deixa
   passar porque o navegador de mesa esconde:

     1. ROLAGEM LATERAL. Em 320px, qualquer elemento mais largo que a tela
        faz a página inteira deslizar de lado. É o defeito mais comum e o
        mais fácil de não ver, porque no desktop sobra espaço.
     2. ALVO DE TOQUE PEQUENO. Botão, link ou campo com menos de 44px de
        altura é o que faz a pessoa errar o toque três vezes. 44 é o número
        da Apple e o da WCAG (2.5.5); uso 44.
     3. TEXTO MIÚDO. Abaixo de 12px ninguém lê no ônibus.
     4. TECLADO ERRADO. Campo de telefone, de número e de data que não diz
        `type`/`inputMode` abre o teclado de letras, e a pessoa digita
        errado. Custa um atributo e economiza um erro por preenchimento.
     5. CONTRASTE. Texto com razão abaixo de 4.5:1 (WCAG AA) some no sol.
     6. ZOOM BLOQUEADO. `user-scalable=no` ou `maximum-scale=1` tira de quem
        enxerga pouco a única saída que sobra.
     7. CAMPO QUE DÁ ZOOM SOZINHO. No iOS, input com fonte menor que 16px
        faz o Safari dar zoom ao focar, e a pessoa fica com a tela torta.

   Mede em 320 (o menor celular que ainda aparece) e 390 (o comum hoje).

   Precisa do app no ar em 127.0.0.1:3400, ligado na ponte da porta 54321.
   Sobe com `scripts/demandas-celular-subir.sh`.

   Roda com `node scripts/demandas-celular.mjs`. */

import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { MEDIR, chromeDoContainer, criaContador, julgar, imprimirDetalhe } from './medida-celular.mjs';
import { medirContraste } from './contraste-real.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:3400';
const FOTOS = '/tmp/celular';
const TELAS = [{ nome: '320', width: 320, height: 640 }, { nome: '390', width: 390, height: 844 }];

/* um token por papel: o menu de abas e os botões mudam com o papel, então
   auditar só como admin esconderia metade da interface */
const PAPEIS = [
  { tok: 'tok-admin',    quem: 'admin' },
  { tok: 'tok-comunica', quem: 'responsavel' },
  { tok: 'tok-pede',     quem: 'solicitante' },
];

/* OS NUMEROS VEM DA SEMENTE, NAO DA MEMORIA.

   Eram 4, 3 e 6, escritos a mao. `numero` e `nextval`, e sequencia nao volta
   atras em rollback: cada conferencia de migracao que abre e desfaz uma
   demanda queima numeros. Quando o roteiro passou a aplicar as migracoes 84 a
   87, a semente nasceu em 40 e as tres telas de detalhe deixaram de existir —
   e o medidor seguiu verde, medindo a tela de "essa demanda nao existe", que
   tambem passa em contraste e em alvo de toque. Instrumento que mede a tela
   errada e pior que instrumento nenhum.

   Medido: com as tres rotas apontando para o vazio, apagar `min-width:0` de
   `.dm-dupla` e o `overflow-wrap` do historico nao reprovava nada. */
const N = JSON.parse(readFileSync('/tmp/celular-numeros.json', 'utf8'));
for (const k of ['execucao', 'travada', 'concluida', 'comLink', 'atrasada']) {
  if (!N[k]) {
    console.error(`sem demanda "${k}" na semente: rode scripts/demandas-celular-subir.sh`);
    process.exit(1);
  }
}

const PAGINAS = [
  { rota: '/demandas',           nome: 'lista' },
  { rota: '/demandas/nova',      nome: 'nova' },
  { rota: '/demandas/numeros',   nome: 'numeros', so: ['admin', 'responsavel'] },
  { rota: '/demandas/ajustes',   nome: 'ajustes', so: ['admin'] },
  { rota: `/demandas/d/${N.execucao}`,  nome: 'detalhe-execucao' },
  { rota: `/demandas/d/${N.travada}`,   nome: 'detalhe-travada' },
  { rota: `/demandas/d/${N.concluida}`, nome: 'detalhe-concluida' },
  /* A DEMANDA COM LINK COLADO E COM ANEXO, QUE E ONDE MORAM OS DEFEITOS DE
     LARGURA. A semente nao tinha nenhuma ate 21/09, e por isso 252
     conferencias ficaram verdes com um cartao de 853px dentro de 320px. */
  { rota: `/demandas/d/${N.comLink}`,   nome: 'detalhe-com-link-colado' },
  /* A ATRASADA, que a semente publica desde 21/09 e que nenhuma rota usava.
     Ela e a unica que exercita a pilula vermelha, o "51 dias de atraso" e a
     ordem da lista com atraso primeiro. Chave calculada e nao lida e peso
     sem medida. */
  { rota: `/demandas/d/${N.atrasada}`,  nome: 'detalhe-atrasada' },
];

const { estado, ok } = criaContador();
const achados = [];

/* A MEDIDA MORA EM `medida-celular.mjs`, E ISSO É DE PROPÓSITO.

   Ela nasceu aqui dentro e saiu quando chegou a vez de medir as escalas.
   Manter uma cópia em cada arquivo seria o começo de duas medidas
   diferentes: eu consertaria um viés de um lado e o outro continuaria
   mentindo do jeito antigo. Cada defesa que está lá custou uma auditoria
   inteira de relatório falso — a exceção do link dentro de frase, o piso de
   11px para etiqueta, o "dia" que não é data, o recorte do pai que não
   empurra a página. Valem igual nas duas casas.

   O contraste saiu junto e foi mais longe: `contraste-real.mjs` mede nos
   pixels da tela em vez de perguntar ao CSS qual seria o fundo. */

/* ------------------------------------------------------------------ roda */
mkdirSync(FOTOS, { recursive: true });
const nav = await chromium.launch({ executablePath: chromeDoContainer() });

try {
  for (const tela of TELAS) {
    for (const papel of PAPEIS) {
      const ctx = await nav.newContext({
        viewport: { width: tela.width, height: tela.height },
        deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce',
      });
      const pag = await ctx.newPage();
      const recusas = [];
      pag.on('console', m => {
        if (m.type() === 'error' && /Refused to apply style|Failed to load resource.*\.css/i.test(m.text())) {
          recusas.push(m.text().slice(0, 140));
        }
      });
      /* entra pelo link pessoal uma vez; o token fica guardado */
      await pag.goto(`${BASE}/demandas?t=${papel.tok}`, { waitUntil: 'networkidle' });
      await pag.waitForTimeout(700);

      /* A FOLHA CHEGOU? SE NÃO, TUDO ABAIXO É MENTIRA.

         Isto existe porque aconteceu: um `next start` velho continuou de pé
         na porta enquanto eu subia o novo, e passou a servir o manifesto
         antigo. A folha de demandas virou 404, o 404 volta como HTML, o
         navegador recusa o HTML como CSS — e a auditoria mediu uma página
         SEM ESTILO NENHUM, relatando alegremente "54 defeitos". Todos
         falsos: a logo aparecia com 20px de altura porque não tinha regra,
         não porque a regra estava errada.

         Medir sem conferir se há o que medir é o jeito mais rápido de
         produzir um relatório inteiro de mentira. Então: a casca tem que
         existir e as variáveis dela têm que resolver, senão para aqui. */
      const folha = await pag.evaluate(() => {
        const casca = document.querySelector('.dm');
        if (!casca) return { ok: false, por: 'a casca .dm não existe na página' };
        const cs = getComputedStyle(casca);
        const bg = cs.getPropertyValue('--dm-bg').trim();
        if (!bg) return { ok: false, por: 'as variáveis --dm-* não resolvem: a folha não foi aplicada' };
        const logo = document.querySelector('.dm-logo');
        if (logo && getComputedStyle(logo).display === 'inline') {
          return { ok: false, por: 'a logo está sem estilo (display:inline): folha ausente' };
        }
        return { ok: true };
      });
      if (!folha.ok || recusas.length) {
        console.log(`  PAREI em ${tela.nome}px · ${papel.quem}: ${folha.por || 'o navegador recusou a folha'}`);
        if (recusas.length) console.log('    ' + recusas[0]);
        console.log('    Auditar sem folha produz relatório falso. Suba o app de novo e repita.');
        ok(false, `${tela.nome}px · ${papel.quem} — a folha de demandas chegou`);
        await ctx.close();
        continue;
      }

      /* E O TOKEN PEGOU? SE NÃO, EU ESTOU AUDITANDO O PORTÃO.

         Também aconteceu: a suíte de banco (`demandas-banco.sh`) derruba e
         recria o banco `dem`, e levou junto os dados desta auditoria. Os
         tokens sumiram, `dem_quem_sou` passou a responder SEM_ACESSO, e
         todas as rotas caíram na tela de "Entre para ver as demandas".

         Essa tela não tem defeito nenhum: um título, um parágrafo e um
         botão. Então a auditoria anunciou "252/252 ok" — medindo sete vezes
         a mesma tela de login, em vez das sete telas do sistema.

         Relatório verde sobre a tela errada é pior que relatório vermelho.
         Daqui em diante, se a casca não mostra as abas de quem entrou,
         para. */
      const dentro = await pag.evaluate(() => {
        const abas = document.querySelector('.dm-abas');
        if (!abas) return { ok: false, por: 'sem as abas: a sessão não foi reconhecida (o portão está na tela)' };
        const quantas = abas.querySelectorAll('a').length;
        if (!quantas) return { ok: false, por: 'as abas estão vazias' };
        return { ok: true, quantas };
      });
      if (!dentro.ok) {
        console.log(`  PAREI em ${tela.nome}px · ${papel.quem}: ${dentro.por}`);
        console.log('    Semeie o banco de novo (scripts/demandas-celular-subir.sh) e repita.');
        ok(false, `${tela.nome}px · ${papel.quem} — a sessão foi reconhecida`);
        await ctx.close();
        continue;
      }

      for (const p of PAGINAS) {
        if (p.so && !p.so.includes(papel.quem)) continue;
        await pag.goto(BASE + p.rota, { waitUntil: 'networkidle' });
        /* transição desligada, animação NÃO: desligar a animação congela
           qualquer cortina de abertura por cima da tela. Ver a nota em
           `contraste-real.mjs`. Aqui a casca de demandas não tem cortina,
           mas a folha do site inteiro está carregada junto. */
        await pag.addStyleTag({ content: '*,*::before,*::after{transition:none!important}' });
        await pag.waitForTimeout(600);

        /* medir primeiro, retratar depois: `fullPage` estica a janela e
           refaz o layout, e quem medir no rastro disso mede uma tela ainda
           se recompondo. Rendeu dois avisos fantasma antes de eu notar. */
        const m = await pag.evaluate(MEDIR, tela.width);
        const etiqueta = `${tela.nome}px · ${papel.quem} · ${p.nome}`;
        Object.assign(m, await medirContraste(pag));
        await pag.screenshot({ path: `${FOTOS}/${tela.nome}-${papel.quem}-${p.nome}.png`, fullPage: true });

        julgar(ok, etiqueta, m, tela.width);

        if (m.estoura.length || m.pequenos.length || m.miudos.length || m.zoomIos.length ||
            m.teclado.length || m.fracos.length) {
          achados.push({ etiqueta, ...m });
        }
      }
      await ctx.close();
    }
  }
} catch (e) {
  estado.falhas++; console.log('  ERRO:', String(e).slice(0, 400));
} finally {
  await nav.close().catch(() => {});
}

imprimirDetalhe(achados);
console.log(estado.falhas
  ? `\ncelular: ${estado.falhas} falha(s) em ${estado.feitas}`
  : `\ncelular: ${estado.feitas}/${estado.feitas} ok`);
console.log(`(fotos em ${FOTOS})`);
process.exit(estado.falhas ? 1 : 0);
