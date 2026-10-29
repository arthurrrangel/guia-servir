/* =============================================================================
   PLANILHA .XLSX SEM DEPENDÊNCIA · 29/10/2026

   O Arthur, sobre o "Exportar pagamentos": "melhore a planilha, deixe mais
   profissional, colorida e organizada". CSV não tem cor, largura de coluna,
   formato de moeda nem abas. Este arquivo escreve um .xlsx de verdade (Office
   Open XML: um zip com XML dentro), só com o que o painel usa: abas, larguras,
   cabeçalho fixo, filtro, células mescladas, cores, bordas, moeda, data,
   rodapé de impressão e fórmulas de total com o valor já calculado (quem abre
   sem recalcular vê o número certo).

   POR QUE SEM BIBLIOTECA. A que escreve estilo (exceljs) pesa perto de 1 MB e
   arrasta pacotes de Node para o navegador; a mais comum (SheetJS) só escreve
   estilo na versão paga. Isto aqui roda igual no navegador e no teste (Node).

   O zip vai "stored" (sem compressão): Excel, Numbers, LibreOffice e Google
   Planilhas abrem, e a planilha do painel tem poucas dezenas de KB.

   Data no Excel é número de dias desde 30/12/1899, sem fuso: quem chama passa
   a hora de Brasília já resolvida (`serialDe`).
   ============================================================================= */

export type Estilo = {
  negrito?: boolean;
  italico?: boolean;
  tamanho?: number;
  /** 'RRGGBB' */
  cor?: string;
  /** 'RRGGBB': o fundo da célula */
  fundo?: string;
  /** fio de 1px embaixo / em cima ('RRGGBB'); `grossa` engrossa o de cima (total) */
  bordaBaixo?: string;
  bordaCima?: string;
  bordaCimaGrossa?: boolean;
  alinhar?: 'esquerda' | 'centro' | 'direita';
  vertical?: 'topo' | 'centro' | 'baixo';
  quebrar?: boolean;
  recuo?: number;
  /** código de formato do Excel, por exemplo `"R$ "#,##0.00` ou `dd/mm/yyyy` */
  formato?: string;
};

export type Valor = string | number | boolean | null | undefined;
/** Uma célula: o valor puro, ou o valor com estilo e, se for o caso, uma
 *  fórmula. Na fórmula, `v` é o resultado já calculado. */
export type Celula = Valor | { v?: Valor; f?: string; e?: Estilo };

export type Aba = {
  nome: string;
  /** largura de cada coluna, em caracteres */
  larguras: number[];
  linhas: Celula[][];
  /** altura da linha (índice a partir de 0), em pontos */
  alturas?: Record<number, number>;
  /** 'A1:F1' */
  mesclas?: string[];
  congelar?: { linhas?: number; colunas?: number };
  /** 'A4:J20': o filtro do cabeçalho */
  filtro?: string;
  /** linhas que repetem no topo de cada página impressa, 1-based: [4, 4] */
  repetirNaImpressao?: [number, number];
  corDaAba?: string;
  semGrade?: boolean;
  paisagem?: boolean;
  rodape?: string;
};

/* -------------------------------------------------------------- endereços --- */
export function letraDaColuna(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
export const ref = (coluna: number, linha: number) => `${letraDaColuna(coluna)}${linha + 1}`;

/** O número do Excel para uma data e hora de parede (sem fuso). */
export function serialDe(ano: number, mes: number, dia: number, hora = 0, minuto = 0): number {
  return (Date.UTC(ano, mes - 1, dia, hora, minuto) - Date.UTC(1899, 11, 30)) / 86_400_000;
}

/* ------------------------------------------------------------------- XML --- */
const PROIBIDO_NO_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
export function xmlTexto(s: string): string {
  return s.replace(PROIBIDO_NO_XML, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
const NOME_DE_ABA_PROIBIDO = /[:\\/?*[\]]/g;
export function nomeDeAba(s: string): string {
  const n = s.replace(NOME_DE_ABA_PROIBIDO, ' ').replace(/^'+|'+$/g, '').trim().slice(0, 31);
  return n || 'Planilha';
}
const cor = (c: string) => `FF${c.replace('#', '').toUpperCase()}`;

/* ---------------------------------------------------------------- estilos --- */
const FONTE = 'Arial';
const TINTA = '252525';

class Estilos {
  fontes: string[] = [`<font><sz val="10"/><color rgb="${cor(TINTA)}"/><name val="${FONTE}"/><family val="2"/></font>`];
  fundos: string[] = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  bordas: string[] = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
  formatos: string[] = [];
  xfs: string[] = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  private chaves = new Map<string, number>([['{}', 0]]);

  private indice(lista: string[], xml: string): number {
    const i = lista.indexOf(xml);
    if (i >= 0) return i;
    lista.push(xml);
    return lista.length - 1;
  }

  id(e: Estilo | undefined): number {
    if (!e) return 0;
    const chave = JSON.stringify(e, Object.keys(e).sort());
    const ja = this.chaves.get(chave);
    if (ja != null) return ja;

    const fonte = this.indice(this.fontes,
      `<font>${e.negrito ? '<b/>' : ''}${e.italico ? '<i/>' : ''}<sz val="${e.tamanho ?? 10}"/><color rgb="${cor(e.cor ?? TINTA)}"/><name val="${FONTE}"/><family val="2"/></font>`);
    const fundo = e.fundo
      ? this.indice(this.fundos, `<fill><patternFill patternType="solid"><fgColor rgb="${cor(e.fundo)}"/><bgColor indexed="64"/></patternFill></fill>`)
      : 0;
    const lado = (nome: string, c?: string, grossa?: boolean) =>
      c ? `<${nome} style="${grossa ? 'medium' : 'thin'}"><color rgb="${cor(c)}"/></${nome}>` : `<${nome}/>`;
    const borda = e.bordaBaixo || e.bordaCima
      ? this.indice(this.bordas, `<border><left/><right/>${lado('top', e.bordaCima, e.bordaCimaGrossa)}${lado('bottom', e.bordaBaixo)}<diagonal/></border>`)
      : 0;
    let formato = 0;
    if (e.formato) {
      const i = this.formatos.indexOf(e.formato);
      formato = 164 + (i >= 0 ? i : this.formatos.push(e.formato) - 1);
    }
    const h = { esquerda: 'left', centro: 'center', direita: 'right' } as const;
    const v = { topo: 'top', centro: 'center', baixo: 'bottom' } as const;
    /* recuo só vale com o texto encostado num lado: o Excel não recua o centralizado */
    const recuo = e.recuo && e.alinhar !== 'centro' ? ` indent="${e.recuo}"` : '';
    const alinhamento = `<alignment${e.alinhar ? ` horizontal="${h[e.alinhar]}"` : ''} vertical="${v[e.vertical ?? 'centro']}"${e.quebrar ? ' wrapText="1"' : ''}${recuo}/>`;
    this.xfs.push(`<xf numFmtId="${formato}" fontId="${fonte}" fillId="${fundo}" borderId="${borda}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${alinhamento}</xf>`);
    const id = this.xfs.length - 1;
    this.chaves.set(chave, id);
    return id;
  }

  xml(): string {
    const fmts = this.formatos.length
      ? `<numFmts count="${this.formatos.length}">${this.formatos.map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${xmlTexto(f)}"/>`).join('')}</numFmts>`
      : '';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + fmts
      + `<fonts count="${this.fontes.length}">${this.fontes.join('')}</fonts>`
      + `<fills count="${this.fundos.length}">${this.fundos.join('')}</fills>`
      + `<borders count="${this.bordas.length}">${this.bordas.join('')}</borders>`
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + `<cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs>`
      + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
      + '</styleSheet>';
  }
}

/* -------------------------------------------------------------- as abas --- */
class Textos {
  lista: string[] = [];
  private mapa = new Map<string, number>();
  id(s: string): number {
    const ja = this.mapa.get(s);
    if (ja != null) return ja;
    this.lista.push(s);
    this.mapa.set(s, this.lista.length - 1);
    return this.lista.length - 1;
  }
  xml(usos: number): string {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${usos}" uniqueCount="${this.lista.length}">`
      + this.lista.map(s => `<si><t xml:space="preserve">${xmlTexto(s)}</t></si>`).join('')
      + '</sst>';
  }
}

function celulaXml(c: Celula, endereco: string, estilos: Estilos, textos: Textos, contar: () => void): string {
  const obj = c !== null && typeof c === 'object' ? c : { v: c as Valor };
  const s = estilos.id(obj.e);
  const atr = `r="${endereco}"${s ? ` s="${s}"` : ''}`;
  const v = obj.v;
  if (obj.f) {
    const f = `<f>${xmlTexto(obj.f.replace(/^=/, ''))}</f>`;
    if (typeof v === 'number' && Number.isFinite(v)) return `<c ${atr}>${f}<v>${v}</v></c>`;
    if (typeof v === 'string') return `<c ${atr} t="str">${f}<v>${xmlTexto(v)}</v></c>`;
    return `<c ${atr}>${f}</c>`;
  }
  if (typeof v === 'number') return Number.isFinite(v) ? `<c ${atr}><v>${v}</v></c>` : `<c ${atr}/>`;
  if (typeof v === 'boolean') return `<c ${atr} t="b"><v>${v ? 1 : 0}</v></c>`;
  if (typeof v === 'string' && v !== '') { contar(); return `<c ${atr} t="s"><v>${textos.id(v)}</v></c>`; }
  return s ? `<c ${atr}/>` : '';
}

function abaXml(a: Aba, indice: number, estilos: Estilos, textos: Textos, contar: () => void): string {
  const colunas = Math.max(a.larguras.length, ...a.linhas.map(l => l.length), 1);
  const ultima = ref(colunas - 1, Math.max(a.linhas.length - 1, 0));
  const congela = a.congelar && ((a.congelar.linhas ?? 0) > 0 || (a.congelar.colunas ?? 0) > 0)
    ? (() => {
        const y = a.congelar!.linhas ?? 0, x = a.congelar!.colunas ?? 0;
        const painel = y && x ? 'bottomRight' : y ? 'bottomLeft' : 'topRight';
        const canto = ref(x, y);
        return `<pane${x ? ` xSplit="${x}"` : ''}${y ? ` ySplit="${y}"` : ''} topLeftCell="${canto}" activePane="${painel}" state="frozen"/>`
          + `<selection pane="${painel}" activeCell="${canto}" sqref="${canto}"/>`;
      })()
    : '';
  const linhas = a.linhas.map((l, r) => {
    const alt = a.alturas?.[r];
    const cels = l.map((c, ci) => celulaXml(c, ref(ci, r), estilos, textos, contar)).join('');
    return `<row r="${r + 1}"${alt ? ` ht="${alt}" customHeight="1"` : ''}>${cels}</row>`;
  }).join('');
  const sheetPr = `<sheetPr>${a.corDaAba ? `<tabColor rgb="${cor(a.corDaAba)}"/>` : ''}<pageSetUpPr fitToPage="1"/></sheetPr>`;
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + sheetPr
    + `<dimension ref="A1:${ultima}"/>`
    + `<sheetViews><sheetView workbookViewId="0"${a.semGrade ? ' showGridLines="0"' : ''}${indice === 0 ? ' tabSelected="1"' : ''}>${congela}</sheetView></sheetViews>`
    + '<sheetFormatPr defaultRowHeight="15"/>'
    + (a.larguras.length ? `<cols>${a.larguras.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '')
    + `<sheetData>${linhas}</sheetData>`
    + (a.filtro ? `<autoFilter ref="${a.filtro}"/>` : '')
    + (a.mesclas?.length ? `<mergeCells count="${a.mesclas.length}">${a.mesclas.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '')
    + '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.6" header="0.3" footer="0.3"/>'
    + `<pageSetup paperSize="9" orientation="${a.paisagem ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/>`
    + (a.rodape ? `<headerFooter><oddFooter>${xmlTexto(`&L&8${a.rodape.replace(/&/g, '&&')}&R&8Página &P de &N`)}</oddFooter></headerFooter>` : '')
    + '</worksheet>';
}

/* ------------------------------------------------------------------- zip --- */
const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = TABELA_CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Zip sem compressão. `quando` vira a data dos arquivos dentro do zip. */
export function zipar(arquivos: { nome: string; dados: Uint8Array }[], quando = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const hora = (quando.getHours() << 11) | (quando.getMinutes() << 5) | Math.floor(quando.getSeconds() / 2);
  const dia = ((Math.max(quando.getFullYear(), 1980) - 1980) << 9) | ((quando.getMonth() + 1) << 5) | quando.getDate();
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let pos = 0;
  for (const a of arquivos) {
    const nome = enc.encode(a.nome);
    const crc = crc32(a.dados);
    const local = new Uint8Array(30 + nome.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0x0800, true); dv.setUint16(8, 0, true);
    dv.setUint16(10, hora, true); dv.setUint16(12, dia, true); dv.setUint32(14, crc, true);
    dv.setUint32(18, a.dados.length, true); dv.setUint32(22, a.dados.length, true);
    dv.setUint16(26, nome.length, true); dv.setUint16(28, 0, true);
    local.set(nome, 30);
    const cab = new Uint8Array(46 + nome.length);
    const dc = new DataView(cab.buffer);
    dc.setUint32(0, 0x02014b50, true); dc.setUint16(4, 20, true); dc.setUint16(6, 20, true); dc.setUint16(8, 0x0800, true);
    dc.setUint16(10, 0, true); dc.setUint16(12, hora, true); dc.setUint16(14, dia, true); dc.setUint32(16, crc, true);
    dc.setUint32(20, a.dados.length, true); dc.setUint32(24, a.dados.length, true); dc.setUint16(28, nome.length, true);
    dc.setUint32(42, pos, true);
    cab.set(nome, 46);
    partes.push(local, a.dados);
    central.push(cab);
    pos += local.length + a.dados.length;
  }
  const tamanhoCentral = central.reduce((s, c) => s + c.length, 0);
  const fim = new Uint8Array(22);
  const df = new DataView(fim.buffer);
  df.setUint32(0, 0x06054b50, true);
  df.setUint16(8, arquivos.length, true); df.setUint16(10, arquivos.length, true);
  df.setUint32(12, tamanhoCentral, true); df.setUint32(16, pos, true);
  const tudo = new Uint8Array(pos + tamanhoCentral + 22);
  let o = 0;
  for (const p of [...partes, ...central, fim]) { tudo.set(p, o); o += p.length; }
  return tudo;
}

/* ------------------------------------------------------------- a pasta --- */
export function planilha(abas: Aba[], meta: { titulo: string; autor?: string; quando?: Date }): Uint8Array {
  if (!abas.length) throw new Error('planilha sem aba');
  const estilos = new Estilos();
  const textos = new Textos();
  let usos = 0;
  const contar = () => { usos++; };
  const nomes: string[] = [];
  for (const a of abas) {
    let n = nomeDeAba(a.nome), k = 2;
    while (nomes.includes(n)) n = `${nomeDeAba(a.nome).slice(0, 28)} ${k++}`;
    nomes.push(n);
  }
  const folhas = abas.map((a, i) => abaXml(a, i, estilos, textos, contar));
  const aspas = (n: string) => `'${n.replace(/'/g, "''")}'`;
  const nomesDefinidos = abas.flatMap((a, i) => [
    ...(a.filtro ? [`<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${xmlTexto(`${aspas(nomes[i])}!${a.filtro.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2')}`)}</definedName>`] : []),
    ...(a.repetirNaImpressao ? [`<definedName name="_xlnm.Print_Titles" localSheetId="${i}">${xmlTexto(`${aspas(nomes[i])}!$${a.repetirNaImpressao[0]}:$${a.repetirNaImpressao[1]}`)}</definedName>`] : []),
  ]);
  const quando = meta.quando ?? new Date();
  const enc = new TextEncoder();
  const x = (s: string) => enc.encode(s);
  const cabecalho = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const arquivos = [
    { nome: '[Content_Types].xml', dados: x(cabecalho
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + folhas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
      + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
      + '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
      + '</Types>') },
    { nome: '_rels/.rels', dados: x(cabecalho
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
      + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>'
      + '</Relationships>') },
    { nome: 'docProps/core.xml', dados: x(cabecalho
      + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
      + `<dc:title>${xmlTexto(meta.titulo)}</dc:title><dc:creator>${xmlTexto(meta.autor ?? 'GUIA Servir')}</dc:creator>`
      + `<dcterms:created xsi:type="dcterms:W3CDTF">${quando.toISOString().replace(/\.\d{3}Z$/, 'Z')}</dcterms:created>`
      + '</cp:coreProperties>') },
    { nome: 'docProps/app.xml', dados: x(cabecalho
      + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">'
      + '<Application>GUIA Servir</Application></Properties>') },
    { nome: 'xl/workbook.xml', dados: x(cabecalho
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + '<bookViews><workbookView activeTab="0"/></bookViews>'
      + `<sheets>${nomes.map((n, i) => `<sheet name="${xmlTexto(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>`
      + (nomesDefinidos.length ? `<definedNames>${nomesDefinidos.join('')}</definedNames>` : '')
      + '<calcPr calcId="191029" fullCalcOnLoad="1"/>'
      + '</workbook>') },
    { nome: 'xl/_rels/workbook.xml.rels', dados: x(cabecalho
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + folhas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
      + `<Relationship Id="rId${folhas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
      + `<Relationship Id="rId${folhas.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>`
      + '</Relationships>') },
    ...folhas.map((f, i) => ({ nome: `xl/worksheets/sheet${i + 1}.xml`, dados: x(f) })),
    { nome: 'xl/styles.xml', dados: x(estilos.xml()) },
    { nome: 'xl/sharedStrings.xml', dados: x(textos.xml(usos)) },
  ];
  return zipar(arquivos, quando);
}

export const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
