import { formatar as formatarDoc, paraRomano } from "./pagina.js";

// "<*N caracteres x M linhas>" é só comentário no texto; o tamanho da página vem da configuração.
function formatar(linhas, op, tinta) {
  const medida = linhas[0]?.match(/^<\*(\d+) caracteres x (\d+) linhas>$/);
  const extra = medida ? { colunasPadrao: Number(medida[1]), linhasPadrao: Number(medida[2]) } : {};
  return formatarDoc(linhas, { ...op, ...extra }, tinta);
}
import { silabar } from "./silabas.js";

const opcoes = {
  codigo: "unificado",
  matematica: false,
  maiuscula: false,
  maiusculaPalavra: false,
  numero: true,
};

function texto(linhas) {
  return formatar(linhas, opcoes, true).linhas
    .filter((linha) => linha.tipo === "tinta" && !linha.cabecalho)
    .map((linha) => linha.texto);
}

const junto = texto(["um texto", "partido"]);
if (junto.length !== 1 || !junto[0].includes(" ")) throw new Error(`não juntou: ${junto}`);

const separado = texto([" primeira", "segunda"]);
// 0049BAC0: um espaço inicial fecha o parágrafo anterior, some, e a linha junta as seguintes.
if (separado.length !== 1 || separado[0] !== "primeira segunda") throw new Error(`espaço inicial: ${separado}`);
const antes = texto(["anterior", " primeira", "segunda"]);
if (antes.length !== 2 || antes[0] !== "anterior") throw new Error(`espaço inicial não abriu parágrafo: ${antes}`);

// <R+>: as linhas de baixo de cada parágrafo ganham dois espaços (0049BA2C), também no item com 1 espaço.
const recuo = texto(["<*20 caracteres x 8 linhas>", "<R+>", " item um que quebra em tres linhas", "continua", "<R->", " item dois que quebra em tres"]);
if (recuo.slice(0, 3).some((linha, i) => i > 0 && !linha.startsWith("  ")) || recuo.slice(3).some((linha) => linha.startsWith("  "))) {
  throw new Error(`R±: ${JSON.stringify(recuo)}`);
}

const silabas = texto(["<*6 caracteres x 8 linhas>", "computador"]);
if (silabas[0] !== "compu-" || silabas[1] !== "tador") throw new Error(`sílabas: ${silabas}`);

const sem = texto(["<*16 caracteres x 8 linhas>", "<S->", "extraordinariamente"]);
const com = texto(["<*16 caracteres x 8 linhas>", "extraordinariamente"]);
if (sem[0] !== "extraordinariam-" || sem[1] !== "ente") throw new Error(`S- cortou na margem: ${sem}`);
if (com[0] !== "extraordinaria-" || com[1] !== "mente") throw new Error(`S+ não usou o ponto do programa antigo: ${com}`);

const pagina = formatar([
  "<*10 caracteres x 4 linhas>",
  " a",
  " b",
  " c",
  " d",
  " e",
], opcoes, false);
const marcas = pagina.linhas.filter((linha) => linha.separador).map((linha) => linha.texto);
if (pagina.paginas !== 2) throw new Error(`páginas ${pagina.paginas} ${marcas}`);
if (pagina.linhas[0].separador || marcas.length !== 1 || marcas[0] !== "-".repeat(50)) {
  throw new Error(`separador: ${JSON.stringify(marcas)}`);
}
if (pagina.linhas.some((linha) => linha.texto.startsWith("página "))) {
  throw new Error("a página ainda leva o aviso de tamanho no meio do braille");
}

const quebra = formatar(["<*10 caracteres x 8 linhas>", "aaa", "<P>", "bbb"], opcoes, false);
if (quebra.paginas !== 2) throw new Error(`quebra ${quebra.paginas}`);

const fixo = texto(["<F->", "uma", "linha"]);
if (fixo.length !== 2) throw new Error(`F- juntou: ${fixo}`);

if (silabar("constituição").join("-") !== "cons-ti-tu-i-ção") throw new Error("constituição");

const paragrafo = texto(["<*30 caracteres x 8 linhas>", "  primeiro", "segue", "  segundo"]);
if (!paragrafo[0].startsWith("  primeiro segue")) throw new Error(`parágrafo: ${JSON.stringify(paragrafo)}`);
if (!paragrafo[1].startsWith("  segundo")) throw new Error(`segundo parágrafo: ${JSON.stringify(paragrafo)}`);

const recuado = texto([
  "<*12 caracteres x 10 linhas>",
  "<R+>",
  "aaaa bbbb cccc dddd",
  "<R->",
  "aaaa bbbb cccc dddd",
]);
if (!recuado[0] || recuado[0].startsWith("  ") || !recuado[1]?.startsWith("  cccc")) {
  throw new Error(`recuo: ${JSON.stringify(recuado)}`);
}
if (recuado.slice(2).some((linha) => linha.startsWith("  "))) {
  throw new Error(`recuo fora do R+: ${JSON.stringify(recuado)}`);
}

const bloco = texto(["<*40 caracteres x 10 linhas>", "<R+>", "-- Filosofia", "", "-- Objetivos", "<R->", "-- Fora"]);
if (bloco[0] !== "-- Filosofia" || bloco[1] !== "" || bloco[2] !== "-- Objetivos" || bloco[3] !== "-- Fora") {
  throw new Error(`bloco: ${JSON.stringify(bloco)}`);
}

const misto = texto(["<*40 caracteres x 12 linhas>", "<R+>", "-- Filosofia", "  Vida e obra de Freud.", "<R->", "  Fora do bloco"]);
if (misto[0] !== "-- Filosofia" || misto[1] !== "  Vida e obra de Freud'" || misto[2] !== "  Fora do bloco") {
  throw new Error(`misto: ${JSON.stringify(misto)}`);
}

const cabecalho = formatar([
  "<*20 caracteres x 6 linhas>",
  "<T identificacao>",
  "linha",
], opcoes, true).linhas.filter((linha) => linha.cabecalho);
if (cabecalho.length !== 1) throw new Error(`cabeçalhos ${cabecalho.length}`);
const faixa = cabecalho[0].texto;
if (faixa.length !== 20 || !faixa.endsWith("#a") || faixa.indexOf("identificacao") <= 0) {
  throw new Error(`cabeçalho: ${JSON.stringify(faixa)}`);
}

const duas = formatar([
  "<*12 caracteres x 3 linhas>",
  "<T identificacao>",
  " a",
  " b",
  " c",
  " d",
], opcoes, true).linhas.filter((linha) => linha.cabecalho);
if (duas.length !== 2 || !duas[0].texto.endsWith("#a") || !duas[1].texto.endsWith("#b")) {
  throw new Error(`numeração: ${JSON.stringify(duas.map((linha) => linha.texto))}`);
}

const semTitulo = formatar(["<T identificacao>", "<T->", "linha"], opcoes, true).linhas;
if (semTitulo.some((linha) => linha.cabecalho)) throw new Error("T- ainda mostra o cabeçalho");

const numerada = formatar(["<T identificacao>", "antes", "<T+3>", "depois"], opcoes, true).linhas
  .filter((linha) => linha.cabecalho);
if (numerada.length !== 2 || !numerada[0].texto.endsWith("#a") || !numerada[1].texto.endsWith("#c")) {
  throw new Error(`T+3: ${JSON.stringify(numerada.map((linha) => linha.texto))}`);
}

const tintaNaFaixa = formatar(["<*20 caracteres x 6 linhas>", "<289>", "linha"], opcoes, true).linhas;
const faixaTinta = tintaNaFaixa.filter((linha) => linha.cabecalho);
if (faixaTinta.length !== 1 || faixaTinta[0].texto.length !== 20 || !faixaTinta[0].texto.startsWith("  #bhi") || !faixaTinta[0].texto.endsWith("#a")) {
  throw new Error(`289 fora da faixa: ${JSON.stringify(faixaTinta.map((linha) => linha.texto))}`);
}
if (tintaNaFaixa.some((linha) => !linha.cabecalho && linha.texto.includes("#bhi"))) {
  throw new Error("289 ainda é linha do texto");
}

const depoisDaBranca = formatar([
  "<*20 caracteres x 4 linhas>",
  "",
  "<289>",
  "um",
  "dois",
  "tres",
  "quatro",
  "cinco",
], opcoes, true).linhas.filter((linha) => linha.cabecalho);
// A linha em branco do início já grava a página 1 com o seu cabeçalho (0049B91E), antes do <289>:
// o 289 só aparece a partir da página seguinte.
if (!depoisDaBranca.length || depoisDaBranca[0].texto.includes("#bhi") || !depoisDaBranca.slice(1).every((linha) => linha.texto.includes("#bhi"))) {
  throw new Error(`página em tinta: ${JSON.stringify(depoisDaBranca.map((linha) => linha.texto))}`);
}
// Não é retroativo: o <289> depois de "um" já gravado não entra no cabeçalho da página 1...
const retro = formatar(["um", "", "dois", "<289>", "tres"], { ...opcoes, colunasPadrao: 20, linhasPadrao: 4 }, true).linhas.filter((linha) => linha.cabecalho);
if (retro[0].texto.includes("#bhi")) throw new Error(`tinta retroativa: ${retro[0].texto}`);
// ...mas entra se o texto anterior ainda estava no buffer do parágrafo.
const noBuffer = formatar(["um dois", "<289>", "tres"], { ...opcoes, colunasPadrao: 20, linhasPadrao: 4 }, true).linhas.filter((linha) => linha.cabecalho);
if (!noBuffer[0].texto.includes("#bhi")) throw new Error(`tinta do buffer: ${noBuffer[0].texto}`);

const semNumero = formatar(["<*20 caracteres x 6 linhas>", "<289>", "<T->", "linha"], opcoes, true).linhas;
// 0049B36B: com <T-> não há linha de cabeçalho, nem para a página em tinta; o corpo usa as 6 linhas.
const faixaSem = semNumero.filter((linha) => linha.cabecalho);
if (faixaSem.length !== 0) throw new Error(`T- deixou cabeçalho: ${JSON.stringify(faixaSem.map((linha) => linha.texto))}`);
const cheia = texto(["<*20 caracteres x 6 linhas>", "<289>", "<T->", "<F->", "a", "b", "c", "d", "e", "f", "g"]);
if (cheia.slice(0, 6).join() !== "a,b,c,d,e,f") throw new Error(`T- não usou as 6 linhas: ${cheia}`);

if (paraRomano(1) !== "I" || paraRomano(4) !== "IV" || paraRomano(9) !== "IX" || paraRomano(40) !== "XL" || paraRomano(1990) !== "MCMXC" || paraRomano(3999) !== "MMMCMXCIX" || paraRomano(4000) !== "") {
  throw new Error(`romano: ${[1, 4, 9, 40, 1990, 3999, 4000].map(paraRomano).join(" ")}`);
}
const romana = formatar(["<*24 caracteres x 6 linhas>", "<T*4>", "linha"], opcoes, true).linhas.filter((linha) => linha.cabecalho);
if (romana.length !== 1 || romana[0].texto.includes("#") || !romana[0].texto.endsWith("IV")) {
  throw new Error(`T*4: ${JSON.stringify(romana.map((linha) => linha.texto))}`);
}

// Bitsets do hífen lidos do EXE em 0x49B888: "camisola" parte em cami-/sola.
const camisola = texto(["<*32 caracteres x 8 linhas>", "aaaaaaaaaa aaaaaaaaaaaaaaa camisola"]);
if (camisola[0] !== "aaaaaaaaaa aaaaaaaaaaaaaaa cami-" || camisola[1] !== "sola") throw new Error(`hífen: ${camisola}`);

// "¨" é espaço que não quebra: o corte acontece no texto intermediário (0xA8).
const naoQuebra = texto(["<*34 caracteres x 8 linhas>", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa x¨yy"]);
if (naoQuebra[0] !== "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" || naoQuebra[1] !== "x yy") throw new Error(`¨ quebrou: ${naoQuebra}`);

// <I+> liga a maiúscula inglesa (ponto 6, meta ","); <I-> volta ao sinal 46.
const ingles = formatar(["<I+>", "Abc", "<I->", "Abc"], { codigo: "unificado" }, true).linhas.filter((linha) => linha.tipo === "tinta" && !linha.cabecalho).map((linha) => linha.texto);
// <I-> não fecha o parágrafo (0049BC94): as duas linhas juntam, cada uma com o seu modo.
if (ingles.length !== 1 || ingles[0] !== ",abc .abc") throw new Error(`I±: ${ingles}`);

// Só P, T, F, R, G e M fecham o parágrafo; S, I, página em tinta, anotação e comentário não.
for (const meio of ["<S->", "<*** nota ***>", "<com interponto>", "<b>x</b>"]) {
  const junto2 = texto(["um dois", meio, "tres"]);
  if (junto2.length !== 1 || junto2[0] !== "um dois tres") throw new Error(`${meio} fechou o parágrafo: ${junto2}`);
}
for (const meio of ["<R+>", "<F+>", "<T titulo>", "<M>"]) {
  const separado2 = texto(["um dois", meio, "tres"]);
  if (separado2.length !== 2) throw new Error(`${meio} não fechou o parágrafo: ${separado2}`);
}
// Comentários não aparecem no braille.
const notas = formatar(["<*34 caracteres x 28 linhas>", "<com interponto>", "<com separação de sílabas>", "texto"], opcoes, true).linhas;
if (notas.some((linha) => linha.tipo === "codigo" && !linha.separador) || !notas.some((linha) => linha.texto === "texto")) {
  throw new Error(`comentário no braille: ${JSON.stringify(notas.map((linha) => linha.texto))}`);
}

// <P> sempre fecha a página, mesmo vazia; a página vazia fica com o número (0049BCE1).
const paginasDe = (linhas) => formatar(linhas, { ...opcoes, colunasPadrao: 20, linhasPadrao: 6 }, true);
const cabecas = (linhas) => paginasDe(linhas).linhas.filter((linha) => linha.cabecalho).map((linha) => linha.texto.trim());
if (paginasDe(["<P>", "texto"]).paginas !== 2 || cabecas(["<P>", "texto"]).join() !== "#a,#b") throw new Error("<P> no início");
if (cabecas(["texto", "<P>", "<P>", "mais"]).join() !== "#a,#b,#c") throw new Error("<P><P> sem página vazia");
if (paginasDe(["texto", "<P>"]).paginas !== 2) throw new Error("<P> no fim");
if (paginasDe(["<T->", "a", "<P>", "<P>", "b"]).paginas !== 3) throw new Error("página vazia sem cabeçalho");
if (paginasDe(["<T+3>", "a"]).paginas !== 1 || cabecas(["<T+3>", "a"]).join() !== "#c") throw new Error("<T+3> no início");

console.log("ok", junto[0], silabas.join(" / "), paragrafo[0], faixa);
