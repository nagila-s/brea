import { formatar } from "./pagina.js";
import { montarFaixas } from "./faixas.js";
import {
  apagarNaBorda,
  editavel,
  foraDeLinhaEscondida,
  indiceDaPosicao,
  iniciosDasLinhas,
  palavraEm,
  posicaoNaFaixa,
  selecaoNaFaixa,
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

// Linhas de código: o cursor não fica nelas; anda na direção do movimento.
{
  const doc = preparar("antes\n<R+>\n<S->\ndepois");
  const dentro = doc.texto.indexOf("<S->") + 2;
  const frente = foraDeLinhaEscondida(doc.faixas, doc.inicios, doc.texto, dentro, 1);
  if (frente !== doc.texto.indexOf("depois")) falha("pular comando para a frente", frente);
  const tras = foraDeLinhaEscondida(doc.faixas, doc.inicios, doc.texto, dentro, -1);
  if (tras !== doc.texto.indexOf("\n<R+>")) falha("pular comando para trás", tras);
}

// <P>: Backspace no começo da página de baixo e Delete no fim da de cima apagam a linha do <P>.
{
  const doc = preparar("<T->\naaa\n<P>\nbbb");
  const inicioB = doc.texto.indexOf("bbb");
  const apaga = apagarNaBorda(doc.faixas, doc.inicios, doc.texto, inicioB, -1);
  const resto = doc.texto.slice(0, apaga.de) + doc.texto.slice(apaga.ate);
  if (resto !== "<T->\naaa\nbbb") falha("backspace no <P>", resto);
  const fimA = doc.texto.indexOf("aaa") + 3;
  const apagaD = apagarNaBorda(doc.faixas, doc.inicios, doc.texto, fimA, 1);
  const restoD = doc.texto.slice(0, apagaD.de) + doc.texto.slice(apagaD.ate);
  if (restoD !== "<T->\naaa\nbbb") falha("delete no <P>", restoD);
  // No meio da linha, o textarea age normalmente.
  if (apagarNaBorda(doc.faixas, doc.inicios, doc.texto, inicioB + 1, -1) !== null) falha("backspace no meio", null);
}

// Linha que abre parágrafo com espaço: o cursor depois do espaço já é o começo da página.
{
  const doc = preparar("<T->\naaa\n<P>\n bbb");
  const apaga = apagarNaBorda(doc.faixas, doc.inicios, doc.texto, doc.texto.indexOf("bbb"), -1);
  const resto = doc.texto.slice(0, apaga.de) + doc.texto.slice(apaga.ate);
  if (resto !== "<T->\naaa\n bbb") falha("backspace no <P> com parágrafo", resto);
}

// Backspace logo depois de um comando que não é <P>: não junta por cima dele.
{
  const doc = preparar("antes\n<R+>\ndepois");
  const apaga = apagarNaBorda(doc.faixas, doc.inicios, doc.texto, doc.texto.indexOf("depois"), -1);
  if (!apaga || apaga.de !== apaga.ate) falha("não deveria apagar o comando", apaga);
  // <P> com um comando no meio: ainda é apagado.
  const doc2 = preparar("<T->\naaa\n<P>\n<R+>\nbbb");
  const apaga2 = apagarNaBorda(doc2.faixas, doc2.inicios, doc2.texto, doc2.texto.indexOf("bbb"), -1);
  const resto = doc2.texto.slice(0, apaga2.de) + doc2.texto.slice(apaga2.ate);
  if (resto !== "<T->\naaa\n<R+>\nbbb") falha("backspace no <P> passando pelo comando", resto);
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
  // Tudo: toda faixa de texto entra inteira.
  const tudo = pintar(0, texto.length);
  const texto2 = faixas.filter((f) => f.tipo === "texto").map((f) => f.tinta);
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

console.log("ok");
