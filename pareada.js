// Vista pareada (etapa 2, só leitura): cada faixa vira uma linha com a tinta à esquerda e o
// braille à direita. As duas metades são a mesma linha do DOM, então rolam juntas sempre.

import { unicodeDaCela } from "./motor.js?edicao=28";

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

// O "`" é o caractere de escape: aparece na tinta, mas não vira cela.
function tintaComEscapes(texto, destino = document.createDocumentFragment()) {
  const partes = texto.split("`");
  partes.forEach((parte, indice) => {
    if (indice > 0) {
      const escape = document.createElement("span");
      escape.className = "escape";
      escape.textContent = "`";
      destino.append(escape);
    }
    if (parte) destino.append(parte);
  });
  return destino;
}

// Grifo (app.js, marcarGrifos): `estilos` tem um código por coluna da tinta.
const CLASSE_GRIFO = [null, "grifo-marca", "grifo", "grifo grifo-duplo"];

function tintaComGrifo(texto, estilos) {
  if (!estilos) return tintaComEscapes(texto);
  const fragmento = document.createDocumentFragment();
  let inicio = 0;
  for (let coluna = 1; coluna <= texto.length; coluna += 1) {
    if (coluna < texto.length && estilos[coluna] === estilos[inicio]) continue;
    const pedaco = texto.slice(inicio, coluna);
    const classe = CLASSE_GRIFO[estilos[inicio]];
    if (classe) {
      const span = document.createElement("span");
      span.className = classe;
      fragmento.append(tintaComEscapes(pedaco, span));
    } else {
      tintaComEscapes(pedaco, fragmento);
    }
    inicio = coluna;
  }
  return fragmento;
}

function rotuloQuebra(faixa) {
  if (faixa.forcada) return "<P> quebra de página";
  if (faixa.motivo === "titulo") return "nova numeração";
  if (faixa.motivo === "medida") return "nova medida de página";
  return "quebra automática";
}

// Comandos e comentários não ocupam linha no braille: fechados, viram uma etiqueta na divisa
// entre a linha de cima e a de baixo. Comandos seguidos dividem a mesma etiqueta (o primeiro
// desenha todos). `fechadas` são as faixas da etiqueta; [] nas outras do grupo.
function etiquetaDasFaixas(fechadas, indices) {
  const linha = document.createElement("div");
  linha.className = "faixa faixa-fechada";
  if (!fechadas.length) return linha;
  const etiquetas = document.createElement("span");
  etiquetas.className = "etiquetas";
  fechadas.forEach((faixa, k) => {
    const etiqueta = document.createElement("span");
    etiqueta.className = `etiqueta etiqueta-${faixa.tipo}`;
    etiqueta.dataset.alvo = String(indices[k]);
    etiqueta.textContent = (faixa.tinta || "").trim();
    const nome = faixa.tipo === "comentario" ? "comentário: não vai para o braille" : faixa.rotulo || "código";
    etiqueta.title = `${nome}\nDuplo clique para abrir e editar`;
    etiquetas.append(etiqueta);
  });
  linha.append(etiquetas);
  return linha;
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
    // Tracejada só a quebra automática; <P> e nova numeração (<T+n>) vêm de códigos do texto.
    linha.classList.add(faixa.motivo === "automatica" ? "automatica" : "forcada");
    const rotulo = document.createElement("span");
    rotulo.className = "rotulo-quebra";
    rotulo.textContent = rotuloQuebra(faixa);
    linha.append(rotulo);
    linha.title = faixa.linha != null ? `${rotuloQuebra(faixa)}\nDuplo clique para abrir e editar` : rotuloQuebra(faixa);
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
  tinta.append(tintaComGrifo(faixa.tinta || "", faixa.estilos));

  const braille = document.createElement("span");
  braille.className = "lado-braille";
  braille.textContent = brailleDe(faixa.braille || []);

  if (faixa.tipo === "cabecalho") linha.title = "cabeçalho da página (não editável)";
  if (faixa.tipo === "comentario") linha.title = "comentário: não vai para o braille";
  if (faixa.corteRecuo) {
    linha.classList.add("corte-recuo");
    const aviso = "Começa com dois espaços dentro do recuo e com minúscula: pode ser um parágrafo partido pelo Finalizar. Editar o texto de cima não junta esta linha a ele.";
    linha.title = linha.title ? `${linha.title}\n${aviso}` : aviso;
  }
  linha.append(barras, tinta, braille);
  return linha;
}

// Assinatura do que a faixa mostra: duas faixas com a mesma assinatura usam o mesmo elemento.
// A parte do braille fica guardada junto da lista de celas, que a paginação reaproveita.
const ASSINATURAS = new WeakMap();
function assinaturaDoBraille(celas) {
  let guardada = ASSINATURAS.get(celas);
  if (guardada == null) {
    guardada = celas.map((cela) => (cela.tipo === "espaco" ? "0" : cela.dots)).join(",");
    ASSINATURAS.set(celas, guardada);
  }
  return guardada;
}

function assinatura(faixa) {
  const braille = faixa.braille ? assinaturaDoBraille(faixa.braille) : "";
  return `${faixa.tipo}|${faixa.corteRecuo ? 1 : 0}|${faixa.forcada ? 1 : 0}|${faixa.motivo ?? ""}|${(faixa.marcas || []).join(",")}|${faixa.tinta ?? ""}|${faixa.estiloChave ?? ""}|${braille}`;
}

// Janela virtual: o livro pode ter milhares de faixas, mas só as que estão perto da tela
// existem no DOM. A altura de cada faixa é conhecida (texto ou quebra), então a posição de
// qualquer faixa sai de uma soma, sem pedir layout ao navegador.
const SOBRA = 30;

function criarJanela(raiz, { aoDesenhar } = {}) {
  const trilho = document.createElement("div");
  trilho.className = "trilho-pareado";
  const lista = document.createElement("div");
  lista.className = "janela-pareada";
  trilho.append(lista);
  raiz.replaceChildren(trilho);

  const janela = {
    faixas: [],
    colunas: 34,
    topos: new Float64Array(1),
    alturas: { faixa: 30, quebra: 22 },
    inicio: 12,
    visivel: raiz.clientHeight,
    de: 0,
    ate: 0,
    elementos: new Map(),
    sujo: true,
    aberta: null,
  };

  // Linhas de comando e linhas que o braille omite também ocupam uma linha (só de tinta): sem
  // isso não dava para escrever um comando, que sumia ao ser digitado.
  // Comandos e comentários fecham-se numa etiqueta, sem ocupar linha, como no braille; o que
  // tem o cursor (`aberta`) se abre para ser editado. A quebra de página também não ocupa linha:
  // é um traço colado entre a última linha da página e o cabeçalho da seguinte.
  function fechavel(faixa) {
    return faixa?.tipo === "comando" || faixa?.tipo === "comentario";
  }

  // O que o duplo clique abre: os códigos fechados e a quebra que vem de um código (<P>, <T+n>).
  function abrivel(faixa) {
    return fechavel(faixa) || (faixa?.tipo === "quebra" && faixa.linha != null);
  }

  function altura(faixa, indice) {
    if (!faixa) return 0;
    if (faixa.tipo === "quebra") return indice === janela.aberta ? janela.alturas.faixa : 0;
    if (fechavel(faixa) && indice !== janela.aberta) return 0;
    return janela.alturas.faixa;
  }

  // Desenhada mesmo sem altura: a quebra (o traço) e o começo de um grupo de etiquetas.
  function desenhavel(faixa, indice) {
    return altura(faixa, indice) > 0 || faixa?.tipo === "quebra" || (fechavel(faixa) && indice !== janela.aberta);
  }

  // Grupos de comandos fechados seguidos: o primeiro desenha a etiqueta de todos.
  function grupoDe(indice) {
    if (!fechavel(janela.faixas[indice]) || indice === janela.aberta) return null;
    const anterior = indice - 1;
    if (anterior >= 0 && fechavel(janela.faixas[anterior]) && anterior !== janela.aberta) return { primeiro: false, indices: [] };
    const indices = [];
    for (let i = indice; i < janela.faixas.length && fechavel(janela.faixas[i]) && i !== janela.aberta; i += 1) indices.push(i);
    return { primeiro: true, indices };
  }

  // Lidas do CSS só quando a fonte muda; digitar não pede nenhuma medida ao navegador.
  function medirAlturas() {
    const estilo = getComputedStyle(raiz);
    const fonte = parseFloat(estilo.getPropertyValue("--fonte")) || 22;
    janela.alturas = { faixa: fonte * 1.36, quebra: 22 };
    janela.inicio = parseFloat(estilo.paddingTop) || 0;
  }

  new ResizeObserver(() => {
    janela.visivel = raiz.clientHeight;
    desenhar();
  }).observe(raiz);

  function calcularTopos() {
    const topos = new Float64Array(janela.faixas.length + 1);
    for (let i = 0; i < janela.faixas.length; i += 1) topos[i + 1] = topos[i] + altura(janela.faixas[i], i);
    janela.topos = topos;
    trilho.style.height = `${topos[janela.faixas.length]}px`;
  }

  // Primeira faixa cujo fim passa de y.
  function faixaEm(y) {
    let baixo = 0;
    let alto = janela.faixas.length - 1;
    while (baixo < alto) {
      const meio = (baixo + alto) >> 1;
      if (janela.topos[meio + 1] <= y) baixo = meio + 1;
      else alto = meio;
    }
    return Math.max(0, baixo);
  }

  // Atributos que mudam quando a faixa só troca de lugar (Enter acima dela).
  function acertarDados(elemento, faixa, indice) {
    const dados = elemento.dataset;
    const i = String(indice);
    if (dados.i !== i) dados.i = i;
    const linha = faixa.linha != null ? String(faixa.linha) : undefined;
    if (dados.linha !== linha) {
      if (linha == null) delete dados.linha;
      else dados.linha = linha;
    }
    if (faixa.trechos?.length) {
      const de = String(faixa.trechos[0].linha);
      const ate = String(faixa.trechos[faixa.trechos.length - 1].linha);
      if (dados.de !== de) dados.de = de;
      if (dados.ate !== ate) dados.ate = ate;
    }
  }

  // Desenha as faixas visíveis mais uma sobra; só refaz quando a tela sai do que já existe.
  // Faixas que não mudaram (mesma assinatura) continuam sendo o mesmo elemento no mesmo lugar.
  function desenhar(forcar = false) {
    const n = janela.faixas.length;
    const topo = raiz.scrollTop - janela.inicio;
    const visivelDe = faixaEm(Math.max(0, topo));
    const visivelAte = Math.min(n, faixaEm(topo + janela.visivel) + 1);
    if (!forcar && !janela.sujo && visivelDe >= janela.de && visivelAte <= janela.ate) return false;
    const de = Math.max(0, visivelDe - SOBRA);
    const ate = Math.min(n, visivelAte + SOBRA);

    const sobras = new Map();
    for (const elemento of janela.elementos.values()) {
      const chave = elemento.assinatura;
      if (!sobras.has(chave)) sobras.set(chave, []);
      sobras.get(chave).push(elemento);
    }
    const elementos = new Map();
    const ordem = [];
    for (let i = de; i < ate; i += 1) {
      const faixa = janela.faixas[i];
      if (!desenhavel(faixa, i)) continue;
      const grupo = grupoDe(i);
      // Os outros comandos do grupo já estão na etiqueta do primeiro.
      if (grupo && !grupo.primeiro) continue;
      const fechadas = grupo ? grupo.indices.map((k) => janela.faixas[k]) : null;
      const aberta = i === janela.aberta;
      let chave = grupo ? `fechada|${fechadas.map((f) => `${f.tipo}:${f.tinta}`).join("\u0001")}` : assinatura(faixa);
      if (aberta) chave = `aberta|${chave}`;
      let elemento = sobras.get(chave)?.shift();
      if (!elemento) {
        if (grupo) elemento = etiquetaDasFaixas(fechadas, grupo.indices);
        else if (aberta) {
          // Código aberto pelo duplo clique: a linha dele, na própria página, para editar. O <P>
          // aberto também vira uma linha com o texto do código.
          elemento = linhaDaFaixa(faixa.tipo === "quebra" ? { ...faixa, tipo: "comando" } : faixa);
          elemento.classList.add("codigo-aberto");
        } else elemento = linhaDaFaixa(faixa);
        elemento.assinatura = chave;
      }
      // As etiquetas apontam para as linhas do texto, que mudam de índice quando o texto muda.
      if (grupo) elemento.querySelectorAll(".etiqueta").forEach((etiqueta, k) => { etiqueta.dataset.alvo = String(grupo.indices[k]); });
      acertarDados(elemento, faixa, i);
      elementos.set(i, elemento);
      ordem.push(elemento);
    }
    for (const restantes of sobras.values()) for (const elemento of restantes) elemento.remove();
    let atual = lista.firstChild;
    for (const elemento of ordem) {
      if (atual === elemento) atual = atual.nextSibling;
      else lista.insertBefore(elemento, atual);
    }
    lista.style.transform = `translateY(${janela.topos[de]}px)`;
    janela.de = de;
    janela.ate = ate;
    janela.elementos = elementos;
    janela.sujo = false;
    aoDesenhar?.();
    return true;
  }

  raiz.addEventListener("scroll", () => desenhar());

  return {
    // Troca a lista de faixas (depois de cada edição).
    definir(faixas, colunas) {
      janela.faixas = faixas;
      // A linha aberta é a do cursor; quem chama abre de novo depois de remontar.
      if (janela.aberta != null && !abrivel(faixas[janela.aberta])) janela.aberta = null;
      janela.colunas = colunas;
      raiz.style.setProperty("--colunas", String(colunas));
      calcularTopos();
      janela.sujo = true;
    },
    // A fonte mudou: as alturas mudam junto.
    medir() {
      medirAlturas();
      calcularTopos();
      janela.sujo = true;
    },
    // Abre a linha de um código (a do cursor) e fecha a que estava aberta. O cursor só chega a
    // um código pelo duplo clique ou escrevendo um novo. Devolve true quando mudou alguma coisa.
    abrir(indice) {
      const nova = abrivel(janela.faixas[indice]) ? indice : null;
      if (nova === janela.aberta) return false;
      janela.aberta = nova;
      calcularTopos();
      janela.sujo = true;
      return true;
    },
    desenhar,
    elemento: (indice) => janela.elementos.get(indice) || null,
    elementos: () => janela.elementos,
    topo: (indice) => janela.inicio + janela.topos[indice],
    visivel: () => janela.visivel,
    altura: (indice) => altura(janela.faixas[indice], indice),
    alturaFaixa: () => janela.alturas.faixa,
  };
}

export { criarJanela };
