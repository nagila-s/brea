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

// Trecho do texto que a faixa cobre: { ini, fim } em índices do texto, ou null.
function alcanceDaFaixa(faixa, inicios, texto) {
  if (faixa.trechos?.length) {
    const primeiro = faixa.trechos[0];
    const ultimo = faixa.trechos[faixa.trechos.length - 1];
    return { ini: inicios[primeiro.linha] + primeiro.de, fim: inicios[ultimo.linha] + ultimo.ate };
  }
  if (faixa.linha != null && editavel(faixa)) {
    const ini = inicios[faixa.linha];
    const fim = (inicios[faixa.linha + 1] ?? texto.length + 1) - 1;
    return { ini, fim };
  }
  return null;
}

// O que pintar numa faixa para a seleção [de, ate): colunas da tinta e celas do braille,
// cada uma como [início, fim). Os espaços que juntam linhas e o hífen do corte entram quando a
// seleção passa por eles. Devolve null quando a faixa fica de fora.
function selecaoNaFaixa(faixa, inicios, texto, de, ate) {
  if (de >= ate) return null;
  const alcance = alcanceDaFaixa(faixa, inicios, texto);
  if (!alcance) return null;
  const continuaAntes = de < alcance.ini;
  const continuaDepois = ate > alcance.fim;
  if (ate <= alcance.ini && !(ate === alcance.ini && continuaAntes && alcance.ini === alcance.fim)) return null;
  if (de > alcance.fim || (de === alcance.fim && alcance.fim > alcance.ini)) return null;

  const largura = (faixa.tinta || "").length;
  if (!faixa.trechos?.length) {
    // Linha em branco ou comentário: pelas colunas da própria linha.
    const c0 = Math.max(0, de - alcance.ini);
    const c1 = continuaDepois ? Math.max(largura, 1) : Math.min(largura, ate - alcance.ini);
    const celas = faixa.braille?.length ? [0, faixa.braille.length] : null;
    return { tinta: [c0, Math.max(c0 + (continuaDepois && largura === 0 ? 1 : 0), c1)], braille: celas };
  }

  let c0 = null;
  let c1 = null;
  for (const trecho of faixa.trechos) {
    const ini = inicios[trecho.linha] + trecho.de;
    const fim = inicios[trecho.linha] + trecho.ate;
    const a = Math.max(de, ini);
    const b = Math.min(ate, fim);
    if (a >= b) continue;
    const ca = trecho.coluna + (a - ini);
    const cb = trecho.coluna + (b - ini);
    c0 = c0 == null ? ca : Math.min(c0, ca);
    c1 = c1 == null ? cb : Math.max(c1, cb);
  }
  if (c0 == null) {
    // A seleção só passa pelo espaço descartado entre duas faixas.
    if (!continuaAntes || !continuaDepois) return null;
    c0 = faixa.trechos[0].coluna;
    c1 = c0;
  }
  if (continuaAntes) c0 = Math.min(c0, faixa.trechos[0].coluna);
  if (continuaDepois) c1 = largura;

  let k0 = null;
  let k1 = null;
  (faixa.braille || []).forEach((cela, k) => {
    if (!cela.fonte) return;
    const ini = inicios[cela.fonte.linha] + cela.fonte.de;
    const fim = Math.max(ini + 1, inicios[cela.fonte.linha] + cela.fonte.ate);
    if (Math.max(de, ini) >= Math.min(ate, fim)) return;
    if (k0 == null) k0 = k;
    k1 = k + 1;
  });
  const celas = faixa.braille || [];
  if (continuaAntes && k0 != null) {
    while (k0 > 0 && !celas[k0 - 1].fonte && celas[k0 - 1].tipo !== "espaco") k0 -= 1;
  }
  if (continuaDepois) k1 = celas.length;
  if (k0 == null && continuaDepois) {
    k0 = celas.findIndex((cela) => cela.fonte);
    if (k0 < 0) k0 = 0;
  }
  return { tinta: [c0, c1], braille: k0 == null ? null : [k0, k1] };
}

// Palavra em volta do índice (duplo clique): letras, dígitos e hífen interno.
function palavraEm(texto, indice) {
  const letra = /[\p{L}\p{N}_]/u;
  let de = indice;
  let ate = indice;
  if (!letra.test(texto[ate] ?? "") && letra.test(texto[ate - 1] ?? "")) {
    de -= 1;
    ate -= 1;
  }
  if (!letra.test(texto[ate] ?? "")) return { de: indice, ate: Math.min(texto.length, indice + 1) };
  while (de > 0 && letra.test(texto[de - 1])) de -= 1;
  while (ate < texto.length && letra.test(texto[ate])) ate += 1;
  return { de, ate };
}

export {
  alcanceDaFaixa,
  apagarNaBorda,
  palavraEm,
  selecaoNaFaixa,
  editavel,
  foraDeLinhaEscondida,
  indiceDaPosicao,
  iniciosDasLinhas,
  linhaDoIndice,
  posicaoNaFaixa,
  vizinhaEditavel,
};
