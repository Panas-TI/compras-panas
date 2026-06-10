"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function assertAprovador() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, ativo")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.ativo || profile.role !== "aprovador") {
    return { ok: false as const, error: "Apenas aprovador pode fazer essa ação." };
  }
  return { ok: true as const, userId: user.id };
}

export async function atribuirMotoristaAction(
  entregaId: string,
  motoristaId: string | null
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("entregas")
    .update({ motorista_id: motoristaId })
    .eq("id", entregaId);
  if (error) return { error: error.message };
  revalidatePath("/entregas/dia");
  return {};
}

export async function excluirEntregaAction(entregaId: string): Promise<{ error?: string }> {
  // Backend: RLS já bloqueia DELETE pra quem não é aprovador.
  // Aqui é só dupla camada de defesa + erro amigável.
  const guard = await assertAprovador();
  if (!guard.ok) return { error: guard.error };

  const supabase = await createClient();
  const { error } = await supabase.from("entregas").delete().eq("id", entregaId);
  if (error) return { error: error.message };
  revalidatePath("/entregas/dia");
  return {};
}
