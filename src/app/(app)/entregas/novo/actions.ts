"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { extrairDadosDoPedido, type DadosExtraidos, type ExtractResult } from "@/lib/anthropic/extract-pedido";

async function assertAprovador() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, ativo")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.ativo || profile.role !== "aprovador") {
    return { ok: false as const, error: "Apenas aprovador pode cadastrar entregas." };
  }
  return { ok: true as const, userId: user.id };
}

export type ExtrairState = {
  ok: true;
  result: ExtractResult;
} | {
  ok: false;
  error: string;
} | null;

/**
 * Recebe a foto já comprimida (base64) e o mediaType.
 * Chama Claude pra extrair campos. Retorna pro client revisar.
 * NÃO salva no banco — quem salva é salvarEntregaAction depois da revisão.
 */
export async function extrairAction(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp"
): Promise<ExtrairState> {
  const guard = await assertAprovador();
  if (!guard.ok) return { ok: false, error: guard.error };

  if (!imageBase64) return { ok: false, error: "Imagem vazia." };

  try {
    const result = await extrairDadosDoPedido(imageBase64, mediaType);
    return { ok: true, result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export type SalvarState = {
  ok: true;
  entregaId: string;
} | {
  ok: false;
  error: string;
} | null;

/**
 * Salva a entrega no banco depois do humano revisar os campos.
 * Faz upload da foto original pro bucket 'pedidos-originais' e grava a URL.
 */
export async function salvarEntregaAction(
  dados: DadosExtraidos,
  custoOcrUsd: number,
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp"
): Promise<SalvarState> {
  const guard = await assertAprovador();
  if (!guard.ok) return { ok: false, error: guard.error };

  if (!dados.codigo_queops) return { ok: false, error: "Código Queóps é obrigatório." };
  if (!dados.cliente_nome) return { ok: false, error: "Cliente é obrigatório." };
  if (!dados.data_entrega) return { ok: false, error: "Data de entrega é obrigatória." };
  if (!dados.endereco_rua) return { ok: false, error: "Endereço é obrigatório." };

  const supabase = await createClient();

  // 1) Upload da foto original
  const ext = mediaType === "image/png" ? "png" : mediaType === "image/webp" ? "webp" : "jpg";
  const filename = `${dados.codigo_queops}-${Date.now()}.${ext}`;
  const buffer = Buffer.from(imageBase64, "base64");

  const { error: upErr } = await supabase.storage
    .from("pedidos-originais")
    .upload(filename, buffer, { contentType: mediaType, upsert: false });
  if (upErr) {
    if (upErr.message.toLowerCase().includes("already exists")) {
      return { ok: false, error: `Já existe arquivo com nome ${filename}. Cadastre um pedido com código diferente.` };
    }
    return { ok: false, error: `Upload da foto falhou: ${upErr.message}` };
  }

  // 2) Insert da entrega
  const { data: inserted, error: insErr } = await supabase
    .from("entregas")
    .insert({
      codigo_queops: dados.codigo_queops,
      data_entrega: dados.data_entrega,
      hora_entrega: dados.hora_entrega,
      area_entrega: dados.area_entrega,
      cliente_nome: dados.cliente_nome,
      cliente_telefone: dados.cliente_telefone,
      contato_nome: dados.contato_nome,
      endereco_rua: dados.endereco_rua,
      endereco_numero: dados.endereco_numero,
      endereco_complemento: dados.endereco_complemento,
      bairro: dados.bairro,
      cidade: dados.cidade,
      uf: dados.uf,
      observacoes: dados.observacoes,
      valor_total: dados.valor_total ?? 0,
      total_fisico: dados.total_fisico,
      itens_json: dados.itens ?? [],
      foto_pedido_original_url: filename,
      custo_ocr_usd: custoOcrUsd,
      status: "pendente",
      created_by: guard.userId,
    })
    .select("id")
    .single();

  if (insErr) {
    // rollback do upload
    await supabase.storage.from("pedidos-originais").remove([filename]);
    if (insErr.code === "23505") {
      return { ok: false, error: `Já existe entrega com código ${dados.codigo_queops}.` };
    }
    return { ok: false, error: insErr.message };
  }

  revalidatePath("/entregas/dia");
  return { ok: true, entregaId: inserted!.id };
}
