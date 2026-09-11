"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ROTAS, type Rota } from "./rota-regras";

const PAPEIS = ["aprovador", "vendas"];

export async function definirRotaAction(
  clienteId: string,
  rota: Rota
): Promise<{ error?: string }> {
  if (!(rota in ROTAS)) return { error: "Rota inválida." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };
  const { data: p } = await supabase
    .from("profiles")
    .select("role, ativo")
    .eq("id", user.id)
    .maybeSingle();
  if (!p?.ativo || !PAPEIS.includes(p.role)) return { error: "Sem permissão." };

  const { error } = await supabase
    .from("vendas_clientes")
    .update({ rota })
    .eq("id", clienteId);
  if (error) return { error: error.message };

  revalidatePath("/vendas");
  revalidatePath("/vendas/clientes");
  revalidatePath(`/vendas/clientes/${clienteId}`);
  return {};
}
