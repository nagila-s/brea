import { paraDos, paraWindows } from "./oem.js";

if (paraWindows["\u00C6"] == null) paraWindows["\u00C6"] = "\u00E3";

function apararFim(linha) {
  let fim = linha.length;
  while (fim > 0 && linha[fim - 1] === " ") fim -= 1;
  return linha.slice(0, fim);
}

function dividirLinhas(linhas, maxCol) {
  const fila = linhas.map(apararFim);
  const limite = Math.max(1, maxCol);
  for (let i = 0; i < fila.length; i += 1) {
    const linha = fila[i];
    const espaco = linha.indexOf(" ") + 1;
    if (espaco > limite) {
      fila[i] = linha.slice(0, espaco);
      fila.splice(i + 1, 0, linha.slice(espaco).trim());
    } else if (linha.length > limite && espaco > 0) {
      let corte = "";
      for (let b = 1; b <= linha.length; b += 1) {
        if (linha[b - 1] === " " && b <= limite + 1) corte = linha.slice(0, b);
        if (b >= limite && corte) {
          fila[i] = corte;
          fila.splice(i + 1, 0, linha.slice(corte.length).trim());
          break;
        }
      }
    }
  }
  return fila;
}

function expandirTab(texto) {
  return texto.split("\n").map((linha) => {
    let saida = linha;
    for (let i = saida.length; i >= 1; i -= 1) {
      if (saida.charCodeAt(i - 1) === 9) saida = `${saida.slice(0, i - 1)}  ${saida.slice(i)}`;
    }
    return saida;
  }).join("\n");
}

function converter(texto, mapa) {
  return [...texto].map((caractere) => mapa[caractere] ?? caractere).join("");
}

function centrarPorEspacos(linha) {
  const miolo = linha.trim();
  if (!miolo) return "";
  return `${" ".repeat(12)}${miolo}`;
}

function centrarFisico(linha, colunas) {
  const miolo = linha.trim();
  if (!miolo) return "";
  if (miolo.length >= colunas) return miolo;
  return `${" ".repeat(Math.floor((colunas - miolo.length) / 2))}${miolo}`;
}

const MOLDURAS = {
  padrao: ["l", "_"],
  ajuda: ["ç", "y"],
  figura: ["õ", "o"],
};

function quadrinho(linhas, tipo) {
  const [esquerda, direita] = MOLDURAS[tipo] || MOLDURAS.padrao;
  const corpos = linhas.map((linha) => (tipo === "ajuda" && linha === "" ? "Peça orientação" : linha));
  const largura = Math.max(1, ...corpos.map((linha) => linha.length || 1));
  return corpos.map((linha) => {
    const folga = largura - (linha.length || 1) + 2;
    return `${esquerda}  ${linha}${" ".repeat(Math.max(0, folga))}${direita}`;
  });
}

export {
  apararFim,
  dividirLinhas,
  expandirTab,
  converter,
  paraDos,
  paraWindows,
  centrarPorEspacos,
  centrarFisico,
  quadrinho,
};
