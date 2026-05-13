import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDateBR } from "@/lib/utils";
import { criarContagemAction } from "./actions";

export default async function ContagemIndexPage() {
  const supabase = await createClient();
  const { data: contagens } = await supabase
    .from("contagens")
    .select(
      `id, nome, data_contagem, finalizada, finalizada_em, criado_em,
       criador:profiles!contagens_criado_por_fkey(nome)`
    )
    .order("data_contagem", { ascending: false })
    .order("criado_em", { ascending: false });

  // Conta linhas por contagem
  const ids = (contagens ?? []).map((c) => c.id);
  const counts = new Map<string, { total: number; preenchidas: number }>();
  if (ids.length) {
    const { data: linhas } = await supabase
      .from("contagem_linhas")
      .select("contagem_id, quantidade")
      .in("contagem_id", ids);
    for (const l of linhas ?? []) {
      const cur = counts.get(l.contagem_id) ?? { total: 0, preenchidas: 0 };
      cur.total += 1;
      if (l.quantidade != null) cur.preenchidas += 1;
      counts.set(l.contagem_id, cur);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Contagem de estoque</h1>
          <p className="text-sm text-zinc-600">{contagens?.length ?? 0} contagens.</p>
        </div>
        <form action={criarContagemAction}>
          <Button type="submit">Add nova contagem</Button>
        </form>
      </div>

      {!contagens?.length && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-zinc-500">
            Nenhuma contagem ainda. Clique em "Add nova contagem" pra começar.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3">
        {(contagens ?? []).map((c) => {
          const stats = counts.get(c.id) ?? { total: 0, preenchidas: 0 };
          return (
            <Link key={c.id} href={`/contagem/${c.id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div>
                    <div className="font-medium">
                      {c.nome || `Contagem ${formatDateBR(c.data_contagem)}`}
                    </div>
                    <div className="text-sm text-zinc-600">
                      {formatDateBR(c.data_contagem)} · {c.criador?.nome ?? "—"}
                      {c.finalizada && c.finalizada_em && (
                        <> · finalizada em {formatDateBR(c.finalizada_em)}</>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div>
                      <div className="text-xs text-zinc-500">Itens</div>
                      <div className="text-lg font-semibold">{stats.total}</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500">Preenchidas</div>
                      <div className="text-lg font-semibold text-emerald-700">{stats.preenchidas}</div>
                    </div>
                    <div className="text-xs">
                      {c.finalizada ? (
                        <span className="rounded-full bg-zinc-100 px-2 py-1 text-zinc-700">Finalizada</span>
                      ) : (
                        <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">Em andamento</span>
                      )}
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
