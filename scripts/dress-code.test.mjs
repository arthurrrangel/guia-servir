/* O DRESS CODE DO LOUVOR · 116 · 26/10/2026.

   O líder do Louvor pediu, e o Arthur trouxe: definir antes como quem está
   escalado se veste, e que "ninguém precise ficar perguntando no grupo quais
   roupas ou cores deverá utilizar". Este arquivo prende:
     · o formato que a tela aceita (o mesmo que o banco confere na 116);
     · o bloco DRESS CODE da mensagem do grupo, linha por linha, em todos os
       recortes, com o link das cores e das inspirações;
     · a assinatura do envio: o dia sem dress code fica igual (o robô não
       reenvia nada), e mudar cor, estilo ou orientações pede mensagem nova;
     · a rota do robô leva o bloco (a mensagem dele é a mesma da tela);
     · as cores (o nome sugerido, a tinta sobre a amostra), reaproveitar um
       dress code anterior e o pedido ao gerador de imagens.

   Roda com `npm test`. */
import * as E from '@/lib/engine';
import {
  PALETA, LIMITES, rascunhoValido, rascunhoDe, rascunhoVazio, lerDressCode, linhasDoDressCode, corMaisProxima, tintaSobre,
  amostraClara, dressCodesAnteriores, promptDaInspiracao, caminhoNovoDaImagem, urlDaImagem, temDressCode, parteDaAssinaturaDoDress,
  dressDoLink, dressPublico, idDoDressValido, resumoDoDress, uuidV4,
} from '@/lib/dress-code';
import { respostaDoRobo } from '@/lib/robo-grupos';
import { erroDaImagem } from '@/lib/dress-code-imagem';

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => { feitas++; if (!c) { falhas++; console.log('  FALHOU:', rot, extra ? '\n   ' + extra : ''); } };

const EQ = '6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const IMG = n => `${EQ}/0b8f6c1e-1d2a-4c3b-9e4f-5a6b7c8d9e${String(n).padStart(2, '0')}.webp`;
const ID = '3f2a1b0c-9d8e-4f7a-8b6c-5d4e3f2a1b0c';
const DRESS = {
  v: 1, id: ID, atualizado_em: '2026-10-26T20:00:00.000Z',
  combinacoes: [{ cores: [{ hex: '#1f2a44', nome: 'Azul-marinho' }, { hex: '#e3d5bd', nome: 'Bege' }] }],
  estilo: 'esporte-fino', orientacoes: 'Camisa lisa, sem estampa.\nTênis branco ou sapato escuro.', imagens: [{ caminho: IMG(1) }],
};

/* ------------------------------------------------------------ o formato */
{
  ok(temDressCode('louvor') && !temDressCode('midia') && !temDressCode(null), 'só o Louvor tem dress code (por enquanto)');
  const d = lerDressCode(DRESS);
  ok(d && d.id === ID && d.combinacoes[0].cores.length === 2 && d.estilo === 'esporte-fino' && d.imagens.length === 1, 'o dress code do banco chega inteiro');
  ok(lerDressCode({ ...DRESS, id: 'x' }) === null && lerDressCode({ ...DRESS, combinacoes: [] }) === null && lerDressCode('x') === null && lerDressCode(null) === null,
    'sem id, sem cor ou torto: não chega');
  const t = lerDressCode({ ...DRESS, estilo: 'pijama', imagens: [{ caminho: '../x.webp' }, { caminho: IMG(2), ia: true }],
    combinacoes: [{ cores: [{ hex: 'azul', nome: 'Azul' }, { hex: '#ffffff', nome: '  Branco  ' }] }] });
  ok(t.estilo === null && t.imagens.length === 1 && t.imagens[0].ia === true && t.combinacoes[0].cores.length === 1 && t.combinacoes[0].cores[0].nome === 'Branco',
    'o que não vale fica de fora: estilo desconhecido, caminho torto, cor sem hex', JSON.stringify(t));

  const r = rascunhoDe(d);
  ok(rascunhoValido(r, EQ).ok, 'o rascunho de um dress code bom é bom');
  r.combinacoes[0].cores[0].nome = 'Outro';
  ok(d.combinacoes[0].cores[0].nome === 'Azul-marinho', 'o rascunho é cópia: editar não mexe no original');
  const erro = (x) => { const v = rascunhoValido(x, EQ); return v.ok ? '' : v.erro; };
  ok(/ao menos uma cor/.test(erro(rascunhoVazio())), 'sem cor: pede uma');
  ok(/No máximo 3 combinações/.test(erro({ ...r, combinacoes: [1, 2, 3, 4].map(() => ({ cores: [{ hex: '#111111', nome: 'Preto' }] })) })), 'quatro combinações: não');
  ok(/No máximo 5 cores/.test(erro({ ...r, combinacoes: [{ cores: PALETA.slice(0, 6) }] })), 'seis cores numa combinação: não');
  ok(/não é válida/.test(erro({ ...r, combinacoes: [{ cores: [{ hex: '#12345', nome: 'X' }] }] })), 'hex torto: não');
  ok(/Dê um nome/.test(erro({ ...r, combinacoes: [{ cores: [{ hex: '#123456', nome: '   ' }] }] })), 'cor sem nome: não');
  ok(/passam de 400/.test(erro({ ...r, orientacoes: 'x'.repeat(401) })), 'orientações longas demais: não');
  ok(/não é deste ministério/.test(erro({ ...r, imagens: [{ caminho: IMG(1).replace(EQ, '7f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b') }] })), 'imagem da pasta de outro ministério: não');
  ok(/repetida/.test(erro({ ...r, imagens: [{ caminho: IMG(1) }, { caminho: IMG(1) }] })), 'imagem repetida: não');
  ok(/No máximo 8 imagens/.test(erro({ ...r, imagens: Array.from({ length: 9 }, (_, i) => ({ caminho: IMG(i + 10) })) })), 'nove imagens: não');
  ok(LIMITES.combinacoes === 3 && LIMITES.cores === 5 && LIMITES.imagens === 8 && LIMITES.orientacoes === 400, 'os limites são os do banco (116)');
}

/* ------------------------------------------------------------ a mensagem */
{
  const d = lerDressCode(DRESS);
  ok(JSON.stringify(linhasDoDressCode(d, 'https://guiaservir.com')) === JSON.stringify([
    'DRESS CODE', 'Azul-marinho + Bege', 'Esporte fino. Camisa lisa, sem estampa. Tênis branco ou sapato escuro.',
    `Cores e inspirações: https://guiaservir.com/dress/${ID}`,
  ]), 'o bloco: as cores, o estilo com as orientações numa linha, e o link', JSON.stringify(linhasDoDressCode(d, 'https://guiaservir.com')));
  const duas = lerDressCode({ ...DRESS, estilo: null, orientacoes: '', imagens: [],
    combinacoes: [...DRESS.combinacoes, { cores: [{ hex: '#111111', nome: 'Preto' }, { hex: '#ffffff', nome: 'Branco' }] }] });
  ok(JSON.stringify(linhasDoDressCode(duas, 'https://guiaservir.com/')) === JSON.stringify([
    'DRESS CODE', 'Azul-marinho + Bege', 'ou Preto + Branco', `Ver as cores: https://guiaservir.com/dress/${ID}`]),
    'duas combinações ("ou"), sem estilo, sem imagem: "Ver as cores"', JSON.stringify(linhasDoDressCode(duas, 'https://guiaservir.com/')));
  ok(linhasDoDressCode(d, null).length === 3, 'sem o endereço, sem a linha do link');
}

/* a mensagem do grupo e a assinatura do envio, com o motor */
function louvor() {
  const S = E.estadoVazio();
  S.equipe = 'Louvor';
  S.config.saudacao = 'Boa noite galera';
  S.config.rodape = 'Confirma até {PRAZO}.';
  S.funcoes = ['DIRIGENTE', 'VOCAL 1', 'GUITARRA'].map((nome, i) => ({ id: 'f' + (i + 1), nome, ordem: i + 1, ativa: true, simultanea: true, tipos: ['domingo', 'follow'] }));
  S.voluntarios = [{ id: 'v1', nome: 'Pessoa Um', ativo: true, funcoes: { 'VOCAL 1': 'titular' }, indisponivel: [] }];
  S.config.grupos = [{ id: 'gb', nome: 'Louvor · Banda', funcoes: ['f3'] }];
  const dia = E.garantirDia(S, '2026-11-01');
  dia.cultoId = 'c1';
  dia.slots['VOCAL 1'] = { vid: 'v1', status: 'confirmado', fixo: true };
  return S;
}
{
  const S = louvor();
  const link = 'https://guiaservir.com/confirmar/louvor';
  const antes = E.msgEscala(S, '2026-11-01', { link });
  const assAntes = E.assinaturaDoEnvio(S, '2026-11-01');
  const assGrupoAntes = E.assinaturaDoEnvio(S, '2026-11-01', S.config.grupos[0]);
  ok(!antes.includes('DRESS CODE'), 'sem dress code, a mensagem é a de sempre');
  /* BYTE A BYTE COM O MOTOR DE ANTES DA 116 (985d8fa): os valores abaixo saíram
     dele, com este mesmo estado. O robô guarda a assinatura de cada envio, e
     uma assinatura nova num dia sem dress code faria ele mandar tudo de novo
     (a primeira versão deste teste comparava o motor novo com ele mesmo, e
     uma mutação que carimbava "d=" em todo dia passou) */
  ok(assAntes === 'j3povq' && assGrupoAntes === '1ptvmcu', 'sem dress code, a assinatura é a mesma do motor de antes da 116', `${assAntes} ${assGrupoAntes}`);
  ok(antes === 'Boa noite galera\nEscala de domingo (01/11)\n\nDIRIGENTE\n*** PRECISO DE ALGUÉM ***\n\nVOCAL 1\nPessoa Um (confirmou)\n\nGUITARRA\n*** PRECISO DE ALGUÉM ***\n\nConfirma até sábado.\nConfirma por aqui: https://guiaservir.com/confirmar/louvor'
    && E.msgEscala(S, '2026-11-01', { link, grupo: S.config.grupos[0] }) === 'Boa noite galera\nEscala de domingo (01/11) · Louvor · Banda\n\nGUITARRA\n*** PRECISO DE ALGUÉM ***\n\nConfirma até sábado.\nConfirma por aqui: https://guiaservir.com/confirmar/louvor',
    'e a mensagem também (a do grupo geral e a do recorte)');
  S.escalas['2026-11-01'].dressCode = lerDressCode(DRESS);
  const com = E.msgEscala(S, '2026-11-01', { link });
  const L = com.split('\n');
  const i = L.indexOf('DRESS CODE');
  ok(i > 0 && L[i + 1] === 'Azul-marinho + Bege' && L[i + 3] === `Cores e inspirações: https://guiaservir.com/dress/${ID}` && L[i + 4] === '' && L[i + 5] === 'Confirma até sábado.',
    'com dress code: o bloco antes do rodapé, com o link no endereço público', com);
  ok(L[L.length - 1] === `Confirma por aqui: ${link}`, 'o link de confirmar continua por último');
  const banda = E.msgEscala(S, '2026-11-01', { link, grupo: S.config.grupos[0] });
  ok(banda.includes('DRESS CODE\nAzul-marinho + Bege'), 'o recorte da Banda também leva (todo mundo se veste)');
  ok(!E.msgEscala(S, '2026-11-01', {}).includes('/dress/'), 'sem o link de confirmar (copiar sem endereço): sem o link do dress code');
  ok(E.assinaturaDoEnvio(S, '2026-11-01') !== assAntes && E.assinaturaDoEnvio(S, '2026-11-01', S.config.grupos[0]) !== assGrupoAntes,
    'dress code novo depois do envio: "mudou depois do envio" (no geral e no grupo)');
  const ass1 = E.assinaturaDoEnvio(S, '2026-11-01');
  S.escalas['2026-11-01'].dressCode = lerDressCode({ ...DRESS, atualizado_em: '2026-10-27T10:00:00.000Z' });
  ok(E.assinaturaDoEnvio(S, '2026-11-01') === ass1, 'gravar de novo igual (outra hora): a mesma assinatura');
  S.escalas['2026-11-01'].dressCode = lerDressCode({ ...DRESS, imagens: [{ caminho: IMG(1) }, { caminho: IMG(2) }] });
  ok(E.assinaturaDoEnvio(S, '2026-11-01') === ass1, 'imagem a mais: a mesma (ela aparece no link que já foi)');
  S.escalas['2026-11-01'].dressCode = lerDressCode({ ...DRESS, imagens: [] });
  ok(E.assinaturaDoEnvio(S, '2026-11-01') !== ass1, 'a primeira imagem ou a última que sai: muda ("Cores e inspirações" / "Ver as cores")');
  S.escalas['2026-11-01'].dressCode = lerDressCode({ ...DRESS, estilo: 'social' });
  ok(E.assinaturaDoEnvio(S, '2026-11-01') !== ass1, 'outro estilo: muda');
  S.escalas['2026-11-01'].dressCode = lerDressCode({ ...DRESS, combinacoes: [{ cores: [{ hex: '#111111', nome: 'Preto' }] }] });
  ok(E.assinaturaDoEnvio(S, '2026-11-01') !== ass1, 'outra cor: muda');
  delete S.escalas['2026-11-01'].dressCode;
  ok(E.assinaturaDoEnvio(S, '2026-11-01') === assAntes, 'sem dress code de novo: a assinatura de antes');
  ok(parteDaAssinaturaDoDress(lerDressCode(DRESS)).includes(ID) && !parteDaAssinaturaDoDress(lerDressCode(DRESS)).includes('http'), 'a parte da assinatura não leva o endereço (a tela e o robô estão em endereços diferentes)');

  /* a rota do robô leva o mesmo bloco, no endereço público */
  S.escalas['2026-11-01'].dressCode = lerDressCode(DRESS);
  const r = respostaDoRobo(S, '2026-11-01', { slug: 'louvor', nome: 'Louvor' }, link, '10h', '19h');
  const geral = r.linhas.find(l => l.gid === 'geral');
  ok(geral.texto === E.msgEscala(S, '2026-11-01', { link }) && geral.texto.includes(`https://guiaservir.com/dress/${ID}`), 'a rota do robô manda o mesmo texto, com o link do dress code');
  ok(geral.ass === E.assinaturaDoEnvio(S, '2026-11-01'), 'e a mesma assinatura da tela');
}

/* ------------------------------------------------------------ as cores */
{
  ok(corMaisProxima('#1e2945').nome === 'Azul-marinho' && corMaisProxima('#fefefe').nome === 'Branco' && corMaisProxima('#7a1f30').nome === 'Vinho',
    'a cor personalizada ganha o nome da mais perto', [corMaisProxima('#1e2945').nome, corMaisProxima('#fefefe').nome, corMaisProxima('#7a1f30').nome].join());
  ok(tintaSobre('#111111') === '#ffffff' && tintaSobre('#ffffff') === '#111111' && tintaSobre('#e3d5bd') === '#111111' && tintaSobre('#1f2a44') === '#ffffff', 'a tinta sobre a amostra');
  ok(amostraClara('#ffffff') && amostraClara('#f1ede4') && !amostraClara('#e3d5bd') && !amostraClara('#111111'), 'amostra quase branca ganha contorno');
  ok(new Set(PALETA.map(c => c.hex)).size === PALETA.length && new Set(PALETA.map(c => c.nome)).size === PALETA.length && PALETA.every(c => /^#[0-9a-f]{6}$/.test(c.hex) && c.nome.length <= 30),
    'a paleta: sem cor nem nome repetido, tudo no formato do banco');
}

/* ------------------------------------------------------------ reaproveitar */
{
  const esc = {
    '2026-10-04': { dressCode: lerDressCode({ ...DRESS, id: '00000000-0000-4000-8000-000000000001', estilo: 'social' }) },
    '2026-10-11': { dressCode: lerDressCode({ ...DRESS, id: '00000000-0000-4000-8000-000000000002' }) },
    '2026-10-18': { dressCode: lerDressCode({ ...DRESS, id: '00000000-0000-4000-8000-000000000003' }) },
    '2026-10-25': {},
    '2026-11-08': { dressCode: lerDressCode({ ...DRESS, id: '00000000-0000-4000-8000-000000000004', estilo: 'casual' }) },
  };
  const ant = dressCodesAnteriores(esc, '2026-11-01');
  ok(JSON.stringify(ant.map(a => a.data)) === JSON.stringify(['2026-10-18', '2026-10-04']),
    'os anteriores, do mais novo para o mais velho, sem repetir o mesmo conjunto e sem os de depois', JSON.stringify(ant.map(a => a.data)));
}

/* ------------------------------------------------------------ as imagens e a IA */
{
  ok(caminhoNovoDaImagem(EQ.toUpperCase(), 'webp', 'AAAAAAAA-1D2A-4C3B-9E4F-5A6B7C8D9E0F') === `${EQ}/aaaaaaaa-1d2a-4c3b-9e4f-5a6b7c8d9e0f.webp`, 'o caminho novo, em minúsculas');
  ok(urlDaImagem('https://x.supabase.co/', IMG(1)) === `https://x.supabase.co/storage/v1/object/public/dress-code/${IMG(1)}`, 'o endereço público da imagem');
  const p = promptDaInspiracao({ ...DRESS, orientacoes: 'Camisa lisa https://exemplo.com/x sem estampa' });
  ok(p.includes('Azul-marinho (#1f2a44)') && p.includes('Bege (#e3d5bd)') && /smart casual/.test(p) && /No people, no faces/.test(p) && !p.includes('http'),
    'o pedido à IA: as cores com o nome e o hex, o estilo, sem gente e sem link', p);
  const p2 = promptDaInspiracao({ ...DRESS, combinacoes: [...DRESS.combinacoes, { cores: [{ hex: '#111111', nome: 'Preto' }] }] }, 1);
  ok(p2.includes('Preto (#111111)') && !p2.includes('Bege'), 'a combinação escolhida');
  /* as orientações do líder como regra para AS DUAS roupas, logo depois da
     cena e antes das cores; o estilo só preenche o que elas não dizem (as
     provas em produção, 27/10/2026: no fim, como "notas", saiu bermuda com
     "Calça comprida"; com "opções" soltas, uma roupa seguiu a regra e a
     outra o estilo) */
  const p3 = promptDaInspiracao({ ...DRESS, orientacoes: 'Calça comprida; camisa "lisa" sem estampa.' });
  const iRegra = p3.indexOf('MANDATORY'), iCores = p3.indexOf('Color palette'), iEstilo = p3.indexOf('Style, only for what the rules above do not specify:');
  ok(iRegra > 0 && iRegra < iCores && iCores < iEstilo && p3.includes("Calça comprida; camisa 'lisa' sem estampa.") && /take priority over the style/.test(p3),
    'as orientações vêm como regra, antes das cores e do estilo, sem aspas que quebrem o pedido', p3);
  ok(/apply every rule to BOTH outfits and to every garment/.test(p3) && /two complete outfits/.test(p3) && /one for a man, one for a woman/.test(p3),
    'a regra vale para as duas roupas (e a cena pede uma de homem e uma de mulher)', p3);
  ok(/full-length chino trousers/.test(p3) && /No people, no faces/.test(p3), 'Esporte fino pede calça (e não "chinos" solto); sem gente continua', p3);
  const p4 = promptDaInspiracao({ ...DRESS, estilo: null, orientacoes: '' });
  ok(!p4.includes('MANDATORY') && !p4.includes('only for what the rules') && /Style: modest/.test(p4) && /full-length trousers or a knee-length or longer skirt/.test(p4),
    'sem orientações: nada de regra vazia, e o estilo vale inteiro; sem estilo: o modesto, com calça ou saia na altura', p4);
  const comCalca = E.ESTILOS.filter(e => /trousers|jeans/.test(e.ingles));
  ok(comCalca.length === 4 && comCalca.every(e => /full-length/.test(e.ingles)),
    'todo estilo com calça pede calça comprida', JSON.stringify(E.ESTILOS.map(e => e.ingles)));
}

/* ------------------------------------------------------------ o que as portas devolvem */
{
  const linha = { culto_id: 'c1', data: '2026-11-08', evento: null, inicio: null, equipe: 'Louvor', dress: DRESS };
  const l = dressDoLink([{ ...linha, culto_id: 'c2', data: '2026-11-15' }, linha, { ...linha, culto_id: 'c3', dress: { ...DRESS, id: 'torto' } }, null, 'x']);
  ok(l.length === 2 && l[0].culto_id === 'c1' && l[1].culto_id === 'c2' && l[0].dress.id === ID && l[0].evento === null,
    'a página de quem serve: os cultos em ordem de data, e o dress code torto não chega', JSON.stringify(l.map(x => x.culto_id)));
  ok(dressDoLink(null).length === 0 && dressDoLink({}).length === 0, 'sem lista, nada');
  const p = dressPublico({ ok: true, data: '2026-11-08', evento: 'Batismo', inicio: '19:30:00', equipe: 'Louvor', dress: DRESS });
  ok(p && p.data === '2026-11-08' && p.evento === 'Batismo' && p.inicio === '19:30:00' && p.dress.combinacoes.length === 1, 'a página do link do grupo');
  ok(dressPublico({ ok: false }) === null && dressPublico({ ok: true, data: 'x', dress: DRESS }) === null && dressPublico(null) === null
    && dressPublico({ ok: true, data: '2026-11-08', dress: { ...DRESS, combinacoes: [] } }) === null, 'link que não vale: nada');
  ok(idDoDressValido(ID) && !idDoDressValido(ID.toUpperCase()) && !idDoDressValido(ID + 'a') && !idDoDressValido('../etc') && !idDoDressValido(null),
    'o id do link: só o formato que o banco gera');
  ok(resumoDoDress(lerDressCode({ ...DRESS, combinacoes: [...DRESS.combinacoes, { cores: [{ hex: '#111111', nome: 'Preto' }] }] })) === 'Azul-marinho + Bege ou Preto · Esporte fino',
    'a linha da prévia do WhatsApp: as cores e o estilo', resumoDoDress(lerDressCode(DRESS)));
}

/* ------------------------------------------------------------ revisão de 26/10 */
{
  const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const sem = uuidV4({ getRandomValues: b => globalThis.crypto.getRandomValues(b) });
  const nada = uuidV4(undefined);
  ok(V4.test(uuidV4()) && V4.test(sem) && V4.test(nada) && sem !== uuidV4({ getRandomValues: b => globalThis.crypto.getRandomValues(b) }),
    'o id da imagem é um UUID v4 também sem crypto.randomUUID (http na rede local, iOS antigo)', `${sem} ${nada}`);
  ok(V4.test(caminhoNovoDaImagem(EQ, 'webp', sem).split('/')[1].replace('.webp', '')), 'e o caminho sai no formato que o armário confere');
  const comNome = nome => rascunhoValido({ ...rascunhoDe(lerDressCode(DRESS)), combinacoes: [{ cores: [{ hex: '#111111', nome }] }] }, EQ);
  ok(!comNome('Preto\u0085').ok && !comNome('Preto\u2028x').ok && !comNome('Pre\u009fto').ok && comNome('Verde-água').ok,
    'nome de cor com controle de C1 ou quebra do Unicode: a tela recusa antes do banco (o [[:cntrl:]] dele recusa)');
}

ok(/ainda não foi ligado/.test(erroDaImagem('IMAGEM_SEM_ARMARIO')) && /internet/.test(erroDaImagem('IMAGEM_REDE')) && /JPG, PNG ou WebP/.test(erroDaImagem('IMAGEM_FORMATO')),
  'a imagem que não sobe: cada motivo com a frase dele (o armário que ainda não existe não é "a internet")');

console.log(`dress-code: ${feitas - falhas}/${feitas}`);
if (falhas) process.exit(1);
