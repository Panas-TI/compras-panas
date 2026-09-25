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

  // Totais vêm somados do banco, não contados aqui.
  //
  // Antes esta tela pedia TODAS as linhas de TODAS as solicitações com status
  // de recebimento — 1.194 — pra somar em JavaScript. O PostgREST entrega no
  // máximo 1.000 e corta o resto EM SILÊNCIO, sem erro e sem aviso: a
  // solicitação de 28/09 aparecia com 24 pendentes e R$ 4.366,80 quando tinha
  // 75 e R$ 13.294,97. E como não havia ordem na consulta, quem era cortado
  // dependia do plano do banco — as semanas antigas, já recebidas, batiam, e
  // as recentes não.
  //
  // Duas consultas curtas e limitadas: ~19 resumos e os cabeçalhos deles.
  const { data: resumos } = await supabase
    .from("solicitacoes_resumo")
    .select("solicitacao_id, pendentes_recebimento, recebidos, valor_pendente")
    .gt("pendentes_recebimento", 0);

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
  const ids = (resumos ?? []).map((r) => r.solicitacao_id).filter((x): x is string => !!x);

  if (ids.length > 0) {
    const { data: cabecalhos } = await supabase
      .from("solicitacoes_semanais")
      .select(
        `id, data_inicio, data_fim, enviada_em,
         comprador:profiles!solicitacoes_semanais_comprador_id_fkey(nome)`
      )
      .in("id", ids);

    const resumoPorId = new Map((resumos ?? []).map((r) => [r.solicitacao_id, r]));
    for (const c of cabecalhos ?? []) {
      const r = resumoPorId.get(c.id);
      if (!r) continue;
      byId.set(c.id, {
        id: c.id,
        data_inicio: c.data_inicio,
        data_fim: c.data_fim,
        enviada_em: c.enviada_em,
        comprador_nome: c.comprador?.nome ?? null,
        pendentes: r.pendentes_recebimento ?? 0,
        recebidos: r.recebidos ?? 0,
        valor_pendente: Number(r.valor_pendente ?? 0),
      });
    }
  }

  // Só mostra solicitações com pelo menos 1 item pendente
  const solics = Array.from(byId.values()).sort((a, b) => b.data_inicio.localeCompare(a.data_inicio));

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
