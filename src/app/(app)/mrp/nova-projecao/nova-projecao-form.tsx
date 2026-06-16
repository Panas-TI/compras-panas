"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { criarProjecaoAction, type DemandaInput } from "./actions";

type Produto = {
  id: string;
  codigo_queops: string | null;
  nome: string;
  categoria: string;
};

type Linha = {
  _key: string;
  produto_id: string;
  quantidade: number;
  observacoes: string | null;
};

function key() {
  return Math.random().toString(36).slice(2, 10);
}

export function NovaProjecaoForm({
  produtos,
  inicioPadrao,
  fimPadrao,
  ultimaProjecao,
}: {
  produtos: Produto[];
  inicioPadrao: string;
  fimPadrao: string;
  ultimaProjecao: {
    id: string;
    semana_inicio: string;
    demanda: Array<{ produto_id: string; quantidade: number }>;
  } | null;
}) {
  const [semanaInicio, setSemanaInicio] = useState(inicioPadrao);
  const [semanaFim, setSemanaFim] = useState(fimPadrao);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, startSalvar] = useTransition();

  const produtoPorId = useMemo(
    () => new Map(produtos.map((p) => [p.id, p])),
    [produtos]
  );

  const adicionar = (produto_id = "") => {
    setLinhas((ls) => [
      ...ls,
      { _key: key(), produto_id, quantidade: 0, observacoes: null },
    ]);
  };

  const remover = (k: string) => {
    setLinhas((ls) => ls.filter((l) => l._key !== k));
  };

  const update = (k: string, patch: Partial<Linha>) => {
    setLinhas((ls) => ls.map((l) => (l._key === k ? { ...l, ...patch } : l)));
  };

  const copiarSemanaAnterior = () => {
    if (!ultimaProjecao) return;
    const novas = ultimaProjecao.demanda
      .filter((d) => produtoPorId.has(d.produto_id))
      .map((d) => ({
        _key: key(),
        produto_id: d.produto_id,
        quantidade: Number(d.quantidade),
        observacoes: null as string | null,
      }));
    setLinhas(novas);
  };

  const totalUnidades = linhas.reduce((s, l) => s + (Number(l.quantidade) || 0), 0);
  const produtosJaEscolhidos = new Set(linhas.map((l) => l.produto_id));

  const calcular = () => {
    setErro(null);
    const validas: DemandaInput[] = [];
    for (const l of linhas) {
      if (!l.produto_id || l.quantidade <= 0) continue;
      validas.push({
        produto_id: l.produto_id,
        quantidade: Number(l.quantidade),
        observacoes: l.observacoes,
      });
    }
    if (validas.length === 0) {
      setErro("Adicione pelo menos um produto com quantidade > 0.");
      return;
    }
    // Dedupe (mantém a última quantidade se duplicar)
    const dedup = new Map<string, DemandaInput>();
    for (const d of validas) dedup.set(d.produto_id, d);

    startSalvar(async () => {
      const res = await criarProjecaoAction(semanaInicio, semanaFim, Array.from(dedup.values()));
      if (res.error) setErro(res.error);
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Semana e demanda</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-600">Semana — início</label>
            <Input
              type="date"
              value={semanaInicio}
              onChange={(e) => setSemanaInicio(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-600">Semana — fim</label>
            <Input
              type="date"
              value={semanaFim}
              onChange={(e) => setSemanaFim(e.target.value)}
              min={semanaInicio}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-3">
          <div className="text-sm">
            <strong>{linhas.length}</strong> {linhas.length === 1 ? "produto" : "produtos"} ·{" "}
            <strong className="tabular-nums">{totalUnidades}</strong> unidades totais
          </div>
          <div className="flex gap-2">
            {ultimaProjecao && (
              <Button type="button" variant="outline" onClick={copiarSemanaAnterior}>
                ↻ Copiar última semana ({ultimaProjecao.semana_inicio.split("-").reverse().join("/")})
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => adicionar()}>
              + Adicionar produto
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border border-zinc-200">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-zinc-50 text-left">
              <tr>
                <th className="px-2 py-1 font-medium">Produto</th>
                <th className="px-2 py-1 text-right font-medium">Quantidade</th>
                <th className="px-2 py-1 font-medium">Observações</th>
                <th className="px-2 py-1"></th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const prod = produtoPorId.get(l.produto_id);
                return (
                  <tr key={l._key} className="border-t border-zinc-100">
                    <td className="px-2 py-1">
                      <select
                        value={l.produto_id}
                        onChange={(e) => update(l._key, { produto_id: e.target.value })}
                        className="w-full rounded border border-zinc-300 bg-white px-1 py-1 text-xs"
                      >
                        <option value="">— Selecione produto —</option>
                        {produtos.map((p) => (
                          <option
                            key={p.id}
                            value={p.id}
                            disabled={produtosJaEscolhidos.has(p.id) && p.id !== l.produto_id}
                          >
                            {p.codigo_queops ?? "—"} · {p.nome}
                            {produtosJaEscolhidos.has(p.id) && p.id !== l.produto_id
                              ? " (já adicionado)"
                              : ""}
                          </option>
                        ))}
                      </select>
                      {prod && (
                        <p className="mt-0.5 text-[10px] text-zinc-500">{prod.categoria}</p>
                      )}
                    </td>
                    <td className="px-2 py-1 text-right">
                      <input
                        type="number"
                        step="1"
                        min={0}
                        value={l.quantidade}
                        onChange={(e) =>
                          update(l._key, { quantidade: Number(e.target.value) })
                        }
                        className="w-24 rounded border border-zinc-300 bg-white px-1 py-1 text-xs text-right tabular-nums"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        value={l.observacoes ?? ""}
                        onChange={(e) =>
                          update(l._key, { observacoes: e.target.value || null })
                        }
                        className="w-full rounded border border-zinc-300 bg-white px-1 py-1 text-xs"
                        placeholder="opcional"
                      />
                    </td>
                    <td className="px-2 py-1 text-right">
                      <button
                        type="button"
                        onClick={() => remover(l._key)}
                        className="text-xs text-red-700 hover:underline"
                        title="Remover linha"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
              {linhas.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-2 py-6 text-center text-xs text-zinc-500">
                    Demanda vazia. Adicione produtos com &ldquo;+ Adicionar produto&rdquo;.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {erro && (
          <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
            ⚠ {erro}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-zinc-100 pt-3">
          <Button onClick={calcular} disabled={salvando || linhas.length === 0}>
            {salvando ? "Criando projeção…" : "Próximo: calcular necessidade →"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
