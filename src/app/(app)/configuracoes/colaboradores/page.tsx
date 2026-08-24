import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { roleLabel } from "@/lib/role-label";
import { TabelaColaboradores, type Colaborador, type ContaAcesso } from "./tabela";

export const dynamic = "force-dynamic";

export default async function ColaboradoresPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("profiles")
    .select("role, ativo")
    .eq("id", user.id)
    .maybeSingle();
  if (!perfil?.ativo || perfil.role !== "aprovador") redirect("/");

  const [{ data: colaboradores }, { data: contas }] = await Promise.all([
    supabase.from("colaboradores").select("*").order("ativo", { ascending: false }).order("nome"),
    supabase.from("profiles").select("id, nome, role").eq("ativo", true).order("nome"),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/configuracoes" className="text-sm text-zinc-600 hover:underline">
          ← Configurações
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Colaboradores</h1>
        <p className="text-sm text-zinc-600">
          Quem trabalha na empresa. Diferente de <strong>Usuários</strong>, que é conta de login —
          a maior parte do time não acessa o sistema, mas está aqui.
        </p>
      </div>

      <TabelaColaboradores
        colaboradores={(colaboradores ?? []) as Colaborador[]}
        contas={(contas ?? []).map((c) => ({
          id: c.id,
          nome: c.nome,
          role: roleLabel(c.role as Parameters<typeof roleLabel>[0]),
        })) as ContaAcesso[]}
      />
    </div>
  );
}
