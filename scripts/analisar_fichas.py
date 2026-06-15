"""
Analisador do export de fichas técnicas do Queóps (.xls antigo).

Parseia o arquivo e reporta:
- Produtos detectados (header padrão "021101 - 02. CARNE")
- Matérias-primas únicas (folhas da árvore)
- Vínculo automático com itens já cadastrados (via codigo_queops)
- Bugs conhecidos (032023, 054012, 058012)
- Hierarquia preservada pra análise

NÃO modifica o banco. Só análise. Migrations só são aplicadas após confirmação do usuário.
"""
from __future__ import annotations
from pathlib import Path
import json
import re
import sys
import urllib.request

import xlrd

ROOT = Path(__file__).parent.parent
XLS_PATH = ROOT / "fichas_tecnicas.xls"


# ---------- Regex ----------
# Header de produto: na coluna A, formato "021101 - 02. CARNE"
RE_PRODUTO = re.compile(r"^(\d{6})\s*-\s*(.+)$")
# Linha de insumo: "NOME (CODIGO)" — o código é 6 dígitos
RE_INSUMO = re.compile(r"^(.+?)\s*\((\d{6})\)\s*$")
# Cabeçalhos do relatório a ignorar
HEADERS_IGNORAR = {
    "sistema queops", "panas retaguarda", "data/hora", "página",
    "relatório de ficha técnica", "resumo do rendimento",
}

# Códigos a IGNORAR sempre (mão de obra, água DMAE)
CODIGOS_IGNORADOS = {"610009", "610008"}

# Bugs conhecidos
BUGS_CONHECIDOS = {"032023", "054012", "058012"}


def parse_num_br(v) -> float | None:
    """Converte número estilo BR ('0,0450') ou float Excel pra float Python."""
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def deve_ignorar_linha(cells: list) -> bool:
    """
    Ignora cabeçalhos repetidos do relatório (mesmo padrão repetido por página).
    Olha a primeira célula com conteúdo, não a col A — porque linhas de nível 2+
    têm a col A vazia mas são válidas.
    """
    for c in cells:
        s = str(c).strip()
        if not s:
            continue
        if s == ".":
            # Linhas de insumo começam com `.` na col 0 ou outra — não ignorar
            return False
        lower = s.lower()
        # Se a primeira coisa que aparece é um header conhecido → ignora
        if any(h in lower for h in HEADERS_IGNORAR):
            return True
        # Linha "F" sozinha (separador)
        if lower == "f":
            return True
        # Linha de cabeçalho de colunas '#  | ... | Item | ... | Receita | Fator...'
        if lower == "#" or lower.startswith("item ("):
            return True
        return False
    return True  # linha totalmente vazia


def nivel_da_linha(cells: list, col_nome: int) -> int:
    """
    Detecta nível hierárquico pela posição do '.' nas colunas ANTES da
    coluna do nome do item. A coluna do nome varia entre produtos no relatório
    do Queóps (021101 usa col D, 021104 usa col E etc).
    Retorna 0 se não achar '.' (linha não é insumo).
    """
    for i in range(min(col_nome, len(cells))):
        if str(cells[i]).strip() == ".":
            return i + 1
    return 0


def detectar_coluna_nome(sheet, header_row: int, max_lookahead: int = 6) -> int:
    """
    Cada produto tem uma linha de cabeçalho '# | ... | Item (descrição/código) | ...'.
    Procura essa linha nas próximas N linhas e retorna a coluna do 'Item'.
    Default: 3 (col D) se não achar.
    """
    for r in range(header_row, min(header_row + max_lookahead, sheet.nrows)):
        for c in range(sheet.ncols):
            val = str(sheet.cell_value(r, c)).strip().lower()
            if "item" in val and ("descrição" in val or "descricao" in val or "código" in val or "codigo" in val):
                return c
    return 3


def main():
    if not XLS_PATH.exists():
        print(f"ERRO: arquivo não encontrado: {XLS_PATH}", file=sys.stderr)
        sys.exit(1)

    print(f"Lendo {XLS_PATH.name}…")
    book = xlrd.open_workbook(str(XLS_PATH))
    print(f"  Abas: {[s.name for s in book.sheets()]}")

    produtos: list[dict] = []
    todas_mps: dict[str, dict] = {}  # codigo_queops → {nome, ocorrencias, niveis}

    for sheet in book.sheets():
        print(f"  Aba '{sheet.name}': {sheet.nrows} linhas × {sheet.ncols} cols")
        produto_atual: dict | None = None

        for row_idx in range(sheet.nrows):
            cells = [sheet.cell_value(row_idx, c) for c in range(sheet.ncols)]
            col_a = str(cells[0]).strip() if cells else ""

            # Header de coluna pode reaparecer no meio do produto (quebra de
            # página) com col_nome diferente. Re-detecta sempre que vir.
            linha_low = " ".join(str(c).strip().lower() for c in cells if c)
            if produto_atual is not None and (
                "item (descrição/código)" in linha_low
                or "item (descricao/codigo)" in linha_low
            ):
                for c in range(sheet.ncols):
                    v = str(cells[c]).strip().lower()
                    if "item" in v and (
                        "descrição" in v or "descricao" in v
                        or "código" in v or "codigo" in v
                    ):
                        produto_atual["col_nome"] = c
                        break
                continue

            # Ignora cabeçalho repetido / linhas vazias
            if deve_ignorar_linha(cells):
                continue

            # 1) Header de produto? Tá sempre na col A
            m_prod = RE_PRODUTO.match(col_a)
            if m_prod:
                codigo, nome = m_prod.group(1), m_prod.group(2).strip()
                col_nome = detectar_coluna_nome(sheet, row_idx + 1)
                produto_atual = {
                    "codigo": codigo,
                    "nome": nome,
                    "insumos": [],
                    "linha_inicio": row_idx + 1,
                    "col_nome": col_nome,
                }
                produtos.append(produto_atual)
                continue

            if produto_atual is None:
                continue

            # 2) Linha de insumo? Detecta `.` ANTES da coluna do nome
            col_nome = produto_atual["col_nome"]
            nivel = nivel_da_linha(cells, col_nome)
            if nivel == 0:
                continue

            # Nome+(código) na col_nome detectada
            insumo_str = str(cells[col_nome]).strip() if len(cells) > col_nome else ""
            m_ins = RE_INSUMO.match(insumo_str)
            if not m_ins:
                continue
            insumo_nome = m_ins.group(1).strip()
            insumo_codigo = m_ins.group(2)

            # Posições fixas após col_nome:
            #   col_nome+3 = unidade (KG, L, UN, mL)
            #   col_nome+4 = Receita
            #   col_nome+5 = Fator
            #   col_nome+6 = Quant.
            #   col_nome+7 = Qtd. Total ← ESSA é a quantidade real por unid produto
            #   col_nome+8 = Custo
            #   col_nome+9 = Vlr.Unit. (R$/un)
            # Pega exatamente da col certa em vez de heurística "Nº número > 0"
            # (que pegava errado quando Qtd. Total = 0,0000 e o parser pulava zeros)
            unidade = str(cells[col_nome + 3]).strip() if len(cells) > col_nome + 3 else ""
            qtd_total = parse_num_br(cells[col_nome + 7]) if len(cells) > col_nome + 7 else None
            # Se vier None mas tem Quant., usa Quant. como fallback
            if qtd_total is None and len(cells) > col_nome + 6:
                qtd_total = parse_num_br(cells[col_nome + 6])
            if qtd_total is None:
                qtd_total = 0

            insumo = {
                "codigo": insumo_codigo,
                "nome": insumo_nome,
                "nivel": nivel,
                "unidade": unidade,
                "qtd_total": qtd_total,
                "linha": row_idx + 1,
            }
            produto_atual["insumos"].append(insumo)

            # Registra na lista única
            if insumo_codigo not in todas_mps:
                todas_mps[insumo_codigo] = {
                    "nome": insumo_nome,
                    "ocorrencias": 0,
                    "produtos_usados": set(),
                    "niveis": set(),
                }
            mp = todas_mps[insumo_codigo]
            mp["ocorrencias"] += 1
            mp["produtos_usados"].add(produto_atual["codigo"])
            mp["niveis"].add(nivel)
            # Mantém o nome mais "longo" (caso tenha truncado em alguma ocorrência)
            if len(insumo_nome) > len(mp["nome"]):
                mp["nome"] = insumo_nome

    # ---------- Achatar pra folhas (matérias-primas FINAIS) ----------
    # Folha = mp que NÃO aparece como produto-intermediário em nenhuma ficha.
    # Hierarquia: nível mais baixo da árvore.
    folhas: dict[str, dict] = {}
    intermediarios: set[str] = set()

    for p in produtos:
        # Reconstrói árvore pra detectar quais códigos são "pais" (intermediários)
        # Insumos no nivel N + 1 são FILHOS do último insumo no nivel N.
        ultimo_por_nivel: dict[int, dict] = {}
        for ins in p["insumos"]:
            nivel = ins["nivel"]
            ultimo_por_nivel[nivel] = ins
            # Se há filhos abaixo desse insumo, ele é intermediário
            # (mas a detecção é incremental; ver lógica abaixo)

        # Detecta intermediários: insumo é intermediário se há outro insumo
        # com nível > ele logo na sequência (antes de fechar)
        for i, ins in enumerate(p["insumos"]):
            for j in range(i + 1, len(p["insumos"])):
                prox = p["insumos"][j]
                if prox["nivel"] <= ins["nivel"]:
                    break
                if prox["nivel"] > ins["nivel"]:
                    intermediarios.add(ins["codigo"])
                    break

    # Folhas = mps que NÃO são intermediárias E NÃO são códigos ignorados
    for codigo, mp in todas_mps.items():
        if codigo in CODIGOS_IGNORADOS:
            continue
        if codigo in intermediarios:
            continue
        folhas[codigo] = mp

    # ---------- Cruzar com itens já cadastrados ----------
    print("\nBuscando itens cadastrados…")
    env = {}
    for line in (ROOT / ".env.local").read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")

    sec = env["SUPABASE_SECRET_KEY"]
    url = env["NEXT_PUBLIC_SUPABASE_URL"]
    h = {
        "apikey": sec,
        "Authorization": f"Bearer {sec}",
        "User-Agent": "panas-cli/0.1",
    }
    req = urllib.request.Request(
        f"{url}/rest/v1/itens?ativo=eq.true&select=id,nome,codigo_queops",
        headers=h,
    )
    itens = json.loads(urllib.request.urlopen(req, timeout=30).read())
    itens_por_codigo = {i["codigo_queops"]: i for i in itens if i["codigo_queops"]}
    print(f"  {len(itens)} itens ativos, {len(itens_por_codigo)} com codigo_queops")

    # Match das folhas com itens
    matches = 0
    sem_match = []
    bugs_encontrados = []
    for codigo, mp in sorted(folhas.items()):
        if codigo in BUGS_CONHECIDOS:
            bugs_encontrados.append((codigo, mp["nome"]))
        if codigo in itens_por_codigo:
            matches += 1
        else:
            sem_match.append((codigo, mp["nome"]))

    # ---------- Relatório ----------
    print("\n" + "=" * 70)
    print("RESUMO")
    print("=" * 70)
    print(f"\nProdutos detectados: {len(produtos)}")
    print(f"Matérias-primas únicas (incl. intermediários): {len(todas_mps)}")
    print(f"  Intermediários (recheios/massas — não viram compra): {len(intermediarios)}")
    print(f"  Códigos ignorados (mão de obra, água DMAE): {len(CODIGOS_IGNORADOS)}")
    print(f"  Folhas (matérias-primas FINAIS): {len(folhas)}")

    print(f"\nVínculo automático com /itens via codigo_queops:")
    print(f"  Com match: {matches}/{len(folhas)} ({matches * 100 / len(folhas):.1f}%)")
    print(f"  Sem match: {len(sem_match)}")

    print(f"\nBugs conhecidos do export:")
    for codigo, nome in bugs_encontrados:
        in_catalog = "✓ tem item" if codigo in itens_por_codigo else "✗ sem item"
        print(f"  {codigo}: nome '{nome}' [{in_catalog}]")
    bugs_nao_achados = BUGS_CONHECIDOS - {c for c, _ in bugs_encontrados}
    if bugs_nao_achados:
        print(f"  Não encontrados no arquivo: {sorted(bugs_nao_achados)}")

    print(f"\nProdutos detectados (primeiros 10 + último 5):")
    for p in produtos[:10]:
        print(f"  {p['codigo']} - {p['nome']:<40} ({len(p['insumos'])} linhas, "
              f"{len({i['codigo'] for i in p['insumos']})} mp únicas)")
    if len(produtos) > 15:
        print(f"  … ({len(produtos) - 15} produtos a mais)")
        for p in produtos[-5:]:
            print(f"  {p['codigo']} - {p['nome']:<40} ({len(p['insumos'])} linhas)")

    print(f"\nMatérias-primas SEM match em /itens ({len(sem_match)}):")
    for codigo, nome in sem_match[:30]:
        print(f"  {codigo}: {nome}")
    if len(sem_match) > 30:
        print(f"  … ({len(sem_match) - 30} a mais)")

    # Salva análise completa em JSON pra etapa seguinte
    saida = {
        "produtos": [
            {
                "codigo": p["codigo"],
                "nome": p["nome"],
                "insumos": p["insumos"],
            }
            for p in produtos
        ],
        "materias_primas": [
            {
                "codigo": c,
                "nome": mp["nome"],
                "ocorrencias": mp["ocorrencias"],
                "usado_em_produtos": sorted(mp["produtos_usados"]),
                "niveis": sorted(mp["niveis"]),
                "intermediario": c in intermediarios,
                "ignorado": c in CODIGOS_IGNORADOS,
                "bug_conhecido": c in BUGS_CONHECIDOS,
                "tem_item_compra": c in itens_por_codigo,
            }
            for c, mp in sorted(todas_mps.items())
        ],
    }
    out_path = ROOT / "scripts" / "_fichas_analise.json"
    out_path.write_text(json.dumps(saida, ensure_ascii=False, indent=2))
    print(f"\nAnálise completa salva em: {out_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
