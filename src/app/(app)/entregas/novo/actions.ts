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
    return { ok: false as const, error: "Apenas aprovador pode cadastrar entregas." };
  }
  return { ok: true as const, userId: user.id };
}

export type CadastrarState = {
  ok: true;
  entregaId: string;
  jaExistia: false;
} | {
  ok: true;
  entregaId: string;
  jaExistia: true;
  status: string;
  data_entrega: string;
} | {
  ok: false;
  error: string;
} | null;

/**
 * Cadastra entrega pelo código de barras escaneado.
 * Se o código já existe, retorna info pro usuário (não duplica).
 */
export async function cadastrarPorCodigoAction(codigo: string): Promise<CadastrarState> {
  const guard = await assertAprovador();
  if (!guard.ok) return { ok: false, error: guard.error };

  const codigoLimpo = codigo.trim();
  if (!codigoLimpo) return { ok: false, error: "Código vazio." };
  if (codigoLimpo.length < 4) return { ok: false, error: "Código muito curto." };
  if (codigoLimpo.length > 64) return { ok: false, error: "Código muito longo." };

  const supabase = await createClient();

  // Já existe?
  const { data: existente } = await supabase
    .from("entregas")
    .select("id, status, data_entrega")
    .eq("codigo_queops", codigoLimpo)
    .maybeSingle();

  if (existente) {
    return {
      ok: true,
      entregaId: existente.id,
      jaExistia: true,
      status: existente.status,
      data_entrega: existente.data_entrega,
    };
  }

  // Insert mínimo (cliente, endereço, etc ficam null — motorista usa a folha física)
  const today = new Date().toISOString().slice(0, 10);
  const { data: inserted, error } = await supabase
    .from("entregas")
    .insert({
      codigo_queops: codigoLimpo,
      data_entrega: today,
      status: "pendente",
      created_by: guard.userId,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      // Corrida com outro cadastro simultâneo — busca de novo
      const { data: ja } = await supabase
        .from("entregas")
        .select("id, status, data_entrega")
        .eq("codigo_queops", codigoLimpo)
        .maybeSingle();
      if (ja) {
        return {
          ok: true,
          entregaId: ja.id,
          jaExistia: true,
          status: ja.status,
          data_entrega: ja.data_entrega,
        };
      }
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/entregas/dia");
  return { ok: true, entregaId: inserted!.id, jaExistia: false };
}
