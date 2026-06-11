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
  if (!profile?.ativo || !["aprovador", "comprador"].includes(profile.role)) {
    return { ok: false as const, error: "Apenas aprovador ou comprador podem cadastrar entregas." };
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
 *
 * dataEntrega: opcional (YYYY-MM-DD). Se omitido, usa hoje.
 * Permite adiantar pedidos de dias futuros.
 */
export async function cadastrarPorCodigoAction(
  codigo: string,
  dataEntrega?: string
): Promise<CadastrarState> {
  const guard = await assertAprovador();
  if (!guard.ok) return { ok: false, error: guard.error };

  const codigoLimpo = codigo.trim();
  if (!codigoLimpo) return { ok: false, error: "Código vazio." };
  if (codigoLimpo.length < 4) return { ok: false, error: "Código muito curto." };
  if (codigoLimpo.length > 64) return { ok: false, error: "Código muito longo." };

  // Valida data: precisa ser YYYY-MM-DD; não pode ser passado
  const today = new Date().toISOString().slice(0, 10);
  let dataFinal = today;
  if (dataEntrega) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataEntrega)) {
      return { ok: false, error: "Data inválida. Use AAAA-MM-DD." };
    }
    if (dataEntrega < today) {
      return { ok: false, error: "Não dá pra cadastrar pra um dia passado." };
    }
    dataFinal = dataEntrega;
  }

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
  const { data: inserted, error } = await supabase
    .from("entregas")
    .insert({
      codigo_queops: codigoLimpo,
      data_entrega: dataFinal,
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
