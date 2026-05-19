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

/** Adiciona uma entrega parcial à linha. */
export async function addEntregaAction(
  linha_id: string,
  quantidadeStr: string,
  dataRecebimento: string,
  observacao?: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const qtd = parseNumberBR(quantidadeStr);
  if (qtd === null) return { error: "Informe a quantidade da entrega." };
  if (qtd <= 0) return { error: "Quantidade deve ser maior que zero." };
  if (!dataRecebimento || !/^\d{4}-\d{2}-\d{2}$/.test(dataRecebimento)) {
    return { error: "Informe uma data válida." };
  }

  const { error } = await supabase.from("recebimento_entregas").insert({
    linha_id,
    quantidade: qtd,
    data_recebimento: dataRecebimento,
    observacao: observacao?.trim() || null,
    criado_por: user?.id ?? null,
  });
  if (error) return { error: error.message };

  revalidatePath("/recebimento");
  return {};
}

export async function removerEntregaAction(entrega_id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("recebimento_entregas").delete().eq("id", entrega_id);
  if (error) return { error: error.message };
  revalidatePath("/recebimento");
  return {};
}

/** Finaliza o recebimento da linha — soma as entregas e marca como recebida. */
export async function finalizarRecebimentoAction(linha_id: string): Promise<{ error?: string }> {
  const supabase = await createClient();

  const { data: entregas, error: eerr } = await supabase
    .from("recebimento_entregas")
    .select("quantidade, data_recebimento, observacao")
    .eq("linha_id", linha_id)
    .order("data_recebimento", { ascending: true });
  if (eerr) return { error: eerr.message };
  if (!entregas || entregas.length === 0) {
    return { error: "Adicione pelo menos uma entrega antes de finalizar." };
  }

  const total = entregas.reduce((s, e) => s + Number(e.quantidade ?? 0), 0);
  const ultimaData = entregas[entregas.length - 1].data_recebimento;
  const obs = entregas
    .map((e) => e.observacao?.trim())
    .filter(Boolean)
    .join(" | ");

  const patch: LinhaUpdate = {
    status: "Aprovada & Recebida",
    volume_recebido: total,
    data_recebimento: ultimaData,
    observacao_recebimento: obs || null,
  };

  const { error } = await supabase.from("solicitacao_linhas").update(patch).eq("id", linha_id);
  if (error) return { error: error.message };

  revalidatePath("/recebimento");
  revalidatePath("/solicitacoes");
  return {};
}
