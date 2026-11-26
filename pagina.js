import { caractereMeta, traduzir, unicodeDaCela } from "./motor.js?edicao=28";
import { aplicar, classificar } from "./comandos.js?edicao=27";

// Estado das aspas e do parêntese no começo do documento. Ele passa de uma linha para a outra
// no documento inteiro: um ")" numa linha cujo "(" ficou na linha de cima não é o
// parêntese de expressão numérica (ver motor.js, traduzir).
const ESTADO_INICIAL = Object.freeze({ aspas: 1, aspasInglesas: 1, parentese: 0 });

function chaveDoEstado(estado) {
  return `${estado.aspas}${estado.aspasInglesas}${estado.parentese}`;
}

// Traduz uma linha começando no estado dado; devolve as celas e o estado de saída.
function traduzirLinhaDoTexto(texto, opcoes, cache, estado = ESTADO_INICIAL) {
  const chave = `${opcoes.ingles ? "I" : "-"}${chaveDoEstado(estado)}${texto}`;
  let guardado = cache.get(chave);
  if (!guardado) {
    const resultado = traduzir(texto, { ...opcoes, estado });
    const paragrafo = resultado.paragrafos.find((item) => !item.vazio);
    const { aspas, aspasInglesas, parentese } = resultado.estado;
    guardado = { celas: paragrafo ? paragrafo.celas : [], saida: { aspas, aspasInglesas, parentese } };
    cache.set(chave, guardado);
  }
  return { celas: guardado.celas.map((cela) => ({ ...cela })), saida: guardado.saida };
}

function celasDe(texto, opcoes, cache) {
  return traduzirLinhaDoTexto(texto, opcoes, cache).celas;
}

function espaco() {
  return {
    dots: "000000",
    meta: 0x20,
    tipo: "espaco",
    origem: " ",
    corrigida: false,
    aviso: false,
    cortada: false,
  };
}

function escrever(celas, tinta) {
  return celas
    .map((cela) => {
      if (cela.tipo === "espaco") return tinta ? " " : "\u2800";
      return tinta ? caractereMeta(cela.meta) : unicodeDaCela(cela.dots);
    })
    .join("");
}

const VALORES_ROMANOS = [1, 5, 10, 50, 100, 500, 1000, 5000];
const LETRAS_ROMANAS = "IVXLCDM";

function paraRomano(numero) {
  if (numero <= 0 || numero > 3999) return "";
  let texto = "";
  let resto = numero;
  while (resto > 0) {
    let indice = 0;
    while (indice < 7) {
      if (resto >= VALORES_ROMANOS[indice] && resto < VALORES_ROMANOS[indice + 1]) {
        const par = indice & 1;
        const base = indice - par;
        const composto = VALORES_ROMANOS[indice + 1] - VALORES_ROMANOS[base];
        if (resto >= composto) {
          texto += LETRAS_ROMANAS[base] + LETRAS_ROMANAS[indice + 1];
          resto -= composto;
        } else {
          texto += LETRAS_ROMANAS[indice];
          resto -= VALORES_ROMANOS[indice];
        }
        continue;
      }
      indice += 1;
    }
  }
  return texto;
}

function documento(opcoes = {}) {
  return {
    colunas: opcoes.colunasPadrao || 34,
    linhasPagina: opcoes.linhasPadrao || 28,
    ajuste: opcoes.autoFormata !== false,
    silabas: opcoes.silabas !== false,
    interponto: opcoes.interponto === true ? true : opcoes.interponto === false ? false : null,
    titulo: "",
    titula: opcoes.comTitulo !== false,
    numera: false,
    numeroInicial: 1,
    romano: false,
    paginaTinta: null,
    recuo: false,
    margem: "",
    grafico: false,
    ingles: false,
  };
}

function foto(doc) {
  return {
    colunas: doc.colunas,
    linhasPagina: doc.linhasPagina,
    silabas: doc.silabas,
    recuo: doc.recuo,
    margem: doc.margem,
    titula: doc.titula,
    titulo: doc.titulo,
    numera: doc.numera,
    numeroInicial: doc.numeroInicial,
    romano: doc.romano,
    paginaTinta: doc.paginaTinta,
    interponto: doc.interponto,
    ingles: doc.ingles,
  };
}

function margemDe(texto, opcoes, cache) {
  if (!texto) return [];
  return [...celasDe(texto, opcoes, cache), espaco()];
}

const MEMORIA_HIFEN = Uint8Array.from([
  0x22, 0x82, 0x20, 0x00, 0x22, 0x82, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x0f, 0x26, 0x38, 0x04, 0x0f, 0x26, 0x38, 0x04, 0xdc, 0x74, 0x5f, 0x05, 0xdc, 0x74, 0x5f, 0x05,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80, 0x00, 0x00, 0x00, 0x80, 0x00, 0x00, 0x00,
  0xd8, 0x00, 0x50, 0x00, 0xd8, 0x00, 0x50, 0x00, 0x08, 0x50, 0x00, 0x00, 0x08, 0x50, 0x00, 0x00,
  0xff, 0xff, 0xff, 0xff, 0x01, 0x00, 0x00, 0x00, 0x2d, 0x00, 0x00, 0x00,
]);

function bitHifen(base, valor) {
  const indice = valor & 0xff;
  const pos = base + (indice >> 3);
  if (pos < 0 || pos >= MEMORIA_HIFEN.length) return 0;
  return (MEMORIA_HIFEN[pos] >> (indice & 7)) & 1;
}

function noConjunto(al, teto, base) {
  const somado = (al + 0xc0) & 0xff;
  if (somado > teto) return false;
  return bitHifen(base, somado) === 1;
}

function letraNSR(al) {
  let atual = (al - 0x4e) & 0xff;
  if (atual === 0) return true;
  atual = (atual + 0xfc) & 0xff;
  if (atual < 2) return true;
  atual = (atual - 2) & 0xff;
  if (atual === 0x1a) return true;
  atual = (atual - 0x1a) & 0xff;
  atual = (atual + 0xfc) & 0xff;
  return atual < 2;
}

function letraLR(al) {
  let atual = (al - 0x4c) & 0xff;
  if (atual === 0) return true;
  atual = (atual - 6) & 0xff;
  if (atual === 0) return true;
  atual = (atual - 0x1a) & 0xff;
  if (atual === 0) return true;
  atual = (atual - 6) & 0xff;
  return atual === 0;
}

function pontoDeHifen(ler, ebx) {
  const anterior = ler(ebx - 1);
  const atual = ler(ebx);
  const seguinte = ler(ebx + 1);
  if (noConjunto(anterior, 0xbf, 0) && noConjunto(atual, 0xa7, 24) && noConjunto(seguinte, 0xbf, 0)) return true;
  if (letraNSR(anterior) && noConjunto(atual, 0xa7, 24) && noConjunto(seguinte, 0xbf, 0)) return true;
  if ((anterior === 0x4c || anterior === 0x6c) && noConjunto(atual, 0xa7, 24) && atual !== 0x4c && atual !== 0x6c && noConjunto(seguinte, 0xbf, 0)) {
    return true;
  }
  if (letraNSR(anterior) && noConjunto(atual, 0x37, 48) && letraLR(seguinte)) return true;
  if ((anterior === 0x4d || anterior === 0x6d) && (atual === 0x42 || atual === 0x50 || atual === 0x62 || atual === 0x70) && letraLR(seguinte)) {
    return true;
  }
  if (noConjunto(anterior, 0xbf, 0) && noConjunto(atual, 0x2f, 56) && (seguinte === 0x48 || seguinte === 0x68)) return true;
  return false;
}

// O corte e a hifenização olham o texto intermediário; a tabela de conversão só entra depois.
// Por isso o "¨" (meta 0x20, texto 0xA8) não é ponto de quebra.
function byteTexto(cela) {
  return (cela.metaTexto ?? cela.meta ?? 0) & 0xff;
}

function partirImpresso(celas, largura, separar) {
  const ler = (posicao) => (posicao >= 1 && posicao <= celas.length ? byteTexto(celas[posicao - 1]) : 0);
  const semHifen = (cabeca, cauda) => ({ cabeca, cauda, hifen: false });

  if (ler(largura + 1) === 0x20) {
    let ebx = largura;
    while (ebx > 10 && ler(ebx) === 0x20) ebx -= 1;
    let inicio = largura + 2;
    while (inicio <= celas.length && ler(inicio) === 0x20) inicio += 1;
    return semHifen(celas.slice(0, ebx), celas.slice(inicio - 1));
  }

  let ebx = ler(largura) === 0x20 ? largura + 1 : largura;
  if (ler(largura) !== 0x20) {
    while (ebx > 10 && ler(ebx - 1) !== 0x20) {
      if (!separar || ler(ebx - 2) === 0x20 || !pontoDeHifen(ler, ebx)) {
        ebx -= 1;
        continue;
      }
      break;
    }
    if (ebx === 10) ebx = largura;
  }

  const cabeca = celas.slice(0, Math.max(0, ebx - 1));
  const hifen = ler(ebx - 1) !== 0x20;
  if (!hifen) {
    while (cabeca.length && byteTexto(cabeca[cabeca.length - 1]) === 0x20) cabeca.pop();
  }
  return { cabeca, cauda: celas.slice(Math.max(0, ebx - 1)), hifen };
}

function origemDe(celas, reserva) {
  for (const cela of celas) {
    if (cela.linhaOrigem != null) return cela.linhaOrigem;
  }
  return reserva;
}

// Coluna, na linha original, de cada posição do texto que vai ao tradutor: o TAB vira quatro
// espaços que apontam para a mesma coluna. Tem uma posição a mais, a do fim da linha.
function mapaDaLinha(original) {
  const mapa = [];
  for (let coluna = 0; coluna < original.length; coluna += 1) {
    if (original[coluna] === "\t") mapa.push(coluna, coluna, coluna, coluna);
    else mapa.push(coluna);
  }
  mapa.push(original.length);
  return mapa;
}

// Liga a cela ao trecho exato do texto de onde veio (linha e colunas). Celas criadas pela
// paginação (recuo, centralização, hífen do corte, espaço entre linhas) não têm fonte.
function comFonte(cela, parte, mapa) {
  if (!mapa || cela.de == null) return cela;
  const de = mapa[cela.de];
  const ate = mapa[cela.ate] ?? mapa[mapa.length - 1];
  if (de != null) cela.fonte = { linha: parte.origem, de, ate };
  return cela;
}

// Cada linha do texto é traduzida com o modo inglês dela e entra no
// buffer do parágrafo; entre uma linha e outra vai um espaço.
function celasDasPartes(partes, opcoes, cache, estado = ESTADO_INICIAL) {
  const celas = [];
  let anterior = "";
  for (const parte of partes) {
    const extra = { linhaOrigem: parte.origem, silabas: parte.silabas, tinta: parte.tinta };
    if (anterior && !anterior.endsWith("-") && !anterior.endsWith(" ") && !parte.texto.startsWith(" ")) {
      celas.push({ ...espaco(), ...extra });
    }
    const mapa = parte.fazMapa?.();
    const traduzida = traduzirLinhaDoTexto(parte.texto, { ...opcoes, ingles: Boolean(parte.ingles) }, cache, estado);
    for (const cela of traduzida.celas) {
      celas.push(comFonte({ ...cela, ...extra }, parte, mapa));
    }
    estado = traduzida.saida;
    anterior = parte.texto;
  }
  return { celas, estado };
}

// O corte acontece assim que uma linha faz o buffer passar da largura, com o <S±> que vale
// naquele momento: o da linha que trouxe a primeira cela que não coube.
function separaNoCorte(celas, util) {
  const cela = celas[util] ?? celas[celas.length - 1];
  return cela?.silabas !== false;
}

// Cada linha leva a página em tinta do momento em que é gravada: a cortada, a da
// linha do texto que fez o buffer passar da largura; a sobra, a do fechamento do parágrafo.
// `inteiras`: números das linhas do parágrafo que não podem terminar com palavra separada
// (a última linha de uma página; ver formatar).
function encaixar(partes, util, recuo, opcoes, cache, tintaFinal, inteiras = [], estado = ESTADO_INICIAL) {
  const linhas = [];
  const traduzidas = celasDasPartes(partes, opcoes, cache, estado);
  linhas.saida = traduzidas.estado;
  let pendente = traduzidas.celas;
  while (pendente.length && byteTexto(pendente[pendente.length - 1]) === 0x20) pendente.pop();
  const hifen = celasDe("-", opcoes, cache)[0];
  let primeira = true;
  let reserva = partes[0]?.origem ?? 0;

  while (pendente.length) {
    const atual = !primeira && recuo ? [espaco(), espaco(), ...pendente] : pendente;
    if (atual.length <= util) {
      linhas.push({ celas: atual, origem: origemDe(atual, reserva), tinta: tintaFinal });
      break;
    }
    const separar = !inteiras.includes(linhas.length) && separaNoCorte(atual, util);
    const corte = partirImpresso(atual, util, separar);
    const tintaDoCorte = (atual[util] ?? atual[atual.length - 1])?.tinta ?? tintaFinal;
    const cabeca = corte.cabeca.slice();
    if (corte.hifen && hifen) cabeca.push({ ...hifen, cortada: true });
    if (!cabeca.length || corte.cauda.length >= atual.length) {
      const forca = atual.slice(0, util);
      linhas.push({ celas: forca, origem: origemDe(forca, reserva), tinta: tintaDoCorte });
      pendente = atual.slice(util);
    } else {
      linhas.push({ celas: cabeca, origem: origemDe(cabeca, reserva), tinta: tintaDoCorte });
      pendente = corte.cauda;
    }
    reserva = origemDe(pendente, reserva);
    primeira = false;
    if (!pendente.length) break;
  }
  return linhas;
}

function terminaSeparada(item) {
  return Boolean(item.celas[item.celas.length - 1]?.cortada);
}

function centrar(celas, util) {
  if (celas.length >= util) return celas.slice(0, util);
  const esquerda = Math.floor((util - celas.length) / 2);
  return [...Array.from({ length: esquerda }, espaco), ...celas];
}

// Só P, T, F, R, G e M esvaziam o parágrafo em curso (comando.fecha). <S±>, <I±>,
// a página em tinta, as anotações e os comentários valem dali em diante sem interrompê-lo.
function montarSegmentos(linhas, opcoes, avisos = []) {
  const doc = documento(opcoes);
  const segmentos = [];
  let fluxo = [];
  // O mapa de colunas só é calculado quando o parágrafo precisa ser traduzido de novo.
  const parte = (texto, origem, fazMapa) => ({ texto, origem, fazMapa, ingles: doc.ingles, silabas: doc.silabas, tinta: doc.paginaTinta });

  function fecharFluxo() {
    if (!fluxo.length) return;
    segmentos.push({ tipo: "fluxo", partes: fluxo, ...foto(doc) });
    fluxo = [];
  }

  for (let indice = 0; indice < linhas.length; indice += 1) {
    const bruta = linhas[indice].replaceAll("\t", "    ");
    const comando = classificar(bruta);
    if (comando) {
      if (comando.fecha) fecharFluxo();
      if (comando.aviso) avisos.push({ linha: indice, texto: comando.aviso.replace("{linha}", String(indice + 1)) });
      aplicar(doc, comando);
      if (comando.tipo === "quebra" || (comando.tipo === "titulo" && comando.modo === "numero")) {
        // <P> sempre vira página; <T+n> no começo do texto só acerta o número.
        segmentos.push({
          tipo: "quebra",
          forcada: comando.tipo === "quebra",
          reinicia: comando.tipo === "titulo" ? doc.numeroInicial : null,
          origem: indice,
          ...foto(doc),
        });
      } else if (comando.tipo === "grafico-arquivo") {
        segmentos.push({ tipo: "nota", texto: comando.rotulo, origem: indice, nao: false, ...foto(doc) });
      }
      // Comando inválido e <12a> (Val falhou): depois de agir, a linha sai como texto.
      if (!comando.imprimir) continue;
    }

    const texto = bruta;
    const original = linhas[indice];
    const mapa = () => mapaDaLinha(original);
    // Linha vazia é linha em branco também no <F-> (o sumário depende disso).
    if (texto.trim() === "") {
      fecharFluxo();
      segmentos.push({ tipo: "branco", origem: indice, ...foto(doc) });
      continue;
    }
    if (!doc.ajuste) {
      fecharFluxo();
      segmentos.push({ tipo: "fixa", texto, fazMapa: mapa, origem: indice, centro: false, ...foto(doc) });
      continue;
    }
    const lead = (texto.match(/^ */) || [""])[0].length;
    if (lead >= 10) {
      fecharFluxo();
      const centro = texto.trim();
      segmentos.push({ tipo: "fixa", texto: centro, fazMapa: () => mapa().slice(lead, lead + centro.length + 1), origem: indice, centro: true, ...foto(doc) });
    } else if (lead === 1) {
      // Fecha o parágrafo, apaga o espaço e a linha segue juntando as próximas
      // (é aí que o <R+> põe os dois espaços nas linhas de baixo).
      fecharFluxo();
      fluxo.push(parte(texto.slice(1), indice, () => mapa().slice(1)));
    } else if (lead >= 2) {
      fecharFluxo();
      fluxo.push(parte(texto.replace(/^ +/, "  "), indice, () => {
        const todo = mapa();
        return [todo[0], todo[1], ...todo.slice(lead)];
      }));
    } else if (texto.startsWith("•")) {
      // 0x95 (•) no início também abre parágrafo novo.
      fecharFluxo();
      fluxo.push(parte(texto, indice, mapa));
    } else fluxo.push(parte(texto, indice, mapa));
  }
  fecharFluxo();
  return segmentos;
}

function repetir(quantidade) {
  return Array.from({ length: Math.max(0, quantidade) }, espaco);
}

function celasDaTinta(pagina, opcoes, cache) {
  if (!pagina.paginaTinta) return [];
  return [espaco(), espaco(), ...celasDe(String(pagina.paginaTinta), opcoes, cache)];
}

function celasDoNumero(pagina, numero, opcoes, cache) {
  if (!pagina.titula || numero == null) return [];
  if (pagina.romano) {
    const letras = paraRomano(numero);
    return letras ? celasDe(letras, opcoes, cache) : [];
  }
  return celasDe(String(numero), opcoes, cache);
}

function cabecalho(pagina, numero, opcoes, cache) {
  const margem = margemDe(pagina.margem, opcoes, cache);
  const util = Math.max(1, pagina.colunas - margem.length);
  const tintaCelas = celasDaTinta(pagina, opcoes, cache);
  const numeroCelas = celasDoNumero(pagina, numero, opcoes, cache);
  const modo = Number(opcoes.numeracao) || 0;
  let corpo;
  if (modo === 2) {
    const folga = Math.max(0, util - numeroCelas.length - tintaCelas.length);
    const esquerda = folga >> 1;
    corpo = [...repetir(esquerda), ...numeroCelas, ...repetir(folga - esquerda), ...tintaCelas];
  } else if (modo === 3) {
    const livre = Math.max(0, util - numeroCelas.length - tintaCelas.length);
    const titulo = pagina.titula ? celasDe(pagina.titulo || "", opcoes, cache).slice(0, livre) : [];
    const folga = livre - titulo.length;
    corpo = [...numeroCelas, ...tintaCelas, ...repetir(folga), ...titulo];
  } else {
    const livre = Math.max(0, util - numeroCelas.length - tintaCelas.length);
    const titulo = pagina.titula ? celasDe(pagina.titulo || "", opcoes, cache).slice(0, livre) : [];
    const folga = livre - titulo.length;
    const esquerda = folga >> 1;
    corpo = [...tintaCelas, ...repetir(esquerda), ...titulo, ...repetir(folga - esquerda), ...numeroCelas];
  }
  return [...margem, ...corpo].slice(0, pagina.colunas);
}

// A tradução de um trecho só depende do texto e das opções de tradução. O cache sobrevive entre
// uma formatação e a próxima, então digitar só retraduz a linha alterada.
const CACHES = new Map();
function cacheDaTraducao(opcoes) {
  const chave = JSON.stringify([
    opcoes.codigo, opcoes.matematica, opcoes.maiuscula, opcoes.maiusculaPalavra, opcoes.numero, opcoes.correcoes ?? null,
  ]);
  let cache = CACHES.get(chave);
  if (!cache || cache.size > 200000) {
    if (CACHES.size > 8) CACHES.clear();
    cache = new Map();
    CACHES.set(chave, cache);
  }
  return cache;
}

// Linhas braille de cada parágrafo, guardadas pelo conteúdo dele. A chave usa os números de
// linha relativos ao começo do parágrafo; se o parágrafo só mudou de lugar (Enter acima dele),
// a versão guardada é movida: os números de linha mudam no lugar, sem traduzir nem copiar.
let PARAGRAFOS = new WeakMap();

// Para os testes: formata do zero, como se fosse a primeira vez.
function esquecerParagrafos() {
  PARAGRAFOS = new WeakMap();
}
let passagem = 0;

function chaveDoParagrafo(seg, partes, util, linhas, inteiras, estado) {
  const base = partes[0].origem;
  let chave = `${chaveDoEstado(estado)}|${seg.tipo}|${util}|${inteiras.join(",")}|${seg.tipo === "fluxo" && seg.recuo ? 1 : 0}|${seg.centro ? 1 : 0}|${seg.colunas}|${seg.margem}|${seg.paginaTinta}`;
  for (const parte of partes) {
    const original = linhas[parte.origem];
    chave += `\u0001${parte.origem - base}\u0002${parte.ingles ? 1 : 0}${parte.silabas === false ? 0 : 1}\u0002${parte.tinta}\u0002${original}`;
    if (parte.texto !== original) chave += `\u0002${parte.texto}`;
  }
  return chave;
}

function moverParagrafo(versao, base) {
  const delta = base - versao.base;
  const vistos = new Set();
  for (const item of versao.itens) {
    item.origem += delta;
    for (const cela of item.celas) {
      if (vistos.has(cela)) continue;
      vistos.add(cela);
      if (cela.linhaOrigem != null) cela.linhaOrigem += delta;
      if (cela.fonte && !vistos.has(cela.fonte)) {
        vistos.add(cela.fonte);
        cela.fonte.linha += delta;
      }
    }
    for (const trecho of item.tintaPronta?.trechos || []) {
      if (vistos.has(trecho)) continue;
      vistos.add(trecho);
      trecho.linha += delta;
    }
  }
  versao.base = base;
}

function copiarParagrafo(versao) {
  const itens = versao.itens.map((item) => ({
    ...item,
    tintaPronta: null,
    celas: item.celas.map((cela) => (cela.fonte ? { ...cela, fonte: { ...cela.fonte } } : { ...cela })),
  }));
  for (const item of itens) item.grupo = itens;
  itens.saida = versao.itens.saida;
  return { base: versao.base, itens, passagem: 0 };
}

// Devolve as linhas do parágrafo; `itens.saida` é o estado das aspas e do parêntese no fim dele.
function linhasDoParagrafo(seg, partes, util, margem, opcoes, cache, linhas, inteiras = [], estado = ESTADO_INICIAL) {
  let memoria = PARAGRAFOS.get(cache);
  if (!memoria || memoria.total > 40000) {
    memoria = { mapa: new Map(), total: 0 };
    PARAGRAFOS.set(cache, memoria);
  }
  const chave = chaveDoParagrafo(seg, partes, util, linhas, inteiras, estado);
  const base = partes[0].origem;
  // Por chave, uma versão para cada posição (dois parágrafos iguais não brigam pela mesma).
  let versoes = memoria.mapa.get(chave);
  if (versoes) {
    let versao = versoes.get(base);
    if (!versao) {
      // Uma versão que esta formatação ainda não usou pode mudar de lugar; senão, copia.
      for (const outra of versoes.values()) if (outra.passagem !== passagem) versao = outra;
      if (versao) versoes.delete(versao.base);
      else {
        versao = copiarParagrafo(versoes.values().next().value);
        memoria.total += 1;
      }
      moverParagrafo(versao, base);
      versoes.set(base, versao);
    }
    versao.passagem = passagem;
    return versao.itens;
  }
  versoes = new Map();
  memoria.mapa.set(chave, versoes);
  const produzidas = encaixar(partes, util, seg.tipo === "fluxo" && seg.recuo, opcoes, cache, seg.paginaTinta, inteiras, estado);
  const itens = produzidas.map((linha) => {
    const miolo = seg.centro ? centrar(linha.celas, util) : linha.celas;
    const item = { tipo: "celas", celas: [...margem, ...miolo].slice(0, seg.colunas), origem: linha.origem, tinta: linha.tinta, conta: true };
    if (seg.centro) item.centro = true;
    return item;
  });
  // O grupo deixa a tinta ser montada uma vez para o parágrafo todo (faixas.js).
  for (const item of itens) item.grupo = itens;
  itens.saida = produzidas.saida;
  versoes.set(base, { base, itens, passagem });
  memoria.total += 1;
  return itens;
}

function formatar(linhas, opcoes, tinta, { semVista = false } = {}) {
  const cache = cacheDaTraducao(opcoes);
  passagem += 1;
  const avisos = [];
  const segmentos = montarSegmentos(linhas, opcoes, avisos);
  const paginas = [];
  let atual = null;
  let proximoNumero = null;
  let reinicioPendente = null;
  // Número que a próxima página gravada recebe, se não houver <T+n>/<T*n> nela.
  let contador = 1;
  let estadoDoTexto = ESTADO_INICIAL;

  // Com interponto, o verso (página par) não tem linha de cabeçalho: o texto usa todas as
  // linhas ("as páginas ímpares apresentam duas numerações").
  const comCabecalho = (pagina, numero) => pagina.titula && !(pagina.interponto && numero % 2 === 0);

  function fecha() {
    if (!atual) return;
    if (!atual.corpo.length && paginas.length && !atual.manter) {
      atual = null;
      return;
    }
    paginas.push(atual);
    contador = (atual.reinicio ?? contador) + 1;
    atual = null;
  }

  // O cabeçalho sai quando a primeira linha da página é gravada, com a página em
  // tinta daquele momento; um <nnn> posterior só aparece na página seguinte.
  function abre(seg, tinta = seg.paginaTinta, motivo = paginas.length ? "automatica" : "inicio") {
    if (atual) return;
    atual = {
      motivo,
      quebraLinha: motivo === "forcada" || motivo === "titulo" ? seg.origem : null,
      colunas: seg.colunas,
      linhasPagina: seg.linhasPagina,
      titula: seg.titula,
      titulo: seg.titulo,
      numera: seg.numera,
      numeroInicial: seg.numeroInicial,
      romano: seg.romano,
      paginaTinta: tinta,
      margem: seg.margem,
      interponto: seg.interponto,
      origem: seg.origem ?? seg.partes?.[0]?.origem ?? 0,
      reinicio: reinicioPendente,
      corpo: [],
    };
    reinicioPendente = null;
  }

  function limite() {
    // Sem título (<T->) não há linha de cabeçalho, nem para a página em tinta.
    const faixa = comCabecalho(atual, atual.reinicio ?? contador);
    return Math.max(1, faixa ? atual.linhasPagina - 1 : atual.linhasPagina);
  }

  // A próxima linha emitida cairá na última posição da página? (mesma conta de emite)
  function ultimaDaPagina(seg) {
    const novaPagina = !atual || seg.colunas !== atual.colunas || seg.linhasPagina !== atual.linhasPagina || atual.corpo.length >= limite();
    const proxima = atual ? (atual.reinicio ?? contador) + 1 : (reinicioPendente ?? contador);
    const teto = novaPagina ? Math.max(1, comCabecalho(seg, proxima) ? seg.linhasPagina - 1 : seg.linhasPagina) : limite();
    const posicao = novaPagina ? 0 : atual.corpo.length;
    return posicao === teto - 1;
  }

  function emite(item, seg) {
    const tintaDaLinha = item.tinta !== undefined ? item.tinta : seg.paginaTinta;
    if (!atual) abre(seg, tintaDaLinha);
    else if (seg.colunas !== atual.colunas || seg.linhasPagina !== atual.linhasPagina) {
      fecha();
      abre(seg, tintaDaLinha, "medida");
    }
    if (item.branco && atual.corpo.length === 0 && (atual.titula || atual.paginaTinta) && opcoes.tiraBrancas !== false) return;
    if (atual.corpo.length >= limite()) {
      // A página nova começa na linha do texto que a abriu (cabeçalho e separador apontam para ela).
      fecha();
      abre({ ...seg, origem: item.origem }, tintaDaLinha);
    }
    atual.corpo.push(item);
    if (atual.origem == null) atual.origem = item.origem;
  }

  for (const seg of segmentos) {
    if (seg.tipo === "quebra") {
      if (seg.reinicia != null) {
        // <T+n>/<T*n> sempre reinicia a contagem em n. Na primeira página ainda
        // vazia só acerta o número; fora disso fecha a página e grava já o cabeçalho da nova.
        const primeiraVazia = !paginas.length && (!atual || !atual.corpo.length);
        if (primeiraVazia) {
          if (atual) atual.reinicio = seg.reinicia;
          else reinicioPendente = seg.reinicia;
          continue;
        }
        fecha();
        abre(seg, seg.paginaTinta, "titulo");
        atual.manter = true;
        atual.reinicio = seg.reinicia;
        continue;
      }
      if (seg.forcada) {
        // Grava o cabeçalho pendente, fecha a página e já grava o cabeçalho da
        // seguinte. Página sem nada continua existindo e numerada, inclusive a última.
        if (!atual) abre(seg);
        atual.manter = true;
        fecha();
        abre(seg, seg.paginaTinta, "forcada");
        atual.manter = true;
        continue;
      }
      fecha();
      continue;
    }
    if (seg.tipo === "nota") {
      if (!atual) abre(seg.colunas ? seg : { ...documento(), origem: seg.origem });
      atual.corpo.push({ tipo: "nota", texto: seg.texto, origem: seg.origem, nao: seg.nao, conta: false });
      continue;
    }
    const margem = margemDe(seg.margem, opcoes, cache);
    const util = Math.max(4, seg.colunas - margem.length);
    if (seg.tipo === "branco") {
      emite({ tipo: "celas", celas: [...margem], origem: seg.origem, vazia: true, conta: true }, seg);
      continue;
    }
    const partes = seg.tipo === "fluxo"
      ? seg.partes
      : [{ texto: seg.texto, fazMapa: seg.fazMapa, origem: seg.origem, ingles: seg.ingles, silabas: seg.silabas, tinta: seg.paginaTinta }];
    // A última linha de uma página não termina com
    // palavra separada. Se isso aconteceria, o parágrafo é recortado dali em diante sem
    // separar sílabas naquela linha, e a palavra inteira vai para a página seguinte.
    let inteiras = [];
    let itens = linhasDoParagrafo(seg, partes, util, margem, opcoes, cache, linhas, inteiras, estadoDoTexto);
    for (let indice = 0; indice < itens.length; indice += 1) {
      if (indice < itens.length - 1 && terminaSeparada(itens[indice]) && ultimaDaPagina(seg)) {
        inteiras = [...inteiras, indice];
        itens = linhasDoParagrafo(seg, partes, util, margem, opcoes, cache, linhas, inteiras, estadoDoTexto);
      }
      emite(itens[indice], seg);
    }
    estadoDoTexto = itens.saida ?? estadoDoTexto;
  }
  fecha();
  if (!paginas.length) {
    paginas.push({ ...documento(opcoes), titula: false, origem: 0, corpo: [] });
  }

  const vista = [];
  const estrutura = [];
  proximoNumero = 1;
  paginas.forEach((pagina, indice) => {
    if (pagina.reinicio != null) proximoNumero = pagina.reinicio;
    let numero = proximoNumero;
    proximoNumero += 1;
    // O verso com interponto continua numerado (o relatório da tinta usa o número), só não
    // grava o cabeçalho.
    const verso = pagina.titula && !comCabecalho(pagina, numero);
    if (verso) pagina = { ...pagina, titula: false, verso: true };
    estrutura.push({
      ...pagina,
      numero,
      numeroTexto: pagina.titula || verso ? (pagina.romano ? paraRomano(numero) : String(numero)) : "",
      cabecalhoCelas: pagina.titula ? cabecalho(pagina, numero, opcoes, cache) : null,
    });
    // O editor pareado só usa a estrutura; a vista antiga (texto de cada linha) fica de fora.
    if (semVista) return;
    if (indice > 0) {
      vista.push({
        tipo: "codigo",
        texto: "-".repeat(50),
        origem: pagina.origem ?? 0,
        separador: true,
        pagina: indice,
      });
    }
    if (pagina.titula) {
      vista.push({
        tipo: tinta ? "tinta" : "braille",
        texto: escrever(cabecalho(pagina, numero, opcoes, cache), tinta),
        origem: pagina.origem ?? 0,
        titulo: pagina.titulo ? `título: ${pagina.titulo}` : "número de página",
        cabecalho: true,
        pagina: indice,
      });
    } else if (!pagina.corpo.length) {
      // Página vazia sem cabeçalho ganha uma linha em branco para existir.
      vista.push({ tipo: tinta ? "tinta" : "braille", texto: "", origem: pagina.origem ?? 0, pagina: indice });
    }
    for (const item of pagina.corpo) {
      if (item.tipo === "nota") {
        vista.push({
          tipo: "codigo",
          texto: item.texto,
          origem: item.origem,
          nao: item.nao,
          titulo: item.texto,
          pagina: indice,
        });
        continue;
      }
      vista.push({
        tipo: tinta ? "tinta" : "braille",
        texto: escrever(item.celas, tinta),
        origem: item.origem,
        pagina: indice,
      });
    }
  });

  return {
    linhas: vista,
    estrutura,
    paginas: paginas.length,
    colunas: paginas[0].colunas,
    altura: paginas[0].linhasPagina,
    avisos,
  };
}

export { esquecerParagrafos, formatar, paraRomano };
