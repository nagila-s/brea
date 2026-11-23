// Finalizar e Remover quebras (PLANO-EDITOR, etapa 8).
import { existsSync, readFileSync } from "node:fs";
import { formatar } from "./pagina.js?edicao=32";
import { finalizarTexto, mesmoBraille, removerQuebras } from "./finalizar.js";
import { montarFaixas } from "./faixas.js";

const base = { codigo: "unificado", matematica: false, maiuscula: true, maiusculaPalavra: true, numero: true };

function falha(mensagem, dado) {
  throw new Error(`${mensagem}: ${JSON.stringify(dado)}`);
}

function automaticas(linhas, opcoes) {
  return formatar(linhas, opcoes, false).estrutura.filter((pagina) => pagina.motivo === "automatica").length;
}

function conferir(linhas, opcoes, nome) {
  const antes = automaticas(linhas, opcoes);
  const { linhas: finalizado, quebras, mantidas } = finalizarTexto(linhas, opcoes);
  if (quebras + mantidas.length !== antes) falha(`${nome}: quebras gravadas`, { quebras, mantidas, antes });
  const igual = mesmoBraille(linhas, finalizado, opcoes);
  if (!igual.igual) falha(`${nome}: braille mudou ao finalizar`, igual);
  // Só ficam automáticas as quebras que partiriam uma linha mudando o braille.
  if (automaticas(finalizado, opcoes) !== mantidas.length) falha(`${nome}: quebras automáticas que sobraram`, { sobraram: automaticas(finalizado, opcoes), mantidas });
  // Finalizar de novo não muda nada.
  const outra = finalizarTexto(finalizado, opcoes);
  if (outra.quebras || outra.linhas.join("\n") !== finalizado.join("\n")) falha(`${nome}: finalizar duas vezes`, outra.quebras);
  // Remover as quebras de um texto que não tinha <P> devolve o braille original.
  const semP = linhas.some((linha) => linha.trim().toUpperCase() === "<P>");
  const removido = removerQuebras(finalizado);
  if (!semP) {
    if (removido.quebras !== quebras) falha(`${nome}: quebras removidas`, { removidas: removido.quebras, quebras });
    const volta = mesmoBraille(linhas, removido.linhas, opcoes);
    if (!volta.igual) falha(`${nome}: remover não devolveu o braille`, volta);
  }
  return { quebras, mantidas, finalizado, removido };
}

// Página pequena, parágrafo atravessando páginas, recuo e linha que começa com "<".
{
  const linhas = [
    "<T->",
    "  Um parágrafo bem comprido que atravessa a página e continua do outro lado com mais palavras.",
    "continua aqui na linha de baixo do texto.",
    "<R+>",
    " Dentro do recuo há outro trecho longo que também precisa passar para a página seguinte sem perder o recuo.",
    "segue o recuo",
    "<R->",
    "  Fim.",
  ];
  const op = { ...base, colunasPadrao: 20, linhasPadrao: 4 };
  const { finalizado } = conferir(linhas, op, "pequeno");
  // No recuo, a continuação depois do <P> começa com dois espaços.
  const partida = finalizado.findIndex((linha) => linha.includes("seguinte sem perder"));
  if (finalizado[partida - 1] !== "<P>" || !finalizado[partida].startsWith("  pá")) falha("continuação no recuo", finalizado);
  // Fora do recuo, a continuação fica na coluna 1.
  const fora = finalizado.findIndex((linha) => linha.startsWith("lado com"));
  if (finalizado[fora - 1] !== "<P>") falha("continuação fora do recuo", finalizado);
}

// Palavra separada que cairia na última linha da página: vai inteira para a seguinte.
{
  const linhas = ["<T->", "aaaa bbbb cccc dddd eeeeeee fff computador gggg"];
  const separada = (item) => Boolean(item.celas[item.celas.length - 1]?.cortada);
  // Com 3 linhas por página, a segunda linha separa "computador".
  const solta = formatar(linhas, { ...base, colunasPadrao: 20, linhasPadrao: 3 }, false).estrutura[0].corpo;
  if (!separada(solta[1])) falha("o exemplo deveria separar a palavra no meio da página", null);
  // Com 2 linhas por página, a segunda é a última: a palavra vai inteira para a página seguinte.
  const op = { ...base, colunasPadrao: 20, linhasPadrao: 2 };
  const paginas = formatar(linhas, op, false).estrutura;
  if (separada(paginas[0].corpo[paginas[0].corpo.length - 1])) falha("palavra separada na última linha", null);
  conferir(linhas, op, "palavra inteira");
}

// Linha que começaria com "<" depois do corte ganha o escape.
{
  const linhas = ["<T->", "aaaa bbbb cccc dddd <eeee> ffff gggg hhhh"];
  conferir(linhas, { ...base, colunasPadrao: 20, linhasPadrao: 1 }, "escape");
}

// Remover: só as linhas <P>, com ou sem espaços e em minúscula.
{
  const { linhas, quebras } = removerQuebras(["a", "<P>", "b", "<p>  ", " <P>", "<PP>"]);
  if (quebras !== 2 || linhas.join("|") !== "a|b| <P>|<PP>") falha("remover", linhas);
}

// Marca de possível corte no recuo: dois espaços e minúscula, só dentro de <R+>.
{
  const linhas = ["<T->", "<R+>", " Abre o recuo.", "  continua partido", "  Parágrafo novo", "<R->", "  fora do recuo"];
  const op = { ...base, colunasPadrao: 34, linhasPadrao: 25 };
  const faixas = montarFaixas(linhas, formatar(linhas, op, false), op);
  const marcadas = faixas.filter((faixa) => faixa.corteRecuo).map((faixa) => faixa.tinta.trim());
  if (marcadas.join("|") !== "continua partido") falha("marca de corte no recuo", marcadas);
}

const livro = new URL("../PNLD14 Aprender Sem Barreiras LING S1 - Parte 1.txt", import.meta.url);
if (existsSync(livro)) {
  const bruto = readFileSync(livro);
  const texto = new TextDecoder(bruto.includes(0) ? "utf-16le" : "windows-1252").decode(bruto).replace(/\r/g, "");
  const linhas = texto.split("\n");
  // O livro como veio (já tem <P>) e sem nenhum <P> (toda a paginação automática).
  const semQuebras = removerQuebras(linhas).linhas;
  for (const [nome, texto2] of [["livro", linhas], ["livro sem <P>", semQuebras]]) {
    for (const [colunas, altura] of [[34, 28], [28, 25], [40, 30]]) {
      const op = { ...base, maiuscula: false, maiusculaPalavra: false, colunasPadrao: colunas, linhasPadrao: altura };
      const { quebras, mantidas } = conferir(texto2, op, `${nome} ${colunas}x${altura}`);
      console.log(`${nome} ${colunas}x${altura}: ${quebras} quebras gravadas, ${mantidas.length} mantidas ${JSON.stringify(mantidas)}`);
    }
  }
}

console.log("ok");
