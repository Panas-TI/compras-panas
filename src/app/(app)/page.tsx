import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function HubPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let ehAdmin = false;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    // Perfis com módulo único caem direto onde devem trabalhar
    if (profile?.role === "estoquista") redirect("/recebimento");
    if (profile?.role === "gestor_producao") redirect("/estoque");
    if (profile?.role === "motorista") redirect("/motorista");
    if (profile?.role === "vendas") redirect("/vendas");
    ehAdmin = profile?.role === "aprovador";
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 py-8">
      <div className="text-center">
        <h1 className="text-3xl font-semibold">Compras Panas</h1>
        <p className="mt-2 text-sm text-zinc-600">Escolha o módulo que deseja acessar.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link href="/estoque" className="group">
          <Card className="h-full transition-shadow group-hover:shadow-lg">
            <CardHeader>
              <div className="mb-2 text-4xl">📦</div>
              <CardTitle className="text-xl">Estoque</CardTitle>
              <CardDescription>
                Cadastro de itens, solicitações semanais, contagem, recebimento, MRP e relatórios.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <span className="text-sm font-medium text-zinc-700 group-hover:underline">
                Entrar →
              </span>
            </CardContent>
          </Card>
        </Link>

        <Link href="/entregas" className="group">
          <Card className="h-full transition-shadow group-hover:shadow-lg">
            <CardHeader>
              <div className="mb-2 text-4xl">🚚</div>
              <CardTitle className="text-xl">Entregas</CardTitle>
              <CardDescription>
                Pedidos do Queóps, rota do motorista, comprovantes com assinatura e mapa.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <span className="text-sm font-medium text-zinc-700 group-hover:underline">
                Entrar →
              </span>
            </CardContent>
          </Card>
        </Link>

        <Link href="/vendas" className="group">
          <Card className="h-full transition-shadow group-hover:shadow-lg">
            <CardHeader>
              <div className="mb-2 text-4xl">💬</div>
              <CardTitle className="text-xl">Vendas</CardTitle>
              <CardDescription>
                Carteira de clientes, quem contatar hoje, reativação de inativos e histórico de
                atendimento.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <span className="text-sm font-medium text-zinc-700 group-hover:underline">
                Entrar →
              </span>
            </CardContent>
          </Card>
        </Link>

        {/* Só admin: hoje o módulo é gestão de acesso, que ninguém mais faz. */}
        {ehAdmin && (
          <Link href="/configuracoes" className="group">
            <Card className="h-full transition-shadow group-hover:shadow-lg">
              <CardHeader>
                <div className="mb-2 text-4xl">⚙️</div>
                <CardTitle className="text-xl">Configurações</CardTitle>
                <CardDescription>
                  Usuários e perfis de acesso, e os ajustes que valem para o sistema inteiro.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <span className="text-sm font-medium text-zinc-700 group-hover:underline">
                  Entrar →
                </span>
              </CardContent>
            </Card>
          </Link>
        )}
      </div>
    </div>
  );
}
