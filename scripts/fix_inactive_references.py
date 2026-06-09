"""
Corrige references a itens INATIVOS sem merged_into_id.
- Detecta orphans: inativos sem redirect que ainda são referenciados em
  solicitacao_linhas, contagem_linhas ou template_itens.
- Pra cada orphan, busca canônico no catálogo ATIVO via fuzzy + heurísticas:
  * mesmos números (tamanhos) ou um sem números
  * mesmos modificadores chave (PRETA/VERDE/ZERO/COM/SEM/etc)
- Se achar, seta merged_into_id E migra todas as referências.
- Reporta orphans sem match pra revisão manual.
"""
from __future__ import annotations
from pathlib import Path
import json
import re
import sys
import unicodedata
import urllib.error
import urllib.request

from rapidfuzz import fuzz

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


def strip_accents(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


# Palavras que se diferentes entre A e B → produtos diferentes
DISTINGUISHERS = {
    "ZERO", "MINI", "DIET", "LIGHT",
    "PRETA", "PRETO", "VERDE", "VERMELHA", "VERMELHO", "BRANCA", "BRANCO",
    "AMARELA", "AMARELO", "AZUL", "ROSA",
    "SECO", "SECA", "FRESCO", "FRESCA", "CONGELADO", "CONGELADA",
    "GRANDE", "MEDIA", "MEDIO", "PEQUENA", "PEQUENO",
    "INTEIRA", "INTEIRO", "PICADO", "PICADA", "RALADO", "RALADA", "FATIADA",
    "TAMPA", "MOIDA", "ISCAS", "FILE", "PEÇA", "BISNAGA",
    "COM", "SEM",
    "DOCE", "SALGADA", "SALGADO",
    "G", "M", "P", "GG", "XG", "X2",
}


def extract_distinguishers(s):
    upper = strip_accents(s).upper()
    return set(re.findall(r"\b(?:" + "|".join(re.escape(d) for d in DISTINGUISHERS) + r")\b", upper))


def extract_numbers(s):
    upper = strip_accents(s).upper()
    # Captura números relevantes (>= 2 dígitos OU com decimal — descarta "1 unid")
    return set(re.findall(r"\b\d+(?:[.,]\d+)?\b", upper))


def safe_to_merge(a, b):
    """Retorna True se A e B parecem ser o MESMO produto."""
    # Mesmos modificadores chave
    da, db = extract_distinguishers(a), extract_distinguishers(b)
    if da != db:
        # Permite se um tem subset (ex: A tem extra "MEDIA" e B não)
        # mas só se a diferença é vazia em um lado E pequena no outro
        if (da - db) and (db - da):
            return False
    # Números: se ambos têm, devem coincidir; se só um tem, OK
    na, nb = extract_numbers(a), extract_numbers(b)
    if na and nb and na != nb:
        return False
    return True


# Pares manuais que o fuzzy não pega (tokens diferentes mas semanticamente o mesmo produto).
# Mapeia nome do órfão (substring, case-insensitive, sem acento) → nome canônico (substring).
MANUAL_PAIRS = [
    ("FARINHA DE TRIGO NORDESTE", "FARINHA BRANCA NORDESTE"),
    ("UVA PASSA  pct 1kg", "UVA PASSA 1PCT 1KG"),
    ("MASSA ESPAGUETTE - 500gr", "MASSA ESPAGUETE PCT 500G"),
    ("AMACIANTE - pct 1kg", "AMACIANTE DE CARNE"),
]


def manual_match(orphan_nome, ativos):
    orphan_up = strip_accents(orphan_nome).upper()
    for orphan_key, canon_key in MANUAL_PAIRS:
        if orphan_key.upper() in orphan_up:
            for a in ativos:
                if canon_key.upper() in strip_accents(a["nome"]).upper():
                    return a
    return None


def main():
    apply = "--apply" in sys.argv

    env = load_env()
    url = env["NEXT_PUBLIC_SUPABASE_URL"]
    secret = env["SUPABASE_SECRET_KEY"]
    rest = f"{url}/rest/v1"

    print("Carregando catálogo ativo...")
    r = http("GET", f"{rest}/itens?ativo=eq.true&select=id,nome,codigo_queops", secret)
    ativos = r["body"]
    print(f"  {len(ativos)} ativos")

    print("Carregando inativos sem merged_into_id...")
    r = http("GET", f"{rest}/itens?ativo=eq.false&merged_into_id=is.null&select=id,nome", secret)
    orphans = r["body"]
    print(f"  {len(orphans)} órfãos")

    # Quais órfãos são realmente referenciados?
    print("\nVerificando referências dos órfãos...")
    referenced_ids = set()
    for table in ("solicitacao_linhas", "contagem_linhas", "template_itens"):
        r = http("GET", f"{rest}/{table}?select=item_id&item_id=not.is.null", secret)
        for row in r["body"]:
            referenced_ids.add(row["item_id"])
    print(f"  {len(referenced_ids)} item_ids únicos referenciados em linhas/templates")

    orphans_used = [o for o in orphans if o["id"] in referenced_ids]
    print(f"  {len(orphans_used)} órfãos AINDA referenciados → precisam de redirect")

    if not orphans_used:
        print("\nNada a corrigir.")
        return

    # Pra cada órfão, busca canônico
    matched = []
    unmatched = []
    for orphan in orphans_used:
        # 1) Tenta override manual primeiro
        manual = manual_match(orphan["nome"], ativos)
        if manual:
            matched.append((orphan, manual, 100.0))
            continue

        # 2) Fuzzy + safe_to_merge
        best = None
        best_score = 0
        for active in ativos:
            score = fuzz.token_set_ratio(orphan["nome"].upper(), active["nome"].upper())
            if score < 80:
                continue
            if not safe_to_merge(orphan["nome"], active["nome"]):
                continue
            if score > best_score:
                best_score = score
                best = active
        if best and best_score >= 85:
            matched.append((orphan, best, best_score))
        else:
            unmatched.append((orphan, best, best_score))

    print(f"\nMatches com score >= 85: {len(matched)}")
    print(f"Sem match (revisão manual): {len(unmatched)}")

    print("\n--- MATCHES A APLICAR ---")
    for orphan, active, score in matched:
        print(f"  {score:5.1f}  {orphan['nome'][:55]:55s} → {active['nome'][:55]:55s} ({active.get('codigo_queops')})")

    print("\n--- SEM MATCH (precisam revisão manual) ---")
    for orphan, best, score in unmatched:
        guess = f"  (palpite: {best['nome'][:50]} score {score:.1f})" if best else ""
        print(f"  {orphan['nome'][:60]:60s} {guess}")

    if not apply:
        print("\n(dry-run) Use --apply para gravar.")
        return

    print("\nAplicando...")
    for orphan, active, score in matched:
        canon_id = active["id"]
        dup_id = orphan["id"]
        # Set merged_into_id
        http("PATCH", f"{rest}/itens?id=eq.{dup_id}", secret, body={"merged_into_id": canon_id})
        # Migrate references
        for table in ("solicitacao_linhas", "contagem_linhas", "template_itens"):
            http("PATCH", f"{rest}/{table}?item_id=eq.{dup_id}", secret, body={"item_id": canon_id}, prefer="return=minimal")
        print(f"  ✓ {orphan['nome'][:50]} → {active['nome'][:50]}")

    print(f"\nOK. {len(matched)} órfãos vinculados e referências migradas.")


if __name__ == "__main__":
    main()
