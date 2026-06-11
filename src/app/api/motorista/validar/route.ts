/**
 * POST /api/motorista/validar
 *
 * Valida que o código bipado pode ser entregue pelo motorista logado.
 * NÃO marca como entregue ainda — só checa.
 *
 * Body: { codigo: string }
 * Resposta: ValidarResp
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type ValidarResp =
  | { ok: true; entregaId: string; codigo: string }
  | {
      ok: false;
      reason: "nao_encontrado" | "outro_motorista" | "outro_dia" | "ja_entregue" | "erro";
      message: string;
    };

export async function POST(req: NextRequest): Promise<NextResponse<ValidarResp>> {
  try {
    const body = await req.json().catch(() => ({}));
    const codigo = typeof body?.codigo === "string" ? body.codigo.trim() : "";
    if (!codigo) {
      return NextResponse.json({ ok: false, reason: "erro", message: "Código vazio." });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, reason: "erro", message: "Não autenticado." });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, ativo")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile?.ativo) {
      return NextResponse.json({ ok: false, reason: "erro", message: "Usuário inativo." });
    }
    if (!["motorista", "aprovador", "comprador"].includes(profile.role)) {
      return NextResponse.json({ ok: false, reason: "erro", message: "Sem permissão pra entregar." });
    }

    const { data: entrega, error: selErr } = await supabase
      .from("entregas")
      .select("id, codigo_queops, status, motorista_id")
      .eq("codigo_queops", codigo)
      .maybeSingle();

    if (selErr) {
      return NextResponse.json({ ok: false, reason: "erro", message: selErr.message });
    }
    if (!entrega) {
      return NextResponse.json({
        ok: false,
        reason: "nao_encontrado",
        message: "Esse código não está cadastrado. Avisa o gestor.",
      });
    }

    if (
      profile.role === "motorista" &&
      entrega.motorista_id !== null &&
      entrega.motorista_id !== user.id
    ) {
      return NextResponse.json({
        ok: false,
        reason: "outro_motorista",
        message: "Esse pedido está atribuído a outro motorista.",
      });
    }
    if (entrega.status === "entregue") {
      return NextResponse.json({
        ok: false,
        reason: "ja_entregue",
        message: "Já marcado como entregue.",
      });
    }
    if (entrega.status === "cancelada") {
      return NextResponse.json({
        ok: false,
        reason: "erro",
        message: "Pedido cancelado, não pode ser entregue.",
      });
    }

    return NextResponse.json({
      ok: true,
      entregaId: entrega.id,
      codigo: entrega.codigo_queops,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[/api/motorista/validar] erro:", msg);
    return NextResponse.json({ ok: false, reason: "erro", message: `Erro do servidor: ${msg}` });
  }
}
