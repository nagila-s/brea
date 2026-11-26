import { formatar } from "./pagina.js";
import { montarFaixas } from "./faixas.js";
import {
  aoDigitarMenor,
  aoEnter,
  apagarNaBorda,
  editavel,
  foraDeLinhaEscondida,
  indiceDaPosicao,
  iniciosDasLinhas,
  moverLinha,
  palavraEm,
  posicaoNaFaixa,
  selecaoNaFaixa,
  trocaPreservandoCodigos,
  vizinhaEditavel,
} from "./cursor_pareado.js";

const opcoes = { codigo: "unificado", matematica: false, maiuscula: true, maiusculaPalavra: true, numero: true };

function preparar(texto, extra = {}) {
  const op = { ...opcoes, ...extra };
  const linhas = texto.split("\n");
  const faixas = montarFaixas(linhas, formatar(linhas, op, false), op);
  return { texto, faixas, inicios: iniciosDasLinhas(texto) };
}

function falha(mensagem, dado) {
  throw new Error(`${mensagem}: ${JSON.stringify(dado)}`);
}

// Ida e volta: todo índice que cai em texto visível volta para ele mesmo.
function idaEVolta(doc, nome) {
  const { texto, faixas, inicios } = doc;
  for (let indice = 0; indice <= texto.length; indice += 1) {
    const posicao = posicaoNaFaixa(faixas, inicios, indice);
    const faixa = faixas[posicao.faixa];
    if (!editavel(faixa)) continue;
    const volta = indiceDaPosicao(faixas, inicios, texto, posicao);
    if (volta === indice) continue;
    // Espaço descartado no corte, ou espaços de abertura de parágrafo: pode voltar para a borda.
    const entre = texto.slice(Math.min(volta, indice), Math.max(volta, indice));
    if (/^[ \n]*$/.test(entre)) continue;
    falha(`${nome}: ida e volta`, { indice, posicao, volta, entre });
  }
}

// O caractere sob o cursor na tinta é o mesmo do texto.
function mesmoCaractere(doc, nome) {
  const { texto, faixas, inicios } = doc;
  for (let indice = 0; indice < texto.length; indice += 1) {
    if (texto[indice] === "\n" || texto[indice] === " ") continue;
    const posicao = posicaoNaFaixa(faixas, inicios, indice);
    const faixa = faixas[posicao.faixa];
    if (!faixa.trechos?.length) continue;
    const naTinta = faixa.tinta[posicao.coluna];
    if (naTinta !== texto[indice]) falha(`${nome}: caractere`, { indice, esperado: texto[indice], naTinta, faixa: faixa.tinta });
  }
}

{
  const doc = preparar("<T->\n<R+>\n O braille é um sistema de escrita tátil.\nCada cela tem seis pontos.\n<R->\nfim", { colunasPadrao: 20, linhasPadrao: 25 });
  idaEVolta(doc, "recuo");
  mesmoCaractere(doc, "recuo");
  // O "O" do começo está na primeira faixa de texto, coluna 0; "Cada" vem depois de um espaço.
  const o = posicaoNaFaixa(doc.faixas, doc.inicios, doc.texto.indexOf("O braille"));
  if (doc.faixas[o.faixa].tinta[o.coluna] !== "O") falha("posição do O", o);
  // Clique depois do fim de uma faixa: vai para o fim do último trecho.
  const indice = indiceDaPosicao(doc.faixas, doc.inicios, doc.texto, { faixa: o.faixa, coluna: 99 });
  if (doc.texto[indice - 1] === undefined) falha("clique depois do fim", indice);
  // Clique nos espaços do recuo: vai para o começo do texto da faixa.
  const segunda = vizinhaEditavel(doc.faixas, o.faixa, 1);
  const noRecuo = indiceDaPosicao(doc.faixas, doc.inicios, doc.texto, { faixa: segunda, coluna: 0 });
  const tinta = doc.faixas[segunda].tinta;
  if (doc.texto[noRecuo] !== tinta.trim()[0]) falha("clique no recuo", { noRecuo, tinta });
}

{
  const doc = preparar("<T->\nUm Texto com 123 e MAIÚSCULAS\n\n  Parágrafo dois\n<comentário>\nfim");
  idaEVolta(doc, "sinais");
  mesmoCaractere(doc, "sinais");
}

// Linhas de código viram etiqueta: o cursor não entra nelas (só na que está sendo escrita, a
// `aberta`). A linha do <P> também é pulada.
{
  const doc = preparar("antes\n<R+>\n<S->\ndepois");
  const dentro = doc.texto.indexOf("<S->") + 2;
  const linhaS = 2;
  if (foraDeLinhaEscondida(doc.faixas, doc.inicios, doc.texto, dentro, 1, linhaS) !== dentro) falha("o código aberto prendeu o cursor");
  if (foraDeLinhaEscondida(doc.faixas, doc.inicios, doc.texto, dentro, 1) !== doc.texto.indexOf("depois")) falha("pular os códigos para baixo");
  if (foraDeLinhaEscondida(doc.faixas, doc.inicios, doc.texto, dentro, -1) !== 5) falha("pular os códigos para cima");
  const naQuebra = preparar("<T->\naaa\n<P>\nbbb");
  const noP = naQuebra.texto.indexOf("<P>") + 1;
  if (foraDeLinhaEscondida(naQuebra.faixas, naQuebra.inicios, naQuebra.texto, noP, 1) !== naQuebra.texto.indexOf("bbb")) falha("pular o <P>");
}

// <P> ao lado: Backspace no começo da página de baixo e Delete no fim da de cima não fazem nada.
// O código só muda pelo duplo clique.
{
  const doc = preparar("<T->\naaa  \n<P>\nbbb");
  const inicioB = doc.texto.indexOf("bbb");
  const apaga = apagarNaBorda(doc.faixas, doc.inicios, doc.texto, inicioB, -1);
  if (!apaga || apaga.de !== apaga.ate || apaga.cursor !== inicioB) falha("backspace no <P>", apaga);
  const fimA = doc.texto.indexOf("aaa") + 3;
  const apagaD = apagarNaBorda(doc.faixas, doc.inicios, doc.texto, fimA, 1);
  if (!apagaD || apagaD.de !== apagaD.ate || apagaD.cursor !== fimA) falha("delete no <P>", apagaD);
  // No meio da linha, o textarea age normalmente.
  if (apagarNaBorda(doc.faixas, doc.inicios, doc.texto, inicioB + 1, -1) !== null) falha("backspace no meio", null);
  // Linha que abre parágrafo com espaço: o cursor depois do espaço já é o começo da página.
  const par = preparar("<T->\naaa\n<P>\n bbb");
  const noPar = apagarNaBorda(par.faixas, par.inicios, par.texto, par.texto.indexOf("bbb"), -1);
  if (!noPar || noPar.de !== noPar.ate) falha("backspace no <P> com parágrafo", noPar);
}

// Linha em branco encostada num código: Backspace e Delete apagam a linha, e o código fica.
{
  const doc = preparar("<T->\naaa\n<P>\n<t título>\n\nbbb");
  const branca = doc.texto.indexOf("\n\n") + 1;
  const apaga = apagarNaBorda(doc.faixas, doc.inicios, doc.texto, branca, -1);
  const resto = doc.texto.slice(0, apaga.de) + doc.texto.slice(apaga.ate);
  if (resto !== "<T->\naaa\n<P>\n<t título>\nbbb" || apaga.cursor !== apaga.de - 1) falha("backspace na linha em branco", { resto, apaga });
  const antes = preparar("<T->\naaa\n\n<P>\nbbb");
  const brancaD = antes.texto.indexOf("\n\n") + 1;
  const apagaD = apagarNaBorda(antes.faixas, antes.inicios, antes.texto, brancaD, 1);
  const restoD = antes.texto.slice(0, apagaD.de) + antes.texto.slice(apagaD.ate);
  if (restoD !== "<T->\naaa\n<P>\nbbb") falha("delete na linha em branco", restoD);
}

// Backspace logo depois de um comando que não é <P>: não junta e o cursor não entra nele.
{
  const doc = preparar("antes\n<R+>\ndepois");
  const depois = doc.texto.indexOf("depois");
  const apaga = apagarNaBorda(doc.faixas, doc.inicios, doc.texto, depois, -1);
  if (!apaga || apaga.de !== apaga.ate || apaga.cursor !== depois) falha("backspace depois do comando", apaga);
  // Cursor na linha do comando (aberta): Backspace no começo e Delete no fim não fazem nada.
  const noComando = apagarNaBorda(doc.faixas, doc.inicios, doc.texto, doc.texto.indexOf("<R+>"), -1);
  if (!noComando || noComando.de !== noComando.ate) falha("backspace no começo do comando", noComando);
  const fimComando = apagarNaBorda(doc.faixas, doc.inicios, doc.texto, doc.texto.indexOf("<R+>") + 4, 1);
  if (!fimComando || fimComando.de !== fimComando.ate) falha("delete no fim do comando", fimComando);
}

// O caso da capa: Delete no fim da última linha, com <1>, <P> e o título depois. Antes apagava
// o <P> e levava o cursor para dentro do <t título>.
{
  const doc = preparar("          Brasil -- 2024\n<1>\n<P>\n<t ac arte 6º ano>\n<t*1>\n\ntexto");
  const fim = doc.texto.indexOf("2024") + 4;
  const apaga = apagarNaBorda(doc.faixas, doc.inicios, doc.texto, fim, 1);
  if (!apaga || apaga.de !== apaga.ate || apaga.cursor !== fim) falha("delete no fim da capa", apaga);
}

// Apagar entre duas páginas: o texto selecionado sai e os códigos ficam, cada um na sua linha.
{
  const texto = "fim da página um\nlinha toda\n<P>\n<t título>\ncomeço da dois";
  const aplicar = (troca) => texto.slice(0, troca.de) + troca.texto + texto.slice(troca.ate);
  const de = texto.indexOf("um");
  const ate = texto.indexOf("da dois");
  const troca = trocaPreservandoCodigos(texto, de, ate);
  const resto = aplicar(troca);
  if (resto !== "fim da página \n<P>\n<t título>\nda dois") falha("apagar entre páginas", resto);
  if (resto.slice(troca.cursor - 5, troca.cursor) !== "gina ") falha("cursor ao apagar entre páginas", troca.cursor);
  // Digitar por cima: o que entra fica na página de cima.
  const digitado = aplicar(trocaPreservandoCodigos(texto, de, ate, "X"));
  if (digitado !== "fim da página X\n<P>\n<t título>\nda dois") falha("digitar entre páginas", digitado);
  // Linhas inteiras: nenhuma linha vazia sobra em volta dos códigos.
  const inteiras = trocaPreservandoCodigos(texto, texto.indexOf("linha"), texto.length);
  const sobra = aplicar(inteiras);
  if (sobra !== "fim da página um\n<P>\n<t título>") falha("apagar linhas inteiras", sobra);
  if (inteiras.cursor !== texto.indexOf("\nlinha")) falha("cursor depois de apagar linhas inteiras", inteiras.cursor);
  // Sem código no trecho, ou dentro de uma linha só: troca comum.
  if (trocaPreservandoCodigos(texto, 0, texto.indexOf("toda")) !== null) falha("sem código", null);
  if (trocaPreservandoCodigos("<t título>", 1, 3) !== null) falha("dentro do código", null);
}

// Setas para cima e para baixo pulam cabeçalho e quebra.
{
  const doc = preparar("aaa\n<P>\nbbb", { colunasPadrao: 10, linhasPadrao: 5 });
  const a = posicaoNaFaixa(doc.faixas, doc.inicios, 0).faixa;
  const b = vizinhaEditavel(doc.faixas, a, 1);
  if (doc.faixas[b].tinta !== "bbb") falha("seta para baixo", doc.faixas.map((f) => f.tipo));
  if (vizinhaEditavel(doc.faixas, b, -1) !== a) falha("seta para cima", null);
}

// Seleção: o que pintar em cada faixa.
{
  const doc = preparar("<T->\nUma Casa grande e computador\nfim", { colunasPadrao: 14, linhasPadrao: 25 });
  const { texto, faixas, inicios } = doc;
  const pintar = (de, ate) => faixas
    .map((faixa, i) => ({ i, faixa, sel: selecaoNaFaixa(faixa, inicios, texto, de, ate) }))
    .filter((item) => item.sel)
    .map(({ faixa, sel }) => ({
      tinta: faixa.tinta.slice(sel.tinta[0], sel.tinta[1]),
      celas: sel.braille ? sel.braille[1] - sel.braille[0] : 0,
    }));
  // Dentro de uma faixa: "Casa" pinta 4 colunas e 5 celas (o sinal de maiúscula entra junto).
  const casa = texto.indexOf("Casa");
  const so = pintar(casa, casa + 4);
  if (so.length !== 1 || so[0].tinta !== "Casa" || so[0].celas !== 5) falha("seleção de Casa", so);
  // Uma palavra separada entre duas faixas: pinta as duas partes, com o hífen do corte.
  const comp = texto.indexOf("computador");
  const partes = pintar(comp, comp + "computador".length);
  if (partes.length !== 2 || partes.map((p) => p.tinta).join("").replace("-", "") !== "computador") falha("seleção cortada", partes);
  if (!partes[0].tinta.endsWith("-")) falha("o hífen do corte deveria entrar na seleção", partes);
  // Tudo: toda faixa de texto entra inteira, e a linha do comando (<T->) também, que aparece
  // na tinta.
  const tudo = pintar(0, texto.length);
  const texto2 = ["<T->", ...faixas.filter((f) => f.tipo === "texto").map((f) => f.tinta)];
  if (tudo.map((p) => p.tinta).join("|") !== texto2.join("|")) falha("selecionar tudo", { tudo, texto2 });
  // Seleção vazia não pinta nada.
  if (pintar(casa, casa).length) falha("seleção vazia", null);
}

// Palavra do duplo clique.
{
  const texto = "Olá, mundo-novo 123.";
  const p1 = palavraEm(texto, 1);
  if (texto.slice(p1.de, p1.ate) !== "Olá") falha("palavra", p1);
  const p2 = palavraEm(texto, texto.indexOf("novo"));
  if (texto.slice(p2.de, p2.ate) !== "novo") falha("palavra com hífen", p2);
  const p3 = palavraEm(texto, 3);
  if (texto.slice(p3.de, p3.ate) !== "Olá") falha("fim de palavra", p3);
}

// Enter desce o resto da linha, sem abrir parágrafo: um espaço no texto comum (a linha vai para
// a margem), dois dentro do <R+> (alinhada com as outras linhas do recuo).
{
  const trocar = (texto, troca) => texto.slice(0, troca.de) + troca.texto + texto.slice(troca.ate);
  const comum = "<T->\n  um parágrafo comum";
  const meio = comum.indexOf("comum");
  const partido = trocar(comum, aoEnter(comum, meio));
  if (partido !== "<T->\n  um parágrafo \n comum") falha("enter no texto comum", partido);
  // No braille, "comum" vai para a linha de baixo, na margem.
  const linhasDoBraille = preparar(partido).faixas.filter((f) => f.tipo === "texto").map((f) => f.tinta);
  if (linhasDoBraille.join("|") !== "  um parágrafo|comum") falha("enter no texto comum, braille", linhasDoBraille);
  // Dentro do <R+>: dois espaços, e a linha fica com o recuo das outras.
  const recuo = "<T->\n<R+>\n primeiro item do recuo\n<R->";
  const noRecuo = trocar(recuo, aoEnter(recuo, recuo.indexOf("do recuo")));
  if (noRecuo !== "<T->\n<R+>\n primeiro item \n  do recuo\n<R->") falha("enter no <R+>", noRecuo);
  const linhasDoRecuo = preparar(noRecuo).faixas.filter((f) => f.tipo === "texto").map((f) => f.tinta);
  if (linhasDoRecuo.join("|") !== "primeiro item|  do recuo") falha("enter no <R+>, braille", linhasDoRecuo);
  // Fim da linha com o parágrafo continuando embaixo: a de baixo é que desce.
  const continua = "  um\ndois";
  if (trocar(continua, aoEnter(continua, 4)) !== "  um\n dois") falha("enter no fim da linha", trocar(continua, aoEnter(continua, 4)));
  // <F->: só a quebra.
  const fixo = "<F->\numa linha";
  if (aoEnter(fixo, fixo.length).texto !== "\n") falha("enter no F-", aoEnter(fixo, fixo.length));
  // No começo do texto da linha: ela desce.
  const comeco = "  um\n  dois";
  if (JSON.stringify(aoEnter(comeco, 7)) !== JSON.stringify({ de: 5, ate: 5, texto: "\n" })) falha("enter no começo", aoEnter(comeco, 7));
  // Linha de comando: a linha nova vem depois dela.
  const titulo = "<T Livro>\n  texto";
  if (JSON.stringify(aoEnter(titulo, 4)) !== JSON.stringify({ de: 9, ate: 9, texto: "\n" })) falha("enter no comando", aoEnter(titulo, 4));
  // "<" na linha do recuo: o comando começa na coluna 1.
  if (JSON.stringify(aoDigitarMenor("<T Livro>\n  \n  texto", 12)) !== JSON.stringify({ de: 10, ate: 12, texto: "<" })) falha("< na linha do recuo");
  if (aoDigitarMenor("  um <b>", 5) !== null) falha("< no meio do texto");
}

console.log("ok");

// Arrastar um código para outra linha: sobe e desce, o tamanho não muda, as linhas do meio andam.
{
  const texto = "aaa\nbbb\n<P>\nccc\nddd";
  const aplicar = (troca) => texto.slice(0, troca.de) + troca.texto + texto.slice(troca.ate);
  const sobe = moverLinha(texto, 2, 1);
  if (aplicar(sobe) !== "aaa\n<P>\nbbb\nccc\nddd") falha("subir o código", aplicar(sobe));
  if (sobe.desloca !== 4) falha("deslocamento ao subir", sobe);
  const topo = moverLinha(texto, 2, 0);
  if (aplicar(topo) !== "<P>\naaa\nbbb\nccc\nddd") falha("código no começo", aplicar(topo));
  const desce = moverLinha(texto, 2, 4);
  if (aplicar(desce) !== "aaa\nbbb\nccc\n<P>\nddd" || desce.desloca !== -4) falha("descer o código", aplicar(desce));
  const fim = moverLinha(texto, 2, 5);
  if (aplicar(fim) !== "aaa\nbbb\nccc\nddd\n<P>") falha("código no fim", aplicar(fim));
  if (moverLinha(texto, 2, 2) !== null || moverLinha(texto, 2, 3) !== null) falha("mesmo lugar", null);
  if (aplicar(moverLinha(texto, 0, 5)) !== "bbb\n<P>\nccc\nddd\naaa") falha("primeira para o fim", null);
}
