// Cursor do editor pareado (etapa 3). O texto puro continua sendo o modelo: o cursor é uma
// posição nele. Estas funções puras convertem essa posição na faixa e na coluna da tinta onde
// ele aparece, e o contrário. Sem DOM, para poder testar no node.

// Faixas onde o cursor pode ficar. Cabeçalho, quebra, nota e linhas de código ocultas não.
function editavel(faixa) {
  return faixa.tipo === "texto" || faixa.tipo === "branco" || faixa.tipo === "comentario";
}

function iniciosDasLinhas(texto) {
  const inicios = [0];
  for (let i = 0; i < texto.length; i += 1) if (texto[i] === "\n") inicios.push(i + 1);
  return inicios;
}

function linhaDoIndice(inicios, indice) {
  let baixo = 0;
  let alto = inicios.length - 1;
  while (baixo < alto) {
    const meio = (baixo + alto + 1) >> 1;
    if (inicios[meio] <= indice) baixo = meio;
    else alto = meio - 1;
  }
  return baixo;
}

// Comprimento da tinta de uma faixa editável (para limitar a coluna).
function larguraDaFaixa(faixa) {
  return (faixa.tinta || "").length;
}

// Índice no texto → { faixa (índice na lista), coluna na tinta }. Quando a posição cai num
// espaço que o braille descartou no corte, o cursor fica no fim da faixa de cima.
function posicaoNaFaixa(faixas, inicios, indice) {
  const linha = linhaDoIndice(inicios, indice);
  const coluna = indice - inicios[linha];
  let antes = null;
  for (let i = 0; i < faixas.length; i += 1) {
    const faixa = faixas[i];
    if (faixa.trechos?.length) {
      for (const trecho of faixa.trechos) {
        if (trecho.linha !== linha) continue;
        if (coluna >= trecho.de && coluna < trecho.ate) return { faixa: i, coluna: trecho.coluna + coluna - trecho.de };
        if (coluna === trecho.ate) antes = { faixa: i, coluna: trecho.fim };
        else if (coluna > trecho.ate) antes = { faixa: i, coluna: trecho.fim };
        else if (coluna < trecho.de) {
          // Começo da linha antes do primeiro trecho (espaços de parágrafo): início do trecho.
          return antes ?? { faixa: i, coluna: trecho.coluna };
        }
      }
    } else if (faixa.linha === linha && (editavel(faixa) || escondida(faixa))) {
      return { faixa: i, coluna: Math.min(coluna, larguraDaFaixa(faixa)) };
    }
  }
  return antes ?? { faixa: 0, coluna: 0 };
}

// { faixa, coluna } → índice no texto.
function indiceDaPosicao(faixas, inicios, texto, posicao) {
  const faixa = faixas[posicao.faixa];
  if (!faixa) return texto.length;
  const coluna = Math.max(0, posicao.coluna);
  if (faixa.trechos?.length) {
    for (const trecho of faixa.trechos) {
      if (coluna >= trecho.coluna && coluna <= trecho.fim) {
        return inicios[trecho.linha] + trecho.de + Math.min(coluna - trecho.coluna, trecho.ate - trecho.de);
      }
    }
    const primeiro = faixa.trechos[0];
    if (coluna < primeiro.coluna) return inicios[primeiro.linha] + primeiro.de;
    // Entre dois trechos (o espaço que junta duas linhas do texto) ou depois do último.
    let escolhido = primeiro;
    for (const trecho of faixa.trechos) if (trecho.fim <= coluna) escolhido = trecho;
    return inicios[escolhido.linha] + escolhido.ate;
  }
  if (faixa.linha != null) {
    const fimDaLinha = (inicios[faixa.linha + 1] ?? texto.length + 1) - 1;
    return Math.min(inicios[faixa.linha] + coluna, fimDaLinha);
  }
  return texto.length;
}

// Próxima faixa editável a partir de `faixa`, andando `passo` (+1 ou -1). Null se não houver.
function vizinhaEditavel(faixas, faixa, passo) {
  for (let i = faixa + passo; i >= 0 && i < faixas.length; i += passo) {
    if (editavel(faixas[i])) return i;
  }
  return null;
}

// Faixa que representa uma linha do texto sem lugar para o cursor: código oculto ou <P>.
function escondida(faixa) {
  return faixa.tipo === "comando" || faixa.tipo === "oculta" || (faixa.tipo === "quebra" && faixa.linha != null);
}

// Linha do texto que o editor não mostra como texto: o cursor não pode ficar nela.
function linhaEscondida(faixas, linha) {
  return faixas.some((faixa) => faixa.linha === linha && escondida(faixa))
    && !faixas.some((faixa) => (faixa.linha === linha && editavel(faixa)) || faixa.trechos?.some((trecho) => trecho.linha === linha));
}

// Tira o cursor de uma linha escondida, andando na direção do movimento.
function foraDeLinhaEscondida(faixas, inicios, texto, indice, direcao) {
  let linha = linhaDoIndice(inicios, indice);
  let guarda = inicios.length;
  while (linhaEscondida(faixas, linha) && guarda > 0) {
    guarda -= 1;
    if (direcao >= 0) {
      if (linha + 1 >= inicios.length) break;
      linha += 1;
      indice = inicios[linha];
    } else {
      if (linha === 0) break;
      linha -= 1;
      indice = (inicios[linha + 1] ?? texto.length + 1) - 1;
    }
  }
  if (linhaEscondida(faixas, linha) && direcao >= 0) return foraDeLinhaEscondida(faixas, inicios, texto, indice, -1);
  return indice;
}

// O que Backspace (passo -1) ou Delete (+1) devem apagar quando o cursor está na borda de uma
// linha e a vizinha é uma linha escondida. Devolve { de, ate } a apagar, ou null para deixar o
// textarea agir normalmente. <P> some inteiro; outros comandos não são apagados assim.
function apagarNaBorda(faixas, inicios, texto, indice, passo) {
  const linha = linhaDoIndice(inicios, indice);
  // Os espaços de abertura de parágrafo e os do fim da linha não aparecem como texto: o
  // cursor depois deles já está, para quem vê, no começo (ou no fim) da linha.
  const fimDaLinha = (inicios[linha + 1] ?? texto.length + 1) - 1;
  const noInicio = /^ *$/.test(texto.slice(inicios[linha], indice));
  const noFim = /^ *$/.test(texto.slice(indice, fimDaLinha));
  if ((passo < 0 && !noInicio) || (passo > 0 && !noFim)) return null;
  // Procura, na direção do movimento, a primeira linha visível ou o primeiro <P>.
  let vizinha = linha + passo;
  while (vizinha >= 0 && vizinha < inicios.length) {
    const quebra = faixas.find((faixa) => faixa.tipo === "quebra" && faixa.forcada && faixa.linha === vizinha);
    if (quebra) {
      const de = inicios[vizinha];
      const ate = inicios[vizinha + 1] ?? texto.length;
      // Apaga a linha do <P> com uma das quebras de linha que a cercam.
      if (inicios[vizinha + 1] != null) return { de, ate };
      return { de: Math.max(0, de - 1), ate };
    }
    if (!linhaEscondida(faixas, vizinha)) break;
    vizinha += passo;
  }
  if (vizinha === linha + passo) return null;
  // Há linhas de código entre o cursor e o texto vizinho: não junta por cima delas.
  return { de: indice, ate: indice };
}

export {
  apagarNaBorda,
  editavel,
  foraDeLinhaEscondida,
  indiceDaPosicao,
  iniciosDasLinhas,
  linhaDoIndice,
  posicaoNaFaixa,
  vizinhaEditavel,
};
