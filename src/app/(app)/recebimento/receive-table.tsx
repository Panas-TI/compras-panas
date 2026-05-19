"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatCurrencyBRL, formatDateBR } from "@/lib/utils";
import { addEntregaAction, removerEntregaAction, finalizarRecebimentoAction } from "./actions";

export type Entrega = {
  id: string;
  quantidade: number;
  data_recebimento: string;
  observacao: string | null;
};

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
  entregas: Entrega[];
};

function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return "0";
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

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
        const cmp = (a.fornecedor_nome ?? "zzz").localeCompare(b.fornecedor_nome ?? "zzz", "pt-BR");
        if (cmp !== 0) return cmp;
      }
      return a.nome_item.localeCompare(b.nome_item, "pt-BR");
    });
    return arr;
  }, [linhas, query, sort]);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-2 rounded-md border border-zinc-200 bg-white p-2.5 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="q" className="text-xs font-medium text-zinc-600">Buscar</label>
          <Input
            id="q"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Item, código ou fornecedor..."
            className="h-9"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="sort" className="text-xs font-medium text-zinc-600">Ordenar</label>
          <Select id="sort" value={sort} onChange={(e) => setSort(e.target.value as "alfabetico" | "fornecedor")} className="h-9">
            <option value="alfabetico">Ordem alfabética</option>
            <option value="fornecedor">Fornecedor</option>
          </Select>
        </div>
        <div className="text-xs text-zinc-600 sm:self-end sm:pb-2">
          {filtered.length} {filtered.length === 1 ? "pendente" : "pendentes"}
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="rounded-md border border-dashed border-zinc-300 bg-white px-3 py-8 text-center text-sm text-zinc-500">
          Nada pendente de recebimento.
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {filtered.map((l) => (
          <ItemCard key={l.id} linha={l} />
        ))}
      </div>
    </div>
  );
}

function ItemCard({ linha }: { linha: LinhaPendente }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [showForm, setShowForm] = useState(linha.entregas.length === 0);

  // form da nova entrega
  const today = new Date().toISOString().slice(0, 10);
  const [qtd, setQtd] = useState("");
  const [data, setData] = useState(today);
  const [obs, setObs] = useState("");

  if (done) return null;

  const totalRecebido = linha.entregas.reduce((s, e) => s + e.quantidade, 0);
  const solicitado = linha.volume_solicitado ?? 0;
  const falta = Math.max(0, solicitado - totalRecebido);

  const salvarEntrega = () => {
    setError(null);
    startTransition(async () => {
      const res = await addEntregaAction(linha.id, qtd, data, obs);
      if (res.error) {
        setError(res.error);
        return;
      }
      setQtd("");
      setObs("");
      setData(today);
      setShowForm(false);
      router.refresh();
    });
  };

  const removerEntrega = (entregaId: string) => {
    if (!confirm("Tem certeza que deseja remover esta entrega?")) return;
    setError(null);
    startTransition(async () => {
      const res = await removerEntregaAction(entregaId);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  };

  const finalizar = () => {
    setError(null);
    if (!confirm(`Finalizar recebimento de "${linha.nome_item}"? Total recebido: ${fmtNum(totalRecebido)}.`)) return;
    startTransition(async () => {
      const res = await finalizarRecebimentoAction(linha.id);
      if (res.error) setError(res.error);
      else setDone(true);
    });
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm">
      {/* Nome + código */}
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">{linha.nome_item}</div>
        <div className="flex flex-wrap items-center gap-x-1.5 text-xs text-zinc-500">
          {linha.codigo_queops ? (
            <span className="font-mono">{linha.codigo_queops}</span>
          ) : (
            <span className="text-amber-600">sem código</span>
          )}
          {linha.unidade_nome && <span>· {linha.unidade_nome}</span>}
          {linha.fornecedor_nome && <span>· {linha.fornecedor_nome}</span>}
        </div>
      </div>

      {/* Stats — Solicitado / Recebido / Falta, centralizados */}
      <div className="mt-2 grid grid-cols-3 divide-x divide-zinc-200 rounded-md border border-zinc-200 bg-zinc-50 py-2 text-center">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">Solicitado</div>
          <div className="text-xl font-semibold tabular-nums text-zinc-800">{fmtNum(solicitado)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">Recebido</div>
          <div className="text-xl font-semibold tabular-nums text-emerald-700">{fmtNum(totalRecebido)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">Falta</div>
          <div
            className={`text-xl font-semibold tabular-nums ${falta > 0 ? "text-amber-700" : "text-emerald-700"}`}
          >
            {fmtNum(falta)}
          </div>
        </div>
      </div>

      {/* Entregas registradas */}
      {linha.entregas.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {linha.entregas.map((e, i) => (
            <div key={e.id} className="flex items-center justify-between rounded bg-zinc-50 px-2 py-1 text-xs">
              <span>
                <span className="font-medium">Entrega {i + 1}:</span> {fmtNum(e.quantidade)} em{" "}
                {formatDateBR(e.data_recebimento)}
                {e.observacao && <span className="text-zinc-500"> — {e.observacao}</span>}
              </span>
              <button
                onClick={() => removerEntrega(e.id)}
                disabled={isPending}
                className="ml-2 shrink-0 text-red-600 hover:underline"
              >
                remover
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Form de nova entrega */}
      {showForm ? (
        <div className="mt-2 flex flex-col gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-2 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-xs font-medium text-zinc-600">Quantidade recebida</label>
            <Input
              value={qtd}
              onChange={(e) => setQtd(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              className="h-10 tabular-nums"
            />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-xs font-medium text-zinc-600">Data</label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="h-10" />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-xs font-medium text-zinc-600">Observação (opcional)</label>
            <Input
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="ex: veio danificado"
              className="h-10"
            />
          </div>
          <div className="flex gap-1">
            <Button onClick={salvarEntrega} disabled={isPending} size="sm" className="h-10">
              Salvar
            </Button>
            {linha.entregas.length > 0 && (
              <Button onClick={() => setShowForm(false)} variant="ghost" size="sm" className="h-10">
                Cancelar
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => setShowForm(true)}
            className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            + Add entrega
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {/* Finalizar */}
      {linha.entregas.length > 0 && (
        <Button onClick={finalizar} disabled={isPending} className="mt-2.5 h-10 w-full text-sm">
          Finalizar recebimento ({fmtNum(totalRecebido)})
        </Button>
      )}
    </div>
  );
}
