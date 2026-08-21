"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type LinhaUpdate = Database["public"]["Tables"]["solicitacao_linhas"]["Update"];

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


/**
 * Fecha a solicitação quando não sobra nenhuma linha pendente.
 *
 * Antes nada setava `finalizada` — 0 de 14 solicitações tinham a marca. A tela
 * até mostrava "Finalizada" quando as linhas acabavam, mas era só cálculo em
 * memória: o banco nunca sabia que aquilo tinha encerrado.
 */
async function fecharSeCompleta(
  supabase: Awaited<ReturnType<typeof createClient>>,
  linha_id: string
): Promise<void> {
  const { data: linha } = await supabase
    .from("solicitacao_linhas")
    .select("solicitacao_id")
    .eq("id", linha_id)
    .maybeSingle();
  if (!linha?.solicitacao_id) return;

  const { data: pendentes } = await supabase
    .from("solicitacao_linhas")
    .select("id")
    .eq("solicitacao_id", linha.solicitacao_id)
    .not("status", "in", '("Aprovada & Recebida","Recusada","Não Entregue")')
    .limit(1);

  const completa = !pendentes || pendentes.length === 0;
  const { data: solic } = await supabase
    .from("solicitacoes_semanais")
    .select("finalizada, enviada_em")
    .eq("id", linha.solicitacao_id)
    .maybeSingle();

  // Rascunho não finaliza: ainda nem foi lançado pra aprovação.
  if (!solic?.enviada_em) return;

  if (completa && !solic.finalizada) {
    await supabase
      .from("solicitacoes_semanais")
      .update({ finalizada: true, finalizada_em: new Date().toISOString() })
      .eq("id", linha.solicitacao_id);
  } else if (!completa && solic.finalizada) {
    // Desfazer um recebimento reabre a solicitação.
    await supabase
      .from("solicitacoes_semanais")
      .update({ finalizada: false, finalizada_em: null })
      .eq("id", linha.solicitacao_id);
  }
}

/**
 * Marca que o item NÃO chegou.
 *
 * Sem isto o estoquista não tinha saída: a validação exigia quantidade maior
 * que zero, então item que o fornecedor não entregou ficava pendente pra
 * sempre e travava a solicitação inteira em "Em recebimento".
 */
export async function marcarNaoEntregueAction(
  linha_id: string,
  observacao?: string
): Promise<{ error?: string }> {
  const supabase = await createClient();

  // Se já houve entrega parcial, o certo é finalizar com o que veio, não
  // dizer que não veio nada.
  const { data: entregas } = await supabase
    .from("recebimento_entregas")
    .select("id")
    .eq("linha_id", linha_id)
    .limit(1);
  if (entregas && entregas.length > 0) {
    return {
      error:
        "Este item já teve entrega registrada. Use “Finalizar recebimento” para fechar com a quantidade que chegou.",
    };
  }

  const patch: LinhaUpdate = {
    status: "Não Entregue",
    volume_recebido: 0,
    data_recebimento: new Date().toISOString().slice(0, 10),
    observacao_recebimento: observacao?.trim() || "Fornecedor não entregou",
  };
  const { error } = await supabase.from("solicitacao_linhas").update(patch).eq("id", linha_id);
  if (error) return { error: error.message };

  await fecharSeCompleta(supabase, linha_id);
  revalidatePath("/recebimento");
  revalidatePath("/solicitacoes");
  return {};
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

  await fecharSeCompleta(supabase, linha_id);
  revalidatePath("/recebimento");
  revalidatePath("/solicitacoes");
  return {};
}

/** Desfaz o recebimento de uma linha — volta pra pendente. Requer senha. */
export async function desfazerRecebimentoAction(
  linha_id: string,
  senha: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Não autenticado." };

  const ok = await verifySenha(user.email, senha);
  if (!ok) return { error: "Senha incorreta." };

  // Status de volta: se a linha foi alterada e confirmada, volta pra "Volumes ou Preço Alterados"
  const { data: linha } = await supabase
    .from("solicitacao_linhas")
    .select("alteracao_confirmada")
    .eq("id", linha_id)
    .maybeSingle();
  const novoStatus = linha?.alteracao_confirmada ? "Volumes ou Preço Alterados" : "Aprovada";

  // Mantém as entregas registradas — o item volta pendente com o que já foi recebido.
  // (limpa só os campos de finalização)
  const patch: LinhaUpdate = {
    status: novoStatus,
    volume_recebido: null,
    data_recebimento: null,
    observacao_recebimento: null,
  };
  const { error } = await supabase.from("solicitacao_linhas").update(patch).eq("id", linha_id);
  if (error) return { error: error.message };

  // Reabre a solicitação: voltou a ter linha pendente.
  await fecharSeCompleta(supabase, linha_id);
  revalidatePath("/recebimento");
  revalidatePath("/solicitacoes");
  return {};
}
