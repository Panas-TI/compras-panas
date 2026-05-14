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
  patch: { quantidade?: string | null; observacao?: string | null; solicitacao_qtd?: string | null }
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const sanitized: LinhaUpdate = {};
  if (patch.quantidade !== undefined) {
    sanitized.quantidade = patch.quantidade === null ? null : parseNumberBR(patch.quantidade);
  }
  if (patch.observacao !== undefined) {
    sanitized.observacao = patch.observacao || null;
  }
  if (patch.solicitacao_qtd !== undefined) {
    sanitized.solicitacao_qtd = patch.solicitacao_qtd === null ? null : parseNumberBR(patch.solicitacao_qtd);
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

export async function enviarParaSolicitacaoAction(
  contagem_id: string
): Promise<{ error?: string; solicitacao_id?: string; enviadas?: number; criadas?: number }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "comprador" && profile?.role !== "aprovador") {
    return { error: "Apenas comprador ou aprovador podem enviar." };
  }

  // Linhas com solicitação preenchida e ainda não enviadas
  const { data: linhas, error: lerr } = await supabase
    .from("contagem_linhas")
    .select("id, texto, quantidade, solicitacao_qtd, item_id")
    .eq("contagem_id", contagem_id)
    .gt("solicitacao_qtd", 0)
    .is("enviado_em", null)
    .order("ordem");
  if (lerr) return { error: lerr.message };
  if (!linhas || linhas.length === 0) {
    return { error: "Nada pra enviar. Preencha o campo Solicitação em pelo menos uma linha." };
  }

  // Cria solicitação semanal (segunda a sexta da semana atual)
  const today = new Date();
  const dow = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dow + 6) % 7));
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const { data: solic, error: serr } = await supabase
    .from("solicitacoes_semanais")
    .insert({
      data_inicio: fmt(monday),
      data_fim: fmt(friday),
      comprador_id: user.id,
      observacoes: "Gerada a partir da contagem de estoque",
    })
    .select("id")
    .single();
  if (serr) return { error: `Erro criando solicitação: ${serr.message}` };

  const solic_id = solic!.id;

  // Helper: pega ou cria item por nome
  async function findOrCreateItemId(nome: string): Promise<string | null> {
    const trimmed = nome.trim();
    if (!trimmed) return null;
    const { data: found } = await supabase
      .from("itens")
      .select("id")
      .ilike("nome", trimmed)
      .limit(1);
    if (found && found.length > 0) return found[0].id;
    const { data: created, error } = await supabase
      .from("itens")
      .insert({ nome: trimmed, ativo: true })
      .select("id")
      .single();
    if (error) {
      console.error("Falha ao criar item:", trimmed, error);
      return null;
    }
    return created!.id;
  }

  let criadas = 0;
  let enviadas = 0;
  const agora = new Date().toISOString();
  for (const l of linhas) {
    let item_id = l.item_id;
    if (!item_id) {
      item_id = await findOrCreateItemId(l.texto);
      if (item_id) criadas++;
    }
    if (!item_id) continue;

    const { error: linErr } = await supabase.from("solicitacao_linhas").insert({
      solicitacao_id: solic_id,
      item_id,
      volume_estoque: l.quantidade,
      volume_solicitado: l.solicitacao_qtd ?? 0,
    });
    if (linErr) {
      console.error("Falha linha:", linErr);
      continue;
    }

    await supabase
      .from("contagem_linhas")
      .update({ enviado_em: agora, enviado_solicitacao_id: solic_id })
      .eq("id", l.id);
    enviadas++;
  }

  revalidatePath(`/contagem/${contagem_id}`);
  revalidatePath("/solicitacoes");
  return { solicitacao_id: solic_id, enviadas, criadas };
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
