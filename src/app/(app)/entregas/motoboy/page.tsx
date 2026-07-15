import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MotoboyClient } from "./motoboy-client";

export default async function MotoboyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.role || !["aprovador", "comprador"].includes(profile.role)) redirect("/");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Motoboy — auditoria de km</h1>
        <p className="text-sm text-zinc-600">
          Anexe o Relatório de Entregas do Queóps (.xls). O sistema calcula o km real de cada
          corrida partindo da sede (Av. Benjamin Constant, 1235) pra você conferir a cobrança da
          Beloli. Balcão e consumo interno são ignorados automaticamente.
        </p>
      </div>
      <MotoboyClient />
    </div>
  );
}
