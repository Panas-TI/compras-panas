import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDateBR } from "@/lib/utils";
import { ReceiveTable, type LinhaPendente } from "../receive-table";

export default async function RecebimentoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: solic } = await supabase
    .from("solicitacoes_semanais")
    .select(
      `
      id, data_inicio, data_fim, enviada_em,
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
      id, status, alteracao_confirmada, volume_solicitado, preco, valor, prazo, data_compra,
      solicitacao_id,
      item:itens(nome, codigo_queops, classificacao:classificacoes(nome), unidade:unidades_medida(nome)),
      fornecedor:fornecedores(nome)
    `
    )
    .eq("solicitacao_id", id)
    .in("status", ["Aprovada", "Volumes ou Preço Alterados"])
    .order("criado_em", { ascending: true });

  const linhas: LinhaPendente[] = (linhasRaw ?? [])
    .filter((l) => l.status !== "Volumes ou Preço Alterados" || l.alteracao_confirmada)
    .map((l) => ({
      id: l.id,
      nome_item: l.item?.nome ?? "(item removido)",
      codigo_queops: l.item?.codigo_queops ?? null,
      classificacao_nome: l.item?.classificacao?.nome ?? null,
      unidade_nome: l.item?.unidade?.nome ?? null,
      fornecedor_nome: l.fornecedor?.nome ?? null,
      volume_solicitado: l.volume_solicitado,
      preco: l.preco,
      valor: l.valor,
      prazo: l.prazo,
      status: l.status,
      data_compra: l.data_compra,
      solicitacao_id: l.solicitacao_id,
      solicitacao_inicio: solic.data_inicio,
    }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">
            Recebimento — {formatDateBR(solic.data_inicio)} a {formatDateBR(solic.data_fim)}
          </h1>
          <p className="text-sm text-zinc-600">
            {solic.comprador?.nome ?? "—"}
            {solic.enviada_em && <> · enviada em {formatDateBR(solic.enviada_em)}</>}
            {" · "}{linhas.length} {linhas.length === 1 ? "item pendente" : "itens pendentes"}
          </p>
        </div>
        <Link href="/recebimento" className="text-sm text-zinc-600 hover:underline">
          ← Voltar
        </Link>
      </div>

      <ReceiveTable linhas={linhas} />
    </div>
  );
}
