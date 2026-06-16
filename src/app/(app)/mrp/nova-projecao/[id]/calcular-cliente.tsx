"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { calcularProjecaoAction, atualizarQtdAComprarAction } from "../actions";

export function CalcularBotao({ projecaoId }: { projecaoId: string }) {
  const router = useRouter();
  const [calculando, startCalc] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [alertas, setAlertas] = useState<string[]>([]);

  const calcular = () => {
    setErro(null);
    setAlertas([]);
    startCalc(async () => {
      const res = await calcularProjecaoAction(projecaoId);
      if (res.error) {
        setErro(res.error);
        return;
      }
      setAlertas(res.alertas ?? []);
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Calcular necessidade</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-sm text-zinc-700">
          Vou expandir recursivamente a árvore de fichas técnicas (BOM multi-nível): empanada →
          recheio/massa → ingredientes. Aplico merma % em cada nível. Agrego por item. Subtraio o
          estoque da última contagem. Resultado: quanto comprar de cada item.
        </p>
        {erro && (
          <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
            ⚠ {erro}
          </div>
        )}
        {alertas.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <strong>Alertas do cálculo:</strong>
            <ul className="ml-5 list-disc">
              {alertas.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </div>
        )}
        <Button onClick={calcular} disabled={calculando} className="self-start">
          {calculando ? "Calculando…" : "▶ Calcular necessidade"}
        </Button>
      </CardContent>
    </Card>
  );
}

type Necessidade = {
  id: string;
  item_id: string;
  necessidade_bruta: number;
  estoque_atual: number;
  necessidade_liquida: number;
  quantidade_a_comprar: number;
  unidade: string | null;
  alertas: string[];
  item: { codigo_queops: string | null; nome: string; preco_referencia: number | null } | null;
};

function fmtN(n: number, casas = 3): string {
  return n.toFixed(casas).replace(/\.?0+$/, "");
}

export function NecessidadeEditavel({
  projecaoId,
  necessidades,
  somenteLeitura,
}: {
  projecaoId: string;
  necessidades: Necessidade[];
  somenteLeitura: boolean;
}) {
  const [valores, setValores] = useState<Record<string, number>>(() =>
    Object.fromEntries(necessidades.map((n) => [n.item_id, Number(n.quantidade_a_comprar)]))
  );
  const [salvando, startSalvar] = useTransition();

  const onBlur = (itemId: string, novoValor: number) => {
    const original = valores[itemId];
    if (Math.abs(novoValor - original) < 0.000001) return;
    startSalvar(async () => {
      const res = await atualizarQtdAComprarAction(projecaoId, itemId, novoValor);
      if (res.error) {
        alert(res.error);
        // Reverte
        setValores((v) => ({ ...v, [itemId]: original }));
      }
    });
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 text-left">
          <tr>
            <th className="px-3 py-2 font-medium">Código</th>
            <th className="px-3 py-2 font-medium">Item</th>
            <th className="px-3 py-2 text-right font-medium">Bruta</th>
            <th className="px-3 py-2 text-right font-medium">Estoque</th>
            <th className="px-3 py-2 text-right font-medium">Líquida</th>
            <th className="px-3 py-2 text-right font-medium">A comprar</th>
            <th className="px-3 py-2 font-medium">Un.</th>
            <th className="px-3 py-2 text-right font-medium">Valor est.</th>
          </tr>
        </thead>
        <tbody>
          {necessidades
            .slice()
            .sort((a, b) => (a.item?.nome ?? "").localeCompare(b.item?.nome ?? ""))
            .map((n) => {
              const tem = (a: string) => Array.isArray(n.alertas) && n.alertas.includes(a);
              const semCod = tem("sem código Queóps");
              const semCont = tem("sem contagem");
              const valor =
                n.item?.preco_referencia && valores[n.item_id]
                  ? Number(n.item.preco_referencia) * valores[n.item_id]
                  : null;
              return (
                <tr key={n.id} className="border-t border-zinc-100">
                  <td className={`px-3 py-2 font-mono text-xs ${semCod ? "text-red-600" : ""}`}>
                    {n.item?.codigo_queops ?? "—"}
                  </td>
                  <td className="px-3 py-2">{n.item?.nome ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtN(Number(n.necessidade_bruta))}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${semCont ? "text-red-600" : ""}`}
                  >
                    {semCont ? "—" : fmtN(Number(n.estoque_atual))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    {fmtN(Number(n.necessidade_liquida))}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {somenteLeitura ? (
                      <span className="tabular-nums">{fmtN(valores[n.item_id])}</span>
                    ) : (
                      <input
                        type="number"
                        step="0.001"
                        min={0}
                        value={valores[n.item_id]}
                        onChange={(e) =>
                          setValores((v) => ({ ...v, [n.item_id]: Number(e.target.value) }))
                        }
                        onBlur={(e) => onBlur(n.item_id, Number(e.target.value))}
                        disabled={salvando}
                        className="w-24 rounded border border-zinc-300 bg-white px-1 py-0.5 text-right tabular-nums text-xs"
                      />
                    )}
                  </td>
                  <td className="px-3 py-2 text-zinc-600">{n.unidade ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs text-zinc-600">
                    {valor !== null
                      ? `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : "—"}
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}
