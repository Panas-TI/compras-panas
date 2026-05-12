"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createSolicitacaoAction, type CreateSolicState } from "../actions";

export default function NovaSolicitacaoPage() {
  const [state, formAction, isPending] = useActionState<CreateSolicState, FormData>(
    createSolicitacaoAction,
    null
  );

  // Default: próxima segunda a sexta
  const today = new Date();
  const dow = today.getDay();
  const daysUntilMonday = ((1 - dow + 7) % 7) || 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() + daysUntilMonday);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Nova solicitação semanal</h1>
        <Link href="/solicitacoes" className="text-sm text-zinc-600 hover:underline">
          ← Voltar
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Período</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="data_inicio">Data de início</Label>
                <Input id="data_inicio" name="data_inicio" type="date" defaultValue={fmt(monday)} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="data_fim">Data de fim</Label>
                <Input id="data_fim" name="data_fim" type="date" defaultValue={fmt(friday)} required />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="observacoes">Observações (opcional)</Label>
              <Input id="observacoes" name="observacoes" maxLength={500} />
            </div>

            {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

            <div className="flex gap-2">
              <Button type="submit" disabled={isPending}>
                {isPending ? "Criando..." : "Criar solicitação"}
              </Button>
              <Link href="/solicitacoes">
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
