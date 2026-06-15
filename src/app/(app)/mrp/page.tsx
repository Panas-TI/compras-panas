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

  const [
    { count: produtosCount },
    { count: mpCount },
    { count: folhasCount },
    { count: folhasSemVinculo },
    { count: fichasCount },
  ] = await Promise.all([
    supabase.from("produto").select("*", { count: "exact", head: true }).eq("ativo", true),
    supabase.from("materia_prima").select("*", { count: "exact", head: true }).eq("ativa", true),
    supabase
      .from("materia_prima")
      .select("*", { count: "exact", head: true })
      .eq("ativa", true)
      .eq("tipo", "folha"),
    supabase
      .from("materia_prima")
      .select("*", { count: "exact", head: true })
      .eq("ativa", true)
      .eq("tipo", "folha")
      .is("item_compra_id", null),
    supabase
      .from("ficha_tecnica")
      .select("*", { count: "exact", head: true })
      .eq("vigente", true),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">MRP — Planejamento de compras</h1>
        <p className="text-sm text-zinc-600">
          Calcule o que comprar baseado na demanda da semana × ficha técnica × estoque.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Link href="/mrp/produtos">
          <Card className="transition-shadow hover:shadow-md">
            <CardHeader>
              <CardDescription>Produtos</CardDescription>
              <CardTitle className="text-3xl">{produtosCount ?? 0}</CardTitle>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/mrp/produtos">
          <Card className="transition-shadow hover:shadow-md">
            <CardHeader>
              <CardDescription>Fichas vigentes</CardDescription>
              <CardTitle className="text-3xl">{fichasCount ?? 0}</CardTitle>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/mrp/materias-primas">
          <Card className="transition-shadow hover:shadow-md">
            <CardHeader>
              <CardDescription>Matérias-primas (compras)</CardDescription>
              <CardTitle className="text-3xl">{folhasCount ?? 0}</CardTitle>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/mrp/materias-primas">
          <Card className="transition-shadow hover:shadow-md">
            <CardHeader>
              <CardDescription>MP sem item vinculado</CardDescription>
              <CardTitle
                className={`text-3xl ${(folhasSemVinculo ?? 0) > 0 ? "text-amber-600" : ""}`}
              >
                {folhasSemVinculo ?? 0}
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
                <CardTitle className="text-base">📋 Contagem de MP</CardTitle>
                <CardDescription>
                  Conta estoque atual de cada matéria-prima. Mobile-first, dá pra fazer com o
                  celular na mão andando pela cozinha.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/mrp/produtos" className="group">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <CardHeader>
                <CardTitle className="text-base">🥟 Produtos & fichas técnicas</CardTitle>
                <CardDescription>
                  35 produtos com fichas vigentes. Edita receitas, gerencia versões e merma.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/mrp/materias-primas" className="group">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <CardHeader>
                <CardTitle className="text-base">🧂 Matérias-primas</CardTitle>
                <CardDescription>
                  72 mp folhas + 33 intermediárias. Vincula com itens de compra e configura fator
                  de conversão (g↔kg etc).
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
                  Acurácia da previsão, consumo histórico de mp, top produtos por consumo de mp
                  cara, estoque crítico.
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
              das matérias-primas (mobile-friendly, dá pra contar com o celular na mão).
            </li>
            <li>
              <Link href="/mrp/nova-projecao" className="text-zinc-900 underline-offset-4 hover:underline">
                Iniciar nova projeção
              </Link>{" "}
              lançando os pedidos previstos da semana.
            </li>
            <li>O sistema calcula a necessidade líquida de cada matéria-prima.</li>
            <li>Revisar e clicar em &ldquo;Gerar solicitação semanal&rdquo; — vira uma SolicitacaoSemanal no módulo Estoque.</li>
            <li>Fluxo segue normal: aprovação, compra, recebimento.</li>
          </ol>
        </CardContent>
      </Card>

      <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        ⏳ As 6 áreas acima ainda estão sendo construídas (etapas 3 a 9). Por enquanto cada link
        leva pra uma tela de &ldquo;em construção&rdquo;. O banco já tem todos os dados importados (35
        produtos, 107 mp, 432 linhas de ficha). Conforme as telas ficarem prontas, este aviso
        some por área.
      </div>

      {mpCount !== null && (mpCount - (folhasCount ?? 0)) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-zinc-600">Componentes internos</CardTitle>
            <CardDescription>
              {mpCount - (folhasCount ?? 0)} matérias-primas são intermediárias (recheios, massas) ou
              ignoradas (mão de obra). Não viram compras — só agrupam ingredientes nas fichas.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
