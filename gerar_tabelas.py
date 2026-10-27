# -*- coding: utf-8 -*-
"""Lê as tabelas do Braille Fácil e grava tabelas.js."""

import json
import pathlib
import re

ORIGEM = pathlib.Path(r"C:\Users\nmesquita\Documents\rea bf\brfacil")
DESTINO = pathlib.Path(__file__).with_name("tabelas.js")


def ler(nome):
    return (ORIGEM / nome).read_bytes().decode("latin-1")


def caractere_do_byte(valor):
    try:
        return bytes([valor]).decode("cp1252")
    except UnicodeDecodeError:
        return chr(valor)


def parse_cfg(texto):
    mapa = {}
    for linha in texto.splitlines():
        m = re.fullmatch(r"\s*([0-9A-Fa-f]{2})=([0-9A-Fa-f]{2})\s*", linha)
        if not m:
            continue
        mapa[caractere_do_byte(int(m.group(1), 16))] = int(m.group(2), 16)
    return mapa


def parse_brailex(texto):
    pontos = {}
    for linha in texto.splitlines():
        m = re.fullmatch(r"\s*([0-9A-Fa-f]{2})=([01]{6})\s*", linha)
        if not m:
            continue
        pontos[int(m.group(1), 16)] = m.group(2)
    return pontos


def parse_codmat(texto):
    regras = []
    comentario = None
    for bruta in texto.splitlines():
        linha = bruta.strip()
        if not linha:
            continue
        if linha.startswith(";"):
            conteudo = linha[1:].strip()
            if conteudo and set(conteudo) <= set("-="):
                continue
            if conteudo:
                comentario = conteudo
            continue
        m = re.fullmatch(r"`(\S+)\s+(\S+)", linha)
        if not m:
            raise SystemExit(f"regra de matemática não lida: {linha}")
        regras.append(
            {
                "token": m.group(1),
                "saida": m.group(2),
                "comentario": comentario or "",
            }
        )
        comentario = None
    regras.sort(key=lambda r: (-len(r["token"]), r["token"]))
    return regras


def pontos_da_saida(saida, mapa, pontos):
    saida_pontos = []
    for caractere in saida:
        meta = mapa.get(caractere)
        if meta is None or meta not in pontos:
            return None
        saida_pontos.append(pontos[meta])
    return saida_pontos


def main():
    antigo = parse_cfg(ler("AMBCODE.CFG"))
    unificado = parse_cfg(ler("AMBCODE2.CFG"))
    pontos = parse_brailex(ler("BRAILEX.AMB"))
    regras = parse_codmat(ler("CODMAT.AMB"))

    diverge = []
    for regra in regras:
        a = pontos_da_saida(regra["saida"], antigo, pontos)
        u = pontos_da_saida(regra["saida"], unificado, pontos)
        if a != u:
            diverge.append(regra["token"])

    tabela = {
        "antigo": antigo,
        "unificado": unificado,
        "pontos": {str(k): v for k, v in sorted(pontos.items())},
        "regras": regras,
        "matematicaDiverge": diverge,
    }
    corpo = "export const tabelas = " + json.dumps(
        tabela, ensure_ascii=False, indent=2
    ) + ";\n"
    DESTINO.write_text(corpo, encoding="utf-8")
    print(f"antigo {len(antigo)} unificado {len(unificado)} pontos {len(pontos)} regras {len(regras)}")
    print("matemática com pontos diferentes:", ", ".join(diverge) or "nenhuma")


if __name__ == "__main__":
    main()
