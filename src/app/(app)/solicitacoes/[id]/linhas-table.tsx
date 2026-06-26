"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addLinhaAction,
  updateLinhaAction,
  removeLinhaAction,
  enviarParaAprovacaoAction,
  aprovarLinhaAction,
  recusarLinhaAction,
  aprovarComAlteracaoAction,
  confirmarAlteracaoAction,
  reabrirLinhaAction,
  bulkAprovarAction,
} from "../actions";
import { ItemPicker, type PickableItem } from "./item-picker";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { formatCurrencyBRL, cn } from "@/lib/utils";

export type Lookup = { id: string; nome: string };

export type Linha = {
  id: string;
  item_id: string;
  nome_item: string;
  codigo_queops: string | null;
  classificacao_nome: string | null;
  unidade_nome: string | null;
  volume_estoque: number | null;
  volume_solicitado: number | null;
  preco: number | null;
  valor: number | null;
  fornecedor_id: string | null;
  forma_pagto_id: string | null;
  prazo: string | null;
  status: string;
  alteracao_confirmada: boolean;
};

function formatNumberBR(n: number | null | undefined, fraction = 2): string {
  if (n === null || n === undefined) return "";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: fraction, maximumFractionDigits: 4 });
}

const STATUS_STYLES: Record<string, string> = {
  "Para Aprovar": "bg-amber-50 text-amber-800 border-amber-200",
  Aprovada: "bg-emerald-50 text-emerald-800 border-emerald-200",
  "Aprovada & Recebida": "bg-emerald-100 text-emerald-900 border-emerald-300",
  Recusada: "bg-red-50 text-red-800 border-red-200",
  "Volumes ou Preço Alterados": "bg-blue-50 text-blue-800 border-blue-200",
};

export function LinhasTable({
  solicitacaoId,
  initialLinhas,
  items,
  fornecedores,
  formasPagto,
  isDraft,
  isAprovador,
  lancada,
}: {
  solicitacaoId: string;
  initialLinhas: Linha[];
  items: PickableItem[];
  fornecedores: Lookup[];
  formasPagto: Lookup[];
  isDraft: boolean;
  isAprovador: boolean;
  // true depois que o comprador clica "Lançar" (enviada_em preenchido).
  // Aprovação só acontece DEPOIS disso — num rascunho ninguém aprova.
  lancada: boolean;
}) {
  const router = useRouter();
  const [linhas, setLinhas] = useState(initialLinhas);
  const [addingItem, setAddingItem] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const usedItemIds = new Set(linhas.map((l) => l.item_id));

  const handleAdd = (item: PickableItem) => {
    setErrorMsg(null);
    setAddingItem(true);
    startTransition(async () => {
      const res = await addLinhaAction(solicitacaoId, item.id);
      if (res.error) {
        setErrorMsg(res.error);
        setAddingItem(false);
        return;
      }
      // Recarrega da source-of-truth (server fetched defaults)
      window.location.reload();
    });
  };

  const updateLinhaLocal = (id: string, patch: Partial<Linha>) => {
    setLinhas((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const persistField = (linha: Linha, field: keyof Linha, value: unknown) => {
    setErrorMsg(null);
    startTransition(async () => {
      const res = await updateLinhaAction(linha.id, { [field]: value });
      if (res.error) {
        setErrorMsg(`Erro salvando ${String(field)}: ${res.error}`);
      } else {
        // valor é recalculado pelo banco, atualizar local
        if (field === "volume_solicitado" || field === "preco") {
          const vol = field === "volume_solicitado" ? Number(value) : linha.volume_solicitado ?? 0;
          const preco = field === "preco" ? Number(value) : linha.preco ?? 0;
          updateLinhaLocal(linha.id, { valor: (Number(vol) || 0) * (Number(preco) || 0) });
        }
      }
    });
  };

  const handleRemove = (linhaId: string) => {
    setErrorMsg(null);
    if (!confirm("Remover esta linha?")) return;
    startTransition(async () => {
      const res = await removeLinhaAction(linhaId);
      if (res.error) setErrorMsg(res.error);
      else setLinhas((p) => p.filter((l) => l.id !== linhaId));
    });
  };

  const handleLancar = () => {
    setErrorMsg(null);
    const msg =
      "Tem certeza que deseja LANÇAR essa solicitação?\n\n" +
      "Depois de lançada, você (comprador) não poderá mais editar nada. " +
      "Só o aprovador conseguirá fazer alterações.";
    if (!confirm(msg)) return;
    startTransition(async () => {
      const res = await enviarParaAprovacaoAction(solicitacaoId);
      if (res.error) setErrorMsg(res.error);
      else window.location.reload();
    });
  };

  const handleSalvar = () => {
    // As edições já foram salvas inline (auto-save no blur). "Salvar" só sai da tela.
    router.push("/solicitacoes");
  };

  const handleStatusChange = (
    linhaId: string,
    action: "aprovar" | "recusar" | "alterar" | "confirmar" | "reabrir"
  ) => {
    setErrorMsg(null);
    if (action === "reabrir" && !confirm("Reabrir esta linha? Ela volta para 'Para Aprovar' pra você decidir de novo.")) {
      return;
    }
    startTransition(async () => {
      const fn =
        action === "aprovar" ? aprovarLinhaAction :
        action === "recusar" ? recusarLinhaAction :
        action === "alterar" ? aprovarComAlteracaoAction :
        action === "confirmar" ? confirmarAlteracaoAction :
        reabrirLinhaAction;
      const res = await fn(linhaId);
      if (res.error) setErrorMsg(res.error);
      else {
        if (action === "aprovar") updateLinhaLocal(linhaId, { status: "Aprovada" });
        else if (action === "recusar") updateLinhaLocal(linhaId, { status: "Recusada" });
        else if (action === "alterar") updateLinhaLocal(linhaId, { status: "Volumes ou Preço Alterados", alteracao_confirmada: false });
        else if (action === "confirmar") updateLinhaLocal(linhaId, { alteracao_confirmada: true });
        else if (action === "reabrir") updateLinhaLocal(linhaId, { status: "Para Aprovar", alteracao_confirmada: false });
      }
    });
  };

  const total = linhas.reduce((s, l) => s + (Number(l.valor) || 0), 0);

  return (
    <div className="flex flex-col gap-3">
      {errorMsg && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 print:hidden">
          {errorMsg}
        </div>
      )}

      {isAprovador && !lancada && !isDraft && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 print:hidden">
          ⏳ Esta solicitação ainda é um rascunho do comprador. As opções de aprovar
          aparecem depois que o comprador clicar em <strong>&quot;Lançar&quot;</strong>.
        </div>
      )}

      {(isDraft || isAprovador) && (
        <div className="flex items-center gap-3 rounded-md border border-zinc-200 bg-white p-3 print:hidden">
          <div className="flex-1">
            <ItemPicker
              items={items}
              disabledIds={usedItemIds}
              onPick={handleAdd}
              placeholder="Adicionar item — digite o nome ou código Queóps..."
            />
          </div>
          {addingItem && <span className="text-xs text-zinc-500">Adicionando...</span>}
        </div>
      )}

      <div className="overflow-x-auto rounded-md border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left">
            <tr>
              <th className="px-2 py-2 font-medium">Item</th>
              <th className="px-1 py-2 text-right font-medium">Estoque</th>
              <th className="px-1 py-2 text-right font-medium">Solic.</th>
              <th className="px-1 py-2 font-medium">Un.</th>
              <th className="px-1 py-2 text-right font-medium">Preço</th>
              <th className="px-1 py-2 text-right font-medium">Valor</th>
              <th className="px-1 py-2 font-medium">Fornecedor</th>
              <th className="px-1 py-2 font-medium">Pagto</th>
              <th className="px-1 py-2 font-medium">Prazo</th>
              <th className="px-1 py-2 font-medium">Status</th>
              <th className="px-1 py-2 print:hidden"></th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <LinhaTr
                key={l.id}
                linha={l}
                fornecedores={fornecedores}
                formasPagto={formasPagto}
                isDraft={isDraft}
                isAprovador={isAprovador}
                lancada={lancada}
                onUpdateLocal={(patch) => updateLinhaLocal(l.id, patch)}
                onPersist={(field, value) => persistField(l, field, value)}
                onRemove={() => handleRemove(l.id)}
                onStatusChange={(action) => handleStatusChange(l.id, action)}
              />
            ))}
            {!linhas.length && (
              <tr>
                <td colSpan={11} className="px-3 py-10 text-center text-zinc-500">
                  {isDraft ? "Nenhuma linha. Use o campo acima pra adicionar itens." : "Sem linhas."}
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="border-t border-zinc-200 bg-zinc-50">
            <tr>
              <td colSpan={5} className="px-3 py-2 text-right text-sm font-medium">
                Total ({linhas.length} {linhas.length === 1 ? "linha" : "linhas"})
              </td>
              <td className="px-1 py-2 text-right text-sm font-semibold tabular-nums">
                {formatCurrencyBRL(total)}
              </td>
              <td colSpan={5}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {isDraft && (
        <div className="flex flex-wrap justify-end gap-2 print:hidden">
          <Button variant="outline" onClick={handleSalvar} disabled={isPending}>
            Salvar
          </Button>
          {linhas.length > 0 && (
            <Button onClick={handleLancar} disabled={isPending}>
              Lançar
            </Button>
          )}
          <p className="w-full text-right text-xs text-zinc-500">
            "Salvar" sai da tela — você pode voltar e editar.
            "Lançar" envia pra aprovação e congela a edição.
          </p>
        </div>
      )}

      {lancada && isAprovador && linhas.some((l) => l.status === "Para Aprovar") && (
        <div className="flex justify-end print:hidden">
          <Button
            disabled={isPending}
            onClick={() => {
              if (!confirm("Aprovar todas as linhas elegíveis? (linhas sem código Queóps serão puladas)")) return;
              startTransition(async () => {
                const res = await bulkAprovarAction(solicitacaoId);
                if (res.error) setErrorMsg(res.error);
                else {
                  setErrorMsg(null);
                  alert(`Aprovadas: ${res.aprovadas}\nPuladas (sem código): ${res.pulados}\nErros: ${res.erros}`);
                  window.location.reload();
                }
              });
            }}
          >
            Aprovar tudo elegível
          </Button>
        </div>
      )}
    </div>
  );
}

// ---- Single Row ----

function LinhaTr({
  linha,
  fornecedores,
  formasPagto,
  isDraft,
  isAprovador,
  lancada,
  onUpdateLocal,
  onPersist,
  onRemove,
  onStatusChange,
}: {
  linha: Linha;
  fornecedores: Lookup[];
  formasPagto: Lookup[];
  isDraft: boolean;
  isAprovador: boolean;
  lancada: boolean;
  onUpdateLocal: (patch: Partial<Linha>) => void;
  onPersist: (field: keyof Linha, value: unknown) => void;
  onRemove: () => void;
  onStatusChange: (action: "aprovar" | "recusar" | "alterar" | "confirmar" | "reabrir") => void;
}) {
  // Edição permitida:
  // - em rascunho (comprador): tudo
  // - aprovador, status "Volumes ou Preço Alterados" E não-confirmado: linha aberta pra edição
  const editable =
    isDraft ||
    (isAprovador &&
      linha.status === "Volumes ou Preço Alterados" &&
      !linha.alteracao_confirmada);
  const status = linha.status;
  const emEdicao =
    lancada &&
    linha.status === "Volumes ou Preço Alterados" &&
    !linha.alteracao_confirmada;
  const statusStyle = STATUS_STYLES[status] ?? "bg-zinc-100 text-zinc-700 border-zinc-200";

  return (
    <tr className="border-b border-zinc-100 last:border-0">
      <td className="px-2 py-1.5">
        <div className="flex flex-col">
          <span className="truncate font-medium" title={linha.nome_item}>{linha.nome_item}</span>
          <span className="flex items-center gap-2 text-xs text-zinc-500">
            {linha.codigo_queops ? (
              <span className="font-mono">{linha.codigo_queops}</span>
            ) : (
              <span className="text-amber-600">sem código</span>
            )}
            {linha.classificacao_nome && <span>· {linha.classificacao_nome}</span>}
          </span>
        </div>
      </td>
      <td className="px-1 py-1.5">
        <NumberCell
          value={linha.volume_estoque}
          editable={editable}
          onCommit={(v) => {
            onUpdateLocal({ volume_estoque: v });
            onPersist("volume_estoque", v);
          }}
        />
      </td>
      <td className="px-1 py-1.5">
        <NumberCell
          value={linha.volume_solicitado}
          editable={editable}
          onCommit={(v) => {
            onUpdateLocal({ volume_solicitado: v });
            onPersist("volume_solicitado", v);
          }}
        />
      </td>
      <td className="px-1 py-1.5 text-zinc-600">{linha.unidade_nome ?? "—"}</td>
      <td className="px-1 py-1.5">
        <NumberCell
          value={linha.preco}
          editable={editable}
          fraction={4}
          onCommit={(v) => {
            onUpdateLocal({ preco: v });
            onPersist("preco", v);
          }}
        />
      </td>
      <td className="px-1 py-1.5 text-right tabular-nums">{formatCurrencyBRL(linha.valor ?? 0)}</td>
      <td className="px-1 py-1.5">
        <LookupCell
          value={linha.fornecedor_id}
          options={fornecedores}
          editable={editable}
          onCommit={(v) => {
            onUpdateLocal({ fornecedor_id: v });
            onPersist("fornecedor_id", v ?? "");
          }}
        />
      </td>
      <td className="px-1 py-1.5">
        <LookupCell
          value={linha.forma_pagto_id}
          options={formasPagto}
          editable={editable}
          onCommit={(v) => {
            onUpdateLocal({ forma_pagto_id: v });
            onPersist("forma_pagto_id", v ?? "");
          }}
        />
      </td>
      <td className="px-1 py-1.5">
        <TextCell
          value={linha.prazo}
          editable={editable}
          onCommit={(v) => {
            onUpdateLocal({ prazo: v });
            onPersist("prazo", v);
          }}
        />
      </td>
      <td className="px-1 py-1.5">
        <span className={cn("inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs", statusStyle)}>
          {status}
        </span>
      </td>
      <td className="px-1 py-1.5 text-right print:hidden">
        {isDraft && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-red-600 hover:underline"
          >
            Remover
          </button>
        )}
        {lancada && isAprovador && status === "Para Aprovar" && (
          <div className="flex flex-wrap justify-end gap-1">
            {linha.codigo_queops ? (
              <>
                <button type="button" onClick={() => onStatusChange("aprovar")} className="text-xs text-emerald-700 hover:underline">
                  Aprovar
                </button>
                <button type="button" onClick={() => onStatusChange("alterar")} className="text-xs text-blue-700 hover:underline">
                  Aprovar c/ alteração
                </button>
                <button type="button" onClick={() => onStatusChange("recusar")} className="text-xs text-red-700 hover:underline">
                  Recusar
                </button>
              </>
            ) : (
              <>
                <a
                  href={`/itens/${linha.item_id}`}
                  target="_blank"
                  rel="noopener"
                  className="text-xs font-medium text-amber-700 hover:underline"
                  title="Item sem código Queóps. Cadastre o código antes de aprovar."
                >
                  ⚠ Cadastrar código
                </a>
                <button type="button" onClick={() => onStatusChange("recusar")} className="text-xs text-red-700 hover:underline">
                  Recusar
                </button>
              </>
            )}
          </div>
        )}
        {emEdicao && isAprovador && (
          <button type="button" onClick={() => onStatusChange("confirmar")} className="text-xs font-medium text-blue-700 hover:underline">
            Confirmar alteração
          </button>
        )}
        {lancada && isAprovador && !emEdicao && status !== "Para Aprovar" && (
          <button type="button" onClick={() => onStatusChange("reabrir")} className="text-xs text-zinc-600 hover:underline">
            Reabrir
          </button>
        )}
      </td>
    </tr>
  );
}

function NumberCell({
  value,
  editable,
  fraction = 2,
  onCommit,
}: {
  value: number | null | undefined;
  editable: boolean;
  fraction?: number;
  onCommit: (v: number | null) => void;
}) {
  const [draft, setDraft] = useState(formatNumberBR(value, fraction));

  if (!editable) {
    return <div className="text-right tabular-nums">{formatNumberBR(value, fraction) || "—"}</div>;
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const n = parseDraftNumber(draft);
        const cur = value ?? null;
        if (n !== cur) onCommit(n);
        setDraft(formatNumberBR(n, fraction));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className="h-7 w-full max-w-[88px] rounded border border-zinc-200 bg-white px-1.5 text-right text-sm tabular-nums focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
    />
  );
}

function parseDraftNumber(s: string): number | null {
  if (!s.trim()) return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function LookupCell({
  value,
  options,
  editable,
  onCommit,
}: {
  value: string | null | undefined;
  options: Lookup[];
  editable: boolean;
  onCommit: (v: string | null) => void;
}) {
  if (!editable) {
    const found = options.find((o) => o.id === value);
    return <div className="text-xs text-zinc-600">{found?.nome ?? "—"}</div>;
  }
  return (
    <Select
      value={value ?? ""}
      onChange={(e) => onCommit(e.target.value || null)}
      className="h-8 w-full min-w-[120px] pr-7 text-xs"
    >
      <option value="">—</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.nome}
        </option>
      ))}
    </Select>
  );
}

function TextCell({
  value,
  editable,
  onCommit,
}: {
  value: string | null | undefined;
  editable: boolean;
  onCommit: (v: string | null) => void;
}) {
  const [draft, setDraft] = useState(value ?? "");
  if (!editable) {
    return <div className="text-xs text-zinc-600">{value || "—"}</div>;
  }
  return (
    <input
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const novo = draft.trim() || null;
        if (novo !== (value ?? null)) onCommit(novo);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className="h-7 w-full max-w-[110px] rounded border border-zinc-200 bg-white px-1.5 text-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
    />
  );
}
