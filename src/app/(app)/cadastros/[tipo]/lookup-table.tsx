"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createLookupAction,
  renameLookupAction,
  toggleLookupAtivoAction,
  type LookupFormState,
} from "./actions";
import type { LookupTipo } from "./config";

type Row = { id: string; nome: string; ativo: boolean };

export function LookupTable({ tipo, rows, singular }: { tipo: LookupTipo; rows: Row[]; singular: string }) {
  const boundCreate = async (prev: LookupFormState, fd: FormData) => createLookupAction(tipo, prev, fd);
  const [state, formAction, isPending] = useActionState<LookupFormState, FormData>(boundCreate, null);

  return (
    <div className="flex flex-col gap-4">
      <form
        action={formAction}
        className="flex flex-wrap items-end gap-2 rounded-md border border-zinc-200 bg-white p-3"
      >
        <div className="flex flex-1 min-w-[200px] flex-col gap-1.5">
          <label htmlFor="nome" className="text-sm font-medium">
            Novo {singular.toLowerCase()}
          </label>
          <Input id="nome" name="nome" placeholder="Nome" required />
        </div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Adicionando..." : "Adicionar"}
        </Button>
        {state?.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
      </form>

      <div className="overflow-x-auto rounded-md border border-zinc-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Nome</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <LookupRow key={r.id} tipo={tipo} row={r} />
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-zinc-500">
                  Sem registros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LookupRow({ tipo, row }: { tipo: LookupTipo; row: Row }) {
  const [editing, setEditing] = useState(false);
  const [nome, setNome] = useState(row.nome);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await renameLookupAction(tipo, row.id, nome);
      if (result.error) setError(result.error);
      else setEditing(false);
    });
  };

  const toggle = () => {
    startTransition(async () => {
      await toggleLookupAtivoAction(tipo, row.id, !row.ativo);
    });
  };

  return (
    <tr className="border-b border-zinc-100 last:border-0">
      <td className="px-3 py-2">
        {editing ? (
          <div className="flex items-center gap-2">
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="h-8"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") {
                  setNome(row.nome);
                  setEditing(false);
                  setError(null);
                }
              }}
            />
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
        ) : (
          row.nome
        )}
      </td>
      <td className="px-3 py-2">
        {row.ativo ? (
          <span className="text-xs text-emerald-700">ativo</span>
        ) : (
          <span className="text-xs text-zinc-500">inativo</span>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        {editing ? (
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="outline" onClick={save} disabled={isPending}>
              Salvar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setNome(row.nome);
                setEditing(false);
                setError(null);
              }}
            >
              Cancelar
            </Button>
          </div>
        ) : (
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              Renomear
            </Button>
            <Button size="sm" variant="ghost" onClick={toggle} disabled={isPending}>
              {row.ativo ? "Inativar" : "Ativar"}
            </Button>
          </div>
        )}
      </td>
    </tr>
  );
}
