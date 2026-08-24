import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TabelaColaboradores, type Colaborador } from "./tabela";

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

  const { data: colaboradores } = await supabase
    .from("colaboradores")
    .select("*")
    .order("ativo", { ascending: false })
    .order("nome");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/configuracoes" className="text-sm text-zinc-600 hover:underline">
          ← Configurações
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Colaboradores</h1>
        <p className="text-sm text-zinc-600">
          Quem trabalha na empresa e em quais atividades atua. Não tem relação com acesso ao
          sistema — isso fica em Usuários.
        </p>
      </div>

      <TabelaColaboradores colaboradores={(colaboradores ?? []) as Colaborador[]} />
    </div>
  );
}
