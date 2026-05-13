"""
Lê a aba 'ESTOQUE GERAL' do Excel de contagem e cria a pasta
"Contagem Quinta-Feira" com TODOS os itens na ordem original.

Detecta cabeçalhos de seção e preserva a estrutura visual.
"""
from __future__ import annotations
from pathlib import Path
from typing import Optional
import json
import re
import sys
import urllib.error
import urllib.request

import openpyxl

EXCEL_PATH = Path("/Users/felipevelloso/Desktop/CONTAGEM PRODUTOS PANAS 2026/CONTAGEM QUINTA-FEIRA PANAS 2026.xlsx")
ROOT = Path(__file__).parent.parent

# Padrões pra detectar cabeçalhos/separadores que NÃO devem virar itens contáveis
SECTION_HEADER_RE = re.compile(r"^(ITENS\b|EMBALAGEM\s+PIZZA\s+LOGO|DATA\s+DA\s+CONTAGEM)", re.I)
DASHES_ONLY_RE = re.compile(r"^[\s\-_]+$")


def load_env() -> dict:
    env = {}
    for line in (ROOT / ".env.local").read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def http(method: str, url: str, token: str, body: Optional[dict] = None, headers: Optional[dict] = None) -> dict:
    h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json", "User-Agent": "panas-compras-cli/0.1"}
    if headers:
        h.update(headers)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            text = resp.read().decode()
            return {"ok": True, "body": json.loads(text) if text else None}
    except urllib.error.HTTPError as e:
        return {"ok": False, "status": e.code, "body": e.read().decode()}


def extract_items() -> list[dict]:
    """Retorna lista de dicts {ordem, secao, texto} preservando ordem."""
    if not EXCEL_PATH.exists():
        sys.exit(f"Excel não encontrado: {EXCEL_PATH}")

    wb = openpyxl.load_workbook(EXCEL_PATH, read_only=True, data_only=True)
    ws = wb["ESTOQUE GERAL"]

    items: list[dict] = []
    current_section: Optional[str] = None
    ordem = 0

    for i, row in enumerate(ws.iter_rows(values_only=True, max_col=1), start=1):
        val = row[0]
        if val is None:
            continue
        s = str(val).strip()
        if not s:
            continue

        # Pula a linha de "DATA DA CONTAGEM:"
        if i == 1 and "DATA" in s.upper():
            continue

        # Linhas só com traços
        if DASHES_ONLY_RE.match(s):
            continue

        # Cabeçalhos de seção (atualizam current_section mas não viram item)
        if SECTION_HEADER_RE.match(s):
            current_section = s
            continue

        # Item normal
        ordem += 1
        items.append({"ordem": ordem, "secao": current_section, "texto": s})

    wb.close()
    return items


def main():
    env = load_env()
    url = env.get("NEXT_PUBLIC_SUPABASE_URL")
    secret = env.get("SUPABASE_SECRET_KEY")
    if not url or not secret:
        sys.exit("ERRO: chaves Supabase ausentes no .env.local")

    items = extract_items()
    print(f"Itens extraídos do Excel: {len(items)}")
    if not items:
        sys.exit("Nada pra importar.")

    # Contar por seção pra checagem
    sections: dict[str, int] = {}
    for it in items:
        key = it["secao"] or "(sem seção)"
        sections[key] = sections.get(key, 0) + 1
    print("Itens por seção:")
    for sec, n in sections.items():
        print(f"  {sec!r}: {n}")

    rest_url = f"{url}/rest/v1"
    auth_headers = {"apikey": secret, "Authorization": f"Bearer {secret}"}

    # Apaga template existente com mesmo nome (pra ficar idempotente)
    print("\nApagando template existente 'Contagem Quinta-Feira' (se houver)...")
    r = http("DELETE", f"{rest_url}/templates_contagem?nome=eq.Contagem%20Quinta-Feira", secret, headers={"apikey": secret, "Prefer": "return=representation"})
    if r["ok"]:
        print(f"  removido: {r['body']}")

    # Cria o template
    print("\nCriando template 'Contagem Quinta-Feira'...")
    r = http(
        "POST",
        f"{rest_url}/templates_contagem",
        secret,
        body={"nome": "Contagem Quinta-Feira", "descricao": "Itens do estoque geral em ordem física (gerado a partir do Excel original)"},
        headers={"apikey": secret, "Prefer": "return=representation"},
    )
    if not r["ok"]:
        sys.exit(f"Falha ao criar template: {r['body']}")
    template_id = r["body"][0]["id"]
    print(f"  template_id: {template_id}")

    # Insere itens em lotes
    print(f"\nInserindo {len(items)} itens em lotes...")
    BATCH = 100
    inserted = 0
    for i in range(0, len(items), BATCH):
        batch = items[i:i + BATCH]
        payload = [
            {"template_id": template_id, "ordem": it["ordem"], "secao": it["secao"], "texto": it["texto"]}
            for it in batch
        ]
        r = http(
            "POST",
            f"{rest_url}/template_itens",
            secret,
            body=payload,
            headers={"apikey": secret, "Prefer": "return=minimal"},
        )
        if not r["ok"]:
            sys.exit(f"Falha lote {i}: {r['body']}")
        inserted += len(batch)
        print(f"  ...{inserted}/{len(items)}")

    print(f"\nOK. Template criado com {inserted} itens.")


if __name__ == "__main__":
    main()
