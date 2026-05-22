"""
Varredura ampla de duplicatas:
- Normaliza nomes (sem acentos, sem unidades, sem descritores triviais, sem
  marcadores de qualidade tipo "1º").
- Extrai "size signature" — números reais de medida tipo 300ml, 1kg, 1,8kg.
- Pares com mesmos tokens significativos E mesma signature de tamanho → duplicatas.
- Pares com tokens iguais mas signature DIFERENTE → produtos distintos (preserva).

Uso:
  python3 scripts/dedupe_full.py            # dry-run
  python3 scripts/dedupe_full.py --apply
"""
from __future__ import annotations
from pathlib import Path
from typing import Optional
import argparse
import json
import re
import sys
import unicodedata
import urllib.error
import urllib.request

ROOT = Path(__file__).parent.parent


def load_env() -> dict:
    env = {}
    for line in (ROOT / ".env.local").read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def http(method: str, url: str, secret: str, body=None, prefer: Optional[str] = None):
    headers = {
        "apikey": secret,
        "Authorization": f"Bearer {secret}",
        "Content-Type": "application/json",
        "User-Agent": "panas-compras-cli/0.1",
    }
    if prefer:
        headers["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            text = resp.read().decode()
            return {"ok": True, "body": json.loads(text) if text else None}
    except urllib.error.HTTPError as e:
        return {"ok": False, "status": e.code, "body": e.read().decode()}


def strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


# Palavras ruidosas — unidades, embalagens, descritores genéricos
NOISE_WORDS = {
    # unidades
    "kg", "g", "gr", "grs", "ml", "l", "lt", "lts", "lit", "litro", "litros",
    "un", "uni", "und", "unid", "unidade", "unidades", "um", "uma", "uns",
    "pct", "pcte", "pcts", "pacote", "pacotes", "pcot", "pacto",
    "cx", "caixa", "caixas",
    "fardo", "fardos", "fdo",
    "bisnaga", "bisnagas", "bisn",
    "balde", "baldes", "bld",
    "bombona", "bombonas", "bmb",
    "garrafa", "garrafas", "gfa",
    "rolo", "rolos",
    "peca", "pecas", "pç", "pca",
    "bandeija", "bandeijas", "bdj", "bandeja",
    # descritores genéricos
    "inteira", "inteiras", "inteiro", "inteiros",
    "fresco", "fresca", "frescos", "frescas",
    "seco", "seca", "secos", "secas",
    "congelado", "congelada",
    "molho",
    "marca", "tipo",
    "novo", "nova", "modelo",
    # graus de qualidade
    "1o", "1a", "2o", "2a", "primeira", "primeiro", "segunda", "segundo",
    # genéricos misc
    "para", "pra", "com", "sem", "de", "do", "da", "dos", "das", "no", "na", "em",
    "ou", "e",
}


def normalize_tokens(name: str) -> tuple[frozenset[str], frozenset[str]]:
    """Retorna (tokens_significativos, signature_tamanho).
    - tokens_significativos: set de palavras que distinguem o produto (sem unidades/descritores/sizes)
    - signature_tamanho: set de "medidas reais" tipo '300ml', '1.8kg', '5l', '100un'
    """
    s = strip_accents(name).lower().strip()
    # Remove "1º"/"1ª"/"2º"/etc (grau de qualidade — não é tamanho)
    s = re.sub(r"\b\d+[oa]\b", " ", s)
    # Substitui pontuação por espaço
    s = re.sub(r"[\-_/().,:;*+°ºª]+", " ", s)

    # Extrai medidas reais (número seguido de unidade) ANTES de remover
    sizes: set[str] = set()
    # Captura: "1,8kg", "300ml", "5l", "1kg", "500g", "100un", "2,5kg", "1.5l", "850un"
    for m in re.finditer(r"(\d+(?:[.,]\d+)?)\s*(kg|g|gr|ml|l|lt|lts|un|cm|mm|mt)\b", s):
        valor = float(m.group(1).replace(",", "."))
        unidade = m.group(2)
        # Só considera "tamanho" se for >= certo limite (pra não pegar "1 unidade" como tamanho)
        if unidade in ("ml", "g", "gr") and valor >= 10:
            sizes.add(f"{int(valor) if valor.is_integer() else valor}{unidade}")
        elif unidade in ("kg", "l", "lt", "lts"):
            sizes.add(f"{valor}{unidade}")
        elif unidade == "un" and valor >= 10:
            sizes.add(f"{int(valor)}un")
        elif unidade in ("cm", "mm", "mt") and valor > 0:
            sizes.add(f"{int(valor) if valor.is_integer() else valor}{unidade}")

    # Tokens significativos: remove números, unidades, descritores
    tokens = set()
    for t in s.split():
        if t in NOISE_WORDS:
            continue
        if re.match(r"^\d+(?:[.,]\d+)?$", t):  # número puro
            continue
        # Remove "1kg", "300ml" combinados num token só
        if re.match(r"^\d+(?:[.,]\d+)?(?:kg|g|gr|ml|l|lt|un|cm|mm)$", t):
            continue
        # Mantém tokens curtos (G, M, P, S, C — distinguem tamanhos e variações)
        tokens.add(t)

    return frozenset(tokens), frozenset(sizes)


def score_canonical(it: dict) -> int:
    s = 0
    if it.get("codigo_queops"):
        s += 1000
    if it.get("classificacao_id"):
        s += 100
    if it.get("unidade_id"):
        s += 50
    if it.get("fornecedor_padrao_id"):
        s += 30
    pr = it.get("preco_referencia")
    if pr not in (None, 0):
        s += 10
    return s


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    env = load_env()
    url = env["NEXT_PUBLIC_SUPABASE_URL"]
    secret = env["SUPABASE_SECRET_KEY"]
    rest = f"{url}/rest/v1"

    print("Buscando itens ativos...")
    r = http(
        "GET",
        f"{rest}/itens?ativo=eq.true&select=id,nome,codigo_queops,classificacao_id,unidade_id,fornecedor_padrao_id,forma_pagto_padrao_id,preco_referencia,prazo_padrao,criado_em",
        secret,
    )
    if not r["ok"]:
        sys.exit(f"Erro: {r['body']}")
    itens = r["body"]
    print(f"  {len(itens)} itens ativos")

    # Agrupa por (tokens, sizes) iguais
    grupos: dict[tuple, list[dict]] = {}
    for it in itens:
        tokens, sizes = normalize_tokens(it["nome"])
        if not tokens:
            continue
        key = (tokens, sizes)
        grupos.setdefault(key, []).append(it)

    dup_grupos = [g for g in grupos.values() if len(g) > 1]
    print(f"\nGrupos com 2+ itens (potenciais duplicatas): {len(dup_grupos)}")

    if not dup_grupos:
        print("Nada a unificar.")
        return

    plano = []
    for g in dup_grupos:
        g_sorted = sorted(g, key=score_canonical, reverse=True)
        canon = g_sorted[0]
        dups = g_sorted[1:]
        print(f"\n[canônico] {canon['nome']!r}  (cod={canon.get('codigo_queops')})")
        for d in dups:
            print(f"   → {d['nome']!r}  (cod={d.get('codigo_queops')})")
        plano.append({"canonico": canon, "duplicatas": dups})

    if not args.apply:
        print(f"\n(DRY-RUN — {len(plano)} grupos identificados. Use --apply pra aplicar.)")
        return

    print(f"\n>>> APLICANDO unificação em {len(plano)} grupos...")
    total_inativados = 0
    for grupo in plano:
        canon = grupo["canonico"]
        canon_id = canon["id"]

        # Move código Queóps das duplicatas pro canônico se ainda não tem
        if not canon.get("codigo_queops"):
            for d in grupo["duplicatas"]:
                if d.get("codigo_queops"):
                    http("PATCH", f"{rest}/itens?id=eq.{d['id']}", secret, body={"codigo_queops": None})
                    http("PATCH", f"{rest}/itens?id=eq.{canon_id}", secret, body={"codigo_queops": d["codigo_queops"]})
                    canon["codigo_queops"] = d["codigo_queops"]
                    break

        # Copia outros defaults faltantes
        patch_canon = {}
        for d in grupo["duplicatas"]:
            for col in ["classificacao_id", "unidade_id", "fornecedor_padrao_id", "forma_pagto_padrao_id", "prazo_padrao"]:
                if not canon.get(col) and d.get(col):
                    patch_canon[col] = d[col]
                    canon[col] = d[col]
            if (not canon.get("preco_referencia") or canon["preco_referencia"] == 0) and d.get("preco_referencia"):
                patch_canon["preco_referencia"] = d["preco_referencia"]
                canon["preco_referencia"] = d["preco_referencia"]
        if patch_canon:
            http("PATCH", f"{rest}/itens?id=eq.{canon_id}", secret, body=patch_canon)

        # Reaponta referências e inativa
        for d in grupo["duplicatas"]:
            for table in ("solicitacao_linhas", "contagem_linhas", "template_itens"):
                http(
                    "PATCH",
                    f"{rest}/{table}?item_id=eq.{d['id']}",
                    secret,
                    body={"item_id": canon_id},
                    prefer="return=minimal",
                )
            http("PATCH", f"{rest}/itens?id=eq.{d['id']}", secret, body={"ativo": False})
            total_inativados += 1

    print(f"\nOK. {total_inativados} duplicatas inativadas em {len(plano)} grupos.")


if __name__ == "__main__":
    main()
