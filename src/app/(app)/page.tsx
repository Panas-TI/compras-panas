import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function HomePage() {
  const supabase = await createClient();

  // Estoquista cai direto no /recebimento
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.role === "estoquista") {
      redirect("/recebimento");
    }
  }

  const [{ count: itensCount }, { count: solicCount }, { count: itensSemCodigo }] = await Promise.all([
    supabase.from("itens").select("*", { count: "exact", head: true }).eq("ativo", true),
    supabase.from("solicitacoes_semanais").select("*", { count: "exact", head: true }),
    supabase
      .from("itens")
      .select("*", { count: "exact", head: true })
      .eq("ativo", true)
      .is("codigo_queops", null),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Início</h1>
        <p className="text-sm text-zinc-600">Visão rápida do sistema.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link href="/itens">
          <Card className="transition-shadow hover:shadow-md">
            <CardHeader>
              <CardDescription>Itens cadastrados</CardDescription>
              <CardTitle className="text-3xl">{itensCount ?? 0}</CardTitle>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/solicitacoes">
          <Card className="transition-shadow hover:shadow-md">
            <CardHeader>
              <CardDescription>Solicitações semanais</CardDescription>
              <CardTitle className="text-3xl">{solicCount ?? 0}</CardTitle>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/itens?sem_codigo=1">
          <Card className="transition-shadow hover:shadow-md">
            <CardHeader>
              <CardDescription>Itens sem código Queóps</CardDescription>
              <CardTitle className="text-3xl text-amber-600">{itensSemCodigo ?? 0}</CardTitle>
            </CardHeader>
          </Card>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Atalhos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link
            href="/solicitacoes/nova"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-800"
          >
            Nova solicitação semanal
          </Link>
          <Link
            href="/itens"
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50"
          >
            Cadastro de itens
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
