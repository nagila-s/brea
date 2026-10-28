// Tabelas que o tradutor do Braille Fácil traz dentro do BrFacil.EXE (não estão nos .cfg).
// Lidas direto do executável (seção DATA); os endereços são os do IDR.

// Dígitos rebaixados 0..9, usados em ordinais e frações.
// Unificado: tabela em 4AA30C indexada pelo byte do dígito (0x4AA33C..0x4AA345).
export const REBAIXADO_UNIFICADO = "},;:/?!=\"*";
// Antigo: tabela em 4AA300 (0x4AA330..0x4AA339).
export const REBAIXADO_ANTIGO = "},;:.?!){*";

// Tabela de crase em 4AA348: 40 entradas de 46 bytes.
// +0 chave (string[2]), +9 saída usada pelo unificado (sub_0047DB58), +0F descrição dos pontos.
// O programa só aceita chave de 1 caractere; as de 2 ("¨(", "¨)", "!)") nunca casam.
// As entradas vazias têm chave #1 e saída vazia.
export const CRASE_UNIFICADO = [
  ["+", "!"],
  ["-", "-"],
  ["*", "\""],
  ["x", "\""],
  ["/", "ÿ"],
  ["÷", "ÿ"],
  ["%", "-}"],
  ["=", "="],
  ["\u0001", ""],
  ["\u0001", ""],
  ["(", "ê"],
  [")", "ã"],
  ["¨(", "?"],
  ["¨)", "*"],
  ["[", "á"],
  ["]", "ú"],
  ["{", "~l"],
  ["}", "_,"],
  ["\u0001", ""],
  ["\u0001", ""],
  ["^", "â"],
  ["_", "í"],
  ["\\", "àû"],
  ["!)", "ý!"],
  ["\u0001", ""],
  ["\u0001", ""],
  ["\u0001", ""],
  ["\u0001", ""],
  ["\u0001", ""],
  ["\u0001", ""],
  ["0", "#}"],
  ["1", "#,"],
  ["2", "#;"],
  ["3", "#:"],
  ["4", "#ÿ"],
  ["5", "#?"],
  ["6", "#!"],
  ["7", "#="],
  ["8", "#\""],
  ["9", "#*"],
];
