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

function desenharPareada(raiz, faixas, colunas) {
  raiz.style.setProperty("--colunas", String(colunas));
  const fragmento = document.createDocumentFragment();
  for (const faixa of faixas) {
    if (faixa.tipo === "comando" || faixa.tipo === "oculta") continue;
    fragmento.append(linhaDaFaixa(faixa));
  }
  raiz.replaceChildren(fragmento);
}

// Destaca as faixas da linha do texto em que está o cursor.
function marcarAtual(raiz, linha) {
  for (const anterior of raiz.querySelectorAll(".faixa.atual")) anterior.classList.remove("atual");
  let primeira = null;
  for (const faixa of raiz.children) {
    const de = faixa.dataset.de ?? faixa.dataset.linha;
    const ate = faixa.dataset.ate ?? faixa.dataset.linha;
    if (de == null) continue;
    if (Number(de) <= linha && linha <= Number(ate)) {
      faixa.classList.add("atual");
      primeira ??= faixa;
    }
  }
  return primeira;
}

export { desenharPareada, marcarAtual };
