import { guardVendas } from "../guard";
import { TabelaClientes, type LinhaCliente } from "./tabela-clientes";

export const dynamic = "force-dynamic";

const CAMPOS =
  "id, nome, status, telefone_e164, telefone_raw, telefone_presumido, canal_preferido, ultima_compra, intervalo_mediano_dias, frequencia_compras, ticket_medio, total_vendas, receita_anual_risco, itens_habituais, verificar";

export default async function ClientesPage() {
  const { supabase } = await guardVendas();

  const { data } = await supabase
    .from("vendas_clientes")
    .select(CAMPOS)
    .eq("ativo", true)
    .order("total_vendas", { ascending: false })
    .limit(2000);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Clientes</h1>
        <p className="text-sm text-zinc-600">
          Toda a carteira numa tela. Busque por nome, telefone ou produto que o cliente costuma levar.
        </p>
      </div>
      <TabelaClientes clientes={(data ?? []) as unknown as LinhaCliente[]} />
    </div>
  );
}
