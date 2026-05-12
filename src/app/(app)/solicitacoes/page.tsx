import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrencyBRL, formatDateBR } from "@/lib/utils";

export default async function SolicitacoesPage() {
  const supabase = await createClient();

  const { data: solics } = await supabase
    .from("solicitacoes_semanais")
    .select(
      `
      id, data_inicio, data_fim, observacoes, finalizada, finalizada_em, enviada_em, criado_em,
      comprador:profiles!solicitacoes_semanais_comprador_id_fkey(nome)
    `
    )
    .order("data_inicio", { ascending: false });

  // Per-solicitation totals
  const ids = (solics ?? []).map((s) => s.id);
  let totalsBy = new Map<string, { linhas: number; valor: number }>();
  if (ids.length) {
    const { data: linhas } = await supabase
      .from("solicitacao_linhas")
      .select("solicitacao_id, valor")
      .in("solicitacao_id", ids);
    for (const l of linhas ?? []) {
      const cur = totalsBy.get(l.solicitacao_id) ?? { linhas: 0, valor: 0 };
      cur.linhas += 1;
      cur.valor += Number(l.valor ?? 0);
      totalsBy.set(l.solicitacao_id, cur);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Solicitações semanais</h1>
          <p className="text-sm text-zinc-600">{solics?.length ?? 0} solicitações.</p>
        </div>
        <Link href="/solicitacoes/nova">
          <Button>Nova solicitação</Button>
        </Link>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Período</th>
                  <th className="px-3 py-2 font-medium">Comprador</th>
                  <th className="px-3 py-2 font-medium">Linhas</th>
                  <th className="px-3 py-2 text-right font-medium">Valor total</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {(solics ?? []).map((s) => {
                  const totals = totalsBy.get(s.id) ?? { linhas: 0, valor: 0 };
                  const status = s.finalizada
                    ? "Finalizada"
                    : s.enviada_em
                      ? "Em aprovação"
                      : "Rascunho";
                  const statusClass =
                    status === "Finalizada"
                      ? "text-zinc-500"
                      : status === "Em aprovação"
                        ? "text-blue-700"
                        : "text-amber-700";
                  return (
                    <tr key={s.id} className="border-b border-zinc-100 last:border-0">
                      <td className="px-3 py-2 font-medium">
                        {formatDateBR(s.data_inicio)} a {formatDateBR(s.data_fim)}
                      </td>
                      <td className="px-3 py-2 text-zinc-600">{s.comprador?.nome ?? "—"}</td>
                      <td className="px-3 py-2 text-zinc-600">{totals.linhas}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCurrencyBRL(totals.valor)}</td>
                      <td className="px-3 py-2">
                        <span className={`text-xs ${statusClass}`}>{status}</span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link href={`/solicitacoes/${s.id}`} className="text-sm underline-offset-4 hover:underline">
                          Abrir
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {!solics?.length && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-zinc-500">
                      Nenhuma solicitação ainda.
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
