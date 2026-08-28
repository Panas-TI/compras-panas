import { guardVendas } from "../guard";
import { TabelaClientes, type LinhaCliente, type UltimoContato } from "./tabela-clientes";
import { AlertaImportacao } from "../alerta-importacao";

export const dynamic = "force-dynamic";

const CAMPOS =
  "id, nome, status, telefone_e164, telefone_raw, telefone_presumido, canal_preferido, ultima_compra, intervalo_mediano_dias, frequencia_compras, ticket_medio, total_vendas, receita_anual_risco, itens_habituais, verificar, frequencia_classe";

export default async function ClientesPage() {
  const { supabase, podeEscrever } = await guardVendas();
  const hoje = new Date().toISOString().slice(0, 10);

  const [{ data }, { data: contatos }, { data: fila }] = await Promise.all([
    supabase
      .from("vendas_clientes")
      .select(CAMPOS)
      .eq("ativo", true)
      .order("total_vendas", { ascending: false })
      .limit(2000),
    // Último contato por cliente. Vem ordenado do mais novo pro mais antigo, e
    // o Map abaixo só guarda a primeira ocorrência — que é justamente a última.
    supabase
      .from("vendas_contatos")
      .select("cliente_id, resultado, adiar_ate, criado_em")
      .order("criado_em", { ascending: false })
      .limit(1000),
    supabase.from("vendas_fila_manual").select("cliente_id").eq("data", hoje),
  ]);

  const ultimoContato: Record<string, UltimoContato> = {};
  for (const c of contatos ?? []) {
    if (c.cliente_id && !ultimoContato[c.cliente_id]) {
      ultimoContato[c.cliente_id] = {
        resultado: c.resultado,
        adiar_ate: c.adiar_ate,
        criado_em: c.criado_em,
      };
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <AlertaImportacao />
      <div>
        <h1 className="text-2xl font-semibold">Clientes</h1>
        <p className="text-sm text-zinc-600">
          Toda a carteira numa tela. Busque por nome, telefone ou produto que o cliente costuma
          levar. Use <strong>+ hoje</strong> para jogar um cliente no atendimento do dia.
        </p>
      </div>
      <TabelaClientes
        clientes={(data ?? []) as unknown as LinhaCliente[]}
        ultimoContato={ultimoContato}
        naFilaDeHoje={(fila ?? []).map((f) => f.cliente_id)}
        podeEscrever={podeEscrever}
      />
    </div>
  );
}
