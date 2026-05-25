"""
Garante que toda linha em template_itens (e contagem_linhas) tenha um item_id válido.
Estratégia:
1. Pra cada texto único, tenta achar no catálogo (active + redirected inactive)
   via match por palavra inteira (catalog nome contido no texto)
2. Se não achar, cria um novo item no cadastro com o próprio texto
3. Atualiza template_itens e contagem_linhas com item_id
"""
from __future__ import annotations
from pathlib import Path
import json
import re
import sys
import urllib.error
import urllib.request

ROOT = Path(__file__).parent.parent


def load_env():
    env = {}
    for line in (ROOT / ".env.local").read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def http(method, url, secret, body=None, prefer=None):
    h = {
        "apikey": secret,
        "Authorization": f"Bearer {secret}",
        "Content-Type": "application/json",
        "User-Agent": "panas-compras-cli/0.1",
    }
    if prefer:
        h["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            text = resp.read().decode()
            return {"ok": True, "body": json.loads(text) if text else None}
    except urllib.error.HTTPError as e:
        return {"ok": False, "status": e.code, "body": e.read().decode()}


def escape_re(s):
    return re.sub(r"[.*+?^${}()|[\]\\]", r"\\\g<0>", s)


def main():
    env = load_env()
    url = env["NEXT_PUBLIC_SUPABASE_URL"]
    secret = env["SUPABASE_SECRET_KEY"]
    rest = f"{url}/rest/v1"

    print("Carregando catálogo (ativos + inativos com redirect)...")
    r = http("GET", f"{rest}/itens?select=id,nome,ativo,merged_into_id", secret)
    catalogo = r["body"]
    # Map: id efetivo (canônico se redirect)
    cat_entries = []
    for c in catalogo:
        effective_id = c.get("merged_into_id") or c["id"]
        cat_entries.append({"effective_id": effective_id, "upper": c["nome"].upper(), "ativo": c["ativo"]})
    # Sort por comprimento desc — mais específico vence
    cat_entries.sort(key=lambda c: -len(c["upper"]))

    def match_in_catalog(texto):
        upper = texto.upper().strip()
        # exato primeiro
        for c in cat_entries:
            if c["upper"] == upper:
                return c["effective_id"]
        # contains (palavra inteira)
        for c in cat_entries:
            if len(c["upper"]) < 3:
                continue
            pattern = r"(^|[^A-Za-zÀ-ÿ])" + escape_re(c["upper"]) + r"([^A-Za-zÀ-ÿ]|$)"
            if re.search(pattern, upper):
                return c["effective_id"]
        return None

    # Coleta textos únicos sem item_id
    print("Buscando template_itens sem item_id...")
    r = http("GET", f"{rest}/template_itens?item_id=is.null&select=texto", secret)
    textos_tpl = {t["texto"] for t in r["body"]}
    print(f"  {len(textos_tpl)} textos únicos em template_itens")

    print("Buscando contagem_linhas sem item_id...")
    r = http("GET", f"{rest}/contagem_linhas?item_id=is.null&select=texto", secret)
    textos_cnt = {t["texto"] for t in r["body"]}
    print(f"  {len(textos_cnt)} textos únicos em contagem_linhas")

    todos_textos = textos_tpl | textos_cnt
    print(f"\nTotal de textos únicos a processar: {len(todos_textos)}")

    matched = 0
    created = 0
    text_to_id = {}
    for texto in sorted(todos_textos):
        tid = match_in_catalog(texto)
        if tid:
            text_to_id[texto] = tid
            matched += 1
        else:
            # Cria novo item
            r = http(
                "POST",
                f"{rest}/itens",
                secret,
                body={"nome": texto, "ativo": True},
                prefer="return=representation",
            )
            if not r["ok"]:
                print(f"  FAIL ao criar {texto!r}: {r['body']}")
                continue
            new_id = r["body"][0]["id"]
            text_to_id[texto] = new_id
            cat_entries.append({"effective_id": new_id, "upper": texto.upper(), "ativo": True})
            created += 1

    print(f"\nMatched no catálogo existente: {matched}")
    print(f"Criados novos no cadastro: {created}")

    # Atualiza template_itens
    print("\nAtualizando template_itens...")
    for texto, item_id in text_to_id.items():
        # PostgREST escape
        from urllib.parse import quote
        texto_q = quote(texto, safe="")
        r = http("PATCH", f"{rest}/template_itens?texto=eq.{texto_q}&item_id=is.null", secret, body={"item_id": item_id}, prefer="return=minimal")
        if not r["ok"]:
            # tentativa retry sem item_id is null
            pass

    # Atualiza contagem_linhas
    print("Atualizando contagem_linhas...")
    for texto, item_id in text_to_id.items():
        from urllib.parse import quote
        texto_q = quote(texto, safe="")
        r = http("PATCH", f"{rest}/contagem_linhas?texto=eq.{texto_q}&item_id=is.null", secret, body={"item_id": item_id}, prefer="return=minimal")

    # Verifica
    r = http("GET", f"{rest}/template_itens?item_id=is.null&select=count", secret, prefer="count=exact")
    print("\nOK. template_itens sem link:", r["body"])


if __name__ == "__main__":
    main()
