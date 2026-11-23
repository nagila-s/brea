import { existsSync, readFileSync } from "node:fs";
import { formatar } from "./pagina.js";
import { montarFaixas } from "./faixas.js";

const opcoes = {
  codigo: "unificado",
  matematica: false,
  maiuscula: true,
  maiusculaPalavra: true,
  numero: true,
};

function faixasDe(linhas, extra = {}) {
  const op = { ...opcoes, ...extra };
  return montarFaixas(linhas, formatar(linhas, op, false), op);
}

function falha(mensagem, dado) {
  throw new Error(`${mensagem}: ${JSON.stringify(dado, null, 1)}`);
}

// A garantia da etapa 1: juntar as tintas reproduz o texto. Toda linha aparece em alguma
// faixa; nenhum caractere é usado duas vezes; o que ficou de fora é só espaço; e os trechos
// seguem a ordem do texto.
function conferirCobertura(linhas, faixas, nome) {
  const vistas = new Set();
  const usados = linhas.map((linha) => new Uint8Array(linha.length));
  let ultimo = [-1, -1];
  for (const faixa of faixas) {
    if (faixa.linha != null) vistas.add(faixa.linha);
    for (const trecho of faixa.trechos || []) {
      vistas.add(trecho.linha);
      if (trecho.linha < ultimo[0] || (trecho.linha === ultimo[0] && trecho.de < ultimo[1])) {
        falha(`${nome}: trecho fora de ordem`, { trecho, ultimo });
      }
      ultimo = [trecho.linha, trecho.ate];
      for (let coluna = trecho.de; coluna < trecho.ate; coluna += 1) {
        if (usados[trecho.linha][coluna]) falha(`${nome}: caractere repetido`, { linha: trecho.linha, coluna });
        usados[trecho.linha][coluna] = 1;
      }
      const naTinta = faixa.tinta.slice(trecho.coluna, trecho.fim);
      const noTexto = linhas[trecho.linha].slice(trecho.de, trecho.ate).replaceAll("\t", "    ");
      if (naTinta !== noTexto) falha(`${nome}: tinta não bate com o texto`, { naTinta, noTexto });
    }
  }
  linhas.forEach((linha, numero) => {
    if (!vistas.has(numero)) falha(`${nome}: linha ${numero + 1} não aparece`, linha);
  });
  // Só vale para linhas que viraram texto: comandos e comentários não têm trechos.
  const comTexto = new Set();
  for (const faixa of faixas) for (const trecho of faixa.trechos || []) comTexto.add(trecho.linha);
  for (const numero of comTexto) {
    const linha = linhas[numero];
    for (let coluna = 0; coluna < linha.length; coluna += 1) {
      if (!usados[numero][coluna] && linha[coluna] !== " " && linha[coluna] !== "\t") {
        falha(`${nome}: caractere sem faixa`, { linha: numero + 1, coluna, caractere: linha[coluna], texto: linha });
      }
    }
  }
}

const tintas = (faixas, tipo = "texto") => faixas.filter((faixa) => faixa.tipo === tipo).map((faixa) => faixa.tinta);

// Corte com hífen e recuo: a tinta quebra exatamente onde o braille quebra.
{
  const linhas = ["<T->", "<R+>", " O braille é um sistema de escrita tátil.", "Cada cela tem seis pontos.", "<R->"];
  const faixas = faixasDe(linhas, { colunasPadrao: 20, linhasPadrao: 25 });
  conferirCobertura(linhas, faixas, "recuo");
  const texto = faixas.filter((faixa) => faixa.tipo === "texto");
  for (const faixa of texto) {
    if (faixa.braille.length > 20) falha("braille passou da largura", faixa.braille.length);
    if (!faixa.marcas.includes("R+")) falha("recuo sem marca R+", faixa);
  }
  const linhasTinta = texto.map((faixa) => faixa.tinta);
  if (linhasTinta.slice(1).some((linha) => !linha.startsWith("  "))) falha("recuo não aparece na tinta", linhasTinta);
  if (!linhasTinta.some((linha) => linha.endsWith("-"))) falha("esperava um corte com hífen", linhasTinta);
  // Os comandos <T->, <R+> e <R-> não têm linha própria visível.
  const comandos = faixas.filter((faixa) => faixa.tipo === "comando").map((faixa) => faixa.codigo);
  if (comandos.join(",") !== "<T->,<R+>,<R->") falha("comandos", comandos);
  if (faixas[0].tipo !== "comando" || faixas[faixas.length - 1].tipo !== "comando") falha("ordem dos comandos", faixas.map((f) => f.tipo));
}

// <P> vira quebra forçada ligada à linha do <P>; a página que encheu vira quebra automática.
{
  const linhas = ["<T->", "aaa", "<P>", "bbb", "ccc", "", "ddd"];
  const faixas = faixasDe(linhas, { colunasPadrao: 10, linhasPadrao: 2 });
  conferirCobertura(linhas, faixas, "quebras");
  const quebras = faixas.filter((faixa) => faixa.tipo === "quebra");
  if (quebras.length < 2) falha("quebras", quebras);
  if (!quebras[0].forcada || quebras[0].linha !== 2) falha("<P> deveria ser a primeira quebra", quebras[0]);
  if (quebras.slice(1).some((quebra) => quebra.forcada || quebra.linha != null)) falha("quebra automática", quebras);
}

// Cabeçalho em tinta: título centralizado e número à direita; não tem trechos (só leitura).
{
  const linhas = ["<Tmeu livro>", "<T+3>", "texto"];
  const faixas = faixasDe(linhas, { colunasPadrao: 20, linhasPadrao: 10 });
  conferirCobertura(linhas, faixas, "cabecalho");
  const cabecalho = faixas.find((faixa) => faixa.tipo === "cabecalho");
  if (!cabecalho || !cabecalho.tinta.includes("meu livro") || !cabecalho.tinta.endsWith("3")) falha("cabeçalho", cabecalho);
  if (cabecalho.tinta.length !== 20) falha("cabeçalho deveria ocupar a largura", cabecalho.tinta);
  if (cabecalho.trechos) falha("cabeçalho não pode ser editável", cabecalho);
}

// Numeração romana no cabeçalho em tinta.
{
  const linhas = ["<T*4>", "texto"];
  const cabecalho = faixasDe(linhas, { colunasPadrao: 20, linhasPadrao: 10 }).find((faixa) => faixa.tipo === "cabecalho");
  if (!cabecalho.tinta.endsWith("IV")) falha("romano", cabecalho.tinta);
}

// Comentários aparecem só na tinta, na posição em que estão no texto.
{
  const linhas = ["<T->", "<*34 caracteres x 28 linhas>", "antes", "", "<nota para quem revisa>", "depois"];
  const faixas = faixasDe(linhas);
  conferirCobertura(linhas, faixas, "comentarios");
  const tipos = faixas.map((faixa) => faixa.tipo).join(",");
  if (tipos !== "comando,comentario,texto,branco,comentario,texto") falha("ordem com comentários", tipos);
  if (faixas[4].tinta !== "<nota para quem revisa>" || faixas[4].braille.length) falha("comentário", faixas[4]);
}

// Centralizado: a tinta leva os mesmos espaços à esquerda que o braille.
{
  const linhas = ["<T->", "            Título"];
  const faixas = faixasDe(linhas, { colunasPadrao: 20, linhasPadrao: 10 });
  conferirCobertura(linhas, faixas, "centro");
  const faixa = faixas.find((item) => item.tipo === "texto");
  const espacosBraille = faixa.braille.findIndex((cela) => cela.tipo !== "espaco");
  const espacosTinta = faixa.tinta.search(/\S/);
  if (espacosBraille !== espacosTinta) falha("centralizado desalinhado", { espacosBraille, espacosTinta, tinta: faixa.tinta });
}

// Maiúsculas e números: o sinal ocupa cela no braille, mas a letra só entra uma vez na tinta.
{
  const linhas = ["<T->", "Ano 2024 MAIÚSCULAS"];
  const faixas = faixasDe(linhas);
  conferirCobertura(linhas, faixas, "sinais");
  if (tintas(faixas).join("|") !== "Ano 2024 MAIÚSCULAS") falha("sinais", tintas(faixas));
}

// TAB: vira espaços na tinta, como no braille.
{
  const linhas = ["<T->", "a\tb"];
  const faixas = faixasDe(linhas);
  conferirCobertura(linhas, faixas, "tab");
}

// Sem auto-ajuste: cada linha fica como está e leva a marca F-.
{
  const linhas = ["<T->", "<F->", "linha um", "linha dois", "<F+>"];
  const faixas = faixasDe(linhas);
  conferirCobertura(linhas, faixas, "fixa");
  const texto = faixas.filter((faixa) => faixa.tipo === "texto");
  if (texto.length !== 2 || texto.some((faixa) => !faixa.marcas.includes("F-"))) falha("F-", texto);
}

// O livro de exemplo, quando estiver na pasta de cima (não vai para o repositório).
const livro = new URL("../PNLD14 Aprender Sem Barreiras LING S1 - Parte 1.txt", import.meta.url);
if (existsSync(livro)) {
  const bruto = readFileSync(livro);
  const texto = new TextDecoder(bruto.includes(0) ? "utf-16le" : "windows-1252").decode(bruto);
  const linhas = texto.replace(/\r/g, "").split("\n");
  const op = { ...opcoes, maiuscula: false, maiusculaPalavra: false };
  const formato = formatar(linhas, op, false);
  const faixas = montarFaixas(linhas, formato, op);
  conferirCobertura(linhas, faixas, "livro");
  const braille = faixas.filter((faixa) => faixa.tipo === "texto" || faixa.tipo === "branco" || faixa.tipo === "cabecalho").length;
  const vista = formato.linhas.filter((linha) => linha.tipo === "braille").length;
  if (braille !== vista) falha("o livro deveria ter uma faixa por linha braille", { braille, vista });
  const largas = faixas.filter((faixa) => faixa.tipo === "texto" && faixa.tinta.length > formato.colunas);
  console.log(`livro: ${formato.paginas} páginas, ${faixas.length} faixas, ${braille} linhas braille, ${largas.length} tintas mais largas que ${formato.colunas}`);
}

console.log("ok");
