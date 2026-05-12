import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LOOKUP_CONFIG, isLookupTipo } from "./config";
import { LookupTable } from "./lookup-table";

export default async function LookupPage({ params }: { params: Promise<{ tipo: string }> }) {
  const { tipo } = await params;
  if (!isLookupTipo(tipo)) notFound();
  const config = LOOKUP_CONFIG[tipo];

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from(config.table)
    .select("id, nome, ativo")
    .order("nome");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{config.label}</h1>
          <p className="text-sm text-zinc-600">{rows?.length ?? 0} registros.</p>
        </div>
        <Link href="/cadastros" className="text-sm text-zinc-600 hover:underline">
          ← Voltar
        </Link>
      </div>
      <LookupTable tipo={tipo} rows={rows ?? []} singular={config.singular} />
    </div>
  );
}
