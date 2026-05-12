import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const TIPOS = [
  { slug: "fornecedores", label: "Fornecedores", table: "fornecedores" as const },
  { slug: "classificacoes", label: "Classificações", table: "classificacoes" as const },
  { slug: "unidades-medida", label: "Unidades de medida", table: "unidades_medida" as const },
  { slug: "formas-pagamento", label: "Formas de pagamento", table: "formas_pagamento" as const },
];

export default async function CadastrosPage() {
  const supabase = await createClient();
  const counts = await Promise.all(
    TIPOS.map(async (t) => {
      const { count } = await supabase
        .from(t.table)
        .select("*", { count: "exact", head: true })
        .eq("ativo", true);
      return { ...t, count: count ?? 0 };
    })
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Cadastros</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {counts.map((t) => (
          <Link key={t.slug} href={`/cadastros/${t.slug}`}>
            <Card className="transition-shadow hover:shadow-md">
              <CardHeader>
                <CardDescription>{t.label}</CardDescription>
                <CardTitle className="text-2xl">{t.count}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-zinc-500">Gerenciar lista</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
