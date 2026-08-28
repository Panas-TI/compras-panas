"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const PAPEIS = ["aprovador", "vendas"];

async function guard(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erro: "Não autenticado." };
  const { data: p } = await supabase
    .from("profiles")
    .select("role, ativo")
    .eq("id", user.id)
    .maybeSingle();
  if (!p?.ativo || !PAPEIS.includes(p.role)) return { erro: "Sem permissão." };
  return { userId: user.id };
}

/** Coloca o cliente no atendimento de hoje, por decisão de quem está olhando. */
export async function puxarParaHojeAction(
  clienteId: string,
  motivo?: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const g = await guard(supabase);
  if (g.erro) return { error: g.erro };

  const { error } = await supabase.from("vendas_fila_manual").insert({
    cliente_id: clienteId,
    motivo: motivo?.trim() || null,
    criado_por: g.userId,
  });
  // Puxar de novo no mesmo dia não é erro: a intenção já está registrada.
  if (error && error.code !== "23505") return { error: error.message };

  revalidatePath("/vendas");
  revalidatePath("/vendas/clientes");
  return {};
}

export async function tirarDeHojeAction(clienteId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const g = await guard(supabase);
  if (g.erro) return { error: g.erro };

  const hoje = new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from("vendas_fila_manual")
    .delete()
    .eq("cliente_id", clienteId)
    .eq("data", hoje);
  if (error) return { error: error.message };

  revalidatePath("/vendas");
  revalidatePath("/vendas/clientes");
  return {};
}
