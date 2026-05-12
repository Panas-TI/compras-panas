"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { excluirSolicitacaoAction } from "../actions";

export function DeleteButton({ solicitacaoId }: { solicitacaoId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [senha, setSenha] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await excluirSolicitacaoAction(solicitacaoId, senha);
      if (res.error) setError(res.error);
      else router.push("/solicitacoes");
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
      >
        Excluir
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-5 shadow-xl"
      >
        <h2 className="text-base font-semibold">Excluir solicitação</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Essa ação não pode ser desfeita. Todas as linhas desta solicitação serão removidas.
          Digite sua senha pra confirmar.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <Label htmlFor="senha-delete">Sua senha</Label>
          <Input
            id="senha-delete"
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoFocus
            required
            autoComplete="current-password"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setOpen(false);
              setSenha("");
              setError(null);
            }}
          >
            Cancelar
          </Button>
          <Button type="submit" variant="destructive" disabled={isPending || !senha}>
            {isPending ? "Excluindo..." : "Confirmar exclusão"}
          </Button>
        </div>
      </form>
    </div>
  );
}
