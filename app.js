import { tabelas } from "./tabelas.js";
import { classificar, preparar, resumo } from "./comandos.js?edicao=24";
import { formatar } from "./pagina.js?edicao=24";
import { caractereMeta, metaDePontos, nomesPontos, traduzir, unicodeDaCela } from "./motor.js?edicao=24";
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
  timer: 0,
  quadro: 0,
  persistTimer: 0,
  formato: null,
  formatoTinta: false,
  formatoSujo: true,
  rolagemVista: 0,
  rolagemTexto: 0,
  quadroTexto: 0,
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

function posicao() {
  const area = $("texto");
  const ate = area.selectionStart;
  const antes = area.value.slice(0, ate);
  const partes = antes.split("\n");
  return {
    linha: partes.length - 1,
    coluna: partes[partes.length - 1].length,
    selecionados: area.selectionEnd - area.selectionStart,
    total: linhasDoTexto().length,
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

// As duas colunas rolam juntas. A linha do texto no topo do editor fica pareada com a
// primeira faixa que ela gerou na vista, e as faixas têm a altura da linha do editor:
// trechos que não quebram seguem lado a lado na tela inteira.
function alturaLinha() {
  const altura = parseFloat(getComputedStyle($("texto")).lineHeight);
  return Number.isFinite(altura) && altura > 0 ? altura : 26;
}

// O editor quebra as linhas na largura das colunas braille, então uma linha do texto pode
// ocupar várias linhas na tela. Um espelho invisível, com a mesma fonte e largura, mede onde
// cada linha do texto começa: topos[L] em px, topos[total] = altura do conteúdo.
function geometriaDoTexto() {
  const area = $("texto");
  const estilo = getComputedStyle(area);
  const largura = area.clientWidth - parseFloat(estilo.paddingLeft) - parseFloat(estilo.paddingRight);
  const valor = area.value;
  const chave = `${largura}|${estilo.fontFamily}|${estilo.fontSize}|${estilo.lineHeight}`;
  if (estado.geometria && estado.geometria.chave === chave && estado.geometria.valor === valor) {
    return estado.geometria.topos;
  }
  if (!estado.espelho) {
    estado.espelho = document.createElement("div");
    estado.espelho.setAttribute("aria-hidden", "true");
    Object.assign(estado.espelho.style, {
      position: "absolute",
      visibility: "hidden",
      left: "-99999px",
      top: "0",
      whiteSpace: "pre-wrap",
      overflowWrap: "break-word",
    });
    document.body.append(estado.espelho);
  }
  const espelho = estado.espelho;
  Object.assign(espelho.style, {
    width: `${largura}px`,
    fontFamily: estilo.fontFamily,
    fontSize: estilo.fontSize,
    fontWeight: estilo.fontWeight,
    lineHeight: estilo.lineHeight,
    letterSpacing: estilo.letterSpacing,
    tabSize: estilo.tabSize,
  });
  const linhas = valor.split("\n");
  const pedaco = document.createDocumentFragment();
  for (const linha of linhas) {
    const div = document.createElement("div");
    div.textContent = linha || "​";
    pedaco.append(div);
  }
  espelho.replaceChildren(pedaco);
  const topos = Array.from(espelho.children, (div) => div.offsetTop);
  topos.push(espelho.offsetHeight);
  espelho.replaceChildren();
  estado.geometria = { chave, valor, topos };
  return topos;
}

// Posição no editor (px) <-> linha do texto com fração (3.5 = metade da linha 3 na tela).
function linhaDoTopo(topos, y) {
  const total = topos.length - 1;
  if (total <= 0 || y <= 0) return 0;
  let baixo = 0;
  let alto = total - 1;
  while (baixo < alto) {
    const meio = (baixo + alto + 1) >> 1;
    if (topos[meio] <= y) baixo = meio;
    else alto = meio - 1;
  }
  const altura = topos[baixo + 1] - topos[baixo];
  return baixo + (altura > 0 ? Math.min(1, (y - topos[baixo]) / altura) : 0);
}

function topoDaLinha(topos, posicaoTexto) {
  const total = topos.length - 1;
  if (total <= 0) return 0;
  const linha = Math.min(total - 1, Math.max(0, Math.floor(posicaoTexto)));
  const fracao = Math.min(1, Math.max(0, posicaoTexto - linha));
  return topos[linha] + fracao * (topos[linha + 1] - topos[linha]);
}

// A largura do editor é a das colunas braille (em caracteres da fonte monoespaçada).
function ajustarLarguraEditor() {
  const largura = `calc(${colunasAtuais()}ch + 28px)`;
  if ($("texto").style.width !== largura) $("texto").style.width = largura;
}

// inicio[L] = primeira faixa gerada pela linha L do texto (ou pela seguinte que gerou alguma).
function mapaDeLinhas(formato, total) {
  if (formato.mapa && formato.mapa.length === total + 1) return formato.mapa;
  const inicio = new Array(total + 1).fill(formato.linhas.length);
  let maior = -1;
  let proxima = 0;
  formato.linhas.forEach((item, indice) => {
    maior = Math.max(maior, item.origem ?? 0);
    while (proxima < total && proxima <= maior) {
      inicio[proxima] = indice;
      proxima += 1;
    }
  });
  formato.mapa = inicio;
  return inicio;
}

function faixaDaLinha(inicio, posicaoTexto) {
  const total = inicio.length - 1;
  if (total <= 0) return 0;
  const linha = Math.min(total - 1, Math.max(0, Math.floor(posicaoTexto)));
  const fracao = Math.min(1, Math.max(0, posicaoTexto - linha));
  return inicio[linha] + fracao * (inicio[linha + 1] - inicio[linha]);
}

function linhaDaFaixa(inicio, posicaoVista) {
  const total = inicio.length - 1;
  if (total <= 0 || posicaoVista <= 0) return 0;
  let baixo = 0;
  let alto = total - 1;
  while (baixo < alto) {
    const meio = (baixo + alto + 1) >> 1;
    if (inicio[meio] <= posicaoVista) baixo = meio;
    else alto = meio - 1;
  }
  const largura = inicio[baixo + 1] - inicio[baixo];
  return baixo + (largura > 0 ? Math.min(1, Math.max(0, (posicaoVista - inicio[baixo]) / largura)) : 0);
}

// Faixas que correspondem à linha do cursor, numa passada só (de trás para frente).
function faixasDoCursor(linhas, linhaCursor) {
  const cobre = new Set();
  let primeira = null;
  let proxima = null;
  for (let indice = linhas.length - 1; indice >= 0; indice -= 1) {
    const item = linhas[indice];
    if (item.separador) continue;
    if (item.origem <= linhaCursor && (proxima == null || proxima > linhaCursor)) {
      cobre.add(indice);
      primeira = indice;
    }
    proxima = item.origem;
  }
  return { cobre, primeira: primeira ?? 0 };
}

function vistaAtual(tinta) {
  if (!estado.formato || estado.formatoTinta !== tinta || estado.formatoSujo) {
    estado.formato = formatar(linhasDoTexto(), opcoes(), tinta);
    estado.formatoTinta = tinta;
    estado.formatoSujo = false;
  }
  return estado.formato;
}

function desenharFaixa(item, cursor) {
  const faixa = document.createElement("div");
  faixa.className = `linha-vista ${item.tipo}`;
  faixa.dataset.linha = String(item.origem ?? 0);
  if (item.separador) faixa.classList.add("separador");
  if (item.nao) faixa.classList.add("nao");
  if (!item.separador && item.origem === cursor.linha) faixa.classList.add("atual");
  faixa.textContent = item.texto || " ";
  if (item.titulo) faixa.title = item.titulo;
  return faixa;
}

function atualizarStatus() {
  const cursor = posicao();
  const linhas = linhasDoTexto();
  const linha = linhas[cursor.linha] ?? "";
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

// Sem argumento, a vista se alinha ao editor. Com um número, a vista fica nessa rolagem
// (é o usuário rolando o braille) e o editor é que vai atrás, em rolarTextoPelaVista.
function desenharVista(rolagemVista) {
  const cursor = posicao();
  const tinta = $("tinta").checked;
  const formato = vistaAtual(tinta);
  const linhas = formato.linhas;
  const raiz = $("vista");
  const area = $("texto");
  const altura = alturaLinha();
  ajustarLarguraEditor();
  const topos = geometriaDoTexto();
  const total = topos.length - 1;
  const inicioDaLinha = mapaDeLinhas(formato, total);
  const nome = tinta ? "Tinta — texto da impressora" : "Braille";
  const situacao = resumo(preparar(linhasDoTexto())[cursor.linha]);
  const doCursor = faixasDoCursor(linhas, cursor.linha);
  const pagina = (linhas[doCursor.primeira]?.pagina ?? 0) + 1;
  const partes = [nome];
  if (!situacao.includes("×")) partes.push(`${formato.colunas}×${formato.altura}`);
  partes.push(`página ${pagina} de ${formato.paginas}`);
  if (situacao) partes.push(situacao);
  // O original mostrava estas mensagens em caixas a cada compilação; aqui ficam no título do painel.
  const avisos = formato.avisos || [];
  if (avisos.length) partes.push(`⚠ ${avisos.length} ${avisos.length === 1 ? "aviso" : "avisos"}`);
  $("painel-titulo").textContent = partes.join(" · ");
  $("painel-titulo").title = avisos.map((aviso) => aviso.texto).join("\n");

  // Folga no fim de cada lado, para os finais também ficarem pareados.
  const visiveisVista = (raiz.clientHeight || 400) / altura;
  const maxVista = Math.max(0, linhas.length - visiveisVista);
  const maxTextoY = Math.max(0, topos[total] + 24 - area.clientHeight);
  const faltaTexto = Math.max(0, topoDaLinha(topos, linhaDaFaixa(inicioDaLinha, maxVista)) - maxTextoY);
  const faltaVista = Math.max(0, faixaDaLinha(inicioDaLinha, linhaDoTopo(topos, maxTextoY)) - maxVista);
  const folgaTexto = `${12 + Math.ceil(faltaTexto)}px`;
  if (area.style.paddingBottom !== folgaTexto) area.style.paddingBottom = folgaTexto;

  // Fim com fim: o editor no fundo leva a vista ao fundo.
  const textoNoFim = area.scrollTop > 0 && area.scrollTop >= area.scrollHeight - area.clientHeight - 1;
  const maxRolagem = Math.max(0, (linhas.length + faltaVista) * altura + 24 - (raiz.clientHeight || 400));
  const alvo = Math.min(maxRolagem, rolagemVista ?? (textoNoFim ? maxRolagem : faixaDaLinha(inicioDaLinha, linhaDoTopo(topos, area.scrollTop)) * altura));
  const quantidade = Math.ceil(visiveisVista) + 8;
  const inicio = Math.max(0, Math.min(linhas.length, Math.floor(alvo / altura) - 3));
  const fim = Math.min(linhas.length, inicio + quantidade);
  raiz.style.setProperty("--faixa", `${altura}px`);
  const antes = document.createElement("div");
  antes.style.height = `${inicio * altura}px`;
  const miolo = document.createElement("div");
  for (let indice = inicio; indice < fim; indice += 1) {
    const faixa = desenharFaixa(linhas[indice], cursor);
    if (doCursor.cobre.has(indice)) faixa.classList.add("atual");
    miolo.append(faixa);
  }
  const depois = document.createElement("div");
  depois.style.height = `${(Math.max(0, linhas.length - fim) + faltaVista) * altura}px`;
  raiz.replaceChildren(antes, miolo, depois);
  raiz.scrollTop = alvo;
  estado.rolagemVista = raiz.scrollTop;
}

function rolarTextoPelaVista() {
  const area = $("texto");
  const altura = alturaLinha();
  const topos = geometriaDoTexto();
  const inicioDaLinha = mapaDeLinhas(vistaAtual($("tinta").checked), topos.length - 1);
  const raiz = $("vista");
  const vistaNoFim = raiz.scrollTop > 0 && raiz.scrollTop >= raiz.scrollHeight - raiz.clientHeight - 1;
  area.scrollTop = vistaNoFim ? area.scrollHeight : topoDaLinha(topos, linhaDaFaixa(inicioDaLinha, raiz.scrollTop / altura));
  estado.rolagemTexto = area.scrollTop;
}

function desenhar() {
  estado.formatoSujo = true;
  atualizarStatus();
  desenharVista();
  desenharCinco();
}

function desenharCinco() {
  const caixa = $("cinco");
  if (!$("cinco-linhas").checked) {
    caixa.hidden = true;
    return;
  }
  caixa.hidden = false;
  const formato = vistaAtual($("tinta").checked);
  const cursor = posicao();
  const indice = faixasDoCursor(formato.linhas, cursor.linha).primeira;
  const fatia = formato.linhas.slice(Math.max(0, indice - 2), Math.max(0, indice - 2) + 5);
  caixa.replaceChildren();
  for (const item of fatia) {
    const linha = document.createElement("div");
    linha.className = item.tipo === "braille" ? "braille" : "";
    linha.textContent = item.texto || " ";
    caixa.append(linha);
  }
}

function agendar() {
  window.clearTimeout(estado.timer);
  estado.timer = window.setTimeout(() => desenhar(false), 60);
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
    tinta: $("tinta").checked,
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
    $("tinta").checked = Boolean(dados.tinta);
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

function irPara(linha, coluna) {
  const linhas = linhasDoTexto();
  let pos = 0;
  for (let indice = 0; indice < linha; indice += 1) pos += (linhas[indice]?.length || 0) + 1;
  pos += coluna;
  const area = $("texto");
  area.focus();
  area.setSelectionRange(pos, pos);
  atualizarStatus();
  desenharVista();
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
    document.execCommand("undo");
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
      desenhar(true);
      persistir();
    });
    menu.append(botao);
  });
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
      desenharVista();
      persistir();
    }
  } else if (nome === "tinta") {
    $("tinta").checked = !$("tinta").checked;
    desenhar();
    persistir();
  } else if (nome === "cinco") {
    $("cinco-linhas").checked = !$("cinco-linhas").checked;
    desenharCinco();
  } else if (nome === "revisor") {
    const ligado = !$("texto").readOnly;
    $("texto").readOnly = ligado;
    $("texto").classList.toggle("revisor", ligado);
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
    document.body.dataset.impressao = nome === "imprimir-texto" ? "texto" : "braille";
    window.print();
    document.body.dataset.impressao = "";
  } else if (nome === "braille-word") exportarWord(false);
  else if (nome === "tinta-word") exportarWord(true);
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
desenhar();
window.requestAnimationFrame(() => desenharVista());
window.addEventListener("resize", () => desenharVista());
$("texto").focus();

let linhaVista = -1;
function aposCursor(seguir) {
  const cursor = atualizarStatus();
  if (seguir || cursor.linha !== linhaVista) {
    linhaVista = cursor.linha;
    desenharVista();
  }
}

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
  estado.formatoSujo = true;
  linhaVista = posicao().linha;
  atualizarStatus();
  agendar();
  agendarPersistir();
});
for (const evento of ["keyup", "click", "select"]) {
  $("texto").addEventListener(evento, () => aposCursor(false));
}
$("tinta").addEventListener("change", () => {
  desenhar();
  persistir();
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

// Cada lado guarda a rolagem que o outro lhe deu; um evento com esse mesmo valor
// é eco da sincronização e não volta a mexer no outro lado.
$("vista").addEventListener("scroll", () => {
  const raiz = $("vista");
  if (Math.abs(raiz.scrollTop - estado.rolagemVista) < 1) return;
  estado.rolagemVista = raiz.scrollTop;
  window.cancelAnimationFrame(estado.quadro);
  estado.quadro = window.requestAnimationFrame(() => {
    desenharVista(raiz.scrollTop);
    rolarTextoPelaVista();
  });
});

$("texto").addEventListener("scroll", () => {
  const area = $("texto");
  if (Math.abs(area.scrollTop - estado.rolagemTexto) < 1) return;
  estado.rolagemTexto = area.scrollTop;
  window.cancelAnimationFrame(estado.quadroTexto);
  estado.quadroTexto = window.requestAnimationFrame(() => desenharVista());
});

$("vista").addEventListener("click", (evento) => {
  const linha = evento.target.closest("[data-linha]");
  if (!linha) return;
  irPara(Number(linha.dataset.linha), 0);
});

$("arquivo").addEventListener("change", () => {
  const arquivo = $("arquivo").files[0];
  if (!arquivo) return;
  lerArquivo(arquivo).then((texto) => {
    estado.formatoSujo = true;
    $("texto").value = texto;
    estado.nome = arquivo.name;
    estado.sujo = false;
    $("texto").focus();
    $("texto").setSelectionRange(0, 0);
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
