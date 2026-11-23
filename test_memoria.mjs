// A memória de parágrafos (pagina.js) não pode mudar o resultado: depois de qualquer sequência
// de edições, formatar com memória dá o mesmo que formatar do zero.
import { existsSync, readFileSync } from "node:fs";
import { esquecerParagrafos, formatar } from "./pagina.js";
import { montarFaixas } from "./faixas.js";

const opcoes = { codigo: "unificado", matematica: false, maiuscula: true, maiusculaPalavra: true, numero: true };

function retrato(texto, op) {
  const linhas = texto.split("\n");
  const formato = formatar(linhas, op, false);
  const faixas = montarFaixas(linhas, formato, op);
  return JSON.stringify({
    vista: formato.linhas.map((l) => [l.tipo, l.texto, l.origem]),
    faixas: faixas.map((f) => [f.tipo, f.linha, f.tinta, f.trechos, f.marcas, (f.braille || []).map((c) => [c.dots, c.fonte?.linha, c.fonte?.de, c.fonte?.ate])]),
  });
}

function conferir(texto, op, nome) {
  const comMemoria = retrato(texto, op);
  esquecerParagrafos();
  const doZero = retrato(texto, op);
  if (comMemoria !== doZero) {
    const a = JSON.parse(comMemoria).faixas;
    const b = JSON.parse(doZero).faixas;
    const i = a.findIndex((f, k) => JSON.stringify(f) !== JSON.stringify(b[k]));
    throw new Error(`${nome}: memória diferente do zero na faixa ${i}: ${JSON.stringify(a[i])} != ${JSON.stringify(b[i])}`);
  }
}

// Gerador simples e repetível.
let semente = 7;
const sorte = (n) => {
  semente = (semente * 1103515245 + 12345) % 2147483648;
  return semente % n;
};

function editar(texto, passos, op, nome) {
  retrato(texto, op);
  for (let passo = 0; passo < passos; passo += 1) {
    const pos = sorte(texto.length + 1);
    const tipo = sorte(6);
    if (tipo === 0) texto = `${texto.slice(0, pos)}\n${texto.slice(pos)}`;
    else if (tipo === 1) texto = texto.slice(0, pos) + texto.slice(pos + 1);
    else if (tipo === 2) {
      // Cola uma cópia de um trecho (parágrafos repetidos).
      const de = sorte(texto.length);
      texto = texto.slice(0, pos) + texto.slice(de, de + 80) + texto.slice(pos);
    } else texto = `${texto.slice(0, pos)}${"aé 1"[sorte(4)]}${texto.slice(pos)}`;
    retrato(texto, op);
    if (passo % 7 === 0) conferir(texto, op, `${nome} passo ${passo}`);
  }
  conferir(texto, op, `${nome} fim`);
}

const pequeno = [
  "<T->", "<R+>", " Primeiro parágrafo com recuo e texto longo o bastante para quebrar.", "segue aqui.",
  "<R->", "", "  Parágrafo igual.", "", "  Parágrafo igual.", "<P>", "\tCom tab no começo.",
  "<S->", "  Palavras compridíssimas inconstitucionalmente.", "<S+>", "            Centro", "<F->", "fixa linha", "<F+>", "fim",
].join("\n");
editar(pequeno, 300, { ...opcoes, colunasPadrao: 20, linhasPadrao: 6 }, "pequeno");

const livro = new URL("../PNLD14 Aprender Sem Barreiras LING S1 - Parte 1.txt", import.meta.url);
if (existsSync(livro)) {
  const bruto = readFileSync(livro);
  const texto = new TextDecoder(bruto.includes(0) ? "utf-16le" : "windows-1252").decode(bruto).replace(/\r/g, "");
  editar(texto, 40, { ...opcoes, maiuscula: false, maiusculaPalavra: false }, "livro");
}

console.log("ok");
