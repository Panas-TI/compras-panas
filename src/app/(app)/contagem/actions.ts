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

// Mesmo teto usado nas observações da solicitação (solicitacoes/nova).
// Não exportar: num módulo "use server" todo export precisa ser função async.
const MAX_OBS_LEN = 500;

/** Texto livre → trim, corta no limite, vazio vira null (nunca ""). */
function sanitizeTexto(value: string | null | undefined): string | null {
  if (!value) return null;
  const t = value.trim();
  return t ? t.slice(0, MAX_OBS_LEN) : null;
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
  patch: {
    quantidade?: string | null;
    observacao?: string | null;
    observacao_solicitacao?: string | null;
    solicitacao_qtd?: string | null;
  }
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const sanitized: LinhaUpdate = {};
  if (patch.quantidade !== undefined) {
    sanitized.quantidade = patch.quantidade === null ? null : parseNumberBR(patch.quantidade);
  }
  if (patch.observacao !== undefined) {
    sanitized.observacao = patch.observacao || null;
  }
  if (patch.observacao_solicitacao !== undefined) {
    // A justificativa é da compra, não da contagem: só quem pode solicitar
    // escreve nela. A UI já esconde o campo, mas a action é chamável direto.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Não autenticado." };
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.role !== "comprador" && profile?.role !== "aprovador") {
      return { error: "Apenas comprador ou aprovador podem preencher a justificativa." };
    }
    sanitized.observacao_solicitacao = sanitizeTexto(patch.observacao_solicitacao);
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
    .select("id, texto, quantidade, solicitacao_qtd, item_id, observacao_solicitacao")
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

  // Destino por IDENTIDADE, não por estado.
  //
  // Antes isto procurava "qualquer rascunho com enviada_em IS NULL" e anexava
  // as linhas nele. Bastava existir um rascunho aberto — de outra contagem, do
  // MRP, de outro usuário — pra duas contagens se misturarem numa solicitação
  // só, duplicando todo item presente nas duas. Foi assim que a solicitação de
  // 17/08 acabou com ACEM e PRESUNTO em dobro.
  //
  // Agora só reaproveita a solicitação QUE ESTA CONTAGEM já criou, o que
  // preserva o reenvio legítimo (o usuário preenche mais linhas e clica de novo)
  // sem nunca capturar rascunho alheio.
  let solic_id: string | null = null;
  let solicCriada = false;

  const { data: jaExiste } = await supabase
    .from("solicitacoes_semanais")
    .select("id, enviada_em")
    .eq("contagem_id", contagem_id)
    .maybeSingle();

  if (jaExiste) {
    if (jaExiste.enviada_em) {
      return {
        error:
          "Esta contagem já gerou uma solicitação, e ela já foi lançada para aprovação. " +
          "Adicione o item que faltou direto nela, em Solicitações.",
        solicitacao_id: jaExiste.id,
      };
    }
    solic_id = jaExiste.id;
  } else {
    // Datas vêm da contagem, não de "hoje": o envio costuma acontecer dias
    // depois, e a solicitação passava a mentir sobre o período que representa.
    const { data: cont } = await supabase
      .from("contagens")
      .select("data_contagem")
      .eq("id", contagem_id)
      .maybeSingle();
    const dataRef = cont?.data_contagem ?? new Date().toISOString().slice(0, 10);

    const { data: solic, error: serr } = await supabase
      .from("solicitacoes_semanais")
      .insert({
        data_inicio: dataRef,
        data_fim: dataRef,
        comprador_id: user.id,
        contagem_id,
        origem: "CONTAGEM",
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

  // UMA linha de solicitação por ITEM, não por linha de contagem.
  //
  // Duas linhas da pasta podem apontar pro MESMO item do catálogo (o molho de
  // tomate aparece como sachê e como lata, ambos vinculados ao mesmo cadastro).
  // O loop antigo inseria uma linha por linha de contagem e o item entrava
  // duplicado na solicitação mesmo sem mistura de contagens. Havia 21 pares
  // (contagem, item) repetidos no banco quando isto foi escrito.
  const porItem = new Map<string, typeof linhas>();
  for (const l of linhas) {
    if (!l.item_id) continue; // o bloqueio acima já garante, guarda defensiva
    const g = porItem.get(l.item_id);
    if (g) g.push(l);
    else porItem.set(l.item_id, [l]);
  }

  // Itens que já estão na solicitação (caso de reenvio): não duplicar.
  const { data: jaNaSolic } = await supabase
    .from("solicitacao_linhas")
    .select("item_id")
    .eq("solicitacao_id", solic_id);
  const jaTem = new Set((jaNaSolic ?? []).map((r) => r.item_id));

  const falhas: string[] = [];

  for (const [item_id, grupo] of porItem) {
    if (jaTem.has(item_id)) {
      // Já existe linha desse item. Marca as de contagem como enviadas pra não
      // ficarem penduradas, mas não cria linha nova.
      await supabase
        .from("contagem_linhas")
        .update({ enviado_em: agora, enviado_solicitacao_id: solic_id })
        .in("id", grupo.map((l) => l.id));
      continue;
    }

    const { data: itemRow } = await supabase
      .from("itens")
      .select("preco_referencia, fornecedor_padrao_id, forma_pagto_padrao_id, prazo_padrao")
      .eq("id", item_id)
      .maybeSingle();

    // Quantidades somadas; estoque só soma se alguma linha tiver contagem.
    const volume_solicitado = grupo.reduce((s, l) => s + Number(l.solicitacao_qtd ?? 0), 0);
    const volume_estoque = grupo.some((l) => l.quantidade != null)
      ? grupo.reduce((s, l) => s + Number(l.quantidade ?? 0), 0)
      : null;
    const observacoes =
      grupo.map((l) => l.observacao_solicitacao).filter(Boolean).join(" | ") || null;

    const { data: linhaCriada, error: linErr } = await supabase
      .from("solicitacao_linhas")
      .insert({
        solicitacao_id: solic_id,
        item_id,
        volume_estoque,
        volume_solicitado,
        preco: itemRow?.preco_referencia ?? 0,
        fornecedor_id: itemRow?.fornecedor_padrao_id ?? null,
        forma_pagto_id: itemRow?.forma_pagto_padrao_id ?? null,
        prazo: itemRow?.prazo_padrao ?? null,
        observacoes,
      })
      .select("id")
      .single();

    if (linErr) {
      // Erro engolido vira linha perdida sem ninguém saber. Acumula e reporta.
      falhas.push(`${grupo[0].texto}: ${linErr.message}`);
      continue;
    }
    jaTem.add(item_id);

    // Todas as linhas do grupo apontam pra MESMA linha de solicitação.
    // A FK é N:1 e o embed da tela de contagem continua resolvendo.
    const { error: updErr } = await supabase
      .from("contagem_linhas")
      .update({
        enviado_em: agora,
        enviado_solicitacao_id: solic_id,
        enviado_linha_id: linhaCriada?.id ?? null,
      })
      .in("id", grupo.map((l) => l.id));
    if (updErr) {
      falhas.push(`${grupo[0].texto}: gravou a compra mas não marcou a contagem (${updErr.message})`);
      continue;
    }
    enviadas += grupo.length;
  }

  if (falhas.length > 0 && enviadas === 0) {
    return { error: `Nenhuma linha foi enviada. Primeiro erro — ${falhas[0]}` };
  }

  revalidatePath(`/contagem/${contagem_id}`);
  revalidatePath("/solicitacoes");
  return {
    solicitacao_id: solic_id,
    enviadas,
    solic_criada: solicCriada,
    ...(falhas.length > 0
      ? { error: `${enviadas} enviadas, mas ${falhas.length} falharam. Primeira: ${falhas[0]}` }
      : {}),
  };
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
