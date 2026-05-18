"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type LinhaUpdate = Database["public"]["Tables"]["solicitacao_linhas"]["Update"];

async function verifySenha(email: string, senha: string): Promise<boolean> {
  // Cliente novo (sem persistência) só pra checar a senha — não toca a sessão SSR
  const tmp = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { error } = await tmp.auth.signInWithPassword({ email, password: senha });
  return !error;
}

export type CreateSolicState = { error?: string } | null;

function parseNumberBR(value: string | null | undefined): number | null {
  if (!value || !value.trim()) return null;
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export async function createSolicitacaoAction(
  _prev: CreateSolicState,
  formData: FormData
): Promise<CreateSolicState> {
  const data_inicio = String(formData.get("data_inicio") ?? "");
  const data_fim = String(formData.get("data_fim") ?? "");
  const observacoes = String(formData.get("observacoes") ?? "").trim() || null;

  if (!data_inicio || !data_fim) {
    return { error: "Informe as datas de início e fim." };
  }
  if (data_fim < data_inicio) {
    return { error: "A data de fim deve ser maior ou igual à de início." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const { data, error } = await supabase
    .from("solicitacoes_semanais")
    .insert({ data_inicio, data_fim, observacoes, comprador_id: user.id })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/solicitacoes");
  redirect(`/solicitacoes/${data!.id}`);
}

export async function addLinhaAction(
  solicitacao_id: string,
  item_id: string
): Promise<{ error?: string; linha_id?: string }> {
  const supabase = await createClient();

  // Carrega defaults do item
  const { data: item, error: itemErr } = await supabase
    .from("itens")
    .select("preco_referencia, fornecedor_padrao_id, forma_pagto_padrao_id, prazo_padrao")
    .eq("id", item_id)
    .maybeSingle();
  if (itemErr || !item) return { error: "Item não encontrado." };

  const { data, error } = await supabase
    .from("solicitacao_linhas")
    .insert({
      solicitacao_id,
      item_id,
      volume_estoque: null,
      volume_solicitado: 0,
      preco: item.preco_referencia ?? 0,
      fornecedor_id: item.fornecedor_padrao_id,
      forma_pagto_id: item.forma_pagto_padrao_id,
      prazo: item.prazo_padrao,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  revalidatePath(`/solicitacoes/${solicitacao_id}`);
  return { linha_id: data!.id };
}

export async function updateLinhaAction(
  linha_id: string,
  patch: Record<string, unknown>
): Promise<{ error?: string }> {
  const supabase = await createClient();

  // Sanitização de números BR
  const sanitized: Record<string, unknown> = { ...patch };
  for (const key of ["volume_estoque", "volume_solicitado", "preco"]) {
    if (sanitized[key] != null && typeof sanitized[key] === "string") {
      sanitized[key] = parseNumberBR(sanitized[key] as string);
    }
  }
  for (const key of ["fornecedor_id", "forma_pagto_id"]) {
    if (sanitized[key] === "") sanitized[key] = null;
  }
  if (sanitized.prazo === "") sanitized.prazo = null;

  const { error, data } = await supabase
    .from("solicitacao_linhas")
    .update(sanitized as LinhaUpdate)
    .eq("id", linha_id)
    .select("solicitacao_id")
    .single();
  if (error) return { error: error.message };

  revalidatePath(`/solicitacoes/${data!.solicitacao_id}`);
  return {};
}

export async function removeLinhaAction(linha_id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: linha } = await supabase
    .from("solicitacao_linhas")
    .select("solicitacao_id, solicitacoes_semanais(enviada_em)")
    .eq("id", linha_id)
    .maybeSingle();
  if (!linha) return { error: "Linha não encontrada." };
  // Só permite delete antes de enviar pra aprovação
  if (linha.solicitacoes_semanais?.enviada_em) {
    return { error: "Não é possível remover linha de solicitação já enviada." };
  }

  const { error } = await supabase.from("solicitacao_linhas").delete().eq("id", linha_id);
  if (error) return { error: error.message };

  revalidatePath(`/solicitacoes/${linha.solicitacao_id}`);
  return {};
}

export async function excluirSolicitacaoAction(
  solicitacao_id: string,
  senha: string
): Promise<{ error?: string; ok?: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) return { error: "Não autenticado." };

  const valida = await verifySenha(user.email, senha);
  if (!valida) return { error: "Senha incorreta." };

  // Bloqueia exclusão de solicitação já finalizada (segurança extra)
  const { data: solic } = await supabase
    .from("solicitacoes_semanais")
    .select("comprador_id, finalizada")
    .eq("id", solicitacao_id)
    .maybeSingle();
  if (!solic) return { error: "Solicitação não encontrada." };
  if (solic.finalizada) return { error: "Não é possível excluir solicitação finalizada." };

  // Só o próprio comprador ou um aprovador podem excluir
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "aprovador" && solic.comprador_id !== user.id) {
    return { error: "Sem permissão pra excluir esta solicitação." };
  }

  const { error, data: deleted } = await supabase
    .from("solicitacoes_semanais")
    .delete()
    .eq("id", solicitacao_id)
    .select("id");
  if (error) return { error: error.message };
  if (!deleted || deleted.length === 0) {
    return { error: "Não foi possível excluir (sem permissão ou já removida)." };
  }

  revalidatePath("/solicitacoes");
  return { ok: true };
}

export async function enviarParaAprovacaoAction(solicitacao_id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: linhas } = await supabase
    .from("solicitacao_linhas")
    .select("id")
    .eq("solicitacao_id", solicitacao_id);
  if (!linhas || linhas.length === 0) {
    return { error: "Adicione pelo menos uma linha antes de enviar." };
  }
  const { error } = await supabase
    .from("solicitacoes_semanais")
    .update({ enviada_em: new Date().toISOString() })
    .eq("id", solicitacao_id);
  if (error) return { error: error.message };
  revalidatePath(`/solicitacoes/${solicitacao_id}`);
  revalidatePath("/aprovacoes");
  return {};
}

export async function aprovarLinhaAction(linha_id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error, data } = await supabase
    .from("solicitacao_linhas")
    .update({ status: "Aprovada" })
    .eq("id", linha_id)
    .select("solicitacao_id")
    .single();
  if (error) return { error: error.message };
  revalidatePath(`/solicitacoes/${data!.solicitacao_id}`);
  revalidatePath("/aprovacoes");
  return {};
}

export async function recusarLinhaAction(linha_id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error, data } = await supabase
    .from("solicitacao_linhas")
    .update({ status: "Recusada" })
    .eq("id", linha_id)
    .select("solicitacao_id")
    .single();
  if (error) return { error: error.message };
  revalidatePath(`/solicitacoes/${data!.solicitacao_id}`);
  revalidatePath("/aprovacoes");
  return {};
}

export async function aprovarComAlteracaoAction(linha_id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error, data } = await supabase
    .from("solicitacao_linhas")
    .update({ status: "Volumes ou Preço Alterados", alteracao_confirmada: false })
    .eq("id", linha_id)
    .select("solicitacao_id")
    .single();
  if (error) return { error: error.message };
  revalidatePath(`/solicitacoes/${data!.solicitacao_id}`);
  revalidatePath("/aprovacoes");
  return {};
}

export async function confirmarAlteracaoAction(linha_id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error, data } = await supabase
    .from("solicitacao_linhas")
    .update({ alteracao_confirmada: true })
    .eq("id", linha_id)
    .select("solicitacao_id")
    .single();
  if (error) return { error: error.message };
  revalidatePath(`/solicitacoes/${data!.solicitacao_id}`);
  revalidatePath("/aprovacoes");
  return {};
}

export async function bulkAprovarAction(
  solicitacao_id: string
): Promise<{ error?: string; aprovadas?: number; pulados?: number; erros?: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bulk_aprovar", { p_solic_id: solicitacao_id });
  if (error) return { error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  revalidatePath(`/solicitacoes/${solicitacao_id}`);
  revalidatePath("/aprovacoes");
  return {
    aprovadas: row?.aprovadas ?? 0,
    pulados: row?.pulados_sem_codigo ?? 0,
    erros: row?.erros ?? 0,
  };
}

export async function reabrirLinhaAction(linha_id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const patch: LinhaUpdate = {
    status: "Para Aprovar",
    aprovado_em: null,
    aprovado_por: null,
    recebido_em: null,
    recebido_por: null,
    data_recebimento: null,
    alteracao_confirmada: false,
    codigo_queops_congelado: null,
    nome_item_congelado: null,
    classificacao_congelada: null,
    unidade_congelada: null,
  };
  const { error, data } = await supabase
    .from("solicitacao_linhas")
    .update(patch)
    .eq("id", linha_id)
    .select("solicitacao_id")
    .single();
  if (error) return { error: error.message };
  revalidatePath(`/solicitacoes/${data!.solicitacao_id}`);
  revalidatePath("/recebimento");
  return {};
}

export async function marcarRecebidoAction(linha_id: string, data_recebimento?: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const patch: LinhaUpdate = { status: "Aprovada & Recebida" };
  if (data_recebimento) patch.data_recebimento = data_recebimento;
  const { error, data } = await supabase
    .from("solicitacao_linhas")
    .update(patch)
    .eq("id", linha_id)
    .select("solicitacao_id")
    .single();
  if (error) return { error: error.message };
  revalidatePath(`/solicitacoes/${data!.solicitacao_id}`);
  return {};
}
