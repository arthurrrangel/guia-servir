/* O DEMANDAS NAS SETE LARGURAS, COM O QUE O OLHO DEIXOU PASSAR · 23/09/2026.

   `demandas-celular.mjs` mede o celular (320 e 390) e o que quebra o toque.
   Esta mede as outras formas da mesma tela, do celular ao monitor largo,
   onde moram os defeitos que só aparecem quando a tabela muda de forma:

     1. ROLAGEM LATERAL em qualquer largura, e não só no celular.
     2. O "·" ÓRFÃO NA LINHA DE CONTEXTO. A linha embaixo do título da
        demanda tem três partes (de onde vem · quem pediu · com quem está),
        separadas por um ponto que a folha desenha antes de cada parte. Em
        23/09/2026 a correção que escondia o setor nas próprias demandas
        deixou o ponto: toda linha de quem pede começava com "· Reparo
        elétrico", em 768, 1024, 1280 e 1440. Foi conferida numa largura só,
        e com o papel errado. Aqui: a primeira parte visível de cada linha
        de contexto não pode ter ponto antes.
     3. O ÍCONE DA LINHA SOMADA ("1 pedido de papel espera você") na altura
        da primeira linha da frase, com 4px de folga, em toda largura. Ele
        flutuou 8px acima da linha em 390 depois de uma correção feita para
        320.
     4. NENHUM TRAVESSÃO no texto da tela: a regra do texto daqui.
     5. O VALOR DE CADA SELECT CABE NA CAIXA FECHADA (medido com a letra
        dela): "Manutenção e inf…" saía nos sete selects de cada grupo de
        Categorias, entre 768 e 1279.
     6. A BARRA FIXA DO CELULAR NUNCA É SÓ "MAIS". Em 24/09/2026 a demanda
        encerrada (concluída vista pela equipe, confirmada, cancelada) tinha
        uma barra com um único botão genérico de 288 a 720px, e as abas
        sumiam; só as fichas em andamento estavam no conjunto medido.
     7. O VALOR DE CADA PAR DA FICHA NA LETRA DO TEXTO (14px), e não na do
        rótulo: o orçamento, o número que decide Aprovar ou Recusar, saía em
        12px cinza, porque a regra do rótulo pegava todo `span`.

   Precisa do app no ar em 127.0.0.1:3400, com a semente de
   `scripts/demandas-celular-subir.sh` (os números das demandas vêm de
   /tmp/celular-numeros.json, que o roteiro escreve).

   Roda com `node scripts/demandas-larguras.mjs`. */

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { chromeDoContainer } from './medida-celular.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:3400';
const LARGURAS = (process.env.LARGURAS || '320,390,768,1024,1280,1440,1920').split(',').map(Number);
const N = JSON.parse(readFileSync('/tmp/celular-numeros.json', 'utf8'));

const PAPEIS = [
  { tok: 'tok-admin', quem: 'admin', rotas: [
    ['inicio', '/demandas'], ['atendimento', '/demandas/atendimento'], ['numeros', '/demandas/numeros'],
    ['admin-pessoas', '/demandas/admin'], ['admin-setores', '/demandas/admin?secao=setores'],
    ['admin-categorias', '/demandas/admin?secao=categorias'], ['admin-anexos', '/demandas/admin?secao=anexos'],
    ['admin-pessoa', `/demandas/admin/pessoas/${N._pessoa}`], ['ficha', `/demandas/d/${N.admin.execucao}`],
    ['ficha-aprovacao', `/demandas/d/${N.admin.travada}`]] },
  { tok: 'tok-comunica', quem: 'responsavel', rotas: [
    ['inicio', '/demandas'], ['atendimento', '/demandas/atendimento'], ['atendimento-fila', '/demandas/atendimento?ver=fila'],
    ['ficha', `/demandas/d/${N.responsavel.execucao}`], ['ficha-travada', `/demandas/d/${N.responsavel.travada}`],
    ['avisos', '/demandas/avisos'], ['ficha-encerrada', `/demandas/d/${N.responsavel.concluida}`],
    ['ficha-confirmada', `/demandas/d/${N.responsavel.validada}`]] },
  { tok: 'tok-pede', quem: 'solicitante', rotas: [
    ['inicio', '/demandas'], ['nova', '/demandas/nova'], ['ficha', `/demandas/d/${N.solicitante.execucao}`],
    ['ficha-concluida', `/demandas/d/${N.solicitante.concluida}`], ['ficha-confirmada', `/demandas/d/${N.solicitante.validada}`],
    ['avisos', '/demandas/avisos'], ['perfil', '/demandas/perfil']] },
  { tok: 'tok-lider', quem: 'lider', rotas: [['inicio', '/demandas']] },
];

let feitas = 0, falhas = 0;
function ok(c, rot, extra) {
  feitas++;
  if (!c) { falhas++; console.log('  FALHOU:', rot, extra ? ` · ${extra}` : ''); }
}

const nav = await chromium.launch({ executablePath: chromeDoContainer() });
for (const w of LARGURAS) {
  const celular = w <= 430;
  for (const p of PAPEIS) {
    const ctx = await nav.newContext({ viewport: { width: w, height: celular ? 844 : 900 }, deviceScaleFactor: 1,
      isMobile: celular, hasTouch: celular, reducedMotion: 'reduce' });
    const pag = await ctx.newPage();
    await pag.goto(`${BASE}/demandas?t=${p.tok}`, { waitUntil: 'networkidle' });
    for (const [nome, rota] of p.rotas) {
      await pag.goto(BASE + rota, { waitUntil: 'networkidle' });
      await pag.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
      await pag.waitForTimeout(400);
      const etiqueta = `${w}px · ${p.quem} · ${nome}`;
      const m = await pag.evaluate(() => {
        const visivel = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
        const semPonto = c => c === 'none' || c === 'normal' || c === '""' || c === '';
        /* 2. a primeira parte visível de cada linha de contexto não abre com
              "·", nem a parte que abre uma linha quebrada (no celular a linha
              quebra entre as partes, e o ponto dela tem que cair fora da
              caixa do título, que corta) */
        const orfaos = [];
        let contextos = 0;
        for (const c of document.querySelectorAll('.dm-c-ctx')) {
          if (!visivel(c)) continue;
          const partes = [...c.children].filter(x => getComputedStyle(x).display !== 'none' && (x.textContent || '').trim());
          if (!partes.length) continue;
          contextos++;
          const antes = getComputedStyle(partes[0], '::before').content;
          if (!semPonto(antes)) { orfaos.push(`«${(c.textContent || '').trim().slice(0, 40)}» abre com ${antes}`); continue; }
          const caixa = c.closest('.dm-c-tit') || c.parentElement;
          const corta = /hidden|clip/.test(getComputedStyle(caixa).overflowX);
          const borda = caixa.getBoundingClientRect().left;
          for (const p of partes.slice(1)) {
            const pa = getComputedStyle(p, '::before');
            if (semPonto(pa.content)) continue;
            const abreLinha = p.getBoundingClientRect().left - borda < 2;
            if (abreLinha && !(pa.position === 'absolute' && corta)) {
              orfaos.push(`«${(p.textContent || '').trim().slice(0, 30)}» abre uma linha com ${pa.content}`);
            }
          }
        }
        /* e todo `.dm-sep` corta o que sai pela esquerda (o ponto da peça que
           abre linha) */
        for (const s of document.querySelectorAll('.dm-sep')) {
          if (visivel(s) && !/hidden|clip/.test(getComputedStyle(s).overflowX)) {
            orfaos.push(`um .dm-sep sem corte: «${(s.textContent || '').trim().slice(0, 30)}»`);
          }
        }
        /* 3. o ícone da linha somada na altura da primeira linha da frase */
        const tortos = [];
        let somas = 0;
        for (const s of document.querySelectorAll('.dm-item-soma')) {
          if (!visivel(s)) continue;
          const ic = s.querySelector('.dm-c-num svg');
          const b = s.querySelector('.dm-c-tit > b');
          if (!ic || !b) continue;
          somas++;
          const lh = parseFloat(getComputedStyle(b).lineHeight) || 20;
          const ri = ic.getBoundingClientRect(), rb = b.getBoundingClientRect();
          const dif = Math.round((ri.top + ri.height / 2) - (rb.top + lh / 2));
          if (Math.abs(dif) > 4) tortos.push(`«${(b.textContent || '').trim().slice(0, 30)}» ${dif}px`);
        }
        /* 5. o valor escolhido num select cabe na caixa fechada: medido com a
              letra da própria caixa ("Manutenção e inf…" nos sete selects de
              cada grupo de Categorias, em 768 a 1279) */
        const cortados = [];
        const regua = document.createElement('canvas').getContext('2d');
        for (const s of document.querySelectorAll('select')) {
          if (!visivel(s)) continue;
          const op = s.options[s.selectedIndex];
          if (!op || !op.text.trim()) continue;
          const cs = getComputedStyle(s);
          regua.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
          const cabe = s.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
          const mede = regua.measureText(op.text.trim()).width;
          if (mede > cabe + 1) cortados.push(`«${op.text.trim().slice(0, 30)}» ${Math.round(mede)}/${Math.round(cabe)}px`);
        }
        /* 6. a barra fixa do celular nunca é só "Mais" */
        let soMais = '';
        const barra = document.querySelector('.dm-barra-acao');
        if (barra && visivel(barra)) {
          const bs = [...barra.querySelectorAll('button,a')].filter(visivel);
          if (bs.length === 1 && (bs[0].textContent || '').trim() === 'Mais') soMais = 'a barra tem só "Mais"';
        }
        /* 7. o valor de cada par da ficha na letra do texto */
        const miudos = [];
        for (const v of document.querySelectorAll('.dm-pares > div > span:not(:first-child)')) {
          if (!visivel(v)) continue;
          const px = parseFloat(getComputedStyle(v).fontSize);
          if (px < 14) miudos.push(`«${(v.textContent || '').trim().slice(0, 24)}» em ${px}px`);
        }
        const raiz = document.querySelector('.dm') || document.body;
        return {
          rola: document.documentElement.scrollWidth - window.innerWidth,
          orfaos, contextos, tortos, somas, cortados, soMais, miudos,
          travessao: (raiz.innerText || '').split('\n').filter(l => l.includes('—')).slice(0, 2),
        };
      });
      ok(m.rola <= 1, `${etiqueta} · a página não rola de lado`, `${m.rola}px a mais`);
      ok(m.orfaos.length === 0, `${etiqueta} · nenhuma linha de contexto abre com "·" (${m.contextos} linhas)`,
        m.orfaos.slice(0, 2).join(' | '));
      ok(m.tortos.length === 0, `${etiqueta} · o ícone da linha somada fica na primeira linha (${m.somas})`,
        m.tortos.join(' | '));
      ok(m.travessao.length === 0, `${etiqueta} · nenhum travessão no texto da tela`, m.travessao.join(' | '));
      ok(m.cortados.length === 0, `${etiqueta} · o valor de cada select cabe na caixa`, m.cortados.slice(0, 3).join(' | '));
      ok(!m.soMais, `${etiqueta} · a barra fixa não é só "Mais"`, m.soMais);
      ok(m.miudos.length === 0, `${etiqueta} · o valor de cada par na letra do texto`, m.miudos.slice(0, 2).join(' | '));
    }
    await ctx.close();
  }
}
await nav.close();

if (falhas) { console.log(`\nlarguras: ${falhas} falha(s) em ${feitas}`); process.exit(1); }
console.log(`\nlarguras: ${feitas}/${feitas} ok`);
