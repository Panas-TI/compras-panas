import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Quem enxerga o módulo Vendas. Escrita (contato/importação) só admin e vendas.
export const PAPEIS_VENDAS = ["aprovador", "vendas", "comprador"] as const;
export const PAPEIS_ESCRITA = ["aprovador", "vendas"] as const;

export async function guardVendas() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, nome")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.role ?? "";
  if (!(PAPEIS_VENDAS as readonly string[]).includes(role)) redirect("/");

  return {
    supabase,
    user,
    role,
    nome: profile?.nome ?? user.email ?? "",
    podeEscrever: (PAPEIS_ESCRITA as readonly string[]).includes(role),
  };
}
