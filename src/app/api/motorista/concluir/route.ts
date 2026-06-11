/**
 * POST /api/motorista/concluir
 *
 * Conclui a entrega: upload da foto do pedido + marca como entregue + GPS.
 * Body: { entregaId, fotoBase64, mediaType, gps?: {lat,lng,precisao_metros} }
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/database.types";

type EntregaUpdate = Database["public"]["Tables"]["entregas"]["Update"];

export type ConcluirResp =
  | { ok: true; entregaId: string }
  | { ok: false; error: string };

export async function POST(req: NextRequest): Promise<NextResponse<ConcluirResp>> {
  try {
    const body = await req.json().catch(() => ({}));
    const entregaId = typeof body?.entregaId === "string" ? body.entregaId : "";
    const fotoBase64 = typeof body?.fotoBase64 === "string" ? body.fotoBase64 : "";
    const fotoMediaTypeRaw = typeof body?.mediaType === "string" ? body.mediaType : "image/jpeg";
    const fotoMediaType: "image/jpeg" | "image/png" | "image/webp" =
      fotoMediaTypeRaw === "image/png"
        ? "image/png"
        : fotoMediaTypeRaw === "image/webp"
          ? "image/webp"
          : "image/jpeg";
    const gpsRaw = body?.gps;
    const gps =
      gpsRaw && typeof gpsRaw === "object" && typeof gpsRaw.lat === "number" && typeof gpsRaw.lng === "number"
        ? {
            lat: gpsRaw.lat as number,
            lng: gpsRaw.lng as number,
            precisao_metros: typeof gpsRaw.precisao_metros === "number" ? gpsRaw.precisao_metros : 0,
          }
        : null;

    if (!entregaId) return NextResponse.json({ ok: false, error: "entregaId obrigatório." });
    if (!fotoBase64) return NextResponse.json({ ok: false, error: "Foto do pedido é obrigatória." });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Não autenticado." });

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, ativo")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile?.ativo) return NextResponse.json({ ok: false, error: "Usuário inativo." });
    if (!["motorista", "aprovador", "comprador"].includes(profile.role)) {
      return NextResponse.json({ ok: false, error: "Sem permissão." });
    }

    const { data: entrega, error: selErr } = await supabase
      .from("entregas")
      .select("id, codigo_queops, status, motorista_id")
      .eq("id", entregaId)
      .maybeSingle();
    if (selErr || !entrega) return NextResponse.json({ ok: false, error: "Pedido não encontrado." });
    if (entrega.status === "entregue") {
      return NextResponse.json({ ok: false, error: "Já marcado como entregue." });
    }
    if (
      profile.role === "motorista" &&
      entrega.motorista_id !== null &&
      entrega.motorista_id !== user.id
    ) {
      return NextResponse.json({
        ok: false,
        error: "Esse pedido está atribuído a outro motorista.",
      });
    }

    const ext = fotoMediaType === "image/png" ? "png" : fotoMediaType === "image/webp" ? "webp" : "jpg";
    const filename = `${entrega.codigo_queops}-${Date.now()}.${ext}`;
    const buffer = Buffer.from(fotoBase64, "base64");
    const { error: upErr } = await supabase.storage
      .from("comprovantes")
      .upload(filename, buffer, { contentType: fotoMediaType, upsert: false });
    if (upErr) {
      return NextResponse.json({ ok: false, error: `Upload da foto falhou: ${upErr.message}` });
    }

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
      await supabase.storage.from("comprovantes").remove([filename]);
      return NextResponse.json({ ok: false, error: updErr.message });
    }

    await supabase.from("entrega_log").insert({
      entrega_id: entrega.id,
      usuario_id: user.id,
      acao: "entregue",
      dados_depois: patch as Json,
    });

    revalidatePath("/motorista");
    revalidatePath("/entregas/dia");
    return NextResponse.json({ ok: true, entregaId: entrega.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[/api/motorista/concluir] erro:", msg);
    return NextResponse.json({ ok: false, error: `Erro do servidor: ${msg}` });
  }
}
