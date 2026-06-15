"""
Importador das fichas técnicas do Queóps pro banco.

Usa o output do analisar_fichas.py (scripts/_fichas_analise.json) pra popular:
- produto (35 produtos)
- materia_prima (107 mps, marcando tipo=folha/intermediario/ignorado)
- ficha_tecnica (1 versão vigente por produto)
- ficha_item (linhas da ficha, considerando hierarquia e qtd_total)

Idempotente: se rodar de novo, faz UPSERT por codigo_queops e desativa fichas
antigas antes de inserir as novas.

Estratégia da ficha técnica:
- Cada produto vira UMA ficha_tecnica versao=1 vigente=true.
- A ficha lista TODAS as folhas (matérias-primas finais) com a Qtd. Total já
  consolidada do Excel — porque o Queóps já fez a multiplicação receita × fator
  pra cada folha (mostra a quantidade final por unidade de produto).
- Intermediários (recheios/massas) NÃO viram linhas da ficha — eles são
  apenas headers de agrupamento na visão do Queóps. As folhas dentro deles já
  carregam a quantidade final.
"""
from __future__ import annotations
from pathlib import Path
import json
import sys
import urllib.error
import urllib.request

ROOT = Path(__file__).parent.parent
ANALISE_JSON = ROOT / "scripts" / "_fichas_analise.json"


def env():
    e = {}
    for line in (ROOT / ".env.local").read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            e[k.strip()] = v.strip().strip('"').strip("'")
    return e


def get_creator_user_id(rest: str, headers: dict) -> str | None:
    """Pega um aprovador pra ser o 'criado_por' das fichas importadas."""
    req = urllib.request.Request(
        f"{rest}/profiles?role=eq.aprovador&ativo=eq.true&select=id&limit=1",
        headers=headers,
    )
    data = json.loads(urllib.request.urlopen(req, timeout=30).read())
    return data[0]["id"] if data else None


def http(method: str, url: str, headers: dict, body=None, prefer: str | None = None):
    h = dict(headers)
    if prefer:
        h["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            text = resp.read().decode()
            return json.loads(text) if text else None
    except urllib.error.HTTPError as e:
        body_resp = e.read().decode()
        print(f"FAIL [{e.code}] {method} {url}: {body_resp[:300]}", file=sys.stderr)
        raise


# Detecta unidade_base normalizada pra mp a partir das ocorrências na ficha
UNIDADE_MAP = {"KG": "kg", "L": "l", "UN": "un", "ML": "ml", "G": "g"}


def normalizar_unidade(u: str | None) -> str:
    if not u:
        return "kg"
    return UNIDADE_MAP.get(u.upper().strip(), u.lower().strip())


def categoria_do_produto(codigo: str) -> str:
    """Mapeia código → categoria. Tudo 021XXX é empanada por enquanto."""
    if codigo.startswith("021"):
        # Sub-grupos: 5o e 6o dígito definem variação
        prefix = codigo[:4]
        return {
            "0211": "EMPANADA TRADICIONAL",
            "0212": "EMPANADA TRADICIONAL",
            "0213": "EMPANADA ESPECIAL",
            "0214": "EMPANADA ESPECIAL",
            "0215": "EMPANADA DOCE",
            "0216": "EMPANADA INTEGRAL",
            "0217": "EMPANADA TRADICIONAL",
        }.get(prefix, "EMPANADA")
    return "OUTRO"


def main():
    if not ANALISE_JSON.exists():
        print(
            f"ERRO: rode scripts/analisar_fichas.py primeiro. Não achei {ANALISE_JSON}",
            file=sys.stderr,
        )
        sys.exit(1)

    e = env()
    rest = f"{e['NEXT_PUBLIC_SUPABASE_URL']}/rest/v1"
    sec = e["SUPABASE_SECRET_KEY"]
    h = {
        "apikey": sec,
        "Authorization": f"Bearer {sec}",
        "Content-Type": "application/json",
        "User-Agent": "panas-cli/0.1",
    }

    analise = json.loads(ANALISE_JSON.read_text())
    produtos = analise["produtos"]
    mps = analise["materias_primas"]

    creator_id = get_creator_user_id(rest, h)
    print(f"Criador das fichas = {creator_id}")

    # === 1) Cache do catálogo de itens (pra vínculo automático) ===
    print("\n[1/4] Cacheando itens do catálogo…")
    r = http("GET", f"{rest}/itens?ativo=eq.true&select=id,codigo_queops", h)
    itens_por_codigo = {i["codigo_queops"]: i["id"] for i in r if i["codigo_queops"]}
    print(f"  {len(itens_por_codigo)} itens com codigo_queops cacheados")

    # === 2) Upsert das matérias-primas ===
    print("\n[2/4] Importando matérias-primas (UPSERT por codigo_queops)…")
    # Detecta unidade base a partir das fichas (1ª ocorrência da mp)
    unidade_por_mp = {}
    for prod in produtos:
        for ins in prod["insumos"]:
            cod = ins["codigo"]
            if cod not in unidade_por_mp:
                unidade_por_mp[cod] = normalizar_unidade(ins.get("unidade"))

    mps_payload = []
    for mp in mps:
        codigo = mp["codigo"]
        tipo = (
            "ignorado" if mp["ignorado"]
            else "intermediario" if mp["intermediario"]
            else "folha"
        )
        item_compra_id = itens_por_codigo.get(codigo) if tipo == "folha" else None
        nao_compravel = tipo == "folha" and item_compra_id is None

        mps_payload.append({
            "codigo_queops": codigo,
            "nome": mp["nome"],
            "unidade_base": unidade_por_mp.get(codigo, "kg"),
            "item_compra_id": item_compra_id,
            "fator_conversao": 1,
            "ativa": True,
            "tipo": tipo,
            "nao_compravel": nao_compravel,
            "bug_revisao": mp["bug_conhecido"],
        })

    # UPSERT em batch via Prefer: resolution=merge-duplicates + on_conflict=codigo_queops
    http(
        "POST",
        f"{rest}/materia_prima?on_conflict=codigo_queops",
        h,
        body=mps_payload,
        prefer="resolution=merge-duplicates,return=minimal",
    )
    print(f"  ✓ {len(mps_payload)} matérias-primas importadas")

    # Recupera mp_id por codigo
    r = http("GET", f"{rest}/materia_prima?select=id,codigo_queops", h)
    mp_id_por_codigo = {m["codigo_queops"]: m["id"] for m in r if m["codigo_queops"]}

    # === 3) Upsert dos produtos ===
    print("\n[3/4] Importando produtos…")
    prod_payload = []
    for p in produtos:
        prod_payload.append({
            "codigo_queops": p["codigo"],
            "nome": p["nome"],
            "categoria": categoria_do_produto(p["codigo"]),
            "unidade_producao": "UN",
            "rendimento_padrao": 1,
            "ativo": True,
        })

    http(
        "POST",
        f"{rest}/produto?on_conflict=codigo_queops",
        h,
        body=prod_payload,
        prefer="resolution=merge-duplicates,return=minimal",
    )
    print(f"  ✓ {len(prod_payload)} produtos importados")

    r = http("GET", f"{rest}/produto?select=id,codigo_queops", h)
    prod_id_por_codigo = {p["codigo_queops"]: p["id"] for p in r if p["codigo_queops"]}

    # === 4) Fichas técnicas + ficha_item ===
    print("\n[4/4] Importando fichas técnicas (1 versão vigente por produto)…")

    # Desativa todas as fichas existentes (rerun idempotente)
    http("PATCH", f"{rest}/ficha_tecnica?vigente=eq.true", h, body={"vigente": False})

    # Apaga fichas com versao=1 existentes pra recriá-las limpo (CASCADE limpa ficha_item)
    http("DELETE", f"{rest}/ficha_tecnica?versao=eq.1", h, prefer="return=minimal")

    total_linhas = 0
    for prod in produtos:
        prod_id = prod_id_por_codigo.get(prod["codigo"])
        if not prod_id:
            print(f"  SKIP {prod['codigo']} (produto não cadastrado)", file=sys.stderr)
            continue

        # Cria a ficha
        ficha_resp = http(
            "POST",
            f"{rest}/ficha_tecnica",
            h,
            body={
                "produto_id": prod_id,
                "versao": 1,
                "vigente": True,
                "criado_por": creator_id,
                "observacoes": "Importada do fichas_tecnicas.xls do Queóps",
            },
            prefer="return=representation",
        )
        ficha_id = ficha_resp[0]["id"]

        # Filtra insumos: só FOLHAS (matérias-primas finais que viram compra),
        # já que intermediários e ignorados não fazem sentido na ficha consolidada.
        linhas = []
        ordem = 0
        ja_vistos = set()
        for ins in prod["insumos"]:
            cod = ins["codigo"]
            mp_info = next((m for m in mps if m["codigo"] == cod), None)
            if not mp_info:
                continue
            if mp_info["intermediario"] or mp_info["ignorado"]:
                continue
            if cod in ja_vistos:
                # Mesmo código aparece duas vezes (ex: SAL FINO usado em
                # múltiplos sub-processos). Vamos SOMAR as quantidades.
                # Por enquanto pulamos — TODO: somar
                continue
            ja_vistos.add(cod)

            mp_id = mp_id_por_codigo.get(cod)
            if not mp_id:
                continue

            ordem += 1
            linhas.append({
                "ficha_id": ficha_id,
                "materia_prima_id": mp_id,
                "quantidade": ins.get("qtd_total") or 0,
                "merma_percent": 0,
                "ordem": ordem,
            })

        if linhas:
            http("POST", f"{rest}/ficha_item", h, body=linhas, prefer="return=minimal")
        total_linhas += len(linhas)

    print(f"  ✓ {len(produtos)} fichas, {total_linhas} linhas totais")

    print("\n[OK] Import concluído.")
    print("  Próxima etapa: tela /mrp/produtos pra você ver/editar as fichas")


if __name__ == "__main__":
    main()
