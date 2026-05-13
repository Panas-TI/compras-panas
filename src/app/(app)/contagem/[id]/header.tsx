"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { formatDateBR } from "@/lib/utils";
import { renomearContagemAction, alterarDataContagemAction } from "../actions";

export function ContagemHeader({
  contagemId,
  nome,
  data,
  criadorNome,
  finalizada,
}: {
  contagemId: string;
  nome: string | null;
  data: string;
  criadorNome: string | null;
  finalizada: boolean;
}) {
  const [editingNome, setEditingNome] = useState(false);
  const [nomeDraft, setNomeDraft] = useState(nome ?? "");
  const [dataDraft, setDataDraft] = useState(data);
  const [isPending, startTransition] = useTransition();

  const saveNome = () => {
    startTransition(async () => {
      await renomearContagemAction(contagemId, nomeDraft);
      setEditingNome(false);
    });
  };

  const saveData = (v: string) => {
    setDataDraft(v);
    startTransition(async () => {
      await alterarDataContagemAction(contagemId, v);
    });
  };

  const displayNome = nome || `Contagem ${formatDateBR(data)}`;

  return (
    <div>
      {finalizada ? (
        <h1 className="text-2xl font-semibold">{displayNome}</h1>
      ) : editingNome ? (
        <div className="flex items-center gap-2">
          <Input
            value={nomeDraft}
            onChange={(e) => setNomeDraft(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") saveNome();
              if (e.key === "Escape") {
                setNomeDraft(nome ?? "");
                setEditingNome(false);
              }
            }}
            onBlur={saveNome}
            className="h-9 max-w-md text-xl font-semibold"
            placeholder="Nome (ex: Contagem 15/05)"
          />
        </div>
      ) : (
        <h1
          className="cursor-pointer text-2xl font-semibold hover:underline decoration-dotted"
          onClick={() => setEditingNome(true)}
          title="Clique pra renomear"
        >
          {displayNome}
        </h1>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-zinc-600">
        <span>Criado por: {criadorNome ?? "—"}</span>
        <span>·</span>
        <label className="flex items-center gap-1">
          Data:
          {finalizada ? (
            <span className="font-medium">{formatDateBR(dataDraft)}</span>
          ) : (
            <input
              type="date"
              value={dataDraft}
              onChange={(e) => saveData(e.target.value)}
              className="h-7 rounded border border-zinc-300 bg-white px-2 text-sm"
              disabled={isPending}
            />
          )}
        </label>
        {finalizada && (
          <>
            <span>·</span>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs">Finalizada</span>
          </>
        )}
      </div>
    </div>
  );
}
