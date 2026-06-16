import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function MateriasPrimasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const semCodigo = sp.sem_codigo === "1";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!["aprovador", "comprador"].includes(profile?.role ?? "")) redirect("/");

  // Itens usados em fichas + contagem de produtos onde aparecem
  const { data: fichaItens } = await supabase
    .from("ficha_item")
    .select(
      `
      item_id, quantidade,
      ficha:ficha_tecnica!inner(produto_id, vigente)
    `
    )
    .not("item_id", "is", null)
    .eq("ficha.vigente", true);

  // Agrupa: item_id → set de produtos
  const usoPorItem = new Map<string, { produtos: Set<string>; totalLinhas: number }>();
  for (const fi of fichaItens ?? []) {
    if (!fi.item_id) continue;
    const cur = usoPorItem.get(fi.item_id) ?? { produtos: new Set<string>(), totalLinhas: 0 };
    cur.produtos.add(fi.ficha.produto_id);
    cur.totalLinhas += 1;
    usoPorItem.set(fi.item_id, cur);
  }

  const itensIds = Array.from(usoPorItem.keys());

  if (itensIds.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Matérias-primas usadas em fichas</h1>
        </div>
        <Card>
          <CardContent className="py-6 text-center text-sm text-zinc-500">
            Nenhum item está sendo usado em fichas técnicas ainda.
          </CardContent>
        </Card>
      </div>
    );
  }

  let itensQuery = supabase
    .from("itens")
    .select(
      `
      id, codigo_queops, nome, ativo, preco_referencia,
      unidade:unidades_medida(nome),
      classificacao:classificacoes(nome)
    `
    )
    .in("id", itensIds)
    .order("nome");

  if (q) {
    const safe = q.replace(/[(),]/g, " ").trim();
    if (safe) itensQuery = itensQuery.or(`nome.ilike.%${safe}%,codigo_queops.ilike.%${safe}%`);
  }
  if (semCodigo) itensQuery = itensQuery.is("codigo_queops", null);

  const { data: itens } = await itensQuery;

  const totalSemCodigo = (itens ?? []).filter((i) => i.codigo_queops == null).length;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Matérias-primas usadas em fichas</h1>
        <p className="text-sm text-zinc-600">
          {usoPorItem.size} itens distintos aparecem nas {(itens?.length ?? 0)} fichas vigentes do MRP.
          Os mesmos itens do{" "}
          <Link href="/itens" className="text-zinc-900 underline-offset-4 hover:underline">
            cadastro de compras
          </Link>{" "}
          (não duplicamos).
        </p>
      </div>

      {totalSemCodigo > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          ⚠ {totalSemCodigo} {totalSemCodigo === 1 ? "item está" : "itens estão"} sem código Queóps. Click no item pra adicionar o código em{" "}
          <strong>/itens/[id]</strong> (a planilha do Queóps é a fonte da verdade).
        </div>
      )}

      <form className="flex flex-wrap items-end gap-2" method="get">
        <div className="flex flex-1 min-w-[200px] flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="q">
            Buscar
          </label>
          <Input id="q" name="q" defaultValue={q} placeholder="nome ou código Queóps" />
        </div>
        <label className="flex items-center gap-2 px-2 pb-2.5 text-sm">
          <input type="checkbox" name="sem_codigo" value="1" defaultChecked={semCodigo} />
          Apenas sem código Queóps
        </label>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
      </form>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Código Queóps</th>
                  <th className="px-3 py-2 font-medium">Nome</th>
                  <th className="px-3 py-2 font-medium">Unidade</th>
                  <th className="px-3 py-2 font-medium">Classificação</th>
                  <th className="px-3 py-2 text-right font-medium">Usado em</th>
                  <th className="px-3 py-2 text-right font-medium">Preço ref.</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {(itens ?? []).map((i) => {
                  const uso = usoPorItem.get(i.id);
                  const numProdutos = uso?.produtos.size ?? 0;
                  return (
                    <tr key={i.id} className="border-b border-zinc-100 last:border-0">
                      <td className="px-3 py-2 font-mono text-xs">
                        {i.codigo_queops ?? (
                          <span className="text-amber-600">— sem código —</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-medium">{i.nome}</td>
                      <td className="px-3 py-2 text-zinc-600">{i.unidade?.nome ?? "—"}</td>
                      <td className="px-3 py-2 text-zinc-600">{i.classificacao?.nome ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {numProdutos} {numProdutos === 1 ? "produto" : "produtos"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {i.preco_referencia
                          ? `R$ ${Number(i.preco_referencia).toFixed(2)}`
                          : "—"}
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
                          Editar item
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {!itens?.length && (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-sm text-zinc-500">
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
