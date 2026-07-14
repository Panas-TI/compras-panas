"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type TplUpdate = Database["public"]["Tables"]["templates_contagem"]["Update"];
type TplItenUpdate = Database["public"]["Tables"]["template_itens"]["Update"];

export type ActionResult = { error?: string; ok?: boolean } | null;

export async function criarGrupoAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const nome = String(fd.get("nome") ?? "").trim();
  const descricao = String(fd.get("descricao") ?? "").trim() || null;
  if (!nome) return { error: "Informe o nome." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("templates_contagem")
    .insert({ nome, descricao })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { error: "Já existe um grupo com esse nome." };
    return { error: error.message };
  }

  revalidatePath("/itens/grupos");
  redirect(`/itens/grupos/${data!.id}`);
}

export async function renomearGrupoAction(
  id: string,
  patch: { nome?: string; descricao?: string | null; ativo?: boolean }
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const dirty: TplUpdate = {};
  if (patch.nome !== undefined) {
    const v = patch.nome.trim();
    if (!v) return { error: "Nome obrigatório." };
    dirty.nome = v;
  }
  if (patch.descricao !== undefined) dirty.descricao = (patch.descricao ?? "").trim() || null;
  if (patch.ativo !== undefined) dirty.ativo = patch.ativo;

  const { error } = await supabase.from("templates_contagem").update(dirty).eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "Já existe um grupo com esse nome." };
    return { error: error.message };
  }
  revalidatePath("/itens/grupos");
  revalidatePath(`/itens/grupos/${id}`);
  return {};
}

export async function addItemAoGrupoAction(
  template_id: string,
  item_id: string,
  secao: string | null
): Promise<{ error?: string }> {
  if (!item_id) return { error: "Selecione um item do cadastro." };

  const supabase = await createClient();
  const { data: item } = await supabase.from("itens").select("nome").eq("id", item_id).maybeSingle();
  if (!item) return { error: "Item não encontrado no cadastro." };

  const secaoLimpa = secao?.trim() || null;

  let ordem: number;
  if (secaoLimpa) {
    // Insere no FINAL da seção (entre o último item da seção e o próximo bloco).
    const { data: itensDaSecao } = await supabase
      .from("template_itens")
      .select("id, ordem")
      .eq("template_id", template_id)
      .eq("secao", secaoLimpa)
      .order("ordem", { ascending: false })
      .limit(1);

    if (itensDaSecao && itensDaSecao.length > 0) {
      const ultimoDaSecao = itensDaSecao[0].ordem;
      ordem = ultimoDaSecao + 1;
      // Shift todos os itens >= ordem por +1 pra abrir espaço
      const { data: paraShift } = await supabase
        .from("template_itens")
        .select("id, ordem")
        .eq("template_id", template_id)
        .gte("ordem", ordem)
        .order("ordem", { ascending: false });
      for (const r of paraShift ?? []) {
        await supabase.from("template_itens").update({ ordem: r.ordem + 1 }).eq("id", r.id);
      }
    } else {
      // Seção nova — adiciona no final
      const { data: maxRow } = await supabase
        .from("template_itens")
        .select("ordem")
        .eq("template_id", template_id)
        .order("ordem", { ascending: false })
        .limit(1);
      ordem = (maxRow?.[0]?.ordem ?? 0) + 1;
    }
  } else {
    // Sem seção — adiciona no final
    const { data: maxRow } = await supabase
      .from("template_itens")
      .select("ordem")
      .eq("template_id", template_id)
      .order("ordem", { ascending: false })
      .limit(1);
    ordem = (maxRow?.[0]?.ordem ?? 0) + 1;
  }

  const { error } = await supabase.from("template_itens").insert({
    template_id,
    ordem,
    texto: item.nome,
    secao: secaoLimpa,
    item_id,
  });
  if (error) return { error: error.message };

  revalidatePath(`/itens/grupos/${template_id}`);
  return {};
}

export async function updateItemDoGrupoAction(
  id: string,
  patch: { texto?: string; secao?: string | null; item_id?: string | null; ordem?: number }
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const dirty: TplItenUpdate = {};
  if (patch.texto !== undefined) {
    const v = patch.texto.trim();
    if (!v) return { error: "Texto não pode estar vazio." };
    dirty.texto = v;
  }
  if (patch.secao !== undefined) dirty.secao = patch.secao?.trim() || null;
  if (patch.item_id !== undefined) {
    // Desvincular é proibido — linha sem item do cadastro vira órfã e quebra
    // contagem/solicitação. Pra tirar a linha, use "Remover".
    if (!patch.item_id) {
      return { error: "Todo item do grupo precisa estar vinculado ao cadastro. Pra tirar a linha, use 'Remover'." };
    }
    dirty.item_id = patch.item_id;
  }
  if (patch.ordem !== undefined) dirty.ordem = patch.ordem;

  const { error, data } = await supabase
    .from("template_itens")
    .update(dirty)
    .eq("id", id)
    .select("template_id")
    .single();
  if (error) return { error: error.message };

  revalidatePath(`/itens/grupos/${data!.template_id}`);
  return {};
}

export async function removerItemDoGrupoAction(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("template_itens")
    .select("template_id")
    .eq("id", id)
    .maybeSingle();
  const { error } = await supabase.from("template_itens").delete().eq("id", id);
  if (error) return { error: error.message };
  if (data) revalidatePath(`/itens/grupos/${data.template_id}`);
  return {};
}

// Reordenação em lote (drag & drop): recebe só as linhas que mudaram de
// posição/seção e persiste. Duas fases pra não colidir com unique de ordem.
export async function reordenarItensAction(
  template_id: string,
  mudancas: { id: string; ordem: number; secao: string | null }[]
): Promise<{ error?: string }> {
  if (!mudancas.length) return {};
  const supabase = await createClient();
  // fase 1: ordens temporárias fora do range real
  for (const m of mudancas) {
    const { error } = await supabase
      .from("template_itens")
      .update({ ordem: -100000 - m.ordem })
      .eq("id", m.id)
      .eq("template_id", template_id);
    if (error) return { error: error.message };
  }
  // fase 2: valores finais
  for (const m of mudancas) {
    const { error } = await supabase
      .from("template_itens")
      .update({ ordem: m.ordem, secao: m.secao?.trim() || null })
      .eq("id", m.id)
      .eq("template_id", template_id);
    if (error) return { error: error.message };
  }
  revalidatePath(`/itens/grupos/${template_id}`);
  return {};
}

export async function moverItemAction(id: string, direcao: "cima" | "baixo"): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: cur } = await supabase
    .from("template_itens")
    .select("template_id, ordem")
    .eq("id", id)
    .maybeSingle();
  if (!cur) return { error: "Item não encontrado." };

  const op = direcao === "cima" ? "lt" : "gt";
  const order: { ascending: boolean } = { ascending: direcao !== "cima" };
  const { data: vizinho } = await supabase
    .from("template_itens")
    .select("id, ordem")
    .eq("template_id", cur.template_id)
    [op]("ordem", cur.ordem)
    .order("ordem", order)
    .limit(1);
  if (!vizinho || vizinho.length === 0) return {};

  const v = vizinho[0];
  // Swap ordens (passando por valor temporário pra evitar conflito de unique se houvesse)
  await supabase.from("template_itens").update({ ordem: -1 }).eq("id", id);
  await supabase.from("template_itens").update({ ordem: cur.ordem }).eq("id", v.id);
  await supabase.from("template_itens").update({ ordem: v.ordem }).eq("id", id);

  revalidatePath(`/itens/grupos/${cur.template_id}`);
  return {};
}
