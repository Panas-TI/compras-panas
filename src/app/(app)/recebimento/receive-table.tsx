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
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 rounded-md border border-zinc-200 bg-white p-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="q" className="text-sm font-medium">Buscar</label>
          <Input
            id="q"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Item, código ou fornecedor..."
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="sort" className="text-sm font-medium">Ordenar por</label>
          <Select id="sort" value={sort} onChange={(e) => setSort(e.target.value as "alfabetico" | "fornecedor")}>
            <option value="alfabetico">Ordem alfabética</option>
            <option value="fornecedor">Fornecedor</option>
          </Select>
        </div>
        <div className="text-sm text-zinc-600 sm:self-end sm:pb-2">
          {filtered.length} {filtered.length === 1 ? "pendente" : "pendentes"}
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="rounded-md border border-dashed border-zinc-300 bg-white px-3 py-10 text-center text-sm text-zinc-500">
          Nada pendente de recebimento.
        </div>
      )}

      <div className="flex flex-col gap-3">
        {filtered.map((l) => (
          <ItemCard key={l.id} linha={l} />
        ))}
      </div>
    </div>
  );
}

function ItemCard({ linha }: { linha: LinhaPendente }) {
  const today = new Date().toISOString().slice(0, 10);
  const [qtd, setQtd] = useState(
    linha.volume_solicitado != null
      ? linha.volume_solicitado.toLocaleString("pt-BR", { maximumFractionDigits: 3 })
      : ""
  );
  const [data, setData] = useState(today);
  const [obs, setObs] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  const handle = () => {
    setError(null);
    startTransition(async () => {
      const res = await receberLinhaAction(linha.id, qtd, data, obs);
      if (res.error) setError(res.error);
      else setDone(true);
    });
  };

  if (done) return null;

  const badgeStyle = STATUS_BADGE[linha.status] ?? "bg-zinc-100 text-zinc-700 border-zinc-200";

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      {/* Cabeçalho do item */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-base font-semibold leading-tight">{linha.nome_item}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500">
            {linha.codigo_queops ? (
              <span className="font-mono">{linha.codigo_queops}</span>
            ) : (
              <span className="text-amber-600">sem código</span>
            )}
            {linha.classificacao_nome && <span>· {linha.classificacao_nome}</span>}
            {linha.unidade_nome && <span>· {linha.unidade_nome}</span>}
          </div>
        </div>
        <span className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-xs ${badgeStyle}`}>
          {linha.status}
        </span>
      </div>

      {/* Infos */}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        <div>
          <div className="text-xs text-zinc-500">Fornecedor</div>
          <div>{linha.fornecedor_nome ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs text-zinc-500">Solicitado</div>
          <div className="tabular-nums">
            {linha.volume_solicitado?.toLocaleString("pt-BR", { maximumFractionDigits: 3 }) ?? "—"}
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-500">Valor</div>
          <div className="tabular-nums">{formatCurrencyBRL(linha.valor ?? 0)}</div>
        </div>
        <div>
          <div className="text-xs text-zinc-500">Semana</div>
          <div>{formatDateBR(linha.solicitacao_inicio)}</div>
        </div>
      </div>

      {/* Campos de recebimento */}
      <div className="mt-4 flex flex-col gap-3 border-t border-zinc-100 pt-4 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <label className="text-sm font-medium">Quantidade recebida</label>
          <Input
            value={qtd}
            onChange={(e) => setQtd(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            className="h-11 text-base tabular-nums"
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <label className="text-sm font-medium">Data recebimento</label>
          <Input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="h-11 text-base"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-1.5">
        <label className="text-sm font-medium">Observação</label>
        <Input
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          placeholder="Ex: veio 2kg a menos, embalagem danificada..."
          className="h-11 text-base"
        />
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <Button
        onClick={handle}
        disabled={isPending}
        className="mt-4 h-12 w-full text-base"
      >
        {isPending ? "Salvando..." : "Marcar recebido"}
      </Button>
    </div>
  );
}
