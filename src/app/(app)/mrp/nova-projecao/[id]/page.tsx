import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalcularBotao, NecessidadeEditavel } from "./calcular-cliente";

function fmtBR(iso: string | null): string {
  if (!iso) return "—";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

export default async function ProjecaoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
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

  const { data: projecao } = await supabase
    .from("projecao_producao")
    .select(
      `
      id, semana_inicio, semana_fim, data_calculo, status, contagem_id, solicitacao_id, observacoes,
      criado_em
    `
    )
    .eq("id", id)
    .maybeSingle();
  if (!projecao) notFound();

  const { data: demanda } = await supabase
    .from("projecao_demanda")
    .select(`produto_id, quantidade, observacoes, produto:produto(codigo_queops, nome)`)
    .eq("projecao_id", id);

  const { data: necessidades } = await supabase
    .from("projecao_necessidade")
    .select(
      `
      id, item_id, necessidade_bruta, estoque_atual, necessidade_liquida,
      quantidade_a_comprar, unidade, alertas,
      item:itens(codigo_queops, nome, preco_referencia)
    `
    )
    .eq("projecao_id", id)
    .order("id");

  const totalDemanda = (demanda ?? []).reduce((s, d) => s + Number(d.quantidade), 0);
  const valorEstimado = (necessidades ?? []).reduce(
    (s, n) =>
      s + (n.item?.preco_referencia ? Number(n.item.preco_referencia) * Number(n.quantidade_a_comprar) : 0),
    0
  );
  const totalItens = (necessidades ?? []).length;
  const semCodigoCount = (necessidades ?? []).filter((n) =>
    Array.isArray(n.alertas) && (n.alertas as string[]).includes("sem código Queóps")
  ).length;
  const semContagemCount = (necessidades ?? []).filter((n) =>
    Array.isArray(n.alertas) && (n.alertas as string[]).includes("sem contagem")
  ).length;

  const podeGerarSolicitacao =
    projecao.status === "calculada" && (necessidades?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            Projeção {fmtBR(projecao.semana_inicio)} → {fmtBR(projecao.semana_fim)}
          </h1>
          <p className="text-sm text-zinc-600">
            {projecao.status === "rascunho" && "Passo 2/3 — calcular a necessidade"}
            {projecao.status === "calculada" && "Passo 3/3 — revisar e gerar solicitação"}
            {projecao.status === "convertida_em_solicitacao" && (
              <>
                ✓ Convertida em{" "}
                <Link
                  href={`/solicitacoes/${projecao.solicitacao_id}`}
                  className="text-zinc-900 underline-offset-4 hover:underline"
                >
                  solicitação
                </Link>
              </>
            )}
          </p>
        </div>
        <Link href="/mrp/projecoes" className="text-sm text-zinc-600 hover:underline">
          ← Histórico
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Demanda lançada</CardTitle>
          <CardDescription>
            {demanda?.length ?? 0} produtos · {totalDemanda} unidades
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Código</th>
                  <th className="px-3 py-2 font-medium">Produto</th>
                  <th className="px-3 py-2 text-right font-medium">Quantidade</th>
                </tr>
              </thead>
              <tbody>
                {(demanda ?? []).map((d) => (
                  <tr key={d.produto_id} className="border-t border-zinc-100">
                    <td className="px-3 py-2 font-mono text-xs">{d.produto?.codigo_queops ?? "—"}</td>
                    <td className="px-3 py-2">{d.produto?.nome ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Number(d.quantidade)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {projecao.status === "rascunho" && (
        <CalcularBotao projecaoId={projecao.id} />
      )}

      {(projecao.status === "calculada" || projecao.status === "convertida_em_solicitacao") &&
        necessidades && necessidades.length > 0 && (
          <>
            {(semCodigoCount > 0 || semContagemCount > 0) && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                ⚠ {semCodigoCount > 0 && <>{semCodigoCount} item(s) sem código Queóps. </>}
                {semContagemCount > 0 && <>{semContagemCount} item(s) sem contagem (tratados como estoque zero).</>}
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Necessidade por item ({totalItens})
                </CardTitle>
                <CardDescription>
                  Quantidade a comprar é editável. Valor estimado:{" "}
                  <strong>
                    R${" "}
                    {valorEstimado.toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </strong>
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <NecessidadeEditavel
                  projecaoId={projecao.id}
                  necessidades={necessidades as unknown as Array<{
                    id: string;
                    item_id: string;
                    necessidade_bruta: number;
                    estoque_atual: number;
                    necessidade_liquida: number;
                    quantidade_a_comprar: number;
                    unidade: string | null;
                    alertas: string[];
                    item: { codigo_queops: string | null; nome: string; preco_referencia: number | null } | null;
                  }>}
                  somenteLeitura={projecao.status === "convertida_em_solicitacao"}
                />
              </CardContent>
            </Card>

            {podeGerarSolicitacao && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Passo 3 — Gerar solicitação semanal</CardTitle>
                  <CardDescription>
                    Vira uma SolicitacaoSemanal no módulo Compras com as quantidades a comprar.
                    O fluxo segue normal (aprovação → compra → recebimento).
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button disabled>
                    Gerar solicitação (Etapa 7 — em construção)
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        )}
    </div>
  );
}
