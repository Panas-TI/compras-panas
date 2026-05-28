import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { NovoGrupoForm } from "./novo-grupo-form";

export default async function GruposPage() {
  const supabase = await createClient();
  const { data: grupos } = await supabase
    .from("templates_contagem")
    .select("id, nome, descricao, ativo, criado_em")
    .order("nome");

  // Contagem de itens por grupo
  const ids = (grupos ?? []).map((g) => g.id);
  const countsById = new Map<string, number>();
  if (ids.length) {
    const { data: itens } = await supabase
      .from("template_itens")
      .select("template_id")
      .in("template_id", ids);
    for (const i of itens ?? []) {
      countsById.set(i.template_id, (countsById.get(i.template_id) ?? 0) + 1);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Grupos de itens</h1>
          <p className="text-sm text-zinc-600">
            Listas pré-definidas de itens (templates) que o estoquista pode importar pra uma contagem.
          </p>
        </div>
        <Link href="/itens" className="text-sm text-zinc-600 hover:underline">
          ← Voltar pra itens
        </Link>
      </div>

      <NovoGrupoForm />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(grupos ?? []).map((g) => (
          <Link key={g.id} href={`/itens/grupos/${g.id}`}>
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{g.nome}</div>
                    {g.descricao && (
                      <div className="mt-1 text-sm text-zinc-500">{g.descricao}</div>
                    )}
                  </div>
                  {!g.ativo && (
                    <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                      Inativo
                    </span>
                  )}
                </div>
                <div className="mt-3 text-sm text-zinc-600">
                  <strong className="text-zinc-900">{countsById.get(g.id) ?? 0}</strong> itens
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
        {!grupos?.length && (
          <p className="text-sm text-zinc-500">Nenhum grupo cadastrado. Use o formulário acima.</p>
        )}
      </div>
    </div>
  );
}
