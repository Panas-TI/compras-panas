"""
Cria o primeiro usuário aprovador do sistema.

Uso:
  python3 scripts/bootstrap_admin.py <email> <senha> <nome>

Exemplo:
  python3 scripts/bootstrap_admin.py felipe@empresa.com 'MinhaSenha123' 'Felipe'

Lê SUPABASE_URL e SUPABASE_SECRET_KEY do .env.local automaticamente.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional
import json
import os
import sys
import urllib.request
import urllib.error


def load_env(env_path: Path) -> dict:
    env = {}
    if not env_path.exists():
        print(f"ERRO: {env_path} não encontrado.", file=sys.stderr)
        sys.exit(1)
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def http_request(url: str, method: str, headers: dict, body: Optional[dict] = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            text = resp.read().decode()
        return {"ok": True, "status": resp.status, "body": json.loads(text) if text else None}
    except urllib.error.HTTPError as e:
        return {"ok": False, "status": e.code, "body": e.read().decode()}


def main():
    if len(sys.argv) != 4:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    email, senha, nome = sys.argv[1], sys.argv[2], sys.argv[3]

    env_path = Path(__file__).parent.parent / ".env.local"
    env = load_env(env_path)
    url = env.get("NEXT_PUBLIC_SUPABASE_URL")
    secret = env.get("SUPABASE_SECRET_KEY")
    access_token = os.environ.get("SUPABASE_ACCESS_TOKEN") or env.get("SUPABASE_ACCESS_TOKEN")

    if not url or not secret:
        print("ERRO: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SECRET_KEY ausentes no .env.local.", file=sys.stderr)
        sys.exit(1)
    if not access_token:
        print("ERRO: defina SUPABASE_ACCESS_TOKEN (sbp_...) via env ou .env.local.", file=sys.stderr)
        sys.exit(1)

    project_ref = url.replace("https://", "").split(".")[0]

    print(f"Criando usuário '{email}' (nome: {nome})...")
    res = http_request(
        f"{url}/auth/v1/admin/users",
        "POST",
        {
            "apikey": secret,
            "Authorization": f"Bearer {secret}",
            "Content-Type": "application/json",
            "User-Agent": "panas-compras-cli/0.1",
        },
        {
            "email": email,
            "password": senha,
            "email_confirm": True,
            "user_metadata": {"nome": nome},
        },
    )
    if not res["ok"]:
        print(f"FALHA [{res['status']}]: {res['body']}", file=sys.stderr)
        sys.exit(1)

    user_id = res["body"]["id"]
    print(f"  → user_id: {user_id}")

    print("Promovendo a aprovador + ativando...")
    sql = (
        "UPDATE public.profiles "
        f"SET role = 'aprovador', ativo = true, nome = '{nome.replace(chr(39), chr(39)+chr(39))}' "
        f"WHERE id = '{user_id}'"
    )
    res = http_request(
        f"https://api.supabase.com/v1/projects/{project_ref}/database/query",
        "POST",
        {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
            "User-Agent": "panas-compras-cli/0.1",
        },
        {"query": sql},
    )
    if not res["ok"]:
        print(f"FALHA ao promover [{res['status']}]: {res['body']}", file=sys.stderr)
        sys.exit(1)

    print("\nUsuário aprovador criado e ativado com sucesso.")
    print(f"  email: {email}")
    print(f"  nome:  {nome}")


if __name__ == "__main__":
    main()
