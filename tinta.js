// Tinta fiel ao braille: a versão em fonte ampliada que acompanha o livro, linha a linha e
// página a página. Função pura: não toca no DOM.
//
// A tinta NÃO é traduzida de volta a partir das celas, ao contrário do "Tinta no Word" antigo:
// braille não tem volta única (⠢ é "?" e "5", ⠖ é "!" e "+", ⠒⠕ é ":o" e ":>"...). Aqui cada
// linha braille leva o pedaço do texto de origem que a gerou (faixas.js, pelas fontes `de`/`ate`
// de cada cela). Por isso quebra, hífen, recuo, centralização, cabeçalho e página são os do
// braille por construção, e os caracteres são os do texto que a pessoa digitou.
//
// Sobra um passo: o texto do BF mistura português com códigos digitados em braille (`(C`),
// _y, :o, õo, *grifo*...). Esses códigos são lidos no TEXTO, onde não há ambiguidade, e viram
// o símbolo de tinta pela tabela CODIGOS. O que não dá para decidir com segurança vai para o
// relatório, com página e linha.

import { formatar } from "./pagina.js?edicao=32";
import { montarFaixas, marcasPorLinha } from "./faixas.js?edicao=31";
import { LARGURAS } from "./verdana.js?edicao=1";

// Formato da página em tinta: o modelo usado na produção (papel 25,5 × 31,5 cm, margens de
// 5,5 cm dos lados e 2 cm em cima e embaixo, Verdana 20).
export const FORMATO_TINTA = {
  larguraCm: 25.5,
  alturaCm: 31.5,
  margemEsquerdaCm: 5.5,
  margemDireitaCm: 5.5,
  margemSuperiorCm: 2,
  margemInferiorCm: 2,
  fonte: "Verdana",
  fonteSimbolos: "Segoe UI Symbol",
  tamanho: 20,
  // Como o grifo (*texto*) sai na tinta: "negrito-italico" (o que a produção usa) ou "italico".
  grifo: "negrito-italico",
  // Quanto a linha pode ser apertada (em pontos por caractere) antes de diminuir a fonte.
  condensacaoMaxima: 2,
};

export const ESTILO = { grifo: 1, sobrescrito: 2, subscrito: 4 };

const PT_POR_CM = 72 / 2.54;

// ── 1. Códigos do BF → tinta ────────────────────────────────────────────────────────────────
// Cada regra é testada na posição exata (flag y). A primeira que casa vence, por isso as mais
// longas vêm antes. `tinta` é o texto que entra no lugar; `estilo` marca o resultado;
// `conferir` manda a ocorrência para o relatório mesmo tendo sido convertida.

const TREMA = { a: "ä", e: "ë", i: "ï", o: "ö", u: "ü", A: "Ä", E: "Ë", I: "Ï", O: "Ö", U: "Ü" };
const DIGITO_DA_LETRA = { a: "1", b: "2", c: "3", d: "4", e: "5", f: "6", g: "7", h: "8", i: "9", j: "0" };

export const CODIGOS = [
  { nome: "copyright", padrao: /`\(C`\)|êCã/y, tinta: "©" },
  { nome: "marca registrada", padrao: /`\(R`\)|êRã/y, tinta: "®" },
  { nome: "abre nota de transcrição", padrao: /_`\[/y, tinta: "[" },
  { nome: "fecha nota de transcrição", padrao: /_`\]/y, tinta: "]" },
  { nome: "sinal simples", padrao: /`(?=\S)/y, tinta: "" },
  { nome: "seta de duplo sentido", padrao: /õ:o/y, tinta: "↔" },
  { nome: "seta para a esquerda", padrao: /õ:(?![a-zà-ÿ])/y, tinta: "←" },
  { nome: "seta para a direita", padrao: /(?<![\p{L}\d]):[o>](?![\p{L}\d])/uy, tinta: "→" },
  { nome: "círculo", padrao: /õo|<>/y, tinta: "•" },
  // "_y9:", "_y12:"... não é o quadrado: fica como está, como sempre ficou na tinta.
  { nome: "quadrado com número", padrao: /_y(?=\d)/y, tinta: "_y" },
  { nome: "quadrado", padrao: /_y/y, tinta: "□" },
  { nome: "eñe", padrao: /~([nN])/y, tinta: (m) => (m[1] === "n" ? "ñ" : "Ñ") },
  { nome: "delimitador informático", padrao: /~,/y, tinta: "" },
  { nome: "translineação", padrao: /~(?=\s*$)/y, tinta: "" },
  { nome: "trema", padrao: /¬([aeiouAEIOU])/y, tinta: (m) => TREMA[m[1]] },
  {
    nome: "número em letras",
    padrao: /#([a-j]+)/y,
    tinta: (m) => [...m[1]].map((letra) => DIGITO_DA_LETRA[letra]).join(""),
    conferir: "número digitado em braille (# + letras) convertido em algarismos",
  },
  { nome: "maiúsculas na palavra", padrao: /\{\{(\p{L}+)/uy, tinta: (m) => m[1].toUpperCase() },
  { nome: "maiúscula", padrao: /\{(\p{L})/uy, tinta: (m) => m[1].toUpperCase() },
  { nome: "linha para completar", padrao: /\.{5,}/y, tinta: (m) => "_".repeat(m[0].length) },
  { nome: "igual a completar", padrao: /=\.\.\.(?!\.)/y, tinta: "=___" },
  { nome: "travessão", padrao: /(?<!-)--(?!-)/y, tinta: "—" },
  { nome: "vezes", padrao: /(?<=\d)"(?=\d)/y, tinta: "x" },
  { nome: "expoente", padrao: /â(\d+)/y, tinta: (m) => m[1], estilo: ESTILO.sobrescrito },
  { nome: "índice inferior", padrao: /í(\d+)/y, tinta: (m) => m[1], estilo: ESTILO.subscrito },
];

// Caracteres que, se sobrarem na tinta, são quase sempre código braille sem equivalente.
const SUSPEITOS = /[`~¬{}ýÿû^]/g;

const REGRAS_POR_INICIO = new Map();
for (const regra of CODIGOS) {
  // O primeiro caractere possível de cada regra (o vezes começa nas aspas, por causa do lookbehind).
  const fonte = regra.padrao.source.replace(/^\(\?<[!=][^)]*\)/, "");
  const inicio = fonte.startsWith("\\") ? fonte[1] : fonte[0];
  const iniciais = inicio === "[" ? fonte.slice(1, fonte.indexOf("]")).split("") : [inicio];
  for (const caractere of iniciais) {
    if (!REGRAS_POR_INICIO.has(caractere)) REGRAS_POR_INICIO.set(caractere, []);
    REGRAS_POR_INICIO.get(caractere).push(regra);
  }
}
// "êCã"/"êRã" começam com ê, "<>" com <: o mapa acima pega só o primeiro ramo do padrão.
for (const [caractere, nome] of [["ê", "copyright"], ["ê", "marca registrada"], ["<", "círculo"]]) {
  if (!REGRAS_POR_INICIO.has(caractere)) REGRAS_POR_INICIO.set(caractere, []);
  const regra = CODIGOS.find((item) => item.nome === nome);
  if (!REGRAS_POR_INICIO.get(caractere).includes(regra)) REGRAS_POR_INICIO.get(caractere).push(regra);
}

// ── 2. Grifo: *texto* ───────────────────────────────────────────────────────────────────────
// Abre um asterisco no começo de palavra seguido de algo que não é espaço nem outro asterisco;
// fecha um no fim de palavra. O par pode atravessar linhas, mas não um parágrafo (linha vazia,
// linha de comando) nem um trecho de formatação fixa (<F->, onde * é desenho). Asterisco sem
// par fica como está e vai para o relatório: no BF antigo ele deixava o resto em itálico.

const LETRA = /[\p{L}\p{N}]/u;
const MAX_LINHAS_GRIFO = 8;

function podeAbrir(texto, coluna) {
  const antes = texto[coluna - 1];
  const depois = texto[coluna + 1];
  if (depois === undefined || /\s/.test(depois) || depois === "*") return false;
  return antes === undefined || (!LETRA.test(antes) && antes !== "*");
}

function podeFechar(texto, coluna) {
  const antes = texto[coluna - 1];
  const depois = texto[coluna + 1];
  if (antes === undefined || /\s/.test(antes) || antes === "*") return false;
  return depois === undefined || (!LETRA.test(depois) && depois !== "*");
}

function fimDeParagrafo(linha) {
  return !linha.trim() || linha.trimStart().startsWith("<");
}

// ── 3. Marcação do texto inteiro ────────────────────────────────────────────────────────────
// Para cada linha do texto: `saida[c]` é o que o caractere da coluna c vira na tinta (o código
// inteiro fica na primeira coluna dele, as outras viram ""), `estilo[c]` é o estilo.
// Linhas sem nada a mudar ficam null.

function marcarTexto(linhas, fixas) {
  const saida = new Array(linhas.length).fill(null);
  const estilo = new Array(linhas.length).fill(null);
  const avisos = [];
  const garantir = (numero) => {
    if (!saida[numero]) {
      saida[numero] = Array.from({ length: linhas[numero].length }, (_, coluna) => linhas[numero][coluna]);
      estilo[numero] = new Uint8Array(linhas[numero].length);
    }
  };

  // Grifo primeiro: os asteriscos somem e o que fica entre eles ganha o estilo.
  for (let numero = 0; numero < linhas.length; numero += 1) {
    const texto = linhas[numero];
    if (fixas[numero] || !texto.includes("*") || texto.trimStart().startsWith("<")) continue;
    for (let coluna = texto.indexOf("*"); coluna >= 0; coluna = texto.indexOf("*", coluna + 1)) {
      if (saida[numero] && saida[numero][coluna] === "") continue;
      if (!podeAbrir(texto, coluna)) {
        // "**" e "***" são asteriscos de verdade, por exemplo a nota (**).
        if (texto[coluna - 1] === "*" || texto[coluna + 1] === "*") continue;
        avisos.push({ linha: numero, coluna, tipo: "grifo", texto: "asterisco sem par: ficou como “*”" });
        continue;
      }
      const fecho = procurarFecho(linhas, fixas, numero, coluna + 1);
      if (!fecho) {
        avisos.push({ linha: numero, coluna, tipo: "grifo", texto: "grifo aberto e não fechado: o “*” ficou como está" });
        continue;
      }
      garantir(numero);
      saida[numero][coluna] = "";
      garantir(fecho.linha);
      saida[fecho.linha][fecho.coluna] = "";
      for (let atual = numero; atual <= fecho.linha; atual += 1) {
        garantir(atual);
        const de = atual === numero ? coluna + 1 : 0;
        const ate = atual === fecho.linha ? fecho.coluna : linhas[atual].length;
        for (let c = de; c < ate; c += 1) estilo[atual][c] |= ESTILO.grifo;
      }
      // Fechou mais adiante: o resto desta linha já está dentro do grifo.
      coluna = fecho.linha === numero ? fecho.coluna : texto.length;
    }
  }

  // Depois os códigos, em todas as linhas que não são comando.
  for (let numero = 0; numero < linhas.length; numero += 1) {
    const texto = linhas[numero];
    if (texto.trimStart().startsWith("<")) continue;
    for (let coluna = 0; coluna < texto.length; coluna += 1) {
      const regras = REGRAS_POR_INICIO.get(texto[coluna]);
      if (!regras) continue;
      for (const regra of regras) {
        regra.padrao.lastIndex = coluna;
        const achado = regra.padrao.exec(texto);
        if (!achado) continue;
        const tamanho = achado[0].length;
        if (!tamanho) continue;
        garantir(numero);
        const tinta = typeof regra.tinta === "function" ? regra.tinta(achado) : regra.tinta;
        saida[numero][coluna] = tinta;
        for (let c = coluna + 1; c < coluna + tamanho; c += 1) saida[numero][c] = "";
        if (regra.estilo) for (let c = coluna; c < coluna + tamanho; c += 1) estilo[numero][c] |= regra.estilo;
        if (regra.conferir) {
          avisos.push({ linha: numero, coluna, tipo: "codigo", texto: `${regra.conferir}: “${achado[0]}” → “${tinta}”` });
        }
        coluna += tamanho - 1;
        break;
      }
    }
  }
  return { saida, estilo, avisos };
}

function procurarFecho(linhas, fixas, numero, inicio) {
  for (let atual = numero; atual < linhas.length && atual <= numero + MAX_LINHAS_GRIFO; atual += 1) {
    const texto = linhas[atual];
    if (atual > numero && (fimDeParagrafo(texto) || fixas[atual])) return null;
    for (let coluna = texto.indexOf("*", atual === numero ? inicio : 0); coluna >= 0; coluna = texto.indexOf("*", coluna + 1)) {
      if (podeFechar(texto, coluna)) return { linha: atual, coluna };
    }
  }
  return null;
}

// Converte uma string avulsa (o cabeçalho) pela mesma tabela, sem grifo.
function converterAvulso(texto) {
  const { saida } = marcarTexto([texto], [true]);
  return saida[0] ? saida[0].join("") : texto;
}

// ── 4. Largura: a linha não pode passar da margem, senão o Word a quebra e o pareamento acaba ──

function larguraDoCaractere(caractere, estiloDaParte) {
  const tabela = estiloDaParte & ESTILO.grifo ? LARGURAS.negritoItalico : LARGURAS.normal;
  const largura = tabela.get(caractere.codePointAt(0));
  const base = largura ?? 1000;
  return estiloDaParte & (ESTILO.sobrescrito | ESTILO.subscrito) ? base * 0.65 : base;
}

export function temNaFonte(caractere) {
  return LARGURAS.normal.has(caractere.codePointAt(0));
}

function medir(partes, tamanho) {
  let total = 0;
  let caracteres = 0;
  for (const parte of partes) {
    for (const caractere of parte.texto) {
      total += larguraDoCaractere(caractere, parte.estilo);
      caracteres += 1;
    }
  }
  return { pontos: (total * tamanho) / 1000, caracteres };
}

// Decide quanto apertar a linha (em vigésimos de ponto por caractere) ou, se não bastar,
// que tamanho de fonte usar nela.
function ajustarLargura(partes, formato, util) {
  const { pontos, caracteres } = medir(partes, formato.tamanho);
  if (pontos <= util || !caracteres) return { pontos, condensar: 0, tamanho: formato.tamanho };
  const porCaractere = (pontos - util) / caracteres;
  if (porCaractere <= formato.condensacaoMaxima) {
    return { pontos, condensar: Math.ceil(porCaractere * 20), tamanho: formato.tamanho };
  }
  // Fonte menor e o aperto máximo, em meio ponto (a unidade do Word).
  const aperto = formato.condensacaoMaxima * caracteres;
  let tamanho = formato.tamanho;
  while (tamanho > 8 && (pontos * tamanho) / formato.tamanho - aperto > util) tamanho -= 0.5;
  return { pontos, condensar: formato.condensacaoMaxima * 20, tamanho };
}

// O motor guarda o caractere sem cela como o byte do Windows (0x93 para “, por exemplo).
const CP1252 = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
function legivel(caractere) {
  const codigo = caractere?.codePointAt(0);
  if (codigo >= 0x80 && codigo <= 0x9f) return CP1252[codigo - 0x80];
  return caractere ?? "?";
}

// ── 5. Montagem ─────────────────────────────────────────────────────────────────────────────

function juntarPartes(partes) {
  const juntas = [];
  for (const parte of partes) {
    if (!parte.texto) continue;
    const ultima = juntas[juntas.length - 1];
    if (ultima && ultima.estilo === parte.estilo) ultima.texto += parte.texto;
    else juntas.push({ ...parte });
  }
  return juntas;
}

// A tinta de uma faixa de texto: o que está fora dos trechos (espaços de recuo e centralização,
// hífen do corte) vem da própria faixa; o que está dentro vem do texto, já convertido.
function partesDaFaixa(faixa, linhas, marcado, cobertos) {
  const partes = [];
  let ponteiro = 0;
  for (const trecho of faixa.trechos || []) {
    if (trecho.coluna > ponteiro) partes.push({ texto: faixa.tinta.slice(ponteiro, trecho.coluna), estilo: 0 });
    const saida = marcado.saida[trecho.linha];
    const estilo = marcado.estilo[trecho.linha];
    const texto = linhas[trecho.linha];
    for (let coluna = trecho.de; coluna < trecho.ate; coluna += 1) {
      cobertos[trecho.linha][coluna] = 1;
      const pedaco = saida ? saida[coluna] : texto[coluna];
      if (!pedaco) continue;
      partes.push({ texto: pedaco === "\t" ? "    " : pedaco, estilo: estilo ? estilo[coluna] : 0 });
    }
    ponteiro = trecho.fim;
  }
  if (ponteiro < faixa.tinta.length) partes.push({ texto: faixa.tinta.slice(ponteiro), estilo: 0 });
  return juntarPartes(partes);
}

export function montarTinta(linhas, opcoes, formatoTinta = {}) {
  const formato = { ...FORMATO_TINTA, ...formatoTinta };
  const paginacao = formatar(linhas, opcoes, false);
  const faixas = montarFaixas(linhas, paginacao, opcoes);
  const fixas = marcasPorLinha(linhas).map((marcas) => marcas.includes("F-"));
  const marcado = marcarTexto(linhas, fixas);
  const cobertos = linhas.map((linha) => new Uint8Array(linha.length));
  const util = (formato.larguraCm - formato.margemEsquerdaCm - formato.margemDireitaCm) * PT_POR_CM;

  const paginas = [];
  const ondeEsta = new Map(); // linha do texto → [{ de, ate, pagina, linha }]
  const avisos = [];
  let paginaAtual = null;

  for (const faixa of faixas) {
    if (faixa.tipo !== "texto" && faixa.tipo !== "branco" && faixa.tipo !== "cabecalho") continue;
    if (!paginaAtual || paginaAtual.indice !== faixa.pagina) {
      const estrutura = paginacao.estrutura?.[faixa.pagina];
      paginaAtual = { indice: faixa.pagina, numero: estrutura?.numeroTexto || String(faixa.pagina + 1), linhas: [] };
      paginas.push(paginaAtual);
    }
    const numeroNaPagina = paginaAtual.linhas.length + 1;
    let partes;
    if (faixa.tipo === "texto") {
      partes = partesDaFaixa(faixa, linhas, marcado, cobertos);
      for (const trecho of faixa.trechos || []) {
        if (!ondeEsta.has(trecho.linha)) ondeEsta.set(trecho.linha, []);
        ondeEsta.get(trecho.linha).push({ de: trecho.de, ate: trecho.ate, pagina: paginaAtual.numero, folha: paginaAtual.indice + 1, linha: numeroNaPagina });
      }
    } else if (faixa.tipo === "cabecalho") {
      partes = faixa.tinta ? [{ texto: converterAvulso(faixa.tinta), estilo: 0 }] : [];
    } else {
      partes = [];
    }
    const texto = partes.map((parte) => parte.texto).join("");
    const ajuste = ajustarLargura(partes, formato, util);
    const linha = { tipo: faixa.tipo, partes, texto, origem: faixa.linha ?? null, ...ajuste };
    paginaAtual.linhas.push(linha);

    const onde = { pagina: paginaAtual.numero, folha: paginaAtual.indice + 1, linha: numeroNaPagina };
    const semCela = [...new Set((faixa.braille || []).filter((cela) => cela.aviso).map((cela) => legivel(cela.origem)))];
    if (semCela.length) {
      avisos.push({ ...onde, gravidade: "erro", tipo: "braille", texto: `sem cela braille para ${semCela.map((c) => `“${c}”`).join(" ")}: o braille saiu com uma cela cheia (⠿) no lugar` });
    }
    const suspeitos = [...new Set(texto.match(SUSPEITOS) || [])];
    if (suspeitos.length) {
      avisos.push({ ...onde, gravidade: "aviso", tipo: "codigo", texto: `código braille sem equivalente em tinta (${suspeitos.join(" ")}): “${texto.trim()}”` });
    }
    if (ajuste.tamanho < formato.tamanho) {
      avisos.push({ ...onde, gravidade: "aviso", tipo: "largura", texto: `linha larga demais: saiu em ${ajuste.tamanho} pt para caber na margem` });
    } else if (ajuste.condensar) {
      avisos.push({ ...onde, gravidade: "info", tipo: "largura", texto: `linha apertada em ${(ajuste.condensar / 20).toFixed(2)} pt por letra para caber na margem` });
    }
  }

  // Os avisos do texto ganham página e linha braille.
  for (const aviso of marcado.avisos) {
    const lugar = (ondeEsta.get(aviso.linha) || []).find((item) => aviso.coluna >= item.de && aviso.coluna < item.ate);
    if (!lugar) continue;
    avisos.push({ pagina: lugar.pagina, folha: lugar.folha, linha: lugar.linha, gravidade: "aviso", tipo: aviso.tipo, texto: aviso.texto });
  }

  // Conferência de cobertura: todo caractere visível do texto que gerou braille está na tinta.
  for (const [numero] of ondeEsta) {
    const texto = linhas[numero];
    for (let coluna = 0; coluna < texto.length; coluna += 1) {
      if (cobertos[numero][coluna] || /\s/.test(texto[coluna])) continue;
      const { pagina, folha, linha } = ondeEsta.get(numero)[0];
      avisos.push({ pagina, folha, linha, gravidade: "erro", tipo: "cobertura", texto: `texto que não entrou na tinta: “${texto.slice(coluna, coluna + 20)}”` });
      break;
    }
  }

  const maxLinhas = Math.max(1, ...paginas.map((pagina) => pagina.linhas.length));
  const altura = (formato.alturaCm - formato.margemSuperiorCm - formato.margemInferiorCm) * PT_POR_CM;
  const entrelinha = Math.min(formato.tamanho * 1.5, Math.floor((altura / maxLinhas) * 20) / 20);
  if (entrelinha < formato.tamanho * 1.15) {
    avisos.push({ pagina: null, linha: null, gravidade: "aviso", tipo: "pagina", texto: `${maxLinhas} linhas por página deixam só ${entrelinha} pt de entrelinha para fonte ${formato.tamanho}: as letras podem encostar` });
  }

  const ordem = { erro: 0, aviso: 1, info: 2 };
  avisos.sort((a, b) => (ordem[a.gravidade] - ordem[b.gravidade]) || ((a.folha ?? 0) - (b.folha ?? 0)) || ((a.linha ?? 0) - (b.linha ?? 0)));
  return { formato, paginas, entrelinha, util, avisos };
}

// Relatório em texto simples, para mostrar e salvar.
export function relatorioTinta(tinta, conferencia = null) {
  const linhasRel = [];
  const conta = (gravidade) => tinta.avisos.filter((aviso) => aviso.gravidade === gravidade).length;
  const totalLinhas = tinta.paginas.reduce((soma, pagina) => soma + pagina.linhas.length, 0);
  linhasRel.push(`Tinta: ${tinta.paginas.length} páginas, ${totalLinhas} linhas, uma por linha braille.`);
  if (conferencia) {
    linhasRel.push(conferencia.ok
      ? "Conferência do .docx: cada página e cada linha do arquivo batem com o braille."
      : `Conferência do .docx FALHOU: ${conferencia.motivo}`);
  }
  linhasRel.push(`${conta("erro")} erro(s), ${conta("aviso")} aviso(s), ${conta("info")} linha(s) apertada(s) para caber na margem.`);
  linhasRel.push("");
  const nomes = { erro: "ERRO", aviso: "aviso", info: "info" };
  for (const aviso of tinta.avisos) {
    const lugar = aviso.pagina == null ? "geral" : `folha ${aviso.folha} (pág. ${aviso.pagina}), linha ${aviso.linha}`;
    linhasRel.push(`[${nomes[aviso.gravidade]}] ${lugar}: ${aviso.texto}`);
  }
  return linhasRel.join("\n");
}

export { marcarTexto, converterAvulso };
