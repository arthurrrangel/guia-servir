/* =============================================================================
   FOLLOW CAMP 2027: A FICHA DE INSCRIÇÃO — 02/10/2026

   Pedido do Arthur: "Faça o formulário no site". A ficha mora em
   /followcamp/inscricao, e este arquivo é lido pela TELA e pela ROTA
   (app/api/followcamp/ficha): as mesmas regras nas duas pontas. A tela confere
   para responder na hora; a rota confere de novo porque não confia em
   navegador.

   PARA ONDE VAI: uma planilha do Google, pelo mesmo caminho da Pequena Guia
   (Apps Script publicado como app da web, URL em PLANILHA_FOLLOWCAMP_URL na
   Vercel). A regra do site desde o primeiro dia continua: nenhum dado de
   visitante entra no banco que serve a escala de todo mundo. Sem a planilha
   ligada, a tela manda a ficha inteira para o WhatsApp da organização e diz
   isso; nada some em silêncio.

   O QUE A FICHA PEDE, e por quê (só o necessário):
     · nome, nascimento e sexo: de 13 a 24 anos NO DIA DO CAMP (05/02/2027), e
       os dormitórios são divididos por gênero;
     · tamanho da camisa: a camisa oficial está inclusa;
     · alergia ou restrição alimentar: a página promete "um campo próprio";
     · saúde e remédio: a equipe cuida de quem está lá;
     · menor de 18 no dia do Camp: o responsável, que aceita o termo aqui
       mesmo (a página diz que o termo está na ficha); 18 ou mais: um contato
       de emergência e a declaração do próprio campista;
     · irmão: o desconto de 10%;
     · como vai pagar e o uso de imagem (sim ou não, de verdade opcional).
   ============================================================================= */
import {
  FC27, limpaNome, nomeInvalido, cpfValido, celularDe, soDigitos, precoDe, emReais, ROTULO, type Celular,
} from './followcamp';

/** A idade conta no primeiro dia do retiro. */
export const DIA_DO_CAMP = { dia: 5, mes: 2, ano: 2027 } as const;
export const IDADE_MIN = 13;
export const IDADE_MAX = 24;
export const TEXTO_MAX = 300;

export const SEXOS = [
  { id: 'feminino', rot: 'Feminino' },
  { id: 'masculino', rot: 'Masculino' },
] as const;
export type Sexo = typeof SEXOS[number]['id'];

export const CAMISAS = ['PP', 'P', 'M', 'G', 'GG', 'XG'] as const;
export type Camisa = typeof CAMISAS[number];

export const PARENTESCOS = ['Mãe', 'Pai', 'Avó ou avô', 'Tia ou tio', 'Outro responsável legal'] as const;
export type Parentesco = typeof PARENTESCOS[number];

export const PAGAMENTOS = [
  { id: 'pix', rot: 'Pix' },
  { id: 'cartao', rot: 'Cartão de crédito' },
  { id: 'dinheiro', rot: 'Dinheiro' },
  { id: 'carne', rot: 'Carnê Follow' },
] as const;
export type Pagamento = typeof PAGAMENTOS[number]['id'];
const rotuloPagamento = (p: Pagamento) => PAGAMENTOS.find(x => x.id === p)?.rot ?? p;

/** Muda quando o texto do termo mudar: a planilha guarda qual versão foi aceita. */
export const VERSAO_TERMO = 'v1 · 02/10/2026';

/* ----------------------------------------------------------------- datas --- */
export type Data = { dia: number; mes: number; ano: number };
const dois = (n: number) => String(n).padStart(2, '0');

/** "14/03/2009" → data real, ou null (31/02 não passa). */
export function lerData(s: string): Data | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((s || '').trim());
  if (!m) return null;
  const dia = Number(m[1]), mes = Number(m[2]), ano = Number(m[3]);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return { dia, mes, ano };
}

/** Anos completos em `ref` (o aniversário no próprio dia já conta). */
export function idadeEm(n: Data, ref: Data = DIA_DO_CAMP): number {
  let i = ref.ano - n.ano;
  if (ref.mes < n.mes || (ref.mes === n.mes && ref.dia < n.dia)) i--;
  return i;
}

export const formataData = (d: Data) => `${dois(d.dia)}/${dois(d.mes)}/${d.ano}`;

/** Digitando: só números, as barras entram sozinhas. */
export function mascaraData(bruto: string): string {
  const x = soDigitos(bruto).slice(0, 8);
  if (x.length <= 2) return x;
  if (x.length <= 4) return `${x.slice(0, 2)}/${x.slice(2)}`;
  return `${x.slice(0, 2)}/${x.slice(2, 4)}/${x.slice(4)}`;
}

export function mascaraCpf(bruto: string): string {
  const x = soDigitos(bruto).slice(0, 11);
  return x.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
}

export function mascaraCelular(bruto: string): string {
  let x = soDigitos(bruto);
  /* +55 colado do contato do celular: tira o país antes de cortar em 11 */
  if (x.length >= 12 && x.startsWith('55')) x = x.slice(2);
  x = x.slice(0, 11);
  if (x.length <= 2) return x;
  if (x.length <= 7) return `(${x.slice(0, 2)}) ${x.slice(2)}`;
  return `(${x.slice(0, 2)}) ${x.slice(2, 7)}-${x.slice(7)}`;
}

export const formataCelular = (c: Celular) => `(${c.area_code}) ${c.number.slice(0, 5)}-${c.number.slice(5)}`;
export const formataCpf = (cpf: string) => mascaraCpf(cpf);
export const primeiroNome = (nome: string) => limpaNome(nome).split(' ')[0] || '';

/** Texto livre: sem caractere de controle, espaços normais, no máximo 300. */
export function limpaTexto(s: unknown): string {
  return String(s ?? '').normalize('NFC').replace(/[\u0000-\u0008\u000B-\u001F\u007F​-‍⁠﻿]/g, '')
    .replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

/* --------------------------------------------------------------- a ficha --- */
export type Ficha = {
  campista: string;
  nascimento: Data;
  idade: number;
  sexo: Sexo;
  camisa: Camisa;
  whatsCampista: Celular | null;
  alergias: string;
  saude: string;
  menor: boolean;
  responsavel: { nome: string; cpf: string; whats: Celular; parentesco: Parentesco } | null;
  emergencia: { nome: string; whats: Celular } | null;
  irmao: string;
  pagamento: Pagamento;
  imagem: boolean;
};

export type Conferida = { ok: true; ficha: Ficha } | { ok: false; erro: string; campo: string };

const mesmoNome = (a: string, b: string) => limpaNome(a).toLocaleLowerCase('pt-BR') === limpaNome(b).toLocaleLowerCase('pt-BR');
const mesmoNumero = (a: Celular | null, b: Celular | null) => !!a && !!b && a.area_code === b.area_code && a.number === b.number;

/** Os campos na ordem da tela: o primeiro erro é o do campo mais acima. */
export function conferirFicha(corpo: unknown): Conferida {
  const c = (corpo && typeof corpo === 'object' ? corpo : {}) as Record<string, unknown>;
  const txt = (k: string) => (typeof c[k] === 'string' ? (c[k] as string) : '');
  const mal = (erro: string, campo: string): Conferida => ({ ok: false, erro, campo });

  if (txt('site').trim()) return mal('Ficha não aceita.', 'site'); /* a isca: humano não vê, robô preenche */

  const campista = limpaNome(txt('campista'));
  const nm = nomeInvalido(campista, 'do campista');
  if (nm) return mal(nm, 'fc-campista');

  const nascimento = lerData(txt('nascimento'));
  if (!nascimento || nascimento.ano < 1990 || nascimento.ano > 2020) {
    return mal('Escreva a data de nascimento como dia, mês e ano, por exemplo 14/03/2009.', 'fc-nasc');
  }
  const idade = idadeEm(nascimento);
  if (idade < IDADE_MIN || idade > IDADE_MAX) {
    return mal(`O Follow Camp é para quem tem de ${IDADE_MIN} a ${IDADE_MAX} anos no dia do retiro (05/02/2027).`, 'fc-nasc');
  }
  const menor = idade < 18;

  const sexo = txt('sexo') as Sexo;
  if (!SEXOS.some(x => x.id === sexo)) return mal('Escolha o sexo do campista: os dormitórios são divididos por gênero.', 'fc-sexo');

  const camisa = txt('camisa') as Camisa;
  if (!CAMISAS.includes(camisa)) return mal('Escolha o tamanho da camisa.', 'fc-camisa');

  let whatsCampista: Celular | null = null;
  if (soDigitos(txt('whatsCampista'))) {
    whatsCampista = celularDe(txt('whatsCampista'));
    if (!whatsCampista) return mal('Confira o WhatsApp do campista, com DDD.', 'fc-whats');
  } else if (!menor) {
    return mal('Escreva o WhatsApp do campista, com DDD.', 'fc-whats');
  }

  const alergias = limpaTexto(c.alergias);
  if (alergias.length > TEXTO_MAX) return mal(`Resuma a alergia ou restrição em até ${TEXTO_MAX} caracteres.`, 'fc-alergias');
  const saude = limpaTexto(c.saude);
  if (saude.length > TEXTO_MAX) return mal(`Resuma a saúde e os remédios em até ${TEXTO_MAX} caracteres.`, 'fc-saude');

  let responsavel: Ficha['responsavel'] = null;
  let emergencia: Ficha['emergencia'] = null;
  if (menor) {
    const nome = limpaNome(txt('respNome'));
    const mr = nomeInvalido(nome, 'do responsável');
    if (mr) return mal(mr, 'fc-resp-nome');
    if (mesmoNome(nome, campista)) return mal('O responsável é outra pessoa: escreva o nome dele.', 'fc-resp-nome');
    const cpf = soDigitos(txt('respCpf'));
    if (!cpfValido(cpf)) return mal('Confira o CPF do responsável.', 'fc-resp-cpf');
    const whats = celularDe(txt('respWhats'));
    if (!whats) return mal('Confira o WhatsApp do responsável, com DDD.', 'fc-resp-whats');
    const parentesco = txt('respParentesco') as Parentesco;
    if (!PARENTESCOS.includes(parentesco)) return mal('Escolha o parentesco do responsável.', 'fc-resp-par');
    responsavel = { nome, cpf, whats, parentesco };
  } else {
    const nome = limpaNome(txt('emergNome'));
    const me = nomeInvalido(nome, 'do contato de emergência');
    if (me) return mal(me, 'fc-emerg-nome');
    if (mesmoNome(nome, campista)) return mal('O contato de emergência é outra pessoa: escreva o nome dela.', 'fc-emerg-nome');
    const whats = celularDe(txt('emergWhats'));
    if (!whats) return mal('Confira o WhatsApp do contato de emergência, com DDD.', 'fc-emerg-whats');
    if (mesmoNumero(whats, whatsCampista)) return mal('O contato de emergência precisa de outro número, não o do campista.', 'fc-emerg-whats');
    emergencia = { nome, whats };
  }

  let irmao = '';
  if (txt('temIrmao') === 'sim') {
    irmao = limpaNome(txt('irmao'));
    const mi = nomeInvalido(irmao, 'do irmão');
    if (mi) return mal(mi, 'fc-irmao');
    if (mesmoNome(irmao, campista)) return mal('O irmão é outra pessoa: escreva o nome dele.', 'fc-irmao');
  } else if (txt('temIrmao') !== 'nao') {
    return mal('Responda se tem irmão se inscrevendo.', 'fc-tem-irmao');
  }

  const pagamento = txt('pagamento') as Pagamento;
  if (!PAGAMENTOS.some(x => x.id === pagamento)) return mal('Escolha como vai pagar.', 'fc-pag');

  const img = txt('imagem');
  if (img !== 'sim' && img !== 'nao') return mal('Responda sobre o uso de imagem.', 'fc-imagem');

  if (c.termo !== true) {
    return mal(menor ? 'O responsável precisa aceitar o termo de autorização.' : 'Marque a declaração para enviar.', 'fc-termo');
  }
  if (c.lgpd !== true) return mal('Marque o consentimento sobre os dados para enviar.', 'fc-lgpd');

  return {
    ok: true,
    ficha: {
      campista, nascimento, idade, sexo, camisa, whatsCampista, alergias, saude,
      menor, responsavel, emergencia, irmao, pagamento, imagem: img === 'sim',
    },
  };
}

/* ----------------------------------------------------------- os textos --- */

/** O termo, com os nomes. É ESTE texto que vai para a planilha como aceito. */
export function termoDe(f: Pick<Ficha, 'campista' | 'menor' | 'responsavel' | 'emergencia'>): string {
  const quem = primeiroNome(f.campista) || 'o campista';
  if (f.menor) {
    const r = f.responsavel;
    /* na tela o termo aparece enquanto se digita: sem CPF ainda, sem "CPF ," */
    const doc = r && soDigitos(r.cpf) ? `, CPF ${formataCpf(r.cpf)}` : '';
    const eu = r ? `Eu, ${r.nome}${doc}, responsável legal por ${f.campista},` : `Eu, responsável legal por ${f.campista},`;
    return `${eu} autorizo ${quem} a participar do ${FC27.nome}, retiro de jovens da GUIA Church, de 05 a 10 de fevereiro de 2027, no Espaço Bethel, em Barra de Guaratiba (RJ). Em caso de emergência, autorizo a equipe do Follow a buscar atendimento médico e me avisar na hora. Declaro que as informações de saúde desta ficha são verdadeiras e que o transporte até o local é por conta da família.`;
  }
  const contato = f.emergencia ? f.emergencia.nome : 'meu contato de emergência';
  return `Eu, ${f.campista}, declaro que as informações de saúde desta ficha são verdadeiras e, em caso de emergência, autorizo a equipe do Follow a buscar atendimento médico e avisar ${contato}. Sei que o transporte até o Espaço Bethel é por minha conta.`;
}

export function textoImagem(f: Pick<Ficha, 'campista' | 'menor'>): string {
  return f.menor
    ? `Fotos e vídeos do retiro em que ${primeiroNome(f.campista) || 'o campista'} apareça, nas redes e materiais da GUIA Church.`
    : 'Fotos e vídeos do retiro em que você apareça, nas redes e materiais da GUIA Church.';
}

export const TEXTO_LGPD = 'Concordo que a GUIA Church use os dados desta ficha, inclusive os de saúde, só para organizar o Follow Camp 2027 e cuidar do campista.';

export const O_QUE_LEVAR = 'Bíblia, caderno, roupas confortáveis pra atividades, agasalho, itens de higiene e roupa de cama e banho.';

/** O valor do dia, ou null quando o lote fechou e o próximo ainda não tem valor. */
export function valorDaFicha(f: Pick<Ficha, 'irmao'>, agora = new Date()): number | null {
  const p = precoDe(f.irmao ? 'irmaos' : 'inscricao', agora);
  return p.ok ? p.valor : null;
}

/** O WhatsApp que recebe a confirmação: o do responsável, ou o do campista. */
export const whatsDaConfirmacao = (f: Pick<Ficha, 'responsavel' | 'whatsCampista'>) => f.responsavel?.whats ?? f.whatsCampista;

/* ----------------------------------------------------------- a planilha --- */
export const CABECALHO = [
  'Recebido em', 'Campista', 'Nascimento', 'Idade no Camp', 'Sexo', 'Camisa', 'WhatsApp do campista',
  'Alergia ou restrição alimentar', 'Saúde ou remédio', 'Responsável', 'CPF do responsável',
  'WhatsApp do responsável', 'Parentesco', 'Contato de emergência', 'WhatsApp de emergência',
  'Irmão inscrito', 'Valor', 'Pagamento', 'Uso de imagem', 'Termo aceito', 'Versão do termo', 'Origem',
] as const;

/** Célula que começa com = + - @ vira FÓRMULA no Google Planilhas: um
 *  "=IMPORTXML(...)" digitado na alergia rodaria na planilha da igreja. O
 *  apóstrofo na frente guarda como texto e não aparece na célula. */
export function semFormula(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

/** Uma linha na ordem do CABECALHO, sem a primeira coluna (quem põe a data é o
 *  Apps Script, no relógio do Google). */
export function linhaDaFicha(f: Ficha, agora = new Date()): (string | number)[] {
  const valor = valorDaFicha(f, agora);
  const t = (s: string) => semFormula(s);
  return [
    t(f.campista),
    `'${formataData(f.nascimento)}`, /* texto: planilha em inglês leria 05/02 como 2 de maio */
    f.idade,
    f.sexo === 'feminino' ? 'Feminino' : 'Masculino',
    f.camisa,
    f.whatsCampista ? formataCelular(f.whatsCampista) : '',
    t(f.alergias),
    t(f.saude),
    f.responsavel ? t(f.responsavel.nome) : '',
    f.responsavel ? formataCpf(f.responsavel.cpf) : '',
    f.responsavel ? formataCelular(f.responsavel.whats) : '',
    f.responsavel ? f.responsavel.parentesco : '',
    f.emergencia ? t(f.emergencia.nome) : '',
    f.emergencia ? formataCelular(f.emergencia.whats) : '',
    t(f.irmao),
    valor ?? 'a confirmar',
    rotuloPagamento(f.pagamento),
    f.imagem ? 'Sim' : 'Não',
    t(termoDe(f)),
    VERSAO_TERMO,
    'site',
  ];
}

/* ------------------------------------------------------------ WhatsApp --- */

/** A ficha inteira, para quando a planilha não gravou: a pessoa manda. */
export function mensagemDaFicha(f: Ficha, agora = new Date()): string {
  const valor = valorDaFicha(f, agora);
  const linhas = [
    `Ficha de inscrição · ${FC27.nome}`,
    `Campista: ${f.campista}`,
    `Nascimento: ${formataData(f.nascimento)} (${f.idade} anos no Camp)`,
    `Sexo: ${f.sexo === 'feminino' ? 'Feminino' : 'Masculino'} · Camisa: ${f.camisa}`,
  ];
  if (f.whatsCampista) linhas.push(`WhatsApp do campista: ${formataCelular(f.whatsCampista)}`);
  linhas.push(`Alergia ou restrição: ${f.alergias || 'nenhuma'}`);
  linhas.push(`Saúde ou remédio: ${f.saude || 'nada a informar'}`);
  if (f.responsavel) {
    linhas.push(`Responsável: ${f.responsavel.nome} (${f.responsavel.parentesco}) · CPF ${formataCpf(f.responsavel.cpf)} · ${formataCelular(f.responsavel.whats)}`);
    linhas.push('Termo de autorização: aceito pelo responsável na ficha do site');
  }
  if (f.emergencia) {
    linhas.push(`Contato de emergência: ${f.emergencia.nome} · ${formataCelular(f.emergencia.whats)}`);
    linhas.push('Declaração: aceita pelo campista na ficha do site');
  }
  if (f.irmao) linhas.push(`Irmão inscrito: ${f.irmao}`);
  linhas.push(`${ROTULO[f.irmao ? 'irmaos' : 'inscricao']}: ${valor !== null ? emReais(valor) : 'valor a confirmar'} · Pagamento: ${rotuloPagamento(f.pagamento)}`);
  linhas.push(`Uso de imagem: ${f.imagem ? 'autorizado' : 'não autorizado'}`);
  return linhas.join('\n');
}

/** O aviso curto, para quando a ficha já está na planilha. */
export function mensagemDeAviso(f: Pick<Ficha, 'campista' | 'pagamento'>): string {
  return `Oi! Enviei pelo site a ficha do ${FC27.nome} de ${f.campista}. Fico aguardando a confirmação da vaga e as informações do pagamento (${rotuloPagamento(f.pagamento)}).`;
}
