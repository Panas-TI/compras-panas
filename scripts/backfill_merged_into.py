"""
Backfill: pra cada item INATIVO sem merged_into_id, tenta achar o canônico
correspondente entre os ATIVOS (mesmo tokens significativos + mesmas sizes).
"""
from __future__ import annotations
from pathlib import Path
from typing import Optional
import json
import sys
import urllib.error
import urllib.request

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from dedupe_full import normalize_tokens, load_env, http  # type: ignore


def main():
    env = load_env()
    url = env["NEXT_PUBLIC_SUPABASE_URL"]
    secret = env["SUPABASE_SECRET_KEY"]
    rest = f"{url}/rest/v1"

    print("Buscando itens ativos...")
    r = http("GET", f"{rest}/itens?ativo=eq.true&select=id,nome", secret)
    ativos = r["body"]
    # Mapa: (tokens, sizes) → id ativo
    by_key: dict[tuple, str] = {}
    for a in ativos:
        tokens, sizes = normalize_tokens(a["nome"])
        if not tokens:
            continue
        key = (tokens, sizes)
        if key not in by_key:
            by_key[key] = a["id"]
    print(f"  {len(ativos)} ativos, {len(by_key)} chaves únicas")

    print("Buscando itens inativos sem merged_into_id...")
    r = http("GET", f"{rest}/itens?ativo=eq.false&merged_into_id=is.null&select=id,nome", secret)
    inativos = r["body"]
    print(f"  {len(inativos)} inativos sem redirect")

    matched = 0
    for it in inativos:
        tokens, sizes = normalize_tokens(it["nome"])
        if not tokens:
            continue
        # tenta match exato
        canonical_id = by_key.get((tokens, sizes))
        # se sizes vazias, tenta achar SE houver um único canônico com mesmos tokens
        if not canonical_id and not sizes:
            candidates = [v for (t, s), v in by_key.items() if t == tokens]
            if len(candidates) == 1:
                canonical_id = candidates[0]
        if canonical_id and canonical_id != it["id"]:
            http("PATCH", f"{rest}/itens?id=eq.{it['id']}", secret, body={"merged_into_id": canonical_id})
            matched += 1

    print(f"\nBackfill: {matched} inativos vinculados ao canônico")


if __name__ == "__main__":
    main()
