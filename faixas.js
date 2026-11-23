// Faixas: a lista de linhas visuais do editor pareado. Cada faixa mostra, lado a lado, uma
// linha braille e o pedaço de tinta que a gerou. Quem decide onde a linha quebra é o braille
// (formatar); a tinta só reflete essa decisão. Função pura: não toca no DOM.
//
// Tipos de faixa:
//   texto       braille + tinta; `trechos` diz de que linhas e colunas do texto veio a tinta
//   cabecalho   título e número da página; só leitura
//   quebra      troca de página; `forcada` quando veio de um <P> (linha = a do <P>)
//   branco      linha em branco (do texto ou página vazia sem cabeçalho)
//   nota        aviso da paginação (gráfico)
//   comentario  <texto qualquer>: só tinta, não vai para o braille
//   comando     linha de código que não aparece (R±, F±, S±, I±, T, M, página em tinta...)
//   oculta      linha do texto que não gerou nada (por exemplo, branco tirado do topo da página)
//
// Toda linha do texto aparece em pelo menos uma faixa, para o editor sempre saber onde ela está.

import { aplicar, classificar } from "./comandos.js?edicao=26";
import { caractereMeta } from "./motor.js?edicao=26";

// Marcações que valem para um bloco e viram fundo colorido no editor.
function marcasDe(info) {
  if (!info) return [];
  const marcas = [];
  if (info.recuo) marcas.push("R+");
  if (info.ajuste === false) marcas.push("F-");
  if (info.silabas === false) marcas.push("S-");
  if (info.ingles) marcas.push("I+");
  if (info.margem) marcas.push("M");
  return marcas;
}

// As marcas que valem em cada linha do texto. Linhas seguidas com as mesmas marcas dividem a
// mesma lista, para a montagem não criar um objeto por linha a cada tecla.
function marcasPorLinha(linhas) {
  const doc = { recuo: false, ajuste: true, silabas: null, ingles: false, margem: "" };
  const resultado = new Array(linhas.length);
  let chave = "";
  let atual = [];
  for (let indice = 0; indice < linhas.length; indice += 1) {
    const linha = linhas[indice];
    if (linha.startsWith("<")) {
      const comando = classificar(linha);
      if (comando) {
        aplicar(doc, comando);
        const nova = marcasDe(doc);
        const outra = nova.join(",");
        if (outra !== chave) {
          chave = outra;
          atual = nova;
        }
      }
    }
    resultado[indice] = atual;
  }
  return resultado;
}

// Título e número da página em tinta, na mesma disposição do cabeçalho braille.
function cabecalhoTinta(pagina, numeracao) {
  const colunas = pagina.colunas;
  const margem = pagina.margem ? `${pagina.margem} ` : "";
  const util = Math.max(1, colunas - margem.length);
  const numero = pagina.numeroTexto || "";
  const tinta = pagina.paginaTinta ? `  ${pagina.paginaTinta}` : "";
  const livre = Math.max(0, util - numero.length - tinta.length);
  const titulo = (pagina.titulo || "").slice(0, livre);
  const modo = Number(numeracao) || 0;
  let corpo;
  if (modo === 2) {
    const folga = Math.max(0, util - numero.length - tinta.length);
    corpo = " ".repeat(folga >> 1) + numero + " ".repeat(folga - (folga >> 1)) + tinta;
  } else if (modo === 3) {
    corpo = numero + tinta + " ".repeat(livre - titulo.length) + titulo;
  } else {
    const folga = livre - titulo.length;
    corpo = tinta + " ".repeat(folga >> 1) + titulo + " ".repeat(folga - (folga >> 1)) + numero;
  }
  return (margem + corpo).slice(0, colunas).replace(/ +$/, "");
}

// Monta a tinta de uma linha braille a partir das fontes das celas. Um trecho de várias celas
// (sinal de maiúscula + letra, "..." etc.) entra uma vez só, na primeira cela.
function tintaDaLinha(celas, linhas, usados) {
  let texto = "";
  const trechos = [];
  for (const cela of celas) {
    const fonte = cela.fonte;
    if (!fonte) {
      if (cela.cortada) texto += "-";
      else if (cela.tipo === "espaco") texto += " ";
      else texto += cela.origem || caractereMeta(cela.meta) || "";
      continue;
    }
    const chave = `${fonte.linha}:${fonte.de}:${fonte.ate}`;
    if (usados.has(chave)) continue;
    usados.add(chave);
    if (fonte.ate <= fonte.de) continue;
    const pedaco = linhas[fonte.linha].slice(fonte.de, fonte.ate).replaceAll("\t", "    ");
    const coluna = texto.length;
    texto += pedaco;
    const ultimo = trechos[trechos.length - 1];
    if (ultimo && ultimo.linha === fonte.linha && ultimo.ate === fonte.de && ultimo.ate - ultimo.de === ultimo.fim - ultimo.coluna) {
      ultimo.ate = fonte.ate;
      ultimo.fim = texto.length;
    } else {
      trechos.push({ linha: fonte.linha, de: fonte.de, ate: fonte.ate, coluna, fim: texto.length });
    }
  }
  return { texto, trechos };
}

// A tinta fica guardada no próprio item da paginação, que pagina.js reaproveita enquanto o
// parágrafo não muda; um parágrafo é montado de uma vez, com o seu próprio conjunto de usados.
function tintaDoItem(item, linhas, usados) {
  if (item.tintaPronta) return item.tintaPronta;
  if (!item.grupo) return tintaDaLinha(item.celas, linhas, usados);
  const doGrupo = new Set();
  for (const membro of item.grupo) membro.tintaPronta = tintaDaLinha(membro.celas, linhas, doGrupo);
  return item.tintaPronta;
}

// Linha do recuo que começa com dois espaços e letra minúscula: provavelmente o Finalizar
// partiu ali um parágrafo e o <P> já foi removido. Os dois espaços fecham o parágrafo de cima,
// então editar acima deixa uma quebra de linha fixa nesse ponto. O editor só avisa.
function corteNoRecuo(faixa, linhas) {
  if (!faixa.marcas.includes("R+")) return false;
  const primeiro = faixa.trechos[0];
  if (!primeiro || primeiro.de !== 0) return false;
  return /^ {2}[a-zà-ÿ]/.test(linhas[primeiro.linha]);
}

function primeiraLinha(faixa) {
  if (faixa.trechos?.length) return faixa.trechos[0].linha;
  return faixa.linha ?? null;
}

function montarFaixas(linhas, formato, opcoes = {}) {
  const faixas = [];
  const usados = new Set();
  const marcas = marcasPorLinha(linhas);

  (formato.estrutura || []).forEach((pagina, indice) => {
    if (indice > 0) {
      faixas.push({
        tipo: "quebra",
        forcada: pagina.motivo === "forcada",
        motivo: pagina.motivo,
        linha: pagina.quebraLinha ?? null,
        pagina: indice,
      });
    }
    if (pagina.titula) {
      faixas.push({
        tipo: "cabecalho",
        braille: pagina.cabecalhoCelas || [],
        tinta: cabecalhoTinta(pagina, opcoes.numeracao),
        pagina: indice,
      });
    } else if (!pagina.corpo.length) {
      faixas.push({ tipo: "branco", braille: [], tinta: "", linha: null, pagina: indice });
    }
    for (const item of pagina.corpo) {
      if (item.tipo === "nota") {
        faixas.push({ tipo: "nota", braille: [], tinta: item.texto, linha: item.origem, pagina: indice });
        continue;
      }
      if (item.vazia) {
        faixas.push({
          tipo: "branco",
          braille: item.celas,
          tinta: "",
          linha: item.origem,
          marcas: marcas[item.origem] || [],
          pagina: indice,
        });
        continue;
      }
      const { texto, trechos } = tintaDoItem(item, linhas, usados);
      const linha = trechos[0]?.linha ?? item.origem;
      const faixa = {
        tipo: "texto",
        braille: item.celas,
        tinta: texto,
        trechos,
        linha,
        marcas: marcas[linha] || [],
        pagina: indice,
      };
      if (corteNoRecuo(faixa, linhas)) faixa.corteRecuo = true;
      faixas.push(faixa);
    }
  });

  // Linhas do texto que não apareceram em nenhuma faixa: comentários, comandos e o resto.
  const vistas = new Set();
  for (const faixa of faixas) {
    if (faixa.linha != null) vistas.add(faixa.linha);
    for (const trecho of faixa.trechos || []) vistas.add(trecho.linha);
  }
  const extras = [];
  linhas.forEach((texto, numero) => {
    if (vistas.has(numero)) return;
    const comando = classificar(texto.replaceAll("\t", "    "));
    if (comando && (comando.tipo === "comentario" || comando.tipo === "anotacao")) {
      extras.push({ tipo: "comentario", braille: [], tinta: texto, linha: numero, pagina: null });
    } else if (comando) {
      extras.push({ tipo: "comando", codigo: texto.trim(), rotulo: comando.rotulo, linha: numero, pagina: null });
    } else {
      extras.push({ tipo: "oculta", linha: numero, pagina: null });
    }
  });

  // Cada extra entra antes da primeira faixa que começa numa linha maior que a dela.
  // Faixas sem linha (cabeçalho, quebra automática) herdam a da faixa anterior.
  const resultado = [];
  let anterior = -1;
  let proximo = 0;
  for (const faixa of faixas) {
    const inicio = primeiraLinha(faixa) ?? anterior;
    while (proximo < extras.length && extras[proximo].linha < inicio) {
      const extra = extras[proximo];
      extra.pagina = faixa.pagina;
      resultado.push(extra);
      proximo += 1;
    }
    resultado.push(faixa);
    if (inicio > anterior) anterior = inicio;
  }
  const ultimaPagina = faixas.length ? faixas[faixas.length - 1].pagina : 0;
  while (proximo < extras.length) {
    extras[proximo].pagina = ultimaPagina;
    resultado.push(extras[proximo]);
    proximo += 1;
  }
  return resultado;
}

export { montarFaixas, cabecalhoTinta, marcasDe, marcasPorLinha };
