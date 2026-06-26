import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDateBR } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LinhasTable, type Linha } from "./linhas-table";
import { DeleteButton } from "./delete-button";
import { PrintButton } from "./print-button";
import { computeSolicStatus } from "../status";

export default async function SolicitacaoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  // Quem é o usuário + role
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const isAprovador = profile?.role === "aprovador";

  const { data: solic } = await supabase
    .from("solicitacoes_semanais")
    .select(
      `
      id, data_inicio, data_fim, observacoes, enviada_em, finalizada, finalizada_em, comprador_id, criado_em,
      comprador:profiles!solicitacoes_semanais_comprador_id_fkey(nome)
    `
    )
    .eq("id", id)
    .maybeSingle();

  if (!solic) notFound();

  const { data: linhasRaw } = await supabase
    .from("solicitacao_linhas")
    .select(
      `
      id, item_id, volume_estoque, volume_solicitado, preco, valor,
      fornecedor_id, forma_pagto_id, prazo, status, alteracao_confirmada,
      item:itens(nome, codigo_queops,
        classificacao:classificacoes(nome),
        unidade:unidades_medida(nome)
      )
    `
    )
    .eq("solicitacao_id", id)
    .order("criado_em", { ascending: true });

  const linhas: Linha[] = (linhasRaw ?? []).map((l) => ({
    id: l.id,
    item_id: l.item_id,
    nome_item: l.item?.nome ?? "(item removido)",
    codigo_queops: l.item?.codigo_queops ?? null,
    classificacao_nome: l.item?.classificacao?.nome ?? null,
    unidade_nome: l.item?.unidade?.nome ?? null,
    volume_estoque: l.volume_estoque,
    volume_solicitado: l.volume_solicitado,
    preco: l.preco,
    valor: l.valor,
    fornecedor_id: l.fornecedor_id,
    forma_pagto_id: l.forma_pagto_id,
    prazo: l.prazo,
    status: l.status,
    alteracao_confirmada: l.alteracao_confirmada,
  }));

  const [{ data: items }, { data: fornecedores }, { data: formasPagto }] = await Promise.all([
    supabase
      .from("itens")
      .select("id, nome, codigo_queops")
      .eq("ativo", true)
      .order("nome"),
    supabase.from("fornecedores").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("formas_pagamento").select("id, nome").eq("ativo", true).order("nome"),
  ]);

  const isDraft = solic.enviada_em === null;
  const isMine = solic.comprador_id === user.id;
  // Editar/Lançar um rascunho: o próprio comprador OU um aprovador (admin).
  // O admin tem controle total — pode lançar a solicitação de qualquer comprador.
  const canEdit = isDraft && (isMine || isAprovador);

  const status = computeSolicStatus(
    solic.enviada_em,
    linhas.map((l) => ({ status: l.status, alteracao_confirmada: l.alteracao_confirmada }))
  );

  return (
    <div className="solicitacao-detail flex flex-col gap-4">
      {/* Print: A4 deitado pra caber a planilha com todas as colunas */}
      <style>{`@media print { @page { size: A4 landscape; } }`}</style>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">
            Solicitação {formatDateBR(solic.data_inicio)} a {formatDateBR(solic.data_fim)}
          </h1>
          <p className="text-sm text-zinc-600">
            Comprador: {solic.comprador?.nome ?? "—"} · Status: <strong>{status}</strong>
            {solic.observacoes && <> · {solic.observacoes}</>}
          </p>
        </div>
        <div className="flex items-center gap-3 print:hidden">
          {!isDraft && (
            <a
              href={`/api/solicitacoes/${solic.id}/csv`}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50"
            >
              Exportar CSV
            </a>
          )}
          {!isDraft && <PrintButton />}
          {!solic.finalizada && (isMine || isAprovador) && (
            <DeleteButton solicitacaoId={solic.id} />
          )}
          <Link href="/solicitacoes" className="text-sm text-zinc-600 hover:underline">
            ← Voltar
          </Link>
        </div>
      </div>

      <LinhasTable
        solicitacaoId={solic.id}
        initialLinhas={linhas}
        items={items ?? []}
        fornecedores={fornecedores ?? []}
        formasPagto={formasPagto ?? []}
        isDraft={canEdit}
        isAprovador={isAprovador}
        lancada={!isDraft}
      />
    </div>
  );
}
