import { centrarFisico, centrarPorEspacos, converter, dividirLinhas, expandirTab, paraDos, paraWindows, quadrinho } from "./edicao.js";

const partido = dividirLinhas(["um texto longo demais"], 10);
if (partido[0] !== "um texto " || partido[1] !== "longo " || partido[2] !== "demais") {
  throw new Error(`dividir: ${JSON.stringify(partido)}`);
}

if (expandirTab("a\tb") !== "a  b") throw new Error("tab");
if (centrarPorEspacos("titulo") !== `${" ".repeat(12)}titulo`) throw new Error("doze espaços");
if (centrarFisico("aaaa", 10) !== "   aaaa") throw new Error("física");
if (converter(converter("ação ç é", paraDos), paraWindows) !== "ação ç é") throw new Error("oem");

const caixa = quadrinho(["oi", ""], "ajuda");
if (!caixa[0].startsWith("ç  oi") || !caixa[0].endsWith("y") || !caixa[1].includes("Peça orientação")) {
  throw new Error(`quadrinho: ${JSON.stringify(caixa)}`);
}

console.log("ok");
