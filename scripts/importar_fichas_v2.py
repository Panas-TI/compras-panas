"""
Importador v2 — estrutura BOM multi-nível.

Estratégia:
- Produtos finais (021XXX): vão pra `produto` tipo='final'
- Intermediários (031XXX, 032XXX, 033XXX, 028XXX e qualquer outro que apareça
  como pai dentro de uma ficha): vão pra `produto` tipo='intermediario'
- Folhas (matérias-primas finais): vão pra `materia_prima` tipo='folha'
- Ignorados (610008 AGUA DMAE, 610009 MAO OBRA): em `materia_prima` tipo='ignorado'

Fichas técnicas:
- Pra cada produto FINAL: lista os intermediários + matérias-primas folhas que
  aparecem em NÍVEL 1 dentro da ficha do .xls. Quantidade = Qtd. Total (col K)
- Pra cada produto INTERMEDIÁRIO: lista seus componentes (filhos diretos).
  Quantidade = "Receita" (qtd por kg/L/un do intermediário, lida da col_nome+4).

Reconstruí a ficha do intermediário lendo qualquer ocorrência dele em qualquer
produto final. As quantidades dos componentes ficam IGUAIS pq são proporcionais
à matéria-prima base (1 kg de RECHEIO CARNE = 0.6911 kg de carne moída,
independente de qual empanada use o recheio).
"""
from __future__ import annotations
from pathlib import Path
import json
import sys
import urllib.error
import urllib.request

ROOT = Path(__file__).parent.parent
ANALISE_JSON = ROOT / "scripts" / "_fichas_analise.json"

# Prefixos que SEMPRE são intermediários
INTERMEDIARIO_PREFIXOS = ("028", "031", "032", "033")
# Códigos ignorados (mão de obra, água DMAE)
IGNORADOS = {"610008", "610009"}

# Embalagens são MP folha (não viram produto), mesmo prefixo
# (062 = embalagens) — não confunde com intermediário
EMBALAGEM_PREFIXOS = ("062",)


def env():
    e = {}
    for line in (ROOT / ".env.local").read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            e[k.strip()] = v.strip().strip('"').strip("'")
    return e


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


UNIDADE_MAP = {"KG": "kg", "L": "l", "UN": "un", "ML": "ml", "G": "g"}


def normalizar_unidade(u: str | None) -> str:
    if not u:
        return "kg"
    return UNIDADE_MAP.get(u.upper().strip(), u.lower().strip())


def eh_intermediario(codigo: str, codigos_que_tem_filhos: set) -> bool:
    """Decide se um código é intermediário (vira produto)."""
    if codigo in IGNORADOS:
        return False
    if codigo.startswith(EMBALAGEM_PREFIXOS):
        return False
    if codigo.startswith(INTERMEDIARIO_PREFIXOS):
        return True
    # Caso geral: se aparece como pai de alguém em alguma ficha, é intermediário
    return codigo in codigos_que_tem_filhos


def categoria_do_produto(codigo: str) -> str:
    if codigo.startswith("021"):
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
    if codigo.startswith("032"):
        return "RECHEIO"
    if codigo.startswith("033"):
        return "MASSA"
    if codigo.startswith("031") or codigo.startswith("028"):
        return "PREPARACAO"
    return "OUTRO"


def main():
    if not ANALISE_JSON.exists():
        print(f"ERRO: rode analisar_fichas.py primeiro.", file=sys.stderr)
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
    produtos_finais = analise["produtos"]  # 35 produtos finais

    # === Passo 1: descobrir relações pai → filho ===
    # Em cada ficha de produto final, percorre os insumos: pai é o último insumo
    # de nível menor que o atual. Se nivel = 1, pai = produto final em si (mas
    # pra fichas, pai_logico = produto_final). Se nivel = 2, pai = insumo nivel 1.
    print("[1/5] Mapeando hierarquia pai→filho…")
    # filhos[codigo_pai] = lista de {codigo, qtd_receita, unidade}
    # qtd_receita = quanto do filho cabe em 1 unidade do pai (col_nome+4 "Receita")
    filhos_por_pai: dict[str, list[dict]] = {}
    # Pra produtos finais: filhos diretos com Qtd. Total
    filhos_de_produto_final: dict[str, list[dict]] = {}

    # Mapa: codigo → unidade_base + nome
    info_codigo: dict[str, dict] = {}

    # Pra descobrir Receita do filho, preciso de col_nome+4 na linha original.
    # Vou re-ler o .xls aqui pra ter precisão. analise_fichas.py guarda só qtd_total.
    import xlrd
    book = xlrd.open_workbook(str(ROOT / "fichas_tecnicas.xls"))
    sheet = book.sheets()[0]

    import re
    RE_PRODUTO = re.compile(r"^(\d{6})\s*-\s*(.+)$")
    RE_INSUMO = re.compile(r"^(.+?)\s*\((\d{6})\)\s*$")

    def detectar_col_nome(header_row: int) -> int:
        for r in range(header_row, min(header_row + 6, sheet.nrows)):
            for c in range(sheet.ncols):
                val = str(sheet.cell_value(r, c)).strip().lower()
                if "item" in val and ("descrição" in val or "descricao" in val or
                                       "código" in val or "codigo" in val):
                    return c
        return 3

    def parse_num(v):
        if v is None or v == "":
            return None
        if isinstance(v, (int, float)):
            return float(v)
        s = str(v).strip().replace(".", "").replace(",", ".")
        try:
            return float(s)
        except ValueError:
            return None

    def deve_ignorar(cells):
        for c in cells:
            s = str(c).strip()
            if not s:
                continue
            if s == ".":
                return False
            lower = s.lower()
            HEADERS = ("sistema queops", "panas retaguarda", "data/hora",
                        "página", "relatório de ficha técnica", "resumo do rendimento")
            if any(h in lower for h in HEADERS):
                return True
            if lower == "f" or lower == "#" or lower.startswith("item ("):
                return True
            return False
        return True

    produto_atual = None
    col_nome = 3
    # Pilha de pais: indexada por nível (1, 2, 3). pilha[nivel] = (codigo, qtd_pai)
    pilha: dict[int, dict] = {}
    # As colunas onde aparecem `.` variam por produto (Queóps usa indentação
    # não-consecutiva pra col_nome maior). Mantém ordenado e mapeia col→nivel.
    cols_indent: list[int] = []

    for row in range(sheet.nrows):
        cells = [sheet.cell_value(row, c) for c in range(sheet.ncols)]
        col_a = str(cells[0]).strip() if cells else ""

        # Header de coluna pode aparecer no meio (quebra de página dentro do produto).
        # Re-detecta col_nome SEMPRE que vir "Item (descrição/código)" — porque o
        # Queóps muda a indentação após page break.
        linha_low = " ".join(str(c).strip().lower() for c in cells if c)
        if "item (descrição/código)" in linha_low or "item (descricao/codigo)" in linha_low:
            for c in range(sheet.ncols):
                v = str(cells[c]).strip().lower()
                if "item" in v and ("descrição" in v or "descricao" in v
                                      or "código" in v or "codigo" in v):
                    col_nome = c
                    break
            continue

        if deve_ignorar(cells):
            continue

        m_prod = RE_PRODUTO.match(col_a)
        if m_prod:
            cod = m_prod.group(1)
            produto_atual = cod
            col_nome = detectar_col_nome(row + 1)
            pilha = {}
            cols_indent = []
            continue

        if produto_atual is None:
            continue

        # Procura linha de insumo: TENTA col_nome E tb col_nome-1/-2 (caso page
        # break tenha mudado a indentação do relatório).
        insumo_match = None
        col_nome_efetivo = col_nome
        for cn_try in (col_nome, col_nome - 1, col_nome - 2):
            if cn_try < 1:
                continue
            if cn_try >= len(cells):
                continue
            s = str(cells[cn_try]).strip()
            m = RE_INSUMO.match(s)
            if m:
                insumo_match = m
                col_nome_efetivo = cn_try
                break
        if not insumo_match:
            continue

        # Posição do `.` antes da col do nome efetivo
        pos_indent = -1
        for i in range(min(col_nome_efetivo, len(cells))):
            if str(cells[i]).strip() == ".":
                pos_indent = i
                break
        if pos_indent == -1:
            continue
        # Mapeia col → nivel dinamicamente
        if pos_indent not in cols_indent:
            cols_indent.append(pos_indent)
            cols_indent.sort()
        nivel = cols_indent.index(pos_indent) + 1

        nome = insumo_match.group(1).strip()
        codigo = insumo_match.group(2)

        unidade = ""
        if len(cells) > col_nome_efetivo + 3:
            unidade = str(cells[col_nome_efetivo + 3]).strip()
        receita = parse_num(cells[col_nome_efetivo + 4]) if len(cells) > col_nome_efetivo + 4 else None
        qtd_total = parse_num(cells[col_nome_efetivo + 7]) if len(cells) > col_nome_efetivo + 7 else None

        # Registra info do código (nome+unidade)
        if codigo not in info_codigo or len(nome) > len(info_codigo[codigo]["nome"]):
            info_codigo[codigo] = {
                "nome": nome,
                "unidade": normalizar_unidade(unidade),
            }

        # Atualiza pilha
        pilha[nivel] = {"codigo": codigo, "qtd_total": qtd_total or 0}
        # Limpa níveis mais profundos (não são filhos desse novo item)
        for k in list(pilha.keys()):
            if k > nivel:
                del pilha[k]

        if nivel == 1:
            # Filho direto do produto final
            filhos_de_produto_final.setdefault(produto_atual, []).append({
                "codigo": codigo,
                "qtd_total": qtd_total or 0,
                "nivel": 1,
            })
        else:
            # Filho de um intermediário (nivel-1)
            pai = pilha.get(nivel - 1)
            if pai:
                pai_codigo = pai["codigo"]
                filhos_por_pai.setdefault(pai_codigo, []).append({
                    "codigo": codigo,
                    "receita": receita or 0,  # quanto cabe em 1 unidade do pai
                    "qtd_total_no_produto": qtd_total or 0,
                })

    print(f"  {len(filhos_de_produto_final)} produtos finais com filhos nivel 1")
    print(f"  {len(filhos_por_pai)} intermediários com filhos")

    codigos_que_tem_filhos = set(filhos_por_pai.keys())

    # === Passo 2: classificar todos os códigos ===
    print("\n[2/5] Classificando códigos…")
    todos_codigos = set(info_codigo.keys())
    finais = {p["codigo"] for p in produtos_finais}
    intermediarios = {c for c in todos_codigos
                       if c not in finais
                       and eh_intermediario(c, codigos_que_tem_filhos)}
    folhas = {c for c in todos_codigos
              if c not in finais and c not in intermediarios and c not in IGNORADOS}
    print(f"  finais: {len(finais)}, intermediários: {len(intermediarios)}, "
          f"folhas: {len(folhas)}, ignorados: {len(IGNORADOS & todos_codigos)}")

    # === Passo 3: cache itens de compra ===
    print("\n[3/5] Cacheando itens do catálogo…")
    r = http("GET", f"{rest}/itens?ativo=eq.true&select=id,codigo_queops", h)
    itens_por_codigo = {i["codigo_queops"]: i["id"] for i in r if i["codigo_queops"]}

    # === Passo 4: UPSERT mp (folhas + ignorados) e produto (finais + intermediários) ===
    print("\n[4/5] Inserindo materia_prima (folhas + ignorados)…")
    mps_payload = []
    for codigo in sorted(folhas | (IGNORADOS & todos_codigos)):
        info = info_codigo[codigo]
        tipo = "ignorado" if codigo in IGNORADOS else "folha"
        item_id = itens_por_codigo.get(codigo) if tipo == "folha" else None
        nao_compravel = tipo == "folha" and item_id is None
        mps_payload.append({
            "codigo_queops": codigo,
            "nome": info["nome"],
            "unidade_base": info["unidade"],
            "item_compra_id": item_id,
            "fator_conversao": 1,
            "ativa": True,
            "tipo": tipo,
            "nao_compravel": nao_compravel,
            "bug_revisao": False,
        })
    http("POST", f"{rest}/materia_prima", h, body=mps_payload, prefer="return=minimal")
    print(f"  ✓ {len(mps_payload)} matérias-primas")

    print("\n  Inserindo produtos (finais + intermediários)…")
    prod_payload = []
    # Finais primeiro (info vem do header, não dos insumos)
    nome_por_codigo = {p["codigo"]: p["nome"] for p in produtos_finais}
    for codigo in sorted(finais):
        prod_payload.append({
            "codigo_queops": codigo,
            "nome": nome_por_codigo.get(codigo, codigo),
            "categoria": categoria_do_produto(codigo),
            "unidade_producao": "UN",
            "rendimento_padrao": 1,
            "ativo": True,
            "tipo": "final",
        })
    # Intermediários
    for codigo in sorted(intermediarios):
        info = info_codigo[codigo]
        prod_payload.append({
            "codigo_queops": codigo,
            "nome": info["nome"],
            "categoria": categoria_do_produto(codigo),
            "unidade_producao": info["unidade"].upper(),
            "rendimento_padrao": 1,
            "ativo": True,
            "tipo": "intermediario",
        })
    http("POST", f"{rest}/produto", h, body=prod_payload, prefer="return=minimal")
    print(f"  ✓ {len(prod_payload)} produtos ({len(finais)} finais + {len(intermediarios)} intermediários)")

    # Recupera ids
    r = http("GET", f"{rest}/produto?select=id,codigo_queops,tipo", h)
    prod_id = {p["codigo_queops"]: p["id"] for p in r}
    r = http("GET", f"{rest}/materia_prima?select=id,codigo_queops", h)
    mp_id = {m["codigo_queops"]: m["id"] for m in r}

    # Aprovador como criador
    r = http("GET", f"{rest}/profiles?role=eq.aprovador&ativo=eq.true&select=id&limit=1", h)
    creator_id = r[0]["id"] if r else None

    # === Passo 5: criar fichas técnicas ===
    print("\n[5/5] Criando fichas técnicas…")
    total_linhas = 0
    total_fichas = 0

    def criar_ficha(produto_codigo: str, linhas_def: list[dict]):
        """linhas_def: [{codigo, quantidade, é_intermediario}]"""
        nonlocal total_linhas, total_fichas
        prod_uuid = prod_id.get(produto_codigo)
        if not prod_uuid:
            return
        ficha = http("POST", f"{rest}/ficha_tecnica", h, body={
            "produto_id": prod_uuid,
            "versao": 1,
            "vigente": True,
            "criado_por": creator_id,
            "observacoes": "Importada do fichas_tecnicas.xls (BOM multi-nível)",
        }, prefer="return=representation")
        ficha_uuid = ficha[0]["id"]
        total_fichas += 1

        linhas = []
        ordem = 0
        ja = set()
        for ld in linhas_def:
            cod = ld["codigo"]
            if cod in ja:
                continue
            ja.add(cod)
            ordem += 1
            linha = {
                "ficha_id": ficha_uuid,
                "quantidade": ld["quantidade"],
                "merma_percent": 0,
                "ordem": ordem,
            }
            if ld["e_intermediario"]:
                # Aponta pra produto intermediário
                ref_id = prod_id.get(cod)
                if not ref_id:
                    continue
                linha["produto_referenciado_id"] = ref_id
                linha["materia_prima_id"] = None
            else:
                ref_id = mp_id.get(cod)
                if not ref_id:
                    continue
                linha["materia_prima_id"] = ref_id
                linha["produto_referenciado_id"] = None
            linhas.append(linha)

        if linhas:
            http("POST", f"{rest}/ficha_item", h, body=linhas, prefer="return=minimal")
            total_linhas += len(linhas)

    # Fichas dos produtos finais: nível 1 do .xls
    for codigo_final in sorted(finais):
        linhas_def = []
        for filho in filhos_de_produto_final.get(codigo_final, []):
            cod = filho["codigo"]
            if cod in IGNORADOS:
                continue
            e_inter = cod in intermediarios
            linhas_def.append({
                "codigo": cod,
                "quantidade": filho["qtd_total"],
                "e_intermediario": e_inter,
            })
        criar_ficha(codigo_final, linhas_def)

    # Fichas dos produtos intermediários: filhos (qtd = receita por unidade do intermediário)
    for codigo_inter in sorted(intermediarios):
        linhas_def = []
        for filho in filhos_por_pai.get(codigo_inter, []):
            cod = filho["codigo"]
            if cod in IGNORADOS:
                continue
            e_inter = cod in intermediarios
            linhas_def.append({
                "codigo": cod,
                "quantidade": filho["receita"],
                "e_intermediario": e_inter,
            })
        criar_ficha(codigo_inter, linhas_def)

    print(f"  ✓ {total_fichas} fichas, {total_linhas} linhas")

    print("\n[OK] Import v2 (BOM multi-nível) concluído.")


if __name__ == "__main__":
    main()
