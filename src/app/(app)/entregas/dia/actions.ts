"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
