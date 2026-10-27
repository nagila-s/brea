import { classificar, preparar, resumo } from "./comandos.js";

function tipo(linha) {
  return classificar(linha)?.tipo || null;
}

const casos = [
  ["<*34 caracteres x 28 linhas>", "formato"],
  ["<sem interponto>", "interponto"],
  ["<*com separação de sílabas>", "silabas"],
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
if (doc[5].titulo !== "fil vol 5" || doc[5].recuo !== true || doc[5].colunas !== 34) {
  throw new Error(`estado do texto: ${JSON.stringify(doc[5])}`);
}
if (classificar("<M| >").texto !== "| ") throw new Error("variante tipográfica 1");
if (doc[7].ajuste !== false) throw new Error("F- não desligou o auto-ajuste");
if (doc[8].comando.numero !== "267" || doc[8].paginaTinta !== "267") throw new Error("transpaginação");
if (!classificar("<t*4>").romano || classificar("<t+4>").romano) throw new Error("T* / T+");
if (!resumo(doc[5]).includes("título “fil vol 5”")) throw new Error(resumo(doc[5]));
console.log("ok");
