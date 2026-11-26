import { existsSync, readFileSync } from "node:fs";
import { formatar } from "./pagina.js";
import { montarFaixas } from "./faixas.js";
import { ESTILO, montarTinta, parearGrifos, relatorioTinta } from "./tinta.js?edicao=1";
import { conferirDocx, gerarDocx, lerDocx } from "./docx.js?edicao=1";

const opcoes = {
  codigo: "unificado",
  matematica: false,
  maiuscula: true,
  maiusculaPalavra: true,
  numero: true,
};

function falha(mensagem, dado) {
  throw new Error(`${mensagem}: ${JSON.stringify(dado, null, 1)}`);
}

function igual(obtido, esperado, nome) {
  if (obtido !== esperado) falha(nome, { obtido, esperado });
}

const linhasDe = (tinta) => tinta.paginas.flatMap((pagina) => pagina.linhas);
const textoDe = (tinta) => linhasDe(tinta).filter((linha) => linha.tipo === "texto").map((linha) => linha.texto).join("\n");
const grifado = (tinta) => linhasDe(tinta).flatMap((linha) => linha.partes)
  .filter((parte) => parte.estilo & ESTILO.grifo).map((parte) => parte.texto).join("|");

// Sem nenhum título, para o teste olhar só o texto.
const semTitulo = (linhas) => ["<T->", ...linhas];

// 1. Os símbolos que a retradução antiga trocava saem como foram digitados.
{
  const tinta = montarTinta(semTitulo(["Você está bem? Sim! Ele disse: 'olá'. 3 + 4 = 7 e 3 x 4."]), opcoes);
  const texto = textoDe(tinta).replaceAll("\n", " ");
  for (const pedaco of ["bem?", "Sim!", "'olá'.", "3 + 4 = 7", "3 x 4."]) {
    if (!texto.includes(pedaco)) falha("símbolo trocado na tinta", { pedaco, texto });
  }
}

// 2. Códigos do texto viram o símbolo de tinta.
{
  const casos = [
    ["`(C`) Editora", "© Editora"],
    ["Marca `(R`)", "Marca ®"],
    ["https:`/`/site.com`/a", "https://site.com/a"],
    ["siga :o fim", "siga → fim"],
    ["volta õ: e õ:o", "volta ← e ↔"],
    ["marque _y aqui", "marque □ aqui"],
    ["_y9: figura", "_y9: figura"],
    ["item õo e <>", "item ● e ●"],
    ["El ni~no ~Nandu", "El niño Ñandu"],
    ["D¬urkop", "Dürkop"],
    ["tinyurl.com`/2p#hbcfgk", "tinyurl.com/2p82367k"],
    ["_`[{o símbolo_`]", "[O símbolo]"],
    ["Outros: .....", "Outros: _____"],
    ["x =... ok", "x =___ ok"],
    ["conta 3\"4", "conta 3x4"],
    ["delimitado ~,www~,", "delimitado www"],
    ["Curitiba -- PR e ---", "Curitiba — PR e ---"],
  ];
  for (const [fonte, esperado] of casos) {
    igual(textoDe(montarTinta(semTitulo([fonte]), opcoes)), esperado, `código: ${fonte}`);
  }
  const tinta = montarTinta(semTitulo(["área 3â2 e H í2 O"]), opcoes);
  const partes = linhasDe(tinta)[0].partes;
  const sobre = partes.find((parte) => parte.estilo & ESTILO.sobrescrito);
  const sub = partes.find((parte) => parte.estilo & ESTILO.subscrito);
  if (sobre?.texto !== "2" || sub?.texto !== "2") falha("expoente e índice", partes);
  igual(textoDe(tinta), "área 32 e H 2 O", "expoente sem o â");
}

// 3. Grifo: *texto* fica grifado e sem asteriscos; asteriscos de verdade ficam.
{
  const tinta = montarTinta(semTitulo(["O termo *cultura* e o *fake", "news* aqui."]), opcoes);
  igual(textoDe(tinta).replaceAll("\n", " "), "O termo cultura e o fake news aqui.", "grifo tira os asteriscos");
  if (!grifado(tinta).includes("cultura") || !grifado(tinta).includes("fake") || !grifado(tinta).includes("news")) {
    falha("grifo que atravessa a linha", grifado(tinta));
  }
  const nota = montarTinta(semTitulo(["Doubek `(**`) e (*glossário*)."]), opcoes);
  igual(textoDe(nota), "Doubek (**) e (glossário).", "nota (**) e grifo entre parênteses");
  const solto = montarTinta(semTitulo([" o* é  asterisco", "", "linha seguinte"]), opcoes);
  igual(textoDe(solto).split("\n")[0].trim(), "o* é  asterisco", "asterisco solto fica");
  if (grifado(solto)) falha("asterisco solto não pode grifar o resto", grifado(solto));
  if (!solto.avisos.some((aviso) => aviso.tipo === "grifo")) falha("asterisco solto deveria ir para o relatório", solto.avisos);
  const desenho = montarTinta(semTitulo(["<F->", "  * * *", " *   *", "<F+>"]), opcoes);
  igual(textoDe(desenho), "  * * *\n *   *", "no desenho o asterisco é desenho");
}

// 4. A tinta é a do braille: mesma quantidade de linhas, mesmas páginas, mesmo recuo e hífen.
{
  const linhas = [];
  for (let i = 0; i < 40; i += 1) {
    linhas.push(`Parágrafo ${i} com bastante texto para obrigar quebras de linha e separação de sílabas.`);
  }
  linhas.splice(10, 0, "<P>");
  const formato = formatar(linhas, opcoes, false);
  const faixas = montarFaixas(linhas, formato, opcoes);
  const tinta = montarTinta(linhas, opcoes);
  const visiveis = faixas.filter((faixa) => ["texto", "branco", "cabecalho"].includes(faixa.tipo));
  const todas = linhasDe(tinta);
  igual(todas.length, visiveis.length, "uma linha de tinta por linha braille");
  igual(tinta.paginas.length, formato.paginas, "mesmas páginas");
  visiveis.forEach((faixa, indice) => {
    if (faixa.tipo === "texto") igual(todas[indice].texto, faixa.tinta, `linha ${indice}`);
  });
  if (!todas.some((linha) => linha.texto.endsWith("-"))) falha("deveria haver sílaba separada", todas.map((l) => l.texto));
}

// 5. Linha larga demais é apertada para o Word não quebrá-la.
{
  const tinta = montarTinta(semTitulo(["<F->", "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW", "<F+>"]), opcoes);
  const linha = linhasDe(tinta).find((item) => item.texto.startsWith("W"));
  if (!linha.condensar && linha.tamanho >= tinta.formato.tamanho) falha("linha larga não foi ajustada", linha);
  const normal = montarTinta(semTitulo(["texto curto"]), opcoes);
  if (linhasDe(normal)[0].condensar) falha("linha curta não deveria ser apertada", linhasDe(normal)[0]);
}

// 6. O .docx: o arquivo lido de volta bate com a tinta; uma diferença é apanhada.
{
  const linhas = ["Título", "", "O termo *cultura* com :o seta & <coisa>.", "<P>", "Outra página."];
  const tinta = montarTinta(linhas, opcoes);
  const bytes = gerarDocx(tinta);
  const conferencia = conferirDocx(bytes, tinta);
  if (!conferencia.ok) falha("conferência do docx", conferencia);
  const paginas = lerDocx(bytes);
  igual(paginas.length, 2, "duas páginas no docx");
  if (!paginas.flat().join(" ").includes("cultura com → seta & <coisa>.")) falha("texto escapado no docx", paginas);
  tinta.paginas[1].linhas.push({ tipo: "texto", partes: [], texto: "a mais" });
  if (conferirDocx(bytes, tinta).ok) falha("a conferência deveria apanhar uma linha a mais", null);
  const documento = new TextDecoder().decode(bytes);
  for (const trecho of ['w:lineRule="exact"', '<w:widowControl w:val="0"/>', "<w:pageBreakBefore/>", "<w:i/>", "Verdana"]) {
    if (!documento.includes(trecho)) falha("docx sem", trecho);
  }
}

// 6b. Diagramação na tinta: centralizado, separador, sumário, grifo no <F->, códigos.
{
  const linhas = ["<T->", "          Centro", "::::::::::::::::::::::::::::::::::", "<F->", "Capítulo *um* ::::::: 12", "  * * *", "<F+>",
    "Ni?ede e 2×3.", " é,  vírgula", " _`[ _`]  abre e fecha nota de", "  transcrição"];
  const tinta = montarTinta(linhas, opcoes);
  const todas = linhasDe(tinta);
  const achar = (texto) => todas.find((linha) => linha.texto === texto) || falha("linha não encontrada", { texto, todas: todas.map((linha) => linha.texto) });
  igual(achar("Centro").alinhar, "centro", "linha centralizada vira parágrafo centralizado");
  igual(achar("—".repeat(17)).alinhar, null, "separador de ponta a ponta");
  const sumario = achar("Capítulo um12");
  if (!sumario.partes.some((parte) => parte.tab === "pontilhado")) falha("sumário sem pontilhado", sumario.partes);
  if (!grifado(tinta).includes("um")) falha("grifo no <F->", grifado(tinta));
  achar("  * * *");
  achar("Niède e 2x3.");
  achar(",  vírgula");
  achar("(456 12356)  abre e fecha nota de");
  achar("  (456 23456)  transcrição");
  if (tinta.avisos.some((aviso) => aviso.tipo === "codigo" || aviso.tipo === "grifo")) falha("avisos que não deviam sair", tinta.avisos);
  const bytes = gerarDocx(tinta);
  const conferencia = conferirDocx(bytes, tinta);
  if (!conferencia.ok) falha("conferência do docx diagramado", conferencia);
  const documento = new TextDecoder().decode(bytes);
  for (const trecho of ['<w:jc w:val="center"/>', 'w:leader="dot"']) if (!documento.includes(trecho)) falha("docx sem", trecho);
}

// 6c. Parte 2 do livro: aspas simples, marcador, grifo que atravessa a página, endereço.
{
  const linhas = ["<T->", 'com ý"eý" e o ý"ver a cidadeý"? Alexý”. A', "õo Para escrever", "• Canetinha",
    "<R+>", "apresentação de *O segredo da", "arca de", "<R->", "<P>", "<R+>", "  Trancoso*, em Salvador", "<R->",
    "", "em: http:`/`/www.fu~narte.gov.br e Pe~na", "          :wr:wr:wr:"];
  const tinta = montarTinta(linhas, opcoes);
  const texto = textoDe(tinta).replaceAll("\n", " ");
  for (const esperado of ["com ‘e’ e o ‘ver a cidade’? Alex’. A", "● Para escrever", "● Canetinha", "http://www.funarte.gov.br e Peña"]) {
    if (!texto.includes(esperado)) falha("parte 2", { esperado, texto });
  }
  if (!linhasDe(tinta).some((linha) => linha.texto === "—●—●—●—" && linha.alinhar === "centro")) falha("enfeite :wr:", texto);
  if (!grifado(tinta).includes("O segredo da") || !grifado(tinta).includes("Trancoso")) falha("grifo atravessando a página", grifado(tinta));
  if (texto.includes("*")) falha("asterisco do grifo sobrou", texto);
}

// 6d. Grifo duplo $*: o "$" some junto com o asterisco, e o par diz que é duplo.
{
  const tinta = montarTinta(["<T->", "um $*teste$* e *outro* aqui"], opcoes);
  igual(textoDe(tinta), "um teste e outro aqui", "grifo duplo sem o $");
  igual(grifado(tinta), "teste|outro", "grifo duplo e simples");
  const { pares } = parearGrifos(["um $*teste$* e *outro*"]);
  igual(pares.map((par) => `${par.duplo ? "$*" : "*"}${par.abre.de}-${par.fecha.ate}`).join(), "$*3-12,*15-22", "pares de grifo");
}

// 6e. "?*" (parênteses auxiliares vazios) não abre grifo.
{
  const { pares, avisos } = parearGrifos(["Edito?*ra Moderna e *grifo* aqui"]);
  igual(pares.length, 1, "?* não é grifo");
  igual(avisos.length, 0, "?* sem aviso");
}

// 7. O livro de exemplo, quando estiver na pasta de cima (não vai para o repositório).
const livro = new URL("../PNLD14 Aprender Sem Barreiras LING S1 - Parte 1.txt", import.meta.url);
if (existsSync(livro)) {
  // Decodifica windows-1252 à mão: o TextDecoder do Node troca “ ” por caracteres de controle.
  const cp1252 = "€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ";
  const linhas = [...readFileSync(livro)]
    .map((byte) => (byte >= 0x80 && byte <= 0x9f ? cp1252[byte - 0x80] : String.fromCharCode(byte)))
    .join("").replace(/\r/g, "").split("\n");
  const op = { ...opcoes, maiuscula: false, maiusculaPalavra: false };
  const tinta = montarTinta(linhas, op);
  const formato = formatar(linhas, op, false);
  igual(tinta.paginas.length, formato.paginas, "livro: páginas");
  const braille = formato.linhas.filter((linha) => linha.tipo === "braille").length;
  igual(linhasDe(tinta).length, braille, "livro: uma linha de tinta por linha braille");
  const erros = tinta.avisos.filter((aviso) => aviso.gravidade === "erro");
  if (erros.length) falha("livro: erros no relatório", erros.slice(0, 5));
  const bytes = gerarDocx(tinta);
  const conferencia = conferirDocx(bytes, tinta);
  if (!conferencia.ok) falha("livro: conferência do docx", conferencia);
  console.log(relatorioTinta(tinta, conferencia).split("\n").slice(0, 3).join("\n"));
}

console.log("ok");
