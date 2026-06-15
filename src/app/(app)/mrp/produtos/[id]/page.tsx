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
    .select("id, codigo_queops, nome, categoria, unidade_producao, rendimento_padrao, ativo")
    .eq("id", id)
    .maybeSingle();
  if (!produto) notFound();

  // Ficha vigente + suas linhas
  const { data: fichaVigente } = await supabase
    .from("ficha_tecnica")
    .select(
      `
      id, versao, data_vigencia_inicio, observacoes, criado_em,
      itens:ficha_item(
        id, materia_prima_id, quantidade, merma_percent, observacoes, ordem,
        mp:materia_prima(id, codigo_queops, nome, unidade_base, tipo)
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

  // Lista de matérias-primas pra seleção (só folhas + intermediários ativos)
  const { data: mps } = await supabase
    .from("materia_prima")
    .select("id, codigo_queops, nome, unidade_base, tipo, item_compra_id")
    .eq("ativa", true)
    .order("nome");

  const linhasIniciais: LinhaInicial[] = ((fichaVigente?.itens ?? []) as unknown as Array<{
    id: string;
    materia_prima_id: string;
    quantidade: number;
    merma_percent: number;
    observacoes: string | null;
    ordem: number;
    mp: { codigo_queops: string | null; nome: string; unidade_base: string };
  }>)
    .sort((a, b) => a.ordem - b.ordem)
    .map((i) => ({
      materia_prima_id: i.materia_prima_id,
      quantidade: Number(i.quantidade),
      merma_percent: Number(i.merma_percent),
      observacoes: i.observacoes,
      mpNome: i.mp.nome,
      mpCodigo: i.mp.codigo_queops,
      mpUnidade: i.mp.unidade_base,
    }));

  const mpOpcoes: MpOpcao[] = (mps ?? []).map((m) => ({
    id: m.id,
    codigo: m.codigo_queops,
    nome: m.nome,
    unidade: m.unidade_base,
    tipo: m.tipo as "folha" | "intermediario" | "ignorado",
    temItemCompra: m.item_compra_id !== null,
  }));

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
