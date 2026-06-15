"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { criarProdutoAction } from "../actions";

const CATEGORIAS = [
  "EMPANADA TRADICIONAL",
  "EMPANADA ESPECIAL",
  "EMPANADA DOCE",
  "EMPANADA INTEGRAL",
  "EMPANADA",
  "OUTRO",
];

const UNIDADES = ["UN", "KG", "L", "PCT", "FARDO"];

export function NovoProdutoForm() {
  const [state, formAction, isPending] = useActionState(criarProdutoAction, null);

  return (
    <Card>
      <CardContent className="p-4">
        <form action={formAction} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nome">Nome *</Label>
              <Input id="nome" name="nome" required placeholder="Ex: Empanada de Carne" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="codigo_queops">Código Queóps (opcional)</Label>
              <Input id="codigo_queops" name="codigo_queops" placeholder="Ex: 021999" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="categoria">Categoria</Label>
              <Select id="categoria" name="categoria" defaultValue="EMPANADA TRADICIONAL">
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="unidade_producao">Unidade de produção</Label>
              <Select id="unidade_producao" name="unidade_producao" defaultValue="UN">
                {UNIDADES.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {state?.error && <p className="text-sm text-red-600">⚠ {state.error}</p>}
          <div className="flex justify-end gap-2 border-t border-zinc-100 pt-3">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Criando…" : "Criar e ir pra ficha"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
