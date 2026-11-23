// Vista pareada (etapa 2, só leitura): cada faixa vira uma linha com a tinta à esquerda e o
// braille à direita. As duas metades são a mesma linha do DOM, então rolam juntas sempre.

import { unicodeDaCela } from "./motor.js?edicao=26";

const NOMES_MARCAS = {
  "R+": "R+ recuo de dois",
  "F-": "F- sem auto-ajuste",
  "S-": "S- sem separação de sílabas",
  "I+": "I+ maiúsculas inglesas",
  M: "M margem",
};

const CLASSE_MARCA = { "R+": "r", "F-": "f", "S-": "s", "I+": "i", M: "m" };

function brailleDe(celas) {
  return celas.map((cela) => (cela.tipo === "espaco" ? "⠀" : unicodeDaCela(cela.dots))).join("");
}

// O "`" é o caractere de escape do Braille Fácil: aparece na tinta, mas não vira cela.
function tintaComEscapes(texto) {
  const fragmento = document.createDocumentFragment();
  const partes = texto.split("`");
  partes.forEach((parte, indice) => {
    if (indice > 0) {
      const escape = document.createElement("span");
      escape.className = "escape";
      escape.textContent = "`";
      fragmento.append(escape);
    }
    if (parte) fragmento.append(parte);
  });
  return fragmento;
}

function rotuloQuebra(faixa) {
  if (faixa.forcada) return "<P> quebra de página";
  if (faixa.motivo === "titulo") return "nova numeração";
  if (faixa.motivo === "medida") return "nova medida de página";
  return "quebra automática";
}

function linhaDaFaixa(faixa) {
  const linha = document.createElement("div");
  linha.className = `faixa faixa-${faixa.tipo}`;
  if (faixa.linha != null) linha.dataset.linha = String(faixa.linha);
  if (faixa.trechos?.length) {
    linha.dataset.de = String(faixa.trechos[0].linha);
    linha.dataset.ate = String(faixa.trechos[faixa.trechos.length - 1].linha);
  }

  if (faixa.tipo === "quebra") {
    linha.classList.add(faixa.forcada ? "forcada" : "automatica");
    const rotulo = document.createElement("span");
    rotulo.className = "rotulo-quebra";
    rotulo.textContent = rotuloQuebra(faixa);
    linha.append(rotulo);
    linha.title = rotuloQuebra(faixa);
    return linha;
  }

  const marcas = faixa.marcas || [];
  if (marcas.length) {
    linha.classList.add("marcada", `marca-${CLASSE_MARCA[marcas[0]]}`);
    linha.style.setProperty("--barras", String(marcas.length));
    linha.dataset.marcas = marcas.map((marca) => CLASSE_MARCA[marca]).join(" ");
    linha.title = marcas.map((marca) => NOMES_MARCAS[marca] || marca).join(" · ");
  }

  const barras = document.createElement("span");
  barras.className = "barras";
  for (const marca of marcas) {
    const barra = document.createElement("i");
    barra.className = `barra marca-${CLASSE_MARCA[marca]}`;
    barras.append(barra);
  }

  const tinta = document.createElement("span");
  tinta.className = "lado-tinta";
  tinta.append(tintaComEscapes(faixa.tinta || ""));

  const braille = document.createElement("span");
  braille.className = "lado-braille";
  braille.textContent = brailleDe(faixa.braille || []);

  if (faixa.tipo === "cabecalho") linha.title = "cabeçalho da página (não editável)";
  if (faixa.tipo === "comentario") linha.title = "comentário: não vai para o braille";
  linha.append(barras, tinta, braille);
  return linha;
}

// Assinatura do que a faixa mostra: duas faixas com a mesma assinatura usam o mesmo elemento.
function assinatura(faixa) {
  if (faixa.tipo === "comando" || faixa.tipo === "oculta") return null;
  const braille = faixa.braille ? faixa.braille.map((cela) => (cela.tipo === "espaco" ? "0" : cela.dots)).join(",") : "";
  return `${faixa.tipo}|${faixa.forcada ? 1 : 0}|${faixa.motivo ?? ""}|${(faixa.marcas || []).join(",")}|${faixa.tinta ?? ""}|${braille}`;
}

// Devolve, para cada faixa, o elemento desenhado (null para as linhas de código ocultas).
// Com o desenho anterior, só troca as faixas do meio que mudaram (o começo e o fim iguais
// ficam onde estão), para digitar num livro grande não recriar a página inteira.
function desenharPareada(raiz, faixas, colunas, anterior = null) {
  raiz.style.setProperty("--colunas", String(colunas));
  const novas = faixas.map(assinatura);
  const criar = (indice) => {
    if (novas[indice] == null) return null;
    const elemento = linhaDaFaixa(faixas[indice]);
    elemento.dataset.i = String(indice);
    return elemento;
  };

  if (!anterior || anterior.colunas !== colunas || !anterior.assinaturas) {
    const fragmento = document.createDocumentFragment();
    const elementos = faixas.map((_, indice) => {
      const elemento = criar(indice);
      if (elemento) fragmento.append(elemento);
      return elemento;
    });
    raiz.replaceChildren(fragmento);
    return { elementos, assinaturas: novas, colunas };
  }

  const velhas = anterior.assinaturas;
  let inicio = 0;
  while (inicio < novas.length && inicio < velhas.length && novas[inicio] === velhas[inicio]) inicio += 1;
  let fimNovo = novas.length - 1;
  let fimVelho = velhas.length - 1;
  while (fimNovo >= inicio && fimVelho >= inicio && novas[fimNovo] === velhas[fimVelho]) {
    fimNovo -= 1;
    fimVelho -= 1;
  }
  // Âncora: o primeiro elemento que fica, depois do trecho trocado.
  let ancora = null;
  for (let i = fimVelho + 1; i < velhas.length && !ancora; i += 1) ancora = anterior.elementos[i];
  for (let i = inicio; i <= fimVelho; i += 1) anterior.elementos[i]?.remove();
  const fragmento = document.createDocumentFragment();
  const meio = [];
  for (let i = inicio; i <= fimNovo; i += 1) {
    const elemento = criar(i);
    if (elemento) fragmento.append(elemento);
    meio.push(elemento);
  }
  raiz.insertBefore(fragmento, ancora);
  const elementos = [
    ...anterior.elementos.slice(0, inicio),
    ...meio,
    ...anterior.elementos.slice(fimVelho + 1),
  ];
  // Os índices das faixas depois do trecho mudaram de número.
  for (let i = fimNovo + 1; i < elementos.length; i += 1) if (elementos[i]) elementos[i].dataset.i = String(i);
  return { elementos, assinaturas: novas, colunas };
}

export { desenharPareada };
