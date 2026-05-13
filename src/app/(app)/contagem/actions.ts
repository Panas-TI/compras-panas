"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type LinhaUpdate = Database["public"]["Tables"]["contagem_linhas"]["Update"];

function parseNumberBR(value: string | null | undefined): number | null {
  if (!value || !value.trim()) return null;
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export async function criarContagemAction(): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const { data, error } = await supabase
    .from("contagens")
    .insert({ criado_por: user.id })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  revalidatePath("/contagem");
  redirect(`/contagem/${data!.id}`);
}

export async function renomearContagemAction(contagem_id: string, nome: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("contagens")
    .update({ nome: nome.trim() || null })
    .eq("id", contagem_id);
  if (error) return { error: error.message };
  revalidatePath("/contagem");
  revalidatePath(`/contagem/${contagem_id}`);
  return {};
}

export async function alterarDataContagemAction(contagem_id: string, data: string): Promise<{ error?: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { error: "Data inválida." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("contagens")
    .update({ data_contagem: data })
    .eq("id", contagem_id);
  if (error) return { error: error.message };
  revalidatePath(`/contagem/${contagem_id}`);
  return {};
}

export async function importarTemplateAction(
  contagem_id: string,
  template_id: string
): Promise<{ error?: string; importados?: number }> {
  const supabase = await createClient();

  const { data: tpl, error: tplErr } = await supabase
    .from("template_itens")
    .select("ordem, secao, texto, item_id")
    .eq("template_id", template_id)
    .order("ordem");
  if (tplErr) return { error: tplErr.message };
  if (!tpl || tpl.length === 0) return { error: "Template vazio." };

  // Pega maior ordem já existente nessa contagem pra continuar a partir dela
  const { data: existing } = await supabase
    .from("contagem_linhas")
    .select("ordem")
    .eq("contagem_id", contagem_id)
    .order("ordem", { ascending: false })
    .limit(1);
  const startOrdem = (existing?.[0]?.ordem ?? 0) + 1;

  const payload = tpl.map((t, idx) => ({
    contagem_id,
    ordem: startOrdem + idx,
    secao: t.secao,
    texto: t.texto,
    item_id: t.item_id,
  }));

  // Insere em lotes
  const BATCH = 100;
  for (let i = 0; i < payload.length; i += BATCH) {
    const { error } = await supabase.from("contagem_linhas").insert(payload.slice(i, i + BATCH));
    if (error) return { error: error.message };
  }

  revalidatePath(`/contagem/${contagem_id}`);
  return { importados: payload.length };
}

export async function updateLinhaContagemAction(
  linha_id: string,
  patch: { quantidade?: string | null; observacao?: string | null }
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const sanitized: LinhaUpdate = {};
  if (patch.quantidade !== undefined) {
    sanitized.quantidade = patch.quantidade === null ? null : parseNumberBR(patch.quantidade);
  }
  if (patch.observacao !== undefined) {
    sanitized.observacao = patch.observacao || null;
  }

  const { error, data } = await supabase
    .from("contagem_linhas")
    .update(sanitized)
    .eq("id", linha_id)
    .select("contagem_id")
    .single();
  if (error) return { error: error.message };

  revalidatePath(`/contagem/${data!.contagem_id}`);
  return {};
}

export async function removerLinhaContagemAction(linha_id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: linha } = await supabase
    .from("contagem_linhas")
    .select("contagem_id")
    .eq("id", linha_id)
    .maybeSingle();
  const { error } = await supabase.from("contagem_linhas").delete().eq("id", linha_id);
  if (error) return { error: error.message };
  if (linha) revalidatePath(`/contagem/${linha.contagem_id}`);
  return {};
}

export async function finalizarContagemAction(contagem_id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("contagens")
    .update({ finalizada: true, finalizada_em: new Date().toISOString() })
    .eq("id", contagem_id);
  if (error) return { error: error.message };
  revalidatePath("/contagem");
  revalidatePath(`/contagem/${contagem_id}`);
  return {};
}

export async function excluirContagemAction(contagem_id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error, data } = await supabase
    .from("contagens")
    .delete()
    .eq("id", contagem_id)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Sem permissão pra excluir." };
  revalidatePath("/contagem");
  redirect("/contagem");
}
