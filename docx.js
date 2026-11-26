// Grava a tinta (tinta.js) como .docx de verdade, sem abrir o Word e sem bibliotecas: um
// parágrafo por linha braille, página nova a cada página braille, papel, margens, fonte e
// entrelinha fixos no próprio arquivo. Também lê de volta o .docx que gravou, para conferir
// que cada página e cada linha do arquivo batem com o braille.

import { ESTILO, temNaFonte } from "./tinta.js?edicao=7";

const TWIPS_POR_CM = 1440 / 2.54;
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function xml(texto) {
  return texto.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

// Parte a linha em runs: muda o run quando muda o estilo ou quando o caractere não existe na
// Verdana (setas, por exemplo), que vai na fonte de símbolos para o Word não escolher outra.
function runsDaLinha(linha) {
  const runs = [];
  for (const parte of linha.partes) {
    if (parte.tab) {
      runs.push({ tab: parte.tab });
      continue;
    }
    for (const caractere of parte.texto) {
      const simbolo = caractere !== " " && !temNaFonte(caractere);
      const ultimo = runs[runs.length - 1];
      if (ultimo && !ultimo.tab && ultimo.estilo === parte.estilo && ultimo.simbolo === simbolo) ultimo.texto += caractere;
      else runs.push({ texto: caractere, estilo: parte.estilo, simbolo });
    }
  }
  return runs;
}

function propriedadesDoRun(run, linha, formato) {
  const props = [];
  if (run.simbolo) {
    const fonte = xml(formato.fonteSimbolos);
    props.push(`<w:rFonts w:ascii="${fonte}" w:hAnsi="${fonte}" w:cs="${fonte}" w:eastAsia="${fonte}"/>`);
  }
  if (run.estilo & ESTILO.grifo) {
    if (formato.grifo !== "italico") props.push("<w:b/><w:bCs/>");
    props.push("<w:i/><w:iCs/>");
  }
  if (linha.condensar) props.push(`<w:spacing w:val="${-linha.condensar}"/>`);
  if (linha.tamanho !== formato.tamanho) {
    const meio = Math.round(linha.tamanho * 2);
    props.push(`<w:sz w:val="${meio}"/><w:szCs w:val="${meio}"/>`);
  }
  if (run.estilo & ESTILO.sobrescrito) props.push('<w:vertAlign w:val="superscript"/>');
  if (run.estilo & ESTILO.subscrito) props.push('<w:vertAlign w:val="subscript"/>');
  return props.length ? `<w:rPr>${props.join("")}</w:rPr>` : "";
}

// Tabulação do sumário: vai até a margem direita, com pontilhado, e o número fica encostado nela.
const PONTILHADO = '<w:r><w:ptab w:relativeTo="margin" w:alignment="right" w:leader="dot"/></w:r>';

function paragrafo(linha, novaPagina, formato) {
  const propriedades = (novaPagina ? "<w:pageBreakBefore/>" : "") + (linha.alinhar === "centro" ? '<w:jc w:val="center"/>' : "");
  const pPr = propriedades ? `<w:pPr>${propriedades}</w:pPr>` : "";
  const runs = runsDaLinha(linha).map((run) => (run.tab
    ? PONTILHADO
    : `<w:r>${propriedadesDoRun(run, linha, formato)}<w:t xml:space="preserve">${xml(run.texto)}</w:t></w:r>`
  ));
  return `<w:p>${pPr}${runs.join("")}</w:p>`;
}

function documentoXml(tinta) {
  const { formato } = tinta;
  const corpo = [];
  tinta.paginas.forEach((pagina, indice) => {
    pagina.linhas.forEach((linha, numero) => corpo.push(paragrafo(linha, indice > 0 && numero === 0, formato)));
  });
  const twips = (cm) => Math.round(cm * TWIPS_POR_CM);
  const secao = `<w:sectPr><w:pgSz w:w="${twips(formato.larguraCm)}" w:h="${twips(formato.alturaCm)}"/>`
    + `<w:pgMar w:top="${twips(formato.margemSuperiorCm)}" w:right="${twips(formato.margemDireitaCm)}" `
    + `w:bottom="${twips(formato.margemInferiorCm)}" w:left="${twips(formato.margemEsquerdaCm)}" `
    + 'w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="${W}"><w:body>${corpo.join("")}${secao}</w:body></w:document>`;
}

// Estilo Normal: a fonte, o tamanho e a entrelinha exata ficam no padrão do documento.
// Controle de linhas órfãs/viúvas desligado: o Word não pode mover linha de uma página para
// outra. Sem hifenização automática e sem verificação de ortografia (é cópia do braille).
function estilosXml(tinta) {
  const { formato } = tinta;
  const fonte = xml(formato.fonte);
  const entrelinha = Math.round(tinta.entrelinha * 20);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr>`
    + `<w:rFonts w:ascii="${fonte}" w:hAnsi="${fonte}" w:cs="${fonte}" w:eastAsia="${fonte}"/>`
    + `<w:sz w:val="${formato.tamanho * 2}"/><w:szCs w:val="${formato.tamanho * 2}"/><w:lang w:val="pt-BR"/><w:noProof/>`
    + "</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:widowControl w:val=\"0\"/>"
    + `<w:spacing w:before="0" w:after="0" w:line="${entrelinha}" w:lineRule="exact"/>`
    + "</w:pPr></w:pPrDefault></w:docDefaults>"
    + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
    + "</w:styles>";
}

const CONFIG = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="${W}"><w:autoHyphenation w:val="false"/><w:defaultTabStop w:val="720"/></w:settings>`;

const TIPOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
  + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
  + '<Default Extension="xml" ContentType="application/xml"/>'
  + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
  + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
  + '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>'
  + "</Types>";

const RELACOES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
  + "</Relationships>";

const RELACOES_DOC = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
  + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>'
  + "</Relationships>";

// ── ZIP sem compressão (método 0): pequeno, sem dependências, e o Word abre normalmente ─────

const TABELA_CRC = (() => {
  const tabela = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabela[n] = c >>> 0;
  }
  return tabela;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = TABELA_CRC[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(arquivos) {
  const codificar = new TextEncoder();
  const partes = [];
  const central = [];
  let posicao = 0;
  for (const [nome, conteudo] of arquivos) {
    const nomeBytes = codificar.encode(nome);
    const dados = typeof conteudo === "string" ? codificar.encode(conteudo) : conteudo;
    const crc = crc32(dados);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // nomes em UTF-8
    local.setUint16(8, 0, true);
    local.setUint16(10, 0, true);
    local.setUint16(12, 0x21, true); // 1/1/1980
    local.setUint32(14, crc, true);
    local.setUint32(18, dados.length, true);
    local.setUint32(22, dados.length, true);
    local.setUint16(26, nomeBytes.length, true);
    local.setUint16(28, 0, true);
    const entrada = new DataView(new ArrayBuffer(46));
    entrada.setUint32(0, 0x02014b50, true);
    entrada.setUint16(4, 20, true);
    entrada.setUint16(6, 20, true);
    entrada.setUint16(8, 0x0800, true);
    entrada.setUint16(10, 0, true);
    entrada.setUint16(12, 0, true);
    entrada.setUint16(14, 0x21, true);
    entrada.setUint32(16, crc, true);
    entrada.setUint32(20, dados.length, true);
    entrada.setUint32(24, dados.length, true);
    entrada.setUint16(28, nomeBytes.length, true);
    entrada.setUint32(42, posicao, true);
    partes.push(new Uint8Array(local.buffer), nomeBytes, dados);
    central.push(new Uint8Array(entrada.buffer), nomeBytes);
    posicao += 30 + nomeBytes.length + dados.length;
  }
  const tamanhoCentral = central.reduce((soma, parte) => soma + parte.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(8, arquivos.length, true);
  fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamanhoCentral, true);
  fim.setUint32(16, posicao, true);
  const todas = [...partes, ...central, new Uint8Array(fim.buffer)];
  const saida = new Uint8Array(todas.reduce((soma, parte) => soma + parte.length, 0));
  let ponto = 0;
  for (const parte of todas) {
    saida.set(parte, ponto);
    ponto += parte.length;
  }
  return saida;
}

// Lê um arquivo de dentro de um zip sem compressão (só os que este módulo grava).
function lerDoZip(bytes, procurado) {
  const visao = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decodificar = new TextDecoder("utf-8");
  let posicao = 0;
  while (posicao + 30 <= bytes.length && visao.getUint32(posicao, true) === 0x04034b50) {
    const metodo = visao.getUint16(posicao + 8, true);
    const tamanho = visao.getUint32(posicao + 18, true);
    const tamanhoNome = visao.getUint16(posicao + 26, true);
    const extra = visao.getUint16(posicao + 28, true);
    const nome = decodificar.decode(bytes.subarray(posicao + 30, posicao + 30 + tamanhoNome));
    const inicio = posicao + 30 + tamanhoNome + extra;
    if (nome === procurado) {
      if (metodo !== 0) throw new Error(`${nome} está comprimido`);
      return decodificar.decode(bytes.subarray(inicio, inicio + tamanho));
    }
    posicao = inicio + tamanho;
  }
  throw new Error(`${procurado} não está no arquivo`);
}

export function gerarDocx(tinta) {
  return zip([
    ["[Content_Types].xml", TIPOS],
    ["_rels/.rels", RELACOES],
    ["word/_rels/document.xml.rels", RELACOES_DOC],
    ["word/document.xml", documentoXml(tinta)],
    ["word/styles.xml", estilosXml(tinta)],
    ["word/settings.xml", CONFIG],
  ]);
}

// Páginas do .docx: cada página é a lista dos textos dos parágrafos.
export function lerDocx(bytes) {
  const documento = lerDoZip(bytes, "word/document.xml");
  const desfazer = (texto) => texto.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&amp;", "&");
  const paginas = [];
  for (const [, conteudo] of documento.matchAll(/<w:p>(.*?)<\/w:p>/gs)) {
    if (!paginas.length || conteudo.includes("<w:pageBreakBefore/>")) paginas.push([]);
    const texto = [...conteudo.matchAll(/<w:t[^>]*>(.*?)<\/w:t>/gs)].map((achado) => desfazer(achado[1])).join("");
    paginas[paginas.length - 1].push(texto);
  }
  return paginas;
}

// Lê o .docx gravado e compara com a tinta, página por página e linha por linha.
export function conferirDocx(bytes, tinta) {
  let paginas;
  try {
    paginas = lerDocx(bytes);
  } catch (erro) {
    return { ok: false, motivo: `não foi possível ler o arquivo gravado (${erro.message})` };
  }
  if (paginas.length !== tinta.paginas.length) {
    return { ok: false, motivo: `o arquivo tem ${paginas.length} páginas e o braille tem ${tinta.paginas.length}` };
  }
  for (let indice = 0; indice < paginas.length; indice += 1) {
    const esperadas = tinta.paginas[indice].linhas;
    const lidas = paginas[indice];
    if (lidas.length !== esperadas.length) {
      return { ok: false, motivo: `folha ${indice + 1}: ${lidas.length} linhas no arquivo e ${esperadas.length} no braille` };
    }
    for (let numero = 0; numero < lidas.length; numero += 1) {
      if (lidas[numero] !== esperadas[numero].texto) {
        return { ok: false, motivo: `folha ${indice + 1}, linha ${numero + 1}: “${lidas[numero]}” no arquivo, “${esperadas[numero].texto}” esperado` };
      }
    }
  }
  return { ok: true };
}
