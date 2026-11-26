// Tinta fiel ao braille: a versão em fonte ampliada que acompanha o livro, linha a linha e
// página a página. Função pura: não toca no DOM.
//
// A tinta NÃO é traduzida de volta a partir das celas, ao contrário do "Tinta no Word" antigo:
// braille não tem volta única (⠢ é "?" e "5", ⠖ é "!" e "+", ⠒⠕ é ":o" e ":>"...). Aqui cada
// linha braille leva o pedaço do texto de origem que a gerou (faixas.js, pelas fontes `de`/`ate`
// de cada cela). Por isso quebra, hífen, recuo, centralização, cabeçalho e página são os do
// braille por construção, e os caracteres são os do texto que a pessoa digitou.
//
// Sobra um passo: o texto digitado mistura português com códigos digitados em braille (`(C`),
// _y, :o, õo, *grifo*...). Esses códigos são lidos no TEXTO, onde não há ambiguidade, e viram
// o símbolo de tinta pela tabela CODIGOS. O que não dá para decidir com segurança vai para o
// relatório, com página e linha.

import { formatar } from "./pagina.js?edicao=34";
import { montarFaixas, marcasPorLinha } from "./faixas.js?edicao=35";
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

// ── 1. Códigos do texto → tinta ─────────────────────────────────────────────────────────────
// Cada regra é testada na posição exata (flag y). A primeira que casa vence, por isso as mais
// longas vêm antes. `tinta` é o texto que entra no lugar; `estilo` marca o resultado;
// `conferir` manda a ocorrência para o relatório mesmo tendo sido convertida.

const TREMA = { a: "ä", e: "ë", i: "ï", o: "ö", u: "ü", A: "Ä", E: "Ë", I: "Ï", O: "Ö", U: "Ü" };
const GRAVE = { a: "à", e: "è", i: "ì", o: "ò", u: "ù", A: "À", E: "È", I: "Ì", O: "Ò", U: "Ù" };
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
  // A produção usa o círculo cheio (●) para o círculo e para os marcadores de lista.
  { nome: "círculo", padrao: /õo|<>/y, tinta: "●" },
  { nome: "marcador", padrao: /•/y, tinta: "●" },
  // Aspas simples digitadas em braille: ý seguido de aspas. Abre no começo da palavra.
  { nome: "abre aspas simples", padrao: /(?<=^|[\s(\[—“"‘])ý["“”]/y, tinta: "‘" },
  { nome: "fecha aspas simples", padrao: /ý["“”]/y, tinta: "’" },
  // "_y9:", "_y12:"... não é o quadrado: fica como está, como sempre ficou na tinta.
  { nome: "quadrado com número", padrao: /_y(?=\d)/y, tinta: "_y" },
  { nome: "quadrado", padrao: /_y/y, tinta: "□" },
  { nome: "eñe", padrao: /~([nN])/y, tinta: (m) => (m[1] === "n" ? "ñ" : "Ñ") },
  { nome: "delimitador informático", padrao: /~,/y, tinta: "" },
  { nome: "translineação", padrao: /~(?=\s*$)/y, tinta: "" },
  { nome: "trema", padrao: /¬([aeiouAEIOU])/y, tinta: (m) => TREMA[m[1]] },
  // "Ni?ede", "(**) ?e é igual ao e com acento grave": "?" colado na vogal é o acento grave.
  { nome: "acento grave", padrao: /\?([aeiouAEIOU])/y, tinta: (m) => GRAVE[m[1]] },
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
  // A produção escreve as dimensões com a letra x (200x7 m), também quando o texto tem ×.
  { nome: "sinal de vezes", padrao: /×/y, tinta: "x" },
  { nome: "expoente", padrao: /â(\d+)/y, tinta: (m) => m[1], estilo: ESTILO.sobrescrito },
  { nome: "índice inferior", padrao: /í(\d+)/y, tinta: (m) => m[1], estilo: ESTILO.subscrito },
];

// ── 1b. Lista de símbolos braille ───────────────────────────────────────────────────────────
// A lista que abre os livros traz, em cada linha, o código braille e a descrição. Na tinta, o
// código vira o símbolo em tinta; os sinais que só existem no braille aparecem pelos números
// dos pontos. Uma linha só entra aqui quando começa com o código, seguido de espaço e de uma
// descrição que começa como a da tabela, então o resto do livro não é afetado.
// [código, começo da descrição, tinta, tinta da linha seguinte (continuação da descrição)]
export const LISTA_DE_SIMBOLOS = [
  ["é,", "vírgula", ","],
  ["é;", "ponto e vírgula", ";"],
  ["é:", "dois-pontos", ":"],
  ["é.", "apóstrofo", "’ ."],
  ["é?", "ponto de interrogação", "?"],
  ["é!", "ponto de exclamação", "!"],
  ["é...", "reticências", "..."],
  ["é-", "hífen", "-"],
  ["é--", "travessão", "—"],
  ["õo", "círculo", "●"],
  ["_y", "quadrado", "■"],
  ["ê ã ou ê' ýã", "abre e fecha", "( )"],
  ["á ú ou á' ýú", "abre e fecha", "[ ]"],
  ["~l _,", "abre e fecha chaves", "{ }"],
  ["éý,", "tal que", "/"],
  ['é"', "abre e fecha aspas", "“ ”"],
  ['éý"', "abre e fecha aspas simples", "‘ ’"],
  ["é*", "asterisco", "*"],
  ["ç", '"e" comercial', "&"],
  ["éý,", "barra", "/"],
  ["é_", "barra vertical", "|"],
  ["éÿ", "barra no contexto informático", "/"],
  ["é~'", "barra invertida", "\\"],
  [":o", "seta para a direita", "→"],
  ["õ:", "seta para a esquerda", "←"],
  ["õ:o", "seta de duplo sentido", "↔"],
  ["ý?", "seta para cima", "↑"],
  ["l", "seta para baixo", "↓"],
  ["éû", "arroba", "@"],
  ["é^e", "euro", "€"],
  ["é$", "cifrão", "$"],
  ["_}", "por cento", "%"],
  ["_}}", "por mil", "‰"],
  ["ss", "parágrafo", "§"],
  ["é!", "mais", "+"],
  ["é-", "menos", "-"],
  ['é" ou é.', "multiplicado por", "x ou ."],
  ["éÿ", "dividido por", "÷"],
  ["éÿ ou é~ÿ", "traço de fração", "─ ou /"],
  ["é=", "igual a", "="],
  ["éo", "maior que", ">"],
  ["éõ", "menor que", "<"],
  ['éý"', "polegada", "″"],
  ["é}", "grau", "°"],
  ["ü", "minuto", "′"],
  ["üü", "segundo", "″"],
  ["#k", "hashtag", "#"],
  ['{"', "versus", "x"],
  ["{õ", "estrela", "★"],
  ["w,", "cruz latina", "✝"],
  ["õow,", "sexo feminino", "♀"],
  ["õo:o", "sexo masculino", "♂"],
  ["õoÿh", "transgênero", "⚧"],
  ["`(R`)", "marca registrada", "®"],
  ["?í", "sinal de verificação", "✓"],
  // Sinais exclusivos da escrita braille: os pontos.
  ["é{", "maiúscula", "(46)"],
  ["é{{", "maiúscula em todas", "(46 46)"],
  ["é~", "minúscula latina", "(5)"],
  ["é$", "restituidor", "(56)"],
  ["#", "número", "(3456)"],
  ["éâ", "expoente", "(16)"],
  ["éí", "índice inferior", "(34)"],
  ["é*", "itálico", "(35)"],
  ["é$*", "variante tipográfica", "(56 35)"],
  ["é~,", "delimitador de contexto", "(52)"],
  ["_`[ _`]", "abre e fecha nota de", "(456 12356)", "(456 23456)"],
  ["? *", "abre e fecha parênteses", "(26 35)"],
];

const SEM_GRIFO = (texto) => texto.replaceAll("*", "").toLowerCase();

// Para cada linha do texto que é uma entrada da lista: { de, ate, tinta } do código e, na linha
// seguinte, o que entra antes da descrição continuada. O desenho da seta para baixo (linhas
// " l" e "^i" em volta da entrada) some da tinta.
function marcarListaDeSimbolos(linhas) {
  const achados = new Map();
  const setas = [];
  for (let numero = 0; numero < linhas.length; numero += 1) {
    const texto = linhas[numero];
    if (texto.length > 120 || texto.trimStart().startsWith("<")) continue;
    const de = texto.length - texto.trimStart().length;
    const resto = texto.slice(de);
    for (const [codigo, descricao, tinta, seguinte] of LISTA_DE_SIMBOLOS) {
      if (!resto.startsWith(codigo)) continue;
      const depois = resto.slice(codigo.length);
      const espacos = depois.length - depois.trimStart().length;
      if (!espacos || !SEM_GRIFO(depois.trimStart()).startsWith(descricao)) continue;
      achados.set(numero, { de, ate: de + codigo.length, tinta });
      if (descricao.startsWith("seta para")) setas.push(numero);
      const proxima = linhas[numero + 1];
      if (seguinte && proxima && /^\s+\S/.test(proxima) && !proxima.trimStart().startsWith("<")) {
        const coluna = proxima.length - proxima.trimStart().length;
        achados.set(numero + 1, { de: coluna, ate: coluna, tinta: `${seguinte}  ` });
      }
      break;
    }
  }
  for (const numero of setas) {
    for (let outra = numero - 2; outra <= numero + 2; outra += 1) {
      if (outra < 0 || outra >= linhas.length || achados.has(outra)) continue;
      const solta = linhas[outra].trim();
      if (solta === "l" || solta === "^i") achados.set(outra, { de: 0, ate: linhas[outra].length, tinta: "" });
    }
  }
  return achados;
}

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
// fecha um no fim de palavra. O par pode atravessar linhas e comandos (o <P> de uma página
// diagramada), mas não uma linha vazia nem um trecho de formatação fixa (<F->, onde * é
// desenho; lá só vale o par na mesma linha). Asterisco sem par fica como está e vai para o
// relatório: na tinta, ele deixaria o resto em itálico.

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

// Só a linha vazia fecha o grifo: os comandos no meio (o <P> da página, <R±>, <54>...) não
// interrompem o texto, e o livro diagramado parte frases entre páginas.
function fimDeParagrafo(linha) {
  return !linha.trim();
}

const ehComando = (linha) => linha.trimStart().startsWith("<");

// Os pares de grifo do texto: `abre` e `fecha` são as marcas ({ linha, de, ate }, com o "$"
// quando é o grifo duplo "$*"); o grifado fica entre abre.ate e fecha.de. `ignorar` são os
// trechos da lista de símbolos, onde o "*" é o próprio símbolo. Serve à tinta e ao editor.
export function parearGrifos(linhas, fixas = [], ignorar = new Map()) {
  const pares = [];
  const avisos = [];
  const usados = new Set();
  for (let numero = 0; numero < linhas.length; numero += 1) {
    const texto = linhas[numero];
    if (!texto.includes("*") || texto.trimStart().startsWith("<")) continue;
    // No <F-> o asterisco costuma ser desenho: só vale o grifo aberto e fechado na mesma
    // linha, e o que sobra fica como está, sem aviso.
    const fixa = fixas[numero];
    const codigo = ignorar.get(numero);
    for (let coluna = texto.indexOf("*"); coluna >= 0; coluna = texto.indexOf("*", coluna + 1)) {
      if (usados.has(`${numero}:${coluna}`)) continue;
      if (codigo && coluna >= codigo.de && coluna < codigo.ate) continue;
      // "?*": os parênteses auxiliares vazios (?...*), não um grifo.
      if (texto[coluna - 1] === "?") continue;
      if (!podeAbrir(texto, coluna)) {
        // "**" e "***" são asteriscos de verdade, por exemplo a nota (**).
        if (fixa || texto[coluna - 1] === "*" || texto[coluna + 1] === "*") continue;
        avisos.push({ linha: numero, coluna, tipo: "grifo", texto: "asterisco sem par: ficou como “*”" });
        continue;
      }
      const fecho = procurarFecho(linhas, fixas, numero, coluna + 1);
      if (!fecho) {
        if (!fixa) avisos.push({ linha: numero, coluna, tipo: "grifo", texto: "grifo aberto e não fechado: o “*” ficou como está" });
        continue;
      }
      usados.add(`${fecho.linha}:${fecho.coluna}`);
      const duplo = texto[coluna - 1] === "$";
      const fechaDuplo = duplo && linhas[fecho.linha][fecho.coluna - 1] === "$";
      pares.push({
        abre: { linha: numero, de: duplo ? coluna - 1 : coluna, ate: coluna + 1 },
        fecha: { linha: fecho.linha, de: fechaDuplo ? fecho.coluna - 1 : fecho.coluna, ate: fecho.coluna + 1 },
        duplo,
      });
      // Fechou mais adiante: o resto desta linha já está dentro do grifo.
      coluna = fecho.linha === numero ? fecho.coluna : texto.length;
    }
  }
  return { pares, avisos };
}

// ── 3. Marcação do texto inteiro ────────────────────────────────────────────────────────────
// Para cada linha do texto: `saida[c]` é o que o caractere da coluna c vira na tinta (o código
// inteiro fica na primeira coluna dele, as outras viram ""), `estilo[c]` é o estilo.
// Linhas sem nada a mudar ficam null.

function marcarTexto(linhas, fixas) {
  const lista = marcarListaDeSimbolos(linhas);
  const saida = new Array(linhas.length).fill(null);
  const estilo = new Array(linhas.length).fill(null);
  const avisos = [];
  const garantir = (numero) => {
    if (!saida[numero]) {
      saida[numero] = Array.from({ length: linhas[numero].length }, (_, coluna) => linhas[numero][coluna]);
      estilo[numero] = new Uint8Array(linhas[numero].length);
    }
  };

  // Grifo primeiro: os asteriscos (e o "$" do grifo duplo) somem e o que fica entre eles
  // ganha o estilo.
  const grifos = parearGrifos(linhas, fixas, lista);
  avisos.push(...grifos.avisos);
  for (const par of grifos.pares) {
    for (const marca of [par.abre, par.fecha]) {
      garantir(marca.linha);
      for (let c = marca.de; c < marca.ate; c += 1) saida[marca.linha][c] = "";
    }
    for (let atual = par.abre.linha; atual <= par.fecha.linha; atual += 1) {
      garantir(atual);
      const de = atual === par.abre.linha ? par.abre.ate : 0;
      const ate = atual === par.fecha.linha ? par.fecha.de : linhas[atual].length;
      for (let c = de; c < ate; c += 1) estilo[atual][c] |= ESTILO.grifo;
    }
  }

  // Num endereço da internet, o "~" é a translineação (o ponto onde o braille pode partir o
  // endereço), não o ñ: some da tinta.
  for (let numero = 0; numero < linhas.length; numero += 1) {
    const texto = linhas[numero];
    if (!texto.includes("~") || texto.trimStart().startsWith("<")) continue;
    for (const endereco of texto.matchAll(/\S*(?:https?:|www\.)\S*/g)) {
      for (let coluna = endereco.index; coluna < endereco.index + endereco[0].length; coluna += 1) {
        if (texto[coluna] !== "~") continue;
        garantir(numero);
        saida[numero][coluna] = "";
      }
    }
  }

  // Depois os códigos, em todas as linhas que não são comando.
  for (let numero = 0; numero < linhas.length; numero += 1) {
    const texto = linhas[numero];
    if (texto.trimStart().startsWith("<")) continue;
    for (let coluna = 0; coluna < texto.length; coluna += 1) {
      if (saida[numero] && saida[numero][coluna] === "" && texto[coluna] === "~") continue;
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

  // Por último a lista de símbolos: o código inteiro dá lugar ao símbolo em tinta.
  for (const [numero, { de, ate, tinta }] of lista) {
    garantir(numero);
    for (let coluna = de; coluna < ate; coluna += 1) {
      saida[numero][coluna] = "";
      estilo[numero][coluna] = 0;
    }
    if (ate > de) saida[numero][de] = tinta;
    else if (de < linhas[numero].length) saida[numero][de] = tinta + saida[numero][de];
  }
  return { saida, estilo, avisos, lista };
}

function procurarFecho(linhas, fixas, numero, inicio) {
  let ultima = fixas[numero] ? numero : numero + MAX_LINHAS_GRIFO;
  for (let atual = numero; atual < linhas.length && atual <= ultima; atual += 1) {
    const texto = linhas[atual];
    if (atual > numero && ehComando(texto)) {
      ultima += 1;
      continue;
    }
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
    if (parte.tab) {
      juntas.push({ ...parte });
      continue;
    }
    if (!parte.texto) continue;
    const ultima = juntas[juntas.length - 1];
    if (ultima && !ultima.tab && ultima.estilo === parte.estilo) ultima.texto += parte.texto;
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
  if (ponteiro < faixa.tinta.length) {
    // O hífen do corte dentro de um grifo sai grifado também.
    const resto = faixa.tinta.slice(ponteiro);
    const anterior = partes[partes.length - 1];
    const grifo = resto === "-" && anterior ? anterior.estilo & ESTILO.grifo : 0;
    partes.push({ texto: resto, estilo: grifo });
  }
  return juntarPartes(partes);
}

// ── 6. Ajustes de diagramação da tinta ──────────────────────────────────────────────────────
// O braille centraliza, separa e faz o pontilhado do sumário com celas; na tinta, com a
// Verdana (que não é monoespaçada), isso vira parágrafo centralizado, traço e tabulação.

const textoDas = (partes) => partes.map((parte) => parte.texto || "").join("");

// As partes entre as posições de e ate do texto (o estilo de cada pedaço é mantido).
function cortarPartes(partes, de, ate) {
  const saida = [];
  let posicao = 0;
  for (const parte of partes) {
    if (parte.tab) continue;
    const fim = posicao + parte.texto.length;
    const inicio = Math.max(de, posicao);
    const final = Math.min(ate, fim);
    if (final > inicio) saida.push({ ...parte, texto: parte.texto.slice(inicio - posicao, final - posicao) });
    posicao = fim;
  }
  return saida;
}

function semEspacosNasPontas(partes) {
  const texto = textoDas(partes);
  const de = texto.length - texto.trimStart().length;
  const ate = texto.trimEnd().length;
  return cortarPartes(partes, de, ate);
}

// Linha separadora: só ":" (e "•"). Cada par de ":" vira um travessão (a cela tem metade da
// largura do travessão na Verdana); o enfeite ":•:•:" troca cada ":" por um travessão.
// O enfeite pode vir como ":•:•:", ":●:●:" ou ":wr:wr:" (o círculo digitado em braille).
function separador(texto) {
  const miolo = texto.trim();
  if (!/^(?::|•|●|wr)+$/.test(miolo) || (miolo.match(/:/g) || []).length < 3) return null;
  const enfeite = miolo !== ":".repeat(miolo.length);
  const tinta = enfeite ? miolo.replaceAll(":", "—").replace(/wr|•/g, "●") : "—".repeat(Math.ceil(miolo.length / 2));
  return { tinta, centro: /^ {2,}/.test(texto) || enfeite };
}

// Sumário: "Título :::::::: 12" vira o título, a tabulação com pontilhado e o número.
const PONTILHADO = /^(.*?[^\s:])\s*:{3,}\s*(\S{1,8})\s*$/;

// Linha que já está no meio da linha braille (centralizada à mão com espaços, no <F->): a
// folga da esquerda e a da direita diferem em até 2 celas.
function noMeio(faixa, colunas) {
  const celas = faixa.braille || [];
  if (!colunas || !celas.length) return false;
  let esquerda = 0;
  while (esquerda < celas.length && celas[esquerda].tipo === "espaco") esquerda += 1;
  return esquerda >= 4 && esquerda < celas.length && Math.abs(esquerda - (colunas - celas.length)) <= 2;
}

function diagramar(partes, faixa, colunas) {
  const texto = textoDas(partes);
  const corte = separador(texto);
  if (corte) return { partes: [{ texto: corte.tinta, estilo: 0 }], alinhar: corte.centro ? "centro" : null };
  if (faixa.centro || noMeio(faixa, colunas)) return { partes: semEspacosNasPontas(partes), alinhar: "centro" };
  const sumario = texto.match(PONTILHADO);
  if (sumario) {
    const titulo = sumario[1];
    const numero = sumario[2];
    const inicioNumero = texto.trimEnd().length - numero.length;
    return {
      partes: [...cortarPartes(partes, 0, titulo.length), { texto: "", estilo: 0, tab: "pontilhado" }, ...cortarPartes(partes, inicioNumero, inicioNumero + numero.length)],
      alinhar: null,
    };
  }
  return { partes, alinhar: null };
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
      partes = faixa.tinta ? [{ texto: converterAvulso(faixa.tinta).trim(), estilo: 0 }] : [];
    } else {
      partes = [];
    }
    let alinhar = faixa.tipo === "cabecalho" ? "centro" : null;
    if (faixa.tipo === "texto") ({ partes, alinhar } = diagramar(partes, faixa, paginacao.estrutura?.[faixa.pagina]?.colunas));
    const texto = partes.map((parte) => parte.texto).join("");
    const ajuste = ajustarLargura(partes, formato, util);
    const linha = { tipo: faixa.tipo, partes, texto, origem: faixa.linha ?? null, alinhar, ...ajuste };
    paginaAtual.linhas.push(linha);

    const onde = { pagina: paginaAtual.numero, folha: paginaAtual.indice + 1, linha: numeroNaPagina };
    const semCela = [...new Set((faixa.braille || []).filter((cela) => cela.aviso).map((cela) => legivel(cela.origem)))];
    if (semCela.length) {
      avisos.push({ ...onde, gravidade: "erro", tipo: "braille", texto: `sem cela braille para ${semCela.map((c) => `“${c}”`).join(" ")}: o braille saiu com uma cela cheia (⠿) no lugar` });
    }
    // O símbolo que a lista de símbolos pôs na linha ("{ }", por exemplo) não é suspeito.
    let conferido = texto;
    for (const trecho of faixa.trechos || []) {
      const daLista = marcado.lista.get(trecho.linha)?.tinta;
      if (daLista) conferido = conferido.replace(daLista, "");
    }
    const suspeitos = [...new Set(conferido.match(SUSPEITOS) || [])];
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
