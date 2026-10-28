// Val do Delphi (@ValLong): espaços à esquerda, sinal, "$" para hexadecimal. Num erro devolve o
// que já leu e a posição do caractere ruim (o original usa esse valor parcial).
function valLong(texto) {
  let i = 0;
  while (texto[i] === " ") i += 1;
  let sinal = 1;
  if (texto[i] === "+" || texto[i] === "-") {
    if (texto[i] === "-") sinal = -1;
    i += 1;
  }
  const hexa = texto[i] === "$";
  if (hexa) i += 1;
  const inicio = i;
  let valor = 0;
  for (; i < texto.length; i += 1) {
    const digito = parseInt(texto[i], hexa ? 16 : 10);
    if (Number.isNaN(digito)) break;
    valor = valor * (hexa ? 16 : 10) + digito;
  }
  const erro = i < texto.length || i === inicio ? i + 1 : 0;
  return { valor: sinal * valor, erro };
}

const COMENTARIO = { tipo: "comentario", fecha: false, rotulo: "comentário, não vai para o braille" };

function invalido(linha) {
  return {
    tipo: "invalido",
    fecha: true,
    imprimir: true,
    aviso: `Comando inválido (linha {linha}): ${linha}.`,
    rotulo: "comando inválido, sai como texto",
  };
}

// 0049BC94, o intérprete de comandos do CompilaRascunho. Devolve null quando a linha é texto.
// Campos: fecha (esvazia o parágrafo em curso antes de agir), imprimir (a linha também sai
// como texto) e aviso (mensagem que o original mostrava).
function classificar(linha) {
  // 0049CADB: comando é a linha que começa com "<" na coluna 1 (o fim já vem aparado por
  // 0049BBE0); com espaço antes, é texto. "<" sozinho também é texto.
  const s = linha.trimEnd();
  if (!s.startsWith("<") || s.length === 1) return null;
  if (s.toUpperCase() === "<P>") return { tipo: "quebra", fecha: true, rotulo: "quebra de página" };
  const op = s[1].toUpperCase();
  const par = s.slice(2, 4);

  if (op === "T") {
    if (par === "->") return { tipo: "titulo", modo: "off", fecha: true, rotulo: "sem título de página" };
    if (par === "+>") return { tipo: "titulo", modo: "on", fecha: true, rotulo: "título de página" };
    if (s.length >= 5 && (s[2] === "+" || s[2] === "*") && /[0-9]/.test(s[3]) && s.endsWith(">")) {
      const bruto = s.slice(3, -1);
      const lido = valLong(bruto);
      let numero = lido.valor;
      let aviso = null;
      if (lido.erro || numero < 1 || numero > 10000) {
        if (numero < 1 || numero > 10000) numero = 1;
        aviso = `Número da página INVÁLIDO: "${bruto}". Valor considerado: "${numero}".`;
      }
      const romano = s[2] === "*";
      return {
        tipo: "titulo",
        modo: "numero",
        numero,
        romano,
        aviso,
        fecha: true,
        rotulo: romano ? `paginação romana a partir de ${numero}` : `título com número, a partir de ${numero}`,
      };
    }
    // Qualquer outro <T...> é título: do 3º caractere ao fim, sem o ">" final e sem aparar.
    const texto = s.endsWith(">") ? s.slice(2, -1) : s.slice(2);
    return { tipo: "titulo-texto", texto, fecha: true, rotulo: `título: ${texto.trim()}` };
  }
  if (op === "F") {
    if (par === "->") return { tipo: "ajuste", ligado: false, fecha: true, rotulo: "auto-ajuste desligado" };
    if (par === "+>") return { tipo: "ajuste", ligado: true, fecha: true, rotulo: "auto-ajuste ligado" };
    if (par === "*>") return { tipo: "estrangeiro", fecha: true, rotulo: "trecho musical ou estrangeiro" };
    return { ...COMENTARIO, fecha: true };
  }
  if (op === "S") {
    if (par === "->") return { tipo: "silabas", ligado: false, fecha: false, rotulo: "sem separação de sílabas" };
    if (par === "+>") return { tipo: "silabas", ligado: true, fecha: false, rotulo: "com separação de sílabas" };
    return COMENTARIO;
  }
  if (op === "R") {
    if (par === "+>") return { tipo: "recuo", ligado: true, fecha: true, rotulo: "recuo de dois" };
    if (par === "->") return { tipo: "recuo", ligado: false, fecha: true, rotulo: "sem recuo" };
    return { ...COMENTARIO, fecha: true };
  }
  if (op === "I") {
    // O manual diz o contrário, mas <I+> grava 1 em 660D28 e o tradutor usa a maiúscula inglesa.
    if (par === "+>") return { tipo: "ingles", ligado: true, fecha: false, rotulo: "maiúsculas inglesas" };
    if (par === "->") return { tipo: "ingles", ligado: false, fecha: false, rotulo: "sem maiúsculas inglesas" };
    return COMENTARIO;
  }
  if (op === "G") {
    // <G[ |+|*]coluna arquivo>. Sem ">" ou sem coluna e arquivo: inválido, e a linha sai como texto.
    if (!s.endsWith(">")) return invalido(s);
    const miolo = s.slice(2, -1).trim();
    const resto = miolo.slice(1).trim();
    if (!miolo || !resto) return invalido(s);
    if (!resto.includes(" ")) {
      return { ...invalido(s), aviso: "Gráfico sem informação de coluna na linha {linha}." };
    }
    return { tipo: "grafico-arquivo", modo: miolo[0], texto: resto, fecha: true, rotulo: `gráfico ${resto}` };
  }
  if (op === "M") {
    const cru = s.slice(2);
    if (!cru || !cru.endsWith(">")) return invalido(s);
    const restoCru = cru.slice(0, -1);
    if (restoCru.trim() === "") return { tipo: "margem", texto: "", fecha: true, rotulo: "sem margem" };
    const texto = restoCru.startsWith(" ") ? restoCru.trim() : restoCru;
    return { tipo: "margem", texto, fecha: true, rotulo: `margem: ${texto.trim()}` };
  }
  if (/[0-9]/.test(s[1])) {
    // Sem ">" é texto. Com ">", o Val vale como página em tinta mesmo se falhar no meio
    // (fica o valor parcial), e nesse caso a linha também sai como texto.
    if (!s.endsWith(">")) return null;
    const lido = valLong(s.slice(1, -1));
    return {
      tipo: "transpaginacao",
      numero: String(lido.valor),
      fecha: false,
      imprimir: lido.erro !== 0,
      rotulo: `página em tinta ${lido.valor}`,
    };
  }
  // Qualquer outro caractere depois do "<": a linha é ignorada em silêncio (0049C642).
  // Inclui as anotações <*** ***> e as notas de configuração como <*34 caracteres x 28 linhas>.
  if (/^<\*{3}[\s\S]*\*{3}>$/.test(s)) return { ...COMENTARIO, tipo: "anotacao", rotulo: "anotação, não impressa" };
  return COMENTARIO;
}

function aplicar(doc, comando) {
  if (comando.tipo === "silabas") doc.silabas = comando.ligado;
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
  if (info.titula && info.titulo.trim()) partes.push(`título “${info.titulo.trim()}”`);
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
