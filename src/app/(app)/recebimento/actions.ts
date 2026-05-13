"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type LinhaUpdate = Database["public"]["Tables"]["solicitacao_linhas"]["Update"];

function parseNumberBR(value: string | null | undefined): number | null {
  if (!value || !value.trim()) return null;
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export async function receberLinhaAction(
  linha_id: string,
  volumeRecebidoStr: string,
  dataRecebimento: string
): Promise<{ error?: string }> {
  const supabase = await createClient();

  const volume = parseNumberBR(volumeRecebidoStr);
  if (volume === null) return { error: "Informe a quantidade recebida." };
  if (volume < 0) return { error: "Quantidade não pode ser negativa." };
  if (!dataRecebimento || !/^\d{4}-\d{2}-\d{2}$/.test(dataRecebimento)) {
    return { error: "Informe uma data válida." };
  }

  const patch: LinhaUpdate = {
    status: "Aprovada & Recebida",
    volume_recebido: volume,
    data_recebimento: dataRecebimento,
  };

  const { error } = await supabase
    .from("solicitacao_linhas")
    .update(patch)
    .eq("id", linha_id);
  if (error) return { error: error.message };

  revalidatePath("/recebimento");
  revalidatePath("/solicitacoes");
  return {};
}
