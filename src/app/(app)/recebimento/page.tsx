import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrencyBRL, formatDateBR } from "@/lib/utils";

export default async function RecebimentoIndexPage() {
  const supabase = await createClient();

  // Estoquista NÃO pode ver valores ($) dos recebimentos — só quantidades.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: meProfile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
    : { data: null };
  const podeVerValor = meProfile?.role !== "estoquista";

  // Busca todas as linhas elegíveis pra recebimento + as já recebidas (pra contar)
  const { data: linhas } = await supabase
    .from("solicitacao_linhas")
    .select(
      `
      solicitacao_id, status, alteracao_confirmada, valor,
      solicitacao:solicitacoes_semanais!solicitacao_linhas_solicitacao_id_fkey(
        id, data_inicio, data_fim, enviada_em,
        comprador:profiles!solicitacoes_semanais_comprador_id_fkey(nome)
      )
    `
    )
    .in("status", ["Aprovada", "Volumes ou Preço Alterados", "Aprovada & Recebida"]);

  type SolicAgg = {
    id: string;
    data_inicio: string;
    data_fim: string;
    enviada_em: string | null;
    comprador_nome: string | null;
    pendentes: number;
    recebidos: number;
    valor_pendente: number;
  };

  const byId = new Map<string, SolicAgg>();
  for (const l of linhas ?? []) {
    const s = l.solicitacao;
    if (!s) continue;
    const cur = byId.get(s.id) ?? {
      id: s.id,
      data_inicio: s.data_inicio,
      data_fim: s.data_fim,
      enviada_em: s.enviada_em,
      comprador_nome: s.comprador?.nome ?? null,
      pendentes: 0,
      recebidos: 0,
      valor_pendente: 0,
    };
    if (l.status === "Aprovada & Recebida") {
      cur.recebidos += 1;
    } else if (
      l.status === "Aprovada" ||
      (l.status === "Volumes ou Preço Alterados" && l.alteracao_confirmada)
    ) {
      cur.pendentes += 1;
      cur.valor_pendente += Number(l.valor ?? 0);
    }
    byId.set(s.id, cur);
  }

  // Só mostra solicitações com pelo menos 1 item pendente
  const solics = Array.from(byId.values())
    .filter((s) => s.pendentes > 0)
    .sort((a, b) => b.data_inicio.localeCompare(a.data_inicio));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Recebimento</h1>
        <p className="text-sm text-zinc-600">
          {solics.length} {solics.length === 1 ? "solicitação" : "solicitações"} com itens pendentes de recebimento.
        </p>
      </div>

      {solics.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-zinc-500">
            Tudo em dia. Nenhum item pendente de recebimento.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3">
        {solics.map((s) => (
          <Link key={s.id} href={`/recebimento/${s.id}`}>
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                <div>
                  <div className="font-medium">
                    {formatDateBR(s.data_inicio)} a {formatDateBR(s.data_fim)}
                  </div>
                  <div className="text-sm text-zinc-600">
                    {s.comprador_nome ?? "—"}
                    {s.enviada_em && <> · enviada em {formatDateBR(s.enviada_em)}</>}
                  </div>
                </div>
                <div className="flex gap-6 text-sm">
                  <div>
                    <div className="text-xs text-zinc-500">Pendentes</div>
                    <div className="text-lg font-semibold text-amber-700">{s.pendentes}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500">Recebidos</div>
                    <div className="text-lg font-semibold text-emerald-700">{s.recebidos}</div>
                  </div>
                  {podeVerValor && (
                    <div className="text-right">
                      <div className="text-xs text-zinc-500">Valor pendente</div>
                      <div className="text-base font-semibold tabular-nums">
                        {formatCurrencyBRL(s.valor_pendente)}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
