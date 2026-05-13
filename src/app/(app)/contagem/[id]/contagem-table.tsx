"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  importarTemplateAction,
  updateLinhaContagemAction,
  removerLinhaContagemAction,
  finalizarContagemAction,
  excluirContagemAction,
} from "../actions";

export type LinhaC = {
  id: string;
  ordem: number;
  secao: string | null;
  texto: string;
  quantidade: number | null;
  observacao: string | null;
};

export type TemplateOpt = { id: string; nome: string; descricao: string | null };

export function ContagemTable({
  contagemId,
  finalizada,
  initialLinhas,
  templates,
}: {
  contagemId: string;
  finalizada: boolean;
  initialLinhas: LinhaC[];
  templates: TemplateOpt[];
}) {
  const router = useRouter();
  const [linhas, setLinhas] = useState(initialLinhas);
  const [showImport, setShowImport] = useState(false);
  const [selectedTpl, setSelectedTpl] = useState(templates[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleImport = () => {
    if (!selectedTpl) return;
    setError(null);
    startTransition(async () => {
      const res = await importarTemplateAction(contagemId, selectedTpl);
      if (res.error) setError(res.error);
      else {
        setShowImport(false);
        router.refresh();
      }
    });
  };

  const updateQtdLocal = (id: string, q: number | null) => {
    setLinhas((p) => p.map((l) => (l.id === id ? { ...l, quantidade: q } : l)));
  };
  const updateObsLocal = (id: string, o: string | null) => {
    setLinhas((p) => p.map((l) => (l.id === id ? { ...l, observacao: o } : l)));
  };

  const persistQtd = (id: string, str: string) => {
    startTransition(async () => {
      const res = await updateLinhaContagemAction(id, { quantidade: str });
      if (res.error) setError(res.error);
    });
  };
  const persistObs = (id: string, str: string) => {
    startTransition(async () => {
      const res = await updateLinhaContagemAction(id, { observacao: str });
      if (res.error) setError(res.error);
    });
  };

  const handleRemove = (id: string) => {
    if (!confirm("Remover esta linha desta contagem?")) return;
    startTransition(async () => {
      const res = await removerLinhaContagemAction(id);
      if (res.error) setError(res.error);
      else setLinhas((p) => p.filter((l) => l.id !== id));
    });
  };

  const handleFinalizar = () => {
    if (!confirm("Finalizar a contagem? Depois disso ela fica somente como histórico.")) return;
    startTransition(async () => {
      const res = await finalizarContagemAction(contagemId);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  };

  const handleExcluir = () => {
    if (!confirm("Excluir esta contagem e todas as linhas? Não dá pra desfazer.")) return;
    startTransition(async () => {
      const res = await excluirContagemAction(contagemId);
      if (res?.error) setError(res.error);
    });
  };

  // Agrupa por seção pra exibir como subgrupos
  const grupos: Array<{ secao: string | null; itens: LinhaC[] }> = [];
  for (const l of linhas) {
    const last = grupos[grupos.length - 1];
    if (!last || last.secao !== l.secao) {
      grupos.push({ secao: l.secao, itens: [l] });
    } else {
      last.itens.push(l);
    }
  }

  const totalPreenchidas = linhas.filter((l) => l.quantidade != null).length;

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {!finalizada && (
            <>
              {!showImport ? (
                <Button variant="outline" onClick={() => setShowImport(true)}>Importar itens</Button>
              ) : (
                <div className="flex items-center gap-2 rounded-md border border-zinc-200 bg-white p-2">
                  <Select value={selectedTpl} onChange={(e) => setSelectedTpl(e.target.value)} className="min-w-[220px]">
                    {templates.length === 0 && <option value="">— sem pastas —</option>}
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>{t.nome}</option>
                    ))}
                  </Select>
                  <Button onClick={handleImport} disabled={isPending || !selectedTpl}>
                    {isPending ? "Importando..." : "Importar"}
                  </Button>
                  <Button variant="ghost" onClick={() => setShowImport(false)}>Cancelar</Button>
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-zinc-600">{totalPreenchidas} de {linhas.length} preenchidas</span>
          {!finalizada && linhas.length > 0 && (
            <Button onClick={handleFinalizar} disabled={isPending}>Finalizar contagem</Button>
          )}
          {!finalizada && (
            <button onClick={handleExcluir} className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50">
              Excluir
            </button>
          )}
        </div>
      </div>

      {linhas.length === 0 && (
        <div className="rounded-md border border-dashed border-zinc-300 bg-white px-3 py-10 text-center text-sm text-zinc-500">
          Nenhum item ainda. Clique em "Importar itens" pra carregar uma pasta.
        </div>
      )}

      {grupos.map((g, gi) => (
        <div key={gi} className="overflow-hidden rounded-md border border-zinc-200 bg-white">
          {g.secao && (
            <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-800">
              {g.secao}
            </div>
          )}
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-100 text-left text-xs text-zinc-500">
              <tr>
                <th className="w-12 px-2 py-1 text-right">#</th>
                <th className="px-2 py-1">Item</th>
                <th className="w-32 px-2 py-1">Quantidade</th>
                <th className="px-2 py-1">Observação</th>
                {!finalizada && <th className="w-20 px-2 py-1"></th>}
              </tr>
            </thead>
            <tbody>
              {g.itens.map((l) => (
                <LinhaRow
                  key={l.id}
                  linha={l}
                  finalizada={finalizada}
                  onUpdateQtdLocal={(q) => updateQtdLocal(l.id, q)}
                  onUpdateObsLocal={(o) => updateObsLocal(l.id, o)}
                  onPersistQtd={(s) => persistQtd(l.id, s)}
                  onPersistObs={(s) => persistObs(l.id, s)}
                  onRemove={() => handleRemove(l.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function formatNumberBR(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

function LinhaRow({
  linha,
  finalizada,
  onUpdateQtdLocal,
  onUpdateObsLocal,
  onPersistQtd,
  onPersistObs,
  onRemove,
}: {
  linha: LinhaC;
  finalizada: boolean;
  onUpdateQtdLocal: (q: number | null) => void;
  onUpdateObsLocal: (o: string | null) => void;
  onPersistQtd: (s: string) => void;
  onPersistObs: (s: string) => void;
  onRemove: () => void;
}) {
  const [qtdStr, setQtdStr] = useState(formatNumberBR(linha.quantidade));
  const [obs, setObs] = useState(linha.observacao ?? "");

  return (
    <tr className="border-b border-zinc-100 last:border-0">
      <td className="px-2 py-1.5 text-right text-xs text-zinc-400 tabular-nums">{linha.ordem}</td>
      <td className="px-2 py-1.5">{linha.texto}</td>
      <td className="px-2 py-1.5">
        {finalizada ? (
          <span className="tabular-nums">{qtdStr || "—"}</span>
        ) : (
          <Input
            value={qtdStr}
            onChange={(e) => setQtdStr(e.target.value)}
            onBlur={() => {
              const normalized = qtdStr.trim().replace(/\./g, "").replace(",", ".");
              const n = normalized ? Number(normalized) : null;
              const final = n !== null && Number.isFinite(n) ? n : null;
              onUpdateQtdLocal(final);
              onPersistQtd(qtdStr);
            }}
            inputMode="decimal"
            placeholder="0"
            className="h-8 max-w-[100px] text-right tabular-nums"
          />
        )}
      </td>
      <td className="px-2 py-1.5">
        {finalizada ? (
          <span className="text-zinc-600">{obs || "—"}</span>
        ) : (
          <Input
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            onBlur={() => {
              const t = obs.trim();
              onUpdateObsLocal(t || null);
              onPersistObs(t);
            }}
            className="h-8"
          />
        )}
      </td>
      {!finalizada && (
        <td className="px-2 py-1.5 text-right">
          <button onClick={onRemove} className="text-xs text-red-600 hover:underline">Remover</button>
        </td>
      )}
    </tr>
  );
}
