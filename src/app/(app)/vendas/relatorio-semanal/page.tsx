import { guardVendas } from "../guard";
import { Importador } from "./importador";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateBR } from "@/lib/utils";
import type { Mapeamento } from "./lib";
import { TabelaPedidosNovos, type LinhaPedidoNovo } from "./tabela-pedidos-novos";

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
    // Última venda REALIZADA. O relatório traz pedido agendado para os próximos
    // dias; sem o recorte, a "última venda" cairia no futuro e o atraso ficaria
    // negativo — a tela diria que está tudo em dia para sempre.
    supabase
      .from("vendas_pedidos")
      .select("data")
      .lte("data", new Date().toISOString().slice(0, 10))
      .order("data", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // A urgência vem de quando alguém importou pela última vez, não da data do
  // pedido — é a importação que atrasa, não a venda.
  const ultimaImportacao = importacoes?.[0] ?? null;
  const atraso = ultimaImportacao
    ? diasDesde(String(ultimaImportacao.importado_em).slice(0, 10))
    : null;
  const ultimaVenda = ultimoPedido?.data ?? null;

  // Pedidos novos da ÚLTIMA importação. Não há tabela nova: cada pedido já é
  // gravado com o id da importação que o trouxe (pedido atualizado mantém o id
  // de origem, então só entram aqui os que ela de fato criou). Por isso a lista
  // é sempre só da última, sem acumular histórico.
  let novosDaUltima: LinhaPedidoNovo[] = [];
  if (ultimaImportacao) {
    const { data: ped } = await supabase
      .from("vendas_pedidos")
      .select("pedido, data, total, forma_pag, atendente, eh_valido, cliente:vendas_clientes(id, nome)")
      .eq("importacao_id", ultimaImportacao.id)
      .order("data")
      .order("pedido")
      .limit(1000);
    novosDaUltima = (ped ?? []).map((p) => ({
      pedido: String(p.pedido),
      data: String(p.data),
      cliente: p.cliente?.nome ?? "(cliente não encontrado)",
      clienteId: p.cliente?.id ?? null,
      atendente: p.atendente,
      formaPag: p.forma_pag,
      total: Number(p.total),
      conta: !!p.eh_valido,
    }));
  }
  const quandoUltima = ultimaImportacao
    ? new Date(ultimaImportacao.importado_em).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

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
          Última importação:{" "}
          <strong>
            {formatDateBR(String(ultimaImportacao!.importado_em).slice(0, 10))}
          </strong>{" "}
          ({atraso === 0 ? "hoje" : `${atraso} ${atraso === 1 ? "dia" : "dias"} atrás`})
          {ultimaImportacao!.importado_por ? ` por ${ultimaImportacao!.importado_por}` : ""}.
          {ultimaVenda && (
            <> Última venda registrada: <strong>{formatDateBR(ultimaVenda)}</strong>.</>
          )}
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

      {ultimaImportacao && (
        <div className="flex flex-col gap-2">
          <div>
            <h2 className="text-sm font-semibold">Pedidos novos da última importação</h2>
            <p className="text-xs text-zinc-500">
              {quandoUltima}
              {ultimaImportacao.importado_por ? ` por ${ultimaImportacao.importado_por}` : ""}
              {ultimaImportacao.arquivo_nome ? ` · ${ultimaImportacao.arquivo_nome}` : ""}
              {/* Sem "já existiam": o registro guarda só os que ficaram iguais
                  (pedidos_ignorados), não os que foram corrigidos. Na importação
                  de 17/09 a prévia disse "17 já existiam" e o registro tinha 5 —
                  as duas certas, medindo coisas diferentes. Mostrar o 5 aqui
                  desmentiria a prévia que a pessoa acabou de conferir. */}
            </p>
          </div>
          {novosDaUltima.length > 0 ? (
            <TabelaPedidosNovos
              linhas={novosDaUltima}
              totalPedidos={ultimaImportacao.pedidos_novos ?? undefined}
            />
          ) : (
            <p className="rounded-md border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-500">
              A última importação não trouxe pedido novo — só conferiu ou corrigiu os que já existiam.
            </p>
          )}
        </div>
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
