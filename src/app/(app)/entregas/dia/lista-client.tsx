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
  const [modalAberto, setModalAberto] = useState(false);
  const [senha, setSenha] = useState("");

  const fechar = () => {
    setModalAberto(false);
    setSenha("");
    setError(null);
  };

  const confirmar = () => {
    if (!senha) {
      setError("Digite a senha.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await excluirEntregaAction(entregaId, senha);
      if (res.error) {
        setError(res.error);
        return;
      }
      fechar();
      // página será revalidada automaticamente pela server action
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setModalAberto(true)}
        disabled={isPending}
        className="text-xs text-red-700 hover:underline disabled:opacity-50"
        title="Excluir entrega"
      >
        🗑 Excluir
      </button>

      {modalAberto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isPending) fechar();
          }}
        >
          <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-xl">
            <h3 className="text-base font-semibold">Excluir entrega?</h3>
            <p className="mt-1 text-sm text-zinc-600">
              Pedido <span className="font-mono">{codigo}</span> será apagado permanentemente.
              Digite sua senha pra confirmar.
            </p>
            <input
              type="password"
              autoFocus
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="Sua senha"
              className="mt-3 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmar();
                if (e.key === "Escape" && !isPending) fechar();
              }}
              disabled={isPending}
            />
            {error && (
              <p className="mt-2 text-sm text-red-600">{error}</p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={fechar}
                disabled={isPending}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmar}
                disabled={isPending || !senha}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isPending ? "Excluindo…" : "Excluir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
