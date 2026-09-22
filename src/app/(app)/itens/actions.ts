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
    embalagem_compra_nome: get("embalagem_compra_nome") || null,
    qtd_por_embalagem: Math.max(1, parseNumberBR(get("qtd_por_embalagem")) ?? 1),
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

/** Papéis que administram o catálogo — mesmos da política do bucket. */
const PAPEIS_CATALOGO = ["aprovador", "comprador", "gestor_producao"];

async function guardCatalogo(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erro: "Não autenticado." };
  const { data: p } = await supabase
    .from("profiles")
    .select("role, ativo")
    .eq("id", user.id)
    .maybeSingle();
  if (!p?.ativo || !PAPEIS_CATALOGO.includes(p.role)) return { erro: "Sem permissão." };
  return {};
}

/**
 * Foto do item.
 *
 * O nome do cadastro nem sempre diz o que a coisa é: "ACEM", "LOMBO CANADENSE",
 * "REQUEIJÃO CATUPIRY BISNAGA 1,8kg" são claros pra quem lida todo dia e opacos
 * pra quem está chegando. A foto tira a dúvida na conferência sem precisar
 * perguntar pra alguém.
 *
 * O arquivo entra com nome novo a cada envio (timestamp) e a foto antiga é
 * apagada depois que o cadastro já aponta pra nova — se apagasse antes e o
 * update falhasse, o item ficaria apontando pra um arquivo inexistente.
 */
export async function salvarFotoItemAction(
  itemId: string,
  base64: string,
  mediaType: string
): Promise<{ error?: string; path?: string }> {
  const supabase = await createClient();
  const g = await guardCatalogo(supabase);
  if (g.erro) return { error: g.erro };

  if (!["image/jpeg", "image/png", "image/webp"].includes(mediaType)) {
    return { error: "Formato não aceito. Use JPG, PNG ou WEBP." };
  }
  const buffer = Buffer.from(base64, "base64");
  if (buffer.byteLength > 5 * 1024 * 1024) {
    return { error: "Imagem maior que 5 MB mesmo depois de comprimida." };
  }

  const { data: item } = await supabase
    .from("itens")
    .select("foto_path")
    .eq("id", itemId)
    .maybeSingle();
  const anterior = item?.foto_path ?? null;

  const ext = mediaType === "image/png" ? "png" : mediaType === "image/webp" ? "webp" : "jpg";
  const path = `${itemId}/${Date.now()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("fotos-itens")
    .upload(path, buffer, { contentType: mediaType, upsert: false });
  if (upErr) return { error: `Não consegui enviar a foto: ${upErr.message}` };

  const { error: updErr } = await supabase.from("itens").update({ foto_path: path }).eq("id", itemId);
  if (updErr) {
    await supabase.storage.from("fotos-itens").remove([path]);
    return { error: updErr.message };
  }

  if (anterior && anterior !== path) {
    await supabase.storage.from("fotos-itens").remove([anterior]);
  }

  revalidatePath(`/itens/${itemId}`);
  revalidatePath("/itens");
  return { path };
}

export async function removerFotoItemAction(itemId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const g = await guardCatalogo(supabase);
  if (g.erro) return { error: g.erro };

  const { data: item } = await supabase
    .from("itens")
    .select("foto_path")
    .eq("id", itemId)
    .maybeSingle();
  if (!item?.foto_path) return {};

  const { error } = await supabase.from("itens").update({ foto_path: null }).eq("id", itemId);
  if (error) return { error: error.message };
  await supabase.storage.from("fotos-itens").remove([item.foto_path]);

  revalidatePath(`/itens/${itemId}`);
  revalidatePath("/itens");
  return {};
}
