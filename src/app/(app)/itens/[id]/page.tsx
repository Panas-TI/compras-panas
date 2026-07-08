import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ItemForm } from "../item-form";
import { updateItemAction, type ItemFormState } from "../actions";

export default async function EditarItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: item }, { data: classificacoes }, { data: unidades }, { data: fornecedores }, { data: formasPagto }] =
    await Promise.all([
      supabase.from("itens").select("*").eq("id", id).maybeSingle(),
      supabase.from("classificacoes").select("id, nome").eq("ativo", true).order("nome"),
      supabase.from("unidades_medida").select("id, nome").eq("ativo", true).order("nome"),
      supabase.from("fornecedores").select("id, nome").eq("ativo", true).order("nome"),
      supabase.from("formas_pagamento").select("id, nome").eq("ativo", true).order("nome"),
    ]);

  if (!item) notFound();

  const bound = async (prev: ItemFormState, fd: FormData) => {
    "use server";
    return updateItemAction(id, prev, fd);
  };

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Editar item</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{item.nome}</CardTitle>
        </CardHeader>
        <CardContent>
          <ItemForm
            action={bound}
            defaults={{
              nome: item.nome,
              codigo_queops: item.codigo_queops,
              classificacao_id: item.classificacao_id,
              unidade_id: item.unidade_id,
              fornecedor_padrao_id: item.fornecedor_padrao_id,
              forma_pagto_padrao_id: item.forma_pagto_padrao_id,
              preco_referencia: item.preco_referencia,
              prazo_padrao: item.prazo_padrao,
              embalagem_compra_nome: item.embalagem_compra_nome,
              qtd_por_embalagem: item.qtd_por_embalagem,
              ativo: item.ativo,
            }}
            classificacoes={classificacoes ?? []}
            unidades={unidades ?? []}
            fornecedores={fornecedores ?? []}
            formasPagto={formasPagto ?? []}
            submitLabel="Salvar alterações"
          />
        </CardContent>
      </Card>
    </div>
  );
}
