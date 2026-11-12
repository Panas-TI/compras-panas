import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listarEmailsAction } from "./actions";
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

  // O email mora em auth.users, fora do alcance do client normal — vem pela
  // action, que usa a chave de serviço. Sem ele, duas contas com nome parecido
  // ("comercial", "financeiro") não dá pra saber qual é qual na hora de
  // resetar senha.
  const emails = await listarEmailsAction();

  const rows: UserRow[] = (profiles ?? []).map((p) => ({
    id: p.id,
    nome: p.nome,
    email: emails[p.id] ?? null,
    role: p.role as "comprador" | "aprovador" | "estoquista" | "motorista" | "vendas" | "financeiro" | "gestor_producao",
    ativo: p.ativo,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Usuários</h1>
        <p className="text-sm text-zinc-600">
          Crie contas pros colegas. Administradores têm acesso total (aprovam/recusam compras, gerenciam tudo); compradores só criam solicitações.
        </p>
      </div>
      <UsersTable currentUserId={user.id} users={rows} />
    </div>
  );
}
