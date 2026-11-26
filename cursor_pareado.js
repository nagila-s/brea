import { classificar } from "./comandos.js?edicao=27";
import { marcasPorLinha } from "./faixas.js?edicao=35";

// Cursor do editor pareado (etapa 3). O texto puro continua sendo o modelo: o cursor é uma
// posição nele. Estas funções puras convertem essa posição na faixa e na coluna da tinta onde
// ele aparece, e o contrário. Sem DOM, para poder testar no node.

// Faixas onde o cursor pode ficar. Cabeçalho, quebra e nota não. As linhas de comando e as que
// o braille omite aparecem na tinta e também recebem o cursor.
function editavel(faixa) {
  return faixa.tipo === "texto" || faixa.tipo === "branco" || faixa.tipo === "comentario"
    || faixa.tipo === "comando" || faixa.tipo === "oculta";
}

// Linha de código (<R+>, <T título>, comentário): juntá-la com a vizinha estragaria o código.
function ehComando(linha) {
  const comando = linha?.startsWith("<") ? classificar(linha) : null;
  return Boolean(comando) && !comando.imprimir;
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

// Faixa que representa uma linha do texto sem lugar para o cursor: o <P> (e o <T+n>).
function escondida(faixa) {
  return faixa.tipo === "quebra" && faixa.linha != null;
}

// Linha do texto que o editor não mostra como texto: o cursor não pode ficar nela.
function linhaEscondida(faixas, linha) {
  return faixas.some((faixa) => faixa.linha === linha && escondida(faixa))
    && !faixas.some((faixa) => (faixa.linha === linha && editavel(faixa)) || faixa.trechos?.some((trecho) => trecho.linha === linha));
}

// Linha onde o cursor não entra: a do <P> e as linhas de código, que viram etiqueta e só se
// editam pelo duplo clique. `aberta` é a exceção: o código que o cursor está escrevendo agora
// (ele só vira etiqueta quando o cursor sai da linha).
function linhaProtegida(faixas, inicios, texto, linha, aberta = null) {
  if (linha === aberta) return false;
  const fim = (inicios[linha + 1] ?? texto.length + 1) - 1;
  return ehComando(texto.slice(inicios[linha], fim)) || linhaEscondida(faixas, linha);
}

// Tira o cursor de uma linha protegida, andando na direção do movimento.
function foraDeLinhaEscondida(faixas, inicios, texto, indice, direcao, aberta = null) {
  let linha = linhaDoIndice(inicios, indice);
  let guarda = inicios.length;
  while (linhaProtegida(faixas, inicios, texto, linha, aberta) && guarda > 0) {
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
  if (linhaProtegida(faixas, inicios, texto, linha, aberta) && direcao >= 0) return foraDeLinhaEscondida(faixas, inicios, texto, indice, -1, aberta);
  return indice;
}

// O que Backspace (passo -1) ou Delete (+1) devem fazer quando o cursor está na borda de uma
// linha. Devolve null para deixar o textarea agir normalmente, ou { de, ate, cursor }: o trecho a
// apagar (vazio: não faz nada) e onde o cursor fica depois.
// Os códigos (<P>, <t título>, <R+>, comentários...) não mudam ao editar o texto: só pelo duplo
// clique na etiqueta. Por isso, com um código ao lado:
//   - linha em branco: ela é que sai, e o código fica;
//   - linha com texto: nada acontece. A tecla não junta as linhas nem leva o cursor para dentro
//     do código (antes, Delete no fim da capa passava por cima do <1>, apagava o <P> e deixava
//     o cursor no <t título>, e as teclas seguintes desmanchavam o título).
function apagarNaBorda(faixas, inicios, texto, indice, passo) {
  const linha = linhaDoIndice(inicios, indice);
  // Os espaços de abertura de parágrafo e os do fim da linha não aparecem como texto: o
  // cursor depois deles já está, para quem vê, no começo (ou no fim) da linha.
  const fimDaLinha = (inicios[linha + 1] ?? texto.length + 1) - 1;
  const noInicio = /^ *$/.test(texto.slice(inicios[linha], indice));
  const noFim = /^ *$/.test(texto.slice(indice, fimDaLinha));
  if ((passo < 0 && !noInicio) || (passo > 0 && !noFim)) return null;
  const parado = { de: indice, ate: indice, cursor: indice };
  if (ehComando(texto.slice(inicios[linha], fimDaLinha))) return parado;
  const vizinha = linha + passo;
  if (vizinha < 0 || vizinha >= inicios.length) return null;
  if (!linhaProtegida(faixas, inicios, texto, vizinha)) return null;
  if (texto.slice(inicios[linha], fimDaLinha).trim() !== "") return parado;
  // A linha em branco sai com uma das quebras de linha que a cercam.
  const de = inicios[linha + 1] != null ? inicios[linha] : Math.max(0, inicios[linha] - 1);
  const ate = inicios[linha + 1] ?? texto.length;
  // Backspace leva o cursor para cima (o fim da linha de cima; quem chama tira o cursor do
  // código, se for o caso); Delete deixa onde estava, que agora é o começo da linha seguinte.
  return { de, ate, cursor: passo < 0 ? Math.max(0, de - 1) : de };
}

// Apagar (ou trocar por `novo`) um trecho que atravessa linhas de código: o texto sai e os
// códigos ficam no lugar, cada um na sua linha. O começo da primeira linha (com o que entra) fica
// antes dos códigos, e o resto da última, depois deles. Devolve { de, ate, texto, cursor }, ou
// null quando o trecho não pega nenhum código (aí vale a troca comum).
function trocaPreservandoCodigos(texto, de, ate, novo = "") {
  if (de >= ate) return null;
  const ini = texto.lastIndexOf("\n", de - 1) + 1;
  let fim = texto.indexOf("\n", ate);
  if (fim < 0) fim = texto.length;
  // Tudo numa linha só: a edição do próprio código que está sendo escrito, ou texto comum.
  if (texto.lastIndexOf("\n", ate - 1) < ini) return null;
  const linhas = texto.slice(ini, fim).split("\n");
  const codigos = linhas.filter(ehComando);
  if (!codigos.length) return null;
  const primeiraCodigo = ehComando(linhas[0]);
  const ultimaCodigo = ehComando(linhas[linhas.length - 1]);
  const cabeca = primeiraCodigo ? "" : texto.slice(ini, de);
  const cauda = ultimaCodigo ? "" : texto.slice(ate, fim);
  const partes = [];
  let cursor = null;
  if (cabeca || (novo && !primeiraCodigo)) {
    partes.push(cabeca + novo);
    cursor = ini + cabeca.length + novo.length;
  }
  partes.push(...codigos);
  const sobra = primeiraCodigo ? novo : "";
  if (sobra || cauda) {
    const antes = partes.join("\n").length + 1;
    partes.push(sobra + cauda);
    if (cursor == null) cursor = ini + antes + sobra.length;
  }
  const trocado = partes.join("\n");
  // Nada de texto sobrou em volta dos códigos: o cursor vai para o fim da linha de cima.
  if (cursor == null) cursor = ini > 0 ? ini - 1 : ini + trocado.length;
  return { de: ini, ate: fim, texto: trocado, cursor };
}

// Arrastar um código: tira a linha `de` do texto e a põe antes da linha `para` (o número de
// linhas põe no fim). O tamanho do texto não muda: as linhas entre as duas posições só andam o
// comprimento do código. Devolve { de, ate, texto, desloca } (desloca: quanto anda um índice que
// estava entre as duas posições), ou null quando o código já está ali.
function moverLinha(texto, de, para) {
  const inicios = iniciosDasLinhas(texto);
  if (de < 0 || de >= inicios.length || para < 0 || para > inicios.length || para === de || para === de + 1) return null;
  const fimDe = (inicios[de + 1] ?? texto.length + 1) - 1;
  const codigo = texto.slice(inicios[de], fimDe);
  if (para < de) {
    const meio = texto.slice(inicios[para], inicios[de] - 1);
    return { de: inicios[para], ate: fimDe, texto: `${codigo}\n${meio}`, desloca: codigo.length + 1 };
  }
  const fim = para < inicios.length ? inicios[para] - 1 : texto.length;
  const meio = texto.slice(inicios[de + 1], fim);
  return { de: inicios[de], ate: fim, texto: `${meio}\n${codigo}`, desloca: -(codigo.length + 1) };
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

const espacosIniciais = (linha) => (linha.match(/^ */) || [""])[0].length;
const ehLinhaDeTexto = (linha) => linha != null && linha.trim() !== "" && !(linha.startsWith("<") && classificar(linha));

// Enter: desce o que está depois do cursor para a linha de baixo, sem abrir parágrafo. No texto,
// uma linha sem espaço no começo continua o parágrafo de cima (o Enter puro não mudava nada na
// tela); por isso a linha nova começa com espaço:
//   - texto comum: um espaço. A linha vai para a margem (o braille apaga esse espaço); com um
//     espaço a mais, vira parágrafo com o recuo de dois.
//   - dentro do <R+>: dois espaços, alinhada com as outras linhas do recuo; com um espaço a
//     menos, vira item novo.
//   - no <F-> (sem auto-ajuste), cada linha é uma linha: só a quebra.
//   - no começo do texto da linha: ela desce, e fica uma linha em branco no lugar.
//   - numa linha de comando ou comentário: a linha nova vem depois dela, sem partir o código.
//   - no fim da linha, com o parágrafo continuando na de baixo: a de baixo é que desce, com o
//     cursor no começo dela.
// Devolve a troca { de, ate, texto } a fazer no texto.
function aoEnter(texto, pos, opcoes = {}) {
  const linhaDe = texto.lastIndexOf("\n", pos - 1) + 1;
  let linhaAte = texto.indexOf("\n", pos);
  if (linhaAte < 0) linhaAte = texto.length;
  const linhas = texto.split("\n");
  let numero = 0;
  for (let i = texto.indexOf("\n"); i >= 0 && i < linhaDe; i = texto.indexOf("\n", i + 1)) numero += 1;
  const linha = linhas[numero] ?? "";
  const marcas = marcasPorLinha(linhas)[numero] || [];
  if (opcoes.autoFormata === false || marcas.includes("F-")) return { de: pos, ate: pos, texto: "\n" };
  if (pos - linhaDe <= espacosIniciais(linha)) return { de: linhaDe, ate: linhaDe, texto: "\n" };
  if (linha.startsWith("<") && classificar(linha)) return { de: linhaAte, ate: linhaAte, texto: "\n" };

  const comeco = marcas.includes("R+") ? "  " : " ";
  if (texto.slice(pos, linhaAte).trim() !== "") return { de: pos, ate: pos, texto: `\n${comeco}` };
  const proxima = linhas[numero + 1];
  const continua = ehLinhaDeTexto(proxima) && espacosIniciais(proxima) === 0 && !proxima.startsWith("•");
  if (continua) return { de: pos, ate: linhaAte + 1, texto: `\n${comeco}` };
  return { de: pos, ate: linhaAte, texto: `\n${comeco}` };
}

// "<" numa linha que só tem espaços (o recuo que o Enter pôs): os espaços saem, para o comando
// começar na coluna 1, onde o programa o reconhece. `digitado` é o que entra (o "<", ou um
// comando inteiro de uma vez). Devolve a troca, ou null.
function aoDigitarMenor(texto, pos, digitado = "<") {
  const de = texto.lastIndexOf("\n", pos - 1) + 1;
  let ate = texto.indexOf("\n", pos);
  if (ate < 0) ate = texto.length;
  const linha = texto.slice(de, ate);
  if (!linha || linha.trim() !== "") return null;
  return { de, ate, texto: digitado };
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
  aoDigitarMenor,
  aoEnter,
  alcanceDaFaixa,
  apagarNaBorda,
  ehComando,
  linhaProtegida,
  moverLinha,
  palavraEm,
  trocaPreservandoCodigos,
  selecaoNaFaixa,
  editavel,
  foraDeLinhaEscondida,
  indiceDaPosicao,
  iniciosDasLinhas,
  linhaDoIndice,
  posicaoNaFaixa,
  vizinhaEditavel,
};
