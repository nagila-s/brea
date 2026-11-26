import { tabelas } from "./tabelas.js";
import { classificar, preparar, resumo } from "./comandos.js?edicao=27";
import { formatar } from "./pagina.js?edicao=34";
import { contarQuebras, finalizarTexto, mesmoBraille, paginasAntesDasQuebras, paginasEsvaziadas, removerQuebras } from "./finalizar.js?edicao=3";
import { marcasPorLinha, montarFaixas } from "./faixas.js?edicao=35";
import { montarTinta, parearGrifos, relatorioTinta } from "./tinta.js?edicao=7";
import { conferirDocx, gerarDocx } from "./docx.js?edicao=4";
import { criarJanela } from "./pareada.js?edicao=41";
import {
  aoDigitarMenor,
  aoEnter,
  apagarNaBorda,
  editavel,
  ehComando,
  palavraEm,
  trocaPreservandoCodigos,
  selecaoNaFaixa,
  foraDeLinhaEscondida,
  indiceDaPosicao,
  iniciosDasLinhas,
  linhaDoIndice,
  moverLinha,
  posicaoNaFaixa,
  vizinhaEditavel,
} from "./cursor_pareado.js?edicao=38";
import { nomesPontos, traduzir, unicodeDaCela } from "./motor.js?edicao=28";
import {
  apararFim,
  centrarFisico,
  centrarPorEspacos,
  dividirLinhas,
  quadrinho,
} from "./edicao.js?edicao=2";

const CHAVE = "brauna-editor-v1";
// Nome com que o texto e as opções ficavam guardados no navegador até 26/11/2026. Na primeira
// abertura depois disso, o que estava lá passa para CHAVE (ver migrarChave).
const CHAVE_ANTERIOR = "braille-facil-editor-v1";
const $ = (id) => document.getElementById(id);

const estado = {
  nome: "sem título",
  sujo: false,
  persistTimer: 0,
  tituloTimer: 0,
  fonte: 22,
  dicionario: null,
  inibidas: new Set(),
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
  // Lin e Col são os da página braille (linhaNoStatus), não os do texto.
  if (!pareado.linhaNaPagina) {
    $("st-lin").textContent = `Lin: ${cursor.linha + 1}`;
    $("st-col").textContent = `Col: ${cursor.coluna + 1}`;
  }
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
  document.title = estado.sujo ? `* ${estado.nome} — Braúna` : `${estado.nome} — Braúna`;
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
    // A largura da vista decide o tamanho do braille; ela só é lida quando muda.
    new ResizeObserver(() => {
      pareado.largura = $("pareada").clientWidth;
      if (tamanhoDoBraille()) posicionarCursorPareado(false);
    }).observe($("pareada"));
  }
  return pareado.janela;
}

// O maior braille que cabe sem desalinhar da tinta: uma linha inteira de celas (as colunas da
// página) na metade do braille, e os pontos dentro da altura da faixa, que é a mesma da tinta.
// As proporções da cela (largura e altura dos pontos) vêm da própria fonte, medidas num canvas.
// Devolve true quando o tamanho mudou.
const FONTE_BRAILLE = '"Segoe UI Symbol", "Segoe UI", sans-serif';
let proporcoesDaCela = null;

function tamanhoDoBraille() {
  const raiz = $("pareada");
  const largura = pareado.largura ?? raiz.clientWidth;
  if (!largura) return false;
  if (!proporcoesDaCela) {
    const pincel = document.createElement("canvas").getContext("2d");
    pincel.font = `100px ${FONTE_BRAILLE}`;
    const medida = pincel.measureText("\u283f");
    proporcoesDaCela = { cela: medida.width / 100, pontos: (medida.actualBoundingBoxAscent + medida.actualBoundingBoxDescent) / 100 };
  }
  const { cela, pontos } = proporcoesDaCela;
  if (!cela || !pontos) return false;
  const colunas = pareado.formato?.colunas || 34;
  // Metade da vista, menos o recuo do lado braille (14px), a borda do meio e uma folga.
  const porLargura = (largura / 2 - 18) / (colunas * cela);
  // Os pontos ocupam até 86% da altura da faixa: sobra espaço para a seleção.
  const porAltura = (janelaPareada().alturaFaixa() * 0.86) / pontos;
  const valor = `${Math.max(10, Math.floor(Math.min(porLargura, porAltura) * 2) / 2)}px`;
  if (raiz.style.getPropertyValue("--fonte-braille") === valor) return false;
  raiz.style.setProperty("--fonte-braille", valor);
  // A largura da cela muda: o cursor, a seleção e o clique no braille medem de novo.
  pareado.medidas = null;
  return true;
}

function reconstruirPareado() {
  const area = $("texto");
  const linhas = linhasDoTexto();
  const op = opcoes();
  const formato = formatar(linhas, op, false, { semVista: true });
  const janela = janelaPareada();
  pareado.faixas = montarFaixas(linhas, formato, op);
  marcarGrifos(linhas, pareado.faixas);
  pareado.linhaNaPagina = contarLinhasNasPaginas(pareado.faixas);
  pareado.texto = area.value;
  pareado.inicios = iniciosDasLinhas(area.value);
  pareado.sujo = false;
  janela.definir(pareado.faixas, formato.colunas);
  if (pareado.sujoTotal) janela.medir();
  pareado.sujoTotal = false;
  // O desenho fica para posicionarCursorPareado, que sabe para onde a tela vai.
  pareado.formato = { colunas: formato.colunas, altura: formato.altura, paginas: formato.paginas, avisos: formato.avisos || [] };
  pareado.estrutura = formato.estrutura || [];
  atualizarPaginasCurtas(op);
  tamanhoDoBraille();
  agendarTitulo();
}

// Aviso de redistribuir (finalizar.js, paginasEsvaziadas). Compara a página que cada <P> fecha
// com a da reconstrução anterior; texto aberto agora ou opções mudadas recomeçam a conta. Fica
// numa faixa acima das páginas, sem interromper a digitação.
function atualizarPaginasCurtas(op) {
  const quebras = paginasAntesDasQuebras(pareado.estrutura);
  const chave = JSON.stringify(op);
  const comBase = !pareado.semBase && pareado.chaveDasQuebras === chave;
  pareado.paginasCurtas = comBase ? paginasEsvaziadas(pareado.quebras, quebras, pareado.paginasCurtas) : new Set();
  pareado.quebras = quebras;
  pareado.chaveDasQuebras = chave;
  pareado.semBase = false;
  mostrarAvisoDePaginas();
}

function paginasCurtas() {
  return [...(pareado.paginasCurtas || [])].sort((a, b) => a - b).map((k) => pareado.quebras[k]).filter(Boolean);
}

function mostrarAvisoDePaginas() {
  const aviso = $("aviso-paginas");
  const curtas = paginasCurtas();
  if (!curtas.length) {
    aviso.hidden = true;
    return;
  }
  const nome = (quebra) => pareado.estrutura[quebra.pagina]?.numeroTexto || String(quebra.pagina + 1);
  let texto;
  if (curtas.length === 1) {
    const [quebra] = curtas;
    texto = `A página ${nome(quebra)} ficou com ${quebra.usadas} de ${quebra.cabem} linhas antes de uma quebra <P>.`;
  } else {
    const nomes = curtas.map(nome);
    texto = `As páginas ${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]} ficaram com menos da metade das linhas antes de uma quebra <P>.`;
  }
  texto += " As quebras gravadas não se movem sozinhas: as páginas precisam ser redistribuídas.";
  const alvo = aviso.querySelector(".texto-aviso");
  if (alvo.textContent !== texto) alvo.textContent = texto;
  aviso.hidden = false;
}

// "Ver": leva o cursor ao fim da próxima página curta (depois da do cursor; volta ao começo).
function irParaPaginaCurta() {
  const curtas = paginasCurtas();
  if (!curtas.length) return;
  const atual = pareado.faixas[pareado.cursorFaixa]?.pagina ?? -1;
  const alvo = curtas.find((quebra) => quebra.pagina > atual) ?? curtas[0];
  const quebra = pareado.faixas.findIndex((faixa) => faixa.tipo === "quebra" && faixa.pagina === alvo.pagina + 1);
  const faixa = quebra >= 0 ? vizinhaVisivel(quebra, -1) : null;
  if (faixa == null) return;
  $("texto").focus({ preventScroll: true });
  irParaIndice(indiceDaPosicao(pareado.faixas, pareado.inicios, pareado.texto, { faixa, coluna: (pareado.faixas[faixa].tinta || "").length }));
  atualizarStatus();
  posicionarCursorPareado(true);
}

// Número de cada faixa dentro da sua página braille, contando o cabeçalho, as linhas de texto
// e as linhas em branco (o que vai para o papel). Comando, comentário e quebra não são linha:
// ficam com o número da linha braille que vem logo depois deles.
function contarLinhasNasPaginas(faixas) {
  const numeros = new Array(faixas.length);
  let pagina = null;
  let contadas = 0;
  faixas.forEach((faixa, indice) => {
    if (faixa.pagina !== pagina) {
      pagina = faixa.pagina;
      contadas = 0;
    }
    const linhaBraille = faixa.tipo === "texto" || faixa.tipo === "branco" || faixa.tipo === "cabecalho";
    if (linhaBraille) contadas += 1;
    numeros[indice] = linhaBraille ? contadas : contadas + 1;
  });
  return numeros;
}

function linhaNoStatus() {
  const indice = pareado.cursorFaixa;
  if (indice == null || !pareado.linhaNaPagina) return;
  $("st-lin").textContent = `Lin: ${pareado.linhaNaPagina[indice]}`;
  $("st-col").textContent = `Col: ${(pareado.cursorColuna ?? 0) + 1}`;
}

// Grifo no editor: o "*" (e o "$" do grifo duplo) fica mais claro e o que está entre eles
// aparece em negrito; no grifo duplo "$*", em negrito e itálico. A tinta de cada faixa ganha
// `estilos`, um código por coluna (1 marca, 2 negrito, 3 negrito e itálico), com o mesmo
// pareamento de asteriscos da versão tinta (tinta.js, parearGrifos).
function marcarGrifos(linhas, faixas) {
  const fixas = marcasPorLinha(linhas).map((marcas) => marcas.includes("F-"));
  const { pares } = parearGrifos(linhas, fixas);
  if (!pares.length) return;
  const porLinha = new Map();
  const daLinha = (numero) => {
    let codigos = porLinha.get(numero);
    if (!codigos) {
      codigos = new Uint8Array(linhas[numero].length);
      porLinha.set(numero, codigos);
    }
    return codigos;
  };
  for (const par of pares) {
    for (const marca of [par.abre, par.fecha]) daLinha(marca.linha).fill(1, marca.de, marca.ate);
    const tipo = par.duplo ? 3 : 2;
    for (let atual = par.abre.linha; atual <= par.fecha.linha; atual += 1) {
      const codigos = daLinha(atual);
      const de = atual === par.abre.linha ? par.abre.ate : 0;
      const ate = atual === par.fecha.linha ? par.fecha.de : linhas[atual].length;
      for (let coluna = de; coluna < ate; coluna += 1) if (!codigos[coluna]) codigos[coluna] = tipo;
    }
  }
  for (const faixa of faixas) {
    if (!faixa.trechos?.length || !faixa.tinta) continue;
    let estilos = null;
    for (const trecho of faixa.trechos) {
      const codigos = porLinha.get(trecho.linha);
      if (!codigos) continue;
      estilos ??= new Uint8Array(faixa.tinta.length);
      const fonte = linhas[trecho.linha];
      let coluna = trecho.coluna;
      for (let c = trecho.de; c < trecho.ate && coluna < trecho.fim; c += 1) {
        const largura = fonte[c] === "\t" ? 4 : 1;
        estilos.fill(codigos[c], coluna, Math.min(trecho.fim, coluna + largura));
        coluna += largura;
      }
    }
    if (!estilos || !estilos.some(Boolean)) continue;
    // O hífen do corte, fora dos trechos, acompanha o grifo da palavra partida.
    const ultima = estilos.length - 1;
    if (faixa.tinta.endsWith("-") && !estilos[ultima] && estilos[ultima - 1] >= 2) estilos[ultima] = estilos[ultima - 1];
    faixa.estilos = estilos;
    faixa.estiloChave = estilos.join("");
  }
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
  const info = preparar(linhas)[cursor.linha];
  const situacao = resumo(info);
  const pagina = (pareado.faixas[pareado.cursorFaixa]?.pagina ?? 0) + 1;
  const partes = [];
  if (!situacao.includes("×")) partes.push(`${formato.colunas}×${formato.altura}`);
  partes.push(`página ${pagina} de ${formato.paginas}`);
  if (situacao) partes.push(situacao);
  // As mensagens da paginação ficam no título, sem caixas a cada mudança.
  if (formato.avisos.length) partes.push(`⚠ ${formato.avisos.length} ${formato.avisos.length === 1 ? "aviso" : "avisos"}`);
  $("painel-titulo").textContent = partes.join(" · ");
  $("painel-titulo").title = formato.avisos.map((aviso) => aviso.texto).join("\n");
  paginacaoNoStatus(pagina - 1, info?.paginaTinta);
}

// Barra de baixo: o número da página do livro em braille (o do cabeçalho, romano nas páginas
// iniciais; também no verso, que não imprime cabeçalho) e a página em tinta que vale na linha
// do cursor (um <nnn> no meio da página braille já conta a partir dali).
function paginacaoNoStatus(indice, paginaTinta) {
  const pagina = pareado.estrutura?.[indice];
  // Página sem numeração (<T->, antes da capa) fica com traço; a contagem corrida está no topo.
  const braille = pagina?.numeroTexto || "—";
  const tinta = paginaTinta || pagina?.paginaTinta;
  $("st-pag-tinta").textContent = `Tinta: ${tinta ? String(tinta) : "—"}`;
  $("st-pag-braille").textContent = `Braille: ${braille}`;
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
    // Etiqueta de comandos fechados e traço de quebra não têm os dois lados.
    if (!elemento.querySelector(".lado-tinta")) return;
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
  // Cursor numa linha de comando ou comentário: ela se abre (fechada, é só uma etiqueta).
  janela.abrir(alvo);
  if (!janela.altura(alvo)) {
    alvo = vizinhaEditavel(pareado.faixas, posicao.faixa, 1) ?? vizinhaEditavel(pareado.faixas, posicao.faixa, -1);
  }
  if (pareado.cursorFaixa !== alvo) agendarTitulo();
  pareado.cursorFaixa = alvo;
  pareado.cursorColuna = posicao.coluna;
  linhaNoStatus();
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
  // Etiqueta de um código: o cursor não entra nele (a edição é pelo duplo clique).
  if (evento.target.closest(".etiqueta")) return null;
  const linha = evento.target.closest(".faixa");
  if (!linha || linha.dataset.i == null) return null;
  const indice = Number(linha.dataset.i);
  const faixa = pareado.faixas[indice];
  const quebraAberta = faixa?.tipo === "quebra" && faixa.linha != null;
  if ((!editavel(faixa) && !quebraAberta) || !janelaPareada().altura(indice)) {
    const vizinha = vizinhaVisivel(indice, 1) ?? vizinhaVisivel(indice, -1);
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

// Próxima faixa onde o cursor pode ficar, pulando o que não ocupa linha (os códigos fechados).
function vizinhaVisivel(indice, passo) {
  let proxima = vizinhaEditavel(pareado.faixas, indice, passo);
  while (proxima != null && !janelaPareada().altura(proxima)) proxima = vizinhaEditavel(pareado.faixas, proxima, passo);
  return proxima;
}

// Troca um trecho do texto pelo execCommand, que deixa a troca no desfazer do navegador.
function trocarNoTexto(troca) {
  const area = $("texto");
  area.setSelectionRange(troca.de, troca.ate);
  const feito = troca.texto ? document.execCommand("insertText", false, troca.texto) : document.execCommand("delete");
  if (!feito) {
    area.setRangeText(troca.texto, troca.de, troca.ate, "end");
    area.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function teclaPareada(evento) {
  const area = $("texto");
  if (pareado.sujo || pareado.texto !== area.value) reconstruirPareado();
  const vertical = evento.key === "ArrowUp" || evento.key === "ArrowDown";
  if (!vertical) pareado.colunaAlvo = null;

  // Backspace e Delete na borda de uma linha, também com Alt ou Ctrl (que apagariam a palavra
  // e a quebra de linha junto): os códigos ao lado não mudam (ver apagarNaBorda).
  if ((evento.key === "Backspace" || evento.key === "Delete") && area.selectionStart === area.selectionEnd && !area.readOnly) {
    const passo = evento.key === "Backspace" ? -1 : 1;
    const apagar = apagarNaBorda(pareado.faixas, pareado.inicios, pareado.texto, area.selectionStart, passo);
    if (!apagar) return;
    evento.preventDefault();
    if (apagar.de === apagar.ate) return;
    trocarNoTexto({ de: apagar.de, ate: apagar.ate, texto: "" });
    cursorForaDoCodigo(apagar.cursor, passo);
    return;
  }
  if (evento.ctrlKey || evento.altKey || evento.metaKey) return;

  // Código aberto pelo duplo clique: Enter fecha (sem abrir linha nova), Esc fecha desfazendo.
  if ((evento.key === "Enter" || evento.key === "Escape") && pareado.codigoAberto && !evento.isComposing) {
    evento.preventDefault();
    fecharCodigo(evento.key === "Escape");
    return;
  }

  if (vertical || evento.key === "PageUp" || evento.key === "PageDown") {
    evento.preventDefault();
    const atual = posicaoPareada(indiceDoCursor());
    const alvo = pareado.colunaAlvo ?? atual.coluna;
    const passo = evento.key === "ArrowUp" || evento.key === "PageUp" ? -1 : 1;
    const alturaFaixa = janelaPareada().alturaFaixa();
    const vezes = vertical ? 1 : Math.max(1, Math.floor($("pareada").clientHeight / alturaFaixa) - 2);
    let destino = atual.faixa;
    for (let i = 0; i < vezes; i += 1) {
      // Pula o que não ocupa linha (comandos e comentários fechados), como no braille.
      const proxima = vizinhaVisivel(destino, passo);
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

  if (evento.key === "Enter" && !evento.shiftKey && !evento.isComposing && !area.readOnly && area.selectionStart === area.selectionEnd) {
    // Enter parte o parágrafo com o recuo dele (ver aoEnter); Shift+Enter é a quebra pura.
    evento.preventDefault();
    trocarNoTexto(aoEnter(area.value, area.selectionStart, opcoes()));
    return;
  }

}

// Qualquer ação (menu, diálogo, busca, colar...) mexe só no textarea. Depois de cada
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

// Depois de uma troca feita pelo programa: põe o cursor em `indice`, fora das linhas de código.
function cursorForaDoCodigo(indice, direcao) {
  const area = $("texto");
  if (pareado.sujo || pareado.texto !== area.value) reconstruirPareado();
  const fora = foraDeLinhaEscondida(pareado.faixas, pareado.inicios, pareado.texto, Math.min(indice, area.value.length), direcao);
  area.setSelectionRange(fora, fora);
  pareado.ultimoIndice = fora;
}

// Apagar ou digitar por cima de uma seleção que pega códigos: o texto sai e os códigos ficam
// (ver trocaPreservandoCodigos). Devolve false quando a troca comum serve.
function trocarPreservandoCodigos(de, ate, novo) {
  const troca = trocaPreservandoCodigos($("texto").value, de, ate, novo);
  if (!troca) return false;
  estado.trocaDoPrograma = true;
  try {
    trocarNoTexto(troca);
  } finally {
    estado.trocaDoPrograma = false;
  }
  cursorForaDoCodigo(troca.cursor, -1);
  return true;
}

// Depois de um movimento nativo (setas, digitação): tira o cursor das linhas de código. Fica só
// a linha em que o cursor já estava, que é um código sendo escrito: ele vira etiqueta quando o
// cursor sai dela.
function aposMovimentoPareado() {
  const area = $("texto");
  if (pareado.sujo || pareado.texto !== area.value) reconstruirPareado();
  if (area.selectionStart === area.selectionEnd) {
    const indice = area.selectionStart;
    const direcao = Math.sign(indice - pareado.ultimoIndice) || 1;
    const aberta = pareado.codigoAberto?.linha ?? linhaDoIndice(pareado.inicios, Math.min(pareado.ultimoIndice, pareado.texto.length));
    let fora = foraDeLinhaEscondida(pareado.faixas, pareado.inicios, pareado.texto, indice, direcao, aberta);
    // Saiu do código aberto pelo duplo clique: ele fecha (e sai do texto, se ficou vazio).
    if (pareado.codigoAberto && linhaDoIndice(pareado.inicios, fora) !== pareado.codigoAberto.linha) {
      area.setSelectionRange(fora, fora);
      if (tirarCodigoVazio()) {
        reconstruirPareado();
        fora = foraDeLinhaEscondida(pareado.faixas, pareado.inicios, pareado.texto, area.selectionStart, direcao);
      }
    }
    if (fora !== indice) area.setSelectionRange(fora, fora);
    pareado.ultimoIndice = fora;
  }
  posicionarCursorPareado(true);
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
    // A opção passou a vir desligada; o valor salvo antes disso (que era só o padrão) não vale.
    brancasV2: true,
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

// Passa o que estava guardado com o nome anterior para o nome novo, uma vez. O anterior só é
// apagado depois que o novo foi gravado.
function migrarChave() {
  try {
    const anterior = localStorage.getItem(CHAVE_ANTERIOR);
    if (anterior == null) return;
    if (localStorage.getItem(CHAVE) == null) localStorage.setItem(CHAVE, anterior);
    if (localStorage.getItem(CHAVE) != null) localStorage.removeItem(CHAVE_ANTERIOR);
  } catch {
    /* sem acesso ao armazenamento: fica tudo como estava */
  }
}

function restaurar() {
  migrarChave();
  try {
    const dados = JSON.parse(localStorage.getItem(CHAVE) || "null");
    if (!dados) return;
    estado.nome = dados.nome || "sem título";
    $("texto").value = dados.texto || "";
    pareado.semBase = true;
    if (dados.codigo === "antigo" || dados.codigo === "unificado") $("codigo").value = dados.codigo;
    $("matematica").checked = dados.matematica !== false;
    $("maiuscula").checked = dados.maiuscula !== false;
    $("maiuscula-palavra").checked = dados.maiusculaPalavra !== false;
    $("numero").checked = dados.numero !== false;
    if (typeof dados.comTitulo === "boolean") $("com-titulo").checked = dados.comTitulo;
    if (typeof dados.tiraBrancas === "boolean" && dados.brancasV2) $("tira-brancas").checked = dados.tiraBrancas;
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
  // O cursor começa na primeira linha que não é código: dentro de um <T-> ele abriria a linha.
  const inicios = iniciosDasLinhas(area.value);
  let linha = 0;
  while (linha < inicios.length - 1 && ehComando(linhaDoTexto(area.value, inicios, linha))) linha += 1;
  area.setSelectionRange(inicios[linha], inicios[linha]);
  $("pareada").scrollTop = 0;
  pareado.ultimoIndice = inicios[linha];
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
  desenhar();
}

function novo() {
  if ($("texto").value && estado.sujo) {
    if (!window.confirm("Começar um texto novo? O texto atual continua guardado neste navegador até você abrir outro.")) return;
  }
  $("texto").value = "";
  pareado.semBase = true;
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
      const de = area.selectionStart;
      const ate = area.selectionEnd;
      if (ate <= de) return;
      await navigator.clipboard.writeText(area.value.slice(de, ate));
      // Pelo trocarNoTexto, o recortar e o colar entram no Ctrl+Z.
      if (acao === "recortar" && !trocarPreservandoCodigos(de, ate, "")) trocarNoTexto({ de, ate, texto: "" });
      return;
    }
    if (acao === "colar") {
      const trecho = await navigator.clipboard.readText();
      if (trecho && !trocarPreservandoCodigos(area.selectionStart, area.selectionEnd, trecho)) {
        trocarNoTexto({ de: area.selectionStart, ate: area.selectionEnd, texto: trecho });
      }
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

// Toda troca feita por botão ou menu passa pelo histórico de desfazer do navegador (Ctrl+Z).
// Com setRangeText ela ficava de fora, e o Ctrl+Z seguinte desfazia outra coisa.
function substituir(inicio, fim, pedaco) {
  const area = $("texto");
  area.focus();
  estado.trocaDoPrograma = true;
  try {
    trocarNoTexto({ de: inicio, ate: fim, texto: pedaco });
  } finally {
    estado.trocaDoPrograma = false;
  }
  estado.sujo = true;
  desenhar();
  persistir();
}

// A linha do texto onde está a posição é um comando (<t …>, <R+>, <P>, <12>, comentário)?
function linhaDeComando(indice) {
  const valor = $("texto").value;
  const ini = valor.lastIndexOf("\n", indice - 1) + 1;
  let fim = valor.indexOf("\n", indice);
  if (fim < 0) fim = valor.length;
  const linha = valor.slice(ini, fim);
  return linha.startsWith("<") && Boolean(classificar(linha.replaceAll("\t", "    ")));
}

// As marcas de texto (grifo, parênteses auxiliares, informática, nota) não entram numa linha
// de comando: o comando deixaria de começar com "<" e pararia de valer.
function foraDeComando() {
  const area = $("texto");
  if (!linhaDeComando(area.selectionStart) && !linhaDeComando(area.selectionEnd)) return true;
  avisar("Linha de comando", "O cursor está numa linha de comando. Ponha o cursor (ou selecione o trecho) no texto e tente de novo.");
  return false;
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
  if (!foraDeComando()) return;
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

// O texto todo trocado de uma vez (conversões): o desfazer é o do próprio editor.
function substituirTextoTodo(texto) {
  trocarTextoComDesfazer(texto);
  estado.sujo = true;
  persistir();
}

function colunasAtuais() {
  const info = preparar(linhasDoTexto()).find((item) => item.colunas);
  return info?.colunas || opcoes().colunasPadrao || 34;
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
  pareado.semBase = true;
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

// Versão tinta: a versão em fonte ampliada, linha a linha igual ao braille. A tinta sai do
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

function aplicarQuadrinho(tipo) {
  const { ini, fim, valor } = faixaLinhas();
  const linhas = valor.slice(ini, fim).split("\n");
  substituir(ini, fim, quadrinho(linhas, tipo).join("\n"));
}

// Centralizar e alinhar à esquerda as linhas da seleção. No texto que o braille ajusta, a
// linha centralizada começa com 10 ou mais espaços (o braille a centraliza) e a linha na
// margem começa com um espaço (abre parágrafo sem recuo); no <F->, onde o espaço é literal,
// a centralização é física, pelas colunas da página, e alinhar à esquerda tira os espaços.
function alinharLinhas(modo) {
  const { ini, fim, valor } = faixaLinhas();
  const primeira = valor.slice(0, ini).split("\n").length - 1;
  const marcas = marcasPorLinha(linhasDoTexto());
  const colunas = colunasAtuais();
  const linhas = valor.slice(ini, fim).split("\n").map((linha, indice) => {
    const miolo = linha.trim();
    if (!miolo || linha.startsWith("<")) return linha;
    const fixa = marcas[primeira + indice]?.includes("F-");
    if (modo === "centro") return fixa ? centrarFisico(linha, colunas) : centrarPorEspacos(linha);
    if (fixa) return miolo;
    const recuo = linha.length - linha.trimStart().length;
    return recuo >= 10 ? ` ${miolo}` : linha;
  });
  const novo = linhas.join("\n");
  if (novo === valor.slice(ini, fim)) return;
  $("texto").focus();
  trocarNoTexto({ de: ini, ate: fim, texto: novo });
  $("texto").setSelectionRange(ini, ini + novo.length);
}

// Negrito e itálico: o braille tem um grifo só (*) e o grifo duplo ($*). Negrito ou itálico
// sozinho grava o *; os dois juntos, o $*. Cada botão liga e desliga o seu. Como o * não diz
// qual dos dois foi pedido, o último grifo aplicado fica lembrado enquanto o trecho não muda.
const PALAVRA = /[\p{L}\p{N}-]/u;

function aplicarGrifo(tipo) {
  if (!foraDeComando()) return;
  const area = $("texto");
  const valor = area.value;
  let ini = area.selectionStart ?? 0;
  let fim = area.selectionEnd ?? ini;
  if (ini === fim) {
    while (ini > 0 && PALAVRA.test(valor[ini - 1])) ini -= 1;
    while (fim < valor.length && PALAVRA.test(valor[fim])) fim += 1;
  }
  if (ini === fim) {
    envolverSelecao("*", "*");
    return;
  }
  // A seleção pode incluir as marcas: o trecho grifado é o de dentro.
  const selecionado = valor.slice(ini, fim);
  if (selecionado.length > 4 && selecionado.startsWith("$*") && selecionado.endsWith("$*")) {
    ini += 2;
    fim -= 2;
  } else if (selecionado.length > 2 && /^\*[^*]/.test(selecionado) && /[^*]\*$/.test(selecionado)) {
    ini += 1;
    fim -= 1;
  }
  const duplo = valor.slice(ini - 2, ini) === "$*" && valor.slice(fim, fim + 2) === "$*";
  const simples = !duplo && valor[ini - 1] === "*" && valor[fim] === "*";
  let negrito = duplo || simples;
  let italico = duplo;
  const lembrado = estado.ultimoGrifo;
  if (simples && lembrado && lembrado.ini === ini && lembrado.fim === fim && lembrado.valor === valor) {
    ({ negrito, italico } = lembrado);
  }
  if (tipo === "negrito") negrito = !negrito;
  else italico = !italico;
  const largura = duplo ? 2 : simples ? 1 : 0;
  const marca = negrito && italico ? "$*" : negrito || italico ? "*" : "";
  const miolo = valor.slice(ini, fim);
  area.focus();
  trocarNoTexto({ de: ini - largura, ate: fim + largura, texto: `${marca}${miolo}${marca}` });
  const novoIni = ini - largura + marca.length;
  area.setSelectionRange(novoIni, novoIni + miolo.length);
  estado.ultimoGrifo = { ini: novoIni, fim: novoIni + miolo.length, negrito, italico, valor: area.value };
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

function acao(nome) {
  fecharMenus();
  const variantes = { "var-1": "<M| >", "var-2": "<Mé >", "var-3": "<M|l >" };
  const separadores = {
    "sep-grande": "               õxxxxxxxxxxxxxxxxxxxxxxo",
    "sep-media": "               õoõoõoõoõoõoõoõoõoõoõoõo",
    "sep-pequena": "               ::::::::::::::::::::::::",
  };
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
  else if (nome === "selecionar") {
    $("texto").focus();
    $("texto").select();
  } else if (nome === "localizar") $("localizar").showModal();
  else if (nome === "substituir") $("substituir-dialogo").showModal();
  else if (nome === "pagina") inserirNaLinha("<P>");
  else if (nome === "recuo-codigo") envolver("<R+>", "<R->");
  else if (nome === "ajuste-codigo") envolver("<F->", "<F+>");
  else if (nome === "silabas-codigo") envolver("<S->", "<S+>");
  else if (nome === "ingles-codigo") envolver("<I+>", "<I->");
  else if (nome === "centrar") alinharLinhas("centro");
  else if (nome === "alinhar-esquerda") alinharLinhas("esquerda");
  else if (nome === "pag-tinta") {
    const numero = window.prompt("Número da página em tinta", "");
    if (numero && /^\d+$/.test(numero.trim())) inserirNaLinha(`<${numero.trim()}>`);
  } else if (nome === "anotacao") {
    const nota = window.prompt("Anotar", "");
    if (nota && nota.trim()) inserirNaLinha(`<*** ${nota.trim()} ***>`);
  } else if (nome === "negrito" || nome === "italico") aplicarGrifo(nome);
  else if (nome === "informatica") envolverSelecao("~,", "~,");
  else if (nome === "parenteses") envolverSelecao("?", "*");
  else if (nome === "nota-transcricao") {
    const area = $("texto");
    if (area.selectionEnd > area.selectionStart) envolverSelecao("\n_`[", "_`]\n");
    else envolverSelecao("_`[", "_`]");
  } else if (variantes[nome]) envolver(variantes[nome], "<M>");
  else if (separadores[nome]) inserirNaLinha(separadores[nome]);
  else if (nome === "quadrinho") $("quadro").showModal();
  else if (nome === "quadrinho-ajuda") aplicarQuadrinho("ajuda");
  else if (nome === "configurar") $("config").showModal();
  else if (nome === "fonte") {
    const tamanho = window.prompt("Tamanho da fonte na tela", String(estado.fonte));
    if (tamanho && Number(tamanho)) {
      aplicarFonte(tamanho);
      desenharModoPareado(false);
      persistir();
    }
  } else if (nome === "revisor") {
    const ligado = !$("texto").readOnly;
    $("texto").readOnly = ligado;
    $("pareada").classList.toggle("revisor", ligado);
    $("st-revisor").textContent = ligado ? "Modo de revisão - apenas leitura" : "";
  } else if (nome === "simbolos") {
    preencherSimbolos();
    $("simbolos").showModal();
  } else if (nome === "tabela") {
    preencherTabela();
    $("tabela").showModal();
  } else if (nome === "codigo-unificado" || nome === "codigo-antigo") {
    $("codigo").value = nome === "codigo-antigo" ? "antigo" : "unificado";
    $("codigo").dispatchEvent(new Event("change"));
  } else if (nome === "minuscula" || nome === "maiuscula-texto") {
    const area = $("texto");
    const ini = area.selectionStart;
    const fim = area.selectionEnd;
    if (fim <= ini) return;
    const trecho = area.value.slice(ini, fim);
    substituir(ini, fim, nome === "minuscula" ? trecho.toLocaleUpperCase("pt") : trecho.toLocaleLowerCase("pt"));
    area.setSelectionRange(ini, fim);
  } else if (nome === "tinta-word") exportarTinta();
  else if (nome === "salvar-config") {
    const dados = JSON.parse(localStorage.getItem(CHAVE) || "{}");
    delete dados.texto;
    baixar("brauna-config.json", JSON.stringify(dados, null, 2), "application/json");
  } else if (nome === "carregar-config") $("arquivo-config").click();
  else if (nome === "impressora") {
    avisar("Impressora Braille", "Este editor ainda não gera o arquivo para a impressora braille.");
  } else if (nome === "ortografia-config" || nome === "carregar-dic" || nome === "liberar-dic" || nome === "procurar-erro" || nome === "alternativas" || nome === "acrescentar" || nome === "inibir") {
    ortografia(nome);
  } else if (nome === "texto-tabela") {
    avisar("Texto para Tabela", "Texto para Tabela ainda não está pronto: vai ser refeito.");
  } else if (nome === "procurar-atualizacao" || nome === "instalar-atualizacao") {
    avisar("Braúna", "Em breve!!!");
  } else if (nome === "atualizacao-auto") {
    estado.atualizacaoAuto = !estado.atualizacaoAuto;
    persistir();
    avisar("Atualizações automáticas", estado.atualizacaoAuto ? "A preferência ficou ligada. Este editor não consulta a rede." : "A preferência ficou desligada.");
  } else if (nome === "sobre") {
    avisar("Braúna", "Braúna, editor braille: a tinta fica à esquerda e o braille à direita, linha a linha.");
  }
}

function ortografia(nome) {
  if (nome === "ortografia-config") {
    avisar("Verificador ortográfico", "O verificador usa um dicionário em forma de lista de palavras. Em Carregar dicionário dá para abrir uma lista, uma palavra por linha ou separada por espaço.");
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
          avisar("Dicionário", "Este arquivo não é uma lista de palavras e não foi lido.");
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
    avisar("Outras alternativas", "Ainda não há sugestões de alternativas.");
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
// Numa linha vazia, o "<" começa um comando na coluna 1 (sai o recuo que o Enter pôs). No
// beforeinput, vale para qualquer jeito de digitar, inclusive um comando inteiro de uma vez.
$("texto").addEventListener("beforeinput", (evento) => {
  const area = $("texto");
  if (estado.trocaDoPrograma) return;
  // Digitar ou apagar por cima de uma seleção que pega códigos: eles ficam no lugar.
  const tipo = evento.inputType;
  if (area.selectionStart !== area.selectionEnd && !area.readOnly && (tipo.startsWith("delete") || tipo === "insertText" || tipo === "insertLineBreak" || tipo === "insertParagraph")) {
    const novo = tipo.startsWith("delete") ? "" : tipo === "insertText" ? evento.data ?? "" : "\n";
    if (trocarPreservandoCodigos(area.selectionStart, area.selectionEnd, novo)) {
      evento.preventDefault();
      return;
    }
  }
  if (evento.inputType !== "insertText" || !evento.data?.startsWith("<") || area.readOnly || area.selectionStart !== area.selectionEnd) return;
  const troca = aoDigitarMenor(area.value, area.selectionStart, evento.data);
  if (!troca) return;
  evento.preventDefault();
  trocarNoTexto(troca);
});
// Recortar e colar pelo teclado (Ctrl+X, Ctrl+V) com códigos na seleção: o texto sai, os
// códigos ficam. O recortado vai inteiro para a área de transferência.
$("texto").addEventListener("cut", (evento) => {
  const area = $("texto");
  const { selectionStart: de, selectionEnd: ate } = area;
  if (area.readOnly || !trocaPreservandoCodigos(area.value, de, ate, "")) return;
  evento.preventDefault();
  evento.clipboardData.setData("text/plain", area.value.slice(de, ate));
  trocarPreservandoCodigos(de, ate, "");
});
$("texto").addEventListener("paste", (evento) => {
  const area = $("texto");
  const trecho = evento.clipboardData?.getData("text/plain") ?? "";
  if (area.readOnly || !trecho) return;
  if (trocarPreservandoCodigos(area.selectionStart, area.selectionEnd, trecho.replace(/\r\n?/g, "\n"))) evento.preventDefault();
});
// Desfazer e refazer selecionam o trecho que voltou; se ele termina numa linha de código (um
// código arrastado, um <P> apagado), o cursor sai dela, para o código não ficar aberto.
$("texto").addEventListener("input", (evento) => {
  if (evento.inputType !== "historyUndo" && evento.inputType !== "historyRedo") return;
  if (pareado.codigoAberto) return;
  const area = $("texto");
  const fim = area.selectionEnd;
  const ini = area.value.lastIndexOf("\n", fim - 1) + 1;
  let ate = area.value.indexOf("\n", fim);
  if (ate < 0) ate = area.value.length;
  if (ehComando(area.value.slice(ini, ate))) cursorForaDoCodigo(fim, 1);
});
$("aviso-paginas-ver").addEventListener("click", irParaPaginaCurta);
$("aviso-paginas-fechar").addEventListener("click", () => {
  pareado.paginasCurtas = new Set();
  mostrarAvisoDePaginas();
  $("texto").focus({ preventScroll: true });
});
for (const evento of ["click", "keyup", "change", "input"]) document.addEventListener(evento, sincronizarPareado);
document.addEventListener("close", sincronizarPareado, true);
// O Chrome zera a seleção do textarea ao fechar um diálogo e devolver o foco a ele, quando o
// texto mudou com o diálogo aberto (símbolos...). Guarda a seleção e devolve.
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

// Os atalhos do menu do botão direito seguem o sistema (⌘ no Mac, Ctrl+ no Windows).
if (!/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) {
  for (const atalho of document.querySelectorAll("#menu-contexto .atalho")) atalho.textContent = atalho.textContent.replace("⌘", "Ctrl+");
}

// Botão direito no editor: recortar, copiar, colar e selecionar tudo. Clicar fora da seleção
// leva o cursor para lá antes, como num editor comum.
$("pareada").addEventListener("contextmenu", (evento) => {
  evento.preventDefault();
  fecharMenus();
  const area = $("texto");
  const indice = indiceDoClique(evento);
  if (indice != null && (indice < area.selectionStart || indice > area.selectionEnd)) {
    area.focus({ preventScroll: true });
    irParaIndice(indice);
    atualizarStatus();
    posicionarCursorPareado(true);
  }
  const menu = $("menu-contexto");
  const vazio = area.selectionEnd <= area.selectionStart;
  menu.querySelector("[data-acao=recortar]").disabled = vazio || area.readOnly;
  menu.querySelector("[data-acao=copiar]").disabled = vazio;
  menu.querySelector("[data-acao=colar]").disabled = area.readOnly;
  menu.hidden = false;
  const largura = menu.offsetWidth;
  const altura = menu.offsetHeight;
  menu.style.left = `${Math.min(evento.clientX, window.innerWidth - largura - 4)}px`;
  menu.style.top = `${Math.min(evento.clientY, window.innerHeight - altura - 4)}px`;
});

// Códigos (<P>, <t título>, <R+>, comentários...) não mudam ao editar o texto. Para alterar um,
// duplo clique na etiqueta dele (ou no rótulo do <P>): a linha do código abre ali mesmo, na
// página, com o cursor no fim. Enter ou Esc (que desfaz o que foi mudado) fecham; sair da linha
// também fecha. Esvaziada, a linha sai do texto junto com o código.
function codigoNoClique(alvo) {
  const etiqueta = alvo.closest(".etiqueta");
  if (etiqueta) return pareado.faixas[Number(etiqueta.dataset.alvo)]?.linha ?? null;
  const quebra = alvo.closest(".faixa-quebra");
  if (quebra && quebra.dataset.linha != null) return Number(quebra.dataset.linha);
  return null;
}

function linhaDoTexto(valor, inicios, linha) {
  return valor.slice(inicios[linha], (inicios[linha + 1] ?? valor.length + 1) - 1);
}

function abrirCodigo(linha) {
  const area = $("texto");
  area.focus({ preventScroll: true });
  if (area.readOnly) return;
  if (pareado.sujo || pareado.texto !== area.value) reconstruirPareado();
  const inicios = pareado.inicios;
  if (inicios[linha] == null) return;
  const original = linhaDoTexto(area.value, inicios, linha);
  pareado.codigoAberto = { linha, original, linhas: inicios.length };
  const fim = inicios[linha] + original.length;
  area.setSelectionRange(fim, fim);
  pareado.ultimoIndice = fim;
  pareado.colunaAlvo = null;
  atualizarStatus();
  posicionarCursorPareado(true);
}

// O código aberto ficou vazio? Tira a linha. Só quando o número de linhas é o mesmo de quando
// abriu: senão a linha `linha` pode já ser outra. Devolve a troca feita (ou null).
function tirarCodigoVazio() {
  const aberto = pareado.codigoAberto;
  pareado.codigoAberto = null;
  const area = $("texto");
  const inicios = iniciosDasLinhas(area.value);
  if (!aberto || inicios.length !== aberto.linhas || linhaDoTexto(area.value, inicios, aberto.linha).trim() !== "") return null;
  const de = inicios[aberto.linha + 1] != null ? inicios[aberto.linha] : Math.max(0, inicios[aberto.linha] - 1);
  const ate = inicios[aberto.linha + 1] ?? area.value.length;
  const cursor = area.selectionStart;
  estado.trocaDoPrograma = true;
  try {
    trocarNoTexto({ de, ate, texto: "" });
  } finally {
    estado.trocaDoPrograma = false;
  }
  const depois = cursor >= ate ? cursor - (ate - de) : Math.min(cursor, de);
  area.setSelectionRange(depois, depois);
  return { de, ate };
}

// Enter ou Esc no código aberto: fecha, e o cursor desce para a linha seguinte (ou sobe, se o
// código era a última linha). Esc devolve o texto que o código tinha ao abrir.
function fecharCodigo(desfazer) {
  const aberto = pareado.codigoAberto;
  const area = $("texto");
  let inicios = iniciosDasLinhas(area.value);
  if (desfazer && inicios.length === aberto.linhas) {
    const atual = linhaDoTexto(area.value, inicios, aberto.linha);
    if (atual !== aberto.original) {
      estado.trocaDoPrograma = true;
      try {
        trocarNoTexto({ de: inicios[aberto.linha], ate: inicios[aberto.linha] + atual.length, texto: aberto.original });
      } finally {
        estado.trocaDoPrograma = false;
      }
    }
  }
  const tirada = tirarCodigoVazio();
  inicios = iniciosDasLinhas(area.value);
  if (tirada) {
    cursorForaDoCodigo(tirada.de, tirada.de < area.value.length ? 1 : -1);
  } else if (inicios[aberto.linha + 1] != null) {
    cursorForaDoCodigo(inicios[aberto.linha + 1], 1);
  } else {
    cursorForaDoCodigo(Math.max(0, inicios[aberto.linha] - 1), -1);
  }
  atualizarStatus();
  posicionarCursorPareado(true);
}

// Arrastar um código: segurar a etiqueta (ou o rótulo do <P>) e soltar entre duas linhas. O
// código vai inteiro para lá, numa linha só dele, antes ou depois da linha do texto apontada
// (nunca no meio de um parágrafo). Uma linha amarela mostra onde ele vai cair. Um passo do Ctrl+Z.
const arrastoCodigo = { linha: null, x: 0, y: 0, ativo: false, destino: null, marca: null };

const primeiraLinhaDaFaixa = (faixa) => (faixa?.trechos?.length ? faixa.trechos[0].linha : faixa?.linha ?? null);
const ultimaLinhaDaFaixa = (faixa) => (faixa?.trechos?.length ? faixa.trechos[faixa.trechos.length - 1].linha : faixa?.linha ?? null);

// A linha do texto antes da qual o código entra, pelo ponto (x, y) da tela; null fora do editor.
function destinoDoCodigo(x, y) {
  const raiz = $("pareada");
  const caixa = raiz.getBoundingClientRect();
  const alvo = document.elementFromPoint(Math.min(Math.max(x, caixa.left + 2), caixa.right - 2), Math.min(Math.max(y, caixa.top + 2), caixa.bottom - 2));
  if (!alvo || !raiz.contains(alvo)) return null;
  const etiqueta = alvo.closest(".etiqueta");
  if (etiqueta) return pareado.faixas[Number(etiqueta.dataset.alvo)]?.linha ?? null;
  const elemento = alvo.closest(".faixa");
  if (!elemento || elemento.dataset.i == null) return null;
  const indice = Number(elemento.dataset.i);
  const faixa = pareado.faixas[indice];
  // Cabeçalho e quebra automática: o código vai para o começo da página.
  if (primeiraLinhaDaFaixa(faixa) == null) {
    const proxima = vizinhaVisivel(indice, 1);
    return proxima == null ? pareado.inicios.length : primeiraLinhaDaFaixa(pareado.faixas[proxima]);
  }
  const caixaDaFaixa = elemento.getBoundingClientRect();
  const cima = y < caixaDaFaixa.top + caixaDaFaixa.height / 2;
  return cima ? primeiraLinhaDaFaixa(faixa) : ultimaLinhaDaFaixa(faixa) + 1;
}

// A linha amarela fica no topo da primeira faixa que mostra a linha `destino` (ou o que vem
// depois dela).
function marcarDestino(destino) {
  const janela = janelaPareada();
  let indice = pareado.faixas.findIndex((faixa) => (faixa.linha ?? -1) >= destino || faixa.trechos?.some((trecho) => trecho.linha >= destino));
  if (indice < 0) indice = pareado.faixas.length;
  if (!arrastoCodigo.marca) {
    arrastoCodigo.marca = document.createElement("div");
    arrastoCodigo.marca.className = "destino-codigo";
  }
  if (!arrastoCodigo.marca.isConnected) $("pareada").append(arrastoCodigo.marca);
  arrastoCodigo.marca.style.top = `${janela.topo(indice)}px`;
}

function soltarCodigo() {
  const { linha, destino } = arrastoCodigo;
  const area = $("texto");
  const troca = destino == null ? null : moverLinha(area.value, linha, destino);
  if (!troca) return;
  estado.trocaDoPrograma = true;
  try {
    trocarNoTexto(troca);
  } finally {
    estado.trocaDoPrograma = false;
  }
  // O cursor vai para a linha logo depois do código, onde ele caiu: a tela segue o cursor, e
  // deixá-lo onde estava (no começo do livro, por exemplo) levava a tela para longe.
  const n = Math.abs(troca.desloca);
  const depois = troca.desloca > 0 ? troca.de + n : troca.ate + 1;
  if (depois <= area.value.length) cursorForaDoCodigo(depois, 1);
  else cursorForaDoCodigo(Math.max(0, troca.ate - n), -1);
  atualizarStatus();
  posicionarCursorPareado(true);
}

window.addEventListener("mousemove", (evento) => {
  if (arrastoCodigo.linha == null) return;
  if (!(evento.buttons & 1)) {
    arrastoCodigo.linha = null;
    return;
  }
  const raiz = $("pareada");
  if (!arrastoCodigo.ativo) {
    if (Math.hypot(evento.clientX - arrastoCodigo.x, evento.clientY - arrastoCodigo.y) < 5) return;
    arrastoCodigo.ativo = true;
    raiz.classList.add("arrastando-codigo");
  }
  // Perto da borda de cima ou de baixo, a tela rola.
  const caixa = raiz.getBoundingClientRect();
  if (evento.clientY < caixa.top + 24) raiz.scrollTop -= 20;
  else if (evento.clientY > caixa.bottom - 24) raiz.scrollTop += 20;
  janelaPareada().desenhar();
  arrastoCodigo.destino = destinoDoCodigo(evento.clientX, evento.clientY);
  if (arrastoCodigo.destino == null) arrastoCodigo.marca?.remove();
  else marcarDestino(arrastoCodigo.destino);
});
window.addEventListener("mouseup", () => {
  if (arrastoCodigo.linha == null) return;
  const ativo = arrastoCodigo.ativo;
  $("pareada").classList.remove("arrastando-codigo");
  arrastoCodigo.marca?.remove();
  if (ativo) soltarCodigo();
  arrastoCodigo.linha = null;
  arrastoCodigo.ativo = false;
});

$("pareada").addEventListener("mousedown", (evento) => {
  if (evento.button !== 0) return;
  const codigo = codigoNoClique(evento.target);
  if (codigo != null) {
    // Um clique não faz nada (o cursor não entra no código); o segundo abre a linha dele.
    // Segurar e arrastar leva o código para outro lugar.
    evento.preventDefault();
    if (evento.detail >= 2) abrirCodigo(codigo);
    else {
      $("texto").focus({ preventScroll: true });
      Object.assign(arrastoCodigo, { linha: codigo, x: evento.clientX, y: evento.clientY, ativo: false, destino: null });
    }
    return;
  }
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
// Configurar > Codificação: o menu marca a escolhida; o select escondido guarda o valor.
function marcarCodificacao() {
  const antigo = $("codigo").value === "antigo";
  document.querySelector("[data-acao=codigo-antigo]").setAttribute("aria-checked", String(antigo));
  document.querySelector("[data-acao=codigo-unificado]").setAttribute("aria-checked", String(!antigo));
}
marcarCodificacao();
$("codigo").addEventListener("change", () => {
  marcarCodificacao();
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
    pareado.semBase = true;
    estado.nome = arquivo.name;
    estado.sujo = false;
    irAoInicio();
    desenhar(true);
    persistir();
  });
});

document.addEventListener("keydown", (evento) => {
  if (evento.ctrlKey && evento.key.toLowerCase() === "f") {
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
$("quadro-cancela").addEventListener("click", () => $("quadro").close());
$("quadro-ok").addEventListener("click", () => {
  const tipo = document.querySelector("input[name=quadro]:checked")?.value || "padrao";
  $("quadro").close();
  aplicarQuadrinho(tipo);
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
