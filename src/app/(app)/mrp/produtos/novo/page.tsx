import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NovoProdutoForm } from "./novo-form";

export default async function NovoProdutoPage() {
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
    <div className="flex flex-col gap-4">
      <Link href="/mrp/produtos" className="text-sm text-zinc-600 hover:underline">
        ← Voltar pra lista de produtos
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">Novo produto</h1>
        <p className="text-sm text-zinc-600">
          Cria o produto. Depois você adiciona a ficha técnica na página de edição.
        </p>
      </div>
      <NovoProdutoForm />
    </div>
  );
}
