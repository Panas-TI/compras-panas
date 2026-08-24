import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

/**
 * Configurações: o que vale pro sistema inteiro, não pra um módulo só.
 *
 * Usuários morava dentro de Estoque, mas quem administra conta não está
 * mexendo em estoque — mexe em quem acessa Entregas, Vendas e tudo mais.
 */
export default async function ConfiguracoesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, ativo")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.ativo || profile.role !== "aprovador") redirect("/");

  const [{ count: usuarios }, { count: fornecedores }, { count: colaboradores }] =
    await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("ativo", true),
      supabase.from("fornecedores").select("id", { count: "exact", head: true }).eq("ativo", true),
      supabase.from("colaboradores").select("id", { count: "exact", head: true }).eq("ativo", true),
    ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Configurações</h1>
        <p className="text-sm text-zinc-600">
          Ajustes que valem para o sistema inteiro, não para um módulo só.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/usuarios" className="group">
          <Card className="h-full transition-shadow group-hover:shadow-md">
            <CardHeader>
              <div className="mb-1 text-3xl">👤</div>
              <CardTitle className="text-base">Usuários</CardTitle>
              <CardDescription>
                Criar conta, definir o perfil de acesso, resetar senha e inativar quem saiu.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <span className="text-sm text-zinc-500">
                {usuarios ?? 0} {usuarios === 1 ? "usuário ativo" : "usuários ativos"}
              </span>
            </CardContent>
          </Card>
        </Link>

        <Link href="/configuracoes/colaboradores" className="group">
          <Card className="h-full transition-shadow group-hover:shadow-md">
            <CardHeader>
              <div className="mb-1 text-3xl">🧑‍🍳</div>
              <CardTitle className="text-base">Colaboradores</CardTitle>
              <CardDescription>
                Quem trabalha na empresa e em quais atividades atua. Não trata de acesso ao
                sistema.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <span className="text-sm text-zinc-500">
                {colaboradores ?? 0} {colaboradores === 1 ? "colaborador ativo" : "colaboradores ativos"}
              </span>
            </CardContent>
          </Card>
        </Link>

        {/* Cadastros seguem em Estoque de propósito: fornecedor, forma de
            pagamento e classificação existem para a compra, não para o sistema
            todo. Aqui fica só o atalho. */}
        <Link href="/cadastros" className="group">
          <Card className="h-full transition-shadow group-hover:shadow-md">
            <CardHeader>
              <div className="mb-1 text-3xl">🏷️</div>
              <CardTitle className="text-base">Cadastros de compra</CardTitle>
              <CardDescription>
                Fornecedores, formas de pagamento, classificações e unidades. Vivem no módulo
                Estoque, porque só a compra usa.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <span className="text-sm text-zinc-500">
                {fornecedores ?? 0} fornecedores ativos
              </span>
            </CardContent>
          </Card>
        </Link>

        <Link href="/itens/grupos" className="group">
          <Card className="h-full transition-shadow group-hover:shadow-md">
            <CardHeader>
              <div className="mb-1 text-3xl">📋</div>
              <CardTitle className="text-base">Grupos de contagem</CardTitle>
              <CardDescription>
                As listas que o estoquista importa para contar — de matéria-prima e de produto
                acabado.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <span className="text-sm text-zinc-500">Abrir em Itens →</span>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
