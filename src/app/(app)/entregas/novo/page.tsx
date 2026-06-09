import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NovoForm } from "./novo-form";

export default async function EntregasNovoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, ativo")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.ativo || profile.role !== "aprovador") redirect("/");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Nova entrega (foto do pedido)</h1>
        <p className="text-sm text-zinc-600">
          Tira foto do pedido impresso ou seleciona um arquivo. O Claude lê o pedido e preenche os campos
          automaticamente — você só revisa e salva.
        </p>
      </div>
      <NovoForm />
    </div>
  );
}
