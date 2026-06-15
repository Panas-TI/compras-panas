"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type ProdutoUpdate = Database["public"]["Tables"]["produto"]["Update"];

async function assertAccess() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, ativo")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.ativo || !["aprovador", "comprador"].includes(profile.role)) {
    return { ok: false as const, error: "Sem permissão." };
  }
  return { ok: true as const, userId: user.id };
}

export type LinhaFichaInput = {
  tipo: "mp" | "produto";
  ref_id: string;
  quantidade: number;
  merma_percent: number;
  observacoes?: string | null;
};

/**
 * Salva nova VERSÃO da ficha técnica.
 *
 * - Desativa a versão vigente atual (vigente=false, data_vigencia_fim=hoje).
 * - Cria nova ficha_tecnica com versao = max(versao) + 1, vigente=true.
 * - Insere as linhas (ficha_item) na nova versão.
 *
 * Garante reproducibilidade: cálculos antigos referenciam a versão antiga e
 * continuam mostrando os mesmos números.
 */
export async function salvarFichaAction(
  produtoId: string,
  linhas: LinhaFichaInput[],
  observacoes?: string
): Promise<{ error?: string; novaVersaoId?: string }> {
  const guard = await assertAccess();
  if (!guard.ok) return { error: guard.error };

  // Validação básica
  if (linhas.length === 0) return { error: "A ficha precisa de pelo menos 1 ingrediente." };
  for (const l of linhas) {
    if (!l.ref_id) return { error: "Linha sem item selecionado." };
    if (l.quantidade <= 0) return { error: "Quantidade precisa ser maior que zero." };
    if (l.merma_percent < 0 || l.merma_percent > 100) {
      return { error: "Merma precisa estar entre 0 e 100%." };
    }
    if (l.tipo === "produto" && l.ref_id === produtoId) {
      return { error: "Produto não pode se referenciar (loop infinito)." };
    }
  }

  const supabase = await createClient();

  // 1) Pega a versão vigente atual (se houver)
  const { data: vigenteAtual } = await supabase
    .from("ficha_tecnica")
    .select("id, versao")
    .eq("produto_id", produtoId)
    .eq("vigente", true)
    .maybeSingle();

  // 2) Calcula próxima versão
  const { data: maxVersao } = await supabase
    .from("ficha_tecnica")
    .select("versao")
    .eq("produto_id", produtoId)
    .order("versao", { ascending: false })
    .limit(1)
    .maybeSingle();
  const novaVersao = (maxVersao?.versao ?? 0) + 1;

  // 3) Desativa a vigente atual (pra a partial unique index não conflitar)
  if (vigenteAtual) {
    const hoje = new Date().toISOString().slice(0, 10);
    await supabase
      .from("ficha_tecnica")
      .update({ vigente: false, data_vigencia_fim: hoje })
      .eq("id", vigenteAtual.id);
  }

  // 4) Cria a nova versão (vigente)
  const { data: novaFicha, error: insErr } = await supabase
    .from("ficha_tecnica")
    .insert({
      produto_id: produtoId,
      versao: novaVersao,
      vigente: true,
      data_vigencia_inicio: new Date().toISOString().slice(0, 10),
      observacoes: observacoes?.trim() || null,
      criado_por: guard.userId,
    })
    .select("id")
    .single();

  if (insErr || !novaFicha) {
    // Reativa a antiga se algo deu errado (best effort)
    if (vigenteAtual) {
      await supabase
        .from("ficha_tecnica")
        .update({ vigente: true, data_vigencia_fim: null })
        .eq("id", vigenteAtual.id);
    }
    return { error: insErr?.message ?? "Falha ao criar nova versão." };
  }

  // 5) Insere as linhas (mp OU produto_referenciado, mutuamente exclusivos)
  const payload = linhas.map((l, idx) => ({
    ficha_id: novaFicha.id,
    materia_prima_id: l.tipo === "mp" ? l.ref_id : null,
    produto_referenciado_id: l.tipo === "produto" ? l.ref_id : null,
    quantidade: l.quantidade,
    merma_percent: l.merma_percent,
    observacoes: l.observacoes?.trim() || null,
    ordem: idx + 1,
  }));

  const { error: linhasErr } = await supabase.from("ficha_item").insert(payload);
  if (linhasErr) {
    // Rollback: apaga a ficha nova, reativa a antiga
    await supabase.from("ficha_tecnica").delete().eq("id", novaFicha.id);
    if (vigenteAtual) {
      await supabase
        .from("ficha_tecnica")
        .update({ vigente: true, data_vigencia_fim: null })
        .eq("id", vigenteAtual.id);
    }
    return { error: linhasErr.message };
  }

  revalidatePath(`/mrp/produtos/${produtoId}`);
  revalidatePath("/mrp/produtos");
  revalidatePath("/mrp");
  return { novaVersaoId: novaFicha.id };
}

export async function atualizarProdutoAction(
  produtoId: string,
  patch: { nome?: string; categoria?: string; unidade_producao?: string; ativo?: boolean }
): Promise<{ error?: string }> {
  const guard = await assertAccess();
  if (!guard.ok) return { error: guard.error };

  const dirty: ProdutoUpdate = {};
  if (patch.nome !== undefined) {
    const v = patch.nome.trim();
    if (!v) return { error: "Nome obrigatório." };
    dirty.nome = v;
  }
  if (patch.categoria !== undefined) dirty.categoria = patch.categoria.trim();
  if (patch.unidade_producao !== undefined) dirty.unidade_producao = patch.unidade_producao.trim();
  if (patch.ativo !== undefined) dirty.ativo = patch.ativo;

  const supabase = await createClient();
  const { error } = await supabase.from("produto").update(dirty).eq("id", produtoId);
  if (error) return { error: error.message };
  revalidatePath(`/mrp/produtos/${produtoId}`);
  revalidatePath("/mrp/produtos");
  return {};
}

export async function criarProdutoAction(
  _prev: { error?: string; ok?: boolean } | null,
  fd: FormData
): Promise<{ error?: string; ok?: boolean }> {
  const guard = await assertAccess();
  if (!guard.ok) return { error: guard.error };

  const nome = String(fd.get("nome") ?? "").trim();
  const codigo = String(fd.get("codigo_queops") ?? "").trim() || null;
  const categoria = String(fd.get("categoria") ?? "OUTRO").trim() || "OUTRO";
  const unidade = String(fd.get("unidade_producao") ?? "UN").trim() || "UN";
  if (!nome) return { error: "Nome obrigatório." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produto")
    .insert({ nome, codigo_queops: codigo, categoria, unidade_producao: unidade })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { error: "Já existe produto com esse código Queóps." };
    return { error: error.message };
  }
  revalidatePath("/mrp/produtos");
  redirect(`/mrp/produtos/${data.id}`);
}

export async function ativarVersaoAntigaAction(
  produtoId: string,
  fichaId: string
): Promise<{ error?: string }> {
  const guard = await assertAccess();
  if (!guard.ok) return { error: guard.error };

  const supabase = await createClient();
  // Desativa atual
  await supabase
    .from("ficha_tecnica")
    .update({ vigente: false, data_vigencia_fim: new Date().toISOString().slice(0, 10) })
    .eq("produto_id", produtoId)
    .eq("vigente", true);
  // Ativa a escolhida
  const { error } = await supabase
    .from("ficha_tecnica")
    .update({ vigente: true, data_vigencia_fim: null })
    .eq("id", fichaId);
  if (error) return { error: error.message };
  revalidatePath(`/mrp/produtos/${produtoId}`);
  return {};
}
