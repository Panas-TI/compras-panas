import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrencyBRL } from "@/lib/utils";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const TIPOS_USO = {
  todos: { label: "Todos os itens", emoji: "📋" },
  materia_prima: { label: "Matérias-primas (usadas em ficha)", emoji: "🌾" },
  outros: { label: "Outros (não usados em ficha)", emoji: "📦" },
} as const;

type TipoUso = keyof typeof TIPOS_USO;

export default async function ItensPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const classifId = typeof sp.classif === "string" ? sp.classif : "";
  const semCodigo = sp.sem_codigo === "1";
  const incluirInativos = sp.inativos === "1";
  const usadoContagem = sp.contagem === "1";
  const tipoUso = (typeof sp.tipo_uso === "string" && sp.tipo_uso in TIPOS_USO
    ? sp.tipo_uso
    : "todos") as TipoUso;

  const supabase = await createClient();

  // === Atalhos pro hub: contagens das 4 categorias ===
  const [
    { count: produtosFinaisCount },
    { count: intermediariosCount },
    { data: fichaItensIdsRaw },
    { count: totalItensAtivos },
  ] = await Promise.all([
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
    supabase
      .from("ficha_item")
      .select("item_id")
      .not("item_id", "is", null),
    supabase.from("itens").select("*", { count: "exact", head: true }).eq("ativo", true),
  ]);

  const itensUsadosEmFicha = new Set(
    (fichaItensIdsRaw ?? []).map((r) => r.item_id).filter(Boolean) as string[]
  );
  const materiasPrimasCount = itensUsadosEmFicha.size;
  const outrosCount = Math.max(0, (totalItensAtivos ?? 0) - materiasPrimasCount);

  // === Query principal ===
  let query = supabase
    .from("itens")
    .select(
      `
      id, nome, codigo_queops, preco_referencia, ativo, prazo_padrao,
      classificacao:classificacoes(nome),
      unidade:unidades_medida(nome),
      fornecedor:fornecedores!itens_fornecedor_padrao_id_fkey(nome),
      forma_pagto:formas_pagamento!itens_forma_pagto_padrao_id_fkey(nome)
    `
    )
    .order("nome");

  if (!incluirInativos) query = query.eq("ativo", true);
  if (q) {
    const safe = q.replace(/[(),]/g, " ").trim();
    if (safe) {
      query = query.or(`nome.ilike.%${safe}%,codigo_queops.ilike.%${safe}%`);
    }
  }
  if (classifId) query = query.eq("classificacao_id", classifId);
  if (semCodigo) query = query.is("codigo_queops", null);

  // Filtro: usados em contagem
  if (usadoContagem) {
    const { data: linkedIds } = await supabase
      .from("template_itens")
      .select("item_id")
      .not("item_id", "is", null);
    const ids = Array.from(new Set((linkedIds ?? []).map((r) => r.item_id))).filter(Boolean) as string[];
    if (ids.length === 0) {
      query = query.eq("id", "00000000-0000-0000-0000-000000000000");
    } else {
      query = query.in("id", ids);
    }
  }

  // Filtro: tipo de uso (matéria-prima / outros)
  if (tipoUso === "materia_prima") {
    const ids = Array.from(itensUsadosEmFicha);
    if (ids.length === 0) {
      query = query.eq("id", "00000000-0000-0000-0000-000000000000");
    } else {
      query = query.in("id", ids);
    }
  } else if (tipoUso === "outros") {
    const ids = Array.from(itensUsadosEmFicha);
    if (ids.length > 0) {
      query = query.not("id", "in", `(${ids.map((id) => `"${id}"`).join(",")})`);
    }
  }

  const [{ data: itens, error }, { data: classificacoes }] = await Promise.all([
    query,
    supabase.from("classificacoes").select("id, nome").eq("ativo", true).order("nome"),
  ]);

  // Contagem de uso em fichas por item (pra badge)
  const usosPorItem = new Map<string, number>();
  for (const r of fichaItensIdsRaw ?? []) {
    if (r.item_id) {
      usosPorItem.set(r.item_id, (usosPorItem.get(r.item_id) ?? 0) + 1);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Catálogo de itens</h1>
          <p className="text-sm text-zinc-600">
            Itens que você <strong>compra</strong>. Produtos que você{" "}
            <strong>fabrica</strong> (empanadas, recheios, massas) ficam em{" "}
            <Link href="/mrp/produtos" className="text-zinc-900 underline-offset-4 hover:underline">
              /mrp/produtos
            </Link>
            .
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

      {/* === Atalhos pelas 4 camadas === */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Link href="/mrp/produtos?tipo=final" className="group">
          <Card className="h-full transition-shadow group-hover:shadow-md">
            <CardHeader>
              <div className="mb-1 text-2xl">🥟</div>
              <CardDescription className="text-xs">Produtos finais</CardDescription>
              <CardTitle className="text-2xl">{produtosFinaisCount ?? 0}</CardTitle>
              <p className="text-[10px] text-zinc-500">(empanadas — fabricadas)</p>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/mrp/produtos?tipo=intermediario" className="group">
          <Card className="h-full transition-shadow group-hover:shadow-md">
            <CardHeader>
              <div className="mb-1 text-2xl">🧂</div>
              <CardDescription className="text-xs">Semi-acabados</CardDescription>
              <CardTitle className="text-2xl">{intermediariosCount ?? 0}</CardTitle>
              <p className="text-[10px] text-zinc-500">(recheios/massas — fabricados)</p>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/itens?tipo_uso=materia_prima" className="group">
          <Card
            className={`h-full transition-shadow group-hover:shadow-md ${
              tipoUso === "materia_prima" ? "border-blue-400 ring-2 ring-blue-200" : ""
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
        <Link href="/itens?tipo_uso=outros" className="group">
          <Card
            className={`h-full transition-shadow group-hover:shadow-md ${
              tipoUso === "outros" ? "border-blue-400 ring-2 ring-blue-200" : ""
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

      {/* === Filtro de tipo de uso (pode mudar sem refiltrar tudo) === */}
      <div className="flex flex-wrap gap-1.5">
        {(Object.entries(TIPOS_USO) as Array<[TipoUso, (typeof TIPOS_USO)[TipoUso]]>).map(
          ([key, info]) => {
            const params = new URLSearchParams();
            if (q) params.set("q", q);
            if (classifId) params.set("classif", classifId);
            if (semCodigo) params.set("sem_codigo", "1");
            if (incluirInativos) params.set("inativos", "1");
            if (usadoContagem) params.set("contagem", "1");
            if (key !== "todos") params.set("tipo_uso", key);
            const href = `/itens${params.toString() ? `?${params.toString()}` : ""}`;
            const ativo = tipoUso === key;
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

      {/* === Form de filtro detalhado === */}
      <form className="flex flex-wrap items-end gap-2" method="get">
        {tipoUso !== "todos" && <input type="hidden" name="tipo_uso" value={tipoUso} />}
        <div className="flex flex-1 min-w-[200px] flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="q">
            Buscar
          </label>
          <Input id="q" name="q" defaultValue={q} placeholder="nome ou código Queóps" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="classif">
            Classificação
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
        {itens?.length ?? 0} {tipoUso === "todos" ? "itens" : TIPOS_USO[tipoUso].label.toLowerCase()} encontrados.
      </p>

      {error && <p className="text-sm text-red-600">Erro: {error.message}</p>}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Código</th>
                  <th className="px-3 py-2 font-medium">Nome</th>
                  <th className="px-3 py-2 font-medium">Classificação</th>
                  <th className="px-3 py-2 font-medium">Unidade</th>
                  <th className="px-3 py-2 font-medium">Fornecedor padrão</th>
                  <th className="px-3 py-2 text-right font-medium">Preço ref.</th>
                  <th className="px-3 py-2 font-medium">Uso</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {(itens ?? []).map((i) => {
                  const usosFicha = usosPorItem.get(i.id) ?? 0;
                  return (
                    <tr key={i.id} className="border-b border-zinc-100 last:border-0">
                      <td className="px-3 py-2 font-mono text-xs">
                        {i.codigo_queops ?? <span className="text-amber-600">— sem código —</span>}
                      </td>
                      <td className="px-3 py-2">{i.nome}</td>
                      <td className="px-3 py-2 text-xs text-zinc-600">{i.classificacao?.nome ?? "—"}</td>
                      <td className="px-3 py-2 text-zinc-600">{i.unidade?.nome ?? "—"}</td>
                      <td className="px-3 py-2 text-zinc-600">{i.fornecedor?.nome ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatCurrencyBRL(i.preco_referencia ?? null)}
                      </td>
                      <td className="px-3 py-2">
                        {usosFicha > 0 ? (
                          <span
                            className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-900"
                            title={`Usado em ${usosFicha} ficha(s) técnica(s)`}
                          >
                            🍳 {usosFicha}{" "}
                            {usosFicha === 1 ? "ficha" : "fichas"}
                          </span>
                        ) : (
                          <span className="text-[10px] text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {i.ativo ? (
                          <span className="text-xs text-emerald-700">ativo</span>
                        ) : (
                          <span className="text-xs text-zinc-500">inativo</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          href={`/itens/${i.id}`}
                          className="text-sm text-zinc-700 underline-offset-4 hover:underline"
                        >
                          Editar
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {!itens?.length && (
                  <tr>
                    <td colSpan={9} className="px-3 py-6 text-center text-sm text-zinc-500">
                      Nenhum item encontrado com esse filtro.
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
