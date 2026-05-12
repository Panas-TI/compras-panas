"""
Aplica todas as migrations em supabase/migrations/ via Supabase Management API.
Lê o sbp_ token via env var SUPABASE_ACCESS_TOKEN.
"""

from pathlib import Path
import json
import os
import sys
import urllib.request
import urllib.error

PROJECT_REF = "qrscxvtqycqowhrzigxq"
API_URL = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"

TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN")
if not TOKEN:
    print("ERRO: defina SUPABASE_ACCESS_TOKEN", file=sys.stderr)
    sys.exit(1)

MIGRATIONS_DIR = Path(__file__).parent.parent / "supabase" / "migrations"
files = sorted(MIGRATIONS_DIR.glob("*.sql"))
if not files:
    print(f"ERRO: nenhum .sql em {MIGRATIONS_DIR}")
    sys.exit(1)


def run_sql(sql: str, label: str) -> None:
    print(f"\n>>> Aplicando: {label}")
    payload = json.dumps({"query": sql}).encode()
    req = urllib.request.Request(
        API_URL,
        data=payload,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
            "User-Agent": "panas-compras-cli/0.1",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            body = resp.read().decode()
        print(f"OK ({len(body)} bytes)")
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"FAIL [{e.code}]: {body}")
        sys.exit(1)


for f in files:
    sql = f.read_text()
    run_sql(sql, f.name)

print("\nMigrations aplicadas com sucesso.")
