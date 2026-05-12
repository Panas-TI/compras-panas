import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ItemForm } from "../item-form";
import { createItemAction } from "../actions";

export default async function NovoItemPage() {
  const supabase = await createClient();
  const [{ data: classificacoes }, { data: unidades }, { data: fornecedores }, { data: formasPagto }] =
    await Promise.all([
      supabase.from("classificacoes").select("id, nome").eq("ativo", true).order("nome"),
      supabase.from("unidades_medida").select("id, nome").eq("ativo", true).order("nome"),
      supabase.from("fornecedores").select("id, nome").eq("ativo", true).order("nome"),
      supabase.from("formas_pagamento").select("id, nome").eq("ativo", true).order("nome"),
    ]);

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Novo item</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cadastro</CardTitle>
        </CardHeader>
        <CardContent>
          <ItemForm
            action={createItemAction}
            classificacoes={classificacoes ?? []}
            unidades={unidades ?? []}
            fornecedores={fornecedores ?? []}
            formasPagto={formasPagto ?? []}
            submitLabel="Criar item"
          />
        </CardContent>
      </Card>
    </div>
  );
}
