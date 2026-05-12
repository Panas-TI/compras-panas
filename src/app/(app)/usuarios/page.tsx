import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UsersTable, type UserRow } from "./users-table";

export default async function UsuariosPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: meProfile } = await supabase.from("profiles").select("role, ativo").eq("id", user.id).maybeSingle();
  if (!meProfile?.ativo || meProfile.role !== "aprovador") redirect("/");

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, nome, role, ativo")
    .order("nome");

  const rows: UserRow[] = (profiles ?? []).map((p) => ({
    id: p.id,
    nome: p.nome,
    role: p.role as "comprador" | "aprovador",
    ativo: p.ativo,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Usuários</h1>
        <p className="text-sm text-zinc-600">
          Crie contas pros colegas. Aprovadores podem aprovar/recusar compras; compradores só criam solicitações.
        </p>
      </div>
      <UsersTable currentUserId={user.id} users={rows} />
    </div>
  );
}
