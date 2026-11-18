/* O carnê, o link pessoal e a cobrança (19/10/2026, migração 114; carnê sem
   plano desde 18/11/2026). Roda com `npm test`.

   O que este arquivo protege, em ordem de quanto custa errar:

     1. O DINHEIRO. "Pago" só com o conferido; o que foi avisado não atrasa
        ninguém nem quita; a conta é em centavos.
     2. O CARNÊ LIVRE. Sem plano e sem data no meio: a pessoa paga quanto
        quiser, de R$ 50 até o que falta (ou só o que falta, quando falta
        menos que R$ 50), e o único atraso é passar de 03/01 devendo. Um
        plano escolhido antes de 18/11 não muda nada na conta.
     3. O QUE O SERVIDOR ACEITA PELO LINK. O valor não passa do que falta; à
        vista é o que falta, inteiro; o referente sai da ficha; o cartão só
        no valor do link e fora do carnê; o comprovante é foto ou PDF pelos
        primeiros bytes; a ficha à vista passa para o carnê só até 03/01.
     4. A COBRANÇA. Fala com o responsável do menor e com o próprio maior; o
        texto leva o link, diz o que falta e até quando; nunca um travessão. */
import { contaDaFicha, diaMes, minimoDoPagamento, PRAZO_DO_CARNE, MARCA_DO_CARNE } from '../lib/followcamp-carne.ts';
import { conferirPagamentoDoLink, conferirValorDoCarne, conferirEntradaNoCarne, conferirArquivo, tipoDosBytes, referenteDa } from '../lib/followcamp-minha.ts';
import { contatoDe, numeroWhats, mensagemDeCobranca, linkPessoal, TOKEN_OK } from '../lib/followcamp-cobranca.ts';
import { situacaoDe, ordenarSituacoes, ultimoPagamentoDe } from '../lib/followcamp-painel.ts';
import { LINKS_CARTAO, CARNE_FIM, PARCELA_MIN } from '../lib/followcamp.ts';

let mal = 0;
const ok = (cond, queixa) => { if (!cond) { mal++; console.error(`MAL  ${queixa}`); } };
const em = (iso) => new Date(iso);

const D = em('2026-11-18T12:00:00-03:00');
const ULTIMO_DIA = em('2027-01-03T23:59:00-03:00');
const DEPOIS = em('2027-01-04T00:00:00-03:00');

/* ------------------------------------------------------------ 1. o dinheiro --- */
{
  const conta = contaDaFicha({ valor: '627.30', pagamento: 'carne', parcelas: null },
    [{ valor: 120, conferido: false }, { valor: '50.00', conferido: true }], D);
  ok(conta.total === 62730 && conta.pago === 5000 && conta.conferindo === 12000 && conta.falta === 45730 && !conta.quitado, `conta: ${JSON.stringify(conta)}`);
  ok(conta.carne && !conta.vencido, 'carnê antes de 03/01: não vence');
  const aVista = contaDaFicha({ valor: 697, pagamento: 'cartao', parcelas: null }, [{ valor: 697, conferido: true }], D);
  ok(aVista.quitado && !aVista.carne && aVista.falta === 0 && !aVista.vencido, 'à vista quitado');
  const avisado = contaDaFicha({ valor: 697, pagamento: 'pix', parcelas: null }, [{ valor: 697, conferido: false }], D);
  ok(!avisado.quitado && avisado.falta === 0 && avisado.conferindo === 69700, 'avisado não quita, mas não falta nada a pagar');
  ok(contaDaFicha({ valor: null, pagamento: 'pix', parcelas: null }, [], D).total === null, 'valor a confirmar');
  ok(contaDaFicha({ valor: 697, pagamento: 'carne', parcelas: null }, [{ valor: 0.1, conferido: true }, { valor: 0.2, conferido: true }], D).pago === 30, 'centavos sem erro de vírgula (0,1 + 0,2)');
}

/* -------------------------------------------------------- 2. o carnê livre --- */
{
  ok(PRAZO_DO_CARNE === '2027-01-03' && diaMes(PRAZO_DO_CARNE) === '03/01', `o prazo é 03/01: ${PRAZO_DO_CARNE}`);
  ok(new Date(CARNE_FIM).getTime() === DEPOIS.getTime(), 'o prazo vem de CARNE_FIM (exclusivo: 04/01 00:00)');
  ok(minimoDoPagamento(69700) === PARCELA_MIN * 100 && minimoDoPagamento(3000) === 3000 && minimoDoPagamento(0) === 0, 'mínimo: R$ 50, ou o que falta');

  /* quanto quiser, de R$ 50 até o que falta */
  ok(conferirValorDoCarne(5000, 69700).ok && conferirValorDoCarne(12345, 69700).ok && conferirValorDoCarne(69700, 69700).ok, 'de R$ 50 a tudo passa, inclusive centavo quebrado');
  let v = conferirValorDoCarne(4999, 69700);
  ok(!v.ok && /pelo menos R\$\s50,00/.test(v.erro), `abaixo de R$ 50: ${JSON.stringify(v)}`);
  v = conferirValorDoCarne(69701, 69700);
  ok(!v.ok && /passa do que falta \(R\$\s697,00\)/.test(v.erro), `acima do que falta: ${JSON.stringify(v)}`);
  v = conferirValorDoCarne(2000, 3000);
  ok(!v.ok && /Falta só R\$\s30,00/.test(v.erro) && conferirValorDoCarne(3000, 3000).ok, `faltando R$ 30, só os R$ 30: ${JSON.stringify(v)}`);
  ok(!conferirValorDoCarne(0, 69700).ok && !conferirValorDoCarne(50.5, 69700).ok && !conferirValorDoCarne(5000, 0).ok, 'zero, fração de centavo e nada a pagar');

  /* o único atraso: passar de 03/01 devendo */
  const carne = { valor: 697, pagamento: 'carne', parcelas: null };
  ok(!contaDaFicha(carne, [], ULTIMO_DIA).vencido, '03/01 23h59: ainda no prazo');
  ok(contaDaFicha(carne, [{ valor: 300, conferido: true }], DEPOIS).vencido, '04/01 devendo: vencido');
  ok(!contaDaFicha(carne, [{ valor: 300, conferido: true }, { valor: 397, conferido: false }], DEPOIS).vencido, 'o resto avisado: não vence (a pessoa fez a parte dela)');
  ok(!contaDaFicha(carne, [{ valor: 697, conferido: true }], DEPOIS).vencido, 'quitado não vence');
  ok(!contaDaFicha({ valor: 697, pagamento: 'pix', parcelas: null }, [], DEPOIS).vencido, 'à vista não tem prazo de carnê');

  /* o plano de antes de 18/11 não muda a conta: 3 parcelas, nada vencido em 12/11 */
  const comPlano = { valor: 697, pagamento: 'carne', parcelas: 3, plano_em: '2026-10-19T15:00:00Z' };
  const c = contaDaFicha(comPlano, [{ valor: 50, conferido: true }], em('2026-11-12T10:00:00-03:00'));
  ok(c.carne && !c.vencido && c.falta === 64700 && !('plano' in c) && !('situacao' in c), `plano antigo ignorado: ${JSON.stringify(c)}`);
  ok(contaDaFicha({ valor: 697, pagamento: 'pix', parcelas: MARCA_DO_CARNE }, [], D).carne, 'a marca do carnê (parcelas) conta como carnê');
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
  ok(conferirPagamentoDoLink(pede({ valor: 50 }), fichaCarne, pagos, D).ok && conferirPagamentoDoLink(pede({ valor: 233.17 }), fichaCarne, pagos, D).ok, 'carnê: R$ 50 e valor quebrado passam');
  r = conferirPagamentoDoLink(pede({ valor: 49.99 }), fichaCarne, pagos, D);
  ok(!r.ok && /pelo menos/.test(r.erro), `carnê: menos de R$ 50 não passa: ${JSON.stringify(r)}`);
  ok(conferirPagamentoDoLink(pede({ valor: 80 }), fichaCarne, pagos, DEPOIS).ok, 'carnê vencido ainda paga (quem deve precisa conseguir pagar)');
  ok(!conferirPagamentoDoLink(pede({ valor: 10.001 }), fichaCarne, pagos, D).ok, 'fração de centavo');
  ok(!conferirPagamentoDoLink(pede({ valor: 0.5 }), fichaCarne, pagos, D).ok, 'menos de R$ 1');
  ok(!conferirPagamentoDoLink(pede({ codigo: 'FC27-ERRADO' }), fichaCarne, pagos, D).ok, 'código fora do formato');
  ok(!conferirPagamentoDoLink(pede({ meio: 'boleto' }), fichaCarne, pagos, D).ok, 'meio fora da lista');
  r = conferirPagamentoDoLink({ codigo: 'FC27X2EQXKKR', meio: 'pixdireto', valor: 9999 }, fichaCarne, pagos, D);
  ok(r.ok && r.dados.repetido && r.dados.valor === 120, 'mais um comprovante do mesmo código: vale o valor do aviso');
  /* à vista: o que falta, inteiro (pagar em partes é o carnê) */
  ok(conferirPagamentoDoLink(pede({ valor: 697 }), fichaVista, [], D).ok, 'à vista: o que falta passa');
  r = conferirPagamentoDoLink(pede({ valor: 300 }), fichaVista, [], D);
  ok(!r.ok && /à vista/.test(r.erro) && /carnê/.test(r.erro), `à vista: parte não passa e o recado manda para o carnê: ${JSON.stringify(r)}`);
  ok(conferirPagamentoDoLink(pede({ valor: 397 }), fichaVista, [{ valor: 300, conferido: true, codigo: null, referente: 'inscricao', forma: 'dinheiro' }], D).ok, 'à vista com dinheiro lançado: o resto passa');
  /* o link do cartão é injetado: a lista real pode estar vazia (29/10/2026,
     o link da Stone morreu) e o teste não pode depender de existir um */
  const LINK = ['1º lote', 'Lote atual'].map(lote => ({ lote, ref: 'inscricao', valor: 697, parcelas: 1, url: 'https://payment-link-v3.stone.com.br/pl_TESTE' }));
  ok(!conferirPagamentoDoLink(pede({ meio: 'cartaoLink', valor: 627.3 }), fichaCarne, [], D, LINK).ok, 'carnê não paga no link do cartão');
  ok(conferirPagamentoDoLink(pede({ meio: 'cartaoLink', valor: 697 }), fichaVista, [], D, LINK).ok, 'à vista: cartão no valor do link');
  ok(!conferirPagamentoDoLink(pede({ meio: 'cartaoLink', valor: 300 }), fichaVista, [], D, LINK).ok, 'cartão com outro valor');
  ok(!conferirPagamentoDoLink(pede({ meio: 'cartaoLink', valor: 697 }), fichaVista, [], D, []).ok, 'sem link configurado: o cartão é recusado');
  ok(LINKS_CARTAO.every(x => !/pl_b1ZM7pm2zVEGwK1ues6lQqvn9jxyDRBg|pl_LOm8gN6yVarlNRvSB5c5ld9zq307A2Wv/.test(x.url)), 'os links mortos (03/10 e o primeiro de 29/10) não voltam');
  ok(!conferirPagamentoDoLink(pede({}), fichaVista, [{ valor: 697, conferido: true, codigo: 'FC27AAAAAAAA', referente: 'inscricao', forma: 'pix_direto' }], D).ok, 'quitado: nada a pagar');
  ok(!conferirPagamentoDoLink(pede({ titular: 'X' }), fichaVista, [], D).ok, 'nome de quem pagou inválido');

  /* a ficha à vista passa para o carnê até 03/01 */
  ok(conferirEntradaNoCarne(D).ok && conferirEntradaNoCarne(ULTIMO_DIA).ok, 'até 03/01: entra no carnê');
  const fechou = conferirEntradaNoCarne(DEPOIS);
  ok(!fechou.ok && /fechou em 3 de janeiro/.test(fechou.erro), `depois de 03/01: o carnê fechou. ${JSON.stringify(fechou)}`);
  ok(MARCA_DO_CARNE === 1, 'a marca do carnê cabe no fc27_plano_escolher (1 a 3)');

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
  const msg = (f, pags, agora) => mensagemDeCobranca({ ficha: f, conta: sit(f, pags, agora).conta, pagamentos: sit(f, pags, agora).pagamentos, link: linkPessoal(f.token), agora: em(agora) });
  const pag = (valor, extra = {}) => ({ id: `p${valor}`, criado_em: '2026-10-05T15:00:00Z', pago_em: '2026-10-05', ficha_id: 'f1', campista: 'x', referente: 'parcela', forma: 'pix_direto', valor, quem_pagou: null, codigo: 'FC27A5SRDB4R', conferido: false, origem: 'site', stone_pedido: null, observacao: null, registrado_por: null, comprovantes: 0, ...extra });

  const HOJE = '2026-11-18T10:00:00-03:00';
  let t = msg(base, [pag(50)], HOJE);
  ok(/Oi, Renata!/.test(t) && /R\$\s50,00/.test(t) && /comprovante/.test(t) && t.includes(linkPessoal(base.token)) && /de Lucas/.test(t), `avisou sem comprovante: pede o comprovante. ${t}`);
  t = msg(base, [], HOJE);
  ok(/O carnê de Lucas é de R\$\s627,30/.test(t) && /quanto quiser, quantas vezes quiser, até 03\/01/.test(t) && /sinal/.test(t) && !/parcela/.test(t), `carnê sem sinal: o total, o prazo e o sinal. ${t}`);
  t = msg(base, [pag(50, { comprovantes: 1 })], HOJE);
  ok(/Faltam R\$\s577,30 do carnê de Lucas, até 03\/01/.test(t) && /quanto quiser/.test(t) && !/parcela/.test(t), `carnê pagando: quanto falta (sem o avisado) e até quando. ${t}`);
  const comPlano = { ...base, parcelas: 3, plano_em: '2026-10-19T15:00:00Z' };
  t = msg(comPlano, [], '2026-11-12T10:00:00-03:00');
  ok(!/venceu|parcela/.test(t) && /até 03\/01/.test(t), `plano de antes de 18/11: nada vence em 10/11 e a mensagem não fala de parcela. ${t}`);
  t = msg(base, [pag(300, { comprovantes: 1, conferido: true })], '2027-01-05T10:00:00-03:00');
  ok(/O prazo do carnê de Lucas era 03\/01, e ainda faltam R\$\s327,30/.test(t) && /Se já pagou/.test(t), `carnê vencido: ${t}`);
  const vista = { ...adulto, pagamento: 'cartao', valor: 697 };
  t = msg(vista, [], HOJE);
  ok(/Oi, Pedro!/.test(t) && /A sua inscrição \(R\$\s697,00\) ainda está em aberto/.test(t) && /pagar em partes no carnê, até 03\/01/.test(t), `à vista em aberto, falando com o próprio: ${t}`);
  t = msg(vista, [], '2027-01-05T10:00:00-03:00');
  ok(/ainda está em aberto/.test(t) && !/carnê/.test(t), `à vista depois de 03/01: o carnê fechou, a mensagem não oferece. ${t}`);
  {
    /* 29/10/2026: "ou no cartão" só com link do cartão para a ficha e nada pago */
    const LINK = ['1º lote', 'Lote atual'].map(lote => ({ lote, ref: 'inscricao', valor: 697, parcelas: 1, url: 'https://payment-link-v3.stone.com.br/pl_TESTE' }));
    const quando = '2026-11-18T10:00:00-03:00';
    const cobra = (f, pags, links) => { const x = sit(f, pags, quando); return mensagemDeCobranca({ ficha: f, conta: x.conta, pagamentos: x.pagamentos, link: linkPessoal(f.token), links, agora: em(quando) }); };
    const so = { ...vista, irmao: null };
    const com = cobra(so, [], LINK), sem = cobra(so, [], []);
    ok(/paga no Pix ou no cartão e manda/.test(com), `com link: oferece o cartão. ${com}`);
    ok(/paga no Pix e manda/.test(sem) && !/cartão/.test(sem), `sem link: não promete cartão. ${sem}`);
    ok(!/cartão/.test(cobra({ ...so, irmao: 'Beatriz Lima' }, [], LINK)), 'irmão sem link de irmãos: não promete cartão');
    ok(!/cartão/.test(cobra(so, [pag(100, { conferido: true, referente: 'inscricao' })], LINK)), 'já pagou parte: não promete cartão');
  }
  t = msg(vista, [pag(697, { conferido: true, referente: 'inscricao' })], HOJE);
  ok(/quitada/.test(t), `quitada: ${t}`);
  for (const f of [base, comPlano, vista, adulto]) {
    for (const pags of [[], [pag(50)], [pag(50, { comprovantes: 1 })], [pag(50, { conferido: true })]]) {
      for (const quando of ['2026-11-12T10:00:00-03:00', '2027-01-05T10:00:00-03:00']) {
        const x = msg(f, pags, quando);
        ok(!/[—–]/.test(x), `travessão na mensagem: ${x}`);
        ok(x.includes(linkPessoal(f.token)), 'toda mensagem leva o link');
        ok(!/parcela/i.test(x), `o carnê não tem parcela fixa: ${x}`);
      }
    }
  }

  /* a ficha em maiúscula: a mensagem não grita */
  const gritando = { ...base, campista: 'LUCAS ANDRADE', responsavel_nome: 'RENATA LIMA' };
  t = msg(gritando, [], HOJE);
  ok(/^Oi, Renata!/.test(t) && /carnê de Lucas\b/.test(t), `nome em maiúscula vira nome: ${t}`);
  t = msg({ ...base, campista: 'joão-pedro souza', responsavel_nome: "maria d'ávila" }, [], HOJE);
  ok(/^Oi, Maria!/.test(t) && /carnê de João-Pedro\b/.test(t), `minúscula e hífen: ${t}`);
  t = msg({ ...base, responsavel_nome: 'McKenzie Souza' }, [], HOJE);
  ok(/^Oi, McKenzie!/.test(t), `misturado fica como está: ${t}`);

  /* o painel: carnê vencido (passou de 03/01) passa na frente; antes disso, ninguém atrasa */
  const F = [
    { ...base, id: 'a', campista: 'A', parcelas: 3, plano_em: '2026-10-19T15:00:00Z' },
    { ...base, id: 'b', campista: 'B', pagamento: 'pix', parcelas: null },
  ];
  const Pg = [{ ...pag(50), id: 'x', ficha_id: 'b' }];
  const ordem = ordenarSituacoes(F.map(f => situacaoDe(f, Pg, em('2027-01-05T10:00:00-03:00'))));
  ok(ordem[0].ficha.id === 'a' && ordem[0].atrasado && !ordem[1].atrasado, `atrasado primeiro: ${ordem.map(x => x.ficha.id + (x.atrasado ? '!' : ''))}`);
  ok(F.every(f => !situacaoDe(f, Pg, em('2026-11-12T10:00:00-03:00')).atrasado), 'em 12/11 ninguém está atrasado (o plano antigo não cria vencimento)');
  ok(!situacaoDe({ ...F[0], cancelada_em: '2026-11-01T00:00:00Z' }, [], em('2027-01-05T10:00:00-03:00')).atrasado, 'desistência não fica atrasada');

  /* o último pagamento: o que mostra quem parou de pagar */
  const U = [{ ...pag(50), id: 'u1', ficha_id: 'u', pago_em: '2026-11-02' }, { ...pag(80), id: 'u2', ficha_id: 'u', pago_em: '2026-11-15' }, { ...pag(10), id: 'u3', ficha_id: 'u', pago_em: '2026-10-30' }];
  ok(ultimoPagamentoDe(situacaoDe({ ...base, id: 'u' }, U, D)) === '2026-11-15' && ultimoPagamentoDe({ pagamentos: [] }) === null, 'o último pagamento é o mais recente');
}

if (mal) { console.error(`\n${mal} problema(s) no carnê, no link ou na cobrança.`); process.exit(1); }
console.log('ok  followcamp-carne: carnê livre até 03/01, centavos, o que o link aceita, comprovante pelos bytes, cobrança com o link');
