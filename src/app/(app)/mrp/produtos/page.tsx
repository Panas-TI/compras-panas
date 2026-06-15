import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ProdutosPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const categoria = typeof sp.categoria === "string" ? sp.categoria : "";
  const incluirInativos = sp.inativos === "1";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!["aprovador", "comprador"].includes(profile?.role ?? "")) redirect("/");

  // Lista produtos com contagem de itens da ficha vigente
  let query = supabase
    .from("produto")
    .select(
      `
      id, codigo_queops, nome, categoria, unidade_producao, ativo,
      ficha:ficha_tecnica!ficha_tecnica_produto_id_fkey(
        id, versao, vigente, criado_em,
        itens:ficha_item(id)
      )
    `
    )
    .order("nome");

  if (!incluirInativos) query = query.eq("ativo", true);
  if (q) {
    const safe = q.replace(/[(),]/g, " ").trim();
    if (safe) query = query.or(`nome.ilike.%${safe}%,codigo_queops.ilike.%${safe}%`);
  }
  if (categoria) query = query.eq("categoria", categoria);

  const [{ data: produtos, error }, { data: categorias }] = await Promise.all([
    query,
    supabase.from("produto").select("categoria").eq("ativo", true),
  ]);

  const categoriasUnicas = Array.from(
    new Set((categorias ?? []).map((c) => c.categoria))
  ).sort();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Produtos & fichas técnicas</h1>
          <p className="text-sm text-zinc-600">
            {produtos?.length ?? 0} produtos. Click num produto pra ver/editar a ficha vigente.
          </p>
        </div>
        <Link href="/mrp/produtos/novo">
          <Button>+ Novo produto</Button>
        </Link>
      </div>

      <form className="flex flex-wrap items-end gap-2" method="get">
        <div className="flex flex-1 min-w-[200px] flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="q">
            Buscar
          </label>
          <Input id="q" name="q" defaultValue={q} placeholder="nome ou código Queóps" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="categoria">
            Categoria
          </label>
          <Select id="categoria" name="categoria" defaultValue={categoria}>
            <option value="">Todas</option>
            {categoriasUnicas.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
        <label className="flex items-center gap-2 px-2 pb-2.5 text-sm">
          <input type="checkbox" name="inativos" value="1" defaultChecked={incluirInativos} />
          Incluir inativos
        </label>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
      </form>

      {error && <p className="text-sm text-red-600">Erro: {error.message}</p>}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Código</th>
                  <th className="px-3 py-2 font-medium">Nome</th>
                  <th className="px-3 py-2 font-medium">Categoria</th>
                  <th className="px-3 py-2 font-medium">Unid.</th>
                  <th className="px-3 py-2 text-right font-medium">Versão</th>
                  <th className="px-3 py-2 text-right font-medium">Linhas ficha</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {(produtos ?? []).map((p) => {
                  const vigente = (p.ficha ?? []).find((f) => f.vigente);
                  const numLinhas = vigente?.itens?.length ?? 0;
                  return (
                    <tr key={p.id} className="border-b border-zinc-100 last:border-0">
                      <td className="px-3 py-2 font-mono text-xs">
                        {p.codigo_queops ?? <span className="text-amber-600">— sem código —</span>}
                      </td>
                      <td className="px-3 py-2 font-medium">{p.nome}</td>
                      <td className="px-3 py-2 text-xs text-zinc-600">{p.categoria}</td>
                      <td className="px-3 py-2 text-zinc-600">{p.unidade_producao}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {vigente ? `v${vigente.versao}` : <span className="text-zinc-400">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {numLinhas > 0 ? (
                          numLinhas
                        ) : (
                          <span className="text-amber-600">{numLinhas}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {p.ativo ? (
                          <span className="text-xs text-emerald-700">ativo</span>
                        ) : (
                          <span className="text-xs text-zinc-500">inativo</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          href={`/mrp/produtos/${p.id}`}
                          className="text-sm text-zinc-700 underline-offset-4 hover:underline"
                        >
                          Editar
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {!produtos?.length && (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-sm text-zinc-500">
                      Nenhum produto encontrado.
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
