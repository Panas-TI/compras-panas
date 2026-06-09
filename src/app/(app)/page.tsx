import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function HubPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    // Perfis com módulo único caem direto onde devem trabalhar
    if (profile?.role === "estoquista") redirect("/recebimento");
    if (profile?.role === "motorista") redirect("/motorista");
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
                Cadastro de itens, solicitações semanais, contagem, recebimento e relatórios.
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
      </div>
    </div>
  );
}
