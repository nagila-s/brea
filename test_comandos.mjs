import { classificar, preparar, resumo } from "./comandos.js";

function tipo(linha) {
  return classificar(linha)?.tipo || null;
}

const casos = [
  // Notas de configuração no início dos livros e qualquer <...> que não é código: comentário.
  ["<*34 caracteres x 28 linhas>", "comentario"],
  ["<com interponto>", "comentario"],
  ["<sem interponto>", "comentario"],
  ["<com separação de sílabas>", "comentario"],
  ["<b>negrito</b>", "comentario"],
  ["<- seta", "comentario"],
  ["  <P>", null],
  ["<t fil vol 5>", "titulo-texto"],
  ["<T->", "titulo"],
  ["<t+1>", "titulo"],
  ["<R+>", "recuo"],
  ["<r->", "recuo"],
  ["<F->", "ajuste"],
  ["<F+>", "ajuste"],
  ["<F*>", "estrangeiro"],
  ["<P>", "quebra"],
  ["<p>", "quebra"],
  ["<267>", "transpaginacao"],
  ["<M abc>", "margem"],
  ["<M>", "margem"],
  ["<*** nota ***>", "anotacao"],
  ["<S+>", "silabas"],
  ["<I->", "ingles"],
  ["<t*1>", "titulo"],
  ["Capítulo", null],
];

for (const [linha, esperado] of casos) {
  const obtido = tipo(linha);
  if (obtido !== esperado) throw new Error(`${linha} → ${obtido}, esperado ${esperado}`);
}

const doc = preparar([
  "<*34 caracteres x 28 linhas>",
  "<*com interponto>",
  "<*com separação de sílabas>",
  "<t fil vol 5>",
  "<R+>",
  "Capítulo",
  "<F->",
  "tabela",
  "<267>",
]);
// 0049BEDB: o título vai do 3º caractere ao fim, sem o ">" e sem aparar.
if (doc[5].titulo !== " fil vol 5" || doc[5].recuo !== true || doc[5].colunas != null) {
  throw new Error(`estado do texto: ${JSON.stringify(doc[5])}`);
}
if (classificar("<M| >").texto !== "| ") throw new Error("variante tipográfica 1");
if (doc[7].ajuste !== false) throw new Error("F- não desligou o auto-ajuste");
if (doc[8].comando.numero !== "267" || doc[8].paginaTinta !== "267") throw new Error("transpaginação");
if (!classificar("<t*4>").romano || classificar("<t+4>").romano) throw new Error("T* / T+");
if (!resumo(doc[5]).includes("título “fil vol 5”")) throw new Error(resumo(doc[5]));
// Detecção como em 0049BC94.
const det = (linha) => classificar(linha);
if (det("<P> x").tipo !== "comentario" || det("<p>").tipo !== "quebra") throw new Error("<P> exato");
if (det("<TTitulo>").texto !== "Titulo" || det("<T>").texto !== "" || det("<Texto").texto !== "exto") throw new Error("título");
if (det("<T+abc>").texto !== "+abc") throw new Error("<T+abc> é título");
if (det("<T+0>").numero !== 1 || !det("<T+0>").aviso.startsWith("Número da página INVÁLIDO")) throw new Error("<T+0>");
if (det("<Fxyz>").tipo !== "comentario" || !det("<Fxyz>").fecha || det("<Sxyz>").fecha) throw new Error("F/S ignorados");
if (det("<0289>").numero !== "289" || det("<0289>").imprimir) throw new Error("<0289>");
if (det("<12a>").numero !== "12" || !det("<12a>").imprimir) throw new Error("<12a>");
if (det("<12") !== null || det("<") !== null || det("  <P>") !== null) throw new Error("texto");
if (!det("<M").imprimir || !det("<G+>").imprimir || det("<M>").tipo !== "margem") throw new Error("M/G inválidos");
if (det("<G* 3 figura.grb>").tipo !== "grafico-arquivo") throw new Error("gráfico");
console.log("ok");
