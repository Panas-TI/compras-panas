"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/database.types";

type EntregaUpdate = Database["public"]["Tables"]["entregas"]["Update"];

export type GpsCapturado = {
  lat: number;
  lng: number;
  precisao_metros: number;
} | null;

export type ValidarState = {
  ok: true;
  entregaId: string;
  codigo: string;
} | {
  ok: false;
  reason: "nao_encontrado" | "outro_motorista" | "outro_dia" | "ja_entregue" | "erro";
  message: string;
} | null;

/**
 * Passo 1: motorista bipa código. Valida que existe, é dele (ou livre), e está disponível.
 * Retorna entregaId pro client puxar a tela de foto.
 * NÃO marca entregue ainda — espera a foto.
 */
export async function validarBipadaAction(codigo: string): Promise<ValidarState> {
  const codigoLimpo = codigo.trim();
  if (!codigoLimpo) return { ok: false, reason: "erro", message: "Código vazio." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "erro", message: "Não autenticado." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, ativo")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.ativo) return { ok: false, reason: "erro", message: "Usuário inativo." };
  if (profile.role !== "motorista" && profile.role !== "aprovador") {
    return { ok: false, reason: "erro", message: "Sem permissão pra entregar." };
  }

  const { data: entrega, error: selErr } = await supabase
    .from("entregas")
    .select("id, codigo_queops, status, motorista_id")
    .eq("codigo_queops", codigoLimpo)
    .maybeSingle();

  if (selErr) return { ok: false, reason: "erro", message: selErr.message };
  if (!entrega) {
    return { ok: false, reason: "nao_encontrado", message: "Esse código não está cadastrado. Avisa o gestor." };
  }

  if (
    profile.role === "motorista" &&
    entrega.motorista_id !== null &&
    entrega.motorista_id !== user.id
  ) {
    return { ok: false, reason: "outro_motorista", message: "Esse pedido está atribuído a outro motorista." };
  }
  if (entrega.status === "entregue") {
    return { ok: false, reason: "ja_entregue", message: "Já marcado como entregue." };
  }
  if (entrega.status === "cancelada") {
    return { ok: false, reason: "erro", message: "Pedido cancelado, não pode ser entregue." };
  }

  return { ok: true, entregaId: entrega.id, codigo: entrega.codigo_queops };
}

export type ConcluirState = {
  ok: true;
  entregaId: string;
} | {
  ok: false;
  error: string;
} | null;

/**
 * Passo 2: motorista tirou foto do canhoto. Faz upload + marca entregue.
 * Foto é OBRIGATÓRIA aqui. GPS é opcional.
 */
export async function concluirEntregaAction(
  entregaId: string,
  fotoBase64: string,
  fotoMediaType: "image/jpeg" | "image/png" | "image/webp",
  gps: GpsCapturado
): Promise<ConcluirState> {
  if (!fotoBase64) return { ok: false, error: "Foto do canhoto é obrigatória." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Não autenticado." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, ativo")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.ativo) return { ok: false, error: "Usuário inativo." };
  if (profile.role !== "motorista" && profile.role !== "aprovador") {
    return { ok: false, error: "Sem permissão." };
  }

  // Valida de novo o estado do pedido (defesa contra race condition)
  const { data: entrega, error: selErr } = await supabase
    .from("entregas")
    .select("id, codigo_queops, status, motorista_id")
    .eq("id", entregaId)
    .maybeSingle();
  if (selErr || !entrega) return { ok: false, error: "Pedido não encontrado." };
  if (entrega.status === "entregue") return { ok: false, error: "Já marcado como entregue." };
  if (
    profile.role === "motorista" &&
    entrega.motorista_id !== null &&
    entrega.motorista_id !== user.id
  ) {
    return { ok: false, error: "Esse pedido está atribuído a outro motorista." };
  }

  // 1) Upload da foto
  const ext = fotoMediaType === "image/png" ? "png" : fotoMediaType === "image/webp" ? "webp" : "jpg";
  const filename = `${entrega.codigo_queops}-${Date.now()}.${ext}`;
  const buffer = Buffer.from(fotoBase64, "base64");
  const { error: upErr } = await supabase.storage
    .from("comprovantes")
    .upload(filename, buffer, { contentType: fotoMediaType, upsert: false });
  if (upErr) {
    return { ok: false, error: `Upload da foto falhou: ${upErr.message}` };
  }

  // 2) Update entrega
  const agora = new Date().toISOString();
  const patch: EntregaUpdate = {
    status: "entregue",
    entregue_at: agora,
    foto_comprovante_url: filename,
    gps_negado: !gps,
    entrega_lat: gps?.lat ?? null,
    entrega_lng: gps?.lng ?? null,
    entrega_precisao_metros: gps ? Math.round(gps.precisao_metros) : null,
  };
  if (profile.role === "motorista" && !entrega.motorista_id) {
    patch.motorista_id = user.id;
  }

  const { error: updErr } = await supabase.from("entregas").update(patch).eq("id", entrega.id);
  if (updErr) {
    // Rollback do upload
    await supabase.storage.from("comprovantes").remove([filename]);
    return { ok: false, error: updErr.message };
  }

  await supabase.from("entrega_log").insert({
    entrega_id: entrega.id,
    usuario_id: user.id,
    acao: "entregue",
    dados_depois: patch as Json,
  });

  revalidatePath("/motorista");
  revalidatePath("/entregas/dia");
  return { ok: true, entregaId: entrega.id };
}
