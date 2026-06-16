import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FichaEditor, type MpOpcao, type LinhaInicial } from "./ficha-editor";
import { ProdutoHeader } from "./produto-header";
import { HistoricoVersoes } from "./historico-versoes";

export default async function ProdutoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!["aprovador", "comprador"].includes(profile?.role ?? "")) redirect("/");

  const { data: produto } = await supabase
    .from("produto")
    .select("id, codigo_queops, nome, categoria, tipo, unidade_producao, rendimento_padrao, ativo")
    .eq("id", id)
    .maybeSingle();
  if (!produto) notFound();

  // Ficha vigente + suas linhas (pode ter item OU produto referenciado)
  const { data: fichaVigente } = await supabase
    .from("ficha_tecnica")
    .select(
      `
      id, versao, data_vigencia_inicio, observacoes, criado_em,
      itens:ficha_item(
        id, item_id, produto_referenciado_id, quantidade, merma_percent, observacoes, ordem,
        item:itens(id, codigo_queops, nome, unidade:unidades_medida(nome)),
        prod:produto!ficha_item_produto_referenciado_id_fkey(id, codigo_queops, nome, unidade_producao, tipo)
      )
    `
    )
    .eq("produto_id", id)
    .eq("vigente", true)
    .order("versao", { ascending: false })
    .maybeSingle();

  // Histórico de versões (não-vigentes)
  const { data: historico } = await supabase
    .from("ficha_tecnica")
    .select("id, versao, data_vigencia_inicio, data_vigencia_fim, vigente, observacoes, criado_em")
    .eq("produto_id", id)
    .order("versao", { ascending: false });

  // Lista de itens (compráveis) + produtos intermediários ativos
  const [{ data: itens }, { data: prodsIntermediarios }] = await Promise.all([
    supabase
      .from("itens")
      .select("id, codigo_queops, nome, unidade:unidades_medida(nome)")
      .eq("ativo", true)
      .order("nome"),
    supabase
      .from("produto")
      .select("id, codigo_queops, nome, unidade_producao")
      .eq("ativo", true)
      .eq("tipo", "intermediario")
      .order("nome"),
  ]);

  type LinhaRaw = {
    id: string;
    item_id: string | null;
    produto_referenciado_id: string | null;
    quantidade: number;
    merma_percent: number;
    observacoes: string | null;
    ordem: number;
    item: { codigo_queops: string | null; nome: string; unidade: { nome: string } | null } | null;
    prod: { codigo_queops: string | null; nome: string; unidade_producao: string } | null;
  };

  const linhasIniciais: LinhaInicial[] = ((fichaVigente?.itens ?? []) as unknown as LinhaRaw[])
    .sort((a, b) => a.ordem - b.ordem)
    .map((i) => {
      if (i.produto_referenciado_id && i.prod) {
        return {
          tipo: "produto" as const,
          ref_id: i.produto_referenciado_id,
          quantidade: Number(i.quantidade),
          merma_percent: Number(i.merma_percent),
          observacoes: i.observacoes,
          refNome: i.prod.nome,
          refCodigo: i.prod.codigo_queops,
          refUnidade: i.prod.unidade_producao,
        };
      }
      return {
        tipo: "item" as const,
        ref_id: i.item_id!,
        quantidade: Number(i.quantidade),
        merma_percent: Number(i.merma_percent),
        observacoes: i.observacoes,
        refNome: i.item?.nome ?? "—",
        refCodigo: i.item?.codigo_queops ?? null,
        refUnidade: i.item?.unidade?.nome ?? "",
      };
    });

  const mpOpcoes: MpOpcao[] = [
    ...(itens ?? []).map((it) => ({
      tipo: "item" as const,
      id: it.id,
      codigo: it.codigo_queops,
      nome: it.nome,
      unidade: it.unidade?.nome ?? "",
      semCodigo: it.codigo_queops == null,
    })),
    ...(prodsIntermediarios ?? [])
      .filter((p) => p.id !== produto.id)
      .map((p) => ({
        tipo: "produto" as const,
        id: p.id,
        codigo: p.codigo_queops,
        nome: p.nome,
        unidade: p.unidade_producao,
        semCodigo: false,
      })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Link href="/mrp/produtos" className="text-sm text-zinc-600 hover:underline">
          ← Voltar pra lista de produtos
        </Link>
      </div>

      <ProdutoHeader produto={produto} />

      <FichaEditor
        produtoId={produto.id}
        tipoProduto={produto.tipo as "final" | "intermediario"}
        unidadeProducao={produto.unidade_producao}
        versaoAtual={fichaVigente?.versao ?? null}
        dataVigenciaInicio={fichaVigente?.data_vigencia_inicio ?? null}
        linhasIniciais={linhasIniciais}
        mpOpcoes={mpOpcoes}
        observacoesIniciais={fichaVigente?.observacoes ?? ""}
      />

      {historico && historico.length > 0 && (
        <HistoricoVersoes produtoId={produto.id} versoes={historico} />
      )}
    </div>
  );
}
