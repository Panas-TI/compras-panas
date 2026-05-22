"""
Unifica duplicatas no cadastro de itens.

Combina duas estratégias:
1. AUTO — só une se a forma normalizada (sem acentos/pontuação/unidades) for IDÊNTICA.
2. MANUAL — lista curada de pares específicos (mesmo produto, nomes diferentes).

Pra cada grupo:
  - Escolhe canônico (com código Queóps > com classificação > com preço)
  - Copia para o canônico defaults faltantes vindos das duplicatas
  - Reaponta references (solicitacao_linhas, contagem_linhas, template_itens) → canônico
  - Inativa duplicatas (ativo=false)

Uso:
  python3 scripts/dedupe_items.py            # dry-run
  python3 scripts/dedupe_items.py --apply
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

# Pares manuais (canônico, duplicata) — quando a normalização não pega
MANUAL_PAIRS = [
    ("LINGUICA CALAB (PIZZA/MASSA) - PCT 2,5 KG", "Linguiça Calabresa Defumada - 2,5 kg pct (CAIXA c/ 15 KG)"),
    ("QUEIJO MUSSARELA 1º  KG  PEÇA INTEIRA", "QUEIJO MUSSARELA INTEIRA"),
    ("BROCOLIS CONGELADO (2 ou 2,5KG PCT)", "BROCOLIS CONGELADO KG  2,5kg pct"),
    ("FARINHA DE TRIGO INTEGRAL PCT 25KG", "FARINHA DE TRIGO INTEGRAL - PCT 25kg OU 5kg"),
    ("FARINHA BRANCA NORDESTE 5KG", "FARINHA DE TRIGO NORDESTE - PACOTES 5kg"),
    ("FARINHA BRANCA NORDESTE 5KG", "FARINHA DE PIZZA KG"),
    ("PALMITO PICADO 1,8kg", "PALMITO PICADO CONSERVA VIDRO   1,8kg"),
    ("AZEITONA VERDE FATIADA 1,8KG", "AZEITONA VERDE FATIADA VIDRO  1,8kg"),
    ("MOLHO DE PIMENTA", "MOLHO PIMENTA - garrafa"),
    ("LEITE DE COCO GARRAFA", "LEITE DE COCO - garrafa"),
    ("CAIXA EMPILHAVEL ALTA - FARDO 50un", "CAIXA EMPILHAVEL ALTA -  FARDO"),
    ("PAPEL SEMENTINHA 400un", "PAPEL SEMENTINHA  - 400un"),
    ("MANJERICAO MOLHO FRESCO", "MANJERICAO FRESCO - MOLHO"),
    ("CEBOULETE MOLHO", "CEBOULETE - MOLHO"),
    ("SALSA MOLHO", "SALSA - MOLHO"),
    ("PIMENTÃO AMARELO", "PIMENTAO AMARELO KG"),
    ("PIMENTÃO VERMELHO", "PIMENTAO *VERMELHO KG"),
    ("PIMENTÃO VERDE", "PIMENTAO VERDE KG"),
    ("ALHO PORO UM", "ALHO PORO - UNID."),
    ("REQUEIJÃO CATUPIRY BISNAGA 1,8kg", "REQUEIJAO CATUPIRY  bisnaga 1,8kg"),
    ("MORANGA CABOITIA KG", "MORANGA CABOTIA KG"),
    ("QUEIJO PARMESAO RALADO 1KG", "QUEIJO PARMESAO RALADO PAGOTE 1kg"),
    ("NATA BALDE 3KG", "NATA BALDE  3kg"),
]


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


_UNIT_WORDS = {
    "kg", "g", "gr", "grs", "ml", "l", "lt", "lts", "lit", "litro", "litros",
    "un", "uni", "und", "unid", "unidade", "unidades", "um", "uns",
    "pct", "pcte", "pcts", "pacote", "pacotes",
    "cx", "caixa", "caixas",
    "fardo", "fardos",
    "bisnaga", "bisnagas",
    "balde", "baldes",
    "bombona", "bombonas",
    "garrafa", "garrafas", "gfa",
    "rolo", "rolos",
    "peca", "pecas", "peça", "peças",
    "bandeija", "bandeijas", "bdj",
    "inteira", "inteiras", "inteiro", "inteiros",
}


def normalize(name: str) -> str:
    s = strip_accents(name).lower().strip()
    # remove pontuação comum
    s = re.sub(r"[\-_/().,:;*+]+", " ", s)
    # tokens
    tokens = []
    for t in s.split():
        if t in _UNIT_WORDS:
            continue
        # remove sufixos comuns dentro do token (ex: "5kg" → "5")
        m = re.match(r"^(\d+(?:[.,]\d+)?)(kg|g|ml|l|lt|un|pct|cx)?$", t)
        if m:
            tokens.append(m.group(1).replace(",", "."))
        else:
            tokens.append(t)
    return " ".join(tokens)


def score_canonical(it):
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

    # Agrupa por forma normalizada
    grupos_norm: dict[str, list[dict]] = {}
    for it in itens:
        key = normalize(it["nome"])
        if not key:
            continue
        grupos_norm.setdefault(key, []).append(it)
    auto_grupos = [g for g in grupos_norm.values() if len(g) > 1]

    print(f"\n[AUTO] Grupos por normalização: {len(auto_grupos)}")

    # Adiciona pares manuais (resolve nomes → itens)
    by_name = {it["nome"]: it for it in itens}
    pair_groups = []
    for canon_name, dup_name in MANUAL_PAIRS:
        c = by_name.get(canon_name)
        d = by_name.get(dup_name)
        if c and d and c["id"] != d["id"]:
            pair_groups.append([c, d])

    print(f"[MANUAL] Pares curados encontrados: {len(pair_groups)}")

    todos_grupos = auto_grupos + pair_groups

    # Junta grupos que tenham itens em comum (transitivo)
    parent = {it["id"]: it["id"] for it in itens}
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb
    for g in todos_grupos:
        for i in range(1, len(g)):
            union(g[0]["id"], g[i]["id"])

    grupos_final: dict[str, list[dict]] = {}
    for it in itens:
        root = find(it["id"])
        # só itens que estão em algum grupo
        is_in_group = any(it["id"] in [x["id"] for x in g] for g in todos_grupos)
        if is_in_group:
            grupos_final.setdefault(root, []).append(it)
    final = [g for g in grupos_final.values() if len(g) > 1]

    if not final:
        print("\nNenhuma duplicata pra unificar.")
        return

    print(f"\nGRUPOS A UNIFICAR: {len(final)}")
    plano = []
    for lista in final:
        lista.sort(key=score_canonical, reverse=True)
        canon = lista[0]
        dups = lista[1:]
        print(f"\n[canônico] {canon['nome']!r}  (cod={canon.get('codigo_queops')})")
        for d in dups:
            print(f"   → {d['nome']!r}  (cod={d.get('codigo_queops')})")
        plano.append({"canonico": canon, "duplicatas": dups})

    if not args.apply:
        print("\n(DRY-RUN — execute com --apply pra aplicar.)")
        return

    print("\n>>> APLICANDO unificação...")
    for grupo in plano:
        canon = grupo["canonico"]
        canon_id = canon["id"]

        # 1. Move código Queóps das duplicatas pro canônico (se canon não tiver)
        if not canon.get("codigo_queops"):
            for d in grupo["duplicatas"]:
                if d.get("codigo_queops"):
                    http("PATCH", f"{rest}/itens?id=eq.{d['id']}", secret, body={"codigo_queops": None})
                    http("PATCH", f"{rest}/itens?id=eq.{canon_id}", secret, body={"codigo_queops": d["codigo_queops"]})
                    canon["codigo_queops"] = d["codigo_queops"]
                    print(f"   código {d['codigo_queops']} movido pro canônico {canon['nome']!r}")
                    break

        # 2. Copia outros defaults faltantes
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
            print(f"   defaults copiados: {list(patch_canon.keys())}")

        # 3. Reaponta referências e inativa
        for d in grupo["duplicatas"]:
            for table in ("solicitacao_linhas", "contagem_linhas", "template_itens"):
                http(
                    "PATCH",
                    f"{rest}/{table}?item_id=eq.{d['id']}",
                    secret,
                    body={"item_id": canon_id},
                    prefer="return=minimal",
                )
            http(
                "PATCH",
                f"{rest}/itens?id=eq.{d['id']}",
                secret,
                body={"ativo": False, "merged_into_id": canon_id},
            )
            print(f"   duplicata inativada: {d['nome']!r}")

    print("\nOK. Unificação concluída.")


if __name__ == "__main__":
    main()
