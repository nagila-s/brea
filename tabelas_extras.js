// Tabelas do tradutor que não estão em tabelas.js: dígitos rebaixados e a tabela da crase.

// Dígitos rebaixados 0..9, usados em ordinais e frações.
// Unificado, na ordem dos dígitos 0..9.
export const REBAIXADO_UNIFICADO = "},;:/?!=\"*";
// Antigo, na ordem dos dígitos 0..9.
export const REBAIXADO_ANTIGO = "},;:.?!){*";

// Tabela da crase: 40 entradas [chave, saída no unificado].
// Só vale chave de 1 caractere; as de 2 ("¨(", "¨)", "!)") nunca casam.
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
