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
  enviarParaSolicitacaoAction,
} from "../actions";
import { DeleteContagemButton } from "./delete-contagem-button";

export type LinhaC = {
  id: string;
  ordem: number;
  secao: string | null;
  texto: string;
  quantidade: number | null;
  observacao: string | null;
  solicitacao_qtd: number | null;
  enviado_em: string | null;
  enviado_solicitacao_id: string | null;
};

export type TemplateOpt = { id: string; nome: string; descricao: string | null };

export function ContagemTable({
  contagemId,
  finalizada,
  initialLinhas,
  templates,
  canRequestPurchase,
}: {
  contagemId: string;
  finalizada: boolean;
  initialLinhas: LinhaC[];
  templates: TemplateOpt[];
  canRequestPurchase: boolean;
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
    // Confirma se já tem linhas (evita re-importar a mesma pasta sem querer)
    if (linhas.length > 0) {
      if (!confirm(`Já tem ${linhas.length} itens nessa contagem. Importar a pasta vai ADICIONAR todos os itens da pasta ao final. Continuar?`)) {
        return;
      }
    }
    startTransition(async () => {
      const res = await importarTemplateAction(contagemId, selectedTpl);
      if (res.error) {
        setError(res.error);
      } else {
        setShowImport(false);
        // Recarrega tudo pra refletir os itens importados
        window.location.reload();
      }
    });
  };

  const updateQtdLocal = (id: string, q: number | null) => {
    setLinhas((p) => p.map((l) => (l.id === id ? { ...l, quantidade: q } : l)));
  };
  const updateObsLocal = (id: string, o: string | null) => {
    setLinhas((p) => p.map((l) => (l.id === id ? { ...l, observacao: o } : l)));
  };
  const updateSolicLocal = (id: string, q: number | null) => {
    setLinhas((p) => p.map((l) => (l.id === id ? { ...l, solicitacao_qtd: q } : l)));
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
  const persistSolic = (id: string, str: string) => {
    startTransition(async () => {
      const res = await updateLinhaContagemAction(id, { solicitacao_qtd: str });
      if (res.error) setError(res.error);
    });
  };

  const handleEnviar = () => {
    const pendentes = linhas.filter((l) => (l.solicitacao_qtd ?? 0) > 0 && !l.enviado_em);
    if (pendentes.length === 0) {
      setError("Nenhuma linha com 'Solicitação' preenchida pendente de envio.");
      return;
    }
    if (!confirm(`Criar uma nova solicitação de compra com ${pendentes.length} ${pendentes.length === 1 ? "item" : "itens"}?`)) return;
    setError(null);
    startTransition(async () => {
      const res = await enviarParaSolicitacaoAction(contagemId);
      if (res.error) {
        setError(res.error);
        return;
      }
      const verbo = res.solic_criada ? "Solicitação criada" : "Solicitação atualizada";
      alert(
        `${verbo} com ${res.enviadas} ${res.enviadas === 1 ? "item" : "itens"}.`
      );
      if (res.solicitacao_id) {
        router.push(`/solicitacoes/${res.solicitacao_id}`);
      } else {
        router.refresh();
      }
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

      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
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
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-zinc-600">{totalPreenchidas} de {linhas.length} preenchidas</span>
          {canRequestPurchase && linhas.some((l) => (l.solicitacao_qtd ?? 0) > 0 && !l.enviado_em) && (
            <Button onClick={handleEnviar} disabled={isPending}>
              Enviar para solicitações
            </Button>
          )}
          {finalizada && (
            <Button variant="outline" onClick={() => window.print()}>Imprimir</Button>
          )}
          {!finalizada && linhas.length > 0 && (
            <Button variant="outline" onClick={handleFinalizar} disabled={isPending}>Finalizar contagem</Button>
          )}
          <DeleteContagemButton contagemId={contagemId} />
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
                <th className="w-28 px-2 py-1">Quantidade</th>
                {canRequestPurchase && <th className="w-28 px-2 py-1">Solicitação</th>}
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
                  canRequestPurchase={canRequestPurchase}
                  onUpdateQtdLocal={(q) => updateQtdLocal(l.id, q)}
                  onUpdateObsLocal={(o) => updateObsLocal(l.id, o)}
                  onUpdateSolicLocal={(q) => updateSolicLocal(l.id, q)}
                  onPersistQtd={(s) => persistQtd(l.id, s)}
                  onPersistObs={(s) => persistObs(l.id, s)}
                  onPersistSolic={(s) => persistSolic(l.id, s)}
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

// Move foco para o input seguinte da mesma coluna (mesma `data-col`) com ordem maior
function focusNextCell(currentEl: HTMLInputElement) {
  const col = currentEl.dataset.col;
  const ord = Number(currentEl.dataset.ord ?? 0);
  if (!col) return;
  const all = Array.from(
    document.querySelectorAll<HTMLInputElement>(`input[data-col="${col}"]`)
  ).sort((a, b) => Number(a.dataset.ord ?? 0) - Number(b.dataset.ord ?? 0));
  const next = all.find((el) => Number(el.dataset.ord ?? 0) > ord);
  if (next) {
    next.focus();
    next.select();
  }
}

function handleEnterKey(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key === "Enter") {
    e.preventDefault();
    const el = e.target as HTMLInputElement;
    el.blur(); // dispara onBlur pra salvar
    setTimeout(() => focusNextCell(el), 0);
  }
}

function LinhaRow({
  linha,
  finalizada,
  canRequestPurchase,
  onUpdateQtdLocal,
  onUpdateObsLocal,
  onUpdateSolicLocal,
  onPersistQtd,
  onPersistObs,
  onPersistSolic,
  onRemove,
}: {
  linha: LinhaC;
  finalizada: boolean;
  canRequestPurchase: boolean;
  onUpdateQtdLocal: (q: number | null) => void;
  onUpdateObsLocal: (o: string | null) => void;
  onUpdateSolicLocal: (q: number | null) => void;
  onPersistQtd: (s: string) => void;
  onPersistObs: (s: string) => void;
  onPersistSolic: (s: string) => void;
  onRemove: () => void;
}) {
  const [qtdStr, setQtdStr] = useState(formatNumberBR(linha.quantidade));
  const [obs, setObs] = useState(linha.observacao ?? "");
  const [solicStr, setSolicStr] = useState(formatNumberBR(linha.solicitacao_qtd));
  const jaEnviado = !!linha.enviado_em;

  return (
    <tr className={`border-b border-zinc-100 last:border-0 ${jaEnviado ? "bg-emerald-50/40" : ""}`}>
      <td className="px-2 py-1.5 text-right text-xs text-zinc-400 tabular-nums">{linha.ordem}</td>
      <td className="px-2 py-1.5">{linha.texto}</td>
      <td className="px-2 py-1.5">
        {finalizada ? (
          <span className="tabular-nums">{qtdStr || "—"}</span>
        ) : (
          <Input
            data-col="qtd"
            data-ord={linha.ordem}
            value={qtdStr}
            onChange={(e) => setQtdStr(e.target.value)}
            onBlur={() => {
              const normalized = qtdStr.trim().replace(/\./g, "").replace(",", ".");
              const n = normalized ? Number(normalized) : null;
              const final = n !== null && Number.isFinite(n) ? n : null;
              onUpdateQtdLocal(final);
              onPersistQtd(qtdStr);
            }}
            onKeyDown={handleEnterKey}
            inputMode="decimal"
            placeholder="0"
            className="h-8 max-w-[90px] text-right tabular-nums"
          />
        )}
      </td>
      {canRequestPurchase && (
        <td className="px-2 py-1.5">
          {jaEnviado ? (
            <span className="text-xs text-emerald-700">✓ enviado ({solicStr})</span>
          ) : (
            <Input
              data-col="solic"
              data-ord={linha.ordem}
              value={solicStr}
              onChange={(e) => setSolicStr(e.target.value)}
              onBlur={() => {
                const normalized = solicStr.trim().replace(/\./g, "").replace(",", ".");
                const n = normalized ? Number(normalized) : null;
                const final = n !== null && Number.isFinite(n) ? n : null;
                onUpdateSolicLocal(final);
                onPersistSolic(solicStr);
              }}
              onKeyDown={handleEnterKey}
              inputMode="decimal"
              placeholder="0"
              className="h-8 max-w-[90px] text-right tabular-nums"
            />
          )}
        </td>
      )}
      <td className="px-2 py-1.5">
        {finalizada ? (
          <span className="text-zinc-600">{obs || "—"}</span>
        ) : (
          <Input
            data-col="obs"
            data-ord={linha.ordem}
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            onBlur={() => {
              const t = obs.trim();
              onUpdateObsLocal(t || null);
              onPersistObs(t);
            }}
            onKeyDown={handleEnterKey}
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
