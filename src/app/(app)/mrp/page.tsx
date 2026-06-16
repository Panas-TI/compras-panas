import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function MRPHomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!["aprovador", "comprador"].includes(profile?.role ?? "")) redirect("/");

  // Itens distintos usados em qualquer ficha técnica
  const { data: itensUsados } = await supabase
    .from("ficha_item")
    .select("item_id")
    .not("item_id", "is", null);
  const itensIdsUsados = Array.from(
    new Set((itensUsados ?? []).map((r) => r.item_id).filter(Boolean) as string[])
  );

  const [
    { count: produtosFinaisCount },
    { count: produtosIntermediariosCount },
    { count: fichasCount },
  ] = await Promise.all([
    supabase
      .from("produto")
      .select("*", { count: "exact", head: true })
      .eq("ativo", true)
      .eq("tipo", "final"),
    supabase
      .from("produto")
      .select("*", { count: "exact", head: true })
      .eq("ativo", true)
      .eq("tipo", "intermediario"),
    supabase
      .from("ficha_tecnica")
      .select("*", { count: "exact", head: true })
      .eq("vigente", true),
  ]);

  let itensSemCodigo = 0;
  if (itensIdsUsados.length > 0) {
    const { count } = await supabase
      .from("itens")
      .select("*", { count: "exact", head: true })
      .in("id", itensIdsUsados)
      .is("codigo_queops", null);
    itensSemCodigo = count ?? 0;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">MRP — Planejamento de compras</h1>
        <p className="text-sm text-zinc-600">
          Calcule o que comprar baseado na demanda da semana × ficha técnica × estoque.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Link href="/mrp/produtos?tipo=final">
          <Card className="transition-shadow hover:shadow-md">
            <CardHeader>
              <CardDescription>Produtos finais</CardDescription>
              <CardTitle className="text-3xl">{produtosFinaisCount ?? 0}</CardTitle>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/mrp/produtos?tipo=intermediario">
          <Card className="transition-shadow hover:shadow-md">
            <CardHeader>
              <CardDescription>Intermediários</CardDescription>
              <CardTitle className="text-3xl text-purple-700">
                {produtosIntermediariosCount ?? 0}
              </CardTitle>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/mrp/materias-primas">
          <Card className="transition-shadow hover:shadow-md">
            <CardHeader>
              <CardDescription>Itens usados em fichas</CardDescription>
              <CardTitle className="text-3xl">{itensIdsUsados.length}</CardTitle>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/mrp/materias-primas?sem_codigo=1">
          <Card className="transition-shadow hover:shadow-md">
            <CardHeader>
              <CardDescription>Itens sem código Queóps</CardDescription>
              <CardTitle
                className={`text-3xl ${itensSemCodigo > 0 ? "text-amber-600" : ""}`}
              >
                {itensSemCodigo}
              </CardTitle>
            </CardHeader>
          </Card>
        </Link>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-600">
          Áreas do MRP
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Link href="/mrp/nova-projecao" className="group">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <CardHeader>
                <CardTitle className="text-base">🧮 Nova projeção</CardTitle>
                <CardDescription>
                  Lança a demanda da semana → calcula matérias-primas a comprar → gera
                  SolicitacaoSemanal no Estoque.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/mrp/estoque/contar" className="group">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <CardHeader>
                <CardTitle className="text-base">📋 Contagem de matérias-primas</CardTitle>
                <CardDescription>
                  Conta estoque atual de cada item usado em ficha. Mobile-first.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/mrp/produtos" className="group">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <CardHeader>
                <CardTitle className="text-base">🥟 Produtos & fichas técnicas</CardTitle>
                <CardDescription>
                  {(produtosFinaisCount ?? 0) + (produtosIntermediariosCount ?? 0)} produtos com
                  fichas vigentes. Edita receitas, gerencia versões e merma.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/mrp/materias-primas" className="group">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <CardHeader>
                <CardTitle className="text-base">🧂 Matérias-primas (itens)</CardTitle>
                <CardDescription>
                  {itensIdsUsados.length} itens do cadastro de compras usados em fichas.
                  Revisar códigos Queóps, configurar fator de conversão.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/mrp/projecoes" className="group">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <CardHeader>
                <CardTitle className="text-base">📚 Histórico de projeções</CardTitle>
                <CardDescription>
                  Lista de todas as projeções calculadas + comparativo planejado × comprado.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/mrp/relatorios" className="group">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <CardHeader>
                <CardTitle className="text-base">📊 Relatórios MRP</CardTitle>
                <CardDescription>
                  Acurácia da previsão, consumo histórico, top produtos por consumo, estoque crítico.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fluxo recomendado (toda quinta de manhã)</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="ml-5 list-decimal space-y-2 text-sm text-zinc-700">
            <li>
              <Link href="/mrp/estoque/contar" className="text-zinc-900 underline-offset-4 hover:underline">
                Contar o estoque atual
              </Link>{" "}
              dos itens usados em fichas.
            </li>
            <li>
              <Link href="/mrp/nova-projecao" className="text-zinc-900 underline-offset-4 hover:underline">
                Iniciar nova projeção
              </Link>{" "}
              lançando os pedidos previstos da semana.
            </li>
            <li>O sistema expande recursivamente a árvore de fichas (BOM) e calcula a necessidade líquida de cada item.</li>
            <li>Revisar e clicar em &ldquo;Gerar solicitação semanal&rdquo; — vira uma SolicitacaoSemanal no módulo Estoque.</li>
            <li>Fluxo segue normal: aprovação, compra, recebimento.</li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-zinc-600">Estrutura BOM multi-nível</CardTitle>
          <CardDescription>
            Produto final (Empanada) → Produto intermediário (RECHEIO X, MASSA EMPANADA) →
            <strong> Itens</strong> do cadastro de compras. Mudou a fórmula da MASSA? Todas as
            empanadas que a usam atualizam. <strong>Sem tabela de matéria-prima separada</strong> —
            os itens são os mesmos do módulo de compras.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
