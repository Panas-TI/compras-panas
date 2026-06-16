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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">MRP — Planejamento de compras</h1>
        <p className="text-sm text-zinc-600">
          Calcule o que comprar baseado na demanda da semana × ficha técnica × estoque. Pra ver
          contagens de produtos finais, semi-acabados e matérias-primas, vai em{" "}
          <Link href="/itens" className="text-zinc-900 underline-offset-4 hover:underline">
            /itens
          </Link>
          .
        </p>
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
                <CardTitle className="text-base">📋 Estoque atual</CardTitle>
                <CardDescription>
                  Foto do estoque baseado na <strong>última contagem do estoquista</strong> (módulo
                  Contagem). Mostra quanto tem de cada matéria-prima usada nas fichas.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/mrp/produtos" className="group">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <CardHeader>
                <CardTitle className="text-base">🥟 Produtos & fichas técnicas</CardTitle>
                <CardDescription>
                  Edita receitas dos produtos finais e semi-acabados. Gerencia versões e merma.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/mrp/materias-primas" className="group">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <CardHeader>
                <CardTitle className="text-base">🧂 Matérias-primas (itens)</CardTitle>
                <CardDescription>
                  Itens do cadastro de compras usados em fichas. Revisar códigos Queóps e
                  configurar fator de conversão.
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
              Estoquista finaliza a{" "}
              <Link href="/contagem" className="text-zinc-900 underline-offset-4 hover:underline">
                contagem semanal
              </Link>
              . O MRP reusa essa contagem como estoque atual —{" "}
              <Link href="/mrp/estoque/contar" className="text-zinc-900 underline-offset-4 hover:underline">
                ver foto do estoque
              </Link>
              .
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
