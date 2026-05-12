"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ItemFormState = { error?: string; fieldErrors?: Record<string, string> } | null;

function parseNumberBR(value: string | null): number | null {
  if (!value || !value.trim()) return null;
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function readPayload(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k);
    return v === null || v === undefined ? null : String(v).trim();
  };
  const optionalId = (k: string) => {
    const v = get(k);
    return v && v !== "" ? v : null;
  };
  return {
    nome: get("nome") ?? "",
    codigo_queops: get("codigo_queops") || null,
    classificacao_id: optionalId("classificacao_id"),
    unidade_id: optionalId("unidade_id"),
    fornecedor_padrao_id: optionalId("fornecedor_padrao_id"),
    forma_pagto_padrao_id: optionalId("forma_pagto_padrao_id"),
    preco_referencia: parseNumberBR(get("preco_referencia")),
    prazo_padrao: get("prazo_padrao") || null,
    ativo: formData.get("ativo") === "on",
  };
}

export async function createItemAction(_prev: ItemFormState, formData: FormData): Promise<ItemFormState> {
  const payload = readPayload(formData);
  if (!payload.nome) return { fieldErrors: { nome: "Nome é obrigatório." } };

  const supabase = await createClient();
  const { error } = await supabase.from("itens").insert(payload);
  if (error) {
    if (error.code === "23505") return { error: "Já existe um item com esse código Queóps." };
    return { error: error.message };
  }

  revalidatePath("/itens");
  redirect("/itens");
}

export async function updateItemAction(id: string, _prev: ItemFormState, formData: FormData): Promise<ItemFormState> {
  const payload = readPayload(formData);
  if (!payload.nome) return { fieldErrors: { nome: "Nome é obrigatório." } };

  const supabase = await createClient();
  const { error } = await supabase.from("itens").update(payload).eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "Já existe um item com esse código Queóps." };
    return { error: error.message };
  }

  revalidatePath("/itens");
  revalidatePath(`/itens/${id}`);
  redirect("/itens");
}

export async function toggleItemAtivoAction(id: string, novoStatus: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("itens").update({ ativo: novoStatus }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/itens");
}
