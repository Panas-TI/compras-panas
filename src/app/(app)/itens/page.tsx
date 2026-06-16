import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrencyBRL } from "@/lib/utils";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const TIPOS = {
  todos: { label: "Todos", emoji: "📋" },
  final: { label: "Produtos finais (fabricados)", emoji: "🥟" },
  semi: { label: "Semi-acabados (fabricados)", emoji: "🧂" },
  materia_prima: { label: "Matérias-primas (compra usada em ficha)", emoji: "🌾" },
  outros: { label: "Outros itens (compra sem ficha)", emoji: "📦" },
} as const;

type TipoFiltro = keyof typeof TIPOS;

type LinhaUnificada = {
  kind: "produto" | "item";
  id: string;
  codigo: string | null;
  nome: string;
  ativo: boolean;
  classifOuCategoria: string | null;
  unidade: string | null;
  fornecedor: string | null;
  preco: number | null;
  usosFicha: number; // pra itens
  href: string;
  tipoBadge: { label: string; cls: string; emoji: string };
};

export default async function ItensPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const classifId = typeof sp.classif === "string" ? sp.classif : "";
  const semCodigo = sp.sem_codigo === "1";
  const incluirInativos = sp.inativos === "1";
  const usadoContagem = sp.contagem === "1";
  const tipo = (typeof sp.tipo === "string" && sp.tipo in TIPOS ? sp.tipo : "todos") as TipoFiltro;

  const supabase = await createClient();

  // Itens usados em fichas (pra filtro de matéria-prima e badge "uso")
  const { data: fichaItensIdsRaw } = await supabase
    .from("ficha_item")
    .select("item_id")
    .not("item_id", "is", null);
  const usosPorItem = new Map<string, number>();
  for (const r of fichaItensIdsRaw ?? []) {
    if (r.item_id) usosPorItem.set(r.item_id, (usosPorItem.get(r.item_id) ?? 0) + 1);
  }
  const itensUsadosIds = new Set(usosPorItem.keys());

  // === Decide se busca itens, produtos, ou ambos ===
  const buscaItens = tipo === "todos" || tipo === "materia_prima" || tipo === "outros";
  const buscaProdutosFinais = tipo === "todos" || tipo === "final";
  const buscaProdutosSemi = tipo === "todos" || tipo === "semi";

  // === Itens (catálogo de compras) ===
  let itensQuery = supabase
    .from("itens")
    .select(
      `
      id, nome, codigo_queops, preco_referencia, ativo,
      classificacao:classificacoes(nome),
      unidade:unidades_medida(nome),
      fornecedor:fornecedores!itens_fornecedor_padrao_id_fkey(nome)
    `
    )
    .order("nome");

  if (!incluirInativos) itensQuery = itensQuery.eq("ativo", true);
  if (q) {
    const safe = q.replace(/[(),]/g, " ").trim();
    if (safe) itensQuery = itensQuery.or(`nome.ilike.%${safe}%,codigo_queops.ilike.%${safe}%`);
  }
  if (classifId) itensQuery = itensQuery.eq("classificacao_id", classifId);
  if (semCodigo) itensQuery = itensQuery.is("codigo_queops", null);
  if (usadoContagem) {
    const { data: linkedIds } = await supabase
      .from("template_itens")
      .select("item_id")
      .not("item_id", "is", null);
    const ids = Array.from(new Set((linkedIds ?? []).map((r) => r.item_id))).filter(Boolean) as string[];
    if (ids.length === 0) {
      itensQuery = itensQuery.eq("id", "00000000-0000-0000-0000-000000000000");
    } else {
      itensQuery = itensQuery.in("id", ids);
    }
  }

  // === Produtos (MRP — empanadas + intermediários) ===
  let produtosQuery = supabase
    .from("produto")
    .select("id, codigo_queops, nome, categoria, tipo, unidade_producao, ativo")
    .order("nome");
  if (!incluirInativos) produtosQuery = produtosQuery.eq("ativo", true);
  if (q) {
    const safe = q.replace(/[(),]/g, " ").trim();
    if (safe) produtosQuery = produtosQuery.or(`nome.ilike.%${safe}%,codigo_queops.ilike.%${safe}%`);
  }
  if (semCodigo) produtosQuery = produtosQuery.is("codigo_queops", null);

  // Carrega de acordo com o filtro
  const [
    itensRes,
    produtosRes,
    { data: classificacoes },
    { count: produtosFinaisCount },
    { count: intermediariosCount },
    { count: totalItensAtivos },
  ] = await Promise.all([
    buscaItens ? itensQuery : Promise.resolve({ data: [], error: null }),
    buscaProdutosFinais || buscaProdutosSemi
      ? produtosQuery
      : Promise.resolve({ data: [], error: null }),
    supabase.from("classificacoes").select("id, nome").eq("ativo", true).order("nome"),
    supabase
      .from("produto")
      .select("*", { count: "exact", head: true })
      .eq("ativo", true)
      .eq("tipo", "final"),
    supabase
      .from("produto")
      .select("*", { count: "exact", head: true })
      .eq("ativo", true)
      .eq("tipo", "intermediario"),
    supabase.from("itens").select("*", { count: "exact", head: true }).eq("ativo", true),
  ]);

  type ItemRow = {
    id: string;
    nome: string;
    codigo_queops: string | null;
    preco_referencia: number | null;
    ativo: boolean;
    classificacao: { nome: string } | null;
    unidade: { nome: string } | null;
    fornecedor: { nome: string } | null;
  };
  type ProdutoRow = {
    id: string;
    codigo_queops: string | null;
    nome: string;
    categoria: string;
    tipo: string;
    unidade_producao: string;
    ativo: boolean;
  };

  const linhas: LinhaUnificada[] = [];

  // Adiciona ITENS (compra)
  for (const it of (itensRes.data ?? []) as ItemRow[]) {
    const usos = usosPorItem.get(it.id) ?? 0;
    const ehMateria = usos > 0;
    // Aplicar filtro tipo de uso
    if (tipo === "materia_prima" && !ehMateria) continue;
    if (tipo === "outros" && ehMateria) continue;
    linhas.push({
      kind: "item",
      id: it.id,
      codigo: it.codigo_queops,
      nome: it.nome,
      ativo: it.ativo,
      classifOuCategoria: it.classificacao?.nome ?? null,
      unidade: it.unidade?.nome ?? null,
      fornecedor: it.fornecedor?.nome ?? null,
      preco: it.preco_referencia,
      usosFicha: usos,
      href: `/itens/${it.id}`,
      tipoBadge: ehMateria
        ? { label: "Matéria-prima", emoji: "🌾", cls: "bg-amber-100 text-amber-900" }
        : { label: "Outro item", emoji: "📦", cls: "bg-zinc-200 text-zinc-700" },
    });
  }

  // Adiciona PRODUTOS (fabricação) — finais e/ou semi
  for (const p of (produtosRes.data ?? []) as ProdutoRow[]) {
    if (p.tipo === "final" && !buscaProdutosFinais) continue;
    if (p.tipo === "intermediario" && !buscaProdutosSemi) continue;
    linhas.push({
      kind: "produto",
      id: p.id,
      codigo: p.codigo_queops,
      nome: p.nome,
      ativo: p.ativo,
      classifOuCategoria: p.categoria,
      unidade: p.unidade_producao,
      fornecedor: null,
      preco: null,
      usosFicha: 0,
      href: `/mrp/produtos/${p.id}`,
      tipoBadge:
        p.tipo === "final"
          ? { label: "Produto final", emoji: "🥟", cls: "bg-purple-100 text-purple-900" }
          : { label: "Semi-acabado", emoji: "🧂", cls: "bg-fuchsia-100 text-fuchsia-900" },
    });
  }

  // Ordena pelo nome
  linhas.sort((a, b) => a.nome.localeCompare(b.nome));

  const materiasPrimasCount = itensUsadosIds.size;
  const outrosCount = Math.max(0, (totalItensAtivos ?? 0) - materiasPrimasCount);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Catálogo de itens</h1>
          <p className="text-sm text-zinc-600">
            Tudo num lugar só: o que você <strong>compra</strong> + o que você{" "}
            <strong>fabrica</strong>.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/itens/grupos"
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50"
          >
            Grupos de contagem
          </Link>
          <Link href="/itens/novo">
            <Button>Novo item</Button>
          </Link>
        </div>
      </div>

      {/* === Cards das 4 camadas (todos filtram nesta página) === */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Link href="/itens?tipo=final" className="group">
          <Card
            className={`h-full transition-shadow group-hover:shadow-md ${
              tipo === "final" ? "border-blue-400 ring-2 ring-blue-200" : ""
            }`}
          >
            <CardHeader>
              <div className="mb-1 text-2xl">🥟</div>
              <CardDescription className="text-xs">Produtos finais</CardDescription>
              <CardTitle className="text-2xl">{produtosFinaisCount ?? 0}</CardTitle>
              <p className="text-[10px] text-zinc-500">(fabricados)</p>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/itens?tipo=semi" className="group">
          <Card
            className={`h-full transition-shadow group-hover:shadow-md ${
              tipo === "semi" ? "border-blue-400 ring-2 ring-blue-200" : ""
            }`}
          >
            <CardHeader>
              <div className="mb-1 text-2xl">🧂</div>
              <CardDescription className="text-xs">Semi-acabados</CardDescription>
              <CardTitle className="text-2xl">{intermediariosCount ?? 0}</CardTitle>
              <p className="text-[10px] text-zinc-500">(fabricados)</p>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/itens?tipo=materia_prima" className="group">
          <Card
            className={`h-full transition-shadow group-hover:shadow-md ${
              tipo === "materia_prima" ? "border-blue-400 ring-2 ring-blue-200" : ""
            }`}
          >
            <CardHeader>
              <div className="mb-1 text-2xl">🌾</div>
              <CardDescription className="text-xs">Matérias-primas</CardDescription>
              <CardTitle className="text-2xl">{materiasPrimasCount}</CardTitle>
              <p className="text-[10px] text-zinc-500">(compradas, usadas em ficha)</p>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/itens?tipo=outros" className="group">
          <Card
            className={`h-full transition-shadow group-hover:shadow-md ${
              tipo === "outros" ? "border-blue-400 ring-2 ring-blue-200" : ""
            }`}
          >
            <CardHeader>
              <div className="mb-1 text-2xl">📦</div>
              <CardDescription className="text-xs">Outros itens</CardDescription>
              <CardTitle className="text-2xl">{outrosCount}</CardTitle>
              <p className="text-[10px] text-zinc-500">(comprados, sem ficha)</p>
            </CardHeader>
          </Card>
        </Link>
      </div>

      {/* === Tabs de filtro === */}
      <div className="flex flex-wrap gap-1.5">
        {(Object.entries(TIPOS) as Array<[TipoFiltro, (typeof TIPOS)[TipoFiltro]]>).map(
          ([key, info]) => {
            const params = new URLSearchParams();
            if (q) params.set("q", q);
            if (classifId) params.set("classif", classifId);
            if (semCodigo) params.set("sem_codigo", "1");
            if (incluirInativos) params.set("inativos", "1");
            if (usadoContagem) params.set("contagem", "1");
            if (key !== "todos") params.set("tipo", key);
            const href = `/itens${params.toString() ? `?${params.toString()}` : ""}`;
            const ativo = tipo === key;
            return (
              <Link
                key={key}
                href={href}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                  ativo
                    ? "border-blue-400 bg-blue-100 text-blue-900"
                    : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                {info.emoji} {info.label}
              </Link>
            );
          }
        )}
      </div>

      <form className="flex flex-wrap items-end gap-2" method="get">
        {tipo !== "todos" && <input type="hidden" name="tipo" value={tipo} />}
        <div className="flex flex-1 min-w-[200px] flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="q">
            Buscar
          </label>
          <Input id="q" name="q" defaultValue={q} placeholder="nome ou código Queóps" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="classif">
            Classificação (só itens de compra)
          </label>
          <Select id="classif" name="classif" defaultValue={classifId}>
            <option value="">Todas</option>
            {(classificacoes ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </div>
        <label className="flex items-center gap-2 px-2 pb-2.5 text-sm">
          <input type="checkbox" name="sem_codigo" value="1" defaultChecked={semCodigo} />
          Sem código Queóps
        </label>
        <label className="flex items-center gap-2 px-2 pb-2.5 text-sm">
          <input type="checkbox" name="contagem" value="1" defaultChecked={usadoContagem} />
          Usados em contagem
        </label>
        <label className="flex items-center gap-2 px-2 pb-2.5 text-sm">
          <input type="checkbox" name="inativos" value="1" defaultChecked={incluirInativos} />
          Incluir inativos
        </label>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
      </form>

      <p className="text-sm text-zinc-600">
        {linhas.length} {linhas.length === 1 ? "registro" : "registros"} —{" "}
        {TIPOS[tipo].emoji} {TIPOS[tipo].label.toLowerCase()}
      </p>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 font-medium">Código</th>
                  <th className="px-3 py-2 font-medium">Nome</th>
                  <th className="px-3 py-2 font-medium">Categoria / Classificação</th>
                  <th className="px-3 py-2 font-medium">Unidade</th>
                  <th className="px-3 py-2 font-medium">Fornecedor</th>
                  <th className="px-3 py-2 text-right font-medium">Preço ref.</th>
                  <th className="px-3 py-2 font-medium">Uso</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={`${l.kind}-${l.id}`} className="border-b border-zinc-100 last:border-0">
                    <td className="px-3 py-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${l.tipoBadge.cls}`}
                      >
                        {l.tipoBadge.emoji} {l.tipoBadge.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {l.codigo ?? <span className="text-amber-600">— sem código —</span>}
                    </td>
                    <td className="px-3 py-2 font-medium">{l.nome}</td>
                    <td className="px-3 py-2 text-xs text-zinc-600">
                      {l.classifOuCategoria ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600">{l.unidade ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-600">{l.fornecedor ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {l.preco != null ? formatCurrencyBRL(l.preco) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {l.kind === "item" && l.usosFicha > 0 ? (
                        <span
                          className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-900"
                          title={`Usado em ${l.usosFicha} ficha(s) técnica(s)`}
                        >
                          🍳 {l.usosFicha}
                        </span>
                      ) : (
                        <span className="text-[10px] text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {l.ativo ? (
                        <span className="text-xs text-emerald-700">ativo</span>
                      ) : (
                        <span className="text-xs text-zinc-500">inativo</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={l.href}
                        className="text-sm text-zinc-700 underline-offset-4 hover:underline"
                      >
                        Editar{l.kind === "produto" ? " (ficha)" : ""}
                      </Link>
                    </td>
                  </tr>
                ))}
                {!linhas.length && (
                  <tr>
                    <td colSpan={10} className="px-3 py-6 text-center text-sm text-zinc-500">
                      Nenhum registro encontrado com esse filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
