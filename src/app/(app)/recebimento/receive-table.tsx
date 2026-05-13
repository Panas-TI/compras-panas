"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatCurrencyBRL, formatDateBR } from "@/lib/utils";
import { receberLinhaAction } from "./actions";

export type LinhaPendente = {
  id: string;
  nome_item: string;
  codigo_queops: string | null;
  classificacao_nome: string | null;
  unidade_nome: string | null;
  fornecedor_nome: string | null;
  volume_solicitado: number | null;
  preco: number | null;
  valor: number | null;
  prazo: string | null;
  status: string;
  data_compra: string | null;
  solicitacao_id: string;
  solicitacao_inicio: string;
};

const STATUS_BADGE: Record<string, string> = {
  Aprovada: "bg-emerald-50 text-emerald-800 border-emerald-200",
  "Volumes ou Preço Alterados": "bg-blue-50 text-blue-800 border-blue-200",
};

export function ReceiveTable({ linhas }: { linhas: LinhaPendente[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"alfabetico" | "fornecedor">("alfabetico");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let arr = linhas;
    if (q) {
      arr = arr.filter(
        (l) =>
          l.nome_item.toLowerCase().includes(q) ||
          (l.codigo_queops?.toLowerCase().includes(q) ?? false) ||
          (l.fornecedor_nome?.toLowerCase().includes(q) ?? false)
      );
    }
    arr = [...arr].sort((a, b) => {
      if (sort === "fornecedor") {
        const fa = a.fornecedor_nome ?? "zzz";
        const fb = b.fornecedor_nome ?? "zzz";
        const cmp = fa.localeCompare(fb, "pt-BR");
        if (cmp !== 0) return cmp;
      }
      return a.nome_item.localeCompare(b.nome_item, "pt-BR");
    });
    return arr;
  }, [linhas, query, sort]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3 rounded-md border border-zinc-200 bg-white p-3">
        <div className="flex flex-1 min-w-[220px] flex-col gap-1.5">
          <label htmlFor="q" className="text-sm font-medium">Buscar</label>
          <Input
            id="q"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Item, código Queóps ou fornecedor..."
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="sort" className="text-sm font-medium">Ordenar por</label>
          <Select id="sort" value={sort} onChange={(e) => setSort(e.target.value as "alfabetico" | "fornecedor")}>
            <option value="alfabetico">Ordem alfabética (item)</option>
            <option value="fornecedor">Fornecedor (depois item)</option>
          </Select>
        </div>
        <div className="ml-auto self-end text-sm text-zinc-600">
          {filtered.length} {filtered.length === 1 ? "item pendente" : "itens pendentes"}
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left">
            <tr>
              <th className="px-2 py-2 font-medium">Item</th>
              <th className="px-2 py-2 font-medium">Fornecedor</th>
              <th className="px-2 py-2 text-right font-medium">Solicitado</th>
              <th className="px-2 py-2 text-right font-medium">Valor</th>
              <th className="px-2 py-2 font-medium">Status</th>
              <th className="px-2 py-2 font-medium">Qtd recebida</th>
              <th className="px-2 py-2 font-medium">Data recebimento</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((l) => (
              <Row key={l.id} linha={l} />
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-zinc-500">
                  Nada pendente de recebimento.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ linha }: { linha: LinhaPendente }) {
  const today = new Date().toISOString().slice(0, 10);
  const [qtd, setQtd] = useState(
    linha.volume_solicitado != null
      ? linha.volume_solicitado.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 })
      : ""
  );
  const [data, setData] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  const handle = () => {
    setError(null);
    startTransition(async () => {
      const res = await receberLinhaAction(linha.id, qtd, data);
      if (res.error) setError(res.error);
      else setDone(true);
    });
  };

  if (done) return null;

  const badgeStyle = STATUS_BADGE[linha.status] ?? "bg-zinc-100 text-zinc-700 border-zinc-200";

  return (
    <tr className="border-b border-zinc-100 last:border-0">
      <td className="px-2 py-1.5">
        <div className="flex flex-col">
          <span className="font-medium">{linha.nome_item}</span>
          <span className="flex items-center gap-2 text-xs text-zinc-500">
            {linha.codigo_queops ? <span className="font-mono">{linha.codigo_queops}</span> : <span className="text-amber-600">sem código</span>}
            {linha.classificacao_nome && <span>· {linha.classificacao_nome}</span>}
            {linha.unidade_nome && <span>· {linha.unidade_nome}</span>}
          </span>
          <span className="text-xs text-zinc-400">
            semana {formatDateBR(linha.solicitacao_inicio)}
          </span>
        </div>
      </td>
      <td className="px-2 py-1.5 text-zinc-700">{linha.fornecedor_nome ?? "—"}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">
        {linha.volume_solicitado?.toLocaleString("pt-BR", { maximumFractionDigits: 3 }) ?? "—"}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrencyBRL(linha.valor ?? 0)}</td>
      <td className="px-2 py-1.5">
        <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${badgeStyle}`}>
          {linha.status}
        </span>
      </td>
      <td className="px-2 py-1.5">
        <Input
          value={qtd}
          onChange={(e) => setQtd(e.target.value)}
          className="h-8 max-w-[100px] text-right text-sm tabular-nums"
          inputMode="decimal"
          placeholder="0,00"
        />
      </td>
      <td className="px-2 py-1.5">
        <Input
          type="date"
          value={data}
          onChange={(e) => setData(e.target.value)}
          className="h-8 max-w-[150px] text-sm"
        />
      </td>
      <td className="px-2 py-1.5 text-right">
        <div className="flex flex-col items-end gap-1">
          <Button size="sm" onClick={handle} disabled={isPending}>
            {isPending ? "Salvando..." : "Marcar recebido"}
          </Button>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      </td>
    </tr>
  );
}
