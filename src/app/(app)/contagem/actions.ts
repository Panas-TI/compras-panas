"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type LinhaUpdate = Database["public"]["Tables"]["contagem_linhas"]["Update"];

async function verifySenha(email: string, senha: string): Promise<boolean> {
  const tmp = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { error } = await tmp.auth.signInWithPassword({ email, password: senha });
  return !error;
}

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
): Promise<{
  error?: string;
  solicitacao_id?: string;
  enviadas?: number;
  solic_criada?: boolean;
  pendentes?: Array<{ id: string; texto: string }>;
}> {
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

  // BLOQUEIO: linhas sem item vinculado não podem ser enviadas.
  // Antes esse fluxo criava itens novos automaticamente, o que gerava
  // duplicatas no catálogo (sem código Queóps / fornecedor / unidade).
  // Agora exigimos vínculo explícito pelo usuário.
  const semItem = linhas.filter((l) => !l.item_id);
  if (semItem.length > 0) {
    const amostra = semItem.slice(0, 5).map((l) => `“${l.texto}”`).join(", ");
    const resto = semItem.length > 5 ? ` e mais ${semItem.length - 5}` : "";
    return {
      error:
        `${semItem.length} ${semItem.length === 1 ? "linha não tem" : "linhas não têm"} item do catálogo vinculado: ` +
        `${amostra}${resto}. Vincule ${semItem.length === 1 ? "essa linha" : "essas linhas"} a um item antes de enviar.`,
      pendentes: semItem.map((l) => ({ id: l.id, texto: l.texto })),
    };
  }

  // Procura solicitação em aberto (rascunho) — prioriza a do próprio usuário
  let solic_id: string | null = null;
  let solicCriada = false;

  const isAprovador = profile.role === "aprovador";

  // Aprovador pode usar qualquer rascunho; comprador só os seus
  let openQ = supabase
    .from("solicitacoes_semanais")
    .select("id, comprador_id")
    .is("enviada_em", null)
    .order("criado_em", { ascending: false })
    .limit(10);
  if (!isAprovador) openQ = openQ.eq("comprador_id", user.id);
  const { data: drafts } = await openQ;

  if (drafts && drafts.length > 0) {
    // Prefere o próprio rascunho do usuário; se não houver, pega o mais recente
    const mine = drafts.find((d) => d.comprador_id === user.id);
    solic_id = (mine ?? drafts[0]).id;
  } else {
    // Cria nova solicitação no dia atual (do dia ao dia)
    const today = new Date().toISOString().slice(0, 10);

    const { data: solic, error: serr } = await supabase
      .from("solicitacoes_semanais")
      .insert({
        data_inicio: today,
        data_fim: today,
        comprador_id: user.id,
        observacoes: "Gerada a partir da contagem de estoque",
      })
      .select("id")
      .single();
    if (serr) return { error: `Erro criando solicitação: ${serr.message}` };
    solic_id = solic!.id;
    solicCriada = true;
  }

  let enviadas = 0;
  const agora = new Date().toISOString();
  for (const l of linhas) {
    const item_id = l.item_id;
    // Após o bloqueio acima, toda linha tem item_id. Guarda defensivo.
    if (!item_id) continue;

    // Busca defaults do item (preço, fornecedor, pagamento, prazo)
    const { data: itemRow } = await supabase
      .from("itens")
      .select("preco_referencia, fornecedor_padrao_id, forma_pagto_padrao_id, prazo_padrao")
      .eq("id", item_id)
      .maybeSingle();

    const { error: linErr } = await supabase.from("solicitacao_linhas").insert({
      solicitacao_id: solic_id,
      item_id,
      volume_estoque: l.quantidade,
      volume_solicitado: l.solicitacao_qtd ?? 0,
      preco: itemRow?.preco_referencia ?? 0,
      fornecedor_id: itemRow?.fornecedor_padrao_id ?? null,
      forma_pagto_id: itemRow?.forma_pagto_padrao_id ?? null,
      prazo: itemRow?.prazo_padrao ?? null,
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
  return { solicitacao_id: solic_id, enviadas, solic_criada: solicCriada };
}

export async function excluirContagemAction(
  contagem_id: string,
  senha: string
): Promise<{ error?: string; ok?: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) return { error: "Não autenticado." };

  const valida = await verifySenha(user.email, senha);
  if (!valida) return { error: "Senha incorreta." };

  const { error, data } = await supabase
    .from("contagens")
    .delete()
    .eq("id", contagem_id)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Sem permissão pra excluir esta contagem." };
  revalidatePath("/contagem");
  return { ok: true };
}
