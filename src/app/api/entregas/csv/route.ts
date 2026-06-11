import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(";") || s.includes("\n") || s.includes('"')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatDateBR(d: string | null | undefined): string {
  if (!d) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
  }
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "";
  return dt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.role || !["aprovador", "comprador"].includes(profile.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const url = new URL(req.url);
  const desde = url.searchParams.get("desde");
  const ate = url.searchParams.get("ate");

  let query = supabase
    .from("entregas")
    .select(
      `
      codigo_queops, data_entrega, hora_entrega, status,
      cliente_nome, cliente_telefone, bairro, cidade, uf, observacoes,
      valor_total,
      criado_em, entregue_at,
      entrega_lat, entrega_lng, entrega_precisao_metros, gps_negado,
      motivo_nao_entrega,
      motorista:profiles!entregas_motorista_id_fkey(nome),
      criador:profiles!entregas_created_by_fkey(nome)
    `
    )
    .order("data_entrega", { ascending: false })
    .order("hora_entrega", { ascending: true, nullsFirst: false });

  if (desde && /^\d{4}-\d{2}-\d{2}$/.test(desde)) query = query.gte("data_entrega", desde);
  if (ate && /^\d{4}-\d{2}-\d{2}$/.test(ate)) query = query.lte("data_entrega", ate);

  const { data, error } = await query.limit(10000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const headers = [
    "Código",
    "Data entrega",
    "Hora",
    "Status",
    "Cliente",
    "Telefone",
    "Bairro",
    "Cidade",
    "UF",
    "Valor (R$)",
    "Observações",
    "Criada em",
    "Entregue em",
    "Lat",
    "Lng",
    "Precisão GPS (m)",
    "GPS negado",
    "Motivo não-entrega",
    "Motorista",
    "Criado por",
  ];

  const rows = (data ?? []).map((e) => [
    e.codigo_queops,
    formatDateBR(e.data_entrega),
    e.hora_entrega?.slice(0, 5) ?? "",
    e.status,
    e.cliente_nome ?? "",
    e.cliente_telefone ?? "",
    e.bairro ?? "",
    e.cidade ?? "",
    e.uf ?? "",
    e.valor_total ?? "",
    e.observacoes ?? "",
    formatDateBR(e.criado_em),
    formatDateBR(e.entregue_at),
    e.entrega_lat ?? "",
    e.entrega_lng ?? "",
    e.entrega_precisao_metros ?? "",
    e.gps_negado ? "sim" : "não",
    e.motivo_nao_entrega ?? "",
    e.motorista?.nome ?? "",
    e.criador?.nome ?? "",
  ]);

  const csv =
    "﻿" + // BOM pra Excel reconhecer UTF-8
    [headers, ...rows].map((r) => r.map(csvEscape).join(";")).join("\r\n");

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="entregas-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
