"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { criarGrupoAction, type ActionResult } from "./actions";

export function NovoGrupoForm() {
  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(criarGrupoAction, null);

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-3 rounded-md border border-zinc-200 bg-white p-3"
    >
      <div className="flex flex-1 min-w-[220px] flex-col gap-1.5">
        <Label htmlFor="nome">Nome do grupo</Label>
        <Input id="nome" name="nome" placeholder="Ex: Contagem Sexta-Feira" required />
      </div>
      <div className="flex flex-1 min-w-[260px] flex-col gap-1.5">
        <Label htmlFor="descricao">Descrição (opcional)</Label>
        <Input id="descricao" name="descricao" placeholder="Descrição interna" />
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Criando..." : "Criar grupo"}
      </Button>
      {state?.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
