import assert from "node:assert/strict";
import { paginar, quebrarLinhas, traduzir } from "./motor.js";

function pontos(texto, extra = {}) {
  const resultado = traduzir(texto, {
    codigo: "unificado",
    matematica: false,
    maiuscula: true,
    maiusculaPalavra: true,
    numero: true,
    correcoes: { caracteres: {}, matematica: {}, sinais: {} },
    ...extra,
  });
  return resultado.paragrafos
    .filter((paragrafo) => !paragrafo.vazio)
    .flatMap((paragrafo) => paragrafo.celas.map((cela) => cela.dots));
}

assert.deepEqual(pontos("a"), ["100000"]);
assert.deepEqual(pontos("A"), ["000101", "100000"]);
assert.deepEqual(pontos("AB"), ["000101", "000101", "100000", "110000"]);
assert.deepEqual(pontos("AB", { maiusculaPalavra: false }), ["000101", "100000", "000101", "110000"]);
assert.deepEqual(pontos("1"), ["001111", "100000"]);
assert.deepEqual(pontos("0"), ["001111", "010110"]);
assert.deepEqual(pontos("á"), ["111011"]);
assert.deepEqual(pontos("ç"), ["111101"]);
assert.deepEqual(pontos("é"), ["111111"]);
assert.deepEqual(pontos("Casa"), ["000101", "100100", "100000", "011100", "100000"]);

assert.deepEqual(pontos("(", { codigo: "antigo" }), ["011011"]);
assert.deepEqual(pontos(")", { codigo: "antigo" }), ["011011"]);
assert.deepEqual(pontos("(", { codigo: "unificado" }), ["110001"]);
assert.deepEqual(pontos(")", { codigo: "unificado" }), ["001110"]);

assert.deepEqual(pontos("`+", { matematica: true, codigo: "unificado" }), ["011010"]);
assert.deepEqual(pontos("`*", { matematica: true, codigo: "unificado" }), ["011001"]);
assert.deepEqual(pontos("`+-", { matematica: true }), ["011010", "010010", "001001"]);
assert.deepEqual(pontos("`\\/", { matematica: true }), ["110101", "100011"]);
assert.deepEqual(pontos("`não", { matematica: true }), ["000110"]);
assert.deepEqual(pontos("`contém", { matematica: true }), ["000001", "001110"]);

const corrigido = pontos("á", { correcoes: { caracteres: { á: "100000" }, matematica: {}, sinais: {} } });
assert.deepEqual(corrigido, ["100000"]);

const longo = pontos("a".repeat(40), { maiuscula: false });
const paginas = paginar(
  [{ vazio: false, celas: longo.map((dots) => ({ dots, tipo: "corpo" })) }],
  { colunas: 32, linhas: 27 }
);
assert.equal(paginas.length, 1);
assert.equal(paginas[0][0].length, 32);
assert.equal(paginas[0][1].length, 8);
assert.equal(paginas[0][1][0].cortada, true);

const linha = quebrarLinhas(
  [
    { dots: "100000", tipo: "corpo" },
    { dots: "100000", tipo: "corpo" },
    { dots: "000000", tipo: "espaco" },
    { dots: "110000", tipo: "corpo" },
    { dots: "110000", tipo: "corpo" },
  ],
  5
);
assert.equal(linha.length, 1);
assert.equal(linha[0].length, 5);
assert.equal(linha[0][2].tipo, "espaco");

const vazio = traduzir("");
assert.equal(paginar(vazio.paragrafos, { colunas: 32, linhas: 27 }).length, 1);

assert.equal(traduzir("á").paragrafos[0].celas[0].rotulo, "á");
assert.equal(traduzir("A").paragrafos[0].celas.map((cela) => cela.rotulo).join("|"), "|A");
assert.equal(traduzir("`+", { matematica: true }).paragrafos[0].celas[0].rotulo, "`+");
assert.equal(traduzir("12").paragrafos[0].celas.map((cela) => cela.rotulo).join("|"), "|1|2");

console.log("ok");
