import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FotoForm } from "./foto-form";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function MotoristaFotoPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const id = typeof sp.id === "string" ? sp.id : "";
  const codigo = typeof sp.codigo === "string" ? sp.codigo : "";
  const lat = typeof sp.lat === "string" ? Number(sp.lat) : null;
  const lng = typeof sp.lng === "string" ? Number(sp.lng) : null;
  const acc = typeof sp.acc === "string" ? Number(sp.acc) : null;

  if (!id || !codigo) redirect("/motorista");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Verifica que o pedido ainda é válido pra entregar
  const { data: entrega } = await supabase
    .from("entregas")
    .select("id, codigo_queops, status")
    .eq("id", id)
    .maybeSingle();
  if (!entrega || entrega.status === "entregue" || entrega.status === "cancelada") {
    redirect("/motorista");
  }

  const gps =
    lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng)
      ? { lat, lng, precisao_metros: acc ?? 0 }
      : null;

  return (
    <div className="flex flex-col gap-4 pb-12">
      <div>
        <h1 className="text-2xl font-semibold">Foto do pedido</h1>
        <p className="text-sm text-zinc-600">
          Pedido <span className="font-mono">{codigo}</span>
        </p>
      </div>
      <FotoForm entregaId={id} codigo={codigo} gps={gps} />
    </div>
  );
}
