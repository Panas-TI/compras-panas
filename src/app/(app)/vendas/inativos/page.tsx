import { guardVendas } from "../guard";
import { TabelaClientes, type LinhaCliente } from "../clientes/tabela-clientes";
import { formatCurrencyBRL } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { AlertaImportacao } from "../alerta-importacao";

export const dynamic = "force-dynamic";

const CAMPOS =
  "id, nome, status, telefone_e164, telefone_raw, telefone_presumido, canal_preferido, ultima_compra, intervalo_mediano_dias, frequencia_compras, ticket_medio, total_vendas, receita_anual_risco, itens_habituais, verificar";

export default async function InativosPage() {
  const { supabase } = await guardVendas();

  const { data } = await supabase
    .from("vendas_clientes")
    .select(CAMPOS)
    .eq("ativo", true)
    .eq("status", "inativo")
    .order("receita_anual_risco", { ascending: false, nullsFirst: false })
    .limit(2000);

  const lista = (data ?? []) as unknown as LinhaCliente[];
  const riscoTotal = lista.reduce((s, c) => s + Number(c.receita_anual_risco ?? 0), 0);
  const historico = lista.reduce((s, c) => s + Number(c.total_vendas ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <AlertaImportacao />
      <div>
        <h1 className="text-2xl font-semibold">Reativação</h1>
        <p className="text-sm text-zinc-600">
          Clientes parados além do próprio ritmo. Ordenados pela receita anual que está deixando de
          entrar — não pelo que já compraram.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-zinc-500">Clientes inativos</div>
            <div className="text-2xl font-semibold tabular-nums">{lista.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-zinc-500">Receita anual em risco</div>
            <div className="text-2xl font-semibold tabular-nums text-amber-700">
              {formatCurrencyBRL(riscoTotal)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-zinc-500">Já compraram (histórico)</div>
            <div className="text-2xl font-semibold tabular-nums">{formatCurrencyBRL(historico)}</div>
          </CardContent>
        </Card>
      </div>

      <TabelaClientes clientes={lista} estadoInicial="inativo" titulo="inativos" />
    </div>
  );
}
