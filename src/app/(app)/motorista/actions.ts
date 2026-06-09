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

export type MarcarState = {
  ok: true;
  entregaId: string;
  codigo: string;
} | {
  ok: false;
  reason: "nao_encontrado" | "outro_motorista" | "outro_dia" | "ja_entregue" | "erro";
  message: string;
} | null;

/**
 * Motorista bipa o código de barras. Marca como entregue se:
 * - código existe
 * - está atribuído a este motorista
 * - status é pendente ou em_rota
 *
 * GPS opcional: se capturado, grava lat/lng/precisão. Se negado, grava gps_negado=true.
 */
export async function marcarEntregueAction(codigo: string, gps: GpsCapturado): Promise<MarcarState> {
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

  // Busca entrega pelo código
  const { data: entrega, error: selErr } = await supabase
    .from("entregas")
    .select("id, codigo_queops, data_entrega, status, motorista_id")
    .eq("codigo_queops", codigoLimpo)
    .maybeSingle();

  if (selErr) return { ok: false, reason: "erro", message: selErr.message };
  if (!entrega) {
    return {
      ok: false,
      reason: "nao_encontrado",
      message: "Esse código não está cadastrado. Avisa o gestor.",
    };
  }

  // Motorista comum: só pode entregar a sua própria
  if (profile.role === "motorista" && entrega.motorista_id !== user.id) {
    return {
      ok: false,
      reason: "outro_motorista",
      message: "Esse pedido está atribuído a outro motorista.",
    };
  }

  if (entrega.status === "entregue") {
    return {
      ok: false,
      reason: "ja_entregue",
      message: "Já marcado como entregue.",
    };
  }

  if (entrega.status === "cancelada") {
    return {
      ok: false,
      reason: "erro",
      message: "Pedido cancelado, não pode ser entregue.",
    };
  }

  // Update
  const agora = new Date().toISOString();
  const patch: EntregaUpdate = {
    status: "entregue",
    entregue_at: agora,
    gps_negado: !gps,
    entrega_lat: gps?.lat ?? null,
    entrega_lng: gps?.lng ?? null,
    entrega_precisao_metros: gps ? Math.round(gps.precisao_metros) : null,
  };

  const { error: updErr } = await supabase
    .from("entregas")
    .update(patch)
    .eq("id", entrega.id);
  if (updErr) return { ok: false, reason: "erro", message: updErr.message };

  // Log (não bloqueia se falhar)
  await supabase.from("entrega_log").insert({
    entrega_id: entrega.id,
    usuario_id: user.id,
    acao: "entregue",
    dados_depois: patch as Json,
  });

  revalidatePath("/motorista");
  revalidatePath("/entregas/dia");
  return { ok: true, entregaId: entrega.id, codigo: entrega.codigo_queops };
}
