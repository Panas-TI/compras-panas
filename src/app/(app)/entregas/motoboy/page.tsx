import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MotoboyClient, type Corrida } from "./motoboy-client";

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

  // Última importação salva no banco — assim qualquer pessoa/computador vê
  const { data: ultimo } = await supabase
    .from("motoboy_relatorios")
    .select("corridas, importado_em, importado_por")
    .order("importado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  const inicial = ultimo
    ? {
        corridas: (ultimo.corridas as unknown as Corrida[]) ?? [],
        em: new Date(ultimo.importado_em).toLocaleString("pt-BR"),
        por: ultimo.importado_por ?? null,
      }
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Motoboy — auditoria de km</h1>
        <p className="text-sm text-zinc-600">
          Anexe o Relatório de Entregas do Queóps (.xls). O sistema calcula o km real de cada
          corrida partindo da sede (Av. Benjamin Constant, 1235) usando a base oficial de endereços
          do IBGE (CNEFE — Censo 2022) pra você conferir a cobrança da Beloli. Balcão e consumo
          interno são ignorados automaticamente.
        </p>
      </div>
      <MotoboyClient inicial={inicial} usuario={user.email ?? null} />
    </div>
  );
}
