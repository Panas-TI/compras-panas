import { guardVendas } from "../guard";
import { TabelaContatos, type LinhaContato } from "./tabela-contatos";

export const dynamic = "force-dynamic";

// Teto de segurança: o PostgREST corta em 1000 em silêncio. Pedimos 1 a mais
// pra saber se truncou e avisar na tela, em vez de mentir por omissão.
const TETO = 1000;

export default async function ContatosPage() {
  const { supabase } = await guardVendas();
  const hoje = new Date().toISOString().slice(0, 10);

  const [{ data, error }, { count: total }] = await Promise.all([
    supabase
      .from("vendas_contatos")
      .select(
        `id, canal, resultado, observacao, adiar_ate, criado_em,
         usuario:profiles(nome),
         cliente:vendas_clientes(id, nome, ultima_compra, ticket_medio)`
      )
      .order("criado_em", { ascending: false })
      .limit(TETO + 1),
    supabase.from("vendas_contatos").select("id", { count: "exact", head: true }),
  ]);

  const linhas = (data ?? []).slice(0, TETO) as unknown as LinhaContato[];
  const truncou = (data ?? []).length > TETO;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Contatos</h1>
        <p className="text-sm text-zinc-600">
          Tudo o que já foi falado com a carteira. Promessas vencidas aparecem primeiro no alerta.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Erro carregando contatos: {error.message}
        </div>
      )}

      {truncou && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Mostrando os {TETO} contatos mais recentes de {total ?? "?"}. Os mais antigos ficaram de
          fora desta tela — a ficha de cada cliente segue com o histórico completo dele.
        </div>
      )}

      <TabelaContatos contatos={linhas} hoje={hoje} totalNoBanco={total ?? linhas.length} />
    </div>
  );
}
