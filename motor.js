// Tradutor do Braille Fácil, refeito a partir do executável (IDR).
// Etapas, como no original:
// 1. Cada linha passa pelo tradutor de contexto: _Unit67 (código unificado, 0047DDA4)
//    ou _Unit68 (código antigo, 0047C868). Ele gera um "texto intermediário": sinais de
//    maiúscula e de número, ordinais, frações, substituições como % -> _} ou § -> ss.
// 2. Cada byte desse texto passa pela tabela ambcode/ambcode2 (004A1354). A tabela começa
//    como identidade e o .cfg sobrescreve, então byte sem entrada vai como ele mesmo.
// 3. O byte resultante (meta) vira 6 pontos pelo brailex.
// A expansão CODMAT por crase (`token, com a opção "matemática") não é do tradutor original:
// lá é uma macro do editor (brmacro 00487EC0). Ela continua aqui como antes, escrita no
// alfabeto do ambcode antigo.
//
// Campos de cada cela:
//   meta      byte depois da tabela (o que o original grava no arquivo; 0x20 = espaço)
//   metaTexto byte do texto intermediário, antes da tabela (o original quebra linha e
//             separa sílabas sobre este texto)

import { tabelas } from "./tabelas.js";
import { CRASE_UNIFICADO, REBAIXADO_ANTIGO, REBAIXADO_UNIFICADO } from "./tabelas_exe.js";

const SINAL_MAIUSCULA = "000101";
const SINAL_NUMERO = "001111";

// cp1252 montado à mão: o TextDecoder("windows-1252") do Node sem ICU completo
// devolve latin-1 em 0x80-0x9F.
const CP1252_80 = "€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f" +
  "\u0090‘’“”•–—˜™š›œ\u009džŸ";
const CHAR_DO_BYTE = Array.from({ length: 256 }, (_, byte) =>
  byte >= 0x80 && byte < 0xa0 ? CP1252_80[byte - 0x80] : String.fromCharCode(byte)
);
const BYTE_DO_CHAR = new Map();
CHAR_DO_BYTE.forEach((caractere, byte) => {
  if (!BYTE_DO_CHAR.has(caractere)) BYTE_DO_CHAR.set(caractere, byte);
});

function byteDe(caractere) {
  const byte = BYTE_DO_CHAR.get(caractere);
  return byte == null ? null : byte;
}

// 004A1354: zera a tabela como identidade e aplica as linhas do .cfg.
function montarTabela(mapa) {
  const tabela = Array.from({ length: 256 }, (_, byte) => byte);
  for (const [caractere, meta] of Object.entries(mapa)) {
    const byte = byteDe(caractere);
    if (byte != null) tabela[byte] = meta;
  }
  return tabela;
}

const TABELA = {
  antigo: montarTabela(tabelas.antigo),
  unificado: montarTabela(tabelas.unificado),
};

const usados = new Set();
for (const mapa of [tabelas.antigo, tabelas.unificado]) {
  for (const meta of Object.values(mapa)) usados.add(meta);
}
usados.add(0x2e);
usados.add(0x23);

const reverso = new Map();
for (const [byte, dots] of Object.entries(tabelas.pontos)) {
  const lista = reverso.get(dots) || [];
  lista.push(Number(byte));
  reverso.set(dots, lista);
}

export function correcoesVazias() {
  return { caracteres: {}, matematica: {}, sinais: {} };
}

export function nomesPontos(dots) {
  const nomes = [];
  for (let i = 0; i < dots.length; i += 1) {
    if (dots[i] === "1") nomes.push(String(i + 1));
  }
  return nomes.join("") || "vazia";
}

export function unicodeDaCela(dots) {
  let valor = 0;
  for (let i = 0; i < 6; i += 1) {
    if (dots[i] === "1") valor |= 1 << i;
  }
  return String.fromCodePoint(0x2800 + valor);
}

export function caractereMeta(meta) {
  if (meta == null || meta < 0 || meta > 255) return "?";
  return CHAR_DO_BYTE[meta];
}

export function metaDePontos(dots) {
  const hits = reverso.get(dots) || [];
  const preferidos = hits.filter((byte) => usados.has(byte));
  const pool = preferidos.length ? preferidos : hits;
  const imprimiveis = pool.filter((byte) => byte >= 0x20 && byte < 0x7f);
  const base = imprimiveis.length ? imprimiveis : pool;
  return base.find((byte) => byte >= 0x61 && byte <= 0x7a) ?? base[0] ?? null;
}

function pontosValidos(dots) {
  return typeof dots === "string" && /^[01]{6}$/.test(dots);
}

// Um caractere do texto intermediário vira uma cela pela tabela e pelo brailex.
function celaDe(caractere, tabela, tipo = "corpo") {
  const byte = byteDe(caractere);
  if (byte == null) {
    return {
      dots: "111111",
      meta: null,
      metaTexto: null,
      tipo,
      origem: caractere,
      corrigida: false,
      aviso: `sem cela para “${caractere}”`,
      cortada: false,
    };
  }
  const meta = tabela[byte];
  const dots = tabelas.pontos[String(meta)] || (meta === 0x20 ? "000000" : null);
  let tipoFinal = tipo;
  if (tipo === "corpo" && meta === 0x20) tipoFinal = byte === 0x20 ? "espaco" : "espaco-fixo";
  return {
    dots: dots || "111111",
    meta,
    metaTexto: byte,
    tipo: tipoFinal,
    origem: caractere,
    corrigida: false,
    aviso: dots ? false : `sem pontos para “${caractere}”`,
    cortada: false,
  };
}

function celaSinal(texto, tipo, tabela, correcoes) {
  const cela = celaDe(texto, tabela, tipo);
  cela.origem = "";
  const qual = tipo === "sinal-maiuscula" ? "maiuscula" : tipo === "sinal-numero" ? "numero" : null;
  const gravado = qual ? correcoes.sinais?.[qual] : null;
  if (pontosValidos(gravado)) {
    cela.dots = gravado;
    cela.meta = metaDePontos(gravado);
    cela.corrigida = true;
    cela.aviso = false;
  }
  return cela;
}

function emitirMatematica(regra, correcoes) {
  const gravado = correcoes.matematica?.[regra.token];
  if (Array.isArray(gravado) && gravado.length && gravado.every(pontosValidos)) {
    return gravado.map((dots) => ({
      dots,
      meta: metaDePontos(dots),
      metaTexto: null,
      tipo: "matematica",
      origem: regra.token,
      corrigida: true,
      aviso: false,
      cortada: false,
    }));
  }
  // CODMAT escreve a substituição no alfabeto do ambcode antigo.
  return [...regra.saida].map((caractere) => {
    const cela = celaDe(caractere, TABELA.antigo, "matematica");
    cela.origem = regra.token;
    return cela;
  });
}

const ehDigito = (byte) => byte != null && byte >= 0x30 && byte <= 0x39;
// Conjuntos 4A9FC8 (minúsculas) e 4A9FA8 (maiúsculas) do executável.
const ehMinuscula = (byte) => byte != null && ((byte >= 0x61 && byte <= 0x7a) || byte >= 0xe0);
const ehMaiuscula = (byte) => byte != null && ((byte >= 0x41 && byte <= 0x5a) || (byte >= 0xc0 && byte <= 0xdf));
// 004A1598
const paraMinuscula = (byte) => (ehMaiuscula(byte) ? byte + 0x20 : byte);

const CRASE_67 = new Map(CRASE_UNIFICADO.filter(([chave]) => chave.length === 1));

// Tradutor de contexto de uma linha. Devolve tokens:
// { de, ate (índices em `car`), texto (intermediário), sinais: [{texto, tipo}], regra? }
function traduzirLinha(car, opc, estado) {
  const n = car.length;
  const b = car.map(byteDe);
  const unificado = opc.codigo === "unificado";
  const ingles = opc.ingles;
  const tokens = [];
  let pendentes = [];
  let i = 0;

  const sinal = (texto, tipo) => pendentes.push({ texto, tipo });
  const sinalNumero = () => {
    if (opc.numero) sinal("#", "sinal-numero");
  };
  const emitir = (de, ate, texto) => {
    tokens.push({ de, ate, texto, sinais: pendentes });
    pendentes = [];
  };

  function minusculas() {
    // 0047D054 / 0047C2B4: copia enquanto for minúscula ou hífen.
    do {
      emitir(i, i + 1, car[i]);
      i += 1;
    } while (i < n && (ehMinuscula(b[i]) || b[i] === 0x2d));
  }

  function maiusculas() {
    // 0047D124 / 0047C384.
    const marca = unificado ? (ingles ? "\\" : "{") : ingles ? "&" : "]";
    if (!opc.maiuscula) {
      emitir(i, i + 1, car[i]);
      i += 1;
      return;
    }
    if (opc.maiusculaPalavra && i + 1 < n && ehMaiuscula(b[i + 1])) {
      sinal(marca, "sinal-maiuscula");
      sinal(marca, "sinal-maiuscula");
      do {
        emitir(i, i + 1, CHAR_DO_BYTE[paraMinuscula(b[i])]);
        i += 1;
      } while (i < n && ehMaiuscula(b[i]));
      // Só o unificado fecha a sequência quando a palavra continua em minúscula.
      if (unificado && i < n && ehMinuscula(b[i])) sinal("~", "sinal-separador");
      return;
    }
    sinal(marca, "sinal-maiuscula");
    emitir(i, i + 1, CHAR_DO_BYTE[paraMinuscula(b[i])]);
    i += 1;
  }

  // 0047CA30 / 0047BD50
  function ordinal(rebaixado) {
    let j = i;
    while (j < n && ehDigito(b[j])) j += 1;
    if (j >= n) return false;
    let sufixo;
    let fim;
    if (b[j] === 0xaa) {
      sufixo = "a";
      fim = j + 1;
    } else if (b[j] === 0xba || (!unificado && b[j] === 0xb0)) {
      sufixo = "o";
      fim = j + 1;
    } else {
      const dois = car.slice(j, j + 2).join("");
      const tres = car.slice(j, j + 3).join("");
      if (n >= j + 2 && (dois === "a." || dois === "o.")) {
        sufixo = car[j];
        fim = j + 2;
      } else if (n >= j + 3 && (tres === "as." || tres === "os.")) {
        sufixo = tres.slice(0, 2);
        fim = j + 3;
      } else {
        return false;
      }
    }
    for (let k = i; k < j; k += 1) emitir(k, k + 1, rebaixado[b[k] - 0x30]);
    emitir(j, fim, sufixo);
    i = fim;
    return true;
  }

  // 0047CCF0: ponto dentro de número no unificado.
  function pontoNumeroUnificado() {
    if (i === n - 1 || !ehDigito(b[i + 1])) {
      emitir(i, i + 1, ".");
      return;
    }
    let antes = 0;
    for (let k = i - 1; k >= 0 && ehDigito(b[k]); k -= 1) antes += 1;
    let depois = 0;
    for (let k = i + 1; k < n && ehDigito(b[k]); k += 1) depois += 1;
    emitir(i, i + 1, ".");
    if (antes < 3 && depois < 3) sinalNumero();
  }

  // 0047CDEC
  function numeroUnificado() {
    sinalNumero();
    if (ordinal(REBAIXADO_UNIFICADO)) return;
    while (i < n) {
      const x = b[i];
      if (x === 0x24) emitir(i, i + 1, "$");
      else if (x === 0x2c) emitir(i, i + 1, ",");
      else if (x === 0x2e) pontoNumeroUnificado();
      else if (ehDigito(x)) emitir(i, i + 1, car[i]);
      else if (x >= 0x61 && x <= 0x6a) {
        sinal("~", "sinal-separador");
        return;
      } else return;
      i += 1;
    }
  }

  // 0047BB44: data com duas barras, só no antigo.
  function data() {
    let j = i;
    let barras = 0;
    while (j < n && b[j] >= 0x2f && b[j] <= 0x39) {
      if (b[j] === 0x2f) barras += 1;
      j += 1;
    }
    if (barras !== 2 || !ehDigito(b[j - 1])) return false;
    for (let k = i; k < j; k += 1) emitir(k, k + 1, b[k] === 0x2f ? "-" : car[k]);
    i = j;
    return true;
  }

  // 0047BC58: hora, só no antigo.
  function hora() {
    let j = i;
    while (j < n && ehDigito(b[j])) j += 1;
    if (j >= n || b[j] !== 0x3a) return false;
    while (j < n && b[j] >= 0x30 && b[j] <= 0x3a) j += 1;
    for (let k = i; k < j; k += 1) emitir(k, k + 1, car[k]);
    i = j;
    return true;
  }

  // 0047C018
  function numeroAntigo() {
    sinalNumero();
    if (data() || hora() || ordinal(REBAIXADO_ANTIGO)) return;
    while (i < n) {
      const x = b[i];
      if (x === 0x2c) emitir(i, i + 1, ",");
      else if (x === 0x2e) emitir(i, i + 1, i < n - 1 && ehDigito(b[i + 1]) ? "'" : ".");
      else if (ehDigito(x)) emitir(i, i + 1, car[i]);
      else return;
      i += 1;
    }
  }

  // 0047CF58 / 0047C1B8: `N/D -> # + N rebaixado + D.
  function fracao(rebaixado) {
    sinalNumero();
    const crase = i;
    i += 1;
    let primeiro = true;
    while (i < n && ehDigito(b[i])) {
      emitir(primeiro ? crase : i, i + 1, rebaixado[b[i] - 0x30]);
      primeiro = false;
      i += 1;
    }
    if (i < n && b[i] === 0x2f) {
      const barra = i;
      i += 1;
      primeiro = true;
      while (i < n && ehDigito(b[i])) {
        emitir(primeiro ? barra : i, i + 1, car[i]);
        primeiro = false;
        i += 1;
      }
    }
  }

  // 0047D3E0: substituições do unificado.
  function substituirUnificado(de = i) {
    const x = b[i];
    let saida = car[i];
    switch (x) {
      case 0x23: saida = "#"; break;
      case 0x25: saida = "_}"; break;
      case 0x28: estado.parentese = 1; saida = ingles ? "=" : "(."; break;
      case 0x29: estado.parentese = 0; saida = ingles ? "=" : "\\)"; break;
      case 0x2a: saida = ingles ? "{" : "*"; break;
      case 0x2f: saida = ingles ? "ì" : "\\,"; break;
      case 0x3f: saida = ingles ? "\"" : "?"; break;
      case 0x5b: estado.parentese = 1; saida = "[."; break;
      case 0x5c: saida = "~."; break;
      case 0x5d: estado.parentese = 0; saida = "\\]"; break;
      case 0x5f: saida = ingles ? "]" : "_"; break;
      case 0x80: saida = "€e"; break;
      case 0x85: saida = "..."; break;
      case 0x89: saida = "_}}"; break;
      case 0x91: case 0x92: saida = "$\""; break;
      case 0x95: saida = "õo"; break;
      case 0x96: case 0x97: case 0xad: saida = "--"; break;
      case 0x9c: saida = "oe"; break;
      case 0xa7: saida = "ss"; break;
      case 0xab: case 0xbb: saida = "\\\""; break;
      case 0xb2: saida = "å#b"; break;
      case 0xb3: saida = "å#c"; break;
      case 0xb9: saida = "å#a"; break;
      case 0xbc: saida = "#,d"; break;
      case 0xbd: saida = "#,b"; break;
      case 0xbe: saida = "#:d"; break;
      case 0xdf: saida = "¬b"; break;
      case 0xe6: saida = "ae"; break;
      default: break;
    }
    emitir(de, i + 1, saida);
    i += 1;
  }

  // 0047C620: substituições do antigo.
  function substituirAntigo() {
    const x = b[i];
    let saida = car[i];
    if (x === 0x25) saida = "_}";
    else if (x === 0x5f) saida = ingles ? "]" : "_";
    else if (x === 0xa7) saida = "ss";
    emitir(i, i + 1, saida);
    i += 1;
  }

  while (i < n) {
    const x = b[i];
    if (opc.matematica && regrasMatematica.length && car[i] === "`") {
      const resto = car.slice(i + 1).join("");
      const regra = regrasMatematica.find((item) => resto.startsWith(item.token));
      if (regra) {
        const ate = i + 1 + [...regra.token].length;
        tokens.push({ de: i, ate, regra, sinais: pendentes });
        pendentes = [];
        i = ate;
        continue;
      }
    }
    if (unificado) {
      if (ehMinuscula(x)) minusculas();
      else if (ehMaiuscula(x) && x !== 0xd7 && x !== 0xdf) maiusculas();
      else if (ehDigito(x)) numeroUnificado();
      else if (i + 1 < n && (x === 0x28 || x === 0x5b) && ehDigito(b[i + 1])) {
        // 0047DC18: parêntese/colchete de expressão numérica.
        estado.parentese = 0;
        const fecha = x === 0x5b ? "]" : ")";
        const resto = car.slice(i + 1, i + 1 + 999);
        const pos = resto.indexOf(fecha);
        if (pos >= 1 && ehDigito(byteDe(resto[pos - 1]))) {
          emitir(i, i + 1, x === 0x28 ? "ê" : "á");
          i += 1;
        } else {
          estado.parentese = 1;
          substituirUnificado();
        }
      } else if (estado.parentese === 0 && i > 0 && (x === 0x29 || x === 0x5d) && ehDigito(b[i - 1])) {
        // 0047DD34
        emitir(i, i + 1, x === 0x29 ? "ã" : "ú");
        i += 1;
        estado.parentese = 0;
      } else if (i + 1 < n && x === 0x60 && ehDigito(b[i + 1])) fracao(REBAIXADO_UNIFICADO);
      else if (i + 1 < n && x === 0x60) {
        // 0047DB58: crase + 1 caractere pela tabela 4AA348; a crase some.
        const crase = i;
        i += 1;
        const saida = CRASE_67.get(car[i]);
        if (saida != null) {
          emitir(crase, i + 1, saida);
          i += 1;
        } else substituirUnificado(crase);
      } else if (x === 0x2e) {
        // 0047D2E8
        emitir(i, i + 1, ingles ? "/" : ".");
        i += 1;
      } else if (x === 0x22 || x === 0x93 || x === 0x94) {
        // 0047D340
        let saida = "\"";
        if (ingles) {
          if (x === 0x93) estado.aspasInglesas = 1;
          else if (x === 0x94) estado.aspasInglesas = 0;
          if (estado.aspasInglesas) {
            saida = "\"";
            estado.aspasInglesas = 0;
          } else {
            saida = "}";
            estado.aspasInglesas = 1;
          }
        }
        emitir(i, i + 1, saida);
        i += 1;
      } else substituirUnificado();
    } else {
      if (ehMinuscula(x)) minusculas();
      else if (ehMaiuscula(x)) maiusculas();
      else if (ehDigito(x)) numeroAntigo();
      else if (i + 1 < n && x === 0x60 && ehDigito(b[i + 1])) fracao(REBAIXADO_ANTIGO);
      else if (i + 1 < n && x === 0x60 && "()*[]{}".includes(car[i + 1])) {
        // 0047C730
        const saidas = { "(": "ê", ")": "ã", "*": "{", "[": "á", "]": "ú", "{": "~l", "}": "_," };
        emitir(i, i + 2, saidas[car[i + 1]]);
        i += 2;
      } else if (x === 0x2e) {
        // 0047C510: "..." vira ''' (literal de 3 bytes em 47C590) e o índice anda 3.
        if (n >= i + 3 && b[i + 1] === 0x2e && b[i + 2] === 0x2e) {
          emitir(i, i + 3, "'''");
          i += 3;
        } else {
          emitir(i, i + 1, ".");
          i += 1;
        }
      } else if (x === 0x22 || x === 0x93 || x === 0x94) {
        // 0047C5A0: abre/fecha alternando.
        if (x === 0x93) estado.aspas = 1;
        else if (x === 0x94) estado.aspas = 0;
        const saida = estado.aspas ? "{" : "}";
        estado.aspas = estado.aspas ? 0 : 1;
        emitir(i, i + 1, saida);
        i += 1;
      } else substituirAntigo();
    }
  }
  if (pendentes.length) tokens.push({ de: n, ate: n, texto: "", sinais: pendentes });
  return tokens;
}

let regrasMatematica = [];

function identificar(cela) {
  cela.ocorrencia = identificar.seq;
  identificar.seq += 1;
  return cela;
}
identificar.seq = 1;

function faixa(cela, de, ate, rotulo, bloco) {
  cela.de = de;
  cela.ate = ate;
  cela.rotulo = rotulo || "";
  cela.bloco = bloco;
  return cela;
}

let blocoSeq = 1;
function novoBloco() {
  blocoSeq += 1;
  return blocoSeq;
}

function normalizar(opcoes) {
  const correcoes = opcoes.correcoes || correcoesVazias();
  return {
    codigo: opcoes.codigo === "antigo" ? "antigo" : "unificado",
    matematica: Boolean(opcoes.matematica),
    maiuscula: opcoes.maiuscula !== false,
    maiusculaPalavra: opcoes.maiusculaPalavra !== false,
    numero: opcoes.numero !== false,
    ingles: Boolean(opcoes.ingles),
    correcoes: {
      caracteres: correcoes.caracteres || {},
      matematica: correcoes.matematica || {},
      sinais: correcoes.sinais || {},
    },
  };
}

// Transforma os tokens de uma linha em celas com de/ate no texto de entrada.
function celasDaLinha(tokens, car, pos, texto, opc) {
  const tabela = TABELA[opc.codigo];
  const celas = [];
  const fimDe = (k) => (k < car.length ? pos[k] : car.length ? pos[car.length - 1] + car[car.length - 1].length : 0);
  for (const token of tokens) {
    const de = fimDe(token.de);
    const ate = token.ate > token.de ? pos[token.ate - 1] + car[token.ate - 1].length : de;
    const rotulo = texto.slice(de, ate);
    const bloco = novoBloco();
    for (const item of token.sinais) {
      celas.push(faixa(identificar(celaSinal(item.texto, item.tipo, tabela, opc.correcoes)), de, ate, "", bloco));
    }
    if (token.regra) {
      const ocorrencia = identificar.seq;
      identificar.seq += 1;
      emitirMatematica(token.regra, opc.correcoes).forEach((cela, indice) => {
        cela.ocorrencia = ocorrencia;
        celas.push(faixa(cela, de, ate, indice === 0 ? rotulo : "", bloco));
      });
      continue;
    }
    const saida = [...token.texto];
    let corpo = saida.map((caractere) => celaDe(caractere, tabela));
    if (token.ate - token.de === 1 && saida.length === 1) {
      const original = car[token.de];
      const direto = opc.correcoes.caracteres?.[original];
      const herdado = saida[0] !== original ? opc.correcoes.caracteres?.[saida[0]] : null;
      const escolhido = pontosValidos(direto) ? direto : pontosValidos(herdado) ? herdado : null;
      if (escolhido) {
        Object.assign(corpo[0], { dots: escolhido, meta: metaDePontos(escolhido), corrigida: true, aviso: false });
      }
      corpo[0].origem = original;
    } else {
      for (const cela of corpo) cela.origem = rotulo;
    }
    if (corpo.length === 1 && corpo[0].tipo === "espaco") {
      corpo[0].origem = " ";
      corpo[0].ocorrencia = 0;
      celas.push(faixa(corpo[0], de, ate, "", bloco));
      continue;
    }
    const ocorrencia = identificar.seq;
    identificar.seq += 1;
    corpo.forEach((cela, indice) => {
      cela.ocorrencia = ocorrencia;
      celas.push(faixa(cela, de, ate, indice === 0 ? rotulo : "", bloco));
    });
  }
  return celas;
}

export function traduzir(texto, opcoes = {}) {
  const opc = normalizar(opcoes);
  regrasMatematica = opc.matematica ? tabelas.regras : [];
  identificar.seq = 1;
  blocoSeq = 1;
  // O original guarda o estado das aspas e do parêntese no documento inteiro
  // (zerado em 0049C97E). Aqui ele vale para uma chamada de traduzir.
  const estado = { aspas: 1, aspasInglesas: 1, parentese: 0 };

  const paragrafos = [];
  const linhas = [];
  let car = [];
  let pos = [];
  let indice = 0;
  for (const caractere of texto) {
    if (caractere === "\n") {
      linhas.push({ car, pos });
      car = [];
      pos = [];
    } else if (caractere === "\t") {
      // 0049BB98: cada TAB vira dois espaços.
      car.push(" ", " ");
      pos.push(indice, indice);
    } else if (caractere !== "\r") {
      car.push(caractere);
      pos.push(indice);
    }
    indice += caractere.length;
  }
  linhas.push({ car, pos });

  linhas.forEach((linha, numero) => {
    const ultima = numero === linhas.length - 1;
    const tokens = traduzirLinha(linha.car, opc, estado);
    const celas = celasDaLinha(tokens, linha.car, linha.pos, texto, opc);
    if (celas.length === 0) {
      if (!ultima) paragrafos.push({ vazio: true, celas: [] });
      return;
    }
    const temConteudo = celas.some((cela) => cela.tipo !== "espaco");
    paragrafos.push(temConteudo ? { vazio: false, celas } : { vazio: true, celas: [] });
  });

  const avisos = [];
  const vistos = new Set();
  for (const paragrafo of paragrafos) {
    for (const cela of paragrafo.celas) {
      if (cela.aviso && !vistos.has(cela.aviso)) {
        vistos.add(cela.aviso);
        avisos.push(cela.aviso);
      }
    }
  }
  return { paragrafos, avisos };
}

function espaco() {
  return {
    dots: "000000",
    meta: 0x20,
    tipo: "espaco",
    origem: " ",
    corrigida: false,
    aviso: false,
    cortada: false,
    ocorrencia: 0,
  };
}

export function quebrarLinhas(celas, colunas) {
  const palavras = [];
  let palavra = [];
  for (const cela of celas) {
    if (cela.tipo === "espaco") {
      if (palavra.length) {
        palavras.push(palavra);
        palavra = [];
      }
    } else {
      palavra.push(cela);
    }
  }
  if (palavra.length) palavras.push(palavra);

  const linhas = [];
  let linha = [];
  let usados = 0;
  for (const item of palavras) {
    const extra = linha.length ? item.length + 1 : item.length;
    if (linha.length && usados + extra > colunas) {
      linhas.push(linha);
      linha = [];
      usados = 0;
    }
    if (item.length > colunas) {
      if (linha.length) {
        linhas.push(linha);
        linha = [];
        usados = 0;
      }
      for (let indice = 0; indice < item.length; indice += colunas) {
        const pedaco = item.slice(indice, indice + colunas).map((cela) => ({ ...cela }));
        if (indice > 0 && pedaco[0]) pedaco[0].cortada = true;
        if (pedaco.length === colunas) linhas.push(pedaco);
        else {
          linha = pedaco;
          usados = pedaco.length;
        }
      }
      continue;
    }
    if (linha.length) {
      linha.push(espaco());
      usados += 1;
    }
    linha.push(...item);
    usados += item.length;
  }
  if (linha.length) linhas.push(linha);
  return linhas;
}

export function paginar(paragrafos, opcoes) {
  const colunas = Math.max(4, Math.min(80, Number(opcoes.colunas) || 32));
  const limite = Math.max(4, Math.min(50, Number(opcoes.linhas) || 27));
  const linhas = [];
  for (const paragrafo of paragrafos) {
    if (paragrafo.vazio) linhas.push([]);
    else linhas.push(...quebrarLinhas(paragrafo.celas, colunas));
  }
  if (linhas.length === 0) linhas.push([]);
  const paginas = [];
  for (let indice = 0; indice < linhas.length; indice += limite) {
    paginas.push(linhas.slice(indice, indice + limite));
  }
  return paginas;
}

export function celasDaPaginaNumero(numero, correcoes = correcoesVazias()) {
  const texto = String(numero);
  const celas = [celaSinal("#", "sinal-numero", TABELA.unificado, correcoes)];
  for (const digito of texto) {
    const cela = celaDe(digito, TABELA.unificado);
    const gravado = correcoes.caracteres?.[digito];
    if (pontosValidos(gravado)) Object.assign(cela, { dots: gravado, meta: metaDePontos(gravado), corrigida: true });
    celas.push(cela);
  }
  for (const cela of celas) cela.ocorrencia = 0;
  return celas;
}

export function textoUnicode(paginas, numerar, correcoes) {
  return paginas
    .map((linhas, indice) => {
      const corpoTexto = linhas
        .map((linha) => linha.map((cela) => (cela.tipo === "espaco" ? " " : unicodeDaCela(cela.dots))).join(""))
        .join("\n");
      if (!numerar) return corpoTexto;
      const prefixo = celasDaPaginaNumero(indice + 1, correcoes)
        .map((cela) => unicodeDaCela(cela.dots))
        .join("");
      return `${prefixo}\n${corpoTexto}`;
    })
    .join("\n\n");
}

export function textoMeta(paginas, numerar, correcoes) {
  return paginas
    .map((linhas, indice) => {
      const corpoTexto = linhas
        .map((linha) => linha.map((cela) => (cela.tipo === "espaco" ? " " : caractereMeta(cela.meta))).join(""))
        .join("\n");
      if (!numerar) return corpoTexto;
      const prefixo = celasDaPaginaNumero(indice + 1, correcoes).map((cela) => caractereMeta(cela.meta)).join("");
      return `${prefixo}\n${corpoTexto}`;
    })
    .join("\f");
}
