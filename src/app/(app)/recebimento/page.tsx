import { createClient } from "@/lib/supabase/server";
import { ReceiveTable, type LinhaPendente } from "./receive-table";

export default async function RecebimentoPage() {
  const supabase = await createClient();

  // Linhas elegíveis: aprovadas OU "Volumes ou Preço Alterados" CONFIRMADAS
  const { data: linhasRaw } = await supabase
    .from("solicitacao_linhas")
    .select(
      `
      id, status, alteracao_confirmada, volume_solicitado, preco, valor, prazo, data_compra,
      solicitacao_id,
      item:itens(nome, codigo_queops, classificacao:classificacoes(nome), unidade:unidades_medida(nome)),
      fornecedor:fornecedores(nome),
      solicitacao:solicitacoes_semanais!solicitacao_linhas_solicitacao_id_fkey(data_inicio)
    `
    )
    .in("status", ["Aprovada", "Volumes ou Preço Alterados"])
    .order("criado_em", { ascending: false })
    .limit(2000);

  const linhas: LinhaPendente[] = (linhasRaw ?? [])
    // mantém só linhas em "Volumes ou Preço Alterados" se já confirmadas
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
      solicitacao_inicio: l.solicitacao?.data_inicio ?? "",
    }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Recebimento</h1>
        <p className="text-sm text-zinc-600">
          Itens aprovados aguardando recebimento. Informe quanto chegou e a data, depois clique em "Marcar recebido".
        </p>
      </div>
      <ReceiveTable linhas={linhas} />
    </div>
  );
}
