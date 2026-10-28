// Regras de contexto do tradutor original (_Unit67 = unificado, _Unit68 = antigo).
// Os pontos esperados saem do asm + AMBCODE*.CFG + BRAILEX.AMB.
import assert from "node:assert/strict";
import { traduzir } from "./motor.js";

function celas(texto, extra = {}) {
  return traduzir(texto, { codigo: "unificado", ...extra }).paragrafos.flatMap((p) => p.celas);
}
const pontos = (texto, extra) => celas(texto, extra).map((cela) => cela.dots);
const caso = (texto, esperado, extra) => assert.deepEqual(pontos(texto, extra), esperado, JSON.stringify(texto));
const antigo = { codigo: "antigo" };

// Ordinais (0047CA30): # + dígito rebaixado + a/o.
caso("1º", ["001111", "010000", "101010"]);
caso("2ª", ["001111", "011000", "100000"]);
caso("1o.", ["001111", "010000", "101010"]);
caso("2as.", ["001111", "011000", "100000", "011100"]);
caso("1°", ["001111", "010000", "101010"], antigo); // ° só no antigo (0047BD50)

// Números (0047CDEC / 0047CCF0).
caso("10,50", ["001111", "100000", "010110", "010000", "100010", "010110"]);
caso("1.000", ["001111", "100000", "001000", "010110", "010110", "010110"]);
caso("3.5", ["001111", "100100", "001000", "001111", "100010"]);
caso("3d", ["001111", "100100", "000010", "100110"]);
caso("3o", ["001111", "100100", "101010"]); // o não é a-j: sem cela 5
// Antigo (0047C018): ponto com dígito depois vira ' (3), sem novo #.
caso("1.5", ["001111", "100000", "001000", "100010"], antigo);

// Maiúsculas (0047D124): duplica se a seguinte é maiúscula; cela 5 se a palavra continua minúscula.
caso("CDs", ["000101", "000101", "100100", "100110", "000010", "011100"]);
caso("CDs", ["000101", "000101", "100100", "100110", "011100"], antigo);
caso("Casa", ["000101", "100100", "100000", "011100", "100000"]);

// Parênteses (0047DC18 / 0047DD34 / 0047D3E0).
caso("(1)", ["110001", "001111", "100000", "001110"]);
caso("(a)", ["110001", "001000", "100000", "000001", "001110"]);
caso("[2]", ["111011", "001111", "110000", "011111"]);

// Switch do unificado (0047D3E0).
caso("a/b", ["100000", "000001", "010000", "110000"]);
caso("50%", ["001111", "100010", "010110", "000111", "001011"]);
caso("§", ["011100", "011100"]);
caso("a – b", ["100000", "000000", "001001", "001001", "000000", "110000"]);
caso("...", ["001000", "001000", "001000"]);
caso("…", ["001000", "001000", "001000"]);
caso("¾", ["001111", "010010", "100110"]);
caso("€", ["000100", "100010"]);
caso("“a”", ["011001", "100000", "011001"]);

// Antigo (0047C510): "..." -> ''' (literal de 3 bytes em 47C590); o índice anda 3.
caso("...", ["001000", "001000", "001000"], antigo);
caso("a... b", ["100000", "001000", "001000", "001000", "000000", "110000"], antigo);
caso("a...x", ["100000", "001000", "001000", "001000", "101101"], antigo);
caso("50%", ["001111", "100010", "010110", "000111", "001011"], antigo);
caso("§", ["011100", "011100"], antigo);
// Aspas alternadas no antigo (0047C5A0).
caso("\"a\"", ["011001", "100000", "001011"], antigo);

// Datas e horas, só no antigo (0047BB44 / 0047BC58).
caso("12/05/2020", ["001111", "100000", "110000", "001001", "010110", "100010", "001001", "110000", "010110", "110000", "010110"], antigo);
caso("10:30", ["001111", "100000", "010110", "010010", "100100", "010110"], antigo);

// Frações com crase (0047CF58): # + numerador rebaixado + denominador.
caso("`3/4", ["001111", "010010", "100110"]);
// Crase + 1 caractere pela tabela 4AA348 (sem a opção matemática).
caso("`+", ["011010"]);
caso("`%", ["001001", "001011"]);

// Modo inglês (<I+>).
caso("Ab", ["000001", "100000", "110000"], { ingles: true });
caso("a.", ["100000", "010011"], { ingles: true });
caso("(a)", ["011011", "100000", "011011"], { ingles: true });

// Espaços: TAB = 2 espaços; NBSP = 12356; ¨ = branco que não quebra.
caso("a\tb", ["100000", "000000", "000000", "110000"]);
const nbsp = celas("a b");
assert.equal(nbsp[1].dots, "111011");
assert.equal(nbsp[1].tipo, "corpo");
const trema = celas("a¨b");
assert.equal(trema[1].dots, "000000");
assert.equal(trema[1].tipo, "espaco-fixo");
assert.equal(trema[1].meta, 0x20);
assert.equal(trema[1].metaTexto, 0xa8);

// Byte sem entrada no .cfg passa como ele mesmo.
const semEntrada = celas("ø");
assert.equal(semEntrada[0].meta, 0xf8);

// Contrato: sinais sem rótulo, mesmo bloco do caractere; de/ate no texto de entrada.
const ordinal = celas("x 1º");
assert.deepEqual(ordinal.map((cela) => cela.rotulo), ["x", "", "", "1", "º"]);
assert.equal(ordinal[2].bloco, ordinal[3].bloco);
assert.deepEqual([ordinal[4].de, ordinal[4].ate], [3, 4]);

console.log("ok");
