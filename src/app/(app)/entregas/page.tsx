import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function EntregasHomePage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Entregas</h1>
        <p className="text-sm text-zinc-600">
          Gestão das entregas de empanadas: cadastra pedidos, atribui motorista, acompanha rota e
          confirma. Motorista usa o{" "}
          <Link href="/motorista" className="text-zinc-900 underline-offset-4 hover:underline">
            painel mobile (/motorista)
          </Link>
          .
        </p>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-600">
          Áreas das Entregas
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/entregas/dia" className="group">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <CardHeader>
                <CardTitle className="text-base">🚚 Entregas do dia</CardTitle>
                <CardDescription>
                  Lista das entregas do dia: status, atribuição de motorista, mapa e detalhes.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/entregas/novo" className="group">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <CardHeader>
                <CardTitle className="text-base">➕ Cadastrar pedido</CardTitle>
                <CardDescription>
                  Bipa o código de barras do pedido (ou tira foto / digita) e gera a entrega.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/entregas/mapa" className="group">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <CardHeader>
                <CardTitle className="text-base">🗺 Mapa</CardTitle>
                <CardDescription>
                  Visão geográfica dos pontos de entrega do dia, coloridos por motorista.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/entregas/relatorios" className="group">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <CardHeader>
                <CardTitle className="text-base">📊 Relatórios</CardTitle>
                <CardDescription>
                  Histórico, indicadores de atraso e exportação CSV.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        </div>
      </div>

      <div>
        <Link href="/" className="text-sm text-zinc-600 hover:underline">
          ← Voltar ao hub
        </Link>
      </div>
    </div>
  );
}
