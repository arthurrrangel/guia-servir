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
/* E O NUMERO E POR PAPEL, PORQUE CADA PAPEL ENXERGA UM PEDACO — 22/09/2026.

   Depois de resolvido o "numero escrito a mao", sobrou um numero SO para os
   tres papeis. E `dem_ver` recusa por setor:

     dem_ver('tok-comunica', 79) -> {"ok": false, "erro": "NAO_EXISTE"}
     dem_ver('tok-comunica', 81) -> {"ok": true, ...}

   Maria atende comunicacao; 79 e de compras. A regra esta certa. Errado
   estava isto aqui, que mandava os tres papeis para o mesmo numero e
   fotografava, para quatro das seis fichas do responsavel, o cartao "Essa
   demanda nao existe" — que passa em contraste, em alvo de toque e em
   rolagem lateral, porque nao tem quase nada dentro.

   `demandas-celular-subir.sh` agora escolhe por papel, perguntando a
   `dem_ver`. Aqui so exijo que os dezoito numeros existam. */
const N = JSON.parse(readFileSync('/tmp/celular-numeros.json', 'utf8'));
const ESTADOS = ['execucao', 'travada', 'concluida', 'validada', 'comLink', 'atrasada'];
for (const quem of ['admin', 'responsavel', 'solicitante']) {
  for (const k of ESTADOS) {
    if (!N[quem] || !N[quem][k]) {
      console.error(`sem demanda "${k}" que o papel "${quem}" enxergue: ` +
                    'rode scripts/demandas-celular-subir.sh');
      process.exit(1);
    }
  }
}

const paginasDe = (quem) => [
  { rota: '/demandas',           nome: 'lista' },
  { rota: '/demandas/nova',      nome: 'nova' },
  { rota: '/demandas/numeros',   nome: 'numeros', so: ['admin', 'responsavel'] },
  { rota: '/demandas/ajustes',   nome: 'ajustes', so: ['admin'] },
  /* A LISTA VAZIA — 22/09/2026. A semente dá demanda a todo papel, então o
     aviso de "nada aqui" nunca era aberto, e foi nele que o Arthur viu, em
     produção, o título colado na esquerda entre duas linhas centralizadas.
     O administrador não tem nada atribuído a ele: "Comigo" fica vazio. */
  { rota: '/demandas',           nome: 'lista-vazia', so: ['admin'], clicar: 'Comigo' },
  { rota: `/demandas/d/${N[quem].execucao}`,  nome: 'detalhe-execucao' },
  { rota: `/demandas/d/${N[quem].travada}`,   nome: 'detalhe-travada' },
  { rota: `/demandas/d/${N[quem].concluida}`, nome: 'detalhe-concluida' },
  /* A CONCLUIDA JA CONFIRMADA, QUE E OUTRA CAIXA — 22/09/2026.

     No cartao verde, a etapa 5 do PDF (migracao 91) aparece como BOTAO
     enquanto ninguem confirmou e como FRASE depois de confirmada. A rota
     acima so ve o botao; esta ve a frase. Sao alturas diferentes dentro do
     mesmo `Aviso`, e so uma das duas tem alvo de toque para medir. */
  { rota: `/demandas/d/${N[quem].validada}`,  nome: 'detalhe-validada' },
  /* A DEMANDA COM LINK COLADO E COM ANEXO, QUE E ONDE MORAM OS DEFEITOS DE
     LARGURA. A semente nao tinha nenhuma ate 21/09, e por isso 252
     conferencias ficaram verdes com um cartao de 853px dentro de 320px. */
  { rota: `/demandas/d/${N[quem].comLink}`,   nome: 'detalhe-com-link-colado' },
  /* A ATRASADA, que a semente publica desde 21/09 e que nenhuma rota usava.
     Ela e a unica que exercita a pilula vermelha, o "51 dias de atraso" e a
     ordem da lista com atraso primeiro. Chave calculada e nao lida e peso
     sem medida. */
  { rota: `/demandas/d/${N[quem].atrasada}`,  nome: 'detalhe-atrasada' },
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

      for (const p of paginasDe(papel.quem)) {
        if (p.so && !p.so.includes(papel.quem)) continue;
        await pag.goto(BASE + p.rota, { waitUntil: 'networkidle' });
        /* transição desligada, animação NÃO: desligar a animação congela
           qualquer cortina de abertura por cima da tela. Ver a nota em
           `contraste-real.mjs`. Aqui a casca de demandas não tem cortina,
           mas a folha do site inteiro está carregada junto. */
        await pag.addStyleTag({ content: '*,*::before,*::after{transition:none!important}' });
        await pag.waitForTimeout(600);
        if (p.clicar) {
          await pag.getByRole('button', { name: p.clicar, exact: true }).click();
          await pag.waitForTimeout(600);
          const temVazio = await pag.evaluate(() => !!document.querySelector('.dm-centro'));
          if (!temVazio) {
            ok(false, `${tela.nome}px · ${papel.quem} · ${p.nome} — o aviso de vazio apareceu`);
            continue;
          }
        }

        /* A TERCEIRA GUARDA: A FICHA CHEGOU? — 22/09/2026.

           As duas de cima nasceram da mesma lição, com um ano de distância
           entre elas: a folha que não chegou e a sessão que não pegou. Esta
           nasce da terceira forma de medir a tela errada, e foi a mais
           difícil de ver, porque nada estava quebrado: a folha chegou, a
           sessão pegou, as abas apareceram, e a rota simplesmente respondeu
           "Essa demanda não existe" — com razão, porque o número era de
           outro setor.

           Medido em 22/09: das seis fichas do responsável, QUATRO eram esse
           cartão, nas três larguras. Dezoito conferências verdes por rodada
           sobre uma tela com um aviso, dois botões e mais nada.

           A guarda é POSITIVA de propósito: em vez de procurar o texto do
           erro (que muda), exijo o que só a ficha de verdade tem — a tarja
           `> demanda #N`. Assim ela também pega o esqueleto que não resolveu
           e a página que morreu no meio. */
        if (p.nome.startsWith('detalhe')) {
          const ficha = await pag.evaluate(() => {
            const rot = document.querySelector('.dm-rot');
            if (rot && /demanda\s*#\s*\d+/i.test(rot.textContent || '')) return { ok: true };
            const av = document.querySelector('.dm-aviso');
            const dito = av ? (av.textContent || '').trim().slice(0, 90) : '';
            return { ok: false, por: dito || 'a ficha não renderizou (sem a tarja "demanda #N")' };
          });
          if (!ficha.ok) {
            console.log(`  PAREI em ${tela.nome}px · ${papel.quem} · ${p.nome}: ${ficha.por}`);
            console.log(`    A rota ${p.rota} não abriu a ficha para este papel.`);
            console.log('    Medir o cartão de erro com o nome da ficha é relatório falso.');
            console.log('    Rode scripts/demandas-celular-subir.sh para refazer os números por papel.');
            ok(false, `${tela.nome}px · ${papel.quem} · ${p.nome} — a ficha chegou`);
            continue;
          }
        }

        /* O QUE ESTÁ DOBRADO TAMBÉM É TELA — 22/09/2026.

           A ficha passou a guardar prazo, prioridade, setor, anexo e
           cancelar dentro de `<details class="dm-mais">`. Eu escrevi aqui,
           primeiro, que fechado o conteúdo "não tem caixa" e sairia da
           medida. MEDIDO, no Chromium 141, é o contrário:

             botão dentro do details fechado
               checkVisibility() .... false
               getBoundingClientRect  254 × 44
               display / visibility . flex / visible

           O conteúdo fica em `content-visibility: hidden`: sem pintura, com
           caixa. O `vis()` de `medida-celular.mjs` olha estilo e caixa, então
           o alvo de toque é medido nos dois estados.

           E eu escrevi em seguida que o CONTRASTE precisaria da caixa aberta,
           por ler pixel. Também medi, e também não: pintando de #e9e9e9 o
           texto dos cinco botões dobrados, `medirContraste` acusou os cinco
           com a caixa fechada e os cinco com ela aberta.

           Então hoje abrir não muda o resultado, e fica por outro motivo:
           as duas medidas enxergam o conteúdo fechado por causa de um
           detalhe de como ESTE motor implementa `<details>`. Se o Chromium
           mudar isso, ou se a auditoria rodar em outro navegador, os cinco
           botões saem da medida sem nenhum aviso. Aberto, o que se mede é o
           que a pessoa vê depois do toque, em qualquer motor.

           Não mexi no `vis()`: medir a mais é o lado seguro, e trocar por
           `checkVisibility()` faria a auditoria das escalas, que usa a mesma
           medida, parar de ver o que ela hoje vê. A foto é tirada com tudo
           fechado de novo, que é como a pessoa encontra a tela. */
        const dobrados = await pag.evaluate(() => {
          const ds = [...document.querySelectorAll('details:not([open])')];
          ds.forEach(d => { d.open = true; });
          return ds.length;
        });
        if (dobrados) await pag.waitForTimeout(150);

        /* medir primeiro, retratar depois: `fullPage` estica a janela e
           refaz o layout, e quem medir no rastro disso mede uma tela ainda
           se recompondo. Rendeu dois avisos fantasma antes de eu notar. */
        const m = await pag.evaluate(MEDIR, tela.width);
        const etiqueta = `${tela.nome}px · ${papel.quem} · ${p.nome}`;
        /* o contraste também: ele lê PIXEL, e o botão dobrado não tem pixel */
        Object.assign(m, await medirContraste(pag));
        if (dobrados) {
          await pag.evaluate(() => {
            document.querySelectorAll('details[open]').forEach(d => { d.open = false; });
          });
          await pag.waitForTimeout(150);
        }
        await pag.screenshot({ path: `${FOTOS}/${tela.nome}-${papel.quem}-${p.nome}.png`, fullPage: true });

        julgar(ok, etiqueta, m, tela.width);

        /* NADA SOBRA SOZINHO NUMA LINHA — 22/09/2026.

           `.dm-opcoes` é uma grade de duas colunas feita para as quatro
           prioridades. Recebendo três opções (as seções de Ajustes, os
           períodos de Números), a terceira caía sozinha na segunda linha,
           com metade da largura, e parecia sobra. Nenhuma das conferências
           acima via isso: não é rolagem, não é alvo pequeno, não é contraste.
           É composição, e composição também se mede.

           Conta, em cada grade de opções da tela, quantos itens caem em cada
           linha. Reprova quando a última linha tem UM item e as outras têm
           mais de um. */
        const sozinhos = await pag.evaluate(() => {
          const achou = [];
          for (const g of document.querySelectorAll('.dm-opcoes, .dm-seg')) {
            const itens = [...g.children].filter(e => e.getBoundingClientRect().width > 0);
            if (itens.length < 3) continue;
            const linhas = new Map();
            for (const e of itens) {
              const y = Math.round(e.getBoundingClientRect().top);
              linhas.set(y, (linhas.get(y) || 0) + 1);
            }
            const qs = [...linhas.values()];
            if (qs.length > 1 && qs[qs.length - 1] === 1 && Math.max(...qs) > 1) {
              achou.push(`${g.className} [${itens.map(e => (e.textContent || '').trim()).join(' · ')}]`);
            }
          }
          return achou;
        });
        ok(sozinhos.length === 0, `${etiqueta} — nenhuma opção sobra sozinha na última linha`,
          sozinhos.slice(0, 2).join(' | '));

        /* O QUE ESTÁ NUM BLOCO CENTRALIZADO FICA NO CENTRO — 22/09/2026.

           `globals.css` (escalas) dá `display:flex` a todo `h3`, e com isso o
           texto do título ignora o `text-align:center` do pai. Medido: 41px
           para a esquerda em 390, 386px em 1280. Mede o centro do TEXTO de
           cada filho de `.dm-centro` contra o centro do bloco. */
        const descentrados = await pag.evaluate(() => {
          const achou = [];
          for (const bloco of document.querySelectorAll('.dm-centro')) {
            const cb = bloco.getBoundingClientRect();
            if (!cb.width) continue;
            for (const f of bloco.children) {
              if (!(f.textContent || '').trim()) continue;
              const faixa = document.createRange(); faixa.selectNodeContents(f);
              const t = faixa.getBoundingClientRect();
              if (!t.width) continue;
              const desvio = (t.left + t.width / 2) - (cb.left + cb.width / 2);
              if (Math.abs(desvio) > 3) {
                achou.push(`${f.tagName.toLowerCase()} «${f.textContent.trim().slice(0, 28)}» ${Math.round(desvio)}px`);
              }
            }
          }
          return achou;
        });
        ok(descentrados.length === 0, `${etiqueta} — o que está num bloco centralizado fica no centro`,
          descentrados.slice(0, 2).join(' | '));

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
