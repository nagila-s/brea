// Finalizar e Remover quebras de página (PLANO-EDITOR, etapa 8). Funções puras sobre as
// linhas do texto: não tocam no DOM.
//
// Finalizar grava um <P> em cada quebra de página automática, para o .txt guardar a
// paginação que o editor mostra. O braille depois de finalizar tem de ser idêntico ao de
// antes; quem chama confere com `mesmoBraille`.

import { classificar, preparar } from "./comandos.js?edicao=26";
import { formatar } from "./pagina.js?edicao=32";
import { traduzir } from "./motor.js?edicao=26";

// Onde, no texto, começa uma página: a linha e a coluna da primeira letra que foi para ela.
function inicioDaPagina(pagina) {
  for (const item of pagina.corpo) {
    if (item.tipo === "nota" || item.vazia) return { linha: item.origem, coluna: 0 };
    const indice = item.celas.findIndex((candidata) => candidata.fonte);
    if (indice < 0) return { linha: item.origem, coluna: 0 };
    const cela = item.celas[indice];
    // Os dois espaços que o <R+> põe nas linhas de baixo do parágrafo não vêm do texto.
    const doRecuo = (posicao) => item.celas[posicao]?.tipo === "espaco" && !item.celas[posicao].fonte;
    return { linha: cela.fonte.linha, coluna: cela.fonte.de, recuada: indice >= 2 && doRecuo(indice - 1) && doRecuo(indice - 2) };
  }
  return null;
}

// O pedaço de linha que passa para a página nova. Depois do <P> ele abre um bloco novo: se
// continuava um parágrafo com recuo, ganha os dois espaços que as linhas de baixo do recuo têm.
function continuacao(texto, recuo) {
  let linha = texto;
  // "<" ou "•" no começo mudariam o sentido da linha (comando, parágrafo novo); o "`" é o
  // escape do Braille Fácil: aparece na tinta e não vira cela.
  if (linha.startsWith("<") || linha.startsWith("•")) linha = `\`${linha}`;
  return recuo ? `  ${linha}` : linha;
}

// O tradutor trabalha linha a linha do texto: partir uma linha pode mudar o braille na junção
// (um ")" sem o "(" na mesma linha, por exemplo). Só parte se as duas metades derem as mesmas
// celas que a linha inteira.
function celasSemEspaco(texto, opcoes, ingles) {
  const paragrafo = traduzir(texto.replaceAll("\t", "    "), { ...opcoes, ingles }).paragrafos.find((item) => !item.vazio);
  return (paragrafo?.celas || []).filter((cela) => cela.tipo !== "espaco").map((cela) => cela.dots).join(",");
}

function partirMantemBraille(inteira, antes, depois, opcoes, ingles) {
  const juntas = [celasSemEspaco(antes, opcoes, ingles), celasSemEspaco(depois, opcoes, ingles)].filter(Boolean).join(",");
  return juntas === celasSemEspaco(inteira, opcoes, ingles);
}

function finalizarTexto(linhas, opcoes) {
  const formato = formatar(linhas, opcoes, false, { semVista: true });
  const estado = preparar(linhas);
  const pontos = [];
  formato.estrutura.forEach((pagina, indice) => {
    if (pagina.motivo !== "automatica") return;
    const ponto = inicioDaPagina(pagina);
    if (!ponto) return;
    // A página de cima terminou com um pedaço da mesma linha do texto? Então o corte é no
    // meio da linha, mesmo que antes dele só haja espaços.
    const anterior = formato.estrutura[indice - 1]?.corpo.at(-1);
    const meio = Boolean(anterior?.celas?.some((cela) => cela.fonte?.linha === ponto.linha || cela.linhaOrigem === ponto.linha));
    pontos.push({ ...ponto, meio, tinta: pagina.paginaTinta ?? null });
  });
  // De baixo para cima, para os números de linha de cima continuarem valendo.
  pontos.sort((a, b) => b.linha - a.linha || b.coluna - a.coluna);
  const saida = linhas.slice();
  // Quebras que não puderam ser gravadas sem mudar o braille: continuam automáticas. Cada uma
  // leva o começo do trecho que abre a página, para a pessoa achar no texto.
  const mantidas = [];
  // A página automática leva a página em tinta da linha que a abriu, que pode vir de um <nnn>
  // logo abaixo (ele não fecha o parágrafo). O <P> usa a que vale onde ele está: se forem
  // diferentes, o <nnn> certo vai junto, antes do <P> (<0> tira a página em tinta).
  const comTinta = (tinta, valendo) => (String(tinta ?? "") === String(valendo ?? "") ? ["<P>"] : [`<${tinta ?? 0}>`, "<P>"]);
  for (const { linha, coluna, tinta, recuada, meio } of pontos) {
    const texto = saida[linha];
    const antes = texto.slice(0, coluna);
    if (!meio) {
      // A página começa numa linha do texto: o <P> entra antes dela. Se a linha continuava um
      // parágrafo com recuo, ganha os dois espaços que o recuo punha.
      const novas = comTinta(tinta, linha > 0 ? estado[linha - 1].paginaTinta : null);
      saida.splice(linha, 1, ...novas, recuada ? `  ${texto}` : texto);
    } else {
      // A página começa no meio de uma linha: ela é partida onde o braille partiu.
      const depois = texto.slice(coluna).replace(/^[ \t]+/, "");
      // Pedaço de cima só com espaços viraria uma linha vazia, que o braille trata diferente.
      if (antes.trim() === "" || !partirMantemBraille(texto, antes, depois, opcoes, Boolean(estado[linha]?.ingles))) {
        mantidas.unshift(depois.slice(0, 40));
        continue;
      }
      saida.splice(linha, 1, antes.replace(/[ \t]+$/, ""), ...comTinta(tinta, estado[linha].paginaTinta), continuacao(depois, recuada));
    }
  }
  return { linhas: saida, quebras: pontos.length - mantidas.length, mantidas };
}

// Apaga todas as linhas <P>, sem distinguir as da pessoa das gravadas pelo Finalizar.
function removerQuebras(linhas) {
  const saida = linhas.filter((linha) => classificar(linha.replaceAll("\t", "    "))?.tipo !== "quebra");
  return { linhas: saida, quebras: linhas.length - saida.length };
}

function contarQuebras(linhas) {
  return removerQuebras(linhas).quebras;
}

// As linhas braille (com cabeçalhos) e as páginas de dois textos são as mesmas?
function mesmoBraille(linhasA, linhasB, opcoes) {
  const braille = (linhas) => {
    const formato = formatar(linhas, opcoes, false);
    return {
      paginas: formato.paginas,
      linhas: formato.linhas.filter((linha) => linha.tipo === "braille").map((linha) => `${linha.pagina}|${linha.texto}`),
    };
  };
  const a = braille(linhasA);
  const b = braille(linhasB);
  if (a.paginas !== b.paginas) return { igual: false, motivo: `${a.paginas} páginas antes, ${b.paginas} depois` };
  const diferente = a.linhas.findIndex((linha, indice) => linha !== b.linhas[indice]);
  if (diferente >= 0 || a.linhas.length !== b.linhas.length) {
    const indice = diferente >= 0 ? diferente : Math.min(a.linhas.length, b.linhas.length);
    return { igual: false, motivo: `linha braille ${indice + 1} diferente`, antes: a.linhas[indice], depois: b.linhas[indice] };
  }
  return { igual: true };
}

export { contarQuebras, finalizarTexto, mesmoBraille, removerQuebras };
