import { caractereMeta, traduzir, unicodeDaCela } from "./motor.js";
import { aplicar, classificar } from "./comandos.js";

function celasDe(texto, opcoes, cache) {
  const chave = texto;
  const guardado = cache.get(chave);
  if (guardado) return guardado.map((cela) => ({ ...cela }));
  const resultado = traduzir(texto, opcoes);
  const paragrafo = resultado.paragrafos.find((item) => !item.vazio);
  const celas = paragrafo ? paragrafo.celas : [];
  cache.set(chave, celas);
  return celas.map((cela) => ({ ...cela }));
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
    colunas: opcoes.colunasPadrao || 32,
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
  };
}

function margemDe(texto, opcoes, cache) {
  if (!texto) return [];
  return [...celasDe(texto, opcoes, cache), espaco()];
}

const MEMORIA_HIFEN = Uint8Array.from([
  0x22, 0x82, 0x20, 0x00, 0x22, 0x82, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x0f, 0x26, 0x38, 0x04, 0x0f, 0x26, 0x38, 0x04, 0xdc, 0x74, 0x5f, 0x05, 0xdc, 0x74, 0x5f,
  0x05, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80, 0x00, 0x00, 0x00, 0x80, 0x00, 0x00,
  0x00, 0xd8, 0x00, 0x50, 0x00, 0xd8, 0x00, 0x50, 0x00, 0x08, 0x50, 0x00, 0x00, 0x08, 0x50, 0x00,
  0x00, 0xff, 0xff, 0xff, 0xff, 0x01, 0x00, 0x00, 0x00, 0x2d, 0x00, 0x00, 0x00,
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

function partirImpresso(celas, largura, separar) {
  const ler = (posicao) => (posicao >= 1 && posicao <= celas.length ? (celas[posicao - 1].meta ?? 0) & 0xff : 0);
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
    while (cabeca.length && ((cabeca[cabeca.length - 1].meta ?? 0) & 0xff) === 0x20) cabeca.pop();
  }
  return { cabeca, cauda: celas.slice(Math.max(0, ebx - 1)), hifen };
}

function origemDe(celas, mapa, reserva) {
  for (const cela of celas) {
    if (typeof cela.de === "number" && mapa[cela.de] != null) return mapa[cela.de];
  }
  return reserva;
}

function encaixar(texto, mapa, util, separar, recuo, opcoes, cache) {
  const linhas = [];
  let pendente = celasDe(texto, opcoes, cache);
  while (pendente.length && ((pendente[pendente.length - 1].meta ?? 0) & 0xff) === 0x20) pendente.pop();
  const hifen = celasDe("-", opcoes, cache)[0];
  let primeira = true;
  let reserva = mapa[0] ?? 0;

  while (pendente.length) {
    const atual = !primeira && recuo ? [espaco(), espaco(), ...pendente] : pendente;
    if (atual.length <= util) {
      linhas.push({ celas: atual, origem: origemDe(atual, mapa, reserva) });
      break;
    }
    const corte = partirImpresso(atual, util, separar);
    const cabeca = corte.cabeca.slice();
    if (corte.hifen && hifen) cabeca.push({ ...hifen, cortada: true });
    if (!cabeca.length || corte.cauda.length >= atual.length) {
      const forca = atual.slice(0, util);
      linhas.push({ celas: forca, origem: origemDe(forca, mapa, reserva) });
      pendente = atual.slice(util);
    } else {
      linhas.push({ celas: cabeca, origem: origemDe(cabeca, mapa, reserva) });
      pendente = corte.cauda;
    }
    reserva = origemDe(pendente, mapa, reserva);
    primeira = false;
    if (!pendente.length) break;
  }
  return linhas;
}

function centrar(celas, util) {
  if (celas.length >= util) return celas.slice(0, util);
  const esquerda = Math.floor((util - celas.length) / 2);
  return [...Array.from({ length: esquerda }, espaco), ...celas];
}

function juntar(partes) {
  let texto = "";
  const mapa = [];
  for (const parte of partes) {
    const pedaco = parte.texto;
    if (texto && !texto.endsWith("-") && !texto.endsWith(" ") && !pedaco.startsWith(" ")) {
      texto += " ";
      mapa.push(parte.origem);
    }
    for (const ch of pedaco) {
      texto += ch;
      mapa.push(parte.origem);
    }
  }
  return { texto, mapa };
}

function montarSegmentos(linhas, opcoes) {
  const doc = documento(opcoes);
  const segmentos = [];
  let fluxo = [];

  function fecharFluxo() {
    if (!fluxo.length) return;
    segmentos.push({ tipo: "fluxo", partes: fluxo, ...foto(doc) });
    fluxo = [];
  }

  for (let indice = 0; indice < linhas.length; indice += 1) {
    const bruta = linhas[indice].replaceAll("\t", "    ");
    const comando = classificar(bruta);
    if (comando) {
      fecharFluxo();
      const mudaPagina = comando.tipo === "formato" && segmentos.length > 0;
      if (mudaPagina) segmentos.push({ tipo: "quebra" });
      aplicar(doc, comando);
      if (comando.tipo === "quebra" || (comando.tipo === "titulo" && comando.modo === "numero")) {
        segmentos.push({ tipo: "quebra" });
      } else if (comando.tipo === "desconhecido" || comando.tipo === "grafico" || comando.tipo === "grafico-arquivo") {
        segmentos.push({ tipo: "nota", texto: comando.rotulo, origem: indice, nao: comando.tipo === "desconhecido", ...foto(doc) });
      }
      continue;
    }

    const texto = bruta.replaceAll("\u00A8", "\u00A0");
    if (!doc.ajuste) {
      fecharFluxo();
      segmentos.push({ tipo: "fixa", texto, origem: indice, centro: false, ...foto(doc) });
      continue;
    }
    if (texto.trim() === "") {
      fecharFluxo();
      segmentos.push({ tipo: "branco", origem: indice, ...foto(doc) });
      continue;
    }
    const lead = (texto.match(/^ */) || [""])[0].length;
    if (lead >= 10) {
      fecharFluxo();
      segmentos.push({ tipo: "fixa", texto: texto.trim(), origem: indice, centro: true, ...foto(doc) });
    } else if (lead === 1) {
      fecharFluxo();
      segmentos.push({ tipo: "fixa", texto: texto.slice(1), origem: indice, centro: false, ...foto(doc) });
    } else if (lead >= 2) {
      fecharFluxo();
      fluxo.push({ texto: texto.replace(/^ +/, "  "), origem: indice });
    } else fluxo.push({ texto, origem: indice });
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

function formatar(linhas, opcoes, tinta) {
  const cache = new Map();
  const segmentos = montarSegmentos(linhas, opcoes);
  const paginas = [];
  let atual = null;
  let proximoNumero = null;

  function fecha() {
    if (!atual) return;
    if (!atual.corpo.length && paginas.length) {
      atual = null;
      return;
    }
    paginas.push(atual);
    atual = null;
  }

  function abre(seg) {
    if (atual) return;
    atual = {
      colunas: seg.colunas,
      linhasPagina: seg.linhasPagina,
      titula: seg.titula,
      titulo: seg.titulo,
      numera: seg.numera,
      numeroInicial: seg.numeroInicial,
      romano: seg.romano,
      paginaTinta: seg.paginaTinta,
      margem: seg.margem,
      interponto: seg.interponto,
      origem: seg.origem ?? seg.partes?.[0]?.origem ?? 0,
      corpo: [],
    };
  }

  function limite() {
    const faixa = atual.titula || atual.paginaTinta;
    return Math.max(1, faixa ? atual.linhasPagina - 1 : atual.linhasPagina);
  }

  function emite(item, seg) {
    if (!atual) abre(seg);
    else if (seg.colunas !== atual.colunas || seg.linhasPagina !== atual.linhasPagina) {
      fecha();
      abre(seg);
    }
    if (item.branco && atual.corpo.length === 0 && (atual.titula || atual.paginaTinta) && opcoes.tiraBrancas !== false) return;
    if (atual.corpo.length >= limite()) {
      const origem = atual.origem;
      fecha();
      abre({ ...seg, origem });
    }
    atual.corpo.push(item);
    if (atual.origem == null) atual.origem = item.origem;
  }

  for (const seg of segmentos) {
    if (seg.tipo === "quebra") {
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
      emite({ tipo: "celas", celas: [...margem], origem: seg.origem, conta: true }, seg);
      continue;
    }
    const junto = seg.tipo === "fluxo" ? juntar(seg.partes) : { texto: seg.texto, mapa: Array.from(seg.texto, () => seg.origem) };
    const produzidas = encaixar(junto.texto, junto.mapa, util, seg.silabas, seg.tipo === "fluxo" && seg.recuo, opcoes, cache);
    for (const linha of produzidas) {
      const miolo = seg.centro ? centrar(linha.celas, util) : linha.celas;
      emite({ tipo: "celas", celas: [...margem, ...miolo].slice(0, seg.colunas), origem: linha.origem, conta: true }, seg);
    }
  }
  fecha();
  if (!paginas.length) {
    paginas.push({ ...documento(opcoes), titula: false, origem: 0, corpo: [] });
  }

  const vista = [];
  let numeroAplicado = null;
  proximoNumero = 1;
  paginas.forEach((pagina, indice) => {
    if (pagina.numeroInicial != null && pagina.numeroInicial !== numeroAplicado) {
      proximoNumero = pagina.numeroInicial;
      numeroAplicado = pagina.numeroInicial;
    }
    let numero = proximoNumero;
    proximoNumero += 1;
    if (indice > 0) {
      vista.push({
        tipo: "codigo",
        texto: "-".repeat(50),
        origem: pagina.origem ?? 0,
        separador: true,
        pagina: indice,
      });
    }
    if (pagina.titula || pagina.paginaTinta) {
      const rotulo = pagina.paginaTinta ? `página em tinta ${pagina.paginaTinta}` : "";
      vista.push({
        tipo: tinta ? "tinta" : "braille",
        texto: escrever(cabecalho(pagina, pagina.titula ? numero : null, opcoes, cache), tinta),
        origem: pagina.origem ?? 0,
        titulo: pagina.titula
          ? pagina.titulo ? `título: ${pagina.titulo}` : "número de página"
          : rotulo,
        cabecalho: true,
        pagina: indice,
      });
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
    paginas: paginas.length,
    colunas: paginas[0].colunas,
    altura: paginas[0].linhasPagina,
  };
}

export { formatar, paraRomano };
