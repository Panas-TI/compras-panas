"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import type { ItemFormState } from "./actions";

export type ItemFormDefaults = {
  nome?: string;
  codigo_queops?: string | null;
  classificacao_id?: string | null;
  unidade_id?: string | null;
  fornecedor_padrao_id?: string | null;
  forma_pagto_padrao_id?: string | null;
  preco_referencia?: number | null;
  prazo_padrao?: string | null;
  embalagem_compra_nome?: string | null;
  qtd_por_embalagem?: number | null;
  ativo?: boolean;
};

export type Option = { id: string; nome: string };

export function ItemForm({
  action,
  defaults = {},
  classificacoes,
  unidades,
  fornecedores,
  formasPagto,
  submitLabel,
}: {
  action: (prev: ItemFormState, fd: FormData) => Promise<ItemFormState>;
  defaults?: ItemFormDefaults;
  classificacoes: Option[];
  unidades: Option[];
  fornecedores: Option[];
  formasPagto: Option[];
  submitLabel: string;
}) {
  const [state, formAction, isPending] = useActionState<ItemFormState, FormData>(action, null);

  const precoStr =
    defaults.preco_referencia != null
      ? defaults.preco_referencia.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })
      : "";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="nome">Nome do item *</Label>
          <Input id="nome" name="nome" defaultValue={defaults.nome ?? ""} required maxLength={200} />
          {state?.fieldErrors?.nome && <p className="text-sm text-red-600">{state.fieldErrors.nome}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="codigo_queops">Código Queóps</Label>
          <Input
            id="codigo_queops"
            name="codigo_queops"
            defaultValue={defaults.codigo_queops ?? ""}
            placeholder="ex: 058002"
            maxLength={20}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="classificacao_id">Classificação</Label>
          <Select id="classificacao_id" name="classificacao_id" defaultValue={defaults.classificacao_id ?? ""}>
            <option value="">— sem classificação —</option>
            {classificacoes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="unidade_id">Unidade de medida</Label>
          <Select id="unidade_id" name="unidade_id" defaultValue={defaults.unidade_id ?? ""}>
            <option value="">— sem unidade —</option>
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fornecedor_padrao_id">Fornecedor padrão</Label>
          <Select id="fornecedor_padrao_id" name="fornecedor_padrao_id" defaultValue={defaults.fornecedor_padrao_id ?? ""}>
            <option value="">— sem fornecedor —</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="preco_referencia">Preço de referência (R$)</Label>
          <Input
            id="preco_referencia"
            name="preco_referencia"
            defaultValue={precoStr}
            placeholder="0,00"
            inputMode="decimal"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="forma_pagto_padrao_id">Forma de pagamento padrão</Label>
          <Select
            id="forma_pagto_padrao_id"
            name="forma_pagto_padrao_id"
            defaultValue={defaults.forma_pagto_padrao_id ?? ""}
          >
            <option value="">— sem padrão —</option>
            {formasPagto.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="prazo_padrao">Prazo padrão</Label>
          <Input
            id="prazo_padrao"
            name="prazo_padrao"
            defaultValue={defaults.prazo_padrao ?? ""}
            placeholder="ex: 28/56D"
            maxLength={50}
          />
        </div>

        {/* Embalagem de compra — estoque conta por unidade, financeiro compra por caixa/fardo */}
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
            <p className="mb-2 text-xs font-medium text-zinc-600">
              📦 Embalagem de compra (opcional) — deixe em branco se o item é comprado avulso.
              Ex: bobina térmica é contada por unidade, mas comprada em CAIXA de 30.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="embalagem_compra_nome">Nome da embalagem</Label>
                <Input
                  id="embalagem_compra_nome"
                  name="embalagem_compra_nome"
                  defaultValue={defaults.embalagem_compra_nome ?? ""}
                  placeholder="ex: CAIXA, FARDO"
                  maxLength={40}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="qtd_por_embalagem">Unidades por embalagem</Label>
                <Input
                  id="qtd_por_embalagem"
                  name="qtd_por_embalagem"
                  defaultValue={
                    defaults.qtd_por_embalagem != null ? String(defaults.qtd_por_embalagem) : "1"
                  }
                  placeholder="ex: 30"
                  inputMode="decimal"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:col-span-2">
          <Checkbox id="ativo" name="ativo" defaultChecked={defaults.ativo ?? true} />
          <Label htmlFor="ativo">Item ativo</Label>
        </div>
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Salvando..." : submitLabel}
        </Button>
        <Link href="/itens">
          <Button type="button" variant="outline">
            Cancelar
          </Button>
        </Link>
      </div>
    </form>
  );
}
