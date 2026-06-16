import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function fmtBR(iso: string | null): string {
  if (!iso) return "—";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

const STATUS_INFO: Record<
  string,
  { label: string; cls: string }
> = {
  rascunho: { label: "Rascunho", cls: "bg-zinc-100 text-zinc-700 border-zinc-300" },
  calculada: { label: "Calculada", cls: "bg-blue-100 text-blue-900 border-blue-300" },
  convertida_em_solicitacao: {
    label: "Convertida",
    cls: "bg-emerald-100 text-emerald-900 border-emerald-300",
  },
};

export default async function ProjecoesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const statusFilter = typeof sp.status === "string" ? sp.status : "";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!["aprovador", "comprador"].includes(profile?.role ?? "")) redirect("/");

  let query = supabase
    .from("projecao_producao")
    .select(
      `
      id, semana_inicio, semana_fim, data_calculo, status,
      solicitacao_id, criado_em,
      criador:profiles!projecao_producao_criado_por_fkey(nome),
      demanda:projecao_demanda(quantidade),
      necessidades:projecao_necessidade(quantidade_a_comprar, item:itens(preco_referencia))
    `
    )
    .order("semana_inicio", { ascending: false })
    .order("criado_em", { ascending: false });

  if (statusFilter) query = query.eq("status", statusFilter);

  const { data: projecoes, error } = await query;

  type Necessidade = {
    quantidade_a_comprar: number;
    item: { preco_referencia: number | null } | null;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Histórico de projeções</h1>
          <p className="text-sm text-zinc-600">
            {projecoes?.length ?? 0} projeção(ões){statusFilter && ` com status "${STATUS_INFO[statusFilter]?.label ?? statusFilter}"`}
          </p>
        </div>
        <Link href="/mrp/nova-projecao">
          <Button>+ Nova projeção</Button>
        </Link>
      </div>

      <form className="flex flex-wrap items-end gap-2" method="get">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="status">
            Status
          </label>
          <Select id="status" name="status" defaultValue={statusFilter}>
            <option value="">Todos</option>
            <option value="rascunho">Rascunho</option>
            <option value="calculada">Calculada</option>
            <option value="convertida_em_solicitacao">Convertida em solicitação</option>
          </Select>
        </div>
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
                  <th className="px-3 py-2 font-medium">Semana</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Criada em</th>
                  <th className="px-3 py-2 font-medium">Por</th>
                  <th className="px-3 py-2 text-right font-medium">Produtos</th>
                  <th className="px-3 py-2 text-right font-medium">Itens a comprar</th>
                  <th className="px-3 py-2 text-right font-medium">Valor est.</th>
                  <th className="px-3 py-2 font-medium">Solicitação</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {(projecoes ?? []).map((p) => {
                  const status = STATUS_INFO[p.status] ?? {
                    label: p.status,
                    cls: "bg-zinc-100 text-zinc-700 border-zinc-300",
                  };
                  const numProdutos = p.demanda?.length ?? 0;
                  const necessidades = (p.necessidades ?? []) as unknown as Necessidade[];
                  const itensAComprar = necessidades.filter(
                    (n) => Number(n.quantidade_a_comprar) > 0
                  );
                  const valorEst = necessidades.reduce(
                    (s, n) =>
                      s +
                      (n.item?.preco_referencia
                        ? Number(n.item.preco_referencia) * Number(n.quantidade_a_comprar)
                        : 0),
                    0
                  );
                  return (
                    <tr key={p.id} className="border-b border-zinc-100 last:border-0">
                      <td className="px-3 py-2 font-medium">
                        {fmtBR(p.semana_inicio)} → {fmtBR(p.semana_fim)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-md border px-2 py-0.5 text-xs font-bold tracking-wide ${status.cls}`}
                        >
                          {status.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-zinc-600">
                        {fmtBR(p.criado_em?.slice(0, 10) ?? null)}
                      </td>
                      <td className="px-3 py-2 text-xs text-zinc-600">{p.criador?.nome ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{numProdutos}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {p.status === "rascunho" ? (
                          <span className="text-zinc-400">—</span>
                        ) : (
                          itensAComprar.length
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {p.status === "rascunho" ? (
                          <span className="text-zinc-400">—</span>
                        ) : (
                          `R$ ${valorEst.toLocaleString("pt-BR", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}`
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {p.solicitacao_id ? (
                          <Link
                            href={`/solicitacoes/${p.solicitacao_id}`}
                            className="text-xs text-zinc-700 underline-offset-4 hover:underline"
                          >
                            ver →
                          </Link>
                        ) : (
                          <span className="text-xs text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          href={`/mrp/nova-projecao/${p.id}`}
                          className="text-sm text-zinc-700 underline-offset-4 hover:underline"
                        >
                          Abrir
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {!projecoes?.length && (
                  <tr>
                    <td colSpan={9} className="px-3 py-6 text-center text-sm text-zinc-500">
                      Nenhuma projeção encontrada.{" "}
                      <Link
                        href="/mrp/nova-projecao"
                        className="text-zinc-900 underline-offset-4 hover:underline"
                      >
                        Criar a primeira →
                      </Link>
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
