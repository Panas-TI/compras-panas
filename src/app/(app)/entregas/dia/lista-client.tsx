"use client";

import { useState, useTransition } from "react";
import { Select } from "@/components/ui/select";
import { atribuirMotoristaAction, excluirEntregaAction } from "./actions";

type Motorista = { id: string; nome: string };

export function AtribuirMotorista({
  entregaId,
  motoristaId,
  motoristas,
}: {
  entregaId: string;
  motoristaId: string | null;
  motoristas: Motorista[];
}) {
  const [valor, setValor] = useState<string>(motoristaId ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onChange = (novo: string) => {
    setValor(novo);
    setError(null);
    startTransition(async () => {
      const res = await atribuirMotoristaAction(entregaId, novo || null);
      if (res.error) {
        setError(res.error);
        setValor(motoristaId ?? "");
      }
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <Select
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        disabled={isPending}
        className="h-8 max-w-[200px] text-xs"
      >
        <option value="">— Sem motorista —</option>
        {motoristas.map((m) => (
          <option key={m.id} value={m.id}>
            {m.nome}
          </option>
        ))}
      </Select>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

export function ExcluirEntrega({ entregaId, codigo }: { entregaId: string; codigo: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    if (!window.confirm(`Excluir a entrega ${codigo}?\nEssa ação não pode ser desfeita.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await excluirEntregaAction(entregaId);
      if (res.error) setError(res.error);
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="text-xs text-red-700 hover:underline disabled:opacity-50"
        title="Excluir entrega"
      >
        {isPending ? "Excluindo..." : "🗑 Excluir"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
