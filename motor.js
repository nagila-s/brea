// Pipeline do Braille Fácil, refeito para corrigir em cima:
// 1. Crase + token do CODMAT troca o símbolo por uma string de caracteres.
// 2. Cada caractere passa pela tabela escolhida (ambcode ou ambcode2) e vira um byte.
// 3. Esse byte entra no brailex e sai como 6 pontos, na ordem 1 2 3 4 5 6.
// 4. Sinal de maiúscula e sinal de número são compostos aqui. A tabela não insere os dois.
// A substituição do CODMAT é lida sempre pelo ambcode antigo: foi nesse alfabeto que os pontos foram escritos.

import { tabelas } from "./tabelas.js";

const SINAL_MAIUSCULA = "000101";
const SINAL_NUMERO = "001111";

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
  return new TextDecoder("windows-1252").decode(Uint8Array.of(meta));
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

function celaDePontos(dots, tipo, origem, corrigida) {
  return {
    dots,
    meta: metaDePontos(dots),
    tipo,
    origem,
    corrigida: Boolean(corrigida),
    aviso: false,
    cortada: false,
  };
}

function mapChar(caractere, mapa, pontos) {
  const meta = mapa[caractere];
  if (meta == null) {
    return {
      dots: "111111",
      meta: null,
      tipo: "corpo",
      origem: caractere,
      corrigida: false,
      aviso: `sem cela para “${caractere}”`,
      cortada: false,
    };
  }
  const dots = pontos[String(meta)] || (meta === 0x20 ? "000000" : null);
  if (!dots) {
    return {
      dots: "111111",
      meta,
      tipo: "corpo",
      origem: caractere,
      corrigida: false,
      aviso: `sem pontos para “${caractere}”`,
      cortada: false,
    };
  }
  return {
    dots,
    meta,
    tipo: meta === 0x20 ? "espaco" : "corpo",
    origem: caractere,
    corrigida: false,
    aviso: false,
    cortada: false,
  };
}

function ehMaiuscula(caractere) {
  return caractere.toLowerCase() !== caractere && caractere.toUpperCase() === caractere;
}

function sinal(qual, correcoes) {
  const padrao = qual === "maiuscula" ? SINAL_MAIUSCULA : SINAL_NUMERO;
  const gravado = correcoes.sinais?.[qual];
  const dots = pontosValidos(gravado) ? gravado : padrao;
  return celaDePontos(
    dots,
    qual === "maiuscula" ? "sinal-maiuscula" : "sinal-numero",
    "",
    pontosValidos(gravado)
  );
}

function corpo(original, base, mapa, pontos, correcoes) {
  const direto = correcoes.caracteres?.[original];
  const herdado = original !== base ? correcoes.caracteres?.[base] : null;
  const escolhido = pontosValidos(direto) ? direto : pontosValidos(herdado) ? herdado : null;
  if (escolhido) return celaDePontos(escolhido, "corpo", original, true);
  const cela = mapChar(base, mapa, pontos);
  cela.origem = original;
  return cela;
}

function emitirMatematica(regra, pontos, correcoes) {
  const gravado = correcoes.matematica?.[regra.token];
  if (Array.isArray(gravado) && gravado.length && gravado.every(pontosValidos)) {
    return gravado.map((dots) => celaDePontos(dots, "matematica", regra.token, true));
  }
  // CODMAT escreve a substituição no alfabeto do ambcode antigo.
  // No unificado vários desses bytes mudam de cela; a matemática fica na tabela em que foi escrita.
  return [...regra.saida].map((caractere) => {
    const cela = mapChar(caractere, tabelas.antigo, pontos);
    cela.tipo = "matematica";
    cela.origem = regra.token;
    return cela;
  });
}

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

function marcar(celas) {
  const ocorrencia = identificar.seq;
  identificar.seq += 1;
  for (const cela of celas) cela.ocorrencia = ocorrencia;
  return celas;
}

function normalizar(opcoes) {
  const correcoes = opcoes.correcoes || correcoesVazias();
  return {
    codigo: opcoes.codigo === "antigo" ? "antigo" : "unificado",
    matematica: Boolean(opcoes.matematica),
    maiuscula: opcoes.maiuscula !== false,
    maiusculaPalavra: opcoes.maiusculaPalavra !== false,
    numero: opcoes.numero !== false,
    correcoes: {
      caracteres: correcoes.caracteres || {},
      matematica: correcoes.matematica || {},
      sinais: correcoes.sinais || {},
    },
  };
}

export function traduzir(texto, opcoes = {}) {
  const opc = normalizar(opcoes);
  const mapa = tabelas[opc.codigo];
  const pontos = tabelas.pontos;
  const regras = opc.matematica ? tabelas.regras : [];
  identificar.seq = 1;
  blocoSeq = 1;

  const partes = [];
  let i = 0;
  while (i < texto.length) {
    const caractere = texto[i];
    if (caractere === "\r") {
      i += 1;
      continue;
    }
    if (caractere === "\n") {
      partes.push({ t: "nl" });
      i += 1;
      continue;
    }
    if (caractere === " " || caractere === "\t" || caractere === "\u00A0") {
      partes.push({ t: "espaco", de: i, ate: i + 1 });
      i += 1;
      continue;
    }
    if (regras.length && caractere === "`") {
      const resto = texto.slice(i + 1);
      const regra = regras.find((item) => resto.startsWith(item.token));
      if (regra) {
        const ate = i + 1 + regra.token.length;
        partes.push({ t: "math", regra, de: i, ate, rotulo: texto.slice(i, ate) });
        i = ate;
        continue;
      }
    }
    if (/\p{L}/u.test(caractere)) {
      let j = i + 1;
      while (j < texto.length && /\p{L}/u.test(texto[j])) j += 1;
      partes.push({ t: "palavra", s: texto.slice(i, j), de: i, ate: j });
      i = j;
      continue;
    }
    if (/[0-9]/.test(caractere)) {
      let j = i + 1;
      while (j < texto.length && /[0-9]/.test(texto[j])) j += 1;
      partes.push({ t: "numero", s: texto.slice(i, j), de: i, ate: j });
      i = j;
      continue;
    }
    partes.push({ t: "char", s: caractere, de: i, ate: i + caractere.length });
    i += 1;
  }

  const atual = [];
  const paragrafos = [];

  function flush(vazioSeCouber) {
    if (atual.length === 0) {
      if (vazioSeCouber) paragrafos.push({ vazio: true, celas: [] });
      return;
    }
    const lote = atual.splice(0, atual.length);
    const temConteudo = lote.some((cela) => cela.tipo !== "espaco");
    paragrafos.push(temConteudo ? { vazio: false, celas: lote } : { vazio: true, celas: [] });
  }

  for (const parte of partes) {
    if (parte.t === "nl") {
      flush(true);
      continue;
    }
    if (parte.t === "espaco") {
      atual.push(faixa({
        dots: "000000",
        meta: 0x20,
        tipo: "espaco",
        origem: " ",
        corrigida: false,
        aviso: false,
        cortada: false,
        ocorrencia: 0,
      }, parte.de, parte.ate, "", novoBloco()));
      continue;
    }
    if (parte.t === "math") {
      const bloco = novoBloco();
      const celas = marcar(emitirMatematica(parte.regra, pontos, opc.correcoes));
      celas.forEach((cela, indice) => {
        atual.push(faixa(cela, parte.de, parte.ate, indice === 0 ? parte.rotulo : "", bloco));
      });
      continue;
    }
    if (parte.t === "numero") {
      const blocoPrimeiro = novoBloco();
      if (opc.numero) atual.push(faixa(identificar(sinal("numero", opc.correcoes)), parte.de, parte.de + 1, "", blocoPrimeiro));
      let cursor = parte.de;
      for (const digito of parte.s) {
        const bloco = cursor === parte.de ? blocoPrimeiro : novoBloco();
        atual.push(faixa(identificar(corpo(digito, digito, mapa, pontos, opc.correcoes)), cursor, cursor + 1, digito, bloco));
        cursor += 1;
      }
      continue;
    }
    if (parte.t === "palavra") {
      const letras = [...parte.s];
      const todaMaiuscula =
        opc.maiuscula &&
        opc.maiusculaPalavra &&
        letras.length >= 2 &&
        letras.every(ehMaiuscula);
      const blocoInicial = todaMaiuscula ? novoBloco() : 0;
      if (todaMaiuscula) {
        atual.push(faixa(identificar(sinal("maiuscula", opc.correcoes)), parte.de, parte.de + 1, "", blocoInicial));
        atual.push(faixa(identificar(sinal("maiuscula", opc.correcoes)), parte.de, parte.de + 1, "", blocoInicial));
      }
      let cursor = parte.de;
      for (const letra of letras) {
        const ate = cursor + letra.length;
        const bloco = todaMaiuscula && cursor === parte.de ? blocoInicial : novoBloco();
        if (opc.maiuscula && ehMaiuscula(letra) && !todaMaiuscula) {
          atual.push(faixa(identificar(sinal("maiuscula", opc.correcoes)), cursor, ate, "", bloco));
        }
        const base = ehMaiuscula(letra) ? letra.toLowerCase() : letra;
        atual.push(faixa(
          identificar(corpo(letra, opc.maiuscula ? base : letra, mapa, pontos, opc.correcoes)),
          cursor,
          ate,
          letra,
          bloco
        ));
        cursor = ate;
      }
      continue;
    }
    atual.push(faixa(
      identificar(corpo(parte.s, parte.s, mapa, pontos, opc.correcoes)),
      parte.de,
      parte.ate,
      parte.s,
      novoBloco()
    ));
  }
  flush(false);

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
  const celas = [sinal("numero", correcoes)];
  for (const digito of texto) {
    celas.push(corpo(digito, digito, tabelas.unificado, tabelas.pontos, correcoes));
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
