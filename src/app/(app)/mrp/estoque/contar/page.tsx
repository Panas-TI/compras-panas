import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function fmtDataBR(iso: string | null): string {
  if (!iso) return "—";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

function diasDesde(iso: string): number {
  const planejada = new Date(iso + "T00:00:00");
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((hoje.getTime() - planejada.getTime()) / 86_400_000);
}

export default async function EstoqueMrpPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const semContagem = sp.sem_contagem === "1";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!["aprovador", "comprador"].includes(profile?.role ?? "")) redirect("/");

  // Última contagem finalizada (o estoquista faz semanalmente)
  const { data: ultimaContagem } = await supabase
    .from("contagens")
    .select("id, nome, data_contagem, finalizada_em, criado_por")
    .eq("finalizada", true)
    .order("data_contagem", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Itens distintos usados em qualquer ficha técnica vigente
  const { data: fichaItens } = await supabase
    .from("ficha_item")
    .select(`item_id, ficha:ficha_tecnica!inner(vigente)`)
    .not("item_id", "is", null)
    .eq("ficha.vigente", true);

  const itensIdsUsados = Array.from(
    new Set((fichaItens ?? []).map((r) => r.item_id).filter(Boolean) as string[])
  );

  // Estoque por item da última contagem
  const estoquePorItem = new Map<string, number>();
  if (ultimaContagem) {
    const { data: linhas } = await supabase
      .from("contagem_linhas")
      .select("item_id, quantidade")
      .eq("contagem_id", ultimaContagem.id)
      .not("item_id", "is", null);
    for (const l of linhas ?? []) {
      if (l.item_id && l.quantidade != null) {
        // Soma se aparecer mais de uma vez na mesma contagem
        estoquePorItem.set(
          l.item_id,
          (estoquePorItem.get(l.item_id) ?? 0) + Number(l.quantidade)
        );
      }
    }
  }

  // Pega info dos itens usados em fichas
  let itensQuery = supabase
    .from("itens")
    .select(
      `
      id, codigo_queops, nome, preco_referencia,
      unidade:unidades_medida(nome),
      classificacao:classificacoes(nome)
    `
    )
    .in("id", itensIdsUsados.length > 0 ? itensIdsUsados : ["00000000-0000-0000-0000-000000000000"])
    .order("nome");

  if (q) {
    const safe = q.replace(/[(),]/g, " ").trim();
    if (safe) itensQuery = itensQuery.or(`nome.ilike.%${safe}%,codigo_queops.ilike.%${safe}%`);
  }

  const { data: itens } = await itensQuery;

  let itensFiltrados = itens ?? [];
  if (semContagem) {
    itensFiltrados = itensFiltrados.filter((i) => !estoquePorItem.has(i.id));
  }

  const totalItens = itens?.length ?? 0;
  const semContagemCount = (itens ?? []).filter((i) => !estoquePorItem.has(i.id)).length;
  const idade = ultimaContagem ? diasDesde(ultimaContagem.data_contagem) : null;
  const tom =
    idade === null
      ? "text-zinc-500"
      : idade > 7
        ? "text-red-700"
        : idade > 3
          ? "text-amber-700"
          : "text-emerald-700";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Estoque atual das matérias-primas</h1>
        <p className="text-sm text-zinc-600">
          O MRP usa a <strong>contagem semanal</strong> que o estoquista já faz no{" "}
          <Link href="/contagem" className="text-zinc-900 underline-offset-4 hover:underline">
            módulo de Contagem
          </Link>
          . Não precisa contar de novo aqui — esta tela só mostra a foto atual.
        </p>
      </div>

      {/* Status da última contagem */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Última contagem finalizada
            {ultimaContagem && (
              <span className={`ml-2 text-sm font-normal ${tom}`}>
                {idade === 0 ? "(hoje)" : idade === 1 ? "(ontem)" : `(${idade} dias atrás)`}
              </span>
            )}
          </CardTitle>
          {ultimaContagem ? (
            <CardDescription>
              {fmtDataBR(ultimaContagem.data_contagem)} ·{" "}
              {ultimaContagem.nome ?? "(sem nome)"} · {estoquePorItem.size} itens contados
            </CardDescription>
          ) : (
            <CardDescription>Nenhuma contagem finalizada ainda.</CardDescription>
          )}
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link href="/contagem">
            <Button variant="outline">Ver área de Contagem (estoquista)</Button>
          </Link>
          {ultimaContagem && (
            <Link href={`/contagem/${ultimaContagem.id}`}>
              <Button variant="outline">Abrir esta contagem</Button>
            </Link>
          )}
        </CardContent>
      </Card>

      {/* Avisos */}
      {idade !== null && idade > 7 && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          ⚠ Última contagem com mais de 7 dias. O cálculo do MRP pode ficar bem desatualizado.
        </div>
      )}

      {totalItens > 0 && semContagemCount > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          ⚠ {semContagemCount} de {totalItens} itens usados em fichas{" "}
          <strong>não estão na última contagem</strong>. Eles serão tratados como estoque zero no
          cálculo, podendo gerar sobrecompra. Adicione esses itens ao{" "}
          <Link href="/itens/grupos" className="text-amber-950 underline-offset-4 hover:underline">
            grupo da contagem
          </Link>
          .
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
          <input
            type="checkbox"
            name="sem_contagem"
            value="1"
            defaultChecked={semContagem}
          />
          Só os sem contagem
        </label>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
      </form>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Código</th>
                  <th className="px-3 py-2 font-medium">Nome</th>
                  <th className="px-3 py-2 font-medium">Classificação</th>
                  <th className="px-3 py-2 text-right font-medium">Estoque atual</th>
                  <th className="px-3 py-2 font-medium">Unidade</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {itensFiltrados.map((i) => {
                  const qtd = estoquePorItem.get(i.id);
                  const semDados = qtd === undefined;
                  return (
                    <tr key={i.id} className="border-b border-zinc-100 last:border-0">
                      <td className="px-3 py-2 font-mono text-xs">
                        {i.codigo_queops ?? <span className="text-amber-600">— sem código —</span>}
                      </td>
                      <td className="px-3 py-2 font-medium">{i.nome}</td>
                      <td className="px-3 py-2 text-xs text-zinc-600">{i.classificacao?.nome ?? "—"}</td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${semDados ? "text-red-600" : qtd === 0 ? "text-amber-700" : ""}`}
                      >
                        {semDados ? "sem contagem" : qtd.toFixed(3).replace(/\.?0+$/, "")}
                      </td>
                      <td className="px-3 py-2 text-zinc-600">{i.unidade?.nome ?? "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          href={`/itens/${i.id}`}
                          className="text-xs text-zinc-700 underline-offset-4 hover:underline"
                        >
                          Ver item
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {!itensFiltrados.length && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-sm text-zinc-500">
                      Nenhum item.
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
