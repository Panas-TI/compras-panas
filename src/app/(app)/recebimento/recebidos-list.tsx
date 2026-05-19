"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateBR } from "@/lib/utils";
import { desfazerRecebimentoAction } from "./actions";

export type LinhaRecebida = {
  id: string;
  nome_item: string;
  codigo_queops: string | null;
  unidade_nome: string | null;
  fornecedor_nome: string | null;
  volume_solicitado: number | null;
  volume_recebido: number | null;
  data_recebimento: string | null;
  observacao_recebimento: string | null;
  entregas: Array<{
    id: string;
    quantidade: number;
    data_recebimento: string;
    observacao: string | null;
  }>;
};

function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return "0";
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

export function RecebidosList({ recebidas }: { recebidas: LinhaRecebida[] }) {
  const [aberto, setAberto] = useState(false);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white">
      <button
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-zinc-800">
          Já recebidos ({recebidas.length})
        </span>
        <span className="text-sm text-zinc-500">{aberto ? "ocultar ▲" : "ver ▼"}</span>
      </button>

      {aberto && (
        <div className="flex flex-col gap-2 border-t border-zinc-100 p-3">
          {recebidas.map((l) => (
            <RecebidoCard key={l.id} linha={l} />
          ))}
        </div>
      )}
    </div>
  );
}

function RecebidoCard({ linha: l }: { linha: LinhaRecebida }) {
  const router = useRouter();
  const [showSenha, setShowSenha] = useState(false);
  const [senha, setSenha] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const divergente =
    l.volume_solicitado != null &&
    l.volume_recebido != null &&
    Number(l.volume_solicitado) !== Number(l.volume_recebido);

  const desfazer = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await desfazerRecebimentoAction(l.id, senha);
      if (res.error) setError(res.error);
      else {
        setShowSenha(false);
        setSenha("");
        router.refresh();
      }
    });
  };

  return (
    <div className="rounded-md border border-emerald-100 bg-emerald-50/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{l.nome_item}</div>
          <div className="flex flex-wrap items-center gap-x-1.5 text-xs text-zinc-500">
            {l.codigo_queops ? (
              <span className="font-mono">{l.codigo_queops}</span>
            ) : (
              <span className="text-amber-600">sem código</span>
            )}
            {l.unidade_nome && <span>· {l.unidade_nome}</span>}
            {l.fornecedor_nome && <span>· {l.fornecedor_nome}</span>}
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">
          Recebido
        </span>
      </div>

      <div className="mt-2 grid grid-cols-3 divide-x divide-zinc-200 rounded-md border border-zinc-200 bg-white py-1.5 text-center">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">Solicitado</div>
          <div className="text-base font-semibold tabular-nums">{fmtNum(l.volume_solicitado)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">Recebido</div>
          <div className={`text-base font-semibold tabular-nums ${divergente ? "text-amber-700" : "text-emerald-700"}`}>
            {fmtNum(l.volume_recebido)}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">Última data</div>
          <div className="text-base font-semibold">{formatDateBR(l.data_recebimento)}</div>
        </div>
      </div>

      {l.entregas.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {l.entregas.map((e, i) => (
            <div key={e.id} className="rounded bg-white px-2 py-1 text-xs text-zinc-700">
              <span className="font-medium">Entrega {i + 1}:</span> {fmtNum(e.quantidade)} em{" "}
              {formatDateBR(e.data_recebimento)}
              {e.observacao && <span className="text-zinc-500"> — {e.observacao}</span>}
            </div>
          ))}
        </div>
      )}

      {divergente && (
        <p className="mt-1.5 text-xs text-amber-700">⚠ Recebido diferente do solicitado.</p>
      )}

      {/* Desfazer */}
      {!showSenha ? (
        <button
          onClick={() => {
            setShowSenha(true);
            setError(null);
          }}
          className="mt-2 text-xs text-red-600 hover:underline"
        >
          Desfazer recebimento
        </button>
      ) : (
        <form onSubmit={desfazer} className="mt-2 rounded-md border border-zinc-200 bg-white p-2">
          <p className="text-xs text-zinc-600">
            Digite sua senha pra confirmar. O item volta pra lista de pendentes e as entregas
            registradas serão apagadas.
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-1">
              <Label htmlFor={`senha-${l.id}`} className="text-xs">Sua senha</Label>
              <Input
                id={`senha-${l.id}`}
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete="current-password"
                className="h-9"
                autoFocus
              />
            </div>
            <div className="flex gap-1">
              <Button type="submit" variant="destructive" size="sm" disabled={isPending || !senha} className="h-9">
                {isPending ? "..." : "Confirmar"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9"
                onClick={() => {
                  setShowSenha(false);
                  setSenha("");
                  setError(null);
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </form>
      )}
    </div>
  );
}
