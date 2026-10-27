import { formatar, paraRomano } from "./pagina.js";
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
if (separado.length !== 2) throw new Error(`espaço inicial juntou: ${separado}`);

const silabas = texto(["<*6 caracteres x 8 linhas>", "computador"]);
if (silabas[0] !== "compu-" || silabas[1] !== "tador") throw new Error(`sílabas: ${silabas}`);

const sem = texto(["<*16 caracteres x 8 linhas>", "<S->", "extraordinariamente"]);
const com = texto(["<*16 caracteres x 8 linhas>", "extraordinariamente"]);
if (sem[0] !== "extraordinariam-" || sem[1] !== "ente") throw new Error(`S- cortou na margem: ${sem}`);
if (com[0] !== "extraordina-" || com[1] !== "riamente") throw new Error(`S+ não usou o ponto do programa antigo: ${com}`);

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

const semNumero = formatar(["<*20 caracteres x 6 linhas>", "<289>", "<T->", "linha"], opcoes, true).linhas;
const faixaSem = semNumero.filter((linha) => linha.cabecalho);
if (faixaSem.length !== 1 || !faixaSem[0].texto.startsWith("  #bhi") || faixaSem[0].texto.includes("#a")) {
  throw new Error(`T- não tirou o número: ${JSON.stringify(faixaSem.map((linha) => linha.texto))}`);
}

if (paraRomano(1) !== "I" || paraRomano(4) !== "IV" || paraRomano(9) !== "IX" || paraRomano(40) !== "XL" || paraRomano(1990) !== "MCMXC" || paraRomano(3999) !== "MMMCMXCIX" || paraRomano(4000) !== "") {
  throw new Error(`romano: ${[1, 4, 9, 40, 1990, 3999, 4000].map(paraRomano).join(" ")}`);
}
const romana = formatar(["<*24 caracteres x 6 linhas>", "<T*4>", "linha"], opcoes, true).linhas.filter((linha) => linha.cabecalho);
if (romana.length !== 1 || romana[0].texto.includes("#") || !romana[0].texto.endsWith("IV")) {
  throw new Error(`T*4: ${JSON.stringify(romana.map((linha) => linha.texto))}`);
}

console.log("ok", junto[0], silabas.join(" / "), paragrafo[0], faixa);
