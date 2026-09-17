import { formatCurrencyBRL, formatDateBR } from "@/lib/utils";
import { LinkCliente } from "../ui";

export type LinhaPedidoNovo = {
  pedido: string;
  data: string;
  cliente: string;
  /** Presente só depois de gravado — aí o nome vira link pra ficha. */
  clienteId?: string | null;
  /** Cliente que o sistema não reconheceu e vai cadastrar. */
  clienteNovo?: boolean;
  atendente: string | null;
  formaPag: string | null;
  total: number;
  /** false = cortesia ou valor zero: entra, mas não conta como venda. */
  conta?: boolean;
};

/**
 * Os pedidos novos de uma importação, um por um.
 *
 * O resumo dizia "18 novos" e parava aí. Pra saber se o arquivo trouxe o que a
 * pessoa esperava — o cliente que ligou ontem está aqui? — era preciso confiar
 * no número. A tabela antiga mostrava 8 pedidos misturando novos e repetidos,
 * o que não servia pra conferir nada.
 *
 * Mesma tabela na prévia (antes de gravar) e na página (depois), pra conferência
 * e registro falarem a mesma língua.
 */
export function TabelaPedidosNovos({
  linhas,
  totalPedidos,
}: {
  linhas: LinhaPedidoNovo[];
  /** Quantos são no total — a lista pode vir cortada num arquivo muito grande. */
  totalPedidos?: number;
}) {
  const soma = linhas.reduce((s, l) => s + (l.conta === false ? 0 : l.total), 0);
  const cortada = totalPedidos !== undefined && totalPedidos > linhas.length;

  return (
    <div className="overflow-x-auto rounded-md border border-zinc-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
          <tr>
            <th className="px-2 py-1.5">Data</th>
            <th className="px-2 py-1.5">Pedido</th>
            <th className="px-2 py-1.5">Cliente</th>
            <th className="px-2 py-1.5">Atendente</th>
            <th className="px-2 py-1.5">Pagamento</th>
            <th className="px-2 py-1.5 text-right">Valor</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.pedido} className="border-t border-zinc-100">
              <td className="whitespace-nowrap px-2 py-1.5 text-zinc-600">{formatDateBR(l.data)}</td>
              <td className="px-2 py-1.5 font-mono text-xs text-zinc-500">{l.pedido}</td>
              <td className="px-2 py-1.5">
                {l.clienteId ? <LinkCliente id={l.clienteId} nome={l.cliente} /> : l.cliente}
                {l.clienteNovo && (
                  <span className="ml-1.5 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-800">
                    cliente novo
                  </span>
                )}
              </td>
              <td className="px-2 py-1.5 text-zinc-600">{l.atendente ?? "—"}</td>
              <td className="px-2 py-1.5 text-zinc-600">{l.formaPag ?? "—"}</td>
              <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                {l.conta === false ? (
                  <span className="text-zinc-400" title="Cortesia ou valor zero — não conta como venda">
                    {formatCurrencyBRL(l.total)} · não conta
                  </span>
                ) : (
                  formatCurrencyBRL(l.total)
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-zinc-200 bg-zinc-50 text-sm">
          <tr>
            <td colSpan={5} className="px-2 py-1.5 text-zinc-600">
              {cortada
                ? `Mostrando ${linhas.length} de ${totalPedidos} pedidos`
                : `${linhas.length} ${linhas.length === 1 ? "pedido" : "pedidos"}`}
            </td>
            <td className="whitespace-nowrap px-2 py-1.5 text-right font-semibold tabular-nums">
              {formatCurrencyBRL(soma)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
