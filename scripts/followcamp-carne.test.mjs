/* O carnê com plano, o link pessoal e a cobrança (19/10/2026, migração 114).
   Roda com `npm test`.

   O que este arquivo protege, em ordem de quanto custa errar:

     1. O DINHEIRO DO PLANO. As parcelas somam o total ao centavo; o resto vai
        na última; "paga" só com o conferido; o que foi avisado não atrasa
        ninguém; pagamento antes do plano conta para as primeiras parcelas.
     2. AS DATAS. 10/11, 10/12 e 03/01, com folga de 3 dias para a primeira;
        vencer em 10/11 é pagar até o fim do dia 10 em Brasília.
     3. O QUE O SERVIDOR ACEITA PELO LINK. O valor não passa do que falta; o
        referente sai da ficha; o cartão só no valor do link e fora do carnê;
        o comprovante é foto ou PDF pelos primeiros bytes.
     4. A COBRANÇA. Fala com o responsável do menor e com o próprio maior; o
        texto leva o link e diz o que falta; nunca um travessão.            */
import {
  VENCIMENTOS, vencimentosDesde, maxParcelas, planoDe, situacaoDoPlano, contaDaFicha, fimDoDia, diaMes,
} from '../lib/followcamp-carne.ts';
import { conferirPagamentoDoLink, conferirPlano, conferirArquivo, tipoDosBytes, referenteDa } from '../lib/followcamp-minha.ts';
import { contatoDe, numeroWhats, mensagemDeCobranca, linkPessoal, TOKEN_OK } from '../lib/followcamp-cobranca.ts';
import { situacaoDe, ordenarSituacoes } from '../lib/followcamp-painel.ts';
import { LINKS_CARTAO } from '../lib/followcamp.ts';

let mal = 0;
const ok = (cond, queixa) => { if (!cond) { mal++; console.error(`MAL  ${queixa}`); } };
const em = (iso) => new Date(iso);
const soma = (pl) => pl.reduce((s, p) => s + p.valor, 0);

/* --------------------------------------------------------------- 2. datas --- */
{
  ok(vencimentosDesde(em('2026-10-19T12:00:00-03:00')).join() === VENCIMENTOS.join(), '19/10: as três datas');
  ok(maxParcelas(em('2026-10-19T12:00:00-03:00')) === 3, '19/10: até 3 parcelas');
  /* 08/11 + 3 dias = 11/11: 10/11 já não serve */
  ok(vencimentosDesde(em('2026-11-08T09:00:00-03:00')).join() === '2026-12-10,2027-01-03', `08/11: ${vencimentosDesde(em('2026-11-08T09:00:00-03:00'))}`);
  ok(maxParcelas(em('2026-11-08T09:00:00-03:00')) === 2, '08/11: até 2');
  /* 07/11 23:00 + 3 dias = 10/11 23:00, antes do fim do dia 10: ainda serve */
  ok(maxParcelas(em('2026-11-07T23:00:00-03:00')) === 3, '07/11 23h: ainda 3');
  ok(maxParcelas(em('2026-12-31T10:00:00-03:00')) === 1, '31/12: só 1 (03/01)');
  ok(maxParcelas(em('2027-01-01T00:00:00-03:00')) === 0, '01/01: o carnê não aceita plano novo');
  ok(fimDoDia('2026-11-10') === em('2026-11-10T23:59:59.999-03:00').getTime(), 'vencer em 10/11 é até o fim do dia em Brasília');
  ok(diaMes('2027-01-03') === '03/01', 'dia e mês');
}

/* ----------------------------------------------------- 1. o dinheiro do plano --- */
const D = em('2026-10-19T12:00:00-03:00');
{
  const a = planoDe(62730, 3, D);
  ok(a && a.map(p => p.valor).join() === '20910,20910,20910' && soma(a) === 62730, `irmãos 3x: ${a && a.map(p => p.valor)}`);
  const b = planoDe(69700, 3, D);
  ok(b && b.map(p => p.valor).join() === '23233,23233,23234' && soma(b) === 69700, `697 em 3x, o resto na última: ${b && b.map(p => p.valor)}`);
  ok(b && b.map(p => p.acumulado).join() === '23233,46466,69700', 'acumulado');
  /* 200,00 em 3: arredondar daria 66,67 + 66,67 + 66,66; o certo é cortar e pôr o resto na última */
  const r3 = planoDe(20000, 3, D);
  ok(r3 && r3.map(p => p.valor).join() === '6666,6666,6668', `200 em 3x: ${r3 && r3.map(p => p.valor)}`);
  const c = planoDe(69700, 2, D);
  ok(c && c.map(p => p.vencimento).join() === '2026-11-10,2026-12-10' && c.map(p => p.valor).join() === '34850,34850', '2x: as duas primeiras datas');
  ok(planoDe(69700, 1, D)?.[0].valor === 69700, '1x: tudo em 10/11');
  ok(planoDe(69700, 3, em('2026-11-20T10:00:00-03:00')) === null, 'plano que não cabe nas datas é nulo');
  ok(planoDe(69700, 4, D) === null && planoDe(0, 2, D) === null && planoDe(69700.5, 2, D) === null, 'entradas inválidas');

  /* o aviso não atrasa; só o conferido paga */
  const pl = planoDe(62730, 3, D);
  const antes = situacaoDoPlano(pl, 0, 12000, em('2026-10-20T10:00:00-03:00'));
  ok(antes.parcelas[0].estado === 'aberta' && antes.parcelas[0].falta === 8910 && !antes.atrasada, `R$ 120 avisados: faltam 89,10 da 1ª (${antes.parcelas[0].falta})`);
  const depois = situacaoDoPlano(pl, 0, 12000, em('2026-11-11T08:00:00-03:00'));
  ok(depois.parcelas[0].estado === 'vencida' && depois.atrasada && depois.vencidas === 1 && depois.proxima?.numero === 1, '11/11 sem completar: vencida');
  const coberta = situacaoDoPlano(pl, 0, 20910, em('2026-11-11T08:00:00-03:00'));
  ok(coberta.parcelas[0].estado === 'conferindo' && !coberta.atrasada && coberta.proxima?.numero === 2, 'avisou a parcela inteira: em conferência, não atrasa');
  const conferida = situacaoDoPlano(pl, 20910, 0, em('2026-11-11T08:00:00-03:00'));
  ok(conferida.parcelas[0].estado === 'paga' && conferida.proxima?.numero === 2, 'conferida: paga');
  const adiantou = situacaoDoPlano(pl, 50000, 0, em('2026-10-20T10:00:00-03:00'));
  ok(adiantou.parcelas.map(p => p.estado).join() === 'paga,paga,aberta' && adiantou.parcelas[2].falta === 12730, 'pagou adiantado: as primeiras quitadas, a última com o resto');
  const tudo = situacaoDoPlano(pl, 62730, 0, em('2027-02-01T10:00:00-03:00'));
  ok(tudo.proxima === null && !tudo.atrasada, 'quitado: sem próxima nem atraso');

  /* a conta da ficha */
  const conta = contaDaFicha({ valor: '627.30', pagamento: 'carne', parcelas: 3, plano_em: '2026-10-19T15:00:00Z' },
    [{ valor: 120, conferido: false }, { valor: '50.00', conferido: true }], em('2026-10-20T10:00:00-03:00'));
  ok(conta.total === 62730 && conta.pago === 5000 && conta.conferindo === 12000 && conta.falta === 45730 && !conta.quitado, `conta: ${JSON.stringify({ ...conta, plano: null, situacao: null })}`);
  ok(conta.carne && conta.plano?.length === 3 && conta.situacao?.proxima?.numero === 1, 'conta com plano');
  const semPlano = contaDaFicha({ valor: 697, pagamento: 'carne', parcelas: null, plano_em: null }, [], D);
  ok(semPlano.carne && semPlano.plano === null && semPlano.situacao === null, 'carnê sem plano');
  const aVista = contaDaFicha({ valor: 697, pagamento: 'cartao', parcelas: null, plano_em: null }, [{ valor: 697, conferido: true }], D);
  ok(aVista.quitado && !aVista.carne && aVista.falta === 0, 'à vista quitado');
  ok(contaDaFicha({ valor: null, pagamento: 'pix', parcelas: null, plano_em: null }, [], D).total === null, 'valor a confirmar');
}

/* --------------------------------------------- 3. o que o servidor aceita --- */
{
  const fichaCarne = { valor: 627.3, pagamento: 'carne', parcelas: 3, plano_em: '2026-10-19T15:00:00Z', irmao: 'Lucas' };
  const fichaVista = { valor: 697, pagamento: 'cartao', parcelas: null, plano_em: null, irmao: null };
  const pagos = [{ valor: 120, conferido: false, codigo: 'FC27X2EQXKKR', referente: 'parcela', forma: 'pix_direto' }];
  const pede = (extra) => ({ codigo: 'FC27CATRZEAA', meio: 'pixdireto', valor: 100, ...extra });

  ok(referenteDa(fichaCarne) === 'parcela' && referenteDa(fichaVista) === 'inscricao' && referenteDa({ ...fichaVista, irmao: 'X' }) === 'irmaos', 'o referente sai da ficha');
  let r = conferirPagamentoDoLink(pede({ referente: 'inscricao' }), fichaCarne, pagos, D);
  ok(r.ok && r.dados.referente === 'parcela' && r.dados.valor === 100 && !r.dados.repetido, `referente do navegador ignorado: ${JSON.stringify(r)}`);
  r = conferirPagamentoDoLink(pede({ valor: 507.31 }), fichaCarne, pagos, D);
  ok(!r.ok && /passa do que falta/.test(r.erro), 'não passa do que falta (507,30)');
  ok(conferirPagamentoDoLink(pede({ valor: 507.30 }), fichaCarne, pagos, D).ok, 'exatamente o que falta passa');
  ok(!conferirPagamentoDoLink(pede({ valor: 10.001 }), fichaCarne, pagos, D).ok, 'fração de centavo');
  ok(!conferirPagamentoDoLink(pede({ valor: 0.5 }), fichaCarne, pagos, D).ok, 'menos de R$ 1');
  ok(!conferirPagamentoDoLink(pede({ codigo: 'FC27-ERRADO' }), fichaCarne, pagos, D).ok, 'código fora do formato');
  ok(!conferirPagamentoDoLink(pede({ meio: 'boleto' }), fichaCarne, pagos, D).ok, 'meio fora da lista');
  r = conferirPagamentoDoLink({ codigo: 'FC27X2EQXKKR', meio: 'pixdireto', valor: 9999 }, fichaCarne, pagos, D);
  ok(r.ok && r.dados.repetido && r.dados.valor === 120, 'mais um comprovante do mesmo código: vale o valor do aviso');
  /* o link do cartão é injetado: a lista real pode estar vazia (29/10/2026,
     o link da Stone morreu) e o teste não pode depender de existir um */
  const LINK = [{ lote: '1º lote', ref: 'inscricao', valor: 697, parcelas: 1, url: 'https://payment-link-v3.stone.com.br/pl_TESTE' }];
  ok(!conferirPagamentoDoLink(pede({ meio: 'cartaoLink', valor: 697 }), fichaCarne, [], D, LINK).ok, 'carnê não paga no link do cartão');
  ok(conferirPagamentoDoLink(pede({ meio: 'cartaoLink', valor: 697 }), fichaVista, [], D, LINK).ok, 'à vista: cartão no valor do link');
  ok(!conferirPagamentoDoLink(pede({ meio: 'cartaoLink', valor: 300 }), fichaVista, [], D, LINK).ok, 'cartão com outro valor');
  ok(!conferirPagamentoDoLink(pede({ meio: 'cartaoLink', valor: 697 }), fichaVista, [], D, []).ok, 'sem link configurado: o cartão é recusado');
  ok(LINKS_CARTAO.every(x => x.url !== 'https://payment-link-v3.stone.com.br/pl_b1ZM7pm2zVEGwK1ues6lQqvn9jxyDRBg'), 'o link morto de 03/10 não volta');
  ok(!conferirPagamentoDoLink(pede({}), fichaVista, [{ valor: 697, conferido: true, codigo: 'FC27AAAAAAAA', referente: 'inscricao', forma: 'pix_direto' }], D).ok, 'quitado: nada a pagar');
  ok(!conferirPagamentoDoLink(pede({ titular: 'X' }), fichaVista, [], D).ok, 'nome de quem pagou inválido');

  ok(conferirPlano(3, D).ok && !conferirPlano(4, D).ok && !conferirPlano(0, D).ok && !conferirPlano('2', D).ok, 'plano de 1 a 3, número');
  ok(!conferirPlano(3, em('2026-11-20T10:00:00-03:00')).ok && conferirPlano(2, em('2026-11-20T10:00:00-03:00')).ok, 'depois de 07/11, até 2');
  ok(!conferirPlano(1, em('2027-01-02T10:00:00-03:00')).ok, 'depois de 31/12, plano nenhum');

  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400)]);
  const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(400)]);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(400)]);
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(400)]);
  ok(tipoDosBytes(jpg) === 'image/jpeg' && tipoDosBytes(pdf) === 'application/pdf' && tipoDosBytes(png) === 'image/png' && tipoDosBytes(webp) === 'image/webp', 'tipo pelos primeiros bytes');
  ok(tipoDosBytes(Buffer.from('<html>' + ' '.repeat(400))) === null, 'html não é comprovante');
  const a = conferirArquivo(jpg.toString('base64'));
  ok(a.ok && a.dados.tipo === 'image/jpeg' && a.dados.bytes === jpg.length, 'foto passa');
  ok(!conferirArquivo(Buffer.from('nao e imagem '.repeat(40)).toString('base64')).ok, 'texto não passa');
  ok(!conferirArquivo(Buffer.alloc(50).toString('base64')).ok, 'arquivo cortado não passa');
  ok(!conferirArquivo('%%%').ok && !conferirArquivo('').ok && !conferirArquivo(null).ok, 'base64 quebrado');
  ok(!conferirArquivo(Buffer.concat([pdf, Buffer.alloc(3_000_001)]).toString('base64')).ok, 'mais de 3 MB não passa');
}

/* ------------------------------------------------------------ 4. a cobrança --- */
{
  const base = {
    id: 'f1', recebida_em: '2026-10-05T15:00:00Z', origem: 'site', campista: 'Lucas Andrade Lima', nascimento: '2010-04-12', idade: 16,
    sexo: 'masculino', camisa: 'P', whats_campista: '(21) 98888-1111', alergias: null, saude: null,
    responsavel_nome: 'Renata Lima', responsavel_cpf: null, responsavel_whats: '(21) 98888-7777', parentesco: 'Mãe',
    emergencia_nome: null, emergencia_whats: null, irmao: 'Beatriz Lima', valor: 627.3, pagamento: 'carne', imagem: true,
    termo: 't', versao_termo: 'v1', lancada_por: null, cancelada_em: null, cancelada_por: null, motivo: null,
    token: '0123456789abcdef01234567', parcelas: null, plano_em: null,
  };
  ok(contatoDe(base)?.quem === 'responsavel' && contatoDe(base)?.whats === '(21) 98888-7777', 'menor: fala com o responsável');
  const adulto = { ...base, campista: 'Pedro Henrique Dias', idade: 18, responsavel_nome: null, responsavel_whats: null, whats_campista: '(21) 97777-5555', emergencia_nome: 'Ana Dias', emergencia_whats: '(21) 97777-6666' };
  ok(contatoDe(adulto)?.quem === 'campista', 'maior: fala com o próprio campista');
  ok(contatoDe({ ...adulto, whats_campista: null })?.quem === 'emergencia', 'maior sem número: o contato de emergência');
  ok(contatoDe({ ...adulto, whats_campista: null, emergencia_whats: '123' }) === null, 'sem número nenhum');
  ok(numeroWhats('(21) 98888-7777') === '5521988887777' && numeroWhats('+55 21 98888-7777') === '5521988887777' && numeroWhats('988887777') === null, 'número do WhatsApp');
  ok(TOKEN_OK.test(base.token) && !TOKEN_OK.test('0123456789ABCDEF01234567') && linkPessoal(base.token) === 'https://guiaservir.com/followcamp/minha/0123456789abcdef01234567', 'link pessoal');

  const P = [];
  const sit = (f, pags, agora) => situacaoDe(f, pags, em(agora));
  const msg = (f, pags, agora) => mensagemDeCobranca({ ficha: f, conta: sit(f, pags, agora).conta, pagamentos: sit(f, pags, agora).pagamentos, link: linkPessoal(f.token) });
  const pag = (valor, extra = {}) => ({ id: `p${valor}`, criado_em: '2026-10-05T15:00:00Z', pago_em: '2026-10-05', ficha_id: 'f1', campista: 'x', referente: 'parcela', forma: 'pix_direto', valor, quem_pagou: null, codigo: 'FC27A5SRDB4R', conferido: false, origem: 'site', stone_pedido: null, observacao: null, registrado_por: null, comprovantes: 0, ...extra });

  let t = msg(base, [pag(50)], '2026-10-20T10:00:00-03:00');
  ok(/Oi, Renata!/.test(t) && /R\$\s50,00/.test(t) && /comprovante/.test(t) && t.includes(linkPessoal(base.token)) && /de Lucas/.test(t), `avisou sem comprovante: pede o comprovante. ${t}`);
  t = msg(base, [pag(50, { comprovantes: 1 })], '2026-10-20T10:00:00-03:00');
  ok(/quantas parcelas/.test(t) && /carnê de Lucas/.test(t), `com comprovante e sem plano: escolher o plano. ${t}`);
  const comPlano = { ...base, parcelas: 3, plano_em: '2026-10-19T15:00:00Z' };
  t = msg(comPlano, [pag(50, { comprovantes: 1, conferido: true })], '2026-10-20T10:00:00-03:00');
  ok(/parcela 1 do carnê de Lucas \(R\$\s159,10\) vence em 10\/11/.test(t), `próxima parcela, descontado o que foi pago: ${t}`);
  t = msg(comPlano, [], '2026-11-12T10:00:00-03:00');
  ok(/venceu em 10\/11/.test(t) && /Se já pagou/.test(t), `vencida: ${t}`);
  const vista = { ...adulto, pagamento: 'cartao', valor: 697 };
  t = msg(vista, [], '2026-10-20T10:00:00-03:00');
  ok(/Oi, Pedro!/.test(t) && /A sua inscrição \(R\$\s697,00\) ainda está em aberto/.test(t) && /parcelar no carnê/.test(t), `à vista em aberto, falando com o próprio: ${t}`);
  {
    /* 29/10/2026: "ou no cartão" só com link do cartão para a ficha e nada pago */
    const LINK = [{ lote: '1º lote', ref: 'inscricao', valor: 697, parcelas: 1, url: 'https://payment-link-v3.stone.com.br/pl_TESTE' }];
    const quando = '2026-10-20T10:00:00-03:00';
    const cobra = (f, pags, links) => { const x = sit(f, pags, quando); return mensagemDeCobranca({ ficha: f, conta: x.conta, pagamentos: x.pagamentos, link: linkPessoal(f.token), links, agora: em(quando) }); };
    const so = { ...vista, irmao: null };
    const com = cobra(so, [], LINK), sem = cobra(so, [], []);
    ok(/paga no Pix ou no cartão e manda/.test(com), `com link: oferece o cartão. ${com}`);
    ok(/paga no Pix e manda/.test(sem) && !/cartão/.test(sem), `sem link: não promete cartão. ${sem}`);
    ok(!/cartão/.test(cobra({ ...so, irmao: 'Beatriz Lima' }, [], LINK)), 'irmão sem link de irmãos: não promete cartão');
    ok(!/cartão/.test(cobra(so, [pag(100, { conferido: true, referente: 'inscricao' })], LINK)), 'já pagou parte: não promete cartão');
  }
  t = msg(vista, [pag(697, { conferido: true, referente: 'inscricao' })], '2026-10-20T10:00:00-03:00');
  ok(/quitada/.test(t), `quitada: ${t}`);
  for (const f of [base, comPlano, vista, adulto]) {
    for (const pags of [[], [pag(50)], [pag(50, { comprovantes: 1 })], [pag(50, { conferido: true })]]) {
      const x = msg(f, pags, '2026-11-12T10:00:00-03:00');
      ok(!/[—–]/.test(x), `travessão na mensagem: ${x}`);
      ok(x.includes(linkPessoal(f.token)), 'toda mensagem leva o link');
    }
  }

  /* a ficha em maiúscula: a mensagem não grita */
  const gritando = { ...base, campista: 'LUCAS ANDRADE', responsavel_nome: 'RENATA LIMA' };
  t = msg(gritando, [], '2026-10-20T10:00:00-03:00');
  ok(/^Oi, Renata!/.test(t) && /carnê de Lucas\b/.test(t), `nome em maiúscula vira nome: ${t}`);
  t = msg({ ...base, campista: 'joão-pedro souza', responsavel_nome: "maria d'ávila" }, [], '2026-10-20T10:00:00-03:00');
  ok(/^Oi, Maria!/.test(t) && /carnê de João-Pedro\b/.test(t), `minúscula e hífen: ${t}`);
  t = msg({ ...base, responsavel_nome: 'McKenzie Souza' }, [], '2026-10-20T10:00:00-03:00');
  ok(/^Oi, McKenzie!/.test(t), `misturado fica como está: ${t}`);

  /* o painel: vencida passa na frente */
  const F = [
    { ...base, id: 'a', campista: 'A', parcelas: 3, plano_em: '2026-10-19T15:00:00Z' },
    { ...base, id: 'b', campista: 'B', pagamento: 'pix', parcelas: null },
  ];
  const Pg = [{ ...pag(50), id: 'x', ficha_id: 'b' }];
  const ordem = ordenarSituacoes(F.map(f => situacaoDe(f, Pg, em('2026-11-12T10:00:00-03:00'))));
  ok(ordem[0].ficha.id === 'a' && ordem[0].atrasado && !ordem[1].atrasado, `atrasado primeiro: ${ordem.map(x => x.ficha.id + (x.atrasado ? '!' : ''))}`);
  ok(!situacaoDe({ ...F[0], cancelada_em: '2026-11-01T00:00:00Z' }, [], em('2026-11-12T10:00:00-03:00')).atrasado, 'desistência não fica atrasada');
}

if (mal) { console.error(`\n${mal} problema(s) no carnê, no link ou na cobrança.`); process.exit(1); }
console.log('ok  followcamp-carne: plano ao centavo, datas, o que o link aceita, comprovante pelos bytes, cobrança com o link');
