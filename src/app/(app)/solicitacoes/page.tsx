import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrencyBRL, formatDateBR } from "@/lib/utils";
import { solicStatusFromCounts, statusColorClass } from "./status";

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

  // Totais e pendências agregados no banco (view solicitacoes_resumo).
  // Trazer as linhas cruas pra contar aqui estourava o limite de 1000 do
  // PostgREST conforme a base cresce — zerando totais e errando o status.
  const totalsBy = new Map<
    string,
    { linhas: number; valor: number; pendAprov: number; pendReceb: number }
  >();
  const { data: resumos } = await supabase
    .from("solicitacoes_resumo")
    .select("solicitacao_id, linhas, valor, pendentes_aprovacao, pendentes_recebimento");
  for (const r of resumos ?? []) {
    if (r.solicitacao_id) {
      totalsBy.set(r.solicitacao_id, {
        linhas: r.linhas ?? 0,
        valor: Number(r.valor ?? 0),
        pendAprov: r.pendentes_aprovacao ?? 0,
        pendReceb: r.pendentes_recebimento ?? 0,
      });
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
                  const totals = totalsBy.get(s.id) ?? {
                    linhas: 0,
                    valor: 0,
                    pendAprov: 0,
                    pendReceb: 0,
                  };
                  const status = solicStatusFromCounts(
                    s.enviada_em,
                    totals.pendAprov,
                    totals.pendReceb
                  );
                  const statusClass = statusColorClass(status);
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
