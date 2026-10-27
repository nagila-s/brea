const VOGAIS = "aáàâãäeéèêëiíìîïoóòôõöuúùûüyýỳ";
const FORTES = "aáàâäeéèêëoóòôöã";
const SEMI = "iu";
const GRUPOS = new Set([
  "bl", "br", "cl", "cr", "dr", "fl", "fr", "gl", "gr", "pl", "pr", "tl", "tr", "vl", "vr",
  "ch", "lh", "nh", "ps", "tz",
]);

function base(ch) {
  return ch.toLowerCase();
}

function vogal(ch, indice, chars) {
  const c = base(ch);
  if (c === "y") {
    const proximo = chars[indice + 1];
    return !(proximo && vogal(proximo, indice + 1, chars));
  }
  if (c === "u" && indice > 0) {
    const anterior = base(chars[indice - 1]);
    const proximo = chars[indice + 1] ? base(chars[indice + 1]) : "";
    if ((anterior === "q" || anterior === "g") && "eéiíêî".includes(proximo)) return false;
  }
  return VOGAIS.includes(c);
}

function ditongo(a, b, depois) {
  const x = base(a);
  const y = base(b);
  const segue = (depois || "").toLowerCase();
  if (/[íìîïúùûüý]/.test(b)) return false;
  if (x === "u" && y === "i" && segue.startsWith("ção")) return false;
  if ((x === "e" || x === "o") && y === "i" && segue.startsWith("n") && segue[1] && !VOGAIS.includes(segue[1])) {
    return false;
  }
  if (FORTES.includes(x) && SEMI.includes(y)) return true;
  if ((x === "ã" || x === "õ") && (y === "o" || y === "e")) return true;
  if (x === "u" && SEMI.includes(y)) return true;
  return false;
}

function partirGrupo(grupo, anterior, depois) {
  const letras = [...grupo];
  const saida = [];
  let i = 0;
  if (
    (anterior === "q" || anterior === "g") &&
    letras[0] &&
    base(letras[0]) === "u" &&
    letras[1] &&
    "aáoóâôãõ".includes(base(letras[1]))
  ) {
    saida.push(letras[0] + letras[1]);
    i = 2;
  }
  while (i < letras.length) {
    const resto = letras.slice(i + 2).join("") + depois;
    if (letras[i + 1] && ditongo(letras[i], letras[i + 1], resto)) {
      saida.push(letras[i] + letras[i + 1]);
      i += 2;
    } else {
      saida.push(letras[i]);
      i += 1;
    }
  }
  return saida;
}

function atomos(palavra) {
  const chars = [...palavra];
  const saida = [];
  for (let i = 0; i < chars.length; i += 1) {
    const c = base(chars[i]);
    const proximo = chars[i + 1] ? base(chars[i + 1]) : "";
    if ((c === "q" || c === "g") && proximo === "u") {
      const seguinte = chars[i + 2] ? base(chars[i + 2]) : "";
      if ("eéiíêî".includes(seguinte)) {
        saida.push({ tipo: "c", texto: chars[i] + chars[i + 1] });
        i += 1;
        continue;
      }
    }
    saida.push({ tipo: vogal(chars[i], i, chars) ? "v" : "c", texto: chars[i] });
  }
  return saida;
}

function corte(consoantes, nucleoSeguinte, consoantesDepois) {
  if (!consoantes.length) return 0;
  const texto = consoantes.map((item) => item.texto).join("").toLowerCase();
  const par = texto.slice(-2);
  const psJunto =
    par === "ps" &&
    nucleoSeguinte &&
    base([...nucleoSeguinte][0]) === "i" &&
    consoantesDepois.length > 0;
  if (consoantes.length >= 2 && GRUPOS.has(par) && (par !== "ps" || psJunto)) return consoantes.length - 2;
  return consoantes.length - 1;
}

function temAcento(texto) {
  return /[áéíóúâêôãõàäëïöüý]/i.test(texto);
}

function excecoes(silabas) {
  if (silabas.length < 2) return silabas;
  const ultima = silabas[silabas.length - 1];
  const penultima = silabas[silabas.length - 2];
  const anterior = silabas[silabas.length - 3] || "";
  const junta =
    (penultima.toLowerCase() === "ci" && ultima.toLowerCase().endsWith("a")) ||
    (["pi", "ri"].includes(penultima.toLowerCase()) &&
      ultima.toLowerCase().endsWith("a") &&
      temAcento(anterior)) ||
    (penultima.toLowerCase() === "pi" && ultima.toLowerCase().endsWith("o"));
  if (!junta) return silabas;
  silabas.splice(-2, 2, penultima + ultima);
  return silabas;
}

function silabarParte(palavra) {
  const pecas = atomos(palavra);
  if (!pecas.length) return [];
  const grupos = [];
  let i = 0;
  while (i < pecas.length) {
    if (pecas[i].tipo !== "v") {
      i += 1;
      continue;
    }
    const inicio = i;
    while (i < pecas.length && pecas[i].tipo === "v") i += 1;
    const grupo = pecas.slice(inicio, i).map((item) => item.texto).join("");
    const anterior = inicio > 0 ? base(pecas[inicio - 1].texto.slice(-1)) : "";
    const depois = pecas.slice(i).map((item) => item.texto).join("");
    let local = 0;
    for (const parte of partirGrupo(grupo, anterior, depois)) {
      const indices = [];
      let texto = "";
      while (texto !== parte) {
        indices.push(inicio + local);
        texto += pecas[inicio + local].texto;
        local += 1;
      }
      grupos.push(indices);
    }
  }
  if (!grupos.length) return [palavra];

  const silabas = grupos.map(() => "");
  for (let k = 0; k < grupos[0][0]; k += 1) silabas[0] += pecas[k].texto;
  for (let n = 0; n < grupos.length; n += 1) {
    for (const indice of grupos[n]) silabas[n] += pecas[indice].texto;
    const fim = grupos[n][grupos[n].length - 1];
    const proximo = n + 1 < grupos.length ? grupos[n + 1][0] : pecas.length;
    const meio = pecas.slice(fim + 1, proximo);
    if (n === grupos.length - 1) {
      silabas[n] += meio.map((item) => item.texto).join("");
      continue;
    }
    const seguinte = grupos[n + 1].map((indice) => pecas[indice].texto).join("");
    const depoisDoSeguinte = n + 2 < grupos.length ? grupos[n + 2][0] : pecas.length;
    const ponte = pecas.slice(grupos[n + 1][grupos[n + 1].length - 1] + 1, depoisDoSeguinte);
    const quebra = corte(meio, seguinte, ponte);
    silabas[n] += meio.slice(0, quebra).map((item) => item.texto).join("");
    silabas[n + 1] += meio.slice(quebra).map((item) => item.texto).join("");
  }
  return silabas;
}

export function silabar(palavra) {
  if (!palavra) return [];
  if (/\d/.test(palavra)) return [palavra];
  if (!palavra.includes("-")) return excecoes(silabarParte(palavra));
  return palavra.split("-").flatMap((parte) => (parte ? excecoes(silabarParte(parte)) : []));
}

export function prefixos(palavra, separar) {
  if (!separar || !palavra) return [{ texto: palavra, hifen: false }];
  const silabas = silabar(palavra);
  const prefs = [];
  let acc = "";
  let cursor = 0;
  for (let i = 0; i < silabas.length; i += 1) {
    acc += silabas[i];
    cursor += silabas[i].length;
    const ultimo = i === silabas.length - 1;
    if (!ultimo && palavra[cursor] === "-") {
      acc += "-";
      cursor += 1;
      prefs.push({ texto: acc, hifen: false });
    } else {
      prefs.push({ texto: acc, hifen: !ultimo });
    }
  }
  return prefs.length ? prefs : [{ texto: palavra, hifen: false }];
}
