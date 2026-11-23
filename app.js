import { tabelas } from "./tabelas.js";
import { classificar, preparar, resumo } from "./comandos.js?edicao=26";
import { formatar } from "./pagina.js?edicao=32";
import { contarQuebras, finalizarTexto, mesmoBraille, removerQuebras } from "./finalizar.js?edicao=1";
import { montarFaixas } from "./faixas.js?edicao=31";
import { montarTinta, relatorioTinta } from "./tinta.js?edicao=1";
import { conferirDocx, gerarDocx } from "./docx.js?edicao=1";
import { criarJanela } from "./pareada.js?edicao=35";
import {
  apagarNaBorda,
  editavel,
  palavraEm,
  selecaoNaFaixa,
  foraDeLinhaEscondida,
  indiceDaPosicao,
  iniciosDasLinhas,
  posicaoNaFaixa,
  vizinhaEditavel,
} from "./cursor_pareado.js?edicao=30";
import { caractereMeta, metaDePontos, nomesPontos, traduzir, unicodeDaCela } from "./motor.js?edicao=26";
import {
  apararFim,
  centrarFisico,
  centrarPorEspacos,
  converter,
  dividirLinhas,
  expandirTab,
  paraDos,
  paraWindows,
  quadrinho,
} from "./edicao.js";

const CHAVE = "braille-facil-editor-v1";
const RECENTES = "braille-facil-recentes";
const $ = (id) => document.getElementById(id);

const estado = {
  nome: "sem título",
  sujo: false,
  persistTimer: 0,
  tituloTimer: 0,
  fonte: 22,
  dicionario: null,
  inibidas: new Set(),
  perkins: [0, 0, 0, 0, 0, 0],
  atualizacaoAuto: false,
};

function semAcento(texto) {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function opcoes() {
  return {
    codigo: $("codigo").value,
    matematica: $("matematica").checked,
    maiuscula: $("maiuscula").checked,
    maiusculaPalavra: $("maiuscula-palavra").checked,
    numero: $("numero").checked,
    correcoes: { caracteres: {}, matematica: {}, sinais: {} },
    comTitulo: $("com-titulo").checked,
    tiraBrancas: $("tira-brancas").checked,
    numeracao: Number($("numeracao").value) || 0,
    colunasPadrao: Number($("colunas-padrao").value) || 34,
    linhasPadrao: Number($("linhas-padrao").value) || 28,
    autoFormata: $("auto-formata").checked,
    silabas: $("silabas-padrao").checked,
    interponto: $("interponto").checked ? true : null,
  };
}

function grupoNoCursor(lista, coluna) {
  return lista.find((grupo) => coluna >= grupo.de && coluna < grupo.ate)
    || lista.find((grupo) => coluna > 0 && coluna === grupo.ate);
}

function linhasDoTexto() {
  return $("texto").value.split("\n");
}

// Linha e coluna do cursor sem partir o texto inteiro: num livro grande isso roda várias
// vezes por tecla.
const contagem = { valor: null, total: 1 };

function quebrasAte(valor, ate) {
  let total = 0;
  for (let i = valor.indexOf("\n"); i !== -1 && i < ate; i = valor.indexOf("\n", i + 1)) total += 1;
  return total;
}

function posicao() {
  const area = $("texto");
  const valor = area.value;
  const ate = area.selectionStart;
  if (contagem.valor !== valor) {
    contagem.valor = valor;
    contagem.total = quebrasAte(valor, Infinity) + 1;
  }
  const inicio = ate === 0 ? 0 : valor.lastIndexOf("\n", ate - 1) + 1;
  const fim = valor.indexOf("\n", ate);
  return {
    linha: quebrasAte(valor, ate),
    coluna: ate - inicio,
    selecionados: area.selectionEnd - area.selectionStart,
    total: contagem.total,
    texto: valor.slice(inicio, fim === -1 ? valor.length : fim),
  };
}

function grupos(celas) {
  const saida = [];
  for (const cela of celas) {
    const ultimo = saida[saida.length - 1];
    if (ultimo && cela.bloco === ultimo.bloco) {
      ultimo.celas.push(cela);
      if (cela.rotulo) ultimo.rotulo = cela.rotulo;
      ultimo.ate = cela.ate;
      continue;
    }
    saida.push({
      rotulo: cela.rotulo || "",
      celas: [cela],
      de: cela.de,
      ate: cela.ate,
      bloco: cela.bloco,
      espaco: cela.tipo === "espaco",
    });
  }
  return saida;
}

function celasDaLinha(linha) {
  const resultado = traduzir(linha, opcoes());
  const paragrafo = resultado.paragrafos.find((item) => !item.vazio);
  return paragrafo ? paragrafo.celas : [];
}

const ORDEM = [0, 3, 1, 4, 2, 5];

function grade(dots) {
  const caixa = document.createElement("span");
  caixa.className = "grade";
  for (const bit of ORDEM) {
    const ponto = document.createElement("i");
    ponto.className = "ponto" + (dots[bit] === "1" ? " aceso" : "");
    caixa.append(ponto);
  }
  return caixa;
}

function atualizarStatus() {
  const cursor = posicao();
  const linha = cursor.texto;
  $("st-lin").textContent = `Lin: ${cursor.linha + 1}`;
  $("st-col").textContent = `Col: ${cursor.coluna + 1}`;
  $("st-sel").textContent = `Sel: ${cursor.selecionados} | ${cursor.total}`;
  $("st-doc").textContent = estado.nome;
  const comando = classificar(linha);
  if (comando) {
    $("st-car").textContent = comando.rotulo;
  } else {
    const grupoAtual = grupoNoCursor(grupos(celasDaLinha(linha)), cursor.coluna);
    if (grupoAtual && grupoAtual.rotulo) {
      const pontos = grupoAtual.celas
        .filter((cela) => cela.tipo !== "espaco")
        .map((cela) => nomesPontos(cela.dots))
        .join(" ");
      $("st-car").textContent = `${grupoAtual.rotulo} · pontos ${pontos}`;
    } else {
      $("st-car").textContent = "";
    }
  }
  document.title = estado.sujo ? `* ${estado.nome} — Braille Fácil` : `${estado.nome} — Braille Fácil`;
  return cursor;
}

// Opções mudaram (código, fonte, menus): refaz tudo, inclusive as medidas.
function desenhar() {
  pareado.sujo = true;
  pareado.sujoTotal = true;
  atualizarStatus();
  desenharModoPareado();
}

// ---------- Editor pareado (PLANO-EDITOR) ----------
// O textarea é o modelo e recebe o teclado (acentos, colar, desfazer), mas fica invisível; o
// que a pessoa vê e clica são as faixas: tinta e braille lado a lado, linha a linha. O cursor
// é a posição no textarea.
const pareado = {
  texto: null,
  sujo: true,
  faixas: [],
  janela: null,
  sujoTotal: true,
  cursorFaixa: null,
  cursorColuna: 0,
  inicios: [0],
  colunaAlvo: null,
  ultimoIndice: 0,
  cursor: null,
  medidas: null,
};

function desenharModoPareado(seguir = true) {
  const area = $("texto");
  // Com as alturas medidas de novo (fonte, opções), a tela volta a mostrar o cursor.
  const remedir = pareado.sujoTotal;
  if (pareado.sujo || pareado.texto !== area.value) reconstruirPareado();
  posicionarCursorPareado(seguir || remedir);
}

// Só as faixas perto da tela existem no DOM (pareada.js); cada vez que a janela é redesenhada
// (rolagem, edição), o cursor e a seleção são pintados de novo nas faixas que apareceram.
function janelaPareada() {
  if (!pareado.janela) {
    pareado.janela = criarJanela($("pareada"), {
      aoDesenhar: () => {
        pintarSelecaoPareada();
        colocarCursorPareado();
      },
    });
  }
  return pareado.janela;
}

function reconstruirPareado() {
  const area = $("texto");
  const linhas = linhasDoTexto();
  const op = opcoes();
  const formato = formatar(linhas, op, false, { semVista: true });
  const janela = janelaPareada();
  pareado.faixas = montarFaixas(linhas, formato, op);
  pareado.texto = area.value;
  pareado.inicios = iniciosDasLinhas(area.value);
  pareado.sujo = false;
  janela.definir(pareado.faixas, formato.colunas);
  if (pareado.sujoTotal) janela.medir();
  pareado.sujoTotal = false;
  // O desenho fica para posicionarCursorPareado, que sabe para onde a tela vai.
  pareado.formato = { colunas: formato.colunas, altura: formato.altura, paginas: formato.paginas, avisos: formato.avisos || [] };
  agendarTitulo();
}

// O título sai alguns instantes depois da última mudança: a situação dos códigos precisa
// percorrer o texto até o cursor e não deve pesar em cada tecla.
function agendarTitulo() {
  window.clearTimeout(estado.tituloTimer);
  estado.tituloTimer = window.setTimeout(atualizarTitulo, 150);
}

function atualizarTitulo() {
  const formato = pareado.formato;
  if (!formato) return;
  const cursor = posicao();
  const linhas = pareado.texto.slice(0, pareado.inicios[cursor.linha + 1] ?? pareado.texto.length).split("\n");
  const situacao = resumo(preparar(linhas)[cursor.linha]);
  const pagina = (pareado.faixas[pareado.cursorFaixa]?.pagina ?? 0) + 1;
  const partes = [];
  if (!situacao.includes("×")) partes.push(`${formato.colunas}×${formato.altura}`);
  partes.push(`página ${pagina} de ${formato.paginas}`);
  if (situacao) partes.push(situacao);
  // O original mostrava estas mensagens em caixas a cada compilação; aqui ficam no título.
  if (formato.avisos.length) partes.push(`⚠ ${formato.avisos.length} ${formato.avisos.length === 1 ? "aviso" : "avisos"}`);
  $("painel-titulo").textContent = partes.join(" · ");
  $("painel-titulo").title = formato.avisos.map((aviso) => aviso.texto).join("\n");
}

function posicaoPareada(indice) {
  return posicaoNaFaixa(pareado.faixas, pareado.inicios, indice);
}

function indiceDoCursor() {
  const area = $("texto");
  return area.selectionDirection === "backward" ? area.selectionStart : area.selectionEnd;
}

function irParaIndice(indice, estender = false) {
  const area = $("texto");
  if (estender) {
    const ancora = area.selectionDirection === "backward" ? area.selectionEnd : area.selectionStart;
    if (indice < ancora) area.setSelectionRange(indice, ancora, "backward");
    else area.setSelectionRange(ancora, indice, "forward");
  } else area.setSelectionRange(indice, indice);
  pareado.ultimoIndice = indice;
}

// Pinta a seleção do textarea nas faixas: na tinta por colunas, no braille por celas.
function pintarSelecaoPareada() {
  const raiz = $("pareada");
  for (const velha of raiz.querySelectorAll(".selecao-pareada")) velha.remove();
  const area = $("texto");
  const de = area.selectionStart;
  const ate = area.selectionEnd;
  raiz.classList.toggle("com-selecao", de < ate);
  if (de >= ate) return;
  const medidas = medidasPareadas();
  if (medidas) raiz.style.setProperty("--cela", `${medidas.braille}px`);
  janelaPareada().elementos().forEach((elemento, indice) => {
    const faixa = pareado.faixas[indice];
    const selecao = selecaoNaFaixa(faixa, pareado.inicios, pareado.texto, de, ate);
    if (!selecao) return;
    const tinta = document.createElement("span");
    tinta.className = "selecao-pareada sel-tinta";
    tinta.style.setProperty("--de", String(selecao.tinta[0]));
    tinta.style.setProperty("--n", String(Math.max(0.5, selecao.tinta[1] - selecao.tinta[0])));
    elemento.querySelector(".lado-tinta").append(tinta);
    if (selecao.braille) {
      const braille = document.createElement("span");
      braille.className = "selecao-pareada sel-braille";
      braille.style.setProperty("--de", String(selecao.braille[0]));
      braille.style.setProperty("--n", String(selecao.braille[1] - selecao.braille[0]));
      elemento.querySelector(".lado-braille").append(braille);
    }
  });
}

// Põe o cursor na faixa dele, se ela estiver desenhada (sem rolar).
function colocarCursorPareado() {
  const raiz = $("pareada");
  for (const anterior of raiz.querySelectorAll(".faixa.atual")) anterior.classList.remove("atual");
  if (!pareado.cursor) {
    pareado.cursor = document.createElement("span");
    pareado.cursor.className = "cursor-pareado";
  }
  const elemento = pareado.cursorFaixa != null ? janelaPareada().elemento(pareado.cursorFaixa) : null;
  const tinta = elemento?.querySelector(".lado-tinta");
  if (!tinta) {
    pareado.cursor.remove();
    return;
  }
  elemento.classList.add("atual");
  tinta.append(pareado.cursor);
  pareado.cursor.style.setProperty("--coluna", String(pareado.cursorColuna));
}

function posicionarCursorPareado(seguir) {
  sincronia.de = $("texto").selectionStart;
  sincronia.ate = $("texto").selectionEnd;
  const raiz = $("pareada");
  const janela = janelaPareada();
  const posicao = posicaoPareada(indiceDoCursor());
  let alvo = posicao.faixa;
  if (!janela.altura(alvo)) {
    alvo = vizinhaEditavel(pareado.faixas, posicao.faixa, 1) ?? vizinhaEditavel(pareado.faixas, posicao.faixa, -1);
  }
  if (pareado.cursorFaixa !== alvo) agendarTitulo();
  pareado.cursorFaixa = alvo;
  pareado.cursorColuna = posicao.coluna;
  // A posição da faixa vem da soma das alturas: rolar não depende de ela estar desenhada.
  if (seguir && alvo != null) {
    const topo = janela.topo(alvo);
    const altura = janela.altura(alvo);
    const margem = altura * 2;
    if (topo < raiz.scrollTop + margem) raiz.scrollTop = Math.max(0, topo - margem);
    else if (topo + altura > raiz.scrollTop + janela.visivel() - margem) {
      raiz.scrollTop = topo + altura - janela.visivel() + margem;
    }
  }
  if (!janela.desenhar()) {
    pintarSelecaoPareada();
    colocarCursorPareado();
  }
  // Reinicia a piscada para o cursor ficar visível logo depois de cada movimento: trocar de
  // animação recomeça do zero sem pedir layout.
  pareado.piscada = !pareado.piscada;
  pareado.cursor.classList.toggle("piscando", pareado.piscada);
  pareado.cursor.classList.toggle("piscando-b", !pareado.piscada);
}

// Largura de uma coluna de tinta e de uma cela, medidas numa faixa de texto desenhada.
function medidasPareadas() {
  if (pareado.medidas) return pareado.medidas;
  let elemento = null;
  for (const candidato of janelaPareada().elementos().values()) {
    if (candidato.querySelector(".lado-braille")) {
      elemento = candidato;
      break;
    }
  }
  if (!elemento) return null;
  const regua = (alvo, texto) => {
    const span = document.createElement("span");
    span.textContent = texto;
    span.style.cssText = "position:absolute;visibility:hidden;white-space:pre";
    alvo.append(span);
    const largura = span.getBoundingClientRect().width / texto.length;
    span.remove();
    return largura;
  };
  pareado.medidas = {
    tinta: regua(elemento.querySelector(".lado-tinta"), "0".repeat(20)),
    braille: regua(elemento.querySelector(".lado-braille"), "⠿".repeat(20)),
  };
  return pareado.medidas;
}

// Clique: na tinta pela coluna; no braille pela cela, que sabe de que letra veio.
function indiceDoClique(evento, sobLetra = false) {
  const linha = evento.target.closest(".faixa");
  if (!linha || linha.dataset.i == null) return null;
  const indice = Number(linha.dataset.i);
  const faixa = pareado.faixas[indice];
  if (!editavel(faixa)) {
    const vizinha = vizinhaEditavel(pareado.faixas, indice, 1) ?? vizinhaEditavel(pareado.faixas, indice, -1);
    if (vizinha == null) return null;
    return indiceDaPosicao(pareado.faixas, pareado.inicios, pareado.texto, { faixa: vizinha, coluna: 0 });
  }
  const medidas = medidasPareadas();
  const ladoBraille = linha.querySelector(".lado-braille");
  const caixaBraille = ladoBraille.getBoundingClientRect();
  if (evento.clientX >= caixaBraille.left) {
    const recuo = parseFloat(getComputedStyle(ladoBraille).paddingLeft) || 0;
    const cela = Math.max(0, Math.floor((evento.clientX - caixaBraille.left - recuo) / medidas.braille));
    const alvo = faixa.braille?.[cela];
    if (alvo?.fonte) return pareado.inicios[alvo.fonte.linha] + alvo.fonte.de;
    return indiceDaPosicao(pareado.faixas, pareado.inicios, pareado.texto, { faixa: indice, coluna: cela });
  }
  const ladoTinta = linha.querySelector(".lado-tinta");
  const caixa = ladoTinta.getBoundingClientRect();
  const recuo = parseFloat(getComputedStyle(ladoTinta).paddingLeft) || 0;
  const exata = (evento.clientX - caixa.left - recuo) / medidas.tinta;
  const coluna = Math.max(0, sobLetra ? Math.floor(exata) : Math.round(exata));
  return indiceDaPosicao(pareado.faixas, pareado.inicios, pareado.texto, { faixa: indice, coluna });
}

function teclaPareada(evento) {
  const area = $("texto");
  if (pareado.sujo || pareado.texto !== area.value) reconstruirPareado();
  const vertical = evento.key === "ArrowUp" || evento.key === "ArrowDown";
  if (!vertical) pareado.colunaAlvo = null;
  if (evento.ctrlKey || evento.altKey || evento.metaKey) return;

  if (vertical || evento.key === "PageUp" || evento.key === "PageDown") {
    evento.preventDefault();
    const atual = posicaoPareada(indiceDoCursor());
    const alvo = pareado.colunaAlvo ?? atual.coluna;
    const passo = evento.key === "ArrowUp" || evento.key === "PageUp" ? -1 : 1;
    const alturaFaixa = janelaPareada().alturaFaixa();
    const vezes = vertical ? 1 : Math.max(1, Math.floor($("pareada").clientHeight / alturaFaixa) - 2);
    let destino = atual.faixa;
    for (let i = 0; i < vezes; i += 1) {
      const proxima = vizinhaEditavel(pareado.faixas, destino, passo);
      if (proxima == null) break;
      destino = proxima;
    }
    if (destino === atual.faixa) return;
    pareado.colunaAlvo = alvo;
    irParaIndice(indiceDaPosicao(pareado.faixas, pareado.inicios, pareado.texto, { faixa: destino, coluna: alvo }), evento.shiftKey);
    atualizarStatus();
    posicionarCursorPareado(true);
    return;
  }

  if (evento.key === "Home" || evento.key === "End") {
    evento.preventDefault();
    const atual = posicaoPareada(indiceDoCursor());
    const faixa = pareado.faixas[atual.faixa];
    const coluna = evento.key === "Home" ? 0 : (faixa.tinta || "").length;
    irParaIndice(indiceDaPosicao(pareado.faixas, pareado.inicios, pareado.texto, { faixa: atual.faixa, coluna }), evento.shiftKey);
    atualizarStatus();
    posicionarCursorPareado(true);
    return;
  }

  if ((evento.key === "Backspace" || evento.key === "Delete") && area.selectionStart === area.selectionEnd) {
    const passo = evento.key === "Backspace" ? -1 : 1;
    const apagar = apagarNaBorda(pareado.faixas, pareado.inicios, pareado.texto, area.selectionStart, passo);
    if (!apagar) return;
    evento.preventDefault();
    if (apagar.de === apagar.ate) return;
    // execCommand mantém o Ctrl+Z do textarea.
    area.setSelectionRange(apagar.de, apagar.ate);
    if (!document.execCommand("delete")) {
      area.setRangeText("", apagar.de, apagar.ate, "end");
      area.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
}

// Qualquer ação (menu, diálogo, Perkins, busca, colar...) mexe só no textarea. Depois de cada
// clique, tecla, mudança ou diálogo fechado, o pareado confere se o texto ou a seleção mudou.
const sincronia = { de: -1, ate: -1, quadro: 0 };

function sincronizarPareado() {
  if (sincronia.quadro) return;
  sincronia.quadro = window.requestAnimationFrame(() => {
    sincronia.quadro = 0;
    const area = $("texto");
    const mudouTexto = pareado.sujo || pareado.texto !== area.value;
    const mudouSelecao = area.selectionStart !== sincronia.de || area.selectionEnd !== sincronia.ate;
    if (mudouTexto || mudouSelecao) aposMovimentoPareado();
  });
}

// Depois de um movimento nativo (setas, digitação): tira o cursor das linhas de código.
function aposMovimentoPareado() {
  const area = $("texto");
  if (pareado.sujo || pareado.texto !== area.value) reconstruirPareado();
  if (area.selectionStart === area.selectionEnd) {
    const indice = area.selectionStart;
    const direcao = Math.sign(indice - pareado.ultimoIndice) || 1;
    const fora = foraDeLinhaEscondida(pareado.faixas, pareado.inicios, pareado.texto, indice, direcao);
    if (fora !== indice) area.setSelectionRange(fora, fora);
    pareado.ultimoIndice = fora;
  }
  posicionarCursorPareado(true);
}

function desenharCinco() {
  const caixa = $("cinco");
  if (!$("cinco-linhas").checked) {
    caixa.hidden = true;
    return;
  }
  caixa.hidden = false;
  const comBraille = [];
  let doCursor = 0;
  pareado.faixas.forEach((faixa, indice) => {
    if (!faixa.braille || (faixa.tipo !== "texto" && faixa.tipo !== "branco" && faixa.tipo !== "cabecalho")) return;
    if (indice <= (pareado.cursorFaixa ?? 0)) doCursor = comBraille.length;
    comBraille.push(faixa);
  });
  const de = Math.max(0, doCursor - 2);
  caixa.replaceChildren();
  for (const faixa of comBraille.slice(de, de + 5)) {
    const linha = document.createElement("div");
    linha.className = "braille";
    linha.textContent = textoBraille(faixa.braille) || " ";
    caixa.append(linha);
  }
}

function textoBraille(celas) {
  return celas.map((cela) => (cela.tipo === "espaco" ? "⠀" : unicodeDaCela(cela.dots))).join("").replace(/⠀+$/, "");
}

function persistir() {
  const texto = $("texto").value;
  const dados = {
    nome: estado.nome,
    codigo: $("codigo").value,
    matematica: $("matematica").checked,
    maiuscula: $("maiuscula").checked,
    maiusculaPalavra: $("maiuscula-palavra").checked,
    numero: $("numero").checked,
    comTitulo: $("com-titulo").checked,
    tiraBrancas: $("tira-brancas").checked,
    numeracao: $("numeracao").value,
    colunasPadrao: Number($("colunas-padrao").value) || 34,
    linhasPadrao: Number($("linhas-padrao").value) || 28,
    maxCol: Number($("max-col").value) || 70,
    quebraAuto: $("quebra-auto").checked,
    autoFormata: $("auto-formata").checked,
    silabas: $("silabas-padrao").checked,
    interponto: $("interponto").checked,
    fonte: estado.fonte,
    atualizacaoAuto: estado.atualizacaoAuto,
  };
  if (texto.length <= 200000) dados.texto = texto;
  try {
    localStorage.setItem(CHAVE, JSON.stringify(dados));
  } catch {
    /* o texto grande continua no editor; o navegador recusou gravar a cópia */
  }
}

function agendarPersistir() {
  window.clearTimeout(estado.persistTimer);
  estado.persistTimer = window.setTimeout(persistir, 800);
}

async function lerArquivo(arquivo) {
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  let texto;
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    texto = new TextDecoder("utf-8").decode(bytes.subarray(3));
  } else {
    try {
      texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      texto = new TextDecoder("windows-1252").decode(bytes);
    }
  }
  return texto.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function aplicarFonte(tamanho) {
  const px = Math.min(48, Math.max(12, Number(tamanho) || 22));
  estado.fonte = px;
  $("texto").style.fontSize = `${px}px`;
  $("pareada").style.setProperty("--fonte", `${px}px`);
  pareado.medidas = null;
  pareado.sujo = true;
  pareado.sujoTotal = true;
}

function restaurar() {
  try {
    const dados = JSON.parse(localStorage.getItem(CHAVE) || "null");
    if (!dados) return;
    estado.nome = dados.nome || "sem título";
    $("texto").value = dados.texto || "";
    if (dados.codigo === "antigo" || dados.codigo === "unificado") $("codigo").value = dados.codigo;
    $("matematica").checked = dados.matematica !== false;
    $("maiuscula").checked = dados.maiuscula !== false;
    $("maiuscula-palavra").checked = dados.maiusculaPalavra !== false;
    $("numero").checked = dados.numero !== false;
    if (typeof dados.comTitulo === "boolean") $("com-titulo").checked = dados.comTitulo;
    if (typeof dados.tiraBrancas === "boolean") $("tira-brancas").checked = dados.tiraBrancas;
    if (dados.numeracao != null) $("numeracao").value = String(dados.numeracao);
    if (dados.colunasPadrao) $("colunas-padrao").value = dados.colunasPadrao;
    if (dados.linhasPadrao) $("linhas-padrao").value = dados.linhasPadrao;
    if (dados.maxCol) $("max-col").value = dados.maxCol;
    if (typeof dados.quebraAuto === "boolean") $("quebra-auto").checked = dados.quebraAuto;
    if (typeof dados.autoFormata === "boolean") $("auto-formata").checked = dados.autoFormata;
    if (typeof dados.silabas === "boolean") $("silabas-padrao").checked = dados.silabas;
    if (typeof dados.interponto === "boolean") $("interponto").checked = dados.interponto;
    // 18 era o padrão antigo (fonte proporcional); vale o novo padrão maior.
    if (dados.fonte && dados.fonte !== 18) aplicarFonte(dados.fonte);
    estado.atualizacaoAuto = Boolean(dados.atualizacaoAuto);
  } catch {
    estado.nome = "sem título";
  }
}

function fecharMenus() {
  for (const menu of document.querySelectorAll(".submenu")) menu.hidden = true;
  for (const botao of document.querySelectorAll(".menu-item > button")) botao.setAttribute("aria-expanded", "false");
}

// Leva o cursor a uma linha e coluna do texto (busca, ortografia...) e mostra no pareado.
function irPara(linha, coluna) {
  const linhas = linhasDoTexto();
  let pos = 0;
  for (let indice = 0; indice < linha; indice += 1) pos += (linhas[indice]?.length || 0) + 1;
  pos += coluna;
  const area = $("texto");
  area.focus({ preventScroll: true });
  area.setSelectionRange(pos, pos);
  pareado.ultimoIndice = pos;
  atualizarStatus();
  aposMovimentoPareado();
}

// Ao abrir um texto, o cursor e a rolagem ficam no começo do livro.
function irAoInicio() {
  const area = $("texto");
  area.setSelectionRange(0, 0);
  $("pareada").scrollTop = 0;
  pareado.ultimoIndice = 0;
  area.focus({ preventScroll: true });
}

function salvar() {
  const blob = new Blob([$("texto").value], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = estado.nome.endsWith(".txt") ? estado.nome : `${estado.nome}.txt`;
  link.click();
  URL.revokeObjectURL(url);
  estado.sujo = false;
  lembrarRecente();
  desenhar();
}

function novo() {
  if ($("texto").value && estado.sujo) {
    if (!window.confirm("Começar um texto novo? O texto atual continua guardado neste navegador até você abrir outro.")) return;
  }
  $("texto").value = "";
  estado.nome = "sem título";
  estado.sujo = false;
  $("texto").focus();
  desenhar();
  persistir();
}

async function editar(acao) {
  const area = $("texto");
  area.focus();
  if (acao === "desfazer") {
    if (!desfazerTroca()) document.execCommand("undo");
    return;
  }
  try {
    if (acao === "recortar" || acao === "copiar") {
      const trecho = area.value.slice(area.selectionStart, area.selectionEnd);
      await navigator.clipboard.writeText(trecho);
      if (acao === "recortar") {
        area.setRangeText("", area.selectionStart, area.selectionEnd, "start");
        estado.sujo = true;
      }
      return;
    }
    if (acao === "colar") {
      const trecho = await navigator.clipboard.readText();
      area.setRangeText(trecho, area.selectionStart, area.selectionEnd, "end");
      estado.sujo = true;
    }
  } catch {
    document.execCommand(acao === "recortar" ? "cut" : acao === "copiar" ? "copy" : "paste");
  }
}

function preencherSimbolos() {
  const busca = semAcento($("busca-simbolo").value.trim());
  const lista = $("lista-simbolos");
  const regras = [...tabelas.regras].sort((a, b) =>
    semAcento(a.comentario || a.token).localeCompare(semAcento(b.comentario || b.token), "pt")
  );
  lista.replaceChildren();
  for (const regra of regras) {
    const rotulo = `${regra.comentario || regra.token}  —  \`${regra.token}`;
    if (busca && !semAcento(rotulo).includes(busca)) continue;
    const opcao = document.createElement("option");
    opcao.value = regra.token;
    opcao.textContent = rotulo;
    lista.append(opcao);
  }
  if (lista.options.length) lista.selectedIndex = 0;
}

function inserirSimbolo() {
  const token = $("lista-simbolos").value;
  if (!token) return;
  const area = $("texto");
  const inicio = area.selectionStart ?? area.value.length;
  const pedaco = area.value.slice(0, inicio).endsWith("`") ? token : `\`${token}`;
  area.setRangeText(pedaco, inicio, area.selectionEnd ?? inicio, "end");
  $("matematica").checked = true;
  estado.sujo = true;
  $("simbolos").close();
  area.focus();
  desenhar();
  persistir();
}

function substituir(inicio, fim, pedaco) {
  const area = $("texto");
  area.focus();
  area.setRangeText(pedaco, inicio, fim, "end");
  estado.sujo = true;
  desenhar();
  persistir();
}

function faixaLinhas() {
  const area = $("texto");
  const valor = area.value;
  let a = area.selectionStart ?? 0;
  let b = area.selectionEnd ?? a;
  if (b > a && valor[b - 1] === "\n") b -= 1;
  const ini = valor.lastIndexOf("\n", Math.max(0, a) - 1) + 1;
  let fim = valor.indexOf("\n", b);
  if (fim < 0) fim = valor.length;
  return { ini, fim, valor };
}

function envolver(abre, fecha) {
  const { ini, fim, valor } = faixaLinhas();
  const miolo = valor.slice(ini, fim);
  const corpo = miolo && !miolo.endsWith("\n") ? `${miolo}\n` : miolo;
  substituir(ini, fim, `${abre}\n${corpo}${fecha}\n`);
}

function envolverSelecao(abre, fecha) {
  const area = $("texto");
  const ini = area.selectionStart ?? 0;
  const fim = area.selectionEnd ?? ini;
  const miolo = area.value.slice(ini, fim);
  substituir(ini, fim, `${abre}${miolo}${fecha}`);
  if (!miolo) {
    const cursor = ini + abre.length;
    area.setSelectionRange(cursor, cursor);
  }
}

function inserirNaLinha(texto) {
  const area = $("texto");
  const ini = area.value.lastIndexOf("\n", (area.selectionStart ?? 0) - 1) + 1;
  substituir(ini, ini, `${texto}\n`);
}

function substituirTextoTodo(texto) {
  const area = $("texto");
  substituir(0, area.value.length, texto);
}

function colunasAtuais() {
  const info = preparar(linhasDoTexto()).find((item) => item.colunas);
  return info?.colunas || opcoes().colunasPadrao || 34;
}

function lembrarRecente() {
  const item = { nome: estado.nome, texto: $("texto").value };
  if (!item.texto || item.texto.length > 200000) return;
  let lista = [];
  try {
    lista = JSON.parse(localStorage.getItem(RECENTES) || "[]");
  } catch {
    lista = [];
  }
  lista = [item, ...lista.filter((outro) => outro.nome !== item.nome)].slice(0, 5);
  localStorage.setItem(RECENTES, JSON.stringify(lista));
  montarRecentes();
}

function montarRecentes() {
  const menu = $("menu-reabrir");
  menu.replaceChildren();
  let lista = [];
  try {
    lista = JSON.parse(localStorage.getItem(RECENTES) || "[]");
  } catch {
    lista = [];
  }
  if (!lista.length) {
    const vazio = document.createElement("button");
    vazio.type = "button";
    vazio.disabled = true;
    vazio.textContent = "(vazio)";
    menu.append(vazio);
    return;
  }
  lista.forEach((item, indice) => {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.textContent = `${indice + 1}. ${item.nome}`;
    botao.addEventListener("click", () => {
      $("texto").value = item.texto;
      estado.nome = item.nome;
      estado.sujo = false;
      irAoInicio();
      desenhar(true);
      persistir();
    });
    menu.append(botao);
  });
}

// Troca o texto inteiro como uma edição só, que o Ctrl+Z desfaz de uma vez (Finalizar,
// Remover quebras). O cursor fica na mesma linha do texto, ou na mais próxima.
// O execCommand("insertText") poria a troca no Ctrl+Z do navegador, mas num livro de 70 páginas
// leva uns 10 segundos. A troca é direta e o desfazer é próprio: o Ctrl+Z seguinte (ou
// Editar > Desfazer) devolve o texto de antes, enquanto ele não for mexido de novo.
const troca = { antes: null, depois: null, linha: 0, coluna: 0 };

function definirTexto(texto, linha, coluna) {
  const area = $("texto");
  area.value = texto;
  const linhas = texto.split("\n");
  const alvo = Math.min(linha, linhas.length - 1);
  let indice = 0;
  for (let i = 0; i < alvo; i += 1) indice += linhas[i].length + 1;
  indice += Math.min(coluna, linhas[alvo].length);
  area.focus({ preventScroll: true });
  area.setSelectionRange(indice, indice);
  pareado.ultimoIndice = indice;
  estado.sujo = true;
  desenhar();
  persistir();
}

function trocarTextoComDesfazer(texto) {
  const { linha, coluna } = posicao();
  Object.assign(troca, { antes: $("texto").value, depois: texto, linha, coluna });
  definirTexto(texto, linha, coluna);
}

function desfazerTroca() {
  if (troca.depois == null || $("texto").value !== troca.depois) return false;
  const { antes, linha, coluna } = troca;
  troca.antes = null;
  troca.depois = null;
  definirTexto(antes, linha, coluna);
  return true;
}

// Finalizar: grava um <P> em cada quebra de página automática, sem mudar o braille.
function finalizar() {
  const linhas = linhasDoTexto();
  const op = opcoes();
  const resultado = finalizarTexto(linhas, op);
  const mantidas = resultado.mantidas.length;
  const sobre = mantidas
    ? ` ${mantidas === 1 ? "Uma quebra ficou automática" : `${mantidas} quebras ficaram automáticas`}, porque partir a linha ali mudaria o braille: ${resultado.mantidas.map((trecho) => `“${trecho}”`).join(", ")}.`
    : "";
  if (!resultado.quebras) {
    avisar("Finalizar", mantidas ? `Nenhuma quebra foi gravada.${sobre}` : "Não há quebras de página automáticas para gravar.");
    return;
  }
  const conferencia = mesmoBraille(linhas, resultado.linhas, op);
  if (!conferencia.igual) {
    avisar("Finalizar", `Nada foi alterado: gravar as quebras mudaria o braille (${conferencia.motivo}).`);
    return;
  }
  trocarTextoComDesfazer(resultado.linhas.join("\n"));
  const gravadas = resultado.quebras === 1 ? "Uma quebra de página foi gravada" : `${resultado.quebras} quebras de página foram gravadas`;
  avisar("Finalizar", `${gravadas} no texto (<P>). O braille continua o mesmo.${sobre} Ctrl+Z desfaz.`);
}

function pedirRemoverQuebras() {
  const total = contarQuebras(linhasDoTexto());
  if (!total) {
    avisar("Remover quebras de página", "Não há quebras de página para remover.");
    return;
  }
  const quantas = total === 1 ? "Será apagada 1 quebra de página (<P>)" : `Serão apagadas ${total} quebras de página (<P>)`;
  $("remover-quebras-texto").textContent = `${quantas}, inclusive as que você inseriu à mão, por exemplo para começar um capítulo numa página nova. As páginas voltarão a ser quebradas automaticamente. Você pode desfazer com Ctrl+Z.`;
  $("remover-quebras-dialogo").showModal();
}

function avisar(titulo, texto) {
  $("aviso-titulo").textContent = titulo;
  $("aviso-texto").textContent = texto;
  $("aviso").showModal();
}

function baixar(nome, conteudo, tipo) {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  link.click();
  URL.revokeObjectURL(url);
}

function textoFormatado(tinta) {
  return formatar(linhasDoTexto(), opcoes(), tinta).linhas
    .filter((linha) => linha.tipo !== "codigo" || linha.separador)
    .map((linha) => linha.texto)
    .join("\n");
}

function exportarWord(tinta) {
  const corpo = textoFormatado(tinta)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  const html = `<html><head><meta charset="utf-8"></head><body><pre>${corpo}</pre></body></html>`;
  baixar(tinta ? "tinta.doc" : "braille.doc", html, "application/msword");
}

// Tinta no Word: a versão em fonte ampliada, linha a linha igual ao braille. A tinta sai do
// texto (tinta.js), não do braille; o .docx é gravado direto e lido de volta para conferir.
function exportarTinta() {
  const tinta = montarTinta(linhasDoTexto(), opcoes());
  const bytes = gerarDocx(tinta);
  const conferencia = conferirDocx(bytes, tinta);
  const base = (estado.nome || "sem título").replace(/\.[^.]*$/, "");
  baixar(`${base} - tinta.docx`, bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  const relatorio = relatorioTinta(tinta, conferencia);
  const erros = tinta.avisos.filter((aviso) => aviso.gravidade === "erro").length;
  const avisos = tinta.avisos.filter((aviso) => aviso.gravidade === "aviso").length;
  $("tinta-resumo").textContent = !conferencia.ok
    ? "O arquivo foi gravado, mas a conferência falhou. Veja o relatório antes de usar."
    : erros || avisos
      ? `Arquivo gravado. Confira ${erros ? `${erros} erro(s) e ` : ""}${avisos} aviso(s) abaixo.`
      : "Arquivo gravado. Tudo conferido: nenhuma pendência.";
  $("tinta-relatorio").textContent = relatorio;
  $("tinta-dialogo").dataset.base = base;
  $("tinta-dialogo").showModal();
}

// Imprimir: o texto do .txt, ou o braille do livro inteiro com uma página braille por folha.
// A área de impressão só existe enquanto a janela de impressão está aberta.
function imprimir(tipo) {
  const area = $("impressao");
  area.replaceChildren();
  if (tipo === "texto") {
    const pre = document.createElement("pre");
    pre.textContent = $("texto").value;
    area.append(pre);
  } else {
    if (pareado.sujo || pareado.texto !== $("texto").value) reconstruirPareado();
    let pagina = null;
    let folha = null;
    for (const faixa of pareado.faixas) {
      if (faixa.tipo !== "texto" && faixa.tipo !== "branco" && faixa.tipo !== "cabecalho") continue;
      if (!folha || faixa.pagina !== pagina) {
        folha = document.createElement("pre");
        folha.className = "folha-braille";
        area.append(folha);
        pagina = faixa.pagina;
      }
      folha.append(`${textoBraille(faixa.braille || [])}\n`);
    }
  }
  area.dataset.tipo = tipo;
  area.hidden = false;
  document.body.dataset.impressao = tipo;
  window.print();
  document.body.dataset.impressao = "";
  area.hidden = true;
  area.replaceChildren();
}

function metaDaSelecao() {
  const area = $("texto");
  const trecho = area.value.slice(area.selectionStart, area.selectionEnd);
  if (!trecho) return "";
  return trecho.split("\n").map((linha) => {
    const resultado = traduzir(linha, opcoes());
    const paragrafo = resultado.paragrafos.find((item) => !item.vazio);
    return (paragrafo ? paragrafo.celas : []).map((cela) => (
      cela.tipo === "espaco" ? " " : caractereMeta(cela.meta)
    )).join("");
  }).join("\n");
}

function aplicarQuadrinho(tipo) {
  const { ini, fim, valor } = faixaLinhas();
  const linhas = valor.slice(ini, fim).split("\n");
  substituir(ini, fim, quadrinho(linhas, tipo).join("\n"));
}

function centrarEscolha(fisica) {
  const { ini, fim, valor } = faixaLinhas();
  const colunas = colunasAtuais();
  const linhas = valor.slice(ini, fim).split("\n").map((linha) => (
    fisica ? centrarFisico(linha, colunas) : centrarPorEspacos(linha)
  ));
  substituir(ini, fim, linhas.join("\n"));
}

function procurar(de, inicio) {
  const area = $("texto");
  const texto = area.value;
  const alvo = de;
  if (!alvo) return -1;
  const daqui = texto.indexOf(alvo, inicio);
  if (daqui >= 0) return daqui;
  const volta = texto.indexOf(alvo, 0);
  if (volta >= 0 && volta < inicio) return volta;
  return -1;
}

function palavraNoCursor() {
  const area = $("texto");
  const texto = area.value;
  let i = area.selectionStart;
  while (i > 0 && /[\p{L}]/u.test(texto[i - 1])) i -= 1;
  let j = area.selectionStart;
  while (j < texto.length && /[\p{L}]/u.test(texto[j])) j += 1;
  return texto.slice(i, j);
}

function pontosPerkins() {
  return estado.perkins.map((aceso) => (aceso ? "1" : "0")).join("");
}

function mostrarPerkins() {
  const dots = pontosPerkins();
  $("perkins-mostra").textContent = unicodeDaCela(dots);
}

const TECLAS_PERKINS = { f: 0, d: 1, s: 2, j: 3, k: 4, l: 5 };

function acao(nome) {
  fecharMenus();
  const variantes = { "var-1": "<M| >", "var-2": "<Mé >", "var-3": "<M|l >" };
  const separadores = {
    "sep-grande": "               õxxxxxxxxxxxxxxxxxxxxxxo",
    "sep-media": "               õoõoõoõoõoõoõoõoõoõoõoõo",
    "sep-pequena": "               ::::::::::::::::::::::::",
  };
  const graficos = { "pagina-graf": "<G  1 ", "embutir-graf": "<G+ 1 ", "intercalar-graf": "<G* 1 " };
  if (nome === "novo") novo();
  else if (nome === "abrir") $("arquivo").click();
  else if (nome === "salvar") salvar();
  else if (nome === "finalizar") finalizar();
  else if (nome === "remover-quebras") pedirRemoverQuebras();
  else if (nome === "salvar-como") {
    const nomeArquivo = window.prompt("Salvar como", estado.nome);
    if (!nomeArquivo || !nomeArquivo.trim()) return;
    estado.nome = nomeArquivo.trim();
    salvar();
  } else if (nome === "desfazer" || nome === "recortar" || nome === "copiar" || nome === "colar") editar(nome);
  else if (nome === "copiar-meta") {
    const meta = metaDaSelecao();
    if (meta) navigator.clipboard.writeText(meta);
  } else if (nome === "selecionar") {
    $("texto").focus();
    $("texto").select();
  } else if (nome === "localizar") $("localizar").showModal();
  else if (nome === "substituir") $("substituir-dialogo").showModal();
  else if (nome === "dividir") {
    if (!window.confirm("Essa função não tem retorno, salvou por garantia?")) return;
    substituirTextoTodo(dividirLinhas(linhasDoTexto(), Number($("max-col").value) || 70).join("\n"));
  } else if (nome === "pagina") inserirNaLinha("<P>");
  else if (nome === "recuo-codigo") envolver("<R+>", "<R->");
  else if (nome === "ajuste-codigo") envolver("<F->", "<F+>");
  else if (nome === "silabas-codigo") envolver("<S->", "<S+>");
  else if (nome === "ingles-codigo") envolver("<I+>", "<I->");
  else if (nome === "centrar") $("centrar-dialogo").showModal();
  else if (nome === "pag-tinta") {
    const numero = window.prompt("Número da página em tinta", "");
    if (numero && /^\d+$/.test(numero.trim())) inserirNaLinha(`<${numero.trim()}>`);
  } else if (nome === "anotacao") {
    const nota = window.prompt("Anotar", "");
    if (nota && nota.trim()) inserirNaLinha(`<*** ${nota.trim()} ***>`);
  } else if (nome === "grifo") {
    const marca = $("grifo").value === "composto" ? "$*" : "*";
    envolverSelecao(marca, marca);
  } else if (nome === "informatica") envolverSelecao("~,", "~,");
  else if (nome === "parenteses") envolverSelecao("?", "*");
  else if (nome === "nota-transcricao") {
    const area = $("texto");
    if (area.selectionEnd > area.selectionStart) envolverSelecao("\n_`[", "_`]\n");
    else envolverSelecao("_`[", "_`]");
  } else if (variantes[nome]) envolver(variantes[nome], "<M>");
  else if (separadores[nome]) inserirNaLinha(separadores[nome]);
  else if (graficos[nome]) {
    const arquivo = window.prompt("Arquivo gráfico", "");
    if (arquivo && arquivo.trim()) inserirNaLinha(`${graficos[nome]}${arquivo.trim()}>`);
  } else if (nome === "grafico-vazio") {
    const medida = window.prompt("Quantas linhas e colunas alfanuméricas vai ocupar (no formato yy xx)?", "");
    if (!medida || !medida.trim()) return;
    const arquivo = window.prompt("Nome do arquivo .GRB a criar:", "");
    if (!arquivo || !arquivo.trim()) return;
    inserirNaLinha(`<G  1 ${arquivo.trim()}>`);
    avisar("Criando gráfico vazio", `Gráfico vazio ${arquivo.trim()} foi marcado no texto (${medida.trim()}). O arquivo .GRB em si era criado pelo Braille Fácil no disco; este editor não grava esse binário. Use o menu Gráficos para escolher como incluí-lo.`);
  } else if (nome === "quadrinho") $("quadro").showModal();
  else if (nome === "quadrinho-ajuda") aplicarQuadrinho("ajuda");
  else if (nome === "configurar") $("config").showModal();
  else if (nome === "fonte") {
    const tamanho = window.prompt("Tamanho da fonte na tela", String(estado.fonte));
    if (tamanho && Number(tamanho)) {
      aplicarFonte(tamanho);
      desenharModoPareado(false);
      persistir();
    }
  } else if (nome === "cinco") {
    $("cinco-linhas").checked = !$("cinco-linhas").checked;
    desenharCinco();
  } else if (nome === "revisor") {
    const ligado = !$("texto").readOnly;
    $("texto").readOnly = ligado;
    $("pareada").classList.toggle("revisor", ligado);
    $("st-revisor").textContent = ligado ? "Modo de revisão - apenas leitura" : "";
  } else if (nome === "atualizar" || nome === "visualizar") desenhar(true);
  else if (nome === "simbolos") {
    preencherSimbolos();
    $("simbolos").showModal();
  } else if (nome === "perkins") {
    estado.perkins = [0, 0, 0, 0, 0, 0];
    mostrarPerkins();
    $("perkins").showModal();
  } else if (nome === "retoques") {
    prepararRetoques();
    $("retoques").showModal();
  } else if (nome === "tabela") {
    preencherTabela();
    $("tabela").showModal();
  } else if (nome === "dos") substituirTextoTodo(converter($("texto").value, paraDos));
  else if (nome === "windows") substituirTextoTodo(converter($("texto").value, paraWindows));
  else if (nome === "eliminar") substituirTextoTodo(expandirTab($("texto").value));
  else if (nome === "minuscula" || nome === "maiuscula-texto") {
    const area = $("texto");
    const ini = area.selectionStart;
    const fim = area.selectionEnd;
    if (fim <= ini) return;
    const trecho = area.value.slice(ini, fim);
    substituir(ini, fim, nome === "minuscula" ? trecho.toLocaleUpperCase("pt") : trecho.toLocaleLowerCase("pt"));
    area.setSelectionRange(ini, fim);
  } else if (nome === "folhear") {
    const area = $("texto");
    const daqui = area.value.indexOf("<***", area.selectionEnd);
    const onde = daqui >= 0 ? daqui : area.value.indexOf("<***");
    if (onde < 0) {
      avisar("Anotações", "Não há anotações neste texto.");
      return;
    }
    const fecha = area.value.indexOf("***>", onde);
    area.focus();
    area.setSelectionRange(onde, fecha < 0 ? onde + 4 : fecha + 4);
  } else if (nome === "imprimir-texto" || nome === "imprimir-braille") {
    imprimir(nome === "imprimir-texto" ? "texto" : "braille");
  } else if (nome === "braille-word") exportarWord(false);
  else if (nome === "tinta-word") exportarTinta();
  else if (nome === "salvar-config") {
    const dados = JSON.parse(localStorage.getItem(CHAVE) || "{}");
    delete dados.texto;
    baixar("brfacil-config.json", JSON.stringify(dados, null, 2), "application/json");
  } else if (nome === "carregar-config") $("arquivo-config").click();
  else if (nome === "sair") {
    if ($("texto").value && !window.confirm("Fechando o programa, tudo foi salvo ?")) return;
    $("texto").value = "";
    estado.nome = "sem título";
    estado.sujo = false;
    desenhar();
    persistir();
  } else if (nome === "puma") {
    avisar("Chamar Puma 7", "O Braille Fácil gravava um temporário e abria o programa Puma. Esse outro programa não faz parte deste editor.");
  } else if (nome === "pintor") {
    avisar("Pintor Braille", "O Braille Fácil abria o editor gráfico Pintor. Ele não faz parte deste editor. Dá para incluir um gráfico já pronto pelos comandos Página gráfica, Intercalar e Embutir.");
  } else if (nome === "monet") {
    avisar("Monet", "O Braille Fácil abria o programa Monet. Ele não faz parte deste editor.");
  } else if (nome === "impressora") {
    avisar("Impressora Braille", "A escolha da impressora braille e o envio para a máquina ficavam no Braille Fácil. Aqui, Imprimir em Braille usa a impressão do navegador.");
  } else if (nome === "diretorios") {
    avisar("Diretórios", "As tabelas de tradução já estão neste editor. Não há pasta separada de ambcode ou brailex para apontar.");
  } else if (nome === "ortografia-config" || nome === "carregar-dic" || nome === "liberar-dic" || nome === "procurar-erro" || nome === "alternativas" || nome === "acrescentar" || nome === "inibir") {
    ortografia(nome);
  } else if (nome === "alto-relevo") {
    const texto = window.prompt("Texto em alto-relevo", "");
    if (!texto || !texto.trim()) return;
    const nomeArquivo = texto.trim().slice(0, 24).replaceAll(" ", "_");
    inserirNaLinha(`<G  1 ${nomeArquivo}>`);
    avisar("Inserir texto em alto-relevo", "O Braille Fácil gerava um gráfico com a fonte escolhida e inseria o comando. Aqui o comando foi inserido; o arquivo gráfico não é gerado.");
  } else if (nome === "texto-tabela") {
    avisar("Texto para Tabela", "O Braille Fácil abria o assistente de configuração de tabelas. Esse assistente não está neste editor.");
  } else if (nome === "macro") {
    avisar("Processador de macros", "O Braille Fácil abria o processador de macros. Ele não está neste editor.");
  } else if (nome === "procurar-atualizacao" || nome === "instalar-atualizacao") {
    avisar("Braille Fácil", "Em breve!!!");
  } else if (nome === "atualizacao-auto") {
    estado.atualizacaoAuto = !estado.atualizacaoAuto;
    persistir();
    avisar("Atualizações automáticas", estado.atualizacaoAuto ? "A preferência ficou ligada. Este editor não consulta a rede." : "A preferência ficou desligada.");
  } else if (nome === "manual") {
    avisar("Manual do Braille Fácil", "O manual que acompanha o programa antigo está em C:\\Users\\nmesquita\\Documents\\rea bf\\brfacil\\BRFACIL.DOC e em brfacil.chm.");
  } else if (nome === "sobre") {
    avisar("Braille Fácil", "Braille Fácil 5.0. Este editor mantém o texto à esquerda e o braille à direita, e aplica os comandos recuperados do programa antigo.");
  }
}

function ortografia(nome) {
  if (nome === "ortografia-config") {
    avisar("Verificador ortográfico", "O corretor do Braille Fácil lê os arquivos diciona.dic, diciona.sug, diciona.nom, diciona.exc e diciona.suf. Esse formato próprio não é uma lista de palavras. Em Carregar dicionário dá para abrir uma lista, uma palavra por linha ou separada por espaço.");
    return;
  }
  if (nome === "liberar-dic") {
    estado.dicionario = null;
    estado.inibidas = new Set();
    avisar("Dicionário", "Dicionário liberado.");
    return;
  }
  if (nome === "carregar-dic") {
    const entrada = document.createElement("input");
    entrada.type = "file";
    entrada.accept = ".txt,.dic,text/plain";
    entrada.addEventListener("change", () => {
      const arquivo = entrada.files[0];
      if (!arquivo) return;
      arquivo.text().then((texto) => {
        const palavras = texto.split(/\s+/).map((item) => item.toLocaleLowerCase("pt")).filter((item) => /^[\p{L}'-]+$/u.test(item));
        if (palavras.length < 20) {
          avisar("Dicionário", "Este arquivo não é uma lista de palavras. O diciona.dic do Braille Fácil usa outro formato e não foi lido.");
          return;
        }
        estado.dicionario = new Set(palavras);
        estado.inibidas = new Set();
        avisar("Dicionário", `${palavras.length} palavras carregadas.`);
      });
    });
    entrada.click();
    return;
  }
  if (!estado.dicionario) {
    avisar("Dicionário", "Nenhum dicionário carregado.");
    return;
  }
  if (nome === "acrescentar" || nome === "inibir") {
    const palavra = palavraNoCursor().toLocaleLowerCase("pt");
    if (!palavra) return;
    if (nome === "acrescentar") estado.dicionario.add(palavra);
    else estado.inibidas.add(palavra);
    return;
  }
  if (nome === "alternativas") {
    avisar("Outras alternativas", "A lista de sugestões ficava em diciona.sug. Esse arquivo não está carregado.");
    return;
  }
  const area = $("texto");
  const texto = area.value;
  const expr = /[\p{L}'-]+/gu;
  let achado;
  expr.lastIndex = area.selectionEnd;
  while ((achado = expr.exec(texto))) {
    const palavra = achado[0].toLocaleLowerCase("pt");
    if (!estado.dicionario.has(palavra) && !estado.inibidas.has(palavra)) {
      area.focus();
      area.setSelectionRange(achado.index, achado.index + achado[0].length);
      return;
    }
  }
  avisar("Ortografia", "Busca terminada");
}

function prepararRetoques() {
  const caixa = $("retoques-pontos");
  caixa.replaceChildren();
  const nomes = ["1", "2", "3", "4", "5", "6"];
  nomes.forEach((nome) => {
    const rotulo = document.createElement("label");
    rotulo.className = "cheque";
    const caixaPonto = document.createElement("input");
    caixaPonto.type = "checkbox";
    caixaPonto.dataset.ponto = nome;
    rotulo.append(caixaPonto, document.createTextNode(` ponto ${nome}`));
    caixa.append(rotulo);
  });
}

function preencherTabela() {
  const grade = $("tabela-grade");
  if (grade.childElementCount) return;
  const letras = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ";
  for (const caractere of letras) {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.textContent = caractere === " " ? "espaço" : caractere;
    botao.addEventListener("click", () => {
      const area = $("texto");
      area.setRangeText(caractere, area.selectionStart, area.selectionEnd, "end");
      estado.sujo = true;
      desenhar();
      persistir();
    });
    grade.append(botao);
  }
}

restaurar();
montarRecentes();
preencherSimbolos();
irAoInicio();
desenhar();

$("texto").addEventListener("input", () => {
  if ($("quebra-auto").checked && !$("texto").readOnly) {
    const limite = Number($("max-col").value) || 70;
    const linhas = linhasDoTexto();
    if (linhas.some((linha) => apararFim(linha).length > limite)) {
      const area = $("texto");
      const pos = area.selectionStart;
      area.value = dividirLinhas(linhas, limite).join("\n");
      const cursor = Math.min(pos, area.value.length);
      area.setSelectionRange(cursor, cursor);
    }
  }
  estado.sujo = true;
  atualizarStatus();
  agendarPersistir();
});
for (const evento of ["keyup", "click", "select"]) {
  $("texto").addEventListener(evento, () => atualizarStatus());
}
$("texto").addEventListener("keydown", (evento) => {
  const desfazer = (evento.ctrlKey || evento.metaKey) && !evento.shiftKey && evento.key.toLowerCase() === "z";
  if (desfazer && desfazerTroca()) evento.preventDefault();
});
$("texto").addEventListener("keydown", teclaPareada);
for (const evento of ["click", "keyup", "change", "input"]) document.addEventListener(evento, sincronizarPareado);
document.addEventListener("close", sincronizarPareado, true);
// O Chrome zera a seleção do textarea ao fechar um diálogo e devolver o foco a ele, quando o
// texto mudou com o diálogo aberto (Perkins, símbolos...). Guarda a seleção e devolve.
const fecharDialogo = HTMLDialogElement.prototype.close;
HTMLDialogElement.prototype.close = function fecharGuardandoSelecao(...argumentos) {
  const area = $("texto");
  const { selectionStart: de, selectionEnd: ate, selectionDirection: sentido } = area;
  fecharDialogo.apply(this, argumentos);
  if (area.selectionStart !== de || area.selectionEnd !== ate) area.setSelectionRange(de, ate, sentido);
};
for (const evento of ["keyup", "input"]) {
  $("texto").addEventListener(evento, () => {
    window.requestAnimationFrame(aposMovimentoPareado);
  });
}
// Mouse: clique posiciona, Shift+clique estende, arrastar seleciona, duplo clique pega a palavra.
const arrasto = { ativo: false, ancora: 0, rolagem: 0, ultimo: null };

function indiceNoPonto(x, y) {
  const raiz = $("pareada");
  const caixa = raiz.getBoundingClientRect();
  const yDentro = Math.min(Math.max(y, caixa.top + 2), caixa.bottom - 2);
  const alvo = document.elementFromPoint(Math.min(Math.max(x, caixa.left + 2), caixa.right - 2), yDentro);
  if (!alvo || !raiz.contains(alvo)) return null;
  return indiceDoClique({ target: alvo, clientX: x });
}

function seguirArrasto() {
  if (!arrasto.ativo || !arrasto.ultimo) return;
  const raiz = $("pareada");
  const caixa = raiz.getBoundingClientRect();
  const { x, y } = arrasto.ultimo;
  let passo = 0;
  if (y < caixa.top + 24) passo = -Math.min(40, caixa.top + 24 - y);
  else if (y > caixa.bottom - 24) passo = Math.min(40, y - caixa.bottom + 24);
  if (passo) {
    raiz.scrollTop += passo;
    janelaPareada().desenhar();
  }
  const indice = indiceNoPonto(x, y);
  if (indice != null) {
    const area = $("texto");
    if (indice < arrasto.ancora) area.setSelectionRange(indice, arrasto.ancora, "backward");
    else area.setSelectionRange(arrasto.ancora, indice, "forward");
    atualizarStatus();
    posicionarCursorPareado(false);
  }
  arrasto.rolagem = passo ? window.requestAnimationFrame(seguirArrasto) : 0;
}

$("pareada").addEventListener("mousedown", (evento) => {
  if (evento.button !== 0) return;
  const indice = indiceDoClique(evento);
  evento.preventDefault();
  $("texto").focus({ preventScroll: true });
  if (indice == null) return;
  pareado.colunaAlvo = null;
  if (evento.detail === 2) {
    const palavra = palavraEm($("texto").value, indiceDoClique(evento, true) ?? indice);
    $("texto").setSelectionRange(palavra.de, palavra.ate, "forward");
    atualizarStatus();
    posicionarCursorPareado(false);
    return;
  }
  irParaIndice(indice, evento.shiftKey);
  const area = $("texto");
  arrasto.ativo = true;
  arrasto.ancora = area.selectionDirection === "backward" ? area.selectionEnd : area.selectionStart;
  atualizarStatus();
  posicionarCursorPareado(false);
});
window.addEventListener("mousemove", (evento) => {
  if (!arrasto.ativo) return;
  if (!(evento.buttons & 1)) {
    arrasto.ativo = false;
    return;
  }
  arrasto.ultimo = { x: evento.clientX, y: evento.clientY };
  if (!arrasto.rolagem) seguirArrasto();
});
window.addEventListener("mouseup", () => {
  arrasto.ativo = false;
  if (arrasto.rolagem) window.cancelAnimationFrame(arrasto.rolagem);
  arrasto.rolagem = 0;
});
$("codigo").addEventListener("change", () => {
  desenhar();
  persistir();
});
for (const id of ["matematica", "maiuscula", "maiuscula-palavra", "numero"]) {
  $(id).addEventListener("change", () => {
    desenhar();
    persistir();
  });
}

document.addEventListener("click", (evento) => {
  const botao = evento.target.closest(".menu-item > button");
  if (!botao) {
    if (!evento.target.closest(".menu")) fecharMenus();
    return;
  }
  const item = botao.parentElement;
  const aberto = botao.getAttribute("aria-expanded") === "true";
  const pai = item.parentElement;
  for (const irmao of pai.querySelectorAll(":scope > .menu-item")) {
    irmao.querySelector(":scope > button")?.setAttribute("aria-expanded", "false");
    const sub = irmao.querySelector(":scope > .submenu");
    if (sub) sub.hidden = true;
  }
  if (!aberto) {
    botao.setAttribute("aria-expanded", "true");
    item.querySelector(":scope > .submenu").hidden = false;
  }
});

document.addEventListener("click", (evento) => {
  const botao = evento.target.closest("[data-acao]");
  if (!botao || botao.closest(".menu-item > button")) return;
  acao(botao.dataset.acao);
});

$("arquivo").addEventListener("change", () => {
  const arquivo = $("arquivo").files[0];
  if (!arquivo) return;
  lerArquivo(arquivo).then((texto) => {
    $("texto").value = texto;
    estado.nome = arquivo.name;
    estado.sujo = false;
    irAoInicio();
    desenhar(true);
    persistir();
    lembrarRecente();
  });
});

document.addEventListener("keydown", (evento) => {
  if (evento.key === "F12") {
    evento.preventDefault();
    desenhar();
  } else if (evento.key === "F9") {
    evento.preventDefault();
    desenhar(true);
  } else if (evento.key === "F5") {
    evento.preventDefault();
    acao("cinco");
  } else if (evento.ctrlKey && evento.key.toLowerCase() === "f") {
    evento.preventDefault();
    acao("localizar");
  } else if (evento.ctrlKey && evento.key.toLowerCase() === "a") {
    evento.preventDefault();
    acao("selecionar");
  } else if (evento.ctrlKey && evento.key.toLowerCase() === "s") {
    evento.preventDefault();
    salvar();
  } else if (evento.key === "Escape") {
    fecharMenus();
  }
});

$("config-fechar").addEventListener("click", () => {
  $("config").close();
  desenhar();
  persistir();
});
$("cinco-linhas").addEventListener("change", desenharCinco);
$("aviso-fechar").addEventListener("click", () => $("aviso").close());
$("tinta-fechar").addEventListener("click", () => $("tinta-dialogo").close());
$("tinta-salvar-relatorio").addEventListener("click", () => {
  baixar(`${$("tinta-dialogo").dataset.base} - relatório da tinta.txt`, $("tinta-relatorio").textContent, "text/plain;charset=utf-8");
});
$("remover-quebras-cancela").addEventListener("click", () => $("remover-quebras-dialogo").close());
$("remover-quebras-ok").addEventListener("click", () => {
  $("remover-quebras-dialogo").close();
  trocarTextoComDesfazer(removerQuebras(linhasDoTexto()).linhas.join("\n"));
});
$("localizar-fechar").addEventListener("click", () => $("localizar").close());
$("substituir-fechar").addEventListener("click", () => $("substituir-dialogo").close());
$("centrar-cancela").addEventListener("click", () => $("centrar-dialogo").close());
$("centrar-fisica").addEventListener("click", () => {
  $("centrar-dialogo").close();
  centrarEscolha(true);
});
$("centrar-espacos").addEventListener("click", () => {
  $("centrar-dialogo").close();
  centrarEscolha(false);
});
$("quadro-cancela").addEventListener("click", () => $("quadro").close());
$("quadro-ok").addEventListener("click", () => {
  const tipo = document.querySelector("input[name=quadro]:checked")?.value || "padrao";
  $("quadro").close();
  aplicarQuadrinho(tipo);
});
$("perkins-fechar").addEventListener("click", () => $("perkins").close());
$("perkins-inserir").addEventListener("click", () => {
  const dots = pontosPerkins();
  const meta = metaDePontos(dots);
  const caractere = meta == null ? unicodeDaCela(dots) : caractereMeta(meta);
  const area = $("texto");
  area.setRangeText(caractere, area.selectionStart, area.selectionEnd, "end");
  estado.sujo = true;
  desenhar();
  persistir();
  estado.perkins = [0, 0, 0, 0, 0, 0];
  mostrarPerkins();
});
$("perkins").addEventListener("keydown", (evento) => {
  const indice = TECLAS_PERKINS[evento.key.toLowerCase()];
  if (evento.key === " ") {
    evento.preventDefault();
    estado.perkins = [0, 0, 0, 0, 0, 0];
    mostrarPerkins();
    return;
  }
  if (indice == null) return;
  evento.preventDefault();
  estado.perkins[indice] = estado.perkins[indice] ? 0 : 1;
  mostrarPerkins();
});
$("retoques-fechar").addEventListener("click", () => $("retoques").close());
$("retoques-aplicar").addEventListener("click", () => {
  const bits = [1, 2, 3, 4, 5, 6].map((ponto) => (
    $("retoques-pontos").querySelector(`[data-ponto="${ponto}"]`).checked ? "1" : "0"
  )).join("");
  const meta = metaDePontos(bits);
  const caractere = meta == null ? unicodeDaCela(bits) : caractereMeta(meta);
  const area = $("texto");
  const fim = area.selectionEnd === area.selectionStart ? area.selectionStart + 1 : area.selectionEnd;
  substituir(area.selectionStart, Math.min(fim, area.value.length), caractere);
  $("retoques").close();
});
$("tabela-fechar").addEventListener("click", () => $("tabela").close());
$("busca-proxima").addEventListener("click", () => {
  const onde = procurar($("busca").value, $("texto").selectionEnd);
  if (onde < 0) {
    avisar("Localizar", "Busca terminada");
    return;
  }
  $("texto").focus();
  $("texto").setSelectionRange(onde, onde + $("busca").value.length);
});
$("troca-uma").addEventListener("click", () => {
  const de = $("troca-de").value;
  const onde = procurar(de, $("texto").selectionStart);
  if (onde < 0) {
    avisar("Substituir", "Busca terminada");
    return;
  }
  substituir(onde, onde + de.length, $("troca-para").value);
});
$("troca-todas").addEventListener("click", () => {
  const de = $("troca-de").value;
  if (!de) return;
  substituirTextoTodo($("texto").value.split(de).join($("troca-para").value));
});
$("arquivo-config").addEventListener("change", () => {
  const arquivo = $("arquivo-config").files[0];
  if (!arquivo) return;
  arquivo.text().then((texto) => {
    const dados = JSON.parse(texto);
    localStorage.setItem(CHAVE, JSON.stringify({ ...JSON.parse(localStorage.getItem(CHAVE) || "{}"), ...dados, texto: $("texto").value }));
    restaurar();
    desenhar();
  }).catch(() => avisar("Configuração", "Não consegui ler este arquivo."));
});
$("simbolos-fechar").addEventListener("click", () => $("simbolos").close());
$("inserir-simbolo").addEventListener("click", inserirSimbolo);
$("busca-simbolo").addEventListener("input", preencherSimbolos);
$("lista-simbolos").addEventListener("dblclick", inserirSimbolo);
