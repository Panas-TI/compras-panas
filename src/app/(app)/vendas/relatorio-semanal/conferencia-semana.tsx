import { createClient } from "@/lib/supabase/server";
import { formatCurrencyBRL, formatDateBR } from "@/lib/utils";
import { coberturaVendas } from "../cobertura";
import { diaEmSP } from "../contato-regras";
import { DIAS_CURTO, diaDaSemana, somarDias } from "../rota-regras";

/**
 * Conferência com o ERP.
 *
 * Existe porque o número certo, sozinho, não basta: o placar mostrava o total
 * da semana e o Queóps mostrava outro, e descobrir o porquê virava investigação
 * — "tenho 35 mil aqui e 37 mil lá, e não sei explicar".
 *
 * A diferença quase sempre é a mesma: a exportação só traz pedido finalizado,
 * então o dia de hoje ainda não chegou. Em vez de deixar a pessoa desconfiar
 * sozinha, a tela diz exatamente qual período conferir no ERP e qual valor
 * deve aparecer lá.
 */
export async function ConferenciaSemana() {
  const supabase = await createClient();
  const hoje = diaEmSP(new Date());

  // Segunda-feira desta semana, no fuso de Porto Alegre.
  const inicio = somarDias(hoje, -(diaDaSemana(hoje) - 1));
  const fim = somarDias(inicio, 6);

  const [{ data: pedidos }, cobertura] = await Promise.all([
    supabase
      .from("vendas_pedidos")
      .select("data, total, eh_valido")
      .gte("data", inicio)
      .lte("data", fim)
      .limit(5000),
    coberturaVendas(),
  ]);

  const porDia = new Map<string, { pedidos: number; valor: number; foraDaConta: number }>();
  for (const p of pedidos ?? []) {
    const d = porDia.get(p.data) ?? { pedidos: 0, valor: 0, foraDaConta: 0 };
    d.pedidos++;
    if (p.eh_valido) d.valor += Number(p.total);
    else d.foraDaConta++;
    porDia.set(p.data, d);
  }

  const dias = Array.from(porDia.keys()).sort();
  const totalPedidos = (pedidos ?? []).length;
  const totalValor = Array.from(porDia.values()).reduce((s, d) => s + d.valor, 0);
  const foraDaConta = Array.from(porDia.values()).reduce((s, d) => s + d.foraDaConta, 0);
  const ultimoDia = dias.at(-1) ?? null;

  if (dias.length === 0) return null;

  return (
    <div className="rounded-md border border-zinc-200 bg-white">
      <div className="border-b border-zinc-100 px-4 py-3">
        <h2 className="text-sm font-semibold">Conferência com o Queóps</h2>
        <p className="text-xs text-zinc-500">
          Semana de {formatDateBR(inicio)} a {formatDateBR(fim)} · por{" "}
          <strong className="font-medium text-zinc-700">data de lançamento</strong> do pedido
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
            <tr>
              <th className="px-4 py-2">Dia</th>
              <th className="px-4 py-2 text-right">Pedidos</th>
              <th className="px-4 py-2 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {dias.map((d) => {
              const v = porDia.get(d)!;
              return (
                <tr key={d} className="border-t border-zinc-50">
                  <td className="whitespace-nowrap px-4 py-1.5">
                    {DIAS_CURTO[diaDaSemana(d)]} {formatDateBR(d)}
                  </td>
                  <td className="px-4 py-1.5 text-right tabular-nums text-zinc-600">
                    {v.pedidos}
                    {v.foraDaConta > 0 && (
                      <span className="ml-1 text-xs text-zinc-400" title="Cortesia ou valor zero">
                        ({v.foraDaConta} não contam)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{formatCurrencyBRL(v.valor)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t border-zinc-200 bg-zinc-50">
            <tr>
              <td className="px-4 py-2 font-medium">Total</td>
              <td className="px-4 py-2 text-right font-medium tabular-nums">{totalPedidos}</td>
              <td className="px-4 py-2 text-right font-semibold tabular-nums">
                {formatCurrencyBRL(totalValor)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="border-t border-zinc-100 px-4 py-3 text-sm">
        <p className="text-zinc-700">
          Para conferir, filtre no Queóps <strong>por data de lançamento</strong>, de{" "}
          <strong>{formatDateBR(inicio)}</strong> a{" "}
          <strong>{formatDateBR(ultimoDia ?? inicio)}</strong>. Deve dar{" "}
          <strong className="tabular-nums">{formatCurrencyBRL(totalValor)}</strong>
          {foraDaConta > 0 && (
            <>
              {" "}
              — fora {foraDaConta} {foraDaConta === 1 ? "pedido" : "pedidos"} de cortesia, que o
              Queóps lista com valor zero
            </>
          )}
          .
        </p>
        {/* A régua é outra, e é isso que explica a maior parte das diferenças:
            o relatório do Queóps só traz a data de lançamento, nunca a de
            entrega. Pedido lançado numa semana e entregue na seguinte conta em
            semanas diferentes conforme quem está olhando. */}
        <p className="mt-1 text-zinc-500">
          Se o Queóps for filtrado por <strong>data de entrega</strong>, o valor vai ser outro:
          pedido lançado semana passada para entregar nesta semana conta lá, e aqui entra na semana
          do lançamento. A exportação não traz a data de entrega, só a de lançamento.
        </p>
        {cobertura.faltaHoje && (
          <p className="mt-1 text-zinc-500">
            Pedidos lançados <strong>hoje</strong> entram na importação de amanhã, porque a
            exportação só traz pedido finalizado.
          </p>
        )}
        {cobertura.diasEmFalta.length > 0 && (
          <p className="mt-1 text-amber-700">
            ⚠ {cobertura.diasEmFalta.map((d) => formatDateBR(d)).join(", ")} ainda não{" "}
            {cobertura.diasEmFalta.length === 1 ? "entrou" : "entraram"} — importe antes de comparar.
          </p>
        )}
      </div>
    </div>
  );
}
