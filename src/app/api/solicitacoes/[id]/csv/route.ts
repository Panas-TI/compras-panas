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

function formatNumberBR(n: number | null | undefined, fraction = 2): string {
  if (n === null || n === undefined) return "";
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: fraction,
    maximumFractionDigits: fraction,
  });
}

function formatDateBR(d: string | null | undefined): string {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "";
  const day = String(dt.getUTCDate()).padStart(2, "0");
  const mo = String(dt.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${mo}/${dt.getUTCFullYear()}`;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data: solic, error: solicErr } = await supabase
    .from("solicitacoes_semanais")
    .select("data_inicio, data_fim")
    .eq("id", id)
    .maybeSingle();
  if (solicErr || !solic) {
    return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });
  }

  const { data: linhas, error } = await supabase
    .from("solicitacao_linhas")
    .select(
      `
      codigo_queops_congelado, nome_item_congelado, classificacao_congelada, unidade_congelada,
      volume_solicitado, preco, valor, prazo, vencimento, data_compra, data_recebimento, status,
      item:itens(nome, codigo_queops, unidade:unidades_medida(nome), classificacao:classificacoes(nome)),
      fornecedor:fornecedores(nome),
      forma_pagto:formas_pagamento(nome)
    `
    )
    .eq("solicitacao_id", id)
    .order("criado_em", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const header = [
    "Código Queóps",
    "Item",
    "Classificação",
    "Volume",
    "Unidade",
    "Preço",
    "Valor",
    "Fornecedor",
    "Forma Pagto",
    "Prazo",
    "Vencimento",
    "Data Compra",
    "Data Recebimento",
    "Status",
  ];

  const rows = (linhas ?? []).map((l) => [
    l.codigo_queops_congelado ?? l.item?.codigo_queops ?? "",
    l.nome_item_congelado ?? l.item?.nome ?? "",
    l.classificacao_congelada ?? l.item?.classificacao?.nome ?? "",
    formatNumberBR(l.volume_solicitado, 3),
    l.unidade_congelada ?? l.item?.unidade?.nome ?? "",
    formatNumberBR(l.preco, 4),
    formatNumberBR(l.valor, 2),
    l.fornecedor?.nome ?? "",
    l.forma_pagto?.nome ?? "",
    l.prazo ?? "",
    formatDateBR(l.vencimento),
    formatDateBR(l.data_compra),
    formatDateBR(l.data_recebimento),
    l.status,
  ]);

  const sep = ";";
  const csv = [header, ...rows].map((r) => r.map(csvEscape).join(sep)).join("\n");
  // BOM pro Excel reconhecer UTF-8
  const body = "﻿" + csv;

  const filename = `compras_${solic.data_inicio}_a_${solic.data_fim}.csv`;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
