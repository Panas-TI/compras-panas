import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrencyBRL, formatDateBR } from "@/lib/utils";

export default async function AprovacoesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "aprovador") redirect("/");

  // Solicitações enviadas mas não finalizadas
  const { data: solics } = await supabase
    .from("solicitacoes_semanais")
    .select(
      `
      id, data_inicio, data_fim, observacoes, enviada_em, finalizada,
      comprador:profiles!solicitacoes_semanais_comprador_id_fkey(nome)
    `
    )
    .not("enviada_em", "is", null)
    .eq("finalizada", false)
    .order("data_inicio", { ascending: false });

  // Stats por solicitação
  const ids = (solics ?? []).map((s) => s.id);
  const statsByIdLine = new Map<string, { paraAprovar: number; aprovadas: number; recusadas: number; valor: number }>();
  if (ids.length) {
    const { data: linhas } = await supabase
      .from("solicitacao_linhas")
      .select("solicitacao_id, status, valor")
      .in("solicitacao_id", ids);
    for (const l of linhas ?? []) {
      const cur = statsByIdLine.get(l.solicitacao_id) ?? { paraAprovar: 0, aprovadas: 0, recusadas: 0, valor: 0 };
      if (l.status === "Para Aprovar") cur.paraAprovar += 1;
      else if (l.status === "Recusada") cur.recusadas += 1;
      else cur.aprovadas += 1;
      cur.valor += Number(l.valor ?? 0);
      statsByIdLine.set(l.solicitacao_id, cur);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Aprovações pendentes</h1>
        <p className="text-sm text-zinc-600">
          {solics?.length ?? 0} {(solics?.length ?? 0) === 1 ? "solicitação" : "solicitações"} aguardando aprovação.
        </p>
      </div>

      {(solics?.length ?? 0) === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-zinc-500">
            Tudo em dia. Nenhuma solicitação aguardando aprovação.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3">
        {(solics ?? []).map((s) => {
          const stats = statsByIdLine.get(s.id) ?? { paraAprovar: 0, aprovadas: 0, recusadas: 0, valor: 0 };
          return (
            <Link key={s.id} href={`/solicitacoes/${s.id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div>
                    <div className="font-medium">
                      {formatDateBR(s.data_inicio)} a {formatDateBR(s.data_fim)}
                    </div>
                    <div className="text-sm text-zinc-600">
                      {s.comprador?.nome ?? "—"} · enviada em {formatDateBR(s.enviada_em)}
                    </div>
                    {s.observacoes && <div className="mt-1 text-xs text-zinc-500">{s.observacoes}</div>}
                  </div>
                  <div className="flex gap-4 text-sm">
                    <div>
                      <div className="text-xs text-zinc-500">Aguardando</div>
                      <div className="text-lg font-semibold text-amber-700">{stats.paraAprovar}</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500">Aprovadas</div>
                      <div className="text-lg font-semibold text-emerald-700">{stats.aprovadas}</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500">Recusadas</div>
                      <div className="text-lg font-semibold text-red-700">{stats.recusadas}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-zinc-500">Valor</div>
                      <div className="text-base font-semibold tabular-nums">
                        {formatCurrencyBRL(stats.valor)}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
