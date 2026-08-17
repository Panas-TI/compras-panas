import { guardVendas } from "../guard";
import { Importador } from "./importador";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateBR } from "@/lib/utils";
import type { Mapeamento } from "./lib";

export const dynamic = "force-dynamic";

function diasDesde(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

export default async function RelatorioSemanalPage() {
  const { supabase, podeEscrever } = await guardVendas();

  const [{ data: importacoes }, { data: mapa }, { data: ultimoPedido }] = await Promise.all([
    supabase
      .from("vendas_importacoes")
      .select(
        "id, arquivo_nome, importado_por, importado_em, periodo_inicio, periodo_fim, pedidos_novos, pedidos_ignorados, clientes_novos"
      )
      .order("importado_em", { ascending: false })
      .limit(20),
    supabase
      .from("vendas_import_mapeamentos")
      .select("colunas")
      .eq("nome", "padrao")
      .maybeSingle(),
    supabase
      .from("vendas_pedidos")
      .select("data")
      .order("data", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const atraso = diasDesde(ultimoPedido?.data ?? null);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Relatório semanal</h1>
        <p className="text-sm text-zinc-600">
          Sobe a exportação de vendas do ERP. O sistema reconhece os clientes, ignora pedidos
          repetidos e recalcula a carteira inteira — fila de hoje, ciclo, ticket e reativação.
        </p>
      </div>

      {atraso !== null && (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            atraso > 7
              ? "border-red-200 bg-red-50 text-red-800"
              : atraso > 3
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          Última venda registrada: <strong>{formatDateBR(ultimoPedido!.data)}</strong> ({atraso}{" "}
          {atraso === 1 ? "dia" : "dias"} atrás).
          {atraso > 3 && (
            <> Enquanto não importar, a fila de hoje vai apontar cliente que já comprou.</>
          )}
        </div>
      )}

      {podeEscrever ? (
        <Importador mapeamentoSalvo={(mapa?.colunas as Mapeamento) ?? null} />
      ) : (
        <Card>
          <CardContent className="p-6 text-sm text-zinc-600">
            Só admin e vendas podem importar. Você pode consultar o histórico abaixo.
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold">Importações anteriores</h2>
        <div className="overflow-x-auto rounded-md border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-500">
              <tr>
                <th className="px-3 py-2">Quando</th>
                <th className="px-3 py-2">Arquivo</th>
                <th className="px-3 py-2">Período</th>
                <th className="px-3 py-2 text-right">Novos</th>
                <th className="px-3 py-2 text-right">Ignorados</th>
                <th className="px-3 py-2 text-right">Clientes novos</th>
                <th className="px-3 py-2">Por</th>
              </tr>
            </thead>
            <tbody>
              {(importacoes ?? []).map((i) => (
                <tr key={i.id} className="border-b border-zinc-50 last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 text-zinc-600">
                    {formatDateBR(String(i.importado_em).slice(0, 10))}
                  </td>
                  <td className="px-3 py-2">{i.arquivo_nome ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-zinc-600">
                    {i.periodo_inicio ? formatDateBR(i.periodo_inicio) : "—"} a{" "}
                    {i.periodo_fim ? formatDateBR(i.periodo_fim) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    {i.pedidos_novos ?? 0}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-500">
                    {i.pedidos_ignorados ?? 0}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{i.clientes_novos ?? 0}</td>
                  <td className="px-3 py-2 text-zinc-600">{i.importado_por ?? "—"}</td>
                </tr>
              ))}
              {!importacoes?.length && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-zinc-500">
                    Nenhuma importação ainda. Os 14.833 pedidos que já existem entraram por carga
                    inicial, antes desta tela.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
