function normalizar(texto) {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function classificar(linha) {
  const bruto = linha.trim();
  if (!/^<[^>\n]*>$/.test(bruto)) return null;
  const miolo = bruto.slice(1, -1).trim();
  if (/^\*{3}[\s\S]*\*{3}$/.test(miolo)) {
    return { tipo: "anotacao", rotulo: "anotação, não impressa" };
  }

  const corpo = miolo.replace(/^\*\s*/, "");
  const normal = normalizar(corpo);
  let medida = normal.match(/^(\d+) caracteres x (\d+) linhas$/);
  if (!medida) medida = normal.match(/^caracteres ?(\d+) ?x ?(\d+) ?linhas$/);
  if (medida) {
    return {
      tipo: "formato",
      colunas: Number(medida[1]),
      linhas: Number(medida[2]),
      rotulo: `página ${medida[1]}×${medida[2]}`,
    };
  }
  if (normal === "com interponto" || normal === "sem interponto") {
    return { tipo: "interponto", ligado: normal.startsWith("com"), rotulo: normal };
  }
  if (/^(com|sem) separacao de silabas$/.test(normal)) {
    const ligado = normal.startsWith("com");
    return {
      tipo: "silabas",
      ligado,
      rotulo: ligado ? "com separação de sílabas" : "sem separação de sílabas",
    };
  }

  if (/^\d+$/.test(corpo)) {
    return { tipo: "transpaginacao", numero: corpo, rotulo: `página em tinta ${corpo}` };
  }

  const letra = corpo.match(/^([a-zA-Z])(.*)$/);
  if (!letra) return { tipo: "desconhecido", rotulo: bruto };
  const op = letra[1].toUpperCase();
  const resto = letra[2];

  if (op === "P" && resto.trim() === "") return { tipo: "quebra", rotulo: "quebra de página" };
  if (op === "F" && resto === "+") return { tipo: "ajuste", ligado: true, rotulo: "auto-ajuste ligado" };
  if (op === "F" && resto === "-") return { tipo: "ajuste", ligado: false, rotulo: "auto-ajuste desligado" };
  if (op === "F" && resto === "*") return { tipo: "estrangeiro", rotulo: "trecho musical ou estrangeiro" };
  if (op === "T" && resto === "-") return { tipo: "titulo", modo: "off", rotulo: "sem título de página" };
  if (op === "T" && resto === "+") return { tipo: "titulo", modo: "on", rotulo: "título de página" };
  if (op === "T" && /^\*\d+$/.test(resto)) {
    return {
      tipo: "titulo",
      modo: "numero",
      numero: Number(resto.slice(1)),
      romano: true,
      rotulo: `paginação romana a partir de ${resto.slice(1)}`,
    };
  }
  if (op === "T" && /^\+\d+$/.test(resto)) {
    return {
      tipo: "titulo",
      modo: "numero",
      numero: Number(resto.slice(1)),
      romano: false,
      rotulo: `título com número, a partir de ${resto.slice(1)}`,
    };
  }
  if (op === "T" && /^\s+\S/.test(resto)) {
    return { tipo: "titulo-texto", texto: resto.trim(), rotulo: `título: ${resto.trim()}` };
  }
  if (op === "S" && resto === "+") return { tipo: "silabas", ligado: true, rotulo: "com separação de sílabas" };
  if (op === "S" && resto === "-") return { tipo: "silabas", ligado: false, rotulo: "sem separação de sílabas" };
  if (op === "I" && resto === "+") return { tipo: "ingles", ligado: false, rotulo: "sem maiúsculas inglesas" };
  if (op === "I" && resto === "-") return { tipo: "ingles", ligado: true, rotulo: "maiúsculas inglesas" };
  if (op === "R" && resto === "+") return { tipo: "recuo", ligado: true, rotulo: "recuo de dois" };
  if (op === "R" && resto === "-") return { tipo: "recuo", ligado: false, rotulo: "sem recuo" };
  if (op === "M") {
    const restoCru = bruto.slice(1, -1).slice(1);
    if (restoCru.trim() === "") return { tipo: "margem", texto: "", rotulo: "sem margem" };
    const texto = restoCru.startsWith(" ") ? restoCru.trim() : restoCru;
    return { tipo: "margem", texto, rotulo: `margem: ${texto.trim()}` };
  }
  if (op === "G" && resto === "+") return { tipo: "grafico", ligado: true, rotulo: "modo gráfico" };
  if (op === "G" && resto === "-") return { tipo: "grafico", ligado: false, rotulo: "fim do modo gráfico" };
  if (op === "G" && /^\s+\S/.test(resto)) {
    return { tipo: "grafico-arquivo", texto: resto.trim(), rotulo: `gráfico ${resto.trim()}` };
  }
  return { tipo: "desconhecido", rotulo: bruto };
}

function aplicar(doc, comando) {
  if (comando.tipo === "formato") {
    doc.colunas = comando.colunas;
    doc.linhasPagina = comando.linhas;
  } else if (comando.tipo === "interponto") doc.interponto = comando.ligado;
  else if (comando.tipo === "silabas") doc.silabas = comando.ligado;
  else if (comando.tipo === "ajuste") doc.ajuste = comando.ligado;
  else if (comando.tipo === "titulo-texto") doc.titulo = comando.texto;
  else if (comando.tipo === "titulo" && comando.modo === "off") doc.titula = false;
  else if (comando.tipo === "titulo" && comando.modo === "on") doc.titula = true;
  else if (comando.tipo === "titulo" && comando.modo === "numero") {
    doc.titula = true;
    doc.numera = true;
    doc.romano = comando.romano === true;
    const numero = comando.numero;
    doc.numeroInicial = numero >= 1 && numero <= 10000 ? numero : 1;
  } else if (comando.tipo === "transpaginacao") {
    doc.paginaTinta = Number(comando.numero) > 0 ? comando.numero : null;
  } else if (comando.tipo === "recuo") doc.recuo = comando.ligado;
  else if (comando.tipo === "ingles") doc.ingles = comando.ligado;
  else if (comando.tipo === "margem") doc.margem = comando.texto;
  else if (comando.tipo === "grafico") doc.grafico = comando.ligado;
}

function preparar(linhas) {
  const doc = {
    colunas: null,
    linhasPagina: null,
    interponto: null,
    silabas: null,
    titulo: "",
    titula: true,
    numera: false,
    numeroInicial: null,
    romano: false,
    paginaTinta: null,
    recuo: false,
    ajuste: true,
    ingles: false,
    margem: "",
    grafico: false,
  };
  return linhas.map((linha) => {
    const comando = classificar(linha);
    if (comando) aplicar(doc, comando);
    return { comando, ...doc, margem: doc.margem, titulo: doc.titulo };
  });
}

function resumo(info) {
  if (!info) return "";
  const partes = [];
  if (info.colunas) partes.push(`${info.colunas}×${info.linhasPagina}`);
  if (info.interponto === true) partes.push("com interponto");
  if (info.interponto === false) partes.push("sem interponto");
  if (info.silabas === true) partes.push("com separação de sílabas");
  if (info.silabas === false) partes.push("sem separação de sílabas");
  if (info.titula && info.titulo) partes.push(`título “${info.titulo}”`);
  else if (info.titula) partes.push("com título");
  if (info.numera) partes.push(`número desde ${info.numeroInicial ?? 1}`);
  if (info.romano) partes.push("numeração romana");
  if (info.paginaTinta) partes.push(`página em tinta ${info.paginaTinta}`);
  if (info.recuo) partes.push("recuo de dois");
  if (info.ajuste === false) partes.push("sem auto-ajuste");
  if (info.ingles) partes.push("maiúsculas inglesas");
  if (info.margem) partes.push(`margem ${info.margem}`);
  if (info.grafico) partes.push("modo gráfico");
  return partes.join(" · ");
}

export { classificar, preparar, resumo, aplicar };
